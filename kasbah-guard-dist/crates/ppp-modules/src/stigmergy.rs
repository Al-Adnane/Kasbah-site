//! Module 6: Stigmergy (Trail Marking)
//!
//! Nature metaphor: Ants deposit pheromone trails that guide other ants toward
//! food and away from dead ends. The trail intensifies with traffic and
//! evaporates over time. No ant knows the global plan — the colony's intelligence
//! emerges from the accumulated marks left by individuals.
//!
//! Security application: Indirect coordination between Kasbah agents via
//! shared trail markers. When one agent detects a suspicious pattern at a
//! URL/API endpoint, it deposits a stigmergic mark. Other agents checking the
//! same endpoint read the mark and apply heightened scrutiny without any
//! direct agent-to-agent communication.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trail {
    pub endpoint: String,
    /// Pheromone intensity (0.0–1.0). Grows with deposits, decays over time.
    pub intensity: f32,
    pub deposit_count: u32,
    pub last_deposit: u64,
}

pub struct Stigmergy {
    trails: Arc<DashMap<String, Trail>>,
    /// Decay factor applied per `decay()` call (0.0–1.0).
    decay_factor: f32,
}

impl Stigmergy {
    pub fn new(decay_factor: f32) -> Self {
        Self {
            trails: Arc::new(DashMap::new()),
            decay_factor: decay_factor.clamp(0.0, 1.0),
        }
    }

    /// Deposit a mark on `endpoint` with the given `strength` (0.0–1.0).
    ///
    /// Intensity accumulates via `min(existing + strength * (1 - existing), 1.0)`
    /// so it saturates at 1.0 rather than overflowing.
    pub fn deposit(&self, endpoint: &str, strength: f32) {
        let strength = strength.clamp(0.0, 1.0);
        let now = now_secs();
        let mut entry = self
            .trails
            .entry(endpoint.to_string())
            .or_insert_with(|| Trail {
                endpoint: endpoint.to_string(),
                intensity: 0.0,
                deposit_count: 0,
                last_deposit: now,
            });
        entry.intensity = (entry.intensity + strength * (1.0 - entry.intensity)).min(1.0);
        entry.deposit_count += 1;
        entry.last_deposit = now;
    }

    /// Read the current pheromone intensity for `endpoint` (0.0 if no trail).
    pub fn read(&self, endpoint: &str) -> f32 {
        self.trails
            .get(endpoint)
            .map(|t| t.intensity)
            .unwrap_or(0.0)
    }

    /// Apply decay to all trails.
    ///
    /// Call periodically. Trails that decay to < 0.01 are pruned.
    pub fn decay(&self) {
        let factor = self.decay_factor;
        self.trails.retain(|_, trail| {
            trail.intensity *= 1.0 - factor;
            trail.intensity >= 0.01
        });
    }

    /// Return all active trail snapshots.
    pub fn active_trails(&self) -> Vec<Trail> {
        self.trails.iter().map(|e| e.value().clone()).collect()
    }
}

impl Default for Stigmergy {
    fn default() -> Self {
        Self::new(0.1)
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
    fn test_deposit_and_read() {
        let s = Stigmergy::new(0.1);
        s.deposit("/api/login", 0.5);
        assert!(s.read("/api/login") > 0.0);
    }

    #[test]
    fn test_intensity_saturates() {
        let s = Stigmergy::new(0.0); // no decay
        for _ in 0..100 {
            s.deposit("/heavy", 0.5);
        }
        assert!(s.read("/heavy") <= 1.0);
    }

    #[test]
    fn test_decay_reduces_intensity() {
        let s = Stigmergy::new(0.5);
        s.deposit("/endpoint", 0.8);
        let before = s.read("/endpoint");
        s.decay();
        let after = s.read("/endpoint");
        assert!(after < before);
    }
}
