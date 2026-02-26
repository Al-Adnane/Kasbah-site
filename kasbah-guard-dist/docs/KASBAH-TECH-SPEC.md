# KASBAH GUARD — TECHNICAL SPECIFICATION
**Version:** 26.0 "Silent Guardian" | **Date:** February 24, 2026 | **Classification:** Foundational

---

# 1. SYSTEM OVERVIEW

Kasbah Guard is a local-first Data Loss Prevention (DLP) system for AI platforms. It intercepts user actions (paste, send, upload, edit, download, browse) at the browser level, routes decisions through a local Rust enforcement engine, and applies a 3-tier intervention model (silent/warning/block) based on real-time risk scoring.

**Core Principle:** Authority precedes autonomy. No data leaves the device without local enforcement.

```
User → Browser Extension (6 verbs) → HTTP :8788 → Guard (Rust/Tauri 2)
                                                    ├─ Risk Engine (60+ regex, TF-IDF ML, entropy)
                                                    ├─ Ticket System (HMAC-SHA256, 120s TTL)
                                                    ├─ Audit Trail (SHA-256 hash chain, SQLite)
                                                    ├─ Clipboard Monitor (80ms polling)
                                                    ├─ File Watcher (2s polling)
                                                    └─ Keystroke Monitor (macOS CGEventTap)
```

---

# 2. DATA STRUCTURES (guard.rs)

## 2.1 Finding

```rust
struct Finding {
    ftype: &'static str,       // "Credit Card", "SSN", "API Key", etc.
    category: &'static str,    // "secrets", "injection", "pii", "financial"
    preview: String,            // Truncated match preview
    confidence: f32,            // 0.0 – 1.0
    severity: &'static str,    // "critical" | "high" | "medium" | "low"
}
```

## 2.2 State (Central Server State)

```rust
struct State {
    mem_events: VecDeque<MemEvent>,          // Max 500 in-memory events
    stats: Stats,                            // Aggregate counters
    rate_map: DashMap<String, RateState>,     // Per-IP rate limiting
    kill_switch: bool,                       // Fail-closed mode
    config: GuardConfig,                     // Monitor settings
    fs_events: VecDeque<FsEvent>,            // File system events
    last_clipboard_hash: String,             // Dedup clipboard
    clipboard_scans: u32,
    clipboard_flags: u32,
    fs_scans: u32,
    fs_flags: u32,
    keystroke_scans: u32,
    keystroke_flags: u32,
    velocity: VelocityTracker,               // Behavioral velocity
    behavioral: BehavioralTracker,           // Anomaly detection
    verb_counts: HashMap<String, u64>,       // Per-verb counters
    verb_last_blocked: HashMap<String, (u64, String)>,
    ueba: UebaEngine,                        // User/Entity Behavior Analytics
    compliance: ComplianceEngine,
    rbac_fleet: RbacFleetManager,
    process_monitor: ProcessMonitor,
}
```

## 2.3 Stats

```rust
struct Stats {
    total: u32,
    allowed: u32,
    denied: u32,
    replay_blocked: u32,
    secrets_caught: u32,
    threats_blocked: u32,
    rate_limited: u32,
    locked_out: u32,
}
```

## 2.4 GuardConfig

```rust
struct GuardConfig {
    clipboard_watch: bool,          // default: true
    fs_watch: bool,                 // default: true
    watch_paths: Vec<String>,       // default: ~/Desktop, ~/Documents, ~/Downloads
    clipboard_interval_ms: u64,     // default: 80
    fs_poll_interval_ms: u64,       // default: 5000
    notify_flagged: bool,           // default: true
    notify_clean: bool,             // default: false
}
```

## 2.5 VelocityTracker

```rust
struct VelocityTracker {
    recent_risks: VecDeque<(u64, u16)>,  // (timestamp_ms, risk_score)
    window_ms: u64,                       // 60,000 ms
    max_entries: usize,                   // 200
}
```

Alert levels:
- **NORMAL:** < 5 high-risk events in window
- **ELEVATED:** 5–9 high-risk events
- **CRITICAL:** 10+ high-risk OR 5+ critical (risk ≥ 85)

## 2.6 MemEvent

```rust
struct MemEvent {
    ts_ms: u64,
    kind: String,      // "DECIDE", "CONSUME", "CLIPBOARD", "TICKET_ISSUE", etc.
    data: serde_json::Value,
}
```

---

# 3. RISK SCORING ALGORITHM

## 3.1 Thresholds

