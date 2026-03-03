//! Module 3: Kinship Graph — EigenTrust Global Trust Computation
//!
//! Nature metaphor: Wolf packs, ant colonies, and primate troops all rely on
//! kinship networks — trust is earned through shared experience, not just
//! proximity. A wolf does not automatically trust every wolf; trust is built
//! through collaboration and verified over time.
//!
//! Security application: A directed trust graph for social recovery,
//! anomaly attestation, and federated access decisions. When a user's
//! credentials are compromised, their kinship network can vouch for identity
//! recovery. High-risk actions require trust-path confirmation.
//!
//! EigenTrust algorithm (Kamvar et al., 2003):
//!   t_i = (1-α) × Σ_j [c_ji × t_j]  +  α × p_i
//!
//!   where c_ji = s_ji / Σ_k s_jk  (row-normalised trust)
//!         α    = 0.15              (damping — weight given to pre-trusted set)
//!         p_i  = 1/|pre-trusted|  if i is pre-trusted, else 0
//!
//! Converges via power iteration (||t^(k+1) - t^(k)||₁ < tol or max_iter).

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum KinshipType {
    /// User A has explicitly vouched for user B.
    Vouched,
    /// Users have collaborated on a verified task together.
    Collaborated,
    /// User A reported an incident involving user B (lowers trust).
    Reported,
    /// Both users have mutually vouched for each other.
    Mutual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KinshipEdge {
    pub target_user_id: String,
    /// 0.0 = no trust, 1.0 = full trust.
    pub trust_score: f32,
    pub relationship_type: KinshipType,
    pub established_at: u64,
}

// ---------------------------------------------------------------------------
// KinshipGraph
// ---------------------------------------------------------------------------

pub struct KinshipGraph {
    /// Adjacency list: user_id → outgoing edges.
    adjacency: Arc<DashMap<String, Vec<KinshipEdge>>>,
}

impl KinshipGraph {
    pub fn new() -> Self {
        Self {
            adjacency: Arc::new(DashMap::new()),
        }
    }

    // ------------------------------------------------------------------
    // Graph construction
    // ------------------------------------------------------------------

    /// Add or update a directed trust edge from `from` to `to`.
    ///
    /// If an edge to `to` already exists it is replaced. If both sides have
    /// edges to each other the relationship type is upgraded to `Mutual`
    /// automatically.
    pub fn add_edge(
        &self,
        from: &str,
        to: &str,
        trust_score: f32,
        relationship_type: KinshipType,
    ) {
        let trust_score = trust_score.clamp(0.0, 1.0);
        let edge = KinshipEdge {
            target_user_id: to.to_string(),
            trust_score,
            relationship_type: relationship_type.clone(),
            established_at: now_secs(),
        };

        // Insert/replace the edge from→to.
        let mut edges = self
            .adjacency
            .entry(from.to_string())
            .or_insert_with(Vec::new);
        if let Some(existing) = edges.iter_mut().find(|e| e.target_user_id == to) {
            *existing = edge;
        } else {
            edges.push(edge);
        }
        drop(edges);

        // Ensure the `to` node exists so BFS can traverse it.
        self.adjacency
            .entry(to.to_string())
            .or_insert_with(Vec::new);

        // Upgrade to Mutual if both directions exist with positive trust.
        let reverse_exists = self
            .adjacency
            .get(to)
            .map(|edges| edges.iter().any(|e| e.target_user_id == from && e.trust_score > 0.0))
            .unwrap_or(false);

        if reverse_exists && relationship_type != KinshipType::Reported {
            // Mark both edges as Mutual.
            self.set_mutual(from, to);
            self.set_mutual(to, from);
        }
    }

    fn set_mutual(&self, from: &str, to: &str) {
        if let Some(mut edges) = self.adjacency.get_mut(from) {
            if let Some(edge) = edges.iter_mut().find(|e| e.target_user_id == to) {
                edge.relationship_type = KinshipType::Mutual;
            }
        }
    }

    // ------------------------------------------------------------------
    // Trust queries
    // ------------------------------------------------------------------

    /// BFS shortest trust path from `from` to `to`.
    ///
    /// Returns the list of user IDs traversed (including both endpoints),
    /// or `None` if no path exists. Only edges with `trust_score > 0.0`
    /// are traversed (Reported edges with score 0 are excluded).
    pub fn get_trust_path(&self, from: &str, to: &str) -> Option<Vec<String>> {
        if from == to {
            return Some(vec![from.to_string()]);
        }

        // BFS over the adjacency list.
        let mut visited: HashSet<String> = HashSet::new();
        let mut queue: VecDeque<Vec<String>> = VecDeque::new();

        queue.push_back(vec![from.to_string()]);
        visited.insert(from.to_string());

        while let Some(path) = queue.pop_front() {
            let current = path.last().unwrap().clone();

            if let Some(edges) = self.adjacency.get(&current) {
                for edge in edges.iter() {
                    if edge.trust_score <= 0.0 {
                        continue; // skip zero-trust / reported edges
                    }
                    let next = &edge.target_user_id;
                    if visited.contains(next.as_str()) {
                        continue;
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

    /// Average first-degree outgoing trust score for `user_id`.
    ///
    /// Returns 0.0 for users with no outgoing edges.
    pub fn propagate_trust(&self, user_id: &str) -> f32 {
        let edges = match self.adjacency.get(user_id) {
            Some(e) => e,
            None => return 0.0,
        };

        if edges.is_empty() {
            return 0.0;
        }

        let sum: f32 = edges.iter().map(|e| e.trust_score).sum();
        sum / edges.len() as f32
    }

    /// Detect whether `user_id` is part of a trust cycle (DFS back-edge detection).
    ///
    /// A cycle can indicate a manufactured trust ring; the result can be
    /// combined with other signals to flag suspicious trust inflation.
    pub fn detect_circle_trust(&self, user_id: &str) -> bool {
        let mut visited: HashSet<String> = HashSet::new();
        let mut rec_stack: HashSet<String> = HashSet::new();

        self.dfs_cycle(user_id, &mut visited, &mut rec_stack)
    }

    fn dfs_cycle(
        &self,
        node: &str,
        visited: &mut HashSet<String>,
        rec_stack: &mut HashSet<String>,
    ) -> bool {
        visited.insert(node.to_string());
        rec_stack.insert(node.to_string());

        if let Some(edges) = self.adjacency.get(node) {
            let targets: Vec<String> = edges
                .iter()
                .filter(|e| e.trust_score > 0.0)
                .map(|e| e.target_user_id.clone())
                .collect();
            drop(edges);

            for next in targets {
                if !visited.contains(&next) {
                    if self.dfs_cycle(&next, visited, rec_stack) {
                        return true;
                    }
                } else if rec_stack.contains(&next) {
                    return true;
                }
            }
        }

        rec_stack.remove(node);
        false
    }

    /// Return the list of trusted contacts for `user_id` suitable for
    /// account recovery (edges with trust_score >= 0.7, non-Reported).
    pub fn recovery_network(&self, user_id: &str) -> Vec<String> {
        self.adjacency
            .get(user_id)
            .map(|edges| {
                edges
                    .iter()
                    .filter(|e| {
                        e.trust_score >= 0.7 && e.relationship_type != KinshipType::Reported
                    })
                    .map(|e| e.target_user_id.clone())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Return all edges for `user_id`.
    pub fn edges(&self, user_id: &str) -> Vec<KinshipEdge> {
        self.adjacency
            .get(user_id)
            .map(|e| e.clone())
            .unwrap_or_default()
    }

    /// Total number of registered users in the graph.
    pub fn user_count(&self) -> usize {
        self.adjacency.len()
    }

    // ------------------------------------------------------------------
    // EigenTrust — global trust scores via power iteration
    // ------------------------------------------------------------------

    /// Compute EigenTrust global trust scores for all users.
    ///
    /// Parameters:
    ///   `pre_trusted` — set of user IDs with prior trust (p_i = 1/|pre_trusted|)
    ///   `alpha`       — damping weight for pre-trusted set (0.0–1.0, default 0.15)
    ///   `max_iter`    — maximum power iterations (default 100)
    ///   `tol`         — convergence tolerance (default 1e-6)
    ///
    /// Returns a HashMap<user_id, trust_score> where scores sum to 1.0.
    pub fn eigentrust(
        &self,
        pre_trusted: &[&str],
        alpha: f32,
        max_iter: usize,
        tol: f32,
    ) -> HashMap<String, f32> {
        // Collect all user IDs in a stable order
        let mut users: Vec<String> = self.adjacency.iter().map(|e| e.key().clone()).collect();
        users.sort();
        let n = users.len();
        if n == 0 {
            return HashMap::new();
        }

        // Index map for O(1) lookup
        let idx: HashMap<String, usize> = users.iter().enumerate().map(|(i, u)| (u.clone(), i)).collect();

        // Build row-normalised trust matrix C where C[j][i] = c_ji
        // c_ji = s_ji / Σ_k s_jk  (how much j trusts i, normalised by j's total trust given)
        let mut c_matrix: Vec<Vec<f32>> = vec![vec![0.0; n]; n];
        for (j, user_j) in users.iter().enumerate() {
            if let Some(edges) = self.adjacency.get(user_j) {
                let positive_edges: Vec<&KinshipEdge> = edges.iter()
                    .filter(|e| e.trust_score > 0.0)
                    .collect();
                let total: f32 = positive_edges.iter().map(|e| e.trust_score).sum();
                if total > 0.0 {
                    for edge in positive_edges {
                        if let Some(&i) = idx.get(&edge.target_user_id) {
                            c_matrix[j][i] = edge.trust_score / total;
                        }
                    }
                }
            }
        }

        // Prior trust vector p: uniform over pre-trusted set
        let pre_trusted_set: HashSet<&str> = pre_trusted.iter().copied().collect();
        let pre_trusted_in_graph: Vec<usize> = users.iter().enumerate()
            .filter(|(_, u)| pre_trusted_set.contains(u.as_str()))
            .map(|(i, _)| i)
            .collect();

        let p_val = if pre_trusted_in_graph.is_empty() {
            // No pre-trusted users → uniform prior
            1.0 / n as f32
        } else {
            1.0 / pre_trusted_in_graph.len() as f32
        };

        let mut p: Vec<f32> = vec![0.0; n];
        if pre_trusted_in_graph.is_empty() {
            for pi in p.iter_mut() { *pi = 1.0 / n as f32; }
        } else {
            for &i in &pre_trusted_in_graph {
                p[i] = p_val;
            }
        }

        // Initialise trust vector t = p
        let mut t: Vec<f32> = p.clone();

        let alpha = alpha.clamp(0.0, 1.0);

        // Power iteration: t^(k+1) = (1-α) × C^T × t^(k)  +  α × p
        for _ in 0..max_iter.max(1) {
            // Compute C^T × t: for each i, sum over j of c_matrix[j][i] * t[j]
            let mut t_new: Vec<f32> = vec![0.0; n];
            for j in 0..n {
                for i in 0..n {
                    t_new[i] += c_matrix[j][i] * t[j];
                }
            }

            // t_new = (1-α) × t_new + α × p
            for i in 0..n {
                t_new[i] = (1.0 - alpha) * t_new[i] + alpha * p[i];
            }

            // Normalise so scores sum to 1
            let sum: f32 = t_new.iter().sum();
            if sum > 0.0 {
                for ti in t_new.iter_mut() { *ti /= sum; }
            }

            // Check convergence: L1 norm of difference
            let delta: f32 = t.iter().zip(t_new.iter()).map(|(a, b)| (a - b).abs()).sum();
            t = t_new;
            if delta < tol {
                break;
            }
        }

        users.into_iter().zip(t.into_iter()).collect()
    }

    /// Serialize the entire graph to a JSON adjacency list for inspection.
    pub fn export_graph(&self) -> serde_json::Value {
        let adj: HashMap<String, Vec<serde_json::Value>> = self
            .adjacency
            .iter()
            .map(|entry| {
                let edges: Vec<serde_json::Value> = entry
                    .value()
                    .iter()
                    .map(|e| serde_json::to_value(e).unwrap_or(serde_json::Value::Null))
                    .collect();
                (entry.key().clone(), edges)
            })
            .collect();

        serde_json::json!({
            "user_count": adj.len(),
            "adjacency": adj,
        })
    }
}

impl Default for KinshipGraph {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_edge_and_mutual_upgrade() {
        let g = KinshipGraph::new();
        g.add_edge("alice", "bob", 0.8, KinshipType::Vouched);
        g.add_edge("bob", "alice", 0.9, KinshipType::Vouched);

        let alice_edges = g.edges("alice");
        assert_eq!(alice_edges.len(), 1);
        assert_eq!(alice_edges[0].relationship_type, KinshipType::Mutual);
    }

    #[test]
    fn test_trust_path_direct() {
        let g = KinshipGraph::new();
        g.add_edge("a", "b", 0.9, KinshipType::Vouched);
        let path = g.get_trust_path("a", "b").unwrap();
        assert_eq!(path, vec!["a", "b"]);
    }

    #[test]
    fn test_trust_path_indirect() {
        let g = KinshipGraph::new();
        g.add_edge("a", "b", 0.9, KinshipType::Vouched);
        g.add_edge("b", "c", 0.8, KinshipType::Collaborated);
        let path = g.get_trust_path("a", "c").unwrap();
        assert_eq!(path, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_no_path() {
        let g = KinshipGraph::new();
        g.add_edge("a", "b", 0.9, KinshipType::Vouched);
        assert!(g.get_trust_path("a", "z").is_none());
    }

    #[test]
    fn test_zero_trust_edge_not_traversed() {
        let g = KinshipGraph::new();
        g.add_edge("a", "b", 0.9, KinshipType::Vouched);
        g.add_edge("b", "c", 0.0, KinshipType::Reported);
        assert!(g.get_trust_path("a", "c").is_none());
    }

    #[test]
    fn test_cycle_detection() {
        let g = KinshipGraph::new();
        g.add_edge("a", "b", 0.8, KinshipType::Vouched);
        g.add_edge("b", "c", 0.8, KinshipType::Vouched);
        g.add_edge("c", "a", 0.8, KinshipType::Vouched);
        assert!(g.detect_circle_trust("a"));
    }

    #[test]
    fn test_no_cycle() {
        let g = KinshipGraph::new();
        g.add_edge("a", "b", 0.8, KinshipType::Vouched);
        g.add_edge("b", "c", 0.8, KinshipType::Vouched);
        assert!(!g.detect_circle_trust("a"));
    }

    #[test]
    fn test_recovery_network() {
        let g = KinshipGraph::new();
        g.add_edge("alice", "bob", 0.9, KinshipType::Vouched);
        g.add_edge("alice", "carol", 0.5, KinshipType::Collaborated); // below threshold
        g.add_edge("alice", "dave", 0.8, KinshipType::Mutual);
        let recovery = g.recovery_network("alice");
        assert!(recovery.contains(&"bob".to_string()));
        assert!(recovery.contains(&"dave".to_string()));
        assert!(!recovery.contains(&"carol".to_string()));
    }

    #[test]
    fn test_propagate_trust() {
        let g = KinshipGraph::new();
        g.add_edge("alice", "bob", 0.8, KinshipType::Vouched);
        g.add_edge("alice", "carol", 0.4, KinshipType::Collaborated);
        let pt = g.propagate_trust("alice");
        // Mutual upgrade may change type but not score; average = (0.8+0.4)/2 = 0.6
        assert!((pt - 0.6).abs() < 0.01, "expected ~0.6, got {}", pt);
    }

    // ── EigenTrust tests ──────────────────────────────────────────────────────

    #[test]
    fn test_eigentrust_scores_sum_to_one() {
        let g = KinshipGraph::new();
        g.add_edge("alice", "bob", 0.9, KinshipType::Vouched);
        g.add_edge("bob", "carol", 0.8, KinshipType::Collaborated);
        g.add_edge("carol", "alice", 0.7, KinshipType::Vouched);
        let scores = g.eigentrust(&["alice"], 0.15, 100, 1e-6);
        let sum: f32 = scores.values().sum();
        assert!((sum - 1.0).abs() < 0.01, "EigenTrust scores must sum to 1, got {}", sum);
    }

    #[test]
    fn test_eigentrust_pre_trusted_gets_higher_score() {
        let g = KinshipGraph::new();
        // alice → bob → carol chain; alice is pre-trusted
        g.add_edge("alice", "bob", 0.9, KinshipType::Vouched);
        g.add_edge("bob", "carol", 0.5, KinshipType::Collaborated);
        let scores = g.eigentrust(&["alice"], 0.15, 100, 1e-6);
        // alice is pre-trusted so she should have higher score than carol
        let alice_score = scores.get("alice").copied().unwrap_or(0.0);
        let carol_score = scores.get("carol").copied().unwrap_or(0.0);
        assert!(alice_score >= carol_score,
            "pre-trusted alice ({}) should score >= carol ({})", alice_score, carol_score);
    }

    #[test]
    fn test_eigentrust_empty_graph() {
        let g = KinshipGraph::new();
        let scores = g.eigentrust(&[], 0.15, 100, 1e-6);
        assert!(scores.is_empty());
    }

    #[test]
    fn test_eigentrust_all_scores_non_negative() {
        let g = KinshipGraph::new();
        g.add_edge("a", "b", 0.8, KinshipType::Vouched);
        g.add_edge("b", "c", 0.6, KinshipType::Collaborated);
        g.add_edge("a", "c", 0.0, KinshipType::Reported);
        let scores = g.eigentrust(&["a"], 0.15, 100, 1e-6);
        for (user, score) in &scores {
            assert!(*score >= 0.0, "score for {} must be non-negative: {}", user, score);
        }
    }
}
