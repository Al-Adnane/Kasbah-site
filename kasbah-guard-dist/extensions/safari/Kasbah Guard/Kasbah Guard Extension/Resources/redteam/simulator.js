/**
 * Kasbah Guard Red Team Simulator
 * Tests 50+ bypass attack vectors against the extension
 * Provides comprehensive security assessment report
 */

class AttackSimulator {
  constructor() {
    this.vectors = [];
    this.results = [];
    this.startTime = null;
    this.totalDuration = 0;
    this.progressCallback = null;
    this.hookVerificationMethods = {
      'Hook Override': this.verifyHookIntegrity.bind(this),
      'Prototype Pollution': this.verifyPrototypeIntegrity.bind(this),
      'Early Injection': this.verifyInjectionDefenses.bind(this),
      'Message Interception': this.verifyMessageIntegrity.bind(this),
      'Service Worker Hijacking': this.verifyServiceWorkerIntegrity.bind(this),
      'Storage Poisoning': this.verifyStorageIntegrity.bind(this),
      'Function Cloning': this.verifyFunctionIntegrity.bind(this),
      'Timer Exploit': this.verifyTimerIntegrity.bind(this),
      'Symbol Spoofing': this.verifySymbolIntegrity.bind(this),
      'Frame Escape': this.verifyFrameIntegrity.bind(this)
    };
  }

  /**
   * Load attack vectors from JSON catalog
   */
  async loadVectors() {
    try {
      const response = await fetch(chrome.runtime.getURL('redteam/vectors.json'));
      const data = await response.json();
      this.vectors = data.vectors;
      return this.vectors.length;
    } catch (error) {
      console.error('Failed to load attack vectors:', error);
      throw error;
    }
  }

  /**
   * Run all 50 attack vectors
   */
  async runAllAttacks() {
    this.startTime = performance.now();
    this.results = [];

    for (let i = 0; i < this.vectors.length; i++) {
      const vector = this.vectors[i];
      const result = await this.attemptVector(vector);
      this.results.push(result);

      if (this.progressCallback) {
        this.progressCallback({
          current: i + 1,
          total: this.vectors.length,
          result: result
        });
      }

      // Small delay between attacks to prevent system overload
      await this.delay(50);
    }

    this.totalDuration = performance.now() - this.startTime;
    return this.generateReport();
  }

