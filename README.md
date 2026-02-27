# Kasbah Guard

> **The Antivirus for AI Leaks** — local-first DLP that intercepts secrets before they reach AI tools. No cloud. No account. No latency.

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Approved-brightgreen)](https://chromewebstore.google.com/detail/kasbah-guard/idikjiajiomhekkkpfkhnpfepfgknokc)
[![Version](https://img.shields.io/badge/version-3.0-blue)]()
[![License](https://img.shields.io/badge/license-Proprietary-red)]()

---

## What It Does

Kasbah Guard watches every channel through which sensitive data can leave your browser and blocks it before it transmits — paste, click, upload, drag-drop, and all programmatic network calls (fetch, XHR, WebSocket, sendBeacon, form submission). Detection runs entirely in the browser in under 2ms. Nothing ever leaves your device.

**Benchmark: 91/100** vs CrowdStrike 73 · Nightfall 70 · Microsoft Purview 70

---

## Who It Protects

| Persona | Risk it eliminates |
|---------|-------------------|
| **Consultants** | Client financials pasted into ChatGPT |
| **Freelancers** | Client credentials shared by accident |
| **Founders** | Business strategy/cap table leaked to AI |
| **Teams** | Company-wide data egress with full audit trail |

---

## Repository Structure

```
/
├── README.md                        ← you are here
├── docs/
│   ├── ARCHITECTURE.md              ← 13 moats, detection engine, egress gate
│   ├── STRATEGY.md                  ← business moats, products, revenue, PH launch
│   ├── TESTING.md                   ← gauntlet, verb matrix, test procedures
│   └── future/                      ← parked features (auto-redact, IDE guard, etc.)
├── kasbah-guard-dist/
│   ├── extensions/
│   │   ├── chrome/                  ← the extension (load this in Chrome)
│   │   ├── firefox/                 ← Firefox mirror
│   │   ├── edge/                    ← Edge mirror
│   │   └── safari/                  ← Safari (in progress)
│   ├── fixtures/gauntlet.html       ← 15-vector security stress test
│   ├── gauntlet_server.js           ← local capture server for gauntlet
│   ├── docs/
│   │   ├── KASBAH-TECH-SPEC.md      ← full technical specification (v26.0)
│   │   └── future/                  ← parked feature specs
│   ├── KASBAH-FULL-STATUS.md        ← comprehensive build status (v26.0)
│   └── MULTILINGUAL_DOCUMENT_DETECTION.md ← 9-language PII patterns
├── public/                          ← bekasbah.com website (Cloudflare Pages)
│   ├── index.html
│   ├── how-it-works.html
│   ├── personas.html
│   ├── benchmark.html
│   └── privacy.html
├── api/                             ← api.bekasbah.com (Cloudflare Worker)
│   └── src/worker.js
└── .github/workflows/               ← CI/CD (deploy to Cloudflare Pages)
```

---

## Quick Start (Developer)

### Load the Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select: `kasbah-guard-dist/extensions/chrome`
5. Verify: Kasbah Guard appears, version 3.0, no red error badge

### Run the Gauntlet (Security Test)

```bash
cd kasbah-guard-dist
npm install          # install ws dependency (once)
npm run gauntlet     # start capture server on :8789
```

Open `http://127.0.0.1:8789/gauntlet.html` with the extension active.
Click all 15 vectors. Hit Ctrl+C — server log should be empty `[]`.

See [`docs/TESTING.md`](docs/TESTING.md) for full test procedures.

---

## The Extension Architecture (v3.0)

Two layers of protection running simultaneously:

**Layer 1 — Sovereign Intent Layer** (UI verbs)
Intercepts 6 user-triggered actions: SEND · PASTE · UPLOAD · EDIT · BROWSE · DOWNLOAD

**Layer 2 — Network Egress Gate** (programmatic network)
Hooks all 5 browser network APIs at the prototype level before any page JS runs.

Both layers use the same detection engine (`detector.js`) — Shannon entropy + 22 pattern types + Unicode normalization — all local, zero network calls.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full technical breakdown.

---

## Pricing

| Tier | Price | What's included |
|------|-------|----------------|
| Free | $0 | Browser extension + clipboard monitor, forever |
| Founders Club | $297 one-time | Lifetime access, all future features |
| Teams | $29/month | Unlimited seats, audit trail, admin dashboard |

---

## Key Links

- **Website:** [bekasbah.com](https://bekasbah.com)
- **Chrome Store:** [Kasbah Guard](https://chromewebstore.google.com/detail/kasbah-guard/idikjiajiomhekkkpfkhnpfepfgknokc)
- **API:** [api.bekasbah.com](https://api.bekasbah.com)
- **Contact:** yo@bekasbah.com

---

## Build & Deploy

```bash
# Build desktop app (macOS)
CARGO_TARGET_DIR=/tmp/kasbah-build cargo build --release

# Deploy to app bundle
cp /tmp/kasbah-build/release/kasbah_guard_desktop \
   "/Applications/KasbahGuard.app/Contents/MacOS/kasbah_guard_desktop"

# Code sign
xattr -cr /Applications/KasbahGuard.app && \
codesign --force --options runtime --deep --sign \
  "Developer ID Application: Adnane Addioui (AQPMR37BC8)" \
  /Applications/KasbahGuard.app

# Website deploys automatically on push to main (Cloudflare Pages)
git push origin main
```

---

*Version 3.0 "13-Moat" · Built for consultants, freelancers, founders, and teams*
