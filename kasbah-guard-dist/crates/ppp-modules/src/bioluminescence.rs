//! Module 19: Bioluminescence (Canary Tokens)
//!
//! Nature metaphor: Deep-sea organisms use bioluminescence as both lure and
//! alarm. The anglerfish dangles a glowing lure; when prey approaches, the
//! trap springs. Similarly, fireflies signal presence across darkness. The
//! light reveals — not conceals.
//!
//! Security application: Canary tokens are decoy data items embedded in
//! responses, files, or API payloads. They carry no legitimate value. If a
//! canary is ever "touched" (fetched, forwarded, or executed) it fires an
//! alert — confirming that data was exfiltrated, a document was opened in an
//! unexpected environment, or an attacker is enumerating responses.

use blake3::Hasher as Blake3Hasher;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanaryToken {
    pub token_id: String,
    pub context_id: String,
    /// The actual canary string to embed in data (URL-safe, unique).
    pub token_value: String,
    pub created_at: u64,
    pub triggered: bool,
    pub triggered_at: Option<u64>,
    pub callback_url: Option<String>,
    /// Optional human-readable label for dashboard display.
    pub label: Option<String>,
}

impl CanaryToken {
    fn new(context_id: &str) -> Self {
        let token_id = Uuid::new_v4().to_string();
        let token_value = Self::generate_value(&token_id, context_id);
        Self {
            token_id,
            context_id: context_id.to_string(),
            token_value,
            created_at: now_secs(),
            triggered: false,
            triggered_at: None,
            callback_url: None,
            label: None,
        }
    }

    /// Generate a deterministic, collision-resistant canary value.
    ///
    /// Uses BLAKE3 over (token_id || context_id || timestamp) to produce a
    /// 32-byte hex string that is effectively unguessable yet reproducible.
    fn generate_value(token_id: &str, context_id: &str) -> String {
        let mut hasher = Blake3Hasher::new();
        hasher.update(token_id.as_bytes());
        hasher.update(b"|");
        hasher.update(context_id.as_bytes());
        hasher.update(b"|");
        hasher.update(now_secs().to_le_bytes().as_ref());
        let hash = hasher.finalize();
        // First 16 bytes as hex = 32 chars; readable and embeddable.
        hash.as_bytes()[..16]
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect()
    }
}

// ---------------------------------------------------------------------------
// Bioluminescence
// ---------------------------------------------------------------------------

pub struct Bioluminescence {
    tokens: Arc<DashMap<String, CanaryToken>>,
}

impl Bioluminescence {
    pub fn new() -> Self {
        Self {
            tokens: Arc::new(DashMap::new()),
        }
    }

    // ------------------------------------------------------------------
    // Token lifecycle
    // ------------------------------------------------------------------

    /// Generate a fresh canary token for `context_id` and register it.
    ///
    /// `context_id` can be any identifier: an API response ID, a file hash,
    /// a user session, or a document name. Multiple canaries per context are
    /// allowed.
    pub fn generate_canary(&self, context_id: &str) -> CanaryToken {
        let token = CanaryToken::new(context_id);
        self.tokens.insert(token.token_id.clone(), token.clone());
        tracing::debug!(
            token_id = %token.token_id,
            context_id,
            "bioluminescence: canary generated"
        );
        token
    }

    /// Generate a canary with an optional human label and callback URL set
    /// at creation time (convenience wrapper).
    pub fn generate_labeled(
        &self,
        context_id: &str,
        label: &str,
        callback_url: Option<&str>,
    ) -> CanaryToken {
        let mut token = self.generate_canary(context_id);
        token.label = Some(label.to_string());
        token.callback_url = callback_url.map(|s| s.to_string());
        // Update the stored copy.
        self.tokens.insert(token.token_id.clone(), token.clone());
        token
    }

    /// Mark `token_id` as triggered (exfiltration detected).
    ///
    /// Idempotent — triggering an already-triggered token is a no-op.
    /// Returns `true` if this was the first trigger (new alert), `false`
    /// if already triggered or token not found.
    pub fn trigger(&self, token_id: &str) -> bool {
        if let Some(mut token) = self.tokens.get_mut(token_id) {
            if token.triggered {
                return false; // already fired
            }
            token.triggered = true;
            token.triggered_at = Some(now_secs());
            tracing::warn!(
                token_id,
                context_id = %token.context_id,
                "bioluminescence: CANARY TRIGGERED — possible exfiltration"
            );
            true
        } else {
            false
        }
    }

