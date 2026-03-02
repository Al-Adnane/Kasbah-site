# CLAUDE.md — Kasbah Guard Project Rules

## 🚀 STATUS: PRODUCTION READY (March 2, 2026)
**All 4 critical issues FIXED. All tests PASSING. Ready for market deployment.**
- ✅ SDK Constitutional AI verified
- ✅ All products v1.0.0 aligned
- ✅ detector.js fully synchronized (6/6 copies identical)
- ✅ API worker KV namespace configured
- ✅ 58/58 market launch tests passing
- ✅ 10/10 CLI tests passing
- **Commit: 7a4e8cf** — Critical fixes applied

---

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
- **NO pricing, NO billing, NO Stripe, NO checkout** — Stripe is PERMANENTLY REMOVED, never re-add it
- **NO desktop app in scope** — extension is standalone, never mention Tauri/desktop to users
- All install links go directly to browser stores (Chrome Web Store, Firefox AMO, Safari)
- **NEVER add pricing pages, billing flows, or payment references to the website**

### Policy
- **NO public downloads** — access-gated via waitlist/access code

## CRITICAL: EXECUTION RULES (From User Insights — March 2, 2026)

**These rules eliminate 9/18 friction events and prevent wasted sessions:**

### 1. Autonomous Execution (NO asking for permission)
- **NEVER** ask "Should I proceed?", "Do you want me to?", "Shall I?", or offer multiple options
- **ALWAYS** execute the plan directly unless the action is genuinely ambiguous or destructive
- **If blocked**: Flag the issue and propose a workaround — do NOT wait for user approval
- **Result**: Saves ~3 hours/month on permission-checking cycles

### 2. Proactive Status Updates (NO waiting to be asked)
- Provide brief progress updates every 3-5 minutes during long-running tasks (>5 min)
- **NEVER** go silent for extended periods without explanation
- If a task is taking longer than expected, SAY SO immediately and explain why
- Use phrases like "Status: X% complete, currently [doing Y], Z remaining"
- **Result**: Eliminates repetitive "update?", "where is it?" prompts

### 3. Accuracy & NO Fabrication
- **NEVER** fabricate metrics, traction data, user counts, revenue, or quantitative claims
- If data is unknown, say "unknown" or "not yet measured" — do NOT guess
- This project includes ideation-stage ventures — do NOT assume traction exists
- Every claim must cite actual source (file:line number) if requested
- **Result**: Prevents hallucinated metrics from reaching stakeholders

### 4. Architecture Constraints (LOCKED)
- **Kasbah Guard is 100% browser extension** — there is NO desktop app, NO localhost server, NO daemon
- Do NOT introduce or assume any localhost/port dependencies (e.g., port 8788, Guard service)
- The extension must work independently in the browser with zero local server requirements
- This is the #1 source of wrong assumptions — verify before proceeding
- **Result**: Eliminates architectural regressions that waste correction cycles

### 5. Task Completion (NO stalling on single issues)
- **ALWAYS** finish the current task before moving on
- If a task is complex, break it into phases and complete each phase fully
- **DO NOT** stall on a single sub-problem for more than 10 minutes
  - If stuck >10 min: escalate, try alternative approach, or flag blocker and move on to other work
- Prevents the "32-minute debugging loop" anti-pattern
- **Result**: Saves ~5 hours/month on stuck sessions

### 6. User Test Suites (TREAT AS AUTHORITATIVE)
- When the user provides a custom test suite or test script, **run it as-is**
- Do NOT dismiss it, redirect to built-in tests, or question its validity
- Treat user-provided test infrastructure as the source of truth
- If tests fail, fix the code — do NOT skip the test

## BEFORE MAKING CHANGES — CHECKLIST

1. **Is the file in the LOCKED FILES table?** → Do NOT edit. Ask first.
2. **Does the change affect brand/UX/design?** → Do NOT proceed. Ask first.
3. **Does the change affect architecture (extension↔app relationship)?** → Do NOT proceed. Ask first.
4. **Does the change remove files?** → Keep anything potentially useful for future. Only remove truly dead/duplicate files.
5. **Does the change modify Cargo.toml workspace members?** → Do NOT proceed. Ask first.
6. **Have I verified architecture constraints?** → Confirm no localhost/server dependencies assumed.
7. **Is this a multi-phase task?** → Use phase-based execution; complete Phase 1 fully before Phase 2.

## AFTER MAKING CHANGES — VERIFICATION

1. **detector.js**: Run `node /tmp/kasbah-market-launch.cjs` — must pass 58/58
2. **detector.js**: selfTest() must return 29/29
3. **detector.js**: All 6 copies MD5 = `da0c921073795c30ffc9b0de46afc6aa`
4. **content.js**: All 7 copies MD5 = `51961596422dd31bf0b1ce6e016e413a`
5. **CLI**: `/tmp/kasbah-cli-build/release/kasbah selftest` → 10/10
6. **Website**: All pages must return 200 on bekasbah.com
7. **API**: `curl https://api.bekasbah.com/health` → `{"ok":true}`

## BUILD & DEPLOY

