# Kasbah Guard: Enterprise Control Plane Implementation Plan v1.0.0

**Status**: 🚀 **PHASE B: ENTERPRISE INFRASTRUCTURE - 3 WEEKS**
**Timeline**: March 15-April 5, 2026
**Objective**: Build organization-wide governance, policy management, and compliance infrastructure

---

## EXECUTIVE SUMMARY

Phase B transforms Kasbah from a local browser extension into institutional-grade security infrastructure with:

✅ **Admin Dashboard** - Real-time threat visibility across org
✅ **Policy Engine** - Org-wide thresholds, user exemptions, department rules
✅ **RBAC System** - Admin, Auditor, Manager, User roles with scoped access
✅ **Compliance Reporting** - SOC2, HIPAA, GDPR templates
✅ **Deployment Orchestration** - Windows GPO, macOS MDM, Chromebook Workspace
✅ **Audit Logging** - Immutable, encrypted, cryptographically signed

---

## ARCHITECTURE OVERVIEW

### 4-Layer Enterprise Stack

```
Layer 1: Admin Portal (Frontend)
├─ Dashboard (real-time threats)
├─ Policy editor (org thresholds)
├─ Deployment manager (rollout control)
├─ Audit logs (immutable history)
└─ Compliance reports (SOC2/HIPAA/GDPR)

Layer 2: API Gateway (Backend)
├─ /admin/org/policies (GET/POST/PUT/DELETE)
├─ /admin/org/deployment (status, rollout, approval)
├─ /admin/org/audit-logs (immutable append-only)
├─ /admin/compliance/report (generate SOC2/HIPAA/GDPR)
└─ /admin/team (users, roles, access control)

Layer 3: Policy Engine (Service)
├─ Global thresholds (per-org)
├─ User exemptions (per-user overrides)
├─ Department rules (per-dept overrides)
├─ Escalation rules (auto-notify SOC)
└─ Compliance mappings (SOC2/HIPAA/GDPR)

Layer 4: Data Storage (Infrastructure)
├─ KV: Org configs (AES-256-GCM, org key)
├─ D1: Audit logs (immutable, replicated)
└─ HSM: Cryptographic keys (hardened)
```

### Data Flow: Extension → Control Plane

```
Browser Extension (Client)
├─ Detects secret (detector.js)
├─ Generates compliance proof (popup.js)
├─ Stores locally (chrome.storage.local)
└─ Submits to control plane (via API)
    ↓
API Gateway (Cloudflare Worker)
├─ Authenticate request (JWT)
├─ Validate detection format
├─ Check org policies
└─ Route to policy engine
    ↓
Policy Engine (Compliance Service)
├─ Apply global thresholds
├─ Check user exemptions
├─ Apply department rules
├─ Evaluate escalation rules
└─ Return policy-adjusted verdict
    ↓
Data Storage (D1 + KV)
├─ Append immutable audit log
├─ Update org statistics
└─ Trigger escalation if needed
    ↓
Admin Dashboard (Portal)
├─ Real-time threat visualization
├─ Automatic escalation alerts
└─ Compliance report generation
```

---

## PHASE B TASK BREAKDOWN (3 Weeks)

### WEEK 1: Admin Dashboard & API Foundation

#### **Task B1: Admin Portal UI (Days 1-3)**
**Files to create:**
- `/apps/enterprise/admin/page.tsx` - Main admin dashboard
  - Real-time threat feed (last 24h, 7d, 30d)
  - Deployment status (% rollout, devices, platform breakdown)
  - Quick stats (total detections, blocked, exemptions, users)
  - Recent escalations (risk >80, custom rules triggered)

- `/apps/enterprise/admin/components/ThreatFeed.tsx`
  - Sortable, filterable threat list
  - Detection severity colors (WARN/BLOCK/DENY)
  - Quick-link to exemption workflow

- `/apps/enterprise/admin/components/DeploymentStatus.tsx`
  - Rollout progress bar (% complete)
  - Platform breakdown (Windows/macOS/Chromebook)
  - Last sync time per device
  - Rollback option

- `/apps/enterprise/admin/components/QuickStats.tsx`
  - 4 KPI cards (Detections, Blocked, Exempt, Users)
  - Sparklines for trend visualization
  - Period selector (24h/7d/30d)

**API Endpoints (Cloudflare Worker):**
- `GET /api/admin/dashboard/threats?period=24h`
- `GET /api/admin/dashboard/stats?period=24h`
- `GET /api/admin/dashboard/deployment-status`
- `GET /api/admin/dashboard/escalations?limit=10`

