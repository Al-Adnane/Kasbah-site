'use strict';
// ═══════════════════════════════════════════════════════════════════
//  Kasbah Guard — Market Launch Stress Test  v3.6.0
//
//  Sections:
//    A: 20 adversarial real-world positive tests  (must DETECT ≥40)
//    B: 10 evasion attempts                       (still must DETECT)
//    C: 10 extended false-positive stress         (must ALLOW  <40)
//    D:  3 performance benchmarks                 (<500ms each)
//    E: 10 cross-product consistency              (JS ↔ Rust CLI)
//    F:  5 infrastructure integrity               (hashes, versions)
//
//  Target: 58/58 — MARKET LAUNCH READY
// ═══════════════════════════════════════════════════════════════════

const fs     = require('fs');
const vm     = require('vm');
const crypto = require('crypto');
const os     = require('os');
const path   = require('path');
const { execSync } = require('child_process');

const DETECTOR = '/Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/extensions/chrome/src/detector.js';
const CLI_BIN  = '/tmp/kasbah-cli-build/release/kasbah';

vm.runInThisContext(fs.readFileSync(DETECTOR, 'utf8'));

// ── Harness ─────────────────────────────────────────────────────────
let passed = 0, failed = 0, total = 0;
const failures = [];

function test(id, label, text, expectDetect, minRisk) {
  if (minRisk === undefined) minRisk = 40;
  total++;
  const result = classify(text);
  const detected = result.risk >= minRisk;
  const ok = detected === expectDetect;
  if (ok) {
    passed++;
    console.log('  \u2705 [' + id + '] ' + label + ' \u2014 risk=' + result.risk + ' ' + result.decision);
  } else {
    failed++;
    failures.push({ id, label,
      expected: expectDetect ? 'risk>=' + minRisk : 'risk<' + minRisk,
      got: 'risk=' + result.risk + ' ' + result.decision,
      reason: result.reason || '' });
    console.log('  \u274c [' + id + '] ' + label + ' \u2014 risk=' + result.risk + ' ' + result.decision + ' (' + (result.reason||'').slice(0,60) + ')');
  }
  return result;
}

function reset() {
  if (Array.isArray(global._pasteHistory)) global._pasteHistory.splice(0);
}

// ═══════════════════════════════════════════════════════════════════
// SECTION A — Adversarial Real-World Positives (20)
// ═══════════════════════════════════════════════════════════════════
console.log('\n\u2550\u2550\u2550 SECTION A: Adversarial Real-World Positive Tests \u2550\u2550\u2550\n');
reset();

test('A01', '.env file with multiple secrets', [
  'DB_HOST=localhost',
  'DB_USER=admin',
  'DB_PASSWORD=Sup3rS3cr3t!',
  'API_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'JWT_SECRET=my-ultra-secure-jwt-secret-key-32chars!',
  'STRIPE_SECRET=sk_live_51AbCdEfGhIjKlMnOpQrStUvWx12',
].join('\n'), true);

test('A02', 'Docker Compose environment with hardcoded password', [
  "version: '3.8'",
  'services:',
  '  db:',
  '    image: postgres',
  '    environment:',
  '      POSTGRES_PASSWORD: Passw0rd!DB2024',
  '      POSTGRES_USER: admin',
].join('\n'), true);

test('A03', 'Kubernetes Secret YAML', [
  'apiVersion: v1',
  'kind: Secret',
  'metadata:',
  '  name: db-secret',
  'type: Opaque',
  'data:',
  '  username: YWRtaW4=',
  '  password: UGFzc3dvcmQxMjM0NTY3ODkhQEA=',
].join('\n'), true);

test('A04', 'AWS credentials file (two profiles)', [
  '[default]',
  'aws_access_key_id = AKIAIOSFODNN7EXAMPLE',
  'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  '',
  '[production]',
  'aws_access_key_id = AKIAI44QH8DHBEXAMPLE',
  'aws_secret_access_key = je7MtGbClwBF/2Tk4fEx0ample/iJkE1ExAmPlEKY',
].join('\n'), true);

test('A05', '.npmrc with registry auth token', [
  '//registry.npmjs.org/:_authToken=npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  '//npm.pkg.github.com/:_authToken=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'registry=https://registry.npmjs.org/',
].join('\n'), true);

test('A06', 'Terraform tfvars with secrets', [
  'region      = "us-east-1"',
  'db_password = "Sup3rS3cr3tDBp4ss!"',
  'api_key     = "sk_live_51AbCdEf"',
  'count       = 3',
].join('\n'), true);

