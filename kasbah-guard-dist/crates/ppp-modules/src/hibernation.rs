//! Module 21: Hibernation (Session Dormancy)
//!
//! Nature metaphor: Bears enter deep hibernation during winter — metabolic
//! rate drops to 25% of normal, body temperature falls, yet the bear does not
//! die. Upon waking in spring, full function resumes within hours. Hibernation
//! is controlled dormancy, not death.
//!
//! Security application: Inactive session management. Sessions that have not
//! been active for a configurable period enter a "hibernation" state — they are
//! not deleted but their privileges are suspended. Resuming a hibernated session
//! requires a lightweight re-authentication "wake-up" challenge.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionState {
    Active,
    Hibernating,
    Terminated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HibernationRecord {
    pub session_id: String,
    pub user_id: String,
    pub state: SessionState,
    pub last_active: u64,
    pub hibernated_at: Option<u64>,
    pub wake_count: u32,
}

pub struct Hibernation {
    sessions: Arc<DashMap<String, HibernationRecord>>,
    /// Seconds of inactivity before a session hibernates.
    dormancy_threshold_secs: u64,
}

impl Hibernation {
    pub fn new(dormancy_threshold_secs: u64) -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            dormancy_threshold_secs,
        }
    }

    /// Register an active session.
    pub fn register(&self, session_id: &str, user_id: &str) {
        self.sessions.insert(
            session_id.to_string(),
            HibernationRecord {
                session_id: session_id.to_string(),
                user_id: user_id.to_string(),
                state: SessionState::Active,
                last_active: now_secs(),
                hibernated_at: None,
                wake_count: 0,
            },
        );
    }

    /// Update the last-active timestamp for `session_id`.
    ///
    /// Also wakes the session if it was hibernating.
    pub fn touch(&self, session_id: &str) -> bool {
        if let Some(mut rec) = self.sessions.get_mut(session_id) {
            if rec.state == SessionState::Terminated {
                return false;
            }
            if rec.state == SessionState::Hibernating {
                rec.state = SessionState::Active;
                rec.wake_count += 1;
                tracing::debug!(session_id, "hibernation: session woke");
            }
            rec.last_active = now_secs();
            return true;
        }
        false
    }

    /// Scan all sessions and hibernate any that have been inactive past the threshold.
    ///
    /// Returns the IDs of newly hibernated sessions.
    pub fn hibernate_stale(&self) -> Vec<String> {
        let now = now_secs();
        let threshold = self.dormancy_threshold_secs;
        let mut hibernated = Vec::new();

        for mut entry in self.sessions.iter_mut() {
            if entry.state != SessionState::Active {
                continue;
            }
            if now.saturating_sub(entry.last_active) >= threshold {
                entry.state = SessionState::Hibernating;
                entry.hibernated_at = Some(now);
                hibernated.push(entry.key().clone());
                tracing::info!(session_id = %entry.key(), "hibernation: session hibernated");
            }
        }

        hibernated
    }

    /// Terminate a session permanently.
    pub fn terminate(&self, session_id: &str) -> bool {
        if let Some(mut rec) = self.sessions.get_mut(session_id) {
            rec.state = SessionState::Terminated;
            return true;
        }
        false
    }

    /// Return the current state of `session_id`.
    pub fn state(&self, session_id: &str) -> Option<SessionState> {
        self.sessions.get(session_id).map(|r| r.state.clone())
    }

    /// Return all sessions in hibernating state.
    pub fn hibernating_sessions(&self) -> Vec<HibernationRecord> {
        self.sessions
            .iter()
            .filter(|e| e.state == SessionState::Hibernating)
            .map(|e| e.value().clone())
            .collect()
    }

    /// Return all active sessions.
    pub fn active_count(&self) -> usize {
        self.sessions
            .iter()
            .filter(|e| e.state == SessionState::Active)
            .count()
    }
}

impl Default for Hibernation {
    fn default() -> Self {
        Self::new(1800) // 30 minutes
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
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_register_and_active() {
        let h = Hibernation::new(3600);
        h.register("sess-1", "alice");
        assert_eq!(h.state("sess-1"), Some(SessionState::Active));
    }

    #[test]
    fn test_hibernate_stale() {
        let h = Hibernation::new(0); // 0s threshold → immediately stale
        h.register("sess-2", "bob");
        thread::sleep(Duration::from_millis(10));
        let hibernated = h.hibernate_stale();
        assert!(hibernated.contains(&"sess-2".to_string()));
        assert_eq!(h.state("sess-2"), Some(SessionState::Hibernating));
    }

    #[test]
    fn test_touch_wakes_session() {
        let h = Hibernation::new(0);
        h.register("sess-3", "carol");
        thread::sleep(Duration::from_millis(10));
        h.hibernate_stale();
        assert_eq!(h.state("sess-3"), Some(SessionState::Hibernating));
        h.touch("sess-3");
        assert_eq!(h.state("sess-3"), Some(SessionState::Active));
    }

    #[test]
    fn test_terminate() {
        let h = Hibernation::new(3600);
        h.register("sess-4", "dave");
        h.terminate("sess-4");
        assert_eq!(h.state("sess-4"), Some(SessionState::Terminated));
        // touch should return false for terminated session
        assert!(!h.touch("sess-4"));
    }
}
