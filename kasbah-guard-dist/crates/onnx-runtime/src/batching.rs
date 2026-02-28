/// Batch inference processing

use crate::errors::Result;

pub struct BatchProcessor;

impl BatchProcessor {
    pub fn new() -> Self {
        Self
    }

    pub async fn process(&self, model_id: &str, inputs: Vec<Vec<f32>>) -> Result<Vec<Vec<f32>>> {
        // TODO: Implement actual batching with ort
        Ok(inputs.iter().map(|inp| inp.iter().map(|x| x * 0.5).collect()).collect())
    }
}

impl Default for BatchProcessor {
    fn default() -> Self {
        Self::new()
    }
}
