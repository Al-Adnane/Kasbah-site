<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';

  // ─── State ───────────────────────────────────────────────────────────────
  let inputText = '';
  let scanning = false;
  let result: {
    risk: number;
    decision: string;
    reason: string;
    redacted?: string;
  } | null = null;

  // ─── Risk color helpers ───────────────────────────────────────────────────
  $: riskColor =
    !result ? '#888' :
    result.risk >= 70 ? '#e03c3c' :
    result.risk >= 40 ? '#e09a2a' : '#00D084';

  $: riskLabel =
    !result ? '' :
    result.risk >= 70 ? 'HIGH RISK' :
    result.risk >= 40 ? 'MODERATE' : 'SAFE';

  // ─── Scan via Tauri IPC (Moat O three-gate + policy_preflight) ────────────
  async function scan() {
    if (!inputText.trim()) return;
    scanning = true;
    result = null;
    try {
      result = await invoke<{ risk: number; decision: string; reason: string }>(
        'preflight_text',
        { text: inputText }
      );

      // Haptic feedback on DENY (Moat mobile affordance)
      if (result && result.decision === 'DENY') {
        try {
          const { vibrate } = await import('@tauri-apps/plugin-haptics');
          await vibrate(300);
        } catch (_) {
          // Haptics unavailable — silently skip
        }
      }
    } finally {
      scanning = false;
    }
  }

  // ─── Redact via Tauri IPC (Moat: redact_content) ─────────────────────────
  async function redact() {
    if (!inputText.trim()) return;
    try {
      const r = await invoke<{ redacted: string; risk: number; decision: string; reason: string }>(
        'redact_content',
        { text: inputText }
      );
      result = r;
      inputText = r.redacted;
    } catch (e) {
      console.error('Redact failed', e);
    }
  }

  // ─── Clear ────────────────────────────────────────────────────────────────
  function clear() {
    inputText = '';
    result = null;
  }

  // ─── Accept shared text (share sheet / intent) ────────────────────────────
  // The share extension handler in lib.rs emits a "shared-text" event
  import { listen } from '@tauri-apps/api/event';
  listen<string>('shared-text', (event) => {
    inputText = event.payload;
    scan();
  });
</script>

<main class="container">
  <!-- Header -->
  <div class="header">
    <span class="logo">🛡️</span>
    <h1>Kasbah Guard</h1>
    <p class="subtitle">Sensitive data scanner</p>
  </div>

  <!-- Input area -->
  <div class="input-section">
    <textarea
      bind:value={inputText}
      placeholder="Paste text to scan — or use the share sheet to send text from any app…"
      rows="8"
      class="scan-input"
    />
  </div>

  <!-- Action buttons -->
  <div class="actions">
    <button class="btn btn-primary" on:click={scan} disabled={scanning || !inputText.trim()}>
      {scanning ? 'Scanning…' : '🔍 Scan'}
    </button>
    <button class="btn btn-secondary" on:click={redact} disabled={scanning || !inputText.trim()}>
      ✂️ Redact
    </button>
    <button class="btn btn-ghost" on:click={clear} disabled={!inputText && !result}>
      Clear
    </button>
  </div>

  <!-- Result badge -->
  {#if result}
    <div class="result-card" style="--risk-color: {riskColor}">
      <div class="verdict">
        <span class="verdict-icon">
          {result.decision === 'DENY' ? '🚫' : result.decision === 'WARN' ? '⚠️' : '✅'}
        </span>
        <span class="verdict-label" style="color: {riskColor}">{riskLabel}</span>
        <span class="risk-score">{result.risk}/100</span>
      </div>

      <!-- Risk bar -->
      <div class="risk-bar-track">
        <div class="risk-bar-fill" style="width: {result.risk}%; background: {riskColor}" />
      </div>

      {#if result.reason && result.reason !== 'Low risk'}
        <p class="reason">{result.reason.split('; ').slice(0, 3).join(' · ')}</p>
      {/if}

      <p class="decision-chip" style="background: {riskColor}20; color: {riskColor}; border: 1px solid {riskColor}40">
        {result.decision}
      </p>
    </div>
  {/if}

  <!-- Engine badge -->
  <div class="engine-badge">
    Powered by Kasbah Detection Engine v1.0.0 · 28 invariants
  </div>
</main>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0f0f1a;
    color: #e8e8f0;
    min-height: 100vh;
  }

  .container {
    max-width: 480px;
    margin: 0 auto;
    padding: 24px 16px env(safe-area-inset-bottom, 24px);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .header {
    text-align: center;
    padding-top: env(safe-area-inset-top, 16px);
  }
  .logo { font-size: 48px; }
  h1 { font-size: 24px; font-weight: 700; color: #fff; margin-top: 8px; }
  .subtitle { font-size: 13px; color: #888; margin-top: 4px; }

  .scan-input {
    width: 100%;
    background: #1a1a2e;
    border: 1.5px solid #2a2a45;
    border-radius: 12px;
    color: #e8e8f0;
    font-size: 15px;
    line-height: 1.6;
    padding: 14px 16px;
    resize: none;
    outline: none;
    transition: border-color 0.2s;
  }
  .scan-input:focus { border-color: #C1440E; }

  .actions { display: flex; gap: 10px; }
  .btn {
    flex: 1;
    padding: 14px 0;
    border-radius: 10px;
    border: none;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
  }
  .btn:active { transform: scale(0.97); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-primary { background: #C1440E; color: #fff; }
  .btn-secondary { background: #1a1a2e; color: #C1440E; border: 1.5px solid #C1440E; flex: 0.8; }
  .btn-ghost { background: transparent; color: #888; flex: 0.5; font-size: 14px; }

  .result-card {
    background: #1a1a2e;
    border: 1.5px solid var(--risk-color, #444);
    border-radius: 14px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .verdict {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .verdict-icon { font-size: 28px; }
  .verdict-label { font-size: 18px; font-weight: 700; flex: 1; }
  .risk-score { font-size: 22px; font-weight: 800; color: #fff; }

  .risk-bar-track {
    height: 8px;
    background: #2a2a45;
    border-radius: 4px;
    overflow: hidden;
  }
  .risk-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
  }

  .reason { font-size: 13px; color: #aaa; line-height: 1.5; }

  .decision-chip {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    align-self: flex-start;
  }

  .engine-badge {
    text-align: center;
    font-size: 11px;
    color: #444;
    padding: 8px 0;
  }
</style>
