use wasm_bindgen::prelude::*;
use kasbah_kernel::policy_preflight;
use kasbah_kernel::audit::content_hash;
use serde::Serialize;

#[derive(Serialize)]
struct ClassifyResult {
    risk: u16,
    decision: String,
    reason: String,
    content_hash: String,
}

#[wasm_bindgen]
pub fn classify(text: &str) -> String {
    let (risk, decision, reason) = policy_preflight(text);
    let hash = content_hash(text);
    let result = ClassifyResult {
        risk,
        decision,
        reason,
        content_hash: hash,
    };
    serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
}

#[wasm_bindgen]
pub fn get_risk(text: &str) -> u16 {
    let (risk, _, _) = policy_preflight(text);
    risk
}

#[wasm_bindgen]
pub fn get_decision(text: &str) -> String {
    let (_, decision, _) = policy_preflight(text);
    decision
}

#[wasm_bindgen]
pub fn hash_content(text: &str) -> String {
    content_hash(text)
}

// --- Moat F: System Integrity Index ---

#[wasm_bindgen]
pub fn calculate_sii(
    hook_integrity: f32,
    pattern_integrity: f32,
    session_health: f32,
    latency_norm: f32,
) -> f32 {
    kasbah_kernel::integrity::calculate_sii(
        hook_integrity,
        pattern_integrity,
        session_health,
        latency_norm,
    )
}

// --- Moat O: Three-Gate Execution ---

#[wasm_bindgen]
pub fn authorize_execution(reliability: f32, brittleness: f32, harm: f32) -> String {
    let result = kasbah_kernel::gate::authorize_execution(reliability, brittleness, harm);
    serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
}

// --- Moat K: Capability Check ---

#[wasm_bindgen]
pub fn check_capability(resource: &str, action: &str, rows: u32, capability_json: &str) -> String {
    let cap: Result<kasbah_kernel::capabilities::Capability, _> =
        serde_json::from_str(capability_json);
    match cap {
        Ok(c) => {
            let req = kasbah_kernel::capabilities::CapabilityRequest {
                resource: resource.to_string(),
                action: action.to_string(),
                rows,
            };
            match kasbah_kernel::capabilities::check_capability(&req, &c) {
                Ok(()) => r#"{"authorized":true}"#.to_string(),
                Err(reason) => format!(r#"{{"authorized":false,"reason":"{}"}}"#, reason),
            }
        }
        Err(e) => format!(r#"{{"authorized":false,"reason":"Invalid capability: {}"}}"#, e),
    }
}
