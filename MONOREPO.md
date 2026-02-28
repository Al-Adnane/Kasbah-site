# Kasbah Guard — Monorepo Structure & Guide

> **Last Updated**: February 2026
> **Status**: v1.0.0 (Stable)
> **Detector Engine**: v3.5.2 with 23/23 selfTest invariants

## Quick Navigation

| Product | Location | Type | Language | Status |
|---------|----------|------|----------|--------|
| **Browser Extensions** (5x) | `kasbah-guard-dist/extensions/` | JavaScript + Manifest | JS/TS | ✅ 1.0.0 |
| **Desktop App** (Tauri) | `kasbah-guard-dist/apps/desktop/` | Rust + Web UI | Rust/TS | ✅ 1.0.0 |
| **CLI Tool** | `kasbah-guard-dist/apps/cli/` | Rust binary | Rust | ✅ 1.0.0 |
| **Mobile App** (Tauri) | `kasbah-guard-dist/apps/mobile/` | Rust + React Native | Rust/TS | ✅ 1.0.0 |
| **VS Code Extension** | `kasbah-guard-dist/apps/vscode/` | VS Code extension | TypeScript | ✅ 1.0.0 |
| **Enterprise Dashboard** | `kasbah-guard-dist/apps/enterprise/` | Next.js app | TypeScript/React | ✅ 1.0.0 |
| **Web Detector Demo** | `kasbah-guard-dist/apps/web-detector/` | WASM demo | HTML/JS | ✅ 1.0.0 |
| **Detection SDK** | `kasbah-guard-dist/packages/sdk/` | npm package | TypeScript | ✅ 1.0.0 |

## Core Libraries

| Library | Location | Purpose | Status |
|---------|----------|---------|--------|
| **kasbah-kernel** | `kasbah-guard-dist/crates/kasbah-kernel/` | Detection engine + policy rules (Rust) | ✅ Production |
| **kasbah-wasm** | `kasbah-guard-dist/crates/kasbah-wasm/` | WASM bindings for browser | ✅ Production |
| **kasbah-daemon** | `kasbah-guard-dist/crates/kasbah-daemon/` | Background daemon (future) | 🔄 Planning |

## Infrastructure

| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| **API Worker** | `api/` | Cloudflare Worker backend | ✅ v2.0.0 |
| **Public Website** | `public/` | bekasbah.com hosted on Cloudflare Pages | ✅ 1.0.0 |
| **Tests** | `tests/` | Market launch & integration tests | ✅ 58/58 |

---

## Directory Structure (Complete)

```
kasbah-site/
├── kasbah-guard-dist/              # Main product workspace
│   ├── extensions/                 # Browser extensions (Chrome, Firefox, Edge, Opera, Safari)
│   │   ├── chrome/
│   │   ├── firefox/
│   │   ├── edge/
│   │   ├── opera/
│   │   └── safari/
│   │
│   ├── apps/                       # Product applications
│   │   ├── cli/                    # CLI tool (Rust) — scan, redact, watch, selftest
│   │   ├── desktop/                # Desktop app (Tauri) — native GUI
│   │   ├── mobile/                 # Mobile app (iOS/Android via Tauri)
│   │   ├── vscode/                 # VS Code extension
│   │   ├── enterprise/             # Dashboard (Next.js) — multi-user, audit, policies
│   │   ├── web/                    # Legacy web app (deprecated)
│   │   └── web-detector/           # Live WASM detector demo
│   │
│   ├── crates/                     # Rust core libraries
│   │   ├── kasbah-kernel/          # Detection engine (20+ patterns, policy_preflight)
│   │   ├── kasbah-wasm/            # WASM build for browser deployment
│   │   └── kasbah-daemon/          # Background service (future)
│   │
│   ├── packages/                   # npm packages
│   │   └── sdk/                    # @kasbah/guard SDK (npm + Node + browser)
│   │
│   ├── Cargo.toml                  # 🔒 LOCKED: Workspace config (DO NOT MODIFY)
│   ├── Cargo.lock
│   └── README.md
│
├── api/                            # Cloudflare Worker API backend
│   ├── src/
│   │   └── worker.js               # API handler (auth, enterprise, moats)
│   ├── wrangler.toml               # 🔒 LOCKED: Deploy config (DO NOT MODIFY)
│   └── README.md
│
├── public/                         # Static website (bekasbah.com)
│   ├── detect/                     # WASM detector page
│   ├── assets/                     # Images, logos
│   ├── index.html                  # Homepage
│   └── ... other pages
│
├── tests/                          # Test suites
│   ├── market-launch/
│   │   └── kasbah-market-launch.cjs # ✅ 58/58 verification suite
│   └── fixtures/                    # Test data
│
├── docs/                           # Documentation
│   ├── ARCHITECTURE.md              # System design & moat architecture
│   ├── DEPLOYMENT.md                # Deploy procedures
│   ├── API.md                       # API endpoint reference
│   └── CHANGELOG.md                 # Version history
│
├── CLAUDE.md                        # 🔒 Development constraints & locked decisions
├── MONOREPO.md                      # This file — navigation guide
├── README.md                        # Main project README
├── CNAME                            # 🔒 LOCKED: Domain config (DO NOT MODIFY)
└── .gitleaks.toml                  # Secrets scanning config (self-referential)

```

