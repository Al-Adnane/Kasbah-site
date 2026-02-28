//! Module 1: Bio-Source Attestation
//!
//! Nature metaphor: Every organism has a unique biological signature —
//! a fingerprint, a heartbeat rhythm, a gait. Bio-source attestation
//! identifies users by their behavioral cadence rather than credentials.
//!
//! Security application: Continuous authentication via behavioral biometrics.
//! Detects session hijacking, bot activity, and credential sharing by
//! comparing live behavior against the established fingerprint.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

/// Result of attesting a session against a stored behavioral fingerprint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationResult {
    pub user_id: String,
    pub session_id: String,
    pub consistent: bool,
    pub anomaly_score: f32,
    pub fingerprint_age_secs: u64,
    pub sample_count: usize,
}

/// Stored per-user behavioral fingerprint.
#[derive(Debug, Clone)]
struct BehaviorFingerprint {
    /// Rolling window of behavior samples (each sample is a feature vector).
    samples: Vec<Vec<f32>>,
    /// SHA-256 hash of the concatenated recent samples, used for fast comparison.
    typing_cadence_hash: String,
    session_count: u64,
    anomaly_score: f32,
    last_updated: u64,
}

impl BehaviorFingerprint {
    fn new() -> Self {
        Self {
            samples: Vec::new(),
            typing_cadence_hash: String::new(),
            session_count: 0,
            anomaly_score: 0.0,
            last_updated: now_secs(),
        }
    }
}

/// Maximum samples retained per user (rolling window).
const MAX_SAMPLES: usize = 50;

/// Minimum samples required before attestation is meaningful.
const MIN_SAMPLES_FOR_ATTEST: usize = 3;

/// Anomaly score threshold above which a session is flagged inconsistent.
const ANOMALY_THRESHOLD: f32 = 0.35;

/// Behavioral biometric fingerprinting and session attestation.
pub struct BioSourceAttestation {
    fingerprints: Arc<DashMap<String, BehaviorFingerprint>>,
}

impl BioSourceAttestation {
    pub fn new() -> Self {
        Self {
            fingerprints: Arc::new(DashMap::new()),
        }
    }

    /// Attest the current session against the stored fingerprint for `user_id`.
    ///
    /// Returns `consistent = true` when the anomaly score is below threshold.
    /// When fewer than `MIN_SAMPLES_FOR_ATTEST` samples exist, the result is
    /// always `consistent = true` with `anomaly_score = 0.0` (benefit of the doubt
    /// for new users).
    pub fn attest(&self, user_id: &str, session_id: &str) -> AttestationResult {
        let (consistent, anomaly_score, fingerprint_age_secs, sample_count) = self
            .fingerprints
            .get_mut(user_id)
            .map(|mut fp| {
                fp.session_count += 1;
                let age = now_secs().saturating_sub(fp.last_updated);
                let count = fp.samples.len();
                let score = if count < MIN_SAMPLES_FOR_ATTEST {
                    0.0
                } else {
                    fp.anomaly_score
                };
                (score <= ANOMALY_THRESHOLD, score, age, count)
            })
            .unwrap_or((true, 0.0, 0, 0));

        AttestationResult {
            user_id: user_id.to_string(),
            session_id: session_id.to_string(),
            consistent,
            anomaly_score,
            fingerprint_age_secs,
            sample_count,
        }
    }

    /// Update the behavioral fingerprint for `user_id` with a new sample.
    ///
    /// `behavior_sample` is a feature vector (e.g., inter-key delays, mouse
    /// velocity components, scroll rhythm). Dimensionality must be consistent
    /// across calls for a given user; mismatched dimensions are silently dropped.
    pub fn update_fingerprint(&self, user_id: &str, behavior_sample: &[f32]) {
        if behavior_sample.is_empty() {
            return;
        }

        let mut fp = self
            .fingerprints
            .entry(user_id.to_string())
            .or_insert_with(BehaviorFingerprint::new);

        // Enforce consistent dimensionality across samples.
        if let Some(existing) = fp.samples.first() {
            if existing.len() != behavior_sample.len() {
                tracing::warn!(
                    user_id,
                    expected = existing.len(),
                    got = behavior_sample.len(),
                    "bio_source: dimension mismatch — sample dropped"
                );
                return;
            }
        }

        // Rolling window.
        if fp.samples.len() >= MAX_SAMPLES {
            fp.samples.remove(0);
        }
        fp.samples.push(behavior_sample.to_vec());

        // Recompute anomaly score and cadence hash.
        fp.anomaly_score = 1.0 - Self::calculate_consistency(&fp.samples);
        fp.typing_cadence_hash = Self::hash_samples(&fp.samples);
        fp.last_updated = now_secs();
    }

