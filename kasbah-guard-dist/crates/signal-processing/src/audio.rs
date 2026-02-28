//! Audio preprocessing for ONNX model input pipelines.
//!
//! Provides WAV loading, normalization, MFCC extraction (FFT → mel filterbank
//! → DCT), spectrogram extraction, and a ready-made pipeline for the
//! silent-speech detection model.

use rustfft::{FftPlanner, num_complex::Complex};
use crate::errors::{Result, SignalError};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default number of mel filters used when the caller does not specify one.
const DEFAULT_N_MELS: usize = 40;

/// Pre-emphasis coefficient applied before framing.
const PRE_EMPHASIS: f32 = 0.97;

// ---------------------------------------------------------------------------
// AudioPreprocessor
// ---------------------------------------------------------------------------

/// Stateless collection of audio preprocessing operations.
///
/// All methods are pure functions; the struct carries no mutable state and is
/// cheap to construct.  Create one per thread or share behind an `Arc`.
pub struct AudioPreprocessor {
    fft_planner: std::sync::Mutex<FftPlanner<f32>>,
}

impl AudioPreprocessor {
    /// Create a new `AudioPreprocessor`.  Constructing the FFT planner is the
    /// only non-trivial work done here.
    pub fn new() -> Self {
        Self {
            fft_planner: std::sync::Mutex::new(FftPlanner::new()),
        }
    }

    // -----------------------------------------------------------------------
    // WAV I/O
    // -----------------------------------------------------------------------

    /// Load a mono or stereo WAV file and return a flat `f32` sample buffer.
    ///
    /// * For 16-bit PCM the samples are scaled to `[-1.0, 1.0]`.
    /// * For 32-bit float PCM the samples are passed through unchanged.
    /// * Stereo files are down-mixed to mono by averaging the two channels.
    pub fn load_wav(&self, path: &str) -> Result<Vec<f32>> {
        let mut reader = hound::WavReader::open(path).map_err(|e| {
            SignalError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
        })?;

        let spec = reader.spec();

        let samples: Vec<f32> = match (spec.sample_format, spec.bits_per_sample) {
            (hound::SampleFormat::Int, 16) => {
                let raw: std::result::Result<Vec<i16>, _> =
                    reader.samples::<i16>().collect();
                let raw = raw.map_err(|e| {
                    SignalError::InvalidFormat(format!("WAV read error: {e}"))
                })?;
                raw.iter().map(|&s| s as f32 / 32768.0_f32).collect()
            }
            (hound::SampleFormat::Int, 32) => {
                let raw: std::result::Result<Vec<i32>, _> =
                    reader.samples::<i32>().collect();
                let raw = raw.map_err(|e| {
                    SignalError::InvalidFormat(format!("WAV read error: {e}"))
                })?;
                raw.iter()
                    .map(|&s| s as f32 / 2_147_483_648.0_f32)
                    .collect()
            }
            (hound::SampleFormat::Float, 32) => {
                let raw: std::result::Result<Vec<f32>, _> =
                    reader.samples::<f32>().collect();
                raw.map_err(|e| SignalError::InvalidFormat(format!("WAV read error: {e}")))?
            }
            (fmt, bits) => {
                return Err(SignalError::UnsupportedFormat(format!(
                    "WAV format {fmt:?} {bits}-bit is not supported"
                )));
            }
        };

        // Down-mix stereo → mono
        if spec.channels == 2 {
            let mono: Vec<f32> = samples
                .chunks(2)
                .map(|c| (c[0] + c[1]) * 0.5)
                .collect();
            return Ok(mono);
        }

        if spec.channels != 1 {
            return Err(SignalError::UnsupportedFormat(format!(
                "Only mono and stereo WAV files are supported; got {} channels",
                spec.channels
            )));
        }

        Ok(samples)
    }

    // -----------------------------------------------------------------------
    // Basic transformations
    // -----------------------------------------------------------------------

    /// Peak-normalize a sample buffer so that the maximum absolute value is
    /// exactly `1.0`.  Returns the buffer unchanged if it is all-zeros.
    pub fn normalize(&self, mut samples: Vec<f32>) -> Vec<f32> {
        let peak = samples
            .iter()
            .map(|s| s.abs())
            .fold(0.0_f32, f32::max);

        if peak > 0.0 {
            let inv = 1.0 / peak;
            for s in &mut samples {
                *s *= inv;
            }
        }
        samples
    }

