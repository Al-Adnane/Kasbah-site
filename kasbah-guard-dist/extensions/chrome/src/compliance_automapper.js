/**
 * Compliance Auto-Mapper: Automatic Regulatory Classification
 * ============================================================
 *
 * Maps detected threats to applicable regulations (GDPR, HIPAA, SOC2, PCI-DSS, CCPA)
 * Generates compliance checklists, deadlines, and audit-ready reports
 *
 * Used by: zk_proof_controller.js, background.js
 * Storage: chrome.storage.local (compliance_metadata)
 */

const ComplianceAutoMapper = (() => {
  // Regulatory framework definitions
  const REGULATIONS = {
    GDPR: {
      name: 'General Data Protection Regulation',
      jurisdiction: 'EU',
      triggers: [
        'password',
        'email',
        'personal data',
        'biometric',
        'SSN',
        'passport',
        'name',
        'address',
        'phone'
      ],
      requirements: [
        'right to audit',
        'data minimization',
        'consent verification',
        'breach notification (72h)',
        'privacy impact assessment'
      ],
      breachNotificationDeadline: 72,  // hours
      severity_multiplier: 1.5
    },

    HIPAA: {
      name: 'Health Insurance Portability and Accountability Act',
      jurisdiction: 'US-Healthcare',
      triggers: [
        'health',
        'medical record',
        'patient',
        'diagnosis',
        'medication',
        'PHI',
        'protected health information',
        'healthcare',
        'hospital',
        'doctor'
      ],
      requirements: [
        'audit trail',
        'encryption at rest',
        'encryption in transit',
        'access control',
        'breach assessment',
        'patient notification'
      ],
      breachNotificationDeadline: 24,  // hours
      severity_multiplier: 2.0
    },

    SOC2: {
      name: 'Service Organization Control 2',
      jurisdiction: 'US-Enterprise',
      triggers: [
        'credentials',
        'API key',
        'private key',
        'token',
        'secret',
        'auth',
        'access control',
        'audit log'
      ],
      requirements: [
        'change log',
        'access restrictions',
        'encryption',
        'monitoring',
        'incident response'
      ],
      breachNotificationDeadline: 48,  // hours
      severity_multiplier: 1.3
    },

    'PCI-DSS': {
      name: 'Payment Card Industry Data Security Standard',
      jurisdiction: 'Financial',
      triggers: [
        'credit card',
        'cardholder data',
        'CVV',
        'card number',
        'expiration date',
        'payment',
        'PIN',
        'magnetic stripe'
      ],
      requirements: [
        'encryption',
        'tokenization',
        'audit trail',
        'access control',
        'compliance scanning'
      ],
      breachNotificationDeadline: 24,  // hours
      severity_multiplier: 2.5
    },

    CCPA: {
      name: 'California Consumer Privacy Act',
      jurisdiction: 'US-California',
      triggers: [
        'California',
        'consumer data',
        'sale',
        'personal information',
        'opt-out',
        'deletion request'
      ],
      requirements: [
        'opt-out mechanism',
        'disclosure requirement',
        'deletion capability',
        'data access',
        'privacy policy'
      ],
      breachNotificationDeadline: 30,  // days
      severity_multiplier: 1.2
    },

    FERPA: {
      name: 'Family Educational Rights and Privacy Act',
      jurisdiction: 'US-Education',
      triggers: [
        'student record',
        'education',
        'school',
        'student ID',
        'grade',
        'transcript'
      ],
      requirements: [
        'parental consent',
        'student access rights',
        'record retention',
        'audit trail'
      ],
      breachNotificationDeadline: 60,  // days
      severity_multiplier: 1.4
    }
  };

  /**
   * Map detection to applicable regulations
   */
  async function mapDetectionToCompliance(detection) {
    const applicableRegs = [];
    const text = (detection.text || '').toLowerCase();

    // Match detection content to regulatory triggers
    for (const [regCode, regData] of Object.entries(REGULATIONS)) {
      const matched = regData.triggers.some(trigger =>
        text.includes(trigger.toLowerCase())
      );

      if (matched) {
        const severity = calculateSeverity(detection, regData);

        applicableRegs.push({
          regulation: regCode,
          name: regData.name,
          jurisdiction: regData.jurisdiction,
          requirements: regData.requirements,
          severity: severity,
          notificationDeadline: calculateDeadline(regData),
          actions: generateActions(regCode, detection, severity)
        });
      }
    }

    // Generate compliance report
    const report = {
      detection_id: detection.id,
      timestamp: new Date().toISOString(),
      applicable_regulations: applicableRegs,
      total_regulations: applicableRegs.length,
      max_severity: applicableRegs.length > 0
        ? Math.max(...applicableRegs.map(r => r.severity))
        : 0,

      // Auto-generate checklist
      compliance_checklist: generateChecklist(applicableRegs),

      // Suggested actions
      recommended_actions: generateRecommendedActions(applicableRegs, detection),

      // Audit requirements
      audit_requirements: {
        proof_required: applicableRegs.some(r =>
          r.requirements.includes('audit trail')
        ),
        encryption_required: applicableRegs.some(r =>
          r.requirements.includes('encryption') ||
          r.requirements.includes('encryption at rest') ||
          r.requirements.includes('encryption in transit')
        ),
        notification_required: applicableRegs.length > 0,
        documentation_required: applicableRegs.length > 0
      },

      // Risk assessment
      compliance_risk: {
        high_risk: applicableRegs.filter(r => r.severity > 0.7).map(r => r.regulation),
        medium_risk: applicableRegs.filter(r => r.severity > 0.4 && r.severity <= 0.7).map(r => r.regulation),
        low_risk: applicableRegs.filter(r => r.severity <= 0.4).map(r => r.regulation)
      }
    };

    return report;
  }

  /**
   * Calculate severity score (0-1) based on detection and regulation
   */
  function calculateSeverity(detection, regData) {
    let severity = detection.risk_score || 0.5;

    // Multipliers based on regulation
    severity *= regData.severity_multiplier || 1.0;

    // Escalate if credentials detected
    if (detection.text && detection.text.toLowerCase().includes('password')) {
      severity = Math.min(1.0, severity + 0.2);
    }

    if (detection.text && detection.text.toLowerCase().includes('key')) {
      severity = Math.min(1.0, severity + 0.15);
    }

    // Cap at 1.0
    return Math.min(1.0, severity);
  }

  /**
   * Calculate notification deadline based on regulation
   */
  function calculateDeadline(regData) {
    const now = new Date();
    const deadline = new Date(now);

    if (regData.breachNotificationDeadline) {
      if (regData.breachNotificationDeadline < 24) {
        // Hours
        deadline.setHours(deadline.getHours() + regData.breachNotificationDeadline);
      } else if (regData.breachNotificationDeadline <= 31) {
        // Days
        deadline.setDate(deadline.getDate() + Math.ceil(regData.breachNotificationDeadline / 24));
      } else {
        // Days (e.g., 60 for FERPA)
        deadline.setDate(deadline.getDate() + regData.breachNotificationDeadline);
      }
    }

    return {
      deadline: deadline.toISOString(),
      hours_remaining: Math.ceil((deadline - now) / (1000 * 60 * 60)),
      is_urgent: (deadline - now) < (24 * 60 * 60 * 1000)  // Less than 24 hours
    };
  }

  /**
   * Generate compliance checklist from regulations
   */
  function generateChecklist(regulations) {
    const checklist = [];

    for (const reg of regulations) {
      for (const requirement of reg.requirements) {
        checklist.push({
          id: `${reg.regulation}-${requirement}`,
          regulation: reg.regulation,
          requirement: requirement,
          status: 'PENDING',
          evidence: null,
          completed_date: null,
          notes: ''
        });
      }
    }

    return checklist;
  }

  /**
   * Generate recommended actions
   */
  function generateRecommendedActions(regulations, detection) {
    const actions = {
      immediate: [],
      within_24h: [],
      within_72h: [],
      ongoing: []
    };

    for (const reg of regulations) {
      switch (reg.regulation) {
        case 'GDPR':
          if (detection.decision === 'BLOCK') {
            actions.immediate.push(
              '🔴 Log incident in GDPR breach register',
              '🔴 Preserve evidence for investigation'
            );
            actions.within_24h.push(
              '📋 Assess if notification required (Art. 33)',
              '📊 Document risk assessment'
            );
            actions.within_72h.push(
              '🔔 Notify supervisory authority if high risk',
              '✉️ Notify affected individuals'
            );
          }
          break;

        case 'HIPAA':
          actions.immediate.push(
            '🔴 Isolate affected systems',
            '🔴 Disable compromised credentials'
          );
          actions.within_24h.push(
            '📋 Begin forensic analysis',
            '🔍 Determine scope of breach'
          );
          actions.within_24h.push(
            '✉️ Notify affected patient(s)',
            '📢 Notify media (if 500+ individuals)'
          );
          break;

        case 'SOC2':
          actions.immediate.push(
            '🔴 Revoke credentials',
            '🔴 Audit access logs'
          );
          actions.within_24h.push(
            '📋 Document incident',
            '🔄 Implement compensating controls'
          );
          actions.ongoing.push(
            '📊 Monitor for further abuse',
            '🔐 Strengthen access controls'
          );
          break;

        case 'PCI-DSS':
          actions.immediate.push(
            '🔴 Revoke card data access',
            '🔴 Preserve transaction logs'
          );
          actions.within_24h.push(
            '📋 Notify payment processor',
            '🔍 Scan for unauthorized transactions'
          );
          actions.within_72h.push(
            '✉️ Notify affected cardholders',
            '📢 Consider credit monitoring'
          );
          break;

        case 'CCPA':
          actions.within_24h.push(
            '📋 Document sale/sharing (if applicable)',
            '🔔 Notify California Attorney General'
          );
          actions.ongoing.push(
            '✉️ Provide consumer opt-out option',
            '📊 Maintain sale/sharing disclosure'
          );
          break;

        case 'FERPA':
          actions.immediate.push(
            '🔴 Secure student records',
            '🔴 Restrict access'
          );
          actions.within_24h.push(
            '📋 Document incident',
            '🔔 Notify parents/guardians'
          );
          break;
      }
    }

    return actions;
  }

  /**
   * Export compliance report (JSON/CSV/HTML)
   */
  async function exportComplianceReport(dateRange, format = 'json') {
    const detections = await chrome.storage.local.get(['zk_proofs']);
    const proofs = detections.zk_proofs || [];

    const filtered = proofs.filter(p => {
      const timestamp = new Date(p.timestamp);
      return timestamp >= dateRange.start && timestamp <= dateRange.end;
    });

    const reports = [];
    for (const detection of filtered) {
      const complianceData = await mapDetectionToCompliance(detection);
      reports.push(complianceData);
    }

    switch (format) {
      case 'json':
        return JSON.stringify(reports, null, 2);

      case 'csv':
        return generateCSVReport(reports);

      case 'html':
        return generateHTMLReport(reports);

      default:
        return reports;
    }
  }

  /**
   * Generate CSV export
   */
  function generateCSVReport(reports) {
    const headers = [
      'Detection ID',
      'Timestamp',
      'Applicable Regulations',
      'Max Severity',
      'Actions Required',
      'Notification Deadline',
      'Urgent'
    ];

    const rows = reports.map(report => [
      report.detection_id,
      report.timestamp,
      report.applicable_regulations.map(r => r.regulation).join('; '),
      report.max_severity.toFixed(2),
      report.recommended_actions.immediate.length +
        report.recommended_actions.within_24h.length +
        report.recommended_actions.within_72h.length,
      report.applicable_regulations[0]?.notificationDeadline?.deadline || 'N/A',
      report.applicable_regulations.some(r => r.notificationDeadline?.is_urgent) ? 'YES' : 'NO'
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    return csv;
  }

  /**
   * Generate HTML report
   */
  function generateHTMLReport(reports) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Compliance Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .regulation { border: 1px solid #ddd; margin: 10px 0; padding: 10px; border-radius: 4px; }
    .severity-high { background-color: #ffcccc; }
    .severity-medium { background-color: #fff3cd; }
    .severity-low { background-color: #d4edda; }
    .action { padding: 5px; margin: 5px 0; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Compliance Audit Report</h1>
  <p>Generated: ${new Date().toISOString()}</p>
  <p>Total Detections: ${reports.length}</p>

  <h2>Summary Statistics</h2>
  <table>
    <tr>
      <th>Metric</th>
      <th>Count</th>
    </tr>
    <tr>
      <td>High Risk Regulations</td>
      <td>${reports.reduce((sum, r) => sum + r.compliance_risk.high_risk.length, 0)}</td>
    </tr>
    <tr>
      <td>Medium Risk Regulations</td>
      <td>${reports.reduce((sum, r) => sum + r.compliance_risk.medium_risk.length, 0)}</td>
    </tr>
    <tr>
      <td>Low Risk Regulations</td>
      <td>${reports.reduce((sum, r) => sum + r.compliance_risk.low_risk.length, 0)}</td>
    </tr>
  </table>

  <h2>Detailed Findings</h2>
  ${reports.map(report => `
    <div class="finding">
      <h3>Detection: ${report.detection_id}</h3>
      <p><strong>Timestamp:</strong> ${report.timestamp}</p>
      <p><strong>Applicable Regulations:</strong> ${report.applicable_regulations.length}</p>

      ${report.applicable_regulations.map(reg => `
        <div class="regulation severity-${reg.severity > 0.7 ? 'high' : reg.severity > 0.4 ? 'medium' : 'low'}">
          <h4>${reg.regulation}: ${reg.name}</h4>
          <p><strong>Jurisdiction:</strong> ${reg.jurisdiction}</p>
          <p><strong>Severity:</strong> ${(reg.severity * 100).toFixed(0)}%</p>
          <p><strong>Notification Deadline:</strong> ${reg.notificationDeadline.deadline}</p>
          <p><strong>Hours Remaining:</strong> ${reg.notificationDeadline.hours_remaining}</p>

          <h5>Recommended Actions</h5>
          <div class="action">
            <strong>Immediate:</strong>
            ${reg.actions?.immediate?.map(a => `<div>${a}</div>`).join('') || 'None'}
          </div>
          <div class="action">
            <strong>Within 24h:</strong>
            ${reg.actions?.within_24h?.map(a => `<div>${a}</div>`).join('') || 'None'}
          </div>
          <div class="action">
            <strong>Within 72h:</strong>
            ${reg.actions?.within_72h?.map(a => `<div>${a}</div>`).join('') || 'None'}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('')}
</body>
</html>
    `;

    return html;
  }

  /**
   * Store compliance metadata with detection
   */
  async function storeComplianceMetadata(detectionId, complianceReport) {
    const existing = await chrome.storage.local.get(['compliance_metadata']) || {};
    const metadata = existing.compliance_metadata || {};

    metadata[detectionId] = {
      report: complianceReport,
      stored_at: new Date().toISOString(),
      acknowledged: false,
      actions_taken: []
    };

    await chrome.storage.local.set({ compliance_metadata: metadata });
    return metadata[detectionId];
  }

  /**
   * Get pending compliance actions
   */
  async function getPendingActions() {
    const detections = await chrome.storage.local.get(['zk_proofs']);
    const proofs = detections.zk_proofs || [];

    const pending = [];

    for (const proof of proofs) {
      const compliance = await mapDetectionToCompliance(proof);

      if (compliance.applicable_regulations.length > 0) {
        const urgentActions = compliance.recommended_actions.immediate.concat(
          compliance.recommended_actions.within_24h
        );

        if (urgentActions.length > 0) {
          pending.push({
            detection_id: proof.id,
            timestamp: proof.timestamp,
            regulations: compliance.applicable_regulations.map(r => r.regulation),
            urgent_actions: urgentActions,
            deadline: compliance.applicable_regulations[0]?.notificationDeadline
          });
        }
      }
    }

    return pending.sort((a, b) =>
      new Date(a.deadline?.deadline) - new Date(b.deadline?.deadline)
    );
  }

  // Public API
  return {
    mapDetectionToCompliance,
    exportComplianceReport,
    storeComplianceMetadata,
    getPendingActions,
    REGULATIONS
  };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ComplianceAutoMapper;
}
