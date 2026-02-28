# Kasbah Guard CLI

> Command-line tool for detecting and redacting sensitive data in files and directories.

**Version**: 1.0.0 | **Engine**: 3.5.2 | **Status**: Production Ready

---

## What It Does

The Kasbah Guard CLI scans files and directories for sensitive data like:
- Social Security Numbers (SSNs)
- Credit card numbers
- API keys (AWS, GitHub, etc.)
- Private cryptographic keys
- Database credentials
- Seed phrases
- Injection attacks

## Quick Start

### Install

```bash
# Build from source
CARGO_TARGET_DIR=/tmp/kasbah-cli-build cargo build --release \
  --manifest-path kasbah-guard-dist/apps/cli/Cargo.toml

# Copy to PATH
cp /tmp/kasbah-cli-build/release/kasbah /usr/local/bin/kasbah
```

### Usage

**Scan a file**:
```bash
kasbah scan .env
# Output: ✅ ALLOW | ⚠️ WARN | 🛑 DENY
```

**Scan a directory**:
```bash
kasbah scan ./src --json
# JSON output for CI/CD pipelines
```

**Scan stdin**:
```bash
echo "My SSN is 123-45-6789" | kasbah scan -
# Pipe text directly
```

**Redact sensitive data**:
```bash
kasbah redact config.json
# In-place redaction: SSN → [REDACTED::SSN]
```

**Watch files for changes**:
```bash
kasbah watch ./src
# Re-scans on every file change
```

**Run self-tests**:
```bash
kasbah selftest
# Expected: 10/10 PASS
```

## Commands

| Command | Purpose | Options |
|---------|---------|---------|
| `scan <path>` | Scan file/directory/stdin | `--json`, `--min-risk 40`, `--depth 10` |
| `redact <file>` | Redact sensitive data | `--dry-run` |
| `watch <path>` | Live file monitoring | `--json`, `--min-risk 40` |
| `selftest` | Run 10 internal tests | — |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All clean (risk < 40) |
| 1 | Warning level (risk 40-69) |
| 2 | Denial level (risk ≥ 70) |

**CI/CD Integration**:
```bash
kasbah scan ./src
if [ $? -eq 2 ]; then
  echo "❌ Secrets detected! Aborting..."
  exit 1
fi
```

## Configuration

### Risk Thresholds

| Risk Level | Meaning | Action |
|------------|---------|--------|
| 0-39 | ✅ Safe | Allow |
| 40-69 | ⚠️ Warning | Review |
| 70-100 | 🛑 Danger | Block |

Use `--min-risk` to change reporting threshold:
```bash
kasbah scan .env --min-risk 70  # Only report DANGER level
kasbah scan .env --min-risk 0   # Report everything
```

### Ignored Directories

By default, these directories are skipped:
- `node_modules/`
- `target/` (Rust builds)
- `.git/`
- `dist/`, `build/`, `.next/` (build artifacts)

### Max Depth

Limit directory recursion:
```bash
kasbah scan . --depth 2  # Only 2 levels deep
```

## Examples

### Git Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

kasbah scan . --json | jq '.[] | select(.decision == "DENY")'

if [ $? -ne 0 ]; then
  echo "❌ Secrets detected! Fix before committing."
  exit 1
fi

