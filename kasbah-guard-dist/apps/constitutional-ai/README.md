# Constitutional AI — Dialogue Safety Service

> Safety validation service for AI-assisted actions in Kasbah Guard

**Version**: 1.0.0 | **Status**: Foundation phase

---

## Overview

Constitutional AI provides intent validation for user actions before execution:

- **Prompt Injection Detection**: Blocks attempts to override system instructions
- **Jailbreak Prevention**: Detects attempts to circumvent safety policies
- **Policy Enforcement**: Custom policy rules per deployment
- **Risk Scoring**: Confidence-based decision support
- **Approval Workflow**: Human review for borderline cases

---

## API Endpoint

### POST /api/validate-intent

Validate user intent against constitutional policies.

**Request**:
```json
{
  "intent": "User's intended action as text",
  "policy_id": "default",
  "user_id": "user_123",
  "context": {
    "platform": "chatgpt",
    "timestamp": 1708992000
  }
}
```

**Response**:
```json
{
  "valid": true,
  "risk_score": 0.25,
  "reasoning": "Intent appears safe. No violations detected.",
  "blocked_rules": [],
  "requires_approval": false
}
```

---

## Policy Rules (Built-in)

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `injection_attack` | Prompt injection detected | CRITICAL |
| `jailbreak_attempt` | Jailbreak attempt | CRITICAL |
| `data_exfiltration` | Data theft intent | HIGH |
| `malware_intent` | Malware development | CRITICAL |
| `privacy_violation` | Privacy breach attempt | HIGH |

---

## Usage

### Development

```bash
npm install
npm run dev
# Server runs on http://localhost:3000
```

### Testing

```bash
npm test
npm run test:watch
```

### Production Build

```bash
npm run build
npm start
```

---

## Integration with Kasbah Products

### Browser Extension
```typescript
// Before allowing content transmission
const result = await fetch('http://localhost:3000/api/validate-intent', {
  method: 'POST',
  body: JSON.stringify({
    intent: userInput,
    platform: 'chatgpt',
  })
});

if (!result.valid) {
  // Show warning modal
}
```

### CLI Tool
```bash
kasbah validate-intent "describe how to make explosives"
# Output: BLOCKED (malware_intent)
```

### Desktop App
```rust
// In Tauri IPC command
pub fn validate_intent(text: String) -> bool {
  let client = reqwest::Client::new();
  let response = client
    .post("http://localhost:3000/api/validate-intent")
    .json(&json!({ "intent": text }))
    .send()
    .await?;

  let result = response.json::<ValidationResult>().await?;
  Ok(result.valid)
}
```

---

## Architecture

```
POST /api/validate-intent
    ↓
Input Validation (Zod schema)
    ↓
Policy Constraint Matching
    ├─ Pattern matching (regex)
    └─ Heuristic scoring (entropy, repetition)
    ↓
Risk Calculation
    ├─ Severity scoring
    └─ Heuristic risk
    ↓
Decision Making
    ├─ Risk threshold check
    └─ Approval requirement
    ↓
Response (JSON)
```

---

## Configuration

Environment variables:

```bash
NODE_ENV=production          # development, production
PORT=3000                    # Server port
LOG_LEVEL=info              # debug, info, warn, error
RISK_THRESHOLD=0.5          # Safety threshold
APPROVAL_THRESHOLD=0.4      # Requires approval if > threshold
```

---

## Roadmap

### v1.0.0 (Current)
- ✅ Pattern matching rules
- ✅ Heuristic risk scoring
- ✅ Policy enforcement
- ✅ REST API

### v1.1.0
- [ ] LLM-based reasoning
- [ ] Dialogue memory (context)
- [ ] Custom policy UI
- [ ] Audit logging

### v2.0.0
- [ ] Multi-model ensemble
- [ ] User feedback loop
- [ ] Automatic policy adaptation
- [ ] Distributed deployment

---

## Testing

```bash
# Unit tests
npm test

# Integration tests (with other Kasbah services)
npm run test:integration

# Red team / adversarial tests
npm run test:red-team
```

---

## License

MIT

---

**Last Updated**: 2026-02-28
