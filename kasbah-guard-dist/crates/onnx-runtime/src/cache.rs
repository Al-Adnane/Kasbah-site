/// Model result caching

use lru::LruCache;
use parking_lot::RwLock;
use std::num::NonZeroUsize;

pub struct ModelCache {
    cache: RwLock<LruCache<String, Vec<f32>>>,
}

impl ModelCache {
    pub fn new(capacity: usize) -> Self {
        Self {
            cache: RwLock::new(LruCache::new(NonZeroUsize::new(capacity).unwrap())),
        }
    }

    pub fn get(&self, model_id: &str, input: &[f32]) -> Option<Vec<f32>> {
        let key = format!("{:?}_{:?}", model_id, input);
        self.cache.write().get(&key).cloned()
    }

    pub fn insert(&self, model_id: String, result: Vec<f32>) {
        self.cache.write().put(model_id, result);
    }

    pub fn clear(&self) {
        self.cache.write().clear();
    }
}
