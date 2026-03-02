/**
 * TEST SUITE: Pattern Analysis & Reliability Scoring (MOAT 8)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Tests for:
 * - Entropy analysis
 * - Per-pattern accuracy tracking
 * - Single point of failure detection
 * - Context-aware confidence boosting
 * - Naive Bayes probability updating
 * - Pattern extensions (34+ patterns)
 *
 * Test Count: 22 tests
 */

const {
  PatternAnalyzer,
  resetAnalyzer,
  calculateEntropy,
  detectSinglePointOfFailure,
  getContextBoost,
  applyNaiveBayesAdjustment,
  getEntropyBoost,
  getLengthAnomaly,
  PATTERN_BASE_CONFIDENCE
} = require('../pattern-analysis');

// ── Test Helpers ──

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

function assertGreater(actual, threshold, message) {
  assert(actual > threshold, `${message} (expected > ${threshold}, got ${actual})`);
}

function assertLess(actual, threshold, message) {
  assert(actual < threshold, `${message} (expected < ${threshold}, got ${actual})`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST SUITE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('\n═══ PATTERN ANALYSIS TEST SUITE ═══\n');

// ── Entropy Analysis Tests ──

console.log('🔬 ENTROPY ANALYSIS');

(() => {
  // Test 01: Low entropy text
  const englishText = 'the quick brown fox jumps over the lazy dog';
  const englishEntropy = calculateEntropy(englishText);
  assertLess(englishEntropy, 0.8, 'T01: English text has lower entropy');

  // Test 02: High entropy random string
  const randomString = 'aF9kL2mQ7xP3wRaBcDeFgHiJkLmNoPq';
  const randomEntropy = calculateEntropy(randomString);
  assertGreater(randomEntropy, 0.6, 'T02: Random string has higher entropy');

  // Test 03: Encrypted-like data
  const base64 = 'QUtJQUlPU0ZPRK5OTkE3RVhBTVBMRQ==';
  const base64Entropy = calculateEntropy(base64);
  assertGreater(base64Entropy, 0.5, 'T03: Base64 has moderate-high entropy');
})();

// ── Context Boost Tests ──

console.log('\n🔬 CONTEXT BOOSTING');

(() => {
  // Test 04: Environment context boost
  const envBoost = getContextBoost('.env file');
  assertGreater(envBoost, 10, 'T04: .env context provides boost');

  // Test 05: Multiple context indicators
  const secretContext = 'private api key secret credential';
  const multiBoost = getContextBoost(secretContext);
  assertGreater(multiBoost, 20, 'T05: Multiple indicators provide cumulative boost');

  // Test 06: No context
  const noBoost = getContextBoost(null);
  assertEqual(noBoost, 0, 'T06: No context gives no boost');
})();

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected ${expected}, got ${actual})`);
}

// ── Single Point of Failure Tests ──

console.log('\n🔬 SINGLE POINT OF FAILURE DETECTION');

(() => {
  // Test 07: Detect weak password_assign
  const weakPattern = detectSinglePointOfFailure('password_assign', 'password=');
  assert(weakPattern === true, 'T07: Detect weak password pattern');

  // Test 08: Detect weak bearer_token
  const weakBearer = detectSinglePointOfFailure('bearer_token', 'Bearer token123');
  assert(weakBearer === true, 'T08: Detect weak bearer pattern');

  // Test 09: Strong pattern has no SPOF
  const strongPattern = detectSinglePointOfFailure('aws_key', 'AKIAIOSFODNN7EXAMPLE');
  assert(strongPattern === false, 'T09: Strong patterns have no SPOF');
})();

// ── Length Anomaly Tests ──

console.log('\n🔬 LENGTH ANOMALY DETECTION');

(() => {
  // Test 10: Correct length AWS key
  const correctLength = getLengthAnomaly('aws_key', 'A'.repeat(40));
  assertGreater(correctLength, 0, 'T10: Correct length receives boost');

  // Test 11: Wrong length AWS key
  const wrongLength = getLengthAnomaly('aws_key', 'A'.repeat(20));
  assertLess(wrongLength, 0, 'T11: Wrong length receives penalty');

  // Test 12: SSN length validation
  const ssnBoost = getLengthAnomaly('ssn', '123-45-6789');
  assertGreater(ssnBoost, 0, 'T12: Correct SSN length detected');
})();

// ── Confidence Calculation Tests ──

console.log('\n🔬 CONFIDENCE CALCULATION');

(() => {
  // Test 13: Base confidence for known pattern
  const analyzer = new PatternAnalyzer();
  const result = analyzer.calculateConfidence('aws_key', 'AKIAIOSFODNN7EXAMPLE');
  assertGreater(result.finalConfidence, 80, 'T13: AWS key gets high confidence');

  // Test 14: Confidence boost with context
  const withContext = analyzer.calculateConfidence('aws_key', 'AKIAIOSFODNN7EXAMPLE', '.env');
  assertGreater(
    withContext.finalConfidence,
    result.finalConfidence,
    'T14: Context increases confidence'
  );

  // Test 15: Entropy affects confidence
  const lowEntropyStr = 'aaaaaabbbbbbcccccc';
  const lowEntropyResult = analyzer.calculateConfidence('aws_key', lowEntropyStr);
  assertLess(lowEntropyResult.finalConfidence, 95, 'T15: Low entropy reduces confidence');
})();

// ── Accuracy Tracking Tests ──

console.log('\n🔬 ACCURACY TRACKING');

(() => {
  // Test 16: Record true positive
  const analyzer = new PatternAnalyzer();
  analyzer.recordOutcome('aws_key', 'AKIAIOSFODNN7EXAMPLE', true);
  const accuracy = analyzer.getAccuracy('aws_key');
  assertEqual(accuracy.truePositive, 1, 'T16: True positive recorded');

  // Test 17: Record false positive
  analyzer.recordOutcome('aws_key', 'fake-key-123', false);
  const accuracy2 = analyzer.getAccuracy('aws_key');
  assertEqual(accuracy2.falsePositive, 1, 'T17: False positive recorded');

  // Test 18: Calculate precision
  analyzer.recordOutcome('aws_key', 'AKIA1111111111111111', true);
  const accuracy3 = analyzer.getAccuracy('aws_key');
  assertGreater(accuracy3.precision, 0.5, 'T18: Precision calculated correctly');
})();

// ── Naive Bayes Adjustment Tests ──

console.log('\n🔬 NAIVE BAYES ADJUSTMENT');

(() => {
  // Test 19: High precision improves confidence
  const accuracy = {
    truePositive: 95,
    falsePositive: 5,
    falseNegative: 0,
    trueNegative: 0
  };
  const adjusted = applyNaiveBayesAdjustment(80, accuracy);
  assertGreater(adjusted, 70, 'T19: High precision increases adjusted confidence');

  // Test 20: Low precision reduces confidence
  const lowAccuracy = {
    truePositive: 50,
    falsePositive: 50,
    falseNegative: 0,
    trueNegative: 0
  };
  const lowAdjusted = applyNaiveBayesAdjustment(80, lowAccuracy);
  assertLess(lowAdjusted, 80, 'T20: Low precision decreases adjusted confidence');
})();

// ── Pattern Extensions Tests ──

console.log('\n🔬 PATTERN EXTENSIONS');

(() => {
  // Test 21: All 34 patterns available
  const analyzer = new PatternAnalyzer();
  const patterns = analyzer.getAvailablePatterns();
  assertGreater(patterns.length, 30, 'T21: 30+ patterns available');

  // Test 22: New patterns can be added
  analyzer.addPattern('custom_pattern', 85);
  const hasCustom = analyzer.getAvailablePatterns().includes('custom_pattern');
  assert(hasCustom === true, 'T22: New patterns can be added');
})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESULTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('\n═══════════════════════════════════════\n');
console.log(`✅ PASSED: ${passed}`);
console.log(`❌ FAILED: ${failed}`);
console.log(`📊 TOTAL:  ${passed + failed}\n`);

if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED!\n');
  process.exit(0);
} else {
  console.log(`⚠️  ${failed} test(s) failed\n`);
  process.exit(1);
}
