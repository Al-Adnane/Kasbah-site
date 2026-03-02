/**
 * Kasbah Guard: Tauri IPC Handlers Module v1.0.0
 *
 * Central hub for all Tauri command handlers:
 * - Quantum crypto operations (Dilithium-2, SPHINCS+)
 * - Future extensibility for ZK proofs, blockchain operations
 */

pub mod quantum_handler;

pub use quantum_handler::{
    sign_detection, verify_detection, export_audit_proof,
    QuantumSignatureResult, VerificationResult,
};
