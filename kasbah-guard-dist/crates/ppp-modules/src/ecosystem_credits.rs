//! Module 2: Ecosystem Credit Ledger
//!
//! Nature metaphor: In a healthy ecosystem, organisms contribute and consume
//! resources in balance. Nutrient cycles, pollination, seed dispersal — each
//! actor earns "credit" by contributing to system health. Extractors who only
//! consume without contributing eventually collapse the ecosystem.
//!
//! Security application: A privacy-preserving incentive layer. Users earn
//! credits by submitting verified threat reports, participating in audits, or
//! maintaining clean sessions. Credits can be redeemed for elevated access
//! tiers, rate-limit waivers, or beta features — without any monetary exchange.
//! The ledger is in-memory with optional JSON export for persistence.

use anyhow::{anyhow, Result};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A single ledger transaction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditTransaction {
    pub tx_id: String,
    pub user_id: String,
    pub delta: i64,
    pub reason: String,
    pub timestamp: u64,
    pub tx_type: TxType,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TxType {
    Issue,
    Redeem,
    Transfer,
}

/// Running balance and totals for one user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditBalance {
    pub balance: i64,
    pub total_earned: i64,
    pub total_spent: i64,
    pub last_updated: u64,
}

impl CreditBalance {
    fn new() -> Self {
        Self {
            balance: 0,
            total_earned: 0,
            total_spent: 0,
            last_updated: now_secs(),
        }
    }
}

/// Hard floor — balances cannot go below this value.
const MIN_BALANCE: i64 = 0;

// ---------------------------------------------------------------------------
// EcosystemCreditLedger
// ---------------------------------------------------------------------------

pub struct EcosystemCreditLedger {
    balances: Arc<DashMap<String, CreditBalance>>,
    /// Full transaction history, append-only.
    history: Arc<parking_lot::RwLock<Vec<CreditTransaction>>>,
}

impl EcosystemCreditLedger {
    pub fn new() -> Self {
        Self {
            balances: Arc::new(DashMap::new()),
            history: Arc::new(parking_lot::RwLock::new(Vec::new())),
        }
    }

    // ------------------------------------------------------------------
    // Core operations
    // ------------------------------------------------------------------

    /// Issue `amount` credits to `user_id` with a human-readable `reason`.
    ///
    /// Returns the new balance.
    pub fn issue(&self, user_id: &str, amount: i64, reason: &str) -> Result<i64> {
        if amount <= 0 {
            return Err(anyhow!("issue amount must be positive, got {}", amount));
        }

        let new_balance = {
            let mut bal = self
                .balances
                .entry(user_id.to_string())
                .or_insert_with(CreditBalance::new);
            bal.balance += amount;
            bal.total_earned += amount;
            bal.last_updated = now_secs();
            bal.balance
        };

        self.append_tx(CreditTransaction {
            tx_id: new_tx_id(),
            user_id: user_id.to_string(),
            delta: amount,
            reason: reason.to_string(),
            timestamp: now_secs(),
            tx_type: TxType::Issue,
        });

        tracing::debug!(user_id, amount, new_balance, "ecosystem_credits: issued");
        Ok(new_balance)
    }

    /// Redeem `amount` credits from `user_id` for a named `purpose`.
    ///
    /// Fails if the user does not have sufficient balance.
    /// Returns the new balance.
    pub fn redeem(&self, user_id: &str, amount: i64, purpose: &str) -> Result<i64> {
        if amount <= 0 {
            return Err(anyhow!("redeem amount must be positive, got {}", amount));
        }

        let new_balance = {
            let mut bal = self
                .balances
                .entry(user_id.to_string())
                .or_insert_with(CreditBalance::new);

            if bal.balance < amount {
                return Err(anyhow!(
                    "insufficient credits: {} has {}, needs {}",
                    user_id,
                    bal.balance,
                    amount
                ));
            }

            bal.balance -= amount;
            if bal.balance < MIN_BALANCE {
                bal.balance = MIN_BALANCE;
            }
            bal.total_spent += amount;
            bal.last_updated = now_secs();
            bal.balance
        };

        self.append_tx(CreditTransaction {
            tx_id: new_tx_id(),
            user_id: user_id.to_string(),
            delta: -amount,
            reason: purpose.to_string(),
            timestamp: now_secs(),
            tx_type: TxType::Redeem,
        });

        tracing::debug!(user_id, amount, new_balance, "ecosystem_credits: redeemed");
        Ok(new_balance)
    }