    // -----------------------------------------------------------------------
    // Spectrogram
    // -----------------------------------------------------------------------

    /// Compute a power spectrogram using short-time Fourier transform.
    ///
    /// Returns a 2-D vector `[frames][bins]` where `bins = fft_size / 2 + 1`.
    /// A Hann window is applied to each frame before the FFT.
    pub fn extract_spectrogram(
        &self,
        samples: &[f32],
        fft_size: usize,
        hop_size: usize,
    ) -> Result<Vec<Vec<f32>>> {
        if samples.is_empty() {
            return Err(SignalError::ProcessingError(
                "Cannot compute spectrogram of empty sample buffer".into(),
            ));
        }
        if fft_size == 0 || hop_size == 0 {
            return Err(SignalError::ProcessingError(
                "fft_size and hop_size must be > 0".into(),
            ));
        }

        let window = hann_window(fft_size);
        let n_bins = fft_size / 2 + 1;
        let fft = {
            let mut planner = self.fft_planner.lock().unwrap();
            planner.plan_fft_forward(fft_size)
        };

        let mut frames: Vec<Vec<f32>> = Vec::new();
        let mut start = 0usize;

        while start + fft_size <= samples.len() {
            let frame = &samples[start..start + fft_size];

            // Apply window
            let mut buf: Vec<Complex<f32>> = frame
                .iter()
                .zip(window.iter())
                .map(|(&s, &w)| Complex::new(s * w, 0.0))
                .collect();

            fft.process(&mut buf);

            // Power spectrum (one-sided)
            let power: Vec<f32> = buf[..n_bins]
                .iter()
                .map(|c| c.norm_sqr())
                .collect();

            frames.push(power);
            start += hop_size;
        }

        if frames.is_empty() {
            return Err(SignalError::ProcessingError(format!(
                "Signal length ({}) is shorter than fft_size ({})",
                samples.len(),
                fft_size
            )));
        }

        Ok(frames)
    }

    // -----------------------------------------------------------------------
    // MFCC
    // -----------------------------------------------------------------------

    /// Extract Mel-Frequency Cepstral Coefficients.
    ///
    /// Pipeline:
    /// 1. Pre-emphasis filter
    /// 2. STFT with `fft_size = 512`, `hop_size = 160` (fixed for MFCC)
    /// 3. Mel filterbank (40 filters by default)
    /// 4. Log compression
    /// 5. DCT-II to obtain `n_mfcc` coefficients per frame
    ///
    /// Returns `[frames][n_mfcc]`.
    pub fn extract_mfcc(
        &self,
        samples: &[f32],
        sample_rate: u32,
        n_mfcc: usize,
    ) -> Result<Vec<Vec<f32>>> {
        if samples.is_empty() {
            return Err(SignalError::ProcessingError(
                "Cannot extract MFCC from empty sample buffer".into(),
            ));
        }
        if n_mfcc == 0 {
            return Err(SignalError::ProcessingError("n_mfcc must be > 0".into()));
        }

        // 1. Pre-emphasis
        let emphasized = pre_emphasis(samples, PRE_EMPHASIS);

        // 2. Power spectrogram
        let fft_size = 512usize;
        let hop_size = 160usize;
        let spectrogram = self.extract_spectrogram(&emphasized, fft_size, hop_size)?;

        let n_bins = fft_size / 2 + 1;

        // 3. Mel filterbank
        let filterbank = mel_filterbank(DEFAULT_N_MELS, n_bins, sample_rate, 0.0, None);

        // 4. Apply filterbank + log
        let mel_frames: Vec<Vec<f32>> = spectrogram
            .iter()
            .map(|frame| {
                filterbank
                    .iter()
                    .map(|filter| {
                        let energy: f32 = filter.iter().zip(frame.iter()).map(|(f, p)| f * p).sum();
                        (energy + 1e-10_f32).ln()
                    })
                    .collect()
            })
            .collect();

        // 5. DCT-II
        let n_mfcc_clamped = n_mfcc.min(DEFAULT_N_MELS);
        let mfcc_frames: Vec<Vec<f32>> = mel_frames
            .iter()
            .map(|mel| dct2(mel, n_mfcc_clamped))
            .collect();

        Ok(mfcc_frames)
    }

    // -----------------------------------------------------------------------
    // Silent-speech pipeline
    // -----------------------------------------------------------------------

