// Kasbah Guard - Background Service Worker v2.0.0
const GUARD_URL = 'http://127.0.0.1:8788';
let healthFailCount = 0;
let badgeFlashTimeout = null;

// ── Sentry Error Tracking (v2.0.0) ────────────────────────────────────────
// Privacy-first error tracking: no URLs, no user data, no secrets
const SENTRY_ENDPOINT = 'https://api.bekasbah.com/api/sentry';
const SENTRY_ENABLED = typeof fetch !== 'undefined';

function sendSentryError(type, message, stack, context = {}) {
  if (!SENTRY_ENABLED) return;

  // Privacy-first: strip sensitive data
  const sanitizedMessage = message.toString()
    .replace(/http[s]?:\/\/[^\s]+/g, '[URL]')
    .replace(/\d{3}-\d{2}-\d{4}/g, '[SSN]')
    .replace(/4[0-9]{12}(?:[0-9]{3})?/g, '[CC]');

  const event = {
    type,
    message: sanitizedMessage,
    stack: stack ? stack.toString().split('\n').slice(0, 5).join('\n') : '',
    context: {
      extensionVersion: '2.0.0',
      browser: 'chrome',
      timestamp: new Date().toISOString(),
      ...context
    }
  };

  fetch(SENTRY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  }).catch(() => {}); // Silent fail - don't break extension on network error
}

// Global error handler
self.addEventListener('error', (event) => {
  sendSentryError('extension_error', event.message, event.filename + ':' + event.lineno, {
    errorType: 'uncaughtError'
  });
});

// Promise rejection handler
self.addEventListener('unhandledrejection', (event) => {
  sendSentryError('unhandled_rejection', event.reason, '', {
    errorType: 'rejectionError'
  });
});

async function checkGuardStatus() {
  try {
    const start = performance.now();
    const r = await fetch(`${GUARD_URL}/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 3000  // 3 second timeout instead of hanging
    });
    const latency = performance.now() - start;

    // Track slow Guard service
    if (latency > 5000) {
      sendSentryError('guard_timeout', `Guard status check took ${latency.toFixed(0)}ms`, '', {
        latency: Math.round(latency),
        errorType: 'slowResponse'
      });
    }

    const d = await r.json();
    healthFailCount = 0;  // Reset on success
    return d;
  } catch (error) {
    healthFailCount++;

    // Only report after 12 failures (2 minutes of being offline)
    // Grace period prevents spam when Guard starts up slowly
    if (healthFailCount === 12) {
      sendSentryError('guard_offline', `Guard service unavailable - entering offline mode`, error.stack, {
        healthFailCount,
        errorType: 'guardOffline'
      });
    }

    // Return a safe default state (online with local-only mode)
    // This allows extension to work even if Guard is not running
    return {
      ok: true,
      mode: 'offline',
      stats: { total: 0, allowed: 0, denied: 0 },
      classifier_type: 'local_detection_only'
    };
  }
}

async function updateBadge() {
  const data = await checkGuardStatus();
  const on = data && data.ok === true;
  const offline = data && data.mode === 'offline';

  // Don't override flash badge
  if (badgeFlashTimeout) return;

  if (healthFailCount >= 50) {
    // Only show error after 50 failures (8+ minutes of being offline)
    chrome.action.setBadgeText({ text: '✗' });
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    return;
  }

  // Show status based on Guard connection
  if (offline) {
    // Guard offline but extension still protecting locally
    chrome.action.setBadgeText({ text: '○' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  } else if (on) {
    // Guard online and connected
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#059669' });
  } else {
    // Attempting to connect
    chrome.action.setBadgeText({ text: '?' });
    chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
  }
}

// Flash badge red with "!" for 3s on block events, then reset
function flashBadge() {
  if (badgeFlashTimeout) clearTimeout(badgeFlashTimeout);
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#C1440E' });
  badgeFlashTimeout = setTimeout(function() {
    badgeFlashTimeout = null;
    updateBadge();
  }, 3000);
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Kasbah Guard] Extension v2.0.0 installed — 6-verb interception across 30+ AI platforms');
  updateBadge();
  chrome.storage.local.set({ guardEnabled: true, notifications: true, version: '2.0.0' });
});

// ── Suspend / Startup handlers (adversarial race fix) ──────────────────────
// Saves pending state before service worker suspends so nothing is lost
// across an extension disable/update/browser-restart race.
chrome.runtime.onSuspend.addListener(() => {
  chrome.storage.local.set({
    lastSuspend: Date.now(),
    guardEnabled: true  // Preserve enabled state across suspend
  });
  console.log('[Kasbah Guard] Service worker suspending — state saved');
});

chrome.runtime.onStartup.addListener(() => {
  // Restore state after browser restart / extension re-enable
  chrome.storage.local.get(['lastSuspend', 'guardEnabled'], (data) => {
    if (data.lastSuspend) {
      const gapMs = Date.now() - data.lastSuspend;
      console.log(`[Kasbah Guard] Resumed after ${Math.round(gapMs/1000)}s gap`);
    }
    // Re-enable guard if it was active before suspension
    if (data.guardEnabled !== false) {
      chrome.storage.local.set({ guardEnabled: true });
    }
  });
  updateBadge();
});

setInterval(updateBadge, 10000); // 10s (was 15s)

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.type === 'CHECK_STATUS') {
    checkGuardStatus().then(data => respond({ online: data && data.ok, data: data }));
    return true;
  }
  if (msg.type === 'LOG_EVENT') {
    fetch(`${GUARD_URL}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg.data) }).catch(() => {});
  }
  if (msg.type === 'GET_STATS') {
    checkGuardStatus().then(data => {
      respond({ stats: data && data.stats ? data.stats : null });
    });
    return true;
  }
  // Block event from content.js — flash badge
  if (msg.type === 'BLOCK_EVENT') {
    flashBadge();
  }
  return true;
});

// All 30+ supported AI platforms
const AI_DOMAINS = [
  'chatgpt.com', 'openai.com', 'claude.ai', 'gemini.google.com', 'aistudio.google.com',
  'perplexity.ai', 'poe.com', 'deepseek.com', 'grok.x.ai', 'copilot.microsoft.com',
  'huggingface.co', 'you.com', 'pi.ai', 'chat.mistral.ai', 'manus.im',
  'cursor.com', 'windsurf.com', 'codeium.com', 'notebooklm.google.com', 'labs.google.com',
  'meta.ai', 'coral.cohere.com', 'chat.lmsys.org', 'open-assistant.io',
  'bard.google.com', 'chat.openai.com', 'bing.com', 'duckduckgo.com'
];

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.url) {
    const isAI = AI_DOMAINS.some(d => tab.url.includes(d));
    if (isAI) {
      updateBadge();
    }
  }
});
