/**
 * Constitutional AI Intent Validator
 *
 * Validates user intents against constitutional principles using:
 *   1. Pattern-based policy matching (synchronous, zero-latency)
 *   2. Heuristic risk scoring (entropy, repetition, frontier markers)
 *   3. Anthropic Constitutional AI critique-and-revise loop (when API key present)
 *      — calls claude-haiku-3-5 only in the ambiguous zone (risk 0.3–0.7)
 *      — one critique round + one revision round, returns refined risk assessment
 */

import { logger } from './logger';

export interface ValidationResult {
  valid: boolean;
  risk_score: number; // 0.0-1.0
  reasoning: string;
  blocked_rules: string[];
  requires_approval: boolean;
  ccl_level: number; // 0-5, mapped from risk_score
  authz_context?: {
    principal?: string;
    ticket_id?: string;
    audit_entry_id?: string;
  };
}

interface PolicyConstraint {
  rule_id: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern?: RegExp;
}

const DEFAULT_POLICIES: PolicyConstraint[] = [
  {
    rule_id: 'injection_attack',
    description: 'Prompt injection attempt detected',
    severity: 'critical',
    pattern: /ignore.*previous|forget|new instructions|role.*switch|ignore the above|disregard the above|new task:|your new goal|act as if|pretend you are/i,
  },
  {
    rule_id: 'token_boundary_injection',
    description: 'Token-boundary / special-token injection attempt',
    severity: 'critical',
    pattern: /<\|im_start\|>|<\|im_end\|>|<\|system\|>|<\|user\|>|<\|assistant\|>|\[INST\]|\[\/INST\]|<<SYS>>|<<\/SYS>>/i,
  },
  {
    rule_id: 'jailbreak_attempt',
    description: 'Jailbreak attempt detected',
    severity: 'critical',
    pattern: /jailbreak|bypass|circumvent|disable.*safety|developer mode|you are now dan|do anything now/i,
  },
  {
    rule_id: 'data_exfiltration',
    description: 'Potential data exfiltration intent',
    severity: 'high',
    pattern: /extract|exfiltrate|steal|leak|dump.*data|credentials/i,
  },
  {
    rule_id: 'malware_intent',
    description: 'Malware development or distribution intent',
    severity: 'critical',
    pattern: /malware|ransomware|botnet|exploit|shellcode/i,
  },
  {
    rule_id: 'privacy_violation',
    description: 'Privacy violation intent',
    severity: 'high',
    pattern: /spy|dox|doxx|stalking|harass|blackmail/i,
  },
  // AI Vibe-Code safety policies
  {
    rule_id: 'insecure_codegen',
    description: 'AI-generated code contains unsafe eval/exec/os.system pattern',
    severity: 'high',
    pattern: /\beval\s*\(|(?:^|\n)\s*exec\s*\(|os\.system\s*\(|os\.popen\s*\(|subprocess\.call\s*\(|new\s+Function\s*\(/im,
  },
  {
    rule_id: 'hardcoded_secrets',
    description: 'Hardcoded credentials or API keys in AI-generated code',
    severity: 'critical',
    pattern: /(?:password|passwd|api_key|secret|token)\s*=\s*['"][^'"]{4,}/i,
  },
  {
    rule_id: 'disabled_tls',
    description: 'TLS/certificate verification disabled in AI-generated code',
    severity: 'high',
    pattern: /verify\s*=\s*[Ff]alse|rejectUnauthorized\s*:\s*false|ssl_verify\s*=\s*[Ff]alse|checkHostname\s*=\s*[Ff]alse|no_verify/i,
  },
  {
    rule_id: 'sql_injection_codegen',
    description: 'SQL query built via string concatenation or f-string (injection risk)',
    severity: 'high',
    pattern: /f["'](?:SELECT|INSERT|UPDATE|DELETE)|["']SELECT\s.*?\+\s*|execute\s*\(\s*["'].*?\+/i,
  },
  {
    rule_id: 'insecure_deserialization',
    description: 'Unsafe deserialization (pickle.load, yaml.load without Loader, unserialize)',
    severity: 'critical',
    pattern: /pickle\.loads?\s*\(|yaml\.load\s*\([^)]*(?!\bLoader\b)|marshal\.loads\s*\(|unserialize\s*\(/i,
  },
  {
    rule_id: 'path_traversal',
    description: 'Path traversal pattern in file operation',
    severity: 'high',
    pattern: /\.\.\//,
  },
  {
    rule_id: 'insecure_random',
    description: 'Math.random() used for security-sensitive value (token/password/secret)',
    severity: 'high',
    pattern: /Math\.random\s*\(\s*\).*(?:token|password|secret|key|nonce|salt)|(?:token|password|secret|key|nonce|salt).*Math\.random\s*\(\s*\)/is,
  },
  {
    rule_id: 'xss_codegen',
    description: 'XSS risk: innerHTML/document.write with user-controlled input',
    severity: 'high',
    pattern: /innerHTML\s*=.*(?:req\.|params\.|query\.|userInput|user_input)|document\.write\s*\(/i,
  },
];

export class ConstitutionalAIValidator {
  private policies: Map<string, PolicyConstraint[]>;

  constructor() {
    this.policies = new Map();
    this.policies.set('default', DEFAULT_POLICIES);
  }

  /**
   * Validate user intent against constitutional policies
   */
  async validateIntent(
    intent: string,
    policy_id?: string,
    context?: Record<string, unknown>,
    authzContext?: { principal?: string; ticket_id?: string }
  ): Promise<ValidationResult> {
    const policyKey = policy_id || 'default';
    const constraints = this.policies.get(policyKey) || DEFAULT_POLICIES;

    // Check for pattern matches
    const blockedRules: string[] = [];
    let maxSeverityScore = 0;

    for (const constraint of constraints) {
      if (constraint.pattern && constraint.pattern.test(intent)) {
        blockedRules.push(constraint.rule_id);

        const severityScore = this.calculateSeverityScore(constraint.severity);
        maxSeverityScore = Math.max(maxSeverityScore, severityScore);

        logger.warn('Policy constraint triggered', {
          rule_id: constraint.rule_id,
          description: constraint.description,
        });
      }
    }

    // Additional heuristic checks
    const heuristicRisk = await this.calculateHeuristicRisk(intent);
    let riskScore = Math.max(maxSeverityScore, heuristicRisk);
    let reasoning = this.generateReasoning(blockedRules, riskScore, context);

    // Constitutional AI critique-and-revise loop (ambiguous zone only: 0.3–0.7)
    // Only runs if ANTHROPIC_API_KEY is set — gracefully skipped otherwise
    if (riskScore >= 0.3 && riskScore <= 0.7 && blockedRules.length === 0) {
      try {
        const caiResult = await this.constitutionalAICritiqueRevise(intent, riskScore);
        if (caiResult) {
          riskScore = caiResult.refinedRisk;
          reasoning = caiResult.reasoning;
        }
      } catch (err) {
        logger.warn('Constitutional AI critique-revise skipped (API unavailable)', { error: String(err) });
      }
    }

    const valid = riskScore < 0.5;
    const requiresApproval = riskScore >= 0.4;

    // Map risk_score to CCL level (0-5)
    const cclLevel = Math.min(5, Math.floor(riskScore * 5.5));

    return {
      valid,
      risk_score: riskScore,
      reasoning,
      blocked_rules: blockedRules,
      requires_approval: requiresApproval,
      ccl_level: cclLevel,
      ...(authzContext ? { authz_context: authzContext } : {}),
    };
  }

  /**
   * Anthropic Constitutional AI critique-and-revise loop.
   *
   * Called only when pattern-based risk is in the ambiguous zone (0.3–0.7)
   * and ANTHROPIC_API_KEY is available in the environment.
   *
   * Two-round loop:
   *   Round 1 — Critique: "Does this intent violate any of our constitutional principles?"
   *   Round 2 — Revise:   "Given your critique, what is the refined risk score (0.0-1.0)?"
   *
   * Uses claude-haiku-3-5 (fast, low-cost) with max_tokens=256.
   * Returns null on any failure so the caller falls back to pattern-based score.
   */
  private async constitutionalAICritiqueRevise(
    intent: string,
    baseRisk: number
  ): Promise<{ refinedRisk: number; reasoning: string } | null> {
    const apiKey = typeof process !== 'undefined' ? process.env['ANTHROPIC_API_KEY'] : undefined;
    if (!apiKey) return null;

    const constitutionalPrinciples = [
      'Do not assist with prompt injection, jailbreaks, or bypassing AI safety measures.',
      'Do not facilitate data exfiltration, credential theft, or privacy violations.',
      'Do not generate malware, exploits, or code intended to cause harm.',
      'Do not assist with surveillance, stalking, or harassment.',
      'Do not produce insecure code patterns (hardcoded secrets, disabled TLS, SQL injection).',
    ].join('\n');

    // Truncate intent to 500 chars to avoid high token cost
    const truncatedIntent = intent.length > 500 ? intent.slice(0, 500) + '…' : intent;

    // Round 1: Critique
    const critiquePrompt = `You are a Constitutional AI safety evaluator. Review the following user intent against our constitutional principles and identify any violations.

Constitutional principles:
${constitutionalPrinciples}

User intent: "${truncatedIntent}"

Initial risk score: ${baseRisk.toFixed(2)}

Provide a brief critique (2-3 sentences maximum). Identify specific violations if any.`;

    let critiqueText = '';
    try {
      const critiqueResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 256,
          messages: [{ role: 'user', content: critiquePrompt }],
        }),
      });

      if (!critiqueResp.ok) return null;
      const critiqueData = await critiqueResp.json() as { content?: Array<{type: string; text: string}> };
      critiqueText = critiqueData.content?.[0]?.text ?? '';
    } catch (_) {
      return null;
    }

    if (!critiqueText) return null;

    // Round 2: Revise — derive refined risk score from the critique
    const revisePrompt = `Based on your critique below, provide a refined risk score between 0.0 (completely safe) and 1.0 (clearly harmful) for the intent.

Critique: "${critiqueText.slice(0, 300)}"

Respond with ONLY a JSON object: {"risk": <number 0.0-1.0>, "summary": "<one sentence>"}`;

    try {
      const reviseResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 128,
          messages: [{ role: 'user', content: revisePrompt }],
        }),
      });

      if (!reviseResp.ok) return null;
      const reviseData = await reviseResp.json() as { content?: Array<{type: string; text: string}> };
      const reviseText = reviseData.content?.[0]?.text ?? '';

      // Parse JSON from model response
      const jsonMatch = reviseText.match(/\{[^}]+\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as { risk?: number; summary?: string };
      const refinedRisk = typeof parsed.risk === 'number'
        ? Math.min(1.0, Math.max(0.0, parsed.risk))
        : baseRisk;
      const summary = typeof parsed.summary === 'string' ? parsed.summary : '';

      logger.info('Constitutional AI critique-revise complete', {
        base_risk: baseRisk.toFixed(2),
        refined_risk: refinedRisk.toFixed(2),
      });

      return {
        refinedRisk,
        reasoning: `[CAI] ${critiqueText.slice(0, 200)}. Refined assessment: ${summary} (risk: ${(refinedRisk * 100).toFixed(1)}%)`,
      };
    } catch (_) {
      return null;
    }
  }

  /**
   * Calculate severity score based on rule type
   */
  private calculateSeverityScore(severity: string): number {
    const scoreMap: Record<string, number> = {
      low: 0.25,
      medium: 0.5,
      high: 0.75,
      critical: 1.0,
    };
    return scoreMap[severity] || 0;
  }

  /**
   * Calculate risk using heuristics (enhanced with Frontier)
   */
  private async calculateHeuristicRisk(intent: string): Promise<number> {
    let risk = 0;

    // Length-based risk
    if (intent.length > 5000) risk += 0.1;

    // Entropy-based risk (unusual character distribution)
    const entropy = this.calculateEntropy(intent);
    if (entropy > 5.5) risk += 0.15;

    // Repetition-based risk (suspicious patterns)
    const repetitionScore = this.calculateRepetition(intent);
    if (repetitionScore > 0.3) risk += 0.1;

    // Frontier heuristics: detect AI-generated prompts (high abstraction, marker phrases)
    const frontierRisk = this.frontierHeuristics(intent);
    risk += frontierRisk;

    return Math.min(risk, 0.5); // Cap at 0.5 for heuristics alone
  }

  /**
   * Frontier-based heuristics: detect AI-generated intents, marker phrases,
   * and AI vibe-code antipatterns (insecure codegen signals).
   */
  private frontierHeuristics(intent: string): number {
    if (intent.length < 50) return 0; // Too short to analyze

    let risk = 0;

    // AI generator marker phrases (suggests auto-generated/sophisticated attack)
    const markerPatterns = {
      gpt: [/\bas\s+(?:you|a)/i, /certainly\b/i, /please\s+note/i, /think\s+about\s+it/i],
      claude: [/i\'d\s+be\s+happy/i, /fascinating\s+(?:question|topic)/i, /\bnuance\b/i, /context\s+is\s+key/i],
      gemini: [/helpful\s+(?:information|response)/i, /dive\s+(?:into|deeper)/i, /comprehensive\s+(?:overview|guide)/i],
      llama: [/provide\s+(?:a|an)\s+(?:answer|response)/i, /step\s+by\s+step/i, /following\s+(?:steps|points)/i],
    };

    let markerCount = 0;
    for (const patterns of Object.values(markerPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(intent)) {
          markerCount++;
        }
      }
    }

    // If multiple AI markers detected, raise risk (suggests sophisticated attack)
    if (markerCount > 3) risk += 0.12;
    else if (markerCount > 1) risk += 0.06;

    // High entropy alone isn't suspicious, but combined with markers is
    if (this.calculateEntropy(intent) > 5.4 && markerCount > 0) risk += 0.05;

    // ── AI Vibe-Code Heuristics ───────────────────────────────────────
    // Detect patterns typical in insecure AI-generated code submissions

    // Multiple security antipatterns in same intent → compounding risk
    const vibeCodeSignals = [
      /\beval\s*\(/i,                        // eval
      /os\.system\s*\(/i,                    // shell execution
      /pickle\.loads?\s*\(/i,               // insecure deser
      /yaml\.load\s*\(/i,                   // insecure YAML
      /verify\s*=\s*False/i,               // disabled TLS
      /rejectUnauthorized\s*:\s*false/i,   // disabled TLS (JS)
      /Math\.random\s*\(\s*\)/i,           // insecure random
      /innerHTML\s*=/i,                     // potential XSS
      /\.\.\//,                             // path traversal
      /password\s*=\s*["'][^"']{4,}/i,     // hardcoded password
    ];

    const vibeHits = vibeCodeSignals.filter(p => p.test(intent)).length;
    if (vibeHits >= 3) risk += 0.20;
    else if (vibeHits === 2) risk += 0.12;
    else if (vibeHits === 1) risk += 0.06;

    // Intent explicitly asks AI to generate insecure code
    const insecureRequestPatterns = [
      /(?:write|generate|create|make)\s+(?:me\s+)?(?:a\s+)?(?:python|js|javascript|code).{0,50}(?:without|no)\s+(?:auth|authentication|ssl|tls|validation)/i,
      /skip\s+(?:the\s+)?(?:auth|ssl|tls|validation|sanitiz)/i,
      /don'?t\s+(?:bother\s+with\s+)?(?:auth|ssl|tls|validat|sanitiz)/i,
      /(?:disable|turn\s+off)\s+(?:ssl|tls|cert|authentication|security)/i,
    ];

    const insecureRequestHits = insecureRequestPatterns.filter(p => p.test(intent)).length;
    if (insecureRequestHits >= 1) risk += 0.20;

    return Math.min(risk, 0.25); // Cap frontier contribution at 0.25
  }

  /**
   * Calculate Shannon entropy
   */
  private calculateEntropy(text: string): number {
    const freq: Record<string, number> = {};

    for (const char of text) {
      freq[char] = (freq[char] || 0) + 1;
    }

    let entropy = 0;
    const len = text.length;

    for (const count of Object.values(freq)) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Calculate repetition score
   */
  private calculateRepetition(text: string): number {
    const words = text.split(/\s+/);
    const wordCounts: Record<string, number> = {};

    for (const word of words) {
      wordCounts[word.toLowerCase()] = (wordCounts[word.toLowerCase()] || 0) + 1;
    }

    const maxRepetition = Math.max(...Object.values(wordCounts));
    return maxRepetition / words.length;
  }

  /**
   * Generate explanation for validation result
   */
  private generateReasoning(
    blockedRules: string[],
    riskScore: number,
    context?: Record<string, unknown>
  ): string {
    if (blockedRules.length === 0) {
      return `Intent appears safe (risk score: ${(riskScore * 100).toFixed(1)}%). No constitutional violations detected.`;
    }

    const ruleNames = blockedRules.join(', ');
    return `Intent rejected due to policy violations: ${ruleNames}. Risk score: ${(riskScore * 100).toFixed(1)}%. Requires manual review or approval.`;
  }

  /**
   * Add custom policy
   */
  addPolicy(policy_id: string, constraints: PolicyConstraint[]) {
    this.policies.set(policy_id, constraints);
    logger.info('Custom policy added', { policy_id, constraint_count: constraints.length });
  }
}

// ── Ethical AI Verification ───────────────────────────────────────────────────

export type EthicalCategory =
  | 'privacy' | 'transparency' | 'fairness' | 'accountability' | 'safety'
  | 'autonomy' | 'islamic_ethics' | 'anti_surveillance' | 'community_first' | 'no_military_use';

export type ComplianceLevel =
  | 'non_compliant' | 'basic' | 'standard' | 'advanced' | 'exemplary' | 'platinum';

export type CertificationBadge =
  | 'ethical_ai' | 'privacy_first' | 'islamic_ethics' | 'community_trusted';

export interface EthicalPrincipleResult {
  principle: string;
  score: number;          // 0.0-1.0
  passed: boolean;
  evidence: string[];
}

export interface EthicalCategoryResult {
  category: EthicalCategory;
  score: number;          // weighted average of principles
  principles: EthicalPrincipleResult[];
  weight: number;         // relative weight in overall score
}

export interface EthicalBadge {
  type: CertificationBadge;
  level: ComplianceLevel;
  issued_at: number;      // Unix ms
  expires_at: number;     // Unix ms (+1 year)
  score: number;
}

export interface EthicalComplianceReport {
  provider_id: string;
  provider_name: string;
  overall_score: number;           // 0.0-1.0
  compliance_level: ComplianceLevel;
  ccl_level: number;               // 0-5, mapped from risk_score (1 - overall_score)
  categories: EthicalCategoryResult[];
  badges: EthicalBadge[];
  critical_issues: string[];
  recommendations: string[];
  verified_at: number;
}

/**
 * Ethical AI Verifier
 *
 * Verifies AI providers/systems against 10 ethical categories including
 * Islamic AI Ethics (Maqasid al-Shariah), privacy-first principles,
 * anti-surveillance, and community-first values.
 *
 * Issues certification badges at 5 compliance levels.
 * Additive to ConstitutionalAIValidator — zero regression.
 */
export class EthicalAIVerifier {
  private readonly _weights: Record<EthicalCategory, number> = {
    privacy:           1.5,
    transparency:      1.0,
    fairness:          1.2,
    accountability:    1.0,
    safety:            1.3,
    autonomy:          1.0,
    islamic_ethics:    1.1,
    anti_surveillance: 1.4,
    community_first:   0.8,
    no_military_use:   1.3,
  };

  private readonly _principles: Record<EthicalCategory, string[]> = {
    privacy: [
      'privacy_first_design',
      'no_training_on_user_data',
      'data_minimization',
      'strong_encryption',
    ],
    transparency: [
      'model_transparency',
      'decision_explainability',
      'bias_disclosure',
    ],
    fairness: [
      'non_discrimination',
      'equal_access',
      'cultural_sensitivity',
    ],
    accountability: [
      'human_oversight',
      'incident_response',
      'audit_trails',
    ],
    safety: [
      'harm_prevention',
      'content_safety',
      'security_testing',
    ],
    autonomy: [
      'informed_consent',
      'user_control',
      'opt_out_rights',
    ],
    islamic_ethics: [
      'preservation_of_life',
      'preservation_of_religion',
      'preservation_of_intellect',
      'preservation_of_lineage',
      'preservation_of_property',
      'preservation_of_dignity',
    ],
    anti_surveillance: [
      'no_mass_surveillance',
      'no_government_contracts',
      'resistance_technology',
    ],
    community_first: [
      'community_benefit',
      'marginalized_voices',
      'open_source_commitment',
    ],
    no_military_use: [
      'no_military_contracts',
      'no_weaponization',
    ],
  };

  /**
   * Verify an AI provider/system against all ethical principles.
   *
   * @param providerId  Unique identifier for this provider
   * @param providerName  Human-readable name
   * @param attestations  Self-attestation map: {principle_name: boolean | string}
   * @param technicalEvidence  Optional technical audit evidence
   */
  verify(
    providerId: string,
    providerName: string,
    attestations: Record<string, unknown> = {},
    technicalEvidence: Record<string, unknown> = {}
  ): EthicalComplianceReport {
    const categoryResults: EthicalCategoryResult[] = [];
    const criticalIssues: string[] = [];

    for (const [cat, principles] of Object.entries(this._principles)) {
      const category = cat as EthicalCategory;
      const principleResults: EthicalPrincipleResult[] = principles.map(p => {
        const attestation = attestations[p];
        let score = 0.5; // default: unknown
        const evidence: string[] = [];

        if (typeof attestation === 'boolean') {
          score = attestation ? 1.0 : 0.0;
          evidence.push(attestation ? 'self_attestation:pass' : 'self_attestation:fail');
        } else if (typeof attestation === 'number') {
          score = Math.min(1.0, Math.max(0.0, attestation));
          evidence.push(`self_attestation:score=${score}`);
        }

        // Supplement with technical evidence
        const techScore = technicalEvidence[p];
        if (typeof techScore === 'number') {
          score = (score + Math.min(1.0, Math.max(0.0, techScore))) / 2;
          evidence.push(`technical:score=${techScore}`);
        }

        // Critical: no_military_use and anti_surveillance failures are blocking
        if ((category === 'no_military_use' || category === 'anti_surveillance') && score < 0.3) {
          criticalIssues.push(`CRITICAL: ${category}.${p} failed (score=${score.toFixed(2)})`);
        }

        return { principle: p, score, passed: score >= 0.5, evidence };
      });

      const categoryScore = principleResults.reduce((sum, r) => sum + r.score, 0) / principleResults.length;
      categoryResults.push({
        category,
        score: categoryScore,
        principles: principleResults,
        weight: this._weights[category],
      });
    }

    // Weighted overall score
    const totalWeight = Object.values(this._weights).reduce((a, b) => a + b, 0);
    const overallScore = categoryResults.reduce(
      (sum, c) => sum + c.score * c.weight, 0
    ) / totalWeight;

    // Compliance level
    let complianceLevel: ComplianceLevel;
    if (criticalIssues.length > 0) {
      complianceLevel = 'non_compliant';
    } else if (overallScore >= 0.95) {
      complianceLevel = 'platinum';
    } else if (overallScore >= 0.85) {
      complianceLevel = 'exemplary';
    } else if (overallScore >= 0.75) {
      complianceLevel = 'advanced';
    } else if (overallScore >= 0.65) {
      complianceLevel = 'standard';
    } else if (overallScore >= 0.5) {
      complianceLevel = 'basic';
    } else {
      complianceLevel = 'non_compliant';
    }

    // CCL level from risk (1 - score)
    const riskScore = 1.0 - overallScore;
    const cclLevel = Math.min(5, Math.floor(riskScore * 5.5));

    // Issue badges
    const badges: EthicalBadge[] = [];
    const now = Date.now();
    const oneYear = 365 * 24 * 60 * 60 * 1000;

    if (complianceLevel !== 'non_compliant' && complianceLevel !== 'basic') {
      badges.push({ type: 'ethical_ai', level: complianceLevel, issued_at: now, expires_at: now + oneYear, score: overallScore });
    }
    const privacyCat = categoryResults.find(c => c.category === 'privacy');
    if (privacyCat && privacyCat.score >= 0.8) {
      badges.push({ type: 'privacy_first', level: complianceLevel, issued_at: now, expires_at: now + oneYear, score: privacyCat.score });
    }
    const islamicCat = categoryResults.find(c => c.category === 'islamic_ethics');
    if (islamicCat && islamicCat.score >= 0.75) {
      badges.push({ type: 'islamic_ethics', level: complianceLevel, issued_at: now, expires_at: now + oneYear, score: islamicCat.score });
    }
    const communityCat = categoryResults.find(c => c.category === 'community_first');
    if (communityCat && communityCat.score >= 0.7) {
      badges.push({ type: 'community_trusted', level: complianceLevel, issued_at: now, expires_at: now + oneYear, score: communityCat.score });
    }

    // Recommendations
    const recommendations: string[] = [];
    for (const cat of categoryResults) {
      if (cat.score < 0.65) {
        const failing = cat.principles.filter(p => !p.passed).map(p => p.principle);
        recommendations.push(`Improve ${cat.category}: address ${failing.join(', ')}`);
      }
    }
    if (overallScore < 0.5) {
      recommendations.push('Overall score below threshold: comprehensive ethics review required');
    }

    logger.info('Ethical AI verification complete', {
      provider_id: providerId,
      compliance_level: complianceLevel,
      overall_score: overallScore.toFixed(3),
      badge_count: badges.length,
    });

    return {
      provider_id: providerId,
      provider_name: providerName,
      overall_score: overallScore,
      compliance_level: complianceLevel,
      ccl_level: cclLevel,
      categories: categoryResults,
      badges,
      critical_issues: criticalIssues,
      recommendations,
      verified_at: now,
    };
  }
}

// ── End Ethical AI Verification ────────────────────────────────────────────────
