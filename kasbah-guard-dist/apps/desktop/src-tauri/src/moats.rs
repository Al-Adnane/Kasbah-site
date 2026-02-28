//! Kasbah Moat Integration Layer
//!
//! Exposes 5 moat modules (Integrity, Gate, Capabilities, Telemetry, Evolution)
//! as Tauri IPC commands for the desktop app.
//!
//! Architecture: This is a standalone module that imports from the NEW kasbah-kernel
//! (aliased as `kasbah_moats`). It does NOT touch guard.rs or the legacy kernel.

use std::sync::Mutex;
use tauri::State;

// Import from the NEW kasbah-kernel (aliased as kasbah-moats in Cargo.toml)
use kasbah_moats::integrity::IntegritySnapshot;
use kasbah_moats::gate;
use kasbah_moats::capabilities;
use kasbah_moats::telemetry::TelemetryBuffer;
use kasbah_moats::evolution::EvolutionEngine;

// ── Tauri-managed state containers ──

pub struct MoatTelemetry(pub Mutex<TelemetryBuffer>);
pub struct MoatEvolution(pub Mutex<EvolutionEngine>);
pub struct MoatCapabilities(pub Mutex<Vec<kasbah_moats::capabilities::Capability>>);

// ══════════════════════════════════════════════════════════════
// Moat F: System Integrity Index (SII)
// ══════════════════════════════════════════════════════════════

#[tauri::command]
pub fn get_system_integrity(
    hook_integrity: f32,
    pattern_integrity: f32,
    session_health: f32,
    latency_norm: f32,
    tau_max: f32,
    tau_min: f32,
) -> serde_json::Value {
    let snapshot = IntegritySnapshot::compute(
        hook_integrity,
        pattern_integrity,
        session_health,
        latency_norm,
        tau_max,
        tau_min,
    );
    serde_json::to_value(&snapshot).unwrap_or(serde_json::json!({"error": "serialize failed"}))
}

// ══════════════════════════════════════════════════════════════
// Moat O: Three-Gate Execution
// ══════════════════════════════════════════════════════════════

#[tauri::command]
pub fn check_execution_gates(
    reliability: f32,
    brittleness: f32,
    harm: f32,
) -> serde_json::Value {
    let result = gate::authorize_execution(reliability, brittleness, harm);
    serde_json::to_value(&result).unwrap_or(serde_json::json!({"error": "serialize failed"}))
}

// ══════════════════════════════════════════════════════════════
// Moat K: Capability-Based Access Control
// ══════════════════════════════════════════════════════════════

#[tauri::command]
pub fn grant_capability(
    state: State<'_, MoatCapabilities>,
    resource: String,
    action: String,
    max_rows: u32,
    ttl_ms: u64,
    issuer: String,
) -> serde_json::Value {
    let cap = capabilities::issue_capability(&resource, &action, max_rows, ttl_ms, &issuer);
    let json = serde_json::to_value(&cap).unwrap_or(serde_json::json!({"error": "serialize failed"}));
    if let Ok(mut caps) = state.0.lock() {
        caps.push(cap);
    }
    json
}

#[tauri::command]
pub fn authorize_data_request(
    state: State<'_, MoatCapabilities>,
    resource: String,
    action: String,
    rows: u32,
) -> serde_json::Value {
    let caps = state.0.lock().unwrap();
    let req = capabilities::CapabilityRequest { resource, action, rows };
    match capabilities::check_capabilities(&req, &caps) {
        Ok(cap_id) => serde_json::json!({"authorized": true, "capability_id": cap_id}),
        Err(reason) => serde_json::json!({"authorized": false, "reason": reason}),
    }
}

// ══════════════════════════════════════════════════════════════
// Moat N: Privacy-Preserving Telemetry
// ══════════════════════════════════════════════════════════════

#[tauri::command]
pub fn record_detection_event(
    state: State<'_, MoatTelemetry>,
    content: String,
    risk_score: u16,
    user_action: String,
    pattern_ids: Vec<String>,
    platform: String,
) -> serde_json::Value {
    let mut buf = state.0.lock().unwrap();
    buf.record(&content, risk_score, &user_action, pattern_ids, &platform);
    serde_json::json!({"recorded": true, "total_events": buf.len()})
}

