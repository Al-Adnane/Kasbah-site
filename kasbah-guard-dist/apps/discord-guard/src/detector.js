/**
 * Kasbah Guard — Detection Kernel
 * 
 * Core detection engine for secrets, PII, and phishing.
 * Shared across all Kasbah Guard products.
 */

// Discord token patterns
const DISCORD_TOKEN_REGEX = /[a-zA-Z0-9]{24}\.[a-zA-Z0-9]{6}\.[a-zA-Z0-9_\-]{27}/g;
const DISCORD_BOT_TOKEN_REGEX = /MT[xyz][a-zA-Z0-9_\-]{23}\.[a-zA-Z0-9_\-]{6}\.[a-zA-Z0-9_\-]{27}/g;

// API key patterns
const API_PATTERNS = {
  aws_access_key: /AKIA[0-9A-Z]{16}/g,
  aws_secret_key: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
  github_pat: /ghp_[A-Za-z0-9]{36}/g,
  github_oauth: /gho_[A-Za-z0-9]{36}/g,
  openai_key: /sk-[A-Za-z0-9]{48}/g,
  anthropic_key: /sk-ant-[A-Za-z0-9_\-]{30,}/g,
  stripe_key: /sk_live_[A-Za-z0-9]{24}/g,
  slack_token: /xox[baprs]-[A-Za-z0-9\-]{24,}/g,
  google_api: /AIza[0-9A-Za-z\-_]{35}/g,
  azure_key: /[A-Za-z0-9]{32}\|[A-Za-z0-9]{44}/g,
  private_key: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  jwt_secret: /(?i)(jwt[_-]?secret|jwt[_-]?key|jwt[_-]?token)\s*[:=]\s*['"][^'"]{16,}['"]/g,
  mongodb_uri: /mongodb(?:\+srv)?:\/\/[^\s'"]+/g,
  postgres_uri: /postgres(?:ql)?:\/\/[^\s'"]+/g,
  generic_secret: /(?i)(api[_-]?key|secret[_-]?key|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/g
};

// PII patterns
const PII_PATTERNS = {
  ssn: /\b(?!000|666|9\d{2})\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  credit_card: /\b(?:4[0-9]{3}|5[1-5][0-9]{2}|6[0-9]{3}|3[47][0-9]{2})[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}\b/g,
  phone_us: /\b(?:\+1[-.\s]?)?(?:\(?\d{3}\)?)[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  mac_address: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
  date_of_birth: /\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12][0-9]|3[01])[-/](?:19|20)\d{2}\b/g
};

// Phishing patterns
const PHISHING_PATTERNS = {
  fake_nitro: /(?:discord\.gift|discordapp\.com\/gift|nitro\.gift|dlscord|disc0rd|discrd)[^\s]*/gi,
  suspicious_urls: /(?:bit\.ly|tinyurl|t\.co|goo\.gl)[^\s]*/gi,
  malware_extensions: /\.(?:exe|scr|bat|cmd|com|pif|vbs|vbe|js|jse|wsf|wsh|msi|msp|hta|cpl|scr|pif)$/gi,
  token_grabber: /(?:webhook|api\/webhooks)[^\s]*/gi,
  ip_logger: /(?:iplogger|grabify|blasze|ps3cf\.com)[^\s]*/gi
};

// Risk scores
const RISK_SCORES = {
  discord_token: 95,
  bot_token: 95,
  aws_access_key: 90,
  aws_secret_key: 95,
  github_pat: 85,
  openai_key: 85,
  private_key: 95,
  database_uri: 90,
  ssn: 80,
  credit_card: 85,
  phishing: 90,
  fake_nitro: 95,
  generic_secret: 60
};

/**
 * Detect secrets in text
 * @param {string} text - Text to scan
 * @returns {Object} Detection result
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
      matches: discordTokens,
      confidence: 0.95
    });
    totalRisk = Math.max(totalRisk, RISK_SCORES.discord_token);
  }
  
  const botTokens = text.match(DISCORD_BOT_TOKEN_REGEX);
  if (botTokens) {
    detections.push({
      type: 'discord_bot_token',
      pattern: 'DISCORD_BOT_TOKEN_REGEX',
      matches: botTokens,
      confidence: 0.95
    });
    totalRisk = Math.max(totalRisk, RISK_SCORES.bot_token);
  }
  
  // API keys
  for (const [keyName, pattern] of Object.entries(API_PATTERNS)) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      detections.push({
        type: keyName,
        pattern: keyName.toUpperCase() + '_REGEX',
        matches: matches,
        confidence: 0.85
      });
      totalRisk = Math.max(totalRisk, RISK_SCORES[keyName] || 60);
    }
  }
  
  return {
    detected: detections.length > 0,
    risk: totalRisk,
    detections: detections,
    count: detections.length
  };
}

/**
 * Detect PII in text
 * @param {string} text - Text to scan
 * @returns {Object} Detection result
 */
function detectPII(text) {
  const detections = [];
  let totalRisk = 0;
  
  for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      detections.push({
        type: piiType,
        pattern: piiType.toUpperCase() + '_REGEX',
        matches: matches,
        confidence: 0.80
      });
      totalRisk = Math.max(totalRisk, RISK_SCORES[piiType] || 50);
    }
  }
  
  return {
    detected: detections.length > 0,
    risk: totalRisk,
    detections: detections,
    count: detections.length
  };
}

