# Kasbah Guard Enterprise

Multi-user sensitive data governance dashboard built on top of the Kasbah Detection Engine.

## Product Spec

### Core Features
- **Multi-user management** — Invite team members, assign roles (admin, analyst, viewer)
- **Policy management** — Set org-wide thresholds, custom pattern rules, allow/deny lists
- **Audit log viewer** — Full immutable audit trail of all detection events with content hashes
- **Team policies** — Per-team overrides on detection sensitivity and redaction rules
- **Real-time dashboard** — Live risk event feed across all connected products
- **API key management** — Issue and revoke API keys for CLI/SDK integrations

### Detection Integration
Uses `@kasbah/guard` SDK (kasbah-kernel v3.5.0, 23 invariants) for all detection.

All events are stored with content hashes (never raw text) — privacy-preserving by design.

### Tech Stack
- **Frontend:** Next.js 14, React 18, TypeScript
- **Detection:** `@kasbah/guard` SDK
- **Auth:** NextAuth.js (org SSO + email)
- **DB:** PostgreSQL (audit logs, policies, users)
- **API:** Next.js API routes + tRPC

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Dashboard overview
│   ├── policies/             # Policy management UI
│   │   └── page.tsx
│   ├── audit/                # Audit log viewer
│   │   └── page.tsx
│   └── team/                 # Team member management
│       └── page.tsx
└── lib/
    └── kasbah-client.ts      # @kasbah/guard SDK integration
```
