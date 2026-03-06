'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const DESIGN = {
  bg: '#FEFCFA',
  text: '#0F172A',
  red: '#C1440E',
  muted: '#64748B',
  border: '#E8E2DB',
};

const DETECTION_PATTERNS = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/, risk: 'Critical' },
  { name: 'GitHub Token', regex: /ghp_[A-Za-z0-9_]{36,}/, risk: 'High' },
  { name: 'OpenAI API Key', regex: /sk-[A-Za-z0-9]{20,}/, risk: 'High' },
  { name: 'Slack Bot Token', regex: /xoxb-[A-Za-z0-9_-]{10,}/, risk: 'High' },
  { name: 'Stripe Secret Key', regex: /sk_(?:live|test)_[A-Za-z0-9]{20,}/, risk: 'Critical' },
  { name: 'Social Security Number', regex: /\b\d{3}-\d{2}-\d{4}\b/, risk: 'Critical' },
  { name: 'Credit Card Number', regex: /\b(?:\d[ -]*?){13,19}\b/, risk: 'Critical' },
  { name: 'Database URL', regex: /(?:mongodb|postgres|mysql):\/\/[^\s]+/, risk: 'High' },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY-----/, risk: 'Critical' },
];

const EXAMPLE_CODE = `import boto3

# Deploy infrastructure to AWS
client = boto3.client(
    's3',
    aws_access_key_id="AKIAIOSFODNN7EXAMPLE",
    aws_secret_access_key="wJalrXUtnFEMI/K7MDENG",
    region_name='us-east-1'
)

# "Can you help me fix this connection error?"`;

function detectSecrets(text: string) {
  const found: { name: string; risk: string }[] = [];
  DETECTION_PATTERNS.forEach(p => {
    try { if (p.regex.test(text)) found.push(p); } catch (_) {}
  });
  return found;
}

