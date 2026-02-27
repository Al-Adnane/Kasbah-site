# Kasbah Guard — Testing Guide

> Version 3.0 | Last updated Feb 27, 2026

---

## 1. Load the Extension

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (toggle, top right)
3. Click **Load unpacked**
4. Select: `kasbah-guard-dist/extensions/chrome`
5. Verify: Kasbah Guard appears with version badge, no red error indicator

**Expected console output on any page load:**
```
[Kasbah Guard] 13-moat egress gate active ✓ (fetch · XHR · beacon · WS · form · ws:url · window.open · src-MO · b64 · fallback · frozen · self-heal · local)
```

---

## 2. The Gauntlet — 15-Vector Security Test

The gauntlet simulates a malicious page trying to exfiltrate a secret (`sk-proj-1234567890abcdefghijklmnopqrstuvwxyz`) using every possible network channel.

### Setup

```bash
cd kasbah-guard-dist
npm install          # installs ws dependency (one time)
npm run gauntlet     # starts HTTP + WebSocket server on :8789
```

Open `http://127.0.0.1:8789/gauntlet.html` with Kasbah Guard active.

### Running

Click each **Run** button one at a time. Watch the terminal for hits.

When done, press **Ctrl+C** in the terminal. The server prints a verdict.

**Pass condition:** Zero lines in the log `[]`. Any line starting with `🚨 FAIL` means that vector leaked.

### 15 Vectors

| # | Vector | API used | Description |
|---|--------|----------|-------------|
| V01 | fetch() POST | `window.fetch` | Basic JSON POST with secret in body |
| V02 | XHR | `XMLHttpRequest` | Legacy AJAX with secret in body |
| V03 | sendBeacon | `navigator.sendBeacon` | Fire-and-forget, fires even on tab close |
| V04 | WebSocket | `WebSocket.send()` | Live stream of secret |
| V05 | form.submit() via code | `HTMLFormElement.prototype.submit` | Programmatic form submit (no event fired) |
| V06 | Enter key submit | submit event | Keyboard-triggered form submit |
| V07 | Clipboard API | `navigator.clipboard.writeText` | Writes secret to clipboard (no server hit — expected clean) |
| V08 | Drag & drop | DataTransfer | Drag secret out of page |
| V09 | `<img>` src GET | DOM attribute | `img.src = "?key=..."` — GET request, no fetch() |
| V10 | Wrapped fetch | `window.fetch` (obfuscated) | Secret in obfuscated wrapper function |
| V11 | Base64 encoded | `window.fetch` | `{"data":"c2stcHJvai0...","encoding":"base64"}` |
| V12 | `<script>` src | DOM attribute | `script.src = "?key=..."` |
| V13 | DOM mutation → fetch | `window.fetch` (delayed) | MutationObserver triggers fetch after DOM change |
| V14 | setTimeout fetch | `window.fetch` (delayed) | fetch fires 5 seconds after button click |
| V15 | Textarea → fetch | `window.fetch` | Reads textarea value and sends |

### Expected results after v3.0

| Vector | Blocked by |
|--------|-----------|
| V01 | Moat 2 (fetch hook) + Moat 5 (fallback) |
| V02 | Moat 2 (XHR.send hook) |
| V03 | Moat 2 (beacon hook) |
| V04 | Moat 2 (WS.send hook) |
| V05 | Moat 2 (form.submit prototype) |
| V06 | Moat 2 (submit event listener) |
| V07 | N/A — clipboard write, no server hit (expected clean) |
| V08 | Layer 1 (drag-drop interceptor) |
| V09 | Moat 8 (MutationObserver src) |
| V10 | Moat 2 (fetch hook) + Moat 5 |
| V11 | Moat 9 (base64 decode) + Moat 2 |
| V12 | Moat 8 (MutationObserver src) |
| V13 | Moat 2 (fetch hook) |
| V14 | Moat 2 (fetch hook) |
| V15 | Moat 2 (fetch hook) |

### Gauntlet server base64 detection

The server (`gauntlet_server.js`) decodes base64 segments before comparing to the secret — catches V11 server-side even if the client doesn't block it:

```javascript
const SECRET_B64 = Buffer.from(SECRET).toString("base64");
function bodyContainsSecret(str) {
  if (str.includes(SECRET)) return true;
  if (str.includes(SECRET_B64)) return true;
  // Also try decoding all base64-looking segments
  const b64matches = str.match(/[A-Za-z0-9+/]{20,}={0,2}/g) || [];
  for (const m of b64matches) {
    try { if (Buffer.from(m,'base64').toString('utf8').includes(SECRET)) return true; } catch {}
  }
  return false;
}
```

---

## 3. Verb Testing Matrix

Test each of the 6 UI verbs (Layer 1 / Sovereign Intent Layer) on a live AI platform (chatgpt.com, claude.ai, gemini.google.com).

### Verb 1 — SEND

| Test | Input | Expected |
|------|-------|----------|
| ALLOW | "How do I deploy a web server?" | Sends silently, no UI |
| WARN | "I need to securely store my database password" | Toast appears, message sends |
| DENY | `sk-proj-1234567890abcdefghijklmnopqrstuvwxyz` | Modal blocks, user chooses |
| DENY override | Same + click "Send Anyway" | Sends, logs OVERRIDE_ALLOW |

