/**
 * Sliding Window Rate Limiter Moat - Unit Tests
 * Tests: 20+
 */

const {
  createRateLimiter,
  RATE_LIMIT_PRESETS
} = require('../rate-limiter');

describe('Sliding Window Rate Limiter Moat', () => {
  // Test configuration presets
  describe('RATE_LIMIT_PRESETS', () => {
    test('should have API preset', () => {
      expect(RATE_LIMIT_PRESETS.API).toBeDefined();
      expect(RATE_LIMIT_PRESETS.API.requestsPerMinute).toBe(60);
      expect(RATE_LIMIT_PRESETS.API.blockDurationMs).toBe(60000);
    });

    test('should have DETECTION preset (stricter)', () => {
      expect(RATE_LIMIT_PRESETS.DETECTION).toBeDefined();
      expect(RATE_LIMIT_PRESETS.DETECTION.requestsPerMinute).toBe(20);
      expect(RATE_LIMIT_PRESETS.DETECTION.blockDurationMs).toBe(60000);
    });

    test('should have READ preset (lenient)', () => {
      expect(RATE_LIMIT_PRESETS.READ).toBeDefined();
      expect(RATE_LIMIT_PRESETS.READ.requestsPerMinute).toBe(120);
    });

    test('should have ANONYMOUS preset (very strict)', () => {
      expect(RATE_LIMIT_PRESETS.ANONYMOUS).toBeDefined();
      expect(RATE_LIMIT_PRESETS.ANONYMOUS.requestsPerMinute).toBe(10);
    });

    test('detection limit should be stricter than API limit', () => {
      expect(RATE_LIMIT_PRESETS.DETECTION.requestsPerMinute)
        .toBeLessThan(RATE_LIMIT_PRESETS.API.requestsPerMinute);
    });

    test('read limit should be more lenient than API limit', () => {
      expect(RATE_LIMIT_PRESETS.READ.requestsPerMinute)
        .toBeGreaterThan(RATE_LIMIT_PRESETS.API.requestsPerMinute);
    });
  });

  // Test createRateLimiter function
  describe('createRateLimiter()', () => {
    test('should create limiter with preset', () => {
      const limiter = createRateLimiter('API');
      expect(limiter).toBeDefined();
      expect(typeof limiter.check).toBe('function');
    });

    test('should create limiter with custom config', () => {
      const limiter = createRateLimiter({
        requestsPerMinute: 30,
        blockDurationMs: 120000
      });
      expect(limiter).toBeDefined();
    });

    test('should throw on invalid preset', () => {
      expect(() => createRateLimiter('INVALID_PRESET')).toThrow();
    });

    test('should accept string preset name', () => {
      const limiter = createRateLimiter('API');
      expect(limiter).toBeDefined();
    });
  });

  // Test rate limiting behavior
  describe('Rate Limiting Behavior', () => {
    test('should allow request within limit', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 60 });
      const result = limiter.check('user:123');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    test('should track remaining requests', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 5 });
      const result1 = limiter.check('user:123');
      expect(result1.remaining).toBe(4);

      const result2 = limiter.check('user:123');
      expect(result2.remaining).toBe(3);

      const result3 = limiter.check('user:123');
      expect(result3.remaining).toBe(2);
    });

    test('should block request after limit exceeded', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 2 });
      limiter.check('user:123');
      limiter.check('user:123');

      const blocked = limiter.check('user:123');
      expect(blocked.allowed).toBe(false);
      expect(blocked.blocked).toBe(true);
    });

    test('should return reset time when blocked', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 1, blockDurationMs: 60000 });
      limiter.check('user:123');

      const blocked = limiter.check('user:123');
      expect(blocked.resetTime).toBeDefined();
      expect(blocked.resetTime instanceof Date).toBe(true);
    });

    test('should return retryAfter when blocked', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 1 });
      limiter.check('user:123');

      const blocked = limiter.check('user:123');
      expect(blocked.retryAfter).toBeDefined();
      expect(typeof blocked.retryAfter).toBe('number');
      expect(blocked.retryAfter).toBeGreaterThan(0);
    });
  });

  // Test sliding window mechanism
  describe('Sliding Window Mechanism', () => {
    test('should reset request count after window expires', async () => {
      jest.useFakeTimers();

      const limiter = createRateLimiter({ requestsPerMinute: 2 });

      // Make 2 requests within window
      limiter.check('user:123');
      limiter.check('user:123');

      // Third request blocked
      let result = limiter.check('user:123');
      expect(result.allowed).toBe(false);

      // Advance time beyond window
      jest.advanceTimersByTime(61000);

      // Should allow new request after window expires
      result = limiter.check('user:123');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);

      jest.useRealTimers();
    });

    test('should properly handle partial window expiry', async () => {
      jest.useFakeTimers();

      const limiter = createRateLimiter({ requestsPerMinute: 3 });

      // Request at t=0
      limiter.check('user:123');

      // Advance 30 seconds
      jest.advanceTimersByTime(30000);

      // Request at t=30s
      limiter.check('user:123');

      // Advance 20 more seconds (t=50s, original still in window)
      jest.advanceTimersByTime(20000);

      // Request at t=50s
      const result = limiter.check('user:123');
      expect(result.remaining).toBe(0);

      jest.useRealTimers();
    });
  });

  // Test isolation between different identifiers
  describe('Identifier Isolation', () => {
    test('should track separate limits for different users', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 2 });

      const user1_req1 = limiter.check('user:123');
      expect(user1_req1.allowed).toBe(true);

      const user2_req1 = limiter.check('user:456');
      expect(user2_req1.allowed).toBe(true);

      const user1_req2 = limiter.check('user:123');
      expect(user1_req2.allowed).toBe(true);

      const user2_req2 = limiter.check('user:456');
      expect(user2_req2.allowed).toBe(true);

      // Third request for each user should be blocked
      const user1_req3 = limiter.check('user:123');
      expect(user1_req3.allowed).toBe(false);

      const user2_req3 = limiter.check('user:456');
      expect(user2_req3.allowed).toBe(false);
    });

    test('should track separate limits for different IP addresses', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 2 });

      limiter.check('192.168.1.1');
      limiter.check('192.168.1.1');
      limiter.check('192.168.1.2');

      const ip1_blocked = limiter.check('192.168.1.1');
      expect(ip1_blocked.allowed).toBe(false);

      const ip2_allowed = limiter.check('192.168.1.2');
      expect(ip2_allowed.allowed).toBe(true);
    });

    test('should isolate API key limits from user limits', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 2 });

      limiter.check('user:123');
      limiter.check('key:abc123');

      limiter.check('user:123');
      limiter.check('key:abc123');

      const userBlocked = limiter.check('user:123');
      expect(userBlocked.allowed).toBe(false);

      const keyBlocked = limiter.check('key:abc123');
      expect(keyBlocked.allowed).toBe(false);
    });
  });

  // Test cleanup mechanism
  describe('Cleanup Mechanism', () => {
    test('should automatically cleanup old entries', async () => {
      jest.useFakeTimers();

      const limiter = createRateLimiter({ requestsPerMinute: 10, cleanupIntervalMs: 5000 });

      // Make request
      limiter.check('user:123');

      // Advance beyond cleanup interval
      jest.advanceTimersByTime(70000);

      // Old entry should be cleaned up
      // New request should start fresh
      const result = limiter.check('user:123');
      expect(result.remaining).toBe(9);

      jest.useRealTimers();
    });

    test('should prevent memory exhaustion with max entries', () => {
      const limiter = createRateLimiter({ maxEntries: 100 });

      // Create 101 different identifiers (exceeds limit)
      for (let i = 0; i < 101; i++) {
        limiter.check(`user:${i}`);
      }

      // Limiter should still function
      const result = limiter.check('user:150');
      expect(typeof result.allowed).toBe('boolean');
    });
  });

  // Test reset functionality
  describe('Reset Functionality', () => {
    test('should reset all limits', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 2 });

      limiter.check('user:123');
      limiter.check('user:123');

      let result = limiter.check('user:123');
      expect(result.allowed).toBe(false);

      // Reset
      limiter.reset();

      // Should allow new requests
      result = limiter.check('user:123');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    test('should reset specific identifier', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 2 });

      limiter.check('user:123');
      limiter.check('user:123');
      limiter.check('user:456');

      // Reset only user:123
      limiter.reset('user:123');

      // user:123 should allow request
      const result1 = limiter.check('user:123');
      expect(result1.allowed).toBe(true);

      // user:456 should still be tracked
      const result2 = limiter.check('user:456');
      expect(result2.remaining).toBe(0);
    });
  });

  // Test response format
  describe('Response Format', () => {
    test('should return correct allowed response', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 10 });
      const result = limiter.check('user:123');

      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.remaining).toBeDefined();
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(result.resetTime).toBeDefined();
    });

    test('should return correct blocked response', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 1 });
      limiter.check('user:123');

      const result = limiter.check('user:123');

      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.resetTime instanceof Date).toBe(true);
    });
  });

  // Test edge cases
  describe('Edge Cases', () => {
    test('should handle zero requests per minute', () => {
      expect(() => createRateLimiter({ requestsPerMinute: 0 })).not.toThrow();
      const limiter = createRateLimiter({ requestsPerMinute: 0 });

      const result = limiter.check('user:123');
      expect(result.allowed).toBe(false);
    });

    test('should handle null/empty identifier', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 10 });

      expect(() => limiter.check(null)).not.toThrow();
      expect(() => limiter.check('')).not.toThrow();
      expect(() => limiter.check(undefined)).not.toThrow();
    });

    test('should handle very large request limits', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 10000 });

      for (let i = 0; i < 100; i++) {
        const result = limiter.check('user:123');
        expect(result.allowed).toBe(true);
      }
    });

    test('should handle rapid sequential requests', () => {
      const limiter = createRateLimiter({ requestsPerMinute: 5 });

      for (let i = 0; i < 5; i++) {
        const result = limiter.check('user:123');
        expect(result.allowed).toBe(true);
      }

      const blocked = limiter.check('user:123');
      expect(blocked.allowed).toBe(false);
    });
  });

  // Test different presets behavior
  describe('Preset Behavior', () => {
    test('API preset allows 60 requests per minute', () => {
      const limiter = createRateLimiter('API');

      for (let i = 0; i < 60; i++) {
        const result = limiter.check('user:123');
        expect(result.allowed).toBe(true);
      }

      const blocked = limiter.check('user:123');
      expect(blocked.allowed).toBe(false);
    });

    test('DETECTION preset allows 20 requests per minute', () => {
      const limiter = createRateLimiter('DETECTION');

      for (let i = 0; i < 20; i++) {
        const result = limiter.check('user:123');
        expect(result.allowed).toBe(true);
      }

      const blocked = limiter.check('user:123');
      expect(blocked.allowed).toBe(false);
    });

    test('READ preset allows 120 requests per minute', () => {
      const limiter = createRateLimiter('READ');
      let lastAllowed = true;

      for (let i = 0; i < 120; i++) {
        const result = limiter.check('user:123');
        lastAllowed = result.allowed;
      }

      expect(lastAllowed).toBe(true);
    });

    test('ANONYMOUS preset allows 10 requests per minute', () => {
      const limiter = createRateLimiter('ANONYMOUS');

      for (let i = 0; i < 10; i++) {
        const result = limiter.check('ip:192.168.1.1');
        expect(result.allowed).toBe(true);
      }

      const blocked = limiter.check('ip:192.168.1.1');
      expect(blocked.allowed).toBe(false);
    });
  });

  // Performance tests
  describe('Performance', () => {
    test('should check rate limit in <1ms', () => {
      const limiter = createRateLimiter('API');

      const start = performance.now();
      limiter.check('user:123');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1);
    });

    test('should handle 1000 different identifiers efficiently', () => {
      const limiter = createRateLimiter('API');

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        limiter.check(`user:${i}`);
      }
      const duration = performance.now() - start;

      // Should complete in reasonable time (<100ms)
      expect(duration).toBeLessThan(100);
    });
  });
});
