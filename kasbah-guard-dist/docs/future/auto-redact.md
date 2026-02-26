# Auto-Redact — Replace PII Before It Reaches AI

The highest-value Pro feature. Instead of blocking, silently replace.

## Concept

User pastes: "Customer John Smith, SSN 284-37-5192, email john@acme.com"
AI receives: "Customer [REDACTED], SSN [REDACTED], email [REDACTED]"

User never interrupted. AI gets useful context minus PII.

## Implementation Sketch

### Extension (content.js)
```javascript
// After /decide returns intervention: "redact"
if (res.intervention === "redact" && res.redacted_text) {
    // Replace composer text with redacted version
    replaceComposerText(res.redacted_text);
    showToast("Kasbah redacted sensitive data", false, verb);
    // Proceed with send — now safe
    if (onAllowCb) onAllowCb();
    return;
}
```

### Backend (guard.rs)
- /decide already has `redacted_preview` in many responses
- Extend to return full `redacted_text` when intervention is "redact"
- New intervention level between Warning and Block

### Billing
- Auto-redact is Pro-only feature
- Free users get block modal instead
- Each redaction costs 1 guard (value delivered)

## Why It's Pro-Only
- It's the "set and forget" feature
- Knowledge workers want this most
- It's the reason to upgrade from free
