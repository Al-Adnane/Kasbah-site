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

export default function IndividualPage() {
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
          <span style={{ color: D.text, fontSize: '13px', fontWeight: 500, padding: '6px 12px', background: '#F7F4F0', borderRadius: '8px' }}>Individual</span>
          <Link href="/pricing/professional" style={{ color: D.muted, fontSize: '13px', fontWeight: 500, textDecoration: 'none', padding: '6px 12px', borderRadius: '8px' }}>Professional</Link>
          <Link href="/pricing/business" style={{ color: D.muted, fontSize: '13px', fontWeight: 500, textDecoration: 'none', padding: '6px 12px', borderRadius: '8px' }}>Business</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop: '140px', paddingBottom: '60px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', padding: '6px 16px', background: '#ECFDF5', color: '#16A34A', borderRadius: '100px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '20px' }}>
          Free always
        </div>
        <h1 style={{ fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1.08, marginBottom: '18px' }}>
          Individual
        </h1>
        <p style={{ fontSize: '17px', color: D.muted, maxWidth: '560px', margin: '0 auto 36px', lineHeight: 1.75 }}>
          The most advanced browser-based secret detection engine available. Protects you every time you use ChatGPT, Claude, Gemini, or any AI tool. No account, no setup, no catch.
        </p>
        <a href="https://chromewebstore.google.com/detail/kasbah-guard/idikjiajiomhekkkpfkhnpfepfgknokc"
          style={{ display: 'inline-block', padding: '16px 40px', background: D.red, color: '#fff', textDecoration: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '16px' }}>
          Install Free Extension
        </a>
        <p style={{ fontSize: '12px', color: D.muted, marginTop: '12px' }}>Chrome, Firefox, Edge, Opera, Safari &mdash; 30 seconds to install</p>
      </section>

      {/* Features */}
      <section style={{ maxWidth: '720px', margin: '0 auto', padding: '0 24px 100px' }}>

        <Section title="50+ Secret Detection Patterns">
          <Feature title="API Keys &amp; Tokens" desc="AWS Access Keys, OpenAI, Anthropic, GitHub PAT (classic + fine-grained), Stripe, Firebase, Twilio, SendGrid, Slack webhooks, Discord, Vercel, Linear, Supabase, Netlify, PyPI, npm, Docker, Heroku, Cloudflare, Mailchimp, and more." />
          <Feature title="Credentials &amp; Connection Strings" desc="MongoDB, PostgreSQL, MySQL, Redis, MSSQL connection strings. Azure connections. GCP service accounts. JWT secrets. Bearer tokens. Environment variable assignments (SECRET=, API_KEY=, PASSWORD=)." />
          <Feature title="Financial Data" desc="Credit cards (Visa, Amex, Discover, MasterCard) with Luhn validation. SSNs. ABA routing numbers. IBAN (EU/GB/DE/FR/ES/IT) with mod-97 validation. Wire transfers (ACH, SWIFT, FEDWIRE). Tax forms (W-2, 1099, 1040). Tax IDs (SIN, EIN, TIN, NIF, NIE, CIF)." />
          <Feature title="Identity Documents" desc="Passports in 9 languages (English, Arabic, Mandarin, Cyrillic, Japanese, Korean, Greek, Hebrew, Thai). Visa numbers. Driver licenses with state-specific formats. National IDs (DNI, CIN, NIC, BSN)." />
          <Feature title="Healthcare &amp; Insurance" desc="NPI (National Provider Identifier). DEA numbers. Medicare Beneficiary IDs. Insurance policy identifiers. PHI markers. Prescription data." />
          <Feature title="Cryptographic Material" desc="Private keys (RSA, EC, PGP, SSH, PKCS8). Bitcoin and Ethereum addresses. Cryptocurrency seed phrases (BIP-39). PGP private key blocks." />
          <Feature title="AI Safety" desc="Prompt injection detection (ignore previous instructions, role switching). Shell command detection (rm -rf, DROP TABLE, PowerShell). Jailbreak attempt patterns." />
        </Section>

        <Section title="ML-Powered Detection Engine">
          <Feature title="Naive Bayes Classifier" desc="Multi-feature machine learning classifier running entirely on your device. Analyzes Shannon entropy, character-class transitions, unique character ratio, English bigram frequency, and run analysis to distinguish real secrets from benign text." />
          <Feature title="Context-Aware Filtering" desc="Suppresses false positives in test/demo code, template strings, placeholder values, and single-line comments. Knows the difference between a real API key and an example in documentation." />
          <Feature title="8 Anti-Evasion Decoders" desc="Base64, hex, ROT13, URI encoding, double-encoding, zero-width character stripping, homoglyph normalization (Cyrillic o to Latin o), and l33t speak deobfuscation. Attackers can't sneak secrets past Kasbah by encoding them." />
        </Section>

        <Section title="18-Moat Egress Gate">
          <Feature title="Every Exfiltration Vector Blocked" desc="fetch(), XMLHttpRequest, navigator.sendBeacon(), WebSocket, form submission, window.open(), image/script src mutations, history.pushState(), Credentials API, Blob URLs, IndexedDB, Service Workers, BroadcastChannel, SharedWorker, RTCDataChannel, window.name, URL.createObjectURL, and clipboard API." />
          <Feature title="Self-Healing Protection" desc="Object.defineProperty freezing prevents page JavaScript from overwriting hooks. A self-healing interval restores protection every 3 seconds if anything is bypassed." />
          <Feature title="Three Response Modes" desc="Silent (0-39 risk): safe content passes through invisibly. Toast warning (40-69): borderline content shows a non-blocking notification. Block modal (70-100): high-risk content is held with a clear explanation of what was found." />
        </Section>

        <Section title="Privacy &amp; Performance">
          <Feature title="100% Local Processing" desc="All detection happens on your device. Zero cloud. Zero data collection. Your prompts, pastes, files, and clipboard never leave your machine." />
          <Feature title="Sub-Millisecond Detection" desc="Detection runs in less than 1ms (p50: 0.23ms, p95: 0.87ms, p99: 1.95ms). You won't notice any delay." />
          <Feature title="Works Offline" desc="No internet connection required for detection. The engine is fully self-contained in the browser extension." />
          <Feature title="24 AI Platforms Covered" desc="ChatGPT, Claude, Gemini, Grok, Copilot, GitHub Copilot, DeepSeek, Perplexity, Poe, Mistral, Meta AI, HuggingFace Chat, Google AI Studio, NotebookLM, Cohere Coral, Manus, Cursor, Windsurf, Codeium, Pi, You.com, Google Labs, Open Assistant, LMSYS Chat Arena." />
        </Section>

        {/* Upgrade CTA */}
        <div style={{
          padding: '36px', borderRadius: '16px', textAlign: 'center',
          background: D.text, color: '#fff',
        }}>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Need developer tools or team features?</p>
          <h3 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '16px' }}>Upgrade to Professional or Business</h3>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/pricing/professional" style={{ display: 'inline-block', padding: '12px 28px', background: D.red, color: '#fff', textDecoration: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px' }}>
              Professional &mdash; $9/mo
            </Link>
            <Link href="/pricing/business" style={{ display: 'inline-block', padding: '12px 28px', background: 'rgba(255,255,255,0.08)', color: '#fff', textDecoration: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px', border: '1px solid rgba(255,255,255,0.15)' }}>
              Business &mdash; $29/seat/mo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
