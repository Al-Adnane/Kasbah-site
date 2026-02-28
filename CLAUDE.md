# CLAUDE.md — Kasbah Guard Project Rules

## LOCKED FILES — DO NOT MODIFY WITHOUT EXPLICIT PERMISSION

These files are finalized. Read them, reference them, but NEVER edit them:

| File | Reason |
|------|--------|
| `kasbah-guard-dist/Cargo.toml` | Workspace config locked (members: kasbah-kernel, kasbah-wasm, desktop) |
| `kasbah-guard-dist/apps/desktop/src-tauri/tauri.conf.json` | Tauri config locked (withGlobalTauri, bundle ID, etc.) |
| `api/wrangler.toml` | Cloudflare Worker config locked |
| `CNAME` | Domain config locked (bekasbah.com) |

## LOCKED DECISIONS — NEVER CHANGE

### Brand
- **Brand color**: `#C1440E` (Kasbah Red) — NEVER change
- **UX/Design**: All website design is LOCKED — no visual changes without explicit permission
- **Logo, fonts, layout**: DO NOT touch

### Architecture
- **Extension is 100% independent from Desktop App** — zero dependency, runs standalone in browser
- **detector.js + content.js**: All detection is LOCAL JavaScript, no server calls
- **No /decide endpoint**: Extension never calls the desktop guard service
- **6 browser copies of detector.js must always be identical** (Chrome, Firefox, Edge, Opera, Safari, Tauri)
- **7 copies of content.js must always be identical** (above + desktop dist)

### Personas (Phase 1 — locked)
1. Consultants
2. Freelancers
3. Founders
4. Teams

**NOT Phase 1**: developers, CTOs, security teams, compliance officers, lawyers, healthcare, enterprises

### Product (locked)
- **The product is the FREE browser extension** — that's it
- **NO pricing, NO billing, NO Stripe, NO checkout** — forget it entirely
- **NO desktop app in scope** — extension is standalone, never mention Tauri/desktop to users
- All install links go directly to browser stores (Chrome Web Store, Firefox AMO, Safari)
- **NEVER add pricing pages, billing flows, or payment references to the website**

### Policy
- **NO public downloads** — access-gated via waitlist/access code

## BEFORE MAKING CHANGES — CHECKLIST

1. **Is the file in the LOCKED FILES table?** → Do NOT edit. Ask first.
2. **Does the change affect brand/UX/design?** → Do NOT proceed. Ask first.
3. **Does the change affect architecture (extension↔app relationship)?** → Do NOT proceed. Ask first.
4. **Does the change remove files?** → Keep anything potentially useful for future. Only remove truly dead/duplicate files.
5. **Does the change modify Cargo.toml workspace members?** → Do NOT proceed. Ask first.

## AFTER MAKING CHANGES — VERIFICATION

1. **detector.js**: Run `node fortress_grade_final_verification.cjs` — must pass
2. **detector.js**: Verify all 6 browser copies have identical MD5 hash
3. **content.js**: Verify all 7 copies have identical MD5 hash
4. **selfTest()**: Must pass all invariants (currently 15/15)
5. **Website**: All pages must return 200 on bekasbah.com
6. **API**: Health check must return `{"ok":true}` on api.bekasbah.com

## BUILD & DEPLOY

- **Rust build**: `CARGO_TARGET_DIR=/tmp/kasbah-build cargo build --release`
- **Deploy desktop**: `cp /tmp/kasbah-build/release/kasbah_guard_desktop "/Applications/KasbahGuard.app/Contents/MacOS/kasbah_guard_desktop"`
- **Deploy website**: Push to `main` → Cloudflare Pages auto-deploys from `public/`
- **Deploy API**: `cd api && wrangler deploy`
- **Git flags**: Always use `git -c core.trustctime=false -c core.checkStat=minimal`

## CURRENT VERSIONS — KASBAH 1.0.0

- **All extensions**: v1.0.0 (Chrome, Firefox, Edge, Opera, Safari)
- **detector.js**: v3.3.0 (hash: `bedcedf3a5ecee575c2a4bdfe423e591`) — identical across all 5 browsers
- **content.js**: v1.0.0 (hash: `8fbad41322c21c98839352ac204564f5`) — identical across all 5 browsers
- **Fortress Grade**: 34/34 (100% — UNBREAKABLE)
- **selfTest**: 15/15 invariants PASS

## LOCKED ARCHITECTURE — SESSION FINAL (NON-REGRESS)

### 18-Moat Egress Gate (content.js lines 1-378)
- **MOAT 1**: `document_start` + `world:MAIN` in manifest
- **MOAT 2-7**: 5 API hooks (fetch, XHR, beacon, WebSocket, form) + window.open
- **MOAT 8**: MutationObserver src-attribute scan (img, script, iframe, link tags)
- **MOAT 9**: Base64 decode + pattern scan (catches encoded payloads)
- **MOAT 10-11**: Shannon entropy + 22-pattern detector engine (detector.js)
- **MOAT 12**: `<all_urls>` omnipresent coverage in manifest
- **MOAT 13**: Zero-latency local detection, no server calls
- **MOAT 14-18**: BroadcastChannel, SharedWorker, RTCDataChannel, window.name, Blob URL interception

