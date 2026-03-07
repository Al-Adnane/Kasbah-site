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
    <span style={{ color: D.red, fontWeight: 700, fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>&#10003;</span>
    <div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: D.text, marginBottom: '2px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: D.muted, lineHeight: 1.6 }}>{desc}</div>
    </div>
  </div>
);

const Code = ({ children }: { children: string }) => (
  <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace', color: D.text }}>{children}</code>
);

export default function ProfessionalPage() {
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
          <span style={{ color: D.text, fontSize: '13px', fontWeight: 500, padding: '6px 12px', background: '#F7F4F0', borderRadius: '8px' }}>Professional</span>
          <Link href="/pricing/business" style={{ color: D.muted, fontSize: '13px', fontWeight: 500, textDecoration: 'none', padding: '6px 12px', borderRadius: '8px' }}>Business</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop: '140px', paddingBottom: '60px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', padding: '6px 16px', background: 'rgba(193,68,14,0.08)', color: D.red, borderRadius: '100px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '20px' }}>
          Most popular
        </div>
        <h1 style={{ fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1.08, marginBottom: '18px' }}>
          Professional
        </h1>
        <p style={{ fontSize: '17px', color: D.muted, maxWidth: '560px', margin: '0 auto 12px', lineHeight: 1.75 }}>
          Full-stack secret detection across every tool you use. CLI, VS Code, SDK, API, Constitutional AI, and zero-knowledge proofs.
        </p>
        <p style={{ fontSize: '36px', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: '8px' }}>
          $9<span style={{ fontSize: '16px', color: D.muted, fontWeight: 500 }}>/month (annual)</span>
        </p>
        <p style={{ fontSize: '13px', color: D.muted, marginBottom: '28px' }}>or $12/month billed monthly</p>
        <a href="mailto:yo@bekasbah.com?subject=Kasbah Professional — Early Access"
          style={{ display: 'inline-block', padding: '16px 40px', background: D.red, color: '#fff', textDecoration: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '16px' }}>
          Get Early Access
        </a>
        <p style={{ fontSize: '12px', color: D.muted, marginTop: '12px' }}>Everything in Individual, plus everything below.</p>
      </section>

      {/* Features */}
      <section style={{ maxWidth: '720px', margin: '0 auto', padding: '0 24px 100px' }}>

        <Section title="CLI Tool (Rust, v1.0.0)">
          <Feature title="kasbah scan" desc="Scan files and directories with configurable risk threshold (0-100). Smart directory ignoring (node_modules, .git, target). Recursive scanning with configurable depth." />
          <Feature title="kasbah scan - (stdin pipe)" desc="Pipe any text through Kasbah for CI/CD integration. echo $SECRET | kasbah scan - returns exit code 0 (clean), 1 (warn), or 2 (deny)." />
          <Feature title="kasbah watch" desc="Live file monitoring using the notify crate. Re-scans on every file change with ~10ms latency. Perfect for development workflows." />
          <Feature title="kasbah redact" desc="In-place redaction of sensitive data. Replaces secrets with [REDACTED::TYPE] markers. Dry-run mode prints to stdout without modifying files." />
          <Feature title="kasbah validate-intent" desc="Constitutional AI validation from the terminal. Checks prompts against 5 policy rules. Falls back to local validation if API is unavailable." />
          <Feature title="kasbah selftest" desc="10 invariant tests for deployment verification. Run before every deployment to ensure detector integrity." />
          <Feature title="Output formats" desc="JSON, CSV, and SARIF output for integration with any security toolchain. Exit codes (0/1/2) for CI/CD pipeline gates." />
        </Section>

        <Section title="VS Code Extension">
          <Feature title="kasbah.scanFile" desc="Real-time file scanning with VS Code diagnostics highlighting. Secrets are underlined and marked with severity indicators." />
          <Feature title="kasbah.redactSelection" desc="Select text, right-click, redact. One-click redaction replaces secrets inline with [REDACTED::TYPE] markers." />
          <Feature title="kasbah.scanClipboard" desc="Automatically checks clipboard contents when you paste. Warns if pasted content contains secrets before it enters your code." />
          <Feature title="On-save auto-scanning" desc="Configurable: scan every file on save. Catches secrets the moment they enter your codebase." />
          <Feature title="Status bar risk indicator" desc="Lightweight risk score in the VS Code status bar. Scans first 2KB of the active file for quick feedback." />
        </Section>

        <Section title="SDK (@kasbah/guard v1.0.0)">
          <Feature title="classify(text)" desc="Core detection function. Returns: risk score (0-100), decision (ALLOW/WARN/DENY), reasons array, detected types. TypeScript support with full type definitions." />
          <Feature title="redact(text)" desc="Programmatic secret replacement. Returns redacted text, count of items redacted, and types found." />
          <Feature title="isSafe(text) / getRisk(text) / getDecision(text)" desc="Convenience functions for common workflows. Boolean safety check, numeric risk score, or decision string." />
          <Feature title="selfTest()" desc="Programmatic verification returning { passed, total, results }. Use in build pipelines to verify detector integrity." />
          <Feature title="Framework integrations" desc="React hook (useKasbahGuard), Express middleware, Cloudflare Worker integration, Next.js edge middleware. Copy-paste examples included." />
          <Feature title="Universal runtime support" desc="Node.js (CommonJS + ES modules), Browser (global window.classify), Cloudflare Workers, Vercel Edge Functions, Deno. One package, every runtime." />
          <Feature title="Performance" desc="p50: 0.23ms, p95: 0.87ms, p99: 1.95ms. Over 42,000 operations per second throughput." />
        </Section>

        <Section title="Constitutional AI Intent Validation">
          <Feature title="5-rule policy engine" desc="Detects: (1) Prompt injection attacks, (2) Jailbreak attempts, (3) Data exfiltration requests, (4) Malware intent, (5) Privacy violations. Each rule has configurable severity." />
          <Feature title="Heuristic scoring" desc="Analyzes text length (>5000 chars: +0.1), Shannon entropy (>5.5: +0.15), and word repetition (>0.3: +0.1). Maximum heuristic contribution capped at 0.5." />
          <Feature title="Risk verdicts" desc="Returns { valid, risk_score, reasoning, blocked_rules, requires_approval }. Scores below 0.4 are valid, 0.4-0.5 require manual approval." />
          <Feature title="Offline fallback" desc="Works without API. Local validation runs the same 5-rule engine + heuristics entirely on your device with a 5-second API timeout." />
        </Section>

        <Section title="Zero-Knowledge Proofs (Merkle-SHA256)">
          <Feature title="generateProof(detectionResult)" desc="Creates a cryptographic commitment proof for any detection result. Returns proof_id, proof_bytes_hex, and public_inputs_hex. Hash-based — no secret content is leaked." />
          <Feature title="verifyProof(proof_id)" desc="Verify any proof by ID. Returns { verified: boolean }. Tamper-proof — once generated, a proof cannot be forged or altered." />
          <Feature title="Compliance-ready audit trail" desc="Prove to auditors that detection happened at a specific time, for a specific data type, with a specific decision — without revealing the actual secret that was detected." />
        </Section>

        <Section title="API Access (Authenticated)">
          <Feature title="POST /api/scan" desc="Server-side detection with the same 50+ patterns as the browser extension. Auth required (Bearer token)." />
          <Feature title="POST /api/validate-intent" desc="Constitutional AI validation via REST. Send intent text, receive { valid, risk_score, blocked_rules, reasoning }." />
          <Feature title="GET/POST /api/proofs/*" desc="Generate, list, and verify Merkle-SHA256 proofs via REST API." />
          <Feature title="GET /api/stats + GET /api/audit/recent" desc="Usage analytics and the last 20 audit events for your account." />
        </Section>

        <Section title="Custom Detection Patterns">
          <Feature title="Define your own regex patterns" desc="Create custom patterns from the dashboard: project codenames (NOVA-[A-Z0-9]{6}), client account IDs (ACC-\\d{8}), internal model IDs (mdl_[a-z0-9]{12})." />
          <Feature title="Works across all tools" desc="Custom patterns apply instantly across CLI, VS Code, SDK, and API. One definition, universal enforcement." />
        </Section>

        <Section title="Supply Chain Analysis">
          <Feature title="DataSupplyChainTracker" desc="15 PII categories with compliance mapping to GDPR, CCPA, HIPAA, and the EU AI Act. Track data lineage across your entire stack." />
          <Feature title="analyzeSupplyChain(text)" desc="Dependency vulnerability detection. Identify where sensitive data flows and which regulations apply." />
        </Section>

        {/* Upgrade CTA */}
        <div style={{
          padding: '36px', borderRadius: '16px', textAlign: 'center',
          background: D.text, color: '#fff',
        }}>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Need team visibility, compliance, or enterprise features?</p>
          <h3 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '16px' }}>Upgrade to Business</h3>
          <Link href="/pricing/business" style={{ display: 'inline-block', padding: '12px 28px', background: D.red, color: '#fff', textDecoration: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px' }}>
            Business &mdash; $29/seat/mo
          </Link>
        </div>
      </section>
    </div>
  );
}
