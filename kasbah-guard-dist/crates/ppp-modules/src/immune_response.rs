//! Module 7: Adaptive Immune Response — CLONALG (Clonal Selection Algorithm)
//!
//! Nature metaphor: The vertebrate immune system has two layers — innate
//! (immediate, non-specific) and adaptive (learned, antigen-specific). On first
//! exposure to a pathogen the adaptive response is slow. On re-exposure, memory
//! B-cells recognise the antigen instantly and mount a rapid, amplified defence.
//!
//! Security application: Pattern-based threat memory using CLONALG.
//! The system starts naive (no knowledge). As attack patterns are exposed, it
//! builds "immunological memory" via clonal selection + affinity maturation.
//!
//! CLONALG steps:
//!   1. Clone generation  — N clones proportional to affinity (response_strength)
//!   2. Hypermutation     — mutate clones with rate ∝ 1/affinity (low fitness → more mutation)
//!   3. Affinity maturation — keep the clone with the highest post-mutation affinity

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ImmunityLevel {
    /// Pattern never seen before.
    Naive,
    /// Pattern seen but not yet reinforced — moderate response.
    Memory,
    /// Pattern seen multiple times at high severity — maximum response.
    Active,
}

#[derive(Debug, Clone)]
struct AntigenRecord {
    /// Number of times this pattern has been exposed.
    exposure_count: u32,
    /// Cumulative weighted severity (used to compute response_strength).
    severity_sum: f32,
    /// Timestamp of first exposure.
    first_seen: u64,
    /// Timestamp of most recent exposure.
    last_seen: u64,
}

impl AntigenRecord {
    fn new(severity: f32) -> Self {
        let ts = now_secs();
        Self {
            exposure_count: 1,
            severity_sum: severity,
            first_seen: ts,
            last_seen: ts,
        }
    }

    fn reinforce(&mut self, severity: f32) {
        self.exposure_count += 1;
        self.severity_sum += severity;
        self.last_seen = now_secs();
    }

    /// Computed response strength in [0.0, 1.0].
    ///
    /// Formula: tanh(exposure_count * avg_severity)
    /// — grows quickly at first, saturates near 1.0 for highly-seen patterns.
    fn response_strength(&self) -> f32 {
        if self.exposure_count == 0 {
            return 0.0;
        }
        let avg_severity = self.severity_sum / self.exposure_count as f32;
        // tanh approximated; saturates at 1.0
        let x = (self.exposure_count as f32) * avg_severity;
        (x.tanh()).clamp(0.0, 1.0)
    }

    fn immunity_level(&self) -> ImmunityLevel {
        match self.exposure_count {
            0 => ImmunityLevel::Naive,
            1..=2 => ImmunityLevel::Memory,
            _ => ImmunityLevel::Active,
        }
    }
}

// Thresholds
/// Minimum exposures required for MEMORY level.
const MEMORY_THRESHOLD: u32 = 1;
/// Minimum exposures for ACTIVE level.
const ACTIVE_THRESHOLD: u32 = 3;

// ---------------------------------------------------------------------------
// ImmuneResponse
// ---------------------------------------------------------------------------

pub struct ImmuneResponse {
    /// Map from pattern-hash → antigen record.
    antigens: Arc<DashMap<String, AntigenRecord>>,
}

impl ImmuneResponse {
    pub fn new() -> Self {
        Self {
            antigens: Arc::new(DashMap::new()),
        }
    }

    // ------------------------------------------------------------------
    // Core API
    // ------------------------------------------------------------------

    /// Expose the system to `pattern` and return the current immunity level.
    ///
    /// First call → Naive (record created).
    /// Subsequent calls → Memory or Active depending on exposure count.
    /// This call does NOT build memory (use `build_memory` for that).
    pub fn expose(&self, pattern: &str) -> ImmunityLevel {
        let key = hash_pattern(pattern);
        match self.antigens.get(&key) {
            Some(record) => record.immunity_level(),
            None => ImmunityLevel::Naive,
        }
    }

    /// Record that `pattern` was encountered with the given `severity` (0.0–1.0).
    ///
    /// This is how the immune system learns. Call this when a real attack is
    /// confirmed. Repeat calls strengthen the memory.
    pub fn build_memory(&self, pattern: &str, severity: f32) {
        let severity = severity.clamp(0.0, 1.0);
        let key = hash_pattern(pattern);

        self.antigens
            .entry(key)
            .and_modify(|r| r.reinforce(severity))
            .or_insert_with(|| AntigenRecord::new(severity));

        tracing::debug!(pattern_len = pattern.len(), severity, "immune_response: memory reinforced");
    }

    /// Return true if the pattern has been seen at least once.
    pub fn is_recognized(&self, pattern: &str) -> bool {
        let key = hash_pattern(pattern);
        self.antigens.contains_key(&key)
    }

