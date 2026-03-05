# Kasbah Guard — Hospital Guardian (HIPAA)

**Status:** Code Complete  
**Version:** 1.0.0  
**Compliance:** HIPAA Title II Ready

---

## Overview

Hospital Guardian protects Protected Health Information (PHI) in healthcare systems. Detects all 18 HIPAA identifiers and provides audit logging for compliance.

---

## Features

- ✅ All 18 HIPAA identifier detection
- ✅ EHR integration (Epic, Cerner compatible)
- ✅ PHI redaction
- ✅ 6-year audit log retention
- ✅ BAA-ready architecture
- ✅ Role-based access control
- ✅ Breach detection and alerting

---

## HIPAA Identifiers Detected

| Identifier | Pattern | Example |
|------------|---------|---------|
| Names | Context-aware | Patient names |
| Geographic | State, city, zip | CA, 90210 |
| Dates | Birth, admission | 01/15/1980 |
| Phone | US format | (555) 123-4567 |
| Fax | Fax numbers | 555-123-4566 |
| Email | Email addresses | patient@hospital.com |
| SSN | 9 digits | 123-45-6789 |
| Medical Record | MRN patterns | MRN-123456 |
| Health Plan | Policy numbers | BCBS-123456789 |
| Account | Account numbers | ACCT-789012 |
| Certificate | License numbers | MD-123456 |
| Vehicle | VIN, license plate | 1HGBH41JXMN109186 |
| Device | Device identifiers | SN-ABC123 |
| URLs | Patient portals | patient.hospital.com |
| IP Addresses | IPv4, IPv6 | 192.168.1.1 |
| Biometric | Fingerprints, voice | N/A |
| Photos | Full face images | N/A |
| Other | Unique codes | Any unique ID |

---

## Deployment

### On-Premise (Recommended for HIPAA)

```bash
# Clone repository
git clone https://github.com/kasbah-guard/hospital-guard.git
cd hospital-guard

# Configure environment
cp .env.example .env
# Set HIPAA-compliant settings

# Deploy
docker-compose up -d

# Verify
curl http://localhost:8000/health
```

### Cloud (HIPAA-eligible providers only)

- AWS (with BAA)
- Google Cloud (with BAA)
- Azure (with BAA)

**Note:** Must sign BAA with cloud provider before deployment.

---

## EHR Integration

### Epic Integration

```python
from kasbah_hospital import HospitalGuard

guard = HospitalGuard(api_key="your-key")

# Scan patient note
result = guard.scan_note("Patient John Doe (SSN: 123-45-6789)...")
if result.phi_detected:
    guard.redact_and_log(result)
```

### Cerner Integration

```python
from kasbah_hospital import HospitalGuard

guard = HospitalGuard(api_key="your-key")

# Scan lab result
result = guard.scan_lab_result("Patient: Jane Smith, MRN: 123456...")
if result.phi_detected:
    guard.alert_breach(result)
```

---

## Audit Logging

All PHI access is logged with:
- User who accessed
- Patient record accessed
- Timestamp
- Action taken (view, edit, export)
- Hash-chain integrity (tamper-evident)

**Retention:** 6 years (HIPAA requirement)

---

## Breach Detection

Automatic alerts for:
- Unauthorized PHI access
- Bulk PHI export
- PHI sent outside network
- Unusual access patterns

**Alert Channels:**
- Email
- SMS
- Slack
- SIEM integration

---

## Compliance

### HIPAA Title II

| Safeguard | Status |
|-----------|--------|
| Administrative | ✅ Implemented |
| Physical | ✅ Cloud provider BAA |
| Technical | ✅ Encryption, access control |
| Organizational | ✅ BAA template provided |
| Policies | ✅ Template policies included |
| Documentation | ✅ Full documentation |

### HITECH Act

| Requirement | Status |
|-------------|--------|
| Breach notification | ✅ <60 days |
| Audit controls | ✅ Hash-chain logging |
| Access controls | ✅ RBAC |
| Integrity controls | ✅ Tamper-evident |

---

## Business Associate Agreement (BAA)

Kasbah Guard provides BAA template for:
- Healthcare providers
- Health plans
- Healthcare clearinghouses
- Business associates

**Contact:** compliance@kasbah.ai for BAA execution

---

## Security

### Encryption

| Data State | Standard |
|------------|----------|
| In Transit | TLS 1.3 |
| At Rest | AES-256 |
| Backups | AES-256 |

### Access Control

- Multi-factor authentication required
- Role-based access control (RBAC)
- Session timeout after 15 minutes
- Unique user identification

### Audit

- All access logged
- 6-year retention
- Tamper-evident (hash-chain)
- Exportable for audits

---

## Pricing

| Tier | Price | Includes |
|------|-------|----------|
| Small Clinic | $10K/year | Up to 50 users, basic PHI detection |
| Hospital | $50K/year | Unlimited users, full HIPAA, EHR integration |
| Health System | Custom | Multi-facility, custom integrations |

**All tiers include:**
- BAA execution
- HIPAA compliance support
- 6-year audit log retention
- Breach detection and alerting

---

## Support

- **Implementation:** 2-week onboarding
- **Training:** Staff training included
- **Compliance:** HIPAA compliance support
- **Emergency:** 24/7 breach response

**Contact:** hospital@kasbah.ai

---

## Version History

### 1.0.0 (March 2026)
- Initial release
- 18 HIPAA identifiers
- EHR integration
- Audit logging
- Breach detection

---

## License

Proprietary — See LICENSE file

## Support

- Documentation: https://docs.kasbah.ai/hospital-guard
- Compliance: compliance@kasbah.ai
- Emergency: 24/7 hotline (customers only)

---

**Status:** Code Complete ✅  
**Compliance:** HIPAA Title II Ready  
**Ready for:** Healthcare deployment
