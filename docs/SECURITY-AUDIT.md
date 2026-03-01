# Kasbah Guard — Security Audit Specification v1.0.0

## Executive Summary

This document specifies the **threat model, security objectives, and audit scope** for Kasbah Guard security reviews. Security professionals and third-party firms should use this as the baseline for testing and reporting.

---

## Threat Model

### Assets to Protect

1. **User's Secret Data** — Never logged, never sent to cloud, only processed locally
2. **Detector Integrity** — Prevent tampering that could disable detection
3. **User Privacy** — No tracking, no profiling, no telemetry of detected secrets
4. **Detection Confidence** — Prevent adversary from evading detection

### Threat Actors

| Actor | Capability | Threat |
|-------|-----------|--------|
| **Malicious Browser Extension** | Code injection into page | XSS to steal clipboard/input |
| **Malicious Web Page** | JavaScript on own domain | Social engineer user to paste secrets |
| **Network Attacker** | MITM on HTTP | Intercept API calls (N/A: only local) |
| **Malware on Host** | File system access | Keylog clipboard, hook detector.js |
| **Supply Chain Attacker** | Compromise detector.js source | Disable detection silently |
| **Reverse Engineer** | Decompile detector.js | Bypass regex patterns, find edge cases |

---

## Security Objectives (in priority order)

### SO1: Local-Only Processing (CRITICAL)

**Objective:** Secrets are never sent to external servers for analysis.

**Requirements:**
- All pattern matching happens in client JavaScript (detector.js, content.js)
- No `/decide` or `/analyze` endpoint exists on server
- No XHR/fetch to analytics/cloud-AI services during detection
- Only metadata sent (latency, error counts) — never detected secrets or text content

**Test Methods:**
- Code review: Grep for `fetch()`, `XMLHttpRequest`, `axios`, `client.post()` outside observability handlers
- Network intercept: Monitor all requests during paste/detection events
- Static analysis: Verify detector.js has zero outbound API calls
- Proof: Extension works offline (disable network → still detects)

**Audit Checklist:**
- [ ] detector.js makes no API calls
- [ ] content.js makes no API calls
- [ ] No `/decide` endpoint in API
- [ ] background.js only sends errors (no secrets)
- [ ] Works offline without network

---

### SO2: Detector Integrity (CRITICAL)

**Objective:** Detector code cannot be silently modified to disable detection.

**Requirements:**
- Detector code includes integrity check (sealed baseline hash)
- Pattern hashes match at load time vs. runtime
- Tamper detection alerts user if detector code is modified
- All 6 detector.js copies remain identical (hash verification)

**Test Methods:**
- Code review: Find integrity check mechanism (Layer 6 in detector.js)
- Dynamic testing: Modify detector.js regex, verify detection fails
- Static analysis: Verify pattern hashes computed and validated
- Regression: Run selfTest() after modification attempt → should fail

**Audit Checklist:**
- [ ] Layer 6: Pattern Integrity Tracking implemented
- [ ] constantTimeEqual() used for hash comparison
- [ ] selfTest() fails if detector.js is modified
- [ ] All browser extensions have identical detector.js
- [ ] Version/epoch tracked (PATTERN_VERSION, PATTERN_EPOCH)

---

### SO3: Context-Aware False Positive Filtering (HIGH)

**Objective:** Reduce false positives in test code, templates, and comments without reducing sensitivity.

**Requirements:**
- Passwords in test code not flagged (e.g., `password: "test123"`)
- Environment templates not flagged (e.g., `STRIPE_KEY=${PLACEHOLDER}`)
- Single-line comments allowed to contain keywords without flagging
- Multi-line secrets still detected (cross-line detection still active)