    /// Return the response strength for `pattern` in [0.0, 1.0].
    ///
    /// 0.0 = never seen (naive), approaches 1.0 for heavily-reinforced patterns.
    pub fn response_strength(&self, pattern: &str) -> f32 {
        let key = hash_pattern(pattern);
        self.antigens
            .get(&key)
            .map(|r| r.response_strength())
            .unwrap_or(0.0)
    }

    /// Return immunity level without exposing the system (read-only query).
    pub fn immunity_level(&self, pattern: &str) -> ImmunityLevel {
        let key = hash_pattern(pattern);
        self.antigens
            .get(&key)
            .map(|r| r.immunity_level())
            .unwrap_or(ImmunityLevel::Naive)
    }

    /// Number of distinct patterns the system has immunological memory for.
    pub fn memory_size(&self) -> usize {
        self.antigens.len()
    }

    /// Forget a pattern (e.g., for privacy-compliant data purge).
    pub fn forget(&self, pattern: &str) {
        let key = hash_pattern(pattern);
        self.antigens.remove(&key);
    }

    /// Forget all patterns older than `age_secs` seconds (immune aging).
    pub fn prune_old(&self, age_secs: u64) {
        let cutoff = now_secs().saturating_sub(age_secs);
        self.antigens.retain(|_, v| v.last_seen >= cutoff);
    }
}

impl Default for ImmuneResponse {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// CLONALG — Clonal Selection Algorithm
// ---------------------------------------------------------------------------

/// A single candidate antibody in the clonal population.
/// Represented as a severity bias used to specialise pattern recognition.
#[derive(Debug, Clone)]
pub struct Antibody {
    /// Severity bias in [0.0, 1.0] — the antibody's "shape" in solution space.
    pub severity_bias: f32,
    /// Affinity of this antibody against the current antigen.
    pub affinity: f32,
}

impl Antibody {
    fn new(severity_bias: f32, affinity: f32) -> Self {
        Self { severity_bias, affinity }
    }
}

/// Result of one CLONALG iteration.
#[derive(Debug)]
pub struct ClonalSelectionResult {
    /// The matured antibody (best clone after hypermutation).
    pub best_antibody: Antibody,
    /// Number of clones generated in this round.
    pub clone_count: usize,
    /// Hypermutation rate applied (lower = high-affinity antibody, barely mutated).
    pub mutation_rate: f32,
}

impl ImmuneResponse {
    // ------------------------------------------------------------------
    // CLONALG operations
    // ------------------------------------------------------------------

    /// Run one round of clonal selection for `pattern` with initial `severity`.
    ///
    /// Algorithm:
    ///   1. Compute current affinity from memory (or 0 if naive).
    ///   2. Clone count N = round(beta * pop_size) where beta = 1 / (1 + affinity).
    ///      Higher affinity → fewer but more targeted clones.
    ///   3. Hypermutate each clone: mutation rate ρ = exp(-affinity).
    ///      High affinity → small perturbation (exploit). Low affinity → large jump (explore).
    ///   4. Evaluate affinity of all clones; select the best.
    ///   5. Build memory with the best clone's severity_bias.
    ///
    /// Returns the matured antibody and stats.
    pub fn clonal_select(
        &self,
        pattern: &str,
        severity: f32,
        pop_size: usize,
        beta: f32,
    ) -> ClonalSelectionResult {
        let severity = severity.clamp(0.0, 1.0);
        let pop_size = pop_size.max(1);
        let beta = beta.clamp(0.1, 5.0);

        // Step 1: current affinity
        let current_affinity = self.response_strength(pattern);

        // Step 2: clone count — inversely proportional to affinity
        // High affinity → fewer clones (already well-recognised)
        // Low affinity  → many clones (explore the space)
        let n_clones = ((beta * pop_size as f32) / (1.0 + current_affinity))
            .round()
            .clamp(1.0, pop_size as f32) as usize;

        // Step 3: hypermutation rate — ρ = exp(-affinity)
        // High affinity → ρ → 0 (exploit: barely mutate the good antibody)
        // Low affinity  → ρ → 1 (explore: large perturbation)
        let mutation_rate = (-current_affinity).exp().clamp(0.01, 1.0);

        // Generate clones as severity_bias variants around `severity`
        let mut clones: Vec<Antibody> = (0..n_clones)
            .map(|i| {
                // Deterministic perturbation based on clone index and mutation_rate
                // Using linear spacing so no external RNG dependency is needed
                let delta = mutation_rate * (i as f32 / n_clones.max(1) as f32 - 0.5) * 2.0;
                let candidate_bias = (severity + delta).clamp(0.0, 1.0);
                // Affinity = tanh(exposure * candidate_bias) — same formula as response_strength
                let key = hash_pattern(pattern);
                let exposure = self.antigens.get(&key)
                    .map(|r| r.exposure_count as f32)
                    .unwrap_or(0.0);
                let affinity = ((exposure + 1.0) * candidate_bias).tanh().clamp(0.0, 1.0);
                Antibody::new(candidate_bias, affinity)
            })
            .collect();

        // Step 4: affinity maturation — select best clone
        clones.sort_by(|a, b| b.affinity.partial_cmp(&a.affinity).unwrap_or(std::cmp::Ordering::Equal));
        let best = clones.into_iter().next().unwrap_or_else(|| Antibody::new(severity, 0.0));

        // Step 5: reinforce memory with matured severity_bias
        self.build_memory(pattern, best.severity_bias);

        ClonalSelectionResult {
            best_antibody: best,
            clone_count: n_clones,
            mutation_rate,
        }
    }

