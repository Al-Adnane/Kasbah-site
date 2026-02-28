use std::sync::Arc;

use chrono::{Duration, Utc};
use dashmap::DashMap;
use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::{
    errors::EbpfError,
    ticket::{ExecutionTicket, TicketStatus},
};

/// Issues and manages execution tickets, backed by an Ed25519 signing key held
/// only in process memory (never written to disk by this crate).
///
/// The `TicketIssuer` is the trusted authority in the userspace ticket system.
/// In a full kernel deployment the signing key would be sealed inside the
/// eBPF program's own memory via `bpf_map` with `BPF_F_NO_PREALLOC`, making
/// it inaccessible to userspace.
///
/// For sharing across async tasks, wrap in `Arc<TicketIssuer>`.
pub struct TicketIssuer {
    /// Ed25519 signing key generated fresh at startup from `/dev/urandom` via
    /// `OsRng`.  Never exposed beyond `verifying_key_hex()`.
    signing_key: SigningKey,

    /// All tickets ever issued that have not yet been explicitly cleaned up.
    /// Key = ticket_id.
    active_tickets: Arc<DashMap<Uuid, ExecutionTicket>>,

    /// Ticket IDs that have been revoked, mapped to the revocation timestamp.
    revocation_list: Arc<DashMap<Uuid, chrono::DateTime<Utc>>>,
}

impl TicketIssuer {
    /// Creates a new issuer with a freshly-generated Ed25519 keypair.
    ///
    /// The private key lives only for the lifetime of this struct; restart the
    /// process to rotate keys.
    pub fn new() -> Self {
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        info!(
            pubkey = %hex::encode(signing_key.verifying_key().as_bytes()),
            "TicketIssuer initialised with fresh Ed25519 keypair"
        );
        Self {
            signing_key,
            active_tickets: Arc::new(DashMap::new()),
            revocation_list: Arc::new(DashMap::new()),
        }
    }

    /// Issues a signed execution ticket.
    ///
    /// # Policy
    /// - `risk_score` must be in `[0.0, 1.0]`.  Scores above `0.7` are
    ///   denied immediately and return `EbpfError::RiskTooHigh`.
    /// - `decision` is derived automatically from the score:
    ///   `≤0.35` → `"ALLOW"`, `≤0.70` → `"WARN"`, `>0.70` → `"DENY"`.
    ///
    /// # Arguments
    /// - `pid`         – process ID being authorised
    /// - `command`     – full command line
    /// - `binary_hash` – SHA-256 hex digest of the executable (caller is
    ///                   responsible for computing this via `sha2`)
    /// - `risk_score`  – float in [0.0, 1.0] from policy preflight
    /// - `ttl_secs`    – ticket lifetime in seconds; clamped to [1, 3600]
    pub fn issue(
        &self,
        pid: u32,
        command: &str,
        binary_hash: &str,
        risk_score: f32,
        ttl_secs: u32,
    ) -> Result<ExecutionTicket, EbpfError> {
        // Enforce risk threshold before doing any crypto work.
        if risk_score > 0.70 {
            warn!(pid, risk_score, "Ticket denied: risk score too high");
            return Err(EbpfError::RiskTooHigh(risk_score));
        }

        // Derive policy decision from risk band.
        let decision = if risk_score <= 0.35 {
            "ALLOW"
        } else {
            "WARN"
        }
        .to_string();

        // Clamp TTL to a sane range.
        let ttl_seconds = ttl_secs.clamp(1, 3600);

        let now = Utc::now();
        let ticket_id = Uuid::new_v4();

        // Build the unsigned ticket first so we can derive `to_bytes()`.
        let mut ticket = ExecutionTicket {
            ticket_id,
            pid,
            binary_hash: binary_hash.to_string(),
            command: command.to_string(),
            issued_at: now,
            expires_at: now + Duration::seconds(i64::from(ttl_seconds)),
            ttl_seconds,
            risk_score,
            decision: decision.clone(),
            signature: String::new(), // filled below
            revoked: false,
        };

        // Sign the canonical byte representation.
        let message = ticket.to_bytes();
        let signature = self.signing_key.sign(&message);
        ticket.signature = hex::encode(signature.to_bytes());

        // Store in the active map.
        self.active_tickets.insert(ticket_id, ticket.clone());

        debug!(
            ticket_id = %ticket_id,
            pid,
            decision,
            risk_score,
            ttl_seconds,
            "Execution ticket issued"
        );

        Ok(ticket)
    }

    /// Revokes a ticket immediately, preventing future validation even if the
    /// ticket has not yet expired.
    ///
    /// Returns `EbpfError::NotFound` if the ticket ID is unknown.
    pub fn revoke(&self, ticket_id: Uuid) -> Result<(), EbpfError> {
        if let Some(mut entry) = self.active_tickets.get_mut(&ticket_id) {
            entry.revoked = true;
        } else {
            return Err(EbpfError::NotFound(ticket_id.to_string()));
        }

        let revoked_at = Utc::now();
        self.revocation_list.insert(ticket_id, revoked_at);

        info!(%ticket_id, %revoked_at, "Execution ticket revoked");
        Ok(())
    }

    /// Returns the Ed25519 verifying (public) key as a lowercase hex string.
    ///
    /// Share this with `TicketValidator::new` so validators can verify
    /// signatures without holding the private key.
    pub fn verifying_key_hex(&self) -> String {
        hex::encode(self.signing_key.verifying_key().as_bytes())
    }

    /// Returns a snapshot of all currently active (not revoked, not expired)
    /// tickets.
    pub fn active_tickets(&self) -> Vec<ExecutionTicket> {
        self.active_tickets
            .iter()
            .filter(|entry| entry.value().status() == TicketStatus::Valid)
            .map(|entry| entry.value().clone())
            .collect()
    }

    /// Removes all expired tickets from the in-memory map.
    ///
    /// Returns the count of tickets that were purged.
    pub fn cleanup_expired(&self) -> usize {
        let before = self.active_tickets.len();
        self.active_tickets
            .retain(|_, ticket| !ticket.is_expired());
        let after = self.active_tickets.len();
        let removed = before.saturating_sub(after);
        if removed > 0 {
            debug!(removed, "Expired tickets cleaned up");
        }
        removed
    }

    /// Returns the total number of tickets currently held in memory
    /// (including revoked / expired ones not yet cleaned up).
    pub fn ticket_count(&self) -> usize {
        self.active_tickets.len()
    }

    /// Returns `true` if the given ticket ID appears on the revocation list.
    pub fn is_revoked(&self, ticket_id: Uuid) -> bool {
        self.revocation_list.contains_key(&ticket_id)
    }
}

impl Default for TicketIssuer {
    fn default() -> Self {
        Self::new()
    }
}
