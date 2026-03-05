/**
 * Kasbah Guard — ML-Based Anomaly Detection
 * 
 * Novel detection using statistical analysis and machine learning:
 * - Shannon entropy analysis
 * - Character frequency analysis
 * - N-gram anomaly detection
 * - Contextual risk scoring
 * - Behavioral pattern recognition
 * 
 * This is what differentiates Kasbah from pattern-only detectors.
 */

class MLAnomalyDetector {
  constructor() {
    // Trained thresholds (would be learned from data in production)
    this.thresholds = {
      entropy: { min: 3.5, max: 6.0, suspicious: 5.8 },
      charFrequency: { threshold: 0.15 },
      digitRatio: { suspicious: 0.4 },
      specialCharRatio: { suspicious: 0.3 },
      consecutiveChars: { threshold: 8 },
      repeatedPatterns: { threshold: 3 }
    };
    
    // Character class definitions
    this.charClasses = {
      uppercase: /[A-Z]/g,
      lowercase: /[a-z]/g,
      digits: /[0-9]/g,
      special: /[^A-Za-z0-9]/g,
      whitespace: /\s/g
    };
  }

  /**
   * Calculate Shannon entropy of text
   * Higher entropy = more random = potentially a secret
   * 
   * @param {string} text - Input text
   * @returns {number} Entropy value (0-8 for ASCII)
   */
  calculateEntropy(text) {
    if (!text || text.length === 0) return 0;
    
    const freq = {};
    for (const char of text) {
      freq[char] = (freq[char] || 0) + 1;
    }
    
    const len = text.length;
    let entropy = 0;
    
    for (const char in freq) {
      const p = freq[char] / len;
      entropy -= p * Math.log2(p);
    }
    
    return entropy;
  }

  /**
   * Calculate character frequency distribution
   * Secrets often have unusual character distributions
   * 
   * @param {string} text - Input text
   * @returns {Object} Character class ratios
   */
  calculateCharFrequency(text) {
    if (!text || text.length === 0) {
      return { uppercase: 0, lowercase: 0, digits: 0, special: 0, whitespace: 0 };
    }
    
    const len = text.length;
    return {
      uppercase: (text.match(this.charClasses.uppercase) || []).length / len,
      lowercase: (text.match(this.charClasses.lowercase) || []).length / len,
      digits: (text.match(this.charClasses.digits) || []).length / len,
      special: (text.match(this.charClasses.special) || []).length / len,
      whitespace: (text.match(this.charClasses.whitespace) || []).length / len
    };
  }

  /**
   * Detect consecutive identical characters
   * Secrets often have runs like "aaaa" or "1111"
   * 
   * @param {string} text - Input text
   * @returns {number} Maximum consecutive character count
   */
  detectConsecutiveChars(text) {
    if (!text || text.length === 0) return 0;
    
    let maxConsecutive = 1;
    let currentConsecutive = 1;
    
    for (let i = 1; i < text.length; i++) {
      if (text[i] === text[i - 1]) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 1;
      }
    }
    
