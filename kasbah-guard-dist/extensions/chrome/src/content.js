/**
 * Kasbah Guard v0 - Authoritative local enforcement
 * - Intercepts Send on ChatGPT + Claude
 * - Requires ticket from local guard: POST http://127.0.0.1:8788/decide
 * - User chooses Allow/Block in modal
 * - Consume ticket: POST http://127.0.0.1:8788/consume (single-use, replay-protected)
 * - If guard unreachable: default DENY (no send)
 */

(function() {
  var GUARD = "http://127.0.0.1:8788";
  var FLAG_KEY = "__kasbah_allow_once__";

  function nowIso() { return new Date().toISOString(); }
  function host() { return location.hostname; }

  function product() {
    var h = host();
    if (h.indexOf("chatgpt") !== -1 || h.indexOf("openai") !== -1) return "chatgpt";
    if (h.indexOf("claude") !== -1) return "claude";
    return "web";
  }

  function safeText(el) {
    if (!el) return "";
    var t = (el.innerText || el.textContent || "").trim();
    return t.slice(0, 4000);
  }

  function findComposerText() {
    // ChatGPT: textarea or contenteditable #prompt-textarea
    var ta = document.querySelector("textarea");
    if (ta && ta.value) return ta.value.slice(0, 4000);
    var ce = document.querySelector('[contenteditable="true"]');
    var txt = safeText(ce);
    return txt ? txt.slice(0, 4000) : "";
  }

  function isSendButton(btn) {
    if (!btn) return false;
    var aria = (btn.getAttribute("aria-label") || "").toLowerCase();
    var title = (btn.getAttribute("title") || "").toLowerCase();
    var txt = (btn.innerText || "").toLowerCase().trim();
    var dataId = (btn.getAttribute("data-testid") || "").toLowerCase();

    var looks =
      aria.indexOf("send") !== -1 ||
      title.indexOf("send") !== -1 ||
      txt === "send" ||
      txt === "send message" ||
      dataId.indexOf("send") !== -1 ||
      aria.indexOf("submit") !== -1 ||
      title.indexOf("submit") !== -1;

    var tag = btn.tagName.toLowerCase();
    var clickable = tag === "button" || (tag === "div" && btn.getAttribute("role") === "button");
    return looks && clickable;
  }

  function createModal(opts) {
    var body = opts.body;
    var onAllow = opts.onAllow;
    var onBlock = opts.onBlock;

    var overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif";

    var card = document.createElement("div");
    card.style.cssText = "width:min(520px,96vw);background:#fffcf8;border:1px solid #e7ded6;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.25);padding:18px;";

    // Header with logo
    var header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:12px";

    var logoBox = document.createElement("div");
    logoBox.style.cssText = "width:28px;height:28px;border-radius:9px;background:#1e1e1e;display:grid;place-items:center";
    var logoMark = document.createElement("div");
    logoMark.style.cssText = "width:14px;height:14px;border-radius:4px;background:#fffcf8;position:relative";
    var logoPipe = document.createElement("div");
    logoPipe.style.cssText = "position:absolute;left:50%;top:20%;width:2.5px;height:60%;transform:translateX(-50%);background:#1e1e1e;border-radius:99px";
    logoMark.appendChild(logoPipe);
    logoBox.appendChild(logoMark);

    var title = document.createElement("div");
    title.style.cssText = "font-weight:900;font-size:14px;color:#1e1e1e";
    title.textContent = "Kasbah Guard";

    var subtitle = document.createElement("div");
    subtitle.style.cssText = "font-size:11px;font-weight:800;padding:4px 8px;border-radius:999px;background:#ebdfd7;color:#3a2e26";
    subtitle.textContent = "Permission required";

    header.appendChild(logoBox);
    header.appendChild(title);
    header.appendChild(subtitle);

    var p = document.createElement("div");
    p.style.cssText = "font-size:13px;color:#4a4a4a;line-height:1.5;margin-bottom:10px";
    p.textContent = body || "";

    var pre = document.createElement("pre");
    pre.style.cssText = "background:#fcf9f6;border:1px solid #eee6de;border-radius:12px;padding:12px;font:11px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;white-space:pre-wrap;word-break:break-word;max-height:180px;overflow:auto;margin-bottom:12px";
    pre.textContent = "";

    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:10px;justify-content:flex-end";

    function mkBtn(label, kind) {
      var b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "border:0;cursor:pointer;font:800 12px system-ui,-apple-system,sans-serif;border-radius:999px;padding:10px 16px;transition:transform .05s ease";
      if (kind === "allow") {
        b.style.background = "#1e1e1e";
        b.style.color = "#fffcf8";
      } else {
        b.style.background = "transparent";
        b.style.border = "1.5px solid #1e1e1e";
        b.style.color = "#1e1e1e";
      }
      return b;
    }

    var blockBtn = mkBtn("Block", "block");
    var allowBtn = mkBtn("Allow", "allow");

    blockBtn.onclick = function() {
      try { if (onBlock) onBlock(); } finally { overlay.remove(); }
    };
    allowBtn.onclick = function() {
      try { if (onAllow) onAllow(); } finally { overlay.remove(); }
    };

    row.appendChild(blockBtn);
    row.appendChild(allowBtn);

    card.appendChild(header);
    card.appendChild(p);
    card.appendChild(pre);
    card.appendChild(row);
    overlay.appendChild(card);
    document.documentElement.appendChild(overlay);

    return { overlay: overlay, pre: pre };
  }

  function postJson(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function(r) {
      return r.text().then(function(t) {
        var j;
        try { j = JSON.parse(t); } catch(e) { j = { raw: t }; }
        if (!r.ok) throw new Error("HTTP " + r.status + ": " + t);
        return j;
      });
    });
  }

  document.addEventListener("click", function(ev) {
    var target = ev.target;
    var btn = target && target.closest ? target.closest("button,[role='button']") : null;
    if (!btn) return;
    if (!isSendButton(btn)) return;

    // Prevent recursion when we re-click after allow
    if (btn[FLAG_KEY]) {
      btn[FLAG_KEY] = false;
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    var msg = findComposerText();
    var prod = product();

    var ticket = null;

    var decidePayload = {
      product: prod,
      host: host(),
      action: "chat.send",
      ts: nowIso(),
      meta: {
        length: msg.length,
        preview: msg.slice(0, 160)
      }
    };

    var modal = createModal({
      body: "AI wants to send a message on " + prod.toUpperCase() + ". Kasbah requires a local ticket before this action can proceed.",
      onAllow: function() {
        if (!ticket) return;
        postJson(GUARD + "/consume", { ticket: ticket, choice: "ALLOW" })
          .then(function(res) {
            if (res && res.decision === "ALLOW") {
              btn[FLAG_KEY] = true;
              btn.click();
            }
          })
          .catch(function(e) {
            // Default deny on error
          });
      },
      onBlock: function() {
        if (!ticket) return;
        postJson(GUARD + "/consume", { ticket: ticket, choice: "DENY" })
          .catch(function() {});
      }
    });

    modal.pre.textContent = "Requesting ticket from local guard...";

    postJson(GUARD + "/decide", decidePayload)
      .then(function(res) {
        ticket = res.ticket;
        modal.pre.textContent = JSON.stringify(res, null, 2) + "\n\nChoose Allow or Block.";
        if (!ticket) throw new Error("No ticket returned");
      })
      .catch(function(e) {
        modal.pre.textContent =
          "Kasbah Guard is OFF or unreachable.\n\n" +
          "Default DENY: message NOT sent.\n\n" +
          "Open the Kasbah Guard macOS app to start the local guard service.\n\n" +
          String(e);
      });
  }, true);
})();
