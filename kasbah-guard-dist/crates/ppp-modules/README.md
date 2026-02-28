# kasbah-ppp-modules

**Privacy-Preserving Protocol (PPP) — Nature-Inspired Security Library**

Version 1.0.0 | Kasbah Guard | Rust 2021 Edition

---

## Overview

`kasbah-ppp-modules` implements 22 security primitives inspired by biological
and ecological systems. Each module encodes a distinct nature metaphor into
a concrete, testable security mechanism.

The library is the Rust counterpart to the 6 PPP techniques already live in
the JavaScript `detector.js` engine (v3.5.2). Where the JS engine detects
threats in real-time in the browser, these Rust modules provide the deeper
infrastructure: session management, trust networks, data lifecycle
enforcement, and recovery orchestration.

**Test results: 95/95 tests pass.**

---

## Quick Start

```rust
use kasbah_ppp_modules::{PPPRegistry, SecurityContext};

// Construct the registry once at startup.
let registry = PPPRegistry::new();

// Build a context for each evaluated event.
let ctx = SecurityContext::new(
    "user-001",      // user_id
    "sess-abc123",   // session_id
    0.15,            // risk_score from JS detector (0.0–1.0)
    "chrome-ext",    // platform tag
);

// Evaluate all 22 modules.
let decisions = registry.apply_all(&ctx);

// Aggregate to a single verdict.
let verdict = PPPRegistry::aggregate(&decisions);
println!("{}: {} (confidence {:.0}%)", verdict.module, verdict.decision, verdict.confidence * 100.0);
// registry: ALLOW (confidence 85%)
```

---

## Module Reference

### 1. Bio-Source Attestation (`bio_source`)

**Nature metaphor:** Every organism has a unique biological signature — heartbeat
rhythm, gait, fingerprint. Identity is continuous, not a single checkpoint.

**Security application:** Continuous authentication via behavioural biometrics.
Tracks per-user feature vectors (typing cadence, mouse velocity, scroll rhythm).
Computes pairwise cosine similarity across a rolling window of up to 50 samples.
Sessions with anomaly scores above 0.35 are flagged inconsistent.

**API summary:**
```rust
let bio = BioSourceAttestation::new();
bio.update_fingerprint("alice", &[1.2, 0.8, 3.1, 0.4]); // feature vector
let result = bio.attest("alice", "sess-001");
// AttestationResult { consistent: true, anomaly_score: 0.02, .. }
```

**Integration:** Browser extension → desktop app via IPC on each keystroke batch.

---

### 2. Ecosystem Credit Ledger (`ecosystem_credits`)

**Nature metaphor:** Healthy ecosystems run on nutrient cycles. Organisms that
contribute (pollinators, decomposers) enable the productivity of the whole.
Pure extractors collapse the ecosystem.

**Security application:** Off-chain, in-memory incentive ledger. Users earn
credits by submitting verified threat reports or participating in audits.
Credits unlock elevated access tiers, rate-limit waivers, or beta features —
no monetary exchange, ever. Full JSON export for compliance audit.

**API summary:**
```rust
let ledger = EcosystemCreditLedger::new();
ledger.issue("alice", 100, "threat report verified").unwrap();
ledger.redeem("alice", 25, "rate-limit waiver").unwrap();
ledger.transfer("alice", "bob", 50).unwrap();
println!("balance: {}", ledger.balance("alice")); // 25
let full = ledger.export_ledger(); // serde_json::Value
```

**Integration:** API worker (`api.bekasbah.com`) calls `issue()` after validating
submitted reports. Enterprise dashboard reads `export_ledger()`.

---

### 3. Kinship Graph (`kinship_graph`)

**Nature metaphor:** Wolf packs and primate troops build trust through shared
experience. A wolf does not automatically trust a stranger; trust is earned
through collaboration and verified over time.

**Security application:** Directed trust graph for social recovery and federated
access. BFS shortest-trust-path traversal for vouching chains. Cycle detection
flags manufactured trust rings. Recovery network returns contacts with
trust_score >= 0.7 for account restoration.

