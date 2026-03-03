/**
 * Kasbah Guard — Compliance Mapper v1.0.0
 *
 * Maps security detections to compliance frameworks:
 * - SOC2 Type II (Trust Services Criteria)
 * - HIPAA (Health Insurance Portability and Accountability)
 * - GDPR (General Data Protection Regulation)
 * - PCI-DSS (Payment Card Industry Data Security)
 */

class ComplianceMapper {
  constructor() {
    // SOC2 Trust Services Criteria mapping
    this.soc2Controls = {
      // CC: Common Criteria
      'CC6.1': {
        name: 'Logical Access Controls',
        description: 'Logical access to systems is restricted',
        detectionPatterns: ['password', 'api_key', 'auth_token'],
      },
      'CC6.2': {
        name: 'Credential Management',
        description: 'Authentication credentials are managed appropriately',
        detectionPatterns: ['database_password', 'ssh_key', 'private_key'],
      },
      'CC7.1': {
        name: 'Unauthorized Access Prevention',
        description: 'System access is restricted to authorized users',
        detectionPatterns: ['aws_key', 'gcp_key', 'azure_key'],
      },
      'CC7.2': {
        name: 'User Activity Monitoring',
        description: 'User and entity access activity is monitored',
        detectionPatterns: ['jwt_token', 'session_token'],
      },
      'CC9.2': {
        name: 'Removal of Access Rights',
        description: 'Access rights are revoked appropriately',
        detectionPatterns: ['service_account_key'],
      },
    };

    // HIPAA Security Rule mapping
    this.hipaaControls = {
      'S_45_CFR_164_308_a_4': {
        name: 'Information Access Management',
        description: 'Workforce members access only authorized ePHI',
        detectionPatterns: ['password', 'database_password', 'encryption_key'],
        severity: 'critical',
      },
      'S_45_CFR_164_312_a_2_i': {
        name: 'Unique User Identification',
        description: 'Unique identifiers for workforce member activity',
        detectionPatterns: ['user_id', 'auth_token'],
        severity: 'high',
      },
      'S_45_CFR_164_312_a_2_ii': {
        name: 'Emergency Access Procedures',
        description: 'Procedures for user access emergency situations',
        detectionPatterns: ['api_key', 'jwt_token'],
        severity: 'high',
      },
      'S_45_CFR_164_312_b': {
        name: 'Encryption',
        description: 'Encryption for ePHI in transit and at rest',
        detectionPatterns: ['private_key', 'encryption_key', 'ssl_cert'],
        severity: 'critical',
      },
    };

    // GDPR Compliance mapping
    this.gdprControls = {
      'article_32': {
        name: 'Security of Processing',
        description: 'Implement technical/organizational measures to secure personal data',
        detectionPatterns: ['password', 'api_key', 'private_key'],
        severity: 'critical',
        rightsAffected: ['confidentiality', 'integrity'],
      },
      'article_33': {
        name: 'Data Breach Notification',
        description: 'Notify supervisory authority of personal data breach without undue delay',
        detectionPatterns: ['ssn', 'credit_card', 'pii'],
        severity: 'critical',
        requiresNotification: true,
      },
      'article_5': {
        name: 'Principles for Processing',
        description: 'Personal data must be processed lawfully, fairly, transparently',
        detectionPatterns: ['access_log', 'auth_token'],
        severity: 'high',
      },
    };

    // PCI-DSS mapping
    this.pciControls = {
      '2.1': {
        name: 'Change Default Passwords',
        description: 'Change default access credentials',
        detectionPatterns: ['default_password'],
        severity: 'critical',
      },
      '3.2': {
        name: 'Encrypt Card Data',
        description: 'Render card data unreadable by encryption',
        detectionPatterns: ['credit_card', 'cardholder_data'],
        severity: 'critical',
      },
      '6.5.10': {
        name: 'Broken Authentication',
        description: 'Protect against broken authentication',
        detectionPatterns: ['weak_password', 'session_fixation'],
        severity: 'high',
      },
      '8.1': {
        name: 'Unique User IDs',
        description: 'Assign unique ID to each person with computer access',
        detectionPatterns: ['user_id', 'service_account'],
        severity: 'high',
      },
    };
  }

  /**
   * Map detection to all applicable compliance controls
   */
  mapDetectionToCompliance(detection) {
    const mapping = {
      detection_id: detection.id,
      timestamp: new Date().toISOString(),
      risk_score: detection.risk_score,
      pattern: detection.pattern,
      compliance_frameworks: {
        soc2: this.mapToSOC2(detection),
        hipaa: this.mapToHIPAA(detection),
        gdpr: this.mapToGDPR(detection),
        pci_dss: this.mapToPCIDSS(detection),
      },
      action_items: this.generateActionItems(detection),
      evidence: {
        pattern_detected: detection.pattern,
        content_hash: detection.content_hash,
        detection_method: 'detector.js v1.0.0',
      },
    };

    return mapping;
  }