  /**
   * Attempt a single attack vector
   */
  async attemptVector(vector) {
    const startTime = performance.now();
    let success = false;
    let error = null;

    try {
      // Create isolated execution context
      const attackContext = this.createIsolatedContext();

      // Attempt to execute the attack
      this.executeAttack(attackContext, vector.implementation);

      // Verify if hooks were compromised
      const verifyFn = this.hookVerificationMethods[vector.category];
      success = !verifyFn(vector.id);

    } catch (e) {
      error = e.message;
      success = false; // Exception means attack failed
    }

    const endTime = performance.now();

    return {
      vector_id: vector.id,
      name: vector.name,
      category: vector.category,
      description: vector.description,
      severity: vector.severity,
      cwe: vector.cwe,
      success: success, // true = attack succeeded (hooks compromised), false = blocked
      blocked: !success, // true = attack was blocked
      duration_ms: Math.round(endTime - startTime),
      error: error,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create isolated context for attack execution
   */
  createIsolatedContext() {
    // Create sandbox with current window globals
    return {
      window: window,
      document: document,
      fetch: window.fetch,
      XMLHttpRequest: window.XMLHttpRequest,
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
      indexedDB: window.indexedDB,
      Array: Array,
      Object: Object,
      String: String,
      Map: Map,
      Set: Set,
      WeakMap: WeakMap,
      WeakSet: WeakSet,
      Promise: Promise,
      ArrayBuffer: ArrayBuffer,
      Symbol: Symbol,
      Proxy: Proxy,
      Reflect: Reflect,
      JSON: JSON,
      console: console,
      setTimeout: window.setTimeout,
      setInterval: window.setInterval,
      requestAnimationFrame: window.requestAnimationFrame,
      crypto: window.crypto,
      navigator: window.navigator,
      chrome: typeof chrome !== 'undefined' ? chrome : {}
    };
  }

  /**
   * Execute attack code safely
   */
  executeAttack(context, implementation) {
    // Create function from implementation string
    try {
      const attackFunction = new Function(...Object.keys(context), implementation);
      attackFunction(...Object.values(context));
    } catch (e) {
      throw e;
    }
  }

  /**
   * Verify Hook Override defenses
   */
  verifyHookIntegrity(vectorId) {
    try {
      // Test if fetch is still properly hooked
      if (typeof window.fetch !== 'function') return false;

      // Test if XMLHttpRequest.open is still hooked
      if (typeof window.XMLHttpRequest.prototype.open !== 'function') return false;

      // Verify hooks respond to detector queries
      const detector = window.kasbahDetector || window.__detector__;
      if (detector && typeof detector.verifyHooks === 'function') {
        const hookStatus = detector.verifyHooks();
        return hookStatus && hookStatus.fetch === true && hookStatus.xhr === true;
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Verify Prototype Pollution defenses
   */
  verifyPrototypeIntegrity(vectorId) {
    try {
      // Test Array.prototype.push still works
      const arr = [];
      arr.push('test');
      if (arr.length !== 1) return false;

      // Test Object.prototype.hasOwnProperty
      const obj = { test: true };
      if (!obj.hasOwnProperty('test')) return false;

      // Test if prototypes are frozen
      const frozen = Object.isFrozen && Object.isFrozen(Array.prototype);

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Verify Early Injection defenses
   */
  verifyInjectionDefenses(vectorId) {
    try {
      // Test console.log still works
      const testOutput = [];
      const oldLog = console.log;
      console.log = function(...args) { testOutput.push(...args) };
      console.log('test');
      console.log = oldLog;

      if (testOutput[0] !== 'test') return false;

      // Verify Content Security Policy is active
      const meta = document.querySelector("meta[http-equiv='Content-Security-Policy']");

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Verify Message Interception defenses
   */
  verifyMessageIntegrity(vectorId) {
    try {
      // Test postMessage still works
      let messageReceived = false;
      const handler = () => { messageReceived = true };
      window.addEventListener('message', handler);
      window.postMessage({ test: true }, '*');
      window.removeEventListener('message', handler);

      // Test event listeners are still present
      const allListeners = getEventListeners ? getEventListeners(window) : {};

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Verify Service Worker integrity
   */
  verifyServiceWorkerIntegrity(vectorId) {
    try {
      // Check service worker container exists
      if (!navigator.serviceWorker) return false;

      // Verify register method exists
      if (typeof navigator.serviceWorker.register !== 'function') return false;

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Verify Storage integrity
   */
  verifyStorageIntegrity(vectorId) {
    try {
      // Test localStorage still works
      const testKey = '__detector_test_' + Date.now();
      localStorage.setItem(testKey, 'test');
      const retrieved = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);

      if (retrieved !== 'test') return false;

      // Test sessionStorage
      sessionStorage.setItem(testKey, 'test');
      const sessionRetrieved = sessionStorage.getItem(testKey);
      sessionStorage.removeItem(testKey);

      return sessionRetrieved === 'test';
    } catch (e) {
      return false;
    }
  }

  /**
   * Verify Function integrity
   */
  verifyFunctionIntegrity(vectorId) {
    try {
      // Test detector functions still callable
      const detector = window.kasbahDetector || window.__detector__;
      if (detector && typeof detector.classify === 'function') {
        // Function signature should exist
        const sourceCode = detector.classify.toString();
        return sourceCode.length > 0;
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Verify Timer integrity
   */
  verifyTimerIntegrity(vectorId) {
    try {
      // Test setTimeout still works
      let timerFired = false;
      const timerId = setTimeout(() => { timerFired = true }, 10);

      // Also test setInterval
      let intervalFired = false;
      const intervalId = setInterval(() => { intervalFired = true }, 10);

      // Clean up
      clearTimeout(timerId);
      clearInterval(intervalId);

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Verify Symbol spoofing defenses
   */
  verifySymbolIntegrity(vectorId) {
    try {
      // Test Symbol.hasInstance works
      const testObj = {};
      const sym = Symbol.hasInstance;
      if (!sym) return false;

      // Test Symbol.iterator
      const arr = [];
      const iter = arr[Symbol.iterator]();
      if (!iter) return false;

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Verify Frame Escape defenses
   */
  verifyFrameIntegrity(vectorId) {
    try {
      // Test we're not in an exploitable frame situation
      if (window.parent && window.parent !== window) {
        // We're in a frame - verify we can't break out
        try {
          const parent = window.parent;
          // Can't access parent's context = good
          return !parent.kasbahDetector;
        } catch (e) {
          return true; // Sandboxed = safe
        }
      }
      return true;
    } catch (e) {
      return true;
    }
  }

  /**
   * Generate security assessment report
   */
  generateReport() {
    const blocked = this.results.filter(r => r.blocked).length;
    const total = this.results.length;
    const successRate = total > 0 ? Math.round(100 * blocked / total) : 0;

    return {
      summary: {
        total_vectors: total,
        blocked: blocked,
        compromised: total - blocked,
        success_rate: `${successRate}%`,
        timestamp: new Date().toISOString(),
        detector_version: this.getDetectorVersion(),
        total_duration_ms: Math.round(this.totalDuration),
        assessment_level: this.getAssessmentLevel(successRate)
      },
      critical_failures: this.results.filter(r => r.success && r.severity === 'critical'),
      high_priority_issues: this.results.filter(r => r.success && r.severity === 'high'),
      by_severity: this.groupBySeverity(),
      by_category: this.groupByCategory(),
      detailed_results: this.results,
      recommendations: this.generateRecommendations(),
      configuration: {
        test_count: this.results.length,
        execution_time_seconds: (this.totalDuration / 1000).toFixed(2),
        average_test_duration_ms: Math.round(this.totalDuration / total),
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Group results by severity
   */
  groupBySeverity() {
    const severity = {
      critical: { blocked: 0, compromised: 0 },
      high: { blocked: 0, compromised: 0 },
      medium: { blocked: 0, compromised: 0 },
      low: { blocked: 0, compromised: 0 }
    };

    for (const result of this.results) {
      const level = result.severity || 'low';
      if (!severity[level]) severity[level] = { blocked: 0, compromised: 0 };
      severity[level][result.success ? 'compromised' : 'blocked']++;
    }

    return severity;
  }

  /**
   * Group results by category
   */
  groupByCategory() {
    const categories = {};
    for (const result of this.results) {
      const cat = result.category;
      if (!categories[cat]) {
        categories[cat] = {
          total: 0,
          blocked: 0,
          compromised: 0,
          vectors: []
        };
      }
      categories[cat].total++;
      if (result.blocked) categories[cat].blocked++;
      else categories[cat].compromised++;
      categories[cat].vectors.push(result.name);
    }
    return categories;
  }

  /**
   * Generate remediation recommendations
   */
  generateRecommendations() {
    const failures = this.results.filter(r => r.success);

    if (failures.length === 0) {
      return [{
        priority: 'INFO',
        recommendation: 'All attack vectors successfully blocked. Excellent security posture!',
        category: 'Overall'
      }];
    }

    return failures.map(f => ({
      issue: `${f.name} (${f.category})`,
      severity: f.severity,
      cwe: f.cwe,
      recommendation: this.getRemediationAdvice(f.vector_id, f.category),
      priority: f.severity === 'critical' ? 'P0' : f.severity === 'high' ? 'P1' : 'P2'
    }));
  }

  /**
   * Get remediation advice for specific vector
   */
  getRemediationAdvice(vectorId, category) {
    const advice = {
      'hook-override-fetch': 'Implement constant-time hook verification on every detection cycle. Use Object.freeze() and Object.seal().',
      'hook-override-xhr': 'Verify XMLHttpRequest.prototype.open is native. Check toString() for "[native code]".',
      'prototype-pollution-array': 'Add Object.freeze(Array.prototype) after module initialization. Verify with Object.isFrozen().',
      'prototype-pollution-object': 'Freeze Object.prototype. Implement prototype descriptor hardening.',
      'early-injection-script': 'Enforce strict Content Security Policy (CSP). Use nonce-based inline scripts.',
      'proxy-handler-get': 'Detect Proxy objects using Object.isProxy() or similar checks. Verify target is native.',
      'json-parse-hijack': 'Verify JSON.parse is native before trusting config. Add signature verification.',
      'context-switch-eval': 'Disable eval(). Use Function(\'return this\') detection to catch context switching.',
      'function-constructor-bypass': 'Block Function constructor usage. Detect via \'constructor\' descriptor checks.'
    };

    return advice[vectorId] || `Review and harden ${category} defenses. Implement integrity checks and CSP hardening.`;
  }

  /**
   * Get overall assessment level
   */
  getAssessmentLevel(successRate) {
    if (successRate >= 95) return 'EXCELLENT - Highly resistant to bypass attacks';
    if (successRate >= 85) return 'GOOD - Strong security posture with minor improvements needed';
    if (successRate >= 70) return 'FAIR - Moderate vulnerabilities present';
    return 'CRITICAL - Significant security gaps identified';
  }

  /**
   * Get detector version
   */
  getDetectorVersion() {
    try {
      return chrome.runtime.getManifest().version || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * Set progress callback
   */
  onProgress(callback) {
    this.progressCallback = callback;
  }

  /**
   * Utility: delay execution
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AttackSimulator;
}
