/// ONNX inference engine

use crate::errors::{OnnxError, Result};
use std::time::Duration;

pub struct InferenceEngine;

impl InferenceEngine {
    pub fn new() -> Result<Self> {
        Ok(Self)
    }

    pub async fn infer(&self, model_id: &str, input: Vec<f32>) -> Result<Vec<f32>> {
        // TODO: Implement actual ONNX inference with ort crate
        // For now, return mock response
        Ok(input.iter().map(|x| x * 0.5).collect())
    }

    pub async fn infer_with_timeout(
        &self,
        model_id: &str,
        input: Vec<f32>,
        timeout: Duration,
    ) -> Result<Vec<f32>> {
        tokio::time::timeout(timeout, self.infer(model_id, input))
            .await
            .map_err(|_| OnnxError::Timeout("Inference timeout".to_string()))?
    }
}

impl Default for InferenceEngine {
    fn default() -> Self {
        Self::new().unwrap()
    }
}