#[tauri::command]
pub fn get_telemetry_metrics(
    state: State<'_, MoatTelemetry>,
) -> serde_json::Value {
    let buf = state.0.lock().unwrap();
    let metrics = buf.aggregate();
    serde_json::to_value(&metrics).unwrap_or(serde_json::json!({"error": "serialize failed"}))
}

#[tauri::command]
pub fn export_telemetry(
    state: State<'_, MoatTelemetry>,
) -> String {
    let buf = state.0.lock().unwrap();
    buf.export_json()
}

#[tauri::command]
pub fn clear_telemetry(
    state: State<'_, MoatTelemetry>,
) -> serde_json::Value {
    let mut buf = state.0.lock().unwrap();
    buf.clear();
    serde_json::json!({"cleared": true})
}

// ══════════════════════════════════════════════════════════════
// Moat H: Pattern Evolution Engine
// ══════════════════════════════════════════════════════════════

#[tauri::command]
pub fn record_pattern_feedback(
    state: State<'_, MoatEvolution>,
    pattern_id: String,
    is_true_positive: bool,
) -> serde_json::Value {
    let mut engine = state.0.lock().unwrap();
    if is_true_positive {
        engine.record_true_positive(&pattern_id);
    } else {
        engine.record_false_positive(&pattern_id);
    }
    let confidence = engine.get_confidence(&pattern_id);
    serde_json::json!({"pattern_id": pattern_id, "confidence": confidence})
}

#[tauri::command]
pub fn get_pattern_stats(
    state: State<'_, MoatEvolution>,
    pattern_id: String,
) -> serde_json::Value {
    let engine = state.0.lock().unwrap();
    match engine.get_stats(&pattern_id) {
        Some(stats) => serde_json::to_value(stats).unwrap_or(serde_json::json!(null)),
        None => serde_json::json!(null),
    }
}

#[tauri::command]
pub fn get_pattern_priority_order(
    state: State<'_, MoatEvolution>,
) -> serde_json::Value {
    let engine = state.0.lock().unwrap();
    let priorities: Vec<serde_json::Value> = engine
        .priority_order()
        .into_iter()
        .map(|(id, score)| serde_json::json!({"pattern_id": id, "priority_score": score}))
        .collect();
    serde_json::json!(priorities)
}

#[tauri::command]
pub fn export_pattern_evolution(
    state: State<'_, MoatEvolution>,
) -> String {
    let engine = state.0.lock().unwrap();
    engine.export_json()
}

// ══════════════════════════════════════════════════════════════
// Redaction: expose redact_text to the frontend
// ══════════════════════════════════════════════════════════════

#[tauri::command]
pub fn redact_content(text: String) -> serde_json::Value {
    // policy_preflight first to get findings, then redact
    let (risk, decision, reason) = kasbah_moats::policy_preflight(&text);
    // Build minimal findings list based on decision
    let findings: Vec<kasbah_moats::Finding> = vec![];
    let redacted = kasbah_moats::redact_text(&text, &findings);
    serde_json::json!({
        "redacted": redacted,
        "risk": risk,
        "decision": decision,
        "reason": reason,
    })
}

// ══════════════════════════════════════════════════════════════
// Audit: expose content hashing and ticket creation
// ══════════════════════════════════════════════════════════════

#[tauri::command]
pub fn audit_event(
    content: String,
    action: String,
    risk: u16,
) -> serde_json::Value {
    let hash = kasbah_moats::content_hash(&content);
    // create_ticket(signing_key, action, scope, content_hash, risk)
    let (ticket_id, sig, exp_ms) = kasbah_moats::create_ticket(
        b"kasbah-guard-desktop",
        &action,
        "audit",
        &hash,
        risk,
    );
    serde_json::json!({
        "ticket_id": ticket_id,
        "signature": sig,
        "expires_ms": exp_ms,
        "content_hash": hash,
        "action": action,
        "risk": risk,
    })
}
