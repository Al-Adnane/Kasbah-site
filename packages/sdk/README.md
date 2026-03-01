# @kasbah/guard SDK v1.0.0

Universal JavaScript SDK for Kasbah Guard secret detection engine.

Detect API keys, passwords, credit cards, SSNs, and 50+ secret formats in your code, logs, and user input **locally** with zero external API calls.

---

## Features

✅ **50+ Secret Formats** — API keys, passwords, credit cards, SSNs, GitHub tokens, AWS keys, etc.
✅ **Local Processing** — 100% client-side detection, zero external calls
✅ **Sub-millisecond Latency** — p99 < 2ms on modern hardware
✅ **TypeScript Support** — Full type definitions included
✅ **Universal Runtime** — Works in Node.js, browsers, and Cloudflare Workers
✅ **Privacy-First** — No data sent to external servers
✅ **ML Entropy Scoring** — Naive Bayes classifier for improved accuracy

---

## Installation

```bash
npm install @kasbah/guard
```

---

## Quick Start

### Basic Usage

```typescript
import { classify, redact } from '@kasbah/guard';

// Detect secrets
const result = classify('API key: sk-proj-abc123');
console.log(result.decision);      // 'DENY'
console.log(result.risk);          // 95
console.log(result.reason);        // "HIGH RISK: Detected potential api key"

// Redact text
const safe = redact('SSN: 123-45-6789');
console.log(safe);                 // "SSN: [REDACTED: SSN]"
```

---

## API Reference

### `classify(text, options?)`

Analyze text for secrets.

**Parameters:**
- `text` (string) — Text to analyze
- `options` (ClassifyOptions, optional) — Configuration

**Returns:** `ClassificationResult`

**Example:**
```typescript
const result = classify('Password: hunter2', {
  min_threshold: 50,           // Only report detections ≥50% confidence
  include_proofs: true,        // Include detection details
  measure_latency: true,       // Measure performance
  context: 'unit-test',        // Provide context (false positive filter)
});

console.log(result);
// {
//   risk: 85,
//   risk_level: 'HIGH',
//   decision: 'DENY',
//   reason: 'HIGH RISK: Detected potential password...',
//   detections: [
//     { pattern: 'hunter2', category: 'password', confidence: 85, ... }
//   ],
//   latency_ms: 0.42,
//   engine_version: '1.0.0',
//   timestamp: '2026-03-01T...'
// }
```

---

### `redact(text)`

Redact secrets from text.

**Parameters:**
- `text` (string) — Text to redact

**Returns:** `string`

**Example:**
```typescript
const input = `
  Database URL: mongodb://user:password123@localhost:27017
  API Key: sk-proj-abc123def456
`;

const output = redact(input);
// Database URL: [REDACTED: DATABASE_URI]
// API Key: [REDACTED: API_KEY]
```

---

### `classifyBatch(texts, options?)`

Classify multiple texts efficiently.

**Parameters:**
- `texts` (string[]) — Array of texts to analyze
- `options` (ClassifyOptions, optional)

**Returns:** `ClassificationResult[]`

**Example:**
```typescript
const results = classifyBatch([
  'SSN: 123-45-6789',
  'Hello, world!',
  'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
]);

console.log(results);
// [
//   { risk: 95, decision: 'DENY', ... },
//   { risk: 0, decision: 'ALLOW', ... },
//   { risk: 98, decision: 'DENY', ... }
// ]
```

---

## Type Definitions

### `ClassificationResult`

```typescript
interface ClassificationResult {
  risk: number;                    // 0-100 score
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  decision: 'ALLOW' | 'WARN' | 'DENY';
  reason: string;                  // Human-readable explanation
  detections: DetectionProof[];    // Array of matched patterns
  latency_ms: number;              // Classification time in milliseconds
  engine_version: string;          // e.g., "1.0.0"
  timestamp: string;               // ISO 8601 timestamp
}
```

### `ClassifyOptions`

```typescript
interface ClassifyOptions {
  min_threshold?: number;          // Minimum confidence to report (0-100)
  max_threshold?: number;          // Maximum confidence to report (0-100)
  include_proofs?: boolean;        // Include detection details (default: true)
  measure_latency?: boolean;       // Measure performance (default: true)
  context?: string;                // Context for FP filtering (test/demo/etc)
}
```

### `DetectionProof`

```typescript
interface DetectionProof {
  pattern: string;                 // Matched substring
  category: SecretCategory;        // Category (api_key, password, etc)
  start: number;                   // Position in text
  end: number;                     // Position in text
  confidence: number;              // 0-100 confidence score
}
```

---

## Framework Integration

### React Hook

```typescript
// src/hooks/useKasbahGuard.ts
import { useCallback, useState } from 'react';
import { classify, ClassificationResult } from '@kasbah/guard';

export function useKasbahGuard() {
  const [result, setResult] = useState<ClassificationResult | null>(null);

  const scan = useCallback((text: string) => {
    const result = classify(text);
    setResult(result);
  }, []);

  return { result, scan };
}

// Usage
export function MyComponent() {
  const { result, scan } = useKasbahGuard();

  return (
    <div>
      <textarea onChange={(e) => scan(e.target.value)} />
      {result && (
        <div style={{ color: result.risk >= 70 ? 'red' : 'green' }}>
          Risk: {result.risk}% — {result.decision}
        </div>
      )}
    </div>
  );
}
```

