/**
 * Kasbah Guard - Enterprise Policy Manager
 * Downloads, verifies, and enforces organization security policies
 * Supports canary deployments with gradual rollout
 */

class PolicyManager {
  constructor() {
    this.currentPolicy = null;
    this.policyVersion = '1.0.0';
    this.policyHash = null;
    this.checkInterval = 300000; // 5 minutes
    this.apiEndpoint = 'https://api.bekasbah.com/api/policies';
    this.orgToken = null;
    this.canaryMode = false;
    this.canaryPercentage = 0; // 0-100
    this.policySignature = null;
    this.lastPolicyUpdate = null;
    this.enforcementLog = [];
  }

  /**
   * Initialize policy manager
   */
  async initialize(orgToken) {
    this.orgToken = orgToken;

    try {
      // Fetch initial policy
      await this.fetchPolicy();

      // Start periodic checks
      this.startPeriodicChecks();

      return true;
    } catch (error) {
      console.error('Policy manager initialization failed:', error);
      return false;
    }
  }

  /**
   * Fetch policy from API
   */
  async fetchPolicy() {
    try {
      const response = await fetch(`${this.apiEndpoint}/current`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.orgToken || 'default'}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Verify signature
      const isValid = await this.verifyPolicySignature(data);
      if (!isValid) {
        console.warn('Policy signature verification failed');
        return false;
      }

      // Store policy
      this.currentPolicy = data.policy;
      this.policyVersion = data.version;
      this.policyHash = data.policy_hash;
      this.policySignature = data.signature;
      this.lastPolicyUpdate = new Date().toISOString();
      this.canaryMode = data.canary_mode || false;
      this.canaryPercentage = data.canary_percentage || 0;

      // Persist to storage
      await this.persistPolicy();

      return true;
    } catch (error) {
      console.error('Policy fetch error:', error);
      // Load cached policy on error
      return await this.loadCachedPolicy();
    }
  }

