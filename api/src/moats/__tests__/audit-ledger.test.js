/**
 * TEST SUITE: Audit Ledger (MOAT 7)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Tests for:
 * - Genesis block initialization
 * - Detection recording with redaction
 * - Chain integrity verification
 * - Tamper detection
 * - Proof generation
 * - Statistics calculation
 * - Data export
 * - Edge cases
 *
 * Test Count: 22 tests
 */

const {
  AuditLedger,
  resetLedger,
  sha256,
  getTimestamp,
  generateBlockId,
  redactContext
} = require('../audit-ledger');

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

function assertEqual(actual, expected, message) {
  const condition = JSON.stringify(actual) === JSON.stringify(expected);
  assert(condition, `${message}`);
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

console.log('\n═══ AUDIT LEDGER TEST SUITE ═══\n');

// ── Genesis Block Tests ──

console.log('🔐 GENESIS BLOCK & INITIALIZATION');

(() => {
  // Test 01: Ledger initializes with genesis block
  const ledger = new AuditLedger();
  assert(ledger.initialized === true, 'T01: Ledger initialized');

  // Test 02: Genesis block created
  assert(ledger.chain.length === 1, 'T02: Genesis block present');
  assert(ledger.chain[0].data.type === 'genesis', 'T02a: First block is genesis');

  // Test 03: Proper block count
  assertEqual(ledger.blockCount, 1, 'T03: Block count is 1');

  // Test 04: Genesis hash generated
  assert(ledger.lastBlockHash !== null, 'T04: Genesis hash generated');
  assert(ledger.lastBlockHash.length === 64, 'T04a: Hash is 64 chars (SHA-256)');
})();

// ── Detection Recording Tests ──

console.log('\n🔐 DETECTION RECORDING');

(() => {
  // Test 05: Record single detection
  const ledger = new AuditLedger();
  const result = ledger.recordDetection('aws_key', 0.95, 95);
  assert(result.success === true, 'T05: Detection recorded successfully');
  assert(result.blockId !== null, 'T05a: Block ID generated');
  assertEqual(result.blockIndex, 1, 'T05b: Block index is 1 (after genesis)');

  // Test 06: Block count increases
  assertEqual(ledger.blockCount, 2, 'T06: Block count incremented to 2');

  // Test 07: Multiple detections
  ledger.recordDetection('github_pat', 0.88, 88);
  ledger.recordDetection('slack_webhook', 0.92, 92);
  assertEqual(ledger.blockCount, 4, 'T07: Block count is 4 (genesis + 3 detections)');
})();

// ── Data Redaction Tests ──

console.log('\n🔐 DATA REDACTION & PRIVACY');

(() => {
  // Test 08: Context redaction
  const context = {
    content: 'AKIAIOSFODNN7EXAMPLE1234567890',
    line: 42,
    file: 'config.js'
  };
  const redacted = redactContext(context);
  assert(
    redacted.content.includes('REDACTED'),
    'T08: Long strings redacted'
  );
  assertEqual(redacted.line, 42, 'T08a: Numbers preserved');

  // Test 09: Nested object redaction
  const nested = {
    outer: {
      inner: 'thisIsAVeryLongSecretStringThatShouldBeRedacted'
    }
  };
  const redactedNested = redactContext(nested);
  assert(
    redactedNested.outer.inner.includes('REDACTED'),
    'T09: Nested strings redacted'
  );

  // Test 10: NO secrets in ledger export
  const ledger = new AuditLedger();
  ledger.recordDetection('api_key', 0.9, 90, {
    secretValue: 'AKIAIOSFODNN7EXAMPLE'
  });
  const exported = ledger.export();
  const blockData = JSON.stringify(exported);
  assert(
    !blockData.includes('AKIAIOSFODNN7EXAMPLE'),
    'T10: Actual secret NOT in export'
  );
})();

// ── Chain Integrity Tests ──

console.log('\n🔐 CHAIN INTEGRITY VERIFICATION');

(() => {
  // Test 11: Verify chain integrity after genesis
  const ledger = new AuditLedger();
  assert(ledger.verifyChainIntegrity() === true, 'T11: Genesis block valid');

  // Test 12: Verify chain after detections
  ledger.recordDetection('pattern1', 0.8, 80);
  ledger.recordDetection('pattern2', 0.85, 85);
  ledger.recordDetection('pattern3', 0.9, 90);
  assert(ledger.verifyChainIntegrity() === true, 'T12: Chain valid after detections');

  // Test 13: Chain links properly
  for (let i = 1; i < ledger.chain.length; i++) {
    const block = ledger.chain[i];
    const previousBlock = ledger.chain[i - 1];
    assertEqual(
      block.previousHash,
      previousBlock.hash,
      `T13: Block ${i} links to previous`
    );
  }
})();

// ── Tamper Detection Tests ──

console.log('\n🔐 TAMPER DETECTION');

(() => {
  // Test 14: Detect hash tampering
  const ledger = new AuditLedger();
  ledger.recordDetection('pattern1', 0.8, 80);
  const lastHash = ledger.lastBlockHash;

  // Simulate tampering
  ledger.chain[1].data.confidence = 0.5; // Change data

  // Detection should fail
  assert(ledger.verifyChainIntegrity() === false, 'T14: Tampering detected');

  // Test 15: Detect chain break
  const ledger2 = new AuditLedger();
  ledger2.recordDetection('pattern1', 0.8, 80);
  ledger2.recordDetection('pattern2', 0.9, 90);

  // Break chain link
  ledger2.chain[2].previousHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  assert(ledger2.verifyChainIntegrity() === false, 'T15: Chain break detected');

  // Test 16: Detect tampering with known hash
  const ledger3 = new AuditLedger();
  const originalHash = ledger3.lastBlockHash;
  ledger3.recordDetection('pattern1', 0.8, 80);
  assert(
    ledger3.detectTampering(originalHash) === true,
    'T16: Tampering detected via hash comparison'
  );
})();

// ── Proof Generation Tests ──

console.log('\n🔐 COMPLIANCE PROOF GENERATION');

(() => {
  // Test 17: Generate merkle proof
  const ledger = new AuditLedger();
  ledger.recordDetection('pattern1', 0.8, 80);
  ledger.recordDetection('pattern2', 0.9, 90);

  const proof = ledger.generateProof();
  assert(proof.merkleRoot !== null, 'T17: Merkle root generated');
  assert(proof.merkleRoot.length === 64, 'T17a: Merkle root is 64 chars');
  assertEqual(proof.blockCount, 3, 'T17b: Block count in proof');
  assertEqual(proof.chainIntegrity, true, 'T17c: Chain integrity verified');

  // Test 18: Proof is deterministic
  const proof2 = ledger.generateProof();
  assertEqual(proof.merkleRoot, proof2.merkleRoot, 'T18: Same ledger = same proof');
})();

// ── Statistics Tests ──

console.log('\n🔐 STATISTICS & ANALYTICS');

(() => {
  // Test 19: Calculate statistics
  const ledger = new AuditLedger();
  ledger.recordDetection('aws_key', 0.95, 95);
  ledger.recordDetection('github_pat', 0.88, 88);
  ledger.recordDetection('aws_key', 0.90, 90);

  const stats = ledger.getStatistics();
  assertEqual(stats.totalDetections, 3, 'T19: Total detections count');
  assertGreater(stats.averageConfidence, 0.85, 'T19a: Average confidence calculated');
  assertGreater(stats.averageRiskScore, 80, 'T19b: Average risk calculated');

  // Test 20: Pattern breakdown
  assert(stats.patternsByType['aws_key'] !== undefined, 'T20: AWS key stats present');
  assertEqual(stats.patternsByType['aws_key'].count, 2, 'T20a: AWS key count is 2');
  assert(stats.patternsByType['github_pat'].count === 1, 'T20b: GitHub PAT count is 1');
})();

// ── Export & Summary Tests ──

console.log('\n🔐 EXPORT & SUMMARY');

(() => {
  // Test 21: Export ledger
  const ledger = new AuditLedger();
  ledger.recordDetection('pattern1', 0.8, 80);
  ledger.recordDetection('pattern2', 0.85, 85);

  const exported = ledger.export();
  assert(exported.version === '1.0.0', 'T21: Export includes version');
  assert(exported.exportTime !== undefined, 'T21a: Export timestamp');
  assert(exported.blocks.length === 3, 'T21b: All blocks exported (genesis + 2)');
  assert(exported.merkleProof !== undefined, 'T21c: Merkle proof included');

  // Test 22: Get summary
  const summary = ledger.getSummary();
  assertEqual(summary.blockCount, 3, 'T22: Summary block count');
  assertEqual(summary.detectionCount, 2, 'T22a: Summary detection count (excludes genesis)');
  assertEqual(summary.chainIntegrity, true, 'T22b: Summary chain integrity');
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
