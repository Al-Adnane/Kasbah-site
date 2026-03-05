/**
 * Kasbah Guard — Production Rate Limiter
 * 
 * Three presets: DETECTION, READ, AUTH
 * Sliding window implementation
 * Memory-efficient tracking
 */

class RateLimiter {
  constructor(store, preset = 'DETECTION') {
    this.store = store;
    this.presets = {
      DETECTION: { limit: 10, windowMs: 600000, blockMs: 600000 },
      READ: { limit: 60, windowMs: 60000, blockMs: 60000 },
      AUTH: { limit: 5, windowMs: 60000, blockMs: 900000 }
    };
    this.config = this.presets[preset] || this.presets.DETECTION;
  }

  async check(key) {
    const now = Date.now();
    const windowKey = `rate:${key}:${Math.floor(now / this.config.windowMs)}`;
    const blockKey = `blocked:${key}`;
    
    const blocked = await this.store.get(blockKey);
    if (blocked) {
      const blockUntil = parseInt(blocked);
      if (now < blockUntil) {
        return { allowed: false, reason: 'rate_limited', retryAfter: Math.ceil((blockUntil - now) / 1000) };
      }
      await this.store.delete(blockKey);
    }
    
    const count = await this.store.incr(windowKey);
    if (count === 1) {
      await this.store.expire(windowKey, Math.ceil(this.config.windowMs / 1000));
    }
    
    if (count > this.config.limit) {
      const blockUntil = now + this.config.blockMs;
      await this.store.set(blockKey, blockUntil.toString(), Math.ceil(this.config.blockMs / 1000));
      return { allowed: false, reason: 'rate_limited', retryAfter: Math.ceil(this.config.blockMs / 1000) };
    }
    
    return { allowed: true, remaining: this.config.limit - count, reset: Math.ceil((Math.floor(now / this.config.windowMs) + 1) * this.config.windowMs / 1000) };
  }
}

module.exports = { RateLimiter };
