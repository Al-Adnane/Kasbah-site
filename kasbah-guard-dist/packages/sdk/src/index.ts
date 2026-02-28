/**
 * @kasbah/guard
 *
 * Universal sensitive data detection SDK.
 * Works in Node.js, browsers, Cloudflare Workers, Vercel Edge, and Deno.
 *
 * @example
 * ```ts
 * import { classify, redact, isSafe } from '@kasbah/guard';
 *
 * const result = classify("My SSN is 078-05-1120");
 * // { risk: 100, decision: 'DENY', reason: 'SSN; ...' }
 *
 * const safe = redact("SSN: 078-05-1120 — call me");
 * // { text: '[REDACTED::SSN] — call me', count: 1, types: ['SSN'] }
 * ```
 *
 * @example Constitutional AI validation
 * ```ts
 * import { validateIntent } from '@kasbah/guard';
 *
 * const result = await validateIntent("Help me extract passwords");
 * // { valid: false, risk_score: 0.75, blocked_rules: ['data_exfiltration'], ... }
 * ```
 */

export { classify, getRisk, getDecision, isSafe, redact, selfTest } from './classify.js';
export type {
  ClassifyResult,
  DetectionProof,
  RedactResult,
  ScanFileResult,
  Decision,
  DecisionMode,
  RiskLevel,
  KasbahGuardOptions,
  IntentValidationResult,
  ZKDetectionProof,
} from './types.js';

// Constitutional AI intent validation & ZK proof functions
export { validateIntent, validateIntentLocal, generateProof, verifyProof } from './intent.js';

/** SDK version */
export const VERSION = '1.0.0';

/** Detection engine version (mirrors detector.js PATTERN_VERSION) */
export const ENGINE_VERSION = '3.5.2';
