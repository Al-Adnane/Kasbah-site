# Kasbah Guard — Test Suite Guide

> Complete testing strategy for Kasbah Guard products. All tests must pass before production deployment.

**Version**: 1.0.0 | **Last Updated**: February 2026

---

## Overview

Kasbah Guard uses a **3-tier testing architecture**:

1. **Market Launch Suite** (58/58) — Real-world adversarial cases + infrastructure checks
2. **detector.js selfTest** (23/23) — Pattern detection invariants
3. **CLI selftest** (10/10) — Command-line tool & core library invariants

All three must pass 100% before any release.

---

## Market Launch Suite (58/58)

**Location**: `tests/market-launch/kasbah-market-launch.cjs`

### Running the Test

```bash
cd /Users/mac/Desktop/KasbahFinal/Kasbah-site
node tests/market-launch/kasbah-market-launch.cjs
```

### Expected Output

```
═══════════════════════════════════════════════════════════════════

🚀  MARKET LAUNCH READY: 58/58 passed (100.0%)

✅  Section A  Real-world adversarial (20)  — 20/20
✅  Section B  Evasion attempts      (10)  — 10/10
✅  Section C  False-positive stress (10)  — 10/10
✅  Section D  Performance (<500ms)   (3)  —  3/3
✅  Section E  JS ↔ Rust consistency (10)  — 10/10
✅  Section F  Infrastructure        (5)  —  5/5

═══════════════════════════════════════════════════════════════════
```

### Test Sections Breakdown

#### Section A: Real-World Adversarial (20 tests)

**Purpose**: Verify detector catches actual sensitive data in natural format.

| # | Category | Test Case | Expected |
|---|----------|-----------|----------|
| A01 | SSN | "My SSN: 123-45-6789" | DENY |
| A02 | SSN | "SNN123456789" (no dashes) | DENY |
| A03 | Credit Card | "Visa: 4532-1234-5678-9999" | DENY |
| A04 | Credit Card | Luhn-valid 16-digit number | DENY |
| A05 | AWS Key | "AKIA1234567890ABCDEF" | DENY |
| A06 | AWS Secret | "aws_secret_access_key=..." | DENY |
| A07 | GitHub PAT | "ghp_1234567890abcdefghijklmnop" | DENY |
| A08 | Private Key | "-----BEGIN RSA PRIVATE KEY-----" | DENY |
| A09 | EC Key | "-----BEGIN EC PRIVATE KEY-----" | DENY |
| A10 | Seed Phrase | "abandon about above..." (BIP39) | DENY |
| A11 | MongoDB URI | "mongodb://user:pass@host:27017" | DENY |
| A12 | PostgreSQL URI | "postgres://user:pass@localhost" | DENY |
| A13 | JWT Token | "eyJhbGciOiJIUzI1NiIsInR5cCI..." | DENY |
| A14 | API Key | "sk_test_51234567890abcdefgh" | DENY |
| A15 | SSH Private Key | "-----BEGIN OPENSSH PRIVATE KEY" | DENY |
| A16 | Database Password | "password=EncryptedP@ssw0rd!" | DENY |
| A17 | SQL Injection | "'; DROP TABLE users; --" | DENY |
| A18 | Shell Injection | "$(rm -rf /)" | DENY |
| A19 | Command Injection | "test && curl exfil.com" | DENY |
| A20 | Base64 Secret | High-entropy base64 blob | WARN/DENY |

**Rationale**: Real-world data must be caught with zero false negatives.

#### Section B: Evasion Attempts (10 tests)

**Purpose**: Verify detector resists obfuscation/evasion techniques.

| # | Technique | Test Case | Expected |
|---|-----------|-----------|----------|
| B01 | Case Variation | "akia0000000000000000" (lowercase) | DENY |
| B02 | Whitespace Injection | "1 2 3 - 4 5 - 6 7 8 9" | DENY |
| B03 | Unicode Obfuscation | SSN with unicode dashes | DENY |
| B04 | Comment Wrapping | "# 123-45-6789" | DENY |
| B05 | String Concatenation | "aws_secret_" + "access_key" | ALLOW (known limitation) |
| B06 | URL Encoding | "AKIA%31%32%33..." | DENY |
| B07 | HTML Entity | "&#x00;SSN" | WARN |
| B08 | Zero-Width Chars | SSN with zero-width spaces | WARN/DENY |
| B09 | Leetspeak | "1234-56-7890" (1 for S, etc.) | WARN (heuristic) |
| B10 | Mixed Encoding | Base64-encoded then quoted | WARN/DENY |

**Rationale**: Attackers will try to bypass detectors; evasion must be caught or flagged.

