# Kasbah Guard — Slack Guard

> **Protect your Slack channels from accidental data leaks** — Real-time scanning for secrets, PII, and sensitive data before messages are sent.

**Version**: 1.0.0 | **Status**: Production Ready | **Pricing**: $5-10/user/month

---

## Overview

Slack Guard integrates directly into your Slack workspace to scan every message, file, and thread for sensitive data before it's shared. Built on the same detection engine that powers Kasbah Guard's browser extension (91/100 benchmark).

### What It Protects

| Data Type | Examples |
|-----------|----------|
| **Credentials** | API keys, passwords, tokens, private keys |
| **PII** | SSN, credit cards, phone numbers, addresses |
| **Financial** | Bank accounts, routing numbers, investor info |
| **Healthcare** | PHI, patient data, insurance info (HIPAA) |
| **Legal** | Client names, case numbers, privileged info |
| **Proprietary** | Code snippets, configs, internal URLs |

---

## Quick Start

### Installation

#### Option 1: Slack App Directory (Recommended)
```bash
# Visit the Slack App Directory
https://slack.com/apps/kasbah-guard

# Click "Add to Slack"
# Authorize permissions
# Done!
```

#### Option 2: Self-Hosted
```bash
# Clone repository
git clone https://github.com/kasbah-guard/slack-guard.git
cd slack-guard

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Slack credentials

# Start the bot
npm start
```

### Configuration

#### Slack Permissions Required
- `chat:write` — Send messages and scan before posting
- `files:read` — Scan uploaded files
- `channels:read` — Know which channels to protect
- `im:read` — Protect DMs

#### Environment Variables
```bash
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...

# Kasbah API (optional, for cloud scanning)
KASBAH_API_URL=https://api.bekasbah.com
KASBAH_API_KEY=...

# Database (for audit logs)
DATABASE_URL=postgresql://...

# Redis (for caching)
REDIS_URL=redis://localhost:6379
```

---

## Features

### 1. Real-Time Message Scanning
Every message is scanned before it's sent. If sensitive data is detected:
- **Low Risk**: Message sent silently, logged for audit
- **Medium Risk**: Warning toast shown to user
- **High Risk**: Message blocked, modal with explanation

### 2. File Upload Protection
All uploaded files are scanned:
- Text files (.txt, .md, .json, .env, etc.)
- Code files (.js, .py, .java, etc.)
- Documents (.pdf, .docx, .xlsx)
- Images (OCR for text extraction)

### 3. Channel-Level Policies
Configure different policies per channel:
```
#engineering → Strict (block on any risk)
#general → Medium (warn on medium+ risk)
#random → Light (log only)
#legal → Strict + HIPAA patterns
```

### 4. Thread Protection
Replies in threads are scanned with full context awareness.

### 5. Slack Connect Protection
Messages to external Slack Connect channels get extra scrutiny:
- Cross-company data sharing detection
- Contract confidentiality patterns
- Enhanced audit logging

### 6. Admin Dashboard
Web-based dashboard for:
- View all detections
- Configure policies
- Manage team members
- Export audit reports
- Compliance reporting

### 7. Audit Trail
Every detection is logged with:
- User who sent the message
- Channel where it was posted
- Type of sensitive data detected
- Risk score and decision
- SHA-256 hash chain for tamper evidence

---

## Usage Examples

### As a User

**Scenario 1: Accidental API Key Share**
```
You: Here's the API config for the new service
You: API_KEY=sk-1234567890abcdef

[Kasbah Guard Modal]
🛑 Message Blocked

Reason: OpenAI API key detected
Risk Level: HIGH (85/100)

What to do:
1. Never share API keys in Slack
2. Use environment variables or secret managers
3. Rotate this key immediately

[Cancel] [Learn More] [Proceed Anyway → Admin]
```

**Scenario 2: PII in Customer Discussion**
```
You: The customer John Smith (SSN: 123-45-6789) reported...

[Kasbah Guard Toast]
⚠️ Warning: PII Detected

Detected: Social Security Number
Risk: Medium (55/100)

[Redact & Send] [Cancel]
```

**Scenario 3: Safe Message**
```
You: Hey team, meeting at 3pm today!

✅ Message sent (no detection)
```