**API summary:**
```rust
let graph = KinshipGraph::new();
graph.add_edge("alice", "bob", 0.9, KinshipType::Vouched);
graph.add_edge("bob", "carol", 0.8, KinshipType::Collaborated);

let path = graph.get_trust_path("alice", "carol"); // Some(["alice", "bob", "carol"])
let recovery = graph.recovery_network("alice");     // ["bob"]
let has_cycle = graph.detect_circle_trust("alice"); // false
```

**Integration:** Shared across enterprise dashboard (team trust) and desktop app
(social recovery flow).

---

### 4. Antifragile Adaptation (`antifragile`)

**Nature metaphor:** Bone density increases under stress. Muscles grow stronger
after microtears. The immune system improves after pathogen exposure. Antifragile
systems benefit from shocks — they do not merely survive them.

**Security application:** Attack-pressure-responsive threshold tightening.
As attack events accumulate, the effective blocking threshold decreases
(more aggressive detection). Periodic decay models quiet periods, relaxing
thresholds to minimise false positives.

**API summary:**
```rust
let af = Antifragile::new(0.7); // base_threshold
af.record_attack();              // raises pressure
af.decay();                      // models quiet period
let state = af.state();
// AdaptationState { attack_pressure: 0.01, current_threshold: 0.698, .. }
```

**Integration:** detector.js feeds attack counts; antifragile adjusts the
threshold used by subsequent scan passes.

---

### 5. Swarm Consensus (`swarm_consensus`)

**Nature metaphor:** A murmuration of starlings achieves collective decisions
with no central controller. Each bird follows three local rules; the flock
moves as a unified mind.

**Security application:** Distributed threat voting. Each Kasbah product
(extension, CLI, desktop, SDK) casts a weighted confidence vote on whether a
data item is sensitive. A quorum is required for a definitive decision;
below quorum the result is Uncertain.

**API summary:**
```rust
let sc = SwarmConsensus::new(3); // quorum = 3 agents
sc.cast_vote("item-001", "chrome-ext", Vote::Sensitive, 0.9);
sc.cast_vote("item-001", "cli-agent",  Vote::Sensitive, 0.8);
sc.cast_vote("item-001", "sdk-agent",  Vote::Safe,      0.5);
let result = sc.consensus("item-001");
// ConsensusResult { decision: Sensitive, confidence: 0.63, quorum_reached: true }
```

**Integration:** Cross-product signal aggregation layer.

---

### 6. Stigmergy (`stigmergy`)

**Nature metaphor:** Ants deposit pheromone trails that guide other ants.
No ant knows the global plan; intelligence emerges from accumulated marks.
Trails intensify with traffic, evaporate over time.

**Security application:** Indirect threat coordination between agents without
direct communication. When an agent detects a suspicious endpoint, it deposits
a stigmergic mark. Other agents reading that endpoint apply heightened scrutiny.

**API summary:**
```rust
let stg = Stigmergy::new(0.1); // 10% decay per cycle
stg.deposit("/api/login", 0.6);
let intensity = stg.read("/api/login"); // 0.6
stg.decay();
let after = stg.read("/api/login");     // ~0.54
```

**Integration:** Shared between browser extension (page-level) and CLI (file-path).

---

### 7. Adaptive Immune Response (`immune_response`)

**Nature metaphor:** The vertebrate adaptive immune system is naive on first
exposure, builds memory B-cells, and mounts an amplified response on re-exposure.
Memory is antigen-specific and long-lasting.

**Security application:** Pattern-based threat memory. First exposure to an
attack pattern = Memory level. Repeated high-severity exposures = Active level.
Response strength computed via tanh(exposure_count × avg_severity) — saturates
at 1.0 for heavily-reinforced patterns.

**API summary:**
```rust
let ir = ImmuneResponse::new();
ir.build_memory("sql-injection", 0.9);
ir.build_memory("sql-injection", 0.9); // reinforce
let level = ir.immunity_level("sql-injection"); // Active
let strength = ir.response_strength("sql-injection"); // ~0.96
ir.prune_old(86400); // forget patterns older than 24h
```

**Integration:** detector.js feeds confirmed attack hashes; immune_response
strengthens those patterns across future scans.

---

### 8. Mycelium Mesh Routing (`mycelium_mesh`)

**Nature metaphor:** The wood wide web — underground fungal networks connecting
trees. Nutrients and chemical signals travel along mycelium threads. Losing one
thread causes instant rerouting; the mesh heals itself.

