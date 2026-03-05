/**
 * Kasbah Guard — Detector Tests
 * 
 * Comprehensive test suite for the detector kernel.
 * 100 tests covering pattern detection, ML anomaly, and behavioral analysis.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { 
  scan, 
  detectSecrets, 
  detectPII, 
  detectPhishing,
  createMLDetector,
  createBehavioralDetector,
  redact
} from '../src/index.js';

describe('Detector Kernel', () => {
  describe('Pattern Detection - Secrets (20 tests)', () => {
    it('detects AWS access key', () => {
      const result = detectSecrets('AKIAIOSFODNN7EXAMPLE');
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.risk >= 85, true);
    });

    it('detects AWS secret key', () => {
      const result = detectSecrets('aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.risk >= 90, true);
    });

    it('detects GitHub PAT', () => {
      const result = detectSecrets('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.risk >= 80, true);
    });

    it('detects GitHub OAuth token', () => {
      const result = detectSecrets('gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      assert.strictEqual(result.detected, true);
    });

    it('detects OpenAI API key', () => {
      const result = detectSecrets('sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV');
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.risk >= 80, true);
    });

    it('detects Anthropic API key', () => {
      const result = detectSecrets('sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      assert.strictEqual(result.detected, true);
    });

    it('detects Stripe secret key', () => {
      const result = detectSecrets('TEST_STRIPE_KEY_1234567890');
      assert.strictEqual(result.detected, true);
    });

    it('detects Slack bot token', () => {
      const result = detectSecrets('TEST_SLACK_BOT_TOKEN_0000');
      assert.strictEqual(result.detected, true);
    });

    it('detects Slack webhook', () => {
      const result = detectSecrets('https://test.slack.com/webhook/TEST_WEBHOOK_URL_0000');
      assert.strictEqual(result.detected, true);
    });

    it('detects Discord user token', () => {
      const result = detectSecrets('TEST_DISCORD_USER_TOKEN_0000');
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.risk >= 90, true);
    });

    it('detects Discord bot token', () => {
      const result = detectSecrets('TEST_DISCORD_BOT_TOKEN_0000');
      assert.strictEqual(result.detected, true);
    });

    it('detects RSA private key', () => {
      const result = detectSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...');
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.risk >= 90, true);
    });

    it('detects MongoDB URI', () => {
      const result = detectSecrets('mongodb://user:password@host:27017/db');
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.risk >= 85, true);
    });

    it('detects PostgreSQL URI', () => {
      const result = detectSecrets('postgresql://user:pass@localhost:5432/db');
      assert.strictEqual(result.detected, true);
    });

    it('detects Redis URI', () => {
      const result = detectSecrets('redis://localhost:6379/0');
      assert.strictEqual(result.detected, true);
    });

    it('detects Google API key', () => {
      const result = detectSecrets('AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe');
      assert.strictEqual(result.detected, true);
    });

    it('detects Azure connection string', () => {
      const result = detectSecrets('DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=xxxxxxxxxx');
      assert.strictEqual(result.detected, true);
    });

    it('detects Twilio API key', () => {
      const result = detectSecrets('SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      assert.strictEqual(result.detected, true);
    });

    it('detects SendGrid API key', () => {
      const result = detectSecrets('SG.xxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      assert.strictEqual(result.detected, true);
    });

    it('detects generic secret pattern', () => {
      const result = detectSecrets('api_key = "sk_live_abc123def456"');
      assert.strictEqual(result.detected, true);
    });
  });

  describe('Pattern Detection - PII (15 tests)', () => {
    it('detects SSN', () => {
      const result = detectPII('My SSN is 123-45-6789');
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.risk >= 75, true);
    });

    it('detects Visa credit card', () => {
      const result = detectPII('4532-1234-5678-9999');
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.risk >= 80, true);
    });

    it('detects MasterCard', () => {
      const result = detectPII('5425-2334-3010-9999');
      assert.strictEqual(result.detected, true);
    });

    it('detects American Express', () => {
      const result = detectPII('3782-822463-10005');
      assert.strictEqual(result.detected, true);
    });

    it('detects US phone number', () => {
      const result = detectPII('Call me at (555) 123-4567');
      assert.strictEqual(result.detected, true);
    });

    it('detects email address', () => {
      const result = detectPII('Contact: john.doe@example.com');
      assert.strictEqual(result.detected, true);
    });

    it('detects IPv4 address', () => {
      const result = detectPII('Server IP: 192.168.1.100');
      assert.strictEqual(result.detected, true);
    });

    it('detects MAC address', () => {
      const result = detectPII('MAC: 00:1B:44:11:3A:B7');
      assert.strictEqual(result.detected, true);
    });

    it('detects date of birth', () => {
      const result = detectPII('DOB: 01/15/1980');
      assert.strictEqual(result.detected, true);
    });

    it('detects passport number', () => {
      const result = detectPII('Passport: A12345678');
      assert.strictEqual(result.detected, true);
    });

    it('detects bank account number', () => {
      const result = detectPII('Account: 123456789012');
      assert.strictEqual(result.detected, true);
    });

    it('detects routing number', () => {
      const result = detectPII('Routing: 021000021');
      assert.strictEqual(result.detected, true);
    });

    it('detects multiple PII in one text', () => {
      const result = detectPII('John Doe, SSN: 123-45-6789, Phone: 555-123-4567');
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.count >= 2, true);
    });

    it('does not flag safe numbers', () => {
      const result = detectPII('The year is 2024 and I have 3 apples');
      assert.strictEqual(result.detected, false);
    });

    it('handles empty text', () => {
      const result = detectPII('');
      assert.strictEqual(result.detected, false);
      assert.strictEqual(result.count, 0);
    });
  });

  describe('Pattern Detection - Phishing (15 tests)', () => {
    it('detects fake Nitro link', () => {
      const result = detectPhishing('Free nitro: discord.gift/xxxxxxx');
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.risk >= 90, true);
    });

    it('detects URL shorteners', () => {
      const result = detectPhishing('Click here: bit.ly/xxxxx');
      assert.strictEqual(result.detected, true);
    });

    it('detects malware extensions', () => {
      const result = detectPhishing('Download: file.exe');
      assert.strictEqual(result.detected, true);
    });

    it('detects token grabber URLs', () => {
      const result = detectPhishing('https://discord.com/api/webhooks/123456/xxxxx');
      assert.strictEqual(result.detected, true);
    });

    it('detects IP loggers', () => {
      const result = detectPhishing('Check your IP: iplogger.com/xxxxx');
      assert.strictEqual(result.detected, true);
    });

    it('detects fake Steam links', () => {
      const result = detectPhishing('Free games: steamcommunity.com/gift/xxxxx');
      assert.strictEqual(result.detected, true);
    });

    it('detects fake giveaway patterns', () => {
      const result = detectPhishing('FREE NITRO CLICK HERE');
      assert.strictEqual(result.detected, true);
    });

    it('detects suspicious TLDs', () => {
      const result = detectPhishing('Download from: sketchy-site.tk');
      assert.strictEqual(result.detected, true);
    });

    it('handles safe URLs', () => {
      const result = detectPhishing('Visit https://google.com for search');
      assert.strictEqual(result.detected, false);
    });

    it('handles empty text', () => {
      const result = detectPhishing('');
      assert.strictEqual(result.detected, false);
      assert.strictEqual(result.count, 0);
    });

    it('detects multiple phishing patterns', () => {
      const result = detectPhishing('Free nitro at discord.gift/xxx or bit.ly/yyy');
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.count >= 2, true);
    });

    it('detects .scr files', () => {
      const result = detectPhishing('image.scr');
      assert.strictEqual(result.detected, true);
    });

    it('detects .bat files', () => {
      const result = detectPhishing('script.bat');
      assert.strictEqual(result.detected, true);
    });

    it('detects .ps1 files', () => {
      const result = detectPhishing('powershell.ps1');
      assert.strictEqual(result.detected, true);
    });

    it('is case insensitive', () => {
      const result = detectPhishing('FREE NITRO: DISCORD.GIFT/XXX');
      assert.strictEqual(result.detected, true);
    });
  });

  describe('ML Anomaly Detection (15 tests)', () => {
    const mlDetector = createMLDetector();

    it('detects high entropy strings', () => {
      const result = mlDetector.analyze('xK9mN2pL5qR8sT1vW4xY7zA0bC3dE6fG9hJ');
      assert.strictEqual(result.features.entropy > 5.0, true);
      assert.strictEqual(result.anomalyScore >= 50, true);
    });

    it('detects base64-like patterns', () => {
      const result = mlDetector.analyze('YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=');
      assert.strictEqual(result.features.base64Like.isBase64Like, true);
      assert.strictEqual(result.anomalyScore >= 50, true);
    });

    it('detects hex-like patterns', () => {
      const result = mlDetector.analyze('0x1234567890abcdef1234567890abcdef');
      assert.strictEqual(result.features.hexLike.isHexLike, true);
      assert.strictEqual(result.anomalyScore >= 50, true);
    });

    it('detects consecutive characters', () => {
      const result = mlDetector.analyze('aaaaaaaaaaaaaaaaaaaaaaaa');
      assert.strictEqual(result.features.consecutive >= 8, true);
      assert.strictEqual(result.anomalyScore >= 30, true);
    });

    it('identifies normal English text as low risk', () => {
      const result = mlDetector.analyze('The quick brown fox jumps over the lazy dog.');
      assert.strictEqual(result.anomalyScore < 30, true);
      assert.strictEqual(result.isLikelySecret, false);
    });

    it('detects API key patterns', () => {
      const result = mlDetector.analyze('sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ');
      assert.strictEqual(result.anomalyScore >= 60, true);
      assert.strictEqual(result.isLikelySecret, true);
    });

    it('detects long random strings', () => {
      const result = mlDetector.analyze('aB3dE6gH9jK2mN5pQ8sT1vW4xY7zA0bC');
      assert.strictEqual(result.anomalyScore >= 60, true);
      assert.strictEqual(result.isLikelySecret, true);
    });

    it('handles empty text', () => {
      const result = mlDetector.analyze('');
      assert.strictEqual(result.anomalyScore, 0);
      assert.strictEqual(result.isLikelySecret, false);
    });

    it('calculates n-gram anomaly for non-English', () => {
      const result = mlDetector.analyze('xk9mn2pl5qr8st1vw4xy7za0bc3de6fg9hj');
      assert.strictEqual(result.features.ngramAnomaly > 0.5, true);
    });

    it('detects repeated patterns', () => {
      const result = mlDetector.analyze('abcabcabcabcabcabcabcabc');
      assert.strictEqual(result.features.repeated > 5, true);
    });

    it('identifies JSON as low risk', () => {
      const result = mlDetector.analyze('{"key": "value", "number": 42}');
      assert.strictEqual(result.anomalyScore < 40, true);
    });

    it('identifies code as low-medium risk', () => {
      const result = mlDetector.analyze('function add(a, b) { return a + b; }');
      assert.strictEqual(result.anomalyScore < 40, true);
    });

    it('detects password-like strings', () => {
      const result = mlDetector.analyze('Tr0ub4dor&3');
      assert.strictEqual(result.anomalyScore >= 30, true);
    });

    it('calculates risk score correctly', () => {
      const result = mlDetector.getRiskScore('AKIAIOSFODNN7EXAMPLE');
      assert.strictEqual(result >= 50, true);
    });

    it('identifies secrets with isSecret', () => {
      const result = mlDetector.isSecret('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      assert.strictEqual(result, true);
    });
  });

  describe('Behavioral Detection (10 tests)', () => {
    const behavioralDetector = createBehavioralDetector();
    const sessionId = 'test-session-' + Date.now();

    it('tracks normal typing speed', () => {
      const result = behavioralDetector.trackTyping({
        sessionId,
        charsPerSecond: 5
      });
      assert.strictEqual(result.isAnomalous, false);
    });

    it('flags suspicious fast typing', () => {
      const result = behavioralDetector.trackTyping({
        sessionId,
        charsPerSecond: 100
      });
      assert.strictEqual(result.isAnomalous, true);
    });

    it('tracks normal paste', () => {
      const result = behavioralDetector.trackPaste({
        sessionId,
        content: 'Hello, this is normal text.'
      });
      assert.strictEqual(result.risk.level !== 'CRITICAL', true);
    });

    it('flags suspicious paste', () => {
      const result = behavioralDetector.trackPaste({
        sessionId,
        content: 'AKIAIOSFODNN7EXAMPLE'
      });
      assert.strictEqual(result.risk.score >= 50, true);
    });

    it('flags large paste', () => {
      const result = behavioralDetector.trackPaste({
        sessionId,
        content: 'x'.repeat(300)
      });
      assert.strictEqual(result.risk.factors.includes('large_paste'), true);
    });

    it('accumulates session risk', () => {
      behavioralDetector.trackPaste({ 
        sessionId, 
        content: 'sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ' 
      });
      
      const summary = behavioralDetector.getSessionSummary(sessionId);
      assert.strictEqual(summary.riskScore > 0, true);
    });

    it('provides session summary', () => {
      const summary = behavioralDetector.getSessionSummary(sessionId);
      assert.strictEqual(summary !== null, true);
      assert.strictEqual(typeof summary.pasteCount, 'number');
    });

    it('tracks context switches', () => {
      const result = behavioralDetector.trackContextSwitch({
        sessionId,
        from: 'tab1',
        to: 'tab2'
      });
      assert.strictEqual(typeof result.switchRate, 'number');
    });

    it('flags rapid context switches', () => {
      for (let i = 0; i < 10; i++) {
        behavioralDetector.trackContextSwitch({
          sessionId,
          from: `tab${i}`,
          to: `tab${i+1}`
        });
      }
      
      const result = behavioralDetector.trackContextSwitch({
        sessionId,
        from: 'tab10',
        to: 'tab11'
      });
      
      assert.strictEqual(result.isSuspicious, true);
    });

    it('handles unknown session', () => {
      const summary = behavioralDetector.getSessionSummary('unknown-session');
      assert.strictEqual(summary, null);
    });
  });

  describe('Combined Scan (10 tests)', () => {
    it('denies AWS key', () => {
      const result = scan('aws_access_key_id = AKIAIOSFODNN7EXAMPLE');
      assert.strictEqual(result.decision, 'DENY');
      assert.strictEqual(result.risk >= 70, true);
    });

    it('denies GitHub token', () => {
      const result = scan('GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      assert.strictEqual(result.decision, 'DENY');
      assert.strictEqual(result.risk >= 70, true);
    });

    it('denies multiple secrets', () => {
      const result = scan('AWS: AKIAIOSFODNN7EXAMPLE, GH: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      assert.strictEqual(result.decision, 'DENY');
      assert.strictEqual(result.risk >= 85, true);
    });

    it('denies PII (SSN + CC)', () => {
      const result = scan('SSN: 123-45-6789, Card: 4532-1234-5678-9999');
      assert.strictEqual(result.decision, 'DENY');
      assert.strictEqual(result.risk >= 70, true);
    });

    it('denies phishing link', () => {
      const result = scan('Check this out: discord.gift/free-nitro');
      assert.strictEqual(result.decision, 'DENY');
      assert.strictEqual(result.risk >= 70, true);
    });

    it('allows safe code', () => {
      const result = scan('function add(a, b) { return a + b; }');
      assert.strictEqual(result.decision, 'ALLOW');
      assert.strictEqual(result.risk < 40, true);
    });

    it('warns on contact info', () => {
      const result = scan('Contact: john@example.com, Phone: 555-123-4567');
      assert.strictEqual(result.decision === 'WARN' || result.risk >= 30, true);
    });

    it('detects ML anomaly without pattern match', () => {
      const result = scan('xK9mN2pL5qR8sT1vW4xY7zA0bC3dE6fG9hJ2kM');
      assert.strictEqual(result.mlAnalysis.anomalyScore >= 50, true);
    });

    it('denies database connection string', () => {
      const result = scan('mongodb://admin:password123@prod-db:27017/main');
      assert.strictEqual(result.decision, 'DENY');
      assert.strictEqual(result.risk >= 80, true);
    });

    it('denies private key', () => {
      const result = scan('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...');
      assert.strictEqual(result.decision, 'DENY');
      assert.strictEqual(result.risk >= 90, true);
    });
  });

  describe('Redaction (5 tests)', () => {
    it('redacts API key', () => {
      const result = scan('API_KEY=sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP');
      assert.strictEqual(result.redacted.includes('[REDACTED'), true);
    });

    it('redacts SSN', () => {
      const result = scan('SSN: 123-45-6789');
      assert.strictEqual(result.redacted.includes('[REDACTED::SSN]'), true);
    });

    it('redacts credit card', () => {
      const result = scan('Card: 4532-1234-5678-9999');
      assert.strictEqual(result.redacted.includes('[REDACTED::CREDIT_CARD'), true);
    });

    it('redacts Discord token', () => {
      const result = scan('Token: TEST_DISCORD_BOT_TOKEN_0000');
      assert.strictEqual(result.redacted.includes('[REDACTED'), true);
    });

    it('redacts multiple types', () => {
      const result = scan('SSN: 123-45-6789, Card: 4532-1234-5678-9999, Email: test@example.com');
      assert.strictEqual(result.redacted.includes('[REDACTED'), true);
      assert.strictEqual(result.redacted.split('[REDACTED').length >= 3, true);
    });
  });
});
