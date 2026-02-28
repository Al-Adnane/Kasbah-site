use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use tracing::debug;

use crate::{errors::EbpfError, ticket::{ExecutionTicket, TicketStatus}};

/// Verifies execution tickets using the issuer's Ed25519 public key.
///
/// The validator holds **only** the public key; it cannot issue or revoke
/// tickets.  This separation means validator instances can be embedded in
/// untrusted components (kernel eBPF map probes, sandbox watchers, network
/// proxies) without risking key compromise.
///
/// # Caveats on revocation
/// The validator checks the `revoked` boolean that is baked into the ticket
/// struct.  In a distributed deployment you should re-fetch tickets from the
/// issuer or subscribe to a revocation stream so that the embedded flag stays
/// current.  The issuer's in-memory `active_tickets` map is always the
/// authoritative source of revocation truth.
pub struct TicketValidator {
    verifying_key: VerifyingKey,
}

impl TicketValidator {
    /// Constructs a validator from a lowercase hex-encoded Ed25519 public key
    /// (32 bytes = 64 hex characters), as returned by
    /// `TicketIssuer::verifying_key_hex`.
    pub fn new(verifying_key_hex: &str) -> Result<Self, EbpfError> {
        let key_bytes = hex::decode(verifying_key_hex).map_err(|e| {
            EbpfError::KeyError(format!("Invalid hex in verifying key: {e}"))
        })?;

        if key_bytes.len() != 32 {
            return Err(EbpfError::KeyError(format!(
                "Expected 32 bytes for Ed25519 public key, got {}",
                key_bytes.len()
            )));
        }

        let key_array: [u8; 32] = key_bytes
            .try_into()
            .map_err(|_| EbpfError::KeyError("Byte slice conversion failed".to_string()))?;

        let verifying_key = VerifyingKey::from_bytes(&key_array)
            .map_err(|e| EbpfError::KeyError(format!("Invalid Ed25519 key: {e}")))?;

        Ok(Self { verifying_key })
    }

    /// Performs a full validation of the ticket:
    ///
    /// 1. Check the `revoked` flag.
    /// 2. Check whether the ticket has expired.
    /// 3. Verify the Ed25519 signature over the canonical byte representation.
    ///
    /// The checks are ordered so that the cheapest operations (flag checks)
    /// happen before the crypto operation.
    pub fn validate(&self, ticket: &ExecutionTicket) -> TicketStatus {
        // Step 1 – revocation check (O(1) flag read)
        if ticket.revoked {
            debug!(ticket_id = %ticket.ticket_id, "Validation failed: ticket revoked");
            return TicketStatus::Revoked;
        }

        // Step 2 – expiry check (one DateTime comparison)
        if ticket.is_expired() {
            debug!(ticket_id = %ticket.ticket_id, "Validation failed: ticket expired");
            return TicketStatus::Expired;
        }

        // Step 3 – cryptographic signature verification
        if !self.verify_signature(ticket) {
            debug!(ticket_id = %ticket.ticket_id, "Validation failed: invalid signature");
            return TicketStatus::Invalid;
        }

        debug!(ticket_id = %ticket.ticket_id, "Ticket validated successfully");
        TicketStatus::Valid
    }

    /// Verifies only the Ed25519 signature without checking expiry or
    /// revocation.  Useful when you want to confirm a ticket was genuinely
    /// issued by the authority even if it has since expired.
    pub fn verify_signature(&self, ticket: &ExecutionTicket) -> bool {
        // Decode the hex signature stored in the ticket.
        let sig_bytes = match hex::decode(&ticket.signature) {
            Ok(b) => b,
            Err(_) => return false,
        };

        if sig_bytes.len() != 64 {
            return false;
        }

        let sig_array: [u8; 64] = match sig_bytes.try_into() {
            Ok(a) => a,
            Err(_) => return false,
        };

        let signature = match Signature::from_bytes(&sig_array) {
            sig => sig, // Signature::from_bytes is infallible for [u8;64]
        };

        // Verify against the same canonical byte encoding used at issue time.
        let message = ticket.to_bytes();
        self.verifying_key.verify(&message, &signature).is_ok()
    }

    /// Returns the verifying key as a hex string (re-export for convenience).
    pub fn verifying_key_hex(&self) -> String {
        hex::encode(self.verifying_key.as_bytes())
    }
}