### As an Admin

**Configure Channel Policy**
```bash
# Via dashboard or slash command
/kasbah policy set #engineering strict
/kasbah policy set #general medium
/kasbah policy set #random light

# Enable HIPAA mode for healthcare channels
/kasbah hipaa enable #patient-support
```

**View Audit Log**
```bash
# Recent detections
/kasbah audit

# Filter by user
/kasbah audit user:@john

# Filter by channel
/kasbah audit channel:#engineering

# Export report
/kasbah audit export format:csv
```

**Team Management**
```bash
# Add team member
/kasbah team add @jane role:admin

# Remove team member
/kasbah team remove @john

# View team
/kasbah team list
```

---

## Detection Capabilities

### Credentials (25+ patterns)
- AWS Access Keys (`AKIA*`)
- AWS Secret Keys
- GitHub Personal Access Tokens (`ghp_*`, `ghs_*`, `ghu_*`)
- OpenAI API Keys (`sk-*`)
- Anthropic API Keys (`sk-ant-*`)
- Stripe Keys (`sk_live_*`, `pk_live_*`)
- Slack Tokens (`xoxb-*`, `xoxp-*`)
- Google API Keys
- Azure Connection Strings
- Database URLs (MongoDB, PostgreSQL, MySQL, Redis)
- Private Keys (RSA, EC, OPENSSH)
- JWT Secrets
- Basic Auth Credentials

### PII (30+ patterns)
- US Social Security Numbers
- Credit Card Numbers (Visa, MC, Amex, Discover)
- Phone Numbers (US + International)
- Email Addresses
- Physical Addresses
- Driver's License Numbers
- Passport Numbers
- IP Addresses
- MAC Addresses
- Date of Birth patterns

### Financial (15+ patterns)
- Bank Account Numbers
- Routing Numbers (ABA)
- IBAN Numbers
- SWIFT/BIC Codes
- Tax IDs (EIN)
- Investor names and amounts
- Cap table information
- Revenue figures

### Healthcare (HIPAA - 18 identifiers)
- Patient names
- Medical record numbers
- Health plan numbers
- Dates related to patient
- Phone numbers
- Fax numbers
- Email addresses
- SSN
- Medical images
- Device identifiers

### Legal (10+ patterns)
- Attorney-client privilege markers
- Work product notices
- Confidentiality legends
- Case numbers
- Court filing references
- Client names (context-aware)

### Proprietary (20+ patterns)
- Internal URLs
- Code snippets with credentials
- Configuration files
- Database schemas
- API documentation with secrets

---

## API Reference

### REST API

#### Scan Message
```http
POST /api/v1/scan
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "API_KEY=sk-1234567890abcdef",
  "channel": "#engineering",
  "user": "U123456"
}
```

**Response:**
```json
{
  "ok": true,
  "risk": 85,
  "decision": "DENY",
  "reason": "OpenAI API key detected",
  "detections": [
    {
      "type": "openai_api_key",
      "pattern": "OPENAI_KEY_REGEX",
      "confidence": 0.98,
      "location": {"start": 0, "end": 24}
    }
  ]
}
```

#### Get Audit Log
```http
GET /api/v1/audit?channel=C123456&limit=100
Authorization: Bearer <token>
```

**Response:**
```json
{
  "ok": true,
  "entries": [
    {
      "id": "audit_001",
      "timestamp": "2026-03-04T10:30:00Z",
      "user": "U123456",
      "channel": "C123456",
      "decision": "DENY",
      "risk": 85,
      "reason": "OpenAI API key detected"
    }
  ]
}
```

### Slash Commands

