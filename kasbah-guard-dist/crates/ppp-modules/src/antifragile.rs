//! Module 4: Antifragile Adaptation
//!
//! Nature metaphor: Bone density increases under stress. Muscles grow stronger
//! after microtears. The immune system becomes more capable after exposure to
//! pathogens. Antifragile systems don't merely withstand shocks — they benefit
//! from them, improving their response with each encounter.
//!
//! Security application: The detection engine tightens its thresholds
//! automatically in response to attack pressure. Under sustained attack, the
//! system becomes progressively more aggressive in blocking. During quiet
//! periods it relaxes to minimise false positives.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdaptationState {
    pub attack_pressure: f32,
    pub current_threshold: f32,
    pub adaptations_applied: u32,
}

pub struct Antifragile {
    /// Rolling attack event count — used to compute pressure.
    event_count: Arc<AtomicU32>,
    /// Number of times the threshold has been tightened.
    adaptation_count: Arc<AtomicU32>,
    base_threshold: f32,
}

impl Antifragile {
    pub fn new(base_threshold: f32) -> Self {
        Self {
            event_count: Arc::new(AtomicU32::new(0)),
            adaptation_count: Arc::new(AtomicU32::new(0)),
            base_threshold: base_threshold.clamp(0.0, 1.0),
        }
    }

    /// Record an attack event; raises pressure.
    pub fn record_attack(&self) {
        self.event_count.fetch_add(1, Ordering::Relaxed);
        self.adaptation_count.fetch_add(1, Ordering::Relaxed);
    }

    /// Decay pressure (call periodically to model quiet periods).
    pub fn decay(&self) {
        let current = self.event_count.load(Ordering::Relaxed);
        let decayed = (current as f32 * 0.9) as u32;
        self.event_count.store(decayed, Ordering::Relaxed);
    }

    /// Current effective blocking threshold (lower = more aggressive).
    pub fn current_threshold(&self) -> f32 {
        let pressure = self.attack_pressure();
        (self.base_threshold - pressure * 0.2).clamp(0.1, self.base_threshold)
    }

    /// Normalised attack pressure in [0.0, 1.0].
    pub fn attack_pressure(&self) -> f32 {
        let events = self.event_count.load(Ordering::Relaxed);
        // Saturates at 100 events.
        (events as f32 / 100.0).clamp(0.0, 1.0)
    }

    /// Full state snapshot.
    pub fn state(&self) -> AdaptationState {
        AdaptationState {
            attack_pressure: self.attack_pressure(),
            current_threshold: self.current_threshold(),
            adaptations_applied: self.adaptation_count.load(Ordering::Relaxed),
        }
    }
}

impl Default for Antifragile {
    fn default() -> Self {
        Self::new(0.7)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_threshold_tightens_under_attack() {
        let af = Antifragile::new(0.7);
        let before = af.current_threshold();
        for _ in 0..50 {
            af.record_attack();
        }
        let after = af.current_threshold();
        assert!(after < before, "threshold should tighten under attack pressure");
    }

    #[test]
    fn test_decay_reduces_pressure() {
        let af = Antifragile::new(0.7);
        for _ in 0..100 {
            af.record_attack();
        }
        let p1 = af.attack_pressure();
        af.decay();
        let p2 = af.attack_pressure();
        assert!(p2 <= p1);
    }
}
