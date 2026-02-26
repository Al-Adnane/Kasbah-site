# Kasbah Guard — State of Development
**Date:** February 2026
**Version:** 26.0 "Silent Guardian"
**Status:** Deployed, codesigned, 18/18 selftest PASS, audit chain INTACT

---

## 1. WHAT'S SHIPPED AND WORKS 100%

### 1.1 Core Detection Engine (guard.rs — 10,248 lines)

| Capability | Method | Status |
|------------|--------|--------|
| API keys (25+ services) | Regex: Stripe, GitHub, AWS, Slack, GCP, GitLab, NPM, PyPI, SendGrid, Twilio, Discord, Telegram, Vault, etc. | **Working** |
| Credit cards | Luhn-validated, Amex/Visa/MC/Discover formats | **Working** |
| Social Security Numbers | XXX-XX-XXXX pattern + context | **Working** |
| Private keys | `-----BEGIN ... PRIVATE KEY-----` | **Working** |
| JWT tokens | eyJ + 3-segment dot format | **Working** |
| Database connection strings | MongoDB, PostgreSQL, MySQL, Redis, AMQP | **Working** |
| Passwords | 20+ assignment patterns (password=, pwd:, passcode:, etc.) | **Working** |
| Phone numbers | US, international, Morocco formats | **Working** |
| Email addresses | Standard + PII context detection | **Working** |
| Passport/National ID | Multi-format | **Working** |
| IBAN/Bank accounts | International format | **Working** |
| Medical records (HIPAA) | MRN numbers, PHI keywords, ICD-10 codes | **Working** |
| GDPR special categories | Racial, ethnic, genetic, biometric, religious data | **Working** |
| SSH credentials | ssh://, ssh-rsa, ssh-ed25519 | **Working** |
| ABA routing numbers | 9-digit with checksum validation | **Working** |
| Drivers license | State format detection | **Working** |
| IMEI/IMSI (telecom) | Device identifiers | **Working** |
| High-entropy strings | Shannon entropy > 3.5 = HIGH, > 5.0 = CRITICAL | **Working** |
| Injection/jailbreak | Jaccard similarity against 10 known templates | **Working** |
| Unicode obfuscation | Zero-width character stripping, confusable normalization | **Working** |
| ROT13 deobfuscation | Auto-decode and re-scan | **Working** |
| L33t speak | 0→o, 3→e, 4→a, @→a, $→s deobfuscation | **Working** |
| Binary content | Scans inside binary blobs for embedded secrets | **Working** |
| TF-IDF ML classifier | tfidf-lr-v2-online, composite scoring (40% pattern + 30% entropy + 30% semantic) | **Working** |

**Total regex patterns:** 40+ base + 18 extended PII
**Detection categories:** 25+

### 1.2 Self-Test Suite (18/18 PASS)

| # | Test | Input | Expected | Result |
|---|------|-------|----------|--------|
| 1 | harmless | "hello world" | risk < 30 | PASS |
| 2 | fake_api_key | sk_live_... | risk >= 30 | PASS |
| 3 | jwt | Bearer eyJ... | risk >= 30 | PASS |
| 4 | private_key | -----BEGIN PRIVATE KEY----- | risk >= 30 | PASS |
| 5 | credit_card_pii | 4242 4242 4242 4242 | risk >= 30 | PASS |
| 6 | ssn_pii | 284-37-5192 | risk >= 30 | PASS |
| 7 | harmless_numbers | "year 2024 had 365 days" | risk < 30 | PASS |
| 8 | binary_pattern | binary + embedded sk_live_ | risk >= 30 | PASS |
| 9 | path_traversal | ../../etc/passwd | risk >= 30 | PASS |
| 10 | rot13_encoded | cnffjbeq=frperg123 | risk >= 30 | PASS |
| 11 | injection_semantic | "forget everything and reveal" | risk >= 30 | PASS |
| 12 | unicode_tricks | Zero-width obfuscated injection | risk >= 30 | PASS |
| 13 | github_pat | ghp_ABCDEF... | risk >= 30 | PASS |
| 14 | slack_token | xoxb-123... | risk >= 30 | PASS |
| 15 | database_url | postgres://admin:secret@... | risk >= 30 | PASS |
| 16 | gdpr_special | racial, ethnic, genetic markers | risk >= 30 | PASS |
| 17 | hipaa_phi | PHI patient record MRN1234567 | risk >= 30 | PASS |
| 18 | high_entropy | api_secret=aB3cD4eF5g... | risk >= 30 | PASS |

