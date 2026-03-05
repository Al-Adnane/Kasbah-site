'use client';

import { useState } from 'react';
import Link from 'next/link';

const DESIGN = {
  bg: '#FEFCFA',
  text: '#0F172A',
  red: '#C1440E',
  muted: '#64748B',
  border: '#E8E2DB',
  radius: '12px',
};

export default function IncidentPage() {
  const [inputText, setInputText] = useState('');
  const [violations, setViolations] = useState<any[]>([]);
  const [maxRisk, setMaxRisk] = useState(0);

  return (
    <div style={{ background: DESIGN.bg, minHeight: '100vh', color: DESIGN.text }}>
      {/* NAV - Match website */}
      <nav style={{
        position: 'sticky',
        top: 0,
        zIndex: 200,
        padding: '0 40px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(254,252,250,.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${DESIGN.border}`,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '9px', textDecoration: 'none', color: DESIGN.text, fontWeight: 800, fontSize: '15px' }}>
          <span style={{ fontSize: '28px' }}>🛡️</span>
          <span>Kasbah Guard</span>
        </Link>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Link href="/" style={{ color: DESIGN.muted, fontSize: '13px', fontWeight: 500, textDecoration: 'none', padding: '6px 12px', borderRadius: '8px' }}>Home</Link>
          <span style={{ color: DESIGN.text, fontSize: '13px', fontWeight: 500, padding: '6px 12px', background: '#F7F4F0', borderRadius: '8px' }}>Incident Simulator</span>
        </div>
      </nav>

      {/* SECTION 1: THE INCIDENT */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 40px' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: '56px', fontWeight: 900, letterSpacing: '-0.05em', marginBottom: '24px' }}>
            This Happened Today
          </h1>
          <p style={{ fontSize: '18px', color: DESIGN.muted, lineHeight: 1.7, marginBottom: '40px' }}>
            A developer pasted an API key into ChatGPT while asking for help with a bug.
            <br /><br />
            <strong style={{ color: DESIGN.text }}>48 hours later:</strong> Their AWS account was compromised. Attackers launched crypto miners. $12K in unauthorized charges.
            <br /><br />
            <span style={{ color: DESIGN.red, fontWeight: 700 }}>They thought it would never happen to them.</span>
          </p>

          <div style={{
            padding: '24px',
            background: '#F7F4F0',
            borderLeft: `4px solid ${DESIGN.red}`,
            borderRadius: DESIGN.radius,
            textAlign: 'left',
            marginTop: '40px'
          }}>
            <p style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Could this be you?</p>
            <p style={{ fontSize: '14px', color: DESIGN.muted }}>
              78% of developers have pasted credentials into AI tools. Most don't realize it happens until it's too late.
            </p>
          </div>

          <button
            onClick={() => window.scrollBy({ top: 600, behavior: 'smooth' })}
            style={{
              marginTop: '48px',
              padding: '12px 28px',
              background: DESIGN.red,
              color: '#fff',
              border: 'none',
              borderRadius: DESIGN.radius,
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = '#E85D2A')}
            onMouseOut={(e) => (e.currentTarget.style.background = DESIGN.red)}
          >
            Check Your Risk →
          </button>
        </div>
      </div>

      {/* PLACEHOLDER FOR SECTIONS 2-4 */}
      <div style={{ padding: '400px 40px', textAlign: 'center', color: DESIGN.muted }}>
        Sections 2-4 coming next...
      </div>
    </div>
  );
}
