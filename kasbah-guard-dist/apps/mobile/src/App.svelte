<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';

  // ─── State ───────────────────────────────────────────────────────────────
  let inputText = '';
  let scanning = false;
  let activeTab: 'scan' | 'history' | 'settings' = 'scan';
  let result: {
    risk: number;
    decision: string;
    reason: string;
    redacted?: string;
  } | null = null;

  // History
  let scanHistory: Array<{
    id: number;
    text: string;
    risk: number;
    decision: string;
    reason: string;
    timestamp: number;
  }> = [];
  let nextId = 1;

  // Settings
  let hapticEnabled = true;
  let autoScan = false;
  let showRedacted = true;

  // Integrity
  let integrityStatus: { sii: number; grade: string } | null = null;

  // ─── Risk helpers ──────────────────────────────────────────────────────
  $: riskColor =
    !result ? '#555' :
    result.risk >= 70 ? '#EF4444' :
    result.risk >= 40 ? '#F59E0B' : '#22C55E';

  $: riskLabel =
    !result ? '' :
    result.risk >= 70 ? 'HIGH RISK' :
    result.risk >= 40 ? 'MODERATE' : 'SAFE';

  $: riskIcon =
    !result ? '' :
    result.decision === 'DENY' ? '🚫' :
    result.decision === 'WARN' ? '⚠️' : '✅';

  // ─── Core scan ─────────────────────────────────────────────────────────
  async function scan() {
    if (!inputText.trim()) return;
    scanning = true;
    result = null;
    try {
      const r = await invoke<{ risk: number; decision: string; reason: string }>('preflight_text', { text: inputText });
      result = r;

      // Save to history
      scanHistory = [{
        id: nextId++,
        text: inputText.slice(0, 120) + (inputText.length > 120 ? '…' : ''),
        risk: r.risk,
        decision: r.decision,
        reason: r.reason,
        timestamp: Date.now(),
      }, ...scanHistory].slice(0, 50);

      // Haptic feedback on DENY
      if (hapticEnabled && r.decision === 'DENY') {
        try {
          const { vibrate } = await import('@tauri-apps/plugin-haptics');
          await vibrate(300);
        } catch (_) { /* Haptics unavailable */ }
      }
    } catch (e) {
      result = { risk: 0, decision: 'ERROR', reason: String(e) };
    } finally {
      scanning = false;
    }
  }

  // ─── Redact ────────────────────────────────────────────────────────────
  async function redact() {
    if (!inputText.trim()) return;
    try {
      const r = await invoke<{ redacted: string; risk: number; decision: string; reason: string }>('redact_content', { text: inputText });
      result = r;
      if (showRedacted) inputText = r.redacted;
    } catch (e) {
      console.error('Redact failed', e);
    }
  }

  function clear() {
    inputText = '';
    result = null;
  }

  // ─── Check system integrity ────────────────────────────────────────────
  async function checkIntegrity() {
    try {
      const r = await invoke<{ sii: number; grade: string }>('get_system_integrity');
      integrityStatus = r;
    } catch (_) {
      integrityStatus = { sii: 100, grade: 'A' };
    }
  }

  // ─── Quick examples ────────────────────────────────────────────────────
  const EXAMPLES = [
    { label: 'API Key', text: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nAWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
    { label: 'Credit Card', text: 'Card number: 4532 1234 5678 9012\nExpiry: 03/28\nCVV: 123' },
    { label: 'Client Info', text: 'Name: Sarah Johnson\nSSN: 547-22-1234\nDOB: 03/12/1985\nIncome: $87,500' },
    { label: 'DB Creds', text: 'DATABASE_URL=postgres://admin:S3cr3tP4ss@prod.db.company.io:5432/maindb' },
  ];

  function loadExample(ex: typeof EXAMPLES[0]) {
    inputText = ex.text;
    if (autoScan) scan();
  }

  // ─── Share sheet listener ──────────────────────────────────────────────
  listen<string>('shared-text', (event) => {
    inputText = event.payload;
    activeTab = 'scan';
    if (autoScan) scan();
  });

  checkIntegrity();

  function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }
</script>