| Risk Score | Intervention | Extension UX | Guard Cost |
|-----------|-------------|-------------|------------|
| 0–29 | Silent | Nothing shown, action proceeds | 0 |
| 30–70 | Warning | Toast notification, action proceeds | 0 |
| 71–100 | Block | Modal dialog, user decides | 1 Guard |

## 3.2 Detection Tiers

**Critical (risk += 50–100):**
- Private keys (PEM headers)
- API keys: `sk_live_`, `sk_test_`, `sk_proj_`, `ghp_`, `gho_`, `ghs_`, `xoxb-`, `xoxp-`
- AWS credentials (`AKIA*`)
- JWTs (`eyJ` + 3-segment dot format)
- Database URLs (`postgres://`, `mongodb://`, etc.)

**High (risk += 30–50):**
- Passwords (20+ assignment patterns)
- Credit cards (Luhn-validated)
- SSN (XXX-XX-XXXX with exclusion ranges)
- OAuth tokens, basic auth

**Medium (risk += 15–30):**
- Phone numbers (US, international, Morocco)
- Email addresses (with PII context)
- Prompt injection (Jaccard similarity ≥ 0.4 against 10+ templates)
- Path traversal (`../../etc/passwd`)
- Binary content with embedded secrets

**Low (risk += 5–15):**
- High-entropy strings (Shannon > 3.5)
- Zero-width Unicode characters
- ROT13/L33t speak evasion

## 3.3 Evasion Detection Pipeline

```
Input text
  → Strip zero-width characters (\u200B, \u200C, \u200D, \u061C, etc.)
  → Unicode normalization (Cyrillic → Latin homoglyphs)
  → Base64 decode (recursive, up to 3 layers)
  → Hex decode
  → URL decode
  → ROT13 decode
  → L33t speak deobfuscation (0→o, 3→e, 4→a, @→a, $→s, 1→i, 7→t)
  → Re-scan all patterns on decoded text
```

## 3.4 False Positive Filters

Excludes: test/dummy passwords, config templates (`$VARIABLE`, `${VAR}`, `<placeholder>`), framework constants, Google site verification, Prometheus/Grafana configs, Terraform HCL, minified JavaScript.

## 3.5 Behavioral Boosts

| Condition | Risk Boost |
|-----------|-----------|
| 5+ high-risk events in 60s | +10–20 |
| Same content hash repeated | +15 |
| Unusual source (clipboard, file, network) | +20 |
| Unusual time-of-day | +10 |

## 3.6 Policy Overrides

Custom policies stored in SQLite `policies` table:
- `action='block'` → risk = max(risk, 95)
- `action='warn'` → risk = max(risk, 80)

---

# 4. INTERVENTION SYSTEM

## 4.1 InterventionLevel (kernel lib.rs)

```rust
pub enum InterventionLevel {
    Silent,    // risk < 30
    Warning,   // 30 ≤ risk ≤ 70
    Block,     // risk > 70
}

pub fn decide_intervention(risk_score: u32) -> InterventionLevel {
    if risk_score < 30 { InterventionLevel::Silent }
    else if risk_score <= 70 { InterventionLevel::Warning }
    else { InterventionLevel::Block }
}
```

## 4.2 Severity Gate (OS-Level Monitors)

Only these PII types trigger user-facing interruption:

```rust
let critical_types = [
    "Credit Card", "SSN", "Social Security",
    "Private Key", "AWS Key", "API Key", "Secret Key",
    "Medical Record", "Passport", "National ID", "IBAN",
    "Password", "Bank Account"
];
```

All other findings (phone, email, low-confidence) → silent audit log only.

---

# 5. TICKET CRYPTOGRAPHY

## 5.1 Ticket Creation

```
ticket_id   = UUID v4
nonce       = random u64
exp_ms      = now_ms() + 120,000 (2 minutes)

claims      = "{ticket_id}|{action}|{scope}|{content_hash}|{risk}|{exp_ms}|{nonce}"
signature   = HMAC-SHA256(signing_key, claims)

claims_b64  = BASE64_URL_SAFE_NO_PAD(claims)
signed_ticket = "{claims_b64}.{signature_hex}"
```

## 5.2 Ticket Verification

```
1. Split signed_ticket on last '.'
2. Decode claims from BASE64_URL_SAFE_NO_PAD
3. HMAC-SHA256 verify (TIMING-SAFE constant-time comparison)
4. Parse claims: split on '|' → [ticket_id, action, scope, content_hash, risk, exp_ms, nonce]
5. Expiry check: now_ms() > exp_ms → reject
6. Replay check: consumed_tickets table → reject if exists
```

