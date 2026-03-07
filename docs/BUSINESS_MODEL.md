# Kasbah Guard — Business Model (Internal)

Last updated: March 7, 2026

## Revenue Model

### Free Tier: Browser Extension (Growth Engine)
- 5 browsers (Chrome, Firefox, Edge, Opera, Safari)
- Full detection: 50+ patterns, ML scoring, 19-moat egress gate
- Purpose: Build trust, prove the engine works, create upgrade pipeline

### Professional: $9/mo ($108/yr)
- CLI tool (Rust): `scan`, `watch`, `redact`, stdin pipe, CI/CD exit codes
- VS Code extension: inline detection, redaction, clipboard scan
- SDK (@kasbah/guard): npm package, Node.js/Browser/Workers/Deno
- API access: REST endpoints for server-side scanning
- Constitutional AI: intent validation (5 rules + heuristics)
- Custom detection patterns
- Git pre-commit hooks
- **Target:** Individual developers, freelancers, consultants
- **Annual discount:** 25% ($6.75/mo billed annually)

### Business: $29/seat/mo ($348/seat/yr)
- Enterprise dashboard: real-time threat feed, deployment monitoring
- Policy enforcement: block/warn/log by type, team, role
- Audit log: hash-chained, exportable (JSON, CSV)
- Compliance reports: SOC 2, HIPAA, GDPR, PCI-DSS, CCPA, FERPA
- Team management + RBAC
- SSO/SAML (Okta, Azure AD, Google Workspace)
- Alerts: Slack, email, PagerDuty, webhooks
- On-premise deployment (K8s manifests ready)
- **Target:** Security teams, regulated industries
- **Annual discount:** 25% ($21.75/seat/mo billed annually)

## Revenue Projections

### Year 1 (Conservative)
- 50 Pro subscribers × $108 = $5,400
- 10 Business customers × 5 seats × $348 = $17,400
- **Total ARR: ~$23K**

### Year 2 (Growth)
- 200 Pro subscribers × $108 = $21,600
- 50 Business customers × 10 seats × $348 = $174,000
- **Total ARR: ~$196K**

## Unit Economics
- Infrastructure cost per user: ~$0.02/mo (Cloudflare Workers free tier covers most)
- Extension: zero marginal cost (runs locally)
- Pro: API calls cost ~$0.001 each (KV reads)
- Business: Dashboard hosting ~$20/mo (Vercel/Cloudflare)
- **Gross margin: 95%+**

## What We Don't Do (Commitments)
- No data selling
- No ads
- No behavioral tracking
- No blockchain or cryptocurrency
- No Stripe (use Paddle/Lemon Squeezy for payments)
- Telemetry is opt-in, off by default

## Competitive Positioning
| Competitor | Price | Approach | Our Advantage |
|-----------|-------|----------|---------------|
| CrowdStrike Falcon DLP | $15K+/yr | Server-side, agent-based | Browser-first, 50x cheaper |
| Nightfall AI | $10K+/yr | API-based scanning | Local processing, no data exposure |
| Microsoft Purview | $5-25K/yr | Cloud-dependent | Works offline, no vendor lock-in |
| GitGuardian | $4K+/yr | Git scanning only | Browser + CLI + API, broader coverage |

## Payment Processing
- **NOT Stripe** (permanently removed per project rules)
- Options: Paddle or Lemon Squeezy
- Both handle global taxes, invoicing, and subscription management
- Both support SaaS billing models

## Metrics to Track
- Extension installs / uninstalls / active users (Chrome Web Store)
- Uninstall survey responses (POST /api/uninstall-feedback)
- Pro conversion rate (extension → email → paid)
- Business pipeline (enterprise inquiries via email)
- MRR / ARR
- Detection accuracy over time
