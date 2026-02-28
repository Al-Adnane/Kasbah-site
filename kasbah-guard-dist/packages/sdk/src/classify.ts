/**
 * @kasbah/guard — Core classify() adapter
 *
 * Wraps detector.js at runtime. The detector source is bundled at build time
 * so this SDK is self-contained with no external dependencies.
 */

import type { ClassifyResult, RedactResult } from './types.js';

// ── Inline detector.js bootstrap ──────────────────────────────
// The full detector.js source is read at build time (see build.mjs).
// At runtime this module dynamically requires or imports the bundled source.

let _classify: ((text: string) => ClassifyResult) | null = null;
let _selfTest: (() => { passed: number; total: number; results: Array<{name: string; pass: boolean}> }) | null = null;

function _loadDetector(): void {
  if (_classify) return;
  // In Node.js: require the bundled CJS version
  // In browser: detector.js must be loaded via <script> or import()
  try {
    // Dynamic require (Node.js / CJS environments)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./detector.cjs');
    _classify = mod.classify;
    _selfTest = mod.selfTest;
  } catch (_e) {
    // Browser environment — detector.js should be on window
    if (typeof window !== 'undefined' && typeof (window as unknown as Record<string, unknown>)['classify'] === 'function') {
      _classify = (window as unknown as Record<string, unknown>)['classify'] as (text: string) => ClassifyResult;
    } else {
      throw new Error('[kasbah/guard] Could not load detector engine. In browser, ensure detector.js is loaded before this SDK.');
    }
  }
}

/**
 * Classify text for sensitive data risk.
 * Returns a full ClassifyResult with risk score, decision, reasons, and ZK proof.
 */
export function classify(text: string): ClassifyResult {
  _loadDetector();
  return _classify!(text);
}

/**
 * Get just the risk score (0-100).
 */
export function getRisk(text: string): number {
  return classify(text).risk;
}

/**
 * Get the decision string: 'ALLOW' | 'WARN' | 'DENY'.
 */
export function getDecision(text: string): string {
  return classify(text).decision;
}

/**
 * Check if text is safe to send (ALLOW decision).
 */
export function isSafe(text: string): boolean {
  return getDecision(text) === 'ALLOW';
}

/**
 * Run the internal self-test suite (23 invariants).
 * Returns { passed, total, results }.
 */
export function selfTest(): { passed: number; total: number; results: Array<{name: string; pass: boolean}> } {
  _loadDetector();
  return _selfTest!();
}

/**
 * Simple JS-side redaction: replace detected sensitive patterns with [REDACTED::TYPE].
 * For full Rust-powered redaction, use the CLI or Desktop app.
 */
export function redact(text: string): RedactResult {
  const result = classify(text);
  if (result.decision === 'ALLOW') {
    return { text, count: 0, types: [] };
  }

  const types: string[] = [];
  let redacted = text;

  // Apply redactions based on detected tiers
  for (const tier of result.tiers) {
    if (tier.includes('ssn')) {
      redacted = redacted.replace(/\b(?!000|666|9\d{2})\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, '[REDACTED::SSN]');
      types.push('SSN');
    }
    if (tier.includes('cc') || tier.includes('credit')) {
      redacted = redacted.replace(/\b(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{2}|6011)[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{1,7}\b/g, '[REDACTED::CREDIT_CARD]');
      types.push('CREDIT_CARD');
    }
    if (tier.includes('private_key') || tier.includes('encoded')) {
      redacted = redacted.replace(/-----BEGIN[\s\S]*?-----END[^\n]*\n?/g, '[REDACTED::PRIVATE_KEY]\n');
      types.push('PRIVATE_KEY');
    }
    if (tier.includes('aws')) {
      redacted = redacted.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED::AWS_KEY]');
      types.push('AWS_KEY');
    }
    if (tier.includes('conn_string') || tier.includes('encoded')) {
      redacted = redacted.replace(/\b(?:mongodb|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s"'<>]{10,}/gi, '[REDACTED::CONN_STRING]');
      types.push('CONN_STRING');
    }
  }

  const uniqueTypes = [...new Set(types)];
  const count = (redacted.match(/\[REDACTED::/g) || []).length;
  return { text: redacted, count, types: uniqueTypes };
}