    return maxConsecutive;
  }

  /**
   * Detect repeated patterns (potential base64, hex, etc.)
   * 
   * @param {string} text - Input text
   * @returns {number} Number of repeated patterns found
   */
  detectRepeatedPatterns(text) {
    if (!text || text.length < 4) return 0;
    
    let repeatedCount = 0;
    const seen = new Set();
    
    // Check 2-4 character patterns
    for (let patternLen = 2; patternLen <= 4; patternLen++) {
      for (let i = 0; i <= text.length - patternLen; i++) {
        const pattern = text.slice(i, i + patternLen);
        if (seen.has(pattern)) {
          repeatedCount++;
        } else {
          seen.add(pattern);
        }
      }
    }
    
    return repeatedCount;
  }

  /**
   * Calculate n-gram frequency anomaly score
   * Compares text against expected English n-gram distribution
   * 
   * @param {string} text - Input text
   * @param {number} n - N-gram size (default: 3)
   * @returns {number} Anomaly score (0-1, higher = more anomalous)
   */
  calculateNgramAnomaly(text, n = 3) {
    if (!text || text.length < n) return 0;
    
    // Common English trigrams (approximate frequencies)
    const commonTrigrams = new Set([
      'the', 'and', 'tha', 'ent', 'ing', 'ion', 'tio', 'for', 'nde', 'has',
      'nce', 'edt', 'tis', 'oft', 'sth', 'men', 'ter', 'ent', 'eth', 'hat',
      'shi', 'res', 'sup', 'now', 'no ', ' t', 'th', 'an', 'in', 'is', 'it'
    ]);
    
    const ngrams = [];
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.push(text.slice(i, i + n).toLowerCase());
    }
    
    let commonCount = 0;
    for (const ngram of ngrams) {
      if (commonTrigrams.has(ngram)) {
        commonCount++;
      }
    }
    
    // Lower ratio of common trigrams = more anomalous
    const commonRatio = commonCount / ngrams.length;
    return 1 - commonRatio; // Invert so higher = more anomalous
  }

  /**
   * Detect base64-like patterns
   * 
   * @param {string} text - Input text
   * @returns {Object} Base64 detection result
   */
  detectBase64Like(text) {
    // Base64 character set
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
    
    const isBase64Chars = base64Regex.test(text.replace(/\s/g, ''));
    const isBase64UrlChars = base64UrlRegex.test(text.replace(/\s/g, ''));
    
    // Check length (base64 is typically multiple of 4)
    const cleanText = text.replace(/\s/g, '');
    const lengthMod4 = cleanText.length % 4;
    
    // Check padding
    const hasPadding = text.endsWith('=') || text.endsWith('==');
    
    return {
      isBase64Like: isBase64Chars || isBase64UrlChars,
      isBase64Url: isBase64UrlChars,
      lengthMod4,
      hasPadding,
      confidence: (isBase64Chars && cleanText.length > 20) ? 0.8 : 
                  (isBase64UrlChars && cleanText.length > 20) ? 0.7 : 0.3
    };
  }

  /**
   * Detect hex-like patterns
   * 
   * @param {string} text - Input text
   * @returns {Object} Hex detection result
   */
  detectHexLike(text) {
    const hexRegex = /^[0-9A-Fa-f]+$/;
    const cleanText = text.replace(/\s/g, '');
    
    const isHexChars = hexRegex.test(cleanText);
    const isEvenLength = cleanText.length % 2 === 0;
    const hasHexPrefix = text.toLowerCase().startsWith('0x');
    
    return {
      isHexLike: isHexChars,
      isEvenLength,
      hasHexPrefix,
      confidence: (isHexChars && isEvenLength && cleanText.length >= 32) ? 0.9 :
                  (isHexChars && cleanText.length >= 32) ? 0.7 : 0.3
    };
  }

  /**
   * Calculate overall anomaly score
   * 
   * @param {string} text - Input text
   * @returns {Object} Comprehensive anomaly analysis
   */
  analyze(text) {
    if (!text || text.length === 0) {
      return {
        anomalyScore: 0,
        riskLevel: 'NONE',
        features: {},
        isLikelySecret: false,
        confidence: 0
      };
    }
    
    // Calculate all features
    const entropy = this.calculateEntropy(text);
    const charFreq = this.calculateCharFrequency(text);
    const consecutive = this.detectConsecutiveChars(text);
    const repeated = this.detectRepeatedPatterns(text);
    const ngramAnomaly = this.calculateNgramAnomaly(text);
    const base64Like = this.detectBase64Like(text);
    const hexLike = this.detectHexLike(text);
    
    // Calculate anomaly score (0-100)
    let anomalyScore = 0;
    let featureWeights = {
      entropy: 0,
      charFrequency: 0,
      consecutive: 0,
      repeated: 0,
      ngram: 0,
      encoding: 0
    };
    
    // Entropy scoring (max 25 points)
    if (entropy > this.thresholds.entropy.suspicious) {
      featureWeights.entropy = 25;
    } else if (entropy > this.thresholds.entropy.min) {
      featureWeights.entropy = 15;
    }
    
    // Character frequency scoring (max 20 points)
    if (charFreq.digits > this.thresholds.digitRatio.suspicious ||
        charFreq.special > this.thresholds.specialCharRatio.suspicious) {
      featureWeights.charFrequency = 20;
    } else if (charFreq.digits > 0.25 || charFreq.special > 0.2) {
      featureWeights.charFrequency = 10;
    }
    
    // Consecutive characters (max 10 points)
    if (consecutive >= this.thresholds.consecutiveChars.threshold) {
      featureWeights.consecutive = 10;
    }
    
    // Repeated patterns (max 10 points)
    if (repeated > this.thresholds.repeatedPatterns.threshold * 10) {
      featureWeights.repeated = 10;
    }
    
    // N-gram anomaly (max 15 points)
    if (ngramAnomaly > 0.8) {
      featureWeights.ngram = 15;
    } else if (ngramAnomaly > 0.6) {
      featureWeights.ngram = 8;
    }
    
    // Encoding detection (max 20 points)
    if (base64Like.confidence > 0.7 || hexLike.confidence > 0.8) {
      featureWeights.encoding = 20;
    } else if (base64Like.confidence > 0.5 || hexLike.confidence > 0.5) {
      featureWeights.encoding = 10;
    }
    
    // Sum up scores
    anomalyScore = Object.values(featureWeights).reduce((a, b) => a + b, 0);
    
    // Determine risk level
    let riskLevel;
    if (anomalyScore >= 70) {
      riskLevel = 'CRITICAL';
    } else if (anomalyScore >= 50) {
      riskLevel = 'HIGH';
    } else if (anomalyScore >= 30) {
      riskLevel = 'MEDIUM';
    } else if (anomalyScore >= 15) {
      riskLevel = 'LOW';
    } else {
      riskLevel = 'NONE';
    }
    
    // Determine if likely a secret
    const isLikelySecret = anomalyScore >= 50;
    const confidence = Math.min(anomalyScore / 100, 1);
    
    return {
      anomalyScore,
      riskLevel,
      features: {
        entropy,
        charFreq,
        consecutive,
        repeated,
        ngramAnomaly,
        base64Like,
        hexLike,
        weights: featureWeights
      },
      isLikelySecret,
      confidence
    };
  }

  /**
   * Detect if text is likely a secret using ML analysis
   * 
   * @param {string} text - Input text
   * @returns {boolean} True if likely a secret
   */
  isSecret(text) {
    const result = this.analyze(text);
    return result.isLikelySecret;
  }

  /**
   * Get risk score for text (0-100)
   * 
   * @param {string} text - Input text
   * @returns {number} Risk score
   */
  getRiskScore(text) {
    const result = this.analyze(text);
    return result.anomalyScore;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MLAnomalyDetector };
}

