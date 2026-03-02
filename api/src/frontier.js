/**
 * Frontier Engine - Shared JS Helper Module
 * Pure JavaScript implementation of GenAI Detection
 * Used by: worker.js, constitutional-ai validator, VS Code extension, Node SDK
 *
 * No external dependencies - stdlib only
 */

/**
 * Calculate Shannon entropy of text (bits per character)
 * Human text: typically 4-5 bits/char
 * AI text: typically 4.8-5.6 bits/char (more uniform)
 * @param {string} text
 * @returns {number} Entropy in bits (0-8)
 */
function calculateEntropy(text) {
  if (!text || text.length < 2) return 0.0;

  const freq = {};
  for (const char of text.toLowerCase()) {
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0.0;
  const total = text.length;
  for (const count of Object.values(freq)) {
    const probability = count / total;
    if (probability > 0) {
      entropy -= probability * Math.log2(probability);
    }
  }

  return entropy;
}

/**
 * Calculate perplexity (2^entropy)
 * @param {string} text
 * @returns {number} Approximate perplexity
 */
function calculatePerplexity(text) {
  const entropy = calculateEntropy(text);
  return entropy > 0 ? Math.pow(2, entropy) : 1.0;
}

/**
 * Detect AI generator marker phrases in text
 * Returns generator name if detected with phrase markers
 * @param {string} text
 * @returns {{ generator: string|null, markerCount: number }}
 */
function detectAIMarkers(text) {
  const markers = {
    'gpt-4': [
      /\bas\s+(?:you|a)/i,
      /certainly\b/i,
      /please\s+note/i,
      /\.(?:\s+it\s+is\s+worth)/i,
      /think\s+about\s+it/i,
    ],
    'claude': [
      /i\'d\s+be\s+happy/i,
      /fascinating\s+(?:question|topic)/i,
      /\bnuance\b/i,
      /context\s+is\s+key/i,
      /let\s+me\s+explore/i,
    ],
    'gemini': [
      /helpful\s+(?:information|response)/i,
      /dive\s+(?:into|deeper)/i,
      /comprehensive\s+(?:overview|guide)/i,
      /looking\s+at\s+/i,
      /point\s+out\b/i,
    ],
    'llama': [
      /provide\s+(?:a|an)\s+(?:answer|response)/i,
      /step\s+by\s+step/i,
      /following\s+(?:steps|points)/i,
      /above\s+mentioned/i,
      /hope\s+this\s+helps/i,
    ],
  };

  let bestGenerator = null;
  let maxMarkers = 0;

  for (const [generator, patterns] of Object.entries(markers)) {
    let count = 0;
    for (const pattern of patterns) {
      if (pattern.test(text)) count++;
    }
    if (count > maxMarkers) {
      maxMarkers = count;
      bestGenerator = generator;
    }
  }

  return { generator: bestGenerator, markerCount: maxMarkers };
}

/**
 * Calculate lexical diversity (vocabulary richness)
 * Type-Token Ratio: unique_words / total_words
 * @param {string} text
 * @returns {number} Diversity score (0-1)
 */
function calculateLexicalDiversity(text) {
  const words = text.match(/\b\w+\b/g) || [];
  if (words.length === 0) return 0.0;

  const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
  return uniqueWords / words.length;
}

/**
 * Calculate average words per sentence
 * @param {string} text
 * @returns {number} Average words per sentence
 */
function calculateSentenceComplexity(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return 0.0;

  let totalWords = 0;
  for (const sentence of sentences) {
    const words = sentence.match(/\b\w+\b/g) || [];
    totalWords += words.length;
  }

  return totalWords / sentences.length;
}

/**
 * Measure burstiness (tendency toward word repetition clusters)
 * Low burstiness: evenly distributed (human text)
 * High burstiness: clustered repetition (AI text)
 * @param {string} text
 * @returns {number} Burstiness score (0-1)
 */
function calculateBurstiness(text) {
  const words = text.match(/\b\w+\b/g) || [];
  if (words.length < 10) return 0.0;

  const windowSize = 10;
  let burstCount = 0;

  for (let i = 0; i < words.length - windowSize; i++) {
    const window = words.slice(i, i + windowSize);
    const uniqueCount = new Set(window.map(w => w.toLowerCase())).size;
    // Low diversity in window = burst
    if (uniqueCount < 6) {
      burstCount++;
    }
  }

  return Math.min(1.0, burstCount / Math.max(1, words.length - windowSize));
}

/**
 * Frontier score for text (GenAI detection)
 * Returns comprehensive detection result
 * @param {string} text
 * @returns {{
 *   confidence: number,
 *   generator: string|null,
 *   entropy: number,
 *   perplexity: number,
 *   diversity: number,
 *   complexity: number,
 *   burstiness: number,
 *   markerCount: number
 * }}
 */
function frontierScore(text) {
  // Minimum text length check
  if (!text || text.length < 50) {
    return {
      confidence: 0.0,
      generator: null,
      entropy: 0.0,
      perplexity: 1.0,
      diversity: 0.0,
      complexity: 0.0,
      burstiness: 0.0,
      markerCount: 0,
    };
  }

  // Calculate metrics
  const entropy = calculateEntropy(text);
  const perplexity = calculatePerplexity(text);
  const diversity = calculateLexicalDiversity(text);
  const complexity = calculateSentenceComplexity(text);
  const burstiness = calculateBurstiness(text);
  const { generator, markerCount } = detectAIMarkers(text);

  // Base confidence: entropy in AI range?
  let baseConfidence = entropy > 4.5 ? 0.3 : 0.1;

  // Adjust for lexical diversity (AI uses more diverse vocabulary)
  if (diversity > 0.6) {
    baseConfidence += 0.2;
  } else {
    baseConfidence -= 0.1;
  }

  // Sentence complexity (AI uses longer sentences)
  if (complexity > 15) {
    baseConfidence += 0.1;
  }

  // Burstiness (human text has less burst)
  if (burstiness < 0.3) {
    baseConfidence += 0.1;
  }

  // Generator-specific scoring
  let generatorScore = 0.0;
  if (generator) {
    // Entropy match (40% weight)
    const entropyRanges = {
      'gpt-4': [4.8, 5.5],
      'claude': [5.0, 5.6],
      'gemini': [4.7, 5.4],
      'llama': [4.5, 5.2],
    };

    const [minE, maxE] = entropyRanges[generator] || [4.5, 5.5];
    if (entropy >= minE && entropy <= maxE) {
      generatorScore += 0.4;
    }

    // Perplexity match (40% weight)
    const perplexityRanges = {
      'gpt-4': [30, 45],
      'claude': [32, 50],
      'gemini': [28, 42],
      'llama': [25, 38],
    };

    const [minP, maxP] = perplexityRanges[generator] || [25, 50];
    if (perplexity >= minP && perplexity <= maxP) {
      generatorScore += 0.4;
    }

    // Phrase markers (20% weight)
    if (markerCount > 0) {
      generatorScore += Math.min(0.2, markerCount * 0.05);
    }
  }

  // Final confidence
  let finalConfidence = Math.min(0.95, baseConfidence + generatorScore * 0.3);

  return {
    confidence: finalConfidence,
    generator: generator,
    entropy: entropy,
    perplexity: perplexity,
    diversity: diversity,
    complexity: complexity,
    burstiness: burstiness,
    markerCount: markerCount,
  };
}

/**
 * Lightweight GenAI detection wrapper (for backward compatibility)
 * Returns simple true/false for AI generation
 * @param {string} text
 * @param {number} threshold - Confidence threshold (default 0.6)
 * @returns {{ isAI: boolean, confidence: number, generator: string|null }}
 */
function detectAI(text, threshold = 0.6) {
  const score = frontierScore(text);
  return {
    isAI: score.confidence > threshold,
    confidence: score.confidence,
    generator: score.generator,
  };
}

// Export for CommonJS/Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateEntropy,
    calculatePerplexity,
    detectAIMarkers,
    calculateLexicalDiversity,
    calculateSentenceComplexity,
    calculateBurstiness,
    frontierScore,
    detectAI,
  };
}

// Export for browser/ES6 modules (for testing/webpack)
if (typeof exports !== 'undefined') {
  Object.assign(exports, {
    calculateEntropy,
    calculatePerplexity,
    detectAIMarkers,
    calculateLexicalDiversity,
    calculateSentenceComplexity,
    calculateBurstiness,
    frontierScore,
    detectAI,
  });
}
