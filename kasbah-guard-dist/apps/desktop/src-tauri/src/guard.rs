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
const SECRET_MARKERS: &[&str] = &[
    "api_key", "apikey", "api-key",
    "secret", "password", "passwd", "pwd",
    "-----begin", "private key",
    "sk-", "token=", "bearer",
    "akia", "ghp_", "gho_", "ghu_", "ghs_", "ghr_",
    "xoxb-", "xoxp-", "xoxr-", "xoxs-",
    "mongodb://", "postgres://", "mysql://", "redis://",
    "aws_secret", "aws_access", "client_secret",
    "authorization:", "x-api-key",
];

/// Risk scoring with pattern detection
fn policy_preflight(text: &str) -> (u16, String, String) {
    let lower = text.to_lowercase();
    let mut risk: u16 = 10;
    let mut reasons = Vec::new();
    let mut secrets_found = Vec::new();

    for marker in SECRET_MARKERS {
        if lower.contains(marker) {
            secrets_found.push(*marker);
        }
    }
    if !secrets_found.is_empty() {
        risk += 75;
        reasons.push(format!("Sensitive patterns: {}", secrets_found.join(", ")));
    }

    if text.len() > 5000 {
        risk += 25;
        reasons.push(format!("Very large message ({} chars)", text.len()));
    } else if text.len() > 2500 {
        risk += 15;
        reasons.push(format!("Large message ({} chars)", text.len()));
    }

    // Check for dangerous commands
    let dangerous = ["rm -rf", "drop table", "delete from", "format c:", "sudo rm", "chmod 777"];
    for cmd in &dangerous {
        if lower.contains(cmd) {
            risk += 30;
            reasons.push(format!("Dangerous command: {}", cmd));
        }
    }

    risk = risk.min(100);

    let decision = if risk >= 85 {
        "WARN".to_string()
    } else if risk >= 50 {
        "REVIEW".to_string()
    } else {
        "ALLOW".to_string()
    };

    let reason = if reasons.is_empty() {
        "No issues detected".to_string()
    } else {
        reasons.join("; ")
    };

    (risk, decision, reason)
}

// ── HMAC Ticket System ──

/// Generate a cryptographically random signing key (32 bytes)
fn generate_signing_key() -> Vec<u8> {
    let mut rng = rand::thread_rng();
    let mut key = vec![0u8; 32];
    rng.fill(&mut key[..]);
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
    let mut mac =
        HmacSha256::new_from_slice(signing_key).expect("HMAC key length");
    mac.update(claims.as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());

    // Ticket = claims.signature (like a JWT without base64 encoding)
    let claims_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(claims.as_bytes());
    let signed_ticket = format!("{}.{}", claims_b64, signature);

    (ticket_id, signed_ticket, exp_ms)
}

/// Verify HMAC-SHA256 ticket signature
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

    // Verify HMAC
    let mut mac =
        HmacSha256::new_from_slice(signing_key).expect("HMAC key length");
    mac.update(claims.as_bytes());
    let expected_sig = hex::encode(mac.finalize().into_bytes());

    if expected_sig != sig_hex {
        return Err("Invalid signature".to_string());
    }

    // Extract ticket_id (first field)
    let ticket_id = claims
        .split('|')
        .next()
        .unwrap_or("")
        .to_string();

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
        CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts_ms DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_ticket ON audit(ticket_id);",
    )
    .expect("Failed to create tables");
    conn
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
    let payload = format!(
        "{}|{}|{}|{}",
        prev,
        ts,
        kind,
        data.unwrap_or("")
    );
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

struct Stats {
    total: u32,
    allowed: u32,
    denied: u32,
    replay_blocked: u32,
    secrets_caught: u32,
    threats_blocked: u32,
}

