//! Module 14: Circadian Rhythm (Time-Based Access Control)
//!
//! Nature metaphor: Every living organism is governed by a circadian clock —
//! gene expression, hormone release, sleep cycles, and immune strength all vary
//! by time of day. Attempting to access a flower's nectar at night, or a
//! nocturnal creature's burrow at noon, violates the rhythm and is met with
//! resistance.
//!
//! Security application: Time-windowed access policies. Sensitive operations
//! (bulk exports, admin access, privileged API calls) are restricted to
//! designated time windows. Attempts outside the window are denied regardless
//! of credentials, drastically reducing the attack surface during off-hours.

use anyhow::{anyhow, Result};
use chrono::{Datelike, Timelike, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use parking_lot::RwLock;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Day-of-week values matching chrono's `Weekday::num_days_from_monday` (0=Mon … 6=Sun).
pub type DayOfWeek = u8;
/// Hour of day in 24-hour format (0–23).
pub type HourOfDay = u8;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircadianPolicy {
    pub policy_id: String,
    /// Hours during which access is permitted (e.g., vec![9,10,…,17] for 09:00–17:59).
    pub allowed_hours: Vec<HourOfDay>,
    /// Days during which access is permitted (0=Mon … 6=Sun).
    pub allowed_days: Vec<DayOfWeek>,
    pub description: Option<String>,
}

// ---------------------------------------------------------------------------
// Circadian
// ---------------------------------------------------------------------------

pub struct Circadian {
    policies: Arc<RwLock<HashMap<String, CircadianPolicy>>>,
}

impl Circadian {
    pub fn new() -> Self {
        Self {
            policies: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    // ------------------------------------------------------------------
    // Policy management
    // ------------------------------------------------------------------

    /// Register or replace a named access policy.
    ///
    /// # Arguments
    /// * `policy_id` – Unique identifier (e.g., `"admin-access"`, `"bulk-export"`).
    /// * `allowed_hours` – Vector of hours (0–23) when access is permitted.
    /// * `allowed_days` – Vector of week-days (0=Mon…6=Sun) when access is permitted.
    pub fn add_policy(
        &self,
        policy_id: &str,
        allowed_hours: Vec<HourOfDay>,
        allowed_days: Vec<DayOfWeek>,
    ) {
        self.add_policy_with_description(policy_id, allowed_hours, allowed_days, None);
    }

    /// Same as `add_policy` but with an optional description.
    pub fn add_policy_with_description(
        &self,
        policy_id: &str,
        allowed_hours: Vec<HourOfDay>,
        allowed_days: Vec<DayOfWeek>,
        description: Option<&str>,
    ) {
        let policy = CircadianPolicy {
            policy_id: policy_id.to_string(),
            allowed_hours: allowed_hours
                .into_iter()
                .filter(|&h| h <= 23)
                .collect(),
            allowed_days: allowed_days
                .into_iter()
                .filter(|&d| d <= 6)
                .collect(),
            description: description.map(|s| s.to_string()),
        };
        self.policies.write().insert(policy_id.to_string(), policy);
    }

    /// Remove a policy.
    pub fn remove_policy(&self, policy_id: &str) {
        self.policies.write().remove(policy_id);
    }

    // ------------------------------------------------------------------
    // Access checks (UTC)
    // ------------------------------------------------------------------

    /// Return `true` if the current UTC time is within the policy window.
    ///
    /// Returns `false` for unknown policy IDs.
    pub fn is_allowed(&self, policy_id: &str) -> bool {
        let now = Utc::now();
        let current_hour = now.hour() as u8;
        // chrono num_days_from_monday: Monday=0 … Sunday=6
        let current_day = now.weekday().num_days_from_monday() as u8;

        self.policies
            .read()
            .get(policy_id)
            .map(|p| {
                p.allowed_hours.contains(&current_hour)
                    && p.allowed_days.contains(&current_day)
            })
            .unwrap_or(false)
    }

    /// Return `true` if the access is allowed at a specific UTC hour and day.
    ///
    /// Useful for testing or pre-checking future time windows.
    pub fn is_allowed_at(&self, policy_id: &str, hour: HourOfDay, day: DayOfWeek) -> bool {
        self.policies
            .read()
            .get(policy_id)
            .map(|p| {
                p.allowed_hours.contains(&hour) && p.allowed_days.contains(&day)
            })
            .unwrap_or(false)
    }

    /// Return the duration until the next allowed window for `policy_id`.
    ///
    /// Returns `None` if the policy doesn't exist or has no allowed windows.
    /// Returns `Duration::ZERO` if currently allowed.
    pub fn time_until_allowed(&self, policy_id: &str) -> Option<Duration> {
        let policy = {
            let guard = self.policies.read();
            guard.get(policy_id)?.clone()
        };

        if policy.allowed_hours.is_empty() || policy.allowed_days.is_empty() {
            return None;
        }

        // Check now first.
        let now = Utc::now();
        let current_hour = now.hour() as u8;
        let current_day = now.weekday().num_days_from_monday() as u8;

        if policy.allowed_hours.contains(&current_hour)
            && policy.allowed_days.contains(&current_day)
        {
            return Some(Duration::ZERO);
        }

        // Iterate over the next 7*24 hours to find the nearest opening.
        let mut sorted_hours = policy.allowed_hours.clone();
        sorted_hours.sort_unstable();
        let mut sorted_days = policy.allowed_days.clone();
        sorted_days.sort_unstable();

        for offset_hours in 1u64..=(7 * 24) {
            let candidate = now + chrono::Duration::hours(offset_hours as i64);
            let cand_hour = candidate.hour() as u8;
            let cand_day = candidate.weekday().num_days_from_monday() as u8;

            if policy.allowed_hours.contains(&cand_hour)
                && policy.allowed_days.contains(&cand_day)
            {
                return Some(Duration::from_secs(offset_hours * 3600));
            }
        }

        None
    }

    /// Return a clone of the stored policy, or `None` if not found.
    pub fn get_policy(&self, policy_id: &str) -> Option<CircadianPolicy> {
        self.policies.read().get(policy_id).cloned()
    }

    /// Return all policy IDs.
    pub fn list_policies(&self) -> Vec<String> {
        self.policies.read().keys().cloned().collect()
    }

    /// Build a business-hours policy (Mon–Fri, 09:00–17:59 UTC) and register it.
    pub fn add_business_hours_policy(&self, policy_id: &str) {
        self.add_policy(
            policy_id,
            (9u8..=17).collect(),
            (0u8..=4).collect(), // Mon=0 … Fri=4
        );
    }
}

impl Default for Circadian {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unknown_policy_is_denied() {
        let c = Circadian::new();
        assert!(!c.is_allowed("nonexistent-policy"));
    }

    #[test]
    fn test_always_on_policy() {
        let c = Circadian::new();
        // All 24 hours, all 7 days → always allowed.
        c.add_policy("always", (0..=23).collect(), (0..=6).collect());
        assert!(c.is_allowed("always"));
    }

    #[test]
    fn test_is_allowed_at_specific_time() {
        let c = Circadian::new();
        c.add_policy("daytime", vec![9, 10, 11, 12, 13, 14, 15, 16, 17], vec![0, 1, 2, 3, 4]);
        assert!(c.is_allowed_at("daytime", 10, 1)); // 10:00 Tuesday → allowed
        assert!(!c.is_allowed_at("daytime", 22, 1)); // 22:00 Tuesday → denied
        assert!(!c.is_allowed_at("daytime", 10, 5)); // 10:00 Saturday → denied
    }

    #[test]
    fn test_time_until_allowed_returns_zero_when_active() {
        let c = Circadian::new();
        // All 24 hours, all 7 days.
        c.add_policy("always", (0..=23).collect(), (0..=6).collect());
        let wait = c.time_until_allowed("always").unwrap();
        assert_eq!(wait, Duration::ZERO);
    }

    #[test]
    fn test_time_until_allowed_for_restricted_policy() {
        let c = Circadian::new();
        // Only allowed at hour 3 on Sunday (day 6). Very unlikely to be now.
        let now_hour = Utc::now().hour() as u8;
        let now_day = Utc::now().weekday().num_days_from_monday() as u8;

        // Pick a day/hour that is definitely not now.
        let target_hour: u8 = if now_hour == 3 { 4 } else { 3 };
        let target_day: u8 = if now_day == 6 { 5 } else { 6 };

        c.add_policy("rare", vec![target_hour], vec![target_day]);

        if !c.is_allowed("rare") {
            let wait = c.time_until_allowed("rare");
            assert!(wait.is_some());
            assert!(wait.unwrap() > Duration::ZERO);
        }
    }

    #[test]
    fn test_business_hours_policy() {
        let c = Circadian::new();
        c.add_business_hours_policy("work");
        assert!(c.is_allowed_at("work", 9, 0));  // Mon 09:00 → allowed
        assert!(c.is_allowed_at("work", 17, 4)); // Fri 17:00 → allowed
        assert!(!c.is_allowed_at("work", 18, 4)); // Fri 18:00 → denied
        assert!(!c.is_allowed_at("work", 9, 5));  // Sat 09:00 → denied
    }

    #[test]
    fn test_remove_policy() {
        let c = Circadian::new();
        c.add_policy("temp", (0..=23).collect(), (0..=6).collect());
        c.remove_policy("temp");
        assert!(!c.is_allowed("temp"));
    }
}
