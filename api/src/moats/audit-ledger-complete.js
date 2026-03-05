/**
 * Kasbah Guard — Hash-Chain Audit Ledger
 * 
 * Tamper-evident logging with SHA-256 Merkle chain
 */

const crypto = require('crypto');

class AuditLedger {
  constructor(store) {
    this.store = store;
    this.genesisHash = '0000000000000000000000000000000000000000000000000000000000000000';
  }

  async initialize() {
    const lastHash = await this.store.get('audit:last_hash');
    if (!lastHash) {
      await this.store.set('audit:last_hash', this.genesisHash);
      await this.store.set('audit:count', '0');
      await this.record({ type: 'genesis', action: 'ledger_initialized' });
    }
  }

  async record(entry) {
    const lastHash = await this.store.get('audit:last_hash') || this.genesisHash;
    const count = parseInt(await this.store.get('audit:count') || '0');
    const auditEntry = { id: count + 1, timestamp: Date.now(), prev_hash: lastHash, ...entry };
    const entryHash = this.hashEntry(auditEntry);
    auditEntry.hash = entryHash;
    await this.store.set(`audit:${auditEntry.id}`, JSON.stringify(auditEntry));
    await this.store.set('audit:last_hash', entryHash);
    await this.store.set('audit:count', (count + 1).toString());
    return auditEntry;
  }

  async verify() {
    const count = parseInt(await this.store.get('audit:count') || '0');
    let lastHash = this.genesisHash;
    const issues = [];
    for (let i = 1; i <= count; i++) {
      const stored = await this.store.get(`audit:${i}`);
      if (!stored) { issues.push({ id: i, issue: 'missing_entry' }); continue; }
      const entry = JSON.parse(stored);
      if (entry.prev_hash !== lastHash) issues.push({ id: i, issue: 'chain_broken', expected: lastHash, got: entry.prev_hash });
      const computedHash = this.hashEntry({ ...entry, hash: undefined });
      if (computedHash !== entry.hash) issues.push({ id: i, issue: 'hash_mismatch', expected: computedHash, got: entry.hash });
      lastHash = entry.hash;
    }
    return { valid: issues.length === 0, totalEntries: count, issues };
  }

  async export(startId = 1, endId = null) {
    const count = parseInt(await this.store.get('audit:count') || '0');
    endId = endId || count;
    const entries = [];
    for (let i = startId; i <= endId; i++) {
      const stored = await this.store.get(`audit:${i}`);
      if (stored) entries.push(JSON.parse(stored));
    }
    return { entries, merkleRoot: this.computeMerkleRoot(entries), exportedAt: Date.now() };
  }

  hashEntry(entry) {
    const { hash, ...entryWithoutHash } = entry;
    const data = JSON.stringify(entryWithoutHash);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  computeMerkleRoot(entries) {
    if (entries.length === 0) return this.genesisHash;
    let hashes = entries.map(e => e.hash);
    while (hashes.length > 1) {
      const newHashes = [];
      for (let i = 0; i < hashes.length; i += 2) {
        const left = hashes[i];
        const right = hashes[i + 1] || left;
        newHashes.push(crypto.createHash('sha256').update(left + right).digest('hex'));
      }
      hashes = newHashes;
    }
    return hashes[0];
  }

  async getStats() {
    const count = parseInt(await this.store.get('audit:count') || '0');
    const lastHash = await this.store.get('audit:last_hash');
    return { totalEntries: count, lastHash, genesisHash: this.genesisHash, integrity: lastHash ? 'valid' : 'uninitialized' };
  }
}

module.exports = { AuditLedger };
