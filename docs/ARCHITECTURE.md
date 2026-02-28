# Kasbah Guard — Architecture & Design

> **Version**: 3.5.2 (Engine) | 1.0.0 (Products)
> **Last Updated**: February 2026
> **Status**: PRODUCTION — 23/23 invariants, 58/58 market launch, 10/10 CLI tests

---

## System Overview

Kasbah Guard is a **decentralized, local-first** sensitive data detection system. All detection happens on-device; no data leaves the user's machine without explicit consent.

### Core Principle

> **"Zero-knowledge detection"** — The system detects risks locally without uploading content to servers.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│ USER INTERFACE LAYER (Extension, Desktop, CLI, VS Code)     │
├─────────────────────────────────────────────────────────────┤
│ DETECTION LAYER (detector.js, policy_preflight)            │
│  • 20+ pattern matching rules (SSN, CC, AWS keys, etc.)    │
│  • Entropy scoring (22-pattern classifier)                │
│  • Risk scoring (0-100)                                    │
├─────────────────────────────────────────────────────────────┤
│ EGRESS GATE LAYER (content.js, 18 moats)                  │
│  • URL scanning, body scanning, interaction blocking      │
│  • Encode detection, user override                        │
├─────────────────────────────────────────────────────────────┤
│ DECISION ENGINE (integrity.rs + audit.rs)                 │
│  • SII (System Integrity Index)                           │
│  • 3-gate authorization                                   │
│  • Audit logging                                          │
├─────────────────────────────────────────────────────────────┤
│ BACKEND (API Worker v2.0.0)                               │
│  • User authentication + Enterprise endpoints             │
│  • Moat F/O/I integration                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## The 18-Moat Egress Gate

The **content.js** script implements an 18-layer defense against data exfiltration.

### Moats 1-3: Manifest & Runtime
- **Moat 1**: `document_start` injection (runs BEFORE DOM exists)
- **Moat 2**: `world: MAIN` isolation (separate from page scripts)
- **Moat 3**: `all_frames: true` omnipresent coverage

### Moats 4-9: Hook Interception (5 API + 1 UI)
- **Moat 4**: `fetch()` hook — intercept all HTTP requests
- **Moat 5**: `XMLHttpRequest` hook — intercept XHR calls
- **Moat 6**: `navigator.sendBeacon()` hook — intercept analytics
- **Moat 7**: `WebSocket` hook — intercept WS connections
- **Moat 8**: `<form>.submit()` hook — intercept form submissions
- **Moat 9**: `window.open()` hook — intercept popup navigation

### Moat 10-11: Content Scanning (Passive)
- **Moat 10**: `MutationObserver` on src attributes
- **Moat 11**: Base64 decode + pattern scan

### Moat 12: Pattern Intelligence
- **Moat 12**: Shannon entropy + 22-pattern detector engine

### Moat 13: Zero-Latency Detection
- **Moat 13**: LOCAL JavaScript (NO server calls)

### Moats 14-18: Advanced Channels
- **Moat 14-18**: BroadcastChannel, SharedWorker, RTCDataChannel, window.name, Blob URL

### Critical Fixes (LOCKED)

#### Same-Site Bypass
- **Moat I**: Requests to same-origin/same-domain URLs skip content scanning
- **Rationale**: Site already has access to its own data
- **Examples**: ChatGPT → openai.com (allowed), ChatGPT → exfil.com (BLOCKED)

#### Approval Window
- **Lines 125, 1100-1103, 1284-1286**: `window.__kasbah_approved_until = Date.now() + 5000`
- **Rationale**: Prevents double-jeopardy when user clicks "Proceed Anyway"

#### Image Paste Interception
- **Lines 1306-1345, 1461-1509**: Intercept paste + drop events
- **Rationale**: Blocks screenshots of sensitive docs

#### Beacon Body Scanning
- **Lines 174-180**: Use `_fallbackDeny()` only (not full classifier)
- **Rationale**: Analytics session IDs shouldn't trigger blocks

#### WebSocket Same-Site
- **Line 143**: WeakMap tracks URLs; send checks before scanning
- **Rationale**: ChatGPT uses streaming WebSockets to own servers

