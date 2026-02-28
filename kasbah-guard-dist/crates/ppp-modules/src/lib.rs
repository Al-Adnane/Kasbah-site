//! # kasbah-ppp-modules
//!
//! Privacy-Preserving Protocol (PPP) nature-inspired security modules for
//! Kasbah Guard. Implements 22 techniques drawn from biology, ecology, and
//! ethology — each providing a distinct security primitive that complements
//! the JavaScript detector engine.
//!
//! ## Module Map
//!
//! | # | Module | Nature Metaphor | Security Primitive |
//! |---|--------|-----------------|-------------------|
//! | 1 | bio_source | Biological fingerprint | Behavioural biometrics |
//! | 2 | ecosystem_credits | Nutrient cycle | Incentive ledger |
//! | 3 | kinship_graph | Pack/colony trust | Social recovery graph |
//! | 4 | antifragile | Bone/muscle stress response | Adaptive thresholds |
//! | 5 | swarm_consensus | Murmuration / ant colony | Distributed voting |
//! | 6 | stigmergy | Pheromone trails | Indirect coordination |
//! | 7 | immune_response | Adaptive immune system | Pattern memory |
//! | 8 | mycelium_mesh | Wood wide web | Resilient routing |
//! | 9 | camouflage | Cuttlefish chromatophores | Response normalisation |
//! | 10 | mimicry | Kingsnake / coral snake | Honeypot mimicry |
//! | 11 | seed_dispersal | Dandelion / berry | Intel propagation |
//! | 12 | root_bridge | Mangrove roots | Cross-domain bridging |
//! | 13 | phototropism | Auxin redistribution | Threshold optimisation |
//! | 14 | circadian | Circadian clock | Time-based access |
//! | 15 | symbiosis | Clownfish / anemone | Product partnerships |
//! | 16 | apoptosis | Programmed cell death | Data lifecycle TTL |
//! | 17 | metamorphosis | Chrysalis / axolotl | Credential rotation |
//! | 18 | echolocation | Bat / dolphin sonar | Endpoint probing |
//! | 19 | bioluminescence | Anglerfish / firefly | Canary tokens |
//! | 20 | thermoregulation | Homeostasis | Rate limiting |
//! | 21 | hibernation | Bear winter sleep | Session dormancy |
//! | 22 | regeneration | Axolotl limb regrowth | Recovery orchestration |

// ---------------------------------------------------------------------------
// Module declarations
// ---------------------------------------------------------------------------

pub mod bio_source;        // 1.  Bio-source attestation
pub mod ecosystem_credits; // 2.  Ecosystem credit ledger
pub mod kinship_graph;     // 3.  Trust relationship graph
pub mod antifragile;       // 4.  Antifragile adaptation
pub mod swarm_consensus;   // 5.  Swarm-based consensus
pub mod stigmergy;         // 6.  Stigmergic trail marking
pub mod immune_response;   // 7.  Adaptive immune response
pub mod mycelium_mesh;     // 8.  Mycelium network routing
pub mod camouflage;        // 9.  Context camouflage
pub mod mimicry;           // 10. Defensive mimicry
pub mod seed_dispersal;    // 11. Seed dispersal (data propagation)
pub mod root_bridge;       // 12. Root bridge protocol
pub mod phototropism;      // 13. Phototropism (direction seeking)
pub mod circadian;         // 14. Circadian rhythm (time-based rules)
pub mod symbiosis;         // 15. Symbiotic security relationships
pub mod apoptosis;         // 16. Programmed data death
pub mod metamorphosis;     // 17. Identity metamorphosis
pub mod echolocation;      // 18. Echolocation (blind probing)
pub mod bioluminescence;   // 19. Bioluminescence (canary tokens)
pub mod thermoregulation;  // 20. Thermoregulation (load regulation)
pub mod hibernation;       // 21. Hibernation (session dormancy)
pub mod regeneration;      // 22. Regeneration (recovery mechanisms)

// ---------------------------------------------------------------------------
// Convenience re-exports (most-used types)
// ---------------------------------------------------------------------------

