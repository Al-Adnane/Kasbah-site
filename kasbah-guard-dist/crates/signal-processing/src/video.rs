//! Video / image preprocessing for ONNX model input pipelines.
//!
//! Provides image loading, resizing, float-tensor conversion, JPEG compression
//! artifact scoring, and a ready-made pipeline for the camera-artifact detection
//! model.

use image::{DynamicImage, ImageBuffer, Rgb};
use crate::errors::{Result, SignalError};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// JPEG encodes in 8×8 pixel DCT blocks; the artifact detector operates at
/// this granularity.
const JPEG_BLOCK_SIZE: u32 = 8;

// ---------------------------------------------------------------------------
// VideoFrameExtractor
// ---------------------------------------------------------------------------

/// Stateless collection of image / video-frame preprocessing operations.
///
/// Like `AudioPreprocessor`, all methods are pure — the struct holds no frame
/// buffers or mutable state.
pub struct VideoFrameExtractor;

impl VideoFrameExtractor {
    /// Create a new `VideoFrameExtractor`.
    pub fn new() -> Self {
        Self
    }

    // -----------------------------------------------------------------------
    // Image I/O
    // -----------------------------------------------------------------------

    /// Load an image from disk (JPEG, PNG, BMP, TIFF, WebP, …) and return the
    /// raw RGB byte buffer `[R, G, B, R, G, B, …]` in row-major order.
    ///
    /// The returned `Vec<u8>` has length `width * height * 3`.
    pub fn load_image(&self, path: &str) -> Result<Vec<u8>> {
        let img = image::open(path).map_err(|e| {
            SignalError::IoError(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to open image '{path}': {e}"),
            ))
        })?;

