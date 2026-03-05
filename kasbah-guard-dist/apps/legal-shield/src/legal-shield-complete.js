/**
 * Kasbah Guard — Legal Shield
 * 
 * Attorney-client privilege detection
 * Work product protection for law firms
 */

const { scan } = require('@kasbah/detector');

class LegalShield {
  constructor(config) {
    this.config = config;
    this.privilegePatterns = this.loadPrivilegePatterns();
    this.matters = new Map();
  }

  loadPrivilegePatterns() {
    return {
      privilegeMarkers: /\b(?:ATTORNEY-CLIENT|PRIVILEGED|CONFIDENTIAL|WORK\s*PRODUCT)\b/gi,
      workProduct: /\b(?:PREPARED\s*IN\s*ANTICIPATION\s*OF\s*LITIGATION|ATTORNEY\s*WORK\s*PRODUCT)\b/gi,
      clientNames: /\b(?:Client|Defendant|Plaintiff|Party)[:\s]\s*[A-Z][a-z]+\s+[A-Z][a-z]+\b/gi,
      caseNumbers: /\b(?:Case\s*No\.?|Docket\s*No\.?|CV-\d{2}-\d{5,})\b/gi,
      courtFilings: /\b(?:FILED\s*UNDER\s*SEAL|CONFIDENTIAL\s*EXHIBIT|PROTECTED\s*MATERIAL)\b/gi,
      settlementTerms: /\b(?:SETTLEMENT\s*AGREEMENT|CONFIDENTIAL\s*SETTLEMENT|NON-DISCLOSURE)\b/gi,
      strategy: /\b(?:LITIGATION\s*STRATEGY|SETTLEMENT\s*POSITION|CASE\s*STRATEGY)\b/gi,
      confidential: /\b(?:PROPRIETARY|TRADE\s*SECRET|CONFIDENTIAL\s*INFO)\b/gi
    };
  }

  /**
   * Scan document for privileged content
   */
  async scanDocument(document) {
    const standardResult = await scan(document.content || '');
    const privilegeDetections = this.detectPrivilege(document.content || '');
    
    const privileged = privilegeDetections.length > 0;
    const risk = privileged ? Math.max(standardResult.risk, 90) : standardResult.risk;
    
    return {
      ...standardResult,
      privileged,
      privilegeViolations: privilegeDetections,
      risk,
      decision: privileged ? 'DENY' : standardResult.decision,
      classification: this.classifyDocument(privilegeDetections)
    };
  }