#### Section C: False-Positive Stress (10 tests)

**Purpose**: Verify detector doesn't block legitimate data.

| # | Benign Case | Text | Expected |
|---|-------------|----|----------|
| C01 | Email | "john@example.com" | ALLOW |
| C02 | Phone | "555-123-4567" | ALLOW |
| C03 | Version Number | "v1.2.3-beta.4" | ALLOW |
| C04 | License Plate | "ABC-1234" | ALLOW |
| C05 | Lorem Ipsum | "Lorem ipsum dolor sit amet" | ALLOW |
| C06 | Code Example | "function foo(bar) { }" | ALLOW |
| C07 | Fake Token | "eyJhbGciOiJub25lIiwi..." (incomplete) | ALLOW |
| C08 | Sample Credit Card | "4111-1111-1111-1111" (test card) | WARN (heuristic) |
| C09 | Placeholder Text | "TODO: add API key here" | ALLOW |
| C10 | Lorem Key | "aws_fake_test_key_xxxxxx" | ALLOW |

**Rationale**: Tool must not create alert fatigue by blocking legitimate data.

#### Section D: Performance <500ms (3 tests)

**Purpose**: Verify detection runs fast enough for real-time use.

| # | Scenario | Target |
|---|----------|--------|
| D01 | Detect in 1KB text | <10ms |
| D02 | Detect in 100KB file | <100ms |
| D03 | Detect in 1MB file | <500ms |

**Rationale**: Browser/UI must remain responsive during detection.

#### Section E: JS ↔ Rust Consistency (10 tests)

**Purpose**: Verify detector.js and policy_preflight(Rust) give same results.

```javascript
// Test case
const text = "My AWS key is AKIAIOSFODNN7EXAMPLE";

// JavaScript
const jsResult = classify(text);

// Rust
const rustResult = policy_preflight(text);

// Compare
assert(jsResult.risk === rustResult.risk);
assert(jsResult.decision === rustResult.decision);
```

**Tests**:
- E01-E05: 5 different sensitive data types
- E06-E10: 5 evasion/edge cases

**Rationale**: Browser extension (JS) and CLI (Rust) must produce identical results.

#### Section F: Infrastructure (5 tests)

**Purpose**: Verify build artifacts, versions, and hashes.

| # | Check | Expected |
|----|-------|----------|
| F01 | detector.js hash (6 copies) | `d9cd10f93c97c8de5078b0e9e98437fa` |
| F02 | PATTERN_VERSION constant | `"3.5.2"` |
| F03 | selfTest() in detector.js | 23/23 PASS |
| F04 | SDK ENGINE_VERSION | `"3.5.2"` |
| F05 | VS Code EXPECTED_ENGINE | `"3.5.2"` |

**Rationale**: Ensure consistent deployments across all platforms.

### Failure Debugging

**If any test fails**:

1. **Identify failing test**: Note section + test number (e.g., "A05 AWS Key")

2. **Reproduce in isolation**:
   ```bash
   node -e "
   const { classify } = require('./kasbah-guard-dist/extensions/chrome/src/detector.js');
   const result = classify('AKIA1234567890ABCDEF');
   console.log(result);
   "
   ```

3. **Check detector.js version**:
   ```bash
   grep "PATTERN_VERSION" kasbah-guard-dist/extensions/chrome/src/detector.js
   ```

4. **Verify hash consistency**:
   ```bash
   md5sum kasbah-guard-dist/extensions/*/src/detector.js
   # All 6 should be identical
   ```

5. **Review recent changes**:
   ```bash
   git log -10 --oneline kasbah-guard-dist/extensions/chrome/src/detector.js
   ```

6. **Run selfTest**:
   ```bash
   node -e "
   const mod = require('./kasbah-guard-dist/extensions/chrome/src/detector.js');
   const result = mod.selfTest();
   console.log(result);
   "
   # Expected: 23/23
   ```

---

## detector.js selfTest (23/23)

**Location**: `kasbah-guard-dist/extensions/chrome/src/detector.js` (lines ~30-150)

### Running the Test

In browser console (after loading extension):

```javascript
selfTest()
// Output: 23/23 ✅
```

Or via Node.js:

```bash
node -e "
const mod = require('./kasbah-guard-dist/extensions/chrome/src/detector.js');
console.log('selfTest:', mod.selfTest());
"
```

### Test Breakdown

#### Group 1: Pattern Detection (4 tests)

