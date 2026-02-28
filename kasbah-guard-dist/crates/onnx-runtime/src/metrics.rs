/// Metrics collection and reporting

use prometheus::{Counter, Histogram};

#[derive(Clone)]
pub struct InferenceMetrics {
    pub inference_count: Counter,
    pub inference_duration: Histogram,
    pub error_count: Counter,
    pub cache_hit_rate: Counter,
}

impl InferenceMetrics {
    pub fn new() -> Result<Self, prometheus::Error> {
        Ok(Self {
            inference_count: Counter::new("onnx_inferences_total", "Total inferences")?,
            inference_duration: Histogram::new("onnx_inference_duration_seconds", "Duration")?,
            error_count: Counter::new("onnx_errors_total", "Total errors")?,
            cache_hit_rate: Counter::new("onnx_cache_hits_total", "Cache hits")?,
        })
    }
}

impl Default for InferenceMetrics {
    fn default() -> Self {
        Self::new().unwrap()
    }
}
