const { BehavioralBiometrics } = require('../behavioral-biometrics-complete');
const { MLAnomalyDetector } = require('../ml-anomaly-complete');

class MockStore {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.get(key); }
  async set(key, value) { this.data.set(key, value); }
  async delete(key) { this.data.delete(key); }
}

describe('Phase 3: Advanced Detection', () => {
  describe('BehavioralBiometrics', () => {
    test('records keystroke events', () => {
      const bb = new BehavioralBiometrics(new MockStore());
      bb.recordKeystroke('session1', { key: 'a', flightTime: 50, dwellTime: 100, pressure: 0.5 });
      bb.recordKeystroke('session1', { key: 'b', flightTime: 60, dwellTime: 110, pressure: 0.6 });
      const session = bb.sessions.get('session1');
      expect(session.keystrokes.length).toBe(2);
    });

    test('records mouse events', () => {
      const bb = new BehavioralBiometrics(new MockStore());
      bb.recordMouse('session1', { x: 100, y: 200, velocity: 5, acceleration: 0.5 });
      const session = bb.sessions.get('session1');
      expect(session.mouseEvents.length).toBe(1);
    });

    test('extracts keystroke features', () => {
      const bb = new BehavioralBiometrics(new MockStore());
      for (let i = 0; i < 20; i++) {
        bb.recordKeystroke('session1', { key: 'a', flightTime: 50 + i, dwellTime: 100 + i });
      }
      const session = bb.sessions.get('session1');
      const features = bb.extractKeystrokeFeatures(session.keystrokes);
      expect(features.avgFlightTime).toBeDefined();
      expect(features.stdFlightTime).toBeDefined();
    });

    test('detects anomaly from baseline', async () => {
      const bb = new BehavioralBiometrics(new MockStore());
      // Set baseline with normal typing
      for (let i = 0; i < 50; i++) {
        bb.recordKeystroke('session1', { key: 'a', flightTime: 50, dwellTime: 100 });
      }
      await bb.setBaseline('session1', 'user1');
      
      // Detect with different typing pattern
      for (let i = 0; i < 20; i++) {
        bb.recordKeystroke('session1', { key: 'a', flightTime: 200, dwellTime: 300 });
      }
      
      const result = bb.detectAnomaly('session1');
      expect(result.anomaly).toBe(true);
      expect(result.score).toBeGreaterThan(30);
    });

    test('calculates distance correctly', () => {
      const bb = new BehavioralBiometrics(new MockStore());
      const loc1 = { lat: 40.7128, lon: -74.0060 }; // NYC
      const loc2 = { lat: 34.0522, lon: -118.2437 }; // LA
      const distance = bb.calculateDistance(loc1, loc2);
      expect(distance).toBeGreaterThan(3000); // Should be >3000km
    });

    test('detects impossible travel', () => {
      const bb = new BehavioralBiometrics(new MockStore());
      bb.createSession('session1');
      bb.recordAccessPattern('session1', {
        location: { lat: 40.7128, lon: -74.0060 },
        timestamp: Date.now() - 3600000 // 1 hour ago
      });
      
      const result = bb.detectGeoAnomaly('session1', { lat: 34.0522, lon: -118.2437 });
      expect(result.anomaly).toBe(true);
      expect(result.riskLevel).toBe('HIGH');
    });
  });

  describe('MLAnomalyDetector', () => {
    test('trains isolation forest', () => {
      const ml = new MLAnomalyDetector({ n_estimators: 10 });
      const data = Array.from({ length: 50 }, () => [Math.random() * 100]);
      const result = ml.train('entity1', data);
      expect(result.samplesUsed).toBe(50);
      expect(result.treesBuilt).toBe(10);
    });

    test('predicts anomaly score', () => {
      const ml = new MLAnomalyDetector({ n_estimators: 10 });
      const trainingData = Array.from({ length: 50 }, () => [50 + Math.random() * 10]);
      ml.train('entity1', trainingData);
      
      // Normal point
      const normal = ml.predict('entity1', [55]);
      expect(normal.score).toBeLessThan(0.6);
      
      // Anomalous point
      const anomaly = ml.predict('entity1', [200]);
      expect(anomaly.score).toBeGreaterThan(0.5);
    });

    test('updates model with new data', async () => {
      const ml = new MLAnomalyDetector({ n_estimators: 10 });
      const data = Array.from({ length: 50 }, () => [Math.random() * 100]);
      ml.train('entity1', data);
      
      const oldTrainedAt = ml.models.get('entity1').trainedAt;
      await new Promise(r => setTimeout(r, 10));
      
      const newData = Array.from({ length: 20 }, () => [Math.random() * 100]);
      await ml.update('entity1', newData);
      
      expect(ml.models.get('entity1').trainedAt).toBeGreaterThan(oldTrainedAt);
    });

    test('continuous learning pipeline', async () => {
      const ml = new MLAnomalyDetector({ n_estimators: 10 });
      const data = Array.from({ length: 50 }, () => [Math.random() * 100]);
      ml.train('entity1', data);
      
      const newData = Array.from({ length: 60 }, () => [Math.random() * 100]);
      const result = await ml.continuousLearning('entity1', newData, 50);
      
      expect(result.retrained).toBe(true);
      expect(result.newSamples).toBe(60);
    });

    test('clusters data', () => {
      const ml = new MLAnomalyDetector();
      const data = [
        [1, 1], [1.5, 1.5], [1.2, 1.2], // Cluster 1
        [5, 5], [5.5, 5.5], [5.2, 5.2], // Cluster 2
        [9, 9], [9.5, 9.5], [9.2, 9.2]  // Cluster 3
      ];
      
      const result = ml.cluster(data, 3);
      expect(result.centroids.length).toBe(3);
      expect(result.clusters.length).toBe(3);
    });

    test('handles insufficient data', () => {
      const ml = new MLAnomalyDetector();
      expect(() => ml.train('entity1', [[1], [2]])).toThrow();
    });
  });
});