test('A07', 'GitHub Actions with hardcoded AWS keys', [
  'name: Deploy',
  'on: [push]',
  'jobs:',
  '  deploy:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: Configure AWS',
  '        env:',
  '          AWS_ACCESS_KEY_ID: AKIAIOSFODNN7EXAMPLE',
  '          AWS_SECRET_ACCESS_KEY: wJalrXUtnFEMI/K7MDENG/bPxRfiCY',
  '        run: aws s3 sync . s3://my-bucket',
].join('\n'), true);

test('A08', 'GCP service account JSON (private_key + client_secret)', [
  '{',
  '  "type": "service_account",',
  '  "private_key_id": "1234567890abcdef",',
  '  "private_key": "-----BEGIN RSA PRIVATE KEY-----',
  'MIIEpAIBAAKCAQEA1234ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEF',
  'GHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyz01234',
  '-----END RSA PRIVATE KEY-----",',
  '  "client_secret": "GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"',
  '}',
].join('\n'), true);

test('A09', 'OpenSSH private key (new format)', [
  '-----BEGIN OPENSSH PRIVATE KEY-----',
  'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW',
  'QyNTUxOQAAACBVhv1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm',
  'nopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDE',
  '-----END OPENSSH PRIVATE KEY-----',
].join('\n'), true);

test('A10', 'JWT Bearer token in Authorization header', [
  'GET /api/user/profile HTTP/1.1',
  'Host: api.internal.com',
  'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
].join('\n'), true);

test('A11', 'Bulk SSN CSV export', [
  'employee_id,name,ssn,salary',
  '1001,John Smith,123-45-6789,75000',
  '1002,Jane Doe,234-56-7890,82000',
  '1003,Bob Johnson,345-67-8901,91000',
  '1004,Alice Brown,456-78-9012,68000',
  '1005,Charlie Wilson,567-89-0123,77000',
].join('\n'), true);

test('A12', 'Credit card batch (4 cards, Luhn-valid)', [
  'Order ID | Card Number       | Expiry | CVV',
  '10001    | 4532015112830366  | 12/27  | 123',
  '10002    | 5425233430109903  | 08/26  | 456',
  '10003    | 374251018720955   | 03/28  | 789',
  '10004    | 6011111111111117  | 11/27  | 012',
].join('\n'), true);

test('A13', 'Stripe live key in Node.js code', [
  "const stripe = require('stripe');",
  "const client = stripe('sk_live_51HaXcJLkdIwHUdVTabcdefghijk12345678901234');",
  'module.exports = client;',
].join('\n'), true);

test('A14', 'Slack bot token in shell export', [
  '#!/bin/bash',
  'export SLACK_BOT_TOKEN="xoxb-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx"',
  'export SLACK_SIGNING_SECRET="abc123def456ghi789jkl012mno345pq"',
].join('\n'), true);

test('A15', 'Python code with hardcoded PostgreSQL password', [
  'import psycopg2',
  'conn = psycopg2.connect(',
  '    host="db.internal.corp.com",',
  '    database="production",',
  '    user="db_admin",',
  '    password="Pr0ducti0nS3cr3t!")',
].join('\n'), true);

test('A16', 'Node.js MongoDB connection with credentials', [
  "const mongoose = require('mongoose');",
  "mongoose.connect('mongodb://appuser:M0ng0p4ss@mongo.prod.internal:27017/appdb', {",
  '  useNewUrlParser: true',
  '});',
].join('\n'), true);

test('A17', 'Shell script with DB_PASS credential variable', [
  '#!/bin/bash',
  'DB_HOST="prod-db.internal"',
  'DB_USER="root"',
  'DB_PASS="R00tP4ssw0rd!"',
  'mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" production < backup.sql',
].join('\n'), true);

test('A18', 'SQL dump INSERT with bcrypt password hashes', [
  'INSERT INTO users (id, email, password, role) VALUES',
  "(1, 'admin@corp-internal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LrXXXXXXXXXXXXXX', 'admin'),",
  "(2, 'user@corp-internal.com', '$2b$12$eImiTXuWVxfM37uY4JANjQXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 'user');",
].join('\n'), true);

test('A19', 'PEM bundle (cert + private key)', [
  '-----BEGIN CERTIFICATE-----',
  'MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAlt',
  '-----END CERTIFICATE-----',
  '-----BEGIN RSA PRIVATE KEY-----',
  'MIIEpAIBAAKCAQEA1234ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHI',
  'JKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyz0123456789AB',
  'CDEFGHIJKLMNOPQRSTUVWXYZ012345678901234567890ABCDEFGHIJ0123456789',
  '-----END RSA PRIVATE KEY-----',
].join('\n'), true);

