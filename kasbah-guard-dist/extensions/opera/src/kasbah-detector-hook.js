/**
 * Detector Hook for Kasbah Integration
 *
 * Wraps the base detector.js classify() function and enriches results
 * with all kasbah analyses (spatial, generator, calibration, ethics).
 *
 * This file should be loaded AFTER detector.js and BEFORE content.js
 *
 * Status: Production-Ready
 * Version: 1.0.0
 */

'use strict';

// Store original classify function
const originalClassify = window.classify || (typeof classify !== 'undefined' ? classify : null);

if (!originalClassify) {
  console.warn('[Kasbah] Original classify() not found. Kasbah integration disabled.');
} else {
  /**
   * Enhanced classify wrapper that calls kasbah bridge
   */
  window.classifyWithKasbah = async function(text, content = {}) {
    // Get base detection result from original classifier
    const baseResult = originalClassify(text);

    // If kasbah bridge not available, return base result
    if (!window.kasbahBridge) {
      return baseResult;
    }

    // Enhance with kasbah analyses
    try {
      const enhanced = await window.kasbahBridge.enhanceDetectionResult(
        {
          type: content.type || 'text/plain',
          mediaType: content.mediaType || 'text',
          data: text,
          hash: content.hash || baseResult.content_hash,
          size: text.length
        },
        baseResult
      );

      return enhanced;
    } catch (error) {
      console.error('[Kasbah] Enhancement failed, returning base result:', error);
      return baseResult;
    }
  };

  /**
   * Optional: Replace the original classify with kasbah version
   * (Enable only if you want all classifications to be enhanced)
   *
   * Uncomment below to enable:
   */
  // window.classify = window.classifyWithKasbah;

  /**
   * Helper: Get enhancement status
   */
  window.getKasbahStatus = function() {
    if (!window.kasbahBridge) {
      return { enabled: false, reason: 'Bridge not loaded' };
    }

    return {
      enabled: window.kasbahBridge.enabled,
      modules: window.kasbahBridge.modulesAvailable,
      metrics: window.kasbahBridge.getMetrics(),
      version: '1.0.0'
    };
  };

  /**
   * Helper: Disable kasbah (useful for troubleshooting)
   */
  window.disableKasbah = function() {
    if (window.kasbahBridge) {
      window.kasbahBridge.setEnabled(false);
      console.log('[Kasbah] Disabled');
    }
  };

  /**
   * Helper: Enable kasbah
   */
  window.enableKasbah = function() {
    if (window.kasbahBridge) {
      window.kasbahBridge.setEnabled(true);
      console.log('[Kasbah] Enabled');
    }
  };

  /**
   * Helper: Reset metrics
   */
  window.resetKasbahMetrics = function() {
    if (window.kasbahBridge) {
      window.kasbahBridge.resetMetrics();
      console.log('[Kasbah] Metrics reset');
    }
  };

  console.log('[Kasbah] Detector hook loaded. Use classifyWithKasbah(text) for enhanced detection.');
}
