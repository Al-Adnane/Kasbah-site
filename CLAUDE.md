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

## CURRENT VERSIONS

- detector.js: v3.3.0 (hash: e74c9dc19ca5a7590d8429743068e021)
- content.js: hash 26faedf384d2ed41619ab5856550ff08
- API Worker: v2.0.0
- Desktop: v1.5.0
- Fortress Grade: 33/34 (UNBREAKABLE)
- selfTest: 15/15 invariants PASS
