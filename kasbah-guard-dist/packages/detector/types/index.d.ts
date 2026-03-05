/**
 * Kasbah Guard — TypeScript Type Definitions
 * 
 * Complete type definitions for the Detector Kernel.
 */

/**
 * Detection result from pattern matching
 */
export interface Detection {
  type: string;
  pattern: string;
  matches: number;
  confidence: number;
}

/**
 * ML anomaly analysis result
 */
export interface MLAnalysis {
  anomalyScore: number;
  riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  features: {
    entropy: number;
    charFreq: CharFrequency;
    consecutive: number;
    repeated: number;
    ngramAnomaly: number;
    base64Like: Base64Result;
    hexLike: HexResult;
    weights: FeatureWeights;
  };
  isLikelySecret: boolean;
  confidence: number;
}

/**
 * Character frequency distribution
 */
export interface CharFrequency {
  uppercase: number;
  lowercase: number;
  digits: number;
  special: number;
  whitespace: number;
}

/**
 * Base64 detection result
 */
export interface Base64Result {
  isBase64Like: boolean;
  isBase64Url: boolean;
  lengthMod4: number;
  hasPadding: boolean;
  confidence: number;
}

/**
 * Hex detection result
 */
export interface HexResult {
  isHexLike: boolean;
  isEvenLength: boolean;
  hasHexPrefix: boolean;
  confidence: number;
}

/**
 * Feature weights for ML scoring
 */
export interface FeatureWeights {
  entropy: number;
  charFrequency: number;
  consecutive: number;
  repeated: number;
  ngram: number;
  encoding: number;
}

/**
 * PII detection result
 */
export interface PIIDetection {
  detected: boolean;
  risk: number;
  detections: Detection[];
  count: number;
}

/**
 * Secret detection result
 */
export interface SecretDetection {
  detected: boolean;
  risk: number;
  detections: Detection[];
  count: number;
}

/**
 * Phishing detection result
 */
export interface PhishingDetection {
  detected: boolean;
  risk: number;
  detections: Detection[];
  count: number;
}

/**
 * Full scan result
 */
export interface ScanResult {
  risk: number;
  decision: 'ALLOW' | 'WARN' | 'DENY';
  reason: string;
  secrets: SecretDetection;
  pii: PIIDetection;
  phishing: PhishingDetection;
  mlAnalysis?: MLAnalysis;
  violations: Violation[];
  redacted: string;
}

/**
 * Violation from any detection type
 */
export interface Violation {
  type: 'secret' | 'pii' | 'phishing' | 'anomaly';
  pattern: string;
  matches?: number;
  confidence: number;
  risk: number;
}

/**
 * Scan options
 */
export interface ScanOptions {
  includeML?: boolean;
  includeBehavioral?: boolean;
  minRisk?: number;
}

/**
 * Detector class interface
 */
export interface Detector {
  scan(text: string, options?: ScanOptions): ScanResult;
  detectSecrets(text: string): SecretDetection;
  detectPII(text: string): PIIDetection;
  detectPhishing(text: string): PhishingDetection;
  redact(text: string): string;
}

/**
 * ML Detector class interface
 */
export interface MLDetector {
  analyze(text: string): MLAnalysis;
  isSecret(text: string): boolean;
  getRiskScore(text: string): number;
}

/**
 * Behavioral Detector class interface
 */
export interface BehavioralDetector {
  trackPaste(event: PasteEvent): PasteResult;
  trackTyping(event: TypingEvent): TypingResult;
  trackContextSwitch(event: ContextSwitchEvent): ContextSwitchResult;
  getSessionSummary(sessionId: string): SessionSummary | null;
}

/**
 * Paste event data
 */
export interface PasteEvent {
  sessionId: string;
  content: string;
  timestamp?: number;
  source?: string;
  targetElement?: string;
}

/**
 * Paste analysis result
 */
export interface PasteResult {
  sessionId: string;
  risk: PasteRisk;
  sessionRisk: number;
  warnings: string[];
}

/**
 * Paste risk analysis
 */
export interface PasteRisk {
  score: number;
  factors: string[];
  level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * Typing event data
 */
export interface TypingEvent {
  sessionId: string;
  charsPerSecond: number;
  timestamp?: number;
}

/**
 * Typing analysis result
 */
export interface TypingResult {
  sessionId: string;
  isAnomalous: boolean;
  cps: number;
  sessionRisk: number;
}

/**
 * Context switch event data
 */
export interface ContextSwitchEvent {
  sessionId: string;
  from: string;
  to: string;
  timestamp?: number;
}

/**
 * Context switch result
 */
export interface ContextSwitchResult {
  sessionId: string;
  switchRate: number;
  isSuspicious: boolean;
  sessionRisk: number;
}

/**
 * Session summary
 */
export interface SessionSummary {
  sessionId: string;
  duration: number;
  pasteCount: number;
  typingSampleCount: number;
  contextSwitchCount: number;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

// Export main types
export type {
  Detection,
  MLAnalysis,
  CharFrequency,
  Base64Result,
  HexResult,
  FeatureWeights,
  PIIDetection,
  SecretDetection,
  PhishingDetection,
  ScanResult,
  Violation,
  ScanOptions,
  Detector,
  MLDetector,
  BehavioralDetector,
  PasteEvent,
  PasteResult,
  PasteRisk,
  TypingEvent,
  TypingResult,
  ContextSwitchEvent,
  ContextSwitchResult,
  SessionSummary
};