#### **Task B2: Policy Editor UI (Days 3-4)**
**Files to create:**
- `/apps/enterprise/policies/page.tsx` - Policy configuration interface
  - Global thresholds (risk score to trigger BLOCK, 0-100 scale)
  - User exemptions (list, add, remove)
  - Department rules (per-dept risk override)
  - Escalation rules (auto-notify SOC if risk >X)

- `/apps/enterprise/policies/components/GlobalThresholds.tsx`
  - Risk slider (0-100)
  - Save/cancel buttons
  - Change history (audit trail)

- `/apps/enterprise/policies/components/UserExemptions.tsx`
  - List of exempt users
  - Add user modal
  - Remove user confirmation
  - Exemption reason field

- `/apps/enterprise/policies/components/EscalationRules.tsx`
  - Risk thresholds for escalation
  - Notification channels (email, webhook, Slack)
  - Test notification button

**API Endpoints:**
- `GET /api/admin/org/policies`
- `PUT /api/admin/org/policies` (update globals)
- `POST /api/admin/org/policies/exemptions` (add user)
- `DELETE /api/admin/org/policies/exemptions/{userId}`
- `PUT /api/admin/org/policies/escalation`

#### **Task B3: Audit Log Viewer (Days 4-5)**
**Files to create:**
- `/apps/enterprise/audit/page.tsx` - Immutable audit log viewer
  - Cryptographically signed log entries
  - Search by user/action/timestamp
  - Export to CSV
  - Tamper detection (signature verification)

- `/apps/enterprise/audit/components/LogViewer.tsx`
  - Sortable table (user, action, timestamp, status)
  - Search input
  - Filter by action type
  - Signature verification badge

**API Endpoints:**
- `GET /api/admin/org/audit-logs?limit=100&offset=0`
- `GET /api/admin/org/audit-logs/{logId}/verify` (verify signature)
- `POST /api/admin/org/audit-logs/export` (CSV export)

---

### WEEK 2: Policy Engine & RBAC

#### **Task B4: RBAC Implementation (Days 6-7)**
**Files to create:**
- `/api/middleware/rbac.js` - Role-based access control
  ```javascript
  const ROLES = {
    admin: ['read:all', 'write:all', 'delete:logs', 'manage:users'],
    auditor: ['read:all', 'read:logs', 'export:reports'],
    manager: ['read:dept', 'read:logs:dept', 'manage:exemptions:dept'],
    user: ['read:own', 'read:own-logs']
  };
  ```

- `/api/middleware/authorize.js`
  - JWT token parsing
  - Role extraction from claims
  - Permission checking
  - Scope validation (org_id, dept_id)

- `/apps/enterprise/team/page.tsx` - User management
  - List users (email, role, dept, status)
  - Add user modal
  - Change role dropdown
  - Remove user confirmation

**API Endpoints:**
- `POST /api/admin/team/users` (add user)
- `PUT /api/admin/team/users/{userId}/role` (change role)
- `DELETE /api/admin/team/users/{userId}` (remove)
- `GET /api/admin/team/users` (list with roles)

#### **Task B5: Policy Engine Service (Days 7-9)**
**Files to create:**
- `/api/services/policy-engine.js` - Core policy logic
  ```javascript
  class PolicyEngine {
    async applyPolicies(detection, orgId, userId, deptId) {
      // 1. Load org policies
      const policies = await this.loadOrgPolicies(orgId);

      // 2. Apply global threshold
      if (detection.risk > policies.globalThreshold) {
        detection.verdict = 'BLOCK';
      }

      // 3. Check user exemption
      if (await this.isUserExempt(orgId, userId)) {
        detection.verdict = 'ALLOW';
        return detection;
      }

      // 4. Apply department override
      const deptPolicy = policies.departments[deptId];
      if (deptPolicy && detection.risk <= deptPolicy.threshold) {
        detection.verdict = 'WARN';
      }

      // 5. Check escalation rules
      if (detection.risk > policies.escalationThreshold) {
        await this.triggerEscalation(orgId, detection);
      }

      return detection;
    }
  }
  ```

- `/api/services/compliance-mapper.js`
  - Map detections to SOC2 controls
  - Map to HIPAA/GDPR requirements
  - Generate compliance evidence

---

### WEEK 3: Deployment & Compliance

