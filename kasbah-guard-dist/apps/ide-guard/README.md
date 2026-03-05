# Kasbah Guard — IDE Guard (JetBrains Plugin)

**Status:** Code Complete  
**Version:** 1.0.0  
**Platform:** IntelliJ Platform (IntelliJ IDEA, PyCharm, WebStorm, etc.)

---

## Overview

IDE Guard integrates Kasbah detection directly into JetBrains IDEs. Real-time secret detection as you type, with inline warnings and commit blocking.

---

## Features

- ✅ Real-time detection as you type
- ✅ Inline warnings (yellow/red underlines)
- ✅ Commit blocking for secrets
- ✅ .env file protection
- ✅ Right-click "Scan for Secrets"
- ✅ Settings panel

---

## Installation

### From JetBrains Marketplace

1. Open IntelliJ/PyCharm/WebStorm
2. Go to Settings → Plugins
3. Search "Kasbah Guard"
4. Install and restart IDE

### From Source

```bash
# Clone repository
git clone https://github.com/kasbah-guard/ide-guard.git
cd ide-guard

# Build plugin
./gradlew buildPlugin

# Install plugin
# Settings → Plugins → ⚙️ → Install from Disk
# Select: build/distributions/ide-guard-1.0.0.zip
```

---

## Usage

### Real-Time Detection

As you type, secrets are detected and underlined:
- 🟨 Yellow: Warning (medium risk)
- 🟥 Red: Deny (high risk)

### Commit Blocking

When committing code with secrets:
```
❌ Commit Blocked

AWS Access Key detected in config.py
Risk: 85/100

[Remove Secret] [Cancel Commit]
```

### Scan File

Right-click file → "Scan for Secrets"

### Scan Project

Right-click project → "Scan Project for Secrets"

---

## Settings

**Settings → Tools → Kasbah Guard**

| Setting | Default | Description |
|---------|---------|-------------|
| API Key | (required) | Kasbah API key |
| Real-time Detection | ✅ Enabled | Detect as you type |
| Block Commits | ✅ Enabled | Prevent secret commits |
| Scan .env Files | ✅ Enabled | Auto-scan .env files |
| Severity Threshold | 40 | Minimum risk to show |

---

## Supported IDEs

| IDE | Version | Status |
|-----|---------|--------|
| IntelliJ IDEA | 2023.1+ | ✅ Supported |
| PyCharm | 2023.1+ | ✅ Supported |
| WebStorm | 2023.1+ | ✅ Supported |
| GoLand | 2023.1+ | ✅ Supported |
| PhpStorm | 2023.1+ | ✅ Supported |
| RubyMine | 2023.1+ | ✅ Supported |
| CLion | 2023.1+ | ✅ Supported |

---

## Detected Secrets

| Type | Examples |
|------|----------|
| AWS Keys | AKIA*, AWS_SECRET |
| GitHub Tokens | ghp_*, gho_*, ghu_* |
| OpenAI Keys | sk-* |
| Private Keys | BEGIN RSA PRIVATE KEY |
| Database URIs | mongodb://, postgres:// |
| API Keys | Generic patterns |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    JetBrains IDE                         │
├─────────────────────────────────────────────────────────┤
│  Kasbah IDE Guard Plugin                                 │
│  ├── Editor Listener (real-time detection)              │
│  ├── Commit Check (pre-commit hook)                     │
│  ├── File Scanner (right-click scan)                    │
│  └── Settings Panel                                      │
├─────────────────────────────────────────────────────────┤
│  Kasbah Detector (embedded)                              │
│  ├── Pattern Detection (140+ patterns)                  │
│  └── ML Anomaly Detection                                │
└─────────────────────────────────────────────────────────┘
```

---

## Development

### Prerequisites

- JDK 17+
- IntelliJ Platform SDK
- Gradle 8+

### Build

```bash
./gradlew buildPlugin
```

### Run IDE for Testing

```bash
./gradlew runIde
```

### Debug

```bash
./gradlew runIde --debug
```

---

## Troubleshooting

### Plugin not loading
```
# Check IDE version (2023.1+ required)
# Check plugin compatibility
```

### Detection not working
```
# Check API key in settings
# Check network connection
# View logs: Help → Show Log in Explorer
```

### False positives
```
# Right-click detection → "Mark as Safe"
# Report to: support@kasbah.ai
```

---

## Version History

### 1.0.0 (March 2026)
- Initial release
- Real-time detection
- Commit blocking
- File/project scanning

---

## License

MIT License

## Support

- Documentation: https://docs.kasbah.ai/ide-guard
- Issues: https://github.com/kasbah-guard/ide-guard/issues
- Email: support@kasbah.ai

---

**Status:** Code Complete ✅  
**Ready for:** JetBrains Marketplace Submission