#### Request Object Bypass
- **Lines 148-152**: Extract URL from Request.url (not String(request))
- **Rationale**: Modern frameworks use `fetch(new Request(...))`

#### Trusted Types CSP
- **Lines 658, 843**: Try/catch on innerHTML with emoji fallback
- **Rationale**: ChatGPT enforces Trusted Types CSP

---

## Detection Engine (detector.js v3.5.2)

### Pattern Library (20+ Patterns)

| Category | Patterns | Examples |
|----------|----------|----------|
| **PII** | SSN, national ID, passport | 123-45-6789, passport# |
| **Financial** | Credit card, IBAN, bank account | 4532-1234-5678-9999, IBAN |
| **Credentials** | AWS keys, GitHub PAT, MongoDB URI | AKIA*, ghp_*, mongodb://user:pass@* |
| **Cryptography** | Private keys, seed phrases | BEGIN RSA PRIVATE KEY |
| **Injection** | SQL, shell, command injection | `'; DROP TABLE`, `$(whoami)` |
| **Hash/Encoding** | Base64, hex entropy | High-entropy strings |

### Scoring Algorithm

```
risk_score = (pattern_weight * confidence) + entropy_bonus
```

- **Pattern Weight**: 0-100 (SSN=90, AWS key=85, password=75)
- **Entropy Bonus**: +0-30 for high Shannon entropy
- **Final Risk**: 0-100

### Decision Logic

```
Risk ≥ 70: DENY (block permanently)
Risk 40-69: WARN (show modal, allow override)
Risk < 40: ALLOW (pass through)
```

---

## Integrity Scoring System (SII)

**System Integrity Index** measures overall system health:

```
SII = (Hook Integrity)^0.30 × (Pattern Integrity)^0.30
    × (Session Health)^0.25 × (Latency Normal)^0.15
```

### Dimensions

| Dimension | Score | Meaning |
|-----------|-------|---------|
| **Hook Integrity** | 0-1 | Are API hooks functional? |
| **Pattern Integrity** | 0-1 | Are detection patterns working? |
| **Session Health** | 0-1 | Is auth session valid? |
| **Latency Normal** | 0-1 | Is detection speed acceptable? |

**Examples**:
- All hooks working: SII ≈ 1.0 ✅
- One hook degraded: SII ≈ 0.95 ⚠️
- Two hooks down: SII ≈ 0.50 🔴

---

## 3-Gate Authorization Engine

```
Gate 1: Reliability
  Hook Integrity ≥ 0.70? Pattern Integrity ≥ 0.70?

Gate 2: Harm Assessment
  Risk Score ≤ 0.80?

Gate 3: Session Validity
  Auth token valid? Session not expired?

Result:
  All gates pass → AUTHORIZE
  Any fails → DENY
```

---

## Extension ↔ Desktop Communication

```
Browser Extension          Desktop App (Tauri)
        │
        ├─ window.postMessage()
        │
        ├─ { type: "kasbah_detect"
        │    content: "...",
        │    result: {...} }
        │
        └─ Tauri IPC for enrichment
```

**Key Property**: Extension is 100% independent; desktop app may augment with SII + gate logic.

---

## API Architecture (Cloudflare Worker)

### Request Flow

```
1. Client Request
   ↓
2. Authenticate (verifyToken)
   ↓
3. Route Handler
   ├─ Auth endpoints (register, login, logout)
   ├─ Enterprise endpoints (stats, audit, policies, team, scan)
   └─ Moat endpoints (health, gate)
   ↓
4. Response with Headers
   ├─ X-Kasbah-Risk (if request has patterns)
   └─ X-Kasbah-Decision (ALLOW/WARN/DENY)
   ↓
5. Send to Client
```

### Enterprise Endpoints

| Endpoint | Moat | Purpose |
|----------|------|---------|
| `GET /api/stats` | F | Dashboard stats (SII) |
| `GET /api/audit/recent` | O | Recent detections |
| `GET /api/policies` | I | Risk policies |
| `GET /api/team` | O | Team member audit |
| `POST /api/scan` | F/O | Submit file scan |

