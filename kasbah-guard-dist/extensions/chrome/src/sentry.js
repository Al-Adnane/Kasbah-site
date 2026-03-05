/**
 * Kasbah Guard — Production Error Tracking (Sentry)
 * 
 * Install: npm install @sentry/browser
 * 
 * Usage:
 *   import { initSentry, captureError, captureMessage } from './sentry.js';
 *   initSentry();
 *   captureError(error);
 */

const SENTRY_DSN = 'https://YOUR_DSN_HERE@o0.ingest.sentry.io/0';
const EXTENSION_VERSION = '1.0.0';

let sentryInitialized = false;

/**
 * Initialize Sentry error tracking
 */
export async function initSentry() {
  if (sentryInitialized) return;
  
  try {
    // Load Sentry dynamically (don't bundle)
    const Sentry = await import('@sentry/browser');
    
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: 'production',
      release: `kasbah-extension@${EXTENSION_VERSION}`,
      
      // Only capture errors in production
      beforeSend(event, hint) {
        // Don't capture in development
        if (chrome.runtime.getManifest().version_name === 'dev') {
          return null;
        }
        
        // Filter out known benign errors
        if (event.exception) {
          const error = event.exception.values?.[0];
          if (error?.type === 'TypeError' && error?.value?.includes('NetworkError')) {
            return null; // Network errors are common, not actionable
          }
        }
        
        return event;
      },
      
      // Sample rate (100% for errors, 0% for transactions)
      tracesSampleRate: 0.0,
      sampleRate: 1.0,
      
      // Add context
      integrations: [
        Sentry.browserTracingIntegration(),
      ],
    });
    
    sentryInitialized = true;
    console.log('[Kasbah] Sentry initialized');
  } catch (error) {
    // Sentry failed to load, continue without it
    console.warn('[Kasbah] Sentry failed to load:', error.message);
  }
}

/**
 * Capture an error
 * @param {Error} error - Error to capture
 * @param {Object} context - Additional context
 */
export function captureError(error, context = {}) {
  if (!sentryInitialized) {
    // Fallback: log to console
    console.error('[Kasbah Error]', error, context);
    return;
  }
  
  try {
    const Sentry = require('@sentry/browser');
    
    Sentry.captureException(error, {
      extra: {
        extensionVersion: EXTENSION_VERSION,
        ...context,
      },
    });
  } catch (e) {
    console.error('[Kasbah] Failed to capture error:', e);
  }
}

/**
 * Capture a message (for logging)
 * @param {string} message - Message to capture
 * @param {string} level - Level: 'info', 'warning', 'error'
 */
export function captureMessage(message, level = 'info') {
  if (!sentryInitialized) return;
  
  try {
    const Sentry = require('@sentry/browser');
    Sentry.captureMessage(message, level);
  } catch (e) {
    console.error('[Kasbah] Failed to capture message:', e);
  }
}

/**
 * Set user context for error tracking
 * @param {string} userId - Anonymous user ID
 */
export function setUserContext(userId) {
  if (!sentryInitialized) return;
  
  try {
    const Sentry = require('@sentry/browser');
    Sentry.setUser({ id: userId });
  } catch (e) {
    console.error('[Kasbah] Failed to set user context:', e);
  }
}

/**
 * Add breadcrumb (for debugging)
 * @param {string} message - Breadcrumb message
 * @param {Object} data - Additional data
 */
export function addBreadcrumb(message, data = {}) {
  if (!sentryInitialized) return;
  
  try {
    const Sentry = require('@sentry/browser');
    Sentry.addBreadcrumb({
      message,
      data,
      level: 'info',
    });
  } catch (e) {
    console.error('[Kasbah] Failed to add breadcrumb:', e);
  }
}

// Auto-initialize on load
initSentry();
