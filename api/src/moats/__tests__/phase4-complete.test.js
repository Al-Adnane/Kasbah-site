const { ZKPolicyProofs } = require('../zk-proofs-complete');

class MockStore {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.get(key); }
  async set(key, value) { this.data.set(key, value); }
  async delete(key) { this.data.delete(key); }
  async keys(prefix) { return [...this.data.keys()].filter(k => k.startsWith(prefix)); }
}

describe('Phase 4: Enterprise Scale', () => {
  describe('ZKPolicyProofs', () => {
    test('uploads policy with versioning', async () => {
      const zk = new ZKPolicyProofs(new MockStore());
      const result = await zk.uploadPolicy('org1', 'default', 'rules:\n  - deny: AWS_KEY');
      expect(result.orgId).toBe('org1');
      expect(result.name).toBe('default');
      expect(result.version).toBe(1);
      expect(result.hash).toBeDefined();
    });

    test('increments policy version', async () => {
      const zk = new ZKPolicyProofs(new MockStore());
      await zk.uploadPolicy('org1', 'default', 'rules:\n  - deny: AWS_KEY');
      const result2 = await zk.uploadPolicy('org1', 'default', 'rules:\n  - deny: AWS_KEY\n  - deny: SSN');
      expect(result2.version).toBe(2);
    });

    test('generates compliance proof', async () => {
      const zk = new ZKPolicyProofs(new MockStore());
      await zk.uploadPolicy('org1', 'default', 'rules:\n  - deny: AWS_KEY');
      
      const proof = await zk.generateComplianceProof('org1', 'default', {
        id: 'dec1',
        timestamp: Date.now(),
        risk: 85,
        action: 'DENY'
      });
      
      expect(proof.proofId).toBeDefined();
      expect(proof.orgId).toBe('org1');
      expect(proof.policyName).toBe('default');
      expect(proof.signature).toBeDefined();
    });

    test('verifies proof', async () => {
      const zk = new ZKPolicyProofs(new MockStore());
      await zk.uploadPolicy('org1', 'default', 'rules:\n  - deny: AWS_KEY');
      const proof = await zk.generateComplianceProof('org1', 'default', {
        id: 'dec1',
        timestamp: Date.now(),
        risk: 85,
        action: 'DENY'
      });
      
      const result = await zk.verifyProof(proof.proofId);
      expect(result.valid).toBe(true);
      expect(result.proof).toBeDefined();
    });

    test('gets policy history', async () => {
      const zk = new ZKPolicyProofs(new MockStore());
      await zk.uploadPolicy('org1', 'default', 'v1');
      await zk.uploadPolicy('org1', 'default', 'v2');
      await zk.uploadPolicy('org1', 'default', 'v3');
      
      const history = await zk.getPolicyHistory('org1', 'default');
      expect(history.versions.length).toBe(3);
      expect(history.versions[0].version).toBe(3);
    });

    test('verifies enforcement', async () => {
      const zk = new ZKPolicyProofs(new MockStore());
      await zk.uploadPolicy('org1', 'default', 'rules:\n  - deny: AWS_KEY');
      
      const decisions = [
        { id: 'd1', timestamp: Date.now(), risk: 85, action: 'DENY' },
        { id: 'd2', timestamp: Date.now(), risk: 50, action: 'WARN' }
      ];
      
      const result = await zk.verifyEnforcement('org1', 'default', decisions);
      expect(result.valid).toBe(true);
      expect(result.totalDecisions).toBe(2);
    });
  });
});
