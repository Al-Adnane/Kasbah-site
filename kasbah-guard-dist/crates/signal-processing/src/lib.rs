//! # kasbah-signal-processing
//!
//! Audio and video signal preprocessing for ONNX inference pipelines used by
//! Kasbah Guard.
//!
//! ## Modules
//!
//! | Module      | Primary Type         | Purpose                                      |
//! |-------------|----------------------|----------------------------------------------|
//! | `audio`     | `AudioPreprocessor`  | WAV loading, MFCC, spectrogram, silent-speech pipeline |
//! | `video`     | `VideoFrameExtractor`| Image loading, resize, artifact detection, camera pipeline |
//! | `features`  | `FeatureExtractor`   | Shannon entropy, ZCR, RMS, spectral centroid, 30-D feature vector |
//! | `errors`    | `SignalError`        | Unified error enum (`IoError`, `InvalidFormat`, `ProcessingError`, `UnsupportedFormat`) |
//!
//! ## Quick start
//!
//! ```rust,ignore
//! use kasbah_signal_processing::{AudioPreprocessor, FeatureExtractor};
//!
//! let audio = AudioPreprocessor::new();
//! let samples = audio.load_wav("speech.wav")?;
//! let samples = audio.normalize(samples);
//! let flat = audio.preprocess_for_silent_speech(&samples)?;
//! // -> feed `flat` into the ONNX LSTM model, reshaping to [1, frames, 39]
//!
//! let fe = FeatureExtractor::new();
//! let features = fe.build_feature_vector(&samples, 16_000)?;
//! // -> 30-dimensional f32 vector for lightweight classifiers
//! ```
//!
//! ## Model pipelines
//!
//! * **Silent-speech detection** (`models/silent-speech/`) — LSTM+attention model.
//!   Use [`AudioPreprocessor::preprocess_for_silent_speech`] to produce a flat
//!   `[frames × 39]` f32 input tensor.
//!
//! * **Camera-artifact detection** (`models/camera-artifacts/`) — EfficientNet CNN.
//!   Use [`VideoFrameExtractor::preprocess_for_camera_artifacts`] to produce a
//!   `[target_size² × 3 + 1]` f32 input tensor (pixel values + artifact score).

pub mod audio;
pub mod video;
pub mod features;
pub mod errors;

pub use audio::AudioPreprocessor;
pub use video::VideoFrameExtractor;
pub use features::FeatureExtractor;
pub use errors::SignalError;
