//! Module 16: Apoptosis (Programmed Data Death)
//!
//! Nature metaphor: Apoptosis is the controlled, programmed death of cells —
//! essential for organism health. Without it, cancerous cells accumulate.
//! The cell doesn't simply die; it dismantles itself cleanly, signalling
//! its death to neighbours, and is absorbed without inflammation.
//!
//! Security application: Privacy-by-design data lifecycle enforcement. Sensitive
//! data items (session tokens, PII fragments, temporary credentials) are
//! scheduled for guaranteed deletion at creation time. The system tracks TTLs
//! and actively reaps expired items. Callers can postpone death within limits
//! but cannot revive reaped data. A `DeathCertificate` provides an audit trail.

use anyhow::{anyhow, Result};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Proof that a data item was scheduled for deletion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeathCertificate {
    pub data_id: String,
    pub scheduled_at: u64,
    pub expires_at: u64,
    pub ttl_seconds: u64,
    pub label: Option<String>,
}

#[derive(Debug, Clone)]
struct DataRecord {
    expires_at: u64,
    /// How many times the death has been postponed.
    postpone_count: u32,
    label: Option<String>,
    reaped: bool,
}

/// Maximum number of postponements allowed per data item.
const MAX_POSTPONEMENTS: u32 = 5;

// ---------------------------------------------------------------------------
// Apoptosis
// ---------------------------------------------------------------------------

pub struct Apoptosis {
    records: Arc<DashMap<String, DataRecord>>,
    /// Immutable certificates for audit (data_id → certificate).
    certificates: Arc<DashMap<String, DeathCertificate>>,
}

impl Apoptosis {
    pub fn new() -> Self {
        Self {
            records: Arc::new(DashMap::new()),
            certificates: Arc::new(DashMap::new()),
        }
    }

    // ------------------------------------------------------------------
    // Scheduling
    // ------------------------------------------------------------------

    /// Schedule `data_id` for deletion after `ttl_seconds`.
    ///
    /// If `data_id` is already scheduled, the existing record is replaced and
    /// a new certificate issued.
    pub fn schedule_death(&self, data_id: &str, ttl_seconds: u64) -> DeathCertificate {
        self.schedule_labeled(data_id, ttl_seconds, None)
    }

    /// Schedule with a human-readable label (e.g., `"session-token"`, `"temp-key"`).
    pub fn schedule_labeled(
        &self,
        data_id: &str,
        ttl_seconds: u64,
        label: Option<&str>,
    ) -> DeathCertificate {
        let now = now_secs();
        let expires_at = now.saturating_add(ttl_seconds);

        let cert = DeathCertificate {
            data_id: data_id.to_string(),
            scheduled_at: now,
            expires_at,
            ttl_seconds,
            label: label.map(|s| s.to_string()),
        };

        let record = DataRecord {
            expires_at,
            postpone_count: 0,
            label: label.map(|s| s.to_string()),
            reaped: false,
        };

        self.records.insert(data_id.to_string(), record);
        self.certificates.insert(data_id.to_string(), cert.clone());

        tracing::debug!(
            data_id,
            ttl_seconds,
            expires_at,
            "apoptosis: death scheduled"
        );

        cert
    }

    // ------------------------------------------------------------------
    // Status checks
    // ------------------------------------------------------------------

    /// Return `true` if `data_id` has passed its expiry or has been reaped.
    pub fn is_dead(&self, data_id: &str) -> bool {
        match self.records.get(data_id) {
            Some(r) => r.reaped || now_secs() >= r.expires_at,
            None => false, // unknown ID — not tracked
        }
    }

    /// Return `true` if `data_id` is still alive (scheduled but not yet expired).
    pub fn is_alive(&self, data_id: &str) -> bool {
        match self.records.get(data_id) {
            Some(r) => !r.reaped && now_secs() < r.expires_at,
            None => false,
        }
    }

    /// Seconds remaining before `data_id` expires. Returns 0 if dead/unknown.
    pub fn ttl_remaining(&self, data_id: &str) -> u64 {
        self.records
            .get(data_id)
            .filter(|r| !r.reaped)
            .map(|r| r.expires_at.saturating_sub(now_secs()))
            .unwrap_or(0)
    }

    // ------------------------------------------------------------------
    // Reaping
    // ------------------------------------------------------------------

    /// Reap all expired data items, marking them as dead and returning their IDs.
    ///
    /// Call this periodically (e.g., every 60 s) from a background task.
    /// Reaped items remain in the records map as tombstones for audit purposes
    /// but can no longer be postponed.
    pub fn reap_dead(&self) -> Vec<String> {
        let now = now_secs();
        let mut reaped = Vec::new();

        for mut entry in self.records.iter_mut() {
            if !entry.reaped && now >= entry.expires_at {
                entry.reaped = true;
                reaped.push(entry.key().clone());
                tracing::info!(data_id = %entry.key(), "apoptosis: reaped");
            }
        }

        reaped
    }

    /// Force-reap a single data item immediately, bypassing TTL.
    ///
    /// Used for explicit deletion requests (e.g., user data erasure under GDPR).
    pub fn force_reap(&self, data_id: &str) -> bool {
        if let Some(mut r) = self.records.get_mut(data_id) {
            if r.reaped {
                return false;
            }
            r.reaped = true;
            r.expires_at = now_secs(); // mark as expired
            tracing::info!(data_id, "apoptosis: force-reaped");
            return true;
        }
        false
    }