        let rgb = img.to_rgb8();
        Ok(rgb.into_raw())
    }

    // -----------------------------------------------------------------------
    // Resize
    // -----------------------------------------------------------------------

    /// Resize a raw RGB byte buffer to `(width, height)` using bilinear
    /// interpolation.
    ///
    /// `img` must be a valid RGB24 buffer of length divisible by 3.
    pub fn resize(&self, img: &[u8], width: u32, height: u32) -> Result<Vec<u8>> {
        if img.len() % 3 != 0 {
            return Err(SignalError::InvalidFormat(
                "Image buffer length must be divisible by 3 (RGB24)".into(),
            ));
        }
        if width == 0 || height == 0 {
            return Err(SignalError::ProcessingError(
                "Target width and height must be > 0".into(),
            ));
        }

        // Determine source dimensions from buffer length.  We require the
        // caller to provide a square-or-known buffer; we infer width = height
        // from the pixel count when the buffer is square.
        let n_pixels = (img.len() / 3) as u32;
        let src_side = (n_pixels as f64).sqrt() as u32;

        // Try to reconstruct a valid DynamicImage from raw bytes.
        // If the buffer does not describe a perfect square we fall back to
        // letting the caller handle dimensions explicitly by wrapping in a
        // 1-pixel-tall strip (unusual but valid for width-only resize tests).
        let (src_w, src_h) = if src_side * src_side == n_pixels {
            (src_side, src_side)
        } else {
            // Assume it's a 1-row image of n_pixels width
            (n_pixels, 1)
        };

        let buf: ImageBuffer<Rgb<u8>, Vec<u8>> =
            ImageBuffer::from_raw(src_w, src_h, img.to_vec()).ok_or_else(|| {
                SignalError::InvalidFormat(
                    "Cannot construct image from provided byte buffer".into(),
                )
            })?;

        let dynamic = DynamicImage::ImageRgb8(buf);
        let resized = dynamic.resize_exact(
            width,
            height,
            image::imageops::FilterType::Triangle,
        );
        Ok(resized.to_rgb8().into_raw())
    }

    // -----------------------------------------------------------------------
    // Float tensor conversion
    // -----------------------------------------------------------------------

    /// Convert a raw RGB byte buffer to a `f32` tensor normalised to `[0, 1]`.
    ///
    /// Layout: **channel-last** `[H, W, C]` — i.e. the returned vector is
    /// `[R₀₀, G₀₀, B₀₀, R₀₁, G₀₁, B₀₁, …]` with values in `[0.0, 1.0]`.
    ///
    /// `width` and `height` are provided for documentation / downstream
    /// reshaping; they are not used for bounds checking here.
    pub fn to_float_tensor(&self, img: &[u8], _width: u32, _height: u32) -> Vec<f32> {
        img.iter().map(|&b| b as f32 / 255.0).collect()
    }

    // -----------------------------------------------------------------------
    // JPEG artifact detection
    // -----------------------------------------------------------------------

    /// Score an RGB image for JPEG blocking / ringing artefacts.
    ///
    /// Returns a value in `[0.0, 1.0]` where:
    /// * `0.0` = no blocking artefacts detected (likely lossless or uncompressed)
    /// * `1.0` = strong blocking pattern (heavily compressed JPEG)
    ///
    /// # Algorithm
    /// 1. Convert RGB to luminance (Y channel).
    /// 2. For each pair of horizontally or vertically adjacent 8×8 DCT blocks,
    ///    compute the absolute difference across the shared boundary pixels.
    /// 3. Compare boundary differences to interior differences within each block.
    /// 4. A high boundary-to-interior ratio is the signature of JPEG blocking.
    ///
    /// The buffer length must be `width * height * 3`.
    pub fn detect_compression_artifacts(&self, img: &[u8]) -> f32 {
        if img.len() < 3 {
            return 0.0;
        }

        // Infer dimensions (assume square for the detector; caller should
        // resize to a known-square size first via `preprocess_for_camera_artifacts`).
        let n_pixels = img.len() / 3;
        let side = (n_pixels as f64).sqrt() as usize;
        if side == 0 || side * side != n_pixels {
            // Non-square buffer: fall back to 1-row analysis
            return self.row_boundary_score(img, n_pixels, 1);
        }

        self.dct_block_boundary_score(img, side, side)
    }

    /// Analyse a raw RGB buffer arranged as `width × height` pixels.
    fn dct_block_boundary_score(&self, img: &[u8], width: usize, height: usize) -> f32 {
        // Convert to luminance (BT.601)
        let luma: Vec<f32> = img
            .chunks(3)
            .map(|px| {
                0.299 * px[0] as f32 + 0.587 * px[1] as f32 + 0.114 * px[2] as f32
            })
            .collect();

        let bsz = JPEG_BLOCK_SIZE as usize;
        let mut boundary_sum = 0.0_f32;
        let mut interior_sum = 0.0_f32;
        let mut boundary_count = 0u64;
        let mut interior_count = 0u64;

        // Horizontal boundaries (between block rows)
        let block_rows = height / bsz;
        let block_cols = width / bsz;

        for br in 0..block_rows {
            for bc in 0..block_cols {
                let top_y = br * bsz;
                let left_x = bc * bsz;

                // Boundary: last row of this block vs first row of next block
                if br + 1 < block_rows {
                    let y_last = top_y + bsz - 1;
                    let y_next = top_y + bsz;
                    for x in left_x..left_x + bsz {
                        let diff = (luma[y_last * width + x] - luma[y_next * width + x]).abs();
                        boundary_sum += diff;
                        boundary_count += 1;
                    }
                }

                // Boundary: last col of this block vs first col of next block
                if bc + 1 < block_cols {
                    let x_last = left_x + bsz - 1;
                    let x_next = left_x + bsz;
                    for y in top_y..top_y + bsz {
                        let diff = (luma[y * width + x_last] - luma[y * width + x_next]).abs();
                        boundary_sum += diff;
                        boundary_count += 1;
                    }
                }

                // Interior: adjacent pixel differences within the block
                for y in top_y..top_y + bsz - 1 {
                    for x in left_x..left_x + bsz - 1 {
                        let dh = (luma[y * width + x] - luma[y * width + x + 1]).abs();
                        let dv = (luma[y * width + x] - luma[(y + 1) * width + x]).abs();
                        interior_sum += dh + dv;
                        interior_count += 2;
                    }
                }
            }
        }

        if boundary_count == 0 || interior_count == 0 {
            return 0.0;
        }

        let mean_boundary = boundary_sum / boundary_count as f32;
        let mean_interior = interior_sum / interior_count as f32;

        if mean_interior < 1e-6 {
            return 0.0; // flat image — no artefacts meaningful
        }

        // Ratio > 1 → boundary jumps are larger than interior → blocking
        // Sigmoid-squash to [0, 1]
        let ratio = mean_boundary / mean_interior;
        sigmoid((ratio - 1.5) * 2.0)
    }

    /// Fallback for non-square buffers: analyse horizontal boundary between
    /// block columns along the single row.
    fn row_boundary_score(&self, img: &[u8], width: usize, _height: usize) -> f32 {
        let luma: Vec<f32> = img
            .chunks(3)
            .map(|px| {
                0.299 * px[0] as f32 + 0.587 * px[1] as f32 + 0.114 * px[2] as f32
            })
            .collect();

        let bsz = JPEG_BLOCK_SIZE as usize;
        let n_blocks = width / bsz;
        if n_blocks < 2 {
            return 0.0;
        }

        let mut boundary_diffs = 0.0_f32;
        let mut interior_diffs = 0.0_f32;

        for b in 0..n_blocks - 1 {
            let boundary_x = (b + 1) * bsz;
            boundary_diffs += (luma[boundary_x - 1] - luma[boundary_x]).abs();
            for x in b * bsz..boundary_x - 1 {
                interior_diffs += (luma[x] - luma[x + 1]).abs();
            }
        }

        let mean_b = boundary_diffs / (n_blocks - 1) as f32;
        let mean_i = interior_diffs / (width - n_blocks) as f32;
        if mean_i < 1e-6 {
            return 0.0;
        }
        sigmoid((mean_b / mean_i - 1.5) * 2.0)
    }

    // -----------------------------------------------------------------------
    // Camera-artifact detection pipeline
    // -----------------------------------------------------------------------

    /// End-to-end preprocessing pipeline for the camera-artifact ONNX model.
    ///
    /// Steps:
    /// 1. Load image from `path`.
    /// 2. Resize to `target_size × target_size`.
    /// 3. Convert to `f32` tensor `[0.0, 1.0]`.
    /// 4. Append compression-artifact score as the last element (scalar, also
    ///    in `[0.0, 1.0]`).
    ///
    /// The main tensor has length `target_size * target_size * 3`.
    /// The appended scalar makes total length `target_size² * 3 + 1`.
    /// The model expects the caller to split these before feeding the CNN.
    pub fn preprocess_for_camera_artifacts(
        &self,
        path: &str,
        target_size: u32,
    ) -> Result<Vec<f32>> {
        // Load
        let raw = self.load_image(path)?;

        // Resize to square target
        let resized = self.resize(&raw, target_size, target_size)?;

        // Artifact score (on the resized image so block count is predictable)
        let artifact_score = self.detect_compression_artifacts(&resized);

        // Float tensor
        let mut tensor = self.to_float_tensor(&resized, target_size, target_size);

        // Append artifact score so the model can use it as an auxiliary feature
        tensor.push(artifact_score);

        Ok(tensor)
    }
}