---

## Product Runbooks

### 🌐 Browser Extensions (5x: Chrome, Firefox, Edge, Opera, Safari)
**Location**: `kasbah-guard-dist/extensions/{chrome,firefox,edge,opera,safari}/`

- **Type**: Content scripts + background scripts
- **Entry Points**: `detector.js` (detection logic), `content.js` (egress gate)
- **Version**: 1.0.0 (manifests all locked at v1.0.0)
- **Engine**: detector.js v3.5.2 (all 6 copies identical, hash `d9cd10f93c97c8de5078b0e9e98437fa`)
- **Install**: Direct browser store URLs (Chrome Web Store, Firefox AMO, Safari App Store, etc.)
- **Test**: `node tests/market-launch/kasbah-market-launch.cjs` → 58/58 ✅

**Key Architecture**:
- 100% independent from Desktop App
- All detection is LOCAL JavaScript (no server calls)
- 18-moat egress gate with same-site bypass, approval window, image paste interception
- Broadcast to Tauri desktop app (if installed) via `window.postMessage()` on detection

### 💻 Desktop App (Tauri)
**Location**: `kasbah-guard-dist/apps/desktop/`

- **Type**: Native desktop application (macOS, Windows, Linux)
- **Core**: `src-tauri/src/guard.rs` — Rust guard engine with 12 IPC moats
- **UI**: Svelte + TypeScript web frontend
- **Version**: 1.0.0
- **Install**: `/Applications/KasbahGuard.app` (macOS) or native installer
- **Auth**: 3-layer (Tauri IPC → localStorage → HTTP via session.json)

**Commands** (Tauri IPC):
```
preflight_text(text) → {risk, decision, reason}
preflight_file(path) → {risk, decision, reason}
preflight_url(url) → {risk, decision, reason}
redact_content(text) → {redacted}
audit_event(event) → {ticket_hash, timestamp}
(+7 more moat hooks)
```

**Build**:
```bash
cd kasbah-guard-dist/apps/desktop
npm install && cargo build --release
cp target/release/kasbah_guard_desktop "/Applications/KasbahGuard.app/Contents/MacOS/"
```

### 📋 CLI Tool
**Location**: `kasbah-guard-dist/apps/cli/`

- **Type**: Rust command-line tool
- **Binary**: `kasbah` (built to `/tmp/kasbah-cli-build/release/kasbah`)
- **Version**: 1.0.0
- **Commands**:
  - `kasbah scan <path>` — Scan file/directory
  - `kasbah scan -` — Scan stdin
  - `kasbah scan --json <path>` — JSON output (CI/CD)
  - `kasbah redact <file>` — Redact in-place
  - `kasbah watch <path>` — Live file watching
  - `kasbah selftest` → 10/10 ✅

**Build**:
```bash
CARGO_TARGET_DIR=/tmp/kasbah-cli-build cargo build --release --manifest-path kasbah-guard-dist/apps/cli/Cargo.toml
```

**Test**:
```bash
/tmp/kasbah-cli-build/release/kasbah selftest
```

**Exit Codes**: 0 = clean, 1 = warn (risk ≥40), 2 = deny (risk ≥70)

### 📱 Mobile App (iOS/Android)
**Location**: `kasbah-guard-dist/apps/mobile/`

- **Type**: Native mobile via Tauri 2.0
- **Engine**: Same Rust guard engine as desktop (`src-tauri/`)
- **UI**: Svelte for iOS/Android
- **Version**: 1.0.0
- **Badge**: Engine v3.5.2

**Features**:
- iOS Share Sheet integration
- Android intent receiver
- Haptic feedback
- Offline detection

### 📝 VS Code Extension
**Location**: `kasbah-guard-dist/apps/vscode/`

- **Type**: TypeScript VS Code extension
- **Version**: 1.0.0
- **Language**: TypeScript (uses @kasbah/guard SDK)
- **Features**:
  - Paste interception with inline risk
  - Save-time file scanning
  - Diagnostic squiggles
  - Status bar risk indicator

