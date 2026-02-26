# Hysteresis + Prompt Budgets + Burst Aggregation

Advanced intervention refinements. Park until base model is validated.

## Hysteresis (Prevent flip-flop at boundaries)

```rust
pub fn decide_intervention(risk_score: u32, previous_state: InterventionLevel) -> InterventionLevel {
    match previous_state {
        InterventionLevel::Silent => {
            if risk_score >= 35 { InterventionLevel::Warning }
            else { InterventionLevel::Silent }
        }
        InterventionLevel::Warning => {
            if risk_score >= 75 { InterventionLevel::Block }
            else if risk_score <= 25 { InterventionLevel::Silent }
            else { InterventionLevel::Warning }
        }
        InterventionLevel::Block => {
            if risk_score <= 65 { InterventionLevel::Warning }
            else { InterventionLevel::Block }
        }
    }
}
```

## Prompt Budgets

```rust
pub struct InterventionBudget {
    pub prompts_today: u32,       // Max 1 modal per day
    pub warnings_this_hour: u32,  // Max 3 toasts per hour
    pub last_suppression: u64,    // timestamp
    pub suppression_window_secs: u64, // 60s per site+verb combo
}
```

When budget exceeded: return `intervention: "silent"` with `reason: "budget_suppressed"`.

## Burst Aggregation (Clipboard)

Instead of "Credit Card found!" per event, aggregate:
- "Detected: API key (2), Credit Card (1)"
- Max 1 dialog per 30s even for critical findings

```rust
pub struct BurstAggregator {
    pub events: Vec<ClipboardEvent>,
    pub last_dialog_ts: u64,
    pub cooldown_secs: u64,
}
```
