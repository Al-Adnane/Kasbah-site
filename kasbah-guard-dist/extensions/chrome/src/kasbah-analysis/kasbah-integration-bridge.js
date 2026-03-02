/**
 * Kasbah Integration Bridge
 *
 * Orchestrates all 9 zchat1 modules into the browser extension pipeline.
 * Connects detector.js detection results to advanced analysis modules.
 *
 * Pipeline:
 *   detector.js (base detection)
 *     ↓
 *   zchat1 bridge (orchestration)
 *     ├→ Spatial Intelligence (geometry, physics, lighting, depth)
 *     ├→ Generator Attribution (15+ AI generators)
 *     ├→ Confidence Calibration (Brier score, per-domain)
 *     └→ Ethics Evaluation (Maqasid al-Shariah)
 *     ↓
 *   Enhanced verdict (base + all 4 analyses)
 *
 * Status: Production-Ready
 * Version: 1.0.0
 * Date: 2026-03-01
 */

'use strict';

class KasbahIntegrationBridge {
  constructor(config = {}) {
    this.apiBase = config.apiBase || 'https://api.bekasbah.com';
    this.authToken = config.authToken || '';
    this.timeout = config.timeout || 5000;
    this.enabled = config.enabled !== false;
    this.logTelemetry = config.logTelemetry !== false;

    // Initialize module availability flags
    this.modulesAvailable = {
      spatial: false,
      generator: false,
      calibration: false,
      ethics: false
    };

    // Cache for module responses
    this.cache = new Map();
    this.cacheExpiry = 60000; // 1 minute

    // Metrics
    this.metrics = {
      totalEnhancements: 0,
      successfulEnhancements: 0,
      failedEnhancements: 0,
      averageTime: 0,
      timings: []
    };

    this.init();
  }

  /**
   * Initialize the bridge
   */
  init() {
    console.log('[Kasbah] Integration bridge initializing');
    this.checkModuleAvailability();
  }

  /**
   * Check if zchat1 modules are available
   */
  async checkModuleAvailability() {
    try {
      const response = await this.fetch(`${this.apiBase}/api/zchat1/status`, {
        timeout: this.timeout
      });

      if (response.ok) {
        const data = await response.json();
        this.modulesAvailable = data.modules || this.modulesAvailable;
        console.log('[Kasbah] Modules available:', this.modulesAvailable);
      }
    } catch (error) {
      console.warn('[Kasbah] Unable to check module availability:', error);
    }
  }

  /**
   * Enhance detection result with all zchat1 modules
   *
   * @param {Object} content - Content being analyzed (image, video, audio, text)
   * @param {Object} baseDetectionResult - Base detection result from detector.js
   * @returns {Promise<Object>} Enhanced result with zchat1 analysis
   */
  async enhanceDetectionResult(content, baseDetectionResult) {
    if (!this.enabled) {
      return baseDetectionResult;
    }

    const startTime = performance.now();
    const cacheKey = `${content.hash || content.data?.substring(0, 32)}`;

    try {
      // Check cache first
      const cached = this.getCached(cacheKey);
      if (cached) {
        console.log('[Kasbah] Using cached enhancement');
        return cached;
      }

      const analyses = {
        spatial: null,
        generator: null,
        calibration: null,
        ethics: null,
        errors: []
      };

      // 1. Spatial Intelligence Analysis (for images/videos)
      if (this.shouldAnalyzeSpatial(content)) {
        try {
          analyses.spatial = await this.analyzeSpatial(content);
        } catch (error) {
          console.warn('[Kasbah] Spatial analysis failed:', error);
          analyses.errors.push({ module: 'spatial', error: error.message });
        }
      }

      // 2. Generator Attribution
      if (this.shouldIdentifyGenerator(content)) {
        try {
          analyses.generator = await this.identifyGenerator(content);
        } catch (error) {
          console.warn('[Kasbah] Generator identification failed:', error);
          analyses.errors.push({ module: 'generator', error: error.message });
        }
      }

      // 3. Confidence Calibration
      try {
        analyses.calibration = await this.calibrateConfidence(
          baseDetectionResult.confidence,
          this.getMediaType(content)
        );
      } catch (error) {
        console.warn('[Kasbah] Confidence calibration failed:', error);
        analyses.errors.push({ module: 'calibration', error: error.message });
      }

      // 4. Ethics Evaluation
      try {
        analyses.ethics = await this.evaluateEthics({
          ...baseDetectionResult,
          spatial: analyses.spatial,
          generator: analyses.generator,
          mediaType: this.getMediaType(content)
        });
      } catch (error) {
        console.warn('[Kasbah] Ethics evaluation failed:', error);
        analyses.errors.push({ module: 'ethics', error: error.message });
      }

      // Combine all analyses into enhanced result
      const enhanced = this.combineAnalyses(baseDetectionResult, analyses);

      // Log to API for federation learning
      if (this.logTelemetry) {
        this.logToAPI(enhanced).catch(e =>
          console.warn('[Kasbah] Telemetry logging failed:', e)
        );
      }

      // Cache the result
      this.setCached(cacheKey, enhanced);

      // Record metrics
      const elapsed = performance.now() - startTime;
      this.recordMetric(elapsed, true);

      console.log('[Kasbah] Enhancement complete in', elapsed.toFixed(2), 'ms');

      return enhanced;

    } catch (error) {
      console.error('[Kasbah] Enhancement failed:', error);
      const elapsed = performance.now() - startTime;
      this.recordMetric(elapsed, false);

      // Fallback: return base result without zchat1 enhancements
      return baseDetectionResult;
    }
  }

