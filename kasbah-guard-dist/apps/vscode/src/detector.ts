/**
 * detector.ts — wraps @kasbah/guard SDK classify() for VS Code
 *
 * Provides async interface with graceful error handling.
 * Moat I: full pattern detection via kasbah-kernel-derived detector.
 */

import { classify, type ClassifyResult } from '@kasbah/guard';

export interface DetectionResult {
  risk: number;
  decision: string;
  reason: string;
  tiers?: Record<string, unknown>;
  authz?: {
    ccl_level: number;
  };
}

/**
 * Frontier: lightweight GenAI detection helper
 * Detects AI-generated text using entropy + phrase markers
 */
function frontierEnhance(text: string): { genai: boolean; generator: string | null; confidence: number } {
  if (text.length < 50) {
    return { genai: false, generator: null, confidence: 0 };
  }

  // Calculate entropy
  const freq: Record<string, number> = {};
  for (const char of text.toLowerCase()) {
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / text.length;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  // Check for AI generator markers
  const markerPatterns = {
    'gpt-4': [/\bas\s+(?:you|a)/i, /certainly\b/i, /please\s+note/i, /think\s+about\s+it/i],
    'claude': [/i\'d\s+be\s+happy/i, /fascinating\s+(?:question|topic)/i, /\bnuance\b/i, /context\s+is\s+key/i],
    'gemini': [/helpful\s+(?:information|response)/i, /dive\s+(?:into|deeper)/i, /comprehensive\s+(?:overview|guide)/i],
    'llama': [/provide\s+(?:a|an)\s+(?:answer|response)/i, /step\s+by\s+step/i, /following\s+(?:steps|points)/i],
  };

  let bestGenerator: string | null = null;
  let maxMarkers = 0;

  for (const [gen, patterns] of Object.entries(markerPatterns)) {
    let count = 0;
    for (const pattern of patterns) {
      if (pattern.test(text)) count++;
    }
    if (count > maxMarkers) {
      maxMarkers = count;
      bestGenerator = gen;
    }
  }

  // Base confidence: entropy in AI range [4.8, 5.6]?
  let confidence = entropy > 4.5 && entropy < 5.8 ? 0.4 : 0.1;

  // Boost if markers detected
  if (maxMarkers > 0) {
    confidence += Math.min(0.3, maxMarkers * 0.08);
  }

  confidence = Math.min(0.95, confidence);

  return {
    genai: confidence > 0.6,
    generator: bestGenerator,
    confidence: confidence,
  };
}

/**
 * Run sensitive data detection on text.
 * Returns a DetectionResult — never throws.
 */
export async function detect(text: string): Promise<DetectionResult> {
  if (!text || text.trim().length === 0) {
    return { risk: 0, decision: 'ALLOW', reason: 'empty input' };
  }

  try {
    // Process in chunks for large files (mirrors CLI scanner.rs 4KB chunks)
    const CHUNK_SIZE = 4096;
    let maxRisk = 0;
    let worstDecision = 'ALLOW';
    let worstReason = '';

    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      const chunk = text.slice(i, i + CHUNK_SIZE);
      const result: ClassifyResult = classify(chunk);

      if (result.risk > maxRisk) {
        maxRisk = result.risk;
        worstDecision = result.decision;
        worstReason = result.reason ?? '';
      }

      // Short-circuit on max risk
      if (maxRisk >= 100) break;
    }

    // Frontier: GenAI detection on full text
    const frontier = frontierEnhance(text);

    // Append GenAI detection to reason
    if (frontier.genai && frontier.confidence > 0.7) {
      worstReason += ` [GENAI:${frontier.generator || 'unknown'}]`;
      // Max +5 risk boost if high confidence AI-generated
      if (frontier.confidence > 0.8) {
        maxRisk = Math.min(100, maxRisk + 5);
      }
    }

    // Compute CCL level from frontier confidence
    const cclLevel = frontier.confidence >= 0.8 ? 3
      : frontier.confidence >= 0.5 ? 2
      : frontier.confidence >= 0.3 ? 1
      : 0;

    return {
      risk: maxRisk,
      decision: worstDecision,
      reason: worstReason,
      authz: { ccl_level: cclLevel },
    };
  } catch (err) {
    console.error('[kasbah-guard] Detection error:', err);
    return { risk: 0, decision: 'ALLOW', reason: 'detection error' };
  }
}
