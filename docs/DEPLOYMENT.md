# Kasbah Guard — Build & Deployment Guide

> **Version**: 1.0.0 (Products) | 3.5.2 (Detector Engine)
> **Last Updated**: February 2026
> **Status**: PRODUCTION

---

## Prerequisites

### Required Tools

- **Rust**: 1.70+ (for CLI, Desktop, Mobile, kasbah-kernel)
- **Node.js**: 18.0+ (for Enterprise, SDK, VS Code, web projects)
- **npm**: 8.0+ (or yarn)
- **Tauri CLI**: `cargo install create-tauri-app` or `npm install -g @tauri-apps/cli`
- **wasm-pack**: `cargo install wasm-pack` (for WASM builds)
- **Wrangler**: `npm install -g @cloudflare/wrangler` (for API worker)

### System Requirements

- **macOS 12+** / **Linux** (Rust development)
- **Windows 10+** (for Windows desktop app)
- **2GB+ free disk space** (for build artifacts)

---

## Build Procedures

### 1. Browser Extensions (Chrome, Firefox, Edge, Opera, Safari)

**Location**: `kasbah-guard-dist/extensions/{chrome,firefox,edge,opera,safari}/`

**Build** (No compilation needed — pure JavaScript):
```bash
cd kasbah-guard-dist/extensions/chrome
# Just verify manifest and scripts are present
ls -la src/manifest.json src/detector.js src/content.js src/background.js
```

**Verify**:
```bash
# Check all 6 detector.js copies are identical
md5sum kasbah-guard-dist/extensions/*/src/detector.js
# Expected: d9cd10f93c97c8de5078b0e9e98437fa (6 copies, all identical)
```

**Package for Store**:
- **Chrome**: Zip `src/` folder, upload to Chrome Web Store
- **Firefox**: Zip `src/` folder, upload to Firefox AMO
- **Edge**: Zip `src/` folder, upload to Edge Add-ons
- **Opera**: Zip `src/` folder, upload to Opera Add-ons
- **Safari**: Use Xcode + Safari App Extension, upload to App Store

**Version Lock**: All manifests locked at `"version": "1.0.0"`

---

### 2. Desktop App (Tauri)

**Location**: `kasbah-guard-dist/apps/desktop/`

**Prerequisites**:
- Xcode (macOS) or Visual Studio Build Tools (Windows)
- Tauri CLI

**Build**:
```bash
cd kasbah-guard-dist/apps/desktop

# Install dependencies
npm install

# Build for current platform
npm run tauri build

# Outputs:
#   macOS: target/release/bundle/macos/KasbahGuard.app
#   Windows: target/release/bundle/msi/KasbahGuard.msi
#   Linux: target/release/bundle/deb/kasbah-guard.deb
```

**Deploy to macOS Applications Folder**:
```bash
# Copy built app to /Applications
cp -r target/release/bundle/macos/KasbahGuard.app /Applications/

# Verify
open /Applications/KasbahGuard.app
```

**Manual Build** (without Tauri CLI):
```bash
cd kasbah-guard-dist/apps/desktop/src-tauri
CARGO_TARGET_DIR=/tmp/kasbah-build cargo build --release
cp target/release/kasbah_guard_desktop "/Applications/KasbahGuard.app/Contents/MacOS/kasbah_guard_desktop"
```

**Version Lock**: `tauri.conf.json` locked at `"version": "1.0.0"`

---

### 3. CLI Tool

**Location**: `kasbah-guard-dist/apps/cli/`

**Build**:
```bash
CARGO_TARGET_DIR=/tmp/kasbah-cli-build cargo build --release \
  --manifest-path kasbah-guard-dist/apps/cli/Cargo.toml

# Output binary:
# /tmp/kasbah-cli-build/release/kasbah (Linux/macOS)
# /tmp/kasbah-cli-build/release/kasbah.exe (Windows)
```

