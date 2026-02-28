//! Module 17: Identity Metamorphosis
//!
//! Nature metaphor: A caterpillar dissolves almost entirely inside its chrysalis
//! — no gradual change, but a radical reconstruction. It emerges as a
//! completely different organism sharing almost no structural elements with
//! its former self, yet retaining identity continuity.
//!
//! Security application: Credential rotation with identity continuity.
//! A user's session token, API key, or certificate is "metamorphosed" —
//! replaced entirely with a new credential — while preserving their access
//! rights, kinship graph, and credit balance. Old credentials are invalidated
//! the moment new ones are issued.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityStage {
    pub stage_id: String,
    pub user_id: String,
    pub credential_hash: String,
    pub issued_at: u64,
    pub superseded_at: Option<u64>,
    pub active: bool,
}

pub struct Metamorphosis {
    /// user_id → list of identity stages (history).
    stages: Arc<DashMap<String, Vec<IdentityStage>>>,
}

impl Metamorphosis {
    pub fn new() -> Self {
        Self {
            stages: Arc::new(DashMap::new()),
        }
    }

    /// Issue the initial credential for `user_id`.
    ///
    /// Returns the new `IdentityStage`. Call this on first registration.
    pub fn emerge(&self, user_id: &str, credential: &str) -> IdentityStage {
        let stage = IdentityStage {
            stage_id: Uuid::new_v4().to_string(),
            user_id: user_id.to_string(),
            credential_hash: hash_credential(credential),
            issued_at: now_secs(),
            superseded_at: None,
            active: true,
        };
        self.stages
            .entry(user_id.to_string())
            .or_default()
            .push(stage.clone());
        stage
    }

    /// Perform a full metamorphosis: invalidate the current credential and
    /// issue a new one.
    ///
    /// Returns the new stage, or `None` if the user has no active stage.
    pub fn metamorphose(&self, user_id: &str, new_credential: &str) -> Option<IdentityStage> {
        let mut stages = self.stages.get_mut(user_id)?;
        let now = now_secs();

        // Invalidate all currently active stages.
        for stage in stages.iter_mut() {
            if stage.active {
                stage.active = false;
                stage.superseded_at = Some(now);
            }
        }

        let new_stage = IdentityStage {
            stage_id: Uuid::new_v4().to_string(),
            user_id: user_id.to_string(),
            credential_hash: hash_credential(new_credential),
            issued_at: now,
            superseded_at: None,
            active: true,
        };
        stages.push(new_stage.clone());
        Some(new_stage)
    }

    /// Return `true` if `credential` matches the user's current active credential.
    pub fn is_valid(&self, user_id: &str, credential: &str) -> bool {
        let hash = hash_credential(credential);
        self.stages
            .get(user_id)
            .map(|stages| {
                stages
                    .iter()
                    .any(|s| s.active && s.credential_hash == hash)
            })
            .unwrap_or(false)
    }

    /// Return the full metamorphosis history for `user_id`.
    pub fn history(&self, user_id: &str) -> Vec<IdentityStage> {
        self.stages
            .get(user_id)
            .map(|s| s.clone())
            .unwrap_or_default()
    }

    /// Count of credential rotations (metamorphoses) for a user.
    pub fn rotation_count(&self, user_id: &str) -> usize {
        self.stages
            .get(user_id)
            .map(|s| s.len().saturating_sub(1)) // subtract initial issuance
            .unwrap_or(0)
    }
}

impl Default for Metamorphosis {
    fn default() -> Self {
        Self::new()
    }
}

fn hash_credential(cred: &str) -> String {
    let mut h = Sha256::new();
    h.update(cred.as_bytes());
    format!("{:x}", h.finalize())
}

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
    fn test_emerge_and_validate() {
        let m = Metamorphosis::new();
        m.emerge("alice", "secret-token-v1");
        assert!(m.is_valid("alice", "secret-token-v1"));
    }

    #[test]
    fn test_metamorphose_invalidates_old() {
        let m = Metamorphosis::new();
        m.emerge("bob", "old-token");
        m.metamorphose("bob", "new-token");
        assert!(!m.is_valid("bob", "old-token"));
        assert!(m.is_valid("bob", "new-token"));
    }

    #[test]
    fn test_rotation_count() {
        let m = Metamorphosis::new();
        m.emerge("carol", "v0");
        m.metamorphose("carol", "v1");
        m.metamorphose("carol", "v2");
        assert_eq!(m.rotation_count("carol"), 2);
    }
}