### Same-Site Bypass (CRITICAL FIX — locked)
- **Lines 36-56**: `_isSameSite()` function checks if URL is same-origin or same-domain
- **Lines 106-110, 161-181**: `scanUrl()` returns false for same-site; `scanBody()` skipped for same-site URLs
- **Lines 204-206**: WebSocket send checks stored URL via WeakMap, skips scan if same-site
- **Lines 148-151, 174-180**: fetch/XHR/beacon all respect same-site bypass
- **Rationale**: Same-site requests are NOT exfiltration (site already has access); only cross-origin requests scanned

### Approval Window (CRITICAL FIX — locked)
- **Line 147**: `window.__kasbah_approved_until` bridges egress gate IIFE to SEND handler
- **Lines 1100-1103, 1284-1286**: SEND modal onAllow sets `window.__kasbah_approved_until = Date.now() + 5000`
- **Lines 163, 180**: fetch/XHR/beacon checks approval window; if active, skips body scan
- **Rationale**: Prevents double-jeopardy (user approves via modal, then egress gate blocks the same content at fetch level)

### Upload Handler (CRITICAL FIX — locked)
- **Lines 1461-1509**: File input change event — seize files immediately with `stopImmediatePropagation()`
- **Lines 1467-1476**: Clear input immediately, save files to DataTransfer, scan saved copies
- **Lines 1315-1345**: Image paste detection — check `clipboardData.items` for image types, route to upload guard
- **Lines 1678-1707**: Drag-and-drop file detection with same immediate seize pattern
- **Rationale**: Prevents race condition where web app reads files before modal shows

### Paste Handler (CRITICAL FIX — locked)
- **Lines 1306-1345**: Intercept paste, check for images in `clipboardData.items`
- **Line 1361**: Use `stopImmediatePropagation()` (not just stopPropagation) to prevent platform handlers
- **Lines 1358-1360**: Allow decision skips interception entirely (removed length check that was causing false interceptions)
- **Lines 1413-1423**: Method 3 fallback removed empty DataTransfer; now just tells user to Ctrl+V
- **Rationale**: Images pasted from clipboard (screenshots of sensitive docs) must be intercepted

### SEND Handler (LOCKED)
- **Lines 1239-1300**: Detect send button via aria-label, title, data-testid, SVG path, or position heuristics
- **Lines 1247-1253**: Classify message text, show DENY modal if risk > 70
- **Lines 1284-1286, 1100-1103**: onAllow sets approval window so egress gate doesn't double-block
- **Platforms supported**: ChatGPT (#prompt-textarea), Claude (.ProseMirror), Gemini (.ql-editor), DeepSeek (#chat-input), Grok, Perplexity (textarea), Copilot, Poe, etc.

### Beacon Body Scanning (CRITICAL FIX — locked)
- **Lines 174-180**: Beacons use `_fallbackDeny()` ONLY (SSN, CC, private keys, AWS keys, JWT patterns)
- **NOT used**: Full classifier which triggers on analytics session tokens
- **Rationale**: Analytics SDKs send session IDs that look like secrets but aren't; beacon bodies are fire-and-forget, never user data

### Request Object Bypass (CRITICAL FIX — locked)
- **Lines 148-152**: fetch hook checks if input is a Request object
- **Line 150**: Extracts `input.url` for URL scanning (not String(request) which gives "[object Request]")
- **Line 151**: Extracts `input.body` from Request if init.body is undefined
- **Rationale**: Modern frameworks use `fetch(new Request(...))` which bypassed URL/body scanning entirely

### WebSocket Same-Site (CRITICAL FIX — locked)
- **Line 143**: WeakMap `_wsUrls` tracks WebSocket URLs at construction
- **Lines 211-221**: WebSocket constructor stores URL in WeakMap: `_wsUrls.set(ws, _s(url))`
- **Lines 202-206**: WebSocket send checks `_wsUrls.get(this)`, skips scan if same-site
- **Rationale**: Prevents blocking legitimate WebSocket streams on ChatGPT, Claude (which use streaming)

### Trusted Types CSP Fallback (CRITICAL FIX — locked)
- **Lines 658, 843**: SVG innerHTML wrapped in try/catch with emoji text fallback
- **Rationale**: ChatGPT and other platforms enforce Trusted Types CSP; `innerHTML` assignment throws error

### No Regress Rules
1. **detector.js**: NEVER remove patterns. Only ADD patterns for new document types.
2. **content.js**: NEVER remove moats. Only ADD moats if new exfiltration vector discovered.
3. **Hashes**: If content.js or detector.js changes, ALL 5 browser copies must have identical hash. If hashes diverge, it's a BUG.
4. **Manifests**: All 5 manifests must have identical version (currently 1.0.0) and must all have `world: "MAIN"`, `run_at: "document_start"`, `all_frames: true` where applicable.
5. **Same-site bypass**: NEVER remove. It's the reason the extension doesn't break AI platforms.
6. **Approval window**: NEVER remove. It's the reason "Proceed Anyway" works without egress gate re-blocking.
7. **Image paste intercept**: NEVER remove. It's the only defense against screenshot exfiltration.

### Test Files (IMMUTABLE)
- `kasbah-guard-dist/fortress_grade_final_verification.cjs`: Must always pass 34/34
- `kasbah-guard-dist/extensions/chrome/src/detector.js`: Must always pass selfTest() 15/15
- If either test fails, the change is BROKEN and must be reverted immediately