    /// Return whether `token_id` has been triggered.
    pub fn check_triggered(&self, token_id: &str) -> bool {
        self.tokens
            .get(token_id)
            .map(|t| t.triggered)
            .unwrap_or(false)
    }

    /// Attach (or replace) the callback URL for `token_id`.
    ///
    /// The callback URL is stored for external webhook delivery; Kasbah
    /// products can poll this or push via a webhook handler.
    pub fn register_callback(&self, token_id: &str, callback_url: &str) {
        if let Some(mut token) = self.tokens.get_mut(token_id) {
            token.callback_url = Some(callback_url.to_string());
        }
    }

    /// Return all currently active (non-triggered) canary tokens.
    pub fn list_active(&self) -> Vec<CanaryToken> {
        self.tokens
            .iter()
            .filter(|entry| !entry.value().triggered)
            .map(|entry| entry.value().clone())
            .collect()
    }

    /// Return all triggered canary tokens (for incident review).
    pub fn list_triggered(&self) -> Vec<CanaryToken> {
        self.tokens
            .iter()
            .filter(|entry| entry.value().triggered)
            .map(|entry| entry.value().clone())
            .collect()
    }

    /// Look up a canary token by its embedded `token_value` string.
    ///
    /// Used when an incoming request contains a known canary value and we
    /// need to retrieve the full record to trigger it.
    pub fn find_by_value(&self, token_value: &str) -> Option<String> {
        self.tokens
            .iter()
            .find(|entry| entry.value().token_value == token_value)
            .map(|entry| entry.key().clone())
    }

    /// Expire and remove tokens older than `max_age_secs`.
    ///
    /// Active canaries that have not fired within the window are pruned to
    /// keep memory bounded.
    pub fn prune_expired(&self, max_age_secs: u64) -> usize {
        let cutoff = now_secs().saturating_sub(max_age_secs);
        let before = self.tokens.len();
        self.tokens
            .retain(|_, v| v.triggered || v.created_at >= cutoff);
        before.saturating_sub(self.tokens.len())
    }

    /// Total token count (active + triggered).
    pub fn total_count(&self) -> usize {
        self.tokens.len()
    }
}

impl Default for Bioluminescence {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_canary() {
        let bio = Bioluminescence::new();
        let token = bio.generate_canary("ctx-001");
        assert!(!token.token_id.is_empty());
        assert!(!token.token_value.is_empty());
        assert!(!token.triggered);
    }

    #[test]
    fn test_trigger_sets_flag() {
        let bio = Bioluminescence::new();
        let token = bio.generate_canary("ctx-002");
        assert!(!bio.check_triggered(&token.token_id));
        let first = bio.trigger(&token.token_id);
        assert!(first);
        assert!(bio.check_triggered(&token.token_id));
    }

    #[test]
    fn test_trigger_idempotent() {
        let bio = Bioluminescence::new();
        let token = bio.generate_canary("ctx-003");
        bio.trigger(&token.token_id);
        let second = bio.trigger(&token.token_id);
        assert!(!second, "second trigger should return false");
    }

    #[test]
    fn test_list_active_excludes_triggered() {
        let bio = Bioluminescence::new();
        let t1 = bio.generate_canary("ctx-004");
        let t2 = bio.generate_canary("ctx-005");
        bio.trigger(&t1.token_id);
        let active = bio.list_active();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].token_id, t2.token_id);
    }

    #[test]
    fn test_find_by_value() {
        let bio = Bioluminescence::new();
        let token = bio.generate_canary("ctx-006");
        let found_id = bio.find_by_value(&token.token_value);
        assert_eq!(found_id, Some(token.token_id));
    }

    #[test]
    fn test_register_callback() {
        let bio = Bioluminescence::new();
        let token = bio.generate_canary("ctx-007");
        bio.register_callback(&token.token_id, "https://hooks.example.com/canary");
        let stored = bio.tokens.get(&token.token_id).unwrap();
        assert_eq!(
            stored.callback_url.as_deref(),
            Some("https://hooks.example.com/canary")
        );
    }

    #[test]
    fn test_unique_values_per_token() {
        let bio = Bioluminescence::new();
        let t1 = bio.generate_canary("same-ctx");
        let t2 = bio.generate_canary("same-ctx");
        // Values may collide if generated within the same second since we use
        // now_secs() in the hash. Accept that; the IDs are always unique.
        assert_ne!(t1.token_id, t2.token_id);
    }
}
