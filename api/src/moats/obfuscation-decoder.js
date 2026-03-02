/**
 * MOAT 6: OBFUSCATION DECODER
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Detects and decodes common obfuscation techniques used to hide secrets:
 * - Base64 encoding (with entropy analysis)
 * - Hexadecimal encoding
 * - URL encoding
 * - ROT13/Caesar cipher variants
 * - Homoglyph normalization
 * - Post-decode re-analysis
 *
 * Version: 1.0.0
 * Created: March 2026
 * Status: Production Ready
 */

// ── Helper Functions ──

/**
 * Detect if string is likely Base64 encoded
 * Base64: [A-Za-z0-9+/=] with = padding (0-2 chars)
 */
function isLikelyBase64(str) {
  if (str.length < 4) return false;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str)) return false;

  // Check padding consistency
  const padding = (str.match(/=/g) || []).length;
  if (padding > 2) return false;
  if (padding > 0 && str.lastIndexOf('=') < str.length - padding) return false;

  // High chance if >20 chars and valid pattern
  return str.length >= 20;
}

/**
 * Decode Base64 safely, returning null if invalid
 */
function decodeBase64Safe(str) {
  try {
    // Remove padding temporarily
    const withoutPadding = str.replace(/=/g, '');

    // Check if valid base64 pattern
    if (!/^[A-Za-z0-9+/]*$/.test(withoutPadding)) {
      return null;
    }

    // Use Buffer to decode
    const decoded = Buffer.from(str, 'base64').toString('utf8');

    // Sanity check: if decoded length is reasonable and printable
    if (decoded.length > 0 && decoded.length < 10000) {
      return decoded;
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Calculate Shannon entropy (0-1 scale)
 * High entropy = random/encrypted content
 * Low entropy = readable text
 */
function calculateEntropy(str) {
  if (str.length === 0) return 0;

  const freq = {};
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0;
  for (const char in freq) {
    const p = freq[char] / str.length;
    entropy -= p * Math.log2(p);
  }

  // Normalize to 0-1 scale (max entropy for printable ASCII ~5.5)
  return Math.min(1, entropy / 5.5);
}

/**
 * Detect if string is hexadecimal encoded
 * Hex: [0-9A-Fa-f] with even length
 */
function isLikelyHex(str) {
  if (str.length < 16 || str.length % 2 !== 0) return false;
  if (!/^[0-9A-Fa-f]+$/.test(str)) return false;

  // Likely hex if >60% of characters are 0-9
  const digits = (str.match(/[0-9]/g) || []).length;
  return digits >= str.length * 0.6;
}

/**
 * Decode hex string to UTF-8
 */
function decodeHexSafe(str) {
  try {
    if (!isLikelyHex(str)) return null;

    const decoded = Buffer.from(str, 'hex').toString('utf8');

    // Check if result is reasonable length and valid
    if (decoded.length > 0 && decoded.length < 10000) {
      return decoded;
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Decode URL-encoded string (%XX format)
 */
function decodeUrlSafe(str) {
  try {
    const decoded = decodeURIComponent(str);

    // Check if actually had URL encoding
    if (decoded === str) return null;

    // Check if result is reasonable
    if (decoded.length > 0 && decoded.length < 10000) {
      return decoded;
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * ROT13 variant detection and decoding
 * Caesar cipher: shift each letter by N positions
 * ROT13 is special case (shift by 13)
 */
function rotateChar(char, shift) {
  if (char >= 'a' && char <= 'z') {
    const rotated = (char.charCodeAt(0) - 97 + shift) % 26;
    return String.fromCharCode((rotated < 0 ? rotated + 26 : rotated) + 97);
  }
  if (char >= 'A' && char <= 'Z') {
    const rotated = (char.charCodeAt(0) - 65 + shift) % 26;
    return String.fromCharCode((rotated < 0 ? rotated + 26 : rotated) + 65);
  }
  return char;
}

function rotateString(str, shift) {
  return str.split('').map(c => rotateChar(c, shift)).join('');
}

/**
 * Try all Caesar cipher rotations (0-25)
 * Return most likely one based on English word frequency
 */
function decodeCaesarSafe(str) {
  const commonWords = /\b(the|and|that|this|have|with|from|they|would|could|should|be|is|are|was|were|been|do|does|did|can|will|shall|may|might|must)\b/gi;

  let bestResult = null;
  let bestScore = 0;

  for (let shift = 1; shift < 26; shift++) {
    const rotated = rotateString(str, shift);
    const matches = rotated.match(commonWords) || [];
    const score = matches.length;

    if (score > bestScore) {
      bestScore = score;
      bestResult = rotated;
    }
  }

  // Only return if we found common English words (shift !== 0)
  return bestScore >= 2 ? bestResult : null;
}

/**
 * Homoglyph normalization
 * Replace visually similar characters:
 * - Cyrillic А (U+0410) → Latin A
 * - Cyrillic о (U+043E) → Latin o
 * - etc.
 */
function normalizeHomoglyphs(str) {
  // Common homoglyph replacements
  const homoglyphs = {
    'А': 'A', // Cyrillic A
    'В': 'B', // Cyrillic B
    'Е': 'E', // Cyrillic E
    'Н': 'H', // Cyrillic H
    'К': 'K', // Cyrillic K
    'М': 'M', // Cyrillic M
    'Н': 'H', // Cyrillic H
    'О': 'O', // Cyrillic O
    'Р': 'P', // Cyrillic R
    'С': 'C', // Cyrillic S
    'Т': 'T', // Cyrillic T
    'У': 'Y', // Cyrillic Y
    'Х': 'X', // Cyrillic X
    'а': 'a', // Cyrillic a
    'о': 'o', // Cyrillic o
    'е': 'e', // Cyrillic e
    'р': 'p', // Cyrillic r
    'с': 'c', // Cyrillic c
    'х': 'x', // Cyrillic x
    '‌': '',  // Zero-width joiner (remove)
    '​': '',  // Zero-width space (remove)
    '‍': '',  // Zero-width non-joiner (remove)
  };

  let result = str;
  for (const [from, to] of Object.entries(homoglyphs)) {
    result = result.split(from).join(to);
  }

  return result;
}

/**
 * Re-analyze decoded content for secret patterns
 * Returns risk score if secret patterns found in decoded string
 */
function reanalyzeDecode(decoded) {
  // Import pattern detection from main detector
  // For now, basic pattern matching

  const secretPatterns = {
    // API keys and tokens
    aws_key: /AKIA[0-9A-Z]{16}/,
    github_pat: /ghp_[A-Za-z0-9_]{36,255}/,
    slack_webhook: /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9_]{20,}/,

    // Database strings
    mongodb_uri: /mongodb(\+srv)?:\/\/.*@.*\.mongodb\.net/i,
    postgres_uri: /postgres(ql)?:\/\/.*@.*:\d+/i,

    // Credentials
    password_assign: /(?:password|passwd|pwd)\s*[:=]\s*[A-Za-z0-9_\-!@#$%]{8,}/i,
    api_key_assign: /(?:api[_-]?key|apikey)\s*[:=]\s*[A-Za-z0-9_\-]{20,}/i,

    // SSH keys
    ssh_private_key: /BEGIN [A-Z]+ PRIVATE KEY/,

    // Ethereum/crypto
    ethereum_key: /0x[a-fA-F0-9]{64}/,
  };

  let riskScore = 0;
  for (const [name, pattern] of Object.entries(secretPatterns)) {
    if (pattern.test(decoded)) {
      riskScore += 25; // Each match adds 25 points
    }
  }

  return Math.min(100, riskScore);
}

// ── Main Obfuscation Detection ──

/**
 * Analyze string for obfuscation techniques
 * Returns array of potential decodings with risk scores
 */
function analyzeObfuscation(text) {
  const results = [];

  if (!text || text.length === 0) {
    return results;
  }

  // 1. Base64 Detection
  if (isLikelyBase64(text)) {
    const decoded = decodeBase64Safe(text);
    if (decoded) {
      const entropy = calculateEntropy(decoded);
      const riskScore = reanalyzeDecode(decoded);

      results.push({
        technique: 'base64',
        decoded,
        entropy,
        riskScore,
        confidence: Math.round((riskScore + entropy * 50) / 2),
        description: 'Base64 encoded content'
      });
    }
  }

  // 2. Hex Detection
  if (isLikelyHex(text)) {
    const decoded = decodeHexSafe(text);
    if (decoded) {
      const entropy = calculateEntropy(decoded);
      const riskScore = reanalyzeDecode(decoded);

      results.push({
        technique: 'hex',
        decoded,
        entropy,
        riskScore,
        confidence: Math.round((riskScore + entropy * 50) / 2),
        description: 'Hexadecimal encoded content'
      });
    }
  }

  // 3. URL Encoding Detection
  if (text.includes('%') && text.match(/%[0-9A-Fa-f]{2}/)) {
    const decoded = decodeUrlSafe(text);
    if (decoded) {
      const entropy = calculateEntropy(decoded);
      const riskScore = reanalyzeDecode(decoded);

      results.push({
        technique: 'url',
        decoded,
        entropy,
        riskScore,
        confidence: Math.round((riskScore + entropy * 30) / 2),
        description: 'URL encoded content'
      });
    }
  }

  // 4. Caesar Cipher Detection
  const decoded = decodeCaesarSafe(text);
  if (decoded && decoded !== text) {
    const entropy = calculateEntropy(decoded);
    const riskScore = reanalyzeDecode(decoded);

    results.push({
      technique: 'caesar',
      decoded,
      entropy,
      riskScore,
      confidence: Math.round((riskScore + entropy * 20) / 2),
      description: 'Caesar cipher (ROT variant)'
    });
  }

  // 5. Homoglyph Normalization
  const normalized = normalizeHomoglyphs(text);
  if (normalized !== text) {
    const riskScore = reanalyzeDecode(normalized);

    results.push({
      technique: 'homoglyph',
      decoded: normalized,
      entropy: 0,
      riskScore,
      confidence: riskScore > 0 ? 50 : 0,
      description: 'Homoglyph normalized content'
    });
  }

  // Sort by confidence (highest first)
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Check if text contains obfuscation with high confidence
 * Returns risk score if obfuscation detected, 0 otherwise
 */
function detectObfuscation(text) {
  const results = analyzeObfuscation(text);

  // Return highest confidence result if found
  if (results.length > 0 && results[0].confidence >= 30) {
    return results[0].riskScore || results[0].confidence;
  }

  return 0;
}

// ── Export Functions ──

module.exports = {
  analyzeObfuscation,
  detectObfuscation,

  // Helper exports for testing
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
};
