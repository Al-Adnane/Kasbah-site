# Kasbah Guard Monorepo v1.0.0

Complete source for the Kasbah Guard ecosystem: CLI, SDK, VS Code, Mobile, Enterprise, and 5 browser extensions.

## Structure

```
kasbah-guard-monorepo/
├── packages/
│   └── sdk/                         # @kasbah/guard npm package
│       ├── src/
│       │   ├── index.ts             # Main exports
│       │   ├── classify.ts          # Core detection
│       │   └── types.ts             # TypeScript definitions
│       ├── examples/                # Integration examples (React, Express, etc)
│       ├── package.json
│       ├── tsconfig.json
│       └── README.md
│
├── kasbah-guard-dist/
│   │
│   ├── crates/                      # Rust libraries (locked)
│   │   ├── kasbah-kernel/           # Core detection engine
│   │   ├── kasbah-signal-processing/
│   │   ├── kasbah-ebpf-lock/
│   │   └── ...
│   │
│   ├── apps/
│   │   ├── cli/                     # kasbah CLI (Rust binary)
│   │   │   ├── Cargo.toml
│   │   │   ├── src/
│   │   │   │   ├── main.rs
│   │   │   │   ├── scanner.rs
│   │   │   │   └── reporter.rs
│   │   │   └── README.md
│   │   │
│   │   ├── mobile/                  # Tauri desktop/mobile app
│   │   │   ├── package.json
│   │   │   ├── src-tauri/           # Rust backend
│   │   │   ├── src/                 # Svelte frontend
│   │   │   └── README.md
│   │   │
│   │   ├── enterprise/              # Enterprise dashboard (Next.js)
│   │   │   ├── package.json
│   │   │   ├── src/
│   │   │   │   ├── app/             # Next.js app directory
│   │   │   │   └── lib/             # API client
│   │   │   └── README.md
│   │   │
│   │   └── desktop/                 # (Legacy reference, see mobile/)
│   │
│   ├── packages/
│   │   └── vscode/                  # VS Code extension
│   │       ├── package.json
│   │       ├── src/
│   │       │   └── extension.ts
│   │       └── README.md
│   │
│   └── extensions/                  # Browser extensions (5 platforms)
│       ├── chrome/
│       ├── firefox/
│       ├── edge/
│       ├── opera/
│       └── safari/
│           └── src/
│               ├── detector.js      # Core detection (12 layer engine)
│               ├── content.js       # Content script
│               └── background.js    # Service worker
│
├── public/                          # Website (Cloudflare Pages)
│   ├── index.html                   # Homepage
│   ├── detect/
│   │   └── index.html               # WASM detector UI
│   ├── dashboard/
│   ├── benchmark.html
│   └── ...
│
├── api/                             # Cloudflare Worker
│   ├── src/
│   │   └── worker.js                # API endpoints
│   ├── wrangler.toml                # Cloudflare config
│   └── README.md
│
├── tests/                           # Test suites
│   ├── core-invariants.js           # 23 core tests
│   ├── market-launch/               # 58 stress tests
│   └── integration/
│       └── performance.test.js      # Latency benchmarks
│
├── docs/                            # Documentation
│   ├── ARCHITECTURE.md              # 4-layer architecture
│   ├── DEPLOYMENT.md                # Build & deploy guide
│   ├── TEST_GUIDE.md                # Test matrix
│   ├── METHODOLOGY.md               # Testing methodology
│   ├── SECURITY-AUDIT.md            # Security spec
│   └── ...
│
├── package.json                     # Root workspace config
├── package-lock.json                # Dependency lock
├── .gitleaks.toml                   # Secret scanning config
├── BUILD_MANIFEST_v1.0.0.md         # Release specification
├── IMPLEMENTATION_ROADMAP.md        # Execution timeline
└── README.md                        # Main documentation
```

## Products

| Product | Type | Version | Status |
|---------|------|---------|--------|
| detector.js | JS Engine | v1.0.0 | ✅ Live (5 browsers) |
| CLI (kasbah) | Rust Binary | v1.0.0 | ✅ Ready |
| SDK (@kasbah/guard) | npm Package | v1.0.0 | ✅ Ready |
| VS Code Extension | VSCode Ext | v1.0.0 | ✅ Ready |
| Mobile (Tauri) | Desktop App | v1.0.0 | ✅ Ready |
| Enterprise Dashboard | Next.js App | v1.0.0 | ✅ Ready |
| Web Detector | HTML/JS Demo | v1.0.0 | ✅ Live |

## Quick Start

### Install Dependencies

```bash
npm install
```

This installs all workspace dependencies and links internal packages.

### Build All Products

```bash
npm run build
npm run build:all  # Include static site
```

This builds:
- CLI (Rust) → `/tmp/kasbah-cli-build/release/kasbah`
- SDK (TypeScript) → `packages/sdk/dist/`
- VS Code (TypeScript) → compiled to `dist/extension.js`
- Mobile (TypeScript + Rust) → Tauri output
- Enterprise (Next.js) → `.next/` build
- Extensions (JavaScript) → ready to load

### Run Tests

```bash
# Run all test suites (166 tests total)
npm run test

# Breakdown:
npm run test:core     # 23 core invariants
npm run test:market   # 58 market launch tests
npm run test:js       # 70 JS detector tests
npm run test:cli      # 10 CLI tests
npm run test:perf     # Performance benchmarks
```

