use thiserror::Error;

#[derive(Error, Debug)]
pub enum EbpfError {
    #[error("Ticket denied: risk score {0:.2} exceeds threshold")]
    RiskTooHigh(f32),

    #[error("Ticket not found: {0}")]
    NotFound(String),

    #[error("Ticket expired")]
    Expired,

    #[error("Ticket revoked")]
    Revoked,

    #[error("Invalid signature")]
    InvalidSignature,

    #[error("Crypto error: {0}")]
    CryptoError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Invalid hex encoding: {0}")]
    HexError(String),

    #[error("Invalid key material: {0}")]
    KeyError(String),
}

impl From<hex::FromHexError> for EbpfError {
    fn from(e: hex::FromHexError) -> Self {
        EbpfError::HexError(e.to_string())
    }
}

impl From<serde_json::Error> for EbpfError {
    fn from(e: serde_json::Error) -> Self {
        EbpfError::SerializationError(e.to_string())
    }
}
