//! # ticket-server
//!
//! Command-line interface for the Kasbah Guard execution ticket system.
//!
//! ## Usage
//!
//! ```text
//! ticket-server issue  --pid <pid> --command <cmd> --binary <path-or-hash>
//!                      --risk <float> --ttl <secs>
//! ticket-server revoke --ticket-id <uuid>
//! ticket-server status --ticket-id <uuid>
//! ticket-server list
//! ```
//!
//! The issuer is created fresh on each invocation.  For a persistent daemon
//! that retains keys and issued-ticket state across calls, embed `TicketIssuer`
//! inside a long-running Tokio service and expose it via Unix socket or gRPC.

use std::path::PathBuf;
use std::process;

use anyhow::{anyhow, Context, Result};
use kasbah_ebpf_lock::{EbpfError, TicketIssuer, TicketStatus, TicketValidator};
use sha2::{Digest, Sha256};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Argument parsing (hand-rolled to avoid a heavy clap dependency in the crate
// itself; clap can be added to Cargo.toml if preferred)
// ---------------------------------------------------------------------------

struct Args {
    subcommand: String,
    pid: Option<u32>,
    command: Option<String>,
    binary: Option<String>, // path OR hex hash
    risk: Option<f32>,
    ttl: Option<u32>,
    ticket_id: Option<Uuid>,
}

fn parse_args() -> Result<Args> {
    let raw: Vec<String> = std::env::args().collect();

    if raw.len() < 2 {
        print_usage();
        process::exit(1);
    }

    let subcommand = raw[1].clone();
    let mut pid = None;
    let mut command = None;
    let mut binary = None;
    let mut risk = None;
    let mut ttl = None;
    let mut ticket_id = None;

    let mut i = 2usize;
    while i < raw.len() {
        match raw[i].as_str() {
            "--pid" => {
                i += 1;
                pid = Some(raw.get(i).context("--pid requires a value")?.parse::<u32>()
                    .context("--pid must be a u32")?);
            }
            "--command" => {
                i += 1;
                command = Some(raw.get(i).context("--command requires a value")?.clone());
            }
            "--binary" => {
                i += 1;
                binary = Some(raw.get(i).context("--binary requires a value")?.clone());
            }
            "--risk" => {
                i += 1;
                risk = Some(raw.get(i).context("--risk requires a value")?.parse::<f32>()
                    .context("--risk must be a float in [0.0, 1.0]")?);
            }
            "--ttl" => {
                i += 1;
                ttl = Some(raw.get(i).context("--ttl requires a value")?.parse::<u32>()
                    .context("--ttl must be a u32 (seconds)")?);
            }
            "--ticket-id" => {
                i += 1;
                let id_str = raw.get(i).context("--ticket-id requires a value")?;
                ticket_id = Some(Uuid::parse_str(id_str)
                    .context("--ticket-id must be a valid UUID v4")?);
            }
            other => {
                return Err(anyhow!("Unknown argument: {other}"));
            }
        }
        i += 1;
    }

    Ok(Args { subcommand, pid, command, binary, risk, ttl, ticket_id })
}

fn print_usage() {
    eprintln!(
        r#"ticket-server — Kasbah Guard execution ticket CLI

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
    ticket-server issue --pid 1234 --command "curl https://api.bekasbah.com" \
        --binary /usr/bin/curl --risk 0.10 --ttl 120

    ticket-server revoke --ticket-id 550e8400-e29b-41d4-a716-446655440000

    ticket-server status --ticket-id 550e8400-e29b-41d4-a716-446655440000

    ticket-server list
"#
    );
}

// ---------------------------------------------------------------------------
// Binary hash helper
// ---------------------------------------------------------------------------

/// If `binary_arg` looks like a 64-char hex string it is returned as-is;
/// otherwise it is treated as a file path and SHA-256 is computed over its
/// content.
fn resolve_binary_hash(binary_arg: &str) -> Result<String> {
    // Heuristic: 64 lowercase hex chars → already a hash.
    if binary_arg.len() == 64 && binary_arg.chars().all(|c| c.is_ascii_hexdigit()) {
        return Ok(binary_arg.to_lowercase());
    }

    let path = PathBuf::from(binary_arg);
    let data = std::fs::read(&path)
        .with_context(|| format!("Cannot read binary at {}", path.display()))?;
    let digest = Sha256::digest(&data);
    Ok(hex::encode(digest))
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

fn cmd_issue(args: &Args) -> Result<()> {
    let pid = args.pid.ok_or_else(|| anyhow!("--pid is required for issue"))?;
    let command = args.command.as_deref().ok_or_else(|| anyhow!("--command is required for issue"))?;
    let binary_arg = args.binary.as_deref().ok_or_else(|| anyhow!("--binary is required for issue"))?;
    let risk = args.risk.ok_or_else(|| anyhow!("--risk is required for issue"))?;
    let ttl = args.ttl.unwrap_or(300);

    if !(0.0..=1.0).contains(&risk) {
        return Err(anyhow!("--risk must be in [0.0, 1.0], got {risk}"));
    }

    let binary_hash = resolve_binary_hash(binary_arg)?;

    let issuer = TicketIssuer::new();
    match issuer.issue(pid, command, &binary_hash, risk, ttl) {
        Ok(ticket) => {
            println!("Ticket issued successfully");
            println!("  ticket_id   : {}", ticket.ticket_id);
            println!("  pid         : {}", ticket.pid);
            println!("  command     : {}", ticket.command);
            println!("  binary_hash : {}", ticket.binary_hash);
            println!("  decision    : {}", ticket.decision);
            println!("  risk_score  : {:.4}", ticket.risk_score);
            println!("  issued_at   : {}", ticket.issued_at.to_rfc3339());
            println!("  expires_at  : {}", ticket.expires_at.to_rfc3339());
            println!("  ttl_seconds : {}", ticket.ttl_seconds);
            println!("  signature   : {}…", &ticket.signature[..16]);

            // Output full JSON to stdout for machine consumption.
            let json = serde_json::to_string_pretty(&ticket)?;
            println!("\n--- JSON ---\n{json}");

            // Also demonstrate round-trip validation.
            let pubkey = issuer.verifying_key_hex();
            let validator = TicketValidator::new(&pubkey)?;
            let status = validator.validate(&ticket);
            println!("\n--- Validation ---");
            println!("  Public key  : {}…", &pubkey[..16]);
            println!("  Status      : {status:?}");
        }
        Err(EbpfError::RiskTooHigh(score)) => {
            eprintln!("DENIED: risk score {score:.4} exceeds threshold 0.70");
            process::exit(2);
        }
        Err(e) => return Err(anyhow!(e)),
    }

    Ok(())
}

fn cmd_revoke(args: &Args) -> Result<()> {
    let ticket_id = args.ticket_id.ok_or_else(|| anyhow!("--ticket-id is required for revoke"))?;

    // In a real daemon you'd call into a persistent TicketIssuer over IPC.
    // Here we demonstrate the API and return a meaningful error.
    let issuer = TicketIssuer::new(); // fresh — no tickets in it
    match issuer.revoke(ticket_id) {
        Ok(()) => println!("Ticket {ticket_id} revoked."),
        Err(EbpfError::NotFound(_)) => {
            eprintln!(
                "Ticket {ticket_id} not found in this session.\n\
                 In daemon mode the persistent TicketIssuer would be queried via IPC."
            );
            process::exit(3);
        }
        Err(e) => return Err(anyhow!(e)),
    }

    Ok(())
}

fn cmd_status(args: &Args) -> Result<()> {
    let ticket_id = args.ticket_id.ok_or_else(|| anyhow!("--ticket-id is required for status"))?;

    // Demonstrate the NotFound path (no persistent store in CLI mode).
    eprintln!(
        "Ticket {ticket_id} — no persistent store in CLI mode.\n\
         In daemon mode this queries the in-process DashMap via IPC.\n\
         Status would be: {:?}",
        TicketStatus::NotFound
    );
    process::exit(3);
}

fn cmd_list(_args: &Args) -> Result<()> {
    // No persistent issuer in CLI mode — show usage hint.
    let issuer = TicketIssuer::new();
    let active = issuer.active_tickets();
    if active.is_empty() {
        println!("No active tickets (fresh session — use daemon mode for persistence).");
    } else {
        println!("{} active ticket(s):", active.len());
        for t in &active {
            println!(
                "  {} | pid={} | {} | risk={:.2} | expires={}",
                t.ticket_id, t.pid, t.decision, t.risk_score,
                t.expires_at.to_rfc3339()
            );
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> Result<()> {
    // Minimal tracing subscriber so debug logs are visible with RUST_LOG=debug.
    if std::env::var("RUST_LOG").is_ok() {
        tracing_subscriber_init();
    }

    let args = parse_args()?;

    match args.subcommand.as_str() {
        "issue"  => cmd_issue(&args)?,
        "revoke" => cmd_revoke(&args)?,
        "status" => cmd_status(&args)?,
        "list"   => cmd_list(&args)?,
        other    => {
            eprintln!("Unknown subcommand: {other}");
            print_usage();
            process::exit(1);
        }
    }

    Ok(())
}

/// Initialise a basic tracing subscriber if the `tracing-subscriber` crate is
/// available.  We use a feature-gated stub here so the binary compiles without
/// it; add `tracing-subscriber` to `[dev-dependencies]` or `[dependencies]`
/// to enable structured log output.
fn tracing_subscriber_init() {
    // If you add tracing-subscriber to Cargo.toml, replace this body with:
    //   tracing_subscriber::fmt::init();
    let _ = std::env::var("RUST_LOG"); // no-op stub
}
