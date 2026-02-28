//! # kasbah-ebpf-lock
//!
//! Execution ticket issuance and validation system for Kasbah Guard.
//!
//! ## Design
//!
//! This crate implements the **userspace** half of a two-layer execution control
//! system:
//!
//! ```text
//!   ┌─────────────────────────────────────────────────────────────────┐
//!   │  Userspace (this crate)                                         │
//!   │                                                                 │
//!   │  TicketIssuer ──sign──► ExecutionTicket ──pass to process──►   │
//!   │  TicketValidator ◄──verify── ExecutionTicket                    │
//!   └─────────────────────────────────────────────────────────────────┘
//!             │ BPF map (future / Linux 5.8+)
//!   ┌─────────▼───────────────────────────────────────────────────────┐
//!   │  Kernel (eBPF — not compiled by this crate)                     │
//!   │                                                                 │
//!   │  LSM hook: bprm_check_security                                  │
//!   │  Reads ticket map, re-checks Ed25519 sig in BPF verifier        │
//!   └─────────────────────────────────────────────────────────────────┘
//! ```
//!
//! The eBPF kernel programs are **not** compiled here — they require a
//! Linux 5.8+ kernel with `CONFIG_BPF_LSM=y` and are loaded separately via
//! Aya / libbpf.  This crate provides the data structures and crypto
//! operations that both sides share.
//!
//! ## Quick start
//!
//! ```rust,no_run
//! use kasbah_ebpf_lock::{TicketIssuer, TicketValidator};
//! use kasbah_ebpf_lock::ticket::TicketStatus;
//!
//! // --- Issuer side (daemon / trusted process) ---
//! let issuer = TicketIssuer::new();
//! let pubkey_hex = issuer.verifying_key_hex();
//!
//! let ticket = issuer
//!     .issue(
//!         std::process::id(),   // pid
//!         "curl https://api.bekasbah.com/health",
//!         "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", // sha256
//!         0.10,                 // risk_score (low)
//!         300,                  // ttl_secs
//!     )
//!     .expect("ticket issued");
//!
//! // --- Validator side (kernel hook shim / sandbox) ---
//! let validator = TicketValidator::new(&pubkey_hex).expect("valid key");
//! assert_eq!(validator.validate(&ticket), TicketStatus::Valid);
//! ```

pub mod errors;
pub mod issuer;
pub mod ticket;
pub mod validator;

pub use errors::EbpfError;
pub use issuer::TicketIssuer;
pub use ticket::{ExecutionTicket, TicketStatus};
pub use validator::TicketValidator;

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_hash() -> &'static str {
        "a3f1e2d4b5c6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
    }

    #[test]
    fn test_issue_and_validate_allow() {
        let issuer = TicketIssuer::new();
        let pubkey = issuer.verifying_key_hex();
        let validator = TicketValidator::new(&pubkey).unwrap();

        let ticket = issuer
            .issue(1234, "echo hello", dummy_hash(), 0.10, 60)
            .unwrap();

        assert_eq!(ticket.decision, "ALLOW");
        assert_eq!(validator.validate(&ticket), TicketStatus::Valid);
    }

    #[test]
    fn test_issue_warn_band() {
        let issuer = TicketIssuer::new();
        let ticket = issuer
            .issue(5678, "nc -l 4444", dummy_hash(), 0.50, 30)
            .unwrap();
        assert_eq!(ticket.decision, "WARN");
    }

    #[test]
    fn test_deny_high_risk() {
        let issuer = TicketIssuer::new();
        let result = issuer.issue(9999, "rm -rf /", dummy_hash(), 0.95, 10);
        assert!(matches!(result, Err(EbpfError::RiskTooHigh(_))));
    }

    #[test]
    fn test_revoke() {
        let issuer = TicketIssuer::new();
        let pubkey = issuer.verifying_key_hex();
        let validator = TicketValidator::new(&pubkey).unwrap();

        let ticket = issuer
            .issue(1111, "ls /tmp", dummy_hash(), 0.05, 300)
            .unwrap();
        issuer.revoke(ticket.ticket_id).unwrap();

        // Verify the ticket is on the revocation list.
        assert!(issuer.is_revoked(ticket.ticket_id));

        // Simulate passing a locally-mutated ticket (as the issuer would give
        // back) to the validator.
        let mut revoked_ticket = ticket.clone();
        revoked_ticket.revoked = true;
        assert_eq!(validator.validate(&revoked_ticket), TicketStatus::Revoked);
    }

    #[test]
    fn test_tampered_ticket_fails_verification() {
        let issuer = TicketIssuer::new();
        let pubkey = issuer.verifying_key_hex();
        let validator = TicketValidator::new(&pubkey).unwrap();

        let mut ticket = issuer
            .issue(2222, "cat /etc/passwd", dummy_hash(), 0.20, 120)
            .unwrap();

        // Attacker changes the command after issuance.
        ticket.command = "cat /etc/shadow".to_string();

        assert!(!validator.verify_signature(&ticket));
        assert_eq!(validator.validate(&ticket), TicketStatus::Invalid);
    }

    #[test]
    fn test_cleanup_expired() {
        let issuer = TicketIssuer::new();
        issuer
            .issue(3333, "sleep 1", dummy_hash(), 0.01, 1)
            .unwrap();
        // Ticket has TTL=1s but we can still test cleanup path exists.
        let removed = issuer.cleanup_expired();
        // Either 0 (not yet expired in CI) or 1 (expired) — just ensure it runs.
        assert!(removed == 0 || removed == 1);
    }

    #[test]
    fn test_active_tickets_list() {
        let issuer = TicketIssuer::new();
        issuer.issue(4444, "wget url", dummy_hash(), 0.10, 300).unwrap();
        issuer.issue(5555, "curl url", dummy_hash(), 0.15, 300).unwrap();
        let active = issuer.active_tickets();
        assert_eq!(active.len(), 2);
    }

    #[test]
    fn test_ticket_to_bytes_deterministic() {
        let issuer = TicketIssuer::new();
        let ticket = issuer
            .issue(6666, "ping 8.8.8.8", dummy_hash(), 0.05, 60)
            .unwrap();
        assert_eq!(ticket.to_bytes(), ticket.to_bytes());
    }
}
