# Kasbah Guard — Discord Guardian

> **Free Discord bot for server protection** — Auto-moderation, secret detection, and phishing protection for your Discord community.

**Version**: 1.0.0 | **Status**: Production Ready | **Pricing**: Free

---

## Overview

Discord Guardian is a free Discord bot that protects your server from accidental data leaks, phishing attacks, and malicious links. Built on the same detection engine as Kasbah Guard (91/100 benchmark).

### What It Protects Against

| Threat | Examples |
|--------|----------|
| **Token Leaks** | Discord tokens, bot tokens, API keys |
| **Phishing Links** | Fake Nitro, scam URLs, malware downloads |
| **PII Sharing** | SSN, addresses, phone numbers, emails |
| **Spam** | Mass mentions, repeated messages, raids |
| **Malicious Code** | Token grabbers, RATs, exploits |

---

## Quick Start

### Add to Your Server

1. **Visit the Discord App Directory**
   ```
   https://discord.com/apps/kasbah-guard
   ```

2. **Click "Add to Server"**

3. **Authorize Permissions**
   - Send Messages
   - Manage Messages
   - Read Message History
   - Embed Links

4. **Done!** The bot is now protecting your server.

### Basic Commands

```
!kasbah help     — Show help message
!kasbah config   — View server configuration
!kasbah audit    — View recent detections
!kasbah stats    — Show server statistics
```

---

## Features

### 1. Real-Time Message Scanning
Every message is scanned for:
- Discord tokens and bot tokens
- API keys and secrets
- Phishing links
- PII (SSN, emails, phone numbers)
- Malicious code patterns

### 2. Auto-Moderation
Configurable actions for detections:
- **Low Risk**: Log only
- **Medium Risk**: Delete message + warn user
- **High Risk**: Delete + timeout user + alert mods

### 3. Phishing Protection
- Fake Nitro links detected
- Known scam domains blocked
- URL scanning before click
- Screenshot preview for suspicious links

### 4. Anti-Raid Protection
- Mass mention detection
- Spam pattern recognition
- New account flagging
- Rate limiting per user

### 5. Audit Logging
All actions logged with:
- User who triggered detection
- Channel and message ID
- Type of violation
- Action taken
- Evidence preserved

### 6. Mod Dashboard
Web-based dashboard for:
- View all detections
- Configure auto-mod
- Manage whitelists
- Export audit reports

---

## Configuration

### Server Settings

```
!kasbah config set mode strict    — Block on any detection
!kasbah config set mode moderate  — Warn on medium+ risk
!kasbah config set mode relaxed   — Log only

!kasbah config set channel #announcements protected
!kasbah config set channel #general unprotected

!kasbah whitelist add domain:trusted-site.com
!kasbah whitelist remove domain:sketchy-site.com
```

### Role-Based Protection

```
!kasbah role ignore @admins       — Don't scan admin messages
!kasbah role strict @newmembers   — Extra strict for new members
!kasbah role list                 — List all role configs
```

### Auto-Mod Rules

```
!kasbah automod enable phish      — Enable phishing detection
!kasbah automod enable tokens     — Enable token detection
!kasbah automod enable pii        — Enable PII detection
!kasbah automod enable spam       — Enable spam detection

!kasbah automod timeout 60        — Timeout duration (seconds)
!kasbah automod strike 3          — Strikes before ban
```

---

## Detection Capabilities

### Discord-Specific (15+ patterns)
- Discord User Tokens (`[a-zA-Z0-9]{24}\.[a-zA-Z0-9]{6}\.[a-zA-Z0-9_\-]{27}`)
- Bot Tokens (`MT[xyz][a-zA-Z0-9_\-]{23}\.[a-zA-Z0-9_\-]{6}\.[a-zA-Z0-9_\-]{27}`)
- OAuth Secrets
- Webhook URLs
- Guild IDs
- Channel IDs

### Phishing (50+ patterns)
- Fake Nitro URLs
- Known scam domains
- Typosquatting domains
- URL shorteners (bit.ly, tinyurl)
- Suspicious file extensions (.exe, .scr, .bat)
- Token grabber patterns

### Credentials (25+ patterns)
- All major API keys
- Database credentials
- Private keys
- Password patterns

