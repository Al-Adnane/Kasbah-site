/**
 * Kasbah Guard — Paste Shield + Send Guard
 * Stops sensitive content before AI sees it.
 *
 * Flow:
 *   1. Intercept Send button click on ChatGPT / Claude
 *   2. Extract composer text, run local secret scan
 *   3. POST /decide → get single-use ticket + risk assessment
 *   4. Show modal with risk level and detected patterns
 *   5. User clicks Allow or Block
 *   6. POST /consume (replay-protected)
 *   7. If guard unreachable → default DENY
 */
(function () {
  "use strict";

  var GUARD = "http://127.0.0.1:8788";
  var FLAG_KEY = "__kasbah_allow__";

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

  // ── Helpers ──
  function host() { return location.hostname; }

  function product() {
    var h = host();
    if (h.indexOf("chatgpt") !== -1 || h.indexOf("openai") !== -1) return "chatgpt";
    if (h.indexOf("claude") !== -1) return "claude";
    return "web";
  }

  function findComposerText() {
    // ChatGPT: contenteditable div or textarea
    var ce = document.querySelector('[contenteditable="true"]');
    if (ce) {
      var t = (ce.innerText || ce.textContent || "").trim();
      if (t) return t.slice(0, 6000);
    }
    var ta = document.querySelector("textarea");
    if (ta && ta.value) return ta.value.slice(0, 6000);
    // Claude: ProseMirror
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
    var onAllow = opts.onAllow;
    var onBlock = opts.onBlock;

    // Colors
    var colors = {
      high:   { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", badge: "#dc2626" },
      medium: { bg: "#fffbeb", border: "#fde68a", text: "#92400e", badge: "#d97706" },
      low:    { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", badge: "#16a34a" },
    };
    var c = colors[risk] || colors.low;

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
      alertTitle.textContent = secrets.length > 0 ? "This looks sensitive" : "Large message";
      var alertDesc = document.createElement("div");
      alertDesc.style.cssText = "font-size:12px;color:" + c.text + ";line-height:1.45";
      alertDesc.textContent = secrets.length > 0
        ? "Detected: " + secrets.join(", ") + ". Blocked before the model saw it."
        : "This message is unusually long (" + preview.length + " chars). Review before sending.";
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
    msg.textContent = "Sending to " + product().toUpperCase() + ". This action requires your approval.";
    body.appendChild(msg);

    // Buttons
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";

    var blockBtn = document.createElement("button");
    blockBtn.textContent = "Block";
    blockBtn.style.cssText = "font:700 12px system-ui;padding:9px 16px;border-radius:999px;cursor:pointer;border:1.5px solid #e4e4e7;background:transparent;color:#18181b;transition:transform .05s";

    var allowBtn = document.createElement("button");
    allowBtn.textContent = risk === "high" ? "Send anyway" : "Allow";
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

  // ── Interception ──
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

      var msg = findComposerText();
      var prod = product();

      // Local secret scan
      var secrets = scanSecrets(msg);
      var score = riskScore(msg, secrets);
      var risk = riskLabel(score);
      var ticket = null;

      var decidePayload = {
        product: prod,
        host: host(),
        action: "chat.send",
        meta: {
          length: msg.length,
          preview: msg.slice(0, 200),
          secrets: secrets,
          risk: score,
        },
      };

      // Request ticket from guard
      postJson(GUARD + "/decide", decidePayload)
        .then(function (res) {
          ticket = res.ticket;

          // Show modal
          createModal({
            risk: risk,
            secrets: secrets,
            preview: msg.slice(0, 400),
            onAllow: function () {
              if (!ticket) return;
              postJson(GUARD + "/consume", { ticket: ticket, choice: "ALLOW" })
                .then(function (res) {
                  if (res && res.decision === "ALLOW") {
                    btn[FLAG_KEY] = true;
                    btn.click();
                  }
                })
                .catch(function () {});
            },
            onBlock: function () {
              if (!ticket) return;
              postJson(GUARD + "/consume", { ticket: ticket, choice: "DENY" }).catch(function () {});
            },
          });
        })
        .catch(function () {
          // Guard unreachable → default DENY with warning
          createModal({
            risk: "high",
            secrets: ["Guard offline"],
            preview: "Kasbah Guard is not running. Default: DENY.\n\nOpen the Kasbah Guard app to start protection.",
            onAllow: function () {}, // no-op, can't send without guard
            onBlock: function () {},
          });
        });
    },
    true
  );
})();
