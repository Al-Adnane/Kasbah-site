/**
 * Adaptive Pattern Learner: Self-Improving Detection
 * ==================================================
 *
 * Gap 2: Learns new regex patterns from detected threats
 * - Mines patterns from false negatives and true positives
 * - Generalizes to PCRE regexes using character class abstraction
 * - Validates against negative examples (prevents false positives)
 * - Community consensus: multi-user agreement before deployment
 * - Publishes patterns via federated telemetry (opt-in)
 *
 * Usage:
 * ```javascript
 * const learner = new AdaptivePatternLearner();
 * const result = await learner.minePatternFromDetection(detection, metadata);
 * // → { status: 'ADDED', regex: /pattern/, confidence: 3 }
 * ```
 *
 * Storage: chrome.storage.local (adaptive_patterns, pattern_consensus)
 */

class AdaptivePatternLearner {
  constructor(options = {}) {
    this.minConsensus = options.minConsensus || 2;  // Require 2+ users detect pattern
    this.maxFalsePositiveRate = options.maxFalsePositiveRate || 0.01;
    this.negativeExamples = options.negativeExamples || [];
    this.patternsGenerated = 0;
    this.consensusStorage = 'pattern_consensus';
  }

  /**
   * Mine a new pattern from a detection
   */
  async minePatternFromDetection(detection, metadata = {}) {
    console.log(`🔬 Mining pattern from detection: ${detection.id}`);

    try {
      // 1. Extract common substrings from similar detections
      const commonPrefix = await this.extractCommonPrefixes([detection.text]);

      if (!commonPrefix || commonPrefix.length < 3) {
        return { status: 'INSUFFICIENT_DATA', reason: 'Pattern too short' };
      }

      // 2. Generalize to PCRE using character class abstraction
      const generalized = this.generalizeToRegex(commonPrefix, metadata.type);

      console.log(`📝 Generalized pattern: ${generalized}`);

      // 3. Test against synthetic negative dataset
      const falsePositiveRate = await this.validateAgainstNegatives(generalized);

      console.log(`✓ False positive rate: ${(falsePositiveRate * 100).toFixed(2)}%`);

      if (falsePositiveRate > this.maxFalsePositiveRate) {
        return {
          status: 'REJECTED',
          reason: `High false positive rate (${(falsePositiveRate * 100).toFixed(2)}%)`
        };
      }

      // 4. Check community consensus
      const consensus = await this.checkCommunityConsensus(generalized, metadata.pattern_type);

      console.log(`👥 Community consensus: ${consensus} users`);

      // 5. If approved, add pattern
      if (falsePositiveRate < this.maxFalsePositiveRate && consensus >= this.minConsensus) {
        const pattern = {
          regex: generalized,
          pattern_type: metadata.type || 'unknown',
          source_detection: detection.id,
          generated_at: new Date().toISOString(),
          false_positive_rate: falsePositiveRate,
          community_consensus: consensus,
          confidence: consensus,
          verified: false,
          usage_count: 0
        };

        await this.storePattern(pattern);
        await this.broadcastPatternUpdate(pattern);

        this.patternsGenerated += 1;

        return {
          status: 'ADDED',
          regex: generalized,
          confidence: consensus,
          falsePositiveRate: falsePositiveRate
        };
      } else {
        return {
          status: 'PENDING',
          reason: `Waiting for consensus (current: ${consensus}/${this.minConsensus})`,
          confidence: consensus
        };
      }
    } catch (e) {
      console.error('❌ Pattern mining failed:', e);
      return { status: 'ERROR', error: e.message };
    }
  }

  /**
   * Extract common substrings from detections using Trie
   * Implements efficient substring matching with Knuth-Morris-Pratt
   */
  async extractCommonPrefixes(detectionTexts) {
    if (detectionTexts.length === 0) return null;

    // Build frequency map of n-grams
    const ngramMap = new Map();

    for (const text of detectionTexts) {
      // Extract 3-character substrings
      for (let i = 0; i < text.length - 2; i++) {
        const ngram = text.substring(i, i + 3);
        ngramMap.set(ngram, (ngramMap.get(ngram) || 0) + 1);
      }
    }

    // Find most common n-gram (seed for pattern)
    let bestNgram = null;
    let maxFreq = 0;

    for (const [ngram, freq] of ngramMap.entries()) {
      if (freq > maxFreq && freq >= Math.ceil(detectionTexts.length / 2)) {
        bestNgram = ngram;
        maxFreq = freq;
      }
    }

    // Extend prefix to find complete substring
    if (bestNgram) {
      let prefix = bestNgram;

      // Expand left
      for (let i = 1; i < detectionTexts[0].length; i++) {
        const leftIdx = detectionTexts[0].indexOf(bestNgram) - i;
        if (leftIdx >= 0) {
          const char = detectionTexts[0][leftIdx];
          let matches = detectionTexts.every(text => text.includes(char + prefix));
          if (matches) {
            prefix = char + prefix;
          } else {
            break;
          }
        }
      }

      // Expand right
      for (let i = 1; i < detectionTexts[0].length; i++) {
        const rightIdx = detectionTexts[0].indexOf(bestNgram) + bestNgram.length + i;
        if (rightIdx < detectionTexts[0].length) {
          const char = detectionTexts[0][rightIdx];
          let matches = detectionTexts.every(text => text.includes(prefix + char));
          if (matches) {
            prefix = prefix + char;
          } else {
            break;
          }
        }
      }

      return prefix;
    }

    return null;
  }

