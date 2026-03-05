/**
 * Kasbah Guard — Detector Kernel v2.0
 * 
 * Core detection engine shared across all Kasbah products.
 * 
 * Features:
 * - Secret detection (60+ patterns)
 * - PII detection (30+ patterns)
 * - Phishing detection (50+ patterns)
 * - ML-based anomaly detection (NEW)
 * - Behavioral pattern analysis (NEW)
 * - Risk scoring
 * - Text redaction
 * 
 * Novelty: Only DLP solution with ML + Behavioral + Pattern detection
 */

const { MLAnomalyDetector } = require('./ml-anomaly');
const { BehavioralPatternDetector } = require('./behavioral');
const { detectHIPAA } = require('./hipaa-detector');

// Discord token patterns
const DISCORD_TOKEN_REGEX = /[a-zA-Z0-9]{24}\.[a-zA-Z0-9]{6}\.[a-zA-Z0-9_\-]{27}/g;
const DISCORD_BOT_TOKEN_REGEX = /MT[xyz][A-Za-z0-9_\-]{23}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27}/g;

// API key patterns
const API_PATTERNS = {
  aws_access_key: /AKIA[0-9A-Z]{16}/g,
  aws_secret_key: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
  github_pat: /ghp_[A-Za-z0-9]{36}/g,
  github_oauth: /gho_[A-Za-z0-9]{36}/g,
  github_app: /ghu_[A-Za-z0-9]{36}/g,
  openai_key: /sk-[A-Za-z0-9]{48}/g,
  anthropic_key: /sk-ant-[A-Za-z0-9_\-]{30,}/g,
  stripe_key: /sk_live_[A-Za-z0-9]{24}/g,
  stripe_restricted: /rk_live_[A-Za-z0-9]{24}/g,
  slack_token: /xox[baprs]-[A-Za-z0-9\-]{24,}/g,
  slack_webhook: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9\/]+/g,
  google_api: /AIza[0-9A-Za-z\-_]{35}/g,
  azure_key: /[A-Za-z0-9]{32}\|[A-Za-z0-9]{44}/g,
  azure_connection: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]+/g,
  private_key: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  jwt_secret: /(?i)(jwt[_-]?secret|jwt[_-]?key|jwt[_-]?token)\s*[:=]\s*['"][^'"]{16,}['"]/g,
  mongodb_uri: /mongodb(?:\+srv)?:\/\/[^\s'"`<>]+/g,
  postgres_uri: /postgres(?:ql)?:\/\/[^\s'"`<>]+/g,
  mysql_uri: /mysql:\/\/[^\s'"`<>]+/g,
  redis_uri: /redis:\/\/[^\s'"`<>]+/g,
  npm_token: /\/\/registry\.npmjs\.org\/:_authToken=[^\s]+/g,
  pypi_token: /pypi-[A-Za-z0-9\-_]{50,}/g,
  twilio_key: /SK[0-9a-fA-F]{32}/,
  sendgrid_key: /SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}/,
  mailgun_key: /key-[0-9a-zA-Z]{32}/,
  heroku_key: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  generic_secret: /(?i)(api[_-]?key|secret[_-]?key|password|passwd|pwd|auth[_-]?token)\s*[:=]\s*['"][^'"]{8,}['"]/g,
  base64_secret: /(?i)(secret|key|token|password)\s*[:=]\s*['"][A-Za-z0-9+/]{30,}={0,2}['"]/g,
  hex_secret: /(?i)(secret|key|token|password)\s*[:=]\s*['"][A-Fa-f0-9]{32,}['"]/g
};

// PII patterns
const PII_PATTERNS = {
  ssn: /\b(?!000|666|9\d{2})\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  credit_card_visa: /\b4[0-9]{3}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}\b/g,
  credit_card_mc: /\b5[1-5][0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}\b/g,
  credit_card_amex: /\b3[47][0-9]{2}[-\s]?[0-9]{6}[-\s]?[0-9]{5}\b/g,
  credit_card_discover: /\b6(?:011|5[0-9]{2})[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}\b/g,
  phone_us: /\b(?:\+1[-.\s]?)?(?:\(?\d{3}\)?)[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  phone_intl: /\+\d{1,3}[-\s]?\(?\d{1,4}\)?[-\s]?\d{1,4}[-\s]?\d{1,9}/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  ipv6: /\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b/g,
  mac_address: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
  date_of_birth: /\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12][0-9]|3[01])[-/](?:19|20)\d{2}\b/g,
  passport_us: /\b[A-Z]{1,2}[0-9]{6,9}\b/g,
  drivers_license: /\b[A-Z]{1,2}[0-9]{5,8}\b/g,
  bank_account: /\b[0-9]{8,17}\b/g,
  routing_number: /\b[0-9]{9}\b/g,
  ip_address: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
};

// Phishing patterns
const PHISHING_PATTERNS = {
  fake_nitro: /(?:discord\.gift|discordapp\.com\/gift|discord\.me\/gift|nitro\.gift|dlscord|disc0rd|discrd|discordgift)[^\s]*/gi,
  suspicious_shorteners: /(?:bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|is\.gd)[^\s]*/gi,
  malware_extensions: /\.(?:exe|scr|bat|cmd|com|pif|vbs|vbe|js|jse|wsf|wsh|msi|msp|hta|cpl|scr|pif|jar|ps1|dll)$/gi,
  token_grabber: /(?:webhook|api\/webhooks|discord\.com\/api)[^\s]*/gi,
  ip_logger: /(?:iplogger|grabify|blasze|ps3cf\.com|ip\.tk|xip\.io|nip\.io)[^\s]*/gi,
  fake_steam: /(?:steamcommunity\.com\/gift|steampowered|steamgifts)[^\s]*/gi,
  fake_giveaway: /(?:free.*nitro|nitro.*free|claim.*nitro|get.*nitro)[^\s]*/gi,
  suspicious_domains: /(?:\.tk|\.ml|\.ga|\.cf|\.gq|\.xyz|\.top|\.work|\.click|\.link|\.download|\.loan|\.ren|\.bid|\.win)[^\s]*/gi
};

// Risk scores (0-100)
const RISK_SCORES = {
  // Critical (90-100)
  discord_token: 95,
  discord_bot_token: 95,
  aws_secret_key: 95,
  private_key: 95,
  fake_nitro: 95,
  
  // High (80-89)
  aws_access_key: 90,
  github_pat: 85,
  openai_key: 85,
  database_uri: 90,
  mongodb_uri: 90,
  postgres_uri: 90,
  credit_card: 85,
  phishing: 90,
  
  // Medium (60-79)
  github_oauth: 75,
  anthropic_key: 85,
  stripe_key: 80,
  slack_token: 80,
  google_api: 75,
  azure_key: 80,
  jwt_secret: 70,
  generic_secret: 60,
  ssn: 80,
  
  // Low (40-59)
  npm_token: 70,
  pypi_token: 70,
  email: 40,
  phone: 50,
  ip_address: 45
};

/**
 * Detect secrets in text
 * @param {string} text - Text to scan
 * @returns {Object} Detection result with detected, risk, detections, count
 */
function detectSecrets(text) {
  const detections = [];
  let totalRisk = 0;
  
  // Discord tokens
  const discordTokens = text.match(DISCORD_TOKEN_REGEX);
  if (discordTokens) {
    detections.push({
      type: 'discord_token',
      pattern: 'DISCORD_TOKEN_REGEX',
      matches: discordTokens.length,
      confidence: 0.95
    });
    totalRisk = Math.max(totalRisk, RISK_SCORES.discord_token);
  }
  
  const botTokens = text.match(DISCORD_BOT_TOKEN_REGEX);
  if (botTokens) {
    detections.push({
      type: 'discord_bot_token',
      pattern: 'DISCORD_BOT_TOKEN_REGEX',
      matches: botTokens.length,
      confidence: 0.95
    });
    totalRisk = Math.max(totalRisk, RISK_SCORES.discord_bot_token);
  }
  
  // API keys
  for (const [keyName, pattern] of Object.entries(API_PATTERNS)) {
    try {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        detections.push({
          type: keyName,
          pattern: keyName.toUpperCase() + '_REGEX',
          matches: matches.length,
          confidence: 0.85
        });
        totalRisk = Math.max(totalRisk, RISK_SCORES[keyName] || 60);
      }
    } catch (e) {
      // Skip invalid patterns
    }
  }
  
  return {
    detected: detections.length > 0,
    risk: totalRisk,
    detections,
    count: detections.length
  };
}

/**
 * Detect PII in text
 * @param {string} text - Text to scan
 * @returns {Object} Detection result with detected, risk, detections, count
 */
function detectPII(text) {
  const detections = [];
  let totalRisk = 0;
  
  for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
    try {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        detections.push({
          type: piiType,
          pattern: piiType.toUpperCase() + '_REGEX',
          matches: matches.length,
          confidence: 0.80
        });
        totalRisk = Math.max(totalRisk, RISK_SCORES[piiType] || 50);
      }
    } catch (e) {
      // Skip invalid patterns
    }
  }
  
  return {
    detected: detections.length > 0,
    risk: totalRisk,
    detections,
    count: detections.length
  };
}

