use std::collections::{HashMap, VecDeque};
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

const PORT: u16 = 8788;
const TTL_MS: u64 = 60_000;
const MAX_EVENTS: usize = 500;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn simple_id() -> String {
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let r = t.wrapping_mul(6364136223846793005).wrapping_add(1);
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        ((r >> 96) & 0xffffffff) as u32,
        ((r >> 80) & 0xffff) as u16,
        ((r >> 64) & 0x0fff) as u16,
        (((r >> 48) & 0x3fff) | 0x8000) as u16,
        (r & 0xffffffffffff) as u64
    )
}

// ── Risk scoring (server-side validation of extension's local scan) ──

const SECRET_MARKERS: &[&str] = &[
    "api_key", "apikey", "api-key",
    "secret", "password", "passwd", "pwd",
    "-----begin", "private key",
    "sk-", "token=", "bearer",
    "akia", "ghp_", "gho_", "ghu_", "ghs_", "ghr_",
    "xoxb-", "xoxp-", "xoxr-", "xoxs-",
    "mongodb://", "postgres://", "mysql://", "redis://",
];

fn policy_preflight(text: &str) -> (u16, String, String) {
    let lower = text.to_lowercase();
    let mut risk: u16 = 10;
    let mut reasons = Vec::new();

    // Check for secret patterns
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

    // Length checks
    if text.len() > 5000 {
        risk += 25;
        reasons.push(format!("Very large message ({} chars)", text.len()));
    } else if text.len() > 2500 {
        risk += 15;
        reasons.push(format!("Large message ({} chars)", text.len()));
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

// ── Data structures ──

#[derive(Clone)]
struct Event {
    ts_ms: u64,
    kind: String,
    data: serde_json::Value,
}

struct TicketState {
    exp_ms: u64,
    consumed: bool,
    meta: serde_json::Value,
    risk: u16,
}

struct Stats {
    total: u32,
    allowed: u32,
    denied: u32,
    replay_blocked: u32,
    secrets_caught: u32,
}

struct State {
    tickets: HashMap<String, TicketState>,
    events: VecDeque<Event>,
    stats: Stats,
}

impl State {
    fn new() -> Self {
        Self {
            tickets: HashMap::new(),
            events: VecDeque::new(),
            stats: Stats {
                total: 0,
                allowed: 0,
                denied: 0,
                replay_blocked: 0,
                secrets_caught: 0,
            },
        }
    }

    fn push_event(&mut self, kind: &str, data: serde_json::Value) {
        self.events.push_front(Event {
            ts_ms: now_ms(),
            kind: kind.to_string(),
            data,
        });
        while self.events.len() > MAX_EVENTS {
            self.events.pop_back();
        }
    }
}

fn read_body(req: &mut tiny_http::Request) -> String {
    let mut buf = String::new();
    let _ = req.as_reader().read_to_string(&mut buf);
    buf
}

fn cors_headers() -> Vec<tiny_http::Header> {
    vec![
        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap(),
        tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
        tiny_http::Header::from_bytes(
            &b"Access-Control-Allow-Methods"[..],
            &b"GET, POST, OPTIONS"[..],
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

        let state = Arc::new(Mutex::new(State::new()));

        // Seed startup event
        {
            let mut g = state.lock().unwrap();
            g.push_event(
                "STARTUP",
                serde_json::json!({"message": "Kasbah Guard started", "port": PORT}),
            );
        }

        for mut request in server.incoming_requests() {
            let url = request.url().to_string();
            let method = request.method().as_str().to_uppercase();

            if method == "OPTIONS" {
                respond(request, 200, "{}");
                continue;
            }

            let st = Arc::clone(&state);

            match (method.as_str(), url.as_str()) {
                // ── Health check ──
                ("GET", "/status") => {
                    let g = st.lock().unwrap();
                    let body = serde_json::json!({
                        "ok": true,
                        "service": "kasbah-guard",
                        "port": PORT,
                        "ts_ms": now_ms(),
                        "stats": {
                            "total": g.stats.total,
                            "allowed": g.stats.allowed,
                            "denied": g.stats.denied,
                            "replay_blocked": g.stats.replay_blocked,
                            "secrets_caught": g.stats.secrets_caught
                        }
                    });
                    respond(request, 200, &body.to_string());
                }

                // ── Issue ticket with risk assessment ──
                ("POST", "/decide") => {
                    let raw = read_body(&mut request);
                    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&raw);

                    match parsed {
                        Ok(req_val) => {
                            let ticket = simple_id();
                            let exp_ms = now_ms().saturating_add(TTL_MS);

                            // Extract preview for server-side risk scoring
                            let preview = req_val
                                .get("meta")
                                .and_then(|m| m.get("preview"))
                                .and_then(|p| p.as_str())
                                .unwrap_or("");

                            let (risk, preflight_decision, reason) = policy_preflight(preview);

                            // Count secrets
                            let client_secrets = req_val
                                .get("meta")
                                .and_then(|m| m.get("secrets"))
                                .and_then(|s| s.as_array())
                                .map(|a| a.len())
                                .unwrap_or(0);

                            let meta = serde_json::json!({
                                "product": req_val.get("product"),
                                "host": req_val.get("host"),
                                "action": req_val.get("action"),
                                "meta": req_val.get("meta"),
                                "risk": risk,
                                "preflight": preflight_decision,
                                "reason": reason
                            });

                            let mut g = st.lock().unwrap();

                            if client_secrets > 0 {
                                g.stats.secrets_caught += 1;
                            }

                            g.tickets.insert(
                                ticket.clone(),
                                TicketState {
                                    exp_ms,
                                    consumed: false,
                                    meta: meta.clone(),
                                    risk,
                                },
                            );
                            g.push_event(
                                "DECIDE",
                                serde_json::json!({
                                    "ticket": &ticket,
                                    "risk": risk,
                                    "preflight": &preflight_decision,
                                    "reason": &reason,
                                    "secrets": client_secrets
                                }),
                            );

                            let res = serde_json::json!({
                                "ok": true,
                                "decision": "PENDING",
                                "ticket": ticket,
                                "exp_ms": exp_ms,
                                "risk": risk,
                                "preflight": preflight_decision,
                                "reason": reason
                            });
                            respond(request, 200, &res.to_string());
                        }
                        Err(_) => {
                            respond(
                                request,
                                400,
                                r#"{"ok":false,"error":"invalid JSON"}"#,
                            );
                        }
                    }
                }

                // ── Consume ticket (single-use, replay-protected) ──
                ("POST", "/consume") => {
                    let raw = read_body(&mut request);
                    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&raw);

                    match parsed {
                        Ok(req_val) => {
                            let ticket_str = req_val
                                .get("ticket")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let choice = req_val
                                .get("choice")
                                .and_then(|v| v.as_str())
                                .unwrap_or("DENY")
                                .to_uppercase();

                            let mut decision = "DENY".to_string();
                            let mut reason = "default deny".to_string();

                            {
                                let mut g = st.lock().unwrap();
                                g.stats.total += 1;

                                if let Some(t) = g.tickets.get_mut(&ticket_str) {
                                    let now = now_ms();
                                    if now > t.exp_ms {
                                        reason = "expired ticket".to_string();
                                        g.stats.denied += 1;
                                    } else if t.consumed {
                                        reason = "replay blocked".to_string();
                                        g.stats.replay_blocked += 1;
                                        g.stats.denied += 1;
                                    } else {
                                        t.consumed = true;
                                        if choice == "ALLOW" {
                                            decision = "ALLOW".to_string();
                                            reason = "user allowed".to_string();
                                            g.stats.allowed += 1;
                                        } else {
                                            reason = "user blocked".to_string();
                                            g.stats.denied += 1;
                                        }
                                    }
                                } else {
                                    reason = "unknown ticket".to_string();
                                    g.stats.denied += 1;
                                }

                                g.push_event(
                                    "CONSUME",
                                    serde_json::json!({
                                        "ticket": &ticket_str,
                                        "decision": &decision,
                                        "reason": &reason,
                                        "choice": &choice
                                    }),
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
                            respond(
                                request,
                                400,
                                r#"{"ok":false,"error":"invalid JSON"}"#,
                            );
                        }
                    }
                }

                // ── Event stream ──
                ("GET", _) if url.starts_with("/events") => {
                    let g = st.lock().unwrap();
                    let events: Vec<serde_json::Value> = g
                        .events
                        .iter()
                        .map(|e| {
                            serde_json::json!({
                                "ts_ms": e.ts_ms,
                                "kind": e.kind,
                                "data": e.data
                            })
                        })
                        .collect();
                    let body =
                        serde_json::to_string(&events).unwrap_or_else(|_| "[]".to_string());
                    respond(request, 200, &body);
                }

                // ── Stats endpoint ──
                ("GET", "/stats") => {
                    let g = st.lock().unwrap();
                    let body = serde_json::json!({
                        "total": g.stats.total,
                        "allowed": g.stats.allowed,
                        "denied": g.stats.denied,
                        "replay_blocked": g.stats.replay_blocked,
                        "secrets_caught": g.stats.secrets_caught
                    });
                    respond(request, 200, &body.to_string());
                }

                _ => {
                    respond(request, 404, r#"{"ok":false,"error":"not found"}"#);
                }
            }
        }
    });
}