**Install Locally**:
```bash
cp /tmp/kasbah-cli-build/release/kasbah /usr/local/bin/kasbah
chmod +x /usr/local/bin/kasbah

# Verify
kasbah --version
# Output: kasbah 1.0.0
```

**Test**:
```bash
kasbah selftest
# Expected: 10/10 PASS
```

**Package for Distribution**:
```bash
# Create tarball
tar czf kasbah-cli-1.0.0.tar.gz -C /tmp/kasbah-cli-build/release kasbah

# Or create binary directly available:
# - Linux/macOS: Put /tmp/kasbah-cli-build/release/kasbah in PATH
# - Windows: Put kasbah.exe in PATH
```

---

### 4. Mobile App (iOS/Android)

**Location**: `kasbah-guard-dist/apps/mobile/`

**Build for iOS** (macOS only):
```bash
cd kasbah-guard-dist/apps/mobile
npm install
npm run tauri ios build

# Output: target/release/bundle/ios/KasbahGuard.ipa
# Upload to App Store
```

**Build for Android**:
```bash
cd kasbah-guard-dist/apps/mobile
npm install
npm run tauri android build

# Output: target/release/bundle/apk/kasbah-guard.apk
# Upload to Google Play Store
```

---

### 5. VS Code Extension

**Location**: `kasbah-guard-dist/apps/vscode/`

**Build**:
```bash
cd kasbah-guard-dist/apps/vscode
npm install
npm run build  # Compiles TypeScript + bundles

# Output: out/extension.js
```

**Package for Marketplace**:
```bash
# Install vsce (Visual Studio Code Extension manager)
npm install -g vsce

# Package
vsce package
# Output: kasbah-vscode-1.0.0.vsix

# Publish (requires auth token)
vsce publish
```

**Install Locally** (for development):
```bash
# In VS Code:
# 1. Open Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
# 2. Click "..." menu → "Install from VSIX"
# 3. Select kasbah-vscode-1.0.0.vsix
```

---

### 6. Enterprise Dashboard

**Location**: `kasbah-guard-dist/apps/enterprise/`

**Build**:
```bash
cd kasbah-guard-dist/apps/enterprise
npm install
npm run build  # Next.js build

# Output: .next/ directory (optimized production build)
```

**Local Development**:
```bash
npm run dev
# Runs on http://localhost:3000
```

**Deploy to Vercel** (recommended):
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
# Follow prompts to connect GitHub
```

**Deploy to Custom Server**:
```bash
npm run build
npm start  # Starts Next.js server on port 3000
```

**Environment Variables**:
Create `.env.local`:
```
NEXT_PUBLIC_API_URL=https://api.bekasbah.com
```

---

### 7. Web Detector (WASM Demo)

**Location**: `kasbah-guard-dist/apps/web-detector/`

**Build WASM**:
```bash
cd kasbah-guard-dist/crates/kasbah-wasm
wasm-pack build --target web --out-dir ../../public/wasm/

# Output:
# public/wasm/kasbah_bg.wasm
# public/wasm/kasbah.js
```

**Deploy Static Files**:
```bash
# Copy web-detector files to public/detect/
cp kasbah-guard-dist/apps/web-detector/index.html public/detect/
cp kasbah-guard-dist/apps/web-detector/app.js public/detect/
cp kasbah-guard-dist/apps/web-detector/style.css public/detect/
```

---

### 8. API Worker (Cloudflare)

**Location**: `api/`

**Prerequisites**:
- Cloudflare account
- API token with Workers permissions
- Domain registered on Cloudflare (api.bekasbah.com)

**Build**:
```bash
cd api
npm install
```

**Local Development**:
```bash
# Run locally for testing
wrangler dev
# Server runs on http://localhost:8787
```

**Deploy**:
```bash
# Authenticate
wrangler login

# Deploy to Cloudflare
wrangler deploy

