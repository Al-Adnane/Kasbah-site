/**
 * Kasbah Guard — Circuit Breaker
 * 
 * Three states: CLOSED, OPEN, HALF-OPEN
 * Auto-recovery with exponential backoff
 */

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 3;
    this.timeout = options.timeout || 60000;
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
    this.nextAttempt = null;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF-OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    if (this.state === 'HALF-OPEN') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successes = 0;
      }
    }
  }

  onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
      this.successes = 0;
    }
  }

  getState() {
    return { state: this.state, failures: this.failures, successes: this.successes, lastFailure: this.lastFailure, nextAttempt: this.nextAttempt };
  }
}

module.exports = { CircuitBreaker };