impl Default for VideoFrameExtractor {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Standard sigmoid function: σ(x) = 1 / (1 + e^{-x}).
#[inline]
fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a synthetic solid-colour RGB image buffer.
    fn solid_rgb(width: usize, height: usize, r: u8, g: u8, b: u8) -> Vec<u8> {
        let mut buf = Vec::with_capacity(width * height * 3);
        for _ in 0..width * height {
            buf.push(r);
            buf.push(g);
            buf.push(b);
        }
        buf
    }

    #[test]
    fn float_tensor_range() {
        let vfe = VideoFrameExtractor::new();
        let buf = solid_rgb(4, 4, 128, 64, 200);
        let tensor = vfe.to_float_tensor(&buf, 4, 4);
        for &v in &tensor {
            assert!(v >= 0.0 && v <= 1.0, "out of range: {v}");
        }
    }

    #[test]
    fn float_tensor_white_is_one() {
        let vfe = VideoFrameExtractor::new();
        let buf = solid_rgb(2, 2, 255, 255, 255);
        let tensor = vfe.to_float_tensor(&buf, 2, 2);
        assert!(tensor.iter().all(|&v| (v - 1.0).abs() < 1e-6));
    }

    #[test]
    fn flat_image_has_zero_artifact_score() {
        let vfe = VideoFrameExtractor::new();
        // A perfectly flat image has no boundary-vs-interior difference
        let buf = solid_rgb(64, 64, 100, 100, 100);
        let score = vfe.detect_compression_artifacts(&buf);
        assert!(score < 0.01, "flat image artifact score should be ~0, got {score}");
    }

    #[test]
    fn resize_produces_correct_length() {
        let vfe = VideoFrameExtractor::new();
        let buf = solid_rgb(64, 64, 80, 120, 200);
        let resized = vfe.resize(&buf, 32, 32).unwrap();
        assert_eq!(resized.len(), 32 * 32 * 3);
    }

    #[test]
    fn sigmoid_zero_is_half() {
        assert!((sigmoid(0.0) - 0.5).abs() < 1e-6);
    }

    #[test]
    fn sigmoid_bounds() {
        assert!(sigmoid(100.0) > 0.99);
        assert!(sigmoid(-100.0) < 0.01);
    }
}
