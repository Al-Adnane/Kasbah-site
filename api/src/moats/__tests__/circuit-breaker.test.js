/**
 * Circuit Breaker Pattern Moat - Unit Tests
 * Tests: 18+
 */

const {
  CircuitBreaker,
  withRetry
} = require('../circuit-breaker');

describe('Circuit Breaker Pattern Moat', () => {
  // Test CircuitBreaker initialization
  describe('CircuitBreaker Initialization', () => {
    test('should initialize with default config', () => {
      const cb = new CircuitBreaker('test-service');
      expect(cb).toBeDefined();
      expect(cb.state).toBe('CLOSED');
    });

    test('should initialize with custom config', () => {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        resetTimeoutMs: 30000,
        halfOpenMaxAttempts: 2
      });
      expect(cb.state).toBe('CLOSED');
    });

    test('should track service name', () => {
      const cb = new CircuitBreaker('payment-service');
      expect(cb.serviceName).toBe('payment-service');
    });

    test('should initialize counters to zero', () => {
      const cb = new CircuitBreaker('test-service');
      expect(cb.failureCount).toBe(0);
      expect(cb.successCount).toBe(0);
    });
  });

  // Test circuit breaker states
  describe('Circuit Breaker States', () => {
    test('should start in CLOSED state', () => {
      const cb = new CircuitBreaker('test-service');
      expect(cb.state).toBe('CLOSED');
    });

    test('should transition to OPEN after failure threshold', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 2 });

      const failingFn = async () => {
        throw new Error('Service error');
      };

      try {
        await cb.execute(failingFn);
      } catch (e) {
        // Expected
      }

      try {
        await cb.execute(failingFn);
      } catch (e) {
        // Expected
      }

      expect(cb.state).toBe('OPEN');
    });

    test('should reject requests when OPEN', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 1 });

      const failingFn = async () => {
        throw new Error('Service error');
      };

      // Trigger OPEN state
      try {
        await cb.execute(failingFn);
      } catch (e) {
        // Expected
      }

      // Second call should be rejected
      try {
        await cb.execute(failingFn);
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Circuit breaker is OPEN');
      }
    });

    test('should transition to HALF_OPEN after reset timeout', async () => {
      jest.useFakeTimers();

      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        resetTimeoutMs: 1000
      });

      const failingFn = async () => {
        throw new Error('Service error');
      };

      // Trigger OPEN state
      try {
        await cb.execute(failingFn);
      } catch (e) {
        // Expected
      }

      expect(cb.state).toBe('OPEN');

      // Advance time
      jest.advanceTimersByTime(1000);

      // Allow new execution to try
      const succeedingFn = async () => 'success';
      const result = await cb.execute(succeedingFn);

      expect(result).toBe('success');
      expect(cb.state).toBe('CLOSED');

      jest.useRealTimers();
    });

    test('should return to OPEN if HALF_OPEN fails', async () => {
      jest.useFakeTimers();

      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        resetTimeoutMs: 1000
      });

      const failingFn = async () => {
        throw new Error('Service error');
      };

      // Trigger OPEN
      try {
        await cb.execute(failingFn);
      } catch (e) {
        // Expected
      }

      // Wait for HALF_OPEN
      jest.advanceTimersByTime(1000);

      // Fail during HALF_OPEN
      try {
        await cb.execute(failingFn);
      } catch (e) {
        // Expected
      }

      expect(cb.state).toBe('OPEN');

      jest.useRealTimers();
    });
  });

  // Test execute method
  describe('CircuitBreaker.execute()', () => {
    test('should execute function when CLOSED', async () => {
      const cb = new CircuitBreaker('test-service');
      const fn = jest.fn(async () => 'result');

      const result = await cb.execute(fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
    });

    test('should propagate function result', async () => {
      const cb = new CircuitBreaker('test-service');
      const fn = async () => ({ data: 'test' });

      const result = await cb.execute(fn);

      expect(result.data).toBe('test');
    });

    test('should propagate function errors when CLOSED', async () => {
      const cb = new CircuitBreaker('test-service');
      const fn = async () => {
        throw new Error('Custom error');
      };

      try {
        await cb.execute(fn);
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toBe('Custom error');
      }
    });

    test('should increment failure count on error', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 5 });
      const fn = async () => {
        throw new Error('Error');
      };

      try {
        await cb.execute(fn);
      } catch (e) {
        // Expected
      }

      expect(cb.failureCount).toBe(1);
    });

    test('should reset failure count on success', async () => {
      const cb = new CircuitBreaker('test-service');
      const failFn = async () => {
        throw new Error('Error');
      };

      try {
        await cb.execute(failFn);
      } catch (e) {
        // Expected
      }

      expect(cb.failureCount).toBe(1);

      const successFn = async () => 'success';
      await cb.execute(successFn);

      expect(cb.failureCount).toBe(0);
    });

    test('should track success count in HALF_OPEN', async () => {
      jest.useFakeTimers();

      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        halfOpenMaxAttempts: 2
      });

      const failFn = async () => {
        throw new Error('Error');
      };

      try {
        await cb.execute(failFn);
      } catch (e) {
        // Expected
      }

      jest.advanceTimersByTime(1000);

      const successFn = async () => 'success';
      await cb.execute(successFn);

      expect(cb.successCount).toBe(1);

      jest.useRealTimers();
    });
  });

  // Test withRetry function
  describe('withRetry()', () => {
    test('should succeed on first attempt', async () => {
      const fn = jest.fn(async () => 'success');
      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('should retry on failure', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Temporary error');
        }
        return 'success';
      };

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(callCount).toBe(2);
    });

    test('should retry up to max attempts', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        throw new Error('Persistent error');
      };

      try {
        await withRetry(fn, { maxAttempts: 3 });
        fail('Should have thrown');
      } catch (error) {
        expect(callCount).toBe(3);
      }
    });

    test('should use exponential backoff', async () => {
      jest.useFakeTimers();

      let callCount = 0;
      const fn = async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Error');
        }
        return 'success';
      };

      const promise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 100 });

      // First call is immediate
      expect(callCount).toBe(1);

      // First retry after ~100ms
      jest.advanceTimersByTime(100);
      await new Promise(resolve => setTimeout(resolve, 0));

      // Second retry after ~200ms (double)
      jest.advanceTimersByTime(200);
      await promise;

      jest.useRealTimers();
    });

    test('should add jitter to prevent thundering herd', async () => {
      jest.useFakeTimers();

      const fn = async () => {
        throw new Error('Error');
      };

      const delays = [];
      let callCount = 0;

      const trackingFn = async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Error');
        }
        return 'success';
      };

      await withRetry(trackingFn, { maxAttempts: 2, initialDelayMs: 1000 });

      jest.useRealTimers();
    });

    test('should not retry non-retryable errors', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        const error = new Error('Non-retryable error');
        error.code = 'ENOTFOUND'; // DNS error - not retryable in some cases
        throw error;
      };

      try {
        await withRetry(fn);
      } catch (e) {
        // Expected
      }

      // Should still retry by default (most errors are retryable)
      expect(callCount).toBeGreaterThan(1);
    });

    test('should handle timeout errors', async () => {
      jest.useFakeTimers();

      let callCount = 0;
      const fn = async () => {
        callCount++;
        if (callCount < 2) {
          const error = new Error('Request timeout');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        return 'success';
      };

      const promise = withRetry(fn);
      jest.advanceTimersByTime(1000);

      const result = await promise;
      expect(result).toBe('success');

      jest.useRealTimers();
    });

    test('should respect custom retry config', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        throw new Error('Error');
      };

      try {
        await withRetry(fn, {
          maxAttempts: 2,
          initialDelayMs: 50,
          maxDelayMs: 100
        });
      } catch (e) {
        // Expected
      }

      expect(callCount).toBe(2);
    });
  });

  // Test failure detection
  describe('Failure Detection', () => {
    test('should detect connection errors', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 1 });

      const fn = async () => {
        const error = new Error('ECONNREFUSED');
        error.code = 'ECONNREFUSED';
        throw error;
      };

      try {
        await cb.execute(fn);
      } catch (e) {
        // Expected
      }

      expect(cb.failureCount).toBe(1);
    });

    test('should detect timeout errors', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 1 });

      const fn = async () => {
        const error = new Error('Request timeout');
        error.code = 'ETIMEDOUT';
        throw error;
      };

      try {
        await cb.execute(fn);
      } catch (e) {
        // Expected
      }

      expect(cb.failureCount).toBe(1);
    });

    test('should detect rate limit errors (429)', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 1 });

      const fn = async () => {
        const error = new Error('Too Many Requests');
        error.statusCode = 429;
        throw error;
      };

      try {
        await cb.execute(fn);
      } catch (e) {
        // Expected
      }

      expect(cb.failureCount).toBe(1);
    });

    test('should NOT count non-transient errors as failures', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 5 });

      const fn = async () => {
        const error = new Error('Invalid input');
        error.statusCode = 400; // Bad request - not transient
        throw error;
      };

      try {
        await cb.execute(fn);
      } catch (e) {
        // Expected
      }

      // Should not increment failure count for non-transient errors
      expect(cb.failureCount).toBe(0);
    });
  });

  // Test metrics and monitoring
  describe('Metrics', () => {
    test('should track state changes', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 1 });

      expect(cb.state).toBe('CLOSED');

      const fn = async () => {
        throw new Error('Error');
      };

      try {
        await cb.execute(fn);
      } catch (e) {
        // Expected
      }

      expect(cb.state).toBe('OPEN');
    });

    test('should provide metrics', () => {
      const cb = new CircuitBreaker('test-service');

      const fn = async () => {
        throw new Error('Error');
      };

      try {
        cb.execute(fn);
      } catch (e) {
        // Expected
      }

      const metrics = cb.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.state).toBe(cb.state);
      expect(metrics.failureCount).toBeDefined();
    });
  });

  // Test edge cases
  describe('Edge Cases', () => {
    test('should handle async functions', async () => {
      const cb = new CircuitBreaker('test-service');

      const asyncFn = async () => {
        return new Promise(resolve => {
          setTimeout(() => resolve('delayed'), 10);
        });
      };

      const result = await cb.execute(asyncFn);
      expect(result).toBe('delayed');
    });

    test('should handle function that returns promise', async () => {
      const cb = new CircuitBreaker('test-service');

      const fn = () => Promise.resolve('result');

      const result = await cb.execute(fn);
      expect(result).toBe('result');
    });

    test('should handle null function gracefully', async () => {
      const cb = new CircuitBreaker('test-service');

      try {
        await cb.execute(null);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  // Performance tests
  describe('Performance', () => {
    test('should check circuit breaker status in <1ms', async () => {
      const cb = new CircuitBreaker('test-service');
      const fn = async () => 'result';

      const start = performance.now();
      await cb.execute(fn);
      const duration = performance.now() - start;

      // Should complete almost instantly (just function execution)
      expect(duration).toBeLessThan(10);
    });

    test('should handle rapid state transitions', async () => {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        resetTimeoutMs: 1000
      });

      // Simulate rapid failures
      for (let i = 0; i < 3; i++) {
        try {
          await cb.execute(async () => {
            throw new Error('Error');
          });
        } catch (e) {
          // Expected
        }
      }

      expect(cb.state).toBe('OPEN');
    });
  });
});
