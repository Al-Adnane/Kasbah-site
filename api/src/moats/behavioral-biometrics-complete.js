/**
 * Kasbah Guard — Behavioral Biometrics Engine
 * 
 * Keystroke dynamics, mouse patterns, access behavior
 * Zero-friction passive authentication
 */

class BehavioralBiometrics {
  constructor(store) {
    this.store = store;
    this.sessions = new Map();
  }

  /**
   * Record keystroke event
   */
  recordKeystroke(sessionId, event) {
    const session = this.sessions.get(sessionId) || this.createSession(sessionId);
    
    session.keystrokes.push({
      key: event.key,
      timestamp: Date.now(),
      flightTime: event.flightTime, // Time between keypresses
      dwellTime: event.dwellTime,   // Time key was held
      pressure: event.pressure      // Touch pressure (mobile)
    });

    if (session.keystrokes.length > 500) {
      session.keystrokes.shift();
    }

    this.sessions.set(sessionId, session);
  }

  /**
   * Record mouse/touch event
   */
  recordMouse(sessionId, event) {
    const session = this.sessions.get(sessionId) || this.createSession(sessionId);
    
    session.mouseEvents.push({
      x: event.x,
      y: event.y,
      timestamp: Date.now(),
      velocity: event.velocity,
      acceleration: event.acceleration,
      clickPattern: event.clickPattern
    });

    if (session.mouseEvents.length > 500) {
      session.mouseEvents.shift();
    }

    this.sessions.set(sessionId, session);
  }

  /**
   * Create new session
   */
  createSession(sessionId) {
    return {
      sessionId,
      userId: null,
      createdAt: Date.now(),
      keystrokes: [],
      mouseEvents: [],
      accessPatterns: [],
      baseline: null
    };
  }

  /**
   * Extract keystroke features
   */
  extractKeystrokeFeatures(keystrokes) {
    if (keystrokes.length < 10) return null;

    const flightTimes = keystrokes.map(k => k.flightTime).filter(t => t > 0);
    const dwellTimes = keystrokes.map(k => k.dwellTime).filter(t => t > 0);

    return {
      avgFlightTime: this.mean(flightTimes),
      stdFlightTime: this.stdDev(flightTimes),
      avgDwellTime: this.mean(dwellTimes),
      stdDwellTime: this.stdDev(dwellTimes),
      typingRhythm: this.calculateRhythm(keystrokes),
      commonBigrams: this.getCommonBigrams(keystrokes)
    };
  }

  /**
   * Extract mouse features
   */
  extractMouseFeatures(mouseEvents) {
    if (mouseEvents.length < 10) return null;

    const velocities = mouseEvents.map(m => m.velocity).filter(v => v > 0);
    const accelerations = mouseEvents.map(m => m.acceleration).filter(a => a !== 0);

    return {
      avgVelocity: this.mean(velocities),
      stdVelocity: this.stdDev(velocities),
      avgAcceleration: this.mean(accelerations),
      movementPattern: this.analyzeMovementPattern(mouseEvents),
      clickDynamics: this.analyzeClickPattern(mouseEvents)
    };
  }

  /**
   * Calculate behavioral similarity score (0-1)
   */
  calculateSimilarity(baseline, current) {
    if (!baseline || !current) return 0.5;

    const features = ['avgFlightTime', 'avgDwellTime', 'avgVelocity'];
    let similarity = 0;
    let count = 0;

    for (const feature of features) {
      if (baseline[feature] && current[feature]) {
        const diff = Math.abs(baseline[feature] - current[feature]);
        const maxVal = Math.max(baseline[feature], current[feature]);
        similarity += 1 - (diff / maxVal);
        count++;
      }
    }

    return count > 0 ? similarity / count : 0.5;
  }

  /**
   * Detect anomalies in behavior
   */
  detectAnomaly(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.baseline) return { anomaly: false, score: 0 };

    const currentKeystroke = this.extractKeystrokeFeatures(session.keystrokes);
    const currentMouse = this.extractMouseFeatures(session.mouseEvents);

    const keystrokeSimilarity = this.calculateSimilarity(session.baseline.keystroke, currentKeystroke);
    const mouseSimilarity = this.calculateSimilarity(session.baseline.mouse, currentMouse);

    const anomalyScore = 1 - ((keystrokeSimilarity + mouseSimilarity) / 2);