## 5.3 Auto-Deny

Risk ≥ 90 → block regardless of user choice in `/consume`.

---

# 6. AUDIT TRAIL (SQLite)

## 6.1 Schema

```sql
CREATE TABLE audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_ms INTEGER NOT NULL,
    kind TEXT NOT NULL,          -- DECIDE, CONSUME, CLIPBOARD, TICKET_ISSUE, KEYLOG, EXT_EVENT
    ticket_id TEXT,
    action TEXT,
    scope TEXT,
    decision TEXT,               -- ALLOW, DENY, CHALLENGE
    risk INTEGER,
    reason TEXT,
    content_hash TEXT,
    prev_hash TEXT NOT NULL,     -- Hash chain link
    entry_hash TEXT NOT NULL,    -- SHA-256 of this entry
    data TEXT                    -- JSON metadata
);

CREATE INDEX idx_audit_ts ON audit(ts_ms DESC);
CREATE INDEX idx_audit_ticket ON audit(ticket_id);
```

## 6.2 Hash Chain

```
entry_hash = SHA-256("{prev_hash}|{ts_ms}|{kind}|{data}")
```

First entry: `prev_hash = "GENESIS"`

Verification: `/audit/verify` walks the entire chain and recomputes every hash.

## 6.3 Supporting Tables

```sql
CREATE TABLE consumed_tickets (
    ticket_id TEXT PRIMARY KEY,
    consumed_ms INTEGER NOT NULL,
    action TEXT,
    scope TEXT
);

CREATE TABLE policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'block',  -- 'block' or 'warn'
    scope TEXT DEFAULT '*',
    created_ms INTEGER NOT NULL
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    created_ms INTEGER NOT NULL,
    last_login_ms INTEGER
);

CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_ms INTEGER NOT NULL,
    expires_ms INTEGER NOT NULL
);

CREATE TABLE authority_bindings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    authority_type TEXT NOT NULL DEFAULT 'personal',
    scope_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'BOUND',
    bound_at_ms INTEGER NOT NULL,
    reclaimed_at_ms INTEGER,
    cert_hash TEXT NOT NULL
);

CREATE TABLE webhook_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    event_types TEXT NOT NULL DEFAULT '*',
    headers_json TEXT DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_ms INTEGER NOT NULL
);
```

## 6.4 Database Pragmas

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

---

# 7. HTTP API CONTRACT

## 7.1 POST /decide — Core Risk Assessment

**Request:**
```json
{
  "action": "string",
  "product": "string",
  "text": "string",
  "verb": "string",
  "meta": {
    "preview": "string",
    "secrets": ["string"],
    "risk": 0,
    "urls": ["string"]
  }
}
```

**Response:**
```json
{
  "ok": true,
  "decision": "ALLOW|DENY|WARN",
  "blocked": false,
  "intervention": "silent|warning|block",
  "ticket": "base64.hex",
  "ticket_id": "uuid",
  "exp_ms": 1234567890,
  "risk": 0,
  "preflight": "ALLOW|DENY|CHALLENGE",
  "reason": "string",
  "content_hash": "sha256-hex",
  "verb": "string"
}
```

## 7.2 POST /consume — Ticket Redemption

**Request:**
```json
{
  "ticket": "base64.hex",
  "choice": "ALLOW|DENY"
}
```

**Response:**
```json
{
  "ok": true,
  "decision": "ALLOW|DENY|BLOCK",
  "reason": "string"
}
```

## 7.3 GET /audit?limit=N — Audit Query

**Response:**
```json
{
  "ok": true,
  "entries": [{
    "id": 1,
    "ts_ms": 0,
    "kind": "DECIDE",
    "ticket_id": "uuid",
    "decision": "ALLOW",
    "risk": 15,
    "prev_hash": "hex",
    "entry_hash": "hex"
  }],
  "count": 100,
  "chain_start": "GENESIS"
}
```

## 7.4 GET /audit/verify — Chain Integrity

**Response:**
```json
{
  "ok": true,
  "status": "INTACT|BROKEN",
  "entries_checked": 5488,
  "chain_start": "GENESIS"
}
```

## 7.5 GET /status — System Status

**Response:**
```json
{
  "ok": true,
  "version": "26.0",
  "uptime_ms": 0,
  "stats": { "total": 0, "allowed": 0, "denied": 0 },
  "crypto": "sha256",
  "classifier": "tfidf-lr-v2-online",
  "classifier_type": "statistical_ml",
  "features": {
    "clipboard_watch": true,
    "fs_watch": true,
    "keystroke_watch": true
  }
}
```

