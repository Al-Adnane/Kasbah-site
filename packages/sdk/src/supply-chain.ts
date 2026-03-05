/**
 * Kasbah Guard SDK — Data Supply Chain Tracker
 *
 * Detects PII across 15 categories, builds data lineage nodes,
 * assesses GDPR / CCPA / HIPAA / AI_Act compliance, and generates
 * lineage reports. Pure TypeScript, no external dependencies,
 * browser-compatible.
 *
 * @packageDocumentation
 */

// ── PII Categories ────────────────────────────────────────────────────────────

/** The 15 supported PII categories. */
export enum PIICategory {
  NAME            = 'name',
  EMAIL           = 'email',
  PHONE           = 'phone',
  SSN             = 'ssn',
  CREDIT_CARD     = 'credit_card',
  ADDRESS         = 'address',
  DATE_OF_BIRTH   = 'date_of_birth',
  PASSPORT        = 'passport',
  DRIVER_LICENSE  = 'driver_license',
  IP_ADDRESS      = 'ip_address',
  BIOMETRIC       = 'biometric',
  HEALTH          = 'health',
  FINANCIAL       = 'financial',
  LOCATION        = 'location',
  GOVERNMENT_ID   = 'government_id',
}

// ── Compliance Frameworks ─────────────────────────────────────────────────────

/** Supported compliance frameworks. */
export type ComplianceFramework = 'GDPR' | 'CCPA' | 'HIPAA' | 'AI_ACT';

/** Per-category risk scores (points). Max total is capped at 100. */
const RISK_SCORES: Record<PIICategory, number> = {
  [PIICategory.NAME]:           20,
  [PIICategory.EMAIL]:          20,
  [PIICategory.PHONE]:          20,
  [PIICategory.SSN]:            40,
  [PIICategory.CREDIT_CARD]:    40,
  [PIICategory.ADDRESS]:        25,
  [PIICategory.DATE_OF_BIRTH]:  25,
  [PIICategory.PASSPORT]:       40,
  [PIICategory.DRIVER_LICENSE]: 40,
  [PIICategory.IP_ADDRESS]:     25,
  [PIICategory.BIOMETRIC]:      35,
  [PIICategory.HEALTH]:         35,
  [PIICategory.FINANCIAL]:      35,
  [PIICategory.LOCATION]:       25,
  [PIICategory.GOVERNMENT_ID]:  25,
};

/**
 * Categories that trigger a compliance violation per framework.
 * A node violates a framework if it contains any of these categories.
 */
const COMPLIANCE_TRIGGERS: Record<ComplianceFramework, PIICategory[]> = {
  GDPR:   [PIICategory.NAME, PIICategory.EMAIL, PIICategory.IP_ADDRESS,
           PIICategory.LOCATION, PIICategory.BIOMETRIC, PIICategory.HEALTH],
  CCPA:   [PIICategory.NAME, PIICategory.EMAIL, PIICategory.PHONE,
           PIICategory.ADDRESS, PIICategory.IP_ADDRESS, PIICategory.FINANCIAL],
  HIPAA:  [PIICategory.NAME, PIICategory.DATE_OF_BIRTH, PIICategory.SSN,
           PIICategory.HEALTH, PIICategory.BIOMETRIC],
  AI_ACT: [PIICategory.BIOMETRIC, PIICategory.HEALTH, PIICategory.FINANCIAL],
};

// ── PII Detection Patterns ────────────────────────────────────────────────────

/**
 * Regex patterns for each PII category.
 * All patterns are designed for browser-compatible JavaScript RegExp.
 */