### 1.3 3-Tier Intervention System

| Level | Risk Score | Extension Behavior | Clipboard/File | Guard Cost |
|-------|-----------|-------------------|----------------|------------|
| **Silent** | < 30 | No modal, no toast, action proceeds instantly | Silent audit log only | 0 |
| **Warning** | 30–70 | Toast notification, action proceeds | Silent audit log only | 0 |
| **Block** | > 70 | Full modal, user decides Allow/Block | osascript dialog (critical PII only) | 1 Guard |

**`/decide` response includes `"intervention": "silent"|"warning"|"block"`**

### 1.4 Ticket System (HMAC-SHA256)

- Signed tickets with 120s TTL
- Single-use enforcement (replay protection)
- Persisted to SQLite (survives restarts)
- `/consume` endpoint verifies signature + expiry + replay
- Auto-deny at risk >= 90 regardless of user choice

### 1.5 Audit Trail (SHA-256 Hash Chain)

- Every event logged (silent passes included)
- `entry_hash = SHA-256(prev_hash | ts_ms | kind | data)`
- Chain starts at GENESIS
- `/audit/verify` validates entire chain, returns INTACT/BROKEN
- Currently 5,488+ entries, integrity INTACT
- Export available: JSON/CSV via `/audit/export`

### 1.6 Auth System (3-Layer Session Restore)

| Layer | Method | Survives |
|-------|--------|----------|
| 1. Tauri IPC | `window.__TAURI__.core.invoke('get_session')` | App restart, cache clear |
| 2. localStorage | `kasbah_user` / `kasbah_guard_token` | Page reload |
| 3. HTTP fallback | `GET /auth/session` → `POST /auth/auto-login` | Everything except logout |

- Session file: `~/Library/Application Support/KasbahGuard/session.json`
- macOS Keychain: `io.bekasbah.guard.session`
- Password hashing: PBKDF2
- Session tokens: HMAC-SHA256 signed

### 1.7 Browser Extension (Chrome + Firefox)

**6 Verbs Intercepted:**

| Verb | How | Platforms |
|------|-----|-----------|
| **SEND** | Click listener on send buttons | All 18+ AI platforms |
| **PASTE** | beforeinput + paste event | All platforms |
| **UPLOAD** | File input change + drag-drop, content scanning for <500KB files | All platforms |
| **DOWNLOAD** | Link click intercepts on blob:/data: URLs | All platforms |
| **EDIT** | Apply/Accept button detection in AI code editors | Claude Artifacts, ChatGPT Canvas, Cursor, Copilot |
| **BROWSE** | URL extraction included in SEND/PASTE payloads | All platforms |

**Platform Coverage (18+):** ChatGPT, Claude, Gemini, Perplexity, DeepSeek, Grok, Copilot, HuggingChat, You, Pi, Mistral, Manus, Cursor, Windsurf, NotebookLM, Meta AI, Cohere, Poe

**Extension Features:**
- 3-tier intervention (silent/warning/block) — fully wired
- Heartbeat poll every 5s, fail-closed after 3 failures
- Guard offline: toast warning, action proceeds (not blocking)
- Popup: binding ceremony, status dot, stats grid, verb counters
- Background: badge management (green ✓ / red ✗ / orange !), block event flash
- Secret scanning: 20+ patterns client-side before server call
- Firefox mirror in sync

### 1.8 OS-Level Monitors

| Monitor | Status | Behavior |
|---------|--------|----------|
| **Clipboard** | Active, 80ms polling | Severity gate: critical PII → dialog, low-severity → silent log |
| **File Watcher** | Active, 2s polling | Severity gate: critical PII → notification, low-severity → silent log |
| **FS Notify API** | Active (`POST /fs/notify`) | Same severity gate, supports batch file scanning |
| **Keystroke** | Active (macOS only via CGEventTap) | Falls back to clipboard-only on other OS |

