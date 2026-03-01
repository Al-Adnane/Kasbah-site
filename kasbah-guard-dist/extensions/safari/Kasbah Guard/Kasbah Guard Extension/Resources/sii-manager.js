/**
 * Kasbah Guard - System Integrity Index Manager
 * Fetches and applies SII to detection decisions for adaptive enforcement
 * Integrates with detector.js for confidence-aware blocking
 */

class SystemIntegrityIndexManager {
  constructor() {
    this.cachedSII = null;
    this.cacheExpiry = 0;
    this.cacheDuration = 30000; // 30 seconds
    this.apiEndpoint = 'https://api.bekasbah.com/api/integrity';
    this.orgToken = null;
    this.escalationQueue = [];
    this.escalationThresholds = {
      critical: 0.7,  // Escalate if SII < 0.7 and severity is critical
      high: 0.5,      // Escalate if SII < 0.5 and severity is high
      medium: 0.3,    // Escalate if SII < 0.3 and severity is medium
      low: 0.0        // Always enforce low severity
    };
  }

  /**
   * Initialize SII manager with organization token
   */
  async initialize(orgToken) {
    this.orgToken = orgToken;
    try {
      // Fetch initial SII
      await this.fetchSII();
    } catch (error) {
      console.error('Failed to initialize SII manager:', error);
      // Use healthy default
      this.cachedSII = 0.95;
      this.cacheExpiry = Date.now() + this.cacheDuration;
    }
  }

