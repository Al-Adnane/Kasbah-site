/**
 * Kasbah Guard Enterprise — Team Management
 *
 * Team member list with avatar initials, role/plan badges, invite placeholder.
 */

'use client';

import { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  plan: string;
  joinedAt: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteBanner, setInviteBanner] = useState(false);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('kasbah_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch('https://api.bekasbah.com/api/team', { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.ok && Array.isArray(data.members)) setMembers(data.members);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={styles.loading}>
        <span style={styles.loadingIcon}>🛡️</span>
        <p>Loading team…</p>
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
            <p style={styles.subtitle}>Team Management</p>
          </div>
        </div>
        <div style={styles.engineBadge}>
          Engine v3.5.2 · 23 invariants
        </div>
      </header>

      {/* Invite banner */}
      {inviteBanner && (
        <div style={styles.banner}>
          <span>Invite via email is coming in v1.1.</span>
          <button onClick={() => setInviteBanner(false)} style={styles.bannerClose}>x</button>
        </div>
      )}

      {/* Section header with invite button */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>
            Team Members
            <span style={styles.memberCount}>{members.length}</span>
          </h2>
          <button
            style={styles.inviteBtn}
            onClick={() => setInviteBanner(true)}
          >
            + Invite Member
          </button>
        </div>

        {members.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>No team members found.</p>
            <p style={styles.emptySubtext}>Data is loaded from api.bekasbah.com/api/team.</p>
          </div>
        ) : (
          <div style={styles.memberGrid}>
            {members.map(member => (
              <MemberCard key={member.id} member={member} />
            ))}
          </div>
        )}
      </section>

      {/* Back navigation */}
      <nav style={styles.nav}>
        <a href="/" style={styles.backLink}>← Back to Dashboard</a>
      </nav>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MemberCard({ member }: { member: TeamMember }) {
  const initials = member.name
    ? member.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : member.email.slice(0, 2).toUpperCase();

  const roleColor = member.role === 'admin' ? '#C1440E' : member.role === 'member' ? '#7b6cf6' : '#888';
  const planColor = member.plan === 'enterprise' ? '#00D084' : member.plan === 'pro' ? '#7b6cf6' : '#555';

  return (
    <div style={styles.memberCard}>
      <div style={styles.avatar}>
        {initials}
      </div>
      <div style={styles.memberInfo}>
        <div style={styles.memberName}>{member.name || '—'}</div>
        <div style={styles.memberEmail}>{member.email}</div>
        <div style={styles.badges}>
          <span style={{ ...styles.badge, background: planColor + '20', color: planColor, borderColor: planColor + '40' }}>
            {member.plan ?? 'free'}
          </span>
          <span style={{ ...styles.badge, background: roleColor + '20', color: roleColor, borderColor: roleColor + '40' }}>
            {member.role}
          </span>
        </div>
        <div style={styles.joinDate}>
          Joined {formatDate(member.joinedAt)}
        </div>
      </div>
    </div>
  );
}

function formatDate(ts: string): string {
  if (!ts) return 'unknown';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
  banner: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#C1440E20', border: '1px solid #C1440E40', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#C1440E' },
  bannerClose: { background: 'none', border: 'none', color: '#C1440E', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 },
  section: { marginBottom: 32 },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  h2: { fontSize: 16, fontWeight: 600, color: '#ccc', margin: 0, display: 'flex', alignItems: 'center', gap: 10 },
  memberCount: { fontSize: 12, background: '#2a2a45', color: '#888', borderRadius: 10, padding: '2px 8px', fontWeight: 500 },
  inviteBtn: { padding: '8px 16px', background: '#C1440E', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  memberGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  memberCard: { background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a45', padding: '20px', display: 'flex', alignItems: 'flex-start', gap: 16 },
  avatar: { width: 48, height: 48, borderRadius: '50%', background: '#C1440E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0, letterSpacing: '0.04em' },
  memberInfo: { flex: 1, minWidth: 0 },
  memberName: { fontSize: 15, fontWeight: 600, color: '#e8e8f0', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  memberEmail: { fontSize: 12, color: '#888', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  badges: { display: 'flex', gap: 6, marginBottom: 10 },
  badge: { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, border: '1px solid', letterSpacing: '0.06em', textTransform: 'uppercase' as const },
  joinDate: { fontSize: 11, color: '#555' },
  emptyState: { background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a45', padding: '40px 24px', textAlign: 'center' as const },
  emptyText: { color: '#666', fontSize: 14, margin: '0 0 6px' },
  emptySubtext: { color: '#444', fontSize: 12, margin: 0 },
  nav: { display: 'flex', gap: 12, marginTop: 8 },
  backLink: { padding: '10px 18px', background: '#1a1a2e', borderRadius: 8, border: '1px solid #2a2a45', color: '#ccc', textDecoration: 'none', fontSize: 14, fontWeight: 500 },
};