**Security application:** Resilient message routing between Kasbah agent nodes.
BFS pathfinding skips unhealthy nodes automatically. Used for threat-intel
distribution where a failed relay node must not block propagation.

**API summary:**
```rust
let mesh = MyceliumMesh::new();
mesh.register_node("a", vec!["b".to_string(), "c".to_string()]);
mesh.register_node("b", vec!["d".to_string()]);
mesh.register_node("c", vec!["d".to_string()]);
mesh.mark_failed("b");
let path = mesh.route("a", "d"); // Some(["a", "c", "d"])
```

**Integration:** Desktop app ↔ extension relay topology.

---

### 9. Context Camouflage (`camouflage`)

**Nature metaphor:** The cuttlefish changes colour, pattern, and texture in
milliseconds to match any substrate. It does not hide — it becomes
indistinguishable from context.

**Security application:** Response normalisation to prevent traffic analysis.
Field names are aliased, response sizes are padded to fixed targets, and
timing is normalised. An observer cannot infer data sensitivity from response
shape alone.

**API summary:**
```rust
let mut cam = Camouflage::new();
cam.register_profile(CamouflageProfile {
    profile_id: "api-v1".to_string(),
    target_size: 512,
    field_aliases: [("ssn".to_string(), "ref_id".to_string())].into(),
});
let aliased = cam.apply_aliases("api-v1", data_map);
let padded  = cam.normalise_size("api-v1", response_string);
```

**Integration:** API worker response middleware.

---

### 10. Defensive Mimicry (`mimicry`)

**Nature metaphor:** The harmless kingsnake mimics the deadly coral snake.
Predators that have learned to avoid the model also avoid the mimic —
protection via illusion.

**Security application:** Honeypot response mimicry for known-bad actors.
When an actor is identified as malicious, their requests are silently routed
to a decoy session. They receive plausible-looking fake responses while
defenders observe their full playbook.

**API summary:**
```rust
let mim = Mimicry::new();
mim.register_decoy("fake-api", r#"{"token":"fake-token-xyz"}"#);
mim.begin_session("bad-actor-ip", "fake-api");
let resp = mim.decoy_response("bad-actor-ip"); // Some("...")
let sessions = mim.active_sessions();
```

**Integration:** API worker rate-limit / blocklist middleware.

---

### 11. Seed Dispersal (`seed_dispersal`)

**Nature metaphor:** Plants package seeds for dispersal tuned to each vector —
dandelion floats on wind (broadcast), berry carried by birds (targeted),
burr attaches to fur (passive). Germination only occurs under correct conditions.

**Security application:** Controlled threat-intel propagation. A detected threat
signature is seeded using the appropriate transport for the target audience.
Targeted seeds only germinate for authorised agents.

**API summary:**
```rust
let sd = SeedDispersal::new();
// Broadcast to all agents.
let s1 = sd.plant("threat-sig-abc", DispersalMethod::Broadcast, None);
// Targeted to specific agents only.
let s2 = sd.plant("private-intel", DispersalMethod::Targeted(vec!["agent-x".to_string()]), None);
// Collect.
let payload = sd.collect(&s1.seed_id, "any-agent"); // Some("threat-sig-abc")
let denied  = sd.collect(&s2.seed_id, "agent-y");   // None
```

**Integration:** Cross-product intel bus.

---

### 12. Root Bridge Protocol (`root_bridge`)

**Nature metaphor:** Mangrove roots bridge land and sea — anchoring in unstable
substrate, filtering saltwater, creating protected nursery zones. The roots
mediate between two hostile environments.

**Security application:** Cross-domain trust bridging. When two security domains
(enterprise network and cloud tenant) need to share threat intelligence without
direct trust, Root Bridge mediates: normalises, validates, and re-signs intel
crossing the boundary using SHA-256 domain secrets.

**API summary:**
```rust
let rb = RootBridge::new();
rb.register_domain("corp-net", "shared-secret-a");
let msg = rb.bridge("corp-net", "cloud-tenant", "threat-payload").unwrap();
assert!(rb.validate(&msg)); // true
// Tamper → false
msg.payload = "modified".to_string();
assert!(!rb.validate(&msg));
```

**Integration:** Enterprise multi-tenant deployments.

