# Kasbah Guard — Go-to-Market Playbook (Internal)

Last updated: March 7, 2026

## Current State (March 7, 2026)
- **Week 1 metrics:** 38 installs, 13 uninstalls (34%), 7 active users
- **Revenue:** $0 (no payment processing wired)
- **Products shipped:** 10 (extension, CLI, VS Code, SDK, API, dashboard, Forge, Nexus, Cortex, mobile)
- **Test coverage:** 58/58 market launch, 70/70 JS, 10/10 CLI

## Phase 1: Fix & Ship (This Week)

### Immediate Actions
1. ✅ Remove blockchain code from all extensions
2. ✅ Make telemetry opt-in by default
3. ✅ Expand privacy policy (all 4 endpoints documented)
4. ✅ Add business model transparency section to homepage
5. ✅ Add uninstall survey (setUninstallURL)
6. ✅ Fix accuracy inconsistencies (standardize to 95%)
7. ✅ Fix terms.html (reflect tiered model)
8. ✅ Remove fake testimonial from webapp.html
9. ⬜ Publish Chrome extension v2.0.0 to store
10. ⬜ Deploy updated website to Cloudflare Pages

### Deliverables
- Updated extension package (blockchain removed, telemetry opt-in)
- Updated website (all inconsistencies fixed)
- Pitch deck at bekasbah.com/pitch/
- Business model page at bekasbah.com/business-model.html

## Phase 2: First Revenue (Weeks 2-4)

### Distribution
1. **npm publish @kasbah/guard** — SDK available on npm
2. **VS Code Marketplace** — publish Kasbah Guard extension
3. **CLI binary** — distribute via GitHub Releases (macOS, Linux, Windows)
4. **Firefox Add-ons** — ensure listing is live
5. **Edge Add-ons** — ensure listing is live

### Payment Setup
- Set up **Paddle** or **Lemon Squeezy** (NOT Stripe)
- Create checkout flow for Pro ($9/mo) and Business ($29/seat/mo)
- Email-based onboarding: signup → API key → activate features
- No automated billing initially; can do manual invoicing for first customers

### Content
- Write 3 blog posts:
  1. "What leaks when you paste into ChatGPT" (data examples)
  2. "How Kasbah's 19-moat egress gate works" (technical deep-dive)
  3. "Why we open-sourced our detection engine" (trust story)

## Phase 3: Enterprise Pipeline (Weeks 4-8)

### Outreach
1. **Reply to Jason Packer** — share all credibility fixes, invite re-review
2. **Cold outreach to 10 CISOs** — use Jason's feedback as proof of iteration
3. **Open-source detector.js** — new repo, MIT license, huge trust signal
4. **Request independent security audit** — use docs/SECURITY-AUDIT.md as scope
5. **LinkedIn presence** — share technical content, engage security community

### Enterprise Landing Page
- Deployment options (cloud, on-prem, air-gapped)
- Compliance framework support (screenshots)
- Team management demo
- ROI calculator: "X employees × Y AI tools × Z risk = $$ exposure"
- Case study template (ready for first customer)

### Pricing for Enterprise
- Standard: $29/seat/mo (self-serve)
- Custom: Contact sales for >50 seats (volume discounts)
- Annual contracts: 25% discount
- On-premise: custom pricing

## Phase 4: Product-Led Growth (Months 2-3)

### Retention
1. Analyze uninstall survey data (weekly review)
2. Fix top uninstall reason immediately
3. Add in-extension tips/education for new users
4. Browser notification for first detection (positive reinforcement)

### Distribution Expansion
1. Chrome Web Store Featured badge application
2. Product Hunt launch
3. Hacker News Show HN post
4. Reddit r/cybersecurity, r/netsec, r/devops
5. Dev.to and Medium technical articles

### Community
1. Create Discord or Slack community
2. Accept detection pattern contributions
3. Bug bounty program for detector.js
4. Monthly changelog newsletter

## Phase 5: Scale (Months 3-6)

### Team
1. First hire: Developer Advocate / Community Manager
2. Second hire: Solutions Engineer (enterprise onboarding)
3. Contract: Security researcher for ongoing audit

### Infrastructure
1. Self-serve checkout (Paddle/Lemon Squeezy integration)
2. Customer dashboard for API key management
3. Usage analytics and billing
4. SOC 2 Type I certification process

### Partnerships
1. Security training platforms (integrate Kasbah into courses)
2. MSP/MSSP channel (reseller program)
3. Browser vendors (Chrome, Firefox partnerships)
4. AI platform partnerships (official detection integration)

## Key Metrics by Month

| Month | Active Users | Pro Subs | Biz Seats | MRR |
|-------|-------------|----------|-----------|-----|
| 1 | 100 | 5 | 0 | $45 |
| 2 | 200 | 15 | 5 | $280 |
| 3 | 400 | 30 | 15 | $705 |
| 4 | 600 | 50 | 30 | $1,320 |
| 5 | 900 | 75 | 50 | $2,125 |
| 6 | 1,200 | 100 | 80 | $3,220 |

## Risk Factors

### Technical
- **False positive rate** — if FP rate >2%, users uninstall. Monitor via /api/false-positives
- **Chrome Web Store review** — Google can reject or slow-review extensions
- **Performance on slow machines** — detector must stay <10ms even on old hardware

### Market
- **AI platforms adding built-in DLP** — ChatGPT could add paste scanning (mitigate: we're cross-platform)
- **Enterprise sales cycle** — 3-6 month cycles typical (mitigate: free extension proves value first)
- **Competitor response** — CrowdStrike/Nightfall could launch browser extensions (mitigate: speed and price moat)

### Business
- **Solo founder risk** — bus factor = 1 (mitigate: open-source detector.js, document everything)
- **Revenue delay** — may take 2-3 months to get first paying customer (mitigate: low burn rate)
- **Payment processor setup** — Paddle/Lemon Squeezy integration takes 1-2 weeks
