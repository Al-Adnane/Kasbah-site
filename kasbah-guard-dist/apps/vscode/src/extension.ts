/**
 * Kasbah Guard — VS Code Extension
 * Extension entry point: activation, command registration, event listeners.
 *
 * Moats wired:
 *   A — Hook paste events (intercept clipboard on paste)
 *   I — Pattern detection (via @kasbah/guard SDK)
 *   B — Tamper-detection on activation (ENGINE_VERSION check)
 */

import * as vscode from 'vscode';
import { detect } from './detector';
import { KasbahDiagnostics } from './diagnostics';
import { KasbahStatusBar } from './statusbar';
import { VERSION, ENGINE_VERSION } from '@kasbah/guard';

// Tamper-detection: verify engine version on activation (Moat B)
const EXPECTED_ENGINE = '3.6.0';

export function activate(context: vscode.ExtensionContext) {
  // ── Moat B: Tamper check ───────────────────────────────────────────────
  if (ENGINE_VERSION !== EXPECTED_ENGINE) {
    vscode.window.showWarningMessage(
      `⚠️ Kasbah Guard: engine version mismatch (expected ${EXPECTED_ENGINE}, got ${ENGINE_VERSION}). Detection may be degraded.`
    );
  }

  const config = () => vscode.workspace.getConfiguration('kasbah');
  const diagnostics = new KasbahDiagnostics(context);
  const statusBar = new KasbahStatusBar(context);

  vscode.window.showInformationMessage(
    `🛡️ Kasbah Guard v${VERSION} active — Engine ${ENGINE_VERSION}`
  );

  // ── Command: Scan current file ─────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('kasbah.scanFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Kasbah: No active file to scan.');
        return;
      }
      const text = editor.document.getText();
      const result = await detect(text);
      diagnostics.update(editor.document, result);
      statusBar.update(result.risk, result.decision);

      if (result.decision === 'DENY') {
        vscode.window.showErrorMessage(
          `🚫 Kasbah Guard: DENY — Risk ${result.risk}/100. ${result.reason.split('; ')[0]}`
        );
      } else if (result.decision === 'WARN') {
        vscode.window.showWarningMessage(
          `⚠️ Kasbah Guard: WARN — Risk ${result.risk}/100. ${result.reason.split('; ')[0]}`
        );
      } else {
        vscode.window.showInformationMessage(
          `✅ Kasbah Guard: Clean — Risk ${result.risk}/100`
        );
      }
    })
  );

  // ── Command: Redact selection ──────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('kasbah.redactSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Kasbah: No text selected to redact.');
        return;
      }
      const text = editor.document.getText(editor.selection);
      const { redact } = await import('@kasbah/guard');
      const redacted = redact(text);
      editor.edit((eb) => eb.replace(editor.selection, redacted));
      vscode.window.showInformationMessage('✅ Kasbah Guard: Selection redacted.');
    })
  );

  // ── Command: Scan clipboard ────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('kasbah.scanClipboard', async () => {
      const text = await vscode.env.clipboard.readText();
      if (!text) {
        vscode.window.showInformationMessage('Kasbah: Clipboard is empty.');
        return;
      }
      const result = await detect(text);
      statusBar.update(result.risk, result.decision);
      if (result.risk >= config().get<number>('threshold', 40)) {
        vscode.window.showWarningMessage(
          `⚠️ Kasbah Guard: Clipboard contains sensitive data — Risk ${result.risk}/100`
        );
      } else {
        vscode.window.showInformationMessage(
          `✅ Kasbah Guard: Clipboard looks clean — Risk ${result.risk}/100`
        );
      }
    })
  );

  // ── Command: Clear diagnostics ─────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('kasbah.clearDiagnostics', () => {
      diagnostics.clear();
      statusBar.reset();
    })
  );

  // ── On save: scan entire file (if warnOnSave enabled) ─────────────────
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (!config().get<boolean>('enabled', true)) return;
      if (!config().get<boolean>('warnOnSave', true)) return;

      const text = doc.getText();
      if (text.length === 0) return;

      const result = await detect(text);
      diagnostics.update(doc, result);
      statusBar.update(result.risk, result.decision);
    })
  );

  // ── On active editor change: update status bar ─────────────────────────
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor || !config().get<boolean>('enabled', true)) {
        statusBar.reset();
        return;
      }
      // Lightweight scan on editor switch (first 2KB only)
      const snippet = editor.document.getText().slice(0, 2048);
      if (!snippet.trim()) { statusBar.reset(); return; }
      const result = await detect(snippet);
      statusBar.update(result.risk, result.decision);
    })
  );

  // ── Moat A: Paste hook ─────────────────────────────────────────────────
  // VS Code doesn't expose a direct paste event; we detect via clipboard
  // polling on focus gain (best-effort without native hook access).
  let lastClipboard = '';
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(async (state) => {
      if (!state.focused) return;
      if (!config().get<boolean>('warnOnPaste', true)) return;
      const current = await vscode.env.clipboard.readText();
      if (current && current !== lastClipboard) {
        lastClipboard = current;
        const result = await detect(current);
        if (result.risk >= config().get<number>('threshold', 40)) {
          vscode.window.showWarningMessage(
            `⚠️ Kasbah Guard: Clipboard may contain sensitive data — Risk ${result.risk}/100`,
            'View Details'
          ).then((choice) => {
            if (choice === 'View Details') {
              vscode.commands.executeCommand('kasbah.scanClipboard');
            }
          });
        }
      }
    })
  );
}

export function deactivate() {
  // Status bar and diagnostics auto-dispose via context.subscriptions
}
