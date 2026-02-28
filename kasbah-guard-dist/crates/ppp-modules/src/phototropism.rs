//! Module 13: Phototropism (Direction Seeking)
//!
//! Nature metaphor: Plants grow toward light — not because they can see it, but
//! because auxin redistributes to the shaded side, causing differential cell
//! elongation. The plant bends toward the optimum without central coordination.
//!
//! Security application: Gradient-guided policy optimisation. The system
//! continuously measures detection quality signals (true positive rate,
//! false positive rate) and incrementally adjusts sensitivity thresholds
//! toward the optimal operating point — like a plant bending toward light.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TropismMetrics {
    pub true_positives: u64,
    pub false_positives: u64,
    pub true_negatives: u64,
    pub false_negatives: u64,
    pub current_threshold: f32,
    pub precision: f32,
    pub recall: f32,
    pub f1_score: f32,
}

pub struct Phototropism {
    tp: Arc<AtomicI64>,
    fp: Arc<AtomicI64>,
    tn: Arc<AtomicI64>,
    r#fn: Arc<AtomicI64>,
    threshold: parking_lot::Mutex<f32>,
    /// Step size for threshold adjustment.
    step: f32,
}

impl Phototropism {
    pub fn new(initial_threshold: f32, step: f32) -> Self {
        Self {
            tp: Arc::new(AtomicI64::new(0)),
            fp: Arc::new(AtomicI64::new(0)),
            tn: Arc::new(AtomicI64::new(0)),
            r#fn: Arc::new(AtomicI64::new(0)),
            threshold: parking_lot::Mutex::new(initial_threshold.clamp(0.0, 1.0)),
            step: step.clamp(0.001, 0.1),
        }
    }

    pub fn record_tp(&self) { self.tp.fetch_add(1, Ordering::Relaxed); }
    pub fn record_fp(&self) { self.fp.fetch_add(1, Ordering::Relaxed); }
    pub fn record_tn(&self) { self.tn.fetch_add(1, Ordering::Relaxed); }
    pub fn record_fn(&self) { self.r#fn.fetch_add(1, Ordering::Relaxed); }

    /// Adjust threshold one step toward the optimum.
    ///
    /// If FP rate is high → raise threshold (less sensitive).
    /// If FN rate is high → lower threshold (more sensitive).
    pub fn bend_toward_light(&self) {
        let fp = self.fp.load(Ordering::Relaxed) as f32;
        let r#fn = self.r#fn.load(Ordering::Relaxed) as f32;
        let mut t = self.threshold.lock();
        if fp > r#fn {
            *t = (*t + self.step).clamp(0.0, 1.0); // less sensitive
        } else if r#fn > fp {
            *t = (*t - self.step).clamp(0.0, 1.0); // more sensitive
        }
    }

    pub fn current_threshold(&self) -> f32 {
        *self.threshold.lock()
    }

    pub fn metrics(&self) -> TropismMetrics {
        let tp = self.tp.load(Ordering::Relaxed).max(0) as f64;
        let fp = self.fp.load(Ordering::Relaxed).max(0) as f64;
        let tn = self.tn.load(Ordering::Relaxed).max(0) as f64;
        let r#fn = self.r#fn.load(Ordering::Relaxed).max(0) as f64;

        let precision = if tp + fp > 0.0 { (tp / (tp + fp)) as f32 } else { 0.0 };
        let recall    = if tp + r#fn > 0.0 { (tp / (tp + r#fn)) as f32 } else { 0.0 };
        let f1 = if precision + recall > 0.0 {
            2.0 * precision * recall / (precision + recall)
        } else {
            0.0
        };

        TropismMetrics {
            true_positives: tp as u64,
            false_positives: fp as u64,
            true_negatives: tn as u64,
            false_negatives: r#fn as u64,
            current_threshold: *self.threshold.lock(),
            precision,
            recall,
            f1_score: f1,
        }
    }
}

impl Default for Phototropism {
    fn default() -> Self {
        Self::new(0.5, 0.01)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_threshold_rises_under_fp_pressure() {
        let pt = Phototropism::new(0.5, 0.05);
        for _ in 0..10 { pt.record_fp(); }
        let before = pt.current_threshold();
        pt.bend_toward_light();
        assert!(pt.current_threshold() > before);
    }

    #[test]
    fn test_threshold_falls_under_fn_pressure() {
        let pt = Phototropism::new(0.5, 0.05);
        for _ in 0..10 { pt.record_fn(); }
        let before = pt.current_threshold();
        pt.bend_toward_light();
        assert!(pt.current_threshold() < before);
    }
}
