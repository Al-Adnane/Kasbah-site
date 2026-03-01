# Kasbah Guard — VS Code Extension v1.0.0

Real-time secret detection in VS Code. Detect API keys, passwords, credit cards, and 50+ secret formats as you code.

---

## Features

✅ **Real-time Detection** — Scans as you type, on save, and on paste
✅ **50+ Secret Formats** — API keys, passwords, credit cards, SSNs, GitHub tokens, AWS keys, etc.
✅ **Inline Diagnostics** — Color-coded warnings directly in editor
✅ **Quick Actions** — Redact sensitive text, report false positives
✅ **Local Processing** — 100% client-side detection, zero external calls
✅ **Privacy-First** — No secrets sent anywhere, even to Microsoft

---

## Installation

1. Open VS Code Extensions (Ctrl+Shift+X / Cmd+Shift+X)
2. Search: "Kasbah Guard"
3. Click Install

---

## Quick Start

### Basic Usage

The extension activates automatically and scans your code for secrets:

- **Inline Warnings** — Red/yellow squiggles show detected secrets
- **Hover Info** — Hover over a warning to see details
- **Status Bar** — Check the status bar (bottom-right) for file health

### Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Scan Current File | Ctrl+Shift+K (Cmd+Shift+K) | Rescan active file |
| Scan Entire Workspace | - | Scan all files (respects ignore patterns) |
| Redact Selection | - | Replace selected text with `[REDACTED: TYPE]` |
| Report False Positive | - | Help improve detection by reporting FPs |

---

## Configuration

Access via: Settings → Extensions → Kasbah Guard

### `kasbah.enabled` (boolean, default: `true`)
Enable/disable the extension

### `kasbah.threshold` (number, default: `40`)
Risk score threshold (0-100) to show warnings
- `0` — Show all detections
- `40` — Show medium+ risk (recommended)
- `70` — Show only high-risk detections

### `kasbah.scanOnSave` (boolean, default: `true`)
Automatically scan files when you save

### `kasbah.scanOnPaste` (boolean, default: `true`)
Warn if you paste potential secrets

### `kasbah.ignorePatterns` (array, default: `["*.test.*", "*.spec.*", "**/node_modules/**"]`)
File patterns to skip scanning

**Example:**
```json
{
  "kasbah.enabled": true,
  "kasbah.threshold": 50,
  "kasbah.ignorePatterns": [
    "**/*.test.ts",
    "**/*.mock.ts",
    "**/fixtures/**",
    "**/node_modules/**"
  ]
}
```

---

## Examples

### Detecting API Keys

When you paste an API key like:
```javascript
const API_KEY = 'sk-proj-abc123def456ghi789';
```

You'll see a red diagnostic: `⚠️ HIGH RISK: Detected potential api key (95% confidence)`

### Detecting Passwords in Code

```javascript
// ⚠️ WARNING: This will be flagged
const dbPassword = 'MyPassword123!';
```

### Using Redact Feature

1. Select sensitive text
2. Run "Kasbah: Redact Selection"
3. Text is replaced with `[REDACTED: TYPE]`

---

## Detected Secret Types

- **PII** — SSN, phone numbers, emails, passports
- **Financial** — Credit cards (Visa, Mastercard, Amex)
- **API Keys** — OpenAI, GitHub, AWS, Slack, Stripe, Twilio, SendGrid, Discord, etc.
- **Database Credentials** — MongoDB URIs, PostgreSQL passwords, Redis connections
- **Cryptography** — Private keys (RSA, OPENSSH, EC), certificates
- **Cryptocurrency** — Bitcoin/Ethereum addresses, seed phrases
- **Government IDs** — SSN, EIN, TIN, DNI, passports
- **Passwords** — Any assignment like `password=...`

See [detector.js](../../extensions/chrome/src/detector.js) for complete pattern list.

---

## Security & Privacy

✅ **Local Processing** — Everything runs on your machine
✅ **No Data Transmission** — Secrets never leave your device
✅ **No Telemetry** — We don't track what you detect
✅ **Open Source** — Code is publicly auditable

The extension uses detector.js v1.0.0, the same engine as the Kasbah Guard browser extension, optimized for accuracy and speed.

---

## Performance

Latency is typically <2ms per line:

| Metric | Value |
|--------|-------|
| p50 latency | 0.23ms |
| p95 latency | 0.87ms |
| p99 latency | 1.95ms |

The extension scans intelligently — it only re-scans changed lines, not the entire file.

---

## Troubleshooting

### "Kasbah not detecting secrets I expect"

1. Check `kasbah.threshold` — if set to 70, only high-risk items show
2. Verify the pattern is in the [50+ supported formats](../../extensions/chrome/src/detector.js)
3. Report false negatives: GitHub Issues

### "Too many false positives in my test files"

Add test patterns to `.ignore` or reduce `kasbah.threshold`:
```json
{
  "kasbah.ignorePatterns": [
    "**/*.test.ts",
    "**/__fixtures__/**",
    "**/examples/**"
  ]
}
```

### "Extension not scanning on paste"

Ensure `kasbah.scanOnPaste` is enabled in settings.

---

## Reporting Issues

- **Bug report** — https://github.com/Al-Adnane/Kasbah-site/issues
- **False positive** — Use "Report False Positive" command in extension
- **Security concern** — Email: security@bekasbah.com

---

## Keyboard Shortcuts

| Shortcut | Command |
|----------|---------|
| Cmd+Shift+K (Mac) / Ctrl+Shift+K (Windows/Linux) | Scan current file |

You can customize all keybindings in VS Code: Preferences → Keyboard Shortcuts

---

## Support

- 📚 Documentation: https://bekasbah.com/docs
- 🔍 Detection Guide: https://bekasbah.com/how-it-works
- 💬 GitHub Discussions: https://github.com/Al-Adnane/Kasbah-site/discussions

---

## License

MIT — See LICENSE for details

---

**Built with ❤️ by Kasbah Guard**