  /**
   * Map detection to SOC2 controls
   */
  mapToSOC2(detection) {
    const applicableControls = [];

    for (const [controlId, control] of Object.entries(this.soc2Controls)) {
      if (this.patternMatches(detection.pattern, control.detectionPatterns)) {
        applicableControls.push({
          control_id: controlId,
          control_name: control.name,
          description: control.description,
          compliance_status: 'identified_issue',
          evidence_link: `detection:${detection.id}`,
          remediation_required: true,
        });
      }
    }

    return {
      applicable_controls: applicableControls,
      total_controls_affected: applicableControls.length,
      audit_readiness: applicableControls.length === 0 ? 'compliant' : 'requires_attention',
    };
  }

  /**
   * Map detection to HIPAA controls
   */
  mapToHIPAA(detection) {
    const applicableControls = [];

    for (const [controlId, control] of Object.entries(this.hipaaControls)) {
      if (this.patternMatches(detection.pattern, control.detectionPatterns)) {
        applicableControls.push({
          control_id: controlId,
          control_name: control.name,
          description: control.description,
          severity: control.severity,
          compliance_status: 'identified_violation',
          breach_risk: this.assessBreachRisk(detection.pattern),
          enforcement_action: this.getEnforcementAction(control.severity),
        });
      }
    }

    return {
      applicable_controls: applicableControls,
      total_violations: applicableControls.length,
      requires_reporting: applicableControls.some((c) => c.severity === 'critical'),
      breach_notification_required: applicableControls.some((c) => detection.risk_score > 85),
    };
  }

  /**
   * Map detection to GDPR requirements
   */
  mapToGDPR(detection) {
    const applicableArticles = [];

    for (const [articleId, article] of Object.entries(this.gdprControls)) {
      if (this.patternMatches(detection.pattern, article.detectionPatterns)) {
        applicableArticles.push({
          article_id: articleId,
          article_name: article.name,
          description: article.description,
          severity: article.severity,
          rights_affected: article.rightsAffected || [],
          requires_notification: article.requiresNotification || false,
          notification_deadline_days: article.requiresNotification ? 72 : null,
          data_subjects_impacted: 'all_identifiable',
        });
      }
    }

    return {
      applicable_articles: applicableArticles,
      total_articles_implicated: applicableArticles.length,
      data_breach_notification_required: applicableArticles.some(
        (a) => a.requires_notification && detection.risk_score > 80
      ),
      data_protection_impact: 'high',
      maximum_fine_percentage: this.calculateGDPRFine(detection.risk_score),
    };
  }

  /**
   * Map detection to PCI-DSS requirements
   */
  mapToPCIDSS(detection) {
    const applicableRequirements = [];

    for (const [requirementId, requirement] of Object.entries(this.pciControls)) {
      if (this.patternMatches(detection.pattern, requirement.detectionPatterns)) {
        applicableRequirements.push({
          requirement_id: requirementId,
          requirement_name: requirement.name,
          description: requirement.description,
          severity: requirement.severity,
          compliance_status: 'non_compliant',
          time_to_remediate_days: requirement.severity === 'critical' ? 1 : 7,
          audit_scope: 'in_scope',
        });
      }
    }

    return {
      applicable_requirements: applicableRequirements,
      total_requirements_violated: applicableRequirements.length,
      immediate_remediation_required: applicableRequirements.some((r) => r.severity === 'critical'),
      assessment_impact: 'failed',
    };
  }

  /**
   * Generate action items based on compliance violations
   */
  generateActionItems(detection) {
    const actions = [];

    if (detection.risk_score >= 90) {
      actions.push({
        priority: 'critical',
        action: 'Immediate containment required',
        description: 'Block further transmission and investigate source',
        owner: 'security_team',
        deadline: 'immediate',
      });
    }

    if (detection.risk_score >= 80) {
      actions.push({
        priority: 'high',
        action: 'Notify Data Protection Officer (DPO)',
        description: 'Report potential GDPR Article 33 breach notification requirement',
        owner: 'legal_compliance',
        deadline: '24_hours',
      });
    }

    if (detection.pattern.includes('credit_card')) {
      actions.push({
        priority: 'critical',
        action: 'Notify payment processor',
        description: 'Report PCI-DSS violation for card data exposure',
        owner: 'payments_team',
        deadline: 'immediate',
      });
    }

    actions.push({
      priority: 'high',
      action: 'Document evidence',
      description: 'Preserve detection evidence for audit trail and compliance reporting',
      owner: 'security_team',
      deadline: '1_hour',
    });

    return actions;
  }

  /**
   * Helper: Check if pattern matches detection keywords
   */
  patternMatches(detectionPattern, keywords) {
    const lowerPattern = detectionPattern.toLowerCase();
    return keywords.some((keyword) => lowerPattern.includes(keyword.toLowerCase()));
  }

  /**
   * Helper: Assess breach risk level
   */
  assessBreachRisk(pattern) {
    if (
      pattern.includes('ssn') ||
      pattern.includes('credit_card') ||
      pattern.includes('private_key')
    ) {
      return 'high_breach_risk';
    }
    if (pattern.includes('password') || pattern.includes('api_key')) {
      return 'medium_breach_risk';
    }
    return 'low_breach_risk';
  }

