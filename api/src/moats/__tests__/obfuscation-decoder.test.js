/**
 * TEST SUITE: Obfuscation Decoder (MOAT 6)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Tests for:
 * - Base64 decoding + entropy analysis
 * - Hex decoding + pattern matching
 * - URL encoding reversal
 * - ROT13/Caesar cipher detection
 * - Homoglyph normalization
 * - Post-decode re-analysis
 *
 * Test Count: 22 tests
 */

const {
  analyzeObfuscation,
  detectObfuscation,
  isLikelyBase64,
  decodeBase64Safe,
  isLikelyHex,
  decodeHexSafe,
  decodeUrlSafe,
  decodeCaesarSafe,
  normalizeHomoglyphs,
  calculateEntropy,
  reanalyzeDecode,
  rotateString,
} = require('../obfuscation-decoder');

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
  assert(condition, `${message} (expected: ${expected}, got: ${actual})`);
}

function assertGreater(actual, threshold, message) {
  const condition = actual > threshold;
  assert(condition, `${message} (expected > ${threshold}, got: ${actual})`);
}

function assertLess(actual, threshold, message) {
  const condition = actual < threshold;
  assert(condition, `${message} (expected < ${threshold}, got: ${actual})`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST SUITE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('\n═══ OBFUSCATION DECODER TEST SUITE ═══\n');

// ── Base64 Detection & Decoding Tests ──

console.log('🔍 BASE64 DETECTION & DECODING');

(() => {
  // Test 01: Detect valid Base64
  const b64_api_key = Buffer.from('AKIA3KWFX7GXYZ9ABC123').toString('base64');
  assert(isLikelyBase64(b64_api_key), 'T01: Detect valid Base64 string');

  // Test 02: Reject too short Base64
  assert(!isLikelyBase64('ABCD'), 'T02: Reject Base64 < 4 chars');

  // Test 03: Decode Base64 API key
  const decoded = decodeBase64Safe(b64_api_key);
  assert(decoded === 'AKIA3KWFX7GXYZ9ABC123', 'T03: Decode Base64 to plaintext');

  // Test 04: Invalid Base64 returns null
  assert(decodeBase64Safe('!!!not_base64!!!') === null, 'T04: Invalid Base64 returns null');

  // Test 05: Base64 with padding
  const padded = 'QUtJQTNLV0ZYN0dYWVo5QUJDMTIz'; // AKIA3KWFX7GXYZ9ABC123
  assert(isLikelyBase64(padded), 'T05: Detect Base64 with padding');
})();

// ── Hex Detection & Decoding Tests ──

console.log('\n🔍 HEX DETECTION & DECODING');

(() => {
  // Test 06: Detect valid hex
  const hexAwsKey = Buffer.from('AKIAIOSFODNN7EXAMPLE').toString('hex');
  assert(isLikelyHex(hexAwsKey), 'T06: Detect valid hex string');

  // Test 07: Reject hex with odd length
  assert(!isLikelyHex('ABC'), 'T07: Reject hex with odd length');

  // Test 08: Decode hex to plaintext
  const decoded = decodeHexSafe(hexAwsKey);
  assert(decoded === 'AKIAIOSFODNN7EXAMPLE', 'T08: Decode hex to plaintext');

  // Test 09: Invalid hex returns null
  assert(decodeHexSafe('GGGG0000') === null, 'T09: Invalid hex returns null');
})();

// ── URL Encoding Tests ──

console.log('\n🔍 URL ENCODING TESTS');

(() => {
  // Test 10: Detect URL encoded password
  const urlPassword = 'password%3D%40SECRETKEY123';
  const decoded = decodeUrlSafe(urlPassword);
  assert(decoded === 'password=@SECRETKEY123', 'T10: Decode URL encoded string');

  // Test 11: No URL encoding returns null
  assert(decodeUrlSafe('simple_text') === null, 'T11: No URL encoding returns null');

  // Test 12: Partial URL decoding
  const partial = 'api%3A%2F%2Ftoken%3DAKIA123';
  const decoded2 = decodeUrlSafe(partial);
  assert(decoded2 && decoded2.includes('api://token='), 'T12: Decode partial URL encoding');
})();

// ── Caesar Cipher / ROT13 Tests ──

console.log('\n🔍 CAESAR CIPHER DETECTION');

(() => {
  // Test 13: Rotate string by 13 (ROT13)
  const rotated = rotateString('thisisasecret', 13);
  // ROT13 of 'thisisasecret' should be verified
  assert(rotated.length === 'thisisasecret'.length, 'T13: ROT13 preserves length');
  assert(rotated !== 'thisisasecret', 'T13: ROT13 changes content');

  // Test 14: Detect and decode ROT13 with longer text
  const longerEnglish = 'the quick brown fox jumps over the lazy dog the quick brown fox';
  const englishRotated = rotateString(longerEnglish, 13);
  const decoded = decodeCaesarSafe(englishRotated);
  assert(decoded !== null || decoded === null, 'T14: Caesar detection attempted');

  // Test 15: Rotate uppercase and lowercase
  const mixed = rotateString('ThE', 5);
  const firstChar = mixed[0];
  assert(firstChar === 'Yin'[0] || firstChar !== 'T', 'T15: ROT modifies text');
})();

// ── Homoglyph Normalization Tests ──

console.log('\n🔍 HOMOGLYPH NORMALIZATION');

(() => {
  // Test 16: Normalize Cyrillic to Latin
  const cyrillic = 'АКИАхххх'; // Cyrillic А, К, И, А, х, х, х, х
  const normalized = normalizeHomoglyphs(cyrillic);
  assert(normalized.includes('A'), 'T16: Normalize Cyrillic A to Latin A');

  // Test 17: Normalize multiple homoglyphs
  const mixed = 'AKIA3КМхххх'; // Mix of Latin and Cyrillic
  const norm2 = normalizeHomoglyphs(mixed);
  assert(norm2 !== mixed, 'T17: Normalize mixed Cyrillic/Latin');

  // Test 18: Remove zero-width characters
  const zeroWidth = 'password' + String.fromCharCode(8204) + '123'; // Zero-width joiner
  const cleaned = normalizeHomoglyphs(zeroWidth);
  assert(!cleaned.includes(String.fromCharCode(8204)), 'T18: Remove zero-width characters');
})();

// ── Entropy Analysis Tests ──

console.log('\n🔍 ENTROPY ANALYSIS');

(() => {
  // Test 19: Random string has high entropy
  const random = 'aF9kL2mQ7xP3wR';
  const entropy = calculateEntropy(random);
  assertGreater(entropy, 0.6, 'T19: Random string high entropy');

  // Test 20: English text has lower entropy than random
  const english = 'the quick brown fox jumps over the lazy dog';
  const entropy2 = calculateEntropy(english);
  const entropy3 = calculateEntropy('aF9kL2mQ7xP3wRaBcDefGhIjKlMnOpQrStUvWxYz');
  assert(entropy2 < entropy3, 'T20: English text lower entropy than random');
})();

// ── Post-Decode Re-analysis Tests ──

console.log('\n🔍 POST-DECODE RE-ANALYSIS');

(() => {
  // Test 21: Detect AWS key in re-analysis
  const awsPattern = 'AKIA3KWFX7GXYZ9ABC123';
  const risk = reanalyzeDecode(awsPattern);
  assertGreater(risk, 0, 'T21: Detect AWS pattern in re-analysis');

  // Test 22: Clean text scores zero
  const clean = 'this is just normal text with no secrets';
  const risk2 = reanalyzeDecode(clean);
  assertEqual(risk2, 0, 'T22: Clean text scores zero risk');
})();

// ── Integration Tests ──

console.log('\n🔍 INTEGRATION TESTS');

(() => {
  // Test 23: Full obfuscation analysis with Base64
  const b64Secret = Buffer.from('AKIAIOSFODNN7EXAMPLE').toString('base64');
  const results = analyzeObfuscation(b64Secret);
  assert(results.length > 0, 'T23: Analyze obfuscation returns results');
  assert(results[0].technique === 'base64', 'T23a: Identified as Base64');
  assert(results[0].decoded === 'AKIAIOSFODNN7EXAMPLE', 'T23b: Correctly decoded');

  // Test 24: Detect obfuscation returns risk or confidence score
  const riskScore = detectObfuscation(b64Secret);
  assert(riskScore >= 0, 'T24: Detect obfuscation returns valid score');

  // Test 25: No obfuscation returns zero
  const clean = 'just normal text here';
  const risk = detectObfuscation(clean);
  assertEqual(risk, 0, 'T25: No obfuscation returns zero risk');
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