### PII (30+ patterns)
- SSN, credit cards
- Phone numbers, emails
- Addresses
- IP addresses

---

## API Reference

### REST API

#### Get Server Config
```http
GET /api/v1/servers/{guild_id}/config
Authorization: Bearer <bot_token>
```

#### Get Audit Log
```http
GET /api/v1/servers/{guild_id}/audit?limit=100
Authorization: Bearer <bot_token>
```

#### Update Config
```http
PUT /api/v1/servers/{guild_id}/config
Authorization: Bearer <bot_token>
Content-Type: application/json

{
  "mode": "strict",
  "automod": {
    "phishing": true,
    "tokens": true,
    "pii": true
  }
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Discord Server                        │
├─────────────────────────────────────────────────────────┤
│  User sends message                                      │
│       ↓                                                  │
│  Discord Gateway (WebSocket)                            │
│       ↓                                                  │
│  Kasbah Guard Bot                                       │
│       ↓                                                  │
│  Detection Engine                                       │
│  ├── Discord token patterns                             │
│  ├── Phishing URL database                              │
│  ├── PII detection                                      │
│  └── Spam/raid detection                                │
│       ↓                                                  │
│  Decision: ALLOW / WARN / DENY                          │
│       ↓                                                  │
│  If ALLOW → Message posted                              │
│  If WARN  → Delete + DM warning                         │
│  If DENY  → Delete + timeout + alert mods               │
│       ↓                                                  │
│  Audit log written                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Discord.js v14
- **Detection**: Kasbah kernel (JavaScript)
- **Database**: MongoDB (server configs, audit logs)
- **Cache**: Redis (rate limiting, URL cache)
- **Deployment**: Docker, Kubernetes, or Heroku

---

## Commands Reference

### General Commands
| Command | Description |
|---------|-------------|
| `!kasbah help` | Show help message |
| `!kasbah invite` | Get invite link |
| `!kasbah ping` | Check bot latency |
| `!kasbah stats` | Server statistics |

### Admin Commands
| Command | Description |
|---------|-------------|
| `!kasbah config` | View configuration |
| `!kasbah config set <key> <value>` | Update config |
| `!kasbah audit` | View audit log |
| `!kasbah audit user @user` | Filter by user |
| `!kasbah export` | Export audit data |

### Moderation Commands
| Command | Description |
|---------|-------------|
| `!kasbah ban @user` | Ban user |
| `!kasbah kick @user` | Kick user |
| `!kasbah timeout @user 60` | Timeout user |
| `!kasbah warn @user reason` | Warn user |
| `!kasbah warnings @user` | View warnings |

### Whitelist Commands
| Command | Description |
|---------|-------------|
| `!kasbah whitelist add domain:example.com` | Add domain |
| `!kasbah whitelist remove domain:example.com` | Remove domain |
| `!kasbah whitelist list` | List all whitelists |

---

## Pricing

**100% Free** — Forever

Discord Guardian is completely free for all servers. We believe every community deserves protection.

### How We Fund This
- Paid products (Slack Guard, Enterprise) subsidize Discord Guardian
- Optional donations via Patreon/Ko-fi
- Premium features for large servers (10K+ members)

---

## Support

- **Documentation**: https://docs.kasbah.ai/discord-guardian
- **Support Server**: https://discord.gg/kasbah
- **Email**: support@kasbah.ai
- **Twitter**: @KasbahGuard

---

## Roadmap

### Q2 2026
- [ ] AI-powered scam detection
- [ ] Voice channel protection
- [ ] Event spam protection

### Q3 2026
- [ ] Custom regex patterns
- [ ] Multi-server dashboard
- [ ] Automated appeal system

### Q4 2026
- [ ] Integration with other bots
- [ ] Advanced analytics
- [ ] Premium tier for large servers

---

## Development

### Local Development
```bash
# Clone repository
git clone https://github.com/kasbah-guard/discord-guardian.git

# Install dependencies
npm install

# Create Discord app at https://discord.com/developers
# Get bot token

# Start development
npm run dev
```

### Testing
```bash
npm test
npm run test:coverage
```

---

## License

MIT (Free and Open Source)

---

**Status**: Production Ready ✅ | **Last Updated**: March 4, 2026