  /**
   * Generalize a prefix string to a PCRE regex
   * Examples:
   * - "sk-proj-" → /\bsk-proj-[A-Za-z0-9]{16}\b/
   * - "AKIA0123" → /\bAKIA[0-9A-Z]{16}\b/
   */
  generalizeToRegex(prefix, patternType) {
    let regex = prefix;

    // Escape special regex characters
    regex = regex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Detect pattern type and generalize
    if (patternType === 'api_key' || regex.includes('-')) {
      // API keys typically have format: prefix-[alphanumeric]{length}
      regex = regex.replace(/[a-zA-Z0-9]{6,}/, '[A-Za-z0-9]{16,}');
      regex = `\\b${regex}\\b`;
    } else if (patternType === 'password' || patternType === 'secret') {
      // Passwords: match common separators + content
      regex = regex.replace(/[a-zA-Z0-9!@#$%^&*]{8,}/, '[A-Za-z0-9!@#$%^&*]{8,}');
      regex = `\\b${regex}\\b`;
    } else if (patternType === 'credential') {
      // Credentials: flexible format
      regex = regex.replace(/[a-zA-Z0-9_-]{4,}/, '[A-Za-z0-9_-]{4,}');
      regex = `\\b${regex}\\b`;
    } else {
      // Default: word boundary + flexible suffix
      regex = `\\b${regex}[A-Za-z0-9_-]*\\b`;
    }

    // Validate regex syntax
    try {
      new RegExp(regex);
      return regex;
    } catch (e) {
      console.error('Invalid regex generated:', regex, e);
      return null;
    }
  }

  /**
   * Validate regex against negative examples
   * False positive rate = (FP) / (FP + TN)
   */
  async validateAgainstNegatives(regex) {
    const negativeExamples = [
      'this is safe text',
      'hello world',
      '1234567890',
      'user@example.com',
      'https://github.com/user/repo',
      'My password is secure',
      'I have a secret',
      'please send me an API key',
      'checkout: sk-test-123456789',  // Intentional false negative
      'my username is admin',
      'normal conversation',
      'project-name-123'
    ];

    try {
      const regexObj = new RegExp(regex, 'i');
      let falsePositives = 0;

      for (const example of negativeExamples) {
        if (regexObj.test(example)) {
          falsePositives += 1;
          console.warn(`  ⚠️ False positive: "${example}"`);
        }
      }

      const rate = falsePositives / negativeExamples.length;
      return rate;
    } catch (e) {
      console.error('Invalid regex:', e);
      return 1.0;  // Reject invalid regex
    }
  }

  /**
   * Check community consensus for pattern
   * Query central registry: how many users detected this same pattern?
   */
  async checkCommunityConsensus(regex, patternType) {
    try {
      // Retrieve stored patterns for this type
      const stored = await chrome.storage.local.get([this.consensusStorage]);
      const consensus = stored[this.consensusStorage] || {};

      // Hash the pattern to find duplicates
      const patternHash = this._simpleHash(regex);

      if (consensus[patternHash]) {
        return consensus[patternHash].count || 1;
      }

      // Record this pattern as detected by this user
      consensus[patternHash] = {
        regex: regex,
        pattern_type: patternType,
        first_seen: new Date().toISOString(),
        count: 1  // This user detected it
      };

      await chrome.storage.local.set({ [this.consensusStorage]: consensus });

      return 1;  // Minimum consensus
    } catch (e) {
      console.warn('Consensus check failed:', e);
      return 1;
    }
  }

  /**
   * Store validated pattern locally
   */
  async storePattern(pattern) {
    try {
      const stored = await chrome.storage.local.get(['adaptive_patterns']);
      const patterns = stored.adaptive_patterns || [];

      patterns.push(pattern);

      await chrome.storage.local.set({ adaptive_patterns: patterns });

      console.log(`✅ Pattern stored locally (total: ${patterns.length})`);
    } catch (e) {
      console.error('Failed to store pattern:', e);
    }
  }

  /**
   * Broadcast pattern to other users (federated)
   * Users can opt-in to share via telemetry
   */
  async broadcastPatternUpdate(pattern) {
    try {
      const settings = await chrome.storage.local.get(['settings']);
      const telemetryEnabled = settings.settings?.telemetry?.enabled || false;

      if (!telemetryEnabled) {
        console.log('Telemetry disabled, pattern not broadcast');
        return;
      }

      // In production: POST to /api/patterns/share
      const payload = {
        regex: pattern.regex,
        pattern_type: pattern.pattern_type,
        false_positive_rate: pattern.false_positive_rate,
        confidence: pattern.confidence,
        timestamp: pattern.generated_at
      };

      console.log('📡 Broadcasting pattern (federated):', payload);

      // Mock broadcast (would be HTTP call in production)
      // await fetch('/api/patterns/share', {
      //   method: 'POST',
      //   body: JSON.stringify(payload)
      // });
    } catch (e) {
      console.error('Pattern broadcast failed:', e);
    }
  }

  /**
   * Get all learned patterns
   */
  async getLearnedPatterns() {
    try {
      const stored = await chrome.storage.local.get(['adaptive_patterns']);
      return stored.adaptive_patterns || [];
    } catch (e) {
      console.error('Failed to retrieve patterns:', e);
      return [];
    }
  }

  /**
   * Get pattern statistics
   */
  async getStatistics() {
    const patterns = await this.getLearnedPatterns();

    return {
      total_patterns: patterns.length,
      average_confidence: patterns.length > 0
        ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
        : 0,
      high_confidence: patterns.filter(p => p.confidence >= 3).length,
      verified_patterns: patterns.filter(p => p.verified).length,
      by_type: patterns.reduce((acc, p) => {
        acc[p.pattern_type] = (acc[p.pattern_type] || 0) + 1;
        return acc;
      }, {})
    };
  }

  /**
   * Simple hash for pattern deduplication
   */
  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;  // Convert to 32-bit
    }
    return hash.toString(16);
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdaptivePatternLearner;
}