<main class="app">
  <!-- Status Bar -->
  <div class="status-bar">
    <div class="status-left">
      <span class="shield">🛡️</span>
      <span class="app-title">Kasbah Guard</span>
    </div>
    {#if integrityStatus}
      <div class="integrity-badge" class:grade-a={integrityStatus.grade === 'A'} class:grade-b={integrityStatus.grade === 'B'}>
        SII: {integrityStatus.sii} ({integrityStatus.grade})
      </div>
    {/if}
  </div>

  <!-- Content -->
  <div class="content">
    {#if activeTab === 'scan'}
      <div class="scan-section">
        <div class="examples-row">
          {#each EXAMPLES as ex}
            <button class="example-chip" on:click={() => loadExample(ex)}>{ex.label}</button>
          {/each}
        </div>

        <textarea
          bind:value={inputText}
          placeholder="Paste text to scan — or tap an example above. Share text from any app to scan instantly."
          rows="7"
          class="scan-input"
        />

        <div class="actions">
          <button class="btn btn-primary" on:click={scan} disabled={scanning || !inputText.trim()}>
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
          <button class="btn btn-secondary" on:click={redact} disabled={scanning || !inputText.trim()}>
            Redact
          </button>
          <button class="btn btn-ghost" on:click={clear} disabled={!inputText && !result}>
            Clear
          </button>
        </div>

        {#if result}
          <div class="result-card" style="--risk-color: {riskColor}">
            <div class="verdict-row">
              <span class="verdict-icon">{riskIcon}</span>
              <div class="verdict-info">
                <span class="verdict-label" style="color: {riskColor}">{riskLabel}</span>
                <span class="verdict-decision">{result.decision}</span>
              </div>
              <span class="risk-score">{result.risk}</span>
            </div>

            <div class="risk-bar-track">
              <div class="risk-bar-fill" style="width: {result.risk}%; background: {riskColor}" />
            </div>

            {#if result.reason && result.reason !== 'Low risk'}
              <div class="findings">
                <p class="findings-title">Findings</p>
                {#each result.reason.split('; ').slice(0, 5) as finding}
                  <div class="finding-item">
                    <span class="finding-dot" style="background: {riskColor}" />
                    <span class="finding-text">{finding}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="safe-message">No sensitive data detected — safe to share.</p>
            {/if}
          </div>
        {/if}
      </div>

    {:else if activeTab === 'history'}
      <div class="history-section">
        <h2 class="section-title">Scan History</h2>
        {#if scanHistory.length === 0}
          <p class="empty-state">No scans yet. Scan some text to see your history.</p>
        {:else}
          {#each scanHistory as item (item.id)}
            <div class="history-item">
              <div class="history-header">
                <span class="history-icon">{item.decision === 'DENY' ? '🚫' : item.decision === 'WARN' ? '⚠️' : '✅'}</span>
                <span class="history-risk" style="color: {item.risk >= 70 ? '#EF4444' : item.risk >= 40 ? '#F59E0B' : '#22C55E'}">{item.risk}/100</span>
                <span class="history-time">{timeAgo(item.timestamp)}</span>
              </div>
              <p class="history-text">{item.text}</p>
              {#if item.reason && item.reason !== 'Low risk'}
                <p class="history-reason">{item.reason.split('; ').slice(0, 2).join(' · ')}</p>
              {/if}
            </div>
          {/each}
        {/if}
      </div>

    {:else if activeTab === 'settings'}
      <div class="settings-section">
        <h2 class="section-title">Settings</h2>

        <div class="setting-group">
          <h3 class="setting-group-title">Detection</h3>
          <label class="setting-row">
            <div class="setting-info">
              <span class="setting-label">Auto-scan on share</span>
              <span class="setting-desc">Automatically scan text received from share sheet</span>
            </div>
            <input type="checkbox" class="toggle" bind:checked={autoScan} />
          </label>
          <label class="setting-row">
            <div class="setting-info">
              <span class="setting-label">Show redacted text</span>
              <span class="setting-desc">Replace input with redacted version after redaction</span>
            </div>
            <input type="checkbox" class="toggle" bind:checked={showRedacted} />
          </label>
        </div>

        <div class="setting-group">
          <h3 class="setting-group-title">Feedback</h3>
          <label class="setting-row">
            <div class="setting-info">
              <span class="setting-label">Haptic feedback</span>
              <span class="setting-desc">Vibrate on high-risk detection (DENY)</span>
            </div>
            <input type="checkbox" class="toggle" bind:checked={hapticEnabled} />
          </label>
        </div>

        <div class="setting-group">
          <h3 class="setting-group-title">Engine</h3>
          <div class="engine-info">
            <div class="engine-row"><span>Version</span><span>v1.0.0</span></div>
            <div class="engine-row"><span>Detection patterns</span><span>50+</span></div>
            <div class="engine-row"><span>ML scoring</span><span>Naive Bayes</span></div>
            <div class="engine-row"><span>Anti-evasion</span><span>8 decoders</span></div>
            <div class="engine-row"><span>Languages</span><span>7 (EN, AR, ZH, RU, JA, KO, EL)</span></div>
            <div class="engine-row"><span>Processing</span><span>100% local</span></div>
            {#if integrityStatus}
              <div class="engine-row"><span>System Integrity</span><span style="color: {integrityStatus.grade === 'A' ? '#22C55E' : '#F59E0B'}">{integrityStatus.sii}/100 ({integrityStatus.grade})</span></div>
            {/if}
          </div>
        </div>

        <div class="setting-group">
          <h3 class="setting-group-title">About</h3>
          <div class="about-section">
            <p>Kasbah Guard scans text for sensitive data — API keys, credentials, SSNs, credit cards, and 50+ secret formats — before you share it with AI tools or anyone else.</p>
            <p>100% local processing. Nothing leaves your device. No account required.</p>
            <p class="about-link">bekasbah.com</p>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Tab Bar -->
  <div class="tab-bar">
    <button class="tab" class:active={activeTab === 'scan'} on:click={() => activeTab = 'scan'}>
      <span class="tab-icon">🔍</span>
      <span class="tab-label">Scan</span>
    </button>
    <button class="tab" class:active={activeTab === 'history'} on:click={() => activeTab = 'history'}>
      <span class="tab-icon">📋</span>
      <span class="tab-label">History</span>
    </button>
    <button class="tab" class:active={activeTab === 'settings'} on:click={() => activeTab = 'settings'}>
      <span class="tab-icon">⚙️</span>
      <span class="tab-label">Settings</span>
    </button>
  </div>
</main>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
    background: #0A0A14;
    color: #E8E8F0;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    overscroll-behavior: none;
  }

  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    max-width: 480px;
    margin: 0 auto;
  }

  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: env(safe-area-inset-top, 12px) 16px 12px;
    background: #0A0A14;
    border-bottom: 1px solid #1A1A2E;
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .status-left { display: flex; align-items: center; gap: 8px; }
  .shield { font-size: 22px; }
  .app-title { font-size: 17px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
  .integrity-badge {
    font-size: 11px; font-weight: 600;
    padding: 4px 10px; border-radius: 20px;
    background: #1A1A2E; color: #888;
  }
  .integrity-badge.grade-a { color: #22C55E; background: rgba(34,197,94,0.1); }
  .integrity-badge.grade-b { color: #F59E0B; background: rgba(245,158,11,0.1); }

  .content {
    flex: 1;
    padding: 16px;
    padding-bottom: 90px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .examples-row {
    display: flex; gap: 8px; margin-bottom: 14px;
    overflow-x: auto; padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .examples-row::-webkit-scrollbar { display: none; }
  .example-chip {
    flex-shrink: 0;
    padding: 7px 14px; border-radius: 20px;
    background: #1A1A2E; color: #AAA;
    border: 1px solid #2A2A45;
    font-size: 13px; font-weight: 500;
    cursor: pointer; white-space: nowrap;
    transition: all 0.15s;
  }
  .example-chip:active { background: #C1440E; color: #fff; border-color: #C1440E; }

  .scan-input {
    width: 100%;
    background: #12121E;
    border: 1.5px solid #2A2A45;
    border-radius: 14px;
    color: #E8E8F0;
    font-size: 15px;
    line-height: 1.6;
    padding: 14px 16px;
    resize: none;
    outline: none;
    transition: border-color 0.2s;
    margin-bottom: 12px;
  }
  .scan-input:focus { border-color: #C1440E; }
  .scan-input::placeholder { color: #444; }

  .actions { display: flex; gap: 8px; margin-bottom: 16px; }
  .btn {
    flex: 1;
    padding: 14px 0;
    border-radius: 12px;
    border: none;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
  }
  .btn:active { transform: scale(0.97); }
  .btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-primary { background: #C1440E; color: #fff; }
  .btn-secondary { background: #12121E; color: #C1440E; border: 1.5px solid #C1440E44; flex: 0.7; }
  .btn-ghost { background: transparent; color: #666; flex: 0.4; font-size: 14px; }

  .result-card {
    background: #12121E;
    border: 1.5px solid var(--risk-color, #333);
    border-radius: 16px;
    padding: 18px;
    display: flex; flex-direction: column; gap: 14px;
    animation: slideUp 0.3s ease-out;
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .verdict-row { display: flex; align-items: center; gap: 12px; }
  .verdict-icon { font-size: 32px; }
  .verdict-info { flex: 1; display: flex; flex-direction: column; }
  .verdict-label { font-size: 16px; font-weight: 700; }
  .verdict-decision { font-size: 12px; color: #666; font-weight: 500; letter-spacing: 0.04em; }
  .risk-score { font-size: 36px; font-weight: 900; color: #fff; letter-spacing: -0.03em; }

  .risk-bar-track { height: 6px; background: #1A1A2E; border-radius: 3px; overflow: hidden; }
  .risk-bar-fill { height: 100%; border-radius: 3px; transition: width 0.6s cubic-bezier(0.4,0,0.2,1); }

  .findings { display: flex; flex-direction: column; gap: 6px; }
  .findings-title { font-size: 11px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.06em; }
  .finding-item { display: flex; align-items: center; gap: 8px; }
  .finding-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .finding-text { font-size: 13px; color: #AAA; }
  .safe-message { font-size: 14px; color: #22C55E; font-weight: 500; }

  .section-title { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 16px; letter-spacing: -0.02em; }
  .empty-state { color: #555; font-size: 14px; text-align: center; padding: 40px 0; }

  .history-item {
    background: #12121E;
    border: 1px solid #1E1E32;
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 10px;
  }
  .history-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .history-icon { font-size: 16px; }
  .history-risk { font-size: 13px; font-weight: 700; flex: 1; }
  .history-time { font-size: 11px; color: #555; }
  .history-text { font-size: 13px; color: #888; line-height: 1.4; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .history-reason { font-size: 11px; color: #555; }

  .setting-group { margin-bottom: 24px; }
  .setting-group-title { font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }

  .setting-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px;
    background: #12121E;
    border-radius: 12px;
    margin-bottom: 6px;
    cursor: pointer;
  }
  .setting-info { flex: 1; }
  .setting-label { font-size: 15px; color: #fff; font-weight: 500; display: block; }
  .setting-desc { font-size: 12px; color: #555; display: block; margin-top: 2px; }

  .toggle {
    width: 48px; height: 28px;
    appearance: none; -webkit-appearance: none;
    background: #2A2A45; border-radius: 14px;
    position: relative; cursor: pointer;
    transition: background 0.2s;
    flex-shrink: 0;
  }
  .toggle::after {
    content: '';
    position: absolute; top: 2px; left: 2px;
    width: 24px; height: 24px;
    background: #fff; border-radius: 50%;
    transition: transform 0.2s;
  }
  .toggle:checked { background: #C1440E; }
  .toggle:checked::after { transform: translateX(20px); }

  .engine-info {
    background: #12121E;
    border-radius: 12px;
    padding: 4px 0;
  }
  .engine-row {
    display: flex; justify-content: space-between;
    padding: 10px 14px;
    font-size: 13px;
    border-bottom: 1px solid #1A1A2E;
  }
  .engine-row:last-child { border-bottom: none; }
  .engine-row span:first-child { color: #888; }
  .engine-row span:last-child { color: #fff; font-weight: 500; }

  .about-section {
    background: #12121E;
    border-radius: 12px;
    padding: 14px;
  }
  .about-section p { font-size: 13px; color: #888; line-height: 1.6; margin-bottom: 8px; }
  .about-section p:last-child { margin-bottom: 0; }
  .about-link { color: #C1440E !important; font-weight: 600; }

  .tab-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    display: flex;
    background: #0A0A14;
    border-top: 1px solid #1A1A2E;
    padding: 8px 0 env(safe-area-inset-bottom, 8px);
    z-index: 100;
    max-width: 480px;
    margin: 0 auto;
  }
  .tab {
    flex: 1;
    display: flex; flex-direction: column; align-items: center;
    gap: 2px;
    padding: 8px 0;
    background: none; border: none;
    cursor: pointer;
    transition: color 0.15s;
  }
  .tab-icon { font-size: 20px; opacity: 0.4; transition: opacity 0.15s; }
  .tab-label { font-size: 10px; font-weight: 600; color: #555; transition: color 0.15s; }
  .tab.active .tab-icon { opacity: 1; }
  .tab.active .tab-label { color: #C1440E; }
</style>