    /// End-to-end preprocessing pipeline for the silent-speech ONNX model.
    ///
    /// Steps:
    /// 1. Load WAV
    /// 2. Peak-normalize
    /// 3. Extract 13 MFCCs + delta + delta-delta (total 39 features per frame)
    /// 4. Flatten to a 1-D `f32` vector ready for ONNX `Array2<f32>` reshaping.
    ///
    /// The caller is responsible for reshaping the output to the model's
    /// expected `[batch, frames, 39]` tensor.
    pub fn preprocess_for_silent_speech(&self, samples: &[f32]) -> Result<Vec<f32>> {
        if samples.is_empty() {
            return Err(SignalError::ProcessingError(
                "Sample buffer is empty".into(),
            ));
        }

        // Normalize
        let normalized = self.normalize(samples.to_vec());

        // Extract 13 MFCCs per frame
        // (sample_rate is embedded in the pipeline; use 16 kHz — standard for
        //  speech models.  The caller must ensure the WAV was recorded at 16 kHz
        //  or resampled before calling this function.)
        let mfcc = self.extract_mfcc(&normalized, 16_000, 13)?;

        // Compute delta and delta-delta coefficients
        let delta = compute_delta(&mfcc);
        let delta2 = compute_delta(&delta);

        // Interleave: [mfcc(13), delta(13), delta_delta(13)] = 39 per frame
        let mut flat: Vec<f32> = Vec::with_capacity(mfcc.len() * 39);
        for i in 0..mfcc.len() {
            flat.extend_from_slice(&mfcc[i]);
            flat.extend_from_slice(&delta[i]);
            flat.extend_from_slice(&delta2[i]);
        }

        Ok(flat)
    }
}

impl Default for AudioPreprocessor {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Free functions (internal helpers)
// ---------------------------------------------------------------------------

/// Apply a first-order high-pass pre-emphasis filter: y[n] = x[n] - α·x[n-1].
fn pre_emphasis(samples: &[f32], alpha: f32) -> Vec<f32> {
    let mut out = vec![0.0_f32; samples.len()];
    if samples.is_empty() {
        return out;
    }
    out[0] = samples[0];
    for i in 1..samples.len() {
        out[i] = samples[i] - alpha * samples[i - 1];
    }
    out
}

/// Generate a Hann analysis window of length `n`.
fn hann_window(n: usize) -> Vec<f32> {
    (0..n)
        .map(|i| {
            0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (n as f32 - 1.0)).cos())
        })
        .collect()
}

/// Convert Hz to the mel scale (O'Shaughnessy formula).
#[inline]
fn hz_to_mel(hz: f32) -> f32 {
    2595.0 * (1.0 + hz / 700.0).log10()
}

/// Convert mel to Hz.
#[inline]
fn mel_to_hz(mel: f32) -> f32 {
    700.0 * (10.0_f32.powf(mel / 2595.0) - 1.0)
}

/// Build a triangular mel filterbank.
///
/// Returns a 2-D matrix `[n_mels][n_fft_bins]` where each row is one filter.
fn mel_filterbank(
    n_mels: usize,
    n_fft_bins: usize,
    sample_rate: u32,
    f_min: f32,
    f_max: Option<f32>,
) -> Vec<Vec<f32>> {
    let f_max = f_max.unwrap_or(sample_rate as f32 / 2.0);
    let mel_min = hz_to_mel(f_min);
    let mel_max = hz_to_mel(f_max);

    // n_mels + 2 equally spaced points on the mel scale
    let n_points = n_mels + 2;
    let mel_points: Vec<f32> = (0..n_points)
        .map(|i| mel_min + (mel_max - mel_min) * i as f32 / (n_points as f32 - 1.0))
        .collect();

    // Convert back to Hz, then to FFT bin indices
    let bin_points: Vec<f32> = mel_points
        .iter()
        .map(|&m| mel_to_hz(m) / (sample_rate as f32 / 2.0) * (n_fft_bins as f32 - 1.0))
        .collect();

    let mut filters = vec![vec![0.0_f32; n_fft_bins]; n_mels];

    for m in 0..n_mels {
        let f_left = bin_points[m];
        let f_center = bin_points[m + 1];
        let f_right = bin_points[m + 2];

        for k in 0..n_fft_bins {
            let k_f = k as f32;
            if k_f >= f_left && k_f <= f_center {
                let denom = f_center - f_left;
                if denom > 0.0 {
                    filters[m][k] = (k_f - f_left) / denom;
                }
            } else if k_f > f_center && k_f <= f_right {
                let denom = f_right - f_center;
                if denom > 0.0 {
                    filters[m][k] = (f_right - k_f) / denom;
                }
            }
        }
    }

    filters
}