---

### 13. Phototropism (`phototropism`)

**Nature metaphor:** Plants grow toward light via auxin redistribution causing
differential cell elongation. The plant bends toward the optimum without
central coordination — gradient descent in biological form.

**Security application:** Gradient-guided detection threshold auto-tuning.
Records true/false positive/negative feedback. When FP rate exceeds FN rate,
the threshold rises (less sensitive). When FN dominates, it falls (more sensitive).
Converges toward the Pareto-optimal operating point.

**API summary:**
```rust
let pt = Phototropism::new(0.5, 0.01); // initial_threshold, step
pt.record_fp(); // too many false positives
pt.bend_toward_light(); // raises threshold
let metrics = pt.metrics();
// TropismMetrics { precision: 0.0, recall: 0.0, f1_score: 0.0, current_threshold: 0.51 }
```

**Integration:** Feedback loop from user-reported false positives (extension
"not sensitive" button) feeds `record_fp()`; missed detections feed `record_fn()`.

---

### 14. Circadian Rhythm (`circadian`)

**Nature metaphor:** Every living organism is governed by a circadian clock.
Gene expression, hormone release, immune strength all vary by time of day.
Attempting to access a flower's nectar at night is met with resistance.

**Security application:** Time-windowed access policies. Sensitive operations
(bulk exports, admin access, privileged API calls) are restricted to designated
UTC time windows. Attempts outside the window are denied regardless of
credentials.

**API summary:**
```rust
let circ = Circadian::new();
circ.add_business_hours_policy("admin-access"); // Mon–Fri, 09:00–17:59 UTC
let allowed = circ.is_allowed("admin-access");  // true if within window now
let allowed_at = circ.is_allowed_at("admin-access", 10, 1); // 10:00 Tuesday → true
let wait = circ.time_until_allowed("admin-access"); // Duration until next window
```

**Integration:** API worker middleware (`/api/admin/*` routes).

---

### 15. Symbiosis (`symbiosis`)

**Nature metaphor:** Clownfish and sea anemone — each benefits the other.
Oxpeckers and rhinoceros — the bird eats parasites; the rhino gets pest control.
Neither could thrive as well alone.

**Security application:** Mutual-benefit security partnerships between Kasbah
products. The browser extension shares page-context signals; the CLI shares
file-system context. Each product becomes more accurate with partner data.
The mutual benefit score tracks whether exchange is balanced.

**API summary:**
```rust
let sym = Symbiosis::new();
sym.register_partner("chrome-ext", "extension");
sym.register_partner("cli", "cli");
sym.share_signal("chrome-ext", "suspicious-form-on-login-page");
let signals = sym.consume_signals("cli");
// [("chrome-ext", "suspicious-form-on-login-page")]
```

**Integration:** Cross-product signal bus (extension ↔ desktop app ↔ CLI).

---

### 16. Apoptosis (`apoptosis`)

**Nature metaphor:** Apoptosis is controlled, programmed cell death — essential
for organism health. Without it, cancerous cells accumulate. The cell dismantles
itself cleanly and is absorbed without inflammation.

**Security application:** Privacy-by-design data lifecycle enforcement. Sensitive
data items (session tokens, PII fragments, temporary credentials) are scheduled
for guaranteed deletion at creation time. Postponement is capped at 5 extensions.
Every item has an immutable `DeathCertificate` for GDPR audit trails.

**API summary:**
```rust
let apo = Apoptosis::new();
let cert = apo.schedule_death("session-token-001", 3600); // 1h TTL
apo.postpone("session-token-001", 600).unwrap(); // +10 min (max 5 times)
let alive = apo.is_alive("session-token-001");   // true
let reaped = apo.reap_dead();                    // Vec<String> of expired IDs
apo.force_reap("session-token-001");             // immediate deletion (GDPR)
let cert = apo.certificate("session-token-001"); // Some(DeathCertificate)
```

**Integration:** Session management in desktop app and API worker.

---

### 17. Identity Metamorphosis (`metamorphosis`)

**Nature metaphor:** A caterpillar dissolves almost entirely inside its chrysalis
— a radical reconstruction, not gradual change. It emerges as a completely
different organism yet retains identity continuity.

