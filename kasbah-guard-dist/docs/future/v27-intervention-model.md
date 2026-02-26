# v27 Intervention Model — NotifyBlock + 4-Tier System

Parked from v26 strategic session. Implement when ready.

## 4-Tier Model (upgrade from current 3-tier)

```rust
pub enum InterventionLevel {
    SilentAllow,      // Safe — log only
    NotifyAllow,      // Mild risk — toast only
    NotifyBlock,      // High confidence — auto-block + toast (NEVER silent block)
    RequireDecision,  // Ambiguous — modal
}

pub fn decide_intervention(risk: u32, confidence: f32) -> InterventionLevel {
    match (risk, confidence) {
        (r, _) if r < 30 => InterventionLevel::SilentAllow,
        (r, _) if r < 60 => InterventionLevel::NotifyAllow,
        (r, c) if r >= 60 && c >= 0.9 => InterventionLevel::NotifyBlock,
        _ => InterventionLevel::RequireDecision,
    }
}
```

## Key Rule
- Auto-block is allowed. Silent block is NOT.
- Never block without acknowledgment.
- You may block without asking, but never without informing.

## NotifyBlock Toast Design
- Small green notification, top-right
- 2-3 seconds, no buttons, no dashboard CTA
- Text: "Kasbah blocked sensitive data from being sent to ChatGPT"
- Optional subtext: "Customer emails detected"
- Builds trust without friction

## NotifyAllow Toast
- Text: "Kasbah checked this — no action needed"
- Prevents users from wondering "is it doing anything?"

## Requires
- Confidence score from ML pipeline (currently not exposed in /decide)
- Track previous intervention state for hysteresis
