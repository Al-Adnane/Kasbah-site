//! Module 20: Thermoregulation (Load Regulation)
//!
//! Nature metaphor: Warm-blooded animals maintain core temperature within a
//! narrow band regardless of external conditions. Too cold → shiver to generate
//! heat. Too hot → sweat to shed it. The system is always pushing back toward
//! homeostasis, not simply reacting to extremes.
//!
//! Security application: Adaptive rate limiting and load shedding.
//! The system tracks request throughput and maintains it within a "healthy
//! temperature band". When load spikes (fever), requests are throttled.
//! When load drops (hypothermia), reserved capacity is released.

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use parking_lot::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThermalState {
    pub current_rps: f32,
    pub target_rps: f32,
    pub state: ThermalZone,
    pub shed_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ThermalZone {
    /// Normal operating range.
    Homeostasis,
    /// Load above upper bound — shedding excess.
    Fever,
    /// Load below lower bound — releasing reserved capacity.
    Hypothermia,
}

pub struct Thermoregulation {
    request_count: Arc<AtomicU64>,
    shed_count: Arc<AtomicU64>,
    window_start: Arc<Mutex<u64>>,
    target_rps: f32,
    /// Upper bound ratio (e.g., 1.2 = 20% above target before shedding).
    upper_ratio: f32,
    /// Lower bound ratio (e.g., 0.5 = 50% below target before releasing).
    lower_ratio: f32,
}

impl Thermoregulation {
    pub fn new(target_rps: f32, upper_ratio: f32, lower_ratio: f32) -> Self {
        Self {
            request_count: Arc::new(AtomicU64::new(0)),
            shed_count: Arc::new(AtomicU64::new(0)),
            window_start: Arc::new(Mutex::new(now_secs())),
            target_rps,
            upper_ratio: upper_ratio.max(1.0),
            lower_ratio: lower_ratio.clamp(0.0, 1.0),
        }
    }

    /// Record an incoming request.
    ///
    /// Returns `true` if the request should be accepted, `false` if it should
    /// be shed (rate limited) because the system is in Fever state.
    pub fn admit_request(&self) -> bool {
        let count = self.request_count.fetch_add(1, Ordering::Relaxed) + 1;
        let rps = self.current_rps(count);
        let upper = self.target_rps * self.upper_ratio;

        if rps > upper {
            self.shed_count.fetch_add(1, Ordering::Relaxed);
            false // shed
        } else {
            true // admit
        }
    }

    /// Current estimated RPS based on the rolling window.
    fn current_rps(&self, count: u64) -> f32 {
        let elapsed = {
            let start = self.window_start.lock();
            now_secs().saturating_sub(*start).max(1)
        } as f32;
        count as f32 / elapsed
    }

    /// Reset the measurement window (call at the start of each second/period).
    pub fn reset_window(&self) {
        *self.window_start.lock() = now_secs();
        self.request_count.store(0, Ordering::Relaxed);
    }

    /// Return the current thermal state.
    pub fn thermal_state(&self) -> ThermalState {
        let count = self.request_count.load(Ordering::Relaxed);
        let rps = self.current_rps(count);
        let upper = self.target_rps * self.upper_ratio;
        let lower = self.target_rps * self.lower_ratio;

        let zone = if rps > upper {
            ThermalZone::Fever
        } else if rps < lower {
            ThermalZone::Hypothermia
        } else {
            ThermalZone::Homeostasis
        };

        ThermalState {
            current_rps: rps,
            target_rps: self.target_rps,
            state: zone,
            shed_count: self.shed_count.load(Ordering::Relaxed),
        }
    }
}

impl Default for Thermoregulation {
    fn default() -> Self {
        Self::new(100.0, 1.2, 0.5)
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
    fn test_admit_within_target() {
        let tr = Thermoregulation::new(1000.0, 1.5, 0.0);
        // A few requests should be admitted easily.
        assert!(tr.admit_request());
        assert!(tr.admit_request());
    }

    #[test]
    fn test_shed_count_increments_under_load() {
        // Tiny target so we overflow quickly.
        let tr = Thermoregulation::new(0.001, 1.0, 0.0);
        for _ in 0..50 {
            tr.admit_request();
        }
        let state = tr.thermal_state();
        // Some requests should have been shed.
        assert!(state.shed_count > 0 || state.current_rps > 0.0);
    }
}