test('A20', 'BIP-39 seed phrase (12 words)', [
  'Please back up your wallet recovery phrase securely:',
  '',
  'abandon ability able about above absent absorb abstract absurd abuse access accident',
  '',
  'Do not share this with anyone. Store offline only.',
].join('\n'), true);


// ═══════════════════════════════════════════════════════════════════
// SECTION B — Evasion Attempts (10, should still DETECT)
// ═══════════════════════════════════════════════════════════════════
console.log('\n\u2550\u2550\u2550 SECTION B: Evasion Attempts (still must DETECT) \u2550\u2550\u2550\n');
reset();

test('B01', 'Base64-encoded credential JSON blob', [
  'config_data=eyJhd3NfYWNjZXNzX2tleV9pZCI6ICJBa2lhaW9zZm9kbm43ZXhhbXBsZSIsICJhd3Nfc2VjcmV0X2FjY2Vzc19rZXkiOiAid0phbHJYVXRuRkVNSS9LN01ERU5HL2JQeFJmaUNZZXhhbXBsZWtleSJ9',
].join('\n'), true);

test('B02', 'Space-separated SSN (alt separator)', [
  'Employee SSN: 123 45 6789',
  'Please handle with care per company policy.',
].join('\n'), true);

test('B03', 'Password= with leet-speak value', [
  'server_password = Tr0ub4dor&3xAmpl3!',
].join('\n'), true);

test('B04', 'Credentials inside block comment (DO NOT COMMIT)', [
  '/*',
  ' * TEMPORARY: hardcoded for local testing',
  ' * DB password: MyS3cr3tP4ssw0rd!',
  ' * DO NOT COMMIT — remove before PR',
  ' */',
  'const config = {};',
].join('\n'), true);

test('B05', 'AWS key split across two variable assignments', [
  'const ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";',
  'const SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";',
].join('\n'), true);

test('B06', 'All-caps SSN keyword', [
  'SOCIAL SECURITY NUMBER: 234-56-7890',
  'EMPLOYEE NAME: Jane Doe',
].join('\n'), true);

test('B07', 'PostgreSQL URI in YAML config', [
  '# database.yml',
  'production:',
  '  adapter: postgresql',
  '  url: postgresql://admin:Pr0d$3cr3t@prod-db.internal.com:5432/myapp_prod',
].join('\n'), true);

test('B08', 'GitHub PAT in git remote URL', [
  'git remote set-url origin https://ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@github.com/org/repo.git',
].join('\n'), true);

test('B09', 'Credit card in form-like context', [
  'Payment Details:',
  'Card Number: 4532 0151 1283 0366',
  'Expiration: 12/2027',
  'CVV: 123',
].join('\n'), true);

test('B10', 'RSA private key embedded in JSON string (real newlines)', [
  '{"deploy_config": {"tls_key": "-----BEGIN RSA PRIVATE KEY-----',
  'MIIEpAIBAAKCAQEA1234ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJK',
  'LMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz01234567890ABCDEFGHIJKLM',
  '-----END RSA PRIVATE KEY-----"}}',
].join('\n'), true);


// ═══════════════════════════════════════════════════════════════════
// SECTION C — Extended False-Positive Stress (10, must ALLOW)
// ═══════════════════════════════════════════════════════════════════
console.log('\n\u2550\u2550\u2550 SECTION C: Extended False-Positive Stress (must ALLOW) \u2550\u2550\u2550\n');
reset();

test('C01', 'Public RSA key only (not private)', [
  '-----BEGIN PUBLIC KEY-----',
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2a2rwplBQLzHPZe5TRSV',
  'yXGOEsRBfBWBMhNTRlsyKWFBzYrpqgT3xBs4cY8FyH6CiY/XrQu3pOE15H+5pw==',
  '-----END PUBLIC KEY-----',
].join('\n'), false);

test('C02', 'Placeholder documentation with no credential keywords', [
  'Replace PLACEHOLDER_VALUE with your credential from the dashboard.',
  '',
  'Access data at https://api.service.com/v1/data',
  '',
  'See the developer guide for configuration details.',
].join('\n'), false);

test('C03', 'Invalid/reserved format numbers (no SSN keyword)', [
  'Error codes 000-00-0000 and 666-00-1234 are reserved values.',
  'These sequences do not represent valid identification numbers.',
  'Check the specification before referencing these codes.',
].join('\n'), false);

