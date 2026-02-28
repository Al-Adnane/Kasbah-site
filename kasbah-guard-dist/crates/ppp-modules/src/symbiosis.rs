//! Module 15: Symbiotic Security Relationships
//!
//! Nature metaphor: Clownfish and sea anemone — each benefits the other.
//! Oxpeckers and rhinoceros — the bird eats parasites; the rhino gets pest
//! control. True symbiosis means neither party could thrive as well alone.
//!
//! Security application: Mutual-benefit security partnerships between products.
//! The browser extension feeds page-context signals to the CLI/SDK; the
//! CLI feeds file-system context back. Each product becomes more accurate
//! with partner data than it could be operating in isolation.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbiosisPartner {
    pub partner_id: String,
    pub product_type: String,
    pub last_signal_at: u64,
    pub signals_shared: u64,
    pub signals_received: u64,
    pub mutual_benefit_score: f32,
}

pub struct Symbiosis {
    partners: Arc<DashMap<String, SymbiosisPartner>>,
    /// Shared signal bus: partner_id → list of raw signal strings.
    signal_bus: Arc<DashMap<String, Vec<String>>>,
}

impl Symbiosis {
    pub fn new() -> Self {
        Self {
            partners: Arc::new(DashMap::new()),
            signal_bus: Arc::new(DashMap::new()),
        }
    }

    /// Register a symbiotic partner (e.g., `"extension"`, `"cli"`, `"sdk"`).
    pub fn register_partner(&self, partner_id: &str, product_type: &str) {
        self.partners.insert(
            partner_id.to_string(),
            SymbiosisPartner {
                partner_id: partner_id.to_string(),
                product_type: product_type.to_string(),
                last_signal_at: now_secs(),
                signals_shared: 0,
                signals_received: 0,
                mutual_benefit_score: 0.5,
            },
        );
    }

    /// Partner `from_id` shares a signal string with the bus.
    pub fn share_signal(&self, from_id: &str, signal: &str) {
        if let Some(mut partner) = self.partners.get_mut(from_id) {
            partner.signals_shared += 1;
            partner.last_signal_at = now_secs();
        }
        self.signal_bus
            .entry(from_id.to_string())
            .or_default()
            .push(signal.to_string());
    }

    /// Partner `consumer_id` reads all signals from all other partners.
    pub fn consume_signals(&self, consumer_id: &str) -> Vec<(String, String)> {
        let mut result = Vec::new();
        for entry in self.signal_bus.iter() {
            if entry.key() == consumer_id {
                continue;
            }
            for signal in entry.value().iter() {
                result.push((entry.key().clone(), signal.clone()));
            }
        }
        if let Some(mut partner) = self.partners.get_mut(consumer_id) {
            partner.signals_received += result.len() as u64;
        }
        result
    }

    /// Compute and store the mutual benefit score for a partner.
    ///
    /// Score = signals_shared / (signals_shared + signals_received + 1)
    /// A score near 0.5 means balanced exchange; near 0 = only consuming.
    pub fn update_benefit_scores(&self) {
        for mut entry in self.partners.iter_mut() {
            let s = entry.signals_shared as f32;
            let r = entry.signals_received as f32;
            entry.mutual_benefit_score = s / (s + r + 1.0);
        }
    }

    /// Return all registered partners.
    pub fn partners(&self) -> Vec<SymbiosisPartner> {
        self.partners.iter().map(|e| e.value().clone()).collect()
    }
}

impl Default for Symbiosis {
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
    fn test_signal_sharing() {
        let s = Symbiosis::new();
        s.register_partner("ext", "extension");
        s.register_partner("cli", "cli");
        s.share_signal("ext", "suspicious-form-detected");
        let signals = s.consume_signals("cli");
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].1, "suspicious-form-detected");
    }

    #[test]
    fn test_consumer_does_not_see_own_signals() {
        let s = Symbiosis::new();
        s.register_partner("a", "ext");
        s.share_signal("a", "my-signal");
        let signals = s.consume_signals("a");
        assert!(signals.is_empty());
    }
}
