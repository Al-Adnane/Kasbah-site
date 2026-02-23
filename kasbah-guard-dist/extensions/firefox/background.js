// Kasbah Guard - Background Service Worker v1.1.0
const GUARD_URL = 'http://127.0.0.1:8788';
let healthFailCount = 0;

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

  if (healthFailCount >= 4) {
    // 4 consecutive failures (1 minute) = crash detected
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    return;
  }

  chrome.action.setBadgeText({ text: on ? '\u2713' : '\u2717' });
  chrome.action.setBadgeBackgroundColor({ color: on ? '#059669' : '#dc2626' });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Kasbah Guard] Extension v1.1.0 installed \u2014 5-verb interception active across 30+ AI platforms');
  updateBadge();
  chrome.storage.local.set({ guardEnabled: true, notifications: true, version: '1.1.0' });
});

chrome.runtime.onStartup.addListener(() => { updateBadge(); });
setInterval(updateBadge, 15000);

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