    /// Run multiple CLONALG rounds until affinity converges (delta < tol) or max_iter reached.
    ///
    /// Returns the final best antibody after convergence.
    pub fn clonal_select_until_convergence(
        &self,
        pattern: &str,
        severity: f32,
        pop_size: usize,
        beta: f32,
        max_iter: usize,
        tol: f32,
    ) -> Antibody {
        let mut prev_affinity = self.response_strength(pattern);
        let mut best = Antibody::new(severity, prev_affinity);

        for _ in 0..max_iter.max(1) {
            let result = self.clonal_select(pattern, severity, pop_size, beta);
            let new_affinity = result.best_antibody.affinity;
            if (new_affinity - prev_affinity).abs() < tol {
                return result.best_antibody;
            }
            best = result.best_antibody;
            prev_affinity = new_affinity;
        }

        best
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn hash_pattern(pattern: &str) -> String {
    let mut h = Sha256::new();
    h.update(pattern.as_bytes());
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
    fn test_naive_on_first_check() {
        let ir = ImmuneResponse::new();
        assert_eq!(ir.expose("new-attack-pattern"), ImmunityLevel::Naive);
    }

    #[test]
    fn test_memory_after_one_exposure() {
        let ir = ImmuneResponse::new();
        ir.build_memory("sql-injection", 0.8);
        assert_eq!(ir.immunity_level("sql-injection"), ImmunityLevel::Memory);
    }

    #[test]
    fn test_active_after_multiple_exposures() {
        let ir = ImmuneResponse::new();
        for _ in 0..4 {
            ir.build_memory("xss-payload", 0.9);
        }
        assert_eq!(ir.immunity_level("xss-payload"), ImmunityLevel::Active);
    }

    #[test]
    fn test_response_strength_grows() {
        let ir = ImmuneResponse::new();
        ir.build_memory("brute-force", 0.7);
        let s1 = ir.response_strength("brute-force");
        ir.build_memory("brute-force", 0.7);
        let s2 = ir.response_strength("brute-force");
        assert!(s2 > s1, "response should strengthen with exposure");
    }

    #[test]
    fn test_is_recognized() {
        let ir = ImmuneResponse::new();
        assert!(!ir.is_recognized("unknown"));
        ir.build_memory("unknown", 0.5);
        assert!(ir.is_recognized("unknown"));
    }

    #[test]
    fn test_forget() {
        let ir = ImmuneResponse::new();
        ir.build_memory("pattern", 0.6);
        ir.forget("pattern");
        assert!(!ir.is_recognized("pattern"));
    }

    #[test]
    fn test_response_strength_zero_for_unknown() {
        let ir = ImmuneResponse::new();
        assert_eq!(ir.response_strength("never-seen"), 0.0);
    }

    // ── CLONALG tests ──────────────────────────────────────────────────────

    #[test]
    fn test_clonal_select_increases_affinity() {
        let ir = ImmuneResponse::new();
        let r1 = ir.clonal_select("sql-injection", 0.8, 10, 1.5);
        let r2 = ir.clonal_select("sql-injection", 0.8, 10, 1.5);
        // Each round reinforces memory; second affinity should be >= first
        assert!(r2.best_antibody.affinity >= r1.best_antibody.affinity);
    }

    #[test]
    fn test_clonal_select_clone_count_decreases_with_affinity() {
        let ir = ImmuneResponse::new();
        // Build strong memory first
        for _ in 0..20 {
            ir.build_memory("known-attack", 0.9);
        }
        // Clone count should be lower for high-affinity pattern
        let high_affinity_result = ir.clonal_select("known-attack", 0.9, 20, 1.5);
        let low_affinity_result = ir.clonal_select("new-attack-xyz", 0.9, 20, 1.5);
        assert!(high_affinity_result.clone_count <= low_affinity_result.clone_count);
    }

    #[test]
    fn test_clonal_select_until_convergence() {
        let ir = ImmuneResponse::new();
        let best = ir.clonal_select_until_convergence("converge-test", 0.7, 10, 1.5, 50, 0.001);
        assert!(best.affinity > 0.0);
        assert!(best.severity_bias >= 0.0 && best.severity_bias <= 1.0);
    }

    #[test]
    fn test_mutation_rate_high_for_naive_pattern() {
        let ir = ImmuneResponse::new();
        let result = ir.clonal_select("never-seen-pattern", 0.5, 10, 1.5);
        // Naive pattern → low affinity → mutation_rate ≈ exp(0) = 1.0
        assert!(result.mutation_rate > 0.5, "naive pattern should have high mutation rate");
    }
}
