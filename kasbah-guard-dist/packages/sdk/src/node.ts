/**
 * @kasbah/guard/node — Node.js-specific utilities
 *
 * File scanning, directory traversal, stdin pipe scanning.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { classify, redact } from './classify.js';
import type { ScanFileResult, Decision } from './types.js';

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.cpp', '.c', '.h',
  '.json', '.yaml', '.yml', '.toml', '.env', '.ini', '.cfg',
  '.md', '.txt', '.log', '.sql', '.sh', '.bash', '.zsh',
  '.html', '.css', '.xml', '.csv',
]);

const CHUNK_SIZE = 4096; // bytes per chunk (stays under classifier max)

/**
 * Scan a single file for sensitive data.
 */
export function scanFile(filePath: string): ScanFileResult {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (_e) {
    return { path: filePath, risk: 0, decision: 'ALLOW' as Decision, reason: 'unreadable', line_count: 0, chunks_scanned: 0 };
  }

  const lines = content.split('\n');
  let maxRisk = 0;
  let worstDecision: Decision = 'ALLOW';
  let worstReason = '';
  let chunksScanned = 0;

  // Scan in chunks of CHUNK_SIZE characters
  for (let i = 0; i < content.length; i += CHUNK_SIZE) {
    const chunk = content.slice(i, i + CHUNK_SIZE);
    const result = classify(chunk);
    chunksScanned++;
    if (result.risk > maxRisk) {
      maxRisk = result.risk;
      worstDecision = result.decision as Decision;
      worstReason = result.reason;
    }
    if (maxRisk >= 100) break; // Can't get worse
  }

  return {
    path: filePath,
    risk: maxRisk,
    decision: worstDecision,
    reason: worstReason,
    line_count: lines.length,
    chunks_scanned: chunksScanned,
  };
}

/**
 * Scan a directory recursively.
 * Returns results only for files with WARN or DENY findings.
 */
export function scanDirectory(dirPath: string, options: { maxDepth?: number; extensions?: Set<string> } = {}): ScanFileResult[] {
  const { maxDepth = 10, extensions = TEXT_EXTENSIONS } = options;
  const results: ScanFileResult[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: string[];
    try { entries = readdirSync(dir); } catch (_e) { return; }

    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'target') continue;
      const fullPath = join(dir, entry);
      let stat;
      try { stat = statSync(fullPath); } catch (_e) { continue; }

      if (stat.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (extensions.has(extname(entry).toLowerCase())) {
        const result = scanFile(fullPath);
        if (result.risk >= 40) results.push(result);
      }
    }
  }

  walk(dirPath, 0);
  return results.sort((a, b) => b.risk - a.risk);
}

/**
 * Redact a file in-place (writes redacted content back to disk).
 * Returns the number of redactions made.
 */
export function redactFile(filePath: string): number {
  let content: string;
  try { content = readFileSync(filePath, 'utf8'); } catch (_e) { return 0; }
  const result = redact(content);
  if (result.count > 0) {
    const { writeFileSync } = require('fs');
    writeFileSync(filePath, result.text, 'utf8');
  }
  return result.count;
}