exit 0
```

### GitHub Actions CI/CD

```yaml
# .github/workflows/secrets-scan.yml
name: Secret Scan
on: [push, pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: cargo build --release --manifest-path apps/cli/Cargo.toml
      - run: ./target/release/kasbah scan . --json
      - run: |
          RESULT=$(./target/release/kasbah scan . --json | jq '.[] | select(.decision == "DENY")')
          if [ ! -z "$RESULT" ]; then
            echo "Secrets detected!" && exit 1
          fi
```

### Docker Integration

```dockerfile
# Dockerfile
FROM rust:1.70
WORKDIR /app
COPY . .
RUN cargo build --release --manifest-path apps/cli/Cargo.toml
ENTRYPOINT ["./target/release/kasbah"]
```

## Detection Rules

The CLI uses the same detection engine as the browser extension. It detects:

- **SSN**: `123-45-6789`, `123456789`
- **Credit Card**: `4532-1234-5678-9999`, Luhn-valid 16-digit numbers
- **AWS Keys**: `AKIA*` access keys, `aws_secret_access_key`
- **GitHub PAT**: `ghp_*`, `ghs_*`, `ghu_*`
- **Private Keys**: `BEGIN RSA/EC/OPENSSH PRIVATE KEY`
- **Seed Phrases**: BIP39 mnemonic lists
- **Database URIs**: `mongodb://user:pass@host`, `postgres://user:pass@host`
- **Injection**: SQL injection patterns, shell commands, code execution
- **Entropy**: Base64/hex strings with high Shannon entropy

## Performance

| Operation | Time | Target |
|-----------|------|--------|
| Scan 100 small files | ~200ms | <500ms |
| Scan 1 large file (1MB) | ~50ms | <500ms |
| Watch + re-scan | ~10ms | <100ms |

Built in Rust for speed — no Python/Node.js overhead.

## Troubleshooting

### "Command not found: kasbah"

```bash
# Check if binary exists
ls -la /tmp/kasbah-cli-build/release/kasbah

# Add to PATH
export PATH="/tmp/kasbah-cli-build/release:$PATH"

# Or install globally
sudo cp /tmp/kasbah-cli-build/release/kasbah /usr/local/bin/
```

### "selftest fails"

```bash
# Rebuild from scratch
rm -rf kasbah-guard-dist/target
CARGO_TARGET_DIR=/tmp/kasbah-cli-build cargo build --release \
  --manifest-path kasbah-guard-dist/apps/cli/Cargo.toml

# Run test
/tmp/kasbah-cli-build/release/kasbah selftest
# Expected: 10/10 PASS
```

### "False positives / false negatives"

Report to: https://github.com/anthropics/kasbah

Include:
- Text that triggered false result
- Expected vs actual decision
- `kasbah --version` output

## Development

### Build from Source

```bash
cd kasbah-guard-dist/apps/cli
cargo build --release
```

### Add New Detection Pattern

Edit `kasbah-guard-dist/crates/kasbah-kernel/src/patterns.rs`:
```rust
// Add new pattern
const MY_PATTERN: &str = r#"(?i)my_secret_.*"#;

// Add to policy_preflight function
if matches_pattern(text, MY_PATTERN) {
    return (75, "DENY", "Potential API key detected");
}
```

Then test:
```bash
cargo test
./target/release/kasbah selftest  # Must still pass 10/10
node ../../../tests/market-launch/kasbah-market-launch.cjs  # Must still pass 58/58
```

### Dependencies

- `kasbah-kernel` — Detection engine
- `clap` — CLI argument parsing
- `serde_json` — JSON output
- `walkdir` — Directory traversal
- `colored` — Terminal colors
- `notify` — File system watching

## Architecture

```
main.rs
├── scan command → scanner.rs
│   ├── walk directory
│   ├── call policy_preflight per chunk
│   └── report results (text/JSON)
├── redact command → scanner.rs
│   └── call redact_text()
├── watch command → scanner.rs
│   └── file watcher loop
└── selftest command
    └── 10 internal invariant checks
```

## Version History

- **1.0.0** (2026-02-28): Production release
  - `scan` with file/directory/stdin support
  - `redact` for sensitive data redaction
  - `watch` for live file monitoring
  - 10/10 selftest suite
  - JSON output for CI/CD

## License

MIT

## Support

- **Docs**: See `ARCHITECTURE.md`, `DEPLOYMENT.md`
- **Issues**: https://github.com/anthropics/kasbah/issues
- **Tests**: `kasbah selftest`

---

**Status**: Production Ready ✅ | **Last Updated**: 2026-02-28
