const { RateLimiter } = require('../rate-limiter-complete');
const { CircuitBreaker } = require('../circuit-breaker-complete');
const { MagicBytesValidator } = require('../magic-bytes-complete');
const { ObfuscationDecoder } = require('../../../kasbah-guard-dist/packages/detector/src/obfuscation-decoder-complete');
const { AuditLedger } = require('../audit-ledger-complete');

class MockStore {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.get(key); }
  async set(key, value) { this.data.set(key, value); }
  async delete(key) { this.data.delete(key); }
  async incr(key) { const c = parseInt(this.data.get(key) || '0'); this.data.set(key, (c+1).toString()); return c+1; }
  async expire() { }
}

describe('Phase 1: API Security Layer', () => {
  describe('RateLimiter', () => {
    test('allows requests under limit', async () => {
      const limiter = new RateLimiter(new MockStore(), 'DETECTION');
      for (let i = 0; i < 10; i++) expect((await limiter.check('u1')).allowed).toBe(true);
    });
    test('blocks over limit', async () => {
      const limiter = new RateLimiter(new MockStore(), 'DETECTION');
      for (let i = 0; i < 10; i++) await limiter.check('u2');
      expect((await limiter.check('u2')).allowed).toBe(false);
    });
  });
  describe('CircuitBreaker', () => {
    test('starts CLOSED', () => {
      const cb = new CircuitBreaker();
      expect(cb.state).toBe('CLOSED');
    });
    test('opens after failures', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });
      for (let i = 0; i < 3; i++) { try { await cb.execute(() => { throw new Error('fail'); }); } catch(e){} }
      expect(cb.state).toBe('OPEN');
    });
  });
  describe('MagicBytesValidator', () => {
    test('validates PNG', () => {
      const v = new MagicBytesValidator();
      const png = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
      expect(v.validate(png, 'image/png').valid).toBe(true);
    });
    test('detects mismatch', () => {
      const v = new MagicBytesValidator();
      const fake = Buffer.from([0x00,0x00,0x00,0x00]);
      expect(v.validate(fake, 'image/png').valid).toBe(false);
    });
  });
});

describe('Phase 1: Obfuscation Decoder', () => {
  test('decodes Base64', () => {
    const d = new ObfuscationDecoder();
    const r = d.decode('QVdTX0tFWT1B S0lBSU9TRk9ETjdFWEFNUExF');
    expect(r.some(r => r.type === 'base64')).toBe(true);
  });
  test('decodes Hex', () => {
    const d = new ObfuscationDecoder();
    const r = d.decode('0x4157535f4b45593d414b4941494f53464f444e4e374558414d504c45');
    expect(r.some(r => r.type === 'hex')).toBe(true);
  });
  test('normalizes homoglyphs', () => {
    const d = new ObfuscationDecoder();
    const r = d.decode('аws_key'); // Cyrillic 'а'
    expect(r.some(r => r.type === 'homoglyph')).toBe(true);
  });
});

describe('Phase 1: Audit Ledger', () => {
  test('initializes genesis block', async () => {
    const ledger = new AuditLedger(new MockStore());
    await ledger.initialize();
    const stats = await ledger.getStats();
    expect(stats.totalEntries).toBeGreaterThan(0);
  });
  test('records entries with hash chain', async () => {
    const ledger = new AuditLedger(new MockStore());
    await ledger.initialize();
    const entry = await ledger.record({ type: 'test', action: 'test_action' });
    expect(entry.hash).toBeDefined();
    expect(entry.prev_hash).toBeDefined();
  });
  test('verifies chain integrity', async () => {
    const ledger = new AuditLedger(new MockStore());
    await ledger.initialize();
    await ledger.record({ type: 'test', action: 'a' });
    await ledger.record({ type: 'test', action: 'b' });
    const result = await ledger.verify();
    expect(result.valid).toBe(true);
  });
});
