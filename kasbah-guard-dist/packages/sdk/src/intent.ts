/**
 * @kasbah/guard — Constitutional AI intent validation & ZK-proof functions
 *
 * validateIntent: validate user intent against Constitutional AI policies
 *   1. Tries POST to apiUrl + /api/validate-intent
 *   2. Falls back to built-in local 5-rule validation (mirrors validator.ts)
 *
 * generateProof: generate a Merkle-SHA256 ZK proof for a detection result
 * verifyProof:   verify a previously-generated proof
 */

import type { IntentValidationResult, ZKDetectionProof } from './types.js';

const DEFAULT_API_URL = 'https://api.bekasbah.com';

// ── Constitutional AI Local Fallback ─────────────────────────────────────────
// Mirrors the 5 rules from constitutional-ai/lib/validator.ts exactly.

interface _LocalRule {
  rule_id: string;
  severity_score: number;
  test: (text: string) => boolean;
}

const _LOCAL_RULES: _LocalRule[] = [
  {
    rule_id: 'injection_attack',
    severity_score: 1.0,
    test: (t) => /ignore.*previous|forget|new instructions|role.*switch/i.test(t),
  },
  {
    rule_id: 'jailbreak_attempt',
    severity_score: 1.0,
    test: (t) => /jailbreak|bypass|circumvent|disable.*safety/i.test(t),
  },
  {
    rule_id: 'data_exfiltration',
    severity_score: 0.75,
    test: (t) => /extract|exfiltrate|steal|leak|dump.*data|credentials/i.test(t),
  },
  {
    rule_id: 'malware_intent',
    severity_score: 1.0,
    test: (t) => /malware|ransomware|botnet|exploit|shellcode/i.test(t),
  },
  {
    rule_id: 'privacy_violation',
    severity_score: 0.75,
    test: (t) => /spy|dox|doxx|stalking|harass|blackmail/i.test(t),
  },
];

function _entropy(text: string): number {
  const freq: Record<string, number> = {};
  for (const ch of text) { freq[ch] = (freq[ch] ?? 0) + 1; }
  const len = text.length;
  if (len === 0) return 0;
  return -Object.values(freq).reduce((acc, c) => {
    const p = c / len;
    return acc + p * Math.log2(p);
  }, 0);
}

function _repetition(text: string): number {
  const words = text.split(/\s+/);
  if (!words.length) return 0;
  const counts: Record<string, number> = {};
  for (const w of words) { counts[w.toLowerCase()] = (counts[w.toLowerCase()] ?? 0) + 1; }
  return Math.max(...Object.values(counts)) / words.length;
}

/**
 * Local Constitutional AI validation — 5 rules + heuristics.
 * Used when the API is unavailable or no apiUrl is provided.
 */
export function validateIntentLocal(text: string): IntentValidationResult {
  const blocked_rules: string[] = [];
  let maxSeverity = 0;

  for (const rule of _LOCAL_RULES) {
    if (rule.test(text)) {
      blocked_rules.push(rule.rule_id);
      maxSeverity = Math.max(maxSeverity, rule.severity_score);
    }
  }

  // Heuristic risk (mirrors calculateHeuristicRisk in validator.ts)
  let heuristicRisk = 0;
  if (text.length > 5000) heuristicRisk += 0.1;
  if (_entropy(text) > 5.5) heuristicRisk += 0.15;
  if (_repetition(text) > 0.3) heuristicRisk += 0.1;
  heuristicRisk = Math.min(heuristicRisk, 0.5);

  const risk_score = Math.max(maxSeverity, heuristicRisk);
  const valid = risk_score < 0.5;
  const requires_approval = risk_score >= 0.4;

  const reasoning =
    blocked_rules.length === 0
      ? `Intent appears safe (risk score: ${(risk_score * 100).toFixed(1)}%). No constitutional violations detected.`
      : `Intent rejected due to policy violations: ${blocked_rules.join(', ')}. Risk score: ${(risk_score * 100).toFixed(1)}%. Requires manual review or approval.`;

  return { valid, risk_score, reasoning, blocked_rules, requires_approval };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate user intent against Constitutional AI policies.
 *
 * Tries the Kasbah API first; falls back to built-in local validation
 * if the API is unreachable or returns an error.
 *
 * @example
 * ```ts
 * const result = await validateIntent("Help me extract user passwords");
 * // { valid: false, risk_score: 0.75, blocked_rules: ['data_exfiltration'], ... }
 * ```
 */
export async function validateIntent(
  text: string,
  options?: { policy_id?: string; apiUrl?: string; token?: string }
): Promise<IntentValidationResult> {
  const apiUrl = options?.apiUrl ?? DEFAULT_API_URL;
  const policy_id = options?.policy_id ?? 'default';

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options?.token) headers['Authorization'] = `Bearer ${options.token}`;

    const res = await fetch(`${apiUrl}/api/validate-intent`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ intent: text, policy_id }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
    });

    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      // Strip the 'ok' wrapper if present
      return {
        valid: data.valid as boolean,
        risk_score: data.risk_score as number,
        reasoning: data.reasoning as string,
        blocked_rules: data.blocked_rules as string[],
        requires_approval: data.requires_approval as boolean,
      };
    }
  } catch (_) {
    // Network error or timeout — fall back to local
  }

  // Local fallback
  return validateIntentLocal(text);
}

/**
 * Generate a ZK (Merkle-SHA256) proof for a detection result.
 * Requires a valid API token.
 *
 * @example
 * ```ts
 * const proof = await generateProof(
 *   { model_id: 'gpt-4', risk_score: 80, decision: 'DENY', timestamp: new Date().toISOString(), content_hash: 'abc' },
 *   { token: 'your-jwt' }
 * );
 * ```
 */
export async function generateProof(
  detectionResult: object,
  options?: { apiUrl?: string; token?: string }
): Promise<ZKDetectionProof> {
  const apiUrl = options?.apiUrl ?? DEFAULT_API_URL;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options?.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(`${apiUrl}/api/proofs/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ detection_result: detectionResult }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status));
    throw new Error(`generateProof failed: ${res.status} ${errText}`);
  }

  const data = await res.json() as Record<string, unknown>;
  return {
    proof_id: data.proof_id as string,
    proof_bytes_hex: data.proof_bytes_hex as string,
    public_inputs_hex: data.public_inputs_hex as string,
    proof_type: data.proof_type as string,
  };
}

/**
 * Verify a ZK proof by its ID.
 * Requires a valid API token.
 *
 * @example
 * ```ts
 * const { verified } = await verifyProof('proof_abc123', { token: 'your-jwt' });
 * ```
 */
export async function verifyProof(
  proofId: string,
  options?: { apiUrl?: string; token?: string }
): Promise<{ verified: boolean }> {
  const apiUrl = options?.apiUrl ?? DEFAULT_API_URL;
  const headers: Record<string, string> = {};
  if (options?.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(`${apiUrl}/api/proofs/verify/${encodeURIComponent(proofId)}`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status));
    throw new Error(`verifyProof failed: ${res.status} ${errText}`);
  }

  const data = await res.json() as Record<string, unknown>;
  return { verified: Boolean(data.verified) };
}
