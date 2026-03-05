const { CryptoReceipts } = require('../crypto-receipts-complete');
const { RedTeamToolkit } = require('../redteam-toolkit-complete');
const { SystemIntegrityIndex } = require('../sii-complete');

class MockStore {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.get(key); }
  async set(key, value) { this.data.set(key, value); }
  async delete(key) { this.data.delete(key); }
  async incr(key) { const c = parseInt(this.data.get(key) || '0'); this.data.set(key, (c+1).toString()); return c+1; }
  async keys(prefix) { return [...this.data.keys()].filter(k => k.startsWith(prefix)); }
}

describe('Phase 2: Core Moats', () => {
  describe('CryptoReceipts', () => {
    test('generates org key pair', async () => {
      const receipts = new CryptoReceipts(new MockStore());
      const result = await receipts.generateOrgKeyPair('org1');
      expect(result.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(result.createdAt).toBeDefined();
    });

    test('creates signed receipt', async () => {
      const receipts = new CryptoReceipts(new MockStore());
      await receipts.generateOrgKeyPair('org2');
      const receipt = await receipts.createReceipt({
        orgId: 'org2',
        decisionId: 'dec1',
        timestamp: Date.now(),
        risk: 85,
        violatedPatterns: ['AWS_KEY'],
        action: 'DENY'
      });
      expect(receipt.signature).toBeDefined();
      expect(receipt.hash).toBeDefined();
      expect(receipt.prev_hash).toBeDefined();
    });

    test('verifies receipt signature', async () => {
      const receipts = new CryptoReceipts(new MockStore());
      await receipts.generateOrgKeyPair('org3');
      const created = await receipts.createReceipt({
        orgId: 'org3',
        decisionId: 'dec1',
        timestamp: Date.now(),
        risk: 85,
        violatedPatterns: ['AWS_KEY'],
        action: 'DENY'
      });
      const result = await receipts.verifyReceipt(created);
      expect(result.valid).toBe(true);
    });

    test('verifies chain integrity', async () => {
      const receipts = new CryptoReceipts(new MockStore());
      await receipts.generateOrgKeyPair('org4');
      await receipts.createReceipt({ orgId: 'org4', decisionId: 'd1', timestamp: Date.now(), risk: 50, violatedPatterns: [], action: 'ALLOW' });
      await receipts.createReceipt({ orgId: 'org4', decisionId: 'd2', timestamp: Date.now(), risk: 60, violatedPatterns: [], action: 'ALLOW' });
      const result = await receipts.verifyChain('org4');
      expect(result.valid).toBe(true);
    });
  });

  describe('RedTeamToolkit', () => {
    test('loads attack vectors', () => {
      const toolkit = new RedTeamToolkit();
      expect(toolkit.attackVectors.length).toBeGreaterThan(40);
    });

    test('categorizes vectors correctly', () => {
      const toolkit = new RedTeamToolkit();
      const categories = [...new Set(toolkit.attackVectors.map(v => v.category))];
      expect(categories).toContain('obfuscation');
      expect(categories).toContain('secrets');
      expect(categories).toContain('pii');
      expect(categories).toContain('phishing');
    });

    test('generates report', () => {
      const toolkit = new RedTeamToolkit();
      const catalog = toolkit.getCatalog();
      expect(catalog.total).toBeGreaterThan(40);
      expect(catalog.categories.length).toBeGreaterThan(3);
    });
  });

  describe('SystemIntegrityIndex', () => {
    test('registers components', () => {
      const sii = new SystemIntegrityIndex();
      sii.registerComponent('api', 'API Server', 1.0);
      sii.registerComponent('db', 'Database', 1.5);
      expect(sii.components.size).toBe(2);
    });

    test('calculates component health', () => {
      const sii = new SystemIntegrityIndex();
      sii.registerComponent('api', 'API Server', 1.0);
      sii.recordCheck('api', true, 50);
      sii.recordCheck('api', true, 60);
      sii.recordCheck('api', false, 0);
      const health = sii.getComponentHealth('api');
      expect(health.health).toBeLessThan(1.0);
      expect(health.health).toBeGreaterThan(0);
    });

    test('computes SII', () => {
      const sii = new SystemIntegrityIndex();
      sii.registerComponent('api', 'API', 1.0);
      sii.registerComponent('db', 'DB', 1.0);
      sii.recordCheck('api', true, 50);
      sii.recordCheck('db', true, 30);
      const systemHealth = sii.getSystemHealth();
      expect(systemHealth.sii).toBeGreaterThan(0);
      expect(systemHealth.sii).toBeLessThanOrEqual(1);
    });

    test('three-gate policy check', () => {
      const sii = new SystemIntegrityIndex();
      const pass = sii.apiGateCheck(0.8, 0.1, 0.2);
      expect(pass.pass).toBe(true);
      const failR = sii.apiGateCheck(0.5, 0.1, 0.2);
      expect(failR.pass).toBe(false);
      expect(failR.gate).toBe('reliability');
      const failB = sii.apiGateCheck(0.8, 0.3, 0.2);
      expect(failB.pass).toBe(false);
      expect(failB.gate).toBe('brittleness');
    });

    test('mirror integrity check', () => {
      const sii = new SystemIntegrityIndex();
      const expected = { api: 'running', db: 'running' };
      const actual = { api: 'running', db: 'stopped' };
      const result = sii.mirrorIntegrityCheck(expected, actual);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.component === 'db')).toBe(true);
    });
  });
});