test('C04', 'password as function parameter name (no value)', [
  'function validatePassword(password) {',
  '  if (!password || typeof password !== "string") return false;',
  '  return password.length >= 8 && /[A-Z]/.test(password) && /\\d/.test(password);',
  '}',
  'module.exports = { validatePassword };',
].join('\n'), false);

test('C05', 'DB schema with password_hash column (no values)', [
  'CREATE TABLE users (',
  '  id         SERIAL PRIMARY KEY,',
  '  email      VARCHAR(255) UNIQUE NOT NULL,',
  '  password_hash VARCHAR(60) NOT NULL,',
  '  created_at TIMESTAMP DEFAULT NOW()',
  ');',
].join('\n'), false);

test('C06', 'API docs with clearly labelled placeholder tokens', [
  '## Authentication',
  'All requests require a Bearer token:',
  '  Authorization: Bearer <your-access-token>',
  '',
  'Example response (tokens shown are NOT real):',
  '  { "token": "replace-with-your-actual-token" }',
].join('\n'), false);

test('C07', 'DB config with localhost only (no password)', [
  '[database]',
  'host = localhost',
  'port = 5432',
  'name = myapp_dev',
  'user = postgres',
  '# password managed via ~/.pgpass or PGPASSWORD env var',
].join('\n'), false);

test('C08', 'Git log with abbreviated commit ref (7-char)', [
  'commit a1b2c3d',
  'Author: John Doe <john@corp.com>',
  'Date:   Mon Feb 28 10:00:00 2026 +0000',
  '',
  '    Refactor authentication middleware to improve readability',
].join('\n'), false);

test('C09', 'Corporate password policy document (no actual passwords)', [
  'Password Policy — Version 2.1',
  '',
  'Requirements:',
  '- Minimum 12 characters',
  '- Must include uppercase, lowercase, numbers, and symbols',
  '- Passwords expire every 90 days',
  '- Cannot reuse any of the last 10 passwords',
  '- Account locks after 5 consecutive failed attempts',
].join('\n'), false);

test('C10', 'Luhn-invalid card-like number (checksum fails)', [
  'Test reference for QA: 4532015112830367',
  'Note: this number intentionally fails the Luhn checksum and is not a valid card.',
].join('\n'), false);


// ═══════════════════════════════════════════════════════════════════
// SECTION D — Performance Benchmarks (3)
// ═══════════════════════════════════════════════════════════════════
console.log('\n\u2550\u2550\u2550 SECTION D: Performance Benchmarks \u2550\u2550\u2550\n');
reset();
// JIT warm-up: force regex engine compilation before timing
for (var _w = 0; _w < 5; _w++) { classify('warm up classify call ' + _w); }
if (Array.isArray(global._pasteHistory)) global._pasteHistory.splice(0);

const FILLER = 'The quick brown fox jumps over the lazy dog. ';
const PERF_CASES = [[10*1024,' 10KB'],[50*1024,' 50KB'],[200*1024,'200KB']];

for (var di = 0; di < PERF_CASES.length; di++) {
  var pc = PERF_CASES[di];
  var size = pc[0], label = pc[1];
  total++;
  var text = FILLER.repeat(Math.ceil(size / FILLER.length)).slice(0, size);
  var t0 = Date.now();
  var pr = classify(text);
  var ms = Date.now() - t0;
  var ok = ms < 500;
  if (ok) {
    passed++;
    console.log('  \u2705 [PERF] classify(' + label + ' clean text) \u2014 ' + ms + 'ms, risk=' + pr.risk);
  } else {
    failed++;
    failures.push({ id: 'PERF'+label.trim(), label: 'Performance '+label, expected: '<500ms', got: ms+'ms' });
    console.log('  \u274c [PERF] classify(' + label + ' clean text) \u2014 ' + ms + 'ms (SLOW)');
  }
}


// ═══════════════════════════════════════════════════════════════════
// SECTION E — Cross-Product Consistency: JS ↔ Rust CLI (10)
// ═══════════════════════════════════════════════════════════════════
console.log('\n\u2550\u2550\u2550 SECTION E: Cross-Product Consistency (JS \u2194 Rust CLI) \u2550\u2550\u2550\n');
reset();

