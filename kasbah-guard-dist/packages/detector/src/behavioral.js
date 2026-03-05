/**
 * Kasbah Guard — Behavioral Pattern Detection
 * 
 * Detects secrets based on behavioral patterns:
 * - Copy-paste behavior
 * - Rapid typing patterns
 * - Context switching
 * - Time-based anomalies
 * - User session analysis
 * 
 * This is a NOVEL approach that analyzes HOW data is entered,
 * not just WHAT data is entered.
 */

class BehavioralPatternDetector {
  constructor() {
    // Behavioral thresholds
    this.thresholds = {
      pasteLength: 50,           // Min chars to consider a paste
      typingSpeed: {             // Characters per second
        normal: { min: 2, max: 10 },
        fast: { min: 10, max: 50 },
        suspicious: 50           // cps > 50 is likely paste
      },
      sessionRisk: {
        low: 20,
        medium: 50,
        high: 80
      },
      contextSwitches: {
        suspicious: 5            // > 5 context switches in 1 min
      }
    };
    
    // Session storage (in production, use Redis)
    this.sessions = new Map();
  }

  /**
   * Track a paste event
   * 
   * @param {Object} event - Paste event data
   * @returns {Object} Risk assessment
   */
  trackPaste(event) {
    const {
      sessionId,
      content,
      timestamp = Date.now(),
      source,
      targetElement
    } = event;
    
    const session = this.getOrCreateSession(sessionId);
    
    // Record paste
    session.pastes.push({
      content,
      length: content.length,
      timestamp,
      source,
      targetElement
    });
    
    // Keep last 100 pastes
    if (session.pastes.length > 100) {
      session.pastes.shift();
    }
    
    // Analyze paste risk
    const risk = this.analyzePasteRisk(content, session);
    
    // Update session risk
    session.riskScore = this.calculateSessionRisk(session);
    
    return {
      sessionId,
      risk,
      sessionRisk: session.riskScore,
      warnings: this.generateWarnings(risk, session)
    };
  }

  /**
   * Track typing speed
   * 
   * @param {Object} event - Typing event data
   * @returns {Object} Risk assessment
   */
  trackTyping(event) {
    const {
      sessionId,
      charsPerSecond,
      timestamp = Date.now()
    } = event;
    
    const session = this.getOrCreateSession(sessionId);
    
    // Record typing speed sample
    session.typingSamples.push({
      cps: charsPerSecond,
      timestamp
    });
    
    // Keep last 50 samples
    if (session.typingSamples.length > 50) {
      session.typingSamples.shift();
    }
    
    // Analyze typing anomaly
    const isAnomalous = this.isTypingAnomalous(charsPerSecond, session);
    
    // Update session risk
    session.riskScore = this.calculateSessionRisk(session);
    
    return {
      sessionId,
      isAnomalous,
      cps: charsPerSecond,
      sessionRisk: session.riskScore
    };
  }

  /**
   * Track context switch (e.g., switching tabs, apps)
   * 
   * @param {Object} event - Context switch event
   * @returns {Object} Risk assessment
   */
  trackContextSwitch(event) {
    const {
      sessionId,
      from,
      to,
      timestamp = Date.now()
    } = event;
    
    const session = this.getOrCreateSession(sessionId);
    
    // Record context switch
    session.contextSwitches.push({
      from,
      to,
      timestamp
    });
    
    // Keep last 50 switches
    if (session.contextSwitches.length > 50) {
      session.contextSwitches.shift();
    }
    
    // Analyze switch pattern
    const switchRate = this.calculateSwitchRate(session);
    const isSuspicious = switchRate > this.thresholds.contextSwitches.suspicious;
    
    // Update session risk
    session.riskScore = this.calculateSessionRisk(session);
    
    return {
      sessionId,
      switchRate,
      isSuspicious,
      sessionRisk: session.riskScore
    };
  }

