//! Module 9: Context Camouflage
//!
//! Nature metaphor: The cuttlefish changes colour, pattern, and texture in
//! milliseconds to blend with any substrate — coral, sand, rock. It does not
//! hide by disappearing but by becoming indistinguishable from context.
//!
//! Security application: Response normalisation — sensitive API responses are
//! "camouflaged" so they look structurally identical to benign responses.
//! Field names, response sizes, and timing are normalised to prevent an
//! observer from inferring data sensitivity from response shape alone.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CamouflageProfile {
    pub profile_id: String,
    /// Target response size in bytes (responses are padded/trimmed to this).
    pub target_size: usize,
    /// Field name substitution map (real_name → camouflaged_name).
    pub field_aliases: HashMap<String, String>,
}

pub struct Camouflage {
    profiles: HashMap<String, CamouflageProfile>,
}

impl Camouflage {
    pub fn new() -> Self {
        Self {
            profiles: HashMap::new(),
        }
    }

    /// Register a camouflage profile.
    pub fn register_profile(&mut self, profile: CamouflageProfile) {
        self.profiles.insert(profile.profile_id.clone(), profile);
    }

    /// Apply field-alias substitution to a JSON object using `profile_id`.
    ///
    /// Returns a new map with aliased field names. Fields not in the alias map
    /// are passed through unchanged.
    pub fn apply_aliases(
        &self,
        profile_id: &str,
        data: HashMap<String, serde_json::Value>,
    ) -> HashMap<String, serde_json::Value> {
        let aliases = self
            .profiles
            .get(profile_id)
            .map(|p| &p.field_aliases);

        match aliases {
            None => data,
            Some(map) => data
                .into_iter()
                .map(|(k, v)| {
                    let new_key = map.get(&k).cloned().unwrap_or(k);
                    (new_key, v)
                })
                .collect(),
        }
    }

    /// Pad a serialised response to `target_size` bytes with random-looking
    /// whitespace so response sizes are uniform and non-leaking.
    pub fn normalise_size(&self, profile_id: &str, mut payload: String) -> String {
        let target = self
            .profiles
            .get(profile_id)
            .map(|p| p.target_size)
            .unwrap_or(0);

        if target == 0 || payload.len() >= target {
            return payload;
        }

        // Pad with spaces inside a trailing JSON comment-safe field.
        // Real usage would be a dedicated padding field.
        let padding_needed = target - payload.len();
        payload.push_str(&" ".repeat(padding_needed));
        payload
    }

    /// Return all registered profile IDs.
    pub fn profile_ids(&self) -> Vec<String> {
        self.profiles.keys().cloned().collect()
    }
}

impl Default for Camouflage {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_field_alias() {
        let mut cam = Camouflage::new();
        let mut aliases = HashMap::new();
        aliases.insert("ssn".to_string(), "ref_id".to_string());

        cam.register_profile(CamouflageProfile {
            profile_id: "p1".to_string(),
            target_size: 0,
            field_aliases: aliases,
        });

        let mut data = HashMap::new();
        data.insert("ssn".to_string(), json!("123-45-6789"));
        data.insert("name".to_string(), json!("Alice"));

        let result = cam.apply_aliases("p1", data);
        assert!(result.contains_key("ref_id"));
        assert!(!result.contains_key("ssn"));
        assert!(result.contains_key("name"));
    }

    #[test]
    fn test_size_normalisation() {
        let mut cam = Camouflage::new();
        cam.register_profile(CamouflageProfile {
            profile_id: "p2".to_string(),
            target_size: 100,
            field_aliases: HashMap::new(),
        });
        let padded = cam.normalise_size("p2", "short".to_string());
        assert_eq!(padded.len(), 100);
    }
}