**Build**:
```bash
cd kasbah-guard-dist/apps/vscode
npm install && npm run build
vsce package  # Create .vsix
```

### 📊 Enterprise Dashboard
**Location**: `kasbah-guard-dist/apps/enterprise/`

- **Type**: Next.js SPA + API client
- **Version**: 1.0.0
- **API**: Real calls to `https://api.bekasbah.com/api/` (Bearer auth)
- **Pages**:
  - `/` — Dashboard overview (stats + recent audit)
  - `/policies` — Risk policies, thresholds, enabled products
  - `/audit` — Audit log (decision history, risk trends)
  - `/team` — Team members (invite, roles)

**Build**:
```bash
cd kasbah-guard-dist/apps/enterprise
npm install && npm run build && npm start
```

### 🎨 Web Detector (WASM Demo)
**Location**: `kasbah-guard-dist/apps/web-detector/`

- **Type**: Single-page WASM demo
- **Engine**: kasbah-wasm (compiled WASM)
- **Input**: Textarea for paste-and-test
- **Output**: Live risk score + pattern matches

### 📦 @kasbah/guard SDK
**Location**: `kasbah-guard-dist/packages/sdk/`

- **Type**: npm TypeScript package
- **Version**: 1.0.0
- **Platforms**: Node.js, browser, edge runtime (Cloudflare Workers, Vercel Edge)

**API**:
```typescript
import { classify, redact } from '@kasbah/guard';
const result = classify("my text"); // { risk, decision, reason, proof }
const safe = redact("my text");     // "[REDACTED::SSN] hello"
```

---

## Core Libraries

### kasbah-kernel (Rust)
**Location**: `kasbah-guard-dist/crates/kasbah-kernel/src/`

**Modules**:
- `lib.rs` — Public API (policy_preflight, classify, redact_text, SII, gate)
- `patterns.rs` — 20+ detection patterns (SSN, CC, AWS keys, GitHub PAT, PII, etc.)
- `policy.rs` — Detection rules + scoring
- `integrity.rs` — SII (System Integrity Index) calculation
- `audit.rs` — Event logging + ticket generation
- `redact.rs` — Content redaction

**Exports** (used by CLI, Desktop, Mobile):
```rust
pub fn policy_preflight(text: &str) -> (u16, String, String) // (risk, decision, reason)
pub fn classify(text: &str) -> ClassifyResult
pub fn redact_text(text: &str, findings: &[Finding]) -> String
pub fn calculate_sii(...) -> f64
pub fn authorize_execution(...) -> GateDecision
```

### kasbah-wasm
**Location**: `kasbah-guard-dist/crates/kasbah-wasm/`

- **Build**: `wasm-pack build crates/kasbah-wasm --target web`
- **Output**: `public/wasm/kasbah_bg.wasm` + JS glue
- **Exports**: classify(), risk levels
- **Used By**: web-detector, SDK in browser mode

---

## API Backend (Cloudflare Worker)

**Location**: `api/src/worker.js`
**Deployed To**: `https://api.bekasbah.com`
**Version**: v2.0.0
**Config**: `api/wrangler.toml` (🔒 LOCKED)

**Endpoints**:

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/register` | None | Create account |
| POST | `/auth/login` | None | Login |
| POST | `/auth/verify` | None | Verify email |
| POST | `/auth/resend` | None | Resend verification |
| POST | `/auth/logout` | Bearer | Logout |
| GET | `/auth/me` | Bearer | Current user |
| GET | `/auth/stats` | Bearer | User statistics |
| **Enterprise** |
| GET | `/api/stats` | Bearer | Dashboard stats |
| GET | `/api/audit/recent` | Bearer | Recent audit log |
| GET | `/api/policies` | Bearer | Risk policies |
| GET | `/api/team` | Bearer | Team members |
| POST | `/api/scan` | Bearer | Submit scan |
| **Moats** |
| GET | `/health` | None | Health check + SII |
| POST | `/moat/gate` | None | Policy validation |

**Headers**:
- `X-Kasbah-Risk`: Risk level for requests with suspicious content

---

## Testing & Verification

### Market Launch Suite
```bash
node tests/market-launch/kasbah-market-launch.cjs
```
**Result**: 58/58 ✅ (sections A-F)

**Sections**:
- **A** (20/20): Real-world adversarial test cases
- **B** (10/10): Evasion attempts
- **C** (10/10): False-positive stress test
- **D** (3/3): Performance <500ms
- **E** (10/10): JS ↔ Rust consistency
- **F** (5/5): Infrastructure (hashes, versions)

### detector.js selfTest
**Location**: `kasbah-guard-dist/extensions/chrome/src/detector.js` (lines ~30-150)

```javascript
selfTest() → 23/23 ✅
```

**Invariants**:
- Detects SSN, CC, AWS keys, GitHub PAT, private keys, seed phrases, injections
- Hashes are consistent across all copies
- Version matches engine declaration

### CLI selftest
```bash
/tmp/kasbah-cli-build/release/kasbah selftest
```

**Result**: 10/10 ✅

**Tests**:
- policy_preflight SSN → BLOCK
- policy_preflight clean → ALLOW
- Private key detection
- AWS key detection
- MongoDB URI detection
- SII calculations
- Gate authorization logic

---

## Build & Deploy

### Local Development

**Prerequisites**:
- Rust 1.70+
- Node.js 18+
- npm or yarn
- Tauri CLI (for desktop/mobile)
- wasm-pack (for WASM)

**Build All Products**:
```bash
# Rust
CARGO_TARGET_DIR=/tmp/kasbah-build cargo build --release