#### **Task B6: Deployment Orchestration (Days 10-11)**
**Files to create:**
- `/apps/enterprise/deployment/page.tsx`
  - Rollout timeline (5% → 20% → 50% → 100%)
  - Platform selection (Windows/macOS/Chromebook)
  - Approval workflow (require 2 approvals before >50%)
  - Rollback option

- `/scripts/deploy/windows-gpo.ps1`
  - Group Policy deployment script
  - Registry configuration
  - Extension installation via MSI

- `/scripts/deploy/macos-mdm.xml`
  - MDM profile for Jamf/Apple Business Manager
  - Auto-install configuration
  - Update frequency (nightly)

- `/scripts/deploy/chromebook-workspace.js`
  - Google Workspace Admin API calls
  - Force-install extension
  - Auto-update settings

**API Endpoints:**
- `GET /api/admin/org/deployment/status`
- `POST /api/admin/org/deployment/rollout` (start rollout)
- `PUT /api/admin/org/deployment/rollout/{id}` (update %)
- `POST /api/admin/org/deployment/rollback` (rollback)

#### **Task B7: Compliance Reporting (Days 11-12)**
**Files to create:**
- `/api/services/compliance-report-generator.js`
  - Generate SOC2 Type II attestation
  - Generate HIPAA BAA compliance report
  - Generate GDPR data processing addendum

- `/apps/enterprise/compliance/page.tsx`
  - Report templates (SOC2/HIPAA/GDPR)
  - Date range selector
  - Generate button
  - Download PDF

**API Endpoints:**
- `POST /api/admin/compliance/report/soc2?from=&to=` (generate)
- `POST /api/admin/compliance/report/hipaa?from=&to=`
- `POST /api/admin/compliance/report/gdpr?from=&to=`
- `GET /api/admin/compliance/report/{reportId}`

#### **Task B8: Testing & Documentation (Day 13)**
- End-to-end testing (create org → add users → deploy → verify)
- Load testing (1000 concurrent detections)
- Compliance audit (verify immutable logging)
- Documentation (deployment guide for IT admins)

---

## IMPLEMENTATION DETAILS

### Admin Portal Components

#### Dashboard (Real-time)
```typescript
interface DashboardData {
  threats: {
    last24h: Detection[];
    last7d: Detection[];
    last30d: Detection[];
  };
  stats: {
    totalDetections: number;
    blockedCount: number;
    exemptCount: number;
    userCount: number;
  };
  deployment: {
    percentage: number;
    platformBreakdown: { windows: number; macos: number; chromebook: number };
    lastSync: Date;
  };
  escalations: Escalation[];
}
```

#### Policy Structure
```typescript
interface OrgPolicies {
  globalThreshold: number; // 0-100 (risk score to block)
  exemptions: {
    users: string[]; // user IDs
    departments: string[]; // dept IDs
    reasons: Map<string, string>;
  };
  departments: {
    [deptId: string]: {
      threshold: number;
      escalationChannel: string;
    };
  };
  escalationThreshold: number; // trigger escalation >X
  escalationChannels: {
    email?: string[];
    slack?: string;
    webhook?: string;
  };
}
```

### API Response Format

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: object;
  };
  timestamp: Date;
  requestId: string;
}
```

### Audit Log Format

```typescript
interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  action: string; // 'CREATE_EXEMPTION', 'UPDATE_POLICY', etc.
  resource: string; // what was modified
  oldValue?: object;
  newValue?: object;
  status: 'SUCCESS' | 'FAILURE';
  ipAddress: string;
  signature: string; // HMAC-SHA256 signature
  sequenceNumber: number; // prevent tampering
}
```

---

## DEPLOYMENT TARGETS

### Windows (Active Directory)

**Via Group Policy:**
```powershell
# Deploy extension MSI
Start-Process msiexec.exe -ArgumentList "/i kasbah-guard.msi /quiet"

# Configure via Registry
New-Item -Path "HKLM:\Software\Kasbah" -Force
Set-ItemProperty -Path "HKLM:\Software\Kasbah" -Name "ApiEndpoint" -Value "https://api.bekasbah.com"
Set-ItemProperty -Path "HKLM:\Software\Kasbah" -Name "OrgId" -Value "org-123"
```

**Rollout Strategy:**
- Week 1: 5% of user base (pilot group)
- Week 2: 20% (department heads)
- Week 3: 50% (core departments)
- Week 4: 100% (full org)

**Rollback:**
- Disable GPO
- Uninstall via msiexec
- Revert configuration registry

### macOS (MDM)

**Via Jamf Pro:**
- Create custom app installation
- Deploy extension + configuration
- Auto-update: Nightly 2am UTC
- Uninstall: 1-click from MDM

**Via Apple Business Manager:**
- VPP distribution (Volume Purchase Program)
- Device assignment
- Auto-update: Managed by ABM

### Chromebook (Google Workspace)

**Via Google Admin Console:**
```bash
# API call to force-install
POST https://www.googleapis.com/admin/directory/v1/customers/{customerId}/chrome/apps/web/{appId}/deployments

