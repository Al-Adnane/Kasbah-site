/**
 * @kasbah/guard — TypeScript type definitions
 * Mirrors the output of detector.js classify() exactly.
 */

export type Decision = 'ALLOW' | 'WARN' | 'DENY';
export type DecisionMode = 'ENFORCED' | 'SIMULATED';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ClassifyResult {
  /** Risk score 0-100 */
  risk: number;
  /** Final verdict */
  decision: Decision;
  /** Decision mode (ENFORCED in production) */
  decision_mode: DecisionMode;
  /** Human-readable reason string (semicolon-separated) */
  reason: string;
  /** Hybrid hash of input content (for ZK proof, no raw content) */
  content_hash: string;
  /** Detected AI platform */
  platform: string;
  /** Tier-tagged detection signals (e.g. "T1:ssn", "T1b:passport") */
  tiers: string[];
  /** Zero-knowledge detection proof (only when risk >= 40) */
  proof: DetectionProof | null;
  /** Pattern version (e.g. "3.5.1") */
  version: string;
  /** Enabled feature flags */
  features: string[];
}

export interface DetectionProof {
  decision_id: string;
  timestamp: string;
  decision_mode: DecisionMode;
  input_classification: string[];
  applied_rules: string[];
  ml_signals: string[];
  final_verdict: Decision;
  signature: string;
  ledger_hash_pointer: string;
  environment_fingerprint: string;
  hash: string;
  tier_count: number;
  verified: boolean;
}

export interface RedactResult {
  /** Redacted text with sensitive values replaced by [REDACTED::TYPE] markers */
  text: string;
  /** Number of redactions applied */
  count: number;
  /** Types of data that were redacted */
  types: string[];
}

export interface ScanFileResult {
  path: string;
  risk: number;
  decision: Decision;
  reason: string;
  line_count: number;
  chunks_scanned: number;
}

export interface KasbahGuardOptions {
  /** Threshold for WARN decision (default: 40) */
  warnThreshold?: number;
  /** Threshold for DENY decision (default: 70) */
  denyThreshold?: number;
  /** Decision mode override */
  mode?: DecisionMode;
}
