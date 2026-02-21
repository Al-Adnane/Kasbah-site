use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use rand::Rng;
use hmac::{Hmac, Mac};
use base64::Engine;

type HmacSha256 = Hmac<Sha256>;
const TTL_MS: u64 = 5 * 60 * 1000;

pub fn now_ms() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
}

pub fn init_audit_db(path: &str) -> Connection {
    let conn = Connection::open(path).expect("Failed to open SQLite DB");
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts_ms INTEGER NOT NULL,
            kind TEXT NOT NULL,
            ticket_id TEXT,
            action TEXT,
            scope TEXT,
            decision TEXT,
            risk INTEGER,
            reason TEXT,
            content_hash TEXT,
            prev_hash TEXT NOT NULL,
            entry_hash TEXT NOT NULL,
            data TEXT
        );
        CREATE TABLE IF NOT EXISTS policies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pattern TEXT NOT NULL,
            action TEXT NOT NULL DEFAULT 'block',
            scope TEXT DEFAULT '*',
            created_ms INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS consumed_tickets (
            ticket_id TEXT PRIMARY KEY NOT NULL,
            consumed_ms INTEGER NOT NULL,
            action TEXT,
            scope TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts_ms DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_ticket ON audit(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_consumed_ms ON consumed_tickets(consumed_ms);",
    )
    .expect("Failed to create tables");
    conn
}
pub fn content_hash(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn create_ticket(
    signing_key: &[u8],
    action: &str,
    scope: &str,
    content_hash: &str,
    risk: u16,
) -> (String, String, u64) {
    let ticket_id = uuid::Uuid::new_v4().to_string();
    let nonce: u64 = rand::thread_rng().gen();
    let exp_ms = now_ms().saturating_add(TTL_MS);

    // Build claims payload
    let claims = format!(
        "{}|{}|{}|{}|{}|{}|{}",
        ticket_id, action, scope, content_hash, risk, exp_ms, nonce
    );

    // Sign with HMAC-SHA256
    let mut mac = HmacSha256::new_from_slice(signing_key).expect("HMAC key length");
    mac.update(claims.as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());

    // Ticket = claims.signature (like a JWT without base64 encoding)
    let claims_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(claims.as_bytes());
    let signed_ticket = format!("{}.{}", claims_b64, signature);

    (ticket_id, signed_ticket, exp_ms)
}

pub fn verify_ticket(signing_key: &[u8], signed_ticket: &str) -> Result<String, String> {
    let parts: Vec<&str> = signed_ticket.rsplitn(2, '.').collect();
    if parts.len() != 2 {
        return Err("Invalid ticket format".to_string());
    }
    let sig_hex = parts[0];
    let claims_b64 = parts[1];

    // Decode claims
    let claims_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(claims_b64)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    let claims = String::from_utf8(claims_bytes).map_err(|e| format!("UTF-8 error: {}", e))?;

    // Timing-safe HMAC verification using mac.verify_slice()
    // This uses constant-time comparison internally, preventing timing attacks
    let mut mac = HmacSha256::new_from_slice(signing_key).expect("HMAC key length");
    mac.update(claims.as_bytes());

    let sig_bytes = hex::decode(sig_hex).map_err(|e| format!("Hex decode error: {}", e))?;
    mac.verify_slice(&sig_bytes)
        .map_err(|_| "Invalid signature (timing-safe reject)".to_string())?;

    // Parse claims: ticket_id|action|scope|content_hash|risk|exp_ms|nonce
    let fields: Vec<&str> = claims.split('|').collect();
    if fields.len() < 7 {
        return Err(format!(
            "Malformed claims: expected 7 fields, got {}",
            fields.len()
        ));
    }

    let ticket_id = fields[0].to_string();
    let exp_ms: u64 = fields[5]
        .parse()
        .map_err(|_| "Invalid expiry in claims".to_string())?;

    // Expiry check
    if now_ms() > exp_ms {
        return Err("Ticket expired (cryptographic expiry)".to_string());
    }

    Ok(ticket_id)
}

fn get_last_hash(conn: &Connection) -> String {
    conn.query_row(
        "SELECT entry_hash FROM audit ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "GENESIS".to_string())
}

pub fn append_audit(
    conn: &Connection,
    kind: &str,
    ticket_id: Option<&str>,
    action: Option<&str>,
    scope: Option<&str>,
    decision: Option<&str>,
    risk: Option<u16>,
    reason: Option<&str>,
    c_hash: Option<&str>,
    data: Option<&str>,
) -> String {
    let ts = now_ms();
    let prev = get_last_hash(conn);

    // Hash chain: SHA-256(prev_hash || ts || kind || data)
    let payload = format!("{}|{}|{}|{}", prev, ts, kind, data.unwrap_or(""));
    let mut hasher = Sha256::new();
    hasher.update(payload.as_bytes());
    let entry_hash = hex::encode(hasher.finalize());

    conn.execute(
        "INSERT INTO audit (ts_ms, kind, ticket_id, action, scope, decision, risk, reason, content_hash, prev_hash, entry_hash, data)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            ts as i64,
            kind,
            ticket_id,
            action,
            scope,
            decision,
            risk.map(|r| r as i32),
            reason,
            c_hash,
            prev,
            entry_hash,
            data
        ],
    )
    .ok();

    entry_hash
}