### Development

```bash
# Watch mode (rebuild on file change)
npm run watch

# Linting
npm run lint

# Clean build artifacts
npm run clean
```

## Environment Variables

### SDK/CLI/VS Code
```
DETECTOR_VERSION=1.0.0
ENGINE_VERSION=1.0.0
```

### Enterprise Dashboard
```
NEXT_PUBLIC_API_BASE_URL=https://api.bekasbah.com
```

### Cloudflare Worker (API)
```
SENTRY_DSN=https://...
KV_NAMESPACE=kasbah-kv
```

## Build Targets

### Browser Extensions
Each extension (Chrome, Firefox, Edge, Opera, Safari) contains:
- `detector.js` (v1.0.0) — identical across all 5 platforms
- `content.js` — content script (platform-specific)
- `background.js` — service worker with Sentry

**Build:** No build step required; extensions run from source

**Deploy:** Push to each platform's app store

### CLI (Rust)
**Build:**
```bash
CARGO_TARGET_DIR=/tmp/kasbah-cli-build cargo build --release --manifest-path kasbah-guard-dist/apps/cli/Cargo.toml
```

**Output:** `/tmp/kasbah-cli-build/release/kasbah`

**Deploy:** Homebrew tap + crates.io + GitHub releases

### SDK (TypeScript)
**Build:** `npm run build -w @kasbah/guard`

**Output:** `packages/sdk/dist/`

**Deploy:** `npm publish` to npm registry

### VS Code Extension
**Build:** `npm run build -w kasbah-guard`

**Output:** Packaged as `.vsix`

**Deploy:** Visual Studio Code Marketplace

### Mobile (Tauri)
**Build:** `npm run build -w kasbah-guard-mobile`

**Output:** `.dmg` (macOS), `.exe` (Windows), `.AppImage` (Linux)

**Deploy:** Direct downloads + app stores

### Enterprise Dashboard (Next.js)
**Build:** `npm run build -w @kasbah/enterprise`

**Output:** `.next/` build directory

**Deploy:** Vercel, Self-hosted, or Cloud Platform

### Website (Static)
**Build:** No build required (static files in `public/`)

**Deploy:** Cloudflare Pages (pushes to main)

### API (Cloudflare Worker)
**Deploy:** `wrangler deploy` (runs worker.js)

## Testing Matrix

### Core Invariants (23 tests)
```bash
npm run test:core
# Tests detector.js v1.0.0 self-test (23/23 PASS)
```

### Market Launch (58 tests)
```bash
npm run test:market
# Stress tests across CLI, SDK, extensions
```

### JS Detector (70 tests)
```bash
npm run test:js
# 50 positive + 20 negative test cases
```

### CLI (10 tests)
```bash
npm run test:cli
# SII, policy gate, SSN/AWS/MongoDB detection
```

### Performance (5 metrics)
```bash
npm run test:perf
# p50/p95/p99 latency, burst test, memory leak test
```

## Deployment Pipeline

### 1. Pre-Deploy Verification
```bash
npm run test      # All tests must pass
npm run lint      # No lint errors
npm run build     # All builds succeed
```

### 2. Staging Deployment
```bash
# Website
git push origin main  # → staging.bekasbah.com (Cloudflare Pages)

# API
cd api && wrangler deploy --env staging  # → staging-api.bekasbah.com

# Extensions
# Push to dev version in stores (for testing)
```

### 3. Production Deployment
```bash
# Website (auto-deploys on merge to main)
git merge --ff-only staging → main

# API (automatic Cloudflare deployment)
wrangler deploy  # → api.bekasbah.com

# Extensions
# Submit v1.0.0 to all 5 app stores

# CLI
cargo publish     # → crates.io
brew tap push     # → Homebrew

# SDK
npm publish       # → npm registry

# VS Code
vsce publish      # → Visual Studio Code Marketplace

# Mobile
# Submit to app stores + direct downloads

# Enterprise
vercel deploy     # → bekasbah.com/enterprise
```

## Version Management

All products use **semantic versioning** aligned to **v1.0.0**:

```
Major.Minor.Patch
1     .0      .0
```

Update strategy:
- Bug fixes → Patch (1.0.1, 1.0.2)
- Features → Minor (1.1.0, 1.2.0)
- Breaking → Major (2.0.0)

**Lock file:** `package-lock.json` tracks all transitive dependencies

## CI/CD

GitHub Actions workflow `.github/workflows/ci.yml`:

1. **On PR:** Run all tests, lint, build
2. **On merge to main:** Deploy to production
3. **On tag v*.*.* :** Create GitHub Release

## Support

| Topic | Location |
|-------|----------|
| Product docs | `README.md` in each workspace |
| Architecture | `docs/ARCHITECTURE.md` |
| Deployment | `docs/DEPLOYMENT.md` |
| Testing | `docs/TEST_GUIDE.md` |
| Security | `docs/SECURITY-AUDIT.md` |
| Issues | https://github.com/Al-Adnane/Kasbah-site/issues |

## License

MIT — See LICENSE file

---

**Built with ❤️ by Kasbah Guard** | [bekasbah.com](https://bekasbah.com)
