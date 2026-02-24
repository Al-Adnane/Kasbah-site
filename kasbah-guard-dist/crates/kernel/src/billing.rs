use rusqlite::{Connection, Result};
use uuid::Uuid;
use chrono::{Utc, Datelike};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AuthorityVerb {
    Scan = 0,
    Simulate = 0,
    Block = 1,
    Redact = 2,
    Quarantine = 2,
    Authorize = 3,
    Certify = 5,
    ExportProof = 5,
}

#[derive(Debug, Clone)]
pub struct TierLimits {
    pub free: i64,
    pub plus: i64,
    pub fortress: i64,
}

impl Default for TierLimits {
    fn default() -> Self {
        Self {
            free: 200,
            plus: 50_000,
            fortress: 1_000_000,
        }
    }
}

pub struct EconomicKernel {
    conn: Connection,
    limits: TierLimits,
}

impl EconomicKernel {
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        Self::init_db(&conn)?;
        Ok(Self {
            conn,
            limits: TierLimits::default(),
        })
    }

    fn init_db(conn: &Connection) -> Result<()> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS usage_ledger (
                user_id TEXT NOT NULL,
                month TEXT NOT NULL,
                tier TEXT NOT NULL DEFAULT 'FREE',
                units_used INTEGER DEFAULT 0,
                units_limit INTEGER NOT NULL,
                spend_ceiling REAL DEFAULT 0.0,
                overage_units INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, month)
            )",
            [],
        )?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS unit_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                verb TEXT NOT NULL,
                units_cost INTEGER NOT NULL,
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

    pub fn check_and_consume(
        &self,
        user_id: &str,
        verb: AuthorityVerb,
        receipt_hash: &str,
    ) -> Result<(bool, String)> {
        let verb_cost = verb as i64;
        if verb_cost == 0 {
            return Ok((true, "FREE_VERB".to_string()));
        }
        let month = self.get_current_month();
        let ledger = self.get_ledger(user_id, &month)?;
        let projected_total = ledger.units_used + verb_cost;
        if projected_total <= ledger.units_limit {
            self.record_usage(user_id, verb, verb_cost, receipt_hash, false)?;
            return Ok((true, "WITHIN_LIMIT".to_string()));
        }
        let overage_units = projected_total - ledger.units_limit;
        let projected_cost = overage_units as f64 * 0.01;
        if ledger.spend_ceiling > 0.0 && projected_cost > ledger.spend_ceiling {
            return Ok((false, "ECONOMIC_LIMIT_REACHED".to_string()));
        }
        self.record_usage(user_id, verb, verb_cost, receipt_hash, true)?;
        Ok((true, "OVERAGE_ALLOWED".to_string()))
    }

    fn get_ledger(&self, user_id: &str, month: &str) -> Result<LedgerEntry> {
        let mut stmt = self.conn.prepare(
            "SELECT user_id, month, tier, units_used, units_limit, spend_ceiling, overage_units FROM usage_ledger WHERE user_id = ? AND month = ?"
        )?;
        let entry = stmt.query_row([user_id, month], |row| {
            Ok(LedgerEntry {
                user_id: row.get(0)?,
                month: row.get(1)?,
                tier: row.get(2)?,
                units_used: row.get(3)?,
                units_limit: row.get(4)?,
                spend_ceiling: row.get(5)?,
                overage_units: row.get(6)?,
            })
        });
        match entry {
            Ok(e) => Ok(e),
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                let tier = "FREE";
                let limit = self.limits.free;
                self.conn.execute(
                    "INSERT INTO usage_ledger (user_id, month, tier, units_limit) VALUES (?, ?, ?, ?)",
                    [user_id, month, tier, &limit],
                )?;
                Ok(LedgerEntry {
                    user_id: user_id.to_string(),
                    month: month.to_string(),
                    tier: tier.to_string(),
                    units_used: 0,
                    units_limit: limit,
                    spend_ceiling: 0.0,
                    overage_units: 0,
                })
            }
            Err(e) => Err(e),
        }
    }

    fn record_usage(
        &self,
        user_id: &str,
        verb: AuthorityVerb,
        cost: i64,
        receipt_hash: &str,
        is_overage: bool,
    ) -> Result<()> {
        let month = self.get_current_month();
        let verb_name = format!("{:?}", verb);
        self.conn.execute(
            "INSERT INTO unit_transactions (user_id, verb, units_cost, receipt_hash) VALUES (?, ?, ?, ?)",
            [user_id, &verb_name, &cost, receipt_hash],
        )?;
        self.conn.execute(
            "INSERT INTO usage_ledger (user_id, month, units_used, overage_units, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id, month) DO UPDATE SET units_used = units_used + ?, overage_units = overage_units + ?, updated_at = CURRENT_TIMESTAMP",
            [user_id, &month, &cost, &(if is_overage { cost } else { 0 }), &cost, &(if is_overage { cost } else { 0 })],
        )?;
        Ok(())
    }

    pub fn set_spend_ceiling(&self, user_id: &str, ceiling: f64) -> Result<()> {
        let month = self.get_current_month();
        self.conn.execute(
            "INSERT INTO usage_ledger (user_id, month, spend_ceiling) VALUES (?, ?, ?) ON CONFLICT(user_id, month) DO UPDATE SET spend_ceiling = ?",
            [user_id, &month, &ceiling, &ceiling],
        )?;
        Ok(())
    }
}

#[derive(Debug)]
struct LedgerEntry {
    user_id: String,
    month: String,
    tier: String,
    units_used: i64,
    units_limit: i64,
    spend_ceiling: f64,
    overage_units: i64,
}
