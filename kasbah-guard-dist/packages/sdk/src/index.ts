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
} from './types.js';

/** SDK version */
export const VERSION = '1.0.0';

/** Detection engine version (mirrors detector.js PATTERN_VERSION) */
export const ENGINE_VERSION = '3.5.2';
