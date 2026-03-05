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

const DETECTION_PATTERNS = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/, risk: 85 },
  { name: 'GitHub Personal Token', regex: /ghp_[A-Za-z0-9_]{36,}/, risk: 90 },
  { name: 'OpenAI API Key', regex: /sk-[A-Za-z0-9]{20,}/, risk: 85 },
  { name: 'Slack Bot Token', regex: /xoxb-[A-Za-z0-9_-]{10,}/, risk: 80 },
  { name: 'Stripe API Key', regex: /sk_(?:live|test)_[A-Za-z0-9]{20,}/, risk: 90 },
  { name: 'Social Security Number', regex: /\b\d{3}-\d{2}-\d{4}\b/, risk: 95 },
  { name: 'Credit Card', regex: /\b(?:\d[ -]*?){13,19}\b/, risk: 95 },
  { name: 'Database URL', regex: /(?:mongodb|postgres|mysql):\/\/[^\s]+/, risk: 85 },
  { name: 'Discord Token', regex: /[MN][A-Za-z\d_-]{23,25}\.[\w-]{6}\.[\w-]{27}/, risk: 80 },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY-----/, risk: 100 },
];

function detectSecrets(text: string) {
  const found: any[] = [];
  let maxRisk = 0;

  DETECTION_PATTERNS.forEach(pattern => {
    try {
      if (pattern.regex.test(text)) {
        found.push(pattern);
        maxRisk = Math.max(maxRisk, pattern.risk);
      }
    } catch (e) {}
  });

  return { violations: found, maxRisk };
}

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

      {/* SECTION 2: PERSONAL SCAN */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 40px', borderTop: `1px solid ${DESIGN.border}` }}>
        <h2 style={{ fontSize: '42px', fontWeight: 900, marginBottom: '12px', textAlign: 'center' }}>
          Let's Check Your Risk
        </h2>
        <p style={{ fontSize: '16px', color: DESIGN.muted, textAlign: 'center', maxWidth: '600px', margin: '0 auto 40px' }}>
          Paste any code snippet below. 100% private—all detection runs in your browser.
        </p>

        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <textarea
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              if (e.target.value.trim()) {
                const result = detectSecrets(e.target.value);
                setViolations(result.violations);
                setMaxRisk(result.maxRisk);
              } else {
                setViolations([]);
                setMaxRisk(0);
              }
            }}
            placeholder="Paste code here..."
            style={{
              width: '100%',
              height: '200px',
              border: `1px solid ${DESIGN.border}`,
              borderRadius: DESIGN.radius,
              padding: '16px',
              fontFamily: "'Inter', monospace",
              fontSize: '14px',
              color: DESIGN.text,
              background: '#fff',
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {violations.length > 0 && (
            <div style={{ marginTop: '24px', padding: '20px', background: '#FEE2E2', border: `1px solid #FECACA`, borderRadius: DESIGN.radius }}>
              <p style={{ fontWeight: 700, color: '#991B1B', marginBottom: '12px' }}>
                ⚠️ We found {violations.length} secret{violations.length > 1 ? 's' : ''}:
              </p>
              {violations.map((v, i) => (
                <div key={i} style={{ fontSize: '14px', color: '#7F1D1D', marginBottom: '8px' }}>
                  <strong>{v.name}</strong> (Risk: {v.risk}/100)
                </div>
              ))}
              <p style={{ fontSize: '13px', marginTop: '12px', color: '#991B1B' }}>
                You were probably about to paste this into ChatGPT or Slack. Kasbah catches it first.
              </p>
            </div>
          )}

          {inputText.trim() && violations.length === 0 && (
            <div style={{ marginTop: '24px', padding: '20px', background: '#F0FDF4', border: `1px solid #BBFF00`, borderRadius: DESIGN.radius }}>
              <p style={{ fontWeight: 700, color: '#15803D' }}>✓ No secrets detected</p>
            </div>
          )}
        </div>
      </div>

      {/* PLACEHOLDER FOR SECTIONS 3-4 */}
      <div style={{ padding: '400px 40px', textAlign: 'center', color: DESIGN.muted }}>
        Sections 3-4 coming next...
      </div>
    </div>
  );
}