  /**
   * Fetch System Integrity Index from API
   */
  async fetchSII() {
    try {
      // Check cache first
      if (this.cachedSII !== null && Date.now() < this.cacheExpiry) {
        return this.cachedSII;
      }

      // Fetch from API
      const response = await fetch(this.apiEndpoint, {
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
      this.cachedSII = data.sii || 0.95;
      this.cacheExpiry = Date.now() + this.cacheDuration;

      return this.cachedSII;
    } catch (error) {
      console.error('SII fetch error:', error);
      // Fallback to healthy state
      this.cachedSII = this.cachedSII || 0.95;
      this.cacheExpiry = Date.now() + this.cacheDuration;
      return this.cachedSII;
    }
  }

  /**
   * Get current SII (cached if recent)
   */
  async getSII() {
    if (this.cachedSII !== null && Date.now() < this.cacheExpiry) {
      return this.cachedSII;
    }
    return await this.fetchSII();
  }

  /**
   * Determine if decision should be escalated based on SII
   */
  async shouldEscalate(decision, sii = null) {
    try {
      // Get current SII if not provided
      if (sii === null) {
        sii = await this.getSII();
      }

      const severity = decision.severity || 'medium';
      const threshold = this.escalationThresholds[severity] || 0.0;

      // Escalate if SII is below threshold for this severity
      const needsEscalation = sii < threshold;

      return {
        escalate: needsEscalation,
        sii: sii,
        threshold: threshold,
        severity: severity,
        reason: needsEscalation
          ? `SII (${sii.toFixed(2)}) below threshold (${threshold}) for ${severity}`
          : `SII (${sii.toFixed(2)}) healthy for ${severity}`
      };
    } catch (error) {
      console.error('Escalation check error:', error);
      return {
        escalate: false,
        sii: this.cachedSII || 0.95,
        threshold: null,
        severity: decision.severity,
        reason: 'Error checking escalation - proceeding with standard enforcement'
      };
    }
  }

  /**
   * Apply integrity enforcement to decision
   * Modifies decision based on SII and severity
   */
  async applyIntegrityEnforcement(decision, context = {}) {
    try {
      const sii = await this.getSII();
      const escalationInfo = await this.shouldEscalate(decision, sii);

      // Create enforced decision
      const enforcedDecision = {
        ...decision,
        sii: sii,
        integrity_enforced: true,
        escalation_info: escalationInfo,
        original_confidence: decision.confidence,
        modified_at: new Date().toISOString()
      };

      // If escalating, modify decision enforcement level
      if (escalationInfo.escalate) {
        // Escalated: Block with higher priority
        enforcedDecision.detected = true;
        enforcedDecision.severity = Math.max(
          decision.severity === 'critical' ? 3 :
          decision.severity === 'high' ? 2 :
          decision.severity === 'medium' ? 1 : 0,
          2 // At least 'high' priority
        );
        enforcedDecision.enforcement_level = 'escalated';

        // Add to escalation queue
        this.escalationQueue.push({
          decision: enforcedDecision,
          context: context,
          timestamp: Date.now(),
          escalation_reason: escalationInfo.reason
        });

        // Limit queue size
        if (this.escalationQueue.length > 100) {
          this.escalationQueue.shift();
        }
      } else {
        // Normal enforcement
        enforcedDecision.enforcement_level = 'normal';
        enforcedDecision.confidence = Math.min(
          decision.confidence * (sii / 0.95), // Scale by health
          1.0
        );
      }

      return enforcedDecision;
    } catch (error) {
      console.error('Integrity enforcement error:', error);
      // Return original decision on error
      return {
        ...decision,
        integrity_enforced: false,
        enforcement_error: error.message
      };
    }
  }

  /**
   * Check if hooks are still in place (component of SII)
   */
  async verifyHookIntegrity() {
    try {
      const hooks = {
        fetch: typeof window.fetch === 'function' &&
                window.fetch.toString().includes('[native code]'),
        xhr: typeof window.XMLHttpRequest === 'function',
        beacon: typeof navigator.sendBeacon === 'function',
        websocket: typeof window.WebSocket === 'function',
        storage: typeof window.localStorage === 'object',
        service_worker: typeof navigator.serviceWorker === 'object'
      };

      const intactHooks = Object.values(hooks).filter(h => h).length;
      const totalHooks = Object.keys(hooks).length;

      return {
        all_intact: intactHooks === totalHooks,
        intact_count: intactHooks,
        total_count: totalHooks,
        hooks: hooks
      };
    } catch (error) {
      console.error('Hook verification error:', error);
      return {
        all_intact: false,
        error: error.message
      };
    }
  }

  /**
   * Check detector health (another component of SII)
   */
  async verifyDetectorHealth() {
    try {
      const detector = window.kasbahDetector || window.__detector__;

      if (!detector) {
        return {
          healthy: false,
          reason: 'Detector not found'
        };
      }

      // Check if detector.selfTest exists and passes
      if (typeof detector.selfTest === 'function') {
        const testResult = detector.selfTest();
        return {
          healthy: testResult === true || testResult > 20,
          test_result: testResult,
          detector_version: detector.version || 'unknown'
        };
      }

      return {
        healthy: true,
        detector_present: true,
        detector_version: detector.version || 'unknown'
      };
    } catch (error) {
      console.error('Detector health check error:', error);
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Check session health (latency, uptime)
   */
  async verifySessionHealth() {
    try {
      const sessionStartTime = window.__kasbah_session_start || Date.now();
      const sessionDuration = Date.now() - sessionStartTime;
      const isHealthy = sessionDuration > 30000; // Healthy after 30 seconds

      return {
        healthy: isHealthy,
        duration_ms: sessionDuration,
        started_at: new Date(sessionStartTime).toISOString()
      };
    } catch (error) {
      console.error('Session health check error:', error);
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Compute overall SII from components
   */
  async computeSII() {
    try {
      const [hookHealth, detectorHealth, sessionHealth] = await Promise.all([
        this.verifyHookIntegrity(),
        this.verifyDetectorHealth(),
        this.verifySessionHealth()
      ]);

      // Weight components
      const hookScore = hookHealth.all_intact ? 1.0 :
                       hookHealth.intact_count / hookHealth.total_count;
      const detectorScore = detectorHealth.healthy ? 1.0 : 0.5;
      const sessionScore = sessionHealth.healthy ? 1.0 : 0.8;

      // Weighted average (hooks: 50%, detector: 30%, session: 20%)
      const sii = (hookScore * 0.5) + (detectorScore * 0.3) + (sessionScore * 0.2);

      return {
        sii: Math.min(Math.max(sii, 0), 1), // Clamp to 0-1
        components: {
          hooks: hookScore,
          detector: detectorScore,
          session: sessionScore
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('SII computation error:', error);
      return {
        sii: 0.8,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get escalation queue (for popup display)
   */
  getEscalationQueue() {
    return this.escalationQueue;
  }

  /**
   * Clear escalation queue
   */
  clearEscalationQueue() {
    this.escalationQueue = [];
  }

  /**
   * Export SII status report
   */
  async exportSIIReport() {
    try {
      const sii = await this.getSII();
      const [hookHealth, detectorHealth, sessionHealth] = await Promise.all([
        this.verifyHookIntegrity(),
        this.verifyDetectorHealth(),
        this.verifySessionHealth()
      ]);

      return {
        timestamp: new Date().toISOString(),
        sii: sii,
        hook_health: hookHealth,
        detector_health: detectorHealth,
        session_health: sessionHealth,
        escalation_queue_size: this.escalationQueue.length,
        cache_info: {
          cached_sii: this.cachedSII,
          cache_expiry: new Date(this.cacheExpiry).toISOString(),
          cache_age_ms: Date.now() - (this.cacheExpiry - this.cacheDuration)
        }
      };
    } catch (error) {
      console.error('SII report export error:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Set escalation thresholds (for policy configuration)
   */
  setEscalationThresholds(thresholds) {
    this.escalationThresholds = {
      ...this.escalationThresholds,
      ...thresholds
    };
  }

  /**
   * Reset to defaults
   */
  reset() {
    this.cachedSII = null;
    this.cacheExpiry = 0;
    this.escalationQueue = [];
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.siiManager = new SystemIntegrityIndexManager();
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SystemIntegrityIndexManager;
}
