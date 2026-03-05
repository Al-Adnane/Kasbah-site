/**
 * Kasbah Guard SDK v1.0.0
 *
 * Universal JavaScript SDK for secret detection
 * Works in Node.js, browsers, and edge runtimes
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import { classify, redact } from '@kasbah/guard';
 *
 * // Detect secrets
 * const result = classify('My password: secretKey123');
 * console.log(result.decision);  // 'DENY'
 *
 * // Redact text
 * const safe = redact('SSN: 123-45-6789');
 * console.log(safe);  // 'SSN: [REDACTED: SSN]'
 * ```
 */

export { classify, redact, classifyBatch, getRiskLevelFromScore, getDecisionFromScore } from './classify';
export { validateIntent, validateIntentLocal, generateProof, verifyProof } from './intent';

export type {
  ClassificationResult,
  ClassifyOptions,
  Decision,
  DetectionProof,
  RiskLevel,
  SecretCategory,
  RedactionResult,
  RedactionDetail,
  IntentValidationResult,
  ZKDetectionProof,
} from './types';

// Version constant
export const VERSION = '1.0.0';
export const ENGINE_VERSION = '1.0.0';

// Data Supply Chain Tracker
export { DataSupplyChainTracker, PIICategory } from './supply-chain';
export type { DataLineageNode, DataLineageReport, ComplianceViolation, ComplianceFramework } from './supply-chain';
