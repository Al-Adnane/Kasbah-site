const { AdvancedFrontierModels } = require('../advanced-frontier-models');

describe('Advanced Frontier Models', () => {
  let frontier;

  beforeEach(() => {
    frontier = new AdvancedFrontierModels();
  });

  describe('DeepfakeDetector', () => {
    test('detects deepfake in video', async () => {
      const videoBuffer = Buffer.alloc(1000000); // 1MB mock video
      const result = await frontier.detectDeepfake(videoBuffer);
      
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.details.indicators).toBeDefined();
      expect(result.details.indicators.lipSync).toBeDefined();
    });

    test('returns low confidence for non-video', async () => {
      const audioBuffer = Buffer.alloc(100000);
      const result = await frontier.detectDeepfake(audioBuffer);
      
      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });

    test('extracts video features', () => {
      const detector = frontier.models.get('deepfake');
      const features = detector.extractVideoFeatures(Buffer.alloc(480000));
      
      expect(features.frameCount).toBeGreaterThan(0);
      expect(features.duration).toBeGreaterThan(0);
    });
  });

  describe('VoiceCloningDetector', () => {
    test('detects voice cloning in audio', async () => {
      const audioBuffer = Buffer.alloc(441000); // 10s mock audio
      const result = await frontier.detectVoiceCloning(audioBuffer);
      
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.details.indicators).toBeDefined();
      expect(result.details.duration).toBeGreaterThan(0);
    });

    test('returns low confidence for non-audio', async () => {
      const imageBuffer = Buffer.alloc(100000);
      const result = await frontier.detectVoiceCloning(imageBuffer);
      
      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('SyntheticMediaDetector', () => {
    test('detects synthetic images', async () => {
      const imageBuffer = Buffer.alloc(1000000);
      const result = await frontier.detectSynthetic(imageBuffer, 'image');
      
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.details.generator).toBeDefined();
    });

    test('identifies generator model', async () => {
      const imageBuffer = Buffer.alloc(1000000);
      const result = await frontier.detectSynthetic(imageBuffer, 'image');
      
      expect(result.details).toHaveProperty('mediaType', 'image');
      expect(result.details).toHaveProperty('generator');
    });
  });

  describe('ModelFingerprintDetector', () => {
    test('identifies AI model', async () => {
      const imageBuffer = Buffer.alloc(1000000);
      const result = await frontier.identifyModel(imageBuffer, 'image');
      
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.details.model).toBeDefined();
      expect(result.details.allMatches).toBeDefined();
    });

    test('compares against known signatures', () => {
      const detector = frontier.models.get('fingerprint');
      const signatures = detector.compareSignatures({});
      
      expect(Array.isArray(signatures)).toBe(true);
      expect(signatures.length).toBeGreaterThan(0);
      expect(signatures[0]).toHaveProperty('model');
      expect(signatures[0]).toHaveProperty('confidence');
    });
  });

  describe('AdversarialExampleDetector', () => {
    test('detects adversarial examples', async () => {
      const inputData = Buffer.alloc(10000);
      const result = await frontier.detectAdversarial(inputData);
      
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.details.indicators).toBeDefined();
    });

    test('identifies attack type', async () => {
      const inputData = Buffer.alloc(10000);
      const result = await frontier.detectAdversarial(inputData);
      
      expect(result.details).toHaveProperty('inputType', 'input');
      expect(result.details).toHaveProperty('attackType');
    });
  });

  describe('analyzeMedia', () => {
    test('runs all frontier models', async () => {
      const mediaBuffer = Buffer.alloc(1000000);
      const result = await frontier.analyzeMedia(mediaBuffer, 'video');
      
      expect(result.timestamp).toBeDefined();
      expect(result.mediaType).toBe('video');
      expect(result.modelOutputs).toBeDefined();
      expect(result.modelOutputs.deepfake).toBeDefined();
      expect(result.modelOutputs.voice).toBeDefined();
      expect(result.modelOutputs.synthetic).toBeDefined();
      expect(result.modelOutputs.fingerprint).toBeDefined();
      expect(result.modelOutputs.adversarial).toBeDefined();
      expect(result.overallRisk).toBeGreaterThanOrEqual(0);
      expect(result.overallRisk).toBeLessThanOrEqual(100);
      expect(['DENY', 'WARN', 'ALLOW']).toContain(result.decision);
    });

    test('handles model failures gracefully', async () => {
      // Simulate model failure
      frontier.models.get('deepfake').detect = async () => { throw new Error('Model failed'); };
      
      const mediaBuffer = Buffer.alloc(1000000);
      const result = await frontier.analyzeMedia(mediaBuffer, 'video');
      
      // Should continue with other models
      expect(result.modelOutputs.deepfake).toBeUndefined();
      expect(result.modelOutputs.synthetic).toBeDefined();
    });
  });
});