  /**
   * Analyze paste content risk
   * 
   * @param {string} content - Pasted content
   * @param {Object} session - Session data
   * @returns {Object} Risk analysis
   */
  analyzePasteRisk(content, session) {
    const risk = {
      score: 0,
      factors: [],
      level: 'NONE'
    };
    
    // Factor 1: Paste length
    if (content.length > 200) {
      risk.score += 20;
      risk.factors.push('large_paste');
    } else if (content.length > this.thresholds.pasteLength) {
      risk.score += 10;
    }
    
    // Factor 2: Paste frequency (multiple pastes in short time)
    const recentPastes = session.pastes.filter(
      p => Date.now() - p.timestamp < 60000
    );
    if (recentPastes.length > 5) {
      risk.score += 25;
      risk.factors.push('rapid_paste');
    }
    
    // Factor 3: Content characteristics
    const hasHighEntropy = this.calculateEntropy(content) > 5.0;
    const hasBase64 = /^[A-Za-z0-9+/=]+$/.test(content.replace(/\s/g, ''));
    const hasHex = /^[0-9A-Fa-f]+$/.test(content.replace(/\s/g, ''));
    
    if (hasHighEntropy) {
      risk.score += 20;
      risk.factors.push('high_entropy');
    }
    if (hasBase64 && content.length > 30) {
      risk.score += 15;
      risk.factors.push('base64_pattern');
    }
    if (hasHex && content.length > 30) {
      risk.score += 15;
      risk.factors.push('hex_pattern');
    }
    
    // Factor 4: Time of day (unusual hours)
    const hour = new Date().getHours();
    if (hour >= 1 && hour <= 5) {
      risk.score += 10;
      risk.factors.push('unusual_hours');
    }
    
    // Determine risk level
    if (risk.score >= 70) {
      risk.level = 'CRITICAL';
    } else if (risk.score >= 50) {
      risk.level = 'HIGH';
    } else if (risk.score >= 30) {
      risk.level = 'MEDIUM';
    } else if (risk.score >= 15) {
      risk.level = 'LOW';
    }
    
    return risk;
  }

  /**
   * Check if typing speed is anomalous
   * 
   * @param {number} cps - Characters per second
   * @param {Object} session - Session data
   * @returns {boolean} True if anomalous
   */
  isTypingAnomalous(cps, session) {
    // Very fast typing is likely a paste
    if (cps > this.thresholds.typingSpeed.suspicious) {
      return true;
    }
    
    // Compare to session average
    if (session.typingSamples.length >= 5) {
      const avgCps = session.typingSamples.reduce((sum, s) => sum + s.cps, 0) / 
                     session.typingSamples.length;
      
      // Significant deviation from average
      if (cps > avgCps * 3) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Calculate context switch rate (switches per minute)
   * 
   * @param {Object} session - Session data
   * @returns {number} Switches per minute
   */
  calculateSwitchRate(session) {
    const recentSwitches = session.contextSwitches.filter(
      s => Date.now() - s.timestamp < 60000
    );
    return recentSwitches.length;
  }

  /**
   * Calculate overall session risk score
   * 
   * @param {Object} session - Session data
   * @returns {number} Risk score 0-100
   */
  calculateSessionRisk(session) {
    let risk = 0;
    
    // Factor 1: Recent paste risk
    const recentPastes = session.pastes.filter(
      p => Date.now() - p.timestamp < 300000
    );
    if (recentPastes.length > 0) {
      const avgPasteRisk = recentPastes.reduce((sum, p) => {
        const pasteRisk = this.analyzePasteRisk(p.content, session);
        return sum + pasteRisk.score;
      }, 0) / recentPastes.length;
      risk += avgPasteRisk * 0.4;
    }
    
    // Factor 2: Typing anomalies
    const anomalousSamples = session.typingSamples.filter(
      s => this.isTypingAnomalous(s.cps, session)
    ).length;
    if (anomalousSamples > 0) {
      risk += Math.min(anomalousSamples * 5, 20);
    }
    
    // Factor 3: Context switch rate
    const switchRate = this.calculateSwitchRate(session);
    if (switchRate > this.thresholds.contextSwitches.suspicious) {
      risk += Math.min((switchRate - this.thresholds.contextSwitches.suspicious) * 5, 20);
    }
    
    // Factor 4: Session duration (very long sessions are riskier)
    const sessionDuration = Date.now() - session.startTime;
    if (sessionDuration > 4 * 60 * 60 * 1000) { // 4+ hours
      risk += 10;
    }
    
    return Math.min(Math.round(risk), 100);
  }

  /**
   * Generate warnings based on risk analysis
   * 
   * @param {Object} risk - Risk analysis
   * @param {Object} session - Session data
   * @returns {Array} Warning messages
   */
  generateWarnings(risk, session) {
    const warnings = [];
    
    if (risk.factors.includes('large_paste')) {
      warnings.push('Large paste detected - review before sending');
    }
    if (risk.factors.includes('rapid_paste')) {
      warnings.push('Multiple rapid pastes - possible data exfiltration');
    }
    if (risk.factors.includes('high_entropy')) {
      warnings.push('High entropy content - may contain secrets');
    }
    if (risk.factors.includes('base64_pattern')) {
      warnings.push('Base64-encoded content detected');
    }
    if (risk.factors.includes('hex_pattern')) {
      warnings.push('Hex-encoded content detected');
    }
    if (risk.factors.includes('unusual_hours')) {
      warnings.push('Unusual activity time');
    }
    
    return warnings;
  }

  /**
   * Get or create session
   * 
   * @param {string} sessionId - Session ID
   * @returns {Object} Session data
   */
  getOrCreateSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        startTime: Date.now(),
        pastes: [],
        typingSamples: [],
        contextSwitches: [],
        riskScore: 0
      });
    }
    
    const session = this.sessions.get(sessionId);
    
    // Clean up old sessions (older than 24 hours)
    if (Date.now() - session.startTime > 24 * 60 * 60 * 1000) {
      this.sessions.delete(sessionId);
      return this.getOrCreateSession(sessionId);
    }
    
    return session;
  }

  /**
   * Calculate Shannon entropy (utility function)
   * 
   * @param {string} text - Input text
   * @returns {number} Entropy value
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
   * Get session summary
   * 
   * @param {string} sessionId - Session ID
   * @returns {Object} Session summary
   */
  getSessionSummary(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    
    return {
      sessionId,
      duration: Date.now() - session.startTime,
      pasteCount: session.pastes.length,
      typingSampleCount: session.typingSamples.length,
      contextSwitchCount: session.contextSwitches.length,
      riskScore: session.riskScore,
      riskLevel: session.riskScore >= 80 ? 'HIGH' : 
                 session.riskScore >= 50 ? 'MEDIUM' : 'LOW'
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BehavioralPatternDetector };
}

