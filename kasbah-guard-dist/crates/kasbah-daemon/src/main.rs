use serde_json::json;
use axum::{
  extract::Json,
  routing::{get, post},
  Router,
};
use serde::{Deserialize, Serialize};
use tower_http::cors::{Any, CorsLayer};

use rusqlite::{params, Connection};

use base64::Engine;
#[derive(Debug, Deserialize)]
struct VerbEvent {
  verb: String,              // paste|upload|browse|edit|download
  text: Option<String>,       // payload
  url: Option<String>,        // browse target
  app: Option<String>,
  model: Option<String>,
  agent: Option<String>,
  scope: Option<String>,
  mode: Option<String>,       // normal|strict|paranoid
}

#[derive(Debug, Serialize)]
struct ActionPlan {
  risk: u16,
  decision: String,
  reason: String,
  redacted_text: Option<String>,
  ticket: Option<String>,
  audit_chain_head: Option<String>,
}

async fn health() -> &'static str { "ok" }

fn db_path() -> String {
  let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
  format!("{}/.kasbah/audit.db", home)
}

fn ensure_db() -> Connection {
  let p = db_path();
  if let Some(dir) = std::path::Path::new(&p).parent() {
    let _ = std::fs::create_dir_all(dir);
  }
  kasbah_kernel::init_audit_db(&p)
}

fn payload(ev: &VerbEvent) -> String {
  if let Some(t) = &ev.text { return t.clone(); }
  if let Some(u) = &ev.url { return u.clone(); }
  String::new()
}

fn normalize_verb(v: &str) -> String {
  match v.trim().to_lowercase().as_str() {
    "paste" => "paste",
    "upload" => "upload",
    "browse" => "browse",
    "edit" => "edit",
    "download" => "download",
    other => other,
  }.to_string()
}

fn strict_mode(ev: &VerbEvent) -> bool {
  matches!(ev.mode.as_deref(), Some("strict") | Some("paranoid"))
}

fn signing_key_bytes() -> Vec<u8> {
  let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
  let sk_path = format!("{}/.kasbah/signing.key", home);
  if let Ok(b) = std::fs::read(&sk_path) {
    if b.len() >= 16 { return b; }
  }
  let mut b = [0u8; 32];
  getrandom::getrandom(&mut b).expect("rng");
  let _ = std::fs::create_dir_all(std::path::Path::new(&sk_path).parent().unwrap());
  std::fs::write(&sk_path, &b).expect("write key");
  b.to_vec()
}

fn safe_preview(s: &str, n: usize) -> String {
  s.chars().take(n).collect::<String>()
}


fn ticket_id_from_signed(ticket: &str) -> Option<String> {
  use base64::Engine;

  let (claims_part, _sig_part) = ticket.split_once('.')?;
  let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
    .decode(claims_part)
    .ok()?;

  // 1) Try JSON claims first
  if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&decoded) {
    if let Some(tid) = v.get("tid").and_then(|x| x.as_str()) { return Some(tid.to_string()); }
    if let Some(tid) = v.get("ticket_id").and_then(|x| x.as_str()) { return Some(tid.to_string()); }
    if let Some(tid) = v.get("id").and_then(|x| x.as_str()) { return Some(tid.to_string()); }
  }

  // 2) Fallback: pipe-delimited claims (tid|verb|...)
  let txt = String::from_utf8(decoded).ok()?;
  let tid = txt.split('|').next().unwrap_or("").trim();
  if tid.is_empty() { None } else { Some(tid.to_string()) }
}

fn decode_claims_from_ticket(ticket: &str) -> Option<String> {
  use base64::Engine;
  let (claims_part, _sig_part) = ticket.split_once('.')?;
  let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(claims_part).ok()?;
  let txt = String::from_utf8(decoded).ok()?;
  Some(txt)
}


fn bump_risk_for_verb(verb: &str, risk: u16) -> u16 {
  match verb {
    "upload" => risk.max(70),
    "download" => risk.max(70),
    "browse" => risk.max(50),
    _ => risk,
  }
}

