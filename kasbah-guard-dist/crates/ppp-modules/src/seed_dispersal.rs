//! Module 11: Seed Dispersal (Data Propagation)
//!
//! Nature metaphor: Plants package their seeds for dispersal — some float on
//! wind (dandelion), some attach to fur (burr), some are carried by birds
//! (berries). Each dispersal method is tuned to reach the right environment
//! at the right time. Germination only occurs under correct conditions.
//!
//! Security application: Controlled threat-intel propagation. A detected
//! threat signature is "seeded" to downstream agents using the appropriate
//! transport (push/pull/broadcast). Seeds carry a germination condition:
//! only agents meeting the criteria incorporate the intelligence.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DispersalMethod {
    /// Broadcast to all agents (dandelion — wide coverage, low precision).
    Broadcast,
    /// Push to specific target agents (berry — targeted, high precision).
    Targeted(Vec<String>),
    /// Available for agents to pull on demand (burr — passive).
    Passive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Seed {
    pub seed_id: String,
    pub payload: String,
    pub method: DispersalMethod,
    pub germination_condition: Option<String>,
    pub created_at: u64,
    pub collected_by: Vec<String>,
}

pub struct SeedDispersal {
    seeds: Arc<DashMap<String, Seed>>,
}

impl SeedDispersal {
    pub fn new() -> Self {
        Self {
            seeds: Arc::new(DashMap::new()),
        }
    }

    /// Create and register a new seed.
    pub fn plant(
        &self,
        payload: &str,
        method: DispersalMethod,
        germination_condition: Option<&str>,
    ) -> Seed {
        let seed = Seed {
            seed_id: Uuid::new_v4().to_string(),
            payload: payload.to_string(),
            method,
            germination_condition: germination_condition.map(|s| s.to_string()),
            created_at: now_secs(),
            collected_by: Vec::new(),
        };
        self.seeds.insert(seed.seed_id.clone(), seed.clone());
        seed
    }

    /// Agent `agent_id` collects a seed by ID.
    ///
    /// Returns the seed payload if it exists and the agent is eligible,
    /// or `None` otherwise.
    pub fn collect(&self, seed_id: &str, agent_id: &str) -> Option<String> {
        let mut seed = self.seeds.get_mut(seed_id)?;

        // Check eligibility for Targeted dispersal.
        if let DispersalMethod::Targeted(ref targets) = seed.method {
            if !targets.contains(&agent_id.to_string()) {
                return None;
            }
        }

        if !seed.collected_by.contains(&agent_id.to_string()) {
            seed.collected_by.push(agent_id.to_string());
        }

        Some(seed.payload.clone())
    }

    /// Return all seeds available for passive collection.
    pub fn passive_seeds(&self) -> Vec<Seed> {
        self.seeds
            .iter()
            .filter(|e| e.method == DispersalMethod::Passive)
            .map(|e| e.value().clone())
            .collect()
    }

    /// Total seeds in the store.
    pub fn total_seeds(&self) -> usize {
        self.seeds.len()
    }
}

impl Default for SeedDispersal {
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
    fn test_broadcast_collect() {
        let sd = SeedDispersal::new();
        let seed = sd.plant("threat-sig-abc", DispersalMethod::Broadcast, None);
        let payload = sd.collect(&seed.seed_id, "agent-1");
        assert_eq!(payload.unwrap(), "threat-sig-abc");
    }

    #[test]
    fn test_targeted_collect_allowed() {
        let sd = SeedDispersal::new();
        let seed = sd.plant(
            "private-intel",
            DispersalMethod::Targeted(vec!["agent-x".to_string()]),
            None,
        );
        assert!(sd.collect(&seed.seed_id, "agent-x").is_some());
        assert!(sd.collect(&seed.seed_id, "agent-y").is_none());
    }
}
