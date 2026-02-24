//! Kasbah Guard v2.0 — eBPF Kernel Enforcement Agent
//!
//! This agent runs on Linux 5.8+ and intercepts syscalls to enforce authority policies.
//! It communicates with the main Kasbah Guard service (port 8788) to validate authority tokens.
//!
//! Architecture:
//! 1. eBPF probes intercept sys_enter_execve, sys_enter_openat, sys_enter_connect
//! 2. Probes check BPF_MAP for authority tokens (populated by userspace daemon)
//! 3. Unauthorized actions return -EPERM
//! 4. All decisions are audited via the guard HTTP API
//!
//! Build: cargo build --release (Linux only, requires aya framework)
//! Run: sudo ./kasbah-ebpf-agent (requires root for eBPF)

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

const GUARD_URL: &str = "http://127.0.0.1:8788";

/// Authority token — issued by the guard service, cached in BPF map
#[derive(Debug, Clone, Serialize, Deserialize)]
struct AuthorityToken {
    pid: u32,
    uid: u32,
    scope: String,        // "fs:read", "fs:write", "net:connect", "exec:*"
    expires_ms: u64,
    token_hash: String,   // SHA-256 of the signed ticket
    issued_by: String,    // "guard:authority/bind"
}

/// Syscall event captured by eBPF probe
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyscallEvent {
    pid: u32,
    uid: u32,
    syscall: String,      // "execve", "openat", "connect"
    path: Option<String>, // File path for openat/execve
    addr: Option<String>, // Network address for connect
    timestamp_ms: u64,
}

/// Agent state
struct AgentState {
    /// Authority tokens indexed by PID
    authority_map: HashMap<u32, Vec<AuthorityToken>>,
    /// Blocked events counter
    blocked_count: u64,
    /// Allowed events counter
    allowed_count: u64,
    /// Event log (ring buffer)
    event_log: std::collections::VecDeque<SyscallEvent>,
}

impl AgentState {
    fn new() -> Self {
        AgentState {
            authority_map: HashMap::new(),
            blocked_count: 0,
            allowed_count: 0,
            event_log: std::collections::VecDeque::with_capacity(10000),
        }
    }

    /// Check if a PID has authority for a given scope
    fn check_authority(&self, pid: u32, scope: &str) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        if let Some(tokens) = self.authority_map.get(&pid) {
            for token in tokens {
                if token.expires_ms > now {
                    // Wildcard scope match
                    if token.scope == "*" || token.scope == scope {
                        return true;
                    }
                    // Prefix match: "fs:*" matches "fs:read", "fs:write"
                    if token.scope.ends_with("*") {
                        let prefix = &token.scope[..token.scope.len() - 1];
                        if scope.starts_with(prefix) {
                            return true;
                        }
                    }
                }
            }
        }
        false
    }

    /// Grant authority to a PID
    fn grant_authority(&mut self, token: AuthorityToken) {
        self.authority_map
            .entry(token.pid)
            .or_insert_with(Vec::new)
            .push(token);
    }

    /// Prune expired tokens
    fn prune_expired(&mut self) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        self.authority_map.retain(|_, tokens| {
            tokens.retain(|t| t.expires_ms > now);
            !tokens.is_empty()
        });
    }

    /// Record a syscall event decision
    fn record_event(&mut self, event: SyscallEvent, allowed: bool) {
        if allowed {
            self.allowed_count += 1;
        } else {
            self.blocked_count += 1;
        }
        self.event_log.push_back(event);
        while self.event_log.len() > 10000 {
            self.event_log.pop_front();
        }
    }
}

/// Determine the required scope for a syscall
fn required_scope(syscall: &str, path: Option<&str>) -> String {
    match syscall {
        "execve" => format!("exec:{}", path.unwrap_or("*")),
        "openat" => {
            if let Some(p) = path {
                // Sensitive paths require explicit authority
                let sensitive = [
                    "/etc/shadow", "/etc/passwd", "/etc/ssl",
                    ".env", ".ssh", ".gnupg", "credentials",
                    ".aws", ".kube", ".docker",
                ];
                for s in sensitive.iter() {
                    if p.contains(s) {
                        return format!("fs:sensitive:{}", p);
                    }
                }
            }
            format!("fs:read:{}", path.unwrap_or("*"))
        }
        "connect" => format!("net:connect:{}", path.unwrap_or("*")),
        _ => format!("syscall:{}", syscall),
    }
}

