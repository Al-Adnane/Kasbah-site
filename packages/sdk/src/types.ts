/**
 * Kasbah Guard SDK — Type Definitions v1.0.0
 *
 * Comprehensive TypeScript types for secret detection results
 * and configuration options
 */

/**
 * Risk level classification
 * - LOW: <40 risk score (likely safe)
 * - MEDIUM: 40-69 risk score (review recommended)
 * - HIGH: ≥70 risk score (likely a secret)
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Classification decision
 * - ALLOW: Safe to use (risk < 40)
 * - WARN: Review recommended (risk 40-69)
 * - DENY: Likely a secret (risk ≥ 70)
 */
export type Decision = 'ALLOW' | 'WARN' | 'DENY';

/**
 * Secret category detected
 */
export type SecretCategory =
  | 'ssn'
  | 'credit_card'
  | 'phone'
  | 'email'
  | 'api_key'
  | 'aws_key'
  | 'github_token'
  | 'slack_token'
  | 'stripe_key'
  | 'password'
  | 'database_uri'
  | 'private_key'
  | 'base64_secret'
  | 'cryptocurrency'
  | 'other';

/**
 * Detection proof showing why something was flagged
 */
export interface DetectionProof {
  /** Pattern that matched (e.g., "AKIAIOSFODNN7EXAMPLE") */
  pattern: string;
  /** Pattern category (e.g., "aws_key") */
  category: SecretCategory;
  /** Position in text where match starts */
  start: number;
  /** Position in text where match ends */
  end: number;
  /** Confidence score 0-100 */
  confidence: number;
}

/**
 * Main classification result returned by classify()
 */
export interface ClassificationResult {
  /** Risk score 0-100 (0=safe, 100=definitely a secret) */
  risk: number;
  /** Risk level classification */
  risk_level: RiskLevel;
  /** Classification decision */
  decision: Decision;
  /** Human-readable reason for decision */
  reason: string;
  /** Array of detected patterns and their details */
  detections: DetectionProof[];
  /** Latency in milliseconds (with 100x precision, e.g., 1.23ms) */
  latency_ms: number;
  /** Engine version (e.g., "1.0.0") */
  engine_version: string;
  /** Timestamp of classification */
  timestamp: string;
}

/**
 * Configuration options for classify()
 */
export interface ClassifyOptions {
  /** Minimum risk threshold to report (default: 0) */
  min_threshold?: number;
  /** Maximum risk threshold to report (default: 100) */
  max_threshold?: number;
  /** Include detailed detection proofs (default: true) */
  include_proofs?: boolean;
  /** Include latency measurement (default: true) */
  measure_latency?: boolean;
  /** Custom context for false positive filtering (optional) */
  context?: string;
}

/**
 * Redaction result
 */
export interface RedactionResult {
  /** Original text (unchanged) */
  original: string;
  /** Text with secrets redacted */
  redacted: string;
  /** Count of redacted items */
  count: number;
  /** Details about each redaction */
  redactions: RedactionDetail[];
}

/**
 * Details about a single redaction
 */
export interface RedactionDetail {
  /** Pattern type that was redacted (e.g., "SSN") */
  pattern: string;
  /** Start position of redacted content */
  start: number;
  /** End position of redacted content */
  end: number;
  /** Replacement text used (e.g., "[REDACTED: SSN]") */
  replacement: string;
}

/**
 * Export types for barrel export
 */
export type {
  ClassificationResult,
  ClassifyOptions,
  DetectionProof,
  RiskLevel,
  Decision,
  SecretCategory,
  RedactionResult,
  RedactionDetail,
};
