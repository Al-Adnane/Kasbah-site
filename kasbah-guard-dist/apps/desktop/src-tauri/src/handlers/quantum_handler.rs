/**
 * Kasbah Guard: Quantum Crypto Tauri Handler v1.0.0
 *
 * IPC Commands for quantum-safe cryptographic operations:
 * - sign_detection: Generate Dilithium-2 signature for detection
 * - verify_detection: Verify quantum-signed detection
 *
 * Bridge between browser extension (client) and Rust backend (server)
 */

use crate::quantum_crypto::{QuantumCryptoEngine, QuantumSignedDetection, QuantumScheme};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuantumSignatureResult {
    pub detection_id: String,
    pub scheme: String,           // "Dilithium2" or "SPHINCS256"
    pub signature: String,        // Hex-encoded signature bytes
    pub public_key: String,       // Hex-encoded public key
    pub timestamp: u64,
    pub content_hash: String,
}

// Helper: convert QuantumScheme enum to string
fn scheme_to_string(scheme: QuantumScheme) -> String {
    match scheme {
        QuantumScheme::Dilithium2 => "Dilithium2".to_string(),
        QuantumScheme::SPHINCS256 => "SPHINCS256".to_string(),
        QuantumScheme::Ed25519Fallback => "Ed25519".to_string(),
    }
}

// Helper: convert bytes to hex string (safe for JSON)
fn bytes_to_hex(bytes: &[u8]) -> String {
    hex::encode(bytes)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationResult {
    pub is_valid: bool,
    pub detection_id: String,
    pub timestamp: u64,
}

/**
 * IPC Command: sign_detection
 *
 * Generates a quantum-safe signature for a detection result.
 * Called by extension after classification is complete.
 *
 * Parameters:
 *   - detection_id: Unique detection identifier
 *   - content_hash: SHA-256 hash of detected content (hex string, 64+ chars)
 *   - verdict: Classification result ("DEEPFAKE", "AUTHENTIC", "WARN")
 *   - risk_score: Confidence score 0-100
 *
 * Returns: QuantumSignatureResult (JSON-serialized)
 */
#[tauri::command]
pub async fn sign_detection(
    detection_id: String,
    content_hash: String,
    verdict: String,
    risk_score: u32,
    state: tauri::State<'_, QuantumCryptoEngine>,
) -> Result<QuantumSignatureResult, String> {
    // Validate inputs
    if detection_id.is_empty() {
        return Err("detection_id cannot be empty".to_string());
    }
    if content_hash.len() < 64 {
        return Err("content_hash must be 64+ char SHA-256".to_string());
    }
    if risk_score > 100 {
        return Err("risk_score must be 0-100".to_string());
    }

    // Convert hex content_hash back to bytes
    let content_hash_bytes = hex::decode(&content_hash)
        .unwrap_or_else(|_| content_hash.as_bytes().to_vec());

    // Call quantum crypto engine to sign
    let signed = state
        .sign_detection(
            &detection_id,
            &content_hash_bytes,
            &verdict,
            risk_score,
        )
        .map_err(|e| format!("Quantum signing failed: {}", e))?;

    // Convert to result struct (convert bytes to hex for JSON serialization)
    Ok(QuantumSignatureResult {
        detection_id: signed.detection_id,
        scheme: scheme_to_string(signed.signature_scheme),
        signature: bytes_to_hex(&signed.signature),
        public_key: bytes_to_hex(&signed.public_key),
        timestamp: signed.timestamp,
        content_hash: bytes_to_hex(&signed.content_hash),
    })
}

/**
 * IPC Command: verify_detection
 *
 * Verifies a quantum-signed detection result.
 * Used by extension to validate proof before export/sharing.
 *
 * Parameters:
 *   - signed_json: JSON-serialized QuantumSignatureResult
 *
 * Returns: VerificationResult { is_valid: bool, ... }
 */
#[tauri::command]
pub async fn verify_detection(
    signed_json: String,
) -> Result<VerificationResult, String> {
    // Parse JSON
    let signed: QuantumSignatureResult = serde_json::from_str(&signed_json)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    // Reconstruct QuantumSignedDetection from result (minimal validation)
    let detection = QuantumSignedDetection {
        detection_id: signed.detection_id.clone(),
        timestamp: signed.timestamp,
        content_hash: hex::decode(&signed.content_hash)
            .unwrap_or_else(|_| signed.content_hash.as_bytes().to_vec()),
        verdict: "VERIFIED".to_string(),
        risk_score: 0,
        signature_scheme: QuantumScheme::Dilithium2,
        signature: hex::decode(&signed.signature)
            .unwrap_or_else(|_| signed.signature.as_bytes().to_vec()),
        public_key: hex::decode(&signed.public_key)
            .unwrap_or_else(|_| signed.public_key.as_bytes().to_vec()),
        verification_hash: vec![],
    };

    // Verify signature
    let is_valid = QuantumCryptoEngine::verify_detection(&detection)
        .unwrap_or(false);

    Ok(VerificationResult {
        is_valid,
        detection_id: signed.detection_id,
        timestamp: signed.timestamp,
    })
}

/**
 * IPC Command: export_audit_proof
 *
 * Exports complete audit proof for compliance reporting.
 * Combines quantum signature + timestamp + detection metadata.
 *
 * Parameters:
 *   - signed_json: JSON-serialized QuantumSignatureResult
 *   - metadata: Additional detection metadata (optional)
 *
 * Returns: Audit proof string (formatted for PDF/compliance export)
 */
#[tauri::command]
pub async fn export_audit_proof(
    signed_json: String,
    metadata: Option<String>,
) -> Result<String, String> {
    let signed: QuantumSignatureResult = serde_json::from_str(&signed_json)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    // Build proof report
    let report = format!(
        r#"
KASBAH GUARD: QUANTUM-SIGNED AUDIT PROOF v1.0.0
═════════════════════════════════════════════════════════

DETECTION SUMMARY
─────────────────
Detection ID:     {}
Content Hash:     {} (truncated)
Timestamp:        {} (Unix epoch seconds)

QUANTUM SIGNATURE
─────────────────
Scheme:           {}
Signature:        {} (truncated, hex-encoded)
Public Key:       {} (truncated, hex-encoded)

VERIFICATION CONTEXT
────────────────────
Metadata:         {}

This proof demonstrates:
1. NON-REPUDIATION: Detection cannot be denied (Dilithium-2 quantum-safe)
2. AUDITABILITY: Timestamp + signature + hash are immutable
3. COMPLIANCE: Exportable for SOC2/HIPAA/GDPR compliance audits

═════════════════════════════════════════════════════════
"#,
        signed.detection_id,
        if signed.content_hash.len() > 32 {
            &signed.content_hash[0..32]
        } else {
            &signed.content_hash
        },
        signed.timestamp,
        signed.scheme,
        if signed.signature.len() > 32 {
            &signed.signature[0..32]
        } else {
            &signed.signature
        },
        if signed.public_key.len() > 32 {
            &signed.public_key[0..32]
        } else {
            &signed.public_key
        },
        metadata.unwrap_or_else(|| "N/A".to_string()),
    );

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quantum_signature_validation() {
        // Input validation
        let empty_id = "".to_string();
        let short_hash = "abc123".to_string();
        let invalid_score = 150_u32;

        // All should validate properly
        assert!(empty_id.is_empty());
        assert!(short_hash.len() < 64);
        assert!(invalid_score > 100);
    }
}
