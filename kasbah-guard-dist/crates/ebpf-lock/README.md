# kasbah-ebpf-lock

Execution ticket issuance and validation system for Kasbah Guard.

This crate implements the **userspace half** of a two-layer execution control
system.  The kernel half (eBPF programs) is described below but is **not
compiled by this crate** — it requires a Linux 5.8+ kernel and is loaded
separately via Aya or libbpf.

---

## Architecture

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Userspace  (this crate)                                                │
  │                                                                         │
  │   Policy preflight                                                      │
  │       │                                                                 │
  │       ▼  risk_score ≤ 0.70                                             │
  │   TicketIssuer ──── Ed25519 sign ────► ExecutionTicket                 │
  │       │                                      │                         │
  │       │ active_tickets DashMap               │ passed to process /     │
  │       │                                      │ written to BPF map      │
  │       ▼                                      ▼                         │
  │   revocation_list                    TicketValidator                   │
  │   (DashMap<Uuid, DateTime>)              │                             │
  │                                          │ verify_signature()          │
  │                                          │ + expiry + revoked flag     │
  └──────────────────────────────────────────┼────────────────────────────┘
                                             │
               eBPF shared BPF map ──────────┘
                                             │
  ┌──────────────────────────────────────────▼────────────────────────────┐
  │  Kernel  (eBPF — Linux 5.8+, CONFIG_BPF_LSM=y)                        │
  │                                                                         │
  │   LSM hook: bprm_check_security                                         │
  │       1.  Compute SHA-256 of binary_hash (bpf_d_path + ring-buf)       │
  │       2.  Look up ExecutionTicket in BPF_MAP_TYPE_HASH keyed by PID     │
  │       3.  Re-verify Ed25519 signature (BPF crypto helpers, 6.1+)        │
  │       4.  DENY exec if ticket missing / expired / invalid sig           │
  └─────────────────────────────────────────────────────────────────────────┘
```

### Why two layers?

| Layer | What it provides |
|---|---|
| Userspace | Rich policy evaluation, audit logging, revocation, human-readable decisions |
| Kernel eBPF | Tamper-resistant enforcement — a compromised userspace process cannot exec without a valid kernel-side ticket |

---

## Ticket lifecycle

```
Policy preflight
      │
      │  risk_score ≤ 0.70
      ▼
TicketIssuer::issue()
  ├── Creates UUIDv4 ticket_id
  ├── Sets issued_at = now, expires_at = now + ttl_secs
  ├── Derives decision: ALLOW (≤0.35) | WARN (≤0.70)
  ├── Serialises canonical fields to bytes
  ├── Ed25519-signs the bytes with OsRng-generated key
  ├── Stores in active_tickets DashMap
  └── Returns ExecutionTicket

      │ (ticket handed to process or written to BPF map)
      ▼

TicketValidator::validate()
  ├── Check revoked flag
  ├── Check expires_at vs Utc::now()
  └── VerifyingKey::verify(ticket.to_bytes(), sig)
        ├── OK  → TicketStatus::Valid
        └── Err → TicketStatus::Invalid

      │ optional early termination
      ▼

TicketIssuer::revoke(ticket_id)
  ├── Sets revoked = true in active_tickets map
  └── Inserts into revocation_list DashMap