    /// Compute the average pairwise cosine similarity across all sample pairs.
    ///
    /// Returns a value in [0.0, 1.0] where 1.0 = perfectly consistent behavior.
    pub fn calculate_consistency(samples: &[Vec<f32>]) -> f32 {
        let n = samples.len();
        if n < 2 {
            return 1.0;
        }

        let mut total_sim = 0.0f64;
        let mut pair_count = 0usize;

        for i in 0..n {
            for j in (i + 1)..n {
                let sim = cosine_similarity(&samples[i], &samples[j]);
                total_sim += sim as f64;
                pair_count += 1;
            }
        }

        if pair_count == 0 {
            return 1.0;
        }

        (total_sim / pair_count as f64).clamp(0.0, 1.0) as f32
    }

    /// SHA-256 hash of the concatenated sample bytes for quick change detection.
    fn hash_samples(samples: &[Vec<f32>]) -> String {
        let mut hasher = Sha256::new();
        for sample in samples {
            for val in sample {
                hasher.update(val.to_le_bytes());
            }
        }
        format!("{:x}", hasher.finalize())
    }

    /// Return the current anomaly score for a user (0.0 = normal, 1.0 = fully anomalous).
    pub fn anomaly_score(&self, user_id: &str) -> f32 {
        self.fingerprints
            .get(user_id)
            .map(|fp| fp.anomaly_score)
            .unwrap_or(0.0)
    }

    /// Return the number of stored behavioral samples for a user.
    pub fn sample_count(&self, user_id: &str) -> usize {
        self.fingerprints
            .get(user_id)
            .map(|fp| fp.samples.len())
            .unwrap_or(0)
    }

    /// Purge the fingerprint for a user (e.g., on logout or account reset).
    pub fn reset(&self, user_id: &str) {
        self.fingerprints.remove(user_id);
    }
}

impl Default for BioSourceAttestation {
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

/// Cosine similarity between two equal-length vectors.
/// Returns 0.0 for zero-magnitude vectors.
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let mag_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let mag_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if mag_a == 0.0 || mag_b == 0.0 {
        return 0.0;
    }

    (dot / (mag_a * mag_b)).clamp(-1.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_identical() {
        let v = vec![1.0f32, 2.0, 3.0];
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-5);
    }

    #[test]
    fn test_attest_new_user_is_consistent() {
        let bio = BioSourceAttestation::new();
        let result = bio.attest("alice", "sess-001");
        assert!(result.consistent);
        assert_eq!(result.anomaly_score, 0.0);
    }

    #[test]
    fn test_fingerprint_update_and_attest() {
        let bio = BioSourceAttestation::new();
        // Three identical samples → perfect consistency.
        for _ in 0..5 {
            bio.update_fingerprint("bob", &[1.0, 2.0, 3.0, 4.0]);
        }
        let result = bio.attest("bob", "sess-002");
        assert!(result.consistent);
        assert!(result.anomaly_score < 0.01);
    }

    #[test]
    fn test_anomalous_behavior() {
        let bio = BioSourceAttestation::new();
        // Alternating orthogonal vectors → low cosine similarity → high anomaly.
        for i in 0..10 {
            let sample = if i % 2 == 0 {
                vec![1.0f32, 0.0, 0.0]
            } else {
                vec![0.0f32, 1.0, 0.0]
            };
            bio.update_fingerprint("eve", &sample);
        }
        let result = bio.attest("eve", "sess-003");
        // Anomaly score should be > 0 for alternating orthogonal samples.
        assert!(result.anomaly_score > 0.0);
    }

    #[test]
    fn test_dimension_mismatch_is_dropped() {
        let bio = BioSourceAttestation::new();
        bio.update_fingerprint("carol", &[1.0, 2.0, 3.0]);
        bio.update_fingerprint("carol", &[1.0, 2.0]); // wrong dim — dropped
        assert_eq!(bio.sample_count("carol"), 1);
    }
}
