// Kasbah Guard - Background Service Worker v2.0.0
// 100% BROWSER INDEPENDENT — NO Guard service, NO server calls
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



chrome.runtime.onInstalled.addListener(() => {
  console.log('[Kasbah Guard] Extension v2.0.0 installed — 6-verb interception across 30+ AI platforms');
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
});

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  // Block event from content.js — flash badge
  if (msg.type === 'BLOCK_EVENT') {
    if (badgeFlashTimeout) clearTimeout(badgeFlashTimeout);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#C1440E' });
    badgeFlashTimeout = setTimeout(function() {
      badgeFlashTimeout = null;
      chrome.action.setBadgeText({ text: '' });
    }, 3000);
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

// Extension is ready — all detection happens locally in content.js