# Output: Deployed to https://api.bekasbah.com
```

**Configuration** (LOCKED):
```toml
# api/wrangler.toml — DO NOT MODIFY
# Contains: service name, routes, auth config
```

**Environment Secrets**:
```bash
# Set secrets in Cloudflare dashboard or via CLI:
wrangler secret put KASBAH_JWT_SECRET

# Verify
curl https://api.bekasbah.com/health
# Expected: {"ok":true,"sii":0.95}
```

---

### 9. SDK (@kasbah/guard)

**Location**: `kasbah-guard-dist/packages/sdk/`

**Build**:
```bash
cd kasbah-guard-dist/packages/sdk
npm install
npm run build  # Compiles TypeScript

# Output: dist/index.js, dist/index.d.ts
```

**Publish to npm**:
```bash
# Authenticate
npm login

# Bump version if needed
npm version minor

# Publish
npm publish

# Verify
npm view @kasbah/guard
# Should show version 1.0.0
```

**Local Usage**:
```bash
# Link locally for development
npm link

# In another project:
npm link @kasbah/guard
```

---

### 10. Core Libraries (kasbah-kernel, kasbah-wasm)

**Location**: `kasbah-guard-dist/crates/`

**Build kasbah-kernel**:
```bash
cd kasbah-guard-dist/crates/kasbah-kernel
CARGO_TARGET_DIR=/tmp/kasbah-build cargo build --release

# Used by: CLI, Desktop, Mobile
```

**Build kasbah-wasm**:
```bash
cd kasbah-guard-dist/crates/kasbah-wasm
wasm-pack build --target web --out-dir ../../public/wasm/

# Output: public/wasm/kasbah_bg.wasm + JS glue
```

---

## Public Website (bekasbah.com)

**Location**: `public/`

**Build**:
```bash
# Pure static HTML/CSS/JS — no build needed
# Just verify files are present:
ls -la public/index.html public/assets/
```

**Deploy via Cloudflare Pages** (automatic):
```bash
# On any push to main branch:
git push origin main

# Cloudflare Pages automatically:
# 1. Pulls latest code
# 2. Builds (if build command set)
# 3. Deploys to bekasbah.com

# Verify deployment:
curl https://bekasbah.com
```

**Manual Deploy**:
```bash
# Install Wrangler
npm install -g wrangler

# Deploy from public/ directory
wrangler pages deploy public/
```

---

## Complete Build Script (All Products)

```bash
#!/bin/bash

set -e

REPO_ROOT="/Users/mac/Desktop/KasbahFinal/Kasbah-site"
cd "$REPO_ROOT"

echo "🏗️  Building all Kasbah Guard products..."

# 1. Core Libraries
echo "1️⃣  Building kasbah-kernel..."
CARGO_TARGET_DIR=/tmp/kasbah-build cargo build --release
echo "✅ kasbah-kernel built"

# 2. CLI Tool
echo "2️⃣  Building CLI tool..."
CARGO_TARGET_DIR=/tmp/kasbah-cli-build cargo build --release \
  --manifest-path kasbah-guard-dist/apps/cli/Cargo.toml
echo "✅ CLI built: /tmp/kasbah-cli-build/release/kasbah"

# 3. Desktop App
echo "3️⃣  Building Desktop App..."
cd kasbah-guard-dist/apps/desktop
npm install
npm run tauri build
echo "✅ Desktop app built"
cd "$REPO_ROOT"

# 4. Mobile App
echo "4️⃣  Building Mobile App..."
cd kasbah-guard-dist/apps/mobile
npm install
npm run tauri android build  # or ios build
echo "✅ Mobile app built"
cd "$REPO_ROOT"

# 5. VS Code Extension
echo "5️⃣  Building VS Code Extension..."
cd kasbah-guard-dist/apps/vscode
npm install && npm run build
echo "✅ VS Code extension built"
cd "$REPO_ROOT"