**Security application:** Credential rotation with identity continuity. A user's
token or API key is replaced entirely (all prior credentials immediately
invalidated) while preserving access rights, kinship graph, and credit balance.
Full rotation history is retained.

**API summary:**
```rust
let meta = Metamorphosis::new();
meta.emerge("alice", "initial-token");
assert!(meta.is_valid("alice", "initial-token")); // true
meta.metamorphose("alice", "rotated-token-v2");
assert!(!meta.is_valid("alice", "initial-token")); // false — invalidated
assert!(meta.is_valid("alice", "rotated-token-v2")); // true
println!("rotations: {}", meta.rotation_count("alice")); // 1
```

**Integration:** Desktop app auth system; CLI session management.

---

### 18. Echolocation (`echolocation`)

**Nature metaphor:** Bats and dolphins navigate in total darkness by emitting
sound pulses and interpreting returning echoes. They build a complete spatial
model without ever seeing it directly.

**Security application:** Active endpoint security profiling. The system emits
calibrated probe requests and interprets response characteristics (timing,
status code, headers) to infer security posture — without direct access to
server configuration. Auth enforcement, rate limiting, and error rates are
all signal sources.

**API summary:**
```rust
let el = Echolocation::new();
let result = el.record_probe("https://api.example.com/login", 45, 401, vec![]);
// ProbeResult { inferred_security_score: 0.9, signals: ["auth-enforced"], .. }
let score = el.security_score("https://api.example.com/login"); // 0.9
```

**Integration:** CLI `kasbah scan --probe` flag; enterprise audit reports.

---

### 19. Bioluminescence (`bioluminescence`)

**Nature metaphor:** Deep-sea organisms use bioluminescence as lure and alarm.
The anglerfish dangles a glowing lure; the trap springs when prey approaches.
The light reveals — not conceals.

**Security application:** Canary token generation and tracking. Unique decoy
values are embedded in responses, documents, or API payloads. If a canary is
ever fetched, forwarded, or executed, it fires an alert confirming exfiltration.
Tokens are generated using BLAKE3 and expire after a configurable window.

**API summary:**
```rust
let bio = Bioluminescence::new();
let token = bio.generate_labeled("api-response-001", "customer-export", Some("https://hooks.example.com/canary"));
// Embed token.token_value in the response payload.

// Later — incoming request contains the canary value:
if let Some(id) = bio.find_by_value(&incoming_value) {
    bio.trigger(&id); // logs WARN: CANARY TRIGGERED
}
let triggered = bio.list_triggered();
```

**Integration:** API worker response middleware; enterprise audit dashboard.

---

### 20. Thermoregulation (`thermoregulation`)

**Nature metaphor:** Warm-blooded animals maintain core temperature within a
narrow band. Too cold → shiver. Too hot → sweat. The system always pushes back
toward homeostasis, not simply reacting to extremes.

**Security application:** Adaptive rate limiting and load shedding. Requests
are admitted or shed based on current RPS relative to a configurable target
band. Fever zone = throttle. Hypothermia zone = release reserved capacity.
The shed_count provides a real-time DDoS signal.

**API summary:**
```rust
let tr = Thermoregulation::new(1000.0, 1.5, 0.2); // target_rps, upper_ratio, lower_ratio
let admitted = tr.admit_request(); // false if in Fever zone
let state = tr.thermal_state();
// ThermalState { current_rps: 1200.0, state: Fever, shed_count: 47 }
tr.reset_window(); // call at the start of each measurement period
```

**Integration:** API worker request ingress; CLI `kasbah watch` stdin pipeline.

---

### 21. Hibernation (`hibernation`)

**Nature metaphor:** Bears enter deep hibernation — metabolic rate drops to 25%,
yet the bear does not die. Upon waking, full function resumes within hours.
Controlled dormancy, not death.

**Security application:** Inactive session management. Sessions idle past a
configurable threshold enter Hibernation state — privileges suspended, not
revoked. Re-authentication ("wake-up challenge") restores Active state.
Terminated sessions cannot be revived.

**API summary:**
```rust
let hib = Hibernation::new(1800); // 30-minute dormancy threshold
hib.register("sess-001", "alice");
// ... 30 minutes pass ...
let hibernated = hib.hibernate_stale(); // ["sess-001"]
hib.touch("sess-001"); // wake — back to Active
hib.terminate("sess-001"); // permanent
```

