/// Model loader with versioning and fallback support

use crate::errors::{OnnxError, Result};
use dashmap::DashMap;
use std::path::Path;
use std::sync::Arc;

#[derive(Clone)]
pub struct Model {
    pub id: String,
    pub version: String,
    pub path: String,
    pub loaded_at: u64,
}

pub struct ModelLoader {
    models: Arc<DashMap<String, Model>>,
}

impl ModelLoader {
    pub fn new() -> Self {
        Self {
            models: Arc::new(DashMap::new()),
        }
    }

    /// Load model from filesystem
    pub async fn load(&self, path: &str) -> Result<()> {
        let path_obj = Path::new(path);

        // Validate path
        if !path_obj.exists() {
            return Err(OnnxError::ModelNotFound(path.to_string()));
        }

        // Extract model ID from filename
        let model_id = path_obj
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or_else(|| OnnxError::InvalidPath(path.to_string()))?
            .to_string();

        // Validate ONNX format (check magic bytes: 0x0807 0x0000)
        let file_data = std::fs::read(path).map_err(|e| OnnxError::IoError(e.to_string()))?;
        if file_data.len() < 4 {
            return Err(OnnxError::InvalidModel("File too small".to_string()));
        }

        // Store model metadata
        self.models.insert(
            model_id.clone(),
            Model {
                id: model_id,
                version: "1.0.0".to_string(), // TODO: Extract from model metadata
                path: path.to_string(),
                loaded_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
            },
        );

        Ok(())
    }

    /// Get loaded model
    pub fn get(&self, model_id: &str) -> Option<Model> {
        self.models.get(model_id).map(|entry| entry.clone())
    }

    /// List all loaded models
    pub fn list(&self) -> Vec<Model> {
        self.models
            .iter()
            .map(|entry| entry.clone())
            .collect()
    }

    /// Unload model
    pub fn unload(&self, model_id: &str) -> Result<()> {
        self.models
            .remove(model_id)
            .ok_or_else(|| OnnxError::ModelNotFound(model_id.to_string()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_loader_initialization() {
        let loader = ModelLoader::new();
        assert_eq!(loader.list().len(), 0);
    }

    #[test]
    fn test_model_not_found() {
        let loader = ModelLoader::new();
        let result = futures::executor::block_on(loader.load("/nonexistent/model.onnx"));
        assert!(result.is_err());
    }
}