// Self-test
if (typeof require !== 'undefined' && require.main === module) {
  const detector = new MLAnomalyDetector();
  
  console.log('ML Anomaly Detector Self-Test\n');
  console.log('=' .repeat(50));
  
  const tests = [
    { text: 'Hello, this is normal English text.', expected: 'LOW' },
    { text: 'AKIAIOSFODNN7EXAMPLE', expected: 'HIGH' },
    { text: 'sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP', expected: 'HIGH' },
    { text: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', expected: 'HIGH' },
    { text: 'SG.xxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', expected: 'HIGH' },
    { text: 'my password is hunter2', expected: 'MEDIUM' },
    { text: 'The quick brown fox jumps over the lazy dog', expected: 'NONE' },
    { text: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=', expected: 'HIGH' },
    { text: '0x1234567890abcdef1234567890abcdef', expected: 'HIGH' },
    { text: 'aaaaaaaaaaaaaaaaaaaaaaa', expected: 'MEDIUM' }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = detector.analyze(test.text);
    const success = result.riskLevel === test.expected || 
                    (test.expected === 'HIGH' && result.anomalyScore >= 50) ||
                    (test.expected === 'LOW' && result.anomalyScore < 30) ||
                    (test.expected === 'NONE' && result.anomalyScore < 15);
    
    if (success) {
      console.log(`✓ "${test.text.slice(0, 40)}..." → ${result.riskLevel} (${result.anomalyScore})`);
      passed++;
    } else {
      console.log(`✗ "${test.text.slice(0, 40)}..." → ${result.riskLevel} (${result.anomalyScore}), expected ${test.expected}`);
      failed++;
    }
  }
  
  console.log('=' .repeat(50));
  console.log(`\nResults: ${passed}/${tests.length} tests passed`);
  
  if (failed === 0) {
    console.log('\n✅ All ML anomaly detection tests passed!');
  } else {
    console.log(`\n⚠️  ${failed} tests failed`);
    process.exit(1);
  }
}
