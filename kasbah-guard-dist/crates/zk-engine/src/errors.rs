/// ZK Engine errors

use thiserror::Error;

pub type Result<T> = std::result::Result<T, ZkError>;

#[derive(Error, Debug)]
pub enum ZkError {
    #[error("Circuit error: {0}")]
    CircuitError(String),

    #[error("Proving error: {0}")]
    ProvingError(String),

    #[error("Verification error: {0}")]
    VerificationError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Unknown error")]
    Unknown,
}