export default function IncidentPage() {
  // Act 1
  const [typed, setTyped] = useState('');
  const [act1Phase, setAct1Phase] = useState<'typing' | 'sent' | 'revealed'>('typing');
  const typingDone = useRef(false);

  // Act 2
  const act2Ref = useRef<HTMLDivElement>(null);
  const [act2Phase, setAct2Phase] = useState<'idle' | 'scanning' | 'blocked'>('idle');
  const act2Triggered = useRef(false);

  // Act 3
  const [chatInput, setChatInput] = useState('');
  const [detections, setDetections] = useState<{ name: string; risk: string }[]>([]);

  // Auto-type Act 1
  useEffect(() => {
    let i = 0;
    const tick = setInterval(() => {
      if (i < EXAMPLE_CODE.length) {
        setTyped(EXAMPLE_CODE.slice(0, i + 1));
        i++;
      } else {
        clearInterval(tick);
        if (!typingDone.current) {
          typingDone.current = true;
          setTimeout(() => setAct1Phase('sent'), 700);
          setTimeout(() => setAct1Phase('revealed'), 2200);
        }
      }
    }, 28);
    return () => clearInterval(tick);
  }, []);

  // Intersection observer for Act 2
  useEffect(() => {
    const el = act2Ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !act2Triggered.current) {
        act2Triggered.current = true;
        setTimeout(() => setAct2Phase('scanning'), 400);
        setTimeout(() => setAct2Phase('blocked'), 2000);
      }
    }, { threshold: 0.35 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Real-time detection Act 3
  const handleInput = (text: string) => {
    setChatInput(text);
    setDetections(detectSecrets(text));
  };

  const isBlocked = detections.length > 0 && chatInput.trim().length > 0;

  return (
    <div style={{ background: DESIGN.bg, color: DESIGN.text, fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        padding: '0 40px', height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(254,252,250,0.92)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${DESIGN.border}`,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '9px', textDecoration: 'none', color: DESIGN.text, fontWeight: 800, fontSize: '15px' }}>
          <img src="/logo-200.png" alt="Kasbah" style={{ width: '28px', height: '28px', borderRadius: '7px' }} />
          <span>Kasbah Guard</span>
        </Link>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Link href="/" style={{ color: DESIGN.muted, fontSize: '13px', fontWeight: 500, textDecoration: 'none', padding: '6px 12px', borderRadius: '8px' }}>Home</Link>
          <span style={{ color: DESIGN.text, fontSize: '13px', fontWeight: 500, padding: '6px 12px', background: '#F7F4F0', borderRadius: '8px' }}>Experience Kasbah</span>
        </div>
      </nav>

      {/* ─── ACT 1: THE HOOK ─── */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '120px 24px 80px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '48px', maxWidth: '680px' }}>
          <p style={{
            fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: DESIGN.red, marginBottom: '20px',
          }}>
            Right now — this is happening
          </p>
          <h1 style={{
            fontSize: 'clamp(40px, 6vw, 62px)', fontWeight: 900,
            letterSpacing: '-0.05em', lineHeight: 1.08, margin: 0,
          }}>
            You&apos;re sharing more<br />than you think.
          </h1>
        </div>

        {/* Simulated ChatGPT window */}
        <div style={{
          width: '100%', maxWidth: '680px',
          background: '#fff', borderRadius: '16px',
          border: `1px solid ${DESIGN.border}`,
          boxShadow: '0 8px 48px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}>
          {/* Window chrome */}
          <div style={{
            padding: '12px 18px', borderBottom: `1px solid ${DESIGN.border}`,
            display: 'flex', alignItems: 'center', gap: '8px',
            background: '#FAFAFA',
          }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FF5F57' }} />
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FEBC2E' }} />
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#28C840' }} />
            </div>
            <span style={{ fontSize: '12px', color: DESIGN.muted, fontWeight: 500, marginLeft: '8px' }}>
              ChatGPT — New conversation
            </span>
          </div>

          {/* Chat bubble */}
          <div style={{ padding: '24px 20px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '50%',
                background: '#10A37F', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700, color: '#fff',
              }}>You</div>
              <div style={{
                flex: 1, background: '#F7F7F8', borderRadius: '12px',
                padding: '14px 16px',
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontSize: '12px', lineHeight: 1.75, color: DESIGN.text,
                whiteSpace: 'pre', overflowX: 'auto',
                minHeight: '100px',
              }}>
                {typed}
                {act1Phase === 'typing' && (
                  <span style={{
                    display: 'inline-block', width: '2px', height: '13px',
                    background: DESIGN.text, marginLeft: '1px',
                    verticalAlign: 'text-bottom',
                    animation: 'blink 0.9s infinite',
                  }} />
                )}
              </div>
            </div>

            {/* Send row */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              {act1Phase === 'typing' && (
                <div style={{
                  padding: '8px 20px', background: '#10A37F', color: '#fff',
                  borderRadius: '8px', fontSize: '13px', fontWeight: 600, opacity: 0.4,
                }}>
                  Send →
                </div>
              )}
              {act1Phase === 'sent' && (
                <div style={{
                  padding: '8px 20px', background: '#10A37F', color: '#fff',
                  borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  animation: 'fadeIn 0.4s ease',
                }}>
                  Sent — Processing...
                </div>
              )}
              {act1Phase === 'revealed' && (
                <div style={{
                  padding: '12px 20px',
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  color: '#991B1B', animation: 'fadeIn 0.6s ease',
                }}>
                  ⚠ Your AWS credentials just left your machine.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scroll cue */}
        {act1Phase === 'revealed' && (
          <div style={{ marginTop: '52px', textAlign: 'center', animation: 'fadeIn 1s ease' }}>
            <p style={{ fontSize: '15px', color: DESIGN.muted, marginBottom: '14px' }}>
              What if it never got that far?
            </p>
            <div style={{ animation: 'bounce 2s infinite', fontSize: '22px', color: DESIGN.muted }}>↓</div>
          </div>
        )}
      </section>

      {/* ─── ACT 2: THE REPLAY ─── */}
      <section ref={act2Ref} style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px',
        borderTop: `1px solid ${DESIGN.border}`,
        background: '#FAFAF9',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '52px', maxWidth: '620px' }}>
          <h2 style={{
            fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 900,
            letterSpacing: '-0.04em', marginBottom: '16px', lineHeight: 1.1,
          }}>
            The same moment.<br />With Kasbah active.
          </h2>
          <p style={{ fontSize: '15px', color: DESIGN.muted, lineHeight: 1.75 }}>
            Before a single character reaches the AI — Kasbah has already read it,
            flagged it, and stopped it. You keep working. The secret stays safe.
          </p>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 80px 1fr',
          maxWidth: '880px', width: '100%', alignItems: 'center',
        }}>
          {/* Left: code */}
          <div style={{
            background: '#fff', borderRadius: '14px 0 0 14px',
            border: `1px solid ${DESIGN.border}`, borderRight: 'none',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${DESIGN.border}`, background: '#F9FAFB' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: DESIGN.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Your code</span>
            </div>
            <div style={{ padding: '18px 16px', fontFamily: 'monospace', fontSize: '12px', lineHeight: 2, color: DESIGN.text }}>
              <div style={{ color: DESIGN.muted }}>aws_access_key_id =</div>
              <div style={{
                color: act2Phase !== 'idle' ? '#DC2626' : DESIGN.text,
                background: act2Phase !== 'idle' ? '#FEF2F2' : 'transparent',
                padding: act2Phase !== 'idle' ? '1px 6px' : '0',
                borderRadius: '4px',
                fontWeight: act2Phase !== 'idle' ? 700 : 400,
                transition: 'all 0.5s',
                display: 'inline-block',
              }}>
                &quot;AKIAIOSFODNN7EXAMPLE&quot;
              </div>
              <div style={{ color: DESIGN.muted, marginTop: '4px' }}>aws_secret_access_key =</div>
              <div style={{
                color: act2Phase !== 'idle' ? '#DC2626' : DESIGN.text,
                background: act2Phase !== 'idle' ? '#FEF2F2' : 'transparent',
                padding: act2Phase !== 'idle' ? '1px 6px' : '0',
                borderRadius: '4px',
                fontWeight: act2Phase !== 'idle' ? 700 : 400,
                transition: 'all 0.5s 0.25s',
                display: 'inline-block',
              }}>
                &quot;wJalrXUtnFEMI/K7...&quot;
              </div>
            </div>
          </div>

          {/* Center: intercept indicator */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '0 4px' }}>
            {act2Phase === 'idle' && (
              <div style={{ fontSize: '20px', color: DESIGN.muted }}>→</div>
            )}
            {act2Phase === 'scanning' && (
              <>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  border: `3px solid ${DESIGN.red}`, borderTopColor: 'transparent',
                  animation: 'spin 0.7s linear infinite',
                }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: DESIGN.red, textAlign: 'center' }}>Scanning</span>
              </>
            )}
            {act2Phase === 'blocked' && (
              <>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: DESIGN.red, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: '#fff', fontSize: '18px', fontWeight: 900,
                  animation: 'popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                }}>✕</div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: DESIGN.red, textAlign: 'center' }}>BLOCKED</span>
              </>
            )}
          </div>

          {/* Right: Kasbah panel */}
          <div style={{
            background: '#fff', borderRadius: '0 14px 14px 0',
            border: `1px solid ${act2Phase === 'blocked' ? '#FECACA' : DESIGN.border}`,
            borderLeft: 'none',
            overflow: 'hidden', transition: 'border-color 0.4s',
          }}>
            <div style={{
              padding: '12px 16px', borderBottom: `1px solid ${act2Phase === 'blocked' ? '#FECACA' : DESIGN.border}`,
              background: act2Phase === 'blocked' ? '#FEF2F2' : '#F9FAFB',
              transition: 'all 0.4s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: act2Phase === 'blocked' ? DESIGN.red : '#22C55E',
                  transition: 'background 0.4s',
                }} />
                <span style={{
                  fontSize: '11px', fontWeight: 600,
                  color: act2Phase === 'blocked' ? '#991B1B' : DESIGN.muted,
                  transition: 'color 0.4s',
                }}>
                  {act2Phase === 'blocked' ? 'Kasbah — Threat Intercepted' : 'Kasbah Guard — Monitoring'}
                </span>
              </div>
            </div>
            <div style={{ padding: '18px 16px', minHeight: '140px' }}>
              {act2Phase === 'idle' && (
                <div style={{ fontSize: '12px', color: DESIGN.muted, lineHeight: 1.8 }}>
                  <div>Watching input...</div>
                  <div style={{ color: '#CBD5E1', marginTop: '4px' }}>No threats detected</div>
                </div>
              )}
              {act2Phase === 'scanning' && (
                <div style={{ fontSize: '12px', color: DESIGN.muted, lineHeight: 2, fontFamily: 'monospace' }}>
                  <div>✓ Credit card patterns</div>
                  <div>✓ SSN patterns</div>
                  <div style={{ color: DESIGN.red }}>→ Cloud credentials...</div>
                </div>
              )}
              {act2Phase === 'blocked' && (
                <div style={{ animation: 'fadeIn 0.5s ease' }}>
                  {[
                    { name: 'AWS Access Key', val: 'AKIAIOSFODNN7EXAMPLE' },
                    { name: 'AWS Secret Key', val: 'wJalrXUtnFEMI/K7...' },
                  ].map((item, i) => (
                    <div key={i} style={{
                      marginBottom: '10px', padding: '10px 12px',
                      background: '#FEF2F2', borderRadius: '8px',
                      border: '1px solid #FECACA',
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#991B1B', marginBottom: '3px' }}>{item.name}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#7F1D1D', marginBottom: '5px' }}>{item.val}</div>
                      <div style={{
                        fontSize: '10px', fontWeight: 700, color: '#fff',
                        background: DESIGN.red, padding: '2px 8px', borderRadius: '4px',
                        display: 'inline-block',
                      }}>Critical — Transmission blocked</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {act2Phase === 'blocked' && (
          <div style={{ marginTop: '52px', textAlign: 'center', animation: 'fadeIn 0.8s ease' }}>
            <p style={{ fontSize: '15px', color: DESIGN.muted, marginBottom: '14px' }}>
              Now try it with your own code.
            </p>
            <div style={{ animation: 'bounce 2s infinite', fontSize: '22px', color: DESIGN.muted }}>↓</div>
          </div>
        )}
      </section>

      {/* ─── ACT 3: YOUR TURN ─── */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px',
        borderTop: `1px solid ${DESIGN.border}`,
      }}>
        <div style={{ textAlign: 'center', marginBottom: '40px', maxWidth: '580px' }}>
          <h2 style={{
            fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 900,
            letterSpacing: '-0.04em', marginBottom: '16px', lineHeight: 1.1,
          }}>
            Your turn.
          </h2>
          <p style={{ fontSize: '15px', color: DESIGN.muted, lineHeight: 1.75 }}>
            Paste any code below — exactly like you would into ChatGPT or Claude.
            Detection runs 100% in your browser. Nothing leaves your machine.
          </p>
        </div>

        <div style={{ width: '100%', maxWidth: '700px' }}>
          {/* Chat window */}
          <div style={{
            background: '#fff', borderRadius: '16px',
            border: `1px solid ${isBlocked ? '#FECACA' : DESIGN.border}`,
            boxShadow: isBlocked
              ? '0 8px 40px rgba(193,68,14,0.14)'
              : '0 4px 28px rgba(0,0,0,0.07)',
            overflow: 'hidden', transition: 'all 0.35s',
          }}>
            {/* Header */}
            <div style={{
              padding: '13px 20px', borderBottom: `1px solid ${isBlocked ? '#FECACA' : DESIGN.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: isBlocked ? '#FEF2F2' : '#FAFAFA', transition: 'all 0.35s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: isBlocked ? DESIGN.red : '#22C55E',
                  transition: 'background 0.35s',
                }} />
                <span style={{
                  fontSize: '12px', fontWeight: 600,
                  color: isBlocked ? '#991B1B' : DESIGN.muted, transition: 'color 0.35s',
                }}>
                  {isBlocked ? 'Kasbah Guard — Threat Detected' : 'Kasbah Guard — Active & Watching'}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: DESIGN.muted }}>100% local · zero data sent</span>
            </div>

            {/* Textarea */}
            <div style={{ padding: '20px 20px 12px' }}>
              <textarea
                value={chatInput}
                onChange={e => handleInput(e.target.value)}
                placeholder={`Paste your code here, exactly like you would in ChatGPT...\n\nFor example:\n  aws_access_key_id = "AKIAIOSFODNN7EXAMPLE"\n  DATABASE_URL = "postgres://user:pass@host/db"`}
                style={{
                  width: '100%', height: '200px', border: 'none', outline: 'none',
                  resize: 'none', fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  fontSize: '13px', color: DESIGN.text, lineHeight: 1.75,
                  background: 'transparent', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Detections */}
            {isBlocked && (
              <div style={{
                padding: '14px 20px', borderTop: '1px solid #FECACA',
                background: '#FEF2F2', animation: 'fadeIn 0.3s ease',
              }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#991B1B', marginBottom: '10px' }}>
                  {detections.length} secret{detections.length > 1 ? 's' : ''} detected — blocked before transmission
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {detections.map((d, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 12px', background: '#fff', borderRadius: '8px',
                      border: '1px solid #FECACA',
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#7F1D1D' }}>{d.name}</span>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, color: '#fff',
                        background: DESIGN.red, padding: '2px 10px', borderRadius: '4px',
                      }}>
                        {d.risk}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer / Send */}
            <div style={{
              padding: '14px 20px',
              borderTop: `1px solid ${isBlocked ? '#FECACA' : DESIGN.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '12px', color: DESIGN.muted }}>
                {chatInput.trim() && !isBlocked ? 'No secrets found — safe to send' : !chatInput.trim() ? 'Try pasting code with credentials' : ''}
              </span>
              <button
                disabled={isBlocked}
                style={{
                  padding: '9px 22px', borderRadius: '8px',
                  fontSize: '13px', fontWeight: 700,
                  cursor: isBlocked ? 'not-allowed' : 'pointer',
                  border: isBlocked ? '1px solid #FECACA' : 'none',
                  background: isBlocked ? '#FEE2E2' : chatInput.trim() ? '#10A37F' : '#E5E7EB',
                  color: isBlocked ? '#991B1B' : '#fff',
                  transition: 'all 0.3s',
                }}
              >
                {isBlocked ? '⊘ Blocked by Kasbah' : 'Send to AI →'}
              </button>
            </div>
          </div>

          {/* Quick example pills */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
            {[
              { label: 'AWS Key', text: 'aws_access_key_id = "AKIAIOSFODNN7EXAMPLE"' },
              { label: 'GitHub Token', text: 'token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz"' },
              { label: 'Database URL', text: 'DATABASE_URL = "postgres://admin:secret@prod.db.io:5432/app"' },
              { label: 'SSN', text: 'customer_ssn = "123-45-6789"' },
            ].map(ex => (
              <button
                key={ex.label}
                onClick={() => handleInput(ex.text)}
                style={{
                  padding: '6px 14px', background: '#fff',
                  border: `1px solid ${DESIGN.border}`, borderRadius: '100px',
                  fontSize: '12px', fontWeight: 600, color: DESIGN.muted, cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = DESIGN.red; e.currentTarget.style.color = DESIGN.red; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = DESIGN.border; e.currentTarget.style.color = DESIGN.muted; }}
              >
                Try: {ex.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: DESIGN.muted, textAlign: 'center', marginTop: '16px' }}>
            Detection is 100% local. Your code never leaves your browser.
          </p>
        </div>
      </section>

      {/* ─── ACT 4: THE NEW REALITY ─── */}
      <section style={{
        padding: '120px 24px',
        textAlign: 'center',
        background: DESIGN.text,
        color: '#fff',
        borderTop: `1px solid ${DESIGN.border}`,
      }}>
        <p style={{
          fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)',
          marginBottom: '28px',
        }}>
          The new reality
        </p>
        <h2 style={{
          fontSize: 'clamp(36px, 6vw, 58px)', fontWeight: 900,
          letterSpacing: '-0.04em', lineHeight: 1.08,
          maxWidth: '680px', margin: '0 auto 24px',
        }}>
          You never have to think<br />about this again.
        </h2>
        <p style={{
          fontSize: '16px', color: 'rgba(255,255,255,0.55)',
          maxWidth: '480px', margin: '0 auto 52px', lineHeight: 1.8,
        }}>
          Kasbah runs silently in your browser. Every time you open ChatGPT, Claude,
          or Gemini — it&apos;s already watching. You work exactly the same way.
          Except now you&apos;re protected.
        </p>
        <a
          href="https://chromewebstore.google.com/detail/kasbah-guard/XXXX"
          style={{
            display: 'inline-block', padding: '16px 44px',
            background: DESIGN.red, color: '#fff',
            textDecoration: 'none', borderRadius: '12px',
            fontWeight: 800, fontSize: '16px', letterSpacing: '-0.01em',
          }}
        >
          Install Kasbah Guard — It&apos;s Free
        </a>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', marginTop: '20px' }}>
          Chrome · Firefox · Edge · Opera · Safari — no account required
        </p>
      </section>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(8px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes popIn {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
