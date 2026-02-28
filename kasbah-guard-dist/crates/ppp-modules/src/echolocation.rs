//! Module 18: Echolocation (Blind Probing)
//!
//! Nature metaphor: Bats and dolphins navigate and hunt in total darkness by
//! emitting sound pulses and interpreting returning echoes. They build a
//! complete spatial model of their environment without ever seeing it directly.
//!
//! Security application: Active probing of unknown endpoints to infer their
//! security posture. The system emits calibrated probe requests and interprets
//! the response characteristics (timing, size, headers, error codes) to build
//! a security profile without requiring direct access to server configuration.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use parking_lot::RwLock;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbeResult {
    pub probe_id: String,
    pub target: String,
    pub response_time_ms: u64,
    pub response_code: u16,
    pub inferred_security_score: f32,
    pub signals: Vec<String>,
    pub probed_at: u64,
}

pub struct Echolocation {
    results: Arc<RwLock<HashMap<String, Vec<ProbeResult>>>>,
    probe_counter: std::sync::atomic::AtomicU64,
}

impl Echolocation {
    pub fn new() -> Self {
        Self {
            results: Arc::new(RwLock::new(HashMap::new())),
            probe_counter: std::sync::atomic::AtomicU64::new(1),
        }
    }

    /// Record a probe result for `target` (called after an actual HTTP probe).
    ///
    /// The security score is inferred from response signals:
    /// - 200 with fast response: good (0.7)
    /// - 401/403: auth enforced (0.8)
    /// - 500: server error (0.3)
    /// - Timeout (response_time_ms > 5000): suspicious (0.2)
    pub fn record_probe(
        &self,
        target: &str,
        response_time_ms: u64,
        response_code: u16,
        extra_signals: Vec<String>,
    ) -> ProbeResult {
        let id = self.probe_counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let probe_id = format!("probe-{}", id);

        let mut signals = extra_signals;
        let score = self.infer_score(response_time_ms, response_code, &mut signals);

        let result = ProbeResult {
            probe_id: probe_id.clone(),
            target: target.to_string(),
            response_time_ms,
            response_code,
            inferred_security_score: score,
            signals,
            probed_at: now_secs(),
        };

        self.results
            .write()
            .entry(target.to_string())
            .or_default()
            .push(result.clone());

        result
    }

    fn infer_score(
        &self,
        response_time_ms: u64,
        response_code: u16,
        signals: &mut Vec<String>,
    ) -> f32 {
        let mut score = 0.5f32;

        if response_time_ms > 5000 {
            score -= 0.3;
            signals.push("timeout-risk".to_string());
        } else if response_time_ms < 100 {
            score += 0.1;
        }

        match response_code {
            200..=299 => { score += 0.1; }
            401 | 403 => {
                score += 0.3;
                signals.push("auth-enforced".to_string());
            }
            429 => {
                score += 0.2;
                signals.push("rate-limit-active".to_string());
            }
            500..=599 => {
                score -= 0.2;
                signals.push("server-error".to_string());
            }
            _ => {}
        }

        score.clamp(0.0, 1.0)
    }

    /// Return the average inferred security score across all probes for `target`.
    pub fn security_score(&self, target: &str) -> f32 {
        let guard = self.results.read();
        let probes = match guard.get(target) {
            Some(p) => p,
            None => return 0.0,
        };
        if probes.is_empty() {
            return 0.0;
        }
        let sum: f32 = probes.iter().map(|p| p.inferred_security_score).sum();
        sum / probes.len() as f32
    }

    /// Return all probe results for `target`.
    pub fn probe_history(&self, target: &str) -> Vec<ProbeResult> {
        self.results
            .read()
            .get(target)
            .cloned()
            .unwrap_or_default()
    }
}

impl Default for Echolocation {
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
    fn test_probe_auth_endpoint() {
        let el = Echolocation::new();
        let result = el.record_probe("https://api.example.com/secure", 50, 401, vec![]);
        assert!(result.inferred_security_score > 0.5);
        assert!(result.signals.contains(&"auth-enforced".to_string()));
    }

    #[test]
    fn test_probe_timeout() {
        let el = Echolocation::new();
        let result = el.record_probe("https://slow.example.com", 6000, 200, vec![]);
        assert!(result.signals.contains(&"timeout-risk".to_string()));
    }

    #[test]
    fn test_average_score() {
        let el = Echolocation::new();
        el.record_probe("https://t.com", 100, 401, vec![]);
        el.record_probe("https://t.com", 100, 200, vec![]);
        let score = el.security_score("https://t.com");
        assert!(score > 0.0 && score <= 1.0);
    }
}