/// Type-II DCT, returning the first `n_out` coefficients.
///
/// DCT-II: `X[k] = 2 * Σ x[n] * cos(π*k*(2n+1) / (2N))` for k = 0..N-1
fn dct2(input: &[f32], n_out: usize) -> Vec<f32> {
    let n = input.len() as f32;
    let n_int = input.len();
    (0..n_out)
        .map(|k| {
            let sum: f32 = input
                .iter()
                .enumerate()
                .map(|(i, &x)| {
                    x * (std::f32::consts::PI * k as f32 * (2 * i + 1) as f32 / (2.0 * n)).cos()
                })
                .sum();
            // Orthogonal normalisation factor
            let scale = if k == 0 {
                (1.0 / n_int as f32).sqrt()
            } else {
                (2.0 / n_int as f32).sqrt()
            };
            sum * scale
        })
        .collect()
}

/// Compute first-order delta (difference) coefficients for a sequence of
/// feature vectors, using a 2-frame context window on each side.
fn compute_delta(frames: &[Vec<f32>]) -> Vec<Vec<f32>> {
    let n_frames = frames.len();
    if n_frames == 0 {
        return Vec::new();
    }
    let n_feat = frames[0].len();
    let context = 2usize;
    let denominator: f32 = (1..=context).map(|i| 2 * i * i).sum::<usize>() as f32;

    (0..n_frames)
        .map(|t| {
            (0..n_feat)
                .map(|f| {
                    let num: f32 = (1..=context)
                        .map(|n| {
                            let fwd = frames[t.saturating_add(n).min(n_frames - 1)][f];
                            let bwd = frames[t.saturating_sub(n)][f];
                            n as f32 * (fwd - bwd)
                        })
                        .sum();
                    num / denominator
                })
                .collect()
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_peak() {
        let p = AudioPreprocessor::new();
        let samples = vec![0.0, 0.5, -1.0, 0.25];
        let normed = p.normalize(samples);
        let peak = normed.iter().map(|s| s.abs()).fold(0.0_f32, f32::max);
        assert!((peak - 1.0).abs() < 1e-6, "peak should be 1.0, got {peak}");
    }

    #[test]
    fn normalize_all_zeros_is_stable() {
        let p = AudioPreprocessor::new();
        let samples = vec![0.0_f32; 100];
        let normed = p.normalize(samples);
        assert!(normed.iter().all(|&s| s == 0.0));
    }

    #[test]
    fn spectrogram_shape() {
        let p = AudioPreprocessor::new();
        // 1-second synthetic signal at 16 kHz
        let samples: Vec<f32> = (0..16_000)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 16_000.0).sin())
            .collect();
        let spec = p.extract_spectrogram(&samples, 512, 160).unwrap();
        assert!(!spec.is_empty(), "spectrogram must have frames");
        assert_eq!(spec[0].len(), 257, "bins = fft_size/2 + 1 = 257");
    }

    #[test]
    fn mfcc_shape() {
        let p = AudioPreprocessor::new();
        let samples: Vec<f32> = (0..16_000)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 16_000.0).sin())
            .collect();
        let mfcc = p.extract_mfcc(&samples, 16_000, 13).unwrap();
        assert!(!mfcc.is_empty());
        assert_eq!(mfcc[0].len(), 13);
    }

    #[test]
    fn silent_speech_output_is_multiple_of_39() {
        let p = AudioPreprocessor::new();
        let samples: Vec<f32> = (0..16_000)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 16_000.0).sin() * 0.3)
            .collect();
        let flat = p.preprocess_for_silent_speech(&samples).unwrap();
        assert_eq!(flat.len() % 39, 0, "output length must be a multiple of 39");
    }

    #[test]
    fn hann_window_edges_near_zero() {
        let w = hann_window(512);
        assert!(w[0].abs() < 1e-6);
        assert!(w[511].abs() < 1e-3);
    }

    #[test]
    fn mel_filterbank_sums_to_positive() {
        let fb = mel_filterbank(40, 257, 16_000, 0.0, None);
        assert_eq!(fb.len(), 40);
        for row in &fb {
            let s: f32 = row.iter().sum();
            assert!(s > 0.0, "each filter must have positive area");
        }
    }
}