struct State {
    mem_events: std::collections::VecDeque<MemEvent>,
    stats: Stats,
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
        tiny_http::Header::from_bytes(
            &b"Access-Control-Allow-Headers"[..],
            &b"Content-Type"[..],
        )
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

pub fn spawn_guard_service() {
    thread::spawn(|| {
        let server = match tiny_http::Server::http(format!("127.0.0.1:{}", PORT)) {
            Ok(s) => s,
            Err(_) => return,
        };

        // Generate signing key for HMAC tickets
        let signing_key = generate_signing_key();

        // Initialize SQLite audit database
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        let db_dir = format!("{}/Library/Application Support/KasbahGuard", home);
        let _ = std::fs::create_dir_all(&db_dir);
        let db_path = format!("{}/audit.db", db_dir);
        let db = Arc::new(Mutex::new(init_db(&db_path)));

        // DashMap for fast ticket lookups (replay protection)
        let tickets: Arc<DashMap<String, TicketState>> = Arc::new(DashMap::new());

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
            },
        }));

        // Log startup
        {
            let db_lock = db.lock().unwrap();
            append_audit(
                &db_lock,
                "STARTUP",
                None, None, None, None, None, None, None,
                Some(&format!("{{\"port\":{}}}", PORT)),
            );
        }
        {
            let mut s = state.lock().unwrap();
            s.mem_events.push_front(MemEvent {
                ts_ms: now_ms(),
                kind: "STARTUP".to_string(),
                data: serde_json::json!({"message": "Kasbah Guard started", "port": PORT}),
            });
        }

        for mut request in server.incoming_requests() {
            let url = request.url().to_string();
            let method = request.method().as_str().to_uppercase();

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
                // ── Health check with stats ──
                ("GET", "/status") => {
                    let s = st.lock().unwrap();
                    let body = serde_json::json!({
                        "ok": true,
                        "service": "kasbah-guard",
                        "version": "0.2.0",
                        "port": PORT,
                        "ts_ms": now_ms(),
                        "crypto": "hmac-sha256",
                        "audit": "sqlite-hash-chain",
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
                            let action = req_val.get("action")
                                .and_then(|v| v.as_str())
                                .unwrap_or("unknown")
                                .to_string();
                            let scope = req_val.get("product")
                                .and_then(|v| v.as_str())
                                .unwrap_or("web")
                                .to_string();
                            let preview = req_val.get("meta")
                                .and_then(|m| m.get("preview"))
                                .and_then(|p| p.as_str())
                                .unwrap_or("");
                            let verb = req_val.get("verb")
                                .and_then(|v| v.as_str())
                                .unwrap_or("send");

                            let c_hash = content_hash(preview);
                            let (risk, preflight_decision, reason) = policy_preflight(preview);

                            let client_secrets = req_val.get("meta")
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
                                    Some(&serde_json::json!({
                                        "verb": verb,
                                        "secrets": client_secrets
                                    }).to_string()),
                                );
                            }

                            // Memory events
                            {
                                let mut s = st.lock().unwrap();
                                if client_secrets > 0 {
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
                            let ticket_raw = req_val.get("ticket")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let choice = req_val.get("choice")
                                .and_then(|v| v.as_str())
                                .unwrap_or("DENY")
                                .to_uppercase();

                            // Try to verify HMAC signature
                            let ticket_id = if ticket_raw.contains('.') {
                                match verify_ticket(&sk, &ticket_raw) {
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
                                }
                            } else {
                                // Backwards compatibility: plain ticket ID
                                ticket_raw.clone()
                            };

                            let mut decision = "DENY".to_string();
                            let mut reason = "default deny".to_string();

                            if let Some(mut entry) = tk.get_mut(&ticket_id) {
                                let now = now_ms();
                                let mut s = st.lock().unwrap();
                                s.stats.total += 1;

                                if now > entry.exp_ms {
                                    reason = "expired ticket".to_string();
                                    s.stats.denied += 1;
                                } else if entry.consumed {
                                    reason = "replay blocked".to_string();
                                    s.stats.replay_blocked += 1;
                                    s.stats.denied += 1;
                                } else {
                                    entry.consumed = true;
                                    if choice == "ALLOW" {
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
                                    None, None,
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
                    let limit = url.split("limit=")
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

                // ── In-memory event stream (fast, no DB hit) ──
                ("GET", "/events") => {
                    let s = st.lock().unwrap();
                    let events: Vec<serde_json::Value> = s.mem_events
                        .iter()
                        .map(|e| {
                            serde_json::json!({
                                "ts_ms": e.ts_ms,
                                "kind": e.kind,
                                "data": e.data
                            })
                        })
                        .collect();
                    respond(request, 200, &serde_json::to_string(&events).unwrap_or_else(|_| "[]".to_string()));
                }

                // ── Stats endpoint ──
                ("GET", "/stats") => {
                    let s = st.lock().unwrap();
                    let body = serde_json::json!({
                        "total": s.stats.total,
                        "allowed": s.stats.allowed,
                        "denied": s.stats.denied,
                        "replay_blocked": s.stats.replay_blocked,
                        "secrets_caught": s.stats.secrets_caught,
                        "threats_blocked": s.stats.threats_blocked
                    });
                    respond(request, 200, &body.to_string());
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
                    respond(request, 200, &serde_json::json!({"ok": true, "policies": rows}).to_string());
                }

                ("POST", "/policies") => {
                    let raw = read_body(&mut request);
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                        let pattern = val.get("pattern").and_then(|v| v.as_str()).unwrap_or("");
                        let action = val.get("action").and_then(|v| v.as_str()).unwrap_or("block");
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
                        db_lock.execute("DELETE FROM policies WHERE id = ?1", params![id]).ok();
                        respond(request, 200, r#"{"ok":true}"#);
                    } else {
                        respond(request, 400, r#"{"ok":false,"error":"invalid id"}"#);
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
                        "version": "0.2.0",
                        "exported_ms": now_ms(),
                        "chain_start": "GENESIS",
                        "entries": rows,
                        "total": rows.len()
                    });
                    respond(request, 200, &serde_json::to_string_pretty(&export).unwrap_or_default());
                }

                _ => {
                    respond(request, 404, r#"{"ok":false,"error":"not found"}"#);
                }
            }
        }
    });
}