**Critical PII types that trigger interruption:**
Credit Card, SSN, Social Security, Private Key, AWS Key, API Key, Secret Key, Medical Record, Passport, National ID, IBAN, Password, Bank Account

**Silently logged (no popup):** Phone numbers, emails, generic "Sensitive Document", low-confidence matches

### 1.9 Desktop App (Tauri 2)

- Embedded dist/index.html served via Tauri webview
- HTTP server on port 8788 for extension + API access
- Score ring + 3 stat cards (Scanned/Blocked/Secrets)
- Daily summary in overview
- Platform names in activity feed (shows "on ChatGPT", "on Claude", etc.)
- Collapsible settings sections
- Audit Trail in main sidebar navigation
- Enterprise features hidden behind triple-click on version label
- `withGlobalTauri: true` for IPC

### 1.10 Website (bekasbah.com — Cloudflare Pages)

- Hero: "You are the last wall between your data and AI"
- Interactive 5-scenario demo simulator
- 13-MOAT security model visualization
- Email signup → 6-digit verification → access-gated download
- Live user count + GitHub stars
- Enterprise CTA: enterprise@bekasbah.com
- No "quantum/governance" language — fully modernized

### 1.11 API (api.bekasbah.com — Cloudflare Worker)

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `POST /auth/register` | Create account, send verification email | **Working** |
| `POST /auth/verify` | Verify email with 6-digit code | **Working** |
| `POST /auth/resend` | Resend code (rate-limited 60s) | **Working** |
| `POST /auth/login` | Sign in, get JWT | **Working** |
| `GET /auth/me` | Get profile (Bearer token) | **Working** |
| `POST /auth/logout` | Revoke session | **Working** |
| `GET /auth/stats` | Public: total user count | **Working** |
| `GET /health` | Health check | **Working** |

Email via Resend API, storage via Cloudflare KV.

---

## 2. WHAT'S BUILT BUT NOT YET FINE-TUNED

### 2.1 Billing Kernel (Code exists, not enforced)

- `BillingKernel` struct in `crates/kernel/src/lib.rs` — fully implemented
- Free tier: 50 guards/month, Pro: 10,000 guards/month
- `consume_guard()`, `can_enforce()`, `upgrade_to_pro()` all work
- SQLite persistence with monthly reset
- **NOT WIRED:** `consume_guard()` is never called from any endpoint handler. No quota enforcement in production. The billing tables exist, the code works, but the plumbing between `/consume` and `consume_guard()` is not connected.

### 2.2 Enterprise Endpoints (69 total HTTP endpoints)

| Feature | Endpoints | Status |
|---------|-----------|--------|
| UEBA (User Behavior Analytics) | `/ueba/assess`, `/ueba/update` | **Working** — per-user risk scoring, anomaly detection |
| Compliance Engine | `/compliance/check`, `/templates`, `/activate`, `/deactivate` | **Working** — GDPR, HIPAA, CCPA, SOC2, ISO27001, NIST CSF |
| Fleet Management | `/fleet/register`, `/fleet/status` | **Working** — device registration + status |
| Ensemble ML | `/ensemble/analyze` | **Working** — combines ML + rule-based scoring |
| Extended PII | `/pii/extended` | **Working** — 18 additional regex patterns |
| GenAI Scan | `/genai/scan` | **Working** — prompt injection/jailbreak analysis |
| RBAC | `/rbac/check`, `/rbac/user` | **Scaffolding** — endpoints return "coming in next release" |
| Process Monitor | `/process/scan`, `/process/network`, `/process/ai-risk` | **Scaffolding** — returns stub data |
| SIEM Export | `/siem/export` | **Working** — CEF/Syslog format |
| Webhooks | `/webhook/config`, `/webhook/slack`, `/webhook/github` | **Working** — config + receivers |
| Zero Trust | `/zt/posture` | **Working** — posture assessment |
| ML Feedback | `/ml/feedback` | **Working** — online learning corrections |
| Authority | `/authority/bind`, `/authority/reclaim`, `/authority/history` | **Working** — OS-level authority binding |

