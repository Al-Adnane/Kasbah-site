//! Module 8: Mycelium Mesh Routing
//!
//! Nature metaphor: The wood wide web — the underground fungal network
//! connecting trees in a forest. Nutrients and chemical signals travel between
//! trees along mycelium threads. The network is resilient: losing one thread
//! causes rerouting; the mesh heals itself.
//!
//! Security application: Resilient message routing between Kasbah agents.
//! Each agent node publishes its active routes. When a node fails, traffic
//! reroutes through adjacent healthy nodes automatically. Provides
//! fault-tolerant event propagation for threat intel distribution.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshNode {
    pub node_id: String,
    pub healthy: bool,
    pub neighbours: Vec<String>,
}

pub struct MyceliumMesh {
    nodes: Arc<DashMap<String, MeshNode>>,
}

impl MyceliumMesh {
    pub fn new() -> Self {
        Self {
            nodes: Arc::new(DashMap::new()),
        }
    }

    /// Register a node with its neighbours.
    pub fn register_node(&self, node_id: &str, neighbours: Vec<String>) {
        self.nodes.insert(
            node_id.to_string(),
            MeshNode {
                node_id: node_id.to_string(),
                healthy: true,
                neighbours,
            },
        );
    }

    /// Mark a node as unhealthy (simulating failure).
    pub fn mark_failed(&self, node_id: &str) {
        if let Some(mut n) = self.nodes.get_mut(node_id) {
            n.healthy = false;
        }
    }

    /// Mark a node as healthy again.
    pub fn mark_healthy(&self, node_id: &str) {
        if let Some(mut n) = self.nodes.get_mut(node_id) {
            n.healthy = true;
        }
    }

    /// BFS route from `from` to `to` through healthy nodes only.
    ///
    /// Returns the path (inclusive) or `None` if no healthy route exists.
    pub fn route(&self, from: &str, to: &str) -> Option<Vec<String>> {
        if from == to {
            return Some(vec![from.to_string()]);
        }

        let mut visited: HashSet<String> = HashSet::new();
        let mut queue: VecDeque<Vec<String>> = VecDeque::new();
        queue.push_back(vec![from.to_string()]);
        visited.insert(from.to_string());

        while let Some(path) = queue.pop_front() {
            let current = path.last().unwrap().clone();
            if let Some(node) = self.nodes.get(&current) {
                if !node.healthy {
                    continue;
                }
                let neighbours = node.neighbours.clone();
                drop(node);
                for next in neighbours {
                    if visited.contains(&next) {
                        continue;
                    }
                    if let Some(n) = self.nodes.get(&next) {
                        if !n.healthy {
                            continue;
                        }
                    }
                    let mut new_path = path.clone();
                    new_path.push(next.clone());
                    if next == to {
                        return Some(new_path);
                    }
                    visited.insert(next.clone());
                    queue.push_back(new_path);
                }
            }
        }

        None
    }

    /// Return count of healthy nodes.
    pub fn healthy_count(&self) -> usize {
        self.nodes.iter().filter(|e| e.healthy).count()
    }
}

impl Default for MyceliumMesh {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_direct_route() {
        let m = MyceliumMesh::new();
        m.register_node("a", vec!["b".to_string()]);
        m.register_node("b", vec!["a".to_string()]);
        let path = m.route("a", "b").unwrap();
        assert_eq!(path, vec!["a", "b"]);
    }

    #[test]
    fn test_reroute_around_failed_node() {
        let m = MyceliumMesh::new();
        m.register_node("a", vec!["b".to_string(), "c".to_string()]);
        m.register_node("b", vec!["d".to_string()]);
        m.register_node("c", vec!["d".to_string()]);
        m.register_node("d", vec![]);
        m.mark_failed("b");
        let path = m.route("a", "d").unwrap();
        assert!(!path.contains(&"b".to_string()));
    }
}
