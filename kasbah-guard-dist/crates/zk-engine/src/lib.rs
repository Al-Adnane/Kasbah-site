/// Zero-Knowledge Proof Engine
///
/// Generates and verifies ZK proofs for:
/// - Detection result validity
/// - User identity privacy
/// - Audit trail integrity
///
/// Uses arkworks framework with Groth16 and Plonk support

pub mod circuits;
pub mod prover;
pub mod verifier;
pub mod errors;
pub mod utils;

pub use circuits::DetectionCircuit;
pub use prover::ProofProver;
pub use verifier::ProofVerifier;
pub use errors::{Result, ZkError};

use std::sync::Arc;

/// ZK Engine facade
pub struct ZkEngine {
    prover: Arc<ProofProver>,
    verifier: Arc<ProofVerifier>,
}

impl ZkEngine {
    /// Initialize ZK engine
    pub fn new() -> Result<Self> {
        Ok(Self {
            prover: Arc::new(ProofProver::new()?),
            verifier: Arc::new(ProofVerifier::new()?),
        })
    }

    /// Generate ZK proof for detection result
    pub fn prove_detection_result(
        &self,
        detection_result: &DetectionResult,
        witness: DetectionWitness,
    ) -> Result<DetectionProof> {
        self.prover.prove_detection(detection_result, witness)
    }

    /// Verify ZK proof
    pub fn verify_proof(&self, proof: &DetectionProof) -> Result<bool> {
        self.verifier.verify(proof)
    }

    /// Generate Merkle proof for audit trail
    pub fn prove_audit_trail(&self, events: Vec<AuditEvent>) -> Result<AuditProof> {
        self.prover.prove_audit_trail(events)
    }
}

impl Default for ZkEngine {
    fn default() -> Self {
        Self::new().expect("Failed to initialize ZK engine")
    }
}

/// Detection result to be proved
#[derive(Clone, Debug)]
pub struct DetectionResult {
    pub model_id: String,
    pub risk_score: f32,
    pub decision: String,
    pub timestamp: u64,
    pub content_hash: Vec<u8>,
}

/// Witness data for detection proof
#[derive(Clone, Debug)]
pub struct DetectionWitness {
    pub model_weights_hash: Vec<u8>,
    pub input_data: Vec<f32>,
    pub output_data: Vec<f32>,
}

/// Detection proof
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct DetectionProof {
    pub proof_bytes: Vec<u8>,
    pub public_inputs: Vec<u8>,
    pub proof_type: String,  // "groth16" or "plonk"
}

/// Audit event for trail proof
#[derive(Clone, Debug)]
pub struct AuditEvent {
    pub event_id: String,
    pub timestamp: u64,
    pub event_type: String,
    pub data_hash: Vec<u8>,
}

/// Audit trail proof (Merkle proof)
#[derive(Clone, Debug)]
pub struct AuditProof {
    pub root_hash: Vec<u8>,
    pub leaf_hashes: Vec<Vec<u8>>,
    pub path: Vec<(Vec<u8>, bool)>,  // (hash, is_right_sibling)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zk_engine_initialization() {
        let engine = ZkEngine::new();
        assert!(engine.is_ok());
    }

    #[test]
    fn test_proof_structure() {
        let proof = DetectionProof {
            proof_bytes: vec![1, 2, 3, 4],
            public_inputs: vec![5, 6, 7, 8],
            proof_type: "groth16".to_string(),
        };

        assert_eq!(proof.proof_type, "groth16");
    }
}