**Integration:** Desktop app session manager; API worker session middleware.

---

### 22. Regeneration (`recovery`)

**Nature metaphor:** The axolotl regrows entire limbs — not scar tissue but
fully functional replacement including bone, muscle, and nerves. Planarians
regrow from a single fragment.

**Security application:** Post-incident recovery orchestration. After a confirmed
breach, initiates a structured recovery plan: terminate all sessions, rotate
credentials, notify kinship network, preserve audit logs, re-attest identity,
restore credit balance. Each step is tracked with checkpoints until the system
is fully regenerated.

**API summary:**
```rust
let regen = Regeneration::new();
let plan = regen.initiate("alice", "credential-compromise");
// 6-step recovery plan created automatically.
regen.complete_checkpoint(&plan.plan_id, "terminate-all-sessions", None);
regen.complete_checkpoint(&plan.plan_id, "rotate-credentials", Some("metamorphosis v3 issued"));
regen.skip_checkpoint(&plan.plan_id, "restore-credit-balance", "no credits held");
let pct = regen.completion_pct(&plan.plan_id); // 33.3%
```

**Integration:** Enterprise dashboard incident response panel; desktop app
recovery wizard.

---

## PPPRegistry — Unified Evaluation

`PPPRegistry` owns one instance of all 22 modules and provides two entry points:

### `apply_all(context) -> Vec<PPPDecision>`

Evaluates all 22 modules against a `SecurityContext`. Returns exactly 22
`PPPDecision` structs. Each decision carries:
- `module`: short name (`"bio_source"`, `"circadian"`, etc.)
- `decision`: `ALLOW` | `WARN` | `DENY` | `ADAPT`
- `confidence`: 0.0–1.0
- `reasoning`: human-readable explanation

### `aggregate(decisions) -> PPPDecision`

Priority-ordered aggregation:
1. Any `DENY` → final `DENY`
2. Any `WARN` → final `WARN`
3. Any `ADAPT` → final `ADAPT`
4. All `ALLOW` → `ALLOW` (average confidence)

---

## Build

```bash
# Build
CARGO_TARGET_DIR=/tmp/kasbah-ppp-build \
  cargo build --release \
  --manifest-path kasbah-guard-dist/crates/ppp-modules/Cargo.toml

# Test (95/95)
CARGO_TARGET_DIR=/tmp/kasbah-ppp-build \
  cargo test \
  --manifest-path kasbah-guard-dist/crates/ppp-modules/Cargo.toml
```

---

## Relationship to JS Detector (v3.5.2)

The JavaScript `detector.js` engine implements 6 PPP techniques inline as
detection heuristics:

| JS Technique | Rust Module | Direction |
|---|---|---|
| Antifragile scoring | `antifragile` | JS feeds attack counts → Rust adjusts |
| Stigmergic trail hints | `stigmergy` | Rust trail intensities inform JS re-scan |
| Swarm vote aggregation | `swarm_consensus` | Cross-product voting |
| Immune memory tags | `immune_response` | Confirmed attacks reinforce Rust memory |
| Circadian gating | `circadian` | Rust policy → JS pre-check |
| Bio-source anomaly | `bio_source` | JS behavioral signals → Rust fingerprint |

The remaining 16 modules (`ecosystem_credits`, `kinship_graph`, `mycelium_mesh`,
`camouflage`, `mimicry`, `seed_dispersal`, `root_bridge`, `phototropism`,
`symbiosis`, `apoptosis`, `metamorphosis`, `echolocation`, `bioluminescence`,
`thermoregulation`, `hibernation`, `regeneration`) are pure Rust infrastructure
with no JS counterpart — they operate at the session, network, and data-lifecycle
layers where JavaScript has no access.

---

## Architecture Notes

- All modules are **thread-safe** (`Arc<DashMap<...>>` + `parking_lot::RwLock`).
- No blocking I/O — all state is in-memory (export to JSON for persistence).
- No external network calls from this crate.
- `PPPRegistry` is safe to share via `Arc<PPPRegistry>` across threads.
- `SecurityContext` is `Clone + Serialize + Deserialize` for IPC/logging.

---

*Kasbah Guard v1.0.0 — bekasbah.com*