### Verb 2 — PASTE

| Test | Input | Expected |
|------|-------|----------|
| ALLOW | Normal text | Pastes instantly |
| WARN | `password: My@secretPassword123` | Toast, paste proceeds |
| DENY | `-----BEGIN PRIVATE KEY-----\n...` | Modal, paste blocked |

### Verb 3 — UPLOAD

| Test | File | Expected |
|------|------|----------|
| ALLOW | README.md (no secrets) | Uploads silently |
| DENY | `.env` with `API_KEY=sk-...` | Modal blocks upload |
| DENY | `config.json` with `"password": "..."` | Modal blocks upload |
| DENY (filename) | `passport.jpg` (any content) | Modal — sensitive filename |
| DENY (filename) | `بطاقة.pdf` | Modal — Arabic ID document |

### Verb 4 — EDIT (AI code apply/accept)

| Test | Content | Expected |
|------|---------|----------|
| ALLOW | Safe code without secrets | Accept proceeds |
| DENY | Code with `api_key = "sk-proj-..."` | Modal before accepting |

### Verify the audit trail

```javascript
// Run in browser DevTools on any AI platform where Kasbah is active
JSON.parse(localStorage.getItem('kasbah_logs'))
```

Expected entry format:
```json
{
  "action": "BLOCKED",
  "verb": "send",
  "risk": 70,
  "reason": "OpenAI API key",
  "text": "sk-proj-1234567890abc...",
  "time": "2026-02-27T12:34:56Z"
}
```

---

## 4. Detection Engine Unit Tests

Run directly in browser console or Node.js:

```javascript
// Node.js
const { classify } = require('./kasbah-guard-dist/extensions/chrome/src/detector.js');

// Test cases
console.assert(classify("hello world").decision === "ALLOW");
console.assert(classify("sk-proj-1234567890abcdefghijklmnopqrstuvwxyz").decision === "DENY");
console.assert(classify("-----BEGIN PRIVATE KEY-----\nMIIE...").decision === "DENY");
console.assert(classify("password=mysecretpassword").decision === "WARN");
console.assert(classify("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIn0.abc123def456").decision !== "ALLOW");
console.assert(classify("4111-1111-1111-1111").decision === "DENY"); // CC
console.assert(classify("123-45-6789").decision === "DENY");          // SSN
console.assert(classify("AKIAIOSFODNN7EXAMPLE").decision === "DENY"); // AWS
```

### Risk score table (reference)

| Input | Expected risk | Expected decision |
|-------|--------------|------------------|
| "hello world" | ~0 | ALLOW |
| "password=x" | ~45 | WARN |
| "api_key=test123abc" | ~50 | WARN |
| `sk-proj-...` | 70 | DENY |
| `-----BEGIN PRIVATE KEY-----` | 90 | DENY |
| `mongodb://user:pass@db:5432/prod` | 75 | DENY |
| JWT (3-segment, 10+ chars each) | ~40 | WARN |

---

## 5. Multilingual Filename Tests

| Filename | Language | Expected |
|----------|----------|----------|
| `passport.jpg` | English | BLOCK |
| `passeport.pdf` | French | BLOCK |
| `reisepass.pdf` | German | BLOCK |
| `pasaporte.jpg` | Spanish | BLOCK |
| `بطاقة.pdf` | Arabic | BLOCK |
| `Personalausweis.pdf` | German | BLOCK |
| `DNI.pdf` | Spanish | BLOCK |
| `carte_identite.pdf` | French | BLOCK |
| `PESEL.pdf` | Polish | BLOCK |
| `BSN.pdf` | Dutch | BLOCK |
| `photo.jpg` | — | ALLOW |
| `resume.pdf` | — | ALLOW |

---

## 6. Debugging

### Extension not injecting

Check: Is the extension enabled at `chrome://extensions/`?
Check: Does the page URL match `<all_urls>`? (It should — we removed the domain restriction in v3.0)
Check: Open DevTools on the page → Console → Look for the `[Kasbah Guard] 13-moat egress gate active ✓` log

### "classify is not defined"

This means `detector.js` didn't load before `content.js`. Verify `manifest.json` lists `detector.js` first in the `js` array:
```json
"js": ["src/detector.js", "src/content.js"]
```

### Modal not appearing

Open DevTools → Console → Run:
```javascript
getDecision("sk-proj-1234567890abcdefghijklmnopqrstuvwxyz")
// Should return "DENY"
```

If it returns "ALLOW", the detection engine isn't loaded. Reload the extension.

### Gauntlet server not starting

```bash
cd kasbah-guard-dist
npm install   # makes sure ws package is installed
node gauntlet_server.js
```

Requires Node.js 18+. Port 8789 must be free.

---

## 7. Chrome Web Store Submission

1. Bump version in `manifest.json`
2. Create ZIP: `cd kasbah-guard-dist/extensions && zip -r kasbah-guard-chrome.zip chrome/`
3. Upload to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
4. Google review: 1–3 business days

Current store listing: https://chromewebstore.google.com/detail/kasbah-guard/idikjiajiomhekkkpfkhnpfepfgknokc
