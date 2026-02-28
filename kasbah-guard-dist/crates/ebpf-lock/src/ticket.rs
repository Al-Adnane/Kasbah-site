use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// An execution ticket issued by the `TicketIssuer` and validated by the `TicketValidator`.
///
/// The ticket encodes everything needed to authorise a single process execution:
/// - which PID and binary were authorised
/// - when the authorisation expires
/// - the risk score produced by the policy preflight
/// - an Ed25519 signature over the canonical byte representation so it cannot
///   be tampered with after issuance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionTicket {
    /// Globally-unique ticket identifier (UUIDv4)
    pub ticket_id: Uuid,

    /// Process ID of the authorised executable
    pub pid: u32,

    /// SHA-256 hex digest of the executable binary content.
    /// Computed at issue time; the validator or kernel hook re-checks this on
    /// every exec to detect binary swap attacks.
    pub binary_hash: String,

    /// Human-readable command line being authorised (e.g. `"/usr/bin/curl https://…"`)
    pub command: String,

    /// UTC timestamp when this ticket was created
    pub issued_at: DateTime<Utc>,

    /// UTC timestamp after which this ticket must be rejected
    pub expires_at: DateTime<Utc>,

    /// Lifetime in seconds (stored for reference; `expires_at` is authoritative)
    pub ttl_seconds: u32,

    /// Risk score in [0.0, 1.0] from policy_preflight.
    /// 0.0 = no risk detected, 1.0 = maximum risk.
    pub risk_score: f32,

    /// Policy decision that produced this ticket:
    /// `"ALLOW"` | `"WARN"` | `"DENY"`
    pub decision: String,

    /// Hex-encoded Ed25519 signature over `self.to_bytes()`.
    /// Populated by `TicketIssuer::issue`; empty string before signing.
    pub signature: String,

    /// Whether this ticket has been explicitly revoked before expiry
    pub revoked: bool,
}

/// The current validity status of a ticket as determined by the validator.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum TicketStatus {
    /// Ticket is present, unexpired, unrevoked, and the signature is valid
    Valid,
    /// Ticket's `expires_at` is in the past
    Expired,
    /// Ticket was explicitly revoked via `TicketIssuer::revoke`
    Revoked,
    /// Signature verification failed or ticket data is corrupt
    Invalid,
    /// No ticket exists with the requested ID
    NotFound,
}

impl ExecutionTicket {
    /// Returns `true` if the current wall-clock time is past `expires_at`.
    pub fn is_expired(&self) -> bool {
        Utc::now() > self.expires_at
    }

    /// Derives the overall status of the ticket without verifying the
    /// cryptographic signature (use `TicketValidator::validate` for full
    /// signature checking).
    pub fn status(&self) -> TicketStatus {
        if self.revoked {
            return TicketStatus::Revoked;
        }
        if self.is_expired() {
            return TicketStatus::Expired;
        }
        if self.signature.is_empty() {
            return TicketStatus::Invalid;
        }
        TicketStatus::Valid
    }

    /// Produces the canonical byte representation that is signed/verified.
    ///
    /// Only the security-relevant fields are included so that cosmetic fields
    /// (e.g. `revoked`) cannot be silently changed without invalidating the
    /// signature.  The format is:
    ///
    /// ```text
    /// ticket_id|pid|binary_hash|command|issued_at_rfc3339|expires_at_rfc3339|ttl_seconds|risk_score|decision
    /// ```
    pub fn to_bytes(&self) -> Vec<u8> {
        let canonical = format!(
            "{}|{}|{}|{}|{}|{}|{}|{:.6}|{}",
            self.ticket_id,
            self.pid,
            self.binary_hash,
            self.command,
            self.issued_at.to_rfc3339(),
            self.expires_at.to_rfc3339(),
            self.ttl_seconds,
            self.risk_score,
            self.decision,
        );
        canonical.into_bytes()
    }
}
