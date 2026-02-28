/// Moat H: AI-Powered Pattern Evolution Engine
///
/// Tracks pattern effectiveness over time via a privacy-preserving feedback loop.
/// Patterns that consistently detect real threats get confidence boosts.
/// Patterns with high false-positive rates get confidence decay.
/// This allows the detection engine to self-improve without cloud training.

use std::collections::HashMap;

/// Tracks the performance of a single detection pattern.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PatternStats {
    pub pattern_id: String,
    pub total_hits: u64,
    pub true_positives: u64,
    pub false_positives: u64,
    pub user_overrides: u64,
    pub confidence: f32,
    pub last_hit_ms: u64,
}

impl PatternStats {
    pub fn new(pattern_id: &str) -> Self {
        PatternStats {
            pattern_id: pattern_id.to_string(),
            total_hits: 0,
            true_positives: 0,
            false_positives: 0,
            user_overrides: 0,
            confidence: 1.0,
            last_hit_ms: 0,
        }
    }

    /// Precision: true_positives / total_hits
    pub fn precision(&self) -> f32 {
        if self.total_hits == 0 {
            return 1.0;
        }
        self.true_positives as f32 / self.total_hits as f32
    }

    /// False positive rate: false_positives / total_hits
    pub fn false_positive_rate(&self) -> f32 {
        if self.total_hits == 0 {
            return 0.0;
        }
        self.false_positives as f32 / self.total_hits as f32
    }
}

/// The pattern evolution engine — tracks and adapts pattern confidence.
pub struct EvolutionEngine {
    patterns: HashMap<String, PatternStats>,
    /// Confidence boost per true positive (multiplicative)
    boost_factor: f32,
    /// Confidence decay per false positive (multiplicative)
    decay_factor: f32,
    /// Minimum confidence floor (patterns never go below this)
    min_confidence: f32,
    /// Maximum confidence ceiling
    max_confidence: f32,
}

impl EvolutionEngine {
    pub fn new() -> Self {
        EvolutionEngine {
            patterns: HashMap::new(),
            boost_factor: 1.02,
            decay_factor: 0.90,
            min_confidence: 0.3,
            max_confidence: 2.0,
        }
    }

    /// Record a pattern hit where the user confirmed the block (true positive).
    pub fn record_true_positive(&mut self, pattern_id: &str) {
        let stats = self
            .patterns
            .entry(pattern_id.to_string())
            .or_insert_with(|| PatternStats::new(pattern_id));

        stats.total_hits += 1;
        stats.true_positives += 1;
        stats.last_hit_ms = crate::audit::now_ms();

        // Boost confidence (capped at max)
        stats.confidence = (stats.confidence * self.boost_factor).min(self.max_confidence);
    }

    /// Record a pattern hit where the user overrode the block (false positive).
    pub fn record_false_positive(&mut self, pattern_id: &str) {
        let stats = self
            .patterns
            .entry(pattern_id.to_string())
            .or_insert_with(|| PatternStats::new(pattern_id));

        stats.total_hits += 1;
        stats.false_positives += 1;
        stats.user_overrides += 1;
        stats.last_hit_ms = crate::audit::now_ms();

        // Decay confidence (floored at min)
        stats.confidence = (stats.confidence * self.decay_factor).max(self.min_confidence);
    }

    /// Get the current confidence multiplier for a pattern.
    /// Returns 1.0 if the pattern has no history.
    pub fn get_confidence(&self, pattern_id: &str) -> f32 {
        self.patterns
            .get(pattern_id)
            .map(|s| s.confidence)
            .unwrap_or(1.0)
    }

    /// Apply confidence boost to a raw risk score.
    /// `base_score * confidence` = adjusted score.
    pub fn adjust_risk(&self, pattern_id: &str, base_score: u16) -> u16 {
        let confidence = self.get_confidence(pattern_id);
        let adjusted = (base_score as f32 * confidence).round() as u16;
        adjusted.min(100)
    }

    /// Get stats for a specific pattern.
    pub fn get_stats(&self, pattern_id: &str) -> Option<&PatternStats> {
        self.patterns.get(pattern_id)
    }

    /// Get all pattern stats, sorted by total hits (descending).
    pub fn all_stats(&self) -> Vec<&PatternStats> {
        let mut stats: Vec<&PatternStats> = self.patterns.values().collect();
        stats.sort_by(|a, b| b.total_hits.cmp(&a.total_hits));
        stats
    }