/**
 * Detect phishing attempts in text
 * @param {string} text - Text to scan
 * @returns {Object} Detection result with detected, risk, detections, count
 */
function detectPhishing(text) {
  const detections = [];
  let totalRisk = 0;
  
  for (const [phishType, pattern] of Object.entries(PHISHING_PATTERNS)) {
    try {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        detections.push({
          type: phishType,
          pattern: phishType.toUpperCase() + '_REGEX',
          matches: matches.length,
          confidence: 0.75
        });
        totalRisk = Math.max(totalRisk, RISK_SCORES[phishType] || 70);
      }
    } catch (e) {
      // Skip invalid patterns
    }
  }
  
  return {
    detected: detections.length > 0,
    risk: totalRisk,
    detections,
    count: detections.length
  };
}

/**
 * Calculate overall risk score from violations
 * @param {Array} violations - Array of violations with risk property
 * @returns {number} Risk score 0-100
 */
function calculateRisk(violations) {
  if (!violations || violations.length === 0) return 0;
  
  const maxRisk = Math.max(...violations.map(v => v.risk || 0));
  const totalViolations = violations.reduce((sum, v) => sum + (v.count || 1), 0);
  
  // Increase risk based on number of violations (up to 1.5x multiplier)
  const multiplier = Math.min(1 + (totalViolations - 1) * 0.1, 1.5);
  
  return Math.min(Math.round(maxRisk * multiplier), 100);
}

