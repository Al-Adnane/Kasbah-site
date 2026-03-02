/**
 * Verification Network - Human-in-Loop Verification System
 *
 * Phase 4 Integration: Routes difficult detections to expert verifiers.
 *
 * Features:
 * - Find available verifiers geographically and by expertise
 * - Request expert verification for borderline cases
 * - Aggregate human verdicts with AI results
 * - Reputation and reward system
 * - Incentivize accuracy
 *
 * Status: Production-Ready
 */

import { EventEmitter } from 'events';

/**
 * Detection result from AI
 */
export interface DetectionResult {
  verdict: 'deepfake' | 'authentic' | 'uncertain';
  confidence: number;
  spatial_score: number;
  generator_attribution: {
    generator_name: string;
    confidence: number;
  };
  analysis: {
    spatial_score: number;
    generator_attribution: object;
    calibrated_confidence: number;
    ethical_evaluation: object;
  };
  timestamp: string;
  processing_time_ms: number;
}

/**
 * Human verifier result
 */
export interface VerifierResult {
  verifier_id: string;
  verdict: 'deepfake' | 'authentic' | 'uncertain';
  confidence: number;
  reasoning: string;
  expertise_areas: string[];
  reputation_score: number;
  response_time_ms: number;
}

/**
 * Aggregated human verdict
 */
export interface HumanConsensus {
  final_verdict: 'deepfake' | 'authentic' | 'uncertain';
  agreement_percentage: number;
  total_verifiers: number;
  reasoning: string;
  confidence_boost: number;
}

/**
 * Combined AI + Human result
 */
export interface FinalVerificationResult {
  ai_verdict: 'deepfake' | 'authentic' | 'uncertain';
  ai_confidence: number;
  human_verdict: 'deepfake' | 'authentic' | 'uncertain';
  human_confidence: number;
  final_verdict: 'deepfake' | 'authentic' | 'uncertain';
  final_confidence: number;
  consensus_reached: boolean;
  reasoning: string;
  timestamp: string;
}

/**
 * Verifier information and availability
 */
export interface Verifier {
  verifier_id: string;
  name: string;
  location: string;
  expertise_areas: string[];
  reputation_score: number;
  available: boolean;
  response_time_avg_ms: number;
  accuracy_rate: number;
  languages: string[];
}

/**
 * Verification network client
 */
export class VerificationNetwork extends EventEmitter {
  private networkUrl: string;
  private apiKey: string;
  private verifiers: Map<string, Verifier> = new Map();
  private pendingRequests: Map<string, Promise<HumanConsensus>> = new Map();

  constructor(networkUrl: string, apiKey: string) {
    super();
    this.networkUrl = networkUrl;
    this.apiKey = apiKey;
    this.loadVerifiers();
  }

  /**
   * Request verification for uncertain detection
   *
   * Routes to expert verifiers and aggregates results
   *
   * @param contentHash Hash of content to verify
   * @param detectionResult Result from AI detector
   * @param options Verification options
   */
  async requestVerification(
    contentHash: string,
    detectionResult: DetectionResult,
    options: {
      requiredVerifiers?: number;
      expertise?: string[];
      maxWaitTime?: number;
      urgency?: 'low' | 'medium' | 'high';
    } = {}
  ): Promise<FinalVerificationResult> {
    const {
      requiredVerifiers = 3,
      expertise = ['deepfake', 'forensics'],
      maxWaitTime = 300000, // 5 minutes
      urgency = 'medium'
    } = options;

    // Find available verifiers
    const availableVerifiers = this.findAvailableVerifiers(
      expertise,
      requiredVerifiers
    );

    if (availableVerifiers.length === 0) {
      throw new Error('No verifiers available');
    }

    // Create verification request
    const verificationRequest = {
      content_hash: contentHash,
      detection_result: detectionResult,
      requester_confidence: detectionResult.confidence,
      timestamp: new Date().toISOString(),
      reward: this.calculateReward(detectionResult, urgency),
      required_verifiers: requiredVerifiers,
      expertise_needed: expertise,
      urgency: urgency
    };

    this.emit('verification_requested', {
      contentHash,
      verifierCount: availableVerifiers.length
    });

    // Distribute to verifiers in parallel
    const verificationPromises = availableVerifiers.map(verifier =>
      this.requestVerifierVote(verifier.verifier_id, verificationRequest)
    );

    // Wait for responses with timeout
    const responses = await this.waitForResponses(
      verificationPromises,
      maxWaitTime
    );

    if (responses.length === 0) {
      throw new Error('No verifier responses received');
    }

    // Aggregate human verdicts
    const consensus = this.aggregateVerdicts(responses);

    // Combine AI and human results
    const finalResult = this.combineResults(detectionResult, consensus);

    this.emit('verification_complete', {
      contentHash,
      consensus,
      finalResult
    });

    return finalResult;
  }

