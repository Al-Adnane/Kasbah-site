/**
 * kasbah-client.ts — @kasbah/guard SDK integration for Enterprise dashboard
 *
 * Wraps the SDK for server-side use (Node.js / Next.js API routes).
 * All content is processed as content-hashes — raw text is NEVER stored.
 */

import { classify, redact, VERSION, ENGINE_VERSION } from '@kasbah/guard';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  contentHash: string;   // SHA-256 of content — raw text never stored
  action: 'SCAN' | 'REDACT' | 'ALLOW' | 'BLOCK';
  risk: number;
  decision: string;
  reason: string;
  timestamp: string;
  user: string;
  product: string;
}

export interface PolicyConfig {
  threshold: number;      // Default: 40 (WARN threshold)
  denyThreshold: number;  // Default: 70 (DENY threshold)
  enabledProducts: string[];
  customPatterns: string[];
  redactOnDeny: boolean;
}

// ─── Default policy ───────────────────────────────────────────────────────────

export const DEFAULT_POLICY: PolicyConfig = {
  threshold: 40,
  denyThreshold: 70,
  enabledProducts: ['cli', 'vscode', 'desktop', 'mobile', 'browser'],
  customPatterns: [],
  redactOnDeny: false,
};

// ─── Kasbah Enterprise Client ─────────────────────────────────────────────────

export const kasbahClient = {
  /**
   * Classify text and record an audit event.
   * Content hash is computed from the text — raw text never leaves this function.
   */
  async scan(text: string, user: string, product: string): Promise<AuditEvent> {
    const result = classify(text);

    // Compute content hash (browser-compatible)
    const hash = await computeHash(text);

    const event: AuditEvent = {
      id: crypto.randomUUID(),
      contentHash: `sha256:${hash.slice(0, 8)}…`,
      action: 'SCAN',
      risk: result.risk,
      decision: result.decision,
      reason: result.reason ?? '',
      timestamp: new Date().toISOString(),
      user,
      product,
    };

    return event;
  },

  /**
   * Redact text and return both the redacted output and an audit event.
   */
  async redact(text: string, user: string, product: string): Promise<{ redacted: string; event: AuditEvent }> {
    const redacted = redact(text);
    const hash = await computeHash(text);

    const event: AuditEvent = {
      id: crypto.randomUUID(),
      contentHash: `sha256:${hash.slice(0, 8)}…`,
      action: 'REDACT',
      risk: 0,
      decision: 'REDACTED',
      reason: 'Content redacted by user',
      timestamp: new Date().toISOString(),
      user,
      product,
    };

    return { redacted, event };
  },

  /** Engine version metadata */
  version: VERSION,
  engineVersion: ENGINE_VERSION,
};

// ─── Hash utility (Web Crypto API — works in Node 18+ and browser) ────────────

async function computeHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
