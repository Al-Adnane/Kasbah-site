/// Error types for ONNX runtime

use thiserror::Error;

pub type Result<T> = std::result::Result<T, OnnxError>;

#[derive(Error, Debug)]
pub enum OnnxError {
    #[error("Model not found: {0}")]
    ModelNotFound(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Invalid model: {0}")]
    InvalidModel(String),

    #[error("Inference error: {0}")]
    InferenceError(String),

    #[error("IO error: {0}")]
    IoError(String),

    #[error("Batching error: {0}")]
    BatchingError(String),

    #[error("Cache error: {0}")]
    CacheError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Model version mismatch: expected {expected}, got {actual}")]
    VersionMismatch { expected: String, actual: String },

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Fallback inference required")]
    FallbackRequired,

    #[error("Unsupported operation: {0}")]
    Unsupported(String),

    #[error("Unknown error")]
    Unknown,
}

/// Convert ORT errors to OnnxError
impl From<String> for OnnxError {
    fn from(err: String) -> Self {
        OnnxError::InferenceError(err)
    }
}

/// Recovery strategies for errors
impl OnnxError {
    pub fn is_recoverable(&self) -> bool {
        matches!(
            self,
            OnnxError::Timeout(_)
                | OnnxError::FallbackRequired
                | OnnxError::InferenceError(_)
        )
    }

    pub fn should_use_fallback(&self) -> bool {
        matches!(
            self,
            OnnxError::ModelNotFound(_) | OnnxError::FallbackRequired
        )
    }
}
