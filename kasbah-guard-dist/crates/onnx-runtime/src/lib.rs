/// ONNX Model Inference Runtime
///
/// Provides unified interface for loading and running ONNX models
/// with support for batching, caching, and fallback strategies.

pub mod loader;
pub mod inference;
pub mod cache;
pub mod batching;
pub mod metrics;
pub mod errors;

pub use loader::ModelLoader;
pub use inference::InferenceEngine;
pub use cache::ModelCache;
pub use batching::BatchProcessor;
pub use errors::{Result, OnnxError};

use std::sync::Arc;
use parking_lot::RwLock;
use prometheus::{Registry, Counter, Histogram};

/// Global ONNX runtime context
pub struct OnnxRuntime {
    loader: Arc<ModelLoader>,
    cache: Arc<ModelCache>,
    engine: Arc<InferenceEngine>,
    metrics: Arc<RuntimeMetrics>,
}

/// Runtime metrics
pub struct RuntimeMetrics {
    pub inference_count: Counter,
    pub inference_duration: Histogram,
    pub cache_hits: Counter,
    pub cache_misses: Counter,
    pub fallback_usage: Counter,
}

impl OnnxRuntime {
    /// Initialize ONNX runtime with default settings
    pub fn new() -> Result<Self> {
        let registry = Registry::new();

        let metrics = Arc::new(RuntimeMetrics {
            inference_count: Counter::new("onnx_inference_total", "Total inferences")?,
            inference_duration: Histogram::new("onnx_inference_duration_seconds", "Inference duration")?,
            cache_hits: Counter::new("onnx_cache_hits_total", "Cache hits")?,
            cache_misses: Counter::new("onnx_cache_misses_total", "Cache misses")?,
            fallback_usage: Counter::new("onnx_fallback_total", "Fallback usage")?,
        });

        registry.register(Box::new(metrics.inference_count.clone()))?;
        registry.register(Box::new(metrics.inference_duration.clone()))?;
        registry.register(Box::new(metrics.cache_hits.clone()))?;
        registry.register(Box::new(metrics.cache_misses.clone()))?;
        registry.register(Box::new(metrics.fallback_usage.clone()))?;

        Ok(Self {
            loader: Arc::new(ModelLoader::new()),
            cache: Arc::new(ModelCache::new(100)), // 100 model cache
            engine: Arc::new(InferenceEngine::new()?),
            metrics,
        })
    }

    /// Load model from path
    pub async fn load_model(&self, path: &str) -> Result<()> {
        self.loader.load(path).await
    }

    /// Run inference
    pub async fn infer(&self, model_id: &str, input: Vec<f32>) -> Result<Vec<f32>> {
        self.metrics.inference_count.inc();

        // Check cache
        if let Some(result) = self.cache.get(model_id, &input) {
            self.metrics.cache_hits.inc();
            return Ok(result);
        }

        self.metrics.cache_misses.inc();

        // Run inference
        let result = self.engine.infer(model_id, input).await?;

        // Cache result
        self.cache.insert(model_id.to_string(), result.clone());

        Ok(result)
    }

    /// Run batched inference
    pub async fn infer_batch(&self, model_id: &str, inputs: Vec<Vec<f32>>) -> Result<Vec<Vec<f32>>> {
        self.metrics.inference_count.inc_by(inputs.len() as u64);

        let processor = BatchProcessor::new();
        processor.process(model_id, inputs).await
    }

    /// Get runtime metrics
    pub fn metrics(&self) -> &RuntimeMetrics {
        &self.metrics
    }
}

impl Default for OnnxRuntime {
    fn default() -> Self {
        Self::new().expect("Failed to initialize ONNX runtime")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_runtime_initialization() {
        let runtime = OnnxRuntime::new();
        assert!(runtime.is_ok());
    }

    #[tokio::test]
    async fn test_cache_functionality() {
        let runtime = OnnxRuntime::new().unwrap();
        let input = vec![1.0, 2.0, 3.0];
        let result = vec![0.5, 0.7, 0.9];

        runtime.cache.insert("test_model".to_string(), result.clone());
        let cached = runtime.cache.get("test_model", &input);

        assert!(cached.is_some());
    }
}
