# Kasbah Guard — API Guard

> **Developer-first secret detection** — npm, PyPI, Cargo, and Go packages for scanning code and configs for secrets before commit.

**Version**: 1.0.0 | **Status**: Production Ready | **Pricing**: Freemium

---

## Overview

API Guard is a multi-language SDK that brings Kasbah's detection engine directly into your development workflow. Scan files, validate configs, and integrate with CI/CD pipelines.

### Available Packages

| Package | Install | Size |
|---------|---------|------|
| **npm** | `npm install @kasbah/api-guard` | 250 KB |
| **PyPI** | `pip install kasbah-api-guard` | 300 KB |
| **Cargo** | `cargo add kasbah-guard` | 150 KB |
| **Go** | `go get github.com/kasbah-guard/api-guard` | 200 KB |

---

## Quick Start

### Node.js / TypeScript

```bash
npm install @kasbah/api-guard
```

```typescript
import { scan, redact, DetectionResult } from '@kasbah/api-guard';

// Scan a string
const result: DetectionResult = await scan('API_KEY=sk-1234567890abcdef');
console.log(result.decision); // "DENY"
console.log(result.detections); // [{ type: 'openai_api_key', ... }]

// Scan a file
const fileResult = await scanFile('.env');
console.log(fileResult.decision);

// Redact sensitive data
const redacted = await redact('My SSN is 123-45-6789');
console.log(redacted); // "My SSN is [REDACTED::SSN]"

// Scan a directory
const dirResult = await scanDirectory('./src', {
  exclude: ['node_modules', '*.test.ts'],
  maxDepth: 5
});
```

### Python

```bash
pip install kasbah-api-guard
```

```python
from kasbah_api_guard import scan, scan_file, redact, scan_directory

# Scan a string
result = scan('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI')
print(result.decision)  # "DENY"
print(result.detections)

# Scan a file
result = scan_file('.env')

# Redact sensitive data
redacted = redact('My SSN is 123-45-6789')
print(redacted)  # "My SSN is [REDACTED::SSN]"

# Scan a directory
result = scan_directory('./src', exclude=['__pycache__', '*.pyc'])
```

### Rust

```bash
cargo add kasbah-guard
```

```rust
use kasbah_guard::{scan, scan_file, redact, ScanResult};

// Scan a string
let result: ScanResult = scan("API_KEY=sk-1234567890abcdef");
println!("{:?}", result.decision);  // Deny
println!("{:?}", result.detections);

// Scan a file
let result = scan_file(".env")?;

// Redact sensitive data
let redacted = redact("My SSN is 123-45-6789");
println!("{}", redacted);  // "My SSN is [REDACTED::SSN]"

// Scan a directory
let result = scan_directory("./src", vec!["target", "*.rs"])?;
```

### Go

```bash
go get github.com/kasbah-guard/api-guard
```

```go
import "github.com/kasbah-guard/api-guard"

// Scan a string
result := kasbah.Scan("GITHUB_TOKEN=ghp_xxxxxxxxxxxx")
fmt.Println(result.Decision)  // "DENY"
fmt.Println(result.Detections)

// Scan a file
result := kasbah.ScanFile(".env")

// Redact sensitive data
redacted := kasbah.Redact("My SSN is 123-45-6789")
fmt.Println(redacted)

// Scan a directory
result := kasbah.ScanDirectory("./src", []string{"vendor", "*.test.go"})
```

---

## CLI Usage

### Installation

```bash
# npm
npm install -g @kasbah/api-guard

# PyPI
pip install kasbah-api-guard

# Cargo
cargo install kasbah-guard

# Homebrew
brew install kasbah-guard
```

### Commands

```bash
# Scan a file
kasbah scan .env

# Scan a directory
kasbah scan ./src --recursive

# Scan with JSON output (for CI/CD)
kasbah scan ./src --json

# Redact a file
kasbah redact config.json

# Watch mode (re-scan on changes)
kasbah watch ./src

# Pre-commit hook setup
kasbah init-git-hooks

# Self-test
kasbah selftest
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Secret Scan

on: [push, pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Kasbah Guard
        run: npm install -g @kasbah/api-guard
      
      - name: Scan for secrets
        run: kasbah scan . --json > scan-results.json
      
      - name: Check for denials
        run: |
          if grep -q '"decision":"DENY"' scan-results.json; then
            echo "❌ Secrets detected!"
            cat scan-results.json | jq '.[] | select(.decision == "DENY")'
            exit 1
          fi
      
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: scan-results
          path: scan-results.json
```

### GitLab CI

```yaml
stages:
  - security

secret-scan:
  stage: security
  image: node:18
  script:
    - npm install -g @kasbah/api-guard
    - kasbah scan . --json > scan-results.json
    - |
      if grep -q '"decision":"DENY"' scan-results.json; then
        echo "❌ Secrets detected!"
        exit 1
      fi
  artifacts:
    reports:
      secret_scan: scan-results.json
```

