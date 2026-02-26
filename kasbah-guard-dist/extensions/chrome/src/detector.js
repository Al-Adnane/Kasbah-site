/**
 * Kasbah Detection Engine (JavaScript Port)
 * Ported from kasbah-kernel/src/policy.rs
 * Detects risky patterns in text (APIs keys, secrets, PII, etc.)
 */

function classify(text) {
  if (!text || text.length === 0) {
    return { risk: 0, decision: "ALLOW", reason: "Empty text", content_hash: hashContent(text) };
  }

  const t = text;
  const lower = t.toLowerCase();
  const len = Math.max(t.length, 1);

  // --- Shannon entropy ---
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

  // --- Ratios ---
  let special = 0, digits = 0, upper = 0;
  for (const ch of t) {
    if (/\d/.test(ch)) digits++;
    if (/[A-Z]/.test(ch)) upper++;
    if (!/[a-zA-Z0-9\s]/.test(ch)) special++;
  }
  const special_ratio = special / len;
  const digit_ratio = digits / len;
  const upper_ratio = upper / len;

  // --- Pattern detectors ---
  const has_private_key = t.includes("-----BEGIN") && t.includes("PRIVATE KEY-----");
  const has_openai_key = t.includes("sk-") && t.length >= 14;
  const has_api_key_word = lower.includes("api-key") || lower.includes("apikey") || lower.includes("api_key");
  const has_password_assign = lower.includes("password=") || lower.includes("password:") || lower.includes("pwd=");
  const has_jwt = t.includes("eyJ") && (t.match(/\./g) || []).length >= 2;
  const has_conn = lower.includes("mongodb://") || lower.includes("postgres://") ||
    lower.includes("mysql://") || lower.includes("redis://") || lower.includes("amqp://");
  const has_url = lower.includes("http://") || lower.includes("https://");

  // base64-ish
  let has_base64 = false;
  let run = 0;
  for (const ch of t) {
    const ok = /[a-zA-Z0-9+/=_-]/.test(ch);
    run = ok ? run + 1 : 0;
    if (run >= 60) {
      has_base64 = true;
      break;
    }
  }

  // suspicious ngrams
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

  // keyword count
  const keywords = ["secret", "password", "token", "api", "key", "auth", "credential", "private"];
  let keyword_hits = 0;
  for (const k of keywords) {
    keyword_hits += (lower.match(new RegExp(k, "g")) || []).length;
  }

  // --- Risk scoring ---
  let score = 0;
  const reasons = [];

  // Critical indicators
  if (has_private_key) {
    score += 90;
    reasons.push("private key detected");
  }
  if ((has_openai_key || has_api_key_word) && entropy > 3.5) {
    score += 50;
    reasons.push("high-entropy API key");
  }
  if (has_conn) {
    score += 45;
    reasons.push("database connection string");
  }
  if (has_jwt) {
    score += 40;
    reasons.push("JWT token");
  }
  if (has_password_assign) {
    score += 35;
    reasons.push("password assignment");
  }

  // High indicators
  if (has_base64 && entropy > 4.5) {
    score += 25;
    reasons.push("high-entropy base64 pattern");
  }
  if (ngram_score > 2) {
    score += 20;
    reasons.push("suspicious keywords");
  }
  if (keyword_hits > 3) {
    score += 15;
    reasons.push("multiple secret-related keywords");
  }

  // Medium indicators
  if (entropy > 5.0 && special_ratio > 0.2) {
    score += 10;
    reasons.push("high entropy + special characters");
  }
  if (upper_ratio > 0.4 && digit_ratio > 0.2) {
    score += 8;
    reasons.push("mixed case + numbers (password-like)");
  }

  // Normalize score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Decision logic
  let decision = "ALLOW";
  if (score >= 70) {
    decision = "DENY";
  } else if (score >= 40) {
    decision = "WARN";
  }

  return {
    risk: Math.floor(score),
    decision: decision,
    reason: reasons.length > 0 ? reasons.join("; ") : "Low risk",
    content_hash: hashContent(text)
  };
}

function hashContent(text) {
  // Simple hash for content verification (v1)
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

function getRisk(text) {
  return classify(text).risk;
}

function getDecision(text) {
  return classify(text).decision;
}

// Export for use in content.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { classify, getRisk, getDecision, hashContent };
}
