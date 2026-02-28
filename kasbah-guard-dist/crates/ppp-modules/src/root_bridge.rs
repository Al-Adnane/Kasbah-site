//! Module 12: Root Bridge Protocol
//!
//! Nature metaphor: Mangrove root systems bridge land and sea — anchoring in
//! unstable substrate, filtering saltwater, creating protected nursery zones
//! where juvenile fish shelter. The roots mediate between two hostile
//! environments, enabling life in both.
//!
//! Security application: Cross-domain trust bridging. When two security
//! domains (e.g., enterprise network and cloud tenant) need to share threat
//! intelligence without direct trust, a Root Bridge node mediates: it
//! normalises, validates, and re-signs intel crossing the boundary.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgedMessage {
    pub message_id: String,
    pub source_domain: String,
    pub target_domain: String,
    pub payload: String,
    /// BLAKE3 signature of (source_domain + target_domain + payload).
    pub bridge_signature: String,
    pub validated: bool,
}

pub struct RootBridge {
    trusted_domains: Arc<DashMap<String, String>>, // domain → shared_secret
}

impl RootBridge {
    pub fn new() -> Self {
        Self {
            trusted_domains: Arc::new(DashMap::new()),
        }
    }

    /// Register a domain with its shared secret for signature validation.
    pub fn register_domain(&self, domain: &str, secret: &str) {
        self.trusted_domains
            .insert(domain.to_string(), secret.to_string());
    }

    /// Bridge a message from `source_domain` to `target_domain`.
    ///
    /// Signs the message with the source domain's secret. Returns `None` if
    /// the source domain is not registered.
    pub fn bridge(
        &self,
        source_domain: &str,
        target_domain: &str,
        payload: &str,
    ) -> Option<BridgedMessage> {
        let secret = self.trusted_domains.get(source_domain)?.clone();
        let signature = self.sign(source_domain, target_domain, payload, &secret);
        Some(BridgedMessage {
            message_id: format!("bridge-{}", &signature[..12]),
            source_domain: source_domain.to_string(),
            target_domain: target_domain.to_string(),
            payload: payload.to_string(),
            bridge_signature: signature,
            validated: true,
        })
    }

    /// Validate a bridged message against the source domain's secret.
    pub fn validate(&self, msg: &BridgedMessage) -> bool {
        let secret = match self.trusted_domains.get(&msg.source_domain) {
            Some(s) => s.clone(),
            None => return false,
        };
        let expected = self.sign(
            &msg.source_domain,
            &msg.target_domain,
            &msg.payload,
            &secret,
        );
        expected == msg.bridge_signature
    }

    fn sign(&self, src: &str, tgt: &str, payload: &str, secret: &str) -> String {
        let mut h = Sha256::new();
        h.update(src.as_bytes());
        h.update(tgt.as_bytes());
        h.update(payload.as_bytes());
        h.update(secret.as_bytes());
        format!("{:x}", h.finalize())
    }
}

impl Default for RootBridge {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bridge_and_validate() {
        let rb = RootBridge::new();
        rb.register_domain("corp-net", "supersecret");
        let msg = rb.bridge("corp-net", "cloud-tenant", "threat-sig-xyz").unwrap();
        assert!(rb.validate(&msg));
    }

    #[test]
    fn test_tampered_message_fails_validation() {
        let rb = RootBridge::new();
        rb.register_domain("corp-net", "supersecret");
        let mut msg = rb.bridge("corp-net", "cloud-tenant", "payload").unwrap();
        msg.payload = "tampered-payload".to_string();
        assert!(!rb.validate(&msg));
    }
}