  /**
   * Helper: Get enforcement action based on severity
   */
  getEnforcementAction(severity) {
    const actions = {
      critical: 'immediate_corrective_action_required',
      high: 'corrective_action_plan_required',
      medium: 'remediation_recommended',
      low: 'best_practice_improvement',
    };
    return actions[severity] || 'review_recommended';
  }

  /**
   * Helper: Calculate potential GDPR fine
   */
  calculateGDPRFine(riskScore) {
    if (riskScore >= 90) return '4%'; // Up to 4% of global revenue
    if (riskScore >= 75) return '2%'; // Up to 2% of global revenue
    return '0%'; // Administrative fine only
  }

  /**
   * Generate compliance report for audit period
   */
  generateComplianceReport(org_id, detections, frameworkFilter = null) {
    const report = {
      report_id: `compliance-${Date.now()}`,
      generated_at: new Date().toISOString(),
      org_id: org_id,
      period: {
        start: new Date(Date.now() - 30 * 86400000).toISOString(),
        end: new Date().toISOString(),
      },
      frameworks: {},
      summary: {},
    };

    // Map each detection and aggregate
    const mappings = detections.map((d) => this.mapDetectionToCompliance(d));

    // Aggregate by framework
    if (!frameworkFilter || frameworkFilter === 'soc2') {
      report.frameworks.soc2 = this.aggregateSOC2(mappings);
    }
    if (!frameworkFilter || frameworkFilter === 'hipaa') {
      report.frameworks.hipaa = this.aggregateHIPAA(mappings);
    }
    if (!frameworkFilter || frameworkFilter === 'gdpr') {
      report.frameworks.gdpr = this.aggregateGDPR(mappings);
    }
    if (!frameworkFilter || frameworkFilter === 'pci_dss') {
      report.frameworks.pci_dss = this.aggregatePCIDSS(mappings);
    }

    // Overall summary
    report.summary = {
      total_detections: mappings.length,
      critical_issues: mappings.filter((m) => m.risk_score >= 90).length,
      action_items_generated: mappings.reduce((sum, m) => sum + m.action_items.length, 0),
      frameworks_affected: Object.keys(report.frameworks).length,
      audit_readiness: this.assessAuditReadiness(report),
    };

    return report;
  }

  /**
   * Aggregate SOC2 findings
   */
  aggregateSOC2(mappings) {
    const allControls = new Set();
    let totalIssues = 0;

    mappings.forEach((m) => {
      m.compliance_frameworks.soc2.applicable_controls.forEach((c) => {
        allControls.add(c.control_id);
        totalIssues++;
      });
    });

    return {
      controls_affected: Array.from(allControls),
      total_identified_issues: totalIssues,
      audit_status: totalIssues === 0 ? 'ready_for_audit' : 'remediation_required',
    };
  }

  /**
   * Aggregate HIPAA findings
   */
  aggregateHIPAA(mappings) {
    const criticalViolations = mappings.filter(
      (m) => m.compliance_frameworks.hipaa.total_violations > 0
    ).length;

    return {
      total_violations: mappings.reduce((sum, m) => sum + m.compliance_frameworks.hipaa.total_violations, 0),
      critical_violations: criticalViolations,
      breach_notifications_required: mappings.filter(
        (m) => m.compliance_frameworks.hipaa.breach_notification_required
      ).length,
      compliance_status: criticalViolations === 0 ? 'compliant' : 'non_compliant',
    };
  }

  /**
   * Aggregate GDPR findings
   */
  aggregateGDPR(mappings) {
    const breachNotifications = mappings.filter(
      (m) => m.compliance_frameworks.gdpr.data_breach_notification_required
    ).length;

    return {
      total_article_violations: mappings.reduce((sum, m) => sum + m.compliance_frameworks.gdpr.total_articles_implicated, 0),
      data_subjects_affected: 'all',
      breach_notifications_required: breachNotifications,
      maximum_potential_fine: breachNotifications > 0 ? 'up_to_4_percent_revenue' : 'up_to_2_percent_revenue',
      compliance_status: breachNotifications === 0 ? 'compliant' : 'breach_detected',
    };
  }

  /**
   * Aggregate PCI-DSS findings
   */
  aggregatePCIDSS(mappings) {
    const failedAssessment = mappings.some(
      (m) => m.compliance_frameworks.pci_dss.total_requirements_violated > 0
    );

    return {
      total_requirements_violated: mappings.reduce((sum, m) => sum + m.compliance_frameworks.pci_dss.total_requirements_violated, 0),
      assessment_result: failedAssessment ? 'failed' : 'passed',
      remediation_deadline_days: 7,
      merchant_status: failedAssessment ? 'non_compliant' : 'compliant',
    };
  }

  /**
   * Assess overall audit readiness
   */
  assessAuditReadiness(report) {
    const readiness = {
      overall_score: 0,
      status: 'compliant',
      issues_found: 0,
    };

    Object.values(report.frameworks).forEach((fw) => {
      if (fw.audit_status === 'remediation_required' || fw.compliance_status === 'non_compliant') {
        readiness.status = 'requires_attention';
      }
    });

    readiness.issues_found = report.summary.action_items_generated;

    return readiness;
  }
}

module.exports = ComplianceMapper;
