/// Kasbah Guard — The Sovereign Intent Layer
/// Local-first AI firewall with cryptographic tickets, SQLite audit chain,
/// and HMAC-SHA256 signed tokens.
use base64::Engine as _;
use dashmap::DashMap;
use hmac::{Hmac, Mac};
use rand::Rng;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

const PORT: u16 = 8788;
const TTL_MS: u64 = 120_000; // 2 minutes
const MAX_EVENTS_MEM: usize = 500;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ── Secret markers for pattern-based detection ──

/// Risk scoring with pattern detection

pub fn policy_preflight(text: &str) -> (u16, String, String) {
    let t = text;
    let lower = t.to_lowercase();
    let len = t.len().max(1) as f64;

    // --- Shannon entropy ---
    let mut freq = std::collections::HashMap::<u8, u32>::new();
    for b in t.as_bytes() {
        *freq.entry(*b).or_insert(0) += 1;
    }
    let mut entropy = 0.0_f64;
    for (_k, c) in freq.iter() {
        let p = (*c as f64) / len;
        entropy -= p * p.log2();
    }

    // --- Ratios ---
    let mut special = 0usize;
    let mut digits = 0usize;
    let mut upper = 0usize;
    for ch in t.chars() {
        if ch.is_ascii_digit() {
            digits += 1;
        }
        if ch.is_ascii_uppercase() {
            upper += 1;
        }
        if !(ch.is_ascii_alphanumeric() || ch.is_whitespace()) {
            special += 1;
        }
    }
    let special_ratio = (special as f64) / len;
    let digit_ratio = (digits as f64) / len;
    let upper_ratio = (upper as f64) / len;

    // --- Pattern detectors ---
    let has_private_key = t.contains("-----BEGIN") && t.contains("PRIVATE KEY-----");
    let has_openai_key = t.contains("sk-") && t.len() >= 14;
    let has_api_key_word =
        lower.contains("api-key") || lower.contains("apikey") || lower.contains("api_key");
    let has_password_assign =
        lower.contains("password=") || lower.contains("password:") || lower.contains("pwd=");
    let has_jwt = t.contains("eyJ") && t.matches('.').count() >= 2;
    let has_conn = lower.contains("mongodb://")
        || lower.contains("postgres://")
        || lower.contains("mysql://")
        || lower.contains("redis://")
        || lower.contains("amqp://");
    let has_url = lower.contains("http://") || lower.contains("https://");

    // base64-ish: long token of base64 chars
    let mut has_base64 = false;
    {
        let mut run = 0usize;
        for ch in t.chars() {
            let ok = ch.is_ascii_alphanumeric()
                || ch == '+'
                || ch == '/'
                || ch == '='
                || ch == '_'
                || ch == '-';
            if ok {
                run += 1;
            } else {
                run = 0;
            }
            if run >= 60 {
                has_base64 = true;
                break;
            }
        }
    }

    // suspicious ngrams / keywords
    let suspicious = [
        "secret",
        "token",
        "bearer",
        "credential",
        "private",
        "ssh",
        "pem",
        "apikey",
        "api-key",
        "inject",
        "bypass",
        "jailbreak",
        "override",
        "ignore previous",
        "system prompt",
        "developer message",
        "rm -rf",
        "drop table",
        "format c:",
        "powershell",
        "curl http",
        "wget http",
    ];
    let mut ngram_score = 0u32;
    for k in suspicious.iter() {
        if lower.contains(k) {
            ngram_score += 1;
        }
    }

    // keyword count (rough)
    let mut keyword_hits = 0u32;
    for k in [
        "secret",
        "password",
        "token",
        "api",
        "key",
        "auth",
        "credential",
        "private",
    ]
    .iter()
    {
        keyword_hits += lower.matches(k).count() as u32;
    }

    // --- Risk scoring (0..100-ish) ---
    let mut score: i32 = 0;
    let mut reasons: Vec<&'static str> = Vec::new();

    // Critical indicators
    if has_private_key {
        score += 90;
        reasons.push("private key detected");
    }
    if (has_openai_key || has_api_key_word) && entropy > 3.5 {
        score += 50;
        reasons.push("high-entropy API key");
    }
    if has_conn {
        score += 45;
        reasons.push("database connection string");
    }
    if has_jwt {
        score += 40;
        reasons.push("JWT token");
    }
    if has_password_assign {
        score += 35;
        reasons.push("password assignment");
    }

    // High indicators
    if has_base64 && entropy > 4.5 {
        score += 30;
        reasons.push("encoded high-entropy data");
    }
    if ngram_score >= 5 {
        score += 25;
        reasons.push("multiple secret/injection patterns");
    }
    if keyword_hits >= 5 {
        score += 20;
        reasons.push("many suspicious keywords");
    }

    // Medium indicators
    if entropy > 4.5 {
        score += 15;
        reasons.push("high entropy");
    }
    if digit_ratio > 0.40 {
        score += 10;
        reasons.push("high digit ratio");
    }
    if special_ratio > 0.30 {
        score += 10;
        reasons.push("unusual character distribution");
    }
    if upper_ratio > 0.25 {
        score += 5;
        reasons.push("high uppercase ratio");
    }
    if has_url && ngram_score > 0 {
        score += 10;
        reasons.push("url + suspicious keywords");
    }

    if score < 0 {
        score = 0;
    }
    if score > 100 {
        score = 100;
    }

    let risk = score as u16;

    // Decision mapping (keep your existing semantics)
    let (decision, reason) = if risk >= 85 {
        (
            "BLOCK".to_string(),
            format!(
                "Critical: {}",
                reasons.into_iter().take(3).collect::<Vec<_>>().join(", ")
            ),
        )
    } else if risk >= 60 {
        (
            "CHALLENGE".to_string(),
            format!(
                "High: {}",
                reasons.into_iter().take(3).collect::<Vec<_>>().join(", ")
            ),
        )
    } else if risk >= 30 {
        (
            "WARN".to_string(),
            format!(
                "Medium: {}",
                reasons.into_iter().take(3).collect::<Vec<_>>().join(", ")
            ),
        )
    } else {
        ("ALLOW".to_string(), "No issues".to_string())
    };

    (risk, decision, reason)
}

#[derive(Clone)]
struct Finding {
    ftype: &'static str,
    category: &'static str,
    preview: String,
    confidence: f32,
    severity: &'static str,
}

fn make_preview(s: &str, max_len: usize) -> String {
    let mut out = s.replace('\n', "\\n").replace('\r', "\\r");
    if out.len() > max_len {
        out.truncate(max_len);
        out.push_str("...");
    }
    out
}

fn policy_findings(text: &str) -> Vec<Finding> {
    let lower = text.to_lowercase();
    let mut out: Vec<Finding> = Vec::new();

    // Private key
    if text.contains("-----BEGIN") && text.contains("PRIVATE KEY-----") {
        out.push(Finding {
            ftype: "private_key",
            category: "secrets",
            preview: "-----BEGIN ... PRIVATE KEY-----".to_string(),
            confidence: 0.98,
            severity: "critical",
        });
    }

    // JWT (very loose)
    if text.contains("eyJ") && text.matches('.').count() >= 2 {
        out.push(Finding {
            ftype: "jwt",
            category: "secrets",
            preview: make_preview(text, 40),
            confidence: 0.90,
            severity: "high",
        });
    }

    // OpenAI-style key (loose)
    if text.contains("sk-") && text.len() >= 14 {
        out.push(Finding {
            ftype: "api_key",
            category: "secrets",
            preview: make_preview(text, 32),
            confidence: 0.82,
            severity: "high",
        });
    }

    // Connection strings
    for (pat, name) in [
        ("mongodb://", "mongodb_uri"),
        ("postgres://", "postgres_uri"),
        ("mysql://", "mysql_uri"),
        ("redis://", "redis_uri"),
        ("amqp://", "amqp_uri"),
    ] {
        if lower.contains(pat) {
            out.push(Finding {
                ftype: name,
                category: "secrets",
                preview: pat.to_string(),
                confidence: 0.88,
                severity: "high",
            });
        }
    }

    // Prompt injection / bypass terms
    let inj_terms = [
        "inject",
        "bypass",
        "jailbreak",
        "override",
        "ignore previous",
        "system prompt",
        "developer message",
    ];
    let mut hits = 0u32;
    for t in inj_terms.iter() {
        if lower.contains(t) {
            hits += 1;
        }
    }
    if hits >= 2 {
        out.push(Finding {
            ftype: "prompt_injection",
            category: "ai_security",
            preview: format!("{} terms hit", hits),
            confidence: 0.78,
            severity: "medium",
        });
    }

    out
}

