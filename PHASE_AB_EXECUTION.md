# PHASE A & B EXECUTION GUIDE
## Kasbah Guard v1.0.0 — Complete Product Ecosystem Build

**Date**: March 1, 2026
**Status**: READY TO EXECUTE
**Owner**: @claude + user team

---

## EXECUTIVE SUMMARY

Phase A (Embed Moats) + Phase B (New Products) transforms Kasbah from single-browser-extension to **7-product ecosystem**:

### Phase A: Moats (3 tasks, 2.5 hours)
- **A1**: Desktop redact_content command (30 min)
- **A2**: API SII health check ✅ LIVE
- **A3**: Website WASM detector (1 hr)

### Phase B: Products (6 tasks, 15 hours)
- **B1**: CLI (Rust binary) — `kasbah scan file.env`
- **B2**: Mobile (Tauri app) — macOS/Windows/Linux native
- **B3**: VS Code extension — real-time linting
- **B4**: SDK (@kasbah/guard) — npm package
- **B5**: Enterprise dashboard — policy + audit management
- **B6**: Web detector — JavaScript fallback

---

## PHASE A: EMBED MOATS (2.5 HOURS)

### A1: Desktop Redact Command (30 min)

**Objective**: Tauri app command to redact all 50 secret formats from text

**Implementation**:
```rust
// kasbah-guard-dist/apps/desktop/src-tauri/src/main.rs
#[tauri::command]
fn redact_content(text: String) -> String {
    // Use detector.js engine to identify secrets
    // Replace each match with [REDACTED: TYPE]
    // Example: "SSN: 123-45-6789" → "SSN: [REDACTED: SSN]"

    // Patterns to redact:
    // - SSN: \d{3}-\d{2}-\d{4} → [REDACTED: SSN]
    // - CC: \d{16} (Luhn) → [REDACTED: CC]
    // - API keys: sk-*, ghp_*, etc → [REDACTED: API_KEY]
    // - Passwords: password=* → [REDACTED: PASSWORD]
    // - All 50+ formats
}

// Hotkey: Cmd+Shift+R → redact clipboard
// Usage: Select text → Cmd+Shift+R → clipboard contains redacted version
```

**Deliverables**:
- ✅ `redact_content()` Rust function
- ✅ Hotkey integration (Cmd+Shift+R)
- ✅ Clipboard integration
- ✅ Test: verify all 50 formats redacted

