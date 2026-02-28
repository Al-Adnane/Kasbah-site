/**
 * statusbar.ts — Kasbah Guard status bar item
 *
 * Shows the risk level for the currently active file/selection.
 * Clicking it runs kasbah.scanFile.
 */

import * as vscode from 'vscode';

export class KasbahStatusBar {
  private item: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = 'kasbah.scanFile';
    this.item.tooltip = 'Kasbah Guard — Click to scan current file';
    this.reset();
    this.item.show();
    context.subscriptions.push(this.item);
  }

  /**
   * Update the status bar with the latest risk score and decision.
   */
  update(risk: number, decision: string): void {
    const icon =
      decision === 'DENY' ? '🚫' :
      decision === 'WARN' ? '⚠️' : '✅';

    const color =
      decision === 'DENY' ? new vscode.ThemeColor('statusBarItem.errorForeground') :
      decision === 'WARN' ? new vscode.ThemeColor('statusBarItem.warningForeground') :
      undefined;

    this.item.text = `${icon} Kasbah ${risk}/100`;
    this.item.color = color;
    this.item.backgroundColor =
      decision === 'DENY' ? new vscode.ThemeColor('statusBarItem.errorBackground') :
      decision === 'WARN' ? new vscode.ThemeColor('statusBarItem.warningBackground') :
      undefined;
  }

  /** Reset to idle state (no scan result) */
  reset(): void {
    this.item.text = '🛡️ Kasbah';
    this.item.color = undefined;
    this.item.backgroundColor = undefined;
    this.item.tooltip = 'Kasbah Guard — Click to scan current file';
  }
}
