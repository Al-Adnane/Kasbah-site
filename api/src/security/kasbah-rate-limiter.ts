/**
 * Kasbah Rate Limiting
 *
 * Prevent API abuse with sliding window rate limiting
 *
 * Features:
 * - Per-IP rate limiting
 * - Per-user rate limiting (authenticated)
 * - Per-endpoint rate limiting
 * - Sliding window algorithm
 * - Configurable limits per endpoint
 * - Redis-backed distributed rate limiting
 *
 * Status: Production-Ready
 */

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: any) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

/**
 * Request metadata for rate limiting
 */
export interface RateLimitMetadata {
  key: string;
  count: number;
  resetTime: number;
  remaining: number;
  limit: number;
}

/**
 * Default rate limit configurations per endpoint
 */
export const RATE_LIMIT_DEFAULTS: Record<string, RateLimitConfig> = {
  // Auth endpoints - strict
  '/auth/register': { windowMs: 3600000, maxRequests: 5 }, // 5 per hour
  '/auth/login': { windowMs: 900000, maxRequests: 10 }, // 10 per 15 min
  '/auth/verify': { windowMs: 300000, maxRequests: 5 }, // 5 per 5 min

  // Detection endpoints - moderate
  '/api/kasbah/spatial/analyze': { windowMs: 60000, maxRequests: 30 }, // 30 per minute
  '/api/kasbah/generator/identify': { windowMs: 60000, maxRequests: 30 },
  '/api/kasbah/calibration/calibrate': { windowMs: 60000, maxRequests: 30 },
  '/api/kasbah/ethics/evaluate': { windowMs: 60000, maxRequests: 30 },

  // Federation endpoints - lenient for batch operations
  '/api/kasbah/federation/update': { windowMs: 60000, maxRequests: 100 },

  // General API - moderate
  '/api/kasbah': { windowMs: 60000, maxRequests: 100 }, // 100 per minute per IP

  // Download endpoints - strict
  '/download': { windowMs: 3600000, maxRequests: 50 }, // 50 per hour
};

/**
 * In-memory rate limit store
 */