function cliScan(text) {
  var tmp = path.join(os.tmpdir(), 'kasbah-xprod-' + process.pid + '-' + Date.now() + '.txt');
  try {
    fs.writeFileSync(tmp, text, 'utf8');
    var out = execSync(CLI_BIN + ' scan --min-risk 0 "' + tmp + '"',
      { encoding: 'utf8', timeout: 8000, stdio: ['pipe','pipe','pipe'] });
    var rm = out.match(/risk[=:\s]+(\d+)/i);
    var risk = rm ? parseInt(rm[1], 10) : 0;
    var decision = /BLOCK/i.test(out) ? 'BLOCK' : /CHALLENGE/i.test(out) ? 'CHALLENGE' : /WARN/i.test(out) ? 'WARN' : 'ALLOW';
    return { risk: risk, decision: decision };
  } catch (e) {
    var errOut = (e.stdout||'') + (e.stderr||'');
    var em = errOut.match(/risk[=:\s]+(\d+)/i);
    var risk2 = em ? parseInt(em[1], 10) : 0;
    var decision2 = /BLOCK/i.test(errOut) ? 'BLOCK' : /CHALLENGE/i.test(errOut) ? 'CHALLENGE' : /WARN/i.test(errOut) ? 'WARN' : 'ALLOW';
    return { risk: risk2, decision: decision2 };
  } finally {
    try { fs.unlinkSync(tmp); } catch(_) {}
  }
}

var CROSS = [
  ['X01','SSN','123-45-6789 is my social security number, please protect it.'],
  ['X02','Private key','-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA1234ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE\n-----END RSA PRIVATE KEY-----'],
  ['X03','AWS key','aws_access_key_id = AKIAIOSFODNN7EXAMPLE\naws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCY'],
  ['X04','MongoDB URI','mongodb://appuser:M0ng0p4ss@mongo.prod.internal:27017/appdb'],
  ['X05','Credit card','4532015112830366'],
  ['X06','Clean text','Hello world. This is a normal meeting summary with no sensitive data.'],
  ['X07','UUID only','Request ID: 550e8400-e29b-41d4-a716-446655440000'],
  ['X08','Lorem ipsum','Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.'],
  ['X09','GitHub PAT','TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'],
  ['X10','SQL injection',"'; DROP TABLE users; -- comment"],
];

for (var xi = 0; xi < CROSS.length; xi++) {
  var xc = CROSS[xi];
  total++;
  var jsR  = classify(xc[2]);
  var rust = cliScan(xc[2]);
  var jsD  = jsR.risk  >= 40;
  var rustD = rust.risk >= 40;
  var consistent = jsD === rustD;
  if (consistent) {
    passed++;
    console.log('  \u2705 [' + xc[0] + '] ' + xc[1] + ' \u2014 JS:' + jsR.risk + '/' + jsR.decision + '  Rust:' + rust.risk + '/' + rust.decision);
  } else {
    failed++;
    failures.push({ id: xc[0], label: xc[1], expected: 'JS/Rust agree', got: 'JS:' + jsR.risk + '/' + jsR.decision + '  Rust:' + rust.risk + '/' + rust.decision });
    console.log('  \u26a0\ufe0f  [' + xc[0] + '] ' + xc[1] + ' \u2014 MISMATCH  JS:' + jsR.risk + '/' + jsR.decision + '  Rust:' + rust.risk + '/' + rust.decision);
  }
}


// ═══════════════════════════════════════════════════════════════════
// SECTION F — Infrastructure Integrity (5)
// ═══════════════════════════════════════════════════════════════════
console.log('\n\u2550\u2550\u2550 SECTION F: Infrastructure Integrity \u2550\u2550\u2550\n');

var COPIES = [
  '/Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/extensions/chrome/src/detector.js',
  '/Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/extensions/firefox/src/detector.js',
  '/Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/extensions/edge/src/detector.js',
  '/Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/extensions/opera/src/detector.js',
  '/Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/extensions/safari/Kasbah Guard/Kasbah Guard Extension/Resources/src/detector.js',
  '/Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/apps/desktop/src-tauri/extension/src/detector.js',
];

// F01: all 6 identical
total++;
var hashes = COPIES.map(function(p) {
  try { return crypto.createHash('md5').update(fs.readFileSync(p,'utf8')).digest('hex'); }
  catch(_) { return 'ERR'; }
});
var allSame = hashes.every(function(h){return h===hashes[0];}) && hashes[0]!=='ERR';
if (allSame) { passed++; console.log('  \u2705 [F01] All 6 detector.js copies identical \u2014 MD5 ' + hashes[0]); }
else { failed++; failures.push({id:'F01',label:'detector.js integrity',expected:'6 same hashes',got:[...new Set(hashes)].join(', ')}); console.log('  \u274c [F01] detector.js copies DIVERGED'); }

