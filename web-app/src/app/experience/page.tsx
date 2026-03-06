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

// Universal patterns — explained in plain language
const DETECTION_PATTERNS = [
  { name: 'Social Security Number', regex: /\b\d{3}-\d{2}-\d{4}\b/, risk: 'Critical', plain: 'ID number' },
  { name: 'Credit Card Number', regex: /\b(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{2})[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b/, risk: 'Critical', plain: 'Payment info' },
  { name: 'Password', regex: /(?:password|passwd|pwd)\s*[:=]\s*\S{6,}/i, risk: 'High', plain: 'Password' },
  { name: 'API Key', regex: /AKIA[0-9A-Z]{16}/, risk: 'Critical', plain: 'Cloud credential' },
  { name: 'GitHub Token', regex: /ghp_[A-Za-z0-9_]{36,}/, risk: 'High', plain: 'Access token' },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY-----/, risk: 'Critical', plain: 'Encryption key' },
  { name: 'Database URL', regex: /(?:mongodb|postgres|mysql):\/\/[^\s]+/, risk: 'High', plain: 'Database access' },
  { name: 'Email + personal context', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b.*(?:ssn|social|dob|birth|salary|income)/is, risk: 'High', plain: 'Personal record' },
];

// What gets typed in Act 1 — relatable to anyone who uses AI
const EXAMPLE_MESSAGE = `Can you help me analyze this client file and write a summary?

Name: Sarah Johnson
Date of Birth: March 12, 1985
SSN: 547-22-1234
Credit Card: 4532 1234 5678 9999
Annual Income: $87,500

She's applying for a mortgage. Can you check if anything looks off?`;

// Detected items shown in Act 2
const ACT2_FINDINGS = [
  { label: 'Social Security Number', value: '547-22-1234', severity: 'Critical' },
  { label: 'Credit Card Number', value: '4532 1234 5678 9999', severity: 'Critical' },
];

// Examples for Act 3 — different roles, all relatable
const EXAMPLES = [
  { label: 'Client record', text: 'Name: James Miller\nSSN: 382-55-9021\nDate of birth: 08/14/1979\nCredit card: 4532-9876-5432-1098\n\nCan you summarize this for the intake form?' },
  { label: 'HR document', text: 'Employee: Maria Santos\nSalary: $112,000\nSSN: 219-44-7823\nPerformance score: 3.2/5\n\nHelp me write her annual review.' },
  { label: 'Login credentials', text: 'Here are the staging credentials:\nusername: admin@company.com\npassword: Sup3rS3cr3t!\n\nCan you help me debug why the login is failing?' },
  { label: 'Medical info', text: 'Patient: Robert Chen, DOB 1962-03-08\nDiagnosis: Type 2 diabetes\nSSN: 601-77-4312\n\nDraft a referral letter to the specialist.' },
];

function detectSecrets(text: string) {
  const found: { name: string; risk: string; plain: string }[] = [];
  DETECTION_PATTERNS.forEach(p => {
    try { if (p.regex.test(text)) found.push(p); } catch (_) {}
  });
  return found;
}