| # | Pattern | Test Input | Expected |
|----|---------|-----------|----------|
| 1 | SSN | "123-45-6789" | risk ≥ 70 |
| 2 | Credit Card | "4532-1234-5678-9999" | risk ≥ 70 |
| 3 | AWS Key | "AKIAIOSFODNN7EXAMPLE" | risk ≥ 70 |
| 4 | Private Key | "BEGIN RSA PRIVATE KEY" | risk ≥ 70 |

#### Group 2: Evasion Handling (4 tests)

| # | Evasion | Test Input | Expected |
|----|---------|-----------|----------|
| 5 | Case variation | "akia..." (lowercase) | Still detected |
| 6 | Whitespace | "1 2 3 - 4 5 - 6 7 8 9" | Still detected |
| 7 | Multiple formats | "SSN:123456789" (no dashes) | Still detected |
| 8 | URL encoding | "%41%4B%49..." | Handled |

#### Group 3: Edge Cases (4 tests)

| # | Edge Case | Expected |
|----|-----------|----------|
| 9 | Empty string | risk = 0 |
| 10 | Very long string (10KB) | Process without hang |
| 11 | Unicode characters | No crash |
| 12 | Null/undefined input | Safe fallback |

#### Group 4: Performance (4 tests)

| # | Scenario | Target |
|----|----------|--------|
| 13 | Classify 1KB text | <10ms |
| 14 | Classify 100KB text | <100ms |
| 15 | Classify 1MB text | <1000ms |
| 16 | Classify same text 100x | <1000ms total |

#### Group 5: Consistency (4 tests)

| # | Check | Expected |
|----|-------|----------|
| 17 | Consistent across calls | Same result for same input |
| 18 | No state pollution | Previous test doesn't affect next |
| 19 | Pattern weights stable | Risk scores don't drift |
| 20 | Serializable result | JSON.stringify(result) works |

#### Group 6: Infrastructure (3 tests)

| # | Check | Expected |
|----|-------|----------|
| 21 | PATTERN_VERSION = "3.5.2" | Version matches engine |
| 22 | All patterns loaded | 20+ patterns active |
| 23 | Hash consistency | MD5 matches across copies |

### Manual Verification

To debug a failing test:

```javascript
// Check version
console.log(PATTERN_VERSION);  // "3.5.2"

// Test SSN detection
let result = classify("My SSN is 123-45-6789");
console.log(result);
// Expected: { risk: 90+, decision: "DENY", reason: "Social Security Number detected" }

// Test evasion
result = classify("akia0000000000000000");
console.log(result);
// Expected: { risk: 80+, decision: "DENY", reason: "AWS access key detected" }

// Test false positive
result = classify("My email is john@example.com");
console.log(result);
// Expected: { risk: < 40, decision: "ALLOW" }
```

---

## CLI selftest (10/10)

**Location**: `kasbah-guard-dist/apps/cli/src/main.rs` (lines ~89-133)

### Running the Test

```bash
/tmp/kasbah-cli-build/release/kasbah selftest
```

### Expected Output

```
Kasbah Guard CLI — Self-Test Suite
─────────────────────────────────────
✅ policy_preflight: SSN → BLOCK
✅ policy_preflight: clean → ALLOW
✅ policy_preflight: private key → BLOCK
✅ policy_preflight: AWS key → BLOCK
✅ policy_preflight: MongoDB URI with creds → BLOCK
✅ SII: nominal values → 1.0
✅ SII: degraded hook → < 1.0
✅ Gate: nominal → pass
✅ Gate: low reliability → fail
✅ Gate: high harm → fail
─────────────────────────────────────
Results: 10/10
```

### Test Breakdown

| # | Test | Input | Expected |
|----|------|-------|----------|
| 1 | policy_preflight SSN | "My SSN is 123-45-6789" | risk ≥ 70 |
| 2 | policy_preflight clean | "hello world" | decision = "ALLOW" |
| 3 | policy_preflight key | "-----BEGIN RSA PRIVATE KEY-----" | decision = "BLOCK" |
| 4 | policy_preflight AWS | "aws_access_key_id = AKIA..." | risk ≥ 70 |
| 5 | policy_preflight MongoDB | "mongodb://user:pass@host:27017" | decision = "BLOCK" |
| 6 | SII nominal | All hooks OK | sii ≈ 1.0 |
| 7 | SII degraded | One hook at 0.5 | sii < 1.0 |
| 8 | Gate nominal | All gates OK | authorized = true |
| 9 | Gate reliability | Hook integrity = 0.5 | authorized = false |
| 10 | Gate harm | Risk = 0.9 | authorized = false |

### Failure Debugging

