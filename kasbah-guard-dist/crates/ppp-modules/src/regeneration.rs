//! Module 22: Regeneration (Recovery Mechanisms)
//!
//! Nature metaphor: The axolotl regrows entire limbs — not scar tissue but
//! fully functional replacement structure including bone, muscle, and nerves.
//! Planarians can regrow from a single fragment. The sea cucumber ejects its
//! internal organs under threat and regrows them within weeks.
//!
//! Security application: Post-incident recovery orchestration. After a
//! confirmed breach or credential compromise, the system initiates structured
//! recovery: credential rotation (metamorphosis), kinship-network attestation,
//! session termination sweep, and audit log preservation. Each recovery
//! step is tracked with a checkpoint until the system is fully regenerated.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RecoveryStatus {
    Initiated,
    InProgress,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CheckpointStatus {
    Pending,
    Done,
    Skipped,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryCheckpoint {
    pub name: String,
    pub status: CheckpointStatus,
    pub completed_at: Option<u64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryPlan {
    pub plan_id: String,
    pub user_id: String,
    pub incident_type: String,
    pub status: RecoveryStatus,
    pub initiated_at: u64,
    pub completed_at: Option<u64>,
    pub checkpoints: Vec<RecoveryCheckpoint>,
}

/// Default recovery checkpoints for a credential compromise.
fn credential_compromise_checkpoints() -> Vec<RecoveryCheckpoint> {
    vec![
        RecoveryCheckpoint { name: "terminate-all-sessions".to_string(),    status: CheckpointStatus::Pending, completed_at: None, notes: None },
        RecoveryCheckpoint { name: "rotate-credentials".to_string(),        status: CheckpointStatus::Pending, completed_at: None, notes: None },
        RecoveryCheckpoint { name: "notify-kinship-network".to_string(),    status: CheckpointStatus::Pending, completed_at: None, notes: None },
        RecoveryCheckpoint { name: "audit-log-preservation".to_string(),    status: CheckpointStatus::Pending, completed_at: None, notes: None },
        RecoveryCheckpoint { name: "re-attest-identity".to_string(),        status: CheckpointStatus::Pending, completed_at: None, notes: None },
        RecoveryCheckpoint { name: "restore-credit-balance".to_string(),    status: CheckpointStatus::Pending, completed_at: None, notes: None },
    ]
}

pub struct Regeneration {
    plans: Arc<DashMap<String, RecoveryPlan>>,
}

impl Regeneration {
    pub fn new() -> Self {
        Self {
            plans: Arc::new(DashMap::new()),
        }
    }

    /// Initiate a recovery plan for `user_id` following an `incident_type`.
    ///
    /// Pre-populates checkpoints based on incident type. Currently supports:
    /// - `"credential-compromise"` → 6-step recovery
    /// - Other types → empty checkpoint list (caller should add manually).
    pub fn initiate(&self, user_id: &str, incident_type: &str) -> RecoveryPlan {
        let checkpoints = match incident_type {
            "credential-compromise" => credential_compromise_checkpoints(),
            _ => Vec::new(),
        };

        let plan = RecoveryPlan {
            plan_id: Uuid::new_v4().to_string(),
            user_id: user_id.to_string(),
            incident_type: incident_type.to_string(),
            status: RecoveryStatus::Initiated,
            initiated_at: now_secs(),
            completed_at: None,
            checkpoints,
        };

        self.plans.insert(plan.plan_id.clone(), plan.clone());
        tracing::warn!(user_id, incident_type, plan_id = %plan.plan_id, "regeneration: recovery initiated");
        plan
    }

    /// Mark a checkpoint as done on `plan_id`.
    ///
    /// Returns `true` if the checkpoint was found and updated.
    pub fn complete_checkpoint(&self, plan_id: &str, checkpoint_name: &str, notes: Option<&str>) -> bool {
        if let Some(mut plan) = self.plans.get_mut(plan_id) {
            if let Some(cp) = plan.checkpoints.iter_mut().find(|c| c.name == checkpoint_name) {
                cp.status = CheckpointStatus::Done;
                cp.completed_at = Some(now_secs());
                cp.notes = notes.map(|s| s.to_string());

                // Advance plan status.
                plan.status = RecoveryStatus::InProgress;

                // Check if all non-skipped checkpoints are done.
                let all_done = plan.checkpoints.iter().all(|c| {
                    c.status == CheckpointStatus::Done || c.status == CheckpointStatus::Skipped
                });
                if all_done {
                    plan.status = RecoveryStatus::Completed;
                    plan.completed_at = Some(now_secs());
                    tracing::info!(plan_id, "regeneration: recovery completed");
                }

                return true;
            }
        }
        false
    }

    /// Skip a checkpoint (e.g., when a step is not applicable).
    pub fn skip_checkpoint(&self, plan_id: &str, checkpoint_name: &str, reason: &str) -> bool {
        if let Some(mut plan) = self.plans.get_mut(plan_id) {
            if let Some(cp) = plan.checkpoints.iter_mut().find(|c| c.name == checkpoint_name) {
                cp.status = CheckpointStatus::Skipped;
                cp.notes = Some(reason.to_string());
                return true;
            }
        }
        false
    }

    /// Return the current recovery plan for `plan_id`.
    pub fn get_plan(&self, plan_id: &str) -> Option<RecoveryPlan> {
        self.plans.get(plan_id).map(|p| p.clone())
    }

    /// Return all recovery plans for `user_id`.
    pub fn plans_for_user(&self, user_id: &str) -> Vec<RecoveryPlan> {
        self.plans
            .iter()
            .filter(|e| e.user_id == user_id)
            .map(|e| e.value().clone())
            .collect()
    }

    /// Percentage of checkpoints completed (0–100).
    pub fn completion_pct(&self, plan_id: &str) -> f32 {
        let plan = match self.plans.get(plan_id) {
            Some(p) => p,
            None => return 0.0,
        };
        if plan.checkpoints.is_empty() {
            return 100.0;
        }
        let done = plan.checkpoints.iter().filter(|c| {
            c.status == CheckpointStatus::Done || c.status == CheckpointStatus::Skipped
        }).count();
        (done as f32 / plan.checkpoints.len() as f32) * 100.0
    }
}

impl Default for Regeneration {
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
    fn test_initiate_credential_compromise() {
        let r = Regeneration::new();
        let plan = r.initiate("alice", "credential-compromise");
        assert_eq!(plan.status, RecoveryStatus::Initiated);
        assert_eq!(plan.checkpoints.len(), 6);
    }

    #[test]
    fn test_complete_checkpoint() {
        let r = Regeneration::new();
        let plan = r.initiate("bob", "credential-compromise");
        assert!(r.complete_checkpoint(&plan.plan_id, "terminate-all-sessions", None));
        let updated = r.get_plan(&plan.plan_id).unwrap();
        assert_eq!(updated.status, RecoveryStatus::InProgress);
        assert!(r.completion_pct(&plan.plan_id) > 0.0);
    }

    #[test]
    fn test_full_recovery_completion() {
        let r = Regeneration::new();
        let plan = r.initiate("carol", "credential-compromise");
        let checkpoints: Vec<String> = plan.checkpoints.iter().map(|c| c.name.clone()).collect();
        for cp in &checkpoints {
            r.complete_checkpoint(&plan.plan_id, cp, None);
        }
        let final_plan = r.get_plan(&plan.plan_id).unwrap();
        assert_eq!(final_plan.status, RecoveryStatus::Completed);
        assert!((r.completion_pct(&plan.plan_id) - 100.0).abs() < 0.01);
    }

    #[test]
    fn test_skip_checkpoint() {
        let r = Regeneration::new();
        let plan = r.initiate("dave", "credential-compromise");
        r.skip_checkpoint(&plan.plan_id, "restore-credit-balance", "no credits held");
        let updated = r.get_plan(&plan.plan_id).unwrap();
        let cp = updated.checkpoints.iter().find(|c| c.name == "restore-credit-balance").unwrap();
        assert_eq!(cp.status, CheckpointStatus::Skipped);
    }
}
