use rusqlite::{Connection, Result};
use chrono::{Utc, Datelike};

/// Intervention level determines UX response to risk.
/// Silent = invisible, Warning = toast only, Block = modal.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum InterventionLevel {
    Silent,   // Risk < 30 → pass silently, no Guard cost
    Warning,  // Risk 30-70 → inline toast, no block, no Guard cost
    Block,    // Risk > 70 → modal + one-click override, costs 1 Guard
}

/// Map a risk score (0-100) to an intervention level.
pub fn decide_intervention(risk_score: u32) -> InterventionLevel {
    if risk_score < 30 {
        InterventionLevel::Silent
    } else if risk_score <= 70 {
        InterventionLevel::Warning
    } else {
        InterventionLevel::Block
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PlanType {
    Free,
    Plus,
    Team,
    Pro,
}

impl PlanType {
    pub fn as_str(&self) -> &'static str {
        match self {
            PlanType::Free => "Free",
            PlanType::Plus => "Plus",
            PlanType::Team => "Team",
            PlanType::Pro => "Pro",
        }
    }

    pub fn from_str(s: &str) -> PlanType {
        match s {
            "Plus" => PlanType::Plus,
            "Team" => PlanType::Team,
            "Pro" => PlanType::Pro,
            _ => PlanType::Free,
        }
    }

    pub fn default_limit(&self) -> i64 {
        match self {
            PlanType::Free => 50,
            PlanType::Plus => 500,
            PlanType::Team => 2500,
            PlanType::Pro => 10000,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Account {
    pub user_id: String,
    pub plan: PlanType,
    pub guards_used: i64,
    pub guards_limit: i64,
    pub month: String,
    pub sandbox_used: i64,
}

pub struct BillingKernel {
    conn: Connection,
}

impl BillingKernel {
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        Self::init_db(&conn)?;
        Ok(Self { conn })
    }

    fn init_db(conn: &Connection) -> Result<()> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS billing_accounts (
                user_id TEXT PRIMARY KEY,
                plan TEXT NOT NULL DEFAULT 'Free',
                guards_used INTEGER DEFAULT 0,
                guards_limit INTEGER NOT NULL,
                month TEXT NOT NULL,
                sandbox_used INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;
        // Add sandbox_used column if upgrading from older schema
        let _ = conn.execute(
            "ALTER TABLE billing_accounts ADD COLUMN sandbox_used INTEGER DEFAULT 0",
            [],
        );
        conn.execute(
            "CREATE TABLE IF NOT EXISTS guard_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                guards_cost INTEGER NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                receipt_hash TEXT NOT NULL
            )",
            [],
        )?;
        Ok(())
    }

    pub fn get_current_month(&self) -> String {
        let now = Utc::now();
        format!("{}-{:02}", now.year(), now.month())
    }

    pub fn get_account(&self, user_id: &str) -> Result<Account> {
        let month = self.get_current_month();
        let mut stmt = self.conn.prepare(
            "SELECT user_id, plan, guards_used, guards_limit, month, COALESCE(sandbox_used, 0) FROM billing_accounts WHERE user_id = ? AND month = ?"
        )?;

        let account = stmt.query_row([user_id, &month], |row| {
            Ok(Account {
                user_id: row.get(0)?,
                plan: PlanType::from_str(&row.get::<_, String>(1)?),
                guards_used: row.get(2)?,
                guards_limit: row.get(3)?,
                month: row.get(4)?,
                sandbox_used: row.get(5)?,
            })
        });

        match account {
            Ok(a) => Ok(a),
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                self.create_account(user_id, PlanType::Free)?;
                self.get_account(user_id)
            }
            Err(e) => Err(e),
        }
    }

    pub fn create_account(&self, user_id: &str, plan: PlanType) -> Result<()> {
        let month = self.get_current_month();
        let limit = plan.default_limit();
        self.conn.execute(
            "INSERT INTO billing_accounts (user_id, plan, guards_used, guards_limit, month, sandbox_used) VALUES (?, ?, 0, ?, ?, 0)",
            [user_id, plan.as_str(), &limit.to_string(), &month],
        )?;
        Ok(())
    }

    pub fn can_enforce(&self, user_id: &str) -> Result<bool> {
        let account = self.get_account(user_id)?;
        Ok(account.guards_used < account.guards_limit)
    }

    /// Returns true if user has exhausted all guards this month
    pub fn is_exhausted(&self, user_id: &str) -> Result<bool> {
        let account = self.get_account(user_id)?;
        Ok(account.guards_used >= account.guards_limit)
    }

    /// Sandbox: first 10 block-level interactions are "would-block" mode
    /// Returns (in_sandbox, sandbox_remaining)
    pub fn sandbox_status(&self, user_id: &str) -> Result<(bool, i64)> {
        let account = self.get_account(user_id)?;
        let sandbox_limit: i64 = 10;
        let remaining = sandbox_limit - account.sandbox_used;
        Ok((remaining > 0, remaining.max(0)))
    }

    /// Increment sandbox counter (called when a block-level event occurs during sandbox)
    pub fn consume_sandbox(&self, user_id: &str) -> Result<()> {
        let month = self.get_current_month();
        self.conn.execute(
            "UPDATE billing_accounts SET sandbox_used = sandbox_used + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND month = ?",
            [user_id, &month],
        )?;
        Ok(())
    }

    pub fn consume_guard(&self, user_id: &str, action: &str, receipt_hash: &str) -> Result<(bool, String)> {
        if !self.can_enforce(user_id)? {
            return Ok((false, "GUARDS_EXHAUSTED".to_string()));
        }

        let month = self.get_current_month();
        self.conn.execute(
            "INSERT INTO guard_transactions (user_id, action, guards_cost, receipt_hash) VALUES (?, ?, 1, ?)",
            [user_id, action, receipt_hash],
        )?;

        self.conn.execute(
            "UPDATE billing_accounts SET guards_used = guards_used + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND month = ?",
            [user_id, &month],
        )?;

        Ok((true, "GUARD_CONSUMED".to_string()))
    }

    /// Add guards to an account (credit packs / emergency pack)
    pub fn add_guards(&self, user_id: &str, amount: i64, reason: &str) -> Result<()> {
        let month = self.get_current_month();
        // Ensure account exists
        let _ = self.get_account(user_id)?;
        self.conn.execute(
            "UPDATE billing_accounts SET guards_limit = guards_limit + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND month = ?",
            [&amount.to_string(), user_id, &month],
        )?;
        // Log the transaction
        self.conn.execute(
            "INSERT INTO guard_transactions (user_id, action, guards_cost, receipt_hash) VALUES (?, ?, 0, ?)",
            [user_id, &format!("ADD_GUARDS:{}", amount), reason],
        )?;
        Ok(())
    }

    pub fn upgrade_to_pro(&self, user_id: &str) -> Result<()> {
        let month = self.get_current_month();
        self.conn.execute(
            "UPDATE billing_accounts SET plan = 'Pro', guards_limit = 10000 WHERE user_id = ? AND month = ?",
            [user_id, &month],
        )?;
        Ok(())
    }

    /// Upgrade to any plan
    pub fn upgrade_plan(&self, user_id: &str, plan: PlanType) -> Result<()> {
        let month = self.get_current_month();
        let limit = plan.default_limit();
        self.conn.execute(
            "UPDATE billing_accounts SET plan = ?, guards_limit = ? WHERE user_id = ? AND month = ?",
            [plan.as_str(), &limit.to_string(), user_id, &month],
        )?;
        Ok(())
    }

    pub fn get_usage(&self, user_id: &str) -> Result<(i64, i64)> {
        let account = self.get_account(user_id)?;
        Ok((account.guards_used, account.guards_limit))
    }

    /// Full account status for /billing/usage
    pub fn get_full_status(&self, user_id: &str) -> Result<Account> {
        self.get_account(user_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_free_account_creation() {
        let kernel = BillingKernel::new(":memory:").unwrap();
        kernel.create_account("user123", PlanType::Free).unwrap();
        let account = kernel.get_account("user123").unwrap();
        assert_eq!(account.plan, PlanType::Free);
        assert_eq!(account.guards_limit, 50);
    }

    #[test]
    fn test_guard_consumption() {
        let kernel = BillingKernel::new(":memory:").unwrap();
        kernel.create_account("user123", PlanType::Free).unwrap();

        for i in 0..50 {
            let (success, _) = kernel.consume_guard("user123", "BLOCK", &format!("hash{}", i)).unwrap();
            assert!(success);
        }

        let (success, reason) = kernel.consume_guard("user123", "BLOCK", "hash51").unwrap();
        assert!(!success);
        assert_eq!(reason, "GUARDS_EXHAUSTED");
    }

    #[test]
    fn test_pro_upgrade() {
        let kernel = BillingKernel::new(":memory:").unwrap();
        kernel.create_account("user123", PlanType::Free).unwrap();
        kernel.upgrade_to_pro("user123").unwrap();

        let account = kernel.get_account("user123").unwrap();
        assert_eq!(account.plan, PlanType::Pro);
        assert_eq!(account.guards_limit, 10000);
    }

    #[test]
    fn test_intervention_levels() {
        assert_eq!(decide_intervention(0), InterventionLevel::Silent);
        assert_eq!(decide_intervention(29), InterventionLevel::Silent);
        assert_eq!(decide_intervention(30), InterventionLevel::Warning);
        assert_eq!(decide_intervention(50), InterventionLevel::Warning);
        assert_eq!(decide_intervention(70), InterventionLevel::Warning);
        assert_eq!(decide_intervention(71), InterventionLevel::Block);
        assert_eq!(decide_intervention(100), InterventionLevel::Block);
    }

    #[test]
    fn test_sandbox_mode() {
        let kernel = BillingKernel::new(":memory:").unwrap();
        kernel.create_account("user123", PlanType::Free).unwrap();

        let (in_sandbox, remaining) = kernel.sandbox_status("user123").unwrap();
        assert!(in_sandbox);
        assert_eq!(remaining, 10);

        // Use 5 sandbox interactions
        for _ in 0..5 {
            kernel.consume_sandbox("user123").unwrap();
        }
        let (in_sandbox, remaining) = kernel.sandbox_status("user123").unwrap();
        assert!(in_sandbox);
        assert_eq!(remaining, 5);

        // Use all 10
        for _ in 0..5 {
            kernel.consume_sandbox("user123").unwrap();
        }
        let (in_sandbox, remaining) = kernel.sandbox_status("user123").unwrap();
        assert!(!in_sandbox);
        assert_eq!(remaining, 0);
    }

    #[test]
    fn test_add_guards_emergency_pack() {
        let kernel = BillingKernel::new(":memory:").unwrap();
        kernel.create_account("user123", PlanType::Free).unwrap();

        // Exhaust all 50 guards
        for i in 0..50 {
            kernel.consume_guard("user123", "BLOCK", &format!("h{}", i)).unwrap();
        }
        assert!(kernel.is_exhausted("user123").unwrap());

        // Add emergency pack (20 guards)
        kernel.add_guards("user123", 20, "emergency_pack").unwrap();
        assert!(!kernel.is_exhausted("user123").unwrap());

        let (used, limit) = kernel.get_usage("user123").unwrap();
        assert_eq!(used, 50);
        assert_eq!(limit, 70); // 50 original + 20 emergency
    }

    #[test]
    fn test_plan_tiers() {
        assert_eq!(PlanType::Free.default_limit(), 50);
        assert_eq!(PlanType::Plus.default_limit(), 500);
        assert_eq!(PlanType::Team.default_limit(), 2500);
        assert_eq!(PlanType::Pro.default_limit(), 10000);
    }

    #[test]
    fn test_upgrade_plan() {
        let kernel = BillingKernel::new(":memory:").unwrap();
        kernel.create_account("user123", PlanType::Free).unwrap();
        kernel.upgrade_plan("user123", PlanType::Plus).unwrap();

        let account = kernel.get_account("user123").unwrap();
        assert_eq!(account.plan, PlanType::Plus);
        assert_eq!(account.guards_limit, 500);
    }
}