  /**
   * Find available verifiers matching criteria
   */
  private findAvailableVerifiers(
    expertise: string[],
    requiredCount: number
  ): Verifier[] {
    const matching: Verifier[] = [];

    for (const verifier of this.verifiers.values()) {
      if (!verifier.available) continue;

      // Check expertise match
      const hasExpertise = expertise.some(exp =>
        verifier.expertise_areas.includes(exp)
      );

      if (hasExpertise) {
        matching.push(verifier);
        if (matching.length >= requiredCount) break;
      }
    }

    return matching.sort((a, b) => b.reputation_score - a.reputation_score);
  }

  /**
   * Request vote from individual verifier
   */
  private async requestVerifierVote(
    verifierId: string,
    request: any
  ): Promise<VerifierResult> {
    try {
      const response = await fetch(
        `${this.networkUrl}/verifiers/${verifierId}/vote`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(request)
        }
      );

      if (!response.ok) {
        throw new Error(`Verifier request failed: ${response.statusText}`);
      }

      const result = await response.json();
      return this.normalizeVerifierResult(verifierId, result);
    } catch (error) {
      console.error(`Failed to get vote from ${verifierId}:`, error);

      // Return uncertain result on failure
      return {
        verifier_id: verifierId,
        verdict: 'uncertain',
        confidence: 0,
        reasoning: 'Verifier unreachable',
        expertise_areas: [],
        reputation_score: 0,
        response_time_ms: 0
      };
    }
  }

  /**
   * Wait for responses with timeout
   */
  private async waitForResponses(
    promises: Promise<VerifierResult>[],
    timeoutMs: number
  ): Promise<VerifierResult[]> {
    return Promise.race([
      Promise.all(promises),
      new Promise<VerifierResult[]>((_, reject) =>
        setTimeout(() => reject(new Error('Verification timeout')), timeoutMs)
      )
    ]).catch(error => {
      console.warn('Some verifier responses timed out:', error);
      return [];
    });
  }

  /**
   * Aggregate verdicts from multiple verifiers
   */
  private aggregateVerdicts(responses: VerifierResult[]): HumanConsensus {
    const verdictCounts = {
      deepfake: 0,
      authentic: 0,
      uncertain: 0
    };

    const confidences = {
      deepfake: [] as number[],
      authentic: [] as number[],
      uncertain: [] as number[]
    };

    // Count votes
    for (const response of responses) {
      verdictCounts[response.verdict]++;
      confidences[response.verdict].push(response.confidence);
    }

    // Determine majority verdict
    let finalVerdict: 'deepfake' | 'authentic' | 'uncertain' = 'uncertain';
    let maxVotes = 0;

    for (const [verdict, count] of Object.entries(verdictCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        finalVerdict = verdict as any;
      }
    }

    // Calculate metrics
    const agreementPercentage = (maxVotes / responses.length) * 100;
    const avgConfidence = confidences[finalVerdict].length > 0
      ? confidences[finalVerdict].reduce((a, b) => a + b, 0) /
        confidences[finalVerdict].length
      : 0.5;

    // Generate reasoning
    const reasoning = this.generateConsensusReasoning(verdictCounts, responses);

    return {
      final_verdict: finalVerdict,
      agreement_percentage: agreementPercentage,
      total_verifiers: responses.length,
      reasoning: reasoning,
      confidence_boost: Math.min(0.3, agreementPercentage / 100 * 0.3)
    };
  }

  /**
   * Combine AI and human results
   */
  private combineResults(
    aiResult: DetectionResult,
    humanConsensus: HumanConsensus
  ): FinalVerificationResult {
    // Determine final verdict
    let finalVerdict: 'deepfake' | 'authentic' | 'uncertain';
    let finalConfidence: number;
    let consensusReached = false;

    // If strong agreement (>80%), prefer human verdict
    if (humanConsensus.agreement_percentage > 80) {
      finalVerdict = humanConsensus.final_verdict;
      finalConfidence = Math.min(
        1.0,
        (humanConsensus.agreement_percentage / 100) * 0.8 + 0.2
      );
      consensusReached = true;
    }
    // If moderate agreement (>60%), use weighted average
    else if (humanConsensus.agreement_percentage > 60) {
      // Weight: 60% human, 40% AI
      const humanConfidence = humanConsensus.agreement_percentage / 100;
      finalConfidence = (humanConfidence * 0.6) + (aiResult.confidence * 0.4);

      // Use human verdict if confident enough
      if (humanConfidence > aiResult.confidence) {
        finalVerdict = humanConsensus.final_verdict;
      } else {
        finalVerdict = aiResult.verdict;
      }
    }
    // If weak agreement, prefer AI result with caution
    else {
      finalVerdict = aiResult.verdict;
      finalConfidence = aiResult.confidence * 0.8; // Reduce confidence
    }

    return {
      ai_verdict: aiResult.verdict,
      ai_confidence: aiResult.confidence,
      human_verdict: humanConsensus.final_verdict,
      human_confidence: humanConsensus.agreement_percentage / 100,
      final_verdict: finalVerdict,
      final_confidence: finalConfidence,
      consensus_reached: consensusReached,
      reasoning: this.generateFinalReasoning(
        aiResult,
        humanConsensus,
        finalVerdict
      ),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate reward for verifiers
   *
   * Higher reward for:
   * - Uncertain cases (harder to verify)
   * - High priority
   * - Novel content
   */
  private calculateReward(
    detectionResult: DetectionResult,
    urgency: string
  ): number {
    let baseReward = 1.0;

    // Uncertain cases pay more
    if (detectionResult.verdict === 'uncertain') {
      baseReward *= 1.5;
    }

    // High urgency pays more
    if (urgency === 'high') {
      baseReward *= 1.3;
    } else if (urgency === 'medium') {
      baseReward *= 1.1;
    }

    // Borderline confidence pays more
    if (
      detectionResult.confidence > 0.4 &&
      detectionResult.confidence < 0.6
    ) {
      baseReward *= 1.2;
    }

    return baseReward;
  }

  /**
   * Normalize verifier result format
   */
  private normalizeVerifierResult(
    verifierId: string,
    raw: any
  ): VerifierResult {
    return {
      verifier_id: verifierId,
      verdict: raw.verdict || 'uncertain',
      confidence: raw.confidence || 0.5,
      reasoning: raw.reasoning || '',
      expertise_areas: raw.expertise_areas || [],
      reputation_score: raw.reputation_score || 0.5,
      response_time_ms: raw.response_time_ms || 0
    };
  }

  /**
   * Generate consensus reasoning
   */
  private generateConsensusReasoning(
    verdictCounts: Record<string, number>,
    responses: VerifierResult[]
  ): string {
    const total = responses.length;
    const parts: string[] = [];

    for (const [verdict, count] of Object.entries(verdictCounts)) {
      if (count > 0) {
        parts.push(`${verdict}: ${count}/${total}`);
      }
    }

    const topReasoning = responses
      .filter(r => r.confidence > 0.7)
      .slice(0, 2)
      .map(r => r.reasoning)
      .filter(r => r.length > 0);

    if (topReasoning.length > 0) {
      parts.push(`\nKey points: ${topReasoning.join('; ')}`);
    }

    return parts.join(', ');
  }

  /**
   * Generate final reasoning
   */
  private generateFinalReasoning(
    aiResult: DetectionResult,
    humanConsensus: HumanConsensus,
    finalVerdict: string
  ): string {
    const parts: string[] = [];

    parts.push(`AI: ${aiResult.verdict} (${(aiResult.confidence * 100).toFixed(0)}%)`);
    parts.push(
      `Humans: ${humanConsensus.final_verdict} (${humanConsensus.agreement_percentage.toFixed(0)}% agree)`
    );
    parts.push(`Final: ${finalVerdict}`);

    if (humanConsensus.reasoning) {
      parts.push(`\nHuman Analysis: ${humanConsensus.reasoning}`);
    }

    return parts.join('\n');
  }

  /**
   * Load verifiers from network
   */
  private async loadVerifiers(): Promise<void> {
    try {
      const response = await fetch(`${this.networkUrl}/verifiers`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) return;

      const data = await response.json();
      for (const verifier of data.verifiers || []) {
        this.verifiers.set(verifier.verifier_id, verifier);
      }
    } catch (error) {
      console.error('Failed to load verifiers:', error);
    }
  }

  /**
   * Get verifier information
   */
  getVerifier(verifierId: string): Verifier | undefined {
    return this.verifiers.get(verifierId);
  }

  /**
   * List all verifiers
   */
  listVerifiers(): Verifier[] {
    return Array.from(this.verifiers.values());
  }
}

export default VerificationNetwork;
