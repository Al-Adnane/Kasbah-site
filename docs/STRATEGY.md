# Kasbah Guard — Strategy & Roadmap

> Last updated Feb 27, 2026

---

## Positioning

**"The Antivirus for AI Leaks"**

The market has antivirus for malware, password managers for credentials, and VPNs for network traffic. There is no category yet for *the data you accidentally give to AI*. Kasbah Guard owns that space.

The founding insight: AI leaks are not attacks — they are accidents. A designer pastes a pitch deck with investor names to Claude. An engineer uploads `.env` to ChatGPT. A consultant shares client financials while asking for analysis. None of these people meant to expose the data. Traditional DLP is too heavy, too corporate, too slow. Kasbah is the first product built for the individual who just wants to use AI safely.

---

## 4 Target Personas

| Persona | Hook | Size |
|---------|------|------|
| **Consultants** | "Protect client confidentiality" | 2M US |
| **Freelancers** | "Work safely with clients" | 59M US |
| **Founders** | "Protect business strategy & data" | 6M US |
| **Teams** | "Enterprise protection, zero friction" | 130M US |

**NOT targeting (Phase 2+):** CTOs, security teams, compliance officers, lawyers, healthcare IT. These are enterprise sales cycles (12+ months, $0 CAC efficiency, wrong buyers for B2C growth).

---

## Why B2C Works (And Enterprise Doesn't for Launch)

| | B2C | Enterprise |
|--|-----|-----------|
| Time to convert | Days–weeks | 6–12 months |
| CAC | $0 (viral, word-of-mouth) | $50K–$500K |
| Gross margin | 95%+ (software) | 60–70% (services) |
| Distribution | Bottom-up (user → team → company) | Top-down (procurement) |
| Proof needed | "Works for me" | SOC2, pen test, legal review |

---

## Pricing

| Tier | Price | What's included |
|------|-------|----------------|
| **Free** | $0 | Browser extension + clipboard monitor, forever |
| **Founders Club** | $297 one-time | Lifetime access, all future features, early adopter status |
| **Teams** | $29/month | Unlimited seats, audit trail, admin dashboard |

**Free is the moat, not the cost.** A free product that actually works creates viral word-of-mouth. Every time someone says "Kasbah just blocked my API key," that's free distribution.

---

## Revenue Projections

| Year | ARR | Paying users | Model |
|------|-----|-------------|-------|
| Year 1 | $400K–$1.7M | 4,500 | Founders Club + early Teams |
| Year 2 | $1.5M–$5M | 15,000 | Teams growth + upsell |
| Year 3 | $5M–$20M | 50,000 | Teams + expansion |

**Break-even: Month 6–9**
**Unit economics:** $0 CAC / $297–$348 LTV = infinite payback period efficiency

---

## 8 Business Moats

These are the competitive advantages that compound over time — harder to replicate as we grow.

### Moat 1 — Detection Engine Accuracy
91/100 benchmark vs CrowdStrike 73 · Nightfall 70 · Purview 70. Built from a 10,000-line Rust kernel ported to a 200-line JavaScript engine. Covers 60+ secret types, 25+ PII categories, 55 BDS entities, prompt injection, and Unicode bypass resistance. Each pattern added widens the gap.

### Moat 2 — Privacy-First Architecture
Zero data egress. HIPAA/GDPR structurally compliant by design (not policy). This is not a feature — it is the product. Cloud-based DLP competitors *cannot* offer this without rebuilding from scratch.

### Moat 3 — User Control Model (3-tier intervention)
Silent / Warn / Block. Not everything is a fire alarm. Low-risk findings are logged silently. Mid-risk gets a toast. Only high-risk triggers a modal. This is the difference between a tool people tolerate and one they actually keep installed. Aggressive DLP tools get disabled by day 3.

### Moat 4 — Multi-Platform Coverage
Browser extension (Chrome/Edge/Firefox/Safari) + clipboard monitor + file watcher + keystroke interceptor. 25+ AI platforms covered. Most competitors cover 1–3 platforms.

### Moat 5 — Multilingual & Multinational PII
9 languages, 100+ regex rules, native script support (Arabic: بطاقة, هويّة). A French user uploading `carte_identite.pdf`, a German user with `Personalausweis.pdf`, a Moroccan user with `CIN.pdf` — all detected. No competitor has this.

### Moat 6 — Real-Time Interception at the Keyboard Level
Not scan-after-send. Not a proxy. The hook fires before the byte leaves the browser. 6 verbs: SEND, PASTE, UPLOAD, EDIT, BROWSE, DOWNLOAD. Plus all programmatic network APIs.

### Moat 7 — Explainability
Every DENY comes with a plain-English reason: "OpenAI API key detected." This builds trust. Users learn what's risky. The product educates as it protects.

### Moat 8 — Audit Trail (SHA-256 Hash Chain)
Every decision is logged with a hash chain — each entry references the previous entry's hash. Tamper-evident. 5,488+ entries in production. This is the enterprise upsell story: "your team had 47 blocks last month, here's the report."

---

## 10 Products to Build (Priority Order)

Derived from the 8 moats above. The detection engine, privacy architecture, and interception layer transfer directly to each product.