// F02: PATTERN_VERSION = 3.6.0
total++;
var det = fs.readFileSync(COPIES[0],'utf8');
var pv = (det.match(/PATTERN_VERSION\s*=\s*["']([^"']+)["']/) || [])[1];
if (pv === '3.6.0') { passed++; console.log('  \u2705 [F02] PATTERN_VERSION = "' + pv + '"'); }
else { failed++; failures.push({id:'F02',label:'PATTERN_VERSION',expected:'3.6.0',got:pv||'?'}); console.log('  \u274c [F02] PATTERN_VERSION = "' + pv + '"'); }

// F03: selfTest 23/23
total++;
var st = selfTest();
if (st.passed === 28 && st.total === 28) { passed++; console.log('  \u2705 [F03] selfTest() 28/28 \u2014 all invariants pass'); }
else { failed++; failures.push({id:'F03',label:'selfTest',expected:'28/28',got:st.passed+'/'+st.total}); console.log('  \u274c [F03] selfTest() ' + st.passed + '/' + st.total); }

// F04: SDK ENGINE_VERSION = 3.6.0
total++;
var sdk = fs.readFileSync('/Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/packages/sdk/src/index.ts','utf8');
var ev = (sdk.match(/ENGINE_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1];
if (ev === '3.6.0') { passed++; console.log('  \u2705 [F04] SDK ENGINE_VERSION = "' + ev + '"'); }
else { failed++; failures.push({id:'F04',label:'SDK ENGINE_VERSION',expected:'3.6.0',got:ev||'?'}); console.log('  \u274c [F04] SDK ENGINE_VERSION = "' + ev + '"'); }

// F05: VS Code EXPECTED_ENGINE = 3.6.0
total++;
var vsc = fs.readFileSync('/Users/mac/Desktop/KasbahFinal/Kasbah-site/kasbah-guard-dist/apps/vscode/src/extension.ts','utf8');
var ee = (vsc.match(/EXPECTED_ENGINE\s*=\s*['"]([^'"]+)['"]/) || [])[1];
if (ee === '3.6.0') { passed++; console.log('  \u2705 [F05] VS Code EXPECTED_ENGINE = "' + ee + '"'); }
else { failed++; failures.push({id:'F05',label:'VS Code EXPECTED_ENGINE',expected:'3.6.0',got:ee||'?'}); console.log('  \u274c [F05] VS Code EXPECTED_ENGINE = "' + ee + '"'); }


// ═══════════════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════════════
console.log('\n' + '\u2550'.repeat(67));

if (failures.length > 0) {
  console.log('\n\u26a0\ufe0f  FAILURES:\n');
  failures.forEach(function(f) {
    console.log('  [' + f.id + '] ' + f.label);
    console.log('       expected : ' + f.expected);
    console.log('       got      : ' + f.got);
    if (f.reason) console.log('       reason   : ' + f.reason.slice(0,80));
    console.log('');
  });
}

var pct = (passed / total * 100).toFixed(1);
if (failed === 0) {
  console.log('\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551  \ud83d\ude80  MARKET LAUNCH READY: ' + passed + '/' + total + ' passed (' + pct + '%)' + '                  \u2551');
  console.log('\u2551                                                                 \u2551');
  console.log('\u2551  \u2705  Section A  Real-world adversarial (20)  \u2014 20/20            \u2551');
  console.log('\u2551  \u2705  Section B  Evasion attempts      (10)  \u2014 10/10            \u2551');
  console.log('\u2551  \u2705  Section C  False-positive stress (10)  \u2014 10/10            \u2551');
  console.log('\u2551  \u2705  Section D  Performance (<500ms)   (3)  \u2014  3/3             \u2551');
  console.log('\u2551  \u2705  Section E  JS \u2194 Rust consistency (10)  \u2014 10/10            \u2551');
  console.log('\u2551  \u2705  Section F  Infrastructure        (5)  \u2014  5/5             \u2551');
  console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d');
} else {
  var fill = Math.round(passed/total*40);
  var bar = '\u2588'.repeat(fill) + '\u2591'.repeat(40-fill);
  console.log('\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551  \u26a0\ufe0f   LAUNCH BLOCKED: ' + passed + '/' + total + ' passed (' + pct + '%) \u2014 ' + failed + ' failure(s)         \u2551');
  console.log('\u2551  [' + bar + ']  \u2551');
  console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d');
}