## 7.6 GET /verb/stats — Per-Verb Tracking

**Response:**
```json
{
  "ok": true,
  "verb_counts": {
    "send": 0, "paste": 0, "upload": 0,
    "download": 0, "browse": 0, "edit": 0
  }
}
```

---

# 8. BROWSER EXTENSION

## 8.1 Manifest (Chrome MV3)

```json
{
  "manifest_version": 3,
  "name": "Kasbah Guard",
  "version": "1.2.0",
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://chatgpt.com/*", "https://chat.openai.com/*",
    "https://claude.ai/*", "https://gemini.google.com/*",
    "https://grok.x.ai/*", "https://grok.com/*",
    "http://127.0.0.1:8788/*"
  ],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["28+ AI platform URL patterns"],
    "js": ["src/content.js"],
    "css": ["src/styles.css"],
    "run_at": "document_end"
  }]
}
```

## 8.2 The 6 Verbs

| Verb | Event | Detection | Threshold |
|------|-------|-----------|-----------|
| **SEND** | Click on send button | aria-label, data-testid, SVG arrow icon, position heuristics | Any text in composer |
| **PASTE** | paste + beforeinput | Clipboard data API | 20+ chars with secrets OR 2500+ chars |
| **UPLOAD** | File input change + drag-drop | Filename regex + content scan (<500KB text files) | Sensitive filename OR secrets in content |
| **DOWNLOAD** | Link click (blob:/data: URLs) | Inside AI response area detection | Any download from AI response |
| **EDIT** | Apply/Accept button click | Button text/class/aria matching | Any code block application |
| **BROWSE** | Integrated in SEND/PASTE | URL regex extraction | URLs present in payload |

## 8.3 guardFlow() — Decision Pipeline

```
guardFlow(verb, text, extraMeta, onAllowCb, onBlockCb)

1. scanSecrets(text) → local regex scan (20+ patterns)
2. riskScore(text, secrets) → 0-100
3. POST /decide → {intervention, risk, ticket, decision}

4a. intervention === "silent" → onAllowCb() immediately
4b. intervention === "warning" → showToast(4.5s) + onAllowCb()
4c. intervention === "block" → showModal(user decides)
    → Allow: POST /consume(ALLOW) → onAllowCb()
    → Block: POST /consume(DENY) → onBlockCb()

Error: Guard offline → showToast("unprotected") → onAllowCb()
```

## 8.4 Client-Side Secret Patterns (20+)

| Pattern | Regex |
|---------|-------|
| API Key | `(?:api[_-]?key\|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}` |
| OpenAI | `sk-[A-Za-z0-9]{20,}` |
| AWS | `AKIA[0-9A-Z]{16}` |
| Private Key | `-----BEGIN (?:RSA \|EC \|DSA \|OPENSSH )?PRIVATE KEY-----` |
| Password | `(?:password\|passwd\|pwd)\s*[:=]\s*['"]?[^\s'"]{6,}` |
| Token | `(?:token\|bearer\|auth)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{20,}` |
| Connection String | `(?:mongodb\|postgres\|mysql\|redis):\/\/[^\s]{10,}` |
| GitHub | `gh[pousr]_[A-Za-z0-9_]{36,}` |
| Slack | `xox[bprs]-[A-Za-z0-9\-]{10,}` |
| SSH Key | `-----BEGIN OPENSSH PRIVATE KEY-----` |
| Credit Card | Luhn-pattern (Visa/MC/Amex/Discover) |
| SSN | `\b(?!000\|666\|9\d{2})\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b` |
| IBAN | `\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b` |
| Passport | `(?:passport\|passeport)\s*(?:no\|number\|#\|:)\s*[A-Z0-9]{5,12}` |
| National ID | 12+ variants (cedula, DNI, NIF, NIE, etc.) |
| Phone | International format with country codes |
| Email (PII context) | Label-based detection (email:, contact:) |
| Medical Record | Patient ID, MRN, health record patterns |
| Medical Data | Diagnosis, prescription, medication, ICD-10 |
| Date of Birth | DOB patterns with date formats |
| Address | Street address patterns |

## 8.5 Heartbeat (Fail-Closed)

```
Poll: GET /health every 5s
Failures: counter increments on error
Threshold: 3 consecutive failures → alive = false
When dead: modal before any verb ("Guard isn't responding")
Recovery: first successful health check → alive = true, failures = 0
```