| # | Product | Pricing | TAM | Time to MVP |
|---|---------|---------|-----|------------|
| 1 | **Slack Guard** | $5–10/user/month | $2B+ | 4 weeks |
| 2 | **IDE Guard** (VS Code + JetBrains) | Freemium | $500M+ | 6 weeks |
| 3 | **Hospital Guardian** (HIPAA) | $10K–50K/year/facility | $10B+ | 12 weeks |
| 4 | **Legal Shield** | $15K–100K/year | $5B+ | 12 weeks |
| 5 | **API Guard** (developer SDK) | Freemium | $500M+ | 8 weeks |
| 6 | **Discord Guardian** | Free bot | $100M+ | 3 weeks |
| 7 | **Supply Chain Guardian** | $20K–100K/year | $2B+ | 16 weeks |
| 8 | **Customer Support Guardian** (Zendesk/Intercom) | $5–10/agent/month | $1B+ | 8 weeks |
| 9 | **Contract Guardian** | $10K–50K/year | $500M+ | 10 weeks |
| 10 | **Data Warehouse Guardian** (Databricks) | $5–10/engineer/month | $2B+ | 12 weeks |

**Go-to-market sequence:** Browser extension → Slack Guard → IDE Guard → Hospital Guardian
**Path to $100M ARR:** Execute top 3–4 products over 5–7 years.
**Competitive window:** 18–24 months before commoditization by larger players.

---

## Growth Strategy

**Zero CAC viral model:**

```
Individual installs free extension
    → blocks something real
    → tells colleague / shares on Twitter
    → colleague installs
    → "my whole team should have this"
    → Teams purchase ($29/month)
    → finance/legal team wants audit trail
    → uplevels to enterprise contract
```

No sales team needed for the first $1M ARR. Word-of-mouth from actual blocked events is the distribution channel.

**Anxiety Gap (from DeepSeek strategy):** When a user runs out of blocks in SIMULATE mode and sees how many near-misses they had, the upgrade is obvious. Fear is the conversion mechanism — not a demo.

---

## Product Hunt Launch Plan

### Core positioning
- **Name:** Kasbah Guard
- **Tagline:** "The Antivirus for AI Leaks"
- **One-liner:** "Kasbah Guard blocks sensitive data from leaving your device when you use AI tools. It's like a spell-checker for secrets."

### The founder story (Adnane's maker comment)
Two incidents that built this product:
1. A designer pasted a full pitch deck — including investor names and a table with credit card numbers — to Claude while asking for layout help.
2. An engineer uploaded a `.env` file to ChatGPT to ask why their API wasn't working.

Neither person was careless. They just forgot what was in the file.

Kasbah Guard exists because AI leaks are accidents, and accidents need prevention — not punishment.

### Assets needed
- Hero image (1200×720px): Kasbah blocking a real API key in real time
- Logo (256×256px)
- Demo GIF (800×600px): 5–10 second loop — paste API key → modal → blocked
- 5–8 gallery images: block modal, extension popup, audit trail, pricing, platform logos
- Optional: 30–60 second demo video

### Launch day timeline
| Time | Action |
|------|--------|
| 5 PM Day 7 | Submit (not live), gather community links, brief 10 early users |
| 12:01 AM Day 8 | Go live, post maker comment immediately |
| 6 AM–12 PM | Reply to every comment within 1 hour |
| 12–6 PM | Check trending, post 30s thanks video, activate PH discount ($247 Founders Club) |
| 6 PM–12 AM | Reddit + HN push |

### Discussion starters (5 pre-written comments)
1. **"The Scary Part"** — 34% of ChatGPT sessions contain sensitive data. AI leaks are accidents, not attacks.
2. **"Real Numbers"** — 18/18 self-tests pass, 5,488+ audit entries in production, 91/100 benchmark.
3. **"Why Local-First"** — Cloud DLP companies literally receive your secrets. We don't. The local model is not a compromise; it's the product.
4. **"The Moat"** — SHA-256 hash chain audit trail. Tamper-evident. Your company's AI activity, provable in court.
5. **"How We Monetize Without Being Evil"** — Free forever for individuals. $297 lifetime for power users. $29/month for teams. No data brokering, ever.

### Hunter target
Cybersecurity influencer, AI tool reviewer, or privacy advocate with 50K+ followers. Offer early Founders Club access.

### Launch offers
1. **Founders Club:** $297 lifetime → $247 for PH launch week (100 spots)
2. **Emergency Pack Bundle:** Plus annual + 3 free Emergency Packs
3. **Referral bonus:** $50 credit or 20% commission per referred buyer

### Success metrics
- #1 Product of Day = 2,000+ upvotes
- Top 5 = 1,000+
- Top 20 = 500+

### 5 things NOT to do
1. Don't oversell Windows support (macOS primary)
2. Don't claim "unbreakable" — say "best-in-class detection"
3. Don't mention infrastructure costs in comments
4. Don't get defensive about privacy questions — lead with the architecture
5. Don't over-promise roadmap items as "shipping soon"

---

## Current Build Status

| Component | Status |
|-----------|--------|
| Chrome Extension (v3.0) | ✅ Chrome Web Store approved |
| Firefox Extension | ✅ Mirror in sync |
| Website (bekasbah.com) | ✅ Live on Cloudflare Pages |
| API (api.bekasbah.com) | ✅ Live on Cloudflare Worker |
| Desktop App (macOS) | ✅ Signed + notarized |
| 13-Moat Egress Gate | ✅ Committed Feb 27, 2026 |
| Gauntlet (15-vector test) | ⏳ Awaiting re-run post v3.0 |
| Slack Guard | 🔲 Not started |
| IDE Guard | 🔲 Not started |