**Test Methods:**
- Code review: Verify "breathe_easy" (PPP #17) implementation
- Functional testing: 8 FP test cases must ALLOW despite containing keywords
- Edge case testing: Verify single-line comments are filtered
- Regression: 70/70 stress tests must still pass

**Audit Checklist:**
- [ ] Breathe Easy (PPP #17) context filter implemented
- [ ] Test code patterns recognized and suppressed
- [ ] Template placeholders not flagged
- [ ] Single-line comments exempted
- [ ] FP rate < 1% on production data

---

### SO4: Evasion Resistance (HIGH)

**Objective:** Adversary cannot bypass detection using obfuscation, encoding, or encoding evasion.

**Requirements:**
- Homoglyph evasion (Cyrillic а → a) — defeated
- Zalgo text (combining diacritics) — defeated
- Base64/hex encoding — detected via entropy + structure
- Unicode digit obfuscation (٤١١١) — normalized
- String concatenation (`'pass' + 'word'`) — detected via concatenation check
- L33t speak (p@$$w0rd) — defeated
- Cross-line keywords split across lines — detected via gap buffer (`[\s\S]{0,60}?`)

**Test Methods:**
- Code review: Verify all 10 bypass evasion patterns in detector.js
- Functional testing: 20 obfuscation stress tests must DENY
- Dynamic analysis: Fuzzing with random obfuscation techniques
- Regression: Self-test invariants (Layer 7) must not regress

**Audit Checklist:**
- [ ] normalizeHomoglyphs() handles 50+ homoglyph pairs
- [ ] NFKC normalization applied
- [ ] Zalgo stripping (Layer 10)
- [ ] L33t deobfuscation (Layer 11)
- [ ] Base64/hex detection via entropy (Layer 11: ML entropy scoring)
- [ ] String concat bypass check (detectStringConcatBypass)
- [ ] Cross-line keyword detection (gap buffer works)

---

### SO5: API Security & Authentication (MEDIUM)

**Objective:** Authenticated API endpoints cannot be abused; tokens cannot be forged.

**Requirements:**
- JWT tokens verified with signing key
- Token expiry enforced (30-day max)
- No hardcoded secrets in code
- Password hashing: double SHA-256 + salt
- No plaintext passwords in logs

**Test Methods:**
- Code review: Verify JWT creation/verification (createToken, verifyToken)
- Dynamic testing: Attempt to use expired token → 401 Unauthorized
- Cryptography review: Salt generation, HMAC-SHA256 signing
- Password reset flow: Verify no plaintext email/password logged

**Audit Checklist:**
- [ ] JWT signed with HMAC-SHA256
- [ ] Token expiry: 30 days max, enforced
- [ ] Salt: 16 bytes random, per-user
- [ ] Password hash: SHA-256 (salt:password:salt:hash)
- [ ] Verification code: 6 digits, 1-hour TTL
- [ ] No plaintext passwords in logs
- [ ] No hardcoded secrets in source

---

### SO6: Content Security & Data Handling (MEDIUM)

**Objective:** User data is not logged, stored, or misused.

**Requirements:**
- No detected secrets logged (ever)
- No URLs logged (only domain if necessary)
- Telemetry is aggregate-only (latency histogram, not individual results)
- User profile data (email) only accessed when authenticated
- Audit log only records detection metadata, never content

**Test Methods:**
- Code review: Grep for `console.log`, `JSON.stringify` of suspicious payloads
- Dynamic testing: Monitor browser console, local storage, network payload
- Log analysis: Verify stored events contain no secret content
- False positive feedback: Verify pattern is scrubbed, not user's exact input

**Audit Checklist:**
- [ ] No secret content in browser console
- [ ] No secret content in localStorage
- [ ] API requests strip URLs (sendSentryError sanitization)
- [ ] Telemetry is latency/error counts only
- [ ] Audit events record pattern match, not detected secret
- [ ] User profile only in authenticated context

---

### SO7: Cryptographic Assumptions (LOW-MEDIUM)

**Objective:** Cryptographic use is appropriate and not undermined.

**Requirements:**
- Hybrid hash (djb2 XOR FNV-1a) appropriate for non-cryptographic purposes
- HMAC-SHA256 for JWT signing (standard)
- No custom crypto — only use proven algorithms
- No RNG predictability (crypto.getRandomValues for tokens/salt)

**Test Methods:**
- Code review: Verify djb2 + FNV-1a for collision resistance (non-crypto)
- Crypto review: HMAC-SHA256 is industry standard
- RNG testing: generateId(), generateSalt() use crypto.getRandomValues
- No secrets derived from hashes (hashes are informational only)

**Audit Checklist:**
- [ ] Hybrid hash used for integrity check (non-crypto, acceptable)
- [ ] HMAC-SHA256 for JWT (standard)
- [ ] crypto.getRandomValues used for all randomness
- [ ] No MD5, SHA-1, or weak algorithms
- [ ] No custom cipher implementations

---

## Scope: What to Audit

### In Scope (Core Security)

1. **detector.js (Chrome/Firefox/Edge/Opera/Safari)** — 1200+ lines
   - Pattern detection logic
   - Integrity checks (Layer 6)
   - Bypass resistance (Layer 10, 11)
   - Self-test invariants (Layer 7)

2. **content.js (all browsers)** — 500+ lines
   - Paste/input interception
   - Text extraction and normalization
   - Classification call
   - UI feedback (no secret exposure)

3. **background.js (all browsers)** — 150+ lines
   - Error handling
   - Status reporting
   - No secret data in messages

4. **API worker (Cloudflare)** — 1000+ lines
   - JWT creation/verification (auth)
   - False positive collection (privacy)
   - Sentry event handling (no secrets)
   - Request risk scanning (Moat I)

### Out of Scope (Acceptable Risk)

1. **Website (bekasbah.com)** — Static site, no auth needed
2. **Desktop app (Tauri)** — Separate audit scope if needed
3. **CLI (Rust binary)** — Native code, separate threat model
4. **Third-party libraries** — Assumed secure (djb2, FNV-1a, HMAC-SHA256)
5. **Browser vendor security** — Assumed: Web APIs are secure

---

## Test Environment

### Prerequisites

- Chrome/Firefox/Edge/Opera/Safari browsers (latest 2 versions)
- Node.js v18+ (for CLI testing)
- Cloudflare Workers environment (or wrangler simulator)
- Network monitoring tool (Wireshark, mitmproxy, or DevTools)
- Static analysis tools (optional: ESLint, semgrep)

### Deployment

- Website: bekasbah.com (Cloudflare Pages)
- API: api.bekasbah.com (Cloudflare Worker)
- Extension: Chrome Web Store (organic installs)

### Test Data

- Public: [tests/market-launch/](../tests/market-launch/) — 58 test cases
- Proprietary: Real GitHub commit secrets (available under NDA)

---

## Reporting Requirements

### Findings Format

```markdown
## Finding: [Severity] [Title]

**ID:** SEC-2024-001
**Severity:** Critical | High | Medium | Low | Info
**Status:** Open | Mitigated | Accepted Risk

**Description:**
[One paragraph explaining the vulnerability]

**Impact:**
[What is compromised if exploited?]

**Evidence:**
[Code snippet, reproduction steps, or test case]

**Remediation:**
[Recommended fix or mitigation]

**Validator:**
[Steps to verify fix is working]
```

### Severity Scale

| Level | Criteria |
|-------|----------|
| **Critical** | RCE, secret exfiltration, detector bypass, auth bypass |
| **High** | DoS, data leakage, false negative >10%, evasion technique |
| **Medium** | FP >5%, CSRF, timing attacks, weak crypto |
| **Low** | Info disclosure, edge cases, hardening suggestions |
| **Info** | Best practices, documentation, non-exploitable findings |

### Acceptance Criteria

- **Zero Critical findings** for v1.0.0 release
- **Zero High findings** for production deployment
- **Medium findings** documented with risk acceptance
- **All findings** with proposed mitigations

---

## Timeline & Deliverables

### Pre-Audit (This Document)
- [ ] Methodology doc (docs/METHODOLOGY.md)
- [ ] Security spec (docs/SECURITY-AUDIT.md)
- [ ] Test cases provided (tests/market-launch/)

### Audit Phase (2-3 weeks)
- [ ] Code review (detector.js, content.js, background.js, API)
- [ ] Dynamic testing (functional + edge cases)
- [ ] Penetration testing (evasion attempts)
- [ ] Cryptography review (if applicable)

### Post-Audit
- [ ] Findings report (markdown format)
- [ ] Risk assessment
- [ ] Remediation plan
- [ ] Retesting (if fixes provided)
- [ ] Public disclosure (with permission)

---

## Contact & Resources

- **Lead Auditor:** [Name/Email]
- **Questions:** security@bekasbah.com
- **Sensitive Issues:** GPG key available on request
- **NDA:** Available for proprietary test data access
- **Public Repo:** [github.com/kasbah-guard](https://github.com/)

---

## Appendix: Self-Test Invariants

### Detector.js selfTest() (Layer 7: Formal Verification)

Run `detector.selfTest()` to verify 23 core security invariants:

```javascript
// Example (see detector.js lines 1042-1125 for full list)
1. SSN detection (exact format)
2. Passport detection (international formats)
3. Credit card detection (Luhn validated)
4. Homoglyph evasion resistance (Cyrillic a)
5. Zalgo text resistance
6. Base64 encoded secrets
7. String concatenation bypass
... [and 16 more]

Result: 23/23 MUST pass (0 regressions allowed)
```

---

## Audit Checklist

- [ ] All 7 security objectives reviewed
- [ ] Threat actors addressed
- [ ] In-scope components audited
- [ ] Test environment set up
- [ ] Findings documented
- [ ] Severity assessed
- [ ] Mitigations proposed
- [ ] Zero Critical findings (or accepted)
- [ ] Report delivered
- [ ] Public version approved

---

**Document Version:** 1.0.0
**Last Updated:** March 1, 2026
**Status:** READY FOR AUDIT
**Owner:** Kasbah Guard Security Team

---

This specification is **LOCKED** — no major changes without explicit approval from security stakeholders.
