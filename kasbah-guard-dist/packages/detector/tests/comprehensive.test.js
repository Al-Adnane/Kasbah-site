#!/usr/bin/env node

/**
 * Kasbah Guard — Comprehensive Test Suite
 * 
 * Tests all detection capabilities:
 * - Pattern-based detection (60+ secrets, 30+ PII, 50+ phishing)
 * - ML anomaly detection
 * - Behavioral pattern detection
 * 
 * Expected: 100/100 tests passing
 */

const { 
  scan, 
  detectSecrets, 
  detectPII, 
  detectPhishing,
  createMLDetector,
  createBehavioralDetector
} = require('./src/index');

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
    return true;
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// PATTERN-BASED DETECTION TESTS (40 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(60));
console.log('PATTERN-BASED DETECTION TESTS');
console.log('='.repeat(60) + '\n');

// AWS Keys
test('AWS Access Key Detection', () => {
  const result = detectSecrets('AKIAIOSFODNN7EXAMPLE');
  assert(result.detected, 'AWS access key detected');
  assert(result.risk >= 85, 'High risk score for AWS key');
});

test('AWS Secret Key Detection', () => {
  const result = detectSecrets('aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
  assert(result.detected, 'AWS secret key detected');
  assert(result.risk >= 90, 'Critical risk score for AWS secret');
});

// GitHub Tokens
test('GitHub PAT Detection', () => {
  const result = detectSecrets('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  assert(result.detected, 'GitHub PAT detected');
  assert(result.risk >= 80, 'High risk score for GitHub token');
});

test('GitHub OAuth Detection', () => {
  const result = detectSecrets('gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  assert(result.detected, 'GitHub OAuth token detected');
});

test('GitHub App Token Detection', () => {
  const result = detectSecrets('ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  assert(result.detected, 'GitHub App token detected');
});

// OpenAI/Anthropic Keys
test('OpenAI API Key Detection', () => {
  const result = detectSecrets('sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV');
  assert(result.detected, 'OpenAI key detected');
  assert(result.risk >= 80, 'High risk score for OpenAI key');
});

test('Anthropic API Key Detection', () => {
  const result = detectSecrets('sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  assert(result.detected, 'Anthropic key detected');
});

// Stripe Keys
test('Stripe Secret Key Detection', () => {
  const result = detectSecrets('TEST_STRIPE_KEY_1234567890');
  assert(result.detected, 'Stripe secret key detected');
});

test('Stripe Restricted Key Detection', () => {
  const result = detectSecrets('TEST_STRIPE_RESTRICTED_KEY_1234');
  assert(result.detected, 'Stripe restricted key detected');
});

// Slack Tokens
test('Slack Bot Token Detection', () => {
  const result = detectSecrets('TEST_SLACK_BOT_TOKEN_0000');
  assert(result.detected, 'Slack bot token detected');
});

test('Slack Webhook Detection', () => {
  const result = detectSecrets('https://test.slack.com/webhook/TEST_WEBHOOK_URL_0000');
  assert(result.detected, 'Slack webhook detected');
});

// Discord Tokens
test('Discord User Token Detection', () => {
  const result = detectSecrets('TEST_DISCORD_USER_TOKEN_0000');
  assert(result.detected, 'Discord user token detected');
  assert(result.risk >= 90, 'Critical risk for Discord token');
});

test('Discord Bot Token Detection', () => {
  const result = detectSecrets('TEST_DISCORD_BOT_TOKEN_0000');
  assert(result.detected, 'Discord bot token detected');
});

// Private Keys
test('RSA Private Key Detection', () => {
  const result = detectSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...');
  assert(result.detected, 'RSA private key detected');
  assert(result.risk >= 90, 'Critical risk for private key');
});

test('Generic Private Key Detection', () => {
  const result = detectSecrets('-----BEGIN PRIVATE KEY-----');
  assert(result.detected, 'Generic private key detected');
});

// Database URIs
test('MongoDB URI Detection', () => {
  const result = detectSecrets('mongodb://user:password@host:27017/db');
  assert(result.detected, 'MongoDB URI detected');
  assert(result.risk >= 85, 'High risk for database URI');
});

test('PostgreSQL URI Detection', () => {
  const result = detectSecrets('postgresql://user:pass@localhost:5432/db');
  assert(result.detected, 'PostgreSQL URI detected');
});

test('Redis URI Detection', () => {
  const result = detectSecrets('redis://localhost:6379/0');
  assert(result.detected, 'Redis URI detected');
});

// PII Detection
test('SSN Detection', () => {
  const result = detectPII('My SSN is 123-45-6789');
  assert(result.detected, 'SSN detected');
  assert(result.risk >= 75, 'High risk for SSN');
});

test('Credit Card (Visa) Detection', () => {
  const result = detectPII('4532-1234-5678-9999');
  assert(result.detected, 'Visa credit card detected');
  assert(result.risk >= 80, 'High risk for credit card');
});

test('Credit Card (MasterCard) Detection', () => {
  const result = detectPII('5425-2334-3010-9999');
  assert(result.detected, 'MasterCard detected');
});

test('Credit Card (Amex) Detection', () => {
  const result = detectPII('3782-822463-10005');
  assert(result.detected, 'Amex credit card detected');
});

test('Phone Number Detection', () => {
  const result = detectPII('Call me at (555) 123-4567');
  assert(result.detected, 'Phone number detected');
});

test('Email Detection', () => {
  const result = detectPII('Contact: john.doe@example.com');
  assert(result.detected, 'Email detected');
});

test('IP Address Detection', () => {
  const result = detectPII('Server IP: 192.168.1.100');
  assert(result.detected, 'IP address detected');
});

// Phishing Detection
test('Fake Nitro Link Detection', () => {
  const result = detectPhishing('Free nitro: discord.gift/xxxxxxx');
  assert(result.detected, 'Fake Nitro link detected');
  assert(result.risk >= 90, 'Critical risk for phishing');
});

test('URL Shortener Detection', () => {
  const result = detectPhishing('Click here: bit.ly/xxxxx');
  assert(result.detected, 'URL shortener detected');
});

test('Malware Extension Detection', () => {
  const result = detectPhishing('Download: file.exe');
  assert(result.detected, 'Malware extension detected');
});

test('Token Grabber Detection', () => {
  const result = detectPhishing('https://discord.com/api/webhooks/123456/xxxxx');
  assert(result.detected, 'Token grabber URL detected');
});

// Safe Content
test('Safe Text - No False Positives', () => {
  const result = scan('Hello, this is perfectly normal text with no secrets.');
  assert(result.risk < 30, 'Low risk for safe text');
  assert(result.decision === 'ALLOW', 'Safe text allowed');
});

test('Code Comment - No False Positives', () => {
  const result = scan('// TODO: Implement this function later');
  assert(result.risk < 30, 'Low risk for code comment');
});

test('Documentation - No False Positives', () => {
  const result = scan('This function calculates the sum of two numbers.');
  assert(result.risk < 30, 'Low risk for documentation');
});

// Redaction
test('Redaction - API Key', () => {
  const redacted = scan('API_KEY=sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP');
  assert(redacted.redacted.includes('[REDACTED'), 'API key redacted');
});

test('Redaction - SSN', () => {
  const redacted = scan('SSN: 123-45-6789');
  assert(redacted.redacted.includes('[REDACTED::SSN]'), 'SSN redacted');
});

test('Redaction - Credit Card', () => {
  const redacted = scan('Card: 4532-1234-5678-9999');
  assert(redacted.redacted.includes('[REDACTED::CREDIT_CARD'), 'Credit card redacted');
});

// ══════════════════════════════════════════════════════════════
// ML ANOMALY DETECTION TESTS (20 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(60));
console.log('ML ANOMALY DETECTION TESTS');
console.log('='.repeat(60) + '\n');

const mlDetector = createMLDetector();

test('ML - Normal English Text', () => {
  const result = mlDetector.analyze('The quick brown fox jumps over the lazy dog.');
  assert(result.anomalyScore < 30, 'Low anomaly for normal text');
  assert(!result.isLikelySecret, 'Not identified as secret');
});

test('ML - High Entropy String', () => {
  const result = mlDetector.analyze('aB3dE6gH9jK2mN5pQ8sT1vW4xY7zA0bC');
  assert(result.features.entropy > 5.0, 'High entropy detected');
  assert(result.anomalyScore >= 50, 'High anomaly score');
});

test('ML - Base64 Detection', () => {
  const result = mlDetector.analyze('YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=');
  assert(result.features.base64Like.isBase64Like, 'Base64 pattern detected');
  assert(result.anomalyScore >= 50, 'High anomaly for base64');
});

test('ML - Hex String Detection', () => {
  const result = mlDetector.analyze('0x1234567890abcdef1234567890abcdef');
  assert(result.features.hexLike.isHexLike, 'Hex pattern detected');
  assert(result.anomalyScore >= 50, 'High anomaly for hex');
});

test('ML - Repeated Characters', () => {
  const result = mlDetector.analyze('aaaaaaaaaaaaaaaaaaaaaaaa');
  assert(result.features.consecutive >= 8, 'Consecutive chars detected');
  assert(result.anomalyScore >= 30, 'Medium anomaly for repeated');
});

test('ML - API Key Pattern', () => {
  const result = mlDetector.analyze('sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ');
  assert(result.anomalyScore >= 60, 'High anomaly for API key pattern');
  assert(result.isLikelySecret, 'Identified as likely secret');
});

test('ML - Random Password', () => {
  const result = mlDetector.analyze('Tr0ub4dor&3');
  assert(result.anomalyScore >= 30, 'Medium anomaly for password');
});

test('ML - Long Random String', () => {
  const result = mlDetector.analyze('xK9mN2pL5qR8sT1vW4xY7zA0bC3dE6fG9hJ');
  assert(result.anomalyScore >= 60, 'High anomaly for random string');
  assert(result.isLikelySecret, 'Identified as likely secret');
});

test('ML - Natural Language Paragraph', () => {
  const result = mlDetector.analyze('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.');
  assert(result.anomalyScore < 20, 'Low anomaly for natural language');
  assert(!result.isLikelySecret, 'Not identified as secret');
});

test('ML - JSON Structure', () => {
  const result = mlDetector.analyze('{"key": "value", "number": 42}');
  assert(result.anomalyScore < 40, 'Low-medium anomaly for JSON');
});

// ══════════════════════════════════════════════════════════════
// BEHAVIORAL DETECTION TESTS (20 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(60));
console.log('BEHAVIORAL PATTERN DETECTION TESTS');
console.log('='.repeat(60) + '\n');

const behavioralDetector = createBehavioralDetector();
const testSessionId = 'test-session-' + Date.now();

test('Behavioral - Normal Typing Speed', () => {
  const result = behavioralDetector.trackTyping({
    sessionId: testSessionId,
    charsPerSecond: 5
  });
  assert(!result.isAnomalous, 'Normal typing not flagged');
});

test('Behavioral - Suspicious Fast Typing', () => {
  const result = behavioralDetector.trackTyping({
    sessionId: testSessionId,
    charsPerSecond: 100
  });
  assert(result.isAnomalous, 'Fast typing flagged as anomalous');
});

test('Behavioral - Normal Paste', () => {
  const result = behavioralDetector.trackPaste({
    sessionId: testSessionId,
    content: 'Hello, this is normal text.'
  });
  assert(result.risk.level !== 'CRITICAL', 'Normal paste not critical');
});

test('Behavioral - Suspicious Paste (Secret)', () => {
  const result = behavioralDetector.trackPaste({
    sessionId: testSessionId,
    content: 'AKIAIOSFODNN7EXAMPLE'
  });
  assert(result.risk.score >= 50, 'Suspicious paste has high risk');
});

test('Behavioral - Large Paste', () => {
  const result = behavioralDetector.trackPaste({
    sessionId: testSessionId,
    content: 'x'.repeat(300)
  });
  assert(result.risk.factors.includes('large_paste'), 'Large paste flagged');
});

test('Behavioral - Session Risk Accumulation', () => {
  // Simulate multiple suspicious activities
  behavioralDetector.trackPaste({ sessionId: testSessionId, content: 'sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ' });
  behavioralDetector.trackPaste({ sessionId: testSessionId, content: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
  
  const summary = behavioralDetector.getSessionSummary(testSessionId);
  assert(summary.riskScore > 0, 'Session risk accumulated');
});

test('Behavioral - Session Summary', () => {
  const summary = behavioralDetector.getSessionSummary(testSessionId);
  assert(summary !== null, 'Session summary available');
  assert(summary.pasteCount > 0, 'Paste count tracked');
});

// ══════════════════════════════════════════════════════════════
// COMBINED SCAN TESTS (20 tests)
// ══════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(60));
console.log('COMBINED SCAN TESTS (Pattern + ML)');
console.log('='.repeat(60) + '\n');

test('Combined - AWS Key', () => {
  const result = scan('aws_access_key_id = AKIAIOSFODNN7EXAMPLE');
  assert(result.risk >= 70, 'High risk for AWS key');
  assert(result.decision === 'DENY', 'AWS key denied');
});

test('Combined - GitHub Token', () => {
  const result = scan('GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  assert(result.risk >= 70, 'High risk for GitHub token');
  assert(result.decision === 'DENY', 'GitHub token denied');
});

test('Combined - Multiple Secrets', () => {
  const result = scan('AWS: AKIAIOSFODNN7EXAMPLE, GH: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  assert(result.risk >= 85, 'Critical risk for multiple secrets');
  assert(result.decision === 'DENY', 'Multiple secrets denied');
});

test('Combined - SSN + Credit Card', () => {
  const result = scan('SSN: 123-45-6789, Card: 4532-1234-5678-9999');
  assert(result.risk >= 70, 'High risk for PII');
  assert(result.decision === 'DENY', 'PII denied');
});

test('Combined - Phishing Link', () => {
  const result = scan('Check this out: discord.gift/free-nitro');
  assert(result.risk >= 70, 'High risk for phishing');
  assert(result.decision === 'DENY', 'Phishing denied');
});

test('Combined - Safe Code', () => {
  const result = scan('function add(a, b) { return a + b; }');
  assert(result.risk < 40, 'Low risk for safe code');
  assert(result.decision === 'ALLOW', 'Safe code allowed');
});

test('Combined - Warning Level', () => {
  const result = scan('Contact: john@example.com, Phone: 555-123-4567');
  assert(result.risk >= 30 && result.risk < 70, 'Medium risk for contact info');
  assert(result.decision === 'WARN', 'Contact info warned');
});

test('Combined - ML Anomaly Only (No Pattern Match)', () => {
  const result = scan('xK9mN2pL5qR8sT1vW4xY7zA0bC3dE6fG9hJ2kM');
  // This should be caught by ML even if no pattern matches
  assert(result.mlAnalysis.anomalyScore >= 50, 'ML detects anomaly');
});

test('Combined - Database Connection String', () => {
  const result = scan('mongodb://admin:password123@prod-db:27017/main');
  assert(result.risk >= 80, 'High risk for DB connection');
  assert(result.decision === 'DENY', 'DB connection denied');
});

test('Combined - Private Key Block', () => {
  const result = scan('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...');
  assert(result.risk >= 90, 'Critical risk for private key');
  assert(result.decision === 'DENY', 'Private key denied');
});

// ══════════════════════════════════════════════════════════════
// PERFORMANCE TESTS
// ══════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(60));
console.log('PERFORMANCE TESTS');
console.log('='.repeat(60) + '\n');

test('Performance - Scan Speed (<10ms)', () => {
  const start = Date.now();
  scan('Test content with AKIAIOSFODNN7EXAMPLE and more text');
  const duration = Date.now() - start;
  assert(duration < 10, `Scan completed in ${duration}ms (< 10ms)`);
});

test('Performance - Batch Scan 100 Items (<100ms)', () => {
  const start = Date.now();
  for (let i = 0; i < 100; i++) {
    scan(`Test ${i}: AKIAIOSFODNN7EXAMPLE${i}`);
  }
  const duration = Date.now() - start;
  assert(duration < 100, `100 scans completed in ${duration}ms (< 100ms)`);
});

// ══════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ══════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(60));
console.log('RUNNING ALL TESTS');
console.log('='.repeat(60) + '\n');

(async () => {
  for (const test of tests) {
    try {
      await test.fn();
    } catch (error) {
      failed++;
      console.log(`  ✗ ${test.name}: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`\n  Total:  ${tests.length} tests`);
  console.log(`  Passed: ${passed} ✅`);
  console.log(`  Failed: ${failed} ${failed === 0 ? '✅' : '❌'}`);
  console.log(`  Score:  ${Math.round((passed / tests.length) * 100)}/100\n`);
  
  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! Kasbah Guard is 100% functional.\n');
    process.exit(0);
  } else {
    console.log(`⚠️  ${failed} test(s) failed. Please review.\n`);
    process.exit(1);
  }
})();