{
  "deploymentStatus": "FORCE_INSTALLED",
  "autoUpdate": "AUTO_UPDATE_EVERY_24_HOURS"
}
```

---

## COMPLIANCE TEMPLATES

### SOC2 Type II Attestation
- Control A1: Logical access (RBAC implemented)
- Control A2: Change management (audit logs)
- Control A3: Monitoring (real-time dashboard)
- Control S1: Confidentiality (AES-256-GCM encryption)
- Control S2: Availability (99.9% SLA)

### HIPAA Compliance
- BAA signed (Business Associate Agreement)
- PHI detection + blocking
- Audit trail (6-year retention)
- Incident response plan
- Data breach notification

### GDPR Compliance
- Data Processing Agreement (DPA)
- Consent tracking
- Data minimization (no PII in logs)
- Right to deletion (with audit preservation)
- Data breach response (72-hour notification)

---

## SUCCESS CRITERIA

✅ **Admin Dashboard**
- Real-time threat feed updates <100ms
- Dashboard loads <2s
- All KPIs accurate

✅ **Policy Engine**
- Policies apply to 100% of detections
- Exemptions respected (0 false blocks)
- Escalations trigger within 10s

✅ **RBAC**
- Each role can access only assigned resources
- No privilege escalation possible
- Permission audit trail complete

✅ **Deployment**
- Extension deploys to all 3 platforms
- Rollout percentage matches actual deploy count
- Rollback succeeds in <1 hour

✅ **Compliance**
- All reports auto-generate in <30s
- Audit logs tamper-proof (signature verified)
- Data retention meets legal requirements

✅ **Performance**
- API p95 latency <500ms
- Dashboard p95 load time <2s
- Audit log query <1s

---

## MIGRATION PLAN

### Phase A → Phase B Transition

**Pre-Migration (Day 15):**
1. Backup all extension data (local proofs, history)
2. Create API compatibility layer
3. Test extension → API communication
4. Create enterprise onboarding workflow

**Migration (Days 15-20):**
1. Deploy API with org management endpoints
2. Activate enterprise dashboard
3. Configure RBAC for pilot org
4. Test full flow (detection → proof → policy → dashboard)

**Post-Migration (Days 20-25):**
1. Monitor for issues (error rate <0.1%)
2. Gather feedback from pilot org
3. Tune policies based on real data
4. Prepare for Phase C (production scale)

---

## DELIVERABLES CHECKLIST

- [ ] Admin dashboard UI (all pages)
- [ ] Policy editor with full CRUD
- [ ] RBAC system with role enforcement
- [ ] Audit logging (immutable, signed)
- [ ] Compliance reporting (SOC2/HIPAA/GDPR)
- [ ] Deployment orchestration scripts
- [ ] API endpoints (28 total)
- [ ] Database schema (org policies, audit logs, users, roles)
- [ ] End-to-end tests
- [ ] Deployment documentation (IT admin guide)
- [ ] Compliance documentation
- [ ] Performance benchmarks

---

## RISK MITIGATION

| Risk | Mitigation |
|------|-----------|
| Policy engine delays detections | Cache policies, fail-open on error |
| Audit logs become tamper vector | Immutable D1, cryptographic signatures |
| Deployment to wrong devices | Approval workflow for >50% rollout |
| RBAC bypass | Regular security audit, penetration testing |
| API downtime | Multi-region failover, 99.9% SLA |

---

## NEXT PHASE (Phase C): Production Scale

After Phase B completion:
- Expand to 100+ enterprise customers
- Integrate blockchain passports (from Phase A Task 3)
- Launch compliance automation (continuous SOC2 attestation)
- Prepare Series A fundraising ($1-3M)

---

**Prepared by**: Security Team
**Date**: March 1, 2026
**Status**: ✅ READY FOR IMPLEMENTATION
**Next Review**: April 5, 2026

