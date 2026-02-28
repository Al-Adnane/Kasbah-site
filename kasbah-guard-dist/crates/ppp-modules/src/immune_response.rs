//! Module 7: Adaptive Immune Response
//!
//! Nature metaphor: The vertebrate immune system has two layers — innate
//! (immediate, non-specific) and adaptive (learned, antigen-specific). On first
//! exposure to a pathogen the adaptive response is slow. On re-exposure, memory
//! B-cells recognise the antigen instantly and mount a rapid, amplified defence.
//!
//! Security application: Pattern-based threat memory. The system starts naive
//! (no knowledge). As attack patterns are exposed, it builds "immunological
//! memory". Re-exposure triggers instant recognition with amplified blocking
//! strength proportional to severity and exposure count.

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
}
