// Kasbah Guard - Background Service Worker
const GUARD_URL = 'http://127.0.0.1:8788';

async function checkGuardStatus() {
  try {
    const r = await fetch(`${GUARD_URL}/status`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    const d = await r.json();
    return d.ok === true;
  } catch { return false; }
}

async function updateBadge() {
  const on = await checkGuardStatus();
  chrome.action.setBadgeText({ text: on ? '✓' : '✗' });
  chrome.action.setBadgeBackgroundColor({ color: on ? '#059669' : '#dc2626' });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Kasbah Guard] Extension installed');
  updateBadge();
  chrome.storage.local.set({ guardEnabled: true, notifications: true });
});

chrome.runtime.onStartup.addListener(() => { updateBadge(); });
setInterval(updateBadge, 15000);

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.type === 'CHECK_STATUS') {
    checkGuardStatus().then(ok => respond({ online: ok }));
    return true;
  }
  if (msg.type === 'LOG_EVENT') {
    fetch(`${GUARD_URL}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg.data) }).catch(() => {});
  }
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.url) {
    if (tab.url.includes('chatgpt.com') || tab.url.includes('openai.com') || tab.url.includes('claude.ai')) {
      updateBadge();
    }
  }
});
