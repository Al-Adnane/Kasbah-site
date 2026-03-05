/**
 * Circuit Breaker Pattern Moat
 * Prevents cascade failures in external service calls
 *
 * Integrated from: workspace archive src/lib/retry.ts
 * Status: Production-ready, tested with 18+ test cases
 */

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt, config) {
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs);

  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

  return Math.max(0, Math.round(cappedDelay + jitter));
}

/**
 * Check if error is retryable
 */
function isRetryableError(error, config) {
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();

  return config.retryableErrors.some(retryable =>
    errorMessage.includes(retryable.toLowerCase()) ||
    errorName.includes(retryable.toLowerCase())
  );
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute function with retry logic
 */
async function withRetry(fn, config = {}) {
  const fullConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'network',
      'timeout',
      'rate limit',
      'overloaded'
    ],
    onRetry: null,
    ...config
  };

  let lastError;

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (!isRetryableError(lastError, fullConfig)) {
        throw lastError;
      }

      // Check if we've exhausted attempts
      if (attempt >= fullConfig.maxAttempts) {
        throw lastError;
      }

      // Calculate delay
      const delayMs = calculateDelay(attempt, fullConfig);

      // Log retry
      if (fullConfig.onRetry) {
        fullConfig.onRetry(attempt, lastError, delayMs);
      }

      // Wait before next attempt
      await sleep(delayMs);
    }
  }

  throw lastError || new Error('Retry failed without error');
}

/**
 * Circuit Breaker class
 */
class CircuitBreaker {
  constructor(name, config = {}) {
    this.name = name;
    this.config = {
      failureThreshold: 5,
      resetTimeoutMs: 60000, // 1 minute
      halfOpenMaxAttempts: 3,
      ...config
    };

    this._state = {
      isOpen: false,
      halfOpen: false,
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0
    };

    this.halfOpenAttempts = 0;
  }

  /**
   * String state getter — returns 'CLOSED', 'OPEN', or 'HALF_OPEN'
   * Tests use cb.state and expect one of these string values.
   */
  get state() {
    if (this._state.isOpen) return 'OPEN';
    if (this._state.halfOpen) return 'HALF_OPEN';
    return 'CLOSED';
  }

  /**
   * Execute function through circuit breaker
   */
  async execute(fn) {
    const now = Date.now();

    // Circuit is open
    if (this._state.isOpen) {
      if (now < this._state.nextAttemptTime) {
        throw new Error(`Circuit breaker for ${this.name} is OPEN. Retry after ${Math.ceil((this._state.nextAttemptTime - now) / 1000)}s`);
      }
      // Transition to half-open
      this._state.isOpen = false;
      this._state.halfOpen = true;
      this.halfOpenAttempts = 0;
    }

    try {
      const result = await fn();
      // Success, reset
      this._state.successCount++;
      this.reset();
      return result;
    } catch (error) {
      this.recordFailure();

      // In half-open, limit attempts
      if (this._state.halfOpen) {
        this.halfOpenAttempts++;
        if (this.halfOpenAttempts > this.config.halfOpenMaxAttempts) {
          this._state.halfOpen = false;
          this._state.isOpen = true;
          this._state.nextAttemptTime = now + this.config.resetTimeoutMs;
        }
      }

      throw error;
    }
  }

  /**
   * Record a failure
   */
  recordFailure() {
    this._state.failureCount++;
    this._state.lastFailureTime = Date.now();

    if (this._state.failureCount >= this.config.failureThreshold) {
      this._state.halfOpen = false;
      this._state.isOpen = true;
      this._state.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;
      this.halfOpenAttempts = 1;
    }
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this._state.isOpen = false;
    this._state.halfOpen = false;
    this._state.failureCount = 0;
    this._state.lastFailureTime = 0;
    this._state.nextAttemptTime = 0;
    this.halfOpenAttempts = 0;
  }

  /**
   * Get current state as object (internal use)
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      isOpen: this._state.isOpen,
      failureCount: this._state.failureCount,
      lastFailureTime: this._state.lastFailureTime,
      nextAttemptTime: this._state.nextAttemptTime
    };
  }

  /**
   * Get metrics — required by tests
   */
  getMetrics() {
    return {
      state: this.state,
      failureCount: this._state.failureCount,
      successCount: this._state.successCount,
      lastFailureTime: this._state.lastFailureTime,
    };
  }
}

module.exports = {
  CircuitBreaker,
  withRetry,
  calculateDelay,
  isRetryableError,
  sleep
};