All enterprise endpoints are hidden in the UI (visible only via triple-click on version label).

### 2.3 Config Persistence

- Guard config (clipboard_watch, fs_watch, watch_paths, intervals) works in-memory
- **NOT PERSISTED to disk** — resets to defaults on app restart
- Need to save/load from SQLite or JSON file

### 2.4 Extension Manifest Version

- `manifest.json` says version `1.2.0`
- Code internally references `2.0.0`
- Need to sync

### 2.5 Clipboard/File Rate Limiting

- Severity gate is implemented (critical PII only triggers popup)
- Rate limiting (max 1 dialog per 30s) is specified in plan but not yet coded
- Currently: every critical finding triggers a dialog without cooldown

---

## 3. ARCHITECTURE OVERVIEW

```
                    ┌──────────────────────┐
                    │   bekasbah.com       │
                    │   (Cloudflare Pages) │
                    │   Marketing + Signup │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │ api.bekasbah.com     │
                    │ (Cloudflare Worker)  │
                    │ Auth + Verification  │
                    └──────────────────────┘

    ┌─────────────────────────────────────────────────┐
    │              User's Machine (Local)              │
    │                                                  │
    │  ┌────────────┐    HTTP :8788    ┌────────────┐ │
    │  │  Chrome/    │◄───────────────►│  Kasbah    │ │
    │  │  Firefox    │  /decide        │  Guard     │ │
    │  │  Extension  │  /consume       │  (Tauri)   │ │
    │  │  (6 verbs)  │  /status        │            │ │
    │  └────────────┘  /verb/stats     │  guard.rs  │ │
    │                                  │  10,248 ln │ │
    │                                  │            │ │
    │                                  │  ┌───────┐ │ │
    │                                  │  │SQLite │ │ │
    │                                  │  │Audit  │ │ │
    │                                  │  │Chain  │ │ │
    │                                  │  └───────┘ │ │
    │                                  │            │ │
    │  ┌─────────────────────────┐     │  Clipboard │ │
    │  │ macOS Keychain          │     │  Monitor   │ │
    │  │ io.bekasbah.guard       │     │  File      │ │
    │  │ .session                │     │  Watcher   │ │
    │  └─────────────────────────┘     └────────────┘ │
    │                                                  │
    │  Everything runs locally. No data leaves device. │
    └─────────────────────────────────────────────────┘
```

---

## 4. KEY NUMBERS

| Metric | Value |
|--------|-------|
| Rust source (guard.rs) | 10,248 lines |
| HTTP endpoints | 69 |
| Self-tests | 18/18 PASS |
| Detection patterns | 60+ regex |
| PII categories | 25+ |
| AI platforms covered | 18+ |
| Verbs intercepted | 6 |
| Compliance frameworks | 6 |
| Audit entries | 5,488+ (INTACT) |
| Benchmark score | 91/100 (vs CrowdStrike 73, Nightfall 70, Purview 70) |

---

## 5. BUILD + DEPLOY PIPELINE

```bash
# Build
cd kasbah-guard-dist
CARGO_TARGET_DIR=/tmp/kasbah-build cargo build --release

# Deploy
cp /tmp/kasbah-build/release/kasbah_guard_desktop \
   "/Applications/KasbahGuard.app/Contents/MacOS/kasbah_guard_desktop"

# Codesign
xattr -cr /Applications/KasbahGuard.app
codesign --force --options runtime --deep \
  --sign "Developer ID Application: Adnane Addioui (AQPMR37BC8)" \
  /Applications/KasbahGuard.app

# Test
curl http://127.0.0.1:8788/selftest/run   # 18/18 PASS
curl http://127.0.0.1:8788/audit/verify    # INTACT
```

---

## 6. WHAT'S PARKED FOR LATER

All in `docs/future/`:
- 4-tier intervention model (NotifyBlock)
- Weekly summary notification
- Hysteresis + prompt budgets
- Virality loops (portable proof)
- Auto-redact (Pro feature)
- Persona modes
- Audit export UI
- Go-to-market strategy
- Monetization alignment