fn redact_text(text: &str, findings: &Vec<Finding>) -> String {
    let mut out = text.to_string();

    // Redact by type (simple but real)
    for f in findings.iter() {
        match f.ftype {
            "private_key" => {
                // Replace full PEM block if present
                if let Some(a) = out.find("-----BEGIN") {
                    if let Some(rel) = out[a..].find("-----END") {
                        let b = a + rel;
                        // find end line terminator after END marker
                        let after_end = out[b..].find("-----").map(|x| b + x).unwrap_or(b);
                        // extend to end of line
                        let end_line = out[after_end..]
                            .find('\n')
                            .map(|x| after_end + x + 1)
                            .unwrap_or(out.len());
                        out.replace_range(a..end_line, "[REDACTED::PRIVATE_KEY]\n");
                    } else {
                        // fallback: blunt replace marker
                        out = out.replace("PRIVATE KEY-----", "[REDACTED::PRIVATE_KEY]");
                    }
                }
            }
            "jwt" => {
                // Replace Bearer token-like substrings
                out = out.replace("eyJ", "[REDACTED::JWT]eyJ");
            }
            "api_key" => {
                // Mask sk- prefix occurrences
                out = out.replace("sk-", "[REDACTED::API_KEY]sk-");
            }
            "mongodb_uri" => out = out.replace("mongodb://", "[REDACTED::MONGODB_URI]mongodb://"),
            "postgres_uri" => {
                out = out.replace("postgres://", "[REDACTED::POSTGRES_URI]postgres://")
            }
            "mysql_uri" => out = out.replace("mysql://", "[REDACTED::MYSQL_URI]mysql://"),
            "redis_uri" => out = out.replace("redis://", "[REDACTED::REDIS_URI]redis://"),
            "amqp_uri" => out = out.replace("amqp://", "[REDACTED::AMQP_URI]amqp://"),
            _ => {}
        }
    }

    out
}

// ── HMAC Ticket System ──

/// Load or generate a persistent signing key (32 bytes)
/// Key is stored at ~/Library/Application Support/KasbahGuard/signing.key
/// This ensures tickets survive app restarts.
fn load_or_create_signing_key(dir: &str) -> Vec<u8> {
    let key_path = format!("{}/signing.key", dir);

    // Try to load existing key
    if let Ok(existing) = std::fs::read(&key_path) {
        if existing.len() == 32 {
            eprintln!("[Kasbah Guard] Loaded existing signing key");
            return existing;
        }
    }

    // Generate new key
    let mut rng = rand::thread_rng();
    let mut key = vec![0u8; 32];
    rng.fill(&mut key[..]);

    // Persist to disk
    if let Err(e) = std::fs::write(&key_path, &key) {
        eprintln!(
            "[Kasbah Guard] Warning: could not persist signing key: {}",
            e
        );
    } else {
        // Set restrictive permissions (owner read/write only)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600));
        }
        eprintln!("[Kasbah Guard] Generated and persisted new signing key");
    }

    key
}

/// Create HMAC-SHA256 signed ticket with structured claims
fn create_ticket(
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

/// Verify HMAC-SHA256 ticket signature (timing-safe) + expiry check
fn verify_ticket(signing_key: &[u8], signed_ticket: &str) -> Result<String, String> {
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

/// Compute SHA-256 hash of content for action_hash
fn content_hash(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}

// ── SQLite Audit with Hash Chaining ──

fn init_db(path: &str) -> Connection {
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
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'owner',
            created_ms INTEGER NOT NULL,
            last_login_ms INTEGER
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY NOT NULL,
            user_id INTEGER NOT NULL,
            created_ms INTEGER NOT NULL,
            expires_ms INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS authority_bindings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            authority_type TEXT NOT NULL DEFAULT 'personal',
            scope_json TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'BOUND',
            bound_at_ms INTEGER NOT NULL,
            reclaimed_at_ms INTEGER,
            cert_hash TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts_ms DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_ticket ON audit(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_consumed_ms ON consumed_tickets(consumed_ms);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_ms);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);",
    )
    .expect("Failed to create tables");
    conn
}

// ── User authentication helpers ──
const SESSION_TTL_MS: u64 = 86_400_000 * 7; // 7 days

fn hash_password(password: &str, salt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("kasbah:{}:{}", salt, password).as_bytes());
    let round1 = hex::encode(hasher.finalize());
    // Double-hash for extra safety
    let mut hasher2 = Sha256::new();
    hasher2.update(format!("{}:{}", salt, round1).as_bytes());
    hex::encode(hasher2.finalize())
}

fn create_session_token(signing_key: &[u8], user_id: i64) -> (String, u64) {
    let nonce: u64 = rand::thread_rng().gen();
    let exp_ms = now_ms().saturating_add(SESSION_TTL_MS);
    let claims = format!("session|{}|{}|{}", user_id, exp_ms, nonce);
    let mut mac = HmacSha256::new_from_slice(signing_key).expect("HMAC key length");
    mac.update(claims.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());
    let claims_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(claims.as_bytes());
    (format!("{}.{}", claims_b64, sig), exp_ms)
}

fn verify_session_token(signing_key: &[u8], token: &str) -> Result<i64, String> {
    let parts: Vec<&str> = token.rsplitn(2, '.').collect();
    if parts.len() != 2 {
        return Err("Invalid session format".to_string());
    }
    let sig_hex = parts[0];
    let claims_b64 = parts[1];
    let claims_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(claims_b64)
        .map_err(|e| format!("decode: {}", e))?;
    let claims = String::from_utf8(claims_bytes).map_err(|e| format!("utf8: {}", e))?;
    let mut mac = HmacSha256::new_from_slice(signing_key).expect("HMAC key length");
    mac.update(claims.as_bytes());
    let sig_bytes = hex::decode(sig_hex).map_err(|e| format!("hex: {}", e))?;
    mac.verify_slice(&sig_bytes)
        .map_err(|_| "Invalid session signature".to_string())?;
    let fields: Vec<&str> = claims.split('|').collect();
    if fields.len() < 4 || fields[0] != "session" {
        return Err("Malformed session claims".to_string());
    }
    let user_id: i64 = fields[1].parse().map_err(|_| "Invalid user_id".to_string())?;
    let exp_ms: u64 = fields[2].parse().map_err(|_| "Invalid expiry".to_string())?;
    if now_ms() > exp_ms {
        return Err("Session expired".to_string());
    }
    Ok(user_id)
}

fn extract_bearer(req: &tiny_http::Request) -> Option<String> {
    req.headers()
        .iter()
        .find(|h| h.field.as_str().to_ascii_lowercase() == "authorization")
        .and_then(|h| {
            let val = h.value.as_str();
            if val.starts_with("Bearer ") || val.starts_with("bearer ") {
                Some(val[7..].to_string())
            } else {
                None
            }
        })
}

/// Load all consumed ticket IDs from SQLite into the DashMap on startup
fn load_consumed_tickets(conn: &Connection, tickets: &DashMap<String, TicketState>) -> usize {
    let cutoff = now_ms().saturating_sub(TTL_MS * 2); // Only load recent ones (within 2x TTL)
    let mut stmt = conn
        .prepare("SELECT ticket_id, action, scope FROM consumed_tickets WHERE consumed_ms > ?1")
        .unwrap();
    let mut count = 0;
    let rows = stmt
        .query_map(params![cutoff as i64], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .unwrap();
    for row in rows.flatten() {
        tickets.insert(
            row.0,
            TicketState {
                exp_ms: 0,
                consumed: true, // Already consumed
                action: row.1.unwrap_or_default(),
                scope: row.2.unwrap_or_default(),
                content_hash: String::new(),
                risk: 0,
                signed_ticket: String::new(),
            },
        );
        count += 1;
    }
    count
}

/// Persist a consumed ticket to SQLite for restart-proof replay protection
fn persist_consumed_ticket(conn: &Connection, ticket_id: &str, action: &str, scope: &str) {
    conn.execute(
        "INSERT OR IGNORE INTO consumed_tickets (ticket_id, consumed_ms, action, scope) VALUES (?1, ?2, ?3, ?4)",
        params![ticket_id, now_ms() as i64, action, scope],
    ).ok();
}

/// Prune expired consumed tickets from SQLite (housekeeping)
fn prune_consumed_tickets(conn: &Connection) -> usize {
    let cutoff = now_ms().saturating_sub(TTL_MS * 10); // Keep 10x TTL for safety
    conn.execute(
        "DELETE FROM consumed_tickets WHERE consumed_ms < ?1",
        params![cutoff as i64],
    )
    .unwrap_or(0)
}

fn get_last_hash(conn: &Connection) -> String {
    conn.query_row(
        "SELECT entry_hash FROM audit ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "GENESIS".to_string())
}

fn append_audit(
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

// ── In-memory state ──

#[allow(dead_code)]
struct TicketState {
    exp_ms: u64,
    consumed: bool,
    action: String,
    scope: String,
    content_hash: String,
    risk: u16,
    signed_ticket: String,
}

#[derive(Clone)]
struct MemEvent {
    ts_ms: u64,
    kind: String,
    data: serde_json::Value,
}

struct RateState {
    tokens: f64,
    last_ms: u64,
    strikes: u32,
    locked_until_ms: u64,
}

fn client_ip(req: &tiny_http::Request) -> String {
    req.headers()
        .iter()
        .find(|h| h.field.as_str().to_ascii_lowercase() == "x-forwarded-for")
        .map(|h| {
            h.value
                .as_str()
                .split(',')
                .next()
                .unwrap_or("local")
                .trim()
                .to_string()
        })
        .unwrap_or_else(|| "local".to_string())
}

fn rate_check(now: u64, st: &mut RateState) -> (bool, bool) {
    let capacity = 20.0_f64;
    let refill_per_ms = 5.0_f64 / 1000.0_f64;

    if st.locked_until_ms > now {
        return (false, true);
    }

    let dt = now.saturating_sub(st.last_ms) as f64;
    st.last_ms = now;
    st.tokens = (st.tokens + dt * refill_per_ms).min(capacity);

    if st.tokens >= 1.0 {
        st.tokens -= 1.0;
        st.strikes = st.strikes.saturating_sub(1);
        return (true, false);
    }

    st.strikes = st.strikes.saturating_add(1);
    if st.strikes >= 12 {
        st.locked_until_ms = now + 60_000;
        st.strikes = 0;
        return (false, true);
    }
    (false, false)
}

struct Stats {
    total: u32,
    allowed: u32,
    denied: u32,
    replay_blocked: u32,
    secrets_caught: u32,
    threats_blocked: u32,
    rate_limited: u32,
    locked_out: u32,
}

struct State {
    mem_events: std::collections::VecDeque<MemEvent>,
    stats: Stats,
    rate_map: DashMap<String, RateState>,

    kill_switch: bool,
}

fn read_body(req: &mut tiny_http::Request) -> String {
    let mut buf = String::new();
    let _ = std::io::Read::read_to_string(req.as_reader(), &mut buf);
    buf
}

fn cors_headers() -> Vec<tiny_http::Header> {
    vec![
        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap(),
        tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
        tiny_http::Header::from_bytes(
            &b"Access-Control-Allow-Methods"[..],
            &b"GET, POST, DELETE, OPTIONS"[..],
        )
        .unwrap(),
        tiny_http::Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..])
            .unwrap(),
    ]
}

fn respond(req: tiny_http::Request, status: u16, body: &str) {
    let data = body.as_bytes().to_vec();
    let len = data.len();
    let cursor = std::io::Cursor::new(data);
    let resp = tiny_http::Response::new(
        tiny_http::StatusCode(status),
        cors_headers(),
        cursor,
        Some(len),
        None,
    );
    let _ = req.respond(resp);
}

fn kill_switch_path(db_dir: &str) -> String {
    format!("{}/kill_switch.json", db_dir)
}

fn load_kill_switch(db_dir: &str) -> bool {
    let p = kill_switch_path(db_dir);
    if let Ok(s) = std::fs::read_to_string(&p) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
            return v.get("enabled").and_then(|x| x.as_bool()).unwrap_or(false);
        }
    }
    false
}