```bash
# Rebuild from scratch
rm -rf /tmp/kasbah-cli-build
CARGO_TARGET_DIR=/tmp/kasbah-cli-build cargo build --release \
  --manifest-path kasbah-guard-dist/apps/cli/Cargo.toml

# Run with verbose output
RUST_BACKTRACE=1 /tmp/kasbah-cli-build/release/kasbah selftest

# Check individual functions
/tmp/kasbah-cli-build/release/kasbah scan <(echo "My SSN is 123-45-6789")
# Expected: risk ≥ 70
```

---

## Automated Test Workflow

### Pre-Commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
set -e

echo "🧪 Running market launch test..."
node tests/market-launch/kasbah-market-launch.cjs

echo "🧪 Running CLI selftest..."
/tmp/kasbah-cli-build/release/kasbah selftest

echo "✅ All tests passed!"
```

### CI/CD Pipeline (GitHub Actions)

`.github/workflows/test.yml`:

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions-rs/toolchain@v1
        with:
          toolchain: 1.70

      - run: node tests/market-launch/kasbah-market-launch.cjs

      - run: |
          CARGO_TARGET_DIR=/tmp/kasbah-cli-build cargo build --release \
            --manifest-path kasbah-guard-dist/apps/cli/Cargo.toml
          /tmp/kasbah-cli-build/release/kasbah selftest
```

---

## Test Data & Fixtures

**Location**: `tests/fixtures/`

### Sample Test Files

- `sensitive.json` — JSON with SSNs, credit cards
- `config.env` — `.env` with API keys
- `private.pem` — Real RSA private key (for testing only)
- `benign.txt` — Legitimate text (should ALLOW)

### Using Fixtures

```bash
# Test with fixture file
kasbah scan tests/fixtures/sensitive.json
# Expected: Multiple DENY detections

kasbah scan tests/fixtures/benign.txt
# Expected: ALLOW
```

---

## Test Coverage

| Area | Coverage | Status |
|------|----------|--------|
| Pattern Detection | 20 patterns | ✅ 100% |
| Evasion Techniques | 10 evasion vectors | ✅ 100% |
| False Positives | 10 benign cases | ✅ 100% |
| Performance | 3 scenarios | ✅ 100% |
| JS ↔ Rust Consistency | 10 cases | ✅ 100% |
| Infrastructure | 5 checks | ✅ 100% |
| **Total** | **58 tests** | **✅ 100%** |

---

## Release Checklist

Before tagging a release, ensure:

- [ ] `node tests/market-launch/kasbah-market-launch.cjs` → **58/58 PASS**
- [ ] Browser selfTest → **23/23 PASS**
- [ ] `/tmp/kasbah-cli-build/release/kasbah selftest` → **10/10 PASS**
- [ ] All 6 detector.js copies have identical hash: `d9cd10f93c97c8de5078b0e9e98437fa`
- [ ] No regressions since last release
- [ ] Performance targets met (<500ms for large files)
- [ ] False positive rate acceptable (<1% on benign corpus)

---

## Test Maintenance

### Adding New Tests

1. Identify gap (e.g., new pattern type)
2. Add test case to appropriate section
3. Update expected result
4. Run full suite to verify
5. Update this document
6. Commit with message: "test: add case for X"

### Updating for New Patterns

When adding new detection patterns:

```bash
# 1. Add pattern to kasbah-kernel
# 2. Add test case to appropriate section
# 3. Run: node tests/market-launch/kasbah-market-launch.cjs
# 4. Verify: 58/58 PASS
# 5. Verify: selfTest() 23/23 PASS
# 6. Verify: kasbah selftest 10/10 PASS
# 7. Commit
```

---

## Debugging Test Failures

### General Approach

```
1. Identify failing test (section + number)
2. Reproduce in isolation (single test, not full suite)
3. Add debug logging (console.log, eprintln!)
4. Check recent changes (git log)
5. Verify dependencies haven't changed
6. Test on clean build (rm -rf target/ && rebuild)
7. Compare against baseline (previous working version)
```

### Common Issues

**"Test 58/58 fails on Market Launch"**
- Check if detector.js was recently modified
- Verify all 6 copies are identical: `md5sum extensions/*/src/detector.js`
- Run selfTest in detector.js to check for regressions

**"CLI selftest 10/10 fails"**
- Rebuild: `CARGO_TARGET_DIR=/tmp/kasbah-cli-build cargo build --release`
- Check if kasbah-kernel was modified
- Verify policy_preflight function unchanged

**"Only 1 test fails, others pass"**
- Isolate that specific test
- Check its assumptions (hardcoded values, mocked data)
- Verify test environment (Node.js version, Rust version)

---

**Last Updated**: 2026-02-28 | **Status**: PRODUCTION TESTED ✅