- **CLI build**: `CARGO_TARGET_DIR=/tmp/kasbah-cli-build cargo build --release --manifest-path kasbah-guard-dist/apps/cli/Cargo.toml`
- **CLI binary**: `/tmp/kasbah-cli-build/release/kasbah`
- **Rust build**: `CARGO_TARGET_DIR=/tmp/kasbah-build cargo build --release`
- **Deploy desktop**: `cp /tmp/kasbah-build/release/kasbah_guard_desktop "/Applications/KasbahGuard.app/Contents/MacOS/kasbah_guard_desktop"`
- **Deploy website**: Push to `main` → Cloudflare Pages auto-deploys from `public/`
- **Deploy API**: `cd api && wrangler deploy`
- **Git flags**: Always use `git -c core.trustctime=false -c core.checkStat=minimal`

## CURRENT VERSIONS — LOCKED AT v1.0.0

### All products: v1.0.0
| Product | File |
|---------|------|
| Chrome / Firefox / Edge / Opera / Safari extensions | `extensions/*/manifest.json` |
| CLI (kasbah) | `apps/cli/Cargo.toml` |
| VS Code extension | `apps/vscode/package.json` |
| @kasbah/guard SDK | `packages/sdk/package.json` |
| Enterprise dashboard | `apps/enterprise/package.json` |
| Mobile (Tauri) | `apps/mobile/package.json` |

### Engine (CRITICAL FIXES APPLIED — March 2, 2026)
- **detector.js PATTERN_VERSION**: `1.0.0` ✅
- **detector.js MD5** (all 6 copies): `da0c921073795c30ffc9b0de46afc6aa` ✅ SYNCED
- **content.js MD5** (all 7 copies): `51961596422dd31bf0b1ce6e016e413a`
- **selfTest()**: 29/29 PASS ✅
- **Market launch**: 58/58 PASS ✅
- **CLI selftest**: 10/10 PASS ✅
- **SDK ENGINE_VERSION**: `1.0.0` ✅
- **VS Code EXPECTED_ENGINE**: `1.0.0` ✅
- **API worker**: v2.0.0 (with KASBAH_KV namespace configured)

### API endpoints (v2.0.0)
Auth: `POST /auth/register|verify|resend|login|logout` · `GET /auth/me|stats`
Enterprise (Bearer): `GET /api/stats|audit/recent|policies|team` · `POST /api/scan`
Moats: `GET /health` · `POST /moat/gate`
**STRIPE IS GONE → `/stripe/*` = 404. Never re-add.**

### CLI commands (v1.0.0)
`kasbah scan <path>` · `kasbah scan -` (stdin) · `kasbah redact <file>` · `kasbah watch <path>` · `kasbah selftest`

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
1. **detector.js**: NEVER remove patterns. Only ADD for new document types.
2. **content.js**: NEVER remove moats. Only ADD for new exfiltration vectors.
3. **Hashes**: All copies must have identical hash. Divergence = BUG, must be fixed immediately.
4. **Manifests**: All 5 must be `version: "1.0.0"`, `world: "MAIN"`, `run_at: "document_start"`, `all_frames: true`.
5. **Same-site bypass**: NEVER remove (keeps extension from breaking AI platforms).
6. **Approval window**: NEVER remove ("Proceed Anyway" would double-block without it).
7. **Image paste intercept**: NEVER remove (only defense against screenshot exfiltration).
8. **selfTest**: Must remain 29/29 after ANY detector.js change.
9. **Market launch**: Must remain 58/58 after ANY detector.js change.
10. **CLI selftest**: Must remain 10/10 after ANY CLI/kernel change.
11. **Stripe**: PERMANENTLY REMOVED. Never re-add for any reason.

### Test Commands (IMMUTABLE GATE)
- `node /tmp/kasbah-market-launch.cjs` → 58/58 (detector gate)
- `/tmp/kasbah-cli-build/release/kasbah selftest` → 10/10 (CLI gate)
- If any test fails, the change is BROKEN and must be reverted immediately.

## MULTI-PHASE TASK EXECUTION PATTERN (From Insights)

**For ANY task that spans multiple phases or stages:**

1. **Never ask for a planning phase first** — execute Phase 1 immediately
2. **Structure as explicit phases with clear completion criteria**:
   - "Phase 1: [specific concrete task]. Do not move to Phase 2 until Phase 1 is 100% committed."
   - "Phase 2: [next task]. Begin only after Phase 1 approval."
3. **Commit results after each phase** (git commit with meaningful message)
4. **Do not exceed 10 minutes per phase** without status update or escalation
5. **After Phase N completes**: Wait for user review/approval before Phase N+1
6. **Example anti-pattern to avoid**: Spending 32 minutes debugging a single sub-problem instead of escalating after 10 minutes

**Result**: Forces completion of concrete deliverables, prevents sessions from stalling at planning stage.

## INSIGHTS-DRIVEN FRICTION ELIMINATION SUMMARY

| Friction Type | Root Cause | Solution | Impact |
|---|---|---|---|
| Wrong Assumptions (9 events) | Assumed architecture details | Lock constraints in CLAUDE.md | -60% friction |
| Stalling on Debugging (32 min sessions) | Single issue debugging loops | 10-min escalation rule | -5h/month |
| Status Checking (6 requests) | Silent execution | Proactive 3-5 min updates | -2h/month |
| Fabricated Metrics | No accuracy guard rails | NEVER fabricate rule + citation requirement | Stakeholder trust maintained |
| Large Task Incompletion | No phase structure | Phase-based execution with explicit commits | +4 fully achieved/month |

**Total Expected Improvement**: -15 hours/month, 60% friction reduction, 4x more session completions
