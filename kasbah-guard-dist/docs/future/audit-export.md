# Audit Export — Private Proof on Demand

Receipts are insurance, not growth. Demoted but not eliminated.

## Key Rules
- NO public verification
- NO sharing badges
- NO social proof
- YES private audit + export on demand

## Who Needs This
- Managers asking "what did it block last month?"
- Compliance teams
- Security auditors
- SOC2/GDPR evidence

## Implementation

### Export Endpoint
```
GET /audit/export?format=csv&from=2026-01-01&to=2026-02-01
GET /audit/export?format=json&from=2026-01-01&to=2026-02-01
```

### Dashboard UI
- "Export Audit Log" button in Settings
- Date range picker
- CSV or JSON format
- Download to local file

### What's Included
- Every event (silent passes, warnings, blocks)
- Timestamp, action, risk score, decision, findings
- Content hashes (not content itself)
- Intervention level used

### What's NOT Included
- No public URLs
- No shareable links
- No verification endpoints
- No badges or certificates
