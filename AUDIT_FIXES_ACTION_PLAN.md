# Kasbah Guard: Audit Fixes Action Plan

**Date**: March 1, 2026
**Status**: Ready for Implementation
**Time Estimate**: 25 minutes total
**Difficulty**: ⭐ Easy (5 text edits)

---

## OVERVIEW

This plan addresses the 3 minor issues discovered during the comprehensive end-to-end audit. All issues are non-critical (no functional impact) but should be resolved for full production consistency.

| Issue | Type | Priority | Time | Status |
|-------|------|----------|------|--------|
| #1: Desktop frontend version | Version | MEDIUM | 5 min | ⏳ TODO |
| #2: API engine version ref | Documentation | MEDIUM | 5 min | ⏳ TODO |
| #3: Extract core invariants test | Enhancement | LOW | 15 min | ⏳ TODO |

---

## ISSUE #1: Desktop Frontend Version Mismatch

### Problem Statement
The Desktop app frontend (`package.json`) is at v0.3.0 but should be aligned to v1.0.0 for consistency with all other products.

**Location:**
`/Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/apps/desktop/package.json`

**Current:**
```json
"version": "0.3.0",
```

**Expected:**
```json
"version": "1.0.0",
```

### Why This Matters
- All other products are at v1.0.0 (CLI, SDK, VS Code, Mobile, Enterprise, Constitutional AI, all 5 extensions)
- Desktop backend is already at v1.5.0 (tauri.conf.json)
- Version consistency ensures clear communication to users and developers

### Fix Instructions

**Step 1: Read the file**
```bash
cat /Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/apps/desktop/package.json | head -5
```

**Step 2: Update version string**
- Find line with `"version": "0.3.0",`
- Replace with `"version": "1.0.0",`

**Step 3: Verify change**
```bash
grep "version" /Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/apps/desktop/package.json | head -1
# Expected output: "version": "1.0.0",
```

**Estimated Time:** 5 minutes

---

## ISSUE #2: API Worker Engine Version Reference

### Problem Statement
The API worker (worker.js) references the detector engine version as "3.5.2" but should reference "1.0.0" to match the current detector.

**Locations:**
- `/Users/mac/Desktop/KasbahFinal/Kasbah-site/api/src/worker.js` (check multiple places)
- May appear in API response headers or documentation strings

**Example Current Code:**
```javascript
// API version: 2.0.0
// Engine version: 3.5.2  ← NEEDS UPDATE
```

**Expected:**
```javascript
// API version: 2.0.0
// Engine version: 1.0.0  ← CORRECT
```

### Why This Matters
- API documentation should match detector version (1.0.0)
- Users reading API responses will see correct detector version
- Consistency with all other product documentation

### Fix Instructions

**Step 1: Search for version references**
```bash
grep -n "3.5.2" /Users/mac/Desktop/KasbahFinal/Kasbah-site/api/src/worker.js
# Should show line numbers with 3.5.2 references
```

**Step 2: Identify context**
- Check each occurrence to ensure it refers to detector/engine (not API version)
- API worker version stays 2.0.0
- Only engine references change from 3.5.2 to 1.0.0

**Step 3: Update each occurrence**
- Replace all "3.5.2" with "1.0.0" (if they refer to detector engine)
- Verify API version (2.0.0) is NOT changed

**Step 4: Verify changes**
```bash
grep "1.0.0" /Users/mac/Desktop/KasbahFinal/Kasbah-site/api/src/worker.js | wc -l
# Should show increased count
grep "3.5.2" /Users/mac/Desktop/KasbahFinal/Kasbah-site/api/src/worker.js
# Should return empty (all replaced)
```

**Estimated Time:** 5 minutes

---

## ISSUE #3: Extract Core Invariants Test File (OPTIONAL)

### Problem Statement
The detector self-test (29 invariants) is embedded in detector.js but would be cleaner as a standalone test file.

**Current Location:**
`/Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/extensions/chrome/src/detector.js` (line 1154)

**Proposed New Location:**
`/Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/tests/core-invariants.js`

### Why This Matters
- Better code organization (tests separate from implementation)
- Easier to discover test suite in standard `/tests/` directory
- Can be run independently: `node tests/core-invariants.js`
- No functional impact (tests work either way)

### Fix Instructions (15 minutes)

**Step 1: Extract selfTest() function**
```bash
# Read detector.js from line 1154 onwards (approximately 200 lines)
sed -n '1154,1350p' /Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/extensions/chrome/src/detector.js > /tmp/detector-selftest.js
```

**Step 2: Create wrapper file**
Create `/Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/tests/core-invariants.js`:
```javascript
// Kasbah Guard: Core Invariants Test Suite
// Extracted from detector.js selfTest() function
// 29 detector invariants across pattern detection, ML entropy, context filtering

// Load detector code (or import if ES Module structure)
// Run selfTest and report results

module.exports = {
  selfTest: function() {
    // Copy detector.js selfTest() code here
    // Return { passed: 29, failed: 0, tests: [...] }
  }
};

// Auto-run if executed directly
if (require.main === module) {
  const result = module.exports.selfTest();
  console.log(`✅ Core Invariants: ${result.passed}/${result.passed + result.failed} passing`);
  process.exit(result.failed > 0 ? 1 : 0);
}
```