  /**
   * Detect attorney-client privilege markers
   */
  detectPrivilege(text) {
    const detections = [];

    for (const [category, pattern] of Object.entries(this.privilegePatterns)) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        detections.push({
          category,
          type: 'privilege_marker',
          count: matches.length,
          samples: matches.slice(0, 2),
          risk: this.getCategoryRisk(category)
        });
      }
    }

    return detections;
  }

  getCategoryRisk(category) {
    const risks = {
      privilegeMarkers: 95,
      workProduct: 95,
      courtFilings: 90,
      settlementTerms: 90,
      strategy: 85,
      clientNames: 80,
      caseNumbers: 75,
      confidential: 80
    };
    return risks[category] || 50;
  }

  /**
   * Classify document by privilege level
   */
  classifyDocument(detections) {
    const hasPrivilegeMarkers = detections.some(d => 
      d.category === 'privilegeMarkers' || d.category === 'workProduct'
    );
    
    const hasCourtFiling = detections.some(d => 
      d.category === 'courtFilings'
    );

    if (hasPrivilegeMarkers) return 'ATTORNEY_CLIENT_PRIVILEGED';
    if (hasCourtFiling) return 'COURT_PROTECTED';
    if (detections.length > 0) return 'CONFIDENTIAL';
    return 'UNCLASSIFIED';
  }

  /**
   * Matter-based policy enforcement
   */
  createMatter(matterId, config) {
    this.matters.set(matterId, {
      matterId,
      config,
      createdAt: Date.now(),
      members: config.members || [],
      restrictions: config.restrictions || []
    });
  }

  /**
   * Check if user can access matter
   */
  async checkMatterAccess(matterId, userId) {
    const matter = this.matters.get(matterId);
    if (!matter) return { allowed: false, reason: 'matter_not_found' };

    const isMember = matter.members.includes(userId);
    const hasRestriction = matter.restrictions.some(r => 
      r.type === 'user' && r.value === userId
    );

    return {
      allowed: isMember && !hasRestriction,
      reason: isMember ? 'authorized' : 'not_member',
      matter: {
        id: matter.matterId,
        memberCount: matter.members.length
      }
    };
  }

  /**
   * Redact privileged content
   */
  redactPrivileged(text) {
    let redacted = text;

    for (const [category, pattern] of Object.entries(this.privilegePatterns)) {
      redacted = redacted.replace(pattern, `[REDACTED::PRIVILEGED]`);
    }

    return redacted;
  }

  /**
   * Generate privilege log for eDiscovery
   */
  generatePrivilegeLog(documents) {
    const log = [];

    for (const doc of documents) {
      const detections = this.detectPrivilege(doc.content || '');
      
      if (detections.length > 0) {
        log.push({
          documentId: doc.id,
          date: doc.date || new Date().toISOString(),
          author: doc.author || 'Unknown',
          recipients: doc.recipients || [],
          privilegeClaimed: true,
          privilegeType: this.classifyDocument(detections),
          basis: detections.map(d => d.category).join(', '),
          redacted: true
        });
      }
    }

    return {
      reportType: 'privilege_log',
      totalDocuments: documents.length,
      privilegedDocuments: log.length,
      log,
      generatedAt: Date.now()
    };
  }

  /**
   * Email protection
   */
  async scanEmail(email) {
    const bodyResult = await this.scanDocument({ content: email.body });
    const subjectResult = await this.scanDocument({ content: email.subject });
    
    const externalRecipient = email.to.some(r => 
      !r.endsWith('@lawfirm.com') // Configurable domain
    );

    const risk = externalRecipient && (bodyResult.privileged || subjectResult.privileged)
      ? 'CRITICAL'
      : bodyResult.risk >= 70 || subjectResult.risk >= 70
        ? 'HIGH'
        : 'MEDIUM';

    return {
      risk,
      privileged: bodyResult.privileged || subjectResult.privileged,
      externalRecipients: externalRecipient,
      recommendations: this.getEmailRecommendations(risk, externalRecipient)
    };
  }

  getEmailRecommendations(risk, external) {
    const recs = [];
    
    if (risk === 'CRITICAL' && external) {
      recs.push('Block send - privileged content to external recipient');
      recs.push('Encrypt email if send is necessary');
      recs.push('Remove privileged content before sending');
    } else if (risk === 'HIGH') {
      recs.push('Review content before sending');
      recs.push('Consider encryption');
    }
    
    return recs;
  }

  /**
   * ABA Model Rules compliance
   */
  checkABARules(action) {
    const violations = [];

    // Rule 1.6 - Confidentiality
    if (action.type === 'external_disclosure' && !action.clientConsent) {
      violations.push({
        rule: 'ABA 1.6',
        description: 'Confidentiality of Information',
        severity: 'HIGH'
      });
    }

    // Rule 1.1 - Competence (technology)
    if (action.type === 'unsecured_transmission') {
      violations.push({
        rule: 'ABA 1.1',
        description: 'Competence (Technology)',
        severity: 'MEDIUM'
      });
    }

    // Rule 5.3 - Supervision
    if (action.type === 'non_lawyer_access' && !action.supervision) {
      violations.push({
        rule: 'ABA 5.3',
        description: 'Responsibilities Regarding Nonlawyer Assistance',
        severity: 'MEDIUM'
      });
    }

    return {
      compliant: violations.length === 0,
      violations,
      rules: ['1.1', '1.6', '5.3']
    };
  }
}

module.exports = { LegalShield };
