/**
 * Moat Integration Tests
 * Tests: 12+ (integration between moats)
 */

const {
  initializeMoats,
  checkRateLimit,
  validateFileUpload,
  wrapWithMoats,
  guardServiceCall,
  extractRateLimitKey,
  createSafeMoatProxy
} = require('../integration');

describe('Moat Integration Layer', () => {
  describe('initializeMoats()', () => {
    test('should initialize all moats', () => {
      const moats = initializeMoats({});

      expect(moats.apiLimiter).toBeDefined();
      expect(moats.detectionLimiter).toBeDefined();
      expect(moats.readLimiter).toBeDefined();
      expect(moats.anonymousLimiter).toBeDefined();
      expect(moats.vlmCircuitBreaker).toBeDefined();
      expect(moats.errorHandler).toBeDefined();
    });

    test('should have working rate limiters', () => {
      const moats = initializeMoats({});

      const result = moats.apiLimiter.check('user:123');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    test('should have working circuit breaker', () => {
      const moats = initializeMoats({});

      expect(moats.vlmCircuitBreaker.state).toBe('CLOSED');
    });
  });

  describe('extractRateLimitKey()', () => {
    test('should extract Bearer token as key', () => {
      const request = new Request('http://localhost/test', {
        headers: { 'Authorization': 'Bearer abc123token456' }
      });

      const key = extractRateLimitKey(request);
      expect(key).toContain('key:');
      expect(key).toContain('abc123token4');
    });

    test('should extract IP address if no auth', () => {
      const request = new Request('http://localhost/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' }
      });

      const key = extractRateLimitKey(request);
      expect(key).toContain('ip:');
      expect(key).toContain('192.168.1.1');
    });

    test('should fallback to X-Forwarded-For', () => {
      const request = new Request('http://localhost/test', {
        headers: { 'X-Forwarded-For': '10.0.0.1, 192.168.1.1' }
      });

      const key = extractRateLimitKey(request);
      expect(key).toContain('ip:');
      expect(key).toContain('10.0.0.1');
    });

    test('should use unknown IP if none found', () => {
      const request = new Request('http://localhost/test', {
        headers: {}
      });

      const key = extractRateLimitKey(request);
      expect(key).toBe('ip:unknown');
    });
  });

  describe('checkRateLimit()', () => {
    test('should allow request within limit', () => {
      const moats = initializeMoats({});
      const request = new Request('http://localhost/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' }
      });

      const result = checkRateLimit(request, moats.apiLimiter, 'req-1');

      expect(result.allowed).toBe(true);
      expect(result.response).toBeUndefined();
    });

    test('should return 429 response when limited', () => {
      const moats = initializeMoats({});
      const limiter = moats.anonymousLimiter; // 10 req/min

      const request = new Request('http://localhost/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' }
      });

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        checkRateLimit(request, limiter, `req-${i}`);
      }

      // Next request should be blocked
      const result = checkRateLimit(request, limiter, 'req-blocked');

      expect(result.allowed).toBe(false);
      expect(result.response).toBeDefined();
      expect(result.response.status).toBe(429);
    });

    test('should include requestId in blocked response', async () => {
      const moats = initializeMoats({});
      const limiter = moats.anonymousLimiter;

      const request = new Request('http://localhost/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' }
      });

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        checkRateLimit(request, limiter, `req-${i}`);
      }

      const result = checkRateLimit(request, limiter, 'req-tracked');
      const body = await result.response.json();

      expect(body.error.requestId).toBe('req-tracked');
    });
  });

  describe('validateFileUpload()', () => {
    test('should pass non-binary content', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await validateFileUpload(request, 'req-1');

      expect(result.valid).toBe(true);
    });

    test('should warn on multipart but allow', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const request = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const result = await validateFileUpload(request, 'req-1');

      expect(result.valid).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('wrapWithMoats()', () => {
    test('should execute handler successfully', async () => {
      const moats = initializeMoats({});
      const handler = jest.fn(async () => new Response('OK'));

      const wrapped = wrapWithMoats(handler, moats);
      const request = new Request('http://localhost/test');

      const response = await wrapped(request, {}, {});

      expect(handler).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    test('should add X-Request-ID header', async () => {
      const moats = initializeMoats({});
      const handler = async () => new Response('OK', {
        headers: { 'Content-Type': 'text/plain' }
      });

      const wrapped = wrapWithMoats(handler, moats);
      const request = new Request('http://localhost/test');

      const response = await wrapped(request, {}, {});

      expect(response.headers.has('X-Request-ID')).toBe(true);
    });

    test('should enforce rate limiting', async () => {
      const moats = initializeMoats({});
      const handler = async () => new Response('OK');

      const wrapped = wrapWithMoats(handler, moats, { rateLimitType: 'ANONYMOUS' });

      const request = new Request('http://localhost/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' }
      });

      // Make 10 requests (at limit)
      for (let i = 0; i < 10; i++) {
        await wrapped(request, {}, {});
      }

      // 11th should be blocked
      const blocked = await wrapped(request, {}, {});
      expect(blocked.status).toBe(429);
    });

    test('should catch errors and format them', async () => {
      const moats = initializeMoats({});
      const handler = async () => {
        throw new Error('Test error');
      };

      const wrapped = wrapWithMoats(handler, moats);
      const request = new Request('http://localhost/test');

      const response = await wrapped(request, {}, {});

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.ok).toBe(false);
    });
  });

  describe('guardServiceCall()', () => {
    test('should execute service call successfully', async () => {
      const moats = initializeMoats({});
      const serviceFn = jest.fn(async () => 'success');

      const guarded = guardServiceCall(serviceFn, 'test-service', moats);
      const result = await guarded();

      expect(result).toBe('success');
      expect(serviceFn).toHaveBeenCalled();
    });

    test('should retry on failure', async () => {
      const moats = initializeMoats({});
      let callCount = 0;
      const serviceFn = async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Temporary error');
        }
        return 'success';
      };

      const guarded = guardServiceCall(serviceFn, 'test-service', moats);
      const result = await guarded();

      expect(result).toBe('success');
      expect(callCount).toBe(2);
    });

    test('should open circuit breaker after failures', async () => {
      const moats = initializeMoats({});
      moats.testCircuitBreaker = moats.vlmCircuitBreaker; // Reuse for testing

      const serviceFn = async () => {
        throw new Error('Persistent error');
      };

      const guarded = guardServiceCall(serviceFn, 'vlm', moats);

      // Trigger failures to open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await guarded();
        } catch (e) {
          // Expected
        }
      }

      // Circuit should be open now
      expect(moats.vlmCircuitBreaker.state).toBe('OPEN');
    });
  });

  describe('createSafeMoatProxy()', () => {
    test('should return proxy if moats are null', () => {
      const proxy = createSafeMoatProxy(null);

      expect(proxy.apiLimiter).toBeDefined();
      expect(proxy.errorHandler).toBeDefined();
    });

    test('should allow graceful degradation', async () => {
      const proxy = createSafeMoatProxy(null);

      // Should not crash with missing moats
      const request = new Request('http://localhost/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' }
      });

      const result = proxy.apiLimiter.check('user:123');
      expect(result.allowed).toBe(true);
    });

    test('should return original moats if provided', () => {
      const moats = initializeMoats({});
      const proxy = createSafeMoatProxy(moats);

      expect(proxy).toBe(moats);
    });
  });

  // Integration tests: multiple moats working together
  describe('Multiple Moats Integration', () => {
    test('should handle rate limit + error handling together', async () => {
      const moats = initializeMoats({});

      const wrapped = wrapWithMoats(
        async () => { throw new Error('Handler error'); },
        moats,
        { rateLimitType: 'ANONYMOUS' }
      );

      const request = new Request('http://localhost/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' }
      });

      // Request should be handled even if it fails
      const response = await wrapped(request, {}, {});

      expect(response.status).toBe(500);
      expect(response.headers.has('X-Request-ID')).toBe(true);
    });

    test('should prioritize rate limit over handler error', async () => {
      const moats = initializeMoats({});

      const wrapped = wrapWithMoats(
        async () => { throw new Error('Handler error'); },
        moats,
        { rateLimitType: 'ANONYMOUS' }
      );

      const request = new Request('http://localhost/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' }
      });

      // Exhaust rate limit
      for (let i = 0; i < 10; i++) {
        await wrapped(request, {}, {});
      }

      // Next request should be rate limited (429), not handler error (500)
      const response = await wrapped(request, {}, {});
      expect(response.status).toBe(429);
    });

    test('should handle circuit breaker + rate limit', async () => {
      const moats = initializeMoats({});

      // Open circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await moats.vlmCircuitBreaker.execute(async () => {
            throw new Error('Service down');
          });
        } catch (e) {
          // Expected
        }
      }

      expect(moats.vlmCircuitBreaker.state).toBe('OPEN');

      // Try guarded call
      const serviceFn = async () => 'should-not-reach';
      const guarded = guardServiceCall(serviceFn, 'vlm', moats);

      try {
        await guarded();
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Circuit breaker is OPEN');
      }
    });
  });

  // Performance integration tests
  describe('Performance Under Load', () => {
    test('should handle 100 concurrent wrapped requests', async () => {
      const moats = initializeMoats({});
      const handler = async () => new Response('OK');

      const wrapped = wrapWithMoats(handler, moats);

      const requests = [];
      for (let i = 0; i < 100; i++) {
        const request = new Request('http://localhost/test', {
          headers: { 'CF-Connecting-IP': `192.168.1.${i % 255}` }
        });
        requests.push(wrapped(request, {}, {}));
      }

      const start = performance.now();
      const responses = await Promise.all(requests);
      const duration = performance.now() - start;

      expect(responses.length).toBe(100);
      expect(duration).toBeLessThan(1000); // Should complete in <1s
    });
  });
});