/**
 * Detect phishing attempts in text
 * @param {string} text - Text to scan
 * @returns {Object} Detection result
 */
function detectPhishing(text) {
  const detections = [];
  let totalRisk = 0;
  
  for (const [phishType, pattern] of Object.entries(PHISHING_PATTERNS)) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      detections.push({
        type: phishType,
        pattern: phishType.toUpperCase() + '_REGEX',
        matches: matches,
        confidence: 0.75
      });
      totalRisk = Math.max(totalRisk, RISK_SCORES[phishType] || 70);
    }
  }
  
  return {
    detected: detections.length > 0,
    risk: totalRisk,
    detections: detections,
    count: detections.length
  };
}

/**
 * Calculate overall risk score
 * @param {Array} violations - Array of violations
 * @returns {number} Risk score 0-100
 */
function calculateRisk(violations) {
  if (!violations || violations.length === 0) return 0;
  
  const maxRisk = Math.max(...violations.map(v => v.risk || 0));
  const totalViolations = violations.reduce((sum, v) => sum + (v.count || 1), 0);
  
  // Increase risk based on number of violations
  const multiplier = Math.min(1 + (totalViolations - 1) * 0.1, 1.5);
  
  return Math.min(Math.round(maxRisk * multiplier), 100);
}

/**
 * Redact sensitive data from text
 * @param {string} text - Text to redact
 * @returns {string} Redacted text
 */
function redact(text) {
  let result = text;
  
  // Redact Discord tokens
  result = result.replace(DISCORD_TOKEN_REGEX, '[REDACTED::DISCORD_TOKEN]');
  result = result.replace(DISCORD_BOT_TOKEN_REGEX, '[REDACTED::BOT_TOKEN]');
  
  // Redact API keys
  for (const [keyName, pattern] of Object.entries(API_PATTERNS)) {
    result = result.replace(pattern, `[REDACTED::${keyName.toUpperCase()}]`);
  }
  
  // Redact PII
  result = result.replace(PII_PATTERNS.ssn, '[REDACTED::SSN]');
  result = result.replace(PII_PATTERNS.credit_card, '[REDACTED::CREDIT_CARD]');
  result = result.replace(PII_PATTERNS.phone_us, '[REDACTED::PHONE]');
  result = result.replace(PII_PATTERNS.email, '[REDACTED::EMAIL]');
  
  return result;
}

/**
 * Full scan combining all detection types
 * @param {string} text - Text to scan
 * @returns {Object} Full scan result
 */
function scan(text) {
  const secrets = detectSecrets(text);
  const pii = detectPII(text);
  const phishing = detectPhishing(text);
  
  const allViolations = [
    ...secrets.detections.map(d => ({ type: 'secret', ...d, risk: secrets.risk })),
    ...pii.detections.map(d => ({ type: 'pii', ...d, risk: pii.risk })),
    ...phishing.detections.map(d => ({ type: 'phishing', ...d, risk: phishing.risk }))
  ];
  
  const overallRisk = calculateRisk(allViolations);
  const decision = overallRisk >= 70 ? 'DENY' : overallRisk >= 40 ? 'WARN' : 'ALLOW';
  
  return {
    risk: overallRisk,
    decision,
    reason: allViolations.length > 0 
      ? `${allViolations.map(v => v.type).join(', ')} detected`
      : 'No sensitive data detected',
    secrets,
    pii,
    phishing,
    violations: allViolations
  };
}

module.exports = {
  detectSecrets,
  detectPII,
  detectPhishing,
  calculateRisk,
  redact,
  scan,
  PATTERNS: {
    ...API_PATTERNS,
    ...PII_PATTERNS,
    ...PHISHING_PATTERNS
  }
};