# 6. Enterprise Dashboard
echo "6️⃣  Building Enterprise Dashboard..."
cd kasbah-guard-dist/apps/enterprise
npm install && npm run build
echo "✅ Enterprise dashboard built"
cd "$REPO_ROOT"

# 7. WASM
echo "7️⃣  Building WASM..."
cd kasbah-guard-dist/crates/kasbah-wasm
wasm-pack build --target web --out-dir ../../public/wasm/
echo "✅ WASM built"
cd "$REPO_ROOT"

# 8. SDK
echo "8️⃣  Building SDK..."
cd kasbah-guard-dist/packages/sdk
npm install && npm run build
echo "✅ SDK built"
cd "$REPO_ROOT"

echo "✅ All builds complete!"
```

---

## Verification Checklist

Before deploying to production, verify:

```bash
# 1. Market Launch Test (58/58)
node tests/market-launch/kasbah-market-launch.cjs
# Expected: 🚀 MARKET LAUNCH READY: 58/58 passed (100.0%)

# 2. detector.js selfTest (23/23)
# Check in browser console (extension install):
selfTest()
# Expected: 23/23 PASS

# 3. CLI selftest (10/10)
/tmp/kasbah-cli-build/release/kasbah selftest
# Expected: Results: 10/10

# 4. All detector.js copies identical
md5sum kasbah-guard-dist/extensions/*/src/detector.js
# Expected: d9cd10f93c97c8de5078b0e9e98437fa (6 times)

# 5. API health check
curl https://api.bekasbah.com/health
# Expected: {"ok":true,"sii":0.95}

# 6. Website accessibility
curl https://bekasbah.com
# Expected: 200 OK
```

---

## Rollback Procedures

### If Deployment Fails

#### Website (bekasbah.com)
```bash
# Revert last commit
git revert HEAD
git push origin main

# Cloudflare Pages automatically re-deploys previous version
```

#### API (api.bekasbah.com)
```bash
# Rollback in Cloudflare dashboard:
# 1. Go to Workers → Deployments
# 2. Click "Rollback" on previous version
# 3. Confirm
```

#### CLI / Desktop / Mobile
```bash
# Release previous version:
# 1. Tag with previous version
git tag -a v1.0.0-rollback -m "Rollback deployment"
git push origin v1.0.0-rollback

# 2. Distribute binary from previous release
# Users update manually or via auto-updater
```

---

## Continuous Integration / CD

### GitHub Actions (Optional)

**.github/workflows/build.yml**:
```yaml
name: Build & Test
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: 1.70
      - run: node tests/market-launch/kasbah-market-launch.cjs
      - run: /tmp/kasbah-cli-build/release/kasbah selftest
```

---

## Troubleshooting Deployments

### Common Issues

**"Wasm pack not found"**
```bash
cargo install wasm-pack
```

**"Cargo.toml not found"**
```bash
# Ensure you're in the correct directory
cd kasbah-guard-dist/apps/cli
```

**"node_modules permission denied"**
```bash
# Clean and rebuild
rm -rf node_modules package-lock.json
npm install
```

**"Extension won't load in browser"**
- Verify detector.js has 23/23 selfTest passing
- Check manifest.json version matches
- Reload extension in browser (refresh)

**"API returns 500 error"**
- Check Cloudflare Worker logs: `wrangler tail`
- Verify environment secrets are set: `wrangler secret list`
- Check API is deployed: `wrangler deployments list`

---

## Release Checklist

Before tagging a release:

- [ ] All 58/58 tests pass
- [ ] detector.js 23/23 selfTest passing
- [ ] CLI 10/10 selftest passing
- [ ] All 6 detector.js copies identical (hash d9cd10f...)
- [ ] Version numbers updated consistently:
  - `kasbah-guard-dist/extensions/*/manifest.json` = "1.0.0"
  - `kasbah-guard-dist/apps/*/package.json` = "1.0.0"
  - `kasbah-guard-dist/apps/cli/Cargo.toml` = "1.0.0"
- [ ] CHANGELOG.md updated
- [ ] API worker tested: `curl https://api.bekasbah.com/health` = OK
- [ ] Website loads: `curl https://bekasbah.com` = 200
- [ ] Git tag created: `git tag -a v1.0.0 -m "Release v1.0.0"`
- [ ] Git push with tags: `git push origin main --tags`

---

## Performance Tuning & Scaling Guide

### Based on E2E Benchmarks (263/263 tests, v1.0.0)

#### Detector Performance Targets

| Scenario | Latency | Memory | Throughput | Notes |
|---|---|---|---|---|
| Single scan | 2-5ms | <2MB | N/A | Typical browser/CLI usage |
| 1000 scans/sec | 2-5ms avg | 5-10MB | ~1000 req/s | API worker simulated load |
| Concurrent 100 users | ~50ms P99 | 50-100MB | ~100 req/s | K8s deployment required |
| Stress test (10K docs) | <500ms total | <20MB | 20K docs/s | Batch processing possible |

**Optimization Tips:**
- Browser: Use detector.js locally (no network calls), cache in localStorage
- CLI: Use `--batch` flag for bulk file scanning
- API: Deploy behind CDN (Cloudflare) for edge latency
- K8s: Set HPA min 2 / max 10 replicas, CPU target 70%

#### Cloudflare Worker Scaling

**Current limits:**
- Single-threaded JavaScript runtime
- Auto-scaling built-in (no manual scaling)
- Rate limit: ~1000 req/s per account
- Upgrade tier for higher throughput

#### K8s Service Tuning

**Resource requests/limits (per pod):**
```yaml
constitutional-ai:
  requests: {memory: 256Mi, cpu: 100m}
  limits: {memory: 512Mi, cpu: 250m}
zk-engine:
  requests: {memory: 128Mi, cpu: 50m}
  limits: {memory: 256Mi, cpu: 150m}
enterprise-dashboard:
  requests: {memory: 256Mi, cpu: 100m}
  limits: {memory: 512Mi, cpu: 250m}
```

**HPA tuning:**
```yaml
minReplicas: 2
maxReplicas: 10
targetCPUUtilizationPercentage: 70
scaleDownWindow: 5m
scaleUpWindow: 30s
```

#### Redis Scaling

**Recommended by user base:**
- 1-50 users: 5Gi PVC, 1 replica
- 50-500 users: 20Gi PVC, 2 replicas (master-slave)
- 500+ users: 100Gi PVC, 3+ replicas (cluster mode)

#### Monitoring & Alerting

**Key metrics to monitor:**
- P50/P95/P99 latency per endpoint
- False positive rate by secret type
- Cache hit rate (target >70%)
- Error rate (target <0.5%)
- Pod memory/CPU utilization

**Alert thresholds (adjustable for your SLA):**
- Inference latency P99 > 100ms → scale up
- Error rate > 1% → investigate logs
- Cache hit rate < 70% → increase Redis memory
- Service unavailable → page on-call

#### Load Testing Results

**From 58/58 market launch suite:**
- 1000 API requests across 4 endpoints
- Average latency: 2-50ms per request
- P99 latency: ~80-100ms (including network)
- Estimated single-machine throughput: ~1000 req/s
- K8s 10-replica cluster: ~10,000 req/s

#### Cost Estimates (Monthly)

| Component | Scale (10K users) | Cost |
|---|---|---|
| Cloudflare Workers | $0.50/M req = | $50 |
| Cloudflare KV | $5/M writes = | $50 |
| K8s cluster (EKS, 3 nodes) | t3.medium autoscaling | $300-500 |
| Monitoring (Prometheus/Grafana) | In-cluster | Free |
| **Total** | | **~$400-600/mo** |

---

**Last Verified**: 2026-02-28 | **Status**: PRODUCTION READY