| Command | Description |
|---------|-------------|
| `/kasbah help` | Show help message |
| `/kasbah policy set <channel> <level>` | Set channel policy |
| `/kasbah policy get <channel>` | Get channel policy |
| `/kasbah audit` | View recent audit log |
| `/kasbah audit user:@username` | Filter by user |
| `/kasbah audit export format:csv` | Export audit report |
| `/kasbah team add @user role:admin` | Add team member |
| `/kasbah team remove @user` | Remove team member |
| `/kasbah team list` | List team members |
| `/kasbah hipaa enable <channel>` | Enable HIPAA mode |
| `/kasbah hipaa disable <channel>` | Disable HIPAA mode |
| `/kasbah stats` | Show detection statistics |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Slack Workspace                      │
├─────────────────────────────────────────────────────────┤
│  User sends message                                      │
│       ↓                                                  │
│  Kasbah Guard Bot (Socket Mode)                         │
│       ↓                                                  │
│  Message intercepted before send                        │
│       ↓                                                  │
│  Kasbah Detection Engine                                │
│  ├── Pattern matching (60+ secret types)                │
│  ├── PII detection (30+ categories)                     │
│  ├── Entropy analysis                                   │
│  └── Context-aware classification                       │
│       ↓                                                  │
│  Decision: ALLOW / WARN / DENY                          │
│       ↓                                                  │
│  If ALLOW → Message sent                                │
│  If WARN  → Toast shown, user confirms                  │
│  If DENY  → Modal shown, message blocked                │
│       ↓                                                  │
│  Audit log written (SHA-256 hash chain)                 │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack
- **Runtime**: Node.js 18+
- **Framework**: Slack Bolt SDK
- **Detection**: Kasbah kernel (Rust, compiled to WASM)
- **Database**: PostgreSQL (audit logs)
- **Cache**: Redis (rate limiting, caching)
- **Deployment**: Docker, Kubernetes, or serverless

---

## Pricing

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Up to 100 scans/month, basic patterns |
| **Team** | $5/user/month | Unlimited scans, audit logs, policies |
| **Enterprise** | $10/user/month | HIPAA, Slack Connect, SSO, priority support |

### Founders Club Launch Offer
- **Lifetime Access**: $297 one-time (normally $60/year)
- **Limited**: First 100 teams only
- **Includes**: All Enterprise features forever

---

## Compliance

### SOC 2 Type II
- Annual third-party audit
- Security, availability, confidentiality controls

### HIPAA
- BAA available for Enterprise customers
- 18 HIPAA identifier patterns
- 6-year audit log retention
- Encrypted data at rest and in transit

### GDPR
- Data processing agreement available
- Right to erasure supported
- EU data residency option

---

## Security

- **Zero Data Retention**: Messages scanned in-memory, not stored
- **Encryption**: TLS 1.3 for all API calls
- **Access Control**: Role-based permissions
- **Audit Trail**: Tamper-evident hash chain
- **SOC 2**: Annual third-party audit

---

## Troubleshooting

### Bot not responding
```bash
# Check bot status
/kasbah status

# Reinstall bot
/kasbah reinstall

# Check logs
kubectl logs -l app=kasbah-slack-guard
```

### False positives
```bash
# Report false positive
/kasbah feedback type:false_positive message:"..."

# Or email: support@kasbah.ai
```

### Missing messages
```bash
# Verify bot permissions
/kasbah permissions

# Re-authorize bot
https://slack.com/apps/kasbah-guard → Manage → Permissions
```

---

## Development

### Local Development
```bash
# Clone repository
git clone https://github.com/kasbah-guard/slack-guard.git

# Install dependencies
npm install

# Create Slack app at https://api.slack.com/apps
# Get bot token and signing secret

# Start development server
npm run dev

# Test with ngrok
ngrok http 3000
# Update Slack app URL to https://YOUR_NGROK_URL/slack/events
```

### Testing
```bash
# Run tests
npm test

# Run specific test
npm test -- --grep "API key detection"

# Coverage
npm run test:coverage
```

---

## Roadmap

### Q2 2026
- [ ] Slack Canvas protection
- [ ] Huddle transcription scanning
- [ ] Workflow Builder integration

### Q3 2026
- [ ] AI-powered context awareness
- [ ] Custom pattern builder
- [ ] Slack AI integration

### Q4 2026
- [ ] Multi-workspace support
- [ ] Advanced analytics dashboard
- [ ] Automated remediation

---

## Support

- **Documentation**: https://docs.kasbah.ai/slack-guard
- **Status**: https://status.kasbah.ai
- **Email**: support@kasbah.ai
- **Slack Community**: https://kasbah.ai/community

---

## License

Proprietary — See LICENSE file

---

**Status**: Production Ready ✅ | **Last Updated**: March 4, 2026
