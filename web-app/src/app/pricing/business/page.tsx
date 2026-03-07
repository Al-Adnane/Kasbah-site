'use client';

import Link from 'next/link';

const D = { bg: '#FEFCFA', text: '#0F172A', red: '#C1440E', muted: '#64748B', border: '#E8E2DB' };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: '48px' }}>
    <h3 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '20px', color: D.text }}>{title}</h3>
    {children}
  </div>
);

const Feature = ({ title, desc }: { title: string; desc: string }) => (
  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
    <span style={{ color: '#22C55E', fontWeight: 700, fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>&#10003;</span>
    <div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: D.text, marginBottom: '2px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: D.muted, lineHeight: 1.6 }}>{desc}</div>
    </div>
  </div>
);

export default function BusinessPage() {
  return (
    <div style={{ background: D.bg, color: D.text, fontFamily: 'Inter, system-ui, sans-serif', minHeight: '100vh' }}>
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
          <Link href="/pricing" style={{ color: D.muted, fontSize: '13px', fontWeight: 500, textDecoration: 'none', padding: '6px 12px', borderRadius: '8px' }}>All Plans</Link>
          <Link href="/pricing/individual" style={{ color: D.muted, fontSize: '13px', fontWeight: 500, textDecoration: 'none', padding: '6px 12px', borderRadius: '8px' }}>Individual</Link>
          <Link href="/pricing/professional" style={{ color: D.muted, fontSize: '13px', fontWeight: 500, textDecoration: 'none', padding: '6px 12px', borderRadius: '8px' }}>Professional</Link>
          <span style={{ color: D.text, fontSize: '13px', fontWeight: 500, padding: '6px 12px', background: '#F7F4F0', borderRadius: '8px' }}>Business</span>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop: '140px', paddingBottom: '60px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', padding: '6px 16px', background: '#F1F5F9', color: D.text, borderRadius: '100px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '20px' }}>
          Enterprise-grade
        </div>
        <h1 style={{ fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1.08, marginBottom: '18px' }}>
          Business
        </h1>
        <p style={{ fontSize: '17px', color: D.muted, maxWidth: '600px', margin: '0 auto 12px', lineHeight: 1.75 }}>
          Everything in Professional, plus team visibility, policy enforcement, compliance automation, industry-specific guards, and frontier security technology no competitor has.
        </p>
        <p style={{ fontSize: '36px', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: '8px' }}>
          $29<span style={{ fontSize: '16px', color: D.muted, fontWeight: 500 }}>/seat/month (annual)</span>
        </p>
        <p style={{ fontSize: '13px', color: D.muted, marginBottom: '28px' }}>or $39/seat/month billed monthly</p>
        <a href="mailto:yo@bekasbah.com?subject=Kasbah Business — Early Access"
          style={{ display: 'inline-block', padding: '16px 40px', background: D.text, color: '#fff', textDecoration: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '16px' }}>
          Talk to Sales
        </a>
        <p style={{ fontSize: '12px', color: D.muted, marginTop: '12px' }}>Custom onboarding. SLA guarantee. Named account manager.</p>
      </section>

      {/* Features */}
      <section style={{ maxWidth: '720px', margin: '0 auto', padding: '0 24px 100px' }}>

        <Section title="Enterprise Admin Dashboard">
          <Feature title="Real-time threat feed" desc="See every detection event across your entire organisation as it happens. Filter by user, data type, severity, time range." />
          <Feature title="QuickStats overview" desc="Total scans, threats detected, active users, API calls — all at a glance with trend indicators." />
          <Feature title="Deployment status" desc="Monitor extension rollout across your org. Track which users have installed, which are outdated, and deployment health." />
        </Section>

        <Section title="Policy Enforcement">
          <Feature title="Block, warn, or log per data type" desc="Configure per team, per role, per user. Some teams need hard blocks on credit cards. Others just need warnings on API keys. You decide." />
          <Feature title="Global thresholds" desc="Set organisation-wide risk thresholds. Everything above 70 is blocked. Everything above 40 warns. Customise to your risk tolerance." />
          <Feature title="User exemptions" desc="Security team needs to test with real credentials? Grant temporary exemptions with audit trail and automatic expiry." />
          <Feature title="Escalation rules" desc="Auto-escalate critical detections to security leads. Configure escalation chains by severity, data type, or user group." />
        </Section>

        <Section title="Full Audit Log">
          <Feature title="Per-user event history" desc="Every detection, every decision, every override — logged with timestamp, user, data type, risk score, and action taken." />
          <Feature title="Hash-chained integrity" desc="Tamper-proof audit trail. Each event is cryptographically linked to the previous one. If anyone modifies a log entry, the chain breaks." />
          <Feature title="Export &amp; retention" desc="Export in JSON, CSV, or PDF. Retention period you control — 30 days, 1 year, or indefinite. Meets SOC 2 and HIPAA retention requirements." />
        </Section>

        <Section title="Real-Time Alerts">
          <Feature title="Slack integration" desc="Instant alerts to #kasbah-alerts with user email, data type, severity, and action taken. Example: 'Critical — AWS credential detected: james.r@company.com almost sent an AWS Access Key to ChatGPT. Blocked before transmission.'" />
          <Feature title="Email digest" desc="Daily summary or per-event notifications. Configure which severity levels trigger emails and who receives them." />
          <Feature title="PagerDuty integration" desc="Critical-severity detections trigger PagerDuty incidents. On-call engineers get notified immediately." />
          <Feature title="Webhook support" desc="Send detection events to any HTTP endpoint. Build custom integrations with your existing security tools." />
        </Section>

        <Section title="Team Management">
          <Feature title="Role-based access control" desc="Admin, Security Lead, Manager, Member. Each role sees different dashboard views and has different policy permissions." />
          <Feature title="User lifecycle" desc="Add, invite, update, and remove team members. Track per-user activity, detection history, and policy compliance." />
        </Section>

        <Section title="Compliance Automation">
          <Feature title="One-click compliance reports" desc="Generate evidence reports for SOC 2, HIPAA, GDPR, PCI-DSS, CCPA, and FERPA with a single click. Export as PDF, JSON, or CSV." />
          <Feature title="Framework-specific evidence mapping" desc="Each detection event is automatically mapped to the relevant compliance framework control. SOC 2 CC6.1? HIPAA 164.312(a)(1)? Already tagged." />
          <Feature title="Audit-ready exports" desc="Hand your auditor a PDF. Every detection, every policy decision, every override — with cryptographic proof it happened when you say it did." />
        </Section>

        <Section title="SSO / SAML">
          <Feature title="Identity provider integration" desc="Okta, Azure AD, Google Workspace. Your employees log in with existing credentials. No separate Kasbah passwords to manage." />
        </Section>

        <Section title="Industry-Specific Guards">
          <Feature title="Hospital Guardian (HIPAA)" desc="18 Protected Health Information (PHI) identifier patterns purpose-built for healthcare. Detects patient names in medical context, MRN numbers, diagnosis codes, prescription details, and insurance identifiers. Goes far beyond generic PII detection." />
          <Feature title="Legal Shield" desc="Attorney-client privilege detection. Identifies legal case references, privileged communication markers, court filing numbers, and confidential legal document patterns. Prevents accidental waiver of privilege." />
          <Feature title="Slack Guard" desc="Real-time message monitoring in Slack channels. Scans outgoing messages for secrets before they reach Slack servers. Integrates with Slack Bolt framework." />
          <Feature title="Discord Guard" desc="Real-time message monitoring in Discord servers. Same detection engine, purpose-built for Discord bot integration." />
        </Section>

        <Section title="Honeypot &amp; Threat Intelligence">
          <Feature title="Canary token deployment" desc="Plant honeypot markers in your codebase — fake API keys, fake credentials. When someone accesses them, you know your code has been compromised." />
          <Feature title="Trigger event tracking" desc="See exactly when, where, and how a canary token was accessed. IP address, user agent, timestamp, and access pattern." />
          <Feature title="Distributed threat consensus" desc="Cross-org threat intelligence. When one organisation detects a new attack pattern, all participating orgs benefit from the detection." />
        </Section>

        <Section title="Streaming &amp; Real-Time Analysis">
          <Feature title="Session-based streaming" desc="Create persistent analysis sessions for continuous data streams. Real-time detection as data flows through your systems." />
          <Feature title="Stream chunk analysis" desc="Analyze data in chunks as it arrives. No need to buffer the entire payload — detection happens incrementally." />
        </Section>

        <Section title="22 Nature-Inspired Security Modules (PPP)">
          <p style={{ fontSize: '13px', color: D.muted, lineHeight: 1.6, marginBottom: '20px' }}>
            Every module is inspired by a biological defence mechanism found in nature. Together, they form the most comprehensive adaptive security layer available in any product.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              ['Antifragile', 'Adaptive thresholds that get stronger under attack (bone/muscle response)'],
              ['Swarm Consensus', 'Distributed voting for threat detection (murmuration/ant colony)'],
              ['Immune Response', 'Pattern memory with ML-based detection (adaptive immune system)'],
              ['Circadian', 'Time-based access control policies (circadian clock)'],
              ['Apoptosis', 'Automatic data lifecycle TTL and expiration (programmed cell death)'],
              ['Metamorphosis', 'Automated credential rotation and key refresh (chrysalis/axolotl)'],
              ['Thermoregulation', 'Intelligent rate limiting and load regulation (homeostasis)'],
              ['Hibernation', 'Session dormancy and timeout policies (bear winter sleep)'],
              ['Bioluminescence', 'Canary token deployment and honeypot creation (anglerfish/firefly)'],
              ['Echolocation', 'Endpoint probing and health checks (bat/dolphin sonar)'],
              ['Kinship Graph', 'Social recovery and multi-sig threshold authentication (pack/colony trust)'],
              ['Stigmergy', 'Indirect coordination via async signal propagation (pheromone trails)'],
              ['Mycelium Mesh', 'Resilient network routing (wood wide web)'],
              ['Camouflage', 'Response normalization and fingerprint masking (cuttlefish)'],
              ['Mimicry', 'Honeypot mimicry and deception tactics (kingsnake/coral)'],
              ['Seed Dispersal', 'Threat intelligence propagation (dandelion/berry)'],
              ['Bio Source', 'Behavioural biometrics and device profiling (biological fingerprint)'],
              ['Ecosystem Credits', 'Incentive ledger and resource allocation (nutrient cycle)'],
              ['Root Bridge', 'Cross-domain system bridging (mangrove roots)'],
              ['Phototropism', 'ML threshold optimization and tuning (auxin redistribution)'],
              ['Symbiosis', 'Product partnership integration layer (clownfish/anemone)'],
              ['Regeneration', 'Recovery orchestration and system healing (axolotl limb regrowth)'],
            ].map(([name, desc], i) => (
              <div key={i} style={{ padding: '12px', borderRadius: '8px', border: `1px solid ${D.border}`, background: '#fff' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: D.text, marginBottom: '2px' }}>{name}</div>
                <div style={{ fontSize: '11px', color: D.muted, lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="eBPF Kernel Enforcement">
          <Feature title="Ed25519 ticket-based execution control" desc="Every process execution requires a cryptographically signed ticket. The TicketIssuer in userspace signs tickets with Ed25519; the TicketValidator in kernel space verifies them via eBPF LSM hooks." />
          <Feature title="Hardware-level protection" desc="Secrets are blocked before they reach the network — at the kernel level. Not just a browser extension, not just an API call. This is enforcement at the operating system boundary." />
          <Feature title="Ticket lifecycle" desc="Each ticket contains PID, command hash (SHA-256), risk score, TTL, and decision (ALLOW/WARN/DENY). Expired tickets are automatically rejected. Invalid signatures are flagged." />
          <Feature title="Linux 5.8+ support" desc="Requires CONFIG_BPF_LSM. Hooks into bprm_check_security for process execution validation. Works with any Linux distribution that supports eBPF." />
        </Section>

        <Section title="Signal Processing (Deepfake Detection)">
          <Feature title="MFCC audio analysis" desc="Mel-Frequency Cepstral Coefficient extraction with STFT (FFT size=512, hop=160), Mel filterbank, and DCT-II. 13 coefficients + delta + delta-delta = 39 features per frame for silent-speech detection." />
          <Feature title="DCT video artifact detection" desc="Analyzes 8x8 DCT blocks in video frames to detect JPEG compression artifacts, block boundary artifacts, and camera manipulation signatures." />
          <Feature title="30-dimensional feature vectors" desc="Shannon entropy, zero crossing rate, RMS energy, spectral centroid, 13 MFCC means, 13 MFCC standard deviations — extracted for lightweight classification." />
          <Feature title="ML model pipelines" desc="Silent-speech detection via BiLSTM+Attention architecture. Camera-artifact detection via EfficientNet-B0 CNN. Both designed for ONNX runtime inference on any device." />
        </Section>

        <Section title="Deployment &amp; Orchestration">
          <Feature title="Rollout management" desc="Deploy Kasbah across your organisation with rollout controls. Pause, resume, and rollback deployments. Status tracking per deployment with health checks." />
          <Feature title="Multi-environment support" desc="Staging, production, and custom environments. Different policies per environment. Promote configurations from staging to production." />
        </Section>

        <Section title="On-Premise Deployment">
          <Feature title="Self-hosted infrastructure" desc="Run Kasbah entirely on your own servers. Air-gapped environments supported. No data ever leaves your network." />
          <Feature title="Kubernetes-ready" desc="11 production-ready Kubernetes manifests. Namespace, deployment, service, configmap, and secret templates. High-availability with replica configuration." />
          <Feature title="Helm charts" desc="Helmfile for multi-environment deployment. Values overrides for staging and production. Chart templates for all Kasbah components." />
          <Feature title="Monitoring included" desc="Prometheus configuration for metrics scraping. Grafana dashboard definitions. Alert rules for key health indicators. Health-check scripts for pre/post-deployment verification." />
        </Section>

        <Section title="Dedicated Support">
          <Feature title="Named account manager" desc="A dedicated contact who knows your organisation, your policies, and your compliance requirements. Not a ticket queue — a person." />
          <Feature title="Custom onboarding" desc="We help you deploy, configure policies, set up alerts, and train your team. Hands-on, not self-serve." />
          <Feature title="SLA guarantee" desc="Uptime commitments, response time guarantees, and escalation procedures — documented and enforceable." />
        </Section>

        {/* CTA */}
        <div style={{
          padding: '36px', borderRadius: '16px', textAlign: 'center',
          background: D.text, color: '#fff',
        }}>
          <h3 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>One leak from your team costs more than a year of Business.</h3>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginBottom: '24px' }}>
            Average cost of a data breach: $4.45M (IBM, 2023). Kasbah Business: $348/seat/year.
          </p>
          <a href="mailto:yo@bekasbah.com?subject=Kasbah Business — Early Access"
            style={{ display: 'inline-block', padding: '14px 36px', background: D.red, color: '#fff', textDecoration: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '15px' }}>
            Talk to Sales
          </a>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', marginTop: '16px' }}>
            Or email us directly at yo@bekasbah.com
          </p>
        </div>
      </section>
    </div>
  );
}
