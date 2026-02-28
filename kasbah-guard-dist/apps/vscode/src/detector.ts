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

    return {
      risk: maxRisk,
      decision: worstDecision,
      reason: worstReason,
    };
  } catch (err) {
    console.error('[kasbah-guard] Detection error:', err);
    return { risk: 0, decision: 'ALLOW', reason: 'detection error' };
  }
}