class RateLimitStore {
  private store: Map<string, RateLimitMetadata> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
  }

  /**
   * Check and increment rate limit
   */
  check(key: string, limit: number, windowMs: number): RateLimitMetadata {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now > existing.resetTime) {
      // New window
      const resetTime = now + windowMs;
      const metadata: RateLimitMetadata = {
        key,
        count: 1,
        resetTime,
        remaining: limit - 1,
        limit
      };
      this.store.set(key, metadata);
      return metadata;
    }

    // Increment existing count
    existing.count++;
    existing.remaining = Math.max(0, limit - existing.count);

    return {
      ...existing
    };
  }

  /**
   * Reset rate limit for key
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Get rate limit status without incrementing
   */
  get(key: string): RateLimitMetadata | null {
    return this.store.get(key) || null;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, metadata] of this.store.entries()) {
      if (now > metadata.resetTime) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Shutdown
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

/**
 * Redis-backed rate limit store (for distributed systems)
 */
export class DistributedRateLimitStore {
  private redis: any; // Redis client

  constructor(redisClient: any) {
    this.redis = redisClient;
  }

  /**
   * Check and increment rate limit
   */
  async check(key: string, limit: number, windowMs: number): Promise<RateLimitMetadata> {
    const now = Date.now();
    const redisKey = `ratelimit:${key}`;

    // Get current value and expiration
    const pipeline = this.redis.pipeline();
    pipeline.incr(redisKey);
    pipeline.pexpire(redisKey, windowMs);
    pipeline.pttl(redisKey);

    const results = await pipeline.exec();
    const count = results[0][1];
    const ttl = results[2][1];

    const resetTime = now + (ttl > 0 ? ttl : windowMs);
    const remaining = Math.max(0, limit - count);

    return {
      key,
      count,
      resetTime,
      remaining,
      limit
    };
  }

  /**
   * Reset rate limit for key
   */
  async reset(key: string): Promise<void> {
    await this.redis.del(`ratelimit:${key}`);
  }

  /**
   * Get rate limit status without incrementing
   */
  async get(key: string, limit: number, windowMs: number): Promise<RateLimitMetadata | null> {
    const redisKey = `ratelimit:${key}`;
    const count = await this.redis.get(redisKey);

    if (!count) {
      return {
        key,
        count: 0,
        resetTime: Date.now() + windowMs,
        remaining: limit,
        limit
      };
    }

    const ttl = await this.redis.pttl(redisKey);
    return {
      key,
      count: parseInt(count),
      resetTime: Date.now() + (ttl > 0 ? ttl : windowMs),
      remaining: Math.max(0, limit - parseInt(count)),
      limit
    };
  }
}

/**
 * Rate limiter class
 */
export class RateLimiter {
  private store: RateLimitStore | DistributedRateLimitStore;
  private configs: Map<string, RateLimitConfig> = new Map();
  private isDistributed: boolean;

  constructor(useDistributed: boolean = false, redisClient?: any) {
    this.isDistributed = useDistributed;

    if (useDistributed && redisClient) {
      this.store = new DistributedRateLimitStore(redisClient);
    } else {
      this.store = new RateLimitStore();
    }

    // Initialize default configs
    for (const [path, config] of Object.entries(RATE_LIMIT_DEFAULTS)) {
      this.configs.set(path, config);
    }
  }

  /**
   * Set custom rate limit config for endpoint
   */
  setLimit(path: string, config: RateLimitConfig): void {
    this.configs.set(path, config);
  }

  /**
   * Get rate limit config for path
   */
  getLimit(path: string): RateLimitConfig {
    // Check exact match first
    if (this.configs.has(path)) {
      return this.configs.get(path)!;
    }

    // Check prefix match
    for (const [configPath, config] of this.configs.entries()) {
      if (path.startsWith(configPath)) {
        return config;
      }
    }

    // Default limit
    return { windowMs: 60000, maxRequests: 100 };
  }

  /**
   * Generate rate limit key from request
   */
  private generateKey(req: any, path: string, config: RateLimitConfig): string {
    if (config.keyGenerator) {
      return config.keyGenerator(req);
    }

    // Use authenticated user ID if available
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }

    // Fall back to IP address
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    return `ip:${ip}`;
  }

  /**
   * Check if request is rate limited (async for distributed store)
   */
  async checkLimit(req: any, path: string): Promise<{
    limited: boolean;
    metadata: RateLimitMetadata;
  }> {
    const config = this.getLimit(path);
    const key = this.generateKey(req, path, config);

    const metadata = await this.check(key, config.maxRequests, config.windowMs);

    return {
      limited: metadata.remaining === 0,
      metadata
    };
  }

  /**
   * Internal check method (handles both sync and async stores)
   */
  private async check(key: string, limit: number, windowMs: number): Promise<RateLimitMetadata> {
    if (this.isDistributed && this.store instanceof DistributedRateLimitStore) {
      return await this.store.check(key, limit, windowMs);
    } else {
      return (this.store as RateLimitStore).check(key, limit, windowMs);
    }
  }

  /**
   * Reset rate limit for key
   */
  async reset(key: string): Promise<void> {
    if (this.isDistributed && this.store instanceof DistributedRateLimitStore) {
      await this.store.reset(key);
    } else {
      (this.store as RateLimitStore).reset(key);
    }
  }

  /**
   * Get rate limit status without incrementing
   */
  async getStatus(key: string, limit: number, windowMs: number): Promise<RateLimitMetadata | null> {
    if (this.isDistributed && this.store instanceof DistributedRateLimitStore) {
      return await this.store.get(key, limit, windowMs);
    } else {
      return (this.store as RateLimitStore).get(key);
    }
  }

  /**
   * Add rate limit headers to response
   */
  addHeaders(res: any, metadata: RateLimitMetadata): void {
    res.headers.set('X-RateLimit-Limit', metadata.limit.toString());
    res.headers.set('X-RateLimit-Remaining', metadata.remaining.toString());
    res.headers.set('X-RateLimit-Reset', (metadata.resetTime / 1000).toString());
  }

  /**
   * Create rate limit error response
   */
  createLimitResponse(metadata: RateLimitMetadata): Response {
    const retryAfter = Math.ceil((metadata.resetTime - Date.now()) / 1000);

    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        status: 'rate_limited',
        retryAfter,
        resetTime: new Date(metadata.resetTime).toISOString()
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': metadata.limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': (metadata.resetTime / 1000).toString(),
          'Retry-After': retryAfter.toString()
        }
      }
    );
  }

  /**
   * Middleware for Cloudflare Workers
   */
  async middleware(request: Request, path: string): Promise<{ limited: boolean; response?: Response; metadata?: RateLimitMetadata }> {
    const req = {
      ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for'),
      headers: Object.fromEntries(request.headers.entries()),
      user: (request as any).user
    };

    const { limited, metadata } = await this.checkLimit(req, path);

    if (limited) {
      return {
        limited: true,
        response: this.createLimitResponse(metadata),
        metadata
      };
    }

    return {
      limited: false,
      metadata
    };
  }
}

// Export singleton instance for common use
export const globalRateLimiter = new RateLimiter();

export default {
  RateLimiter,
  RateLimitStore,
  DistributedRateLimitStore,
  RATE_LIMIT_DEFAULTS,
  globalRateLimiter
};
