//! Module 8: Mycelium Mesh Routing — Ant Colony Optimization (Ant System)
//!
//! Nature metaphor: The wood wide web — the underground fungal network
//! connecting trees in a forest. Nutrients and chemical signals travel between
//! trees along mycelium threads. The network is resilient: losing one thread
//! causes rerouting; the mesh heals itself.
//!
//! Security application: Resilient message routing between Kasbah agents
//! using Ant System (AS) — the original ACO algorithm by Dorigo et al. (1992).
//!
//! Ant System parameters:
//!   ρ  = 0.1   pheromone evaporation rate (per routing round)
//!   α  = 1.0   pheromone importance exponent
//!   β  = 2.0   heuristic (1/hop-count) importance exponent
//!   Q  = 1.0   pheromone deposit quantity per ant
//!   τ₀ = 0.1   initial pheromone on every edge

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;

// Ant System constants
const AS_RHO: f32 = 0.1;   // evaporation rate
const AS_ALPHA: f32 = 1.0; // pheromone exponent
const AS_BETA: f32 = 2.0;  // heuristic exponent
const AS_Q: f32 = 1.0;     // pheromone deposit per ant
const AS_TAU0: f32 = 0.1;  // initial pheromone

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshNode {
    pub node_id: String,
    pub healthy: bool,
    pub neighbours: Vec<String>,
}

pub struct MyceliumMesh {
    nodes: Arc<DashMap<String, MeshNode>>,
    /// Pheromone matrix: edge key "from:to" → pheromone level τ
    pheromones: Arc<DashMap<String, f32>>,
}

impl MyceliumMesh {
    pub fn new() -> Self {
        Self {
            nodes: Arc::new(DashMap::new()),
            pheromones: Arc::new(DashMap::new()),
        }
    }

    fn edge_key(from: &str, to: &str) -> String {
        format!("{}:{}", from, to)
    }

    fn tau(&self, from: &str, to: &str) -> f32 {
        self.pheromones.get(&Self::edge_key(from, to))
            .map(|r| *r)
            .unwrap_or(AS_TAU0)
    }

    fn deposit_pheromone(&self, from: &str, to: &str, delta: f32) {
        let key = Self::edge_key(from, to);
        let mut entry = self.pheromones.entry(key).or_insert(AS_TAU0);
        *entry = (*entry + delta).max(0.001); // floor to avoid τ=0
    }