```

---

## Ed25519 signing

Key generation uses `ed25519-dalek` v2 with `OsRng` (`/dev/urandom` on Linux,
`CryptGenRandom` on Windows):

```rust
let signing_key = SigningKey::generate(&mut OsRng);
```

The **canonical byte representation** that is signed is:

```
ticket_id|pid|binary_hash|command|issued_at_rfc3339|expires_at_rfc3339|ttl_seconds|risk_score|decision
```

Fields are pipe-separated with `risk_score` rendered to 6 decimal places for
determinism.  Only security-relevant fields are included: changing cosmetic
fields (e.g. `revoked`) does not invalidate the signature, but is detected
at the revocation-flag check which precedes signature verification.

The **verifying (public) key** is exported as a lowercase 64-character hex
string via `TicketIssuer::verifying_key_hex()` and consumed by
`TicketValidator::new(hex)`.

---

## eBPF program overview (future kernel integration)

> **Not compiled by this crate.**  Requires Linux 5.8+ with
> `CONFIG_BPF_LSM=y` and `CONFIG_BPF_SYSCALL=y`.

### Hook: `bprm_check_security`

```c
// Pseudo-code for the LSM eBPF program
SEC("lsm/bprm_check_security")
int BPF_PROG(check_exec, struct linux_binprm *bprm) {
    u32 pid = bpf_get_current_pid_tgid() >> 32;

    // 1. Look up ticket in BPF_MAP_TYPE_HASH
    struct ebpf_ticket *t = bpf_map_lookup_elem(&ticket_map, &pid);
    if (!t) return -EPERM;   // no ticket — deny

    // 2. Check expiry (ktime_get_real_ns vs ticket.expires_ns)
    u64 now_ns = bpf_ktime_get_real_ns();
    if (now_ns > t->expires_ns) return -EPERM;

    // 3. Re-verify Ed25519 sig using bpf_crypto helpers (kernel 6.1+)
    //    or a BPF-safe Ed25519 implementation compiled into the eBPF object
    if (!verify_ed25519(t->message, t->sig, &global_pubkey)) return -EPERM;

    return 0;   // allow exec
}
```

### BPF map schema

```c
struct ebpf_ticket {
    u8  ticket_id[16];      // UUID bytes
    u32 pid;
    u8  binary_hash[32];    // SHA-256 raw bytes
    u64 expires_ns;         // CLOCK_REALTIME nanoseconds
    u8  sig[64];            // Ed25519 signature
    u8  message[512];       // canonical signed message (truncated)
    u8  revoked;            // set by userspace via map update
};

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 8192);
    __type(key, u32);             // PID
    __type(value, struct ebpf_ticket);
} ticket_map SEC(".maps");
```

---

## Linux kernel requirements for full eBPF enforcement

| Feature | Minimum kernel |
|---|---|
| BPF LSM hooks (`CONFIG_BPF_LSM`) | 5.7 |
| `bprm_check_security` LSM hook | 5.8 |
| `bpf_d_path` helper | 5.9 |
| Ring buffer (`BPF_MAP_TYPE_RINGBUF`) | 5.8 |
| BPF crypto helpers (`bpf_crypto_*`) | 6.1 |
| Recommended minimum | **5.10 LTS** |

Enable in kernel config:

```
CONFIG_BPF=y
CONFIG_BPF_SYSCALL=y
CONFIG_BPF_LSM=y
CONFIG_LSM="bpf,landlock,lockdown,yama,integrity,selinux"
CONFIG_SECURITYFS=y
```

Boot parameter (add to `GRUB_CMDLINE_LINUX`):

```
lsm=bpf,landlock,lockdown,yama,integrity,selinux
```

---

## Fallback for non-Linux platforms

On macOS, Windows, and other non-Linux platforms the eBPF kernel enforcement
layer is unavailable.  The userspace ticket system still functions fully:

- `TicketIssuer` issues and signs tickets.
- `TicketValidator` verifies tickets.
- The `ticket-server` CLI operates normally.

The kernel enforcement hook is simply absent, making it a **soft policy
control** rather than a hard kernel block.  For macOS a similar result can
be achieved with **Endpoint Security framework** (ES API), which is integrated
separately in `kasbah-guard-dist/apps/desktop/`.

---

## Integration with CLI and Desktop

### CLI (`kasbah-guard-dist/apps/cli/`)

The CLI's `policy.rs` module computes a risk score for each scan.  To wire in
ticket issuance:

```rust
use kasbah_ebpf_lock::TicketIssuer;

