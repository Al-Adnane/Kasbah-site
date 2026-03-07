/**
 * Kasbah Guard — Production Monitoring
 * 
 * Tracks extension health, performance, and usage.
 * Opt-in telemetry only (privacy-first).
 */

const TELEMETRY_ENDPOINT = 'https://api.bekasbah.com/api/telemetry';
const REPORT_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

let telemetryEnabled = false;
let lastReport = 0;

/**
 * Initialize monitoring
 */
export async function initMonitoring() {
  // Check if user opted in
  const config = await chrome.storage.local.get(['telemetryEnabled']);
  telemetryEnabled = config.telemetryEnabled === true; // Default false — opt-in required
  
  // Start performance observer
  startPerformanceObserver();
  
  // Start error tracking
  startErrorTracking();
  
  // Schedule daily reports
  setInterval(() => {
    if (telemetryEnabled) {
      sendDailyReport();
    }
  }, REPORT_INTERVAL);
  
  console.log('[Kasbah] Monitoring initialized, telemetry:', telemetryEnabled);
}

/**
 * Track detection event
 * @param {Object} detection - Detection result
 */
export function trackDetection(detection) {
  if (!telemetryEnabled) return;
  
  const data = {
    type: 'detection',
    timestamp: Date.now(),
    risk: detection.risk,
    decision: detection.decision,
    patternType: detection.patternType,
    latencyMs: detection.latencyMs,
  };
  
  storeMetric('detections', data);
}

/**
 * Track error
 * @param {Error} error - Error object
 * @param {string} context - Where error occurred
 */
export function trackError(error, context) {
  const data = {
    type: 'error',
    timestamp: Date.now(),
    context,
    message: error.message,
    stack: error.stack,
  };
  
  storeMetric('errors', data);
  
  // Also send immediately for critical errors
  if (context.includes('critical')) {
    sendMetric(data);
  }
}

/**
 * Track performance
 * @param {string} operation - Operation name
 * @param {number} durationMs - Duration in ms
 */
export function trackPerformance(operation, durationMs) {
  if (!telemetryEnabled) return;
  
  const data = {
    type: 'performance',
    timestamp: Date.now(),
    operation,
    durationMs,
  };
  
  storeMetric('performance', data);
}

/**
 * Store metric locally (batch for daily report)
 */
let metricsBuffer = {
  detections: [],
  errors: [],
  performance: [],
};

function storeMetric(category, data) {
  metricsBuffer[category].push(data);
  
  // Keep last 1000 per category
  if (metricsBuffer[category].length > 1000) {
    metricsBuffer[category].shift();
  }
}

/**
 * Send daily telemetry report
 */
async function sendDailyReport() {
  const report = {
    extensionVersion: chrome.runtime.getManifest().version,
    browser: navigator.userAgent,
    timestamp: Date.now(),
    metrics: metricsBuffer,
  };
  
  try {
    await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    
    // Clear buffer after successful send
    metricsBuffer = { detections: [], errors: [], performance: [] };
    lastReport = Date.now();
  } catch (error) {
    console.warn('[Kasbah] Failed to send telemetry:', error);
  }
}

/**
 * Send single metric (for critical errors)
 */
async function sendMetric(data) {
  try {
    await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extensionVersion: chrome.runtime.getManifest().version,
        browser: navigator.userAgent,
        timestamp: Date.now(),
        metrics: { critical: [data] },
      }),
    });
  } catch (error) {
    // Silent fail for telemetry
  }
}

/**
 * Performance observer
 */
function startPerformanceObserver() {
  if (typeof PerformanceObserver === 'undefined') return;
  
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 100) { // Only track slow operations
          trackPerformance(entry.name, entry.duration);
        }
      }
    });
    
    observer.observe({ entryTypes: ['measure', 'function', 'resource'] });
  } catch (error) {
    // Performance observer not supported
  }
}

/**
 * Error tracking
 */
function startErrorTracking() {
  // Global error handler
  window.addEventListener('error', (event) => {
    trackError(event.error, `global:${event.filename}:${event.lineno}`);
  });
  
  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    trackError(event.reason, 'unhandledrejection');
  });
}

/**
 * Get extension health status
 */
export async function getHealthStatus() {
  const now = Date.now();
  
  return {
    status: 'healthy',
    uptime: now - lastReport,
    errorCount: metricsBuffer.errors.length,
    detectionCount: metricsBuffer.detections.length,
    telemetryEnabled,
  };
}

/**
 * Toggle telemetry
 * @param {boolean} enabled - Enable/disable telemetry
 */
export async function setTelemetryEnabled(enabled) {
  await chrome.storage.local.set({ telemetryEnabled: enabled });
  telemetryEnabled = enabled;
  console.log('[Kasbah] Telemetry:', enabled ? 'enabled' : 'disabled');
}

// Auto-initialize
initMonitoring();
