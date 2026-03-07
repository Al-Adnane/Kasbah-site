'use client';

import { useState } from 'react';
import Link from 'next/link';

const D = {
  bg: '#FEFCFA',
  text: '#0F172A',
  red: '#C1440E',
  muted: '#64748B',
  border: '#E8E2DB',
};

const CHECK = ({ color = '#22C55E' }: { color?: string }) => (
  <span style={{ color, fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>&#10003;</span>
);
const DASH = () => (
  <span style={{ color: '#CBD5E1', fontSize: '14px', flexShrink: 0 }}>&mdash;</span>
);

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);

  const proPrice = annual ? 9 : 12;
  const bizPrice = annual ? 29 : 39;

  return (
    <div style={{ background: D.bg, color: D.text, fontFamily: 'Inter, system-ui, sans-serif', minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        padding: '0 40px', height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(254,252,250,0.92)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${D.border}`,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '9px', textDecoration: 'none', color: D.text, fontWeight: 800, fontSize: '15px' }}>
          <img src="/logo-200.png" alt="Kasbah" style={{ width: '28px', height: '28px', borderRadius: '7px' }} />
          <span>Kasbah Guard</span>
        </Link>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Link href="/" style={{ color: D.muted, fontSize: '13px', fontWeight: 500, textDecoration: 'none', padding: '6px 12px', borderRadius: '8px' }}>Home</Link>
          <Link href="/experience" style={{ color: D.muted, fontSize: '13px', fontWeight: 500, textDecoration: 'none', padding: '6px 12px', borderRadius: '8px' }}>Experience</Link>
          <span style={{ color: D.text, fontSize: '13px', fontWeight: 500, padding: '6px 12px', background: '#F7F4F0', borderRadius: '8px' }}>Pricing</span>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ paddingTop: '140px', paddingBottom: '20px', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: D.red, marginBottom: '16px' }}>
          Simple, honest pricing
        </p>
        <h1 style={{
          fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 900,
          letterSpacing: '-0.05em', lineHeight: 1.08, marginBottom: '18px',
        }}>
          Protection that scales<br />with you.
        </h1>
        <p style={{ fontSize: '16px', color: D.muted, maxWidth: '480px', margin: '0 auto 36px', lineHeight: 1.75 }}>
          Start free. Upgrade when you need developer tools, team visibility,
          or enterprise compliance.
        </p>

        {/* Billing toggle */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '4px', background: '#F7F4F0', borderRadius: '100px', marginBottom: '48px' }}>
          <button
            onClick={() => setAnnual(false)}
            style={{
              padding: '8px 18px', borderRadius: '100px', border: 'none',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              background: !annual ? '#fff' : 'transparent',
              color: !annual ? D.text : D.muted,
              boxShadow: !annual ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}
          >Monthly</button>
          <button
            onClick={() => setAnnual(true)}
            style={{
              padding: '8px 18px', borderRadius: '100px', border: 'none',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              background: annual ? '#fff' : 'transparent',
              color: annual ? D.text : D.muted,
              boxShadow: annual ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}
          >Annual <span style={{ color: D.red, fontWeight: 700 }}>-25%</span></button>
        </div>
      </section>

      {/* TIER CARDS */}
      <section style={{ maxWidth: '1080px', margin: '0 auto', padding: '0 24px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', alignItems: 'start' }}>

          {/* INDIVIDUAL */}
          <div style={{
            background: '#fff', borderRadius: '20px',
            border: `1px solid ${D.border}`,
            padding: '36px 32px', overflow: 'hidden',
          }}>
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: D.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>Individual</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '44px', fontWeight: 900, letterSpacing: '-0.04em' }}>$0</span>
                <span style={{ fontSize: '14px', color: D.muted }}>/always</span>
              </div>
              <p style={{ fontSize: '13px', color: D.muted, marginTop: '8px', lineHeight: 1.6 }}>
                For anyone who uses AI tools and wants to stop leaking sensitive data.
              </p>
            </div>

            <a href="https://chromewebstore.google.com/detail/kasbah-guard/idikjiajiomhekkkpfkhnpfepfgknokc"
              style={{
                display: 'block', padding: '12px 20px', marginBottom: '28px',
                background: '#F7F4F0', color: D.text,
                textDecoration: 'none', borderRadius: '10px',
                fontWeight: 700, fontSize: '14px', textAlign: 'center',
              }}>
              Install Free Extension
            </a>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                'Browser extension — Chrome, Firefox, Edge, Opera, Safari',
                '50+ secret formats: API keys, SSNs, credit cards, passwords, private keys',
                'Real-time detection on ChatGPT, Claude, Gemini, Copilot & 24 AI platforms',
                'ML entropy scoring (Naive Bayes + Shannon entropy + context filtering)',
                '18-moat egress gate — blocks fetch, XHR, WebSocket, forms, beacons & more',
                '8 anti-evasion decoders: Base64, hex, ROT13, homoglyphs, zero-width, l33t',
                'Multilingual detection — English, Arabic, Mandarin, Cyrillic, Japanese, Korean, Greek',
                '100% local — nothing ever leaves your device. Works offline.',
                'No account required. Works instantly.',
              ].map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <CHECK />
                  <span style={{ fontSize: '13px', color: D.muted, lineHeight: 1.5 }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* PROFESSIONAL */}
          <div style={{
            background: D.text, borderRadius: '20px',
            border: `2px solid ${D.red}`,
            padding: '36px 32px', overflow: 'hidden',
            position: 'relative', color: '#fff',
            boxShadow: '0 8px 40px rgba(193,68,14,0.15)',
          }}>
            <div style={{
              position: 'absolute', top: '-1px', left: '50%', transform: 'translateX(-50%)',
              background: D.red, color: '#fff', fontSize: '11px', fontWeight: 700,
              padding: '4px 16px', borderRadius: '0 0 8px 8px',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>Most popular</div>

            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>Professional</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '44px', fontWeight: 900, letterSpacing: '-0.04em' }}>${proPrice}</span>
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>/month</span>
              </div>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '8px', lineHeight: 1.6 }}>
                For developers and professionals who want full-stack protection across every tool they use.
              </p>
            </div>

            <a href="mailto:yo@bekasbah.com?subject=Kasbah Professional — Early Access"
              style={{
                display: 'block', padding: '12px 20px', marginBottom: '28px',
                background: D.red, color: '#fff',
                textDecoration: 'none', borderRadius: '10px',
                fontWeight: 700, fontSize: '14px', textAlign: 'center',
              }}>
              Get Early Access
            </a>

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>Everything in Individual, plus:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {([
                ['CLI tool (Rust)', 'Scan files, directories, git repos. Watch mode, stdin pipe, redact mode. CI/CD exit codes (0/1/2). JSON, CSV, SARIF output.'],
                ['VS Code extension', 'Inline detection with diagnostics, one-click redaction, clipboard scanning, on-save auto-scan, status bar risk indicator.'],
                ['SDK (@kasbah/guard)', 'npm package — classify(), redact(), isSafe(), getRisk(), selfTest(). Works in Node.js, Browser, Cloudflare Workers, Vercel Edge, Deno.'],
                ['API access', 'REST endpoints: /api/scan, /api/validate-intent, /api/proofs, /api/stats, /api/audit. Integrate into any pipeline.'],
                ['Custom detection patterns', 'Define your own regex patterns: project codenames, internal IDs, client account numbers. Works across all tools.'],
                ['Constitutional AI', 'Intent validation — detect prompt injection, jailbreaks, data exfiltration, malware intent, privacy violations. 5-rule engine + heuristic scoring.'],
                ['Zero-knowledge proofs', 'Merkle-SHA256 cryptographic receipts. Prove detection happened without exposing the secret. Tamper-proof audit trail.'],
                ['Supply chain analysis', 'DataSupplyChainTracker — 15 PII categories, GDPR/CCPA/HIPAA/AI Act compliance mapping for data lineage.'],
                ['Git pre-commit hooks', 'Block commits containing secrets before they reach your repo. Works with any Git workflow.'],
                ['Priority support', 'Direct email line. 24-hour response.'],
              ] as [string, string][]).map(([title, desc], i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <CHECK color={D.red} />
                  <div>
                    <span style={{ fontSize: '13px', color: '#fff', fontWeight: 600 }}>{title}</span>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', display: 'block', lineHeight: 1.5, marginTop: '2px' }}>{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* BUSINESS */}
          <div style={{
            background: '#fff', borderRadius: '20px',
            border: `1px solid ${D.border}`,
            padding: '36px 32px', overflow: 'hidden',
          }}>
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: D.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>Business</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '44px', fontWeight: 900, letterSpacing: '-0.04em' }}>${bizPrice}</span>
                <span style={{ fontSize: '14px', color: D.muted }}>/seat/month</span>
              </div>
              <p style={{ fontSize: '13px', color: D.muted, marginTop: '8px', lineHeight: 1.6 }}>
                For teams and organisations that need visibility, control, and compliance across every employee.
              </p>
            </div>

            <a href="mailto:yo@bekasbah.com?subject=Kasbah Business — Early Access"
              style={{
                display: 'block', padding: '12px 20px', marginBottom: '28px',
                background: D.text, color: '#fff',
                textDecoration: 'none', borderRadius: '10px',
                fontWeight: 700, fontSize: '14px', textAlign: 'center',
              }}>
              Talk to Sales
            </a>

            <div style={{ fontSize: '11px', fontWeight: 600, color: D.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>Everything in Professional, plus:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {([
                ['Enterprise admin dashboard', 'Real-time threat feed, deployment status, QuickStats overview across your entire organisation.'],
                ['Policy enforcement', 'Block, warn, or log by data type — per team, per role, per user. Escalation rules, global thresholds, user exemptions.'],
                ['Full audit log', 'Per-user event history. Hash-chained integrity (tamper-proof). Exportable JSON/CSV. Retention you control.'],
                ['Real-time alerts', 'Slack, email, PagerDuty, webhooks. Instant notification the moment someone nearly leaks something critical.'],
                ['Team management', 'Add/remove users, role-based access control (RBAC), per-user activity tracking, invitation system.'],
                ['Compliance automation', 'One-click SOC 2, HIPAA, GDPR, PCI-DSS, CCPA, FERPA evidence reports. Export PDF/JSON/CSV.'],
                ['SSO / SAML', 'Okta, Azure AD, Google Workspace. Your identity provider, our protection.'],
                ['Industry-specific guards', 'Hospital Guardian (18 HIPAA PHI patterns), Legal Shield (attorney-client privilege), Slack Guard, Discord Guard.'],
                ['Honeypot & threat intelligence', 'Deploy canary tokens, track trigger events, distributed threat consensus across your org.'],
                ['Streaming analysis', 'Session-based real-time detection on data streams. Create, analyze, and monitor streaming sessions.'],
                ['22 nature-inspired security modules', 'Antifragile thresholds, swarm consensus, immune response, circadian access control, credential rotation, rate limiting, and 16 more.'],
                ['eBPF kernel enforcement', 'Ed25519 ticket-based execution control. Hardware-level — secrets blocked before they reach the network.'],
                ['Signal processing', 'MFCC audio analysis, DCT video artifact detection, deepfake detection pipeline. 30-dimensional feature vectors.'],
                ['Deployment orchestration', 'Rollout, pause, resume, rollback. Multi-environment support. Status tracking per deployment.'],
                ['On-premise deployment', 'Self-hosted. Kubernetes manifests, Helm charts, Prometheus + Grafana monitoring. Air-gapped environments.'],
                ['Dedicated account manager', 'Named contact. Custom onboarding. SLA guarantee.'],
              ] as [string, string][]).map(([title, desc], i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <CHECK />
                  <div>
                    <span style={{ fontSize: '13px', color: D.text, fontWeight: 600 }}>{title}</span>
                    <span style={{ fontSize: '12px', color: D.muted, display: 'block', lineHeight: 1.5, marginTop: '2px' }}>{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE COMPARISON TABLE */}
      <section style={{
        maxWidth: '1080px', margin: '0 auto', padding: '0 24px 100px',
      }}>
        <h2 style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.03em', textAlign: 'center', marginBottom: '40px' }}>
          Full feature comparison
        </h2>

        <div style={{
          background: '#fff', borderRadius: '16px',
          border: `1px solid ${D.border}`,
          overflow: 'hidden',
        }}>
          {/* Header row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px',
            padding: '16px 24px', borderBottom: `1px solid ${D.border}`,
            background: '#FAFAF9',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Feature</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Individual</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: D.red, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Professional</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Business</span>
          </div>

          {/* Feature rows */}
          {([
            { section: 'Detection engine' },
            { feature: 'Browser extension (5 browsers)', ind: true, pro: true, biz: true },
            { feature: '50+ secret format patterns', ind: true, pro: true, biz: true },
            { feature: 'ML entropy scoring (Naive Bayes)', ind: true, pro: true, biz: true },
            { feature: 'Context-aware false positive filtering', ind: true, pro: true, biz: true },
            { feature: 'Real-time on ChatGPT, Claude, Gemini + 24 platforms', ind: true, pro: true, biz: true },
            { feature: '18-moat egress gate (fetch, XHR, WebSocket, etc.)', ind: true, pro: true, biz: true },
            { feature: '8 anti-evasion decoders (Base64, homoglyphs, l33t, Zalgo)', ind: true, pro: true, biz: true },
            { feature: 'Multilingual detection (7 languages)', ind: true, pro: true, biz: true },
            { feature: 'Luhn / mod-97 / checksum validation', ind: true, pro: true, biz: true },
            { feature: 'Custom detection patterns', ind: false, pro: true, biz: true },
            { feature: 'Constitutional AI (injection / jailbreak detection)', ind: false, pro: true, biz: true },

            { section: 'Developer tools' },
            { feature: 'CLI tool (scan, watch, redact, validate-intent)', ind: false, pro: true, biz: true },
            { feature: 'Stdin pipe for CI/CD pipelines', ind: false, pro: true, biz: true },
            { feature: 'JSON / CSV / SARIF output', ind: false, pro: true, biz: true },
            { feature: 'VS Code extension (inline detection + redaction)', ind: false, pro: true, biz: true },
            { feature: 'SDK — npm, Browser, Cloudflare Workers, Vercel Edge, Deno', ind: false, pro: true, biz: true },
            { feature: 'API endpoint (REST)', ind: false, pro: true, biz: true },
            { feature: 'Git pre-commit hooks', ind: false, pro: true, biz: true },
            { feature: 'CI/CD integration (exit codes 0/1/2)', ind: false, pro: true, biz: true },
            { feature: 'Supply chain analysis (15 PII categories)', ind: false, pro: true, biz: true },

            { section: 'Team & visibility' },
            { feature: 'Admin dashboard (real-time threat feed)', ind: false, pro: false, biz: true },
            { feature: 'Policy enforcement (block / warn / log per role)', ind: false, pro: false, biz: true },
            { feature: 'Escalation rules & global thresholds', ind: false, pro: false, biz: true },
            { feature: 'Per-user audit log (hash-chained, tamper-proof)', ind: false, pro: false, biz: true },
            { feature: 'Team management & RBAC', ind: false, pro: false, biz: true },
            { feature: 'Real-time Slack alerts', ind: false, pro: false, biz: true },
            { feature: 'Email digest (daily or per-event)', ind: false, pro: false, biz: true },
            { feature: 'PagerDuty & webhook integration', ind: false, pro: false, biz: true },
            { feature: 'Deployment orchestration (rollout / pause / rollback)', ind: false, pro: false, biz: true },

            { section: 'Compliance & security' },
            { feature: 'Zero-knowledge proofs (Merkle-SHA256)', ind: false, pro: true, biz: true },
            { feature: 'Cryptographic audit receipts', ind: false, pro: true, biz: true },
            { feature: 'SOC 2 evidence reports', ind: false, pro: false, biz: true },
            { feature: 'HIPAA compliance reports', ind: false, pro: false, biz: true },
            { feature: 'GDPR / CCPA / PCI-DSS / FERPA reports', ind: false, pro: false, biz: true },
            { feature: 'Compliance export (PDF / JSON / CSV)', ind: false, pro: false, biz: true },

            { section: 'Enterprise & industry' },
            { feature: 'SSO / SAML (Okta, Azure AD, Google)', ind: false, pro: false, biz: true },
            { feature: 'Hospital Guardian (18 HIPAA PHI patterns)', ind: false, pro: false, biz: true },
            { feature: 'Legal Shield (attorney-client privilege)', ind: false, pro: false, biz: true },
            { feature: 'Slack Guard (real-time message monitoring)', ind: false, pro: false, biz: true },
            { feature: 'Discord Guard (real-time message monitoring)', ind: false, pro: false, biz: true },
            { feature: 'Honeypot canary tokens & threat intelligence', ind: false, pro: false, biz: true },
            { feature: 'Streaming session analysis', ind: false, pro: false, biz: true },
            { feature: '22 nature-inspired security modules (PPP)', ind: false, pro: false, biz: true },
            { feature: 'eBPF kernel enforcement (Ed25519 tickets)', ind: false, pro: false, biz: true },
            { feature: 'Signal processing (deepfake detection)', ind: false, pro: false, biz: true },
            { feature: 'On-premise / air-gapped deployment', ind: false, pro: false, biz: true },
            { feature: 'Kubernetes + Helm + Prometheus + Grafana', ind: false, pro: false, biz: true },
            { feature: 'Dedicated account manager + SLA', ind: false, pro: false, biz: true },

            { section: 'Privacy' },
            { feature: '100% local processing (extension)', ind: true, pro: true, biz: true },
            { feature: 'Zero data sent to servers', ind: true, pro: true, biz: true },
            { feature: 'Open detection engine', ind: true, pro: true, biz: true },
            { feature: 'Works offline', ind: true, pro: true, biz: true },
          ] as Array<{ section?: string; feature?: string; ind?: boolean; pro?: boolean; biz?: boolean }>).map((row, i) => {
            if (row.section) {
              return (
                <div key={i} style={{
                  padding: '12px 24px',
                  background: '#FAFAF9',
                  borderTop: `1px solid ${D.border}`,
                  fontSize: '11px', fontWeight: 700, color: D.text,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  {row.section}
                </div>
              );
            }
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px',
                padding: '11px 24px',
                borderTop: `1px solid rgba(232,226,219,0.5)`,
                fontSize: '13px', color: D.muted,
              }}>
                <span>{row.feature}</span>
                <span style={{ textAlign: 'center' }}>{row.ind ? <CHECK /> : <DASH />}</span>
                <span style={{ textAlign: 'center' }}>{row.pro ? <CHECK color={D.red} /> : <DASH />}</span>
                <span style={{ textAlign: 'center' }}>{row.biz ? <CHECK /> : <DASH />}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section style={{
        padding: '80px 24px', textAlign: 'center',
        background: D.text, color: '#fff',
      }}>
        <h2 style={{
          fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900,
          letterSpacing: '-0.04em', lineHeight: 1.1,
          marginBottom: '16px',
        }}>
          Start protecting your data today.
        </h2>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.45)', maxWidth: '440px', margin: '0 auto 36px', lineHeight: 1.75 }}>
          The free extension takes 30 seconds to install. No account, no setup, no catch.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="https://chromewebstore.google.com/detail/kasbah-guard/idikjiajiomhekkkpfkhnpfepfgknokc"
            style={{
              display: 'inline-block', padding: '14px 36px',
              background: D.red, color: '#fff',
              textDecoration: 'none', borderRadius: '10px',
              fontWeight: 700, fontSize: '15px',
            }}>
            Install Free Extension
          </a>
          <a href="mailto:yo@bekasbah.com?subject=Kasbah Pro"
            style={{
              display: 'inline-block', padding: '14px 36px',
              background: 'rgba(255,255,255,0.08)', color: '#fff',
              textDecoration: 'none', borderRadius: '10px',
              fontWeight: 700, fontSize: '15px',
              border: '1px solid rgba(255,255,255,0.15)',
            }}>
            Talk to Sales
          </a>
        </div>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', marginTop: '24px' }}>
          Questions? yo@bekasbah.com
        </p>
      </section>
    </div>
  );
}
