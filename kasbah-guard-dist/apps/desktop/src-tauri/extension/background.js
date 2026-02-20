// Kasbah Guard - Background Service Worker (MV3) - CLEAN
const GUARD_URL = "http://127.0.0.1:8789";

async function checkGuardStatus() {
  try {
    const r = await fetch(`${GUARD_URL}/v2/health`, { method: "GET" });
    const t = await r.text();
    return { ok: (t || "").trim() === "ok" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function updateBadge() {
  const data = await checkGuardStatus();
  const on = data && data.ok === true;
  try {
    chrome.action.setBadgeText({ text: on ? "✓" : "✗" });
    chrome.action.setBadgeBackgroundColor({ color: on ? "#059669" : "#dc2626" });
  } catch (_) {}
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Kasbah Guard] installed");
  chrome.storage.local.set({ guardEnabled: true, notifications: true, version: "0.3.0" });
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

setInterval(updateBadge, 15000);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try { console.log("KASBAH_BG_MSG", msg && msg.type); } catch (_) {}

  if (!msg || !msg.type) {
    sendResponse({ ok: false, error: "missing_type" });
    return false;
  }

  if (msg.type === "V2_HEALTH") {
    fetch(`${GUARD_URL}/v2/health`, { method: "GET" })
      .then(r => r.text())
      .then(t => sendResponse({ ok: (t || "").trim() === "ok" }))
      .catch(e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "V2_EVALUATE") {
    fetch(`${GUARD_URL}/v2/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.body || {})
    })
      .then(r => r.json())
      .then(d => sendResponse({ ok: true, data: d }))
      .catch(e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "V2_CONSUME") {
    fetch(`${GUARD_URL}/v2/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.body || {})
    })
      .then(r => r.json())
      .then(d => sendResponse({ ok: true, data: d }))
      .catch(e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "CHECK_STATUS") {
    checkGuardStatus().then(d => sendResponse({ online: d && d.ok === true, data: d }));
    return true;
  }

  sendResponse({ ok: false, error: "unknown_message" });
  return false;
});