**Acceptance Criteria**:
- [ ] `redact_content("SSN: 123-45-6789")` returns text with `[REDACTED: SSN]`
- [ ] Hotkey works on macOS/Windows/Linux
- [ ] No false positives (doesn't redact templates)
- [ ] Performance: <100ms for typical documents

---

### A3: Website WASM Detector (1 hour)

**Objective**: Interactive demo at `public/detect/index.html`

**Implementation**:
```html
<!-- public/detect/index.html -->
<div>
  <h1>Kasbah Guard — Live Detector</h1>
  <textarea id="input" placeholder="Paste text to scan..."></textarea>
  <div id="results">
    <div class="result">
      <span class="pattern">SSN: 123-45-6789</span>
      <span class="risk">🔴 HIGH RISK (95)</span>
    </div>
  </div>
</div>

<script>
  // Load detector.js (pure JavaScript, no WASM)
  // On input change:
  //   1. Extract text
  //   2. Call classify(text)
  //   3. Display results in real-time
  //   4. Show pattern + risk score
</script>
```

**Features**:
- Real-time classification (<1ms per detection)
- Highlight detected patterns
- Show risk score (0-100)
- Copy-safe: no data sent to server
- Mobile responsive

**Deliverables**:
- ✅ public/detect/index.html
- ✅ JavaScript integration with detector.js
- ✅ Real-time UI update
- ✅ Mobile responsive CSS

**Acceptance Criteria**:
- [ ] Paste "SSN: 123-45-6789" → marked as HIGH RISK
- [ ] Paste "password=test123" → marked as MEDIUM RISK (context-filtered)
- [ ] Performance <1ms per detection
- [ ] Works offline (no API calls)
- [ ] Mobile-friendly layout

---

## PHASE B: NEW PRODUCTS (15 HOURS)

### Execution Order (Dependencies)

```
1. B4 (SDK) ← foundational
   ↓
2. B1 (CLI) + B2 (Mobile) + B6 (Web) [parallel]
   ↓
3. B3 (VS Code) ← depends on B4
   ↓
4. B5 (Enterprise) ← depends on API
```

---

### B1: CLI (Rust) — 3 hours

**What**: Command-line tool for scanning files/directories

**Commands**:
```bash
kasbah scan file.env                    # Scan single file
kasbah scan /path/to/code               # Recursive scan
kasbah watch ~/code                     # Real-time monitoring
cat secret.env | kasbah -               # Stdin pipe

# Options
kasbah scan --format json file.env      # JSON output
kasbah scan --threshold 50 file.env     # Only HIGH risk (>50)
kasbah scan --ignore-test file.env      # Skip test files
```

**Status**:
- ✅ v1.0.0 complete
- ✅ 10/10 selftest passing
- ✅ Binary at `/tmp/kasbah-cli-build/release/kasbah`

**Next Steps**:
- [ ] Add to PATH: `brew install kasbah-guard/cli/kasbah`
- [ ] Publish to crates.io: `cargo publish`
- [ ] Create CLI README with examples
- [ ] Add integration tests

---

### B2: Mobile (Tauri) — 2 hours

**What**: Native desktop app for macOS/Windows/Linux

**Features**:
- Drag-drop file scanning
- Real-time clipboard monitoring
- Detection history + export
- Settings panel

**Status**:
- ✅ v1.0.0 skeleton
- ✅ UI mockups complete
- ⏳ Final polish needed

**Next Steps**:
- [ ] Wire detector.js bindings
- [ ] Implement drag-drop handler
- [ ] Add system tray integration
- [ ] Test on all 3 platforms

---

### B3: VS Code Extension — 2 hours

**What**: Real-time linting in editor

**Features**:
- Red squiggles on detected secrets
- Hover tooltip: pattern + risk
- QuickFix: `[Remove]` or `[Sanitize]`
- Status bar: detection count

**Depends On**: B4 (SDK)

**Status**:
- ✅ v1.0.0 structure
- ⏳ SDK integration pending

**Next Steps**:
- [ ] Implement linter provider
- [ ] Add diagnostic messages
- [ ] Create code actions (remove/sanitize)
- [ ] Test real-world files

---

### B4: SDK (@kasbah/guard) — 2 hours

**What**: npm package for embedding detection in any app

**API**:
```javascript
const { classify } = require('@kasbah/guard');

const result = classify('SSN: 123-45-6789');
console.log(result);
// {
//   risk: 95,
//   decision: 'DENY',
//   reason: 'SSN detected',
//   latency_ms: 0.42
// }
```

**Status**:
- ✅ v1.0.0 complete
- ✅ Published to npm

**Next Steps**:
- [ ] Verify package on npm: `npm install @kasbah/guard`
- [ ] Create SDK README with examples
- [ ] Add TypeScript definitions
- [ ] Example projects (React, Node.js, etc.)

---

### B5: Enterprise Dashboard — 3 hours

**What**: Web app for policy management, audit logs, team admin

**Endpoints**:
- `GET /api/policies` — org policies
- `GET /api/audit/recent` — last 100 events
- `POST /api/policies` — update policies
- `GET /api/team` — team members

**Status**:
- ✅ v1.0.0 skeleton
- ✅ Pages built (policies, audit, team)
- ⏳ Real API integration pending

**Next Steps**:
- [ ] Wire API endpoints
- [ ] Add authentication flow
- [ ] Implement policy editor
- [ ] Add audit log filtering
- [ ] Create team management UI

---

### B6: Web Detector — 1 hour

**What**: JavaScript fallback for browsers without WASM

**Implementation**:
- Use detector.js directly
- No WASM compilation needed
- Fallback from `public/detect/` → pure JS

**Status**:
- ✅ Concept
- ⏳ Implementation pending

**Next Steps**:
- [ ] Create `public/detect/detector-js.html`
- [ ] Load detector.js from `kasbah-guard-dist/extensions/chrome/src/`
- [ ] Implement real-time detection UI
- [ ] Test on older browsers

---

## PHASE C: WORKSPACE INTEGRATION (3 HOURS)

**Objective**: Connect all products into monorepo with shared infrastructure

### C1: Dependency Management (1 hr)
```json
{
  "name": "kasbah-guard-monorepo",
  "version": "1.0.0",
  "workspaces": [
    "apps/cli",
    "apps/mobile",
    "packages/sdk",
    "packages/vscode",
    "packages/enterprise",
    "extensions/*"
  ]
}
```

### C2: Build Scripts (1 hr)
```json
{
  "scripts": {
    "build": "npm run build:extensions && npm run build:products",
    "build:extensions": "cd extensions && npm install && npm run build",
    "build:products": "npm run build -w cli -w mobile -w sdk -w vscode",
    "test": "npm run test:core && npm run test:market && npm run test:integration",
    "deploy": "npm run build && npm run test && npm run publish"
  }
}
```

### C3: Test Integration (1 hr)
- Core tests: `23/23 invariants`
- Market tests: `58/58 stress tests`
- Integration tests: `performance.test.js`
- CI/CD: GitHub Actions on PR

---

## PHASE D: VERIFICATION & RELEASE (3 HOURS)

### D1: Regression Testing (30 min)
- Run all test suites
- Zero failures allowed
- Compare against baseline

### D2: Performance Benchmarks (30 min)
- p50/p95/p99 latency
- Memory usage
- Throughput tests

### D3: Security Review (1 hr)
- Code review checklist
- Static analysis (no hardcoded secrets)
- Crypto validation
- No data exfiltration

### D4: Final Release (1 hr)
```bash
git tag v1.0.0
git push origin v1.0.0

# Create GitHub release
# Update Chrome Web Store
# Announce on Twitter/Product Hunt
```

---

## TIMELINE

```
TODAY (Mar 1, 2026)
  ✅ Phase E: COMPLETE & DEPLOYED
  ⏳ Phase A: 2.5 hrs (A1, A3)
  ⏳ Phase B: 15 hrs (B1-B6)
  ⏳ Phase C: 3 hrs (workspace)
  ⏳ Phase D: 3 hrs (verification + release)

TOTAL REMAINING: 23.5 hours focused work
```

---

## SUCCESS CRITERIA (All Must Pass)

### Functionality
- [ ] All 7 products at v1.0.0
- [ ] All products pass selfTest
- [ ] Zero regressions (23/23, 58/58, 70/70, 10/10)
- [ ] Performance: p99 latency < 2ms

### Code Quality
- [ ] 100% documentation
- [ ] No hardcoded secrets
- [ ] All async operations error-handled
- [ ] Memory stable (no leaks)

### Deployment
- [ ] Website: bekasbah.com live
- [ ] API: api.bekasbah.com live
- [ ] Extensions: Chrome Web Store + 4 others
- [ ] CLI: npm + crates.io
- [ ] SDK: npm + TypeScript types
- [ ] Enterprise: self-hosted ready

### User Experience
- [ ] 7 existing users report improved experience
- [ ] False positive reports working
- [ ] Error tracking shows healthy signals
- [ ] Performance telemetry validates <1ms latency

---

## NEXT STEPS (IMMEDIATE)

1. **Execute Phase A1** (30 min)
   - Add `redact_content()` to Tauri desktop app
   - Test all 50 formats

2. **Execute Phase A3** (1 hr)
   - Create `public/detect/index.html`
   - Wire detector.js integration

3. **Execute Phase B** (15 hrs)
   - Scaffold each product
   - Wire real API connections
   - Run tests on each

4. **Execute Phase C** (3 hrs)
   - Set up monorepo structure
   - Create build scripts
   - Add CI/CD

5. **Execute Phase D** (3 hrs)
   - Run final test suite
   - Performance benchmarks
   - Create v1.0.0 release tag

---

## RISKS & MITIGATIONS

| Risk | Mitigation |
|------|-----------|
| Breaking API changes | Version endpoints (`/v1/`) |
| Dependency conflicts | Monorepo workspace management |
| Test failures | Run tests before each commit |
| Deploy failures | Test in staging first |
| User confusion | Clear documentation + examples |

---

## RESOURCE ALLOCATION

**Developer Hours**: 23.5 total
- Phase A: 2.5 hrs (quick wins)
- Phase B: 15 hrs (products)
- Phase C: 3 hrs (integration)
- Phase D: 3 hrs (verification)

**Infrastructure**:
- GitHub: version control + CI/CD
- Cloudflare Pages: website hosting
- Cloudflare Workers: API serverless
- npm: SDK distribution
- Chrome Web Store: extension distribution
- crates.io: CLI distribution

---

## OWNERSHIP & ACCOUNTABILITY

| Phase | Owner | Estimate | Status |
|-------|-------|----------|--------|
| A1 | @claude | 30 min | TODO |
| A3 | @claude | 1 hr | TODO |
| B1 (CLI) | Team | 3 hrs | v1.0.0 ready |
| B2 (Mobile) | Team | 2 hrs | Skeleton ready |
| B3 (VS Code) | Team | 2 hrs | TODO (depends on B4) |
| B4 (SDK) | Team | 2 hrs | v1.0.0 published |
| B5 (Enterprise) | Team | 3 hrs | TODO (skeleton ready) |
| B6 (Web) | Team | 1 hr | TODO |
| C (Workspace) | DevOps | 3 hrs | TODO |
| D (Release) | QA + DevOps | 3 hrs | TODO |

---

**Status**: READY TO EXECUTE
**Last Updated**: March 1, 2026, 02:30 UTC
