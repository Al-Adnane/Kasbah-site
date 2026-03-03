// Kasbah Secret Guard — Content Script
// Intercepts outgoing network requests to prevent API key / credential exfiltration
// Inspired by the websocket-guard.js from the reference codebase (TAR2)
//
// Protects against:
//   - Fetch POST/GET with secrets in body or URL
//   - XHR with secrets in request body or headers
//   - WebSocket messages with embedded credentials
//   - Form submissions with secrets in field values
//
// All detection is LOCAL — no data is sent anywhere except to block the request.

(function() {
  'use strict';

  // Injection guard — only install once per page
  if (window.__KASBAH_SECRET_GUARD_ACTIVE) return;
  window.__KASBAH_SECRET_GUARD_ACTIVE = true;

  // ── Secret patterns (CRITICAL tier — immediate block) ──────────────────
  var SECRET_PATTERNS = [
    { name: 'openai_key',      re: /sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/g },
    { name: 'openai_proj_key', re: /sk-proj-[A-Za-z0-9\-_]{50,120}/g },
    { name: 'anthropic_key',   re: /sk-ant-api\d{2}-[A-Za-z0-9\-_]{80,120}/g },
    { name: 'aws_access_key',  re: /AKIA[A-Z0-9]{16}/g },
    { name: 'github_token',    re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
    { name: 'stripe_live',     re: /sk_live_[A-Za-z0-9]{24,}/g },
    { name: 'google_api_key',  re: /AIza[0-9A-Za-z\-_]{35}/g },
    { name: 'slack_token',     re: /xox[bpasr]-[0-9\-a-zA-Z]{20,}/g },
    { name: 'rsa_private_key', re: /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/g },
    { name: 'jwt_hs256',       re: /eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}/g },
    { name: 'generic_api_key', re: /(?:api[_\-]?key|apikey)\s*[:=]\s*["']?[A-Za-z0-9\/+]{20,}["']?/gi },
  ];

  // ── Obfuscation decoders ───────────────────────────────────────────────
  function tryBase64Decode(str) {
    try {
      var padded = str + '==='.slice((str.length + 3) % 4);
      var decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
      if (decoded && decoded.length > 5) return decoded;
    } catch (e) {}
    return null;
  }

  function decodeUnicodeEscapes(str) {
    try {
      return str.replace(/\\u([0-9a-fA-F]{4})/g, function(_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      });
    } catch (e) { return str; }
  }

  // ── Core scanning ──────────────────────────────────────────────────────
  function scanForSecrets(text) {
    if (!text || typeof text !== 'string') return null;
    if (text.length > 1000000) text = text.slice(0, 1000000); // cap at 1MB

    var textsToScan = [text];

    // Try base64 decoded version
    var b64matches = text.match(/[A-Za-z0-9+/]{20,}={0,2}/g) || [];
    b64matches.slice(0, 10).forEach(function(m) {
      var decoded = tryBase64Decode(m);
      if (decoded) textsToScan.push(decoded);
    });

    // Try unicode decode
    var unescaped = decodeUnicodeEscapes(text);
    if (unescaped !== text) textsToScan.push(unescaped);

    for (var i = 0; i < textsToScan.length; i++) {
      var scan = textsToScan[i];
      for (var j = 0; j < SECRET_PATTERNS.length; j++) {
        SECRET_PATTERNS[j].re.lastIndex = 0; // reset regex state
        if (SECRET_PATTERNS[j].re.test(scan)) {
          return SECRET_PATTERNS[j].name;
        }
      }
    }
    return null;
  }

  function notifyBackground(type, secretName, url) {
    try {
      chrome.runtime.sendMessage({
        type: 'SECRET_EXFILTRATION_BLOCKED',
        secretName: secretName,
        requestType: type,
        url: url ? url.replace(/^https?:\/\/[^/]+/, '[HOST]') : 'unknown',
        timestamp: new Date().toISOString(),
      });
    } catch (e) {}
  }

  // ── Intercept: fetch ────────────────────────────────────────────────────
  var _originalFetch = window.fetch;
  window.fetch = function(resource, init) {
    var url = (typeof resource === 'string') ? resource : (resource && resource.url) || '';

    // Check URL params
    var urlSecret = scanForSecrets(url);
    if (urlSecret) {
      notifyBackground('fetch_url', urlSecret, url);
      console.warn('[Kasbah Guard] Blocked fetch: secret "' + urlSecret + '" found in URL');
      return Promise.reject(new Error('[Kasbah Guard] Blocked: credential detected in request URL'));
    }

    // Check body
    if (init && init.body) {
      var body = init.body;
      var bodyStr = (typeof body === 'string') ? body
        : (body instanceof URLSearchParams) ? body.toString()
        : null;
      if (bodyStr) {
        var bodySecret = scanForSecrets(bodyStr);
        if (bodySecret) {
          notifyBackground('fetch_body', bodySecret, url);
          console.warn('[Kasbah Guard] Blocked fetch: secret "' + bodySecret + '" found in request body');
          return Promise.reject(new Error('[Kasbah Guard] Blocked: credential detected in request body'));
        }
      }
    }

    return _originalFetch.apply(this, arguments);
  };

  // ── Intercept: XMLHttpRequest ───────────────────────────────────────────
  var _originalXHROpen = XMLHttpRequest.prototype.open;
  var _originalXHRSend = XMLHttpRequest.prototype.send;
  var _originalXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function(method, url) {
    var urlSecret = scanForSecrets(String(url || ''));
    if (urlSecret) {
      notifyBackground('xhr_url', urlSecret, url);
      console.warn('[Kasbah Guard] Blocked XHR open: secret "' + urlSecret + '" in URL');
      this._kasbah_blocked = true;
      return;
    }
    this._kasbah_url = url;
    return _originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    var headerSecret = scanForSecrets(String(value || ''));
    if (headerSecret) {
      notifyBackground('xhr_header', headerSecret, this._kasbah_url);
      console.warn('[Kasbah Guard] Blocked XHR header: secret "' + headerSecret + '" in header "' + name + '"');
      this._kasbah_blocked = true;
      return;
    }
    return _originalXHRSetHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (this._kasbah_blocked) return;
    if (body) {
      var bodyStr = (typeof body === 'string') ? body : null;
      if (bodyStr) {
        var bodySecret = scanForSecrets(bodyStr);
        if (bodySecret) {
          notifyBackground('xhr_body', bodySecret, this._kasbah_url);
          console.warn('[Kasbah Guard] Blocked XHR send: secret "' + bodySecret + '" in body');
          this._kasbah_blocked = true;
          return;
        }
      }
    }
    return _originalXHRSend.apply(this, arguments);
  };

  // ── Intercept: WebSocket ────────────────────────────────────────────────
  var _OriginalWebSocket = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    var wsSecret = scanForSecrets(String(url || ''));
    if (wsSecret) {
      notifyBackground('websocket_url', wsSecret, url);
      console.warn('[Kasbah Guard] Blocked WebSocket: secret "' + wsSecret + '" in URL');
      throw new Error('[Kasbah Guard] Blocked: credential detected in WebSocket URL');
    }

    var ws = protocols
      ? new _OriginalWebSocket(url, protocols)
      : new _OriginalWebSocket(url);

    var _originalSend = ws.send.bind(ws);
    ws.send = function(data) {
      var dataStr = (typeof data === 'string') ? data : null;
      if (dataStr) {
        var msgSecret = scanForSecrets(dataStr);
        if (msgSecret) {
          notifyBackground('websocket_message', msgSecret, url);
          console.warn('[Kasbah Guard] Blocked WebSocket message: secret "' + msgSecret + '"');
          return;
        }
      }
      return _originalSend(data);
    };

    return ws;
  };
  window.WebSocket.prototype = _OriginalWebSocket.prototype;
  window.WebSocket.CONNECTING = _OriginalWebSocket.CONNECTING;
  window.WebSocket.OPEN = _OriginalWebSocket.OPEN;
  window.WebSocket.CLOSING = _OriginalWebSocket.CLOSING;
  window.WebSocket.CLOSED = _OriginalWebSocket.CLOSED;

  // ── Intercept: Form submit ─────────────────────────────────────────────
  document.addEventListener('submit', function(event) {
    var form = event.target;
    if (!form || form.tagName !== 'FORM') return;
    var inputs = form.querySelectorAll('input, textarea');
    for (var i = 0; i < inputs.length; i++) {
      var val = inputs[i].value || '';
      var inputSecret = scanForSecrets(val);
      if (inputSecret) {
        event.preventDefault();
        event.stopPropagation();
        notifyBackground('form_submit', inputSecret, window.location.href);
        console.warn('[Kasbah Guard] Blocked form submit: secret "' + inputSecret + '" in field "' + (inputs[i].name || inputs[i].id) + '"');
        break;
      }
    }
  }, true);

  console.log('[Kasbah Guard] Secret Guard active — monitoring fetch, XHR, WebSocket, and forms');
})();
