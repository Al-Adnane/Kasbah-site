use std::collections::{HashMap, VecDeque};
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

const PORT: u16 = 8788;
const TTL_MS: u64 = 60_000;
const MAX_EVENTS: usize = 200;

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
}

struct State {
    tickets: HashMap<String, TicketState>,
    events: VecDeque<Event>,
}

impl State {
    fn new() -> Self {
        Self {
            tickets: HashMap::new(),
            events: VecDeque::new(),
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
            g.push_event("STARTUP", serde_json::json!({"message": "Kasbah Guard local authority started", "port": PORT}));
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
                ("GET", "/status") => {
                    let body = serde_json::json!({
                        "ok": true,
                        "service": "kasbah-guard-local",
                        "port": PORT,
                        "ts_ms": now_ms()
                    });
                    respond(request, 200, &body.to_string());
                }

                ("POST", "/decide") => {
                    let raw = read_body(&mut request);
                    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&raw);

                    match parsed {
                        Ok(req_val) => {
                            let ticket = simple_id();
                            let exp_ms = now_ms().saturating_add(TTL_MS);

                            let meta = serde_json::json!({
                                "product": req_val.get("product"),
                                "host": req_val.get("host"),
                                "action": req_val.get("action"),
                                "meta": req_val.get("meta")
                            });

                            let mut g = st.lock().unwrap();
                            g.tickets.insert(
                                ticket.clone(),
                                TicketState {
                                    exp_ms,
                                    consumed: false,
                                    meta: meta.clone(),
                                },
                            );
                            g.push_event(
                                "DECIDE",
                                serde_json::json!({
                                    "ticket": &ticket,
                                    "exp_ms": exp_ms,
                                    "meta": &meta
                                }),
                            );

                            let res = serde_json::json!({
                                "ok": true,
                                "decision": "PENDING",
                                "ticket": ticket,
                                "exp_ms": exp_ms
                            });
                            respond(request, 200, &res.to_string());
                        }
                        Err(_) => {
                            respond(request, 400, r#"{"ok":false,"error":"invalid JSON"}"#);
                        }
                    }
                }

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
                                if let Some(t) = g.tickets.get_mut(&ticket_str) {
                                    let now = now_ms();
                                    if now > t.exp_ms {
                                        reason = "expired ticket".to_string();
                                    } else if t.consumed {
                                        reason = "replay blocked".to_string();
                                    } else {
                                        t.consumed = true;
                                        if choice == "ALLOW" {
                                            decision = "ALLOW".to_string();
                                            reason = "user allowed".to_string();
                                        } else {
                                            reason = "user blocked".to_string();
                                        }
                                    }
                                } else {
                                    reason = "unknown ticket".to_string();
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
                            respond(request, 400, r#"{"ok":false,"error":"invalid JSON"}"#);
                        }
                    }
                }

                ("GET", "/events") => {
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
                    let body = serde_json::to_string(&events).unwrap_or_else(|_| "[]".to_string());
                    respond(request, 200, &body);
                }

                _ => {
                    respond(request, 404, r#"{"ok":false,"error":"not found"}"#);
                }
            }
        }
    });
}
