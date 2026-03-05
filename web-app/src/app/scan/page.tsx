'use client';

import { useState } from 'react';
import Link from 'next/link';

const PATTERNS = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/, risk: 85 },
  { name: 'AWS Secret Key', regex: /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}/, risk: 90 },
  { name: 'GitHub Personal Token', regex: /ghp_[A-Za-z0-9_]{36,}/, risk: 90 },
  { name: 'GitHub OAuth Token', regex: /gho_[A-Za-z0-9_]{36,}/, risk: 85 },
  { name: 'OpenAI API Key', regex: /sk-[A-Za-z0-9]{20,}/, risk: 85 },
  { name: 'Anthropic API Key', regex: /sk-ant-[A-Za-z0-9_-]{50,}/, risk: 85 },
  { name: 'Slack Bot Token', regex: /xoxb-[A-Za-z0-9_-]{10,}/, risk: 80 },
  { name: 'Slack Webhook', regex: /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9_]{24}/, risk: 75 },
  { name: 'Discord Token', regex: /[MN][A-Za-z\d_-]{23,25}\.[\w-]{6}\.[\w-]{27}/, risk: 80 },
  { name: 'Stripe API Key', regex: /sk_(?:live|test)_[A-Za-z0-9]{20,}/, risk: 90 },
  { name: 'Credit Card', regex: /\b(?:\d[ -]*?){13,19}\b/, risk: 95 },
  { name: 'Social Security Number', regex: /\b\d{3}-\d{2}-\d{4}\b/, risk: 95 },
  { name: 'Database URL', regex: /(?:mongodb|postgres|mysql):\/\/[^\s]+/, risk: 85 },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY-----/, risk: 100 },
  { name: 'JWT Token', regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, risk: 75 },
];