pub use bio_source::BioSourceAttestation;
pub use ecosystem_credits::EcosystemCreditLedger;
pub use kinship_graph::KinshipGraph;
pub use antifragile::Antifragile;
pub use swarm_consensus::SwarmConsensus;
pub use stigmergy::Stigmergy;
pub use immune_response::ImmuneResponse;
pub use mycelium_mesh::MyceliumMesh;
pub use camouflage::Camouflage;
pub use mimicry::Mimicry;
pub use seed_dispersal::SeedDispersal;
pub use root_bridge::RootBridge;
pub use phototropism::Phototropism;
pub use circadian::Circadian;
pub use symbiosis::Symbiosis;
pub use apoptosis::Apoptosis;
pub use metamorphosis::Metamorphosis;
pub use echolocation::Echolocation;
pub use bioluminescence::Bioluminescence;
pub use thermoregulation::Thermoregulation;
pub use hibernation::Hibernation;
pub use regeneration::Regeneration;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Runtime context passed to all PPP modules during a unified evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityContext {
    pub user_id: String,
    pub session_id: String,
    /// Normalised risk score from the JS detector (0.0 = safe, 1.0 = certain threat).
    pub risk_score: f32,
    /// Unix timestamp of the event.
    pub timestamp: u64,
    /// Platform tag (e.g., `"chrome-ext"`, `"cli"`, `"sdk"`, `"desktop"`).
    pub platform: String,
    /// Optional raw content snippet (e.g., first 256 chars of scanned text).
    pub content_snippet: Option<String>,
}

impl SecurityContext {
    pub fn new(
        user_id: impl Into<String>,
        session_id: impl Into<String>,
        risk_score: f32,
        platform: impl Into<String>,
    ) -> Self {
        Self {
            user_id: user_id.into(),
            session_id: session_id.into(),
            risk_score: risk_score.clamp(0.0, 1.0),
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            platform: platform.into(),
            content_snippet: None,
        }
    }
}

/// A decision returned by a single PPP module after evaluating a `SecurityContext`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PPPDecision {
    /// Short name of the module that produced this decision (e.g., `"bio_source"`).
    pub module: String,
    /// One of: `ALLOW`, `WARN`, `DENY`, `ADAPT`.
    pub decision: String,
    /// Confidence in the decision (0.0–1.0).
    pub confidence: f32,
    /// Human-readable explanation.
    pub reasoning: String,
}

impl PPPDecision {
    pub fn allow(module: &str, confidence: f32, reasoning: &str) -> Self {
        Self {
            module: module.to_string(),
            decision: "ALLOW".to_string(),
            confidence,
            reasoning: reasoning.to_string(),
        }
    }

    pub fn warn(module: &str, confidence: f32, reasoning: &str) -> Self {
        Self {
            module: module.to_string(),
            decision: "WARN".to_string(),
            confidence,
            reasoning: reasoning.to_string(),
        }
    }

    pub fn deny(module: &str, confidence: f32, reasoning: &str) -> Self {
        Self {
            module: module.to_string(),
            decision: "DENY".to_string(),
            confidence,
            reasoning: reasoning.to_string(),
        }
    }