# CLI specifically
CARGO_TARGET_DIR=/tmp/kasbah-cli-build cargo build --release --manifest-path kasbah-guard-dist/apps/cli/Cargo.toml

# Extensions (no build needed — pure JS)
# Just zip the src/ folders for distribution

# Desktop
cd kasbah-guard-dist/apps/desktop && npm install && cargo build --release

# Web/Enterprise
cd kasbah-guard-dist/apps/enterprise && npm install && npm run build
```

### Deployment

**Website** (`public/`):
```bash
git push origin main  # Auto-deploys via Cloudflare Pages
```

**API** (`api/`):
```bash
cd api && wrangler deploy
```

**Extensions**:
- Upload to respective browser stores (Chrome Web Store, Firefox AMO, etc.)
- Direct distribution via GitHub releases

---

## Version Lock

**⚠️ IMPORTANT**: All versions are LOCKED at v1.0.0 (stable).

| Component | Version | Lock Status |
|-----------|---------|-------------|
| All Extensions (5x) | 1.0.0 | 🔒 LOCKED |
| Desktop App | 1.0.0 | 🔒 LOCKED |
| CLI | 1.0.0 | 🔒 LOCKED |
| Mobile | 1.0.0 | 🔒 LOCKED |
| VS Code Extension | 1.0.0 | 🔒 LOCKED |
| Enterprise Dashboard | 1.0.0 | 🔒 LOCKED |
| Web Detector | 1.0.0 | 🔒 LOCKED |
| SDK (@kasbah/guard) | 1.0.0 | 🔒 LOCKED |
| API Worker | v2.0.0 | 🔒 LOCKED |
| Detector Engine | v3.5.2 | 🔒 LOCKED |

---

## Troubleshooting

### Test Failures

**Market launch 58/58 fails?**
- ✅ Verify `tests/market-launch/kasbah-market-launch.cjs` exists
- ✅ Check detector.js hashes are identical (all 6 copies)
- ✅ Run selfTest() in detector.js (23/23 required)

**CLI selftest 10/10 fails?**
- ✅ Rebuild: `CARGO_TARGET_DIR=/tmp/kasbah-cli-build cargo build --release --manifest-path kasbah-guard-dist/apps/cli/Cargo.toml`
- ✅ Check kasbah-kernel is accessible: `ls kasbah-guard-dist/crates/kasbah-kernel/`

**Extension not detecting?**
- ✅ Check detector.js version matches manifest.json version
- ✅ Verify detector.js has 23/23 selfTest passing
- ✅ Check content.js is loaded (inspect page source)

### Build Errors

**Cargo path errors?**
- Don't move files — paths in Cargo.toml assume current structure
- If you must move, update all `path =` references

**WASM build fails?**
- Ensure `wasm-pack` is installed: `cargo install wasm-pack`
- Check Node.js version: 18+ required

---

## Documentation Files

| File | Purpose |
|------|---------|
| `MONOREPO.md` | This file — navigation & structure |
| `ARCHITECTURE.md` | System design, moats, threat model |
| `DEPLOYMENT.md` | Build & deploy procedures |
| `CLAUDE.md` | 🔒 Development constraints |
| `API.md` | API endpoint reference |
| `CHANGELOG.md` | Version history & changes |
| `README.md` | Main project overview |

---

## Getting Help

- **CLAUDE.md**: Development constraints & locked decisions
- **Architecture questions**: See `ARCHITECTURE.md`
- **Deploy procedures**: See `DEPLOYMENT.md`
- **API reference**: See `API.md`
- **Test failures**: Check `tests/` directory

---

**Last Verified**: 2026-02-28
**Marker Launch Suite**: 58/58 ✅
**detector.js selfTest**: 23/23 ✅
**CLI selftest**: 10/10 ✅
**Status**: PRODUCTION READY