### CircleCI

```yaml
version: 2.1

jobs:
  secret-scan:
    docker:
      - image: node:18
    steps:
      - checkout
      - run:
          name: Install Kasbah Guard
          command: npm install -g @kasbah/api-guard
      - run:
          name: Scan for secrets
          command: kasbah scan . --json > scan-results.json
      - run:
          name: Check results
          command: |
            if grep -q '"decision":"DENY"' scan-results.json; then
              echo "Secrets detected!"
              exit 1
            fi
```

### Pre-Commit Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash

kasbah scan . --json | jq '.[] | select(.decision == "DENY")'

if [ $? -ne 0 ]; then
  echo "❌ Secrets detected! Fix before committing."
  exit 1
fi

exit 0
```

Or use the built-in hook installer:
```bash
kasbah init-git-hooks
```

---

## Detection Capabilities

### Credentials (60+ patterns)
- AWS Access Keys & Secret Keys
- GitHub PATs (ghp_*, ghs_*, ghu_*)
- OpenAI API Keys (sk-*)
- Anthropic API Keys (sk-ant-*)
- Stripe Keys (sk_live_*, pk_live_*)
- Slack Tokens (xoxb-*, xoxp-*)
- Google API Keys
- Azure Connection Strings
- Database URLs
- Private Keys (RSA, EC, OPENSSH)
- JWT Secrets
- NPM Tokens
- PyPI Tokens
- Docker Registry Credentials

### Configuration Files
- .env files
- .env.local, .env.production
- config.json, config.yaml, config.yml
- credentials, credentials.json
- secrets.json, secrets.yaml
- .npmrc, .pypirc
- kubeconfig files
- terraform.tfstate

### Code Patterns
- Hardcoded passwords
- Inline API keys
- Connection strings in code
- Base64-encoded secrets
- Hex-encoded secrets

---

## Configuration

### .kasbah.json

```json
{
  "exclude": [
    "node_modules",
    "vendor",
    "*.test.*",
    "*.spec.*",
    "__pycache__"
  ],
  "maxDepth": 10,
  "minRisk": 40,
  "patterns": {
    "custom": [
      {
        "name": "My Custom Pattern",
        "regex": "MY_SECRET_.*",
        "risk": 70
      }
    ]
  },
  "output": {
    "format": "json",
    "file": "scan-results.json"
  }
}
```

### Environment Variables

```bash
# API Configuration
KASBAH_API_URL=https://api.bekasbah.com
KASBAH_API_KEY=your-api-key

# Scanning Configuration
KASBAH_EXCLUDE=node_modules,vendor
KASBAH_MAX_DEPTH=10
KASBAH_MIN_RISK=40

# Output Configuration
KASBAH_OUTPUT_FORMAT=json
KASBAH_OUTPUT_FILE=scan-results.json
```

---

## API Reference

### scan(text: string): Promise<DetectionResult>

Scan a string for sensitive data.

```typescript
const result = await scan('API_KEY=sk-1234567890');
// DetectionResult:
{
  risk: 85,
  decision: 'DENY',
  reason: 'OpenAI API key detected',
  detections: [...]
}
```

### scanFile(path: string): Promise<DetectionResult>

Scan a file for sensitive data.

```typescript
const result = await scanFile('.env');
```

### scanDirectory(path: string, options?: ScanOptions): Promise<DetectionResult[]>

Scan a directory recursively.

```typescript
const results = await scanDirectory('./src', {
  exclude: ['node_modules', '*.test.ts'],
  maxDepth: 5
});
```

### redact(text: string): Promise<string>

Redact sensitive data from text.

```typescript
const redacted = await redact('My SSN is 123-45-6789');
// "My SSN is [REDACTED::SSN]"
```

### validateConfig(config: object): Promise<ValidationResult>

Validate a configuration object.

```typescript
const result = await validateConfig({
  apiKey: 'sk-1234567890',
  database: 'mongodb://user:pass@host'
});
```

---

## Pricing

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 100 scans/month, basic patterns, CLI |
| **Pro** | $9/month | Unlimited scans, custom patterns, CI/CD |
| **Team** | $29/month | 5 seats, shared config, audit logs |
| **Enterprise** | Custom | SSO, on-prem, custom integrations |

---

## Support

- **Documentation**: https://docs.kasbah.ai/api-guard
- **GitHub**: https://github.com/kasbah-guard/api-guard
- **Issues**: https://github.com/kasbah-guard/api-guard/issues
- **Email**: support@kasbah.ai

---

## License

MIT

---

**Status**: Production Ready ✅ | **Last Updated**: March 4, 2026