fn save_kill_switch(db_dir: &str, enabled: bool) {
    let p = kill_switch_path(db_dir);
    let _ = std::fs::write(
        &p,
        serde_json::json!({"enabled": enabled, "ts_ms": now_ms()}).to_string(),
    );
}

pub fn spawn_guard_service() {
    thread::spawn(|| {
        let server = match tiny_http::Server::http(format!("127.0.0.1:{}", PORT)) {
            Ok(s) => s,
            Err(_) => return,
        };

        // Initialize data directory
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        let db_dir = format!("{}/Library/Application Support/KasbahGuard", home);
        let _ = std::fs::create_dir_all(&db_dir);

        // Load or generate persistent signing key (survives restarts)
        let signing_key = load_or_create_signing_key(&db_dir);

        // Initialize SQLite audit database
        let db_path = format!("{}/audit.db", db_dir);
        let db = Arc::new(Mutex::new(init_db(&db_path)));

        // DashMap for fast ticket lookups (replay protection)
        let tickets: Arc<DashMap<String, TicketState>> = Arc::new(DashMap::new());

        // Load consumed tickets from SQLite (restart-proof replay protection)
        let loaded_count = {
            let db_lock = db.lock().unwrap();
            load_consumed_tickets(&db_lock, &tickets)
        };

        // In-memory state for fast reads
        let state = Arc::new(Mutex::new(State {
            mem_events: std::collections::VecDeque::new(),
            stats: Stats {
                total: 0,
                allowed: 0,
                denied: 0,
                replay_blocked: 0,
                secrets_caught: 0,
                threats_blocked: 0,
                rate_limited: 0,
                locked_out: 0,
            },
            rate_map: DashMap::new(),
            kill_switch: load_kill_switch(&db_dir),
        }));

        // Prune old consumed tickets periodically
        {
            let db_lock = db.lock().unwrap();
            let pruned = prune_consumed_tickets(&db_lock);
            if pruned > 0 {
                eprintln!("[Kasbah Guard] Pruned {} expired consumed tickets", pruned);
            }
        }

        // Log startup
        {
            let db_lock = db.lock().unwrap();
            append_audit(
                &db_lock,
                "STARTUP",
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(
                    &serde_json::json!({
                        "port": PORT,
                        "replay_tickets_loaded": loaded_count,
                        "version": "0.3.0"
                    })
                    .to_string(),
                ),
            );
        }
        {
            let mut s = state.lock().unwrap();
            s.mem_events.push_front(MemEvent {
                ts_ms: now_ms(),
                kind: "STARTUP".to_string(),
                data: serde_json::json!({
                    "message": "Kasbah Guard started",
                    "port": PORT,
                    "replay_tickets_loaded": loaded_count
                }),
            });
        }

        let mut request_count: u64 = 0;

        for mut request in server.incoming_requests() {
            let url = request.url().to_string();
            let method = request.method().as_str().to_uppercase();

            // Bypass rate limiting for health/stats (debug + UI)
            let url_path_for_rl = url.split('?').next().unwrap_or(&url);
            if url_path_for_rl == "/health"
                || url_path_for_rl == "/stats"
                || url_path_for_rl == "/preflight"
                || url_path_for_rl == "/redact"
            {
                // continue without rate checks
            } else {
                let now = now_ms();
                let ip = client_ip(&request);
                let (allowed_rate, locked) = {
                    let mut st = state.lock().unwrap();
                    let mut entry = st.rate_map.entry(ip).or_insert(RateState {
                        tokens: 20.0,
                        last_ms: now,
                        strikes: 0,
                        locked_until_ms: 0,
                    });
                    rate_check(now, &mut *entry)
                };
                if !allowed_rate {
                    {
                        let mut st = state.lock().unwrap();
                        if locked {
                            st.stats.locked_out += 1;
                        } else {
                            st.stats.rate_limited += 1;
                        }
                    }
                    let payload = serde_json::json!({
                        "ok": false,
                        "error": if locked { "locked_out" } else { "rate_limited" },
                        "ts_ms": now
                    })
                    .to_string();
                    respond(request, 429, &payload);
                    continue;
                }
            }

            // Periodic DashMap cleanup: prune expired tickets every 100 requests
            request_count += 1;
            if request_count % 100 == 0 {
                let now = now_ms();
                let expired_keys: Vec<String> = tickets
                    .iter()
                    .filter(|entry| {
                        let v = entry.value();
                        let expired = v.exp_ms > 0 && now > v.exp_ms + TTL_MS;
                        // Remove consumed+expired AND unconsumed+expired tickets
                        expired
                    })
                    .map(|entry| entry.key().clone())
                    .collect();
                for key in &expired_keys {
                    tickets.remove(key);
                }
                if !expired_keys.is_empty() {
                    eprintln!(
                        "[Kasbah Guard] Pruned {} expired tickets from memory",
                        expired_keys.len()
                    );
                }

                // Also prune SQLite consumed_tickets periodically
                if request_count % 500 == 0 {
                    let db_lock = db.lock().unwrap();
                    prune_consumed_tickets(&db_lock);
                }
            }

            if method == "OPTIONS" {
                respond(request, 200, "{}");
                continue;
            }

            let sk = signing_key.clone();
            let tk = Arc::clone(&tickets);
            let st = Arc::clone(&state);
            let dbc = Arc::clone(&db);

            // Route: audit/export must be checked before /audit
            let url_path = url.split('?').next().unwrap_or(&url);
            match (method.as_str(), url_path) {
                ("OPTIONS", "/preflight") => {
                    respond(request, 200, "{}");
                }

                ("OPTIONS", "/redact") => {
                    respond(request, 200, "{}");
                }
                ("POST", "/redact") => {
                    // Kill switch: fail-closed
                    {
                        let mut s = st.lock().unwrap();
                        if s.kill_switch {
                            // Stats accounting (local, consistent)
                            {
                                let mut s = st.lock().unwrap();
                                s.stats.total += 1;
                            }

                            respond(
                                request,
                                200,
                                &serde_json::json!({
                                    "decision": "BLOCK",
                                    "reason": "Kill switch enabled",
                                    "risk": 100
                                })
                                .to_string(),
                            );
                            continue;
                        }
                    }

                    let body = read_body(&mut request);
                    let v: serde_json::Value =
                        serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
                    let text = v.get("text").and_then(|x| x.as_str()).unwrap_or("");
                    eprintln!("KASBAH_PREFLIGHT_CALL");
                    let (risk, decision, reason) = policy_preflight(text);
                    {
                        let mut s = st.lock().unwrap();
                        if decision == "ALLOW" {
                            s.stats.allowed += 1;
                        } else {
                            s.stats.denied += 1;
                        }
                    }

                    let findings = policy_findings(text);
                    let redacted = redact_text(text, &findings);

                    let out = serde_json::json!({
                        "risk": risk,
                        "decision": decision,
                        "reason": reason,
                        "redacted_text": redacted,
                        "findings": findings.iter().map(|f| {
                            serde_json::json!({
                                "type": f.ftype,
                                "category": f.category,
                                "preview": f.preview,
                                "confidence": f.confidence,
                                "severity": f.severity
                            })
                        }).collect::<Vec<_>>()
                    })
                    .to_string();

                    respond(request, 200, &out);
                }
                ("POST", "/preflight") => {
                    // Kill switch: fail-closed
                    {
                        let mut s = st.lock().unwrap();
                        if s.kill_switch {
                            // Stats accounting (local, consistent)
                            {
                                let mut s = st.lock().unwrap();
                                s.stats.total += 1;
                            }

                            respond(
                                request,
                                200,
                                &serde_json::json!({
                                    "decision": "BLOCK",
                                    "reason": "Kill switch enabled",
                                    "risk": 100
                                })
                                .to_string(),
                            );
                            continue;
                        }
                    }

                    let body = read_body(&mut request);
                    let v: serde_json::Value =
                        serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
                    let text = v.get("text").and_then(|x| x.as_str()).unwrap_or("");
                    eprintln!("KASBAH_PREFLIGHT_CALL");
                    let (risk, decision, reason) = policy_preflight(text);
                    {
                        let mut s = st.lock().unwrap();
                        if decision == "ALLOW" {
                            s.stats.allowed += 1;
                        } else {
                            s.stats.denied += 1;
                        }
                    }

                    let out = serde_json::json!({
                        "risk": risk,
                        "decision": decision,
                        "reason": reason
                    })
                    .to_string();
                    respond(request, 200, &out);
                }

                ("GET", "/health") => {
                    let payload = serde_json::json!({
                        "ok": true,
                        "service": "kasbah-guard",
                                "build": "0.3.0",
                                "features": ["hmac", "sqlite", "tickets"],
                        "version": "0.3.0",
                        "port": PORT,
                        "ts_ms": now_ms()
                    })
                    .to_string();
                    respond(request, 200, &payload);
                }

                // ── Health check with stats ──
                ("GET", "/status") => {
                    let mut s = st.lock().unwrap();
                    let consumed_count = tk.len();
                    let body = serde_json::json!({
                        "ok": true,
                        "service": "kasbah-guard",
                                "build": "0.3.0",
                                "features": ["hmac", "sqlite", "tickets"],
                        "version": "0.3.0",
                        "port": PORT,
                        "ts_ms": now_ms(),
                        "crypto": "hmac-sha256",
                        "audit": "sqlite-hash-chain",
                        "replay_protection": "sqlite-persisted",
                        "onnx": "rule-engine-v1",
                        "active_tickets": consumed_count,
                        "stats": {
                            "total": s.stats.total,
                            "allowed": s.stats.allowed,
                            "denied": s.stats.denied,
                            "replay_blocked": s.stats.replay_blocked,
                            "secrets_caught": s.stats.secrets_caught,
                            "threats_blocked": s.stats.threats_blocked
                        }
                    });
                    respond(request, 200, &body.to_string());
                }

                // ── Issue HMAC-signed ticket with risk assessment ──
                ("POST", "/decide") => {
                    let raw = read_body(&mut request);
                    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&raw);

                    match parsed {
                        Ok(req_val) => {
                            let action = req_val
                                .get("action")
                                .and_then(|v| v.as_str())
                                .unwrap_or("unknown")
                                .to_string();
                            let scope = req_val
                                .get("product")
                                .and_then(|v| v.as_str())
                                .unwrap_or("web")
                                .to_string();
                            let preview = req_val
                                .get("meta")
                                .and_then(|m| m.get("preview"))
                                .and_then(|p| p.as_str())
                                .unwrap_or("");
                            let verb = req_val
                                .get("verb")
                                .and_then(|v| v.as_str())
                                .unwrap_or("send");

                            let c_hash = content_hash(preview);
                            let (mut risk, mut preflight_decision, mut reason) =
                                policy_preflight(preview);

                            // Check custom policies from SQLite
                            {
                                let db_lock = dbc.lock().unwrap();
                                let mut stmt = db_lock
                                    .prepare("SELECT pattern, action FROM policies")
                                    .unwrap();
                                let policies: Vec<(String, String)> = stmt
                                    .query_map([], |row| {
                                        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                                    })
                                    .unwrap()
                                    .filter_map(|r| r.ok())
                                    .collect();

                                let lower = preview.to_lowercase();
                                let mut has_block_policy = false;
                                for (pattern, action) in &policies {
                                    if lower.contains(&pattern.to_lowercase()) {
                                        risk = risk.max(70);
                                        if action == "block" {
                                            preflight_decision = "DENY".to_string();
                                            risk = risk.max(95);
                                            has_block_policy = true;
                                        } else if action == "warn" && !has_block_policy {
                                            preflight_decision = "CHALLENGE".to_string();
                                            risk = risk.max(80);
                                        }
                                        reason = format!("{}; Policy match: {}", reason, pattern);
                                    }
                                }
                            }

                            let client_secrets = req_val
                                .get("meta")
                                .and_then(|m| m.get("secrets"))
                                .and_then(|s| s.as_array())
                                .map(|a| a.len())
                                .unwrap_or(0);

                            // Create HMAC-signed ticket
                            let (ticket_id, signed_ticket, exp_ms) =
                                create_ticket(&sk, &action, &scope, &c_hash, risk);

                            // Store in DashMap
                            tk.insert(
                                ticket_id.clone(),
                                TicketState {
                                    exp_ms,
                                    consumed: false,
                                    action: action.clone(),
                                    scope: scope.clone(),
                                    content_hash: c_hash.clone(),
                                    risk,
                                    signed_ticket: signed_ticket.clone(),
                                },
                            );

                            // Audit
                            {
                                let db_lock = dbc.lock().unwrap();
                                append_audit(
                                    &db_lock,
                                    "DECIDE",
                                    Some(&ticket_id),
                                    Some(&action),
                                    Some(&scope),
                                    Some(&preflight_decision),
                                    Some(risk),
                                    Some(&reason),
                                    Some(&c_hash),
                                    Some(
                                        &serde_json::json!({
                                            "verb": verb,
                                            "secrets": client_secrets
                                        })
                                        .to_string(),
                                    ),
                                );
                            }

                            // Memory events — use SERVER-detected markers for stats (not client-supplied)
                            let server_secrets_found =
                                !policy_preflight(preview).2.contains("No issues");
                            {
                                let mut s = st.lock().unwrap();
                                if server_secrets_found
                                    && reason.to_lowercase().contains("sensitive")
                                {
                                    s.stats.secrets_caught += 1;
                                }
                                if risk >= 85 {
                                    s.stats.threats_blocked += 1;
                                }
                                s.mem_events.push_front(MemEvent {
                                    ts_ms: now_ms(),
                                    kind: "DECIDE".to_string(),
                                    data: serde_json::json!({
                                        "ticket": &ticket_id,
                                        "risk": risk,
                                        "preflight": &preflight_decision,
                                        "reason": &reason,
                                        "secrets": client_secrets,
                                        "verb": verb
                                    }),
                                });
                                while s.mem_events.len() > MAX_EVENTS_MEM {
                                    s.mem_events.pop_back();
                                }
                            }

                            // If preflight is DENY (block policy matched), return immediate denial
                            if preflight_decision == "DENY" {
                                {
                                    let mut s = st.lock().unwrap();
                                    s.stats.total += 1;
                                    s.stats.denied += 1;
                                    s.stats.threats_blocked += 1;
                                }
                                let res = serde_json::json!({
                                    "ok": true,
                                    "decision": "DENY",
                                    "blocked": true,
                                    "risk": risk,
                                    "preflight": "DENY",
                                    "reason": reason,
                                    "content_hash": c_hash,
                                    "verb": verb
                                });
                                respond(request, 200, &res.to_string());
                            } else {
                                let res = serde_json::json!({
                                    "ok": true,
                                    "decision": "PENDING",
                                    "ticket": signed_ticket,
                                    "ticket_id": ticket_id,
                                    "exp_ms": exp_ms,
                                    "risk": risk,
                                    "preflight": preflight_decision,
                                    "reason": reason,
                                    "content_hash": c_hash,
                                    "verb": verb
                                });
                                respond(request, 200, &res.to_string());
                            }
                        }
                        Err(_) => {
                            respond(request, 400, r#"{"ok":false,"error":"invalid JSON"}"#);
                        }
                    }
                }

                // ── Consume ticket (single-use, HMAC-verified, replay-protected) ──
                ("POST", "/consume") => {
                    let raw = read_body(&mut request);
                    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&raw);

                    match parsed {
                        Ok(req_val) => {
                            let ticket_raw = req_val
                                .get("ticket")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let choice = req_val
                                .get("choice")
                                .and_then(|v| v.as_str())
                                .unwrap_or("DENY")
                                .to_uppercase();

                            // Verify HMAC signature — ALL tickets must be signed
                            let ticket_id = match verify_ticket(&sk, &ticket_raw) {
                                Ok(id) => id,
                                Err(e) => {
                                    let mut s = st.lock().unwrap();
                                    s.stats.total += 1;
                                    s.stats.denied += 1;
                                    let res = serde_json::json!({
                                        "ok": true,
                                        "decision": "DENY",
                                        "reason": format!("ticket verification failed: {}", e)
                                    });
                                    respond(request, 200, &res.to_string());
                                    continue;
                                }
                            };

                            let mut decision = "DENY".to_string();
                            let mut reason = String::new();
                            //                             let mut reason = "default deny".to_string();

                            if let Some(mut entry) = tk.get_mut(&ticket_id) {
                                let now = now_ms();
                                let mut s = st.lock().unwrap();
                                s.stats.total += 1;

                                if now > entry.exp_ms && entry.exp_ms > 0 {
                                    reason = "expired ticket".to_string();
                                    s.stats.denied += 1;
                                } else if entry.consumed {
                                    reason = "replay blocked".to_string();
                                    s.stats.replay_blocked += 1;
                                    s.stats.denied += 1;
                                } else {
                                    entry.consumed = true;
                                    // Persist consumed state to SQLite for restart-proof replay protection
                                    {
                                        let db_lock = dbc.lock().unwrap();
                                        persist_consumed_ticket(
                                            &db_lock,
                                            &ticket_id,
                                            &entry.action,
                                            &entry.scope,
                                        );
                                    }
                                    // Auto-deny high-risk actions regardless of user choice
                                    if entry.risk >= 90 {
                                        decision = "DENY".to_string();
                                        reason = format!("auto-blocked: risk {} exceeds safety threshold", entry.risk);
                                        s.stats.denied += 1;
                                        s.stats.threats_blocked += 1;
                                    } else if choice == "ALLOW" {
                                        decision = "ALLOW".to_string();
                                        reason = "user allowed".to_string();
                                        s.stats.allowed += 1;
                                    } else {
                                        reason = "user blocked".to_string();
                                        s.stats.denied += 1;
                                    }
                                }

                                s.mem_events.push_front(MemEvent {
                                    ts_ms: now_ms(),
                                    kind: "CONSUME".to_string(),
                                    data: serde_json::json!({
                                        "ticket": &ticket_id,
                                        "decision": &decision,
                                        "reason": &reason,
                                        "choice": &choice
                                    }),
                                });
                                while s.mem_events.len() > MAX_EVENTS_MEM {
                                    s.mem_events.pop_back();
                                }
                            } else {
                                let mut s = st.lock().unwrap();
                                s.stats.total += 1;
                                s.stats.denied += 1;
                                reason = "unknown ticket".to_string();
                            }

                            // Audit
                            {
                                let db_lock = dbc.lock().unwrap();
                                append_audit(
                                    &db_lock,
                                    "CONSUME",
                                    Some(&ticket_id),
                                    None,
                                    None,
                                    Some(&decision),
                                    None,
                                    Some(&reason),
                                    None,
                                    Some(&serde_json::json!({"choice": &choice}).to_string()),
                                );
                            }

                            let res = serde_json::json!({
                                "ok": true,
                                "decision": decision,
                                "reason": reason
                            });
                            respond(request, 200, &res.to_string());
                        }
                        Err(_) => {
                            respond(request, 400, r#"{"ok":false,"error":"invalid JSON"}"#);
                        }
                    }
                }

                // ── Audit log (from SQLite, with hash chain verification) ──
                ("GET", "/audit") => {
                    let limit = url
                        .split("limit=")
                        .nth(1)
                        .and_then(|s| s.split('&').next())
                        .and_then(|s| s.parse::<i64>().ok())
                        .unwrap_or(100);

                    let db_lock = dbc.lock().unwrap();
                    let mut stmt = db_lock
                        .prepare(
                            "SELECT id, ts_ms, kind, ticket_id, action, scope, decision, risk, reason, content_hash, prev_hash, entry_hash, data
                             FROM audit ORDER BY id DESC LIMIT ?1",
                        )
                        .unwrap();

                    let rows: Vec<serde_json::Value> = stmt
                        .query_map(params![limit], |row| {
                            Ok(serde_json::json!({
                                "id": row.get::<_, i64>(0)?,
                                "ts_ms": row.get::<_, i64>(1)?,
                                "kind": row.get::<_, String>(2)?,
                                "ticket_id": row.get::<_, Option<String>>(3)?,
                                "action": row.get::<_, Option<String>>(4)?,
                                "scope": row.get::<_, Option<String>>(5)?,
                                "decision": row.get::<_, Option<String>>(6)?,
                                "risk": row.get::<_, Option<i32>>(7)?,
                                "reason": row.get::<_, Option<String>>(8)?,
                                "content_hash": row.get::<_, Option<String>>(9)?,
                                "prev_hash": row.get::<_, String>(10)?,
                                "entry_hash": row.get::<_, String>(11)?,
                                "data": row.get::<_, Option<String>>(12)?
                            }))
                        })
                        .unwrap()
                        .filter_map(|r| r.ok())
                        .collect();

                    let body = serde_json::json!({
                        "ok": true,
                        "entries": rows,
                        "count": rows.len(),
                        "chain_start": "GENESIS"
                    });
                    respond(request, 200, &body.to_string());
                }

                // ── POST /events — log extension events ──
                ("POST", "/events") => {
                    let raw = read_body(&mut request);
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                        let kind = val
                            .get("kind")
                            .and_then(|v| v.as_str())
                            .unwrap_or("EXT_EVENT");
                        let mut s = st.lock().unwrap();
                        s.mem_events.push_front(MemEvent {
                            ts_ms: now_ms(),
                            kind: kind.to_string(),
                            data: val.clone(),
                        });
                        while s.mem_events.len() > MAX_EVENTS_MEM {
                            s.mem_events.pop_back();
                        }
                    }
                    respond(request, 200, r#"{"ok":true}"#);
                }

                // ── In-memory event stream (fast, no DB hit) ──
                ("GET", "/events") => {
                    let mut s = st.lock().unwrap();
                    let events: Vec<serde_json::Value> = s
                        .mem_events
                        .iter()
                        .map(|e| {
                            serde_json::json!({
                                "ts_ms": e.ts_ms,
                                "kind": e.kind,
                                "data": e.data
                            })
                        })
                        .collect();
                    respond(
                        request,
                        200,
                        &serde_json::to_string(&events).unwrap_or_else(|_| "[]".to_string()),
                    );
                }

                // ── Self-test cases (local, deterministic) ──
                ("GET", "/selftest/cases") => {
                    let body = serde_json::json!({
                        "ok": true,
                        "cases": [
                            {"name":"harmless","text":"hello world, summarize this paragraph"},
                            {"name":"fake_api_key","text":"sk_live_1234567890_FAKE_DO_NOT_USE"},
                            {"name":"jwt","text":"Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiYWRtaW4ifQ.sgn"},
                            {"name":"private_key","text":"-----BEGIN PRIVATE KEY-----\nMIIE...fake...\n-----END PRIVATE KEY-----\n"}
                        ]
                    });
                    respond(request, 200, &body.to_string());
                }

                ("POST", "/selftest/run") => {
                    let cases = vec![
                        ("harmless", "hello world, summarize this paragraph"),
                        ("fake_api_key", "sk_live_1234567890_FAKE_DO_NOT_USE"),
                        ("jwt", "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiYWRtaW4ifQ.sgn"),
                        ("private_key", "-----BEGIN PRIVATE KEY-----\nMIIE...fake...\n-----END PRIVATE KEY-----\n"),
                    ];

                    let mut results: Vec<serde_json::Value> = Vec::new();
                    for (name, text) in cases {
                        eprintln!("KASBAH_PREFLIGHT_CALL");
                    let (risk, decision, reason) = policy_preflight(text);
                        {
                            let mut s = st.lock().unwrap();
                            if decision == "ALLOW" {
                                s.stats.allowed += 1;
                            } else {
                                s.stats.denied += 1;
                            }
                        }

                        let findings = policy_findings(text);
                        let redacted = redact_text(text, &findings);

                        results.push(serde_json::json!({
                            "name": name,
                            "risk": risk,
                            "decision": decision,
                            "reason": reason,
                            "findings_count": findings.len(),
                            "redacted_preview": make_preview(&redacted, 180)
                        }));
                    }

                    {
                        let mut s = st.lock().unwrap();
                        s.mem_events.push_front(MemEvent {
                            ts_ms: now_ms(),
                            kind: "SELFTEST".to_string(),
                            data: serde_json::json!({"count": results.len()}),
                        });
                        while s.mem_events.len() > MAX_EVENTS_MEM {
                            s.mem_events.pop_back();
                        }
                    }

                    respond(
                        request,
                        200,
                        &serde_json::json!({"ok": true, "results": results}).to_string(),
                    );
                }

                // ── Stats endpoint ──
                ("GET", "/stats") => {
                    let mut s = st.lock().unwrap();
                    let body = serde_json::json!({
                        "total": s.stats.total,
                        "allowed": s.stats.allowed,
                        "denied": s.stats.denied,
                        "replay_blocked": s.stats.replay_blocked,
                        "secrets_caught": s.stats.secrets_caught,
                        "threats_blocked": s.stats.threats_blocked,
                        "rate_limited": s.stats.rate_limited,
                        "locked_out": s.stats.locked_out
                    });
                    respond(request, 200, &body.to_string());
                }

                // ── Kill switch (persisted) ──
                ("POST", "/kill_switch") => {
                    let raw = read_body(&mut request);
                    let enabled = serde_json::from_str::<serde_json::Value>(&raw)
                        .ok()
                        .and_then(|v| v.get("enabled").and_then(|x| x.as_bool()))
                        .unwrap_or(false);

                    {
                        let mut s = st.lock().unwrap();
                        s.kill_switch = enabled;
                        s.mem_events.push_front(MemEvent {
                            ts_ms: now_ms(),
                            kind: "KILL_SWITCH".to_string(),
                            data: serde_json::json!({"enabled": enabled}),
                        });
                        while s.mem_events.len() > MAX_EVENTS_MEM {
                            s.mem_events.pop_back();
                        }
                    }
                    save_kill_switch(&db_dir, enabled);

                    respond(
                        request,
                        200,
                        &serde_json::json!({"ok": true, "enabled": enabled}).to_string(),
                    );
                }

                // ── Policy management ──
                ("GET", "/policies") => {
                    let db_lock = dbc.lock().unwrap();
                    let mut stmt = db_lock
                        .prepare("SELECT id, pattern, action, scope, created_ms FROM policies ORDER BY id DESC")
                        .unwrap();
                    let rows: Vec<serde_json::Value> = stmt
                        .query_map([], |row| {
                            Ok(serde_json::json!({
                                "id": row.get::<_, i64>(0)?,
                                "pattern": row.get::<_, String>(1)?,
                                "action": row.get::<_, String>(2)?,
                                "scope": row.get::<_, String>(3)?,
                                "created_ms": row.get::<_, i64>(4)?
                            }))
                        })
                        .unwrap()
                        .filter_map(|r| r.ok())
                        .collect();
                    respond(
                        request,
                        200,
                        &serde_json::json!({"ok": true, "policies": rows}).to_string(),
                    );
                }

                ("POST", "/policies") => {
                    let raw = read_body(&mut request);
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                        let pattern = val.get("pattern").and_then(|v| v.as_str()).unwrap_or("");
                        let action = val
                            .get("action")
                            .and_then(|v| v.as_str())
                            .unwrap_or("block");
                        let scope = val.get("scope").and_then(|v| v.as_str()).unwrap_or("*");

                        if pattern.is_empty() {
                            respond(request, 400, r#"{"ok":false,"error":"pattern required"}"#);
                        } else {
                            let db_lock = dbc.lock().unwrap();
                            db_lock.execute(
                                "INSERT INTO policies (pattern, action, scope, created_ms) VALUES (?1, ?2, ?3, ?4)",
                                params![pattern, action, scope, now_ms() as i64],
                            ).ok();
                            respond(request, 200, r#"{"ok":true}"#);
                        }
                    } else {
                        respond(request, 400, r#"{"ok":false,"error":"invalid JSON"}"#);
                    }
                }

                ("DELETE", _) if url_path.starts_with("/policies/") => {
                    let id_str = url_path.trim_start_matches("/policies/");
                    if let Ok(id) = id_str.parse::<i64>() {
                        let db_lock = dbc.lock().unwrap();
                        db_lock
                            .execute("DELETE FROM policies WHERE id = ?1", params![id])
                            .ok();
                        respond(request, 200, r#"{"ok":true}"#);
                    } else {
                        respond(request, 400, r#"{"ok":false,"error":"invalid id"}"#);
                    }
                }

                // ── Audit chain verification ──
                ("GET", "/audit/verify") => {
                    let db_lock = dbc.lock().unwrap();
                    let mut stmt = db_lock
                        .prepare("SELECT id, ts_ms, kind, data, prev_hash, entry_hash FROM audit ORDER BY id ASC")
                        .unwrap();

                    let rows: Vec<(i64, i64, String, Option<String>, String, String)> = stmt
                        .query_map([], |row| {
                            Ok((
                                row.get::<_, i64>(0)?,
                                row.get::<_, i64>(1)?,
                                row.get::<_, String>(2)?,
                                row.get::<_, Option<String>>(3)?,
                                row.get::<_, String>(4)?,
                                row.get::<_, String>(5)?,
                            ))
                        })
                        .unwrap()
                        .filter_map(|r| r.ok())
                        .collect();

                    let total = rows.len();
                    let mut valid = 0;
                    let mut first_broken: Option<i64> = None;
                    let mut expected_prev = "GENESIS".to_string();

                    for (id, ts, kind, data, prev_hash, entry_hash) in &rows {
                        // Verify prev_hash links correctly
                        if prev_hash != &expected_prev {
                            if first_broken.is_none() {
                                first_broken = Some(*id);
                            }
                        } else {
                            // Verify entry_hash = SHA-256(prev_hash || ts || kind || data)
                            let payload = format!(
                                "{}|{}|{}|{}",
                                prev_hash,
                                ts,
                                kind,
                                data.as_deref().unwrap_or("")
                            );
                            let mut hasher = Sha256::new();
                            hasher.update(payload.as_bytes());
                            let computed = hex::encode(hasher.finalize());
                            if &computed == entry_hash {
                                valid += 1;
                            } else if first_broken.is_none() {
                                first_broken = Some(*id);
                            }
                        }
                        expected_prev = entry_hash.clone();
                    }

                    let integrity = if valid == total { "INTACT" } else { "BROKEN" };
                    let body = serde_json::json!({
                        "ok": true,
                        "integrity": integrity,
                        "total_entries": total,
                        "valid_entries": valid,
                        "chain_start": "GENESIS",
                        "chain_head": rows.last().map(|r| r.5.clone()).unwrap_or_else(|| "GENESIS".to_string()),
                        "first_broken_id": first_broken,
                        "verified_at_ms": now_ms()
                    });
                    respond(request, 200, &body.to_string());
                }

                // ── ONNX-style classify endpoint (rule-engine-v1 + custom policies) ──
                ("POST", "/classify") => {
                    let raw = read_body(&mut request);
                    match serde_json::from_str::<serde_json::Value>(&raw) {
                        Ok(val) => {
                            let text = val.get("text").and_then(|v| v.as_str()).unwrap_or("");

                            // Run pattern-based classification
                            eprintln!("KASBAH_PREFLIGHT_CALL");
                    let (risk, decision, reason) = policy_preflight(text);
                            {
                                let mut s = st.lock().unwrap();
                                if decision == "ALLOW" {
                                    s.stats.allowed += 1;
                                } else {
                                    s.stats.denied += 1;
                                }
                            }

                            // Also check custom policies from SQLite
                            let mut policy_matches = Vec::new();
                            {
                                let db_lock = dbc.lock().unwrap();
                                let mut stmt = db_lock
                                    .prepare("SELECT id, pattern, action, scope FROM policies")
                                    .unwrap();
                                let policies: Vec<(i64, String, String, String)> = stmt
                                    .query_map([], |row| {
                                        Ok((
                                            row.get::<_, i64>(0)?,
                                            row.get::<_, String>(1)?,
                                            row.get::<_, String>(2)?,
                                            row.get::<_, String>(3)?,
                                        ))
                                    })
                                    .unwrap()
                                    .filter_map(|r| r.ok())
                                    .collect();

                                let lower = text.to_lowercase();
                                for (id, pattern, action, scope) in policies {
                                    if lower.contains(&pattern.to_lowercase()) {
                                        policy_matches.push(serde_json::json!({
                                            "policy_id": id,
                                            "pattern": pattern,
                                            "action": action,
                                            "scope": scope
                                        }));
                                    }
                                }
                            }

                            // PII detection — character-level scanning (no regex crate needed)
                            let mut pii_found = Vec::new();
                            let chars: Vec<char> = text.chars().collect();
                            let tlen = chars.len();

                            // Email: look for pattern like word@word.word
                            if text.contains('@') {
                                let at_pos = text.find('@').unwrap();
                                let before = &text[..at_pos];
                                let after = &text[at_pos + 1..];
                                if before.len() >= 2
                                    && before
                                        .chars()
                                        .last()
                                        .map(|c| {
                                            c.is_alphanumeric() || c == '.' || c == '_' || c == '-'
                                        })
                                        .unwrap_or(false)
                                    && after.contains('.')
                                    && after.len() >= 4
                                {
                                    pii_found.push("email");
                                }
                            }

                            // Phone: 10+ consecutive digits (with optional separators)
                            {
                                let digits_and_seps: String = text
                                    .chars()
                                    .filter(|c| {
                                        c.is_ascii_digit()
                                            || *c == '-'
                                            || *c == '.'
                                            || *c == ' '
                                            || *c == '('
                                            || *c == ')'
                                    })
                                    .collect();
                                let digit_count = digits_and_seps
                                    .chars()
                                    .filter(|c| c.is_ascii_digit())
                                    .count();
                                if digit_count >= 10
                                    && digit_count <= 15
                                    && (text.contains('-')
                                        || text.contains('(')
                                        || text.contains(' '))
                                {
                                    pii_found.push("phone");
                                }
                            }

                            // SSN: pattern NNN-NN-NNNN
                            {
                                let mut i = 0;
                                while i + 10 < tlen {
                                    if chars[i].is_ascii_digit()
                                        && chars[i + 1].is_ascii_digit()
                                        && chars[i + 2].is_ascii_digit()
                                        && chars[i + 3] == '-'
                                        && chars[i + 4].is_ascii_digit()
                                        && chars[i + 5].is_ascii_digit()
                                        && chars[i + 6] == '-'
                                        && chars[i + 7].is_ascii_digit()
                                        && chars[i + 8].is_ascii_digit()
                                        && chars[i + 9].is_ascii_digit()
                                        && chars[i + 10].is_ascii_digit()
                                    {
                                        pii_found.push("ssn");
                                        break;
                                    }
                                    i += 1;
                                }
                            }

                            // Credit card: 4 groups of 4 digits separated by spaces or dashes
                            {
                                let mut i = 0;
                                while i + 18 < tlen {
                                    let is_cc = (0..4).all(|j| chars[i + j].is_ascii_digit())
                                        && (chars[i + 4] == ' ' || chars[i + 4] == '-')
                                        && (0..4).all(|j| chars[i + 5 + j].is_ascii_digit())
                                        && (chars[i + 9] == ' ' || chars[i + 9] == '-')
                                        && (0..4).all(|j| chars[i + 10 + j].is_ascii_digit())
                                        && (chars[i + 14] == ' ' || chars[i + 14] == '-')
                                        && (0..4).all(|j| chars[i + 15 + j].is_ascii_digit());
                                    if is_cc {
                                        pii_found.push("credit_card");
                                        break;
                                    }
                                    i += 1;
                                }
                                // Also check 16 consecutive digits
                                if !pii_found.contains(&"credit_card") {
                                    let just_digits: String =
                                        text.chars().filter(|c| c.is_ascii_digit()).collect();
                                    if just_digits.len() >= 16 {
                                        // Check if there's a run of 16 digits
                                        let mut run = 0;
                                        for c in text.chars() {
                                            if c.is_ascii_digit() {
                                                run += 1;
                                                if run >= 16 {
                                                    pii_found.push("credit_card");
                                                    break;
                                                }
                                            } else {
                                                run = 0;
                                            }
                                        }
                                    }
                                }
                            }

                            // IP address: N.N.N.N where each N is 1-3 digits
                            {
                                let parts: Vec<&str> = text
                                    .split(|c: char| !c.is_ascii_digit() && c != '.')
                                    .collect();
                                for part in parts {
                                    let octets: Vec<&str> = part.split('.').collect();
                                    if octets.len() == 4 {
                                        let valid = octets.iter().all(|o| {
                                            o.len() >= 1
                                                && o.len() <= 3
                                                && o.parse::<u16>()
                                                    .map(|n| n <= 255)
                                                    .unwrap_or(false)
                                        });
                                        if valid {
                                            // Exclude common non-IP patterns like version numbers
                                            let first: u16 = octets[0].parse().unwrap_or(0);
                                            if first > 0 && first != 127
                                                || octets
                                                    .iter()
                                                    .any(|o| o.parse::<u16>().unwrap_or(0) > 0)
                                            {
                                                pii_found.push("ip_address");
                                                break;
                                            }
                                        }
                                    }
                                }
                            }

                            // Intent classification
                            let intent = if text.contains("rm -rf")
                                || text.contains("drop table")
                                || text.contains("format c:")
                            {
                                "destructive"
                            } else if text.contains("password")
                                || text.contains("secret")
                                || text.contains("api_key")
                                || text.contains("token")
                            {
                                "credential_exposure"
                            } else if text.contains("http://")
                                || text.contains("https://")
                                || text.contains("ftp://")
                            {
                                "url_sharing"
                            } else if text.len() > 5000 {
                                "bulk_data"
                            } else {
                                "benign"
                            };

                            let final_risk = if !policy_matches.is_empty() {
                                risk.max(70) // Custom policy match bumps minimum risk
                            } else {
                                risk
                            };

                            let body = serde_json::json!({
                                "ok": true,
                                "engine": "rule-engine-v1",
                                "risk": final_risk,
                                "decision": decision,
                                "reason": reason,
                                "intent": intent,
                                "pii_detected": pii_found,
                                "policy_matches": policy_matches,
                                "content_hash": content_hash(text),
                                "text_length": text.len()
                            });
                            respond(request, 200, &body.to_string());
                        }
                        Err(_) => {
                            respond(request, 400, r#"{"ok":false,"error":"invalid JSON"}"#);
                        }
                    }
                }

                // ── Auth: Register ──
                ("POST", "/auth/register") => {
                    let raw = read_body(&mut request);
                    match serde_json::from_str::<serde_json::Value>(&raw) {
                        Ok(val) => {
                            let email = val.get("email").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase();
                            let name = val.get("name").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                            let password = val.get("password").and_then(|v| v.as_str()).unwrap_or("");

                            if email.is_empty() || !email.contains('@') {
                                respond(request, 400, r#"{"ok":false,"error":"Valid email required"}"#);
                                continue;
                            }
                            if password.len() < 6 {
                                respond(request, 400, r#"{"ok":false,"error":"Password must be at least 6 characters"}"#);
                                continue;
                            }
                            let display_name = if name.is_empty() { email.split('@').next().unwrap_or("User").to_string() } else { name };

                            let salt = hex::encode(rand::thread_rng().gen::<[u8; 16]>());
                            let pw_hash = hash_password(password, &salt);

                            let db_lock = dbc.lock().unwrap();
                            // Check if user already exists
                            let exists: bool = db_lock.query_row(
                                "SELECT COUNT(*) FROM users WHERE email = ?1",
                                params![email],
                                |row| row.get::<_, i64>(0),
                            ).unwrap_or(0) > 0;

                            if exists {
                                respond(request, 409, r#"{"ok":false,"error":"Account already exists. Please sign in."}"#);
                                continue;
                            }

                            match db_lock.execute(
                                "INSERT INTO users (email, display_name, password_hash, salt, role, created_ms) VALUES (?1, ?2, ?3, ?4, 'owner', ?5)",
                                params![email, display_name, pw_hash, salt, now_ms() as i64],
                            ) {
                                Ok(_) => {
                                    let user_id = db_lock.last_insert_rowid();
                                    let (token, exp_ms) = create_session_token(&sk, user_id);
                                    db_lock.execute(
                                        "INSERT INTO sessions (token, user_id, created_ms, expires_ms) VALUES (?1, ?2, ?3, ?4)",
                                        params![token, user_id, now_ms() as i64, exp_ms as i64],
                                    ).ok();

                                    // Log registration
                                    append_audit(&db_lock, "AUTH_REGISTER", None, None, None, Some("OK"), None, None, None,
                                        Some(&serde_json::json!({"user_id": user_id, "email": email}).to_string()));

                                    let res = serde_json::json!({
                                        "ok": true,
                                        "token": token,
                                        "user": {
                                            "id": user_id,
                                            "email": email,
                                            "name": display_name,
                                            "role": "owner"
                                        }
                                    });
                                    respond(request, 200, &res.to_string());
                                }
                                Err(e) => {
                                    respond(request, 500, &serde_json::json!({"ok":false,"error":format!("{}", e)}).to_string());
                                }
                            }
                        }
                        Err(_) => {
                            respond(request, 400, r#"{"ok":false,"error":"invalid JSON"}"#);
                        }
                    }
                }

                // ── Auth: Login ──
                ("POST", "/auth/login") => {
                    let raw = read_body(&mut request);
                    match serde_json::from_str::<serde_json::Value>(&raw) {
                        Ok(val) => {
                            let email = val.get("email").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase();
                            let password = val.get("password").and_then(|v| v.as_str()).unwrap_or("");

                            let db_lock = dbc.lock().unwrap();
                            let user = db_lock.query_row(
                                "SELECT id, display_name, password_hash, salt, role FROM users WHERE email = ?1",
                                params![email],
                                |row| Ok((
                                    row.get::<_, i64>(0)?,
                                    row.get::<_, String>(1)?,
                                    row.get::<_, String>(2)?,
                                    row.get::<_, String>(3)?,
                                    row.get::<_, String>(4)?,
                                )),
                            );

                            match user {
                                Ok((user_id, name, stored_hash, salt, role)) => {
                                    let attempt_hash = hash_password(password, &salt);
                                    if attempt_hash != stored_hash {
                                        respond(request, 401, r#"{"ok":false,"error":"Invalid credentials"}"#);
                                        continue;
                                    }
                                    // Update last login
                                    db_lock.execute("UPDATE users SET last_login_ms = ?1 WHERE id = ?2",
                                        params![now_ms() as i64, user_id]).ok();

                                    let (token, exp_ms) = create_session_token(&sk, user_id);
                                    db_lock.execute(
                                        "INSERT INTO sessions (token, user_id, created_ms, expires_ms) VALUES (?1, ?2, ?3, ?4)",
                                        params![token, user_id, now_ms() as i64, exp_ms as i64],
                                    ).ok();

                                    append_audit(&db_lock, "AUTH_LOGIN", None, None, None, Some("OK"), None, None, None,
                                        Some(&serde_json::json!({"user_id": user_id}).to_string()));

                                    let res = serde_json::json!({
                                        "ok": true,
                                        "token": token,
                                        "user": {
                                            "id": user_id,
                                            "email": email,
                                            "name": name,
                                            "role": role
                                        }
                                    });
                                    respond(request, 200, &res.to_string());
                                }
                                Err(_) => {
                                    respond(request, 401, r#"{"ok":false,"error":"Invalid credentials"}"#);
                                }
                            }
                        }
                        Err(_) => {
                            respond(request, 400, r#"{"ok":false,"error":"invalid JSON"}"#);
                        }
                    }
                }

                // ── Auth: Session check ──
                ("GET", "/auth/me") => {
                    let token = extract_bearer(&request);
                    match token {
                        Some(t) => {
                            match verify_session_token(&sk, &t) {
                                Ok(user_id) => {
                                    let db_lock = dbc.lock().unwrap();
                                    let user = db_lock.query_row(
                                        "SELECT email, display_name, role, created_ms, last_login_ms FROM users WHERE id = ?1",
                                        params![user_id],
                                        |row| Ok((
                                            row.get::<_, String>(0)?,
                                            row.get::<_, String>(1)?,
                                            row.get::<_, String>(2)?,
                                            row.get::<_, i64>(3)?,
                                            row.get::<_, Option<i64>>(4)?,
                                        )),
                                    );
                                    match user {
                                        Ok((email, name, role, created, last_login)) => {
                                            // Get active authority binding
                                            let binding = db_lock.query_row(
                                                "SELECT id, authority_type, scope_json, status, bound_at_ms, cert_hash FROM authority_bindings WHERE user_id = ?1 AND status = 'BOUND' ORDER BY id DESC LIMIT 1",
                                                params![user_id],
                                                |row| Ok(serde_json::json!({
                                                    "id": row.get::<_, i64>(0)?,
                                                    "authority_type": row.get::<_, String>(1)?,
                                                    "scope": row.get::<_, String>(2)?,
                                                    "status": row.get::<_, String>(3)?,
                                                    "bound_at_ms": row.get::<_, i64>(4)?,
                                                    "cert_hash": row.get::<_, String>(5)?
                                                })),
                                            ).ok();

                                            let res = serde_json::json!({
                                                "ok": true,
                                                "user": {
                                                    "id": user_id,
                                                    "email": email,
                                                    "name": name,
                                                    "role": role,
                                                    "created_ms": created,
                                                    "last_login_ms": last_login
                                                },
                                                "authority": binding
                                            });
                                            respond(request, 200, &res.to_string());
                                        }
                                        Err(_) => {
                                            respond(request, 401, r#"{"ok":false,"error":"User not found"}"#);
                                        }
                                    }
                                }
                                Err(e) => {
                                    respond(request, 401, &serde_json::json!({"ok":false,"error":e}).to_string());
                                }
                            }
                        }
                        None => {
                            respond(request, 401, r#"{"ok":false,"error":"No auth token"}"#);
                        }
                    }
                }

                // ── Auth: Logout ──
                ("POST", "/auth/logout") => {
                    if let Some(t) = extract_bearer(&request) {
                        let db_lock = dbc.lock().unwrap();
                        db_lock.execute("DELETE FROM sessions WHERE token = ?1", params![t]).ok();
                    }
                    respond(request, 200, r#"{"ok":true}"#);
                }

                // ── Authority: Bind ──
                ("POST", "/authority/bind") => {
                    let token = extract_bearer(&request);
                    let user_id = token.and_then(|t| verify_session_token(&sk, &t).ok());
                    match user_id {
                        Some(uid) => {
                            let raw = read_body(&mut request);
                            let val: serde_json::Value = serde_json::from_str(&raw).unwrap_or(serde_json::json!({}));
                            let auth_type = val.get("authority_type").and_then(|v| v.as_str()).unwrap_or("personal");
                            let scope = val.get("scope").unwrap_or(&serde_json::json!({})).to_string();

                            // Generate cert hash
                            let cert_payload = format!("{}|{}|{}|{}|{}", uid, auth_type, scope, now_ms(), rand::thread_rng().gen::<u64>());
                            let cert_hash = content_hash(&cert_payload);

                            let db_lock = dbc.lock().unwrap();
                            // Reclaim any existing bindings
                            db_lock.execute(
                                "UPDATE authority_bindings SET status = 'SUPERSEDED', reclaimed_at_ms = ?1 WHERE user_id = ?2 AND status = 'BOUND'",
                                params![now_ms() as i64, uid],
                            ).ok();

                            db_lock.execute(
                                "INSERT INTO authority_bindings (user_id, authority_type, scope_json, status, bound_at_ms, cert_hash) VALUES (?1, ?2, ?3, 'BOUND', ?4, ?5)",
                                params![uid, auth_type, scope, now_ms() as i64, cert_hash],
                            ).ok();

                            let binding_id = db_lock.last_insert_rowid();
                            append_audit(&db_lock, "AUTHORITY_BIND", None, None, None, Some("BOUND"), None, None, None,
                                Some(&serde_json::json!({"user_id": uid, "binding_id": binding_id, "type": auth_type, "cert_hash": &cert_hash}).to_string()));

                            {
                                let mut s = st.lock().unwrap();
                                s.mem_events.push_front(MemEvent {
                                    ts_ms: now_ms(),
                                    kind: "AUTHORITY_BIND".to_string(),
                                    data: serde_json::json!({"user_id": uid, "type": auth_type, "cert_hash": &cert_hash[..16]}),
                                });
                            }

                            respond(request, 200, &serde_json::json!({
                                "ok": true,
                                "binding_id": binding_id,
                                "cert_hash": cert_hash,
                                "status": "BOUND"
                            }).to_string());
                        }
                        None => {
                            respond(request, 401, r#"{"ok":false,"error":"Authentication required"}"#);
                        }
                    }
                }

                // ── Authority: Reclaim ──
                ("POST", "/authority/reclaim") => {
                    let token = extract_bearer(&request);
                    let user_id = token.and_then(|t| verify_session_token(&sk, &t).ok());
                    match user_id {
                        Some(uid) => {
                            let db_lock = dbc.lock().unwrap();
                            let updated = db_lock.execute(
                                "UPDATE authority_bindings SET status = 'RECLAIMED', reclaimed_at_ms = ?1 WHERE user_id = ?2 AND status = 'BOUND'",
                                params![now_ms() as i64, uid],
                            ).unwrap_or(0);

                            append_audit(&db_lock, "AUTHORITY_RECLAIM", None, None, None, Some("RECLAIMED"), None, None, None,
                                Some(&serde_json::json!({"user_id": uid, "bindings_reclaimed": updated}).to_string()));

                            {
                                let mut s = st.lock().unwrap();
                                s.mem_events.push_front(MemEvent {
                                    ts_ms: now_ms(),
                                    kind: "AUTHORITY_RECLAIM".to_string(),
                                    data: serde_json::json!({"user_id": uid, "reclaimed": updated}),
                                });
                            }

                            respond(request, 200, &serde_json::json!({"ok": true, "reclaimed": updated}).to_string());
                        }
                        None => {
                            respond(request, 401, r#"{"ok":false,"error":"Authentication required"}"#);
                        }
                    }
                }

                // ── Authority: History ──
                ("GET", "/authority/history") => {
                    let token = extract_bearer(&request);
                    let user_id = token.and_then(|t| verify_session_token(&sk, &t).ok());
                    match user_id {
                        Some(uid) => {
                            let db_lock = dbc.lock().unwrap();
                            let mut stmt = db_lock.prepare(
                                "SELECT id, authority_type, scope_json, status, bound_at_ms, reclaimed_at_ms, cert_hash FROM authority_bindings WHERE user_id = ?1 ORDER BY id DESC LIMIT 50"
                            ).unwrap();
                            let rows: Vec<serde_json::Value> = stmt.query_map(params![uid], |row| {
                                Ok(serde_json::json!({
                                    "id": row.get::<_, i64>(0)?,
                                    "authority_type": row.get::<_, String>(1)?,
                                    "scope": row.get::<_, String>(2)?,
                                    "status": row.get::<_, String>(3)?,
                                    "bound_at_ms": row.get::<_, i64>(4)?,
                                    "reclaimed_at_ms": row.get::<_, Option<i64>>(5)?,
                                    "cert_hash": row.get::<_, String>(6)?
                                }))
                            }).unwrap().filter_map(|r| r.ok()).collect();
                            respond(request, 200, &serde_json::json!({"ok": true, "bindings": rows}).to_string());
                        }
                        None => {
                            respond(request, 401, r#"{"ok":false,"error":"Authentication required"}"#);
                        }
                    }
                }

                // ── Audit export (JSON) ──
                ("GET", "/audit/export") => {
                    let db_lock = dbc.lock().unwrap();
                    let mut stmt = db_lock
                        .prepare(
                            "SELECT id, ts_ms, kind, ticket_id, action, scope, decision, risk, reason, content_hash, prev_hash, entry_hash, data
                             FROM audit ORDER BY id ASC",
                        )
                        .unwrap();
                    let rows: Vec<serde_json::Value> = stmt
                        .query_map([], |row| {
                            Ok(serde_json::json!({
                                "id": row.get::<_, i64>(0)?,
                                "ts_ms": row.get::<_, i64>(1)?,
                                "kind": row.get::<_, String>(2)?,
                                "ticket_id": row.get::<_, Option<String>>(3)?,
                                "action": row.get::<_, Option<String>>(4)?,
                                "scope": row.get::<_, Option<String>>(5)?,
                                "decision": row.get::<_, Option<String>>(6)?,
                                "risk": row.get::<_, Option<i32>>(7)?,
                                "reason": row.get::<_, Option<String>>(8)?,
                                "content_hash": row.get::<_, Option<String>>(9)?,
                                "prev_hash": row.get::<_, String>(10)?,
                                "entry_hash": row.get::<_, String>(11)?,
                                "data": row.get::<_, Option<String>>(12)?
                            }))
                        })
                        .unwrap()
                        .filter_map(|r| r.ok())
                        .collect();

                    let export = serde_json::json!({
                        "kasbah_guard_audit_export": true,
                        "version": "0.3.0",
                        "exported_ms": now_ms(),
                        "chain_start": "GENESIS",
                        "entries": rows,
                        "total": rows.len()
                    });
                    respond(
                        request,
                        200,
                        &serde_json::to_string_pretty(&export).unwrap_or_default(),
                    );
                }

                _ => {
                    respond(request, 404, r#"{"ok":false,"error":"not found"}"#);
                }
            }
        }
    });
}
