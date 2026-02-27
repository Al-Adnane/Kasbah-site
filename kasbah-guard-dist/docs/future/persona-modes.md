# Persona Modes — Tuned Detection Profiles

## Settings UI (Extension Popup)

```html
<div class="settings-section">
    <h3>Persona Mode</h3>
    <select id="personaMode">
        <option value="knowledge_worker" selected>Knowledge Worker (Default)</option>
        <option value="developer">Developer (Verbose)</option>
        <option value="custom">Custom</option>
    </select>
    <p class="help-text">Knowledge Worker: Fewer prompts, stronger PII detection</p>
</div>
```

## Per-Persona Behavior

### Knowledge Worker (Default)
- Strong PII detection (CC, SSN, medical, passport)
- Aggressive on customer data patterns
- Silent on code patterns, API keys (not their concern)
- < 1 prompt/day target

### Developer
- Verbose mode — more warnings shown
- API keys, secrets, credentials flagged at warning level
- Code patterns checked
- Useful for devs who WANT to see what's being scanned

### Custom
- User picks which finding types trigger which intervention level
- Advanced users only

## Implementation
- Store in chrome.storage.local
- Send as part of /decide meta: `"persona": "knowledge_worker"`
- Guard adjusts thresholds per persona
