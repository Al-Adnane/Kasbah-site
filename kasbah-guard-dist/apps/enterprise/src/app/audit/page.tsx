/**
 * Kasbah Guard Enterprise — Audit Log
 *
 * Full audit event table with decision filter.
 */

'use client';

import { useEffect, useState } from 'react';
import { type AuditEvent } from '../../lib/kasbah-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterDecision = 'ALL' | 'DENY' | 'WARN' | 'ALLOW';

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterDecision>('ALL');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('kasbah_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch('https://api.bekasbah.com/api/audit/recent', { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.ok && Array.isArray(data.events)) setEvents(data.events);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={styles.loading}>
        <span style={styles.loadingIcon}>🛡️</span>
        <p>Loading audit log…</p>
      </div>
    );
  }

  const filters: FilterDecision[] = ['ALL', 'DENY', 'WARN', 'ALLOW'];
  const filtered = filter === 'ALL' ? events : events.filter(e => e.decision === filter);

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={{ fontSize: 28 }}>🛡️</span>
          <div>
            <h1 style={styles.h1}>Kasbah Guard Enterprise</h1>
            <p style={styles.subtitle}>Audit Log</p>
          </div>
        </div>
        <div style={styles.engineBadge}>
          Engine v1.0.0 · 28 invariants
        </div>
      </header>

      {/* Filter bar */}
      <section style={styles.filterBar}>
        <span style={styles.filterLabel}>Filter by decision:</span>
        <div style={styles.filterButtons}>
          {filters.map(f => {
            const active = filter === f;
            const color = f === 'DENY' ? '#e03c3c' : f === 'WARN' ? '#e09a2a' : f === 'ALLOW' ? '#00D084' : '#7b6cf6';
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  ...styles.filterBtn,
                  background: active ? color + '20' : '#1a1a2e',
                  borderColor: active ? color + '60' : '#2a2a45',
                  color: active ? color : '#888',
                  fontWeight: active ? 700 : 500,
                }}
              >
                {f}
              </button>
            );
          })}
        </div>
        <span style={styles.eventCount}>{filtered.length} event{filtered.length !== 1 ? 's' : ''}</span>
      </section>

      {/* Audit table */}
      <section style={styles.section}>
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span>Decision</span>
            <span>Risk</span>
            <span>Reason</span>
            <span>Product</span>
            <span>User</span>
            <span>Time</span>
          </div>
          {filtered.length === 0 ? (
            <div style={styles.emptyRow}>
              No events match the selected filter.
            </div>
          ) : (
            filtered.map((ev) => (
              <div key={ev.id} style={styles.tableRow}>
                <DecisionBadge decision={ev.decision} />
                <RiskCell risk={ev.risk} />
                <span style={styles.reason}>{ev.reason}</span>
                <span style={styles.product}>{ev.product}</span>
                <span style={styles.user}>{ev.user}</span>
                <span style={styles.time}>{formatRelative(ev.timestamp)}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Back navigation */}
      <nav style={styles.nav}>
        <a href="/" style={styles.backLink}>← Back to Dashboard</a>
      </nav>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DecisionBadge({ decision }: { decision: string }) {
  const color = decision === 'DENY' ? '#e03c3c' : decision === 'WARN' ? '#e09a2a' : '#00D084';
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
      background: color + '20', color, border: `1px solid ${color}40`,
      whiteSpace: 'nowrap' as const,
    }}>
      {decision}
    </span>
  );
}

function RiskCell({ risk }: { risk: number }) {
  const color = risk >= 70 ? '#e03c3c' : risk >= 40 ? '#e09a2a' : '#00D084';
  return <span style={{ fontWeight: 700, color }}>{risk}</span>;
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
  filterBar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' as const },
  filterLabel: { fontSize: 13, color: '#666', flexShrink: 0 },
  filterButtons: { display: 'flex', gap: 8 },
  filterBtn: { padding: '6px 14px', borderRadius: 8, border: '1px solid', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '0.04em' },
  eventCount: { fontSize: 12, color: '#555', marginLeft: 'auto' },
  section: { marginBottom: 32 },
  table: { background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a45', overflow: 'hidden' },
  tableHeader: { display: 'grid', gridTemplateColumns: '100px 60px 1fr 90px 160px 80px', padding: '10px 16px', borderBottom: '1px solid #2a2a45', fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  tableRow: { display: 'grid', gridTemplateColumns: '100px 60px 1fr 90px 160px 80px', padding: '12px 16px', borderBottom: '1px solid #12121f', alignItems: 'center', fontSize: 13 },
  emptyRow: { padding: '32px 16px', textAlign: 'center' as const, color: '#555', fontSize: 13 },
  reason: { color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  product: { color: '#7b6cf6', fontSize: 12 },
  user: { color: '#888', fontSize: 12 },
  time: { color: '#555', fontSize: 11 },
  nav: { display: 'flex', gap: 12, marginTop: 8 },
  backLink: { padding: '10px 18px', background: '#1a1a2e', borderRadius: 8, border: '1px solid #2a2a45', color: '#ccc', textDecoration: 'none', fontSize: 14, fontWeight: 500 },
};
