/**
 * Kasbah Guard — Request Risk Scanner
 * 
 * Lightweight request body risk scan for API layer.
 * Detects credential leaks in API request bodies.
 * NEVER blocks requests — informational only.
 */

const _API_RISK_RE = [
  /\bAKIA[0-9A-Z]{16}\b/,                                        // AWS key
  /\bghp_[A-Za-z0-9]{36,}\b/,                                    // GitHub PAT
  /\bsk-[A-Za-z0-9\-_]{20,}\b/,                                  // OpenAI key
  /\bBearer\s+[A-Za-z0-9_\-\.]{20,}\b/i,                        // Bearer token
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/,                  // Private key
  /\b(?:mongodb|postgres(?:ql)?|mysql|redis):\/\/[^\s"'<>]{10,}/, // Conn string
  /\b(?!000|666|9\d{2})\d{3}[-\s]\d{2}[-\s]\d{4}\b/,            // SSN
];

function scanRequestRisk(body) {
  if (!body || typeof body !== 'string' || body.length > 8192) return 0;
  let score = 0;
  for (let i = 0; i < _API_RISK_RE.length; i++) {
    if (_API_RISK_RE[i].test(body)) score += 40;
    if (score >= 100) break;
  }
  return Math.min(score, 100);
}

module.exports = scanRequestRisk;