    /// Evaporate all pheromones by factor (1-ρ).
    /// Call once per routing round (e.g., after `ant_route`).
    pub fn evaporate(&self) {
        for mut entry in self.pheromones.iter_mut() {
            *entry.value_mut() = (*entry.value_mut() * (1.0 - AS_RHO)).max(0.001);
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

    // ------------------------------------------------------------------
    // Ant System (AS) routing
    // ------------------------------------------------------------------

    /// Construct one ant's path from `from` to `to` using probabilistic
    /// Ant System transition rule:
    ///
    ///   p(i→j) = [τ(i,j)^α × η(i,j)^β] / Σ_k [τ(i,k)^α × η(i,k)^β]
    ///
    /// where η(i,j) = 1 / hop_count_estimate = 1 (uniform, since we don't
    /// have geometric distances — equivalent to Ant System on unweighted graphs).
    ///
    /// Returns the path taken by the ant, or `None` if the ant got stuck.
    pub fn ant_route(&self, from: &str, to: &str) -> Option<Vec<String>> {
        if from == to {
            return Some(vec![from.to_string()]);
        }

        let mut visited: HashSet<String> = HashSet::new();
        let mut path: Vec<String> = vec![from.to_string()];
        visited.insert(from.to_string());

        loop {
            let current = path.last().unwrap().clone();

            // Collect healthy unvisited neighbours
            let candidates: Vec<String> = match self.nodes.get(&current) {
                None => break,
                Some(node) => {
                    if !node.healthy { break; }
                    node.neighbours.iter()
                        .filter(|nb| {
                            !visited.contains(*nb) &&
                            self.nodes.get(*nb).map(|n| n.healthy).unwrap_or(false)
                        })
                        .cloned()
                        .collect()
                }
            };

            if candidates.is_empty() {
                break; // ant is stuck
            }

            // If `to` is a direct neighbour, always go there (greedy shortcut)
            if candidates.contains(&to.to_string()) {
                path.push(to.to_string());
                // Deposit pheromone on completed path (Ant System rule: Q / path_len)
                let delta = AS_Q / path.len() as f32;
                for w in path.windows(2) {
                    self.deposit_pheromone(&w[0], &w[1], delta);
                }
                return Some(path);
            }

            // Compute selection probabilities: p(j) ∝ τ(cur→j)^α
            // (η = 1 for all edges on unweighted graph, so β term cancels)
            let weights: Vec<f32> = candidates.iter()
                .map(|nb| self.tau(&current, nb).powf(AS_ALPHA))
                .collect();
            let weight_sum: f32 = weights.iter().sum();

            // Deterministic proportional selection (no RNG dependency)
            // Use the candidate whose cumulative weight fraction exceeds a
            // pseudo-random value derived from path length (reproducible).
            let pseudo_r = ((path.len() as f32 * 0.6180339887) % 1.0); // golden-ratio stride
            let threshold = pseudo_r * weight_sum;
            let mut cumulative = 0.0;
            let mut chosen = candidates[0].clone();
            for (i, w) in weights.iter().enumerate() {
                cumulative += w;
                if cumulative >= threshold {
                    chosen = candidates[i].clone();
                    break;
                }
            }

            visited.insert(chosen.clone());
            path.push(chosen);
        }

        None // ant did not reach destination
    }

    /// Run `n_ants` ants from `from` to `to`, evaporate pheromones after each
    /// round, and return the shortest successful path found.
    ///
    /// Falls back to BFS `route()` if no ant reaches the destination.
    pub fn ant_colony_route(&self, from: &str, to: &str, n_ants: usize) -> Option<Vec<String>> {
        let mut best: Option<Vec<String>> = None;

        for _ in 0..n_ants.max(1) {
            if let Some(path) = self.ant_route(from, to) {
                let is_shorter = best.as_ref().map(|b| path.len() < b.len()).unwrap_or(true);
                if is_shorter {
                    best = Some(path);
                }
            }
        }

        // Evaporate once per colony round
        self.evaporate();

        // Fallback to guaranteed BFS if ACO found nothing
        best.or_else(|| self.route(from, to))
    }

    /// Return pheromone level on edge from → to.
    pub fn pheromone(&self, from: &str, to: &str) -> f32 {
        self.tau(from, to)
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

    // ── Ant System tests ─────────────────────────────────────────────────────

    #[test]
    fn test_ant_route_direct() {
        let m = MyceliumMesh::new();
        m.register_node("a", vec!["b".to_string()]);
        m.register_node("b", vec!["a".to_string()]);
        let path = m.ant_route("a", "b").unwrap();
        assert_eq!(path, vec!["a", "b"]);
    }

    #[test]
    fn test_ant_colony_route_finds_path() {
        let m = MyceliumMesh::new();
        m.register_node("a", vec!["b".to_string(), "c".to_string()]);
        m.register_node("b", vec!["d".to_string()]);
        m.register_node("c", vec!["d".to_string()]);
        m.register_node("d", vec![]);
        let path = m.ant_colony_route("a", "d", 5).unwrap();
        assert_eq!(path.first().unwrap(), "a");
        assert_eq!(path.last().unwrap(), "d");
    }

    #[test]
    fn test_pheromone_deposited_after_successful_route() {
        let m = MyceliumMesh::new();
        m.register_node("x", vec!["y".to_string()]);
        m.register_node("y", vec![]);
        let initial = m.pheromone("x", "y");
        m.ant_route("x", "y");
        let after = m.pheromone("x", "y");
        assert!(after > initial, "pheromone should increase after successful route");
    }

    #[test]
    fn test_evaporation_reduces_pheromone() {
        let m = MyceliumMesh::new();
        m.register_node("p", vec!["q".to_string()]);
        m.register_node("q", vec![]);
        m.ant_route("p", "q"); // deposits pheromone
        let before = m.pheromone("p", "q");
        m.evaporate();
        let after = m.pheromone("p", "q");
        assert!(after < before, "evaporation should reduce pheromone");
    }

    #[test]
    fn test_ant_colony_avoids_failed_node() {
        let m = MyceliumMesh::new();
        m.register_node("a", vec!["b".to_string(), "c".to_string()]);
        m.register_node("b", vec!["d".to_string()]);
        m.register_node("c", vec!["d".to_string()]);
        m.register_node("d", vec![]);
        m.mark_failed("b");
        let path = m.ant_colony_route("a", "d", 10).unwrap();
        assert!(!path.contains(&"b".to_string()));
    }
}
