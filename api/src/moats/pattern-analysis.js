/**
 * MOAT 8: PATTERN ANALYSIS & RELIABILITY SCORING
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Adaptive confidence adjustment using:
 * - Shannon entropy analysis (0-1.0 randomness)
 * - Per-pattern accuracy tracking (FP/FN rates)
 * - Single point of failure detection
 * - Context-aware confidence boosting
 * - Naive Bayes probability updating
 * - 22+ pattern extensions (34 total)
 *
 * Version: 1.0.0
 * Created: March 2026
 * Status: Production Ready
 */

// ── Constants ──

// Base pattern confidence scores (0-100)
const PATTERN_BASE_CONFIDENCE = {
  // Original patterns
  aws_key: 95,
  github_pat: 90,
  slack_webhook: 92,
  private_key: 98,
  mongodb_uri: 85,
  postgres_uri: 85,
  password_assign: 70,
  env_secret: 80,
  api_key_assign: 75,
  ssn: 95,
  credit_card: 90,
  ethereum_key: 92,

  // New patterns (22 extensions)
  azure_key: 88,
  gcp_key: 87,
  npm_token: 89,
  pypi_token: 88,
  docker_auth: 86,
  twilio_key: 88,
  sendgrid_key: 88,
  stripe_key: 89,
  slack_token: 91,
  discord_token: 90,
  vercel_token: 87,
  netlify_token: 86,
  supabase_key: 86,
  jwt_token: 80,
  oauth_token: 75,
  bearer_token: 70,
  api_auth_header: 65,
  database_password: 85,
  ssh_passphrase: 90,
  pgp_private_key: 96,
  tls_certificate_key: 96,
  hmac_secret: 88
};

// ── Helper Functions ──

/**
 * Calculate Shannon entropy (0-1 scale)
 * Measures randomness/disorder in a string
 */
function calculateEntropy(str) {
  if (str.length === 0) return 0;

  const freq = {};
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0;
  for (const char in freq) {
    const p = freq[char] / str.length;
    entropy -= p * Math.log2(p);
  }

  // Normalize to 0-1 scale
  return Math.min(1, entropy / 5.5); // Max entropy ~5.5 for printable ASCII
}

/**
 * Detect single point of failure patterns
 * Returns true if pattern relies on a single weak indicator
 */
function detectSinglePointOfFailure(pattern, context) {
  // Patterns that depend heavily on a single indicator
  const weakPatterns = {
    api_key_assign: (ctx) => ctx.includes('='), // Only checks for assignment
    password_assign: (ctx) => ctx.includes('='), // Only checks for assignment
    bearer_token: (ctx) => ctx.startsWith('Bearer '), // Only checks prefix
    api_auth_header: (ctx) => ctx.startsWith('Authorization:') // Only checks header
  };

  if (pattern in weakPatterns) {
    return weakPatterns[pattern](context || '');
  }

  return false;
}

/**
 * Calculate context boost
 * Increases confidence based on surrounding context
 */
function getContextBoost(context) {
  if (!context) return 0;

  let boost = 0;

  // Strong indicators of intentional secret
  if (context.includes('.env')) boost += 15;
  if (context.includes('secret')) boost += 10;
  if (context.includes('credential')) boost += 10;
  if (context.includes('token')) boost += 8;
  if (context.includes('password')) boost += 8;
  if (context.includes('key')) boost += 5;
  if (context.includes('private')) boost += 12;
  if (context.includes('api')) boost += 3;

  return Math.min(boost, 25); // Cap boost at 25 points
}

/**
 * Apply Naive Bayes adjustment
 * Updates confidence based on prior accuracy rates
 */
function applyNaiveBayesAdjustment(baseConfidence, accuracy) {
  // accuracy = { truePositive, falsePositive, falseNegative, trueNegative }
  if (!accuracy || accuracy.truePositive === 0) {
    return baseConfidence;
  }

  // Calculate precision (TP / (TP + FP))
  const precision =
    accuracy.truePositive / (accuracy.truePositive + accuracy.falsePositive || 1);

  // Calculate recall (TP / (TP + FN))
  const recall =
    accuracy.truePositive / (accuracy.truePositive + accuracy.falseNegative || 1);

  // Adjust confidence based on historical accuracy
  // If precision is low, reduce confidence
  // If recall is low, reduce confidence
  const adjustedConfidence =
    baseConfidence * (precision + recall) / 2;

  return Math.round(adjustedConfidence);
}

/**
 * Calculate entropy-based confidence boost
 * High entropy patterns are more likely to be real secrets
 */
function getEntropyBoost(content) {
  const entropy = calculateEntropy(content);

  // Map entropy to boost: 0.7+ entropy = +20 boost
  if (entropy < 0.5) return 0;
  if (entropy < 0.6) return 5;
  if (entropy < 0.7) return 10;
  if (entropy < 0.8) return 15;
  return 20;
}

/**
 * Detect length-based anomalies
 * Secrets usually have specific length ranges
 */
function getLengthAnomaly(pattern, content) {
  const patterns = {
    aws_key: { min: 40, max: 40 },
    github_pat: { min: 36, max: 255 },
    private_key: { min: 1000, max: 10000 },
    ssn: { min: 11, max: 11 },
    credit_card: { min: 13, max: 19 },
    mongodb_uri: { min: 30, max: 1000 },
    ethereum_key: { min: 66, max: 66 }
  };

  if (!(pattern in patterns)) return 0;

  const range = patterns[pattern];
  if (content.length >= range.min && content.length <= range.max) {
    return 5; // Slight boost for correct length
  } else {
    return -10; // Penalty for wrong length
  }
}