    /// Get patterns ranked by priority (confidence × hit_rate).
    /// Useful for reordering pattern evaluation for performance.
    pub fn priority_order(&self) -> Vec<(&str, f32)> {
        let mut priorities: Vec<(&str, f32)> = self
            .patterns
            .iter()
            .map(|(id, stats)| (id.as_str(), stats.confidence * stats.precision()))
            .collect();
        priorities.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        priorities
    }

    /// Number of tracked patterns.
    pub fn pattern_count(&self) -> usize {
        self.patterns.len()
    }

    /// Export all stats as JSON.
    pub fn export_json(&self) -> String {
        let stats: Vec<&PatternStats> = self.patterns.values().collect();
        serde_json::to_string(&stats).unwrap_or_default()
    }

    /// Import stats from JSON (for persistence across restarts).
    pub fn import_json(&mut self, json: &str) -> Result<usize, String> {
        let stats: Vec<PatternStats> =
            serde_json::from_str(json).map_err(|e| format!("Parse error: {}", e))?;
        let count = stats.len();
        for s in stats {
            self.patterns.insert(s.pattern_id.clone(), s);
        }
        Ok(count)
    }
}

impl Default for EvolutionEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_true_positive_boosts_confidence() {
        let mut engine = EvolutionEngine::new();
        engine.record_true_positive("ssn");
        let conf = engine.get_confidence("ssn");
        assert!(conf > 1.0, "True positive should boost confidence above 1.0");
    }

    #[test]
    fn test_false_positive_decays_confidence() {
        let mut engine = EvolutionEngine::new();
        engine.record_false_positive("ssn");
        let conf = engine.get_confidence("ssn");
        assert!(conf < 1.0, "False positive should decay confidence below 1.0");
    }

    #[test]
    fn test_confidence_floor() {
        let mut engine = EvolutionEngine::new();
        for _ in 0..100 {
            engine.record_false_positive("noisy_pattern");
        }
        let conf = engine.get_confidence("noisy_pattern");
        assert!(conf >= 0.3, "Confidence should never go below floor (0.3)");
    }

    #[test]
    fn test_confidence_ceiling() {
        let mut engine = EvolutionEngine::new();
        for _ in 0..1000 {
            engine.record_true_positive("solid_pattern");
        }
        let conf = engine.get_confidence("solid_pattern");
        assert!(conf <= 2.0, "Confidence should never exceed ceiling (2.0)");
    }

    #[test]
    fn test_adjust_risk() {
        let mut engine = EvolutionEngine::new();
        // Boost the pattern
        for _ in 0..10 {
            engine.record_true_positive("ssn");
        }
        let adjusted = engine.adjust_risk("ssn", 80);
        assert!(adjusted > 80, "Boosted pattern should increase risk score");
        assert!(adjusted <= 100, "Risk should cap at 100");
    }

    #[test]
    fn test_unknown_pattern_default() {
        let engine = EvolutionEngine::new();
        assert!((engine.get_confidence("unknown") - 1.0).abs() < 0.001);
        assert_eq!(engine.adjust_risk("unknown", 50), 50);
    }

    #[test]
    fn test_precision() {
        let mut engine = EvolutionEngine::new();
        engine.record_true_positive("test");
        engine.record_true_positive("test");
        engine.record_false_positive("test");
        let stats = engine.get_stats("test").unwrap();
        assert!((stats.precision() - 0.6667).abs() < 0.01);
    }

    #[test]
    fn test_export_import() {
        let mut engine = EvolutionEngine::new();
        engine.record_true_positive("ssn");
        engine.record_false_positive("email");
        let json = engine.export_json();

        let mut engine2 = EvolutionEngine::new();
        let count = engine2.import_json(&json).unwrap();
        assert_eq!(count, 2);
        assert!(engine2.get_confidence("ssn") > 1.0);
        assert!(engine2.get_confidence("email") < 1.0);
    }

    #[test]
    fn test_priority_order() {
        let mut engine = EvolutionEngine::new();
        for _ in 0..10 {
            engine.record_true_positive("strong");
        }
        engine.record_false_positive("weak");
        let priorities = engine.priority_order();
        assert_eq!(priorities[0].0, "strong");
    }
}