### Express Middleware

```typescript
// src/middleware/kasbah.ts
import { Request, Response, NextFunction } from 'express';
import { classify } from '@kasbah/guard';

export function kasbahGuardMiddleware(req: Request, res: Response, next: NextFunction) {
  const bodyText = JSON.stringify(req.body);
  const result = classify(bodyText);

  if (result.decision === 'DENY') {
    return res.status(400).json({
      error: 'Potential secret detected in request body',
      risk: result.risk,
    });
  }

  next();
}

// Usage
app.use(kasbahGuardMiddleware);
```

### Cloudflare Worker

```typescript
// src/worker.ts
import { classify } from '@kasbah/guard';

export default {
  async fetch(request: Request): Promise<Response> {
    const body = await request.text();
    const result = classify(body);

    if (result.decision === 'DENY') {
      return new Response('Secret detected', { status: 403 });
    }

    return new Response('OK', { status: 200 });
  },
};
```

---

## Performance

Latency benchmarks (measured on MacBook Pro M3):

| Metric | Value |
|--------|-------|
| p50    | 0.23ms |
| p95    | 0.87ms |
| p99    | 1.95ms |
| Throughput | 42,000+ ops/sec |

Memory usage remains stable after 10k classifications (~2-3MB).

---

## Supported Secret Formats

- **PII**: SSN, phone numbers, emails, passports
- **Financial**: Credit cards (Visa, Mastercard, Amex), account numbers
- **API Keys**: OpenAI, Anthropic, GitHub, AWS, Slack, Stripe, Twilio, SendGrid, Discord, Vercel, etc.
- **Credentials**: Database URIs (MongoDB, PostgreSQL, MySQL, Redis), passwords
- **Cryptography**: Private keys (RSA, OPENSSH, EC), certificates
- **Cryptocurrency**: Bitcoin addresses, Ethereum addresses, seed phrases
- **Government IDs**: SSN, EIN, TIN, DNI, NIF, NIE, CIF, passports
- **Misc**: Vehicle identification numbers (VIN), patent numbers, base64-encoded secrets

See [detector.js](../../kasbah-guard-dist/extensions/chrome/src/detector.js) for complete pattern list.

---

## Security Considerations

✅ **No External Calls** — All detection happens locally
✅ **No Data Logging** — Results are ephemeral, not stored
✅ **No Credentials Sent** — Secrets are never transmitted
✅ **Context Filtering** — Reduces false positives in test/demo code
✅ **ML Entropy Scoring** — Naive Bayes classifier on character entropy

This SDK is designed for client-side use. For server-side security scanning, use the CLI:
```bash
kasbah scan /path/to/code
```

---

## Examples

### Scan User Input Before Submission

```typescript
import { classify } from '@kasbah/guard';

function validateInput(text: string): boolean {
  const result = classify(text);

  if (result.decision === 'DENY') {
    console.warn(`Secret detected: ${result.reason}`);
    return false;
  }

  return true;
}

// Usage
const userInput = document.getElementById('textarea').value;
if (validateInput(userInput)) {
  submitForm();
}
```

### Monitor API Requests

```typescript
import { classify } from '@kasbah/guard';

function interceptRequest(url: string, data: any) {
  const result = classify(JSON.stringify(data));

  if (result.decision === 'DENY') {
    // Log warning but allow (for debugging)
    console.warn(`Potential secret in request: ${result.reason}`);
  }

  return fetch(url, { method: 'POST', body: JSON.stringify(data) });
}
```

### Generate Safe Logs

```typescript
import { redact } from '@kasbah/guard';

function logUserAction(action: string, details: string) {
  const safeDetails = redact(details);  // Remove secrets
  console.log(`[${new Date().toISOString()}] ${action}: ${safeDetails}`);
}

// Usage
logUserAction('login', 'password=secretPass123');
// Output: login: password=[REDACTED: PASSWORD]
```

---

## Troubleshooting

### "Detector engine not available"

**Cause**: detector.js failed to load in Node.js context

**Solution**: Ensure detector.js path is correct relative to your setup. In Node.js, the SDK loads detector.js from `kasbah-guard-dist/extensions/chrome/src/detector.js`.

**Example:**
```typescript
// Explicitly load detector
const path = require('path');
const detectorCode = require('fs').readFileSync(
  path.join(__dirname, '../detector.js'),
  'utf-8'
);
// detector.js should expose a `classify` function
```

### False Positives in Test Data

**Solution**: Use the `context` option to provide hints:
```typescript
const result = classify('password=hunter2', { context: 'test' });
// Risk is reduced for obviously non-production contexts
```

---

## Contributing

Found a bug? False positive? Privacy concern?

1. File an issue: https://github.com/Al-Adnane/Kasbah-site/issues
2. For security issues, email: security@bekasbah.com
3. Run tests locally: `npm test`

---

## License

MIT — See [LICENSE](../../LICENSE) for details

---

## Support

- 📚 Documentation: https://bekasbah.com/docs
- 🔍 Detection Guide: https://bekasbah.com/how-it-works
- 🚀 GitHub: https://github.com/Al-Adnane/Kasbah-site
- 💬 Discussions: https://github.com/Al-Adnane/Kasbah-site/discussions

---

**Built with ❤️ by Kasbah Guard**