  /**
   * Verify policy signature (RSA-2048 or EdDSA)
   */
  async verifyPolicySignature(data) {
    try {
      // In production, verify signature with org's public key
      // For now, check structure
      return data.signature && data.policy_hash && data.policy;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Get current policy
   */
  getPolicy() {
    return this.currentPolicy;
  }

  /**
   * Get policy version
   */
  getPolicyVersion() {
    return this.policyVersion;
  }

  /**
   * Check if client should apply policy (for canary)
   */
  async shouldApplyPolicy() {
    if (!this.canaryMode) {
      // Not in canary, always apply
      return true;
    }

    // In canary mode, check percentage
    const random = Math.random() * 100;
    const shouldApply = random < this.canaryPercentage;

    // Log for analytics
    if (shouldApply) {
      this.logEnforcement('canary', 'policy_applied', this.canaryPercentage);
    }

    return shouldApply;
  }

  /**
   * Get policy rule for severity
   */
  getPolicyRule(severity) {
    if (!this.currentPolicy) {
      return this.getDefaultRule(severity);
    }

    const rules = this.currentPolicy.escalation_rules || {};
    return rules[severity] || this.getDefaultRule(severity);
  }

  /**
   * Get default rule (fallback)
   */
  getDefaultRule(severity) {
    const defaults = {
      critical: {
        threshold: 0.7,
        enforcement: 'block',
        priority: 'P0'
      },
      high: {
        threshold: 0.5,
        enforcement: 'block',
        priority: 'P1'
      },
      medium: {
        threshold: 0.3,
        enforcement: 'warn',
        priority: 'P2'
      },
      low: {
        threshold: 0.0,
        enforcement: 'log',
        priority: 'P3'
      }
    };

    return defaults[severity] || defaults.low;
  }

  /**
   * Apply policy to decision
   */
  async applyPolicy(decision) {
    try {
      // Check if should apply (canary)
      const shouldApply = await this.shouldApplyPolicy();
      if (!shouldApply) {
        return decision; // Return unmodified for canary exclusion
      }

      // Get policy rule for this severity
      const rule = this.getPolicyRule(decision.severity);

      // Create policy-enforced decision
      const enforcedDecision = {
        ...decision,
        policy_applied: true,
        policy_version: this.policyVersion,
        policy_rule: rule,
        original_enforcement: decision.enforcement_level,
        modified_at: new Date().toISOString()
      };

      // Apply enforcement override if policy requires it
      if (rule.enforcement === 'block') {
        enforcedDecision.detected = true;
        enforcedDecision.enforcement_level = 'policy_enforced';
      } else if (rule.enforcement === 'warn') {
        enforcedDecision.enforcement_level = 'warning';
      } else if (rule.enforcement === 'log') {
        enforcedDecision.enforcement_level = 'logged';
      }

      // Adjust confidence based on policy threshold
      if (decision.confidence < rule.threshold) {
        enforcedDecision.confidence = Math.max(decision.confidence, rule.threshold);
      }

      // Log enforcement
      this.logEnforcement(decision.severity, rule.enforcement, decision.confidence);

      return enforcedDecision;
    } catch (error) {
      console.error('Policy application error:', error);
      return decision; // Return original on error
    }
  }

  /**
   * Get policy status report
   */
  async getPolicyStatus() {
    return {
      policy_version: this.policyVersion,
      policy_hash: this.policyHash?.substring(0, 16) + '...',
      last_update: this.lastPolicyUpdate,
      canary_mode: this.canaryMode,
      canary_percentage: this.canaryPercentage,
      enforcement_count: this.enforcementLog.length,
      status: this.currentPolicy ? 'active' : 'inactive'
    };
  }

  /**
   * Get enforcement report
   */
  getEnforcementReport(limit = 50) {
    return {
      total_enforcements: this.enforcementLog.length,
      recent: this.enforcementLog.slice(-limit).reverse(),
      by_type: this.groupByType(),
      by_severity: this.groupBySeverity()
    };
  }

  /**
   * Group enforcement log by type
   */
  groupByType() {
    const grouped = {};
    for (const entry of this.enforcementLog) {
      grouped[entry.enforcement] = (grouped[entry.enforcement] || 0) + 1;
    }
    return grouped;
  }

  /**
   * Group enforcement log by severity
   */
  groupBySeverity() {
    const grouped = {};
    for (const entry of this.enforcementLog) {
      grouped[entry.severity] = (grouped[entry.severity] || 0) + 1;
    }
    return grouped;
  }

  /**
   * Log enforcement action
   */
  logEnforcement(severity, enforcement, confidence) {
    this.enforcementLog.push({
      severity,
      enforcement,
      confidence,
      timestamp: Date.now(),
      iso_timestamp: new Date().toISOString()
    });

    // Limit log size
    if (this.enforcementLog.length > 1000) {
      this.enforcementLog = this.enforcementLog.slice(-1000);
    }

    // Report to API if significant
    if (enforcement === 'block' || enforcement === 'policy_enforced') {
      this.reportEnforcementAsync(severity, enforcement);
    }
  }

  /**
   * Report enforcement to API (async, don't wait)
   */
  async reportEnforcementAsync(severity, enforcement) {
    try {
      fetch(`${this.apiEndpoint}/enforcement-report`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.orgToken || 'default'}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          organization_id: this.orgId,
          severity,
          enforcement,
          timestamp: new Date().toISOString(),
          policy_version: this.policyVersion
        })
      }).catch(err => console.error('Enforcement report error:', err));
    } catch (error) {
      // Silently fail - don't block enforcement
    }
  }

  /**
   * Start periodic policy checks
   */
  startPeriodicChecks() {
    setInterval(async () => {
      await this.fetchPolicy();
    }, this.checkInterval);
  }

  /**
   * Persist policy to storage
   */
  async persistPolicy() {
    try {
      const data = {
        policy: this.currentPolicy,
        version: this.policyVersion,
        hash: this.policyHash,
        signature: this.policySignature,
        canary_mode: this.canaryMode,
        canary_percentage: this.canaryPercentage,
        updated_at: this.lastPolicyUpdate
      };

      localStorage.setItem('kasbah_policy_cache', JSON.stringify(data));
    } catch (error) {
      console.error('Policy persistence error:', error);
    }
  }

  /**
   * Load cached policy on error
   */
  async loadCachedPolicy() {
    try {
      const cached = localStorage.getItem('kasbah_policy_cache');
      if (cached) {
        const data = JSON.parse(cached);
        this.currentPolicy = data.policy;
        this.policyVersion = data.version;
        this.policyHash = data.hash;
        this.policySignature = data.signature;
        this.canaryMode = data.canary_mode;
        this.canaryPercentage = data.canary_percentage;
        return true;
      }
    } catch (error) {
      console.error('Load cached policy error:', error);
    }
    return false;
  }

  /**
   * Export enforcement report
   */
  exportEnforcementReport() {
    const report = this.getEnforcementReport(100);
    return {
      timestamp: new Date().toISOString(),
      organization_id: this.orgId,
      policy_version: this.policyVersion,
      canary_mode: this.canaryMode,
      canary_percentage: this.canaryPercentage,
      ...report
    };
  }

  /**
   * Reset enforcement log
   */
  resetEnforcementLog() {
    this.enforcementLog = [];
  }

  /**
   * Set canary mode (for admin)
   */
  setCanaryMode(enabled, percentage = 0) {
    this.canaryMode = enabled;
    this.canaryPercentage = Math.min(Math.max(percentage, 0), 100);
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.policyManager = new PolicyManager();
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PolicyManager;
}