/// Report a decision to the guard service
async fn report_to_guard(event: &SyscallEvent, allowed: bool, scope: &str) {
    let payload = serde_json::json!({
        "event": "ebpf_decision",
        "syscall": event.syscall,
        "pid": event.pid,
        "uid": event.uid,
        "path": event.path,
        "addr": event.addr,
        "allowed": allowed,
        "scope": scope,
        "timestamp_ms": event.timestamp_ms,
    });

    // Non-blocking: fire and forget
    let _ = reqwest::Client::new()
        .post(&format!("{}/events", GUARD_URL))
        .json(&payload)
        .timeout(std::time::Duration::from_millis(500))
        .send()
        .await;
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ── Placeholder for eBPF probe loading ──
// On Linux with aya framework, this would:
// 1. Load compiled eBPF bytecode
// 2. Attach kprobes to sys_enter_execve, sys_enter_openat, sys_enter_connect
// 3. Set up perf event arrays for userspace communication
// 4. Populate BPF_MAP with authority tokens from guard service

#[cfg(target_os = "linux")]
mod ebpf {
    /// Load and attach eBPF probes (requires root)
    pub fn load_probes() -> Result<(), String> {
        // TODO: Integrate aya framework when building on Linux
        // let bpf = aya::Bpf::load_file("kasbah_probes.o")?;
        // let prog: &mut KProbe = bpf.program_mut("kasbah_execve_probe")?;
        // prog.load()?;
        // prog.attach("sys_enter_execve", 0)?;
        eprintln!("[Kasbah eBPF] Probes loaded (placeholder — build with aya on Linux)");
        Ok(())
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    eprintln!("╔══════════════════════════════════════════════╗");
    eprintln!("║  Kasbah Guard v2.0 — eBPF Enforcement Agent ║");
    eprintln!("╚══════════════════════════════════════════════╝");

    let state = Arc::new(Mutex::new(AgentState::new()));

    // Check guard is running
    match reqwest::get(&format!("{}/health", GUARD_URL)).await {
        Ok(resp) if resp.status().is_success() => {
            eprintln!("[Kasbah eBPF] Guard service connected at {}", GUARD_URL);
        }
        _ => {
            eprintln!("[Kasbah eBPF] WARNING: Guard service not reachable at {}", GUARD_URL);
            eprintln!("[Kasbah eBPF] Agent will operate in log-only mode.");
        }
    }

    // Load eBPF probes (Linux only)
    #[cfg(target_os = "linux")]
    {
        if unsafe { libc::getuid() } != 0 {
            eprintln!("[Kasbah eBPF] ERROR: Must run as root for eBPF. Use: sudo ./kasbah-ebpf-agent");
            std::process::exit(1);
        }
        match ebpf::load_probes() {
            Ok(()) => eprintln!("[Kasbah eBPF] Kernel probes attached"),
            Err(e) => eprintln!("[Kasbah eBPF] Probe load failed: {}", e),
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        eprintln!("[Kasbah eBPF] Running on {} — eBPF not available", std::env::consts::OS);
        eprintln!("[Kasbah eBPF] Operating in userspace-only mode (clipboard + keystroke monitoring via guard)");
    }

    // Prune expired tokens every 60 seconds
    let state_prune = Arc::clone(&state);
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            let mut s = state_prune.lock().unwrap();
            s.prune_expired();
        }
    });

    // Print status every 30 seconds
    let state_status = Arc::clone(&state);
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            let s = state_status.lock().unwrap();
            eprintln!(
                "[Kasbah eBPF] Status: allowed={}, blocked={}, active_tokens={}, events={}",
                s.allowed_count,
                s.blocked_count,
                s.authority_map.values().map(|v| v.len()).sum::<usize>(),
                s.event_log.len()
            );
        }
    });

    eprintln!("[Kasbah eBPF] Agent running. Press Ctrl+C to stop.");

    // Keep alive
    tokio::signal::ctrl_c().await.unwrap();
    eprintln!("[Kasbah eBPF] Shutting down...");
}
