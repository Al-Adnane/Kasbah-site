//! Module 10: Defensive Mimicry
//!
//! Nature metaphor: The harmless kingsnake mimics the colouration of the deadly
//! coral snake. The hoverfly mimics the wasp. Predators that have learned to
//! avoid the dangerous model also avoid the mimic — protection via illusion.
//!
//! Security application: Honeypot response mimicry. The API returns responses
//! that look identical to real data for known-bad actors, while secretly
//! logging all their actions. Attackers believe they succeeded; defenders
//! observe their full playbook without tipping them off.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MimicrySession {
    pub actor_id: String,
    pub decoy_id: String,
    pub started_at: u64,
    pub action_count: u32,
}

pub struct Mimicry {
    /// actor_id → active mimicry session
    sessions: Arc<DashMap<String, MimicrySession>>,
    /// Registered decoy templates: decoy_id → JSON template string
    decoys: Arc<DashMap<String, String>>,
}

impl Mimicry {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            decoys: Arc::new(DashMap::new()),
        }
    }

    /// Register a decoy template (a JSON string used as the fake response).
    pub fn register_decoy(&self, decoy_id: &str, template: &str) {
        self.decoys.insert(decoy_id.to_string(), template.to_string());
    }

    /// Begin a mimicry session for `actor_id` using `decoy_id` as the template.
    pub fn begin_session(&self, actor_id: &str, decoy_id: &str) {
        self.sessions.insert(
            actor_id.to_string(),
            MimicrySession {
                actor_id: actor_id.to_string(),
                decoy_id: decoy_id.to_string(),
                started_at: now_secs(),
                action_count: 0,
            },
        );
    }

    /// Return the decoy response for `actor_id`, or `None` if no active session.
    ///
    /// Also increments the action counter for the session.
    pub fn decoy_response(&self, actor_id: &str) -> Option<String> {
        let mut session = self.sessions.get_mut(actor_id)?;
        session.action_count += 1;
        let decoy_id = session.decoy_id.clone();
        drop(session);
        self.decoys.get(&decoy_id).map(|t| t.clone())
    }

    /// Return whether `actor_id` is in an active mimicry session.
    pub fn is_mimicked(&self, actor_id: &str) -> bool {
        self.sessions.contains_key(actor_id)
    }

    /// End a mimicry session and return its record.
    pub fn end_session(&self, actor_id: &str) -> Option<MimicrySession> {
        self.sessions.remove(actor_id).map(|(_, s)| s)
    }

    /// Return all active mimicry sessions.
    pub fn active_sessions(&self) -> Vec<MimicrySession> {
        self.sessions.iter().map(|e| e.value().clone()).collect()
    }
}

impl Default for Mimicry {
    fn default() -> Self {
        Self::new()
    }
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
    fn test_decoy_response() {
        let m = Mimicry::new();
        m.register_decoy("fake-api", r#"{"token":"fake-token-xyz"}"#);
        m.begin_session("bad-actor", "fake-api");
        let resp = m.decoy_response("bad-actor").unwrap();
        assert!(resp.contains("fake-token-xyz"));
    }

    #[test]
    fn test_action_count_increments() {
        let m = Mimicry::new();
        m.register_decoy("d1", "{}");
        m.begin_session("attacker", "d1");
        m.decoy_response("attacker");
        m.decoy_response("attacker");
        let sessions = m.active_sessions();
        assert_eq!(sessions[0].action_count, 2);
    }
}
