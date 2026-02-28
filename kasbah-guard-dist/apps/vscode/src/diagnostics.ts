/**
 * diagnostics.ts — VS Code DiagnosticsCollection for inline squiggles
 *
 * Scans each line individually to locate precisely which lines contain
 * sensitive data findings, then emits VS Code diagnostics for inline
 * highlighting in the editor gutter.
 */

import * as vscode from 'vscode';
import { classify } from '@kasbah/guard';
import type { DetectionResult } from './detector';

export class KasbahDiagnostics {
  private collection: vscode.DiagnosticCollection;

  constructor(context: vscode.ExtensionContext) {
    this.collection = vscode.languages.createDiagnosticCollection('kasbah-guard');
    context.subscriptions.push(this.collection);
  }

  /**
   * Update diagnostics for a document based on a scan result.
   * For ALLOW results: clears all diagnostics.
   * For WARN/DENY: scans line-by-line to place precise squiggles.
   */
  update(document: vscode.TextDocument, result: DetectionResult): void {
    if (result.decision === 'ALLOW') {
      this.collection.set(document.uri, []);
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const severity =
      result.decision === 'DENY'
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning;

    // Scan each line to find which ones triggered the finding
    for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
      const line = document.lineAt(lineNum);
      const lineText = line.text;

      if (lineText.trim().length === 0) continue;

      try {
        const lineResult = classify(lineText);
        if (lineResult.risk >= 40) {
          const range = new vscode.Range(
            lineNum, 0,
            lineNum, lineText.length
          );

          const message = lineResult.reason
            ? `🛡️ Kasbah Guard [${lineResult.decision}]: ${lineResult.reason.split('; ')[0]} (risk: ${lineResult.risk}/100)`
            : `🛡️ Kasbah Guard [${lineResult.decision}]: Sensitive data detected (risk: ${lineResult.risk}/100)`;

          const diag = new vscode.Diagnostic(range, message, severity);
          diag.source = 'Kasbah Guard';
          diag.code = {
            value: `KASBAH_${lineResult.decision}`,
            target: vscode.Uri.parse('https://bekasbah.com/docs/decisions'),
          };
          diagnostics.push(diag);
        }
      } catch (_) {
        // Skip lines that error during classification
      }
    }

    this.collection.set(document.uri, diagnostics);
  }

  /** Clear all diagnostics for all documents */
  clear(): void {
    this.collection.clear();
  }
}