    pub fn adapt(module: &str, confidence: f32, reasoning: &str) -> Self {
        Self {
            module: module.to_string(),
            decision: "ADAPT".to_string(),
            confidence,
            reasoning: reasoning.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// PPPRegistry — aggregates all 22 modules
// ---------------------------------------------------------------------------

/// Central registry owning one instance of each PPP module.
///
/// Construct once (e.g., in application startup) and share via `Arc<PPPRegistry>`.
/// Calling `apply_all` evaluates every module against a `SecurityContext` and
/// returns a vector of decisions for downstream aggregation.
pub struct PPPRegistry {
    pub bio_source: BioSourceAttestation,
    pub ecosystem_credits: EcosystemCreditLedger,
    pub kinship: KinshipGraph,
    pub antifragile: Antifragile,
    pub swarm_consensus: SwarmConsensus,
    pub stigmergy: Stigmergy,
    pub immune_response: ImmuneResponse,
    pub mycelium_mesh: MyceliumMesh,
    pub camouflage: Camouflage,
    pub mimicry: Mimicry,
    pub seed_dispersal: SeedDispersal,
    pub root_bridge: RootBridge,
    pub phototropism: Phototropism,
    pub circadian: Circadian,
    pub symbiosis: Symbiosis,
    pub apoptosis: Apoptosis,
    pub metamorphosis: Metamorphosis,
    pub echolocation: Echolocation,
    pub bioluminescence: Bioluminescence,
    pub thermoregulation: Thermoregulation,
    pub hibernation: Hibernation,
    pub regeneration: Regeneration,
}

impl PPPRegistry {
    /// Construct a new registry with default-configured modules.
    pub fn new() -> Self {
        Self {
            bio_source: BioSourceAttestation::new(),
            ecosystem_credits: EcosystemCreditLedger::new(),
            kinship: KinshipGraph::new(),
            antifragile: Antifragile::new(0.7),
            swarm_consensus: SwarmConsensus::new(3),
            stigmergy: Stigmergy::new(0.1),
            immune_response: ImmuneResponse::new(),
            mycelium_mesh: MyceliumMesh::new(),
            camouflage: Camouflage::new(),
            mimicry: Mimicry::new(),
            seed_dispersal: SeedDispersal::new(),
            root_bridge: RootBridge::new(),
            phototropism: Phototropism::new(0.5, 0.01),
            circadian: Circadian::new(),
            symbiosis: Symbiosis::new(),
            apoptosis: Apoptosis::new(),
            metamorphosis: Metamorphosis::new(),
            echolocation: Echolocation::new(),
            bioluminescence: Bioluminescence::new(),
            thermoregulation: Thermoregulation::new(1000.0, 1.5, 0.2),
            hibernation: Hibernation::new(1800),
            regeneration: Regeneration::new(),
        }
    }

    /// Evaluate all stateless/context-driven modules against `context`.
    ///
    /// Returns one `PPPDecision` per applicable module. Modules that require
    /// external state (e.g., swarm votes, session presence) return `ALLOW`
    /// with low confidence when no relevant data is available.
    pub fn apply_all(&self, context: &SecurityContext) -> Vec<PPPDecision> {
        let mut decisions = Vec::with_capacity(22);

        // 1. Bio-source attestation
        {
            let result = self.bio_source.attest(&context.user_id, &context.session_id);
            if result.consistent {
                decisions.push(PPPDecision::allow(
                    "bio_source",
                    1.0 - result.anomaly_score,
                    "behavioral fingerprint consistent",
                ));
            } else {
                decisions.push(PPPDecision::warn(
                    "bio_source",
                    result.anomaly_score,
                    &format!(
                        "behavioral anomaly detected: score={:.2}",
                        result.anomaly_score
                    ),
                ));
            }
        }

        // 2. Ecosystem credits — warn if user has zero balance (no history of contribution)
        {
            let balance = self.ecosystem_credits.balance(&context.user_id);
            if balance >= 0 {
                decisions.push(PPPDecision::allow(
                    "ecosystem_credits",
                    0.6 + (balance.min(400) as f32 / 1000.0),
                    &format!("credit balance: {}", balance),
                ));
            } else {
                decisions.push(PPPDecision::warn(
                    "ecosystem_credits",
                    0.5,
                    "negative credit balance — no contribution history",
                ));
            }
        }

        // 3. Kinship graph — check propagated trust
        {
            let trust = self.kinship.propagate_trust(&context.user_id);
            if trust >= 0.5 {
                decisions.push(PPPDecision::allow(
                    "kinship_graph",
                    trust,
                    &format!("trust network score: {:.2}", trust),
                ));
            } else {
                decisions.push(PPPDecision::warn(
                    "kinship_graph",
                    1.0 - trust,
                    &format!("low trust network score: {:.2}", trust),
                ));
            }
        }

        // 4. Antifragile — report current threshold adaptation
        {
            let state = self.antifragile.state();
            decisions.push(PPPDecision::adapt(
                "antifragile",
                state.attack_pressure,
                &format!(
                    "threshold adapted to {:.3} under pressure {:.2}",
                    state.current_threshold, state.attack_pressure
                ),
            ));
        }

        // 5. Swarm consensus — evaluate a hypothetical vote on the session
        {
            let result = self.swarm_consensus.consensus(&context.session_id);
            let d = match (result.quorum_reached, &result.decision) {
                (false, _) => PPPDecision::allow("swarm_consensus", 0.5, "no quorum yet"),
                (true, swarm_consensus::Vote::Sensitive) => PPPDecision::warn(
                    "swarm_consensus",
                    result.confidence,
                    "swarm voted SENSITIVE",
                ),
                (true, swarm_consensus::Vote::Safe) => PPPDecision::allow(
                    "swarm_consensus",
                    result.confidence,
                    "swarm voted SAFE",
                ),
                (true, swarm_consensus::Vote::Uncertain) => PPPDecision::warn(
                    "swarm_consensus",
                    0.4,
                    "swarm consensus uncertain",
                ),
            };
            decisions.push(d);
        }

        // 6. Stigmergy — check trail intensity for the platform endpoint
        {
            let intensity = self.stigmergy.read(&context.platform);
            if intensity > 0.7 {
                decisions.push(PPPDecision::warn(
                    "stigmergy",
                    intensity,
                    &format!("high pheromone trail on {}: {:.2}", context.platform, intensity),
                ));
            } else {
                decisions.push(PPPDecision::allow(
                    "stigmergy",
                    1.0 - intensity,
                    &format!("trail intensity normal: {:.2}", intensity),
                ));
            }
        }

        // 7. Immune response — check risk_score as a proxy pattern
        {
            if context.risk_score > 0.8 {
                let strength = self.immune_response.response_strength("high-risk");
                decisions.push(PPPDecision::deny(
                    "immune_response",
                    strength.max(0.8),
                    &format!("high risk score {:.2} triggers immune response", context.risk_score),
                ));
            } else {
                decisions.push(PPPDecision::allow(
                    "immune_response",
                    1.0 - context.risk_score,
                    "risk score within normal range",
                ));
            }
        }

        // 8. Mycelium mesh — routing health (always ALLOW unless mesh has 0 healthy nodes)
        {
            let healthy = self.mycelium_mesh.healthy_count();
            if healthy > 0 {
                decisions.push(PPPDecision::allow(
                    "mycelium_mesh",
                    1.0,
                    &format!("{} healthy routing nodes", healthy),
                ));
            } else {
                decisions.push(PPPDecision::warn(
                    "mycelium_mesh",
                    0.9,
                    "no healthy routing nodes registered",
                ));
            }
        }

        // 9. Camouflage — always ALLOW (structural, not risk-driven)
        decisions.push(PPPDecision::allow(
            "camouflage",
            1.0,
            "response normalisation active",
        ));

        // 10. Mimicry — check if user is in a honeypot session
        {
            let mimicked = self.mimicry.is_mimicked(&context.user_id);
            if mimicked {
                decisions.push(PPPDecision::warn(
                    "mimicry",
                    0.95,
                    "user is in active honeypot session — decoy responses engaged",
                ));
            } else {
                decisions.push(PPPDecision::allow(
                    "mimicry",
                    1.0,
                    "no active mimicry session",
                ));
            }
        }

        // 11. Seed dispersal — operational, no per-request risk signal
        decisions.push(PPPDecision::allow(
            "seed_dispersal",
            1.0,
            &format!("{} seeds in store", self.seed_dispersal.total_seeds()),
        ));

        // 12. Root bridge — operational, no per-request risk signal
        decisions.push(PPPDecision::allow(
            "root_bridge",
            1.0,
            "cross-domain bridge operational",
        ));

        // 13. Phototropism — report current threshold
        {
            let t = self.phototropism.current_threshold();
            decisions.push(PPPDecision::adapt(
                "phototropism",
                0.8,
                &format!("detection threshold auto-tuned to {:.3}", t),
            ));
        }

        // 14. Circadian — pass/deny based on "default" policy if registered
        {
            // If no policy is registered, default to ALLOW.
            let allowed = self.circadian.get_policy("default")
                .map(|_| self.circadian.is_allowed("default"))
                .unwrap_or(true);
            if allowed {
                decisions.push(PPPDecision::allow(
                    "circadian",
                    1.0,
                    "current time is within allowed access window",
                ));
            } else {
                decisions.push(PPPDecision::deny(
                    "circadian",
                    0.99,
                    "access denied: outside allowed time window",
                ));
            }
        }

        // 15. Symbiosis — operational
        decisions.push(PPPDecision::allow(
            "symbiosis",
            1.0,
            &format!("{} symbiotic partners registered", self.symbiosis.partners().len()),
        ));

        // 16. Apoptosis — warn if session_id is scheduled for death
        {
            let alive = self.apoptosis.is_alive(&context.session_id);
            let dead = self.apoptosis.is_dead(&context.session_id);
            if dead {
                decisions.push(PPPDecision::deny(
                    "apoptosis",
                    1.0,
                    "session data has passed its TTL and been reaped",
                ));
            } else if alive {
                let remaining = self.apoptosis.ttl_remaining(&context.session_id);
                decisions.push(PPPDecision::allow(
                    "apoptosis",
                    1.0,
                    &format!("session alive, {}s remaining", remaining),
                ));
            } else {
                decisions.push(PPPDecision::allow(
                    "apoptosis",
                    1.0,
                    "session not scheduled for apoptosis",
                ));
            }
        }

        // 17. Metamorphosis — check if the session credential is valid
        {
            let valid = self.metamorphosis.is_valid(&context.user_id, &context.session_id);
            if valid {
                decisions.push(PPPDecision::allow(
                    "metamorphosis",
                    1.0,
                    "credential matches active identity stage",
                ));
            } else {
                // Not necessarily an error — most sessions won't be in the metamorphosis store.
                decisions.push(PPPDecision::allow(
                    "metamorphosis",
                    0.7,
                    "credential not in metamorphosis store (no rotation tracked)",
                ));
            }
        }

        // 18. Echolocation — report security score for the platform endpoint
        {
            let score = self.echolocation.security_score(&context.platform);
            if score > 0.0 {
                decisions.push(PPPDecision::allow(
                    "echolocation",
                    score,
                    &format!("endpoint security score: {:.2}", score),
                ));
            } else {
                decisions.push(PPPDecision::allow(
                    "echolocation",
                    0.5,
                    "endpoint not yet probed",
                ));
            }
        }

        // 19. Bioluminescence — report active canary count
        {
            let active = self.bioluminescence.list_active().len();
            let triggered = self.bioluminescence.list_triggered().len();
            if triggered > 0 {
                decisions.push(PPPDecision::warn(
                    "bioluminescence",
                    0.95,
                    &format!("{} canary token(s) triggered — possible exfiltration", triggered),
                ));
            } else {
                decisions.push(PPPDecision::allow(
                    "bioluminescence",
                    1.0,
                    &format!("{} active canaries, none triggered", active),
                ));
            }
        }

        // 20. Thermoregulation — check if request is admitted
        {
            let admitted = self.thermoregulation.admit_request();
            if admitted {
                let state = self.thermoregulation.thermal_state();
                decisions.push(PPPDecision::allow(
                    "thermoregulation",
                    1.0,
                    &format!("load in {:?} zone, {:.1} rps", state.state, state.current_rps),
                ));
            } else {
                decisions.push(PPPDecision::deny(
                    "thermoregulation",
                    0.99,
                    "rate limit active — request shed (fever zone)",
                ));
            }
        }

        // 21. Hibernation — check if session is hibernating
        {
            let state = self.hibernation.state(&context.session_id);
            match state {
                Some(hibernation::SessionState::Hibernating) => {
                    decisions.push(PPPDecision::warn(
                        "hibernation",
                        0.8,
                        "session is in hibernation — re-authentication required",
                    ));
                }
                Some(hibernation::SessionState::Terminated) => {
                    decisions.push(PPPDecision::deny(
                        "hibernation",
                        1.0,
                        "session has been terminated",
                    ));
                }
                _ => {
                    decisions.push(PPPDecision::allow(
                        "hibernation",
                        1.0,
                        "session active or not tracked",
                    ));
                }
            }
        }

        // 22. Regeneration — report any active recovery plans
        {
            let plans = self.regeneration.plans_for_user(&context.user_id);
            let active_recoveries: Vec<_> = plans
                .iter()
                .filter(|p| {
                    p.status == regeneration::RecoveryStatus::Initiated
                        || p.status == regeneration::RecoveryStatus::InProgress
                })
                .collect();

            if !active_recoveries.is_empty() {
                decisions.push(PPPDecision::warn(
                    "regeneration",
                    0.9,
                    &format!(
                        "{} active recovery plan(s) — elevated monitoring",
                        active_recoveries.len()
                    ),
                ));
            } else {
                decisions.push(PPPDecision::allow(
                    "regeneration",
                    1.0,
                    "no active recovery plans",
                ));
            }
        }

        decisions
    }

    /// Aggregate all decisions into a single final verdict.
    ///
    /// Rules (in priority order):
    /// 1. Any DENY → final decision is DENY.
    /// 2. Any WARN  → final decision is WARN.
    /// 3. Any ADAPT → final decision is ADAPT.
    /// 4. All ALLOW → final decision is ALLOW.
    pub fn aggregate(decisions: &[PPPDecision]) -> PPPDecision {
        let deny = decisions.iter().find(|d| d.decision == "DENY");
        if let Some(d) = deny {
            return PPPDecision::deny(
                "registry",
                d.confidence,
                &format!("DENY from {}: {}", d.module, d.reasoning),
            );
        }

        let warn = decisions.iter().find(|d| d.decision == "WARN");
        if let Some(w) = warn {
            return PPPDecision::warn(
                "registry",
                w.confidence,
                &format!("WARN from {}: {}", w.module, w.reasoning),
            );
        }

        let adapt = decisions.iter().find(|d| d.decision == "ADAPT");
        if let Some(a) = adapt {
            return PPPDecision::adapt(
                "registry",
                a.confidence,
                &format!("ADAPT from {}: {}", a.module, a.reasoning),
            );
        }

        let avg_confidence = if decisions.is_empty() {
            1.0
        } else {
            decisions.iter().map(|d| d.confidence).sum::<f32>() / decisions.len() as f32
        };

        PPPDecision::allow("registry", avg_confidence, "all modules: ALLOW")
    }
}

impl Default for PPPRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_apply_all_returns_22_decisions() {
        let registry = PPPRegistry::new();
        let ctx = SecurityContext::new("user-001", "sess-abc", 0.1, "chrome-ext");
        let decisions = registry.apply_all(&ctx);
        assert_eq!(
            decisions.len(),
            22,
            "expected exactly 22 decisions, got {}",
            decisions.len()
        );
    }

    #[test]
    fn test_registry_all_modules_named() {
        let registry = PPPRegistry::new();
        let ctx = SecurityContext::new("user-002", "sess-xyz", 0.0, "cli");
        let decisions = registry.apply_all(&ctx);
        let names: Vec<&str> = decisions.iter().map(|d| d.module.as_str()).collect();

        let expected = [
            "bio_source", "ecosystem_credits", "kinship_graph", "antifragile",
            "swarm_consensus", "stigmergy", "immune_response", "mycelium_mesh",
            "camouflage", "mimicry", "seed_dispersal", "root_bridge",
            "phototropism", "circadian", "symbiosis", "apoptosis",
            "metamorphosis", "echolocation", "bioluminescence", "thermoregulation",
            "hibernation", "regeneration",
        ];

        for name in &expected {
            assert!(
                names.contains(name),
                "missing decision from module: {}",
                name
            );
        }
    }

    #[test]
    fn test_aggregate_deny_wins() {
        let decisions = vec![
            PPPDecision::allow("a", 1.0, "ok"),
            PPPDecision::deny("b", 0.9, "bad"),
            PPPDecision::warn("c", 0.7, "suspicious"),
        ];
        let agg = PPPRegistry::aggregate(&decisions);
        assert_eq!(agg.decision, "DENY");
    }

    #[test]
    fn test_aggregate_warn_beats_allow() {
        let decisions = vec![
            PPPDecision::allow("a", 1.0, "ok"),
            PPPDecision::warn("b", 0.7, "watch"),
        ];
        let agg = PPPRegistry::aggregate(&decisions);
        assert_eq!(agg.decision, "WARN");
    }

    #[test]
    fn test_aggregate_all_allow() {
        let decisions = vec![
            PPPDecision::allow("a", 0.9, "ok"),
            PPPDecision::allow("b", 0.95, "ok"),
        ];
        let agg = PPPRegistry::aggregate(&decisions);
        assert_eq!(agg.decision, "ALLOW");
    }

    #[test]
    fn test_high_risk_triggers_immune_deny() {
        let registry = PPPRegistry::new();
        // Pre-expose the high-risk pattern so immune response has memory.
        registry.immune_response.build_memory("high-risk", 1.0);
        let ctx = SecurityContext::new("user-003", "sess-high", 0.95, "sdk");
        let decisions = registry.apply_all(&ctx);
        let immune_decision = decisions
            .iter()
            .find(|d| d.module == "immune_response")
            .unwrap();
        assert_eq!(immune_decision.decision, "DENY");
    }

    #[test]
    fn test_security_context_clamps_risk_score() {
        let ctx = SecurityContext::new("u", "s", 1.5, "ext"); // above 1.0
        assert_eq!(ctx.risk_score, 1.0);
        let ctx2 = SecurityContext::new("u", "s", -0.5, "ext"); // below 0.0
        assert_eq!(ctx2.risk_score, 0.0);
    }
}
