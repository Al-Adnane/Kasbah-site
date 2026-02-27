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