export default function IncidentPage() {
  const [typed, setTyped] = useState('');
  const [act1Phase, setAct1Phase] = useState<'typing' | 'sent' | 'revealed'>('typing');
  const typingDone = useRef(false);

  const act2Ref = useRef<HTMLDivElement>(null);
  const [act2Phase, setAct2Phase] = useState<'idle' | 'scanning' | 'blocked'>('idle');
  const act2Triggered = useRef(false);

  const [chatInput, setChatInput] = useState('');
  const [detections, setDetections] = useState<{ name: string; risk: string; plain: string }[]>([]);

  useEffect(() => {
    let i = 0;
    const tick = setInterval(() => {
      if (i < EXAMPLE_MESSAGE.length) {
        setTyped(EXAMPLE_MESSAGE.slice(0, i + 1));
        i++;
      } else {
        clearInterval(tick);
        if (!typingDone.current) {
          typingDone.current = true;
          setTimeout(() => setAct1Phase('sent'), 600);
          setTimeout(() => setAct1Phase('revealed'), 2000);
        }
      }
    }, 22);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const el = act2Ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !act2Triggered.current) {
        act2Triggered.current = true;
        setTimeout(() => setAct2Phase('scanning'), 500);
        setTimeout(() => setAct2Phase('blocked'), 2200);
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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
          <span style={{ color: DESIGN.text, fontSize: '13px', fontWeight: 500, padding: '6px 12px', background: '#F7F4F0', borderRadius: '8px' }}>See How It Works</span>
        </div>
      </nav>

      {/* ── ACT 1: THE HOOK ── */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '120px 24px 80px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '44px', maxWidth: '640px' }}>
          <p style={{
            fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: DESIGN.red, marginBottom: '18px',
          }}>
            This happens every day
          </p>
          <h1 style={{
            fontSize: 'clamp(38px, 5.5vw, 60px)', fontWeight: 900,
            letterSpacing: '-0.05em', lineHeight: 1.08, margin: 0,
          }}>
            You&apos;re sharing more<br />than you realize.
          </h1>
          <p style={{ fontSize: '17px', color: DESIGN.muted, marginTop: '20px', lineHeight: 1.7 }}>
            Every day, people paste sensitive information into AI tools without thinking twice.
            Watch what just happened.
          </p>
        </div>

        {/* ChatGPT-style window */}
        <div style={{
          width: '100%', maxWidth: '660px',
          background: '#fff', borderRadius: '16px',
          border: `1px solid ${DESIGN.border}`,
          boxShadow: '0 8px 48px rgba(0,0,0,0.09)',
          overflow: 'hidden',
        }}>
          {/* Window chrome */}
          <div style={{
            padding: '12px 18px', borderBottom: `1px solid ${DESIGN.border}`,
            display: 'flex', alignItems: 'center', gap: '8px', background: '#FAFAFA',
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

          {/* Message */}
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
                fontSize: '13px', lineHeight: 1.8, color: DESIGN.text,
                whiteSpace: 'pre-wrap', minHeight: '80px',
              }}>
                {typed}
                {act1Phase === 'typing' && (
                  <span style={{
                    display: 'inline-block', width: '2px', height: '14px',
                    background: DESIGN.text, marginLeft: '1px',
                    verticalAlign: 'text-bottom', animation: 'blink 0.9s infinite',
                  }} />
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              {act1Phase === 'typing' && (
                <div style={{ padding: '8px 20px', background: '#10A37F', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, opacity: 0.4 }}>
                  Send →
                </div>
              )}
              {act1Phase === 'sent' && (
                <div style={{ padding: '8px 20px', background: '#10A37F', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, animation: 'fadeIn 0.4s ease' }}>
                  Sent — Processing...
                </div>
              )}
              {act1Phase === 'revealed' && (
                <div style={{
                  padding: '13px 20px',
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  color: '#991B1B', animation: 'fadeIn 0.6s ease',
                  lineHeight: 1.5,
                }}>
                  ⚠ Sarah&apos;s SSN and credit card just reached OpenAI&apos;s servers.
                </div>
              )}
            </div>
          </div>
        </div>

        {act1Phase === 'revealed' && (
          <div style={{ marginTop: '48px', textAlign: 'center', animation: 'fadeIn 1s ease' }}>
            <p style={{ fontSize: '15px', color: DESIGN.muted, marginBottom: '14px' }}>
              What if it never got that far?
            </p>
            <div style={{ animation: 'bounce 2s infinite', fontSize: '22px', color: DESIGN.muted }}>↓</div>
          </div>
        )}
      </section>

      {/* ── ACT 2: THE REPLAY ── */}
      <section ref={act2Ref} style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px',
        borderTop: `1px solid ${DESIGN.border}`,
        background: '#FAFAF9',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '52px', maxWidth: '580px' }}>
          <h2 style={{
            fontSize: 'clamp(30px, 4.5vw, 46px)', fontWeight: 900,
            letterSpacing: '-0.04em', marginBottom: '16px', lineHeight: 1.1,
          }}>
            The same moment.<br />With Kasbah active.
          </h2>
          <p style={{ fontSize: '15px', color: DESIGN.muted, lineHeight: 1.75 }}>
            Before your message reaches the AI, Kasbah reads it silently.
            Sensitive information is flagged and stopped — you keep working, the data stays safe.
          </p>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 72px 1fr',
          maxWidth: '840px', width: '100%', alignItems: 'center',
        }}>
          {/* Left: the message */}
          <div style={{
            background: '#fff', borderRadius: '14px 0 0 14px',
            border: `1px solid ${DESIGN.border}`, borderRight: 'none', overflow: 'hidden',
          }}>
            <div style={{ padding: '11px 16px', borderBottom: `1px solid ${DESIGN.border}`, background: '#F9FAFB' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: DESIGN.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Your message to ChatGPT</span>
            </div>
            <div style={{ padding: '16px', fontSize: '13px', lineHeight: 1.9, color: DESIGN.text }}>
              <div>Can you analyze this client file?</div>
              <div style={{ color: DESIGN.muted, marginTop: '8px' }}>Name: Sarah Johnson</div>
              <div style={{
                color: act2Phase !== 'idle' ? '#DC2626' : DESIGN.text,
                background: act2Phase !== 'idle' ? '#FEF2F2' : 'transparent',
                padding: act2Phase !== 'idle' ? '1px 6px' : '0',
                borderRadius: '4px', fontWeight: act2Phase !== 'idle' ? 700 : 400,
                transition: 'all 0.5s', display: 'inline-block',
              }}>SSN: 547-22-1234</div>
              <div style={{
                color: act2Phase !== 'idle' ? '#DC2626' : DESIGN.text,
                background: act2Phase !== 'idle' ? '#FEF2F2' : 'transparent',
                padding: act2Phase !== 'idle' ? '1px 6px' : '0',
                borderRadius: '4px', fontWeight: act2Phase !== 'idle' ? 700 : 400,
                transition: 'all 0.5s 0.2s', display: 'inline-block', marginTop: '2px',
              }}>Card: 4532 1234 5678 9999</div>
            </div>
          </div>

          {/* Center: intercept */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {act2Phase === 'idle' && <div style={{ fontSize: '18px', color: DESIGN.muted }}>→</div>}
            {act2Phase === 'scanning' && (
              <>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '50%',
                  border: `3px solid ${DESIGN.red}`, borderTopColor: 'transparent',
                  animation: 'spin 0.7s linear infinite',
                }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: DESIGN.red }}>Checking</span>
              </>
            )}
            {act2Phase === 'blocked' && (
              <>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '50%',
                  background: DESIGN.red, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: '#fff', fontSize: '16px', fontWeight: 900,
                  animation: 'popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                }}>✕</div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: DESIGN.red }}>STOPPED</span>
              </>
            )}
          </div>

          {/* Right: Kasbah result */}
          <div style={{
            background: '#fff', borderRadius: '0 14px 14px 0',
            border: `1px solid ${act2Phase === 'blocked' ? '#FECACA' : DESIGN.border}`,
            borderLeft: 'none', overflow: 'hidden', transition: 'border-color 0.4s',
          }}>
            <div style={{
              padding: '11px 16px',
              borderBottom: `1px solid ${act2Phase === 'blocked' ? '#FECACA' : DESIGN.border}`,
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
                  {act2Phase === 'blocked' ? 'Kasbah — Sensitive data found' : 'Kasbah Guard — Watching'}
                </span>
              </div>
            </div>
            <div style={{ padding: '16px', minHeight: '130px' }}>
              {act2Phase === 'idle' && (
                <div style={{ fontSize: '12px', color: DESIGN.muted, lineHeight: 1.8 }}>
                  <div>Monitoring your input...</div>
                  <div style={{ color: '#CBD5E1', marginTop: '4px' }}>Nothing flagged yet</div>
                </div>
              )}
              {act2Phase === 'scanning' && (
                <div style={{ fontSize: '12px', color: DESIGN.muted, lineHeight: 2 }}>
                  <div>✓ Payment information</div>
                  <div>✓ Health records</div>
                  <div style={{ color: DESIGN.red }}>→ Identity information...</div>
                </div>
              )}
              {act2Phase === 'blocked' && (
                <div style={{ animation: 'fadeIn 0.5s ease' }}>
                  {ACT2_FINDINGS.map((item, i) => (
                    <div key={i} style={{
                      marginBottom: '10px', padding: '10px 12px',
                      background: '#FEF2F2', borderRadius: '8px', border: '1px solid #FECACA',
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#991B1B', marginBottom: '2px' }}>{item.label}</div>
                      <div style={{ fontSize: '11px', color: '#7F1D1D', marginBottom: '5px', fontFamily: 'monospace' }}>{item.value}</div>
                      <div style={{
                        fontSize: '10px', fontWeight: 700, color: '#fff',
                        background: DESIGN.red, padding: '2px 8px', borderRadius: '4px', display: 'inline-block',
                      }}>{item.severity} — Blocked</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {act2Phase === 'blocked' && (
          <div style={{ marginTop: '48px', textAlign: 'center', animation: 'fadeIn 0.8s ease' }}>
            <p style={{ fontSize: '15px', color: DESIGN.muted, marginBottom: '14px' }}>
              Try it with your own text.
            </p>
            <div style={{ animation: 'bounce 2s infinite', fontSize: '22px', color: DESIGN.muted }}>↓</div>
          </div>
        )}
      </section>

      {/* ── ACT 3: YOUR TURN ── */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px',
        borderTop: `1px solid ${DESIGN.border}`,
      }}>
        <div style={{ textAlign: 'center', marginBottom: '36px', maxWidth: '560px' }}>
          <h2 style={{
            fontSize: 'clamp(30px, 4.5vw, 46px)', fontWeight: 900,
            letterSpacing: '-0.04em', marginBottom: '14px', lineHeight: 1.1,
          }}>
            Your turn.
          </h2>
          <p style={{ fontSize: '15px', color: DESIGN.muted, lineHeight: 1.75 }}>
            Type or paste anything you&apos;d normally send to an AI tool.
            Kasbah tells you instantly if something sensitive is in there.
            Nothing leaves your browser.
          </p>
        </div>

        <div style={{ width: '100%', maxWidth: '680px' }}>
          <div style={{
            background: '#fff', borderRadius: '16px',
            border: `1px solid ${isBlocked ? '#FECACA' : DESIGN.border}`,
            boxShadow: isBlocked ? '0 8px 40px rgba(193,68,14,0.14)' : '0 4px 28px rgba(0,0,0,0.07)',
            overflow: 'hidden', transition: 'all 0.35s',
          }}>
            {/* Status bar */}
            <div style={{
              padding: '12px 20px',
              borderBottom: `1px solid ${isBlocked ? '#FECACA' : DESIGN.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: isBlocked ? '#FEF2F2' : '#FAFAFA', transition: 'all 0.35s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: isBlocked ? DESIGN.red : '#22C55E', transition: 'background 0.35s',
                }} />
                <span style={{
                  fontSize: '12px', fontWeight: 600,
                  color: isBlocked ? '#991B1B' : DESIGN.muted, transition: 'color 0.35s',
                }}>
                  {isBlocked ? 'Kasbah — Sensitive information detected' : 'Kasbah Guard — Watching'}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: DESIGN.muted }}>Nothing leaves your device</span>
            </div>

            {/* Input */}
            <div style={{ padding: '18px 20px 12px' }}>
              <textarea
                value={chatInput}
                onChange={e => handleInput(e.target.value)}
                placeholder={"Type anything you'd normally send to ChatGPT or Claude...\n\nFor example: a client's details, a document with personal info,\na password, or anything that feels sensitive."}
                style={{
                  width: '100%', height: '190px', border: 'none', outline: 'none',
                  resize: 'none', fontSize: '13px', color: DESIGN.text, lineHeight: 1.8,
                  background: 'transparent', boxSizing: 'border-box',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              />
            </div>

            {/* Findings */}
            {isBlocked && (
              <div style={{
                padding: '14px 20px', borderTop: '1px solid #FECACA',
                background: '#FEF2F2', animation: 'fadeIn 0.3s ease',
              }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#991B1B', marginBottom: '10px' }}>
                  {detections.length} sensitive item{detections.length > 1 ? 's' : ''} found — this would have been shared with the AI
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {detections.map((d, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', background: '#fff', borderRadius: '8px', border: '1px solid #FECACA',
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#7F1D1D' }}>{d.name}</span>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, color: '#fff',
                        background: d.risk === 'Critical' ? DESIGN.red : '#EA580C',
                        padding: '2px 10px', borderRadius: '4px',
                      }}>{d.risk}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{
              padding: '13px 20px',
              borderTop: `1px solid ${isBlocked ? '#FECACA' : DESIGN.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '12px', color: DESIGN.muted }}>
                {chatInput.trim() && !isBlocked ? '✓ Nothing sensitive found — safe to send' : !chatInput.trim() ? 'Start typing to see Kasbah in action' : ''}
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
                {isBlocked ? '⊘ Blocked' : 'Send to AI →'}
              </button>
            </div>
          </div>

          {/* Try-it pills */}
          <div style={{ marginTop: '14px' }}>
            <p style={{ fontSize: '12px', color: DESIGN.muted, marginBottom: '10px' }}>Try an example:</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {EXAMPLES.map(ex => (
                <button
                  key={ex.label}
                  onClick={() => handleInput(ex.text)}
                  style={{
                    padding: '7px 16px', background: '#fff',
                    border: `1px solid ${DESIGN.border}`, borderRadius: '100px',
                    fontSize: '12px', fontWeight: 600, color: DESIGN.muted, cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = DESIGN.red; e.currentTarget.style.color = DESIGN.red; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = DESIGN.border; e.currentTarget.style.color = DESIGN.muted; }}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ACT 4 (INTERLUDE): GO FURTHER ── */}
      <section style={{
        padding: '100px 24px',
        borderTop: `1px solid ${DESIGN.border}`,
        background: '#FAFAF9',
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <p style={{
              fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: DESIGN.red, marginBottom: '16px',
            }}>For teams & organisations</p>
            <h2 style={{
              fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900,
              letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: '14px',
            }}>
              The free extension protects you.<br />Kasbah Pro protects your whole team.
            </h2>
            <p style={{ fontSize: '15px', color: DESIGN.muted, maxWidth: '520px', margin: '0 auto', lineHeight: 1.75 }}>
              When one person on your team leaks a credential, everyone is exposed.
              Kasbah Pro gives security teams visibility and control across the organisation.
            </p>
          </div>

          {/* Feature comparison */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '48px' }}>
            {/* Free */}
            <div style={{
              background: '#fff', borderRadius: '16px',
              border: `1px solid ${DESIGN.border}`,
              padding: '28px', overflow: 'hidden',
            }}>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: DESIGN.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Free — Always</div>
                <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.03em' }}>$0</div>
              </div>
              {[
                'Browser extension for Chrome, Firefox, Edge, Safari',
                'Real-time detection across ChatGPT, Claude, Gemini',
                '50+ secret formats: API keys, SSNs, credit cards',
                '100% local — nothing ever sent to servers',
                'Works instantly, no account required',
              ].map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#22C55E', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: '13px', color: DESIGN.muted, lineHeight: 1.5 }}>{f}</span>
                </div>
              ))}
              <a href="https://chromewebstore.google.com/detail/kasbah-guard/idikjiajiomhekkkpfkhnpfepfgknokc"
                style={{
                  display: 'block', marginTop: '24px', padding: '11px 20px',
                  background: '#F7F4F0', color: DESIGN.text,
                  textDecoration: 'none', borderRadius: '10px',
                  fontWeight: 700, fontSize: '14px', textAlign: 'center',
                }}>
                Install Free Extension
              </a>
            </div>

            {/* Pro */}
            <div style={{
              background: DESIGN.text, borderRadius: '16px',
              border: `1px solid ${DESIGN.text}`,
              padding: '28px', overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                position: 'absolute', top: '16px', right: '16px',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: DESIGN.red,
                background: 'rgba(193,68,14,0.15)', padding: '3px 10px', borderRadius: '100px',
              }}>Coming soon</div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Pro — Teams</div>
                <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff' }}>Early access</div>
              </div>
              {[
                'Everything in Free, for every seat',
                'Admin dashboard — see what each team member is exposing',
                'Policy controls — block paste, warn, or log by data type',
                'Audit log — full history of flagged events per user',
                'Slack & email alerts when sensitive data is detected',
                'SSO / SAML for enterprise identity providers',
              ].map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'flex-start' }}>
                  <span style={{ color: DESIGN.red, fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{f}</span>
                </div>
              ))}
              <a href="mailto:yo@bekasbah.com?subject=Kasbah Pro Early Access"
                style={{
                  display: 'block', marginTop: '24px', padding: '11px 20px',
                  background: DESIGN.red, color: '#fff',
                  textDecoration: 'none', borderRadius: '10px',
                  fontWeight: 700, fontSize: '14px', textAlign: 'center',
                }}>
                Request Early Access
              </a>
            </div>
          </div>

          {/* Enterprise note */}
          <div style={{
            textAlign: 'center', padding: '20px',
            border: `1px solid ${DESIGN.border}`, borderRadius: '12px',
            background: '#fff',
          }}>
            <p style={{ fontSize: '13px', color: DESIGN.muted, margin: 0 }}>
              Need a custom deployment, on-premise install, or compliance reporting?{' '}
              <a href="mailto:yo@bekasbah.com" style={{ color: DESIGN.red, fontWeight: 600, textDecoration: 'none' }}>
                Talk to us →
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ── ACT 4: THE NEW REALITY ── */}
      <section style={{
        padding: '120px 24px', textAlign: 'center',
        background: DESIGN.text, color: '#fff',
        borderTop: `1px solid ${DESIGN.border}`,
      }}>
        <p style={{
          fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '28px',
        }}>
          The new reality
        </p>
        <h2 style={{
          fontSize: 'clamp(34px, 5.5vw, 56px)', fontWeight: 900,
          letterSpacing: '-0.04em', lineHeight: 1.1,
          maxWidth: '640px', margin: '0 auto 22px',
        }}>
          You never have to think<br />about this again.
        </h2>
        <p style={{
          fontSize: '16px', color: 'rgba(255,255,255,0.5)',
          maxWidth: '460px', margin: '0 auto 50px', lineHeight: 1.85,
        }}>
          Kasbah works silently in the background. Every time you open ChatGPT, Claude,
          or Gemini — it&apos;s already there. You work exactly the same way.
          Except now, sensitive information stays where it belongs.
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
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.25)', marginTop: '20px' }}>
          Chrome · Firefox · Edge · Opera · Safari — no account required
        </p>
      </section>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(8px); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes popIn { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}