## 8.6 Platform Coverage (28+ URL patterns)

ChatGPT, Claude, Gemini, AI Studio, Perplexity, Poe, DeepSeek, Grok, Copilot, GitHub Copilot, HuggingChat, You, Pi, Mistral, Manus, Cursor, Windsurf, Codeium, NotebookLM, Labs.Google, Meta AI, Cohere, ChatBot Arena, Open Assistant

## 8.7 UI Components

**Toast:**
- Position: fixed, bottom-right, z-index 2147483646
- Duration: 4500ms + 300ms slide animations
- Background: rgba(0,0,0,0.92) with backdrop-filter blur(16px)

**Modal:**
- Position: fixed inset, z-index 2147483647
- Background overlay: rgba(0,0,0,0.35) with blur(2px)
- Card: max 480px width
- Color by risk: high=red, medium=yellow, low=green
- Buttons: "Block {verb}" (outlined) / "Allow {verb}" (solid)

---

# 9. DESKTOP APP (Tauri 2)

## 9.1 Configuration (tauri.conf.json)

```json
{
  "productName": "KasbahGuard",
  "version": "1.5.0",
  "identifier": "io.bekasbah.guard",
  "app": {
    "withGlobalTauri": true,
    "windows": [{
      "title": "Kasbah Guard",
      "width": 1100,
      "height": 740,
      "resizable": true,
      "center": true
    }],
    "security": {
      "csp": "default-src 'self'; connect-src 'self' http://127.0.0.1:* http://localhost:* https://api.bekasbah.com; frame-ancestors 'none'"
    }
  }
}
```

## 9.2 CSP Directives

| Directive | Value | Purpose |
|-----------|-------|---------|
| default-src | 'self' | Isolate from external |
| img-src | 'self' data: blob: | Local + data images |
| style-src | 'self' 'unsafe-inline' https://fonts.googleapis.com | Google Fonts |
| font-src | 'self' https://fonts.gstatic.com | Font files |
| script-src | 'self' 'unsafe-inline' | Local scripts only |
| connect-src | 'self' http://127.0.0.1:* https://api.bekasbah.com | API whitelist |
| frame-ancestors | 'none' | Prevent framing |

## 9.3 Code Signing

```
Identity: "Developer ID Application: Adnane Addioui (AQPMR37BC8)"
Entitlements: entitlements.plist
Min macOS: 10.13
```

---

# 10. CLOUD API (Cloudflare Worker)

## 10.1 Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | /auth/register | Create account + send verification |
| POST | /auth/verify | 6-digit code verification |
| POST | /auth/resend | Resend code (rate-limited 60s) |
| POST | /auth/login | Sign in → JWT |
| GET | /auth/me | Get profile (Bearer token) |
| POST | /auth/logout | Revoke session |
| GET | /auth/stats | Public user count |
| GET | /health | Health check |

## 10.2 JWT Format

```
Header:  {"alg":"HS256","typ":"JWT"} → Base64URL
Payload: {"sub":"user_id","email":"...","plan":"pioneer","iss":"kasbah-guard","iat":0,"exp":0} → Base64URL
Signature: HMAC-SHA256(secret, header.payload) → Base64URL

Expiry: 30 days
```

## 10.3 Password Hashing

```
salt = 16 random bytes → hex
hash1 = SHA-256("kasbah:" + salt + ":" + password)
hash2 = SHA-256(salt + ":" + hex(hash1))
stored = hex(hash2)
```

## 10.4 Verification Flow

```
Code: 4 random bytes → uint % 1000000 → zero-padded to 6 digits
Storage: KV key "verify:{email}" with TTL 3600s (1 hour)
Max attempts: 5
Rate limit on resend: 60s per email
Email via: Resend API from noreply@bekasbah.com
```

## 10.5 KV Storage Keys

| Key Pattern | TTL | Purpose |
|------------|-----|---------|
| `USERS:{email}` | None | Account data |
| `USERS:verify:{email}` | 3600s | Verification code + attempts |
| `USERS:__count__` | None | Total user count |
| `SESSIONS:{token}` | 2592000s (30d) | Session data |

---

# 11. BILLING KERNEL

## 11.1 Structure (kernel lib.rs)

```rust
pub enum PlanType { Free, Pro }

pub struct Account {
    pub user_id: String,
    pub plan: PlanType,
    pub guards_used: i64,
    pub guards_limit: i64,    // Free: 50, Pro: 10,000
    pub month: String,         // "YYYY-MM"
}
```

