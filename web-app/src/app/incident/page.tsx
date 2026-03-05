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

  const handleDetection = (text: string) => {
    if (text.trim()) {
      const result = detectSecrets(text);
      setViolations(result.violations);
      setMaxRisk(result.maxRisk);
    } else {
      setViolations([]);
      setMaxRisk(0);
    }
  };

  const handleExampleClick = (example: string) => {
    setInputText(example);
    const result = detectSecrets(example);
    setViolations(result.violations);
    setMaxRisk(result.maxRisk);
  };

  return (
    <div style={{ background: DESIGN.bg, minHeight: '100vh', color: DESIGN.text }}>
      {/* NAV */}
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
          <img src="/logo-200.png" alt="Kasbah" style={{ width: '28px', height: '28px', borderRadius: '7px' }} />
          <span>Kasbah Guard</span>
        </Link>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Link href="/" style={{ color: DESIGN.muted, fontSize: '13px', fontWeight: 500, textDecoration: 'none', padding: '6px 12px', borderRadius: '8px' }}>Home</Link>
          <span style={{ color: DESIGN.text, fontSize: '13px', fontWeight: 500, padding: '6px 12px', background: '#F7F4F0', borderRadius: '8px' }}>Try It</span>
        </div>
      </nav>

      {/* SECTION 1: THE PROBLEM */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 40px' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '48px', fontWeight: 900, letterSpacing: '-0.05em', marginBottom: '24px', lineHeight: 1.2 }}>
            Secrets Slip Into AI Tools Every Day
          </h1>
          <p style={{ fontSize: '16px', color: DESIGN.muted, lineHeight: 1.8, marginBottom: '32px' }}>
            Developers routinely paste API keys, database credentials, and authentication tokens into ChatGPT, Claude, and other AI tools while asking for help with code. The credentials are processed by external servers and stored permanently.
          </p>

          <div style={{
            padding: '20px',
            background: '#F7F4F0',
            borderLeft: `4px solid ${DESIGN.red}`,
            borderRadius: DESIGN.radius,
            marginBottom: '48px'
          }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: DESIGN.text, marginBottom: '8px' }}>
              What can be leaked:
            </p>
            <ul style={{ fontSize: '14px', color: DESIGN.muted, margin: 0, paddingLeft: '20px' }}>
              <li style={{ marginBottom: '6px' }}>AWS, Google, Azure credentials</li>
              <li style={{ marginBottom: '6px' }}>GitHub, GitLab, Stripe API keys</li>
              <li style={{ marginBottom: '6px' }}>Database URLs and passwords</li>
              <li style={{ marginBottom: '6px' }}>SSH keys and private certificates</li>
              <li>SSN, credit cards, PII</li>
            </ul>
          </div>

          <p style={{ fontSize: '15px', color: DESIGN.muted, fontWeight: 500 }}>
            Kasbah detects these secrets locally in your browser before you paste—stopping leaks before they happen.
          </p>
        </div>
      </div>

      {/* SECTION 2: DETECTION DEMO */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 40px', borderTop: `1px solid ${DESIGN.border}` }}>
        <h2 style={{ fontSize: '36px', fontWeight: 900, marginBottom: '32px', textAlign: 'center' }}>
          See It In Action
        </h2>

        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <p style={{ fontSize: '14px', color: DESIGN.muted, textAlign: 'center', marginBottom: '24px' }}>
            Paste code or credentials below. Detection runs 100% locally in your browser.
          </p>

          <textarea
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              handleDetection(e.target.value);
            }}
            placeholder="Paste code here..."
            style={{
              width: '100%',
              height: '180px',
              border: `1px solid ${DESIGN.border}`,
              borderRadius: DESIGN.radius,
              padding: '16px',
              fontFamily: "'Inter', monospace",
              fontSize: '13px',
              color: DESIGN.text,
              background: '#fff',
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: '16px',
            }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <button
              onClick={() => handleExampleClick('AKIAIOSFODNN7EXAMPLE')}
              style={{
                padding: '12px 16px',
                border: `1px solid ${DESIGN.border}`,
                background: '#fff',
                borderRadius: DESIGN.radius,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                color: DESIGN.text,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F7F4F0'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            >
              AWS Key
            </button>
            <button
              onClick={() => handleExampleClick('ghp_1234567890abcdefghijklmnopqrstuvwxyz')}
              style={{
                padding: '12px 16px',
                border: `1px solid ${DESIGN.border}`,
                background: '#fff',
                borderRadius: DESIGN.radius,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                color: DESIGN.text,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F7F4F0'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            >
              GitHub Token
            </button>
            <button
              onClick={() => handleExampleClick('123-45-6789')}
              style={{
                padding: '12px 16px',
                border: `1px solid ${DESIGN.border}`,
                background: '#fff',
                borderRadius: DESIGN.radius,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                color: DESIGN.text,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F7F4F0'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            >
              Social Security #
            </button>
            <button
              onClick={() => handleExampleClick('4532-1234-5678-9999')}
              style={{
                padding: '12px 16px',
                border: `1px solid ${DESIGN.border}`,
                background: '#fff',
                borderRadius: DESIGN.radius,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                color: DESIGN.text,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F7F4F0'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            >
              Credit Card
            </button>
          </div>

          {violations.length > 0 && (
            <div style={{
              padding: '16px',
              background: '#FEE2E2',
              border: `1px solid #FECACA`,
              borderRadius: DESIGN.radius,
              marginBottom: '24px'
            }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#991B1B', marginBottom: '12px' }}>
                Detected {violations.length} secret{violations.length > 1 ? 's' : ''}:
              </p>
              {violations.map((v, i) => (
                <div key={i} style={{ fontSize: '13px', color: '#7F1D1D', marginBottom: '6px' }}>
                  <strong>{v.name}</strong> · Risk: {v.risk}/100
                </div>
              ))}
            </div>
          )}

          {inputText.trim() && violations.length === 0 && (
            <div style={{
              padding: '16px',
              background: '#F0FDF4',
              border: `1px solid #DCFCE7`,
              borderRadius: DESIGN.radius,
              marginBottom: '24px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#15803D'
            }}>
              No secrets detected
            </div>
          )}

          <p style={{ fontSize: '12px', color: DESIGN.muted, textAlign: 'center' }}>
            All detection runs locally. Your data never leaves your browser.
          </p>
        </div>
      </div>

      {/* SECTION 3: INSTALL CTA */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 40px', borderTop: `1px solid ${DESIGN.border}`, textAlign: 'center' }}>
        <h2 style={{ fontSize: '36px', fontWeight: 900, marginBottom: '16px' }}>
          Stop Leaks Before They Happen
        </h2>
        <p style={{ fontSize: '15px', color: DESIGN.muted, marginBottom: '40px', maxWidth: '600px', margin: '0 auto 40px' }}>
          Kasbah runs locally in your browser as a browser extension. It detects secrets as you type—across ChatGPT, Gmail, Slack, and any website.
        </p>

        <a href="https://chromewebstore.google.com/detail/kasbah-guard/XXXX" style={{
          display: 'inline-block',
          padding: '14px 32px',
          background: DESIGN.red,
          color: '#fff',
          textDecoration: 'none',
          borderRadius: DESIGN.radius,
          fontWeight: 700,
          fontSize: '15px',
          marginBottom: '40px',
        }}>
          Install Browser Extension
        </a>

        <div style={{
          padding: '16px',
          background: 'rgba(193,68,14,.1)',
          border: `1px solid rgba(193,68,14,.2)`,
          borderRadius: DESIGN.radius,
          maxWidth: '600px',
          margin: '0 auto',
          fontSize: '13px',
          color: DESIGN.text',
        }}>
          <strong style={{ color: DESIGN.red }}>100% Private:</strong> All detection runs locally in your browser. No data is sent to servers. No logging. No tracking.
        </div>
      </div>
    </div>
  );
}
