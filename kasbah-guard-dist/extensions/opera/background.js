// Kasbah Guard - Background Service Worker v2.0.0
const GUARD_URL = 'http://127.0.0.1:8788';
let healthFailCount = 0;
let badgeFlashTimeout = null;

async function checkGuardStatus() {
  try {
    const r = await fetch(`${GUARD_URL}/status`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    const d = await r.json();
    healthFailCount = 0;
    return d;
  } catch {
    healthFailCount++;
    return null;
  }
}

async function updateBadge() {
  const data = await checkGuardStatus();
  const on = data && data.ok === true;

  // Don't override flash badge
  if (badgeFlashTimeout) return;

  if (healthFailCount >= 4) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    return;
  }

  chrome.action.setBadgeText({ text: on ? '\u2713' : '\u2717' });
  chrome.action.setBadgeBackgroundColor({ color: on ? '#059669' : '#dc2626' });
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

chrome.runtime.onStartup.addListener(() => { updateBadge(); });
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
