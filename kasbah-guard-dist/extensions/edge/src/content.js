/**
 * Kasbah Guard — Sovereign Intent Layer (Extension v1.1.0)
 * Intercepts 6 irreversible verbs before AI sees them:
 *   1. SEND — Send button click interception
 *   2. PASTE — Clipboard paste interception
 *   3. UPLOAD — File input / drag-drop interception
 *   4. BROWSE — URL detection in messages
 *   5. DOWNLOAD — Download link click interception
 *   6. EDIT — AI code apply/accept interception (file changes)
 *
 * Security Layers:
 *   L1 — beforeinput + MutationObserver for programmatic injection defense
 *   L3 — File content scanning for uploads
 *   L6 — Heartbeat fail-closed (3 failures → DENY all)
 *
 * Flow per verb:
 *   Intercept → local secret scan → POST /decide → modal → POST /consume → allow/deny
 *   If guard unreachable → default DENY
 */
(function () {
  "use strict";

  var GUARD = "http://127.0.0.1:8788";
  var FLAG_KEY = "__kasbah_allow__";
  var PASTE_FLAG = "__kasbah_paste_ok__";

  // ── L6: Heartbeat fail-closed state ──
  var __kasbah_guard_alive = true;
  var __kasbah_heartbeat_failures = 0;
  var HEARTBEAT_MAX_FAILURES = 3;

  // ── Secret detection (runs in-browser for instant feedback) ──
  var PATTERNS = [
    // Secrets & credentials
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
    // PII — Financial
    { name: "Credit Card",    rx: /\b(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{1}|6011)[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{1,7}\b/ },
    { name: "IBAN",           rx: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/ },
    // PII — Identity
    { name: "SSN",            rx: /\b(?!000|666|9\d{2})\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/ },
    { name: "Passport",       rx: /(?:passport|passeport)\s*(?:no|number|#|:)\s*[A-Z0-9]{5,12}/i },
    { name: "National ID",    rx: /(?:national\s*id|id\s*(?:number|card|no)|identity\s*card|cedula|dni|nif|nie)\s*(?::|#|no\.?)?\s*[A-Z0-9]{5,15}/i },
    // PII — Contact
    { name: "Phone Number",   rx: /(?:\+\d{1,3}[- ]?)?\(?\d{2,4}\)?[- ]?\d{3,4}[- ]?\d{3,4}\b/ },
    { name: "Email (PII)",    rx: /(?:email|e-mail|contact)\s*[:=]?\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i },
    // PII — Medical
    { name: "Medical Record", rx: /(?:patient\s*id|mrn|medical\s*record|health\s*record)\s*(?::|#|no\.?)?\s*[A-Z0-9]{4,}/i },
    { name: "Medical Data",   rx: /(?:diagnosis|prescription|medication|dosage|blood\s*type|icd-10)\s*[:=]?\s*[^\n]{3,}/i },
    // PII — Personal
    { name: "Date of Birth",  rx: /(?:date\s*of\s*birth|dob|birth\s*date|born\s*on)\s*[:=]?\s*\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}/i },
    { name: "Address",        rx: /\d{1,5}\s+\w+\s+(?:street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|court|ct)\b/i },
  ];

  function scanSecrets(text) {
    var found = [];
    for (var i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i].rx.test(text)) {
        found.push(PATTERNS[i].name);
      }
    }
    // Detect sensitive document keywords in upload context
    if (/(?:passport|national.?id|identity.?(?:card|document)|driver.?licen[sc]e|birth.?cert|ssn|social.?security|tax.?return|medical.?record)/i.test(text)) {
      if (found.indexOf("Sensitive Document") === -1) found.push("Sensitive Document");
    }
    return found;
  }

  // ── Sensitive filename detection for uploads ──
  var SENSITIVE_FILENAMES = [
    /passport/i, /passeport/i, /id[_\-\s]?card/i, /identity/i, /carte[_\-\s]?id/i,
    /national[_\-\s]?id/i, /driver[_\-\s]?licen[sc]e/i, /permis/i, /cedula/i,
    /birth[_\-\s]?cert/i, /ssn/i, /social[_\-\s]?security/i,
    /tax[_\-\s]?return/i, /w[_\-]?2/i, /1099/i, /bank[_\-\s]?statement/i,
    /medical[_\-\s]?record/i, /health[_\-\s]?record/i, /prescription/i,
    /visa[_\-\s]?scan/i, /residence[_\-\s]?permit/i, /green[_\-\s]?card/i,
  ];

  function detectSensitiveFilename(name) {
    for (var i = 0; i < SENSITIVE_FILENAMES.length; i++) {
      if (SENSITIVE_FILENAMES[i].test(name)) return true;
    }
    return false;
  }

  function riskScore(text, secrets) {
    var score = 10;
    // PII categories get highest scores
    var criticalPII = ["Credit Card", "SSN", "Medical Record", "Medical Data"];
    var highPII = ["Passport", "National ID", "IBAN", "Date of Birth", "Phone Number", "Email (PII)", "Address", "Sensitive Document"];
    var hasCriticalPII = false;
    var hasHighPII = false;
    for (var i = 0; i < secrets.length; i++) {
      for (var j = 0; j < criticalPII.length; j++) {
        if (secrets[i] === criticalPII[j]) hasCriticalPII = true;
      }
      for (var k = 0; k < highPII.length; k++) {
        if (secrets[i] === highPII[k]) hasHighPII = true;
      }
    }
    if (hasCriticalPII) score += 85;
    else if (hasHighPII) score += 65;
    else if (secrets.length > 0) score += 75;
    if (secrets.length > 2) score += 10;
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
    if (h.indexOf("gemini") !== -1 || h.indexOf("aistudio.google") !== -1) return "gemini";
    if (h.indexOf("perplexity") !== -1) return "perplexity";
    if (h.indexOf("poe.com") !== -1) return "poe";
    if (h.indexOf("deepseek") !== -1) return "deepseek";
    if (h.indexOf("grok") !== -1) return "grok";
    if (h.indexOf("copilot") !== -1) return "copilot";
    if (h.indexOf("huggingface") !== -1) return "huggingchat";
    if (h.indexOf("you.com") !== -1) return "you";
    if (h.indexOf("pi.ai") !== -1) return "pi";
    if (h.indexOf("mistral") !== -1) return "mistral";
    if (h.indexOf("manus") !== -1) return "manus";
    if (h.indexOf("cursor") !== -1) return "cursor";
    if (h.indexOf("windsurf") !== -1 || h.indexOf("codeium") !== -1) return "windsurf";
    if (h.indexOf("notebooklm") !== -1 || h.indexOf("labs.google") !== -1) return "notebooklm";
    if (h.indexOf("meta.ai") !== -1) return "meta";
    if (h.indexOf("cohere") !== -1) return "cohere";
    if (h.indexOf("lmsys") !== -1) return "chatbot-arena";
    if (h.indexOf("open-assistant") !== -1) return "open-assistant";
    return "ai-tool";
  }

  function findComposerText() {
    // Platform-specific selectors first for accuracy
    var selectors = [
      // ChatGPT
      '#prompt-textarea',
      // Claude
      '.ProseMirror[contenteditable="true"]',
      // Gemini
      '.ql-editor[contenteditable="true"]',
      'rich-textarea [contenteditable="true"]',
      // Perplexity
      'textarea[placeholder*="Ask"]',
      // DeepSeek
      '#chat-input',
      // Copilot
      '#searchbox',
      'textarea[id*="user"]',
      // Grok
      'textarea[data-testid*="input"]',
      // Mistral
      '.chat-input textarea',
      // Generic fallbacks (works for Poe, HuggingChat, You, Pi, Meta, Cohere, etc.)
      '[contenteditable="true"]',
      'textarea',
      '.ProseMirror',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (!el) continue;
      var t = "";
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        t = (el.value || "").trim();
      } else {
        t = (el.innerText || el.textContent || "").trim();
      }
      if (t) return t.slice(0, 6000);
    }
    return "";
  }

  function isSendButton(btn) {
    if (!btn) return false;
    var a = (btn.getAttribute("aria-label") || "").toLowerCase();
    var t = (btn.getAttribute("title") || "").toLowerCase();
    var txt = (btn.innerText || "").toLowerCase().trim();
    var did = (btn.getAttribute("data-testid") || "").toLowerCase();
    var cls = (btn.getAttribute("class") || "").toLowerCase();
    var tag = btn.tagName.toLowerCase();
    var clickable = tag === "button" || (tag === "div" && btn.getAttribute("role") === "button") || tag === "span";
    if (!clickable) return false;

    // Universal send/submit detection across all AI platforms
    var sendTerms = ["send", "submit", "enter", "go"];
    for (var i = 0; i < sendTerms.length; i++) {
      var st = sendTerms[i];
      if (a.indexOf(st) !== -1 || t.indexOf(st) !== -1 || did.indexOf(st) !== -1) return true;
    }

    // Text-based detection
    if (txt === "send" || txt === "send message" || txt === "submit" || txt === "ask"
        || txt === "generate" || txt === "search" || txt === "run") return true;

    // Class-based detection for platforms that use class names
    if (cls.indexOf("send") !== -1 || cls.indexOf("submit") !== -1) return true;

    // SVG icon detection: many platforms use an SVG arrow icon in the send button
    var svg = btn.querySelector("svg");
    if (svg) {
      var path = svg.querySelector("path");
      if (path) {
        var d = (path.getAttribute("d") || "").toLowerCase();
        // Common send arrow path patterns (paper plane / arrow)
        if (d.indexOf("m2") !== -1 && d.indexOf("l20") !== -1) return true; // common arrow
      }
      // Check if button has only an SVG child (icon-only send buttons)
      if (btn.children.length === 1 && btn.children[0].tagName === "svg") {
        // Check position: send buttons are usually at the right side of input area
        var rect = btn.getBoundingClientRect();
        var parent = btn.parentElement;
        if (parent) {
          var prect = parent.getBoundingClientRect();
          // If button is in the right portion and near bottom of a chat input area
          if (rect.left > prect.right - 100) {
            // Check if there's a textarea or contenteditable nearby
            var nearby = parent.querySelector('textarea, [contenteditable="true"]');
            if (nearby) return true;
          }
        }
      }
    }

    return false;
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
    badge.textContent = risk === "high" ? "Needs review" : risk === "medium" ? "Quick check" : "Looks good";
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
      alertTitle.textContent = secrets.length > 0 ? "Heads up" : "Quick check";
      var alertDesc = document.createElement("div");
      alertDesc.style.cssText = "font-size:12px;color:" + c.text + ";line-height:1.45";
      alertDesc.textContent = secrets.length > 0
        ? "This may contain personal info (" + secrets.join(", ") + "). Your call."
        : "Review this before continuing — just to be safe.";
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
    msg.textContent = (verbLabels[verb] || "Action") + " on " + product().toUpperCase() + " — you decide.";
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
    var hasCritical = false; // kept for logging

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
      text: text,
      meta: meta,
    };

    postJson(GUARD + "/decide", decidePayload)
      .then(function (res) {
        // Guard says no — still give user the choice
        if (res.blocked === true || res.decision === "DENY") {
          createModal({
            risk: "high",
            secrets: secrets.length > 0 ? secrets : ["Review needed"],
            preview: text.slice(0, 400),
            verb: verb,
            onAllow: function () {
              if (onAllowCb) onAllowCb();
            },
            onBlock: function () {
              showToast("Stopped — you're in control", false);
              if (onBlockCb) onBlockCb();
            },
          });
          return;
        }

        var ticket = res.ticket;

        // Show review modal — user always decides
        createModal({
          risk: risk,
          secrets: secrets,
          preview: text.slice(0, 400),
          verb: verb,
          onAllow: function () {
            if (!ticket) return;
            postJson(GUARD + "/consume", { ticket: ticket, choice: "ALLOW" })
              .then(function (cr) {
                if (cr && cr.decision === "ALLOW" && onAllowCb) onAllowCb();
                else showToast("Couldn't complete — try again", true);
              })
              .catch(function () {});
          },
          onBlock: function () {
            if (!ticket) return;
            postJson(GUARD + "/consume", { ticket: ticket, choice: "DENY" }).catch(function () {});
            if (onBlockCb) onBlockCb();
          },
        });
      })
      .catch(function () {
        // Guard not running — let user decide
        createModal({
          risk: "medium",
          secrets: ["Guard not running"],
          preview: "Kasbah Guard isn't running right now.\n\nOpen the app to get full protection.",
          verb: verb,
          onAllow: function () {
            if (onAllowCb) onAllowCb();
          },
          onBlock: function () {
            showToast("Action stopped", false);
          },
        });
      });
  }

  // ═══════════════════════════════════════════════════
  // L6: HEARTBEAT — Poll guard health every 5s, fail-closed after 3 failures
  // ═══════════════════════════════════════════════════
  function heartbeatPoll() {
    fetch(GUARD + "/health", { method: "GET", cache: "no-store" })
      .then(function (r) {
        if (r.ok) {
          __kasbah_guard_alive = true;
          __kasbah_heartbeat_failures = 0;
        } else {
          __kasbah_heartbeat_failures++;
          if (__kasbah_heartbeat_failures >= HEARTBEAT_MAX_FAILURES) {
            __kasbah_guard_alive = false;
          }
        }
      })
      .catch(function () {
        __kasbah_heartbeat_failures++;
        if (__kasbah_heartbeat_failures >= HEARTBEAT_MAX_FAILURES) {
          __kasbah_guard_alive = false;
        }
      });
  }
  // Start heartbeat
  heartbeatPoll();
  setInterval(heartbeatPoll, 5000);

  // If guard heartbeat is lost, let user know but still give them the choice
  function failClosedCheck(verb, onBlock) {
    if (!__kasbah_guard_alive) {
      createModal({
        risk: "medium",
        secrets: ["Guard not connected"],
        preview: "Kasbah Guard isn't responding right now.\n\nOpen the app for full protection, or continue at your discretion.",
        verb: verb,
        onAllow: function () {
          showToast("Continuing without guard protection", false);
        },
        onBlock: function () {
          showToast("Action stopped", false);
          if (onBlock) onBlock();
        },
      });
      return true; // show modal
    }
    return false; // OK to proceed normally
  }

  // ═══════════════════════════════════════════════════
  // L1: BEFOREINPUT — Intercept programmatic text insertion
  // ═══════════════════════════════════════════════════
  document.addEventListener("beforeinput", function (ev) {
    // Only intercept paste/drop insertions with meaningful content
    if (ev.inputType !== "insertFromPaste" && ev.inputType !== "insertFromDrop") return;

    var data = ev.data || "";
    if (ev.dataTransfer) {
      data = ev.dataTransfer.getData("text/plain") || ev.dataTransfer.getData("text") || "";
    }

    // Only trigger for substantial content with detected secrets
    if (data.length < 100) return;
    var secrets = scanSecrets(data);
    if (secrets.length === 0) return;

    // This is a programmatic insertion with secrets — block it
    ev.preventDefault();
    ev.stopPropagation();

    // Log to guard
    try {
      postJson(GUARD + "/events", {
        kind: "L1_BEFOREINPUT",
        data: {
          input_type: ev.inputType,
          secrets_detected: secrets,
          length: data.length,
          product: product(),
          host: host(),
        },
      });
    } catch (e) { /* ignore */ }

    showToast("Kasbah Guard caught a paste with personal info — review before sharing", false);
  }, true);

  // ═══════════════════════════════════════════════════
  // L1: MUTATION OBSERVER — Detect programmatic content injection
  // ═══════════════════════════════════════════════════
  (function () {
    var observer = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var mutation = mutations[m];
        if (mutation.type !== "characterData" && mutation.type !== "childList") continue;

        var target = mutation.target;
        if (!target) continue;

        // Only monitor contenteditable and textarea parents
        var editable = target.closest ? target.closest('[contenteditable="true"]') : null;
        if (!editable && target.tagName !== "TEXTAREA") continue;

        var text = "";
        if (target.tagName === "TEXTAREA") {
          text = target.value || "";
        } else if (editable) {
          text = (editable.innerText || editable.textContent || "").trim();
        }

        // Only check substantial programmatic injections
        if (text.length < 200) continue;

        var secrets = scanSecrets(text);
        if (secrets.length === 0) continue;

        // Log potential programmatic injection to guard
        try {
          postJson(GUARD + "/events", {
            kind: "L1_MUTATION",
            data: {
              mutation_type: mutation.type,
              secrets_detected: secrets,
              length: text.length,
              product: product(),
              host: host(),
            },
          });
        } catch (e) { /* ignore */ }
      }
    });

    // Observe the whole document for content changes
    observer.observe(document.body || document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  })();

  // ═══════════════════════════════════════════════════
  // VERB 1: SEND — Intercept Send button click
  // ═══════════════════════════════════════════════════
  document.addEventListener(
    "click",
    function (ev) {
      var target = ev.target;
      var btn = target && target.closest ? target.closest("button,[role='button']") : null;
      if (!btn) return;
      if (!isSendButton(btn)) return;

      // Skip if we flagged this click as allowed
      if (btn[FLAG_KEY]) {
        btn[FLAG_KEY] = false;
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      // L6: Fail-closed check
      if (failClosedCheck("send", null)) return;

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
        text: msg,
        meta: meta,
      };

      postJson(GUARD + "/decide", decidePayload)
        .then(function (res) {
          // Guard flags this — still give user the choice
          if (res.blocked === true || res.decision === "DENY") {
            createModal({
              risk: "high",
              secrets: secrets.length > 0 ? secrets : ["Review needed"],
              preview: msg.slice(0, 400),
              verb: "send",
              onAllow: function () {
                btn[FLAG_KEY] = true;
                btn.click();
              },
              onBlock: function () {
                showToast("Message not sent — your choice", false);
              },
            });
            return;
          }

          var ticket = res.ticket;
          createModal({
            risk: risk,
            secrets: secrets,
            preview: msg.slice(0, 400),
            verb: "send",
            onAllow: function () {
              if (!ticket) return;
              postJson(GUARD + "/consume", { ticket: ticket, choice: "ALLOW" })
                .then(function (cr) {
                  if (cr && cr.decision === "ALLOW") {
                    btn[FLAG_KEY] = true;
                    btn.click();
                  } else {
                    showToast("Couldn't complete — try again", true);
                  }
                })
                .catch(function () {
                  showToast("Couldn't reach guard — try again", true);
                });
            },
            onBlock: function () {
              if (!ticket) return;
              postJson(GUARD + "/consume", { ticket: ticket, choice: "DENY" }).catch(function () {});
              showToast("Message not sent — your choice", false);
            },
          });
        })
        .catch(function () {
          createModal({
            risk: "medium",
            secrets: ["Guard not running"],
            preview: "Kasbah Guard isn't running.\n\nOpen the app for full protection, or send anyway.",
            verb: "send",
            onAllow: function () {
              btn[FLAG_KEY] = true;
              btn.click();
            },
            onBlock: function () {
              showToast("Message not sent", false);
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

      // L6: Fail-closed check
      if (failClosedCheck("paste", null)) return;

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
      var sensitiveDocNames = [];
      for (var i = 0; i < files.length; i++) {
        fileList.push(files[i].name + " (" + (files[i].size / 1024).toFixed(1) + "KB, " + (files[i].type || "unknown") + ")");
        totalSize += files[i].size;
        if (detectSensitiveFilename(files[i].name)) {
          sensitiveDocNames.push(files[i].name);
        }
      }

      var previewText = "Files: " + fileList.join(", ");
      // If sensitive filename detected, add context so guard and local scanner both flag it
      if (sensitiveDocNames.length > 0) {
        previewText += "\nThis looks like a personal document: " + sensitiveDocNames.join(", ");
      }
      var extraMeta = {
        file_count: files.length,
        total_size: totalSize,
        file_names: fileList,
        sensitive_filenames: sensitiveDocNames,
      };

      // L6: Fail-closed check
      if (failClosedCheck("upload", function () { target.value = ""; })) return;

      // L3: Scan text-based file contents for secrets before uploading
      var savedFiles = target.files;
      var textTypes = ["text/", "application/json", "application/xml", "application/csv", "application/javascript"];
      var filesToScan = [];
      for (var fi = 0; fi < files.length; fi++) {
        var fType = (files[fi].type || "").toLowerCase();
        var fName = (files[fi].name || "").toLowerCase();
        var isText = textTypes.some(function (t) { return fType.indexOf(t) !== -1; });
        var isTextExt = fName.endsWith(".txt") || fName.endsWith(".csv") || fName.endsWith(".json") || fName.endsWith(".env") || fName.endsWith(".yaml") || fName.endsWith(".yml") || fName.endsWith(".xml") || fName.endsWith(".md") || fName.endsWith(".js") || fName.endsWith(".ts") || fName.endsWith(".py") || fName.endsWith(".sh") || fName.endsWith(".conf") || fName.endsWith(".cfg") || fName.endsWith(".ini") || fName.endsWith(".toml") || fName.endsWith(".log");
        if ((isText || isTextExt) && files[fi].size < 512000) { // < 500KB
          filesToScan.push(files[fi]);
        }
      }

      if (filesToScan.length > 0) {
        // Read and scan file contents
        var scannedCount = 0;
        var fileSecrets = [];
        filesToScan.forEach(function (file) {
          var reader = new FileReader();
          reader.onload = function (e) {
            var content = e.target.result || "";
            var found = scanSecrets(content);
            if (found.length > 0) {
              fileSecrets.push({ file: file.name, secrets: found });
            }
            scannedCount++;
            if (scannedCount === filesToScan.length) {
              // All files scanned, now proceed with guardFlow
              if (fileSecrets.length > 0) {
                extraMeta.file_secrets = fileSecrets;
                previewText += "\n\u26a0 File contents contain: " + fileSecrets.map(function (fs) { return fs.file + " (" + fs.secrets.join(", ") + ")"; }).join("; ");
              }
              guardFlow("upload", previewText, extraMeta,
                function () {
                  target.__kasbah_allowed = true;
                  target.dispatchEvent(new Event("change", { bubbles: true }));
                },
                function () { target.value = ""; }
              );
            }
          };
          reader.readAsText(file);
        });
        return;
      }

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
      // Covers: ChatGPT, Claude, Gemini, DeepSeek, Poe, Copilot, Perplexity, Mistral, etc.
      var isInResponse = link.closest("[data-message-author-role='assistant']") ||
                         link.closest(".markdown") ||
                         link.closest(".prose") ||
                         link.closest("[class*='response']") ||
                         link.closest("[class*='message']") ||
                         link.closest("[class*='artifact']") ||
                         link.closest("[class*='answer']") ||
                         link.closest("[class*='output']") ||
                         link.closest("[class*='result']") ||
                         link.closest("[class*='reply']") ||
                         link.closest("[class*='chat-turn']") ||
                         link.closest("[class*='model-response']") ||
                         link.closest("[data-role='assistant']") ||
                         link.closest("[data-testid*='message']");

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

  // ═══════════════════════════════════════════════════
  // VERB 6: EDIT — Intercept AI code apply/accept/insert actions
  // ═══════════════════════════════════════════════════
  // Catches: "Apply", "Accept", "Insert code", "Replace", "Apply to file",
  // "Accept all", "Apply changes", "Run", "Execute" buttons in AI response areas
  var EDIT_FLAG = "__kasbah_edit_ok__";
  var EDIT_SELECTORS = [
    // Generic apply/accept patterns
    'button[aria-label*="apply" i]',
    'button[aria-label*="accept" i]',
    'button[aria-label*="insert" i]',
    'button[aria-label*="replace" i]',
    'button[data-testid*="apply"]',
    'button[data-testid*="accept"]',
    // Claude Artifacts
    'button[class*="apply"]',
    '[data-testid="artifact-apply"]',
    // ChatGPT Canvas
    'button[class*="canvas-apply"]',
    '[data-testid*="canvas"][data-testid*="apply"]',
    // Cursor / Copilot / Generic IDE web
    'button[class*="accept-edit"]',
    'button[class*="apply-edit"]',
    'button[class*="apply-diff"]',
    'button[class*="accept-change"]',
    'button[class*="apply-suggestion"]',
    // v0.dev / Bolt / Replit
    'button[class*="deploy"]',
    '[data-action="apply"]',
    '[data-action="accept"]',
  ];

  function isEditButton(el) {
    if (!el) return false;
    // Check selectors
    for (var i = 0; i < EDIT_SELECTORS.length; i++) {
      if (el.matches && el.matches(EDIT_SELECTORS[i])) return true;
    }
    // Check text content of the button
    var text = (el.textContent || "").trim().toLowerCase();
    var editWords = ["apply", "accept", "insert code", "replace file", "apply to", "accept all", "apply changes", "apply edit", "accept edit", "apply diff", "run code", "execute"];
    for (var j = 0; j < editWords.length; j++) {
      if (text === editWords[j] || text.indexOf(editWords[j]) === 0) {
        // Make sure it's in an AI response context (not generic UI buttons)
        var inResponse = el.closest("[data-message-author-role='assistant']") ||
          el.closest(".markdown") || el.closest(".prose") ||
          el.closest("[class*='response']") || el.closest("[class*='message']") ||
          el.closest("[class*='artifact']") || el.closest("[class*='output']") ||
          el.closest("[class*='result']") || el.closest("[class*='code']") ||
          el.closest("[class*='editor']") || el.closest("[class*='diff']") ||
          el.closest("[class*='canvas']") || el.closest("[class*='suggestion']") ||
          el.closest("[data-role='assistant']");
        if (inResponse) return true;
      }
    }
    return false;
  }

  // Find the code content that would be applied
  function findEditContent(btn) {
    // Look for nearby code blocks
    var codeBlock = btn.closest("[class*='code']") ||
      btn.closest("[class*='artifact']") ||
      btn.closest("[class*='diff']") ||
      btn.closest("[class*='canvas']") ||
      btn.closest("[class*='suggestion']");
    if (codeBlock) {
      var code = codeBlock.querySelector("code, pre, [class*='code-content'], [class*='diff-content']");
      if (code) return code.textContent || "";
    }
    // Walk up to find the message container, then find code within it
    var container = btn.closest("[data-message-author-role='assistant']") ||
      btn.closest("[class*='response']") ||
      btn.closest("[class*='message']") ||
      btn.closest("[class*='output']");
    if (container) {
      var allCode = container.querySelectorAll("code, pre");
      var combined = "";
      for (var i = 0; i < allCode.length; i++) {
        combined += (allCode[i].textContent || "") + "\n";
      }
      if (combined.length > 10) return combined;
    }
    return btn.closest("div")?.textContent || "AI-generated code edit";
  }

  // Find the target file name if visible
  function findEditFilename(btn) {
    var container = btn.closest("[class*='artifact']") ||
      btn.closest("[class*='code']") ||
      btn.closest("[class*='diff']") ||
      btn.closest("[class*='canvas']") ||
      btn.closest("[class*='message']");
    if (container) {
      // Look for filename indicators
      var filename = container.querySelector("[class*='filename'], [class*='file-name'], [class*='title'], [class*='header'] span");
      if (filename) return filename.textContent || "";
    }
    // Check aria-label or title on the button itself
    return btn.getAttribute("aria-label") || btn.getAttribute("title") || "";
  }

  document.addEventListener(
    "click",
    function (ev) {
      var target = ev.target;
      var btn = target && target.closest ? target.closest("button,[role='button'],a") : null;
      if (!btn) return;
      if (!isEditButton(btn)) return;

      // Skip if we already approved this
      if (btn[EDIT_FLAG]) {
        btn[EDIT_FLAG] = false;
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      // L6: Fail-closed check
      if (failClosedCheck("edit", null)) return;

      var codeContent = findEditContent(btn);
      var fileName = findEditFilename(btn);
      var secrets = scanSecrets(codeContent);
      var score = riskScore(codeContent, secrets);
      var risk = riskLabel(score);

      var previewText = (fileName ? "File: " + fileName + "\n" : "") + codeContent.slice(0, 500);

      var meta = {
        length: codeContent.length,
        preview: codeContent.slice(0, 200),
        secrets: secrets,
        risk: score,
        file_name: fileName,
        verb_type: "edit",
        source: "ai_code_apply"
      };

      // Use /fs/gate for file edits (if it exists), fall back to /decide
      var gatePayload = {
        path: fileName || "unknown",
        agent: product(),
        action: "write",
        preview: codeContent.slice(0, 2000),
        diff: codeContent.slice(0, 5000)
      };

      postJson(GUARD + "/fs/gate", gatePayload)
        .then(function (res) {
          if (res.decision === "DENY" || res.decision === "BLOCK") {
            createModal({
              risk: "high",
              secrets: secrets.length > 0 ? secrets : ["AI file edit blocked"],
              preview: previewText.slice(0, 400),
              verb: "edit",
              onAllow: function () {
                if (res.ticket) {
                  postJson(GUARD + "/consume", { ticket: res.ticket, choice: "ALLOW" })
                    .then(function (cr) {
                      if (cr && cr.decision === "ALLOW") {
                        btn[EDIT_FLAG] = true;
                        btn.click();
                      }
                    }).catch(function () {});
                } else {
                  btn[EDIT_FLAG] = true;
                  btn.click();
                }
              },
              onBlock: function () {
                if (res.ticket) {
                  postJson(GUARD + "/consume", { ticket: res.ticket, choice: "DENY" }).catch(function () {});
                }
                showToast("Code edit blocked — your files are safe", false);
              },
            });
            return;
          }

          createModal({
            risk: risk,
            secrets: secrets,
            preview: previewText.slice(0, 400),
            verb: "edit",
            onAllow: function () {
              if (res.ticket) {
                postJson(GUARD + "/consume", { ticket: res.ticket, choice: "ALLOW" })
                  .then(function (cr) {
                    if (cr && cr.decision === "ALLOW") {
                      btn[EDIT_FLAG] = true;
                      btn.click();
                    }
                  }).catch(function () {});
              } else {
                btn[EDIT_FLAG] = true;
                btn.click();
              }
            },
            onBlock: function () {
              if (res.ticket) {
                postJson(GUARD + "/consume", { ticket: res.ticket, choice: "DENY" }).catch(function () {});
              }
              showToast("Code edit stopped — you're in control", false);
            },
          });
        })
        .catch(function () {
          // /fs/gate not available — fall back to guardFlow with /decide
          guardFlow("edit", codeContent, { file_name: fileName, source: "ai_code_apply" },
            function () {
              btn[EDIT_FLAG] = true;
              btn.click();
            },
            function () {
              showToast("Code edit stopped", false);
            }
          );
        });
    },
    true
  );

  // ── Startup notification ──
  console.log("[Kasbah Guard] Extension v1.2.0 loaded on " + product().toUpperCase() + " — intercepting: send, paste, upload, browse, download, edit — PII + secret detection active");
})();
