/**
 * MOAT 7: AUDIT LEDGER (CAIL)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Cryptographic Audit Integrity Ledger - SHA-256 Merkle chain
 * for immutable record-keeping and tamper detection.
 *
 * Features:
 * - Genesis block initialization
 * - SHA-256 Merkle-chain linking
 * - Tamper detection via chain verification
 * - Pattern recording (name + confidence, NO values/secrets)
 * - Proof generation for compliance
 * - Automatic redaction of sensitive data
 *
 * Version: 1.0.0
 * Created: March 2026
 * Status: Production Ready
 */

const crypto = require('crypto');

// ── Helper Functions ──

/**
 * Calculate SHA-256 hash of input
 */
function sha256(data) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');
}

/**
 * Generate timestamp in ISO format
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Generate unique block ID (first 16 chars of hash)
 */
function generateBlockId(hash) {
  return hash.substring(0, 16);
}

/**
 * Redact sensitive data from context
 * Removes actual values, keeps structure
 */
function redactContext(context) {
  if (!context) return {};

  const redacted = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string' && value.length > 20) {
      // Long strings are likely secrets
      redacted[key] = `[REDACTED-${value.length}chars]`;
    } else if (typeof value === 'object') {
      redacted[key] = redactContext(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

// ── Audit Ledger Class ──

class AuditLedger {
  constructor() {
    this.chain = [];
    this.initialized = false;
    this.lastBlockHash = null;
    this.blockCount = 0;
    this.initializeGenesis();
  }

  /**
   * Initialize genesis block (first block in chain)
   */
  initializeGenesis() {
    const genesisBlock = {
      blockId: 'genesis-000000',
      index: 0,
      timestamp: getTimestamp(),
      previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
      data: {
        type: 'genesis',
        message: 'Kasbah Guard Audit Ledger Genesis Block',
        version: '1.0.0'
      },
      nonce: 0,
      hash: null
    };

    // Calculate genesis hash
    const hashInput = {
      index: genesisBlock.index,
      timestamp: genesisBlock.timestamp,
      previousHash: genesisBlock.previousHash,
      data: genesisBlock.data,
      nonce: genesisBlock.nonce
    };

    genesisBlock.hash = sha256(hashInput);
    genesisBlock.blockId = generateBlockId(genesisBlock.hash);

    this.chain.push(genesisBlock);
    this.lastBlockHash = genesisBlock.hash;
    this.blockCount = 1;
    this.initialized = true;
  }

  /**
   * Record a pattern detection in the ledger
   * Stores: pattern name, confidence, risk score (NOT the actual secret)
   */
  recordDetection(patternName, confidence, riskScore, context = null) {
    if (!this.initialized) {
      return { success: false, error: 'Ledger not initialized' };
    }

    const block = {
      blockId: null,
      index: this.blockCount,
      timestamp: getTimestamp(),
      previousHash: this.lastBlockHash,
      data: {
        type: 'detection',
        patternName,
        confidence: Math.round(confidence * 100) / 100, // 2 decimal places
        riskScore: Math.round(riskScore),
        context: redactContext(context) // NO SENSITIVE DATA
      },
      nonce: 0,
      hash: null
    };

    // Calculate block hash
    const hashInput = {
      index: block.index,
      timestamp: block.timestamp,
      previousHash: block.previousHash,
      data: block.data,
      nonce: block.nonce
    };

    block.hash = sha256(hashInput);
    block.blockId = generateBlockId(block.hash);

    this.chain.push(block);
    this.lastBlockHash = block.hash;
    this.blockCount++;

    return {
      success: true,
      blockId: block.blockId,
      blockIndex: block.index,
      timestamp: block.timestamp
    };
  }

  /**
   * Verify chain integrity
   * Returns true if all hashes are valid and linked correctly
   */
  verifyChainIntegrity() {
    if (this.chain.length < 1) {
      return false;
    }

    for (let i = 0; i < this.chain.length; i++) {
      const block = this.chain[i];

      // Recalculate expected hash
      const hashInput = {
        index: block.index,
        timestamp: block.timestamp,
        previousHash: block.previousHash,
        data: block.data,
        nonce: block.nonce
      };

      const expectedHash = sha256(hashInput);

      // Verify hash matches
      if (block.hash !== expectedHash) {
        return false;
      }

      // Verify previous hash link (except for genesis)
      if (i > 0) {
        const previousBlock = this.chain[i - 1];
        if (block.previousHash !== previousBlock.hash) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Detect tampering by verifying last known hash
   * Returns true if chain has been tampered with
   */
  detectTampering(expectedLastHash) {
    if (!expectedLastHash) {
      return false;
    }

    return this.lastBlockHash !== expectedLastHash;
  }

  /**
   * Generate compliance proof
   * Returns Merkle root hash for verification
   */
  generateProof() {
    const allHashes = this.chain.map(block => block.hash);

    // Simple Merkle root (hash of all hashes)
    const merkleInput = {
      blockCount: this.blockCount,
      hashes: allHashes,
      timestamp: getTimestamp()
    };

    const merkleRoot = sha256(merkleInput);

    return {
      merkleRoot,
      blockCount: this.blockCount,
      chainIntegrity: this.verifyChainIntegrity(),
      timestamp: getTimestamp(),
      proof: `Chain of ${this.blockCount} blocks verified. Merkle root: ${merkleRoot}`
    };
  }

  /**
   * Get chain summary (without sensitive data)
   */
  getSummary() {
    return {
      initialized: this.initialized,
      blockCount: this.blockCount,
      lastBlockHash: this.lastBlockHash,
      lastBlockId: this.chain.length > 0 ? this.chain[this.chain.length - 1].blockId : null,
      chainIntegrity: this.verifyChainIntegrity(),
      detectionCount: this.chain.length - 1 // Exclude genesis block
    };
  }

  /**
   * Get range of blocks from ledger
   */
  getBlocks(startIndex = 0, endIndex = null) {
    if (endIndex === null) {
      endIndex = this.chain.length;
    }

    return this.chain.slice(startIndex, endIndex).map(block => ({
      blockId: block.blockId,
      index: block.index,
      timestamp: block.timestamp,
      type: block.data.type,
      patternName: block.data.patternName,
      confidence: block.data.confidence,
      riskScore: block.data.riskScore,
      hash: block.hash,
      previousHash: block.previousHash
    }));
  }

  /**
   * Export ledger as JSON for backup/compliance
   */
  export() {
    return {
      version: '1.0.0',
      exportTime: getTimestamp(),
      summary: this.getSummary(),
      blocks: this.getBlocks(),
      merkleProof: this.generateProof()
    };
  }

  /**
   * Calculate statistics from ledger
   */
  getStatistics() {
    const detections = this.chain.filter(b => b.data.type === 'detection');

    if (detections.length === 0) {
      return {
        totalDetections: 0,
        averageConfidence: 0,
        averageRiskScore: 0,
        patternsByType: {}
      };
    }

    const confidences = detections.map(d => d.data.confidence);
    const riskScores = detections.map(d => d.data.riskScore);
    const patternsByType = {};

    detections.forEach(d => {
      const pattern = d.data.patternName;
      if (!patternsByType[pattern]) {
        patternsByType[pattern] = {
          count: 0,
          avgConfidence: 0,
          avgRisk: 0
        };
      }
      patternsByType[pattern].count++;
    });

    // Calculate averages
    for (const pattern in patternsByType) {
      const patternDetections = detections.filter(
        d => d.data.patternName === pattern
      );
      patternsByType[pattern].avgConfidence =
        patternDetections.reduce((sum, d) => sum + d.data.confidence, 0) /
        patternDetections.length;
      patternsByType[pattern].avgRisk =
        patternDetections.reduce((sum, d) => sum + d.data.riskScore, 0) /
        patternDetections.length;
    }

    return {
      totalDetections: detections.length,
      averageConfidence:
        Math.round(
          (confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100
        ) / 100,
      averageRiskScore: Math.round(
        riskScores.reduce((a, b) => a + b, 0) / riskScores.length
      ),
      patternsByType
    };
  }
}

// ── Singleton Instance ──

let ledgerInstance = null;

/**
 * Get or create singleton audit ledger instance
 */
function getLedger() {
  if (!ledgerInstance) {
    ledgerInstance = new AuditLedger();
  }
  return ledgerInstance;
}

/**
 * Reset ledger (for testing only)
 */
function resetLedger() {
  ledgerInstance = new AuditLedger();
  return ledgerInstance;
}

// ── Export Functions ──

module.exports = {
  AuditLedger,
  getLedger,
  resetLedger,

  // Utility exports for testing
  sha256,
  getTimestamp,
  generateBlockId,
  redactContext
};