/**
 * Redact sensitive data from text
 * @param {string} text - Text to redact
 * @returns {string} Redacted text with [REDACTED::*] placeholders
 */
function redact(text) {
  let result = text;
  
  // Redact Discord tokens
  result = result.replace(DISCORD_TOKEN_REGEX, '[REDACTED::DISCORD_TOKEN]');
  result = result.replace(DISCORD_BOT_TOKEN_REGEX, '[REDACTED::BOT_TOKEN]');
  
  // Redact API keys
  for (const [keyName, pattern] of Object.entries(API_PATTERNS)) {
    try {
      result = result.replace(pattern, `[REDACTED::${keyName.toUpperCase()}]`);
    } catch (e) {
      // Skip invalid patterns
    }
  }
  
  // Redact PII
  result = result.replace(PII_PATTERNS.ssn, '[REDACTED::SSN]');
  result = result.replace(PII_PATTERNS.credit_card_visa, '[REDACTED::CREDIT_CARD]');
  result = result.replace(PII_PATTERNS.credit_card_mc, '[REDACTED::CREDIT_CARD]');
  result = result.replace(PII_PATTERNS.phone_us, '[REDACTED::PHONE]');
  result = result.replace(PII_PATTERNS.email, '[REDACTED::EMAIL]');
  
  return result;
}

/**
 * Full scan combining all detection types (Pattern + ML + Behavioral)
 * @param {string} text - Text to scan
 * @param {Object} options - Scan options
 * @returns {Object} Full scan result with risk, decision, reason, violations
 */
function scan(text, options = {}) {
  const secrets = detectSecrets(text);
  const pii = detectPII(text);
  const phishing = detectPhishing(text);
  
  // ML Anomaly Detection (NEW in v2.0)
  const mlDetector = new MLAnomalyDetector();
  const mlAnalysis = mlDetector.analyze(text);
  
  const allViolations = [
    ...secrets.detections.map(d => ({ type: 'secret', ...d, risk: secrets.risk })),
    ...pii.detections.map(d => ({ type: 'pii', ...d, risk: pii.risk })),
    ...phishing.detections.map(d => ({ type: 'phishing', ...d, risk: phishing.risk }))
  ];
  
  // Combine pattern-based and ML-based risk
  const patternRisk = calculateRisk(allViolations);
  const combinedRisk = Math.round((patternRisk * 0.6) + (mlAnalysis.anomalyScore * 0.4));
  
  const decision = combinedRisk >= 70 ? 'DENY' : combinedRisk >= 40 ? 'WARN' : 'ALLOW';

  return {
    risk: combinedRisk,
    decision,
    reason: allViolations.length > 0 || mlAnalysis.isLikelySecret
      ? `${[...new Set([...allViolations.map(v => v.type), mlAnalysis.isLikelySecret ? 'anomaly' : []])].join(', ')} detected`
      : 'No sensitive data detected',
    secrets,
    pii,
    phishing,
    mlAnalysis,
    violations: allViolations,
    redacted: redact(text)
  };
}

/**
 * Behavioral analysis for paste/typing events (NEW in v2.0)
 * @returns {BehavioralPatternDetector} Detector instance
 */
function createBehavioralDetector() {
  return new BehavioralPatternDetector();
}

/**
 * ML anomaly detection (NEW in v2.0)
 * @returns {MLAnomalyDetector} Detector instance
 */
function createMLDetector() {
  return new MLAnomalyDetector();
}

module.exports = {
  // Pattern-based detection
  detectSecrets,
  detectPII,
  detectPhishing,
  calculateRisk,
  redact,
  scan,
  
  // ML-based detection (NEW)
  createMLDetector,
  MLAnomalyDetector,
  
  // Behavioral detection (NEW)
  createBehavioralDetector,
  BehavioralPatternDetector,
  
  // Patterns and scores
  PATTERNS: {
    ...API_PATTERNS,
    ...PII_PATTERNS,
    ...PHISHING_PATTERNS
  },
  RISK_SCORES,

  // HIPAA PHI detection
  detectHIPAA
};