let issuer = TicketIssuer::new();
let risk = policy::evaluate(&content);
if let Ok(ticket) = issuer.issue(pid, &command, &binary_hash, risk, 300) {
    println!("Ticket: {}", ticket.ticket_id);
}
```

### Desktop (`kasbah-guard-dist/apps/desktop/`)

The Tauri desktop app can call `TicketIssuer` from `guard.rs` via a Tauri
command:

```rust
#[tauri::command]
fn issue_ticket(pid: u32, command: String, risk: f32) -> Result<String, String> {
    let issuer = state.issuer.lock();
    let ticket = issuer.issue(pid, &command, "…hash…", risk, 300)
        .map_err(|e| e.to_string())?;
    Ok(ticket.ticket_id.to_string())
}
```

---

## `ticket-server` CLI

```
ticket-server — Kasbah Guard execution ticket CLI

USAGE:
    ticket-server <SUBCOMMAND> [OPTIONS]

SUBCOMMANDS:
    issue       Issue a new execution ticket
    revoke      Revoke an existing ticket
    status      Show status of a ticket
    list        List all active tickets

OPTIONS (issue):
    --pid <u32>         Process ID to authorise
    --command <str>     Command line being authorised
    --binary <str>      Path to executable (hashed) OR pre-computed SHA-256 hex
    --risk <f32>        Risk score in [0.0, 1.0] from policy preflight
    --ttl <u32>         Ticket lifetime in seconds (default: 300)

OPTIONS (revoke / status):
    --ticket-id <uuid>  UUID of the ticket to act on

EXAMPLES:
    # Issue a 2-minute ticket for curl with low risk
    ticket-server issue --pid 1234 \
        --command "curl https://api.bekasbah.com/health" \
        --binary /usr/bin/curl \
        --risk 0.10 \
        --ttl 120

    # Issue using a pre-computed hash instead of a path
    ticket-server issue --pid 5678 \
        --command "python3 script.py" \
        --binary a3f1e2d4b5c6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2 \
        --risk 0.30

    # Revoke a ticket immediately
    ticket-server revoke --ticket-id 550e8400-e29b-41d4-a716-446655440000

    # Check ticket status
    ticket-server status --ticket-id 550e8400-e29b-41d4-a716-446655440000

    # List all active tickets
    ticket-server list
```

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Usage / argument error |
| 2 | Ticket denied (risk > 0.70) |
| 3 | Ticket not found |

---

## Build

```bash
# From repo root
CARGO_TARGET_DIR=/tmp/kasbah-ebpf-build \
    cargo build --release \
    --manifest-path kasbah-guard-dist/crates/ebpf-lock/Cargo.toml

# Binary location
/tmp/kasbah-ebpf-build/release/ticket-server
```

## Test

```bash
CARGO_TARGET_DIR=/tmp/kasbah-ebpf-build \
    cargo test \
    --manifest-path kasbah-guard-dist/crates/ebpf-lock/Cargo.toml
```

---

## Security considerations

1. **Key rotation** — The Ed25519 signing key is generated fresh per process
   restart.  For production, persist the key in the OS keychain
   (`security add-generic-password` on macOS, kernel keyring on Linux) and
   load it at startup.

2. **Key storage** — Never write the signing key to disk in plaintext.  Use
   `SecretBox` / `Zeroize` to clear it from memory on drop.

3. **Ticket store** — The `DashMap` is in-process only.  For multi-process or
   multi-host deployments, back it with a Redis store protected by mTLS.

4. **Clock skew** — `expires_at` uses `chrono::Utc::now()`.  Ensure NTP sync
   on all nodes.  For kernel hooks use `CLOCK_REALTIME` nanoseconds, not wall
   clock strings.

5. **Replay attacks** — The `ticket_id` (UUIDv4) is stored in the issuer map;
   once a ticket is used and the associated process exits, remove it from the
   map to prevent replay.

---

*Part of [Kasbah Guard](https://bekasbah.com) — AI output protection.*
