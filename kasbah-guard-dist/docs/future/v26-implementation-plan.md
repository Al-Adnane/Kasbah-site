# Plan: Silent Guardian v26.0 — Kill Friction, Ship Real Value

## Context

**Problem**: Kasbah Guard interrupts users on EVERY action — even safe ones. Users click "Allow" reflexively. This is security theater that drives uninstalls.

**Root Cause**: Extension shows modal for ALL decisions (including backend ALLOW). Clipboard/file monitors popup for ANY finding. macOS notifications spam constantly.

**Fix**: Protection invisible until it matters. 3-tier intervention: Silent → Warning → Block.

**Target**: < 1 modal per day. Knowledge workers who paste customer data into ChatGPT, not developers.

---

## Part 1: Kernel — InterventionLevel (crates/kernel/src/lib.rs)

Add enum + decision function:

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum InterventionLevel {
    Silent,   // Risk < 30 → pass silently, no Guard cost
    Warning,  // Risk 30-70 → inline toast, no block, no Guard cost
    Block,    // Risk > 70 → modal + one-click override, costs 1 Guard
}

pub fn decide_intervention(risk_score: u32) -> InterventionLevel {
    if risk_score < 30 { InterventionLevel::Silent }
    else if risk_score <= 70 { InterventionLevel::Warning }
    else { InterventionLevel::Block }
}
```

Export `InterventionLevel` and `decide_intervention` from lib.rs.

---

## Part 2: `/decide` Response + Billing (guard.rs)

**File**: `apps/desktop/src-tauri/src/guard.rs`

### 2A. Add `intervention` field to all `/decide` responses (~lines 7131-7191)

Map risk to intervention string in every response path:
- `risk < 30` → `"intervention": "silent"`
- `risk 30-70` → `"intervention": "warning"`
- `risk > 70` → `"intervention": "block"`

### 2B. Billing: Only charge Guards on Block

In `/consume` handler (~lines 7200-7325): skip `consume_guard()` when risk was < 70. Silent passes and warnings cost 0 Guards.

---

## Part 3: Extension — Silent/Warning/Block (content.js)

**File**: `extensions/chrome/src/content.js`

### 3A. `guardFlow()` — 3-tier branching (lines 462-550)

Replace the always-show-modal logic:

```javascript
// SILENT: risk < 30 — no modal, no interruption
if (res.intervention === "silent" || (!res.blocked && res.risk < 30)) {
  if (res.ticket) {
    postJson(GUARD + "/consume", { ticket: res.ticket, choice: "ALLOW" }).catch(function(){});
  }
  if (onAllowCb) onAllowCb();
  return; // Nothing shown — invisible protection
}

// WARNING: risk 30-70 — inline toast, no block, action proceeds
if (res.intervention === "warning" || (!res.blocked && res.risk <= 70)) {
  if (res.ticket) {
    postJson(GUARD + "/consume", { ticket: res.ticket, choice: "ALLOW" }).catch(function(){});
  }
  showToast("Heads up — " + (secrets.length ? secrets[0] + " detected" : "review recommended"), false, verb);
  if (onAllowCb) onAllowCb();
  return;
}

// BLOCK: risk > 70 — full modal, user decides
createModal({ ... }); // existing modal code
```

### 3B. SEND interceptor — Same 3-tier logic (lines 694-803)

The SEND interceptor duplicates guardFlow inline. Apply identical silent/warning/block branching after the `/decide` response. Same code pattern as 3A.

### 3C. Guard-offline fallback — Don't block (lines 538-550)

**Current**: Full MODAL "Guard not running" — blocks the user.

**New**: Red toast "Kasbah offline — unprotected" (4s). Call `onAllowCb()` — let action proceed. No modal.

---

## Part 4: Clipboard Monitor — Severity Gate (guard.rs ~lines 6008-6061)

### 4A. Only interrupt for critical findings

**Current**: `!findings.is_empty()` → osascript dialog for ANY finding.

**New**: Define critical types that warrant interruption:

```rust
let critical_types = ["Credit Card", "SSN", "Social Security",
    "Private Key", "AWS Key", "API Key", "Secret Key",
    "Medical Record", "Passport", "National ID", "IBAN",
    "Password", "Bank Account"];

let has_critical = findings.iter().any(|f|
    critical_types.iter().any(|ct| f.contains(ct))
);
```

- `has_critical = true` → show osascript dialog (existing code)
- `has_critical = false` → silent audit log only (`CLIPBOARD_SILENT_LOG`), no popup

### 4B. Rate-limit clipboard dialogs — max 1 per 30s

Add `last_clipboard_dialog_ts: u64` to clipboard monitor state. If dialog was shown < 30s ago, silently log instead even for critical findings.

---

## Part 5: File Watcher — Severity Gate (guard.rs ~lines 8586-8599)

### 5A. Same critical-types gate as clipboard

Only show osascript dialog for genuinely dangerous findings. Silently log everything else as `FS_NOTIFY_SILENT_LOG`.

### 5B. Rate-limit file dialogs — max 1 per 30s

Same 30s cooldown. Multiple file saves shouldn't trigger rapid-fire popups.

---

## Part 6: macOS Notification Cleanup (guard.rs)

**Remove** `spawn_detached` notifications for:
- Clipboard kept (user already knows)
- Clean file saves (nothing to report)

**Keep** notifications for:
- Clipboard cleared (user action)
- File flagged for review
- Hard blocks

---

## Part 7: Firefox Mirror

Copy updated `content.js` to `extensions/firefox/src/content.js`.

---

## Critical Files

| File | Changes |
|------|---------|
| `crates/kernel/src/lib.rs` | `InterventionLevel` enum + `decide_intervention()` |
| `apps/desktop/src-tauri/src/guard.rs` | `/decide` intervention field, `/consume` billing skip, clipboard severity gate, file watcher severity gate, rate limiting, notification cleanup |
| `extensions/chrome/src/content.js` | Silent/warning/block branching, offline fix |
| `extensions/firefox/src/content.js` | Mirror of Chrome |

## Implementation Order

1. **Part 1** — kernel: `InterventionLevel` enum + function
2. **Part 2** — guard.rs: `/decide` intervention field + billing skip
3. **Part 3** — content.js: 3-tier intervention + offline fix
4. **Part 4** — guard.rs: Clipboard severity gate + rate limit
5. **Part 5** — guard.rs: File watcher severity gate + rate limit
6. **Part 6** — guard.rs: Notification cleanup
7. **Part 7** — Firefox mirror
8. **Build** → deploy → codesign → test

## Verification

| Test | Expected |
|------|----------|
| `curl /selftest/run` | 18/18 PASS |
| `curl /decide` with "hello" | `"intervention":"silent"` |
| `curl /decide` with SSN | `"intervention":"block"` |
| Extension: send "hello" on ChatGPT | **NO modal** |
| Extension: paste SSN on ChatGPT | **Modal appears** |
| Clipboard: copy "hello" | **NO dialog** |
| Clipboard: copy credit card | **Dialog appears** |
| File save with email only | **NO dialog** |
| File save with API key | **Dialog appears** |
| `curl /audit/verify` | INTACT (all events logged, silent included) |

## Safety

- DO NOT touch session restore / auth persistence
- DO NOT touch append_audit() hash-chain logic
- DO NOT clear WebKit caches or modify tauri.conf.json
- DO NOT change risk scoring algorithm — thresholds are correct
- 18/18 selftest must pass after every guard.rs change
- ALL events still logged to audit trail — silent ≠ unlogged