**Step 3: Update package.json scripts**
In `/kasbah-guard-dist/package.json`, add:
```json
"scripts": {
  "test:core-invariants": "node kasbah-guard-dist/tests/core-invariants.js"
}
```

**Step 4: Verify test runs**
```bash
node /Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/tests/core-invariants.js
# Expected: ✅ Core Invariants: 29/29 passing
```

**Estimated Time:** 15 minutes

### OPTIONAL: Can be skipped
- Current implementation (in detector.js) works perfectly
- No functional benefit to extraction
- Do this only if you want cleaner test organization

---

## VERIFICATION CHECKLIST

After applying all fixes, verify with these commands:

### Fix #1 Verification (Desktop version)
```bash
# Check package.json was updated
grep '"version"' kasbah-guard-dist/apps/desktop/package.json | head -1
# Expected: "version": "1.0.0",

# Verify build still works (optional)
cd kasbah-guard-dist/apps/desktop && npm run build
```

### Fix #2 Verification (API engine version)
```bash
# Check API worker updated
grep "1.0.0" api/src/worker.js | wc -l
# Expected: More than 0

# Check 3.5.2 is gone
grep "3.5.2" api/src/worker.js | wc -l
# Expected: 0 (no matches)

# Verify API still works (optional)
cd api && npm run deploy  # Or test locally
```

### Fix #3 Verification (Core invariants test - optional)
```bash
# Check test file created
ls -la kasbah-guard-dist/tests/core-invariants.js

# Run the test
node kasbah-guard-dist/tests/core-invariants.js
# Expected: ✅ Core Invariants: 29/29 passing
```

### Final Verification (All products)
```bash
# Run full test suite
npm test

# Expected output:
# ✅ Market Launch: 58/58 (100%)
# ✅ JS Tests: 70/70 (100%)
# ✅ CLI Tests: 10/10 (100%)
# ✅ Detector Invariants: 29/29 (100%)
# ✅ TOTAL: 167+ tests passing
```

---

## IMPLEMENTATION SEQUENCE

### Option A: Fix All Issues (25 minutes)
```
1. Update Desktop version (5 min)
2. Update API engine ref (5 min)
3. Extract core invariants (15 min)
4. Run full test suite (10 min, runs in parallel)
TOTAL: 25 minutes
```

### Option B: Fix Critical Issues Only (10 minutes)
```
1. Update Desktop version (5 min)
2. Update API engine ref (5 min)
3. Skip test extraction (optional)
4. Run full test suite (5 min)
TOTAL: 10 minutes
```

### Option C: Minimal Fix (5 minutes)
```
1. Update Desktop version (5 min)
2. Skip API update (can be deferred)
3. Skip test extraction (optional)
TOTAL: 5 minutes
```

---

## ROLLBACK PLAN

If any issue arises, all changes are trivial to revert:

```bash
# Revert Desktop version
git checkout kasbah-guard-dist/apps/desktop/package.json

# Revert API changes
git checkout api/src/worker.js

# Delete extracted test (if created)
rm kasbah-guard-dist/tests/core-invariants.js
git checkout kasbah-guard-dist/package.json
```

---

## DEPLOYMENT NOTES

**Post-Fix Deployment Steps:**
1. Commit changes: `git add . && git commit -m "Audit fixes: version alignment + test extraction"`
2. Deploy API: `cd api && wrangler deploy`
3. Deploy Website: `git push origin main` (auto-deploys)
4. Deploy Extensions: Sync detector.js to all 6 (if changed)
5. Verify: Run `npm test` to confirm 167+ tests still passing

---

## ESTIMATED TOTAL TIME

| Phase | Tasks | Time |
|-------|-------|------|
| **Phase 1** | Fix Desktop version + API reference | 10 min |
| **Phase 2** | Extract test file (optional) | 15 min |
| **Phase 3** | Verify + test suite | 10 min |
| **Total** | All fixes + verification | **25 min** |

---

## DECISION MATRIX

Choose implementation option based on urgency:

| Situation | Recommended | Rationale |
|-----------|-------------|-----------|
| **Launch immediately** | Option C (5 min) | Only Desktop version needed for consistency |
| **Full alignment desired** | Option A (25 min) | Complete audit compliance |
| **Balanced approach** | Option B (10 min) | Critical fixes + optional test extraction |
| **Low priority** | Skip for now | Can be addressed post-launch |

---

## SUCCESS CRITERIA

✅ All fixes complete when:
- [x] Desktop package.json at v1.0.0
- [x] API engine version reference at 1.0.0
- [x] core-invariants.js created (if doing full Option A)
- [x] All tests still passing (58/58, 70/70, 10/10, 29/29)
- [x] No regressions in any product
- [x] Git commits clean and descriptive

---

**Status**: Ready for Implementation
**Priority**: MEDIUM (optional, non-blocking)
**Impact**: Zero functionality impact (cosmetic fixes only)
**Recommendation**: Apply Option B (critical fixes, skip optional test extraction)

Would you like me to proceed with implementing these fixes?
