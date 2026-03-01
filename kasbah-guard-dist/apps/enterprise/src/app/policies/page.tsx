/**
 * Kasbah Guard Enterprise — Policies
 *
 * Policy thresholds, enabled products, custom patterns, redact toggle.
 */

'use client';

import { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PolicyConfig {
  warnThreshold: number;
  denyThreshold: number;
  enabledProducts: string[];
  customPatterns: string[];
  redactOnDeny: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  const [policy, setPolicy] = useState<PolicyConfig>({
    warnThreshold: 40,
    denyThreshold: 70,
    enabledProducts: ['cli', 'vscode', 'desktop', 'mobile', 'browser'],
    customPatterns: [],
    redactOnDeny: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('kasbah_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch('https://api.bekasbah.com/api/policies', { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.policy) setPolicy(data.policy);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={styles.loading}>
        <span style={styles.loadingIcon}>🛡️</span>
        <p>Loading policies…</p>
      </div>
    );
  }

  const productLabels: Record<string, string> = {
    cli: 'CLI',
    vscode: 'VS Code',
    desktop: 'Desktop',
    mobile: 'Mobile',
    browser: 'Browser Extension',
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={{ fontSize: 28 }}>🛡️</span>
          <div>
            <h1 style={styles.h1}>Kasbah Guard Enterprise</h1>
            <p style={styles.subtitle}>Policy Configuration</p>
          </div>
        </div>
        <div style={styles.engineBadge}>
          Engine v1.0.0 · 28 invariants
        </div>
      </header>

      {/* Thresholds */}
      <section style={styles.section}>
        <h2 style={styles.h2}>Risk Thresholds</h2>
        <div style={styles.card}>
          <div style={styles.thresholdRow}>
            <div style={styles.thresholdItem}>
              <span style={{ ...styles.thresholdLabel, color: '#e09a2a' }}>WARN threshold</span>
              <span style={{ ...styles.thresholdValue, color: '#e09a2a' }}>{policy.warnThreshold}</span>
              <span style={styles.thresholdDesc}>Scans scoring at or above this value trigger a warning.</span>
            </div>
            <div style={styles.thresholdDivider} />
            <div style={styles.thresholdItem}>
              <span style={{ ...styles.thresholdLabel, color: '#e03c3c' }}>DENY threshold</span>
              <span style={{ ...styles.thresholdValue, color: '#e03c3c' }}>{policy.denyThreshold}</span>
              <span style={styles.thresholdDesc}>Scans scoring at or above this value are blocked outright.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Enabled Products */}
      <section style={styles.section}>
        <h2 style={styles.h2}>Enabled Products</h2>
        <div style={styles.card}>
          <div style={styles.productGrid}>
            {['cli', 'vscode', 'desktop', 'mobile', 'browser'].map(product => {
              const enabled = policy.enabledProducts.includes(product);
              return (
                <div key={product} style={{ ...styles.productChip, borderColor: enabled ? '#00D08440' : '#2a2a45' }}>
                  <span style={{ ...styles.productDot, background: enabled ? '#00D084' : '#555' }} />
                  <span style={{ color: enabled ? '#e8e8f0' : '#555', fontSize: 13 }}>
                    {productLabels[product] ?? product}
                  </span>
                  <span style={{ ...styles.productStatus, color: enabled ? '#00D084' : '#555' }}>
                    {enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Custom Patterns */}
      <section style={styles.section}>
        <h2 style={styles.h2}>Custom Detection Patterns</h2>
        <div style={styles.card}>
          {policy.customPatterns.length === 0 ? (
            <p style={styles.emptyText}>No custom patterns configured.</p>
          ) : (
            <ul style={styles.patternList}>
              {policy.customPatterns.map((p, i) => (
                <li key={i} style={styles.patternItem}>
                  <code style={styles.patternCode}>{p}</code>
                </li>
              ))}
            </ul>
          )}
          <button style={styles.addButton} disabled title="Invite via pattern editor coming in v1.1">
            + Add Pattern
          </button>
        </div>
      </section>

      {/* Redact on DENY */}
      <section style={styles.section}>
        <h2 style={styles.h2}>Redaction</h2>
        <div style={styles.card}>
          <div style={styles.toggleRow}>
            <div>
              <p style={styles.toggleLabel}>Redact on DENY</p>
              <p style={styles.toggleDesc}>
                When enabled, DENY-scored content is automatically redacted before it leaves the client.
              </p>
            </div>
            <div style={{
              ...styles.togglePill,
              background: policy.redactOnDeny ? '#C1440E' : '#2a2a45',
            }}>
              <span style={{
                ...styles.toggleThumb,
                transform: policy.redactOnDeny ? 'translateX(20px)' : 'translateX(2px)',
              }} />
            </div>
          </div>
          <p style={styles.toggleStatus}>
            Status: <span style={{ color: policy.redactOnDeny ? '#C1440E' : '#555', fontWeight: 600 }}>
              {policy.redactOnDeny ? 'On' : 'Off (default)'}
            </span>
          </p>
        </div>
      </section>

      {/* Back navigation */}
      <nav style={styles.nav}>
        <a href="/" style={styles.backLink}>← Back to Dashboard</a>
      </nav>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '24px 20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#e8e8f0', background: '#0f0f1a', minHeight: '100vh' },
  loading: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, color: '#888' },
  loadingIcon: { fontSize: 48 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, padding: '20px 24px', background: '#1a1a2e', borderRadius: 14, border: '1px solid #2a2a45' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  h1: { fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 },
  subtitle: { fontSize: 13, color: '#888', margin: '4px 0 0' },
  engineBadge: { fontSize: 11, color: '#555', background: '#111', padding: '4px 10px', borderRadius: 8, border: '1px solid #2a2a45' },
  section: { marginBottom: 32 },
  h2: { fontSize: 16, fontWeight: 600, color: '#ccc', marginBottom: 14 },
  card: { background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a45', padding: '20px 24px' },
  thresholdRow: { display: 'flex', alignItems: 'stretch', gap: 0 },
  thresholdItem: { flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 16px' },
  thresholdDivider: { width: 1, background: '#2a2a45', margin: '0 16px' },
  thresholdLabel: { fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em' },
  thresholdValue: { fontSize: 42, fontWeight: 800, lineHeight: 1 },
  thresholdDesc: { fontSize: 12, color: '#666', lineHeight: 1.5 },
  productGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: 12 },
  productChip: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#0f0f1a', borderRadius: 10, border: '1px solid' },
  productDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  productStatus: { fontSize: 11, fontWeight: 600, marginLeft: 4 },
  emptyText: { color: '#555', fontSize: 13, marginBottom: 16 },
  patternList: { listStyle: 'none', padding: 0, margin: '0 0 16px 0', display: 'flex', flexDirection: 'column' as const, gap: 8 },
  patternItem: { display: 'flex', alignItems: 'center' },
  patternCode: { background: '#0f0f1a', border: '1px solid #2a2a45', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#00D084', fontFamily: 'monospace' },
  addButton: { padding: '8px 16px', background: '#C1440E20', border: '1px solid #C1440E40', borderRadius: 8, color: '#C1440E', fontSize: 13, fontWeight: 600, cursor: 'not-allowed', opacity: 0.7 },
  toggleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 12 },
  toggleLabel: { fontSize: 15, fontWeight: 600, color: '#e8e8f0', margin: '0 0 4px' },
  toggleDesc: { fontSize: 12, color: '#666', margin: 0, maxWidth: 480, lineHeight: 1.6 },
  togglePill: { width: 44, height: 24, borderRadius: 12, flexShrink: 0, position: 'relative' as const, transition: 'background 0.2s', border: '1px solid #ffffff10' },
  toggleThumb: { position: 'absolute' as const, top: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' },
  toggleStatus: { fontSize: 12, color: '#555', margin: 0 },
  nav: { display: 'flex', gap: 12, marginTop: 8 },
  backLink: { padding: '10px 18px', background: '#1a1a2e', borderRadius: 8, border: '1px solid #2a2a45', color: '#ccc', textDecoration: 'none', fontSize: 14, fontWeight: 500 },
};