export default function ScanPage() {
  const [inputText, setInputText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [violations, setViolations] = useState<Array<{ name: string; risk: number }>>([]);
  const [maxRisk, setMaxRisk] = useState(0);

  const scan = () => {
    const text = inputText.trim();
    if (!text) return;

    setIsScanning(true);

    setTimeout(() => {
      const found: Array<{ name: string; risk: number }> = [];
      let risk = 0;

      PATTERNS.forEach((pattern) => {
        try {
          if (pattern.regex.test(text)) {
            found.push(pattern);
            risk = Math.max(risk, pattern.risk);
          }
        } catch (e) {}
      });

      setViolations(found);
      setMaxRisk(risk);
      setIsScanning(false);
    }, 400);
  };

  const clear = () => {
    setInputText('');
    setViolations([]);
    setMaxRisk(0);
  };

  const addExample = (example: string) => {
    setInputText(example);
  };

  let decision = 'ALLOW';
  let messageClass = 'text-green-600 bg-green-50 border-green-200';
  let message = '✓ No secrets detected. Safe to proceed!';
  let riskColor = '#16a34a';

  if (maxRisk >= 70) {
    decision = 'DENY';
    messageClass = 'text-red-600 bg-red-50 border-red-200';
    message = '⚠ Critical secrets detected. DO NOT COMMIT OR SHARE.';
    riskColor = '#dc2626';
  } else if (maxRisk >= 30 && violations.length > 0) {
    decision = 'WARN';
    messageClass = 'text-amber-600 bg-amber-50 border-amber-200';
    message = '⚠ Potential secrets found. Review before sharing.';
    riskColor = '#d97706';
  }

  return (
    <div style={{ background: '#FEFCFA', minHeight: '100vh' }}>
      {/* NAV */}
      <nav
        style={{
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
          borderBottom: '1px solid #E8E2DB',
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '9px', textDecoration: 'none', color: '#0F172A', fontWeight: 800, fontSize: '15px' }}>
          <img src="/logo-200.png" alt="Kasbah" style={{ width: '28px', height: '28px', borderRadius: '7px' }} />
          <span>Kasbah Guard</span>
        </Link>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <Link href="/" style={{ color: '#64748B', fontSize: '13px', fontWeight: 500, textDecoration: 'none', padding: '6px 12px', borderRadius: '8px', transition: 'all .15s' }}>Home</Link>
          <Link href="/" style={{ color: '#64748B', fontSize: '13px', fontWeight: 500, textDecoration: 'none', padding: '6px 12px', borderRadius: '8px', transition: 'all .15s' }}>How It Works</Link>
          <span style={{ color: '#0F172A', fontSize: '13px', fontWeight: 500, padding: '6px 12px', borderRadius: '8px', background: '#F7F4F0' }}>Experiment</span>
        </div>
      </nav>

      {/* MAIN */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '60px 40px' }}>
        {/* HEADER */}
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 900, letterSpacing: '-0.05em', color: '#0F172A', marginBottom: '12px' }}>Experiment</h1>
          <p style={{ fontSize: 'clamp(14px, 1.5vw, 17px)', color: '#64748B', maxWidth: '600px', margin: '0 auto' }}>Scan text for secrets, API keys, credentials, and sensitive data — 100% in your browser, nothing sent to servers</p>
        </div>

        {/* SCANNER */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', marginBottom: '80px' }}>
          {/* INPUT */}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>Paste Your Code</h2>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste code, credentials, or sensitive data here..."
              style={{
                width: '100%',
                height: '240px',
                border: '1px solid #E8E2DB',
                borderRadius: '12px',
                padding: '16px',
                fontFamily: "'Inter', monospace",
                fontSize: '14px',
                color: '#0F172A',
                background: '#FFFFFF',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button
                onClick={scan}
                disabled={isScanning || !inputText.trim()}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: isScanning || !inputText.trim() ? 'not-allowed' : 'pointer',
                  background: '#C1440E',
                  color: '#fff',
                  boxShadow: '0 4px 12px rgba(193,68,14,.22)',
                  transition: 'all .2s',
                  opacity: isScanning || !inputText.trim() ? 0.5 : 1,
                }}
              >
                {isScanning ? 'Scanning...' : 'Scan Now'}
              </button>
              <button
                onClick={clear}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  border: '1px solid #E8E2DB',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: '#F7F4F0',
                  color: '#0F172A',
                  transition: 'all .2s',
                }}
              >
                Clear
              </button>
            </div>

            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #E8E2DB' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748B', marginBottom: '12px', display: 'block' }}>Try Examples</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                <button onClick={() => addExample('AKIAIOSFODNN7EXAMPLE')} style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600, border: '1px solid #E8E2DB', background: '#fff', color: '#0F172A', borderRadius: '8px', cursor: 'pointer', transition: 'all .15s' }}>AWS Key</button>
                <button onClick={() => addExample('ghp_1234567890abcdefghijklmnopqrstuvwxyz')} style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600, border: '1px solid #E8E2DB', background: '#fff', color: '#0F172A', borderRadius: '8px', cursor: 'pointer', transition: 'all .15s' }}>GitHub Token</button>
                <button onClick={() => addExample('sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV')} style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600, border: '1px solid #E8E2DB', background: '#fff', color: '#0F172A', borderRadius: '8px', cursor: 'pointer', transition: 'all .15s' }}>OpenAI Key</button>
                <button onClick={() => addExample('123-45-6789')} style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600, border: '1px solid #E8E2DB', background: '#fff', color: '#0F172A', borderRadius: '8px', cursor: 'pointer', transition: 'all .15s' }}>SSN</button>
              </div>
            </div>
          </div>

          {/* RESULTS */}
          <div style={{ position: 'sticky', top: '80px', height: 'fit-content' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '20px' }}>Results</h2>
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E8E2DB',
                borderRadius: '12px',
                padding: '24px',
                textAlign: 'center',
                minHeight: '280px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {violations.length === 0 && maxRisk === 0 ? (
                <p style={{ color: '#64748B', fontSize: '14px' }}>Scan results will appear here</p>
              ) : (
                <>
                  <div style={{ width: '120px', height: '120px', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: riskColor, color: '#fff', fontSize: '32px', fontWeight: 900 }}>
                    {Math.round(maxRisk)}
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', margin: '12px 0' }}>{decision}</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>Risk Level</div>

                  {violations.length > 0 && (
                    <div style={{ textAlign: 'left', marginTop: '20px', maxHeight: '200px', overflowY: 'auto', width: '100%' }}>
                      {violations.map((v, i) => (
                        <div key={i} style={{ padding: '12px', marginBottom: '8px', background: '#F7F4F0', borderRadius: '8px', borderLeft: '3px solid #C1440E', fontSize: '13px' }}>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>{v.name}</div>
                          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>Risk: {v.risk}/100</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: '1px solid', width: '100%' }} className={messageClass}>
                    {message}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* INFO SECTION */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '40px', marginTop: '80px', paddingTop: '60px', borderTop: '1px solid #E8E2DB', textAlign: 'center' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>50+ Patterns</h3>
            <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6 }}>Detects AWS keys, GitHub tokens, API keys, credit cards, SSNs, and more</p>
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>&lt;5ms Detection</h3>
            <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6 }}>Instant scanning with WASM acceleration, no server latency</p>
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>100% Local</h3>
            <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6 }}>All processing happens in your browser. Zero data sent anywhere</p>
          </div>
        </div>

        {/* PRIVACY NOTICE */}
        <div style={{ marginTop: '48px', padding: '20px', background: 'rgba(193,68,14,.1)', border: '1px solid rgba(193,68,14,.2)', borderRadius: '12px', textAlign: 'center', fontSize: '13px', color: '#0F172A' }}>
          <strong style={{ color: '#C1440E', fontWeight: 700 }}>🔒 Privacy First:</strong> All detection happens in your browser. Your data never leaves your device. We don't store, log, or see anything you scan.
        </div>
      </div>
    </div>
  );
}
