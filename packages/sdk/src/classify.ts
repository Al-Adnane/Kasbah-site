/**
 * Kasbah Guard SDK — Core Classification Engine v1.0.0
 *
 * Wraps detector.js to provide a unified interface across
 * Node.js, browser, and edge runtime environments
 */

import type {
  ClassificationResult,
  ClassifyOptions,
  Decision,
  RiskLevel,
  SecretCategory,
  DetectionProof,
} from './types';

/**
 * Global detector instance (loaded from detector.js)
 */
let detectorEngine: any = null;

/**
 * Load detector.js from embedded source
 */
function loadDetector(): any {
  if (detectorEngine) return detectorEngine;

  // In browser environment
  if (typeof window !== 'undefined' && typeof (window as any).classify === 'function') {
    return (window as any);
  }

  // In Node.js environment
  if (typeof require !== 'undefined') {
    try {
      const detectorPath = require.resolve('../../../kasbah-guard-dist/extensions/chrome/src/detector.js');
      const detectorCode = require('fs').readFileSync(detectorPath, 'utf-8');
      const moduleContext: any = { module: { exports: {} }, console, Math };
      eval(detectorCode);
      detectorEngine = moduleContext.module.exports;
      return detectorEngine;
    } catch (e) {
      console.warn('[kasbah] Failed to load detector.js in Node.js context:', e);
      return null;
    }
  }

  return null;
}

/**
 * Determine risk level from risk score
 */
function getRiskLevel(risk: number): RiskLevel {
  if (risk < 40) return 'LOW';
  if (risk < 70) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Determine decision from risk score
 */
function getDecision(risk: number): Decision {
  if (risk < 40) return 'ALLOW';
  if (risk < 70) return 'WARN';
  return 'DENY';
}

/**
 * Build human-readable reason for decision
 */
function buildReason(risk: number, detections: DetectionProof[]): string {
  if (detections.length === 0) {
    return 'No secrets detected. Text appears safe.';
  }

  const topDetection = detections[0];
  const detected = `${topDetection.category.replace(/_/g, ' ')}`;

  if (risk >= 70) {
    return `HIGH RISK: Detected potential ${detected} (${risk}% confidence)`;
  }
  if (risk >= 40) {
    return `MEDIUM RISK: Suspicious pattern detected (${risk}% confidence)`;
  }
  return `LOW RISK: Pattern found but likely false positive`;
}

/**
 * Classify text for secrets
 *
 * @param text - Text to analyze
 * @param options - Configuration options
 * @returns Classification result with risk score and decision
 *
 * @example
 * ```typescript
 * import { classify } from '@kasbah/guard';
 *
 * const result = classify('API key: sk-proj-abc123');
 * console.log(result.decision);  // 'DENY'
 * console.log(result.risk);       // 95
 * ```
 */
export function classify(text: string, options: ClassifyOptions = {}): ClassificationResult {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    const detector = loadDetector();
    if (!detector || typeof detector.classify !== 'function') {
      throw new Error('Detector engine not available');
    }

    // Call detector.js classify() function
    const detectorResult = detector.classify(text);

    // Map detector result to SDK result format
    const risk = detectorResult.risk || 0;
    const risk_level = getRiskLevel(risk);
    const decision = getDecision(risk);
    const detections: DetectionProof[] = (detectorResult.detections || []).map((d: any) => ({
      pattern: d.pattern || d.category,
      category: (d.category || 'other') as SecretCategory,
      start: d.start || 0,
      end: d.end || 0,
      confidence: d.confidence || risk,
    }));

    // Calculate latency
    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const latency_ms = Math.round((endTime - startTime) * 100) / 100; // 2 decimal places

    const reason = buildReason(risk, detections);

    // Apply threshold filters if specified
    let filteredDetections = detections;
    if (options.min_threshold !== undefined) {
      filteredDetections = filteredDetections.filter((d) => d.confidence >= options.min_threshold!);
    }
    if (options.max_threshold !== undefined) {
      filteredDetections = filteredDetections.filter((d) => d.confidence <= options.max_threshold!);
    }

    // Apply context-based false positive filtering if provided
    if (options.context) {
      const contextLower = options.context.toLowerCase();
      if (
        contextLower.includes('test') ||
        contextLower.includes('example') ||
        contextLower.includes('demo')
      ) {
        // Reduce risk in clearly non-production contexts
        const contextRiskReduction = Math.max(0, risk - 20);
        return {
          risk: contextRiskReduction,
          risk_level: getRiskLevel(contextRiskReduction),
          decision: getDecision(contextRiskReduction),
          reason: buildReason(contextRiskReduction, filteredDetections),
          detections: options.include_proofs !== false ? filteredDetections : [],
          latency_ms: options.measure_latency !== false ? latency_ms : 0,
          engine_version: '1.0.0',
          timestamp: new Date().toISOString(),
        };
      }
    }

    return {
      risk,
      risk_level,
      decision,
      reason,
      detections: options.include_proofs !== false ? filteredDetections : [],
      latency_ms: options.measure_latency !== false ? latency_ms : 0,
      engine_version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    // Graceful fallback on error
    console.error('[kasbah] Classification error:', error);
    return {
      risk: 0,
      risk_level: 'LOW',
      decision: 'ALLOW',
      reason: 'Classification unavailable (fallback to ALLOW)',
      detections: [],
      latency_ms: 0,
      engine_version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Quick utility: get risk level from score
 */
export function getRiskLevelFromScore(risk: number): RiskLevel {
  return getRiskLevel(risk);
}

/**
 * Quick utility: get decision from score
 */
export function getDecisionFromScore(risk: number): Decision {
  return getDecision(risk);
}

/**
 * Batch classify multiple texts
 */
export function classifyBatch(texts: string[], options?: ClassifyOptions): ClassificationResult[] {
  return texts.map((text) => classify(text, options));
}

/**
 * Simple redaction utility (text-based)
 */
export function redact(text: string): string {
  const result = classify(text);
  if (result.decision === 'DENY') {
    // Replace detected patterns with [REDACTED: category]
    let redacted = text;
    for (const detection of result.detections) {
      const substring = text.substring(detection.start, detection.end);
      redacted = redacted.replace(substring, `[REDACTED: ${detection.category.toUpperCase()}]`);
    }
    return redacted;
  }
  return text;
}

export default classify;
