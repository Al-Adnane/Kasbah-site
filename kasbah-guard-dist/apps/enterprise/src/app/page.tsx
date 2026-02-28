/**
 * Kasbah Guard Enterprise — Dashboard Overview
 *
 * Main dashboard: risk event feed, summary stats, team overview.
 */

'use client';

import { useEffect, useState } from 'react';
import { kasbahClient, type AuditEvent } from '../lib/kasbah-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalScans: number;
  denyCount: number;
  warnCount: number;
  avgRisk: number;
  teamMembers: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalScans: 0,
    denyCount: 0,
    warnCount: 0,
    avgRisk: 0,
    teamMembers: 1,
  });
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('kasbah_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    Promise.all([
      fetch('https://api.bekasbah.com/api/stats', { headers }).then(r => r.ok ? r.json() : null),
      fetch('https://api.bekasbah.com/api/audit/recent', { headers }).then(r => r.ok ? r.json() : null),
    ]).then(([statsRes, auditRes]) => {
      if (statsRes?.ok) setStats(statsRes.stats);
      if (auditRes?.ok && Array.isArray(auditRes.events)) setRecentEvents(auditRes.events);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={styles.loading}>
        <span style={styles.loadingIcon}>🛡️</span>
        <p>Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={{ fontSize: 28 }}>🛡️</span>
          <div>
            <h1 style={styles.h1}>Kasbah Guard Enterprise</h1>
            <p style={styles.subtitle}>Sensitive Data Governance Dashboard</p>
          </div>
        </div>
        <div style={styles.engineBadge}>
          Engine v3.5.2 · 23 invariants
        </div>
      </header>

      {/* Stats grid */}
      <section style={styles.statsGrid}>
        <StatCard label="Total Scans" value={stats.totalScans.toLocaleString()} icon="🔍" color="#00D084" />
        <StatCard label="DENY Events" value={stats.denyCount.toString()} icon="🚫" color="#e03c3c" />
        <StatCard label="WARN Events" value={stats.warnCount.toString()} icon="⚠️" color="#e09a2a" />
        <StatCard label="Avg Risk Score" value={`${stats.avgRisk}/100`} icon="📊" color="#888" />
        <StatCard label="Team Members" value={stats.teamMembers.toString()} icon="👥" color="#7b6cf6" />
      </section>

      {/* Recent audit events */}
      <section style={styles.section}>
        <h2 style={styles.h2}>Recent Detection Events</h2>
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span>Decision</span>
            <span>Risk</span>
            <span>Reason</span>
            <span>Product</span>
            <span>User</span>
            <span>Time</span>
          </div>
          {recentEvents.map((ev) => (
            <div key={ev.id} style={styles.tableRow}>
              <DecisionBadge decision={ev.decision} />
              <span style={styles.riskNum}>{ev.risk}</span>
              <span style={styles.reason}>{ev.reason}</span>
              <span style={styles.product}>{ev.product}</span>
              <span style={styles.user}>{ev.user}</span>
              <span style={styles.time}>{formatRelative(ev.timestamp)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Navigation */}
      <nav style={styles.nav}>
        <NavLink href="/policies" label="⚙️ Policies" />
        <NavLink href="/audit" label="📋 Audit Log" />
        <NavLink href="/team" label="👥 Team" />
        <NavLink href="/proofs" label="🔐 ZK Proofs" />
        <NavLink href="/ecosystem" label="🌿 Ecosystem" />
      </nav>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div style={{ ...styles.statCard, borderColor: color + '40' }}>
      <span style={{ fontSize: 28 }}>{icon}</span>
      <span style={{ ...styles.statValue, color }}>{value}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: string }) {
  const color = decision === 'DENY' ? '#e03c3c' : decision === 'WARN' ? '#e09a2a' : '#00D084';
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
      background: color + '20', color, border: `1px solid ${color}40`
    }}>
      {decision}
    </span>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} style={styles.navLink}>{label}</a>
  );
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
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
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 32 },
  statCard: { background: '#1a1a2e', borderRadius: 12, border: '1px solid', padding: '18px 16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 },
  statValue: { fontSize: 28, fontWeight: 800 },
  statLabel: { fontSize: 12, color: '#888' },
  section: { marginBottom: 32 },
  h2: { fontSize: 16, fontWeight: 600, color: '#ccc', marginBottom: 14 },
  table: { background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a45', overflow: 'hidden' },
  tableHeader: { display: 'grid', gridTemplateColumns: '100px 60px 1fr 90px 160px 80px', padding: '10px 16px', borderBottom: '1px solid #2a2a45', fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tableRow: { display: 'grid', gridTemplateColumns: '100px 60px 1fr 90px 160px 80px', padding: '12px 16px', borderBottom: '1px solid #1a1a2e', alignItems: 'center', fontSize: 13 },
  riskNum: { fontWeight: 700, color: '#ccc' },
  reason: { color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  product: { color: '#7b6cf6', fontSize: 12 },
  user: { color: '#888', fontSize: 12 },
  time: { color: '#555', fontSize: 11 },
  nav: { display: 'flex', gap: 12 },
  navLink: { padding: '10px 18px', background: '#1a1a2e', borderRadius: 8, border: '1px solid #2a2a45', color: '#ccc', textDecoration: 'none', fontSize: 14, fontWeight: 500 },
};