// Self-test
if (typeof require !== 'undefined' && require.main === module) {
  const detector = new BehavioralPatternDetector();
  const sessionId = 'test-session-' + Date.now();
  
  console.log('Behavioral Pattern Detector Self-Test\n');
  console.log('=' .repeat(50));
  
  // Test 1: Normal typing
  const typingResult = detector.trackTyping({
    sessionId,
    charsPerSecond: 5,
    timestamp: Date.now()
  });
  console.log(`✓ Normal typing (5 cps): anomalous=${typingResult.isAnomalous}`);
  
  // Test 2: Suspicious fast typing (paste)
  const fastTypingResult = detector.trackTyping({
    sessionId,
    charsPerSecond: 100,
    timestamp: Date.now()
  });
  console.log(`✓ Fast typing (100 cps): anomalous=${fastTypingResult.isAnomalous}`);
  
  // Test 3: Normal paste
  const pasteResult = detector.trackPaste({
    sessionId,
    content: 'Hello, this is normal text.',
    timestamp: Date.now()
  });
  console.log(`✓ Normal paste: risk=${pasteResult.risk.level} (${pasteResult.risk.score})`);
  
  // Test 4: Suspicious paste (API key)
  const suspiciousPasteResult = detector.trackPaste({
    sessionId,
    content: 'sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV',
    timestamp: Date.now()
  });
  console.log(`✓ Suspicious paste: risk=${suspiciousPasteResult.risk.level} (${suspiciousPasteResult.risk.score})`);
  
  // Test 5: Session summary
  const summary = detector.getSessionSummary(sessionId);
  console.log(`✓ Session summary: ${summary.pasteCount} pastes, ${summary.typingSampleCount} typing samples, risk=${summary.riskScore}`);
  
  console.log('=' .repeat(50));
  console.log('\n✅ All behavioral pattern tests completed!');
}