## 11.2 Schema

```sql
CREATE TABLE billing_accounts (
    user_id TEXT PRIMARY KEY,
    plan TEXT NOT NULL DEFAULT 'Free',
    guards_used INTEGER DEFAULT 0,
    guards_limit INTEGER NOT NULL,
    month TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE guard_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    guards_cost INTEGER NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    receipt_hash TEXT NOT NULL
);
```

## 11.3 Status: ✅ WIRED (Feb 24, 2026)

- `consume_guard()` called in `/consume` handler for Block-level decisions (risk > 70)
- Silent (risk < 30) and Warning (risk 30-70) cost 0 Guards
- `GET /billing/usage` returns plan, guards_remaining, guards_used
- BillingKernel initialized with `billing.db` in app support directory
- 4 kernel tests passing

## 11.4 Config Persistence

- `GET /config` — returns current GuardConfig
- `POST /config` — updates and persists to `~/Library/Application Support/KasbahGuard/guard_config.json`
- `load_guard_config()` reads on startup, creates defaults if missing
- All monitor settings (clipboard_watch, fs_watch, intervals, watch_paths, notify prefs) survive restarts

---

# 12. RATE LIMITING

## 12.1 Token Bucket (guard.rs)

```
Capacity: 60.0 tokens
Refill rate: 20.0 tokens per second
Lock-out threshold: 12 strikes
Lock-out duration: 60,000 ms (1 minute)
```

## 12.2 Verification (API Worker)

```
Code resend: 1 per 60 seconds per email
Verification attempts: max 5 per code
Code expiry: 1 hour
Session expiry: 30 days
```

---

# 13. SECURITY PROPERTIES

## 13.1 Cryptographic Guarantees

| Property | Algorithm | Notes |
|----------|-----------|-------|
| Ticket signatures | HMAC-SHA256 | Timing-safe verification |
| Content hashes | SHA-256 | All scanned content |
| Audit chain | SHA-256 | GENESIS → N, append-only |
| Password hashing | Double SHA-256 with salt | Local guard |
| Session tokens | HMAC-SHA256 JWT | Cloud API |

## 13.2 Anti-Replay

- Consumed flag in memory + SQLite `consumed_tickets` table
- Cryptographic expiry embedded in ticket claims
- Single-use enforcement

## 13.3 Anti-Evasion

- Zero-width character stripping
- Unicode homoglyph normalization
- Base64/hex/URL decode (recursive)
- ROT13 + L33t speak decode
- Multi-language injection detection

## 13.4 Fail-Closed Behavior

- Extension: blocks all verbs after 3 failed heartbeats
- Kill switch: `/kill_switch` endpoint forces deny-all
- Auto-deny: risk ≥ 90 overrides user choice

---

# 14. CONSTANTS REFERENCE

| Constant | Value | Location |
|----------|-------|----------|
| Server port | 8788 | guard.rs |
| Ticket TTL | 120,000 ms (2 min) | guard.rs |
| Session TTL (local) | 604,800,000 ms (7 days) | guard.rs |
| Session TTL (cloud) | 30 days | worker.js |
| Max in-memory events | 500 | guard.rs |
| Velocity window | 60,000 ms | guard.rs |
| Velocity max entries | 200 | guard.rs |
| Behavioral window | 300,000 ms (5 min) | guard.rs |
| Rate limit capacity | 60 tokens | guard.rs |
| Rate limit refill | 20/sec | guard.rs |
| Lock-out threshold | 12 strikes | guard.rs |
| Lock-out duration | 60,000 ms | guard.rs |
| Clipboard poll | 80 ms | guard.rs |
| FS poll | 5,000 ms (2s effective) | guard.rs |
| Heartbeat poll | 5,000 ms | content.js |
| Heartbeat max failures | 3 | content.js |
| Background health poll | 10,000 ms | background.js |
| Popup stats poll | 3,000 ms | popup.js |
| Toast duration | 4,500 ms | content.js |
| Toast animation | 300 ms | content.js |
| Badge flash | 3,000 ms | background.js |
| Drop grace window | 10,000 ms | content.js |
| Counter animation | 350 ms | popup.js |
| Upload scan max size | 500 KB | content.js |
| Composer text max | 6,000 chars | content.js |
| Modal findings max | 5 shown | content.js |
| Code preview max | 300 chars | content.js |

---

*This document describes the system as built and deployed at v26.0. It is the foundational technical reference for all future development, patent prosecution, and due diligence.*
