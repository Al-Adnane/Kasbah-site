/**
 * Kasbah Guard — System Integrity Index (SII)
 * 
 * Real-time component health scoring
 * Mirror integrity algorithm (JS version of integrity.rs)
 * Health check endpoint ready
 */

class SystemIntegrityIndex {
  constructor() {
    this.components = new Map();
    this.genesisTime = Date.now();
  }

  /**
   * Register component for monitoring
   */
  registerComponent(id, name, weight = 1.0) {
    this.components.set(id, {
      id,
      name,
      weight,
      health: 1.0,
      lastCheck: Date.now(),
      checks: [],
      failures: 0
    });
  }

  /**
   * Record health check for component
   */
  recordCheck(componentId, success, latencyMs = 0) {
    const component = this.components.get(componentId);
    if (!component) return;

    const check = {
      timestamp: Date.now(),
      success,
      latencyMs
    };

    component.checks.push(check);
    if (component.checks.length > 100) {
      component.checks.shift(); // Keep last 100 checks
    }

    if (!success) {
      component.failures++;
    }

    component.lastCheck = Date.now();
    component.health = this.calculateHealth(component);
  }

  /**
   * Calculate component health (0.0 - 1.0)
   */
  calculateHealth(component) {
    if (component.checks.length === 0) return 1.0;

    const recentChecks = component.checks.slice(-20); // Last 20 checks
    const successRate = recentChecks.filter(c => c.success).length / recentChecks.length;

    // Latency penalty
    const avgLatency = recentChecks.reduce((sum, c) => sum + c.latencyMs, 0) / recentChecks.length;
    const latencyPenalty = avgLatency > 1000 ? 0.2 : avgLatency > 500 ? 0.1 : 0;

    // Failure penalty
    const failurePenalty = component.failures > 10 ? 0.3 : component.failures > 5 ? 0.15 : 0;

    return Math.max(0, Math.min(1, successRate - latencyPenalty - failurePenalty));
  }

  /**
   * Compute System Integrity Index (weighted geometric mean)
   * Formula: I(t) = ∏(hook^0.30 × pattern^0.30 × session^0.25 × latency^0.15)
   */
  computeSII() {
    if (this.components.size === 0) return 1.0;

    let product = 1.0;
    let totalWeight = 0;

    for (const component of this.components.values()) {
      const health = component.health;
      const weight = component.weight;
      
      // Geometric mean: multiply health^weight
      product *= Math.pow(health, weight);
      totalWeight += weight;
    }

    // Normalize by total weight
    const sii = Math.pow(product, 1 / totalWeight);
    return Math.round(sii * 10000) / 10000; // 4 decimal places
  }

  /**
   * Three-Gate Policy Check (Moat O Mirror)
   * R_MIN=0.72 (reliability), B_MAX=0.18 (brittleness), H_MAX=0.35 (harm)
   */
  apiGateCheck(reliability, brittleness, harm) {
    const R_MIN = 0.72;
    const B_MAX = 0.18;
    const H_MAX = 0.35;

    if (reliability < R_MIN) {
      return { pass: false, gate: 'reliability', value: reliability, threshold: R_MIN };
    }
    if (brittleness > B_MAX) {
      return { pass: false, gate: 'brittleness', value: brittleness, threshold: B_MAX };
    }
    if (harm > H_MAX) {
      return { pass: false, gate: 'harm', value: harm, threshold: H_MAX };
    }
    return { pass: true };
  }

  /**
   * Get component health status
   */
  getComponentHealth(componentId) {
    const component = this.components.get(componentId);
    if (!component) return null;

    return {
      id: component.id,
      name: component.name,
      health: component.health,
      status: component.health >= 0.9 ? 'healthy' : component.health >= 0.7 ? 'degraded' : 'unhealthy',
      lastCheck: component.lastCheck,
      failures: component.failures,
      checks: component.checks.length
    };
  }

  /**
   * Get full system health status
   */
  getSystemHealth() {
    const sii = this.computeSII();
    const components = [];

    for (const component of this.components.values()) {
      components.push(this.getComponentHealth(component.id));
    }

    const healthy = components.filter(c => c.status === 'healthy').length;
    const degraded = components.filter(c => c.status === 'degraded').length;
    const unhealthy = components.filter(c => c.status === 'unhealthy').length;

    return {
      sii,
      status: sii >= 0.9 ? 'healthy' : sii >= 0.7 ? 'degraded' : 'unhealthy',
      uptime: Date.now() - this.genesisTime,
      components: {
        total: components.length,
        healthy,
        degraded,
        unhealthy
      },
      componentDetails: components,
      timestamp: Date.now()
    };
  }

  /**
   * Mirror integrity algorithm (JS version of integrity.rs)
   * Compares expected vs actual component states
   */
  mirrorIntegrityCheck(expectedState, actualState) {
    const issues = [];

    for (const [key, expected] of Object.entries(expectedState)) {
      const actual = actualState[key];
      
      if (actual === undefined) {
        issues.push({ component: key, issue: 'missing_component' });
        continue;
      }

      if (typeof expected === 'object' && typeof actual === 'object') {
        const subIssues = this.mirrorIntegrityCheck(expected, actual);
        issues.push(...subIssues);
      } else if (expected !== actual) {
        issues.push({ 
          component: key, 
          issue: 'state_mismatch', 
          expected, 
          actual 
        });
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      checkedAt: Date.now()
    };
  }

  /**
   * Health check endpoint handler
   */
  async healthEndpoint() {
    const systemHealth = this.getSystemHealth();
    
    // Run gate check
    const gateResult = this.apiGateCheck(
      systemHealth.sii, // Use SII as reliability proxy
      systemHealth.components.unhealthy / systemHealth.components.total, // Brittleness
      0.0 // Harm (would need actual harm metrics)
    );

    return {
      ok: true,
      service: 'kasbah-guard',
      version: '2.0.0',
      status: systemHealth.status,
      sii: systemHealth.sii,
      gate: gateResult,
      components: systemHealth.components,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { SystemIntegrityIndex };
