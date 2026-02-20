
try { console.log("KASBAH_TRACE: content.js running on", location.href); } catch(e) {}

try {
  setInterval(function () {
    try {
      chrome.runtime.sendMessage({ type: "V2_HEALTH" }, function (res) {
        try { console.log("KASBAH_TRACE: V2_HEALTH reply", res); } catch(e) {}
      });
    } catch (e) {
      try { console.log("KASBAH_TRACE: sendMessage failed", String(e)); } catch(_) {}
    }
  }, 5000);
} catch(e) {}


try {
  chrome.runtime.sendMessage({ type: "V2_HEALTH" }, function (res) {
    try { console.log("KASBAH_PING_HEALTH", res); } catch(e) {}
  });
} catch (e) {
  try { console.log("KASBAH_PING_FAIL", String(e)); } catch(_) {}
}

function postJson(url, body) {
  return new Promise(function (resolve, reject) {
    try {
      if (url.indexOf("/v2/evaluate") !== -1) {
        chrome.runtime.sendMessage({ type: "V2_EVALUATE", body: body }, function (res) {
          if (!res || res.ok !== true) return reject(res && res.error ? res.error : "bridge_failed");
          resolve(res.data);
        });
        return;
      }
      if (url.indexOf("/v2/consume") !== -1) {
        chrome.runtime.sendMessage({ type: "V2_CONSUME", body: body }, function (res) {
          if (!res || res.ok !== true) return reject(res && res.error ? res.error : "bridge_failed");
          resolve(res.data);
        });
        return;
      }
      reject("unsupported_url");
    } catch (e) { reject(String(e)); }
  });
}



try { window.__KASBAH_LOADED = true; console.log("KASBAH_CONTENT_LOADED", location.href); } catch (e) {}

try {
  document.documentElement.setAttribute("data-kasbah-loaded", "1");
  document.documentElement.setAttribute("data-kasbah-ver", "0.3.0");
  console.log("KASBAH_DOM_MARKER_SET");
} catch (e) {}

/**
 * Kasbah Guard — Sovereign Intent Layer (Extension v0.3.0)
 * Intercepts 5 irreversible verbs before AI sees them:
 *   1. SEND — Send button click interception
 *   2. PASTE — Clipboard paste interception
 *   3. UPLOAD — File input / drag-drop interception
 *   4. BROWSE — URL detection in messages
 *   5. DOWNLOAD — Download link click interception
 *
 * Flow per verb:
 *   Intercept → local secret scan → POST /decide → modal → POST /consume → allow/deny
 *   If guard unreachable → default DENY
 */
