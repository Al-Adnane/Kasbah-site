/// Moat N: Privacy-Preserving Telemetry Loop
///
/// Collects detection telemetry WITHOUT ever transmitting raw content.
/// Only content hashes, risk scores, and user actions are recorded.
///
/// This data feeds the Pattern Evolution Engine (Moat H) for improving
/// detection accuracy over time via a privacy-preserving feedback loop.

use sha2::{Digest, Sha256};
use std::collections::VecDeque;

/// Maximum events in the rolling buffer before oldest are evicted.
const DEFAULT_BUFFER_SIZE: usize = 50_000;

/// A single telemetry event — NEVER contains raw content.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TelemetryPacket {
    pub content_hash: String,
    pub risk_score: u16,
    pub user_action: String,
    pub pattern_ids: Vec<String>,
    pub platform: String,
    pub timestamp_ms: u64,
}

/// Aggregated telemetry metrics for a time window.
#[derive(Debug, Clone, serde::Serialize)]
pub struct TelemetryMetrics {
    pub total_events: usize,
    pub blocks: usize,
    pub allows: usize,
    pub overrides: usize,
    pub avg_risk: f32,
    pub top_patterns: Vec<(String, usize)>,
    pub window_start_ms: u64,
    pub window_end_ms: u64,
}

/// Privacy-preserving telemetry buffer.
pub struct TelemetryBuffer {
    events: VecDeque<TelemetryPacket>,
    max_size: usize,
}

impl TelemetryBuffer {
    pub fn new() -> Self {
        TelemetryBuffer {
            events: VecDeque::with_capacity(DEFAULT_BUFFER_SIZE),
            max_size: DEFAULT_BUFFER_SIZE,
        }
    }

    pub fn with_capacity(max_size: usize) -> Self {
        TelemetryBuffer {
            events: VecDeque::with_capacity(max_size),
            max_size,
        }
    }

    /// Record a detection event. Content is hashed — never stored raw.
    pub fn record(
        &mut self,
        content: &str,
        risk_score: u16,
        user_action: &str,
        pattern_ids: Vec<String>,
        platform: &str,
    ) {
        // Hash content — NEVER store raw
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        let content_hash = hex::encode(hasher.finalize());

        let ts = crate::audit::now_ms();

        let packet = TelemetryPacket {
            content_hash,
            risk_score,
            user_action: user_action.to_string(),
            pattern_ids,
            platform: platform.to_string(),
            timestamp_ms: ts,
        };

        // Evict oldest if at capacity
        if self.events.len() >= self.max_size {
            self.events.pop_front();
        }
        self.events.push_back(packet);
    }

    /// Get total event count.
    pub fn len(&self) -> usize {
        self.events.len()
    }

    /// Check if buffer is empty.
    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    /// Compute aggregated metrics for the entire buffer.
    pub fn aggregate(&self) -> TelemetryMetrics {
        if self.events.is_empty() {
            return TelemetryMetrics {
                total_events: 0,
                blocks: 0,
                allows: 0,
                overrides: 0,
                avg_risk: 0.0,
                top_patterns: vec![],
                window_start_ms: 0,
                window_end_ms: 0,
            };
        }

        let mut blocks = 0usize;
        let mut allows = 0usize;
        let mut overrides = 0usize;
        let mut risk_sum = 0u64;
        let mut pattern_counts = std::collections::HashMap::<String, usize>::new();

        for event in &self.events {
            match event.user_action.as_str() {
                "block" | "deny" => blocks += 1,
                "allow" => allows += 1,
                "override" => overrides += 1,
                _ => {}
            }
            risk_sum += event.risk_score as u64;
            for pid in &event.pattern_ids {
                *pattern_counts.entry(pid.clone()).or_insert(0) += 1;
            }
        }

        // Sort patterns by frequency (descending)
        let mut top_patterns: Vec<(String, usize)> = pattern_counts.into_iter().collect();
        top_patterns.sort_by(|a, b| b.1.cmp(&a.1));
        top_patterns.truncate(10);

        let total = self.events.len();
        let window_start = self.events.front().map(|e| e.timestamp_ms).unwrap_or(0);
        let window_end = self.events.back().map(|e| e.timestamp_ms).unwrap_or(0);

        TelemetryMetrics {
            total_events: total,
            blocks,
            allows,
            overrides,
            avg_risk: risk_sum as f32 / total as f32,
            top_patterns,
            window_start_ms: window_start,
            window_end_ms: window_end,
        }
    }

    /// Export all events as JSON (for persistence or transfer).
    pub fn export_json(&self) -> String {
        serde_json::to_string(&self.events.iter().collect::<Vec<_>>()).unwrap_or_default()
    }

    /// Clear all events.
    pub fn clear(&mut self) {
        self.events.clear();
    }
}

impl Default for TelemetryBuffer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_record_hashes_content() {
        let mut buf = TelemetryBuffer::new();
        buf.record("SSN: 123-45-6789", 100, "block", vec!["ssn".into()], "chatgpt");
        assert_eq!(buf.len(), 1);
        // Content hash should NOT be the raw content
        let event = &buf.events[0];
        assert_ne!(event.content_hash, "SSN: 123-45-6789");
        assert_eq!(event.content_hash.len(), 64); // SHA-256 hex = 64 chars
    }

    #[test]
    fn test_buffer_eviction() {
        let mut buf = TelemetryBuffer::with_capacity(3);
        buf.record("a", 10, "allow", vec![], "test");
        buf.record("b", 20, "allow", vec![], "test");
        buf.record("c", 30, "block", vec![], "test");
        buf.record("d", 40, "block", vec![], "test");
        assert_eq!(buf.len(), 3); // Oldest evicted
        assert_eq!(buf.events[0].risk_score, 20); // "a" was evicted
    }

    #[test]
    fn test_aggregate_metrics() {
        let mut buf = TelemetryBuffer::new();
        buf.record("x", 80, "block", vec!["ssn".into()], "chatgpt");
        buf.record("y", 20, "allow", vec!["clean".into()], "claude");
        buf.record("z", 60, "override", vec!["ssn".into()], "chatgpt");

        let metrics = buf.aggregate();
        assert_eq!(metrics.total_events, 3);
        assert_eq!(metrics.blocks, 1);
        assert_eq!(metrics.allows, 1);
        assert_eq!(metrics.overrides, 1);
        assert!((metrics.avg_risk - 53.33).abs() < 1.0);
        assert_eq!(metrics.top_patterns[0].0, "ssn");
        assert_eq!(metrics.top_patterns[0].1, 2);
    }

    #[test]
    fn test_empty_aggregate() {
        let buf = TelemetryBuffer::new();
        let metrics = buf.aggregate();
        assert_eq!(metrics.total_events, 0);
        assert_eq!(metrics.avg_risk, 0.0);
    }

    #[test]
    fn test_export_json() {
        let mut buf = TelemetryBuffer::new();
        let secret = "SSN: 123-45-6789";
        buf.record(secret, 50, "allow", vec![], "chatgpt");
        let json = buf.export_json();
        assert!(json.contains("content_hash"));
        assert!(!json.contains("123-45-6789"), "Raw content must not appear in export");
    }
}
