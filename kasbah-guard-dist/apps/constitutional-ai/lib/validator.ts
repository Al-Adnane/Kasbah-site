/**
 * Constitutional AI Intent Validator
 *
 * Validates user intents against constitutional principles
 * using LLM-based reasoning + policy constraints
 */

import { logger } from './logger';

export interface ValidationResult {
  valid: boolean;
  risk_score: number; // 0.0-1.0
  reasoning: string;
  blocked_rules: string[];
  requires_approval: boolean;
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
    pattern: /ignore.*previous|forget|new instructions|role.*switch/i,
  },
  {
    rule_id: 'jailbreak_attempt',
    description: 'Jailbreak attempt detected',
    severity: 'critical',
    pattern: /jailbreak|bypass|circumvent|disable.*safety/i,
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
    context?: Record<string, unknown>
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
    const riskScore = Math.max(maxSeverityScore, heuristicRisk);

    const valid = riskScore < 0.5;
    const requiresApproval = riskScore >= 0.4;

    const reasoning = this.generateReasoning(blockedRules, riskScore, context);

    return {
      valid,
      risk_score: riskScore,
      reasoning,
      blocked_rules: blockedRules,
      requires_approval: requiresApproval,
    };
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
   * Calculate risk using heuristics
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

    return Math.min(risk, 0.5); // Cap at 0.5 for heuristics alone
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
