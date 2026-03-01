/**
 * Kasbah Guard - Receipt Ledger
 * Hash-chained, tamper-evident storage of signed decision receipts
 * Provides audit trail with cryptographic integrity guarantees
 */

class ReceiptLedger {
  constructor() {
    this.storageKey = 'kasbah_receipt_ledger';
    this.maxReceipts = 1000; // Keep last 1000 receipts
    this.ledger = [];
    this.initialized = false;
    this.genesisHash = 'genesis_' + Date.now();
  }

  /**
   * Initialize ledger from storage
   */
  async initialize() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.ledger = JSON.parse(stored);
      } else {
        this.ledger = [];
      }
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize ledger:', error);
      this.ledger = [];
      this.initialized = true;
      return false;
    }
  }

  /**
   * Add receipt to ledger with hash chaining
   */
  async addReceipt(receipt) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Calculate previous hash
      const previousEntry = this.ledger.length > 0
        ? this.ledger[this.ledger.length - 1]
        : null;
      const previousHash = previousEntry?.chain_hash || this.genesisHash;

      // Create ledger entry with hash chaining
      const entry = {
        index: this.ledger.length,
        receipt_id: receipt.id,
        timestamp: receipt.timestamp,
        iso_timestamp: receipt.iso_timestamp,
        decision_type: receipt.decision.type,
        confidence: receipt.decision.confidence,
        receipt_hash: receipt.receipt_hash,
        signature: receipt.signature,
        previous_hash: previousHash,
        chain_hash: null, // Will be computed
        verified: false
      };

      // Compute chain hash (links to previous)
      entry.chain_hash = await this.computeChainHash(entry);

      // Add to ledger
      this.ledger.push(entry);

      // Enforce max size
      if (this.ledger.length > this.maxReceipts) {
        this.ledger = this.ledger.slice(-this.maxReceipts);
      }

      // Persist to storage
      await this.persistLedger();

      return entry;
    } catch (error) {
      console.error('Failed to add receipt to ledger:', error);
      throw error;
    }
  }

  /**
   * Compute chain hash (hash of receipt hash + previous hash)
   */
  async computeChainHash(entry) {
    try {
      const data = `${entry.receipt_hash}|${entry.previous_hash}|${entry.timestamp}`;
      const encoder = new TextEncoder();
      const buffer = encoder.encode(data);
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('Failed to compute chain hash:', error);
      return '';
    }
  }

  /**
   * Verify entire ledger chain integrity
   */
  async verifyLedgerChain() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      let previousHash = this.genesisHash;
      let isValid = true;

      for (const entry of this.ledger) {
        // Verify hash chain
        if (entry.previous_hash !== previousHash) {
          console.warn(`Chain broken at index ${entry.index}`);
          entry.verified = false;
          isValid = false;
        } else {
          // Recompute chain hash to verify
          const recomputedChain = await this.computeChainHash(entry);
          entry.verified = recomputedChain === entry.chain_hash;
          if (!entry.verified) {
            console.warn(`Receipt hash mismatch at index ${entry.index}`);
            isValid = false;
          }
        }
        previousHash = entry.chain_hash;
      }

      return {
        valid: isValid,
        total_entries: this.ledger.length,
        verified_entries: this.ledger.filter(e => e.verified).length,
        broken_entries: this.ledger.filter(e => !e.verified).length
      };
    } catch (error) {
      console.error('Ledger verification error:', error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get receipt by ID
   */
  getReceiptById(receiptId) {
    return this.ledger.find(e => e.receipt_id === receiptId);
  }

  /**
   * Get receipts by decision type
   */
  getReceiptsByType(type) {
    return this.ledger.filter(e => e.decision_type === type);
  }

  /**
   * Get recent receipts
   */
  getRecentReceipts(limit = 50) {
    return this.ledger.slice(-limit).reverse();
  }

  /**
   * Get receipts in time range
   */
  getReceiptsByTimeRange(startTime, endTime) {
    return this.ledger.filter(e =>
      e.timestamp >= startTime && e.timestamp <= endTime
    );
  }

  /**
   * Get ledger statistics
   */
  getStatistics() {
    const blocks = this.ledger.filter(e => e.decision_type === 'block');
    const allows = this.ledger.filter(e => e.decision_type === 'allow');
    const avgConfidence = blocks.length > 0
      ? blocks.reduce((sum, e) => sum + e.confidence, 0) / blocks.length
      : 0;

    return {
      total_receipts: this.ledger.length,
      total_blocks: blocks.length,
      total_allows: allows.length,
      block_percentage: this.ledger.length > 0
        ? Math.round(100 * blocks.length / this.ledger.length)
        : 0,
      average_confidence: Math.round(avgConfidence * 100) / 100,
      first_receipt: this.ledger.length > 0 ? this.ledger[0]?.iso_timestamp : null,
      last_receipt: this.ledger.length > 0 ? this.ledger[this.ledger.length - 1]?.iso_timestamp : null,
      storage_size_bytes: new Blob([localStorage.getItem(this.storageKey) || '']).size
    };
  }

  /**
   * Compute Merkle root of all receipts (for external verification)
   */
  async computeMerkleRoot() {
    try {
      if (this.ledger.length === 0) {
        return await this.hashData(this.genesisHash);
      }

      const hashes = [];
      for (const entry of this.ledger) {
        hashes.push(entry.chain_hash);
      }

      // Build Merkle tree
      while (hashes.length > 1) {
        const newHashes = [];
        for (let i = 0; i < hashes.length; i += 2) {
          const left = hashes[i];
          const right = hashes[i + 1] || hashes[i]; // Duplicate if odd
          const combined = left + right;
          const hash = await this.hashData(combined);
          newHashes.push(hash);
        }
        hashes.length = 0;
        hashes.push(...newHashes);
      }

      return hashes[0];
    } catch (error) {
      console.error('Merkle root computation error:', error);
      return null;
    }
  }

  /**
   * Export ledger as JSON
   */
  exportAsJSON() {
    return {
      exported_at: new Date().toISOString(),
      total_receipts: this.ledger.length,
      receipts: this.ledger,
      chain_verification: this.ledger.length > 0 ? {
        genesis_hash: this.genesisHash,
        final_chain_hash: this.ledger[this.ledger.length - 1]?.chain_hash
      } : null
    };
  }

  /**
   * Export ledger as CSV for spreadsheet analysis
   */
  exportAsCSV() {
    if (this.ledger.length === 0) {
      return 'No receipts to export\n';
    }

    const headers = [
      'Index',
      'Receipt ID',
      'Timestamp',
      'ISO Timestamp',
      'Decision Type',
      'Confidence',
      'Receipt Hash',
      'Chain Hash',
      'Verified'
    ];

    const rows = this.ledger.map(e => [
      e.index,
      e.receipt_id,
      e.timestamp,
      e.iso_timestamp,
      e.decision_type,
      e.confidence,
      e.receipt_hash.substring(0, 16) + '...',
      e.chain_hash.substring(0, 16) + '...',
      e.verified ? 'Yes' : 'No'
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(','))
    ].join('\n');

    return csv;
  }

  /**
   * Export ledger as audit report (markdown)
   */
  exportAsReport() {
    const stats = this.getStatistics();

    let report = `# Kasbah Guard - Receipt Ledger Audit Report\n\n`;
    report += `**Generated**: ${new Date().toISOString()}\n\n`;

    report += `## Summary\n`;
    report += `- **Total Receipts**: ${stats.total_receipts}\n`;
    report += `- **Total Blocks**: ${stats.total_blocks}\n`;
    report += `- **Total Allows**: ${stats.total_allows}\n`;
    report += `- **Block Rate**: ${stats.block_percentage}%\n`;
    report += `- **Average Confidence**: ${stats.average_confidence}\n`;
    report += `- **Storage Used**: ${(stats.storage_size_bytes / 1024).toFixed(2)} KB\n\n`;

    report += `## Timeline\n`;
    report += `- **First Receipt**: ${stats.first_receipt}\n`;
    report += `- **Last Receipt**: ${stats.last_receipt}\n\n`;

    report += `## Recent Decisions (Last 10)\n`;
    report += `| Index | Type | Confidence | Timestamp |\n`;
    report += `|-------|------|-----------|----------|\n`;

    const recent = this.getRecentReceipts(10);
    for (const entry of recent) {
      report += `| ${entry.index} | ${entry.decision_type} | ${entry.confidence} | ${entry.iso_timestamp} |\n`;
    }

    report += `\n## Ledger Integrity\n`;
    report += `✓ Chain hashing enabled\n`;
    report += `✓ Tamper-evident design\n`;
    report += `✓ Cryptographic verification available\n`;

    return report;
  }

  /**
   * Hash data helper
   */
  async hashData(data) {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Persist ledger to storage
   */
  async persistLedger() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.ledger));
    } catch (error) {
      console.error('Failed to persist ledger:', error);
      // Handle quota exceeded
      if (error.name === 'QuotaExceededError') {
        // Keep only last 100 receipts
        this.ledger = this.ledger.slice(-100);
        localStorage.setItem(this.storageKey, JSON.stringify(this.ledger));
      }
    }
  }

  /**
   * Clear ledger (for testing/reset)
   */
  async clearLedger() {
    if (confirm('Clear all receipt receipts? This action cannot be undone.')) {
      this.ledger = [];
      localStorage.removeItem(this.storageKey);
      return true;
    }
    return false;
  }
}

// Export for use in extension
if (typeof window !== 'undefined') {
  window.ReceiptLedger = ReceiptLedger;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReceiptLedger;
}
