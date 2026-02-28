//! General signal feature extraction used by both audio and video pipelines.
//!
//! All features operate on `f32` slices and return scalar values or flat
//! vectors that can be concatenated into a feature vector for ONNX models.

use crate::errors::{Result, SignalError};
use crate::audio::AudioPreprocessor;

// ---------------------------------------------------------------------------
// FeatureExtractor
// ---------------------------------------------------------------------------

/// Stateless collection of signal feature extractors.
///
/// Methods operate on raw `f32` sample arrays.  The struct itself holds no
/// buffers; construct once and reuse freely across threads.
pub struct FeatureExtractor {
    audio: AudioPreprocessor,
}

impl FeatureExtractor {
    /// Create a new `FeatureExtractor`.
    pub fn new() -> Self {
        Self {
            audio: AudioPreprocessor::new(),
        }
    }

    // -----------------------------------------------------------------------
    // Scalar features
    // -----------------------------------------------------------------------

    /// Shannon entropy of the sample distribution.
    ///
    /// The signal is bucketed into 256 uniform bins over `[min, max]`.
    /// Returns `0.0` for empty or constant signals.
    pub fn extract_entropy(&self, data: &[f32]) -> f32 {
        if data.len() < 2 {
            return 0.0;
        }

        let min = data.iter().cloned().fold(f32::INFINITY, f32::min);
        let max = data.iter().cloned().fold(f32::NEG_INFINITY, f32::max);

        if (max - min).abs() < 1e-10 {
            return 0.0; // constant signal → zero entropy
        }

        const N_BINS: usize = 256;
        let mut counts = vec![0u64; N_BINS];
        let scale = (N_BINS - 1) as f32 / (max - min);

        for &v in data {
            let bin = ((v - min) * scale) as usize;
            counts[bin.min(N_BINS - 1)] += 1;
        }

        let n = data.len() as f32;
        let entropy: f32 = counts
            .iter()
            .filter(|&&c| c > 0)
            .map(|&c| {
                let p = c as f32 / n;
                -p * p.ln()
            })
            .sum();

        // Normalise by maximum possible entropy (log N_BINS)
        entropy / (N_BINS as f32).ln()
    }

    /// Zero-crossing rate: the fraction of consecutive sample pairs that
    /// cross zero.
    ///
    /// Returns a value in `[0.0, 1.0]`.  Returns `0.0` for empty or
    /// single-sample buffers.
    pub fn extract_zero_crossing_rate(&self, samples: &[f32]) -> f32 {
        if samples.len() < 2 {
            return 0.0;
        }
        let crossings: usize = samples
            .windows(2)
            .filter(|w| (w[0] >= 0.0) != (w[1] >= 0.0))
            .count();
        crossings as f32 / (samples.len() - 1) as f32
    }

    /// Root-mean-square energy of the signal.
    ///
    /// Returns `0.0` for an empty buffer.
    pub fn extract_rms_energy(&self, samples: &[f32]) -> f32 {
        if samples.is_empty() {
            return 0.0;
        }
        let mean_sq: f32 = samples.iter().map(|&s| s * s).sum::<f32>() / samples.len() as f32;
        mean_sq.sqrt()
    }

    /// Spectral centroid: the amplitude-weighted mean frequency of a power
    /// spectrum.
    ///
    /// `spectrum` is a one-sided power spectrum (e.g. from STFT).
    /// `sample_rate` is used to convert bin indices to Hz.
    ///
    /// Returns `0.0` for an empty or all-zero spectrum.
    pub fn extract_spectral_centroid(&self, spectrum: &[f32], sample_rate: u32) -> f32 {
        if spectrum.is_empty() {
            return 0.0;
        }

        let n_bins = spectrum.len();
        // Frequency resolution: each bin represents (sample_rate / 2) / (n_bins - 1) Hz
        let bin_hz = sample_rate as f32 / 2.0 / (n_bins as f32 - 1.0).max(1.0);

        let (weighted_freq, total_weight): (f32, f32) = spectrum
            .iter()
            .enumerate()
            .fold((0.0, 0.0), |(wf, tw), (i, &power)| {
                (wf + i as f32 * bin_hz * power, tw + power)
            });

        if total_weight < 1e-10 {
            return 0.0;
        }

        weighted_freq / total_weight
    }

    // -----------------------------------------------------------------------
    // Composite feature vector
    // -----------------------------------------------------------------------

