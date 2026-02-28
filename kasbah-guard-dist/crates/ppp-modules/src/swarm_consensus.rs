//! Module 5: Swarm Consensus
//!
//! Nature metaphor: A murmuration of starlings achieves collective decisions
//! with no central controller — each bird follows three simple rules (separation,
//! alignment, cohesion) yet the flock moves as a unified mind. Ant colonies
//! route food along optimal paths through distributed stigmergic voting.
//!
//! Security application: Distributed threat voting across agent instances.
//! Each Kasbah agent (browser extension, CLI, desktop) casts a weighted vote
//! on whether a data item is sensitive. The consensus decision is taken when
//! a quorum of votes agree — no single agent controls the outcome.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use parking_lot::RwLock;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Vote {
    Sensitive,
    Safe,
    Uncertain,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmVote {
    pub agent_id: String,
    pub vote: Vote,
    pub confidence: f32,
    pub cast_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsensusResult {
    pub item_id: String,
    pub decision: Vote,
    pub confidence: f32,
    pub vote_count: usize,
    pub quorum_reached: bool,
}

pub struct SwarmConsensus {
    /// item_id → list of votes cast by agents.
    votes: Arc<RwLock<HashMap<String, Vec<SwarmVote>>>>,
    /// Minimum votes required for quorum.
    quorum: usize,
}

impl SwarmConsensus {
    pub fn new(quorum: usize) -> Self {
        Self {
            votes: Arc::new(RwLock::new(HashMap::new())),
            quorum: quorum.max(1),
        }
    }

    /// Cast a vote for `item_id` from `agent_id`.
    ///
    /// Each agent may cast one vote per item; subsequent calls replace the
    /// previous vote from the same agent.
    pub fn cast_vote(&self, item_id: &str, agent_id: &str, vote: Vote, confidence: f32) {
        let mut guard = self.votes.write();
        let entry = guard.entry(item_id.to_string()).or_default();
        // Replace existing vote from this agent.
        entry.retain(|v| v.agent_id != agent_id);
        entry.push(SwarmVote {
            agent_id: agent_id.to_string(),
            vote,
            confidence: confidence.clamp(0.0, 1.0),
            cast_at: now_secs(),
        });
    }

    /// Compute the current consensus for `item_id`.
    ///
    /// Weighted majority: each vote's weight = confidence. The option with the
    /// highest total weight wins. Quorum is required for a definitive result;
    /// without quorum the decision is `Uncertain`.
    pub fn consensus(&self, item_id: &str) -> ConsensusResult {
        let guard = self.votes.read();
        let votes = match guard.get(item_id) {
            Some(v) => v,
            None => {
                return ConsensusResult {
                    item_id: item_id.to_string(),
                    decision: Vote::Uncertain,
                    confidence: 0.0,
                    vote_count: 0,
                    quorum_reached: false,
                }
            }
        };

        let vote_count = votes.len();
        let quorum_reached = vote_count >= self.quorum;

        let mut sensitive_weight = 0.0f32;
        let mut safe_weight = 0.0f32;
        let mut uncertain_weight = 0.0f32;

        for v in votes {
            match v.vote {
                Vote::Sensitive => sensitive_weight += v.confidence,
                Vote::Safe => safe_weight += v.confidence,
                Vote::Uncertain => uncertain_weight += v.confidence,
            }
        }

        let total = sensitive_weight + safe_weight + uncertain_weight;

        let (decision, winning_weight) = if sensitive_weight >= safe_weight
            && sensitive_weight >= uncertain_weight
        {
            (Vote::Sensitive, sensitive_weight)
        } else if safe_weight >= sensitive_weight && safe_weight >= uncertain_weight {
            (Vote::Safe, safe_weight)
        } else {
            (Vote::Uncertain, uncertain_weight)
        };

        let confidence = if total > 0.0 {
            winning_weight / total
        } else {
            0.0
        };

        ConsensusResult {
            item_id: item_id.to_string(),
            decision: if quorum_reached { decision } else { Vote::Uncertain },
            confidence: if quorum_reached { confidence } else { 0.0 },
            vote_count,
            quorum_reached,
        }
    }
}

impl Default for SwarmConsensus {
    fn default() -> Self {
        Self::new(3)
    }
}

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
    fn test_majority_sensitive() {
        let sc = SwarmConsensus::new(2);
        sc.cast_vote("item-1", "agent-a", Vote::Sensitive, 0.9);
        sc.cast_vote("item-1", "agent-b", Vote::Sensitive, 0.8);
        sc.cast_vote("item-1", "agent-c", Vote::Safe, 0.5);
        let result = sc.consensus("item-1");
        assert!(result.quorum_reached);
        assert_eq!(result.decision, Vote::Sensitive);
    }

    #[test]
    fn test_no_quorum() {
        let sc = SwarmConsensus::new(5);
        sc.cast_vote("item-2", "agent-a", Vote::Sensitive, 1.0);
        let result = sc.consensus("item-2");
        assert!(!result.quorum_reached);
        assert_eq!(result.decision, Vote::Uncertain);
    }
}
