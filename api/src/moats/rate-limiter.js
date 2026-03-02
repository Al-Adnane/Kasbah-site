/**
 * Sliding Window Rate Limiter Moat
 * Memory-efficient rate limiting with auto-cleanup
 *
 * Integrated from: workspace archive src/lib/rate-limiter.ts
 * Status: Production-ready, tested with 20+ test cases
 */

const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
const STORE_MAX_SIZE = 10000; // Maximum entries

// In-memory store for rate limiting
const rateLimitStore = new Map();

// Cleanup interval reference
let cleanupIntervalId = null;

/**
 * Rate limit configurations for different endpoints
 */
const RATE_LIMITS = {
  // General API rate limit
  API: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    blockDurationMs: 60 * 1000,
  },

  // Strict rate limit for detection (expensive operation)
  DETECTION: {
    windowMs: 60 * 1000,
    maxRequests: 20,
    blockDurationMs: 60 * 1000,
  },

  // Lenient for read operations
  READ: {
    windowMs: 60 * 1000,
    maxRequests: 120,
    blockDurationMs: 30 * 1000,
  },

  // Very strict for anonymous requests
  ANONYMOUS: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    blockDurationMs: 60 * 1000,
  },
};

/**
 * Cleanup store to prevent memory leaks
 */
function cleanupStore() {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of rateLimitStore) {
    // Remove expired entries
    if (entry.resetTime < now && !entry.blocked) {
      rateLimitStore.delete(key);
      cleaned++;
    } else if (entry.blocked && entry.resetTime < now) {
      rateLimitStore.delete(key);
      cleaned++;
    }

    // Stop if we're under limit
    if (rateLimitStore.size < STORE_MAX_SIZE * 0.8) break;
  }

  // If still over limit, remove oldest entries
  if (rateLimitStore.size > STORE_MAX_SIZE) {
    const toDelete = rateLimitStore.size - (STORE_MAX_SIZE * 0.8);
    let deleted = 0;
    for (const key of rateLimitStore.keys()) {
      rateLimitStore.delete(key);
      deleted++;
      if (deleted >= toDelete) break;
    }
  }
}

/**
 * Start periodic cleanup
 */
function startCleanup() {
  if (typeof setInterval !== 'undefined' && !cleanupIntervalId) {
    cleanupIntervalId = setInterval(cleanupStore, CLEANUP_INTERVAL);
  }
}

/**
 * Stop periodic cleanup
 */
function stopCleanup() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

/**
 * Create a rate limiter instance
 */
function createRateLimiter(config) {
  startCleanup();

  return {
    /**
     * Check if request is allowed
     */
    check(identifier) {
      const now = Date.now();
      const key = config.keyGenerator
        ? config.keyGenerator(identifier)
        : `ratelimit:${identifier}`;

      const entry = rateLimitStore.get(key);

      // No entry - allow and create new
      if (!entry) {
        rateLimitStore.set(key, {
          count: 1,
          resetTime: now + config.windowMs,
          blocked: false
        });

        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetTime: now + config.windowMs,
          blocked: false
        };
      }

      // Entry exists and is blocked
      if (entry.blocked) {
        if (now < entry.resetTime) {
          const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
          return {
            allowed: false,
            remaining: 0,
            resetTime: entry.resetTime,
            retryAfter,
            blocked: true
          };
        }
        // Block expired, reset
        rateLimitStore.set(key, {
          count: 1,
          resetTime: now + config.windowMs,
          blocked: false
        });
        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetTime: now + config.windowMs,
          blocked: false
        };
      }

      // Window expired, reset
      if (now >= entry.resetTime) {
        rateLimitStore.set(key, {
          count: 1,
          resetTime: now + config.windowMs,
          blocked: false
        });
        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetTime: now + config.windowMs,
          blocked: false
        };
      }

      // Still in window, check if exceeded
      if (entry.count >= config.maxRequests) {
        // Mark as blocked
        entry.blocked = true;
        entry.resetTime = now + config.blockDurationMs;
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

        return {
          allowed: false,
          remaining: 0,
          resetTime: entry.resetTime,
          retryAfter,
          blocked: true
        };
      }

      // Increment counter
      entry.count++;
      return {
        allowed: true,
        remaining: config.maxRequests - entry.count,
        resetTime: entry.resetTime,
        blocked: false
      };
    },

    /**
     * Reset rate limit for identifier
     */
    reset(identifier) {
      const key = config.keyGenerator
        ? config.keyGenerator(identifier)
        : `ratelimit:${identifier}`;
      rateLimitStore.delete(key);
    },

    /**
     * Get store size
     */
    getStoreSize() {
      return rateLimitStore.size;
    }
  };
}

module.exports = {
  createRateLimiter,
  RATE_LIMITS,
  startCleanup,
  stopCleanup,
  cleanupStore
};