    /// Build a compact feature vector from a raw audio signal.
    ///
    /// The vector concatenates per-frame aggregated MFCC statistics and
    /// four global scalar features:
    ///
    /// | Slice            | Length  | Description                          |
    /// |------------------|---------|--------------------------------------|
    /// | `mfcc_means`     | 13      | Mean of each MFCC across all frames  |
    /// | `mfcc_stds`      | 13      | Std-dev of each MFCC across frames   |
    /// | `scalars`        | 4       | ZCR, RMS, entropy, spectral centroid |
    ///
    /// Total: **30** features per audio clip.
    ///
    /// The caller can feed this directly into an ONNX model that expects a
    /// `[1, 30]` float tensor.
    pub fn build_feature_vector(&self, audio: &[f32], sample_rate: u32) -> Result<Vec<f32>> {
        if audio.is_empty() {
            return Err(SignalError::ProcessingError(
                "Cannot build feature vector from empty audio buffer".into(),
            ));
        }

        // --- MFCC statistics (26 features) ----------------------------------
        let mfcc_frames = self.audio.extract_mfcc(audio, sample_rate, 13)?;
        let n_frames = mfcc_frames.len() as f32;

        // Per-coefficient mean and std across frames
        let mut mfcc_means = vec![0.0_f32; 13];
        let mut mfcc_m2 = vec![0.0_f32; 13];   // for Welford online variance

        for frame in &mfcc_frames {
            for (k, &v) in frame.iter().enumerate() {
                mfcc_means[k] += v;
            }
        }
        for m in &mut mfcc_means {
            *m /= n_frames;
        }

        for frame in &mfcc_frames {
            for (k, &v) in frame.iter().enumerate() {
                let diff = v - mfcc_means[k];
                mfcc_m2[k] += diff * diff;
            }
        }
        let mfcc_stds: Vec<f32> = mfcc_m2
            .iter()
            .map(|&m2| (m2 / n_frames).sqrt())
            .collect();

        // --- Scalar features (4 features) -----------------------------------
        let zcr = self.extract_zero_crossing_rate(audio);
        let rms = self.extract_rms_energy(audio);
        let entropy = self.extract_entropy(audio);

        // Use the mean power spectrum for spectral centroid
        let spectrogram = self.audio.extract_spectrogram(audio, 512, 160)?;
        let n_spec_frames = spectrogram.len() as f32;
        let n_bins = spectrogram[0].len();
        let mut mean_spectrum = vec![0.0_f32; n_bins];
        for frame in &spectrogram {
            for (i, &v) in frame.iter().enumerate() {
                mean_spectrum[i] += v / n_spec_frames;
            }
        }
        let centroid = self.extract_spectral_centroid(&mean_spectrum, sample_rate);

        // --- Assemble -------------------------------------------------------
        let mut features = Vec::with_capacity(30);
        features.extend_from_slice(&mfcc_means);   // 13
        features.extend_from_slice(&mfcc_stds);    // 13
        features.push(zcr);                         // 1
        features.push(rms);                         // 1
        features.push(entropy);                     // 1
        features.push(centroid);                    // 1

        debug_assert_eq!(features.len(), 30);
        Ok(features)
    }
}

impl Default for FeatureExtractor {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(hz: f32, sr: u32, secs: f32) -> Vec<f32> {
        let n = (sr as f32 * secs) as usize;
        (0..n)
            .map(|i| (2.0 * std::f32::consts::PI * hz * i as f32 / sr as f32).sin())
            .collect()
    }

    #[test]
    fn entropy_constant_is_zero() {
        let fe = FeatureExtractor::new();
        let data = vec![0.5_f32; 1000];
        assert_eq!(fe.extract_entropy(&data), 0.0);
    }

    #[test]
    fn entropy_range() {
        let fe = FeatureExtractor::new();
        // Uniform noise should have high entropy
        let data: Vec<f32> = (0..10_000).map(|i| ((i * 7 + 3) % 256) as f32 / 255.0).collect();
        let e = fe.extract_entropy(&data);
        assert!(e > 0.8, "expected high entropy, got {e}");
        assert!(e <= 1.0, "entropy must be ≤ 1.0, got {e}");
    }

    #[test]
    fn zcr_sine_wave() {
        let fe = FeatureExtractor::new();
        // A 440 Hz sine at 44100 Hz crosses zero ~2*440/44100 ≈ 1.99% of the time
        let s = sine(440.0, 44_100, 1.0);
        let zcr = fe.extract_zero_crossing_rate(&s);
        // Allow generous tolerance; discretisation introduces some variation
        assert!(zcr > 0.01 && zcr < 0.10, "ZCR out of expected range: {zcr}");
    }

    #[test]
    fn zcr_dc_is_zero() {
        let fe = FeatureExtractor::new();
        let s = vec![1.0_f32; 1000];
        assert_eq!(fe.extract_zero_crossing_rate(&s), 0.0);
    }

    #[test]
    fn rms_known_amplitude() {
        let fe = FeatureExtractor::new();
        // RMS of a sine with amplitude A is A/√2
        let s = sine(100.0, 16_000, 2.0);
        let rms = fe.extract_rms_energy(&s);
        let expected = 1.0_f32 / 2.0_f32.sqrt();
        assert!(
            (rms - expected).abs() < 0.01,
            "RMS = {rms}, expected ≈ {expected}"
        );
    }

    #[test]
    fn spectral_centroid_dc_is_zero() {
        let fe = FeatureExtractor::new();
        // A spectrum with all energy in bin 0 has centroid at 0 Hz
        let mut spectrum = vec![0.0_f32; 257];
        spectrum[0] = 1.0;
        let c = fe.extract_spectral_centroid(&spectrum, 16_000);
        assert!(c.abs() < 1e-6);
    }

    #[test]
    fn spectral_centroid_increases_with_frequency() {
        let fe = FeatureExtractor::new();
        let mut low = vec![0.0_f32; 257];
        low[10] = 1.0;
        let mut high = vec![0.0_f32; 257];
        high[200] = 1.0;
        let c_low = fe.extract_spectral_centroid(&low, 16_000);
        let c_high = fe.extract_spectral_centroid(&high, 16_000);
        assert!(c_high > c_low, "centroid should increase with frequency");
    }

    #[test]
    fn build_feature_vector_length() {
        let fe = FeatureExtractor::new();
        let audio = sine(440.0, 16_000, 1.0);
        let v = fe.build_feature_vector(&audio, 16_000).unwrap();
        assert_eq!(v.len(), 30, "feature vector must be 30-dimensional");
    }

    #[test]
    fn build_feature_vector_no_nan() {
        let fe = FeatureExtractor::new();
        let audio = sine(220.0, 16_000, 0.5);
        let v = fe.build_feature_vector(&audio, 16_000).unwrap();
        assert!(
            v.iter().all(|x| x.is_finite()),
            "feature vector must not contain NaN or Inf"
        );
    }
}