---

## Product-Specific Architectures

### Browser Extension (5x: Chrome, Firefox, Edge, Opera, Safari)

```
manifest.json (v1.0.0)
├── detector.js (v3.5.2, 23/23 selfTest)
│   └─ 20+ sensitive patterns
├── content.js (18-moat egress gate)
│   └─ Intercepts 5 APIs + 9 advanced channels
├── background.js (message handler)
│   └─ Routes to desktop (if installed)
└── popup.html (UI)
    └─ Shows detection results
```

**Invariant**: All 6 copies must be identical (MD5: `d9cd10f93c97c8de5078b0e9e98437fa`)

### Desktop App (Tauri)

```
guard.rs (Rust)
├── preflight_text() → policy_preflight()
├── redact_content() → redact_text()
├── audit_event() → create_ticket()
└── (+ 9 more moat IPC commands)

UI (Svelte + TS)
└── Calls guard.rs via IPC
```

### CLI Tool (Rust)

```
main.rs
├── scan <path> — Walk files, call policy_preflight per chunk
├── redact <file> — Call redact_text()
├── watch <path> — File system watcher + re-scan
└── selftest — 10 invariant checks
```

**Exit Codes**: 0=clean, 1=warn, 2=deny (CI/CD compatible)

### SDK (@kasbah/guard)

```
TypeScript / JavaScript
├── Node.js adapter
├── Browser adapter
├── Edge adapter (Cloudflare, Vercel)
└── Public API
    ├── classify(text) → result
    └── redact(text) → safe_text
```

---

## Data Flow: SSN Paste Example

```
1. User: Ctrl+V → "My SSN is 123-45-6789"
2. content.js paste event fires
   ├─ Moat K: stopImmediatePropagation()
   ├─ Scan clipboard data
3. detector.js.classify() → {risk: 95, decision: "DENY"}
4. Display DENY modal
   ├─ "This contains: SSN (Social Security Number)"
   ├─ "Allow anyway" sets __kasbah_approved_until
   └─ "Cancel" drops clipboard
5. User clicks "Allow" → Clipboard pasted (5-sec window)
6. audit_event() sent to desktop (if installed)
7. Dashboard updated (if subscribed)
```

---

## Test Architecture

### Market Launch Suite (58/58)
**Location**: `tests/market-launch/kasbah-market-launch.cjs`

- **A** (20/20): Real-world adversarial cases
- **B** (10/10): Evasion attempts
- **C** (10/10): False-positive stress
- **D** (3/3): Performance <500ms
- **E** (10/10): JS ↔ Rust consistency
- **F** (5/5): Infrastructure (hashes, versions)

**Gate**: MUST pass 58/58 before any detector.js change.

### selfTest() (23/23)
**Location**: `extensions/chrome/src/detector.js`
- Pattern detection (SSN, CC, AWS, keys)
- Evasion handling
- Edge cases
- Performance
- Consistency
- Infrastructure

### CLI selftest (10/10)
- policy_preflight tests
- SII calculations
- Gate authorization logic

---

## Security & Threat Model

| Attack | Defense | Status |
|--------|---------|--------|
| Exfiltrate SSN via fetch() | Moat 4: fetch hook | ✅ |
| Exfiltrate via XHR | Moat 5: XHR hook | ✅ |
| Exfiltrate via WebSocket | Moat 7 + same-site bypass | ✅ |
| Exfiltrate base64-encoded | Moat 11: base64 decode | ✅ |
| Exfiltrate via BroadcastChannel | Moat 14 | ✅ |
| Bypass with script injection | Moat 2: world:MAIN | ✅ |
| False positive (block legitimate) | Risk scoring + override | ✅ |

---

## Roadmap

### v3.5.3 (Next)
- LSTM-based false-positive reduction
- ML pattern matching for domain-specific leaks

### v4.0 (Future)
- Offline WASM detector in all products
- Encrypted E2E audit logs
- Compliance reporting (GDPR, HIPAA)

---

**Last Verified**: 2026-02-28 | **Status**: PRODUCTION READY