fn mk_plan(conn: &Connection, verb: &str, mode: &str, scan_text: &str, scope: &str) -> serde_json::Value {
  let (risk0, mut decision, reason_raw) = kasbah_kernel::policy_preflight(scan_text);
  let risk = bump_risk_for_verb(verb, risk0);

  if mode == "allow" && risk < 85 {
    decision = "ALLOW".to_string();
  }

  let reason = format!(
    "{}: {}",
    match mode { "strict" => "Strict", "warn" => "Warn", "allow" => "Allow", _ => "Strict" },
    reason_raw
  );

  let c_hash = kasbah_kernel::content_hash(scan_text);
  let (ticket_id, signed_ticket, exp_ms) =
    kasbah_kernel::create_ticket(b"KASBAH_DEV_KEY", verb, scope, &c_hash, risk);

  let data = json!({
    "v2": true,
    "verb": verb,
    "scope": scope,
    "mode": mode,
    "risk": risk,
    "decision": decision,
    "reason": reason,
    "content_hash": c_hash,
    "ticket_id": ticket_id
  }).to_string();

  let head = kasbah_kernel::append_audit(
    conn,
    &format!("v2:{}", verb),
    Some(&ticket_id),
    Some(verb),
    Some(scope),
    Some(&decision),
    Some(risk),
    Some(&reason),
    Some(&c_hash),
    Some(&data),
  );

  json!({
    "risk": risk,
    "decision": decision,
    "reason": reason,
    "redacted_text": if risk >= 60 { scan_text } else { "" },
    "ticket": signed_ticket,
    "expires_ms": exp_ms,
    "audit_chain_head": head
  })
}


async fn v2_evaluate(Json(ev): axum::Json<VerbEvent>) -> axum::Json<serde_json::Value> {
  let conn = ensure_db();
  ensure_replay_tables(&conn);

  let verb = ev.verb.trim().to_lowercase();
  let mode = ev.mode.as_deref().unwrap_or("strict").trim().to_lowercase();
  let scope = ev.scope.as_deref().unwrap_or("llm").trim().to_lowercase();

  let mut scan_text = ev.text.clone().unwrap_or_default();

  if verb == "browse" {
    if scan_text.is_empty() {
      if let Some(v) = ev.url.as_deref() {
        scan_text = v.to_string();
      }
    }
  }

  if verb == "upload" || verb == "download" {
    if let Some(v) = None {
      // Scan only file head; never load whole thing.
      if let Ok(b) = read_file_head(v, 256 * 1024) {
        if looks_binary(&b) {
          scan_text = format!("file:{} (binary head, {} bytes)", v, b.len());
        } else {
          scan_text = String::from_utf8_lossy(&b).to_string();
        }
      } else {
        scan_text = format!("file:{} (unreadable)", v);
      }
    }
    if scan_text.is_empty() {
      if let Some(v) = ev.url.as_deref() {
        scan_text = v.to_string();
      }
    }
    if scan_text.is_empty() {
      scan_text = format!("{}:missing_payload", verb);
    }
  }

  if verb == "edit" {
    let before = "";
    let after  = "";
    if !before.is_empty() || !after.is_empty() {
      scan_text = format!("BEFORE:
{}

AFTER:
{}", before, after);
    }
  }

  if scan_text.is_empty() {
    scan_text = format!("{}:empty", verb);
  }

  let plan = mk_plan(&conn, &verb, &mode, &scan_text, &scope);
  if let Some(t) = plan.get("ticket").and_then(|v| v.as_str()) {
  }
  axum::Json(plan)
}


fn read_file_head(path: &str, max_bytes: usize) -> Result<Vec<u8>, String> {
  use std::fs::File;
  use std::io::Read;
  let mut f = File::open(path).map_err(|e| format!("open: {}", e))?;
  let mut buf = vec![0u8; max_bytes];
  let n = f.read(&mut buf).map_err(|e| format!("read: {}", e))?;
  buf.truncate(n);
  Ok(buf)
}

fn looks_binary(bytes: &[u8]) -> bool {
  if bytes.is_empty() { return false; }
  let mut nontext = 0usize;
  for &b in bytes.iter().take(4096) {
    if b == 0 { return true; }
    if b < 9 || (b > 13 && b < 32) { nontext += 1; }
  }
  nontext > 64
}

fn ensure_replay_tables(conn: &rusqlite::Connection) {
  let _ = conn.execute_batch(r#"
    CREATE TABLE IF NOT EXISTS v2_consumed (
      ticket_id TEXT PRIMARY KEY,
      consumed_ms INTEGER NOT NULL
    );
  "#);
}

fn already_consumed(conn: &rusqlite::Connection, ticket_id: &str) -> bool {
  let mut st = match conn.prepare("SELECT 1 FROM v2_consumed WHERE ticket_id=?1 LIMIT 1") {
    Ok(x) => x,
    Err(_) => return false,
  };
  let mut rows = match st.query(rusqlite::params![ticket_id]) {
    Ok(r) => r,
    Err(_) => return false,
  };
  rows.next().ok().flatten().is_some()
}

fn mark_consumed(conn: &rusqlite::Connection, ticket_id: &str, now_ms: i64) {
  let _ = conn.execute(
    "INSERT OR REPLACE INTO v2_consumed(ticket_id, consumed_ms) VALUES (?1, ?2)",
    rusqlite::params![ticket_id, now_ms],
  );
}

fn now_ms_i64() -> i64 { kasbah_kernel::audit::now_ms() as i64 }


#[tokio::main]
async fn main() {
  let app = Router::new()
    .route("/v2/health", get(health))
    .route("/v2/evaluate", post(v2_evaluate))
    
    .route("/v2/consume", post(v2_consume)).layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any));

  let addr = "127.0.0.1:8789";
  eprintln!("KASBAH_DAEMON_LISTEN {}", addr);
  let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
  axum::serve(listener, app).await.unwrap();
}


