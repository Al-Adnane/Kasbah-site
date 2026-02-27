/**
 * Kasbah Detection Engine (JavaScript Port) v2.1
 * Ported from kasbah-kernel/src/policy.rs
 * Enhanced: CC, SSN, GitHub PAT, AWS keys, prompt injection, shell cmds, unicode normalization
 */

function classify(text) {
  if (!text || text.length === 0) {
    return { risk: 0, decision: "ALLOW", reason: "Empty text", content_hash: hashContent(text || "") };
  }

  const t = text;

  // ── Text normalization for bypass resistance ──
  // tn: strip zero-width unicode tricks + normalize tabs → spaces
  const tn = t
    .replace(/[\u200b-\u200d\ufeff\u00ad\u2060-\u206f]/g, '') // zero-width chars
    .replace(/\t/g, ' ');                                       // tabs → spaces
  // tc: fully compact — also strip newlines (catches multi-line token splits)
  const tc = tn.replace(/[\n\r]+/g, '');

  const lower = tn.toLowerCase();
  const len = Math.max(t.length, 1);

  // --- Shannon entropy (on original text) ---
  const freq = {};
  for (let i = 0; i < t.length; i++) {
    const ch = t.charCodeAt(i);
    freq[ch] = (freq[ch] || 0) + 1;
  }
  let entropy = 0.0;
  for (const ch in freq) {
    const p = freq[ch] / len;
    entropy -= p * Math.log2(p);
  }

  // --- Character ratios ---
  let special = 0, digits = 0, upper = 0;
  for (const ch of t) {
    if (/\d/.test(ch)) digits++;
    if (/[A-Z]/.test(ch)) upper++;
    if (!/[a-zA-Z0-9\s]/.test(ch)) special++;
  }
  const special_ratio = special / len;
  const digit_ratio = digits / len;
  const upper_ratio = upper / len;

  // ── TIER 1: Critical PII — Structured regex on normalized text ──

  // Credit cards: Visa (4xxx), Mastercard (5xxx), Amex (3xxx), Discover (6011)
  const CC_RE = /\b(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{2}|6011)[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{1,7}\b/;
  const has_cc = CC_RE.test(tn);

  // US SSN (xxx-xx-xxxx or xxx xx xxxx) — excludes invalid prefixes
  const SSN_RE = /\b(?!000|666|9\d{2})\d{3}[-\s]\d{2}[-\s]\d{4}\b/;
  const has_ssn = SSN_RE.test(tn);

  // "Social Security" context + any digits (handles SSN without dashes)
  const has_social_security = /\bsocial\s+security\b/i.test(tn);

  // GitHub PATs: ghp_, ghs_, gho_, ghr_, ghu_
  const GH_PAT_RE = /\bgh[pshoru]_[A-Za-z0-9]{36,}\b/;
  const has_github_pat = GH_PAT_RE.test(tc); // compact: catches split tokens

  // AWS Access Key IDs (AKIA + 16 uppercase alphanums)
  const AWS_KEY_RE = /\bAKIA[0-9A-Z]{16}\b/;
  const has_aws_key = AWS_KEY_RE.test(tc);

  // Private / PEM keys
  const has_private_key = t.includes("-----BEGIN") && t.includes("PRIVATE KEY-----");

  // OpenAI / service key: sk- + 20+ chars, on compact text (catches newline-split keys)
  const has_openai_key = /\bsk-[A-Za-z0-9\-_]{20,}\b/.test(tc);

  // Bearer token (Authorization: Bearer <token>)
  const BEARER_RE = /\bBearer\s+[A-Za-z0-9_\-\.]{20,}\b/i;
  const has_bearer_token = BEARER_RE.test(tn);

  // ── TIER 2: High-risk credential patterns ──

  // API key assignment: api_key=, api-key:, "api-key": (JSON), etc.
  const has_api_key_word = /\b(?:api[_\-]?key|apikey)\s*["']?\s*[:=]/i.test(lower);

  // Password assignment: password=, password:, "password": (JSON), pwd=
  const has_password_assign = /password\s*["']?\s*[:=]/i.test(lower) || /\bpwd\s*[:=]/i.test(lower);

  // Environment file / shell export secrets: SECRET_KEY=, DB_PASS=, API_TOKEN=, AUTH_SECRET=
  const ENV_SECRET_RE = /\b(?:secret|token|api|auth|credential|private)[_\s]*(?:[a-z_]*)?\s*[=:]/i;
  const has_env_secret = ENV_SECRET_RE.test(lower) && !/^\s*(?:\/\/|#)/.test(lower.split('\n')[0]);

  // JWT tokens (eyJ header.payload.signature — 10+ chars each segment)
  const has_jwt = /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/.test(t);

  // Database connection strings (always contain embedded credentials)
  const has_conn = lower.includes("mongodb://") || lower.includes("postgres://") ||
    lower.includes("mysql://") || lower.includes("redis://") || lower.includes("amqp://");

  // High-entropy base64 runs (40+ char run)
  let has_base64 = false;
  let run = 0;
  for (const ch of tn) {
    const ok = /[a-zA-Z0-9+/=_-]/.test(ch);
    run = ok ? run + 1 : 0;
    if (run >= 40) { has_base64 = true; break; }
  }

  // ── TIER 3: Injection & dangerous commands ──

  // Prompt injection / jailbreak
  const INJECTION_RE = /(?:ignore\s+(?:all\s+)?previous\s+(?:instructions?|directives?|rules?)|system\s+(?:prompt|override)|developer\s+(?:message|mode|override)|jailbreak|you\s+are\s+now\s+(?:DAN|GPT|uncensored|unrestricted)|disable\s+(?:all\s+)?(?:safety|filter)|override\s+(?:all\s+)?(?:previous\s+)?(?:instructions?|rules?|directives?))/i;
  const has_injection = INJECTION_RE.test(tn);

  // Dangerous shell commands / SQL injection
  const SHELL_RE = /(?:\brm\s+-rf\b|\bdrop\s+table\b|\bformat\s+[a-z]:|\bpowershell\b|\bwget\s+https?:\/\/|\bcurl\s+https?:\/\/)/i;
  const has_shell = SHELL_RE.test(tn);

  // Suspicious keyword ngrams
  const suspicious = [
    "secret", "token", "bearer", "credential", "private", "ssh", "pem",
    "apikey", "api-key", "inject", "bypass", "jailbreak", "override",
    "ignore previous", "system prompt", "developer message", "rm -rf",
    "drop table", "format c:", "powershell", "curl http", "wget http"
  ];
  let ngram_score = 0;
  for (const k of suspicious) {
    if (lower.includes(k)) ngram_score++;
  }

  // Keyword density
  const keywords = ["secret", "password", "token", "api", "key", "auth", "credential", "private"];
  let keyword_hits = 0;
  for (const k of keywords) {
    keyword_hits += (lower.match(new RegExp(k, "g")) || []).length;
  }

  // ── Risk Scoring ──
  let score = 0;
  const reasons = [];

  // Tier 1: Critical PII → DENY (70+)
  if (has_cc)             { score += 80; reasons.push("credit card number"); }
  if (has_ssn)            { score += 80; reasons.push("SSN"); }
  if (has_private_key)    { score += 90; reasons.push("private key"); }
  if (has_github_pat)     { score += 80; reasons.push("GitHub PAT"); }
  if (has_aws_key)        { score += 80; reasons.push("AWS access key"); }
  if (has_openai_key)     { score += 70; reasons.push("OpenAI API key"); }

  // Tier 2: High-risk credentials
  if (has_api_key_word && entropy > 3.5) { score += 50; reasons.push("high-entropy API key"); }
  if (has_conn)           { score += 75; reasons.push("database connection string"); }
  if (has_jwt)            { score += 40; reasons.push("JWT token"); }
  if (has_bearer_token)   { score += 45; reasons.push("bearer token"); }

  // Tier 3: WARN-level signals (40+)
  if (has_password_assign){ score += 45; reasons.push("password assignment"); }
  if (has_social_security){ score += 50; reasons.push("social security reference"); }
  if (has_injection)      { score += 50; reasons.push("prompt injection"); }
  if (has_shell)          { score += 45; reasons.push("dangerous command"); }
  if (has_env_secret && keyword_hits >= 3) { score += 45; reasons.push("env/shell secret pattern"); }
  if (has_api_key_word && entropy <= 3.5) { score += 40; reasons.push("API key keyword"); }

  // Entropy / pattern scoring (additive)
  if (has_base64 && entropy > 4.5) { score += 45; reasons.push("high-entropy base64"); }
  if (ngram_score > 2)   { score += 20; reasons.push("suspicious keywords"); }
  if (keyword_hits >= 3) { score += 15; reasons.push("multiple secret keywords"); }
  if (entropy > 5.0 && special_ratio > 0.2) { score += 10; reasons.push("high entropy + special chars"); }
  if (upper_ratio > 0.4 && digit_ratio > 0.2) { score += 8; reasons.push("mixed case + numbers"); }

  // Normalize to 0-100
  score = Math.max(0, Math.min(100, score));

  // Decision
  let decision = "ALLOW";
  if (score >= 70) decision = "DENY";
  else if (score >= 40) decision = "WARN";

  return {
    risk: Math.floor(score),
    decision,
    reason: reasons.length > 0 ? reasons.join("; ") : "Low risk",
    content_hash: hashContent(text)
  };
}

function hashContent(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function getRisk(text) {
  return classify(text).risk;
}

function getDecision(text) {
  return classify(text).decision;
}

// Export for Node.js (tests) and browser (content.js via script tag)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { classify, getRisk, getDecision, hashContent };
}