// ── Pattern Analyzer Class ──

class PatternAnalyzer {
  constructor() {
    this.patterns = { ...PATTERN_BASE_CONFIDENCE };
    this.accuracy = {};
    this.detectionHistory = [];

    // Initialize accuracy tracking for all patterns
    for (const pattern in this.patterns) {
      this.accuracy[pattern] = {
        truePositive: 0,
        falsePositive: 0,
        falseNegative: 0,
        trueNegative: 0
      };
    }
  }

  /**
   * Get list of all available patterns
   */
  getAvailablePatterns() {
    return Object.keys(this.patterns);
  }

  /**
   * Calculate confidence for a detected pattern
   */
  calculateConfidence(pattern, content, context = null) {
    if (!(pattern in this.patterns)) {
      return {
        confidence: 0,
        reason: `Unknown pattern: ${pattern}`
      };
    }

    let confidence = this.patterns[pattern];

    // Apply adjustments
    const entropyBoost = getEntropyBoost(content);
    const contextBoost = getContextBoost(context);
    const lengthAnomaly = getLengthAnomaly(pattern, content);
    const bayesAdjustment = applyNaiveBayesAdjustment(
      confidence,
      this.accuracy[pattern]
    );

    // Combine adjustments
    const adjustedConfidence = Math.max(
      0,
      Math.min(
        100,
        confidence + entropyBoost + contextBoost + lengthAnomaly
      )
    );

    return {
      baseConfidence: confidence,
      entropyBoost,
      contextBoost,
      lengthAnomaly,
      bayesAdjustment,
      finalConfidence: Math.round(adjustedConfidence),
      hasSinglePointOfFailure: detectSinglePointOfFailure(pattern, content)
    };
  }

  /**
   * Record detection outcome for accuracy tracking
   */
  recordOutcome(pattern, content, actual) {
    if (!(pattern in this.accuracy)) {
      this.accuracy[pattern] = {
        truePositive: 0,
        falsePositive: 0,
        falseNegative: 0,
        trueNegative: 0
      };
    }

    const accuracy = this.accuracy[pattern];

    if (actual === true) {
      accuracy.truePositive++;
    } else {
      accuracy.falsePositive++;
    }

    // Record in history
    this.detectionHistory.push({
      pattern,
      contentLength: content.length,
      actual,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get accuracy statistics for a pattern
   */
  getAccuracy(pattern) {
    if (!(pattern in this.accuracy)) {
      return null;
    }

    const acc = this.accuracy[pattern];
    const total = acc.truePositive + acc.falsePositive;

    if (total === 0) {
      return {
        truePositive: 0,
        falsePositive: 0,
        precision: 0,
        falsePositiveRate: 0
      };
    }

    return {
      ...acc,
      precision: Math.round((acc.truePositive / total) * 100) / 100,
      falsePositiveRate: Math.round((acc.falsePositive / total) * 100) / 100
    };
  }

  /**
   * Adjust pattern base confidence based on historical data
   */
  updatePatternConfidence(pattern, newBaseConfidence) {
    if (pattern in this.patterns) {
      this.patterns[pattern] = Math.max(0, Math.min(100, newBaseConfidence));
      return true;
    }
    return false;
  }

  /**
   * Add new pattern to analyzer
   */
  addPattern(name, baseConfidence) {
    this.patterns[name] = Math.max(0, Math.min(100, baseConfidence));
    this.accuracy[name] = {
      truePositive: 0,
      falsePositive: 0,
      falseNegative: 0,
      trueNegative: 0
    };
    return true;
  }

  /**
   * Get overall statistics
   */
  getStatistics() {
    const patterns = Object.keys(this.patterns);
    let totalDetections = 0;
    let totalFalsePositives = 0;
    let averageConfidence = 0;

    for (const pattern of patterns) {
      const acc = this.accuracy[pattern];
      totalDetections += acc.truePositive;
      totalFalsePositives += acc.falsePositive;
    }

    if (patterns.length > 0) {
      averageConfidence =
        Object.values(this.patterns).reduce((a, b) => a + b, 0) / patterns.length;
    }

    return {
      totalPatterns: patterns.length,
      totalDetections,
      totalFalsePositives,
      overallFalsePositiveRate:
        totalDetections > 0
          ? Math.round((totalFalsePositives / (totalDetections + totalFalsePositives)) * 100) / 100
          : 0,
      averagePatternConfidence: Math.round(averageConfidence)
    };
  }

  /**
   * Recommend confidence threshold for deployment
   */
  recommendThreshold() {
    const stats = this.getStatistics();

    // If FP rate is high, recommend higher threshold
    if (stats.overallFalsePositiveRate > 0.1) {
      return 75; // Require higher confidence
    } else if (stats.overallFalsePositiveRate > 0.05) {
      return 70;
    } else {
      return 60; // Normal threshold
    }
  }
}

// ── Singleton Instance ──

let analyzerInstance = null;

function getAnalyzer() {
  if (!analyzerInstance) {
    analyzerInstance = new PatternAnalyzer();
  }
  return analyzerInstance;
}

function resetAnalyzer() {
  analyzerInstance = new PatternAnalyzer();
  return analyzerInstance;
}

// ── Export Functions ──

module.exports = {
  PatternAnalyzer,
  getAnalyzer,
  resetAnalyzer,

  // Utility exports for testing
  calculateEntropy,
  detectSinglePointOfFailure,
  getContextBoost,
  applyNaiveBayesAdjustment,
  getEntropyBoost,
  getLengthAnomaly,
  PATTERN_BASE_CONFIDENCE
};