    return {
      anomaly: anomalyScore > 0.4, // Threshold for anomaly
      score: Math.round(anomalyScore * 100),
      keystrokeSimilarity: Math.round(keystrokeSimilarity * 100),
      mouseSimilarity: Math.round(mouseSimilarity * 100),
      riskLevel: anomalyScore > 0.6 ? 'HIGH' : anomalyScore > 0.4 ? 'MEDIUM' : 'LOW'
    };
  }

  /**
   * Set user baseline
   */
  async setBaseline(sessionId, userId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.userId = userId;
    session.baseline = {
      keystroke: this.extractKeystrokeFeatures(session.keystrokes),
      mouse: this.extractMouseFeatures(session.mouseEvents),
      setAt: Date.now()
    };

    // Store baseline
    await this.store.set(`user:${userId}:baseline`, JSON.stringify(session.baseline));
    return true;
  }

  /**
   * Load user baseline
   */
  async loadBaseline(userId) {
    const stored = await this.store.get(`user:${userId}:baseline`);
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  }

  /**
   * Analyze access patterns
   */
  recordAccessPattern(sessionId, pattern) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.accessPatterns.push({
      timestamp: Date.now(),
      location: pattern.location,
      device: pattern.device,
      action: pattern.action,
      resource: pattern.resource
    });

    if (session.accessPatterns.length > 100) {
      session.accessPatterns.shift();
    }
  }

  /**
   * Detect geographic anomaly
   */
  detectGeoAnomaly(sessionId, currentLocation) {
    const session = this.sessions.get(sessionId);
    if (!session || session.accessPatterns.length === 0) return { anomaly: false };

    const lastAccess = session.accessPatterns[session.accessPatterns.length - 1];
    const distance = this.calculateDistance(lastAccess.location, currentLocation);
    const timeDiff = Date.now() - lastAccess.timestamp;
    
    // Impossible travel detection (e.g., 5000km in 1 hour)
    const maxSpeed = distance / (timeDiff / 3600000); // km/h
    const anomaly = maxSpeed > 800; // Faster than commercial flight

    return {
      anomaly,
      distance: Math.round(distance),
      timeDiffHours: Math.round(timeDiff / 3600000),
      impliedSpeed: Math.round(maxSpeed),
      riskLevel: anomaly ? 'HIGH' : 'LOW'
    };
  }

  // Utility functions
  mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
  }

  stdDev(arr) {
    if (arr.length < 2) return 0;
    const avg = this.mean(arr);
    const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  calculateRhythm(keystrokes) {
    // Simplified rhythm analysis
    const intervals = [];
    for (let i = 1; i < keystrokes.length; i++) {
      intervals.push(keystrokes[i].timestamp - keystrokes[i-1].timestamp);
    }
    return this.stdDev(intervals);
  }

  getCommonBigrams(keystrokes) {
    const bigrams = {};
    for (let i = 1; i < keystrokes.length; i++) {
      const bigram = keystrokes[i-1].key + keystrokes[i].key;
      bigrams[bigram] = (bigrams[bigram] || 0) + 1;
    }
    return Object.entries(bigrams).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }

  analyzeMovementPattern(mouseEvents) {
    // Analyze mouse movement curvature
    let totalCurvature = 0;
    for (let i = 2; i < mouseEvents.length; i++) {
      const angle = this.calculateAngle(mouseEvents[i-2], mouseEvents[i-1], mouseEvents[i]);
      totalCurvature += Math.abs(angle);
    }
    return totalCurvature / mouseEvents.length;
  }

  analyzeClickPattern(mouseEvents) {
    const clicks = mouseEvents.filter(m => m.clickPattern);
    return {
      totalClicks: clicks.length,
      avgClickInterval: clicks.length > 1 ? 
        (clicks[clicks.length-1].timestamp - clicks[0].timestamp) / clicks.length : 0
    };
  }

  calculateAngle(p1, p2, p3) {
    const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    return Math.acos(dot / (mag1 * mag2)) * (180 / Math.PI);
  }

  calculateDistance(loc1, loc2) {
    // Haversine formula for distance between two lat/long points
    const R = 6371; // Earth's radius in km
    const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
    const dLon = (loc2.lon - loc1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

module.exports = { BehavioralBiometrics };
