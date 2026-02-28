//! Error types for kasbah-signal-processing.
//!
//! All public APIs return `Result<T, SignalError>` (or `anyhow::Result` which
//! wraps it). Downstream crates (e.g. kasbah-onnx-runtime) can match on these
//! variants to decide whether to retry, skip a frame, or abort.

use thiserror::Error;

/// Unified error type for the signal-processing crate.
#[derive(Debug, Error)]
pub enum SignalError {
    /// Underlying I/O failure (file not found, permission denied, etc.)
    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),

    /// The file exists but its contents are not in an expected format
    /// (e.g. a WAV file with an unsupported bit-depth, or a truncated JPEG).
    #[error("Invalid format: {0}")]
    InvalidFormat(String),

    /// A mathematical or algorithmic step failed during processing
    /// (e.g. FFT size mismatch, empty sample buffer, singular matrix).
    #[error("Processing error: {0}")]
    ProcessingError(String),

    /// The file format is syntactically valid but is not supported by this
    /// crate (e.g. multi-channel WAV when mono is required, 16-bit float PCM).
    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),
}

/// Convenience alias used throughout the crate.
pub type Result<T> = std::result::Result<T, SignalError>;