(function () {
  "use strict";

  try {
    window.__kasbahDebug = {
      health: function(cb){ try{ chrome.runtime.sendMessage({type:"V2_HEALTH"}, cb); } catch(e){ cb({ok:false,error:String(e)}); } },
      eval: function(body, cb){ try{ chrome.runtime.sendMessage({type:"V2_EVALUATE", body: body}, cb); } catch(e){ cb({ok:false,error:String(e)}); } },
      consume: function(body, cb){ try{ chrome.runtime.sendMessage({type:"V2_CONSUME", body: body}, cb); } catch(e){ cb({ok:false,error:String(e)}); } }
    };
    console.log("KASBAH_DEBUG_READY");
  } catch(e) {}


  var GUARD = "http://127.0.0.1:8789";


function __kasbah_is_send(btn) {
  if (!btn) return false;
  try {
    var t = (btn.textContent || "").trim().toLowerCase();
    var al = (btn.getAttribute("aria-label") || "").trim().toLowerCase();
    var dt = (btn.getAttribute("data-testid") || "").trim().toLowerCase();
    var ty = (btn.getAttribute("type") || "").trim().toLowerCase();
    if (ty === "submit") return true;
    if (dt.indexOf("send") !== -1 || dt.indexOf("submit") !== -1) return true;
    if (al.indexOf("send") !== -1 || al.indexOf("submit") !== -1) return true;
    if (t === "send" || t === "submit") return true;
  } catch (e) {}
  return false;
}


function __kasbah_v2_fix(dp, fallbackVerb) {
  dp = dp || {};
  if (!dp.verb) dp.verb = (fallbackVerb || "paste");
  if (!dp.scope) dp.scope = "llm";
  if (!dp.mode) dp.mode = "strict";
  if (typeof dp.text !== "string") dp.text = "";
  return dp;
}

function v2Evaluate(verb, text, extra) {
  var body = Object.assign({ verb: verb, text: text, scope: "llm", mode: "strict" }, (extra || {}));
  return postJson(GUARD + "/v2/evaluate", body);
}
function v2Consume(ticket, payload_hash) {
  var body = { ticket: ticket };
  if (payload_hash) body.payload_hash = payload_hash;
  return postJson(GUARD + "/v2/consume", body);
}

  var FLAG_KEY = "__kasbah_allow__";
  var PASTE_FLAG = "__kasbah_paste_ok__";

  // ── Secret detection (runs in-browser for instant feedback) ──
  var PATTERNS = [
    { name: "API Key",        rx: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i },
    { name: "OpenAI Key",     rx: /sk-[A-Za-z0-9]{20,}/ },
    { name: "AWS Key",        rx: /AKIA[0-9A-Z]{16}/ },
    { name: "Private Key",    rx: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
    { name: "Password",       rx: /(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{6,}/i },
    { name: "Token",          rx: /(?:token|bearer|auth)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{20,}/i },
    { name: "Connection String", rx: /(?:mongodb|postgres|mysql|redis):\/\/[^\s]{10,}/i },
    { name: "GitHub Token",   rx: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
    { name: "Slack Token",    rx: /xox[bprs]-[A-Za-z0-9\-]{10,}/ },
    { name: "SSH Key",        rx: /-----BEGIN OPENSSH PRIVATE KEY-----/ },
  ];

  function scanSecrets(text) {
    var found = [];
    for (var i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i].rx.test(text)) {
        found.push(PATTERNS[i].name);
      }
    }
    return found;
  }

  function riskScore(text, secrets) {
    var score = 10;
    if (secrets.length > 0) score += 75;
    if (text.length > 2500) score += 15;
    if (text.length > 5000) score += 10;
    return Math.min(score, 100);
  }

  function riskLabel(score) {
    if (score >= 85) return "high";
    if (score >= 50) return "medium";
    return "low";
  }

  // ── URL detection ──
  var URL_RX = /https?:\/\/[^\s<>"')\]}{]{8,}/gi;
  function extractUrls(text) {
    return (text.match(URL_RX) || []);
  }

  // ── Toast notification helper ──
  function showToast(message, isError) {
    var toast = document.createElement("div");
    toast.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483646;padding:12px 18px;border-radius:12px;font:13px/1.4 system-ui;box-shadow:0 4px 12px rgba(0,0,0,.2);max-width:360px;" +
      (isError ? "background:#dc2626;color:#fff" : "background:#18181b;color:#fff");
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 4000);
  }

  // ── Helpers ──
  function host() { return location.hostname; }

  function product() {
    var h = host();
    if (h.indexOf("chatgpt") !== -1 || h.indexOf("openai") !== -1) return "chatgpt";
    if (h.indexOf("claude") !== -1) return "claude";
    return "web";
  }

  function findComposerText() {
    var ce = document.querySelector('[contenteditable="true"]');
    if (ce) {
      var t = (ce.innerText || ce.textContent || "").trim();
      if (t) return t.slice(0, 6000);
    }
    var ta = document.querySelector("textarea");
    if (ta && ta.value) return ta.value.slice(0, 6000);
    var pm = document.querySelector(".ProseMirror");
    if (pm) {
      var pt = (pm.innerText || pm.textContent || "").trim();
      if (pt) return pt.slice(0, 6000);
    }
    return "";
  }

  function isSendButton(btn) {
    if (!btn) return false;
    var a = (btn.getAttribute("aria-label") || "").toLowerCase();
    var t = (btn.getAttribute("title") || "").toLowerCase();
    var txt = (btn.innerText || "").toLowerCase().trim();
    var did = (btn.getAttribute("data-testid") || "").toLowerCase();
    var tag = btn.tagName.toLowerCase();
    var clickable = tag === "button" || (tag === "div" && btn.getAttribute("role") === "button");
    if (!clickable) return false;
    return (
      a.indexOf("send") !== -1 ||
      t.indexOf("send") !== -1 ||
      txt === "send" || txt === "send message" ||
      did.indexOf("send") !== -1 ||
      a.indexOf("submit") !== -1 ||
      t.indexOf("submit") !== -1
    );
  }

  function postJson(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.text().then(function (t) {
        var j;
        try { j = JSON.parse(t); } catch (e) { j = { raw: t }; }
        if (!r.ok) throw new Error("HTTP " + r.status + ": " + t);
        return j;
      });
    });
  }

  // ── Modal UI ──
  function createModal(opts) {
    var risk = opts.risk || "low";
    var secrets = opts.secrets || [];
    var preview = opts.preview || "";
    var verb = opts.verb || "send";
    var onAllow = opts.onAllow;
    var onBlock = opts.onBlock;

    var colors = {
      high:   { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", badge: "#dc2626" },
      medium: { bg: "#fffbeb", border: "#fde68a", text: "#92400e", badge: "#d97706" },
      low:    { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", badge: "#16a34a" },
    };
    var c = colors[risk] || colors.low;

    var verbLabels = {
      send: "Sending message",
      paste: "Pasting content",
      upload: "Uploading file",
      browse: "Sharing URL",
      edit: "Applying edit",
      download: "Downloading file"
    };

    var overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;backdrop-filter:blur(2px)";

    var card = document.createElement("div");
    card.style.cssText = "width:min(480px,94vw);background:#fafaf9;border:1px solid #e4e4e7;border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.18);overflow:hidden";

    // Header
    var header = document.createElement("div");
    header.style.cssText = "padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e4e4e7";
    var brand = document.createElement("div");
    brand.style.cssText = "display:flex;align-items:center;gap:8px";
    var mark = document.createElement("div");
    mark.style.cssText = "width:22px;height:22px;border-radius:6px;background:#18181b;display:grid;place-items:center";
    var markI = document.createElement("div");
    markI.style.cssText = "width:10px;height:10px;border-radius:3px;background:#fafaf9";
    mark.appendChild(markI);
    var bname = document.createElement("span");
    bname.style.cssText = "font-weight:800;font-size:13px;color:#18181b";
    bname.textContent = "Kasbah Guard";
    brand.appendChild(mark);
    brand.appendChild(bname);

    // Verb tag
    var verbTag = document.createElement("span");
    verbTag.style.cssText = "font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;background:#f4f4f5;color:#52525b;margin-left:8px;text-transform:uppercase";
    verbTag.textContent = verb;
    brand.appendChild(verbTag);

    var badge = document.createElement("span");
    badge.style.cssText = "font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;color:#fff;background:" + c.badge;
    badge.textContent = risk === "high" ? "High risk" : risk === "medium" ? "Review" : "Low risk";
    header.appendChild(brand);
    header.appendChild(badge);

    // Body
    var body = document.createElement("div");
    body.style.cssText = "padding:16px";

    // Alert
    if (secrets.length > 0 || risk !== "low") {
      var alert = document.createElement("div");
      alert.style.cssText = "background:" + c.bg + ";border:1px solid " + c.border + ";border-radius:10px;padding:12px;margin-bottom:12px";
      var alertTitle = document.createElement("div");
      alertTitle.style.cssText = "font-size:13px;font-weight:800;color:" + c.text + ";margin-bottom:3px";
      alertTitle.textContent = secrets.length > 0 ? "This looks sensitive" : "Review required";
      var alertDesc = document.createElement("div");
      alertDesc.style.cssText = "font-size:12px;color:" + c.text + ";line-height:1.45";
      alertDesc.textContent = secrets.length > 0
        ? "Detected: " + secrets.join(", ") + ". Blocked before the model saw it."
        : "This content requires your approval before proceeding.";
      alert.appendChild(alertTitle);
      alert.appendChild(alertDesc);
      body.appendChild(alert);
    }

    // Preview
    if (preview) {
      var pre = document.createElement("div");
      pre.style.cssText = "background:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;padding:10px;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#52525b;max-height:120px;overflow:auto;word-break:break-all;margin-bottom:12px";
      pre.textContent = preview.slice(0, 300) + (preview.length > 300 ? "…" : "");
      body.appendChild(pre);
    }

    // Message
    var msg = document.createElement("div");
    msg.style.cssText = "font-size:12px;color:#71717a;line-height:1.5;margin-bottom:14px";
    msg.textContent = (verbLabels[verb] || "Action") + " on " + product().toUpperCase() + ". This action requires your approval.";
    body.appendChild(msg);

    // Buttons
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";

    var blockBtn = document.createElement("button");
    blockBtn.textContent = "Block";
    blockBtn.style.cssText = "font:700 12px system-ui;padding:9px 16px;border-radius:999px;cursor:pointer;border:1.5px solid #e4e4e7;background:transparent;color:#18181b;transition:transform .05s";

    var allowBtn = document.createElement("button");
    allowBtn.textContent = risk === "high" ? "Allow anyway" : "Allow";
    allowBtn.style.cssText = "font:700 12px system-ui;padding:9px 16px;border-radius:999px;cursor:pointer;border:0;background:#18181b;color:#fafaf9;transition:transform .05s";

    blockBtn.onmousedown = function () { blockBtn.style.transform = "scale(.96)"; };
    blockBtn.onmouseup = function () { blockBtn.style.transform = ""; };
    allowBtn.onmousedown = function () { allowBtn.style.transform = "scale(.96)"; };
    allowBtn.onmouseup = function () { allowBtn.style.transform = ""; };

    blockBtn.onclick = function () {
      try { if (onBlock) onBlock(); } finally { overlay.remove(); }
    };
    allowBtn.onclick = function () {
      try { if (onAllow) onAllow(); } finally { overlay.remove(); }
    };

    row.appendChild(blockBtn);
    row.appendChild(allowBtn);
    body.appendChild(row);

    card.appendChild(header);
    card.appendChild(body);
    overlay.appendChild(card);
    document.documentElement.appendChild(overlay);

    return overlay;
  }

  // ── Helper: run decide+modal flow for any verb ──
  function guardFlow(verb, text, extraMeta, onAllowCb, onBlockCb) {
    var secrets = scanSecrets(text);
    var score = riskScore(text, secrets);
    var risk = riskLabel(score);
    var urls = extractUrls(text);

    var meta = {
      length: text.length,
      preview: text.slice(0, 200),
      secrets: secrets,
      risk: score,
    };
    if (urls.length > 0) meta.urls = urls;
    if (extraMeta) {
      for (var k in extraMeta) {
        if (extraMeta.hasOwnProperty(k)) meta[k] = extraMeta[k];
      }
    }

    var decidePayload = {
      product: product(),
      host: host(),
      action: "chat." + verb,
      verb: verb,
      meta: meta,
    };

    postJson(GUARD + "/v2/evaluate", (function() {
  var dp = decidePayload || {};
  if (!dp.verb) dp.verb = "paste";
  if (!dp.scope) dp.scope = "llm";
  if (!dp.mode) dp.mode = "strict";
  return dp;
})())
      .then(function (res) {
        var ticket = res.ticket;

        // If low risk on non-sensitive verbs, auto-allow (less friction)
        if (risk === "low" && secrets.length === 0 && verb !== "send" && verb !== "upload") {
          v2Consume(ticket)
            .then(function (cr) {
              if (cr && (cr.ok === true || cr.decision === "ALLOW")) {
                if (onAllowCb) onAllowCb();
              } else {
                // Consume returned DENY (replay/expired) — notify user
                showToast("Action blocked: " + (cr && cr.reason ? cr.reason : "denied by guard"), true);
                if (onBlockCb) onBlockCb();
              }
            })
            .catch(function () {
              // Guard unreachable during consume — deny by default
              if (onBlockCb) onBlockCb();
            });
          return;
        }

        createModal({
          risk: risk,
          secrets: secrets,
          preview: text.slice(0, 400),
          verb: verb,
          onAllow: function () {
            if (!ticket) return;
            v2Consume(ticket)
              .then(function (cr) {
                if (cr && (cr.ok === true || cr.decision === "ALLOW") && onAllowCb) onAllowCb();
              })
              .catch(function () {});
          },
          onBlock: function () {
            if (!ticket) return;
            v2Consume(ticket).catch(function () {});
            if (onBlockCb) onBlockCb();
          },
        });
      })
      .catch(function () {
        // Guard unreachable → default DENY
        createModal({
          risk: "high",
          secrets: ["Guard offline"],
          preview: "Kasbah Guard is not running. Default: DENY.\n\nStart the Kasbah Guard app to enable this action.",
          verb: verb,
          onAllow: function () {
            showToast("Cannot proceed: Kasbah Guard is offline. Start the app first.", true);
          },
          onBlock: function () {
            showToast("Action blocked (guard offline)", false);
          },
        });
      });
  }

  // ═══════════════════════════════════════════════════
  // VERB 1: SEND — Intercept Send button click
  // ═══════════════════════════════════════════════════
  document.addEventListener(
    "click",
    function (ev) {
      var target = ev.target;
      var btn = target && target.closest ? target.closest("button,[role='button']") : null;
      if (!btn) return;
      if (!__kasbah_is_send(btn)) return;

      // Skip if we flagged this click as allowed
      if (btn[FLAG_KEY]) {
        btn[FLAG_KEY] = false;
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      var msg = findComposerText();
      var secrets = scanSecrets(msg);
      var score = riskScore(msg, secrets);
      var risk = riskLabel(score);
      var urls = extractUrls(msg);

      var meta = {
        length: msg.length,
        preview: msg.slice(0, 200),
        secrets: secrets,
        risk: score,
      };
      if (urls.length > 0) meta.urls = urls;

      var decidePayload = {
        product: product(),
        host: host(),
        action: "chat.send",
        verb: "send",
        meta: meta,
      };

      postJson(GUARD + "/v2/evaluate", (function() {
  var dp = decidePayload || {};
  if (!dp.verb) dp.verb = "paste";
  if (!dp.scope) dp.scope = "llm";
  if (!dp.mode) dp.mode = "strict";
  return dp;
})())
        .then(function (res) {
          var ticket = res.ticket;
          createModal({
            risk: risk,
            secrets: secrets,
            preview: msg.slice(0, 400),
            verb: "send",
            onAllow: function () {
              if (!ticket) return;
              v2Consume(ticket)
                .then(function (cr) {
                  if (cr && (cr.ok === true || cr.decision === "ALLOW")) {
                    btn[FLAG_KEY] = true;
                    btn.click();
                  } else {
                    showToast("Send blocked: " + (cr && cr.reason ? cr.reason : "denied by guard"), true);
                  }
                })
                .catch(function () {
                  showToast("Send failed: guard unreachable during consume", true);
                });
            },
            onBlock: function () {
              if (!ticket) return;
              v2Consume(ticket).catch(function () {});
              showToast("Message blocked by your choice", false);
            },
          });
        })
        .catch(function () {
          createModal({
            risk: "high",
            secrets: ["Guard offline"],
            preview: "Kasbah Guard is not running. Default: DENY.\n\nStart the Kasbah Guard app to enable sending.",
            verb: "send",
            onAllow: function () {
              showToast("Cannot send: Kasbah Guard is offline. Start the app first.", true);
            },
            onBlock: function () {
              showToast("Message blocked (guard offline)", false);
            },
          });
        });
    },
    true
  );

  // ═══════════════════════════════════════════════════
  // VERB 2: PASTE — Intercept clipboard paste events
  // ═══════════════════════════════════════════════════
  document.addEventListener(
    "paste",
    function (ev) {
      // Skip if we already approved this paste
      if (document[PASTE_FLAG]) {
        document[PASTE_FLAG] = false;
        return;
      }

      var clipText = "";
      if (ev.clipboardData) {
        clipText = ev.clipboardData.getData("text") || "";
      }

      // Only intercept if paste has meaningful content
      if (clipText.length < 20) return;

      var secrets = scanSecrets(clipText);
      var score = riskScore(clipText, secrets);

      // Only show modal for risky pastes (secrets found, or very long)
      if (secrets.length === 0 && clipText.length < 2500) return;

      ev.preventDefault();
      ev.stopPropagation();

      var activeEl = document.activeElement;

      guardFlow("paste", clipText, { source: "clipboard" },
        function () {
          // Allow: re-paste by inserting text directly
          if (activeEl) {
            if (activeEl.isContentEditable || (activeEl.closest && activeEl.closest('[contenteditable="true"]'))) {
              document.execCommand("insertText", false, clipText);
            } else if (activeEl.tagName === "TEXTAREA" || activeEl.tagName === "INPUT") {
              var start = activeEl.selectionStart || 0;
              var end = activeEl.selectionEnd || 0;
              var val = activeEl.value || "";
              activeEl.value = val.slice(0, start) + clipText + val.slice(end);
              activeEl.selectionStart = activeEl.selectionEnd = start + clipText.length;
              activeEl.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
        },
        function () { /* Block: do nothing, paste prevented */ }
      );
    },
    true
  );

  // ═══════════════════════════════════════════════════
  // VERB 3: UPLOAD — Intercept file inputs and drag-drop
  // ═══════════════════════════════════════════════════

  // File input change
  document.addEventListener(
    "change",
    function (ev) {
      var target = ev.target;
      if (!target || target.tagName !== "INPUT" || target.type !== "file") return;
      if (target.__kasbah_allowed) {
        target.__kasbah_allowed = false;
        return;
      }

      var files = target.files;
      if (!files || files.length === 0) return;

      var fileList = [];
      var totalSize = 0;
      for (var i = 0; i < files.length; i++) {
        fileList.push(files[i].name + " (" + (files[i].size / 1024).toFixed(1) + "KB, " + (files[i].type || "unknown") + ")");
        totalSize += files[i].size;
      }

      var previewText = "Files: " + fileList.join(", ");
      var extraMeta = {
        file_count: files.length,
        total_size: totalSize,
        file_names: fileList,
      };

      // Clear the input so it can be re-set if allowed
      var savedFiles = target.files;

      guardFlow("upload", previewText, extraMeta,
        function () {
          // Allow: the files are already selected, let them through
          // Dispatch a new change event
          target.__kasbah_allowed = true;
          target.dispatchEvent(new Event("change", { bubbles: true }));
        },
        function () {
          // Block: clear the file input
          target.value = "";
        }
      );
    },
    true
  );

  // Drag-and-drop file upload
  // Grace window: after user approves a drop, allow the next drop within 10 seconds
  var dropApprovedUntil = 0;

  document.addEventListener(
    "drop",
    function (ev) {
      var dt = ev.dataTransfer;
      if (!dt || !dt.files || dt.files.length === 0) return;

      // If within grace window from a previous approval, allow through
      if (Date.now() < dropApprovedUntil) {
        dropApprovedUntil = 0; // Single use
        return; // Let the drop proceed naturally
      }

      var files = dt.files;
      var fileList = [];
      var totalSize = 0;
      for (var i = 0; i < files.length; i++) {
        fileList.push(files[i].name + " (" + (files[i].size / 1024).toFixed(1) + "KB)");
        totalSize += files[i].size;
      }

      // Only intercept file drops, not text drops
      if (fileList.length === 0) return;

      ev.preventDefault();
      ev.stopPropagation();

      var previewText = "Dropped files: " + fileList.join(", ");
      guardFlow("upload", previewText, { file_count: files.length, total_size: totalSize, file_names: fileList, source: "drop" },
        function () {
          // Allow: set grace window so next drop goes through without re-prompting
          dropApprovedUntil = Date.now() + 10000; // 10 second window
          var note = document.createElement("div");
          note.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483646;background:#18181b;color:#fff;padding:12px 18px;border-radius:12px;font:13px/1.4 system-ui;box-shadow:0 4px 12px rgba(0,0,0,.2)";
          note.textContent = "\u2705 Approved — drop the file again now (10s window)";
          document.body.appendChild(note);
          setTimeout(function () { note.remove(); }, 5000);
        },
        function () { /* Block: drop prevented */ }
      );
    },
    true
  );

  // ═══════════════════════════════════════════════════
  // VERB 4: BROWSE — Detect URLs in composer before send
  // (Integrated into SEND flow above via extractUrls)
  // Also detect when user types/pastes URLs into the input
  // ═══════════════════════════════════════════════════
  // Browse detection is integrated into the SEND and PASTE flows above.
  // URLs are extracted and included in the /decide payload as meta.urls.
  // The guard service logs these as verb:"send" with URL metadata.

  // ═══════════════════════════════════════════════════
  // VERB 5: DOWNLOAD — Intercept download links in AI responses
  // ═══════════════════════════════════════════════════
  document.addEventListener(
    "click",
    function (ev) {
      var target = ev.target;
      var link = target && target.closest ? target.closest("a") : null;
      if (!link) return;

      // Check for download attribute or blob/data URLs in response areas
      var href = link.getAttribute("href") || "";
      var hasDownload = link.hasAttribute("download");
      var isBlob = href.indexOf("blob:") === 0;
      var isData = href.indexOf("data:") === 0;

      if (!hasDownload && !isBlob && !isData) return;

      // Make sure it's within an AI response area (not navigation)
      var isInResponse = link.closest("[data-message-author-role='assistant']") ||
                         link.closest(".markdown") ||
                         link.closest(".prose") ||
                         link.closest("[class*='response']") ||
                         link.closest("[class*='message']") ||
                         link.closest("[class*='artifact']");

      if (!isInResponse) return;

      if (link.__kasbah_dl_ok) {
        link.__kasbah_dl_ok = false;
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();

      var fileName = link.getAttribute("download") || link.textContent || "unknown file";
      var previewText = "Download: " + fileName + "\nURL: " + href.slice(0, 200);

      guardFlow("download", previewText, { file_name: fileName, url_type: isBlob ? "blob" : isData ? "data" : "link" },
        function () {
          // Allow: trigger the download
          link.__kasbah_dl_ok = true;
          link.click();
        },
        function () { /* Block: download prevented */ }
      );
    },
    true
  );

  // ── Startup notification ──
  console.log("[Kasbah Guard] Extension v0.3.0 loaded — intercepting: send, paste, upload, browse, download");
})();


document.addEventListener(
  "keydown",
  function (ev) {
    try {
      if (ev.key !== "Enter") return;
      if (ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      var el = ev.target;
      if (!el) return;
      var tag = (el.tagName || "").toLowerCase();
      var isComposer = (tag === "textarea") || (el.getAttribute && el.getAttribute("contenteditable") === "true");
      if (!isComposer) return;

      var msg = findComposerText();
      if (!msg) return;

      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      console.log("KASBAH_KEYDOWN_SEND");

      guardFlow(
        "send",
        msg,
        null,
        function () {
          var btn = document.querySelector('button[type="submit"], button[data-testid*="send"], button[aria-label*="Send"], button[aria-label*="send"]');
          if (btn) {
            btn[FLAG_KEY] = true;
            btn.click();
          }
        },
        function () {}
      );
    } catch (e) {}
  },
  true
);