#[derive(Debug, Clone, Serialize, Deserialize)]
struct ConsumeReq {
  ticket: String,
  #[serde(default)]
  payload_hash: Option<String>,
}


async fn v2_consume(Json(req): axum::Json<ConsumeReq>) -> axum::Json<serde_json::Value> {
  let conn = ensure_db();
  ensure_replay_tables(&conn);

  let claims = match kasbah_kernel::verify_ticket(b"KASBAH_DEV_KEY", &req.ticket) {
    Ok(c) => c,
    Err(e) => {
      return axum::Json(json!({"ok": false, "error": "bad_ticket", "detail": e}));
    }
  };

  
  let mut parts: Vec<&str> = claims.split('|').collect();
  let mut decoded_claims: Option<String> = None;

  if parts.len() < 7 {
    decoded_claims = decode_claims_from_ticket(&req.ticket);
    if let Some(ref dc) = decoded_claims {
      parts = dc.split('|').collect();
    }
  }

  if parts.len() < 7 {
    return axum::Json(json!({"ok": false, "error": "bad_claims"}));
  }


  let ticket_id = parts[0];
  let action = parts[1];
  let scope = parts[2];
  let c_hash = parts[3];
  let risk: i64 = parts[4].parse().unwrap_or(0);
  let exp_ms: i64 = parts[5].parse().unwrap_or(0);
  let now = now_ms_i64();

  if now > exp_ms {
    let head = kasbah_kernel::append_audit(
      &conn, "v2:expired", Some(ticket_id), Some(action), Some(scope),
      Some("DENY"), Some(risk as u16), Some("ticket expired"),
      Some(c_hash), Some(&json!({"ticket_id": ticket_id}).to_string()),
    );
    return axum::Json(json!({"ok": false, "error": "expired", "audit_chain_head": head}));
  }

  if already_consumed(&conn, ticket_id) {
    let head = kasbah_kernel::append_audit(
      &conn, "v2:replay_block", Some(ticket_id), Some(action), Some(scope),
      Some("DENY"), Some(risk as u16), Some("replay blocked"),
      Some(c_hash), Some(&json!({"ticket_id": ticket_id}).to_string()),
    );
    return axum::Json(json!({"ok": false, "error": "replay", "audit_chain_head": head}));
  }

  mark_consumed(&conn, ticket_id, now);

  let head = kasbah_kernel::append_audit(
    &conn, "v2:consume", Some(ticket_id), Some(action), Some(scope),
    Some("ALLOW"), Some(risk as u16), Some("consumed"),
    Some(c_hash), Some(&json!({"ticket_id": ticket_id}).to_string()),
  );

  axum::Json(json!({"ok": true, "ticket_id": ticket_id, "action": action, "scope": scope, "audit_chain_head": head}))
}