  /**
   * Spatial Intelligence Analysis
   * Validates geometry, physics, lighting, depth, permanence, world model
   */
  async analyzeSpatial(content) {
    const mediaType = this.getMediaType(content);

    if (!['image', 'video'].includes(mediaType)) {
      return null;
    }

    const response = await this.fetch(
      `${this.apiBase}/api/zchat1/spatial/analyze`,
      {
        method: 'POST',
        body: JSON.stringify({
          contentHash: content.hash,
          mediaType,
          size: content.size,
          duration: content.duration, // for video
          format: content.format
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Spatial analysis failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Generator Attribution
   * Identifies which AI generator created the content
   */
  async identifyGenerator(content) {
    const mediaType = this.getMediaType(content);

    const response = await this.fetch(
      `${this.apiBase}/api/zchat1/generator/identify`,
      {
        method: 'POST',
        body: JSON.stringify({
          contentHash: content.hash,
          mediaType,
          detectionScore: content.detectionScore || 0.5
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Generator identification failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Confidence Calibration
   * Applies domain-specific calibration using Brier scores
   */
  async calibrateConfidence(rawConfidence, domain = 'image') {
    const response = await this.fetch(
      `${this.apiBase}/api/zchat1/calibration/calibrate`,
      {
        method: 'POST',
        body: JSON.stringify({
          rawConfidence,
          domain
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Confidence calibration failed: ${response.status}`);
    }

    const data = await response.json();
    return data.calibrated_confidence || rawConfidence;
  }

  /**
   * Ethics Evaluation
   * Evaluates detection against Islamic ethical principles (Maqasid al-Shariah)
   */
  async evaluateEthics(detectionData) {
    const response = await this.fetch(
      `${this.apiBase}/api/zchat1/ethics/evaluate`,
      {
        method: 'POST',
        body: JSON.stringify({
          verdict: detectionData.verdict,
          confidence: detectionData.confidence,
          spatial: detectionData.spatial,
          generator: detectionData.generator,
          mediaType: detectionData.mediaType
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Ethics evaluation failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Combine all analyses into enhanced result
   */
  combineAnalyses(baseResult, analyses) {
    const enhanced = {
      ...baseResult,
      zchat1: {
        spatial: analyses.spatial,
        generator: analyses.generator,
        calibration: {
          raw: baseResult.confidence,
          calibrated: analyses.calibration
        },
        ethics: analyses.ethics,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      },
      // Update confidence with calibrated value
      confidence: analyses.calibration || baseResult.confidence,
      // Adjust verdict if ethics evaluation suggests
      verdict: this.adjustVerdict(baseResult.verdict, analyses.ethics)
    };

    if (analyses.errors.length > 0) {
      enhanced.zchat1.errors = analyses.errors;
    }

    return enhanced;
  }

  /**
   * Adjust final verdict based on ethics evaluation
   */
  adjustVerdict(baseVerdict, ethicsEval) {
    if (!ethicsEval || !ethicsEval.permissible) {
      // Don't change verdict for ethical reasons, but flag it
      return baseVerdict;
    }

    // In future, could use ethics scores to adjust confidence
    return baseVerdict;
  }

  /**
   * Helper: Determine if content should be analyzed spatially
   */
  shouldAnalyzeSpatial(content) {
    return this.modulesAvailable.spatial &&
           ['image', 'video'].includes(this.getMediaType(content));
  }

  /**
   * Helper: Determine if content should be analyzed for generator
   */
  shouldIdentifyGenerator(content) {
    return this.modulesAvailable.generator &&
           ['image', 'video', 'audio'].includes(this.getMediaType(content));
  }

  /**
   * Helper: Get media type from content
   */
  getMediaType(content) {
    if (content.type) {
      if (content.type.includes('image')) return 'image';
      if (content.type.includes('video')) return 'video';
      if (content.type.includes('audio')) return 'audio';
    }
    if (content.mediaType) return content.mediaType;
    return 'unknown';
  }

  /**
   * Log enhancement to API for federation learning
   */
  async logToAPI(result) {
    try {
      await this.fetch(`${this.apiBase}/api/zchat1/telemetry`, {
        method: 'POST',
        body: JSON.stringify({
          result,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      // Silent fail - don't break extension
      console.warn('[Kasbah] Telemetry logging failed:', error);
    }
  }

  /**
   * HTTP fetch with timeout
   */
  fetch(url, options = {}) {
    return Promise.race([
      fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
        },
        ...options
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), options.timeout || this.timeout)
      )
    ]);
  }

  /**
   * Caching helpers
   */
  getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  setCached(key, value) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.cacheExpiry
    });

    // Limit cache size
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Metrics recording
   */
  recordMetric(elapsed, success) {
    this.metrics.totalEnhancements++;
    this.metrics.timings.push(elapsed);

    if (success) {
      this.metrics.successfulEnhancements++;
    } else {
      this.metrics.failedEnhancements++;
    }

    // Keep only last 100 timings
    if (this.metrics.timings.length > 100) {
      this.metrics.timings.shift();
    }

    // Calculate average
    this.metrics.averageTime =
      this.metrics.timings.reduce((a, b) => a + b, 0) / this.metrics.timings.length;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalEnhancements > 0
        ? (this.metrics.successfulEnhancements / this.metrics.totalEnhancements * 100).toFixed(1) + '%'
        : 'N/A'
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalEnhancements: 0,
      successfulEnhancements: 0,
      failedEnhancements: 0,
      averageTime: 0,
      timings: []
    };
  }

  /**
   * Disable/enable bridge
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log('[Kasbah]', enabled ? 'Enabled' : 'Disabled');
  }
}

// Export as singleton
const kasbahBridge = new KasbahIntegrationBridge({
  apiBase: 'https://api.bekasbah.com',
  logTelemetry: true,
  enabled: true
});

// Make available to extension
if (typeof window !== 'undefined') {
  window.kasbahBridge = kasbahBridge;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = kasbahBridge;
}
