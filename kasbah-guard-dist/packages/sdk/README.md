# @kasbah/guard

**Universal sensitive data detection SDK** — runs in Node.js, browsers, Cloudflare Workers, Vercel Edge, and Deno.

Powered by Kasbah Detection Engine v3.5.0 with 6 PPP nature-inspired techniques:
- 🐝 **Beeodiversity** — PII co-occurrence multiplier
- 🍄 **Fungi** — Cross-line hidden correlation
- 🌬️ **Breathe Easy** — Context-aware false positive filtering
- 🌱 **Soil Security** — Weak-signal dossier detection
- 🧫 **LanzaTech** — Encoded payload detection (base64/hex/URL)
- 🔥 **Aboriginal Fire** — Pattern stat temporal decay

## Install

```bash
npm install @kasbah/guard
```

## Usage

```typescript
import { classify, redact, isSafe } from '@kasbah/guard';

// Classify text
const result = classify("My SSN is 078-05-1120");
// { risk: 100, decision: 'DENY', reason: 'SSN; ...', tiers: ['T1:ssn'] }

// Check if safe
if (!isSafe(userInput)) {
  console.warn('Sensitive data detected!');
}

// Redact sensitive content
const safe = redact("SSN: 078-05-1120 — contact me");
// { text: '[REDACTED::SSN] — contact me', count: 1, types: ['SSN'] }
```

## Node.js: Scan files

```typescript
import { scanFile, scanDirectory } from '@kasbah/guard/node';

// Scan single file
const result = scanFile('./config.env');
// { path: './config.env', risk: 95, decision: 'DENY', reason: '...' }

// Scan entire codebase
const findings = scanDirectory('./src');
findings.forEach(f => console.log(`${f.decision}: ${f.path}`));
```

## Express middleware

```typescript
import express from 'express';
import { kasbahMiddleware } from '@kasbah/guard/examples/node-middleware';

const app = express();
app.use(express.json());
app.use(kasbahMiddleware({ blockOnDeny: false })); // adds X-Kasbah-Risk header
```

## React hook

```tsx
import { useKasbahGuard } from '@kasbah/guard/examples/react-hook';

function SecureInput() {
  const { value, onChange, warning } = useKasbahGuard('');
  return (
    <>
      <textarea value={value} onChange={onChange} />
      {warning && <div className="warning">{warning}</div>}
    </>
  );
}
```

## Detection capabilities

- Credit cards (with Luhn validation)
- SSN, passport, national ID (100+ languages)
- API keys (GitHub PAT, AWS, OpenAI, etc.)
- Bearer tokens, JWTs, connection strings
- Medical records, bank accounts, tax IDs
- Crypto wallets + seed phrases
- Prompt injection attacks
- Base64/hex/URL-encoded secrets
- Personal dossiers (name + address + phone + DOB aggregation)
- Homoglyph, Zalgo, l33t speak bypass attacks

## License

MIT — © Kasbah Guard
