/**
 * Kasbah Guard — Cryptographic Decision Receipts
 * 
 * EdDSA-signed decision records with hash-chain integrity
 * Provides cryptographically verifiable proof of detection decisions
 */

const crypto = require('crypto');

class CryptoReceipts {
  constructor(store) {
    this.store = store;
    this.orgKeys = new Map(); // Cache of org key pairs
  }

  /**
   * Generate EdDSA key pair for organization
   */
  async generateOrgKeyPair(orgId) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    
    const keyPair = {
      orgId,
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      createdAt: Date.now()
    };

    // Store private key encrypted
    const encrypted = this.encryptPrivateKey(keyPair.privateKey, orgId);
    await this.store.set(`org:${orgId}:keys`, JSON.stringify({
      ...keyPair,
      privateKey: encrypted
    }));

    this.orgKeys.set(orgId, keyPair);
    return { publicKey: keyPair.publicKey, createdAt: keyPair.createdAt };
  }

  /**
   * Create signed decision receipt
   */
  async createReceipt(decision) {
    const { orgId, decisionId, timestamp, risk, violatedPatterns, action } = decision;
    
    // Get or generate org keys
    let keyPair = this.orgKeys.get(orgId);
    if (!keyPair) {
      const stored = await this.store.get(`org:${orgId}:keys`);
      if (!stored) {
        await this.generateOrgKeyPair(orgId);
        keyPair = this.orgKeys.get(orgId);
      } else {
        keyPair = JSON.parse(stored);
        keyPair.privateKey = this.decryptPrivateKey(keyPair.privateKey, orgId);
        this.orgKeys.set(orgId, keyPair);
      }
    }

    // Get last receipt hash for chain
    const lastHash = await this.store.get(`org:${orgId}:receipt:last_hash`) || '0000000000000000000000000000000000000000000000000000000000000000';

    // Create receipt structure
    const receipt = {
      receiptId: crypto.randomBytes(16).toString('hex'),
      orgId,
      decisionId,
      timestamp,
      risk,
      violatedPatterns,
      action,
      prev_hash: lastHash,
      version: '1.0'
    };

    // Sign receipt
    const dataToSign = JSON.stringify({
      receiptId: receipt.receiptId,
      orgId: receipt.orgId,
      decisionId: receipt.decisionId,
      timestamp: receipt.timestamp,
      risk: receipt.risk,
      action: receipt.action,
      prev_hash: receipt.prev_hash
    });

    const privateKey = crypto.createPrivateKey(keyPair.privateKey);
    const signature = crypto.sign(null, Buffer.from(dataToSign), privateKey);

    receipt.signature = signature.toString('hex');
    receipt.publicKey = keyPair.publicKey;

    // Compute receipt hash
    receipt.hash = crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex');

    // Store receipt
    await this.store.set(`org:${orgId}:receipts:${receipt.receiptId}`, JSON.stringify(receipt));
    await this.store.set(`org:${orgId}:receipt:last_hash`, receipt.hash);
    await this.store.incr(`org:${orgId}:receipt:count`);

    return receipt;
  }

  /**
   * Verify receipt signature
   */
  async verifyReceipt(receipt) {
    const { signature, publicKey, ...receiptWithoutSig } = receipt;
    
    const dataToVerify = JSON.stringify({
      receiptId: receipt.receiptId,
      orgId: receipt.orgId,
      decisionId: receipt.decisionId,
      timestamp: receipt.timestamp,
      risk: receipt.risk,
      action: receipt.action,
      prev_hash: receipt.prev_hash
    });

    try {
      const pubKey = crypto.createPublicKey(publicKey);
      const sigBuffer = Buffer.from(signature, 'hex');
      const valid = crypto.verify(null, Buffer.from(dataToVerify), pubKey, sigBuffer);
      
      return { valid, reason: valid ? 'signature_valid' : 'signature_invalid' };
    } catch (error) {
      return { valid: false, reason: `verification_error: ${error.message}` };
    }
  }

  /**
   * Verify receipt chain integrity
   */
  async verifyChain(orgId, startReceiptId = null) {
    const count = parseInt(await this.store.get(`org:${orgId}:receipt:count`) || '0');
    let lastHash = '0000000000000000000000000000000000000000000000000000000000000000';
    const issues = [];

    // Get all receipt IDs
    const keys = await this.store.keys(`org:${orgId}:receipts:`);
    
    for (const key of keys.sort()) {
      const stored = await this.store.get(key);
      if (!stored) {
        issues.push({ receiptId: key, issue: 'missing_receipt' });
        continue;
      }

      const receipt = JSON.parse(stored);
      
      // Verify chain
      if (receipt.prev_hash !== lastHash) {
        issues.push({ 
          receiptId: receipt.receiptId, 
          issue: 'chain_broken', 
          expected: lastHash, 
          got: receipt.prev_hash 
        });
      }

      // Verify signature
      const sigResult = await this.verifyReceipt(receipt);
      if (!sigResult.valid) {
        issues.push({ 
          receiptId: receipt.receiptId, 
          issue: 'signature_invalid',
          reason: sigResult.reason 
        });
      }

      lastHash = receipt.hash;
    }

    return {
      valid: issues.length === 0,
      totalReceipts: keys.length,
      issues
    };
  }

  /**
   * Export receipts for compliance
   */
  async exportReceipts(orgId, startId = null, endId = null) {
    const receipts = [];
    const keys = await this.store.keys(`org:${orgId}:receipts:`);
    
    for (const key of keys.sort()) {
      const stored = await this.store.get(key);
      if (stored) {
        receipts.push(JSON.parse(stored));
      }
    }

    // Compute Merkle root
    const merkleRoot = this.computeMerkleRoot(receipts.map(r => r.hash));

    return {
      orgId,
      receipts,
      merkleRoot,
      exportedAt: Date.now(),
      count: receipts.length
    };
  }

  /**
   * Compute Merkle root from receipt hashes
   */
  computeMerkleRoot(hashes) {
    if (hashes.length === 0) return '0000000000000000000000000000000000000000000000000000000000000000';
    
    let currentLevel = hashes;
    while (currentLevel.length > 1) {
      const nextLevel = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] || left;
        const combined = crypto.createHash('sha256').update(left + right).digest('hex');
        nextLevel.push(combined);
      }
      currentLevel = nextLevel;
    }
    
    return currentLevel[0];
  }

  /**
   * Encrypt private key (simplified - use proper KMS in production)
   */
  encryptPrivateKey(privateKey, orgId) {
    // In production: use AWS KMS, HashiCorp Vault, etc.
    return Buffer.from(privateKey).toString('base64');
  }

  /**
   * Decrypt private key
   */
  decryptPrivateKey(encrypted, orgId) {
    return Buffer.from(encrypted, 'base64').toString('utf8');
  }

  /**
   * Get receipt statistics
   */
  async getStats(orgId) {
    const count = parseInt(await this.store.get(`org:${orgId}:receipt:count`) || '0');
    const lastHash = await this.store.get(`org:${orgId}:receipt:last_hash`);
    
    return {
      totalReceipts: count,
      lastHash,
      hasKeys: this.orgKeys.has(orgId)
    };
  }
}

module.exports = { CryptoReceipts };
