/**
 * Kasbah Guard — Core State Management
 * 
 * In-memory state for:
 * - HyperCache (LRU cache with TTL)
 * - Dynamic threat scoring
 * - Brittleness indicators
 * - Honeypot network
 * - Privacy utilities
 */

// ── HyperCache: LRU cache with TTL ──
const _HYPERCACHE_MAX = 512;
const _HYPERCACHE_DEFAULT_TTL_MS = 60_000;
const _hyperCache = new Map();
const _hyperCacheOrder = [];

function _hyperCacheKey(text) {
  let h = 2166136261;
  const s = text.slice(0, 256);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16) + ':' + text.length;
}

function _hyperCacheGet(key) {
  const entry = _hyperCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _hyperCache.delete(key); return null; }
  const idx = _hyperCacheOrder.indexOf(key);
  if (idx !== -1) { _hyperCacheOrder.splice(idx, 1); _hyperCacheOrder.push(key); }
  entry.hits++;
  return entry.value;
}

function _hyperCacheSet(key, value, ttlMs = _HYPERCACHE_DEFAULT_TTL_MS) {
  if (_hyperCache.has(key)) {
    const idx = _hyperCacheOrder.indexOf(key);
    if (idx !== -1) _hyperCacheOrder.splice(idx, 1);
  } else if (_hyperCache.size >= _HYPERCACHE_MAX) {
    const lruKey = _hyperCacheOrder.shift();
    if (lruKey) _hyperCache.delete(lruKey);
  }
  _hyperCache.set(key, { value, expiresAt: Date.now() + ttlMs, hits: 0 });
  _hyperCacheOrder.push(key);
}

function _hyperCacheStats() {
  let totalHits = 0, expired = 0;
  const now = Date.now();
  for (const [k, e] of _hyperCache) {
    totalHits += e.hits;
    if (now > e.expiresAt) expired++;
  }
  return { size: _hyperCache.size, max: _HYPERCACHE_MAX, total_hits: totalHits, expired_entries: expired };
}

// ── Dynamic Threshold Modulation ──
const _THREAT_WEIGHTS = { file_upload: 5, api_abuse: 10, rate_limit_breach: 15, evasion_attempt: 25, mass_requests: 20, suspicious_pattern: 15, known_malicious: 50 };
const _THREAT_CONFIGS = {
  minimal:  { baseConfidenceThreshold: 0.80, maxFileSizeMB: 75, rateLimitMultiplier: 2.0, blockSuspicious: false, requireVerification: false },
  low:      { baseConfidenceThreshold: 0.75, maxFileSizeMB: 60, rateLimitMultiplier: 1.5, blockSuspicious: false, requireVerification: false },
  medium:   { baseConfidenceThreshold: 0.65, maxFileSizeMB: 50, rateLimitMultiplier: 1.0, blockSuspicious: true,  requireVerification: false },
  high:     { baseConfidenceThreshold: 0.50, maxFileSizeMB: 35, rateLimitMultiplier: 0.5, blockSuspicious: true,  requireVerification: true  },
  critical: { baseConfidenceThreshold: 0.30, maxFileSizeMB: 25, rateLimitMultiplier: 0.25,blockSuspicious: true,  requireVerification: true  },
};
let _dynThreatScore = 0;
let _dynLastDecay = Date.now();

function _dynApplyDecay() {
  const now = Date.now();
  const minutesElapsed = (now - _dynLastDecay) / 60000;
  if (minutesElapsed > 0) {
    _dynThreatScore = Math.max(0, _dynThreatScore * Math.pow(0.95, minutesElapsed));
    _dynLastDecay = now;
  }
}

function _dynThreatLevel(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'minimal';
}

function _dynRecordThreat(vector) {
  const w = _THREAT_WEIGHTS[vector] || 5;
  _dynApplyDecay();
  _dynThreatScore = Math.min(100, _dynThreatScore + w);
  return { score: _dynThreatScore, level: _dynThreatLevel(_dynThreatScore) };
}

function _dynGetConfig() {
  _dynApplyDecay();
  return { level: _dynThreatLevel(_dynThreatScore), score: _dynThreatScore, ..._THREAT_CONFIGS[_dynThreatLevel(_dynThreatScore)] };
}

// ── Privacy-First Framework ──
const _PRIVACY_MINIMIZATION_FIELDS = ['ip_address', 'user_agent', 'email', 'phone', 'ssn', 'location'];

function _privacyDetectSignals(request) {
  const gpc = request.headers.get('Sec-GPC') === '1';
  const dnt = request.headers.get('DNT') === '1';
  return { gpc, dnt, restricted: gpc || dnt };
}

function _privacyMinimize(data, purpose = 'deepfake_detection') {
  if (!data || typeof data !== 'object') return data;
  const out = { ...data };
  for (const field of _PRIVACY_MINIMIZATION_FIELDS) {
    if (field in out) {
      if (typeof out[field] === 'string' && out[field].length > 0) {
        let h = 0x811c9dc5;
        for (let i = 0; i < out[field].length; i++) {
          h ^= out[field].charCodeAt(i);
          h = (Math.imul(h, 0x01000193) >>> 0);
        }
        out[field] = `[minimized:${h.toString(16).padStart(8, '0')}]`;
      } else {
        out[field] = '[minimized]';
      }
    }
  }
  return out;
}

module.exports = {
  _hyperCacheKey,
  _hyperCacheGet,
  _hyperCacheSet,
  _hyperCacheStats,
  _dynRecordThreat,
  _dynGetConfig,
  _dynThreatLevel,
  _privacyDetectSignals,
  _privacyMinimize,
};