    // ------------------------------------------------------------------
    // Postponement
    // ------------------------------------------------------------------

    /// Extend the TTL of `data_id` by `extra_seconds`.
    ///
    /// Fails if:
    /// - `data_id` is unknown or already reaped.
    /// - The maximum postponement count (`MAX_POSTPONEMENTS`) has been reached.
    pub fn postpone(&self, data_id: &str, extra_seconds: u64) -> Result<()> {
        let mut record = self
            .records
            .get_mut(data_id)
            .ok_or_else(|| anyhow!("data_id '{}' not found", data_id))?;

        if record.reaped {
            return Err(anyhow!("data_id '{}' has already been reaped", data_id));
        }

        if record.postpone_count >= MAX_POSTPONEMENTS {
            return Err(anyhow!(
                "data_id '{}' has reached the maximum postponement limit ({})",
                data_id,
                MAX_POSTPONEMENTS
            ));
        }

        record.expires_at = record.expires_at.saturating_add(extra_seconds);
        record.postpone_count += 1;

        // Update the certificate's expires_at too.
        if let Some(mut cert) = self.certificates.get_mut(data_id) {
            cert.expires_at = record.expires_at;
        }

        tracing::debug!(
            data_id,
            extra_seconds,
            new_expires_at = record.expires_at,
            postpone_count = record.postpone_count,
            "apoptosis: death postponed"
        );

        Ok(())
    }

    // ------------------------------------------------------------------
    // Audit
    // ------------------------------------------------------------------

    /// Return the death certificate for `data_id`.
    pub fn certificate(&self, data_id: &str) -> Option<DeathCertificate> {
        self.certificates.get(data_id).map(|c| c.clone())
    }

    /// Return all death certificates (for compliance audit).
    pub fn all_certificates(&self) -> Vec<DeathCertificate> {
        self.certificates
            .iter()
            .map(|e| e.value().clone())
            .collect()
    }

    /// Count of tracked items (alive + dead tombstones).
    pub fn total_tracked(&self) -> usize {
        self.records.len()
    }

    /// Count of items that are currently alive.
    pub fn alive_count(&self) -> usize {
        let now = now_secs();
        self.records
            .iter()
            .filter(|e| !e.reaped && now < e.expires_at)
            .count()
    }
}

impl Default for Apoptosis {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_schedule_and_certificate() {
        let apo = Apoptosis::new();
        let cert = apo.schedule_death("token-001", 3600);
        assert_eq!(cert.data_id, "token-001");
        assert_eq!(cert.ttl_seconds, 3600);
        assert!(cert.expires_at > cert.scheduled_at);
    }

    #[test]
    fn test_is_alive_when_fresh() {
        let apo = Apoptosis::new();
        apo.schedule_death("session-a", 3600);
        assert!(apo.is_alive("session-a"));
        assert!(!apo.is_dead("session-a"));
    }

    #[test]
    fn test_is_dead_after_expiry() {
        let apo = Apoptosis::new();
        apo.schedule_death("session-b", 0); // expires immediately
        thread::sleep(Duration::from_millis(10));
        assert!(apo.is_dead("session-b"));
    }

    #[test]
    fn test_reap_dead_returns_expired_ids() {
        let apo = Apoptosis::new();
        apo.schedule_death("exp-1", 0);
        apo.schedule_death("exp-2", 0);
        apo.schedule_death("alive", 9999);
        thread::sleep(Duration::from_millis(10));
        let reaped = apo.reap_dead();
        assert!(reaped.contains(&"exp-1".to_string()));
        assert!(reaped.contains(&"exp-2".to_string()));
        assert!(!reaped.contains(&"alive".to_string()));
    }

    #[test]
    fn test_postpone_extends_ttl() {
        let apo = Apoptosis::new();
        apo.schedule_death("tok", 60);
        let before = apo.ttl_remaining("tok");
        apo.postpone("tok", 100).unwrap();
        let after = apo.ttl_remaining("tok");
        assert!(after >= before + 99); // allow 1s timing slack
    }

    #[test]
    fn test_postpone_max_limit() {
        let apo = Apoptosis::new();
        apo.schedule_death("limited", 3600);
        for _ in 0..MAX_POSTPONEMENTS {
            apo.postpone("limited", 10).unwrap();
        }
        assert!(apo.postpone("limited", 10).is_err());
    }

    #[test]
    fn test_force_reap() {
        let apo = Apoptosis::new();
        apo.schedule_death("force-me", 9999);
        assert!(apo.is_alive("force-me"));
        let ok = apo.force_reap("force-me");
        assert!(ok);
        assert!(apo.is_dead("force-me"));
    }

    #[test]
    fn test_postpone_reaped_fails() {
        let apo = Apoptosis::new();
        apo.schedule_death("gone", 0);
        thread::sleep(Duration::from_millis(10));
        apo.reap_dead();
        assert!(apo.postpone("gone", 100).is_err());
    }

    #[test]
    fn test_unknown_id_not_dead() {
        let apo = Apoptosis::new();
        // Unknown IDs return false from both is_dead and is_alive.
        assert!(!apo.is_dead("phantom"));
        assert!(!apo.is_alive("phantom"));
    }
}