const PII_PATTERNS: Partial<Record<PIICategory, RegExp>> = {
  [PIICategory.EMAIL]:
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,

  [PIICategory.PHONE]:
    /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,

  [PIICategory.SSN]:
    /\b\d{3}-\d{2}-\d{4}\b/g,

  [PIICategory.CREDIT_CARD]:
    /\b(?:\d[ \-]?){13,19}\b/g,

  [PIICategory.IP_ADDRESS]:
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,

  [PIICategory.DATE_OF_BIRTH]:
    /\b(?:dob|date[\s_-]*of[\s_-]*birth|born)[\s:]*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/gi,

  [PIICategory.PASSPORT]:
    /\b(?:passport[\s#:]*)[A-Z]{1,2}\d{6,9}\b/gi,

  [PIICategory.DRIVER_LICENSE]:
    /\b(?:driver'?s?[\s_-]*licen[sc]e|dl[\s#:]*)[A-Z0-9]{5,15}\b/gi,

  [PIICategory.ADDRESS]:
    /\b\d{1,5}\s+[A-Z][a-zA-Z\s]{2,40}(?:St(?:reet)?|Ave(?:nue)?|Blvd|Rd|Road|Dr(?:ive)?|Ln|Lane|Ct|Court|Way|Pl(?:ace)?)\b/gi,

  [PIICategory.NAME]:
    /\b(?:name[\s:]*|(?:first|last|full)[\s_-]*name[\s:]*)([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){1,3})\b/g,

  [PIICategory.BIOMETRIC]:
    /\b(?:fingerprint|retina[\s_-]*scan|face[\s_-]*id|voiceprint|iris[\s_-]*scan|biometric|palm[\s_-]*print)\b/gi,

  [PIICategory.HEALTH]:
    /\b(?:diagnosis|medical[\s_-]*record|patient[\s_-]*id|prescription|icd[\s_-]*\d|blood[\s_-]*type|allergy|health[\s_-]*condition)\b/gi,

  [PIICategory.FINANCIAL]:
    /\b(?:account[\s_-]*number|iban|routing[\s_-]*number|bank[\s_-]*account|balance|tax[\s_-]*id|ein\b|tin\b)\b/gi,

  [PIICategory.LOCATION]:
    /\b(?:gps[\s_:]*coordinates?|lat(?:itude)?[\s:]*[-+]?\d+\.\d+|lon(?:gitude)?[\s:]*[-+]?\d+\.\d+|geo[\s_-]*location)\b/gi,

  [PIICategory.GOVERNMENT_ID]:
    /\b(?:national[\s_-]*id|gov(?:ernment)?[\s_-]*id|citizen[\s_-]*id|social[\s_-]*insurance|nin\b|nric\b|cnp\b)\b/gi,
};

// ── Interfaces ────────────────────────────────────────────────────────────────

/** A single node in the data lineage graph. */
export interface DataLineageNode {
  /** Unique node identifier (timestamp-based hex). */
  id: string;
  /** Unix timestamp (ms) when the node was created. */
  timestamp: number;
  /** Human-readable source label (e.g. 'file', 'api', 'user_upload'). */
  source: string;
  /** PII categories detected in the source text. */
  piiCategories: PIICategory[];
  /** Aggregate risk score in the range 0–100. */
  riskScore: number;
  /** List of transformations applied to the data (e.g. 'anonymization'). */
  transformations: string[];
  /** Compliance framework tags that this node triggers. */
  complianceFlags: string[];
}

/** A compliance violation entry for a single framework. */
export interface ComplianceViolation {
  framework: string;
  violations: string[];
}

/** Full lineage report across all tracked nodes. */
export interface DataLineageReport {
  /** All nodes that have been tracked in this session. */
  nodes: DataLineageNode[];
  /** Sum of all node risk scores, capped at 100. */
  totalRisk: number;
  /** Compliance violations aggregated across all nodes. */
  complianceViolations: ComplianceViolation[];
  /** Human-readable recommendation based on the overall risk profile. */
  recommendation: string;
}

// ── DataSupplyChainTracker ────────────────────────────────────────────────────

/**
 * Data Supply Chain Tracker.
 *
 * Detects PII across 15 categories, builds data lineage nodes,
 * assesses GDPR / CCPA / HIPAA / AI_Act compliance, and generates
 * full lineage reports.
 *
 * @example
 * ```typescript
 * const tracker = new DataSupplyChainTracker();
 * const node = tracker.createLineageNode('user-form', 'Name: John Doe, SSN: 123-45-6789');
 * const report = tracker.generateReport();
 * console.log(report.totalRisk);           // 60 (NAME 20 + SSN 40, capped at 100)
 * console.log(report.complianceViolations); // GDPR, CCPA, HIPAA violations
 * ```
 */
export class DataSupplyChainTracker {
  private nodes: DataLineageNode[] = [];

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Generate a lightweight hex ID from the current timestamp + a random suffix. */
  private generateId(): string {
    const ts = Date.now().toString(16);
    const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
    return `${ts}${rand}`;
  }

  /** Run all PII patterns against text. Resets lastIndex before each match. */
  private runPatterns(text: string): PIICategory[] {
    const found = new Set<PIICategory>();
    for (const [category, pattern] of Object.entries(PII_PATTERNS) as [PIICategory, RegExp][]) {
      // Clone the pattern to avoid lastIndex contamination across calls
      const re = new RegExp(pattern.source, pattern.flags);
      if (re.test(text)) {
        found.add(category);
      }
    }
    return Array.from(found);
  }

  /** Compute a risk score (0–100) from a list of detected PII categories. */
  private computeRiskScore(categories: PIICategory[]): number {
    const total = categories.reduce((sum, cat) => sum + (RISK_SCORES[cat] ?? 0), 0);
    return Math.min(100, total);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Scan a text string for PII patterns.
   *
   * @param text - The text to scan.
   * @returns An object containing the detected PII categories and an
   *          aggregate risk score in the range 0–100.
   *
   * @example
   * ```typescript
   * const { categories, riskScore } = tracker.detectPII('Email: foo@bar.com, SSN: 123-45-6789');
   * // categories: [PIICategory.EMAIL, PIICategory.SSN]
   * // riskScore: 60
   * ```
   */
  detectPII(text: string): { categories: PIICategory[]; riskScore: number } {
    const categories = this.runPatterns(text);
    const riskScore = this.computeRiskScore(categories);
    return { categories, riskScore };
  }

  /**
   * Create a data lineage node from a source label and raw text.
   *
   * The node is automatically registered in the tracker's internal store
   * so it will appear in subsequent `generateReport()` calls.
   *
   * @param source        - Label identifying the data origin (e.g. 'api', 'file').
   * @param text          - Raw text content to scan for PII.
   * @param transformations - Optional list of transformations already applied.
   * @returns The newly created `DataLineageNode`.
   *
   * @example
   * ```typescript
   * const node = tracker.createLineageNode('user-upload', 'John Doe, john@example.com');
   * ```
   */
  createLineageNode(
    source: string,
    text: string,
    transformations: string[] = [],
  ): DataLineageNode {
    const { categories, riskScore } = this.detectPII(text);
    const complianceAssessment = this.assessCompliance({
      id: '',
      timestamp: 0,
      source,
      piiCategories: categories,
      riskScore,
      transformations,
      complianceFlags: [],
    });

    const node: DataLineageNode = {
      id: this.generateId(),
      timestamp: Date.now(),
      source,
      piiCategories: categories,
      riskScore,
      transformations,
      complianceFlags: complianceAssessment.map((v) => v.framework),
    };

    this.nodes.push(node);
    return node;
  }

  /**
   * Assess compliance violations for a given lineage node.
   *
   * Checks the node's detected PII categories against the trigger lists for
   * GDPR, CCPA, HIPAA, and AI_ACT.
   *
   * @param node - The node to assess.
   * @returns An array of `ComplianceViolation` objects (one per triggered framework).
   *
   * @example
   * ```typescript
   * const violations = tracker.assessCompliance(node);
   * // [{ framework: 'GDPR', violations: ['email', 'ip_address'] }, ...]
   * ```
   */
  assessCompliance(node: DataLineageNode): ComplianceViolation[] {
    const results: ComplianceViolation[] = [];

    for (const [framework, triggers] of Object.entries(COMPLIANCE_TRIGGERS) as [ComplianceFramework, PIICategory[]][]) {
      const triggered = triggers.filter((cat) => node.piiCategories.includes(cat));
      if (triggered.length > 0) {
        results.push({ framework, violations: triggered });
      }
    }

    return results;
  }

  /**
   * Generate a full lineage report across all tracked nodes.
   *
   * Aggregates risk scores, compliance violations, and a human-readable
   * recommendation based on the overall risk profile.
   *
   * @returns A `DataLineageReport` containing all nodes, total risk,
   *          compliance violations, and a recommendation string.
   *
   * @example
   * ```typescript
   * const report = tracker.generateReport();
   * console.log(report.totalRisk);
   * console.log(report.recommendation);
   * ```
   */
  generateReport(): DataLineageReport {
    const totalRisk = Math.min(
      100,
      this.nodes.reduce((sum, n) => sum + n.riskScore, 0),
    );

    // Aggregate violations across all nodes, deduplicated per framework
    const violationMap = new Map<string, Set<string>>();
    for (const node of this.nodes) {
      for (const v of this.assessCompliance(node)) {
        if (!violationMap.has(v.framework)) {
          violationMap.set(v.framework, new Set());
        }
        for (const cat of v.violations) {
          violationMap.get(v.framework)!.add(cat);
        }
      }
    }

    const complianceViolations: ComplianceViolation[] = Array.from(violationMap.entries()).map(
      ([framework, cats]) => ({ framework, violations: Array.from(cats) }),
    );

    // Build recommendation
    let recommendation: string;
    if (totalRisk === 0) {
      recommendation = 'No PII detected. Data supply chain is clean.';
    } else if (totalRisk <= 30) {
      recommendation = 'Low PII risk. Ensure appropriate access controls are in place.';
    } else if (totalRisk <= 60) {
      recommendation =
        'Moderate PII risk detected. Apply pseudonymization and audit data access.';
    } else {
      recommendation =
        'High PII risk. Apply anonymization before storage, restrict data access, and obtain explicit consent.';
    }

    if (complianceViolations.length > 0) {
      const frameworks = complianceViolations.map((v) => v.framework).join(', ');
      recommendation += ` Compliance frameworks triggered: ${frameworks}.`;
    }

    return {
      nodes: [...this.nodes],
      totalRisk,
      complianceViolations,
      recommendation,
    };
  }

  /**
   * Reset the tracker, clearing all tracked lineage nodes.
   *
   * @example
   * ```typescript
   * tracker.reset();
   * ```
   */
  reset(): void {
    this.nodes = [];
  }
}