    /// Transfer `amount` credits from `from` to `to`.
    ///
    /// Atomic: both sides succeed or neither is modified.
    pub fn transfer(&self, from: &str, to: &str, amount: i64) -> Result<()> {
        if from == to {
            return Err(anyhow!("cannot transfer to self"));
        }
        if amount <= 0 {
            return Err(anyhow!("transfer amount must be positive, got {}", amount));
        }

        // Check sender balance before mutating anything.
        {
            let bal = self
                .balances
                .entry(from.to_string())
                .or_insert_with(CreditBalance::new);
            if bal.balance < amount {
                return Err(anyhow!(
                    "transfer failed: {} has {}, needs {}",
                    from,
                    bal.balance,
                    amount
                ));
            }
        }

        // Debit sender.
        {
            let mut bal = self.balances.get_mut(from).unwrap();
            bal.balance -= amount;
            bal.total_spent += amount;
            bal.last_updated = now_secs();
        }

        // Credit recipient.
        {
            let mut bal = self
                .balances
                .entry(to.to_string())
                .or_insert_with(CreditBalance::new);
            bal.balance += amount;
            bal.total_earned += amount;
            bal.last_updated = now_secs();
        }

        let note = format!("transfer from {} to {}", from, to);
        self.append_tx(CreditTransaction {
            tx_id: new_tx_id(),
            user_id: from.to_string(),
            delta: -amount,
            reason: note.clone(),
            timestamp: now_secs(),
            tx_type: TxType::Transfer,
        });
        self.append_tx(CreditTransaction {
            tx_id: new_tx_id(),
            user_id: to.to_string(),
            delta: amount,
            reason: note,
            timestamp: now_secs(),
            tx_type: TxType::Transfer,
        });

        tracing::debug!(from, to, amount, "ecosystem_credits: transferred");
        Ok(())
    }

    // ------------------------------------------------------------------
    // Queries
    // ------------------------------------------------------------------

    /// Return the current credit balance for `user_id` (0 if unknown).
    pub fn balance(&self, user_id: &str) -> i64 {
        self.balances
            .get(user_id)
            .map(|b| b.balance)
            .unwrap_or(0)
    }

    /// Return a snapshot of the `CreditBalance` struct for `user_id`.
    pub fn balance_detail(&self, user_id: &str) -> CreditBalance {
        self.balances
            .get(user_id)
            .map(|b| b.clone())
            .unwrap_or_else(CreditBalance::new)
    }

    /// Return all transactions for `user_id` in chronological order.
    pub fn history(&self, user_id: &str) -> Vec<CreditTransaction> {
        self.history
            .read()
            .iter()
            .filter(|tx| tx.user_id == user_id)
            .cloned()
            .collect()
    }

    /// Export the complete ledger as JSON (all users, all transactions).
    pub fn export_ledger(&self) -> serde_json::Value {
        let balances: serde_json::Map<String, serde_json::Value> = self
            .balances
            .iter()
            .map(|entry| {
                (
                    entry.key().clone(),
                    serde_json::to_value(entry.value().clone()).unwrap_or(serde_json::Value::Null),
                )
            })
            .collect();

        let txs: Vec<serde_json::Value> = self
            .history
            .read()
            .iter()
            .map(|tx| serde_json::to_value(tx).unwrap_or(serde_json::Value::Null))
            .collect();

        serde_json::json!({
            "exported_at": now_secs(),
            "user_count": balances.len(),
            "transaction_count": txs.len(),
            "balances": balances,
            "transactions": txs,
        })
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    fn append_tx(&self, tx: CreditTransaction) {
        self.history.write().push(tx);
    }
}

impl Default for EcosystemCreditLedger {
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

fn new_tx_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    format!("tx-{}", COUNTER.fetch_add(1, Ordering::Relaxed))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_issue_and_balance() {
        let ledger = EcosystemCreditLedger::new();
        ledger.issue("alice", 100, "threat report").unwrap();
        assert_eq!(ledger.balance("alice"), 100);
    }

    #[test]
    fn test_redeem_success() {
        let ledger = EcosystemCreditLedger::new();
        ledger.issue("bob", 200, "audit participation").unwrap();
        ledger.redeem("bob", 50, "rate limit waiver").unwrap();
        assert_eq!(ledger.balance("bob"), 150);
    }

    #[test]
    fn test_redeem_insufficient() {
        let ledger = EcosystemCreditLedger::new();
        ledger.issue("carol", 10, "seed").unwrap();
        assert!(ledger.redeem("carol", 100, "overspend").is_err());
        assert_eq!(ledger.balance("carol"), 10); // unchanged
    }

    #[test]
    fn test_transfer() {
        let ledger = EcosystemCreditLedger::new();
        ledger.issue("alice", 100, "earned").unwrap();
        ledger.transfer("alice", "bob", 40).unwrap();
        assert_eq!(ledger.balance("alice"), 60);
        assert_eq!(ledger.balance("bob"), 40);
    }

    #[test]
    fn test_transfer_insufficient_fails() {
        let ledger = EcosystemCreditLedger::new();
        ledger.issue("alice", 10, "small").unwrap();
        assert!(ledger.transfer("alice", "bob", 50).is_err());
        assert_eq!(ledger.balance("alice"), 10); // unchanged
    }

    #[test]
    fn test_history_length() {
        let ledger = EcosystemCreditLedger::new();
        ledger.issue("dave", 100, "r1").unwrap();
        ledger.issue("dave", 50, "r2").unwrap();
        ledger.redeem("dave", 20, "p1").unwrap();
        let h = ledger.history("dave");
        assert_eq!(h.len(), 3);
    }

    #[test]
    fn test_export_ledger_keys() {
        let ledger = EcosystemCreditLedger::new();
        ledger.issue("eve", 777, "export test").unwrap();
        let exported = ledger.export_ledger();
        assert!(exported["balances"]["eve"].is_object());
        assert_eq!(exported["transaction_count"], 1);
    }
}
