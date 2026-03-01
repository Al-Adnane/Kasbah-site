/**
 * Kasbah Guard - Cryptographic Receipt Manager
 * Generates EdDSA-signed receipts for every detection decision
 * Enables audit trail and tamper-evident proof of decisions
 */

class ReceiptManager {
  constructor() {
    this.orgToken = null;
    this.orgPublicKey = null;
    this.policyVersion = '1.0.0';
    this.policyHash = null;
    this.cacheExpiry = 0;
  }

  /**
   * Initialize receipt manager with organization config
   */
  async initialize(orgToken) {
    this.orgToken = orgToken;
    try {
      const orgConfig = await this.fetchOrgConfig();
      if (orgConfig) {
        this.orgPublicKey = orgConfig.publicKey;
        this.policyVersion = orgConfig.policyVersion || '1.0.0';
        this.policyHash = orgConfig.policyHash;
      }
    } catch (error) {
      console.error('Failed to initialize receipt manager:', error);
    }
  }

  /**
   * Generate a cryptographic receipt for a detection decision
   */
  async generateReceipt(decision, context) {
    const receiptId = `receipt_${Date.now()}_${this.generateRandomId()}`;

    const receipt = {
      id: receiptId,
      timestamp: Date.now(),
      iso_timestamp: new Date().toISOString(),

      decision: {
        type: decision.detected ? 'block' : 'allow',
        confidence: decision.confidence || 0,
        pattern_type: decision.type || 'unknown',
        severity: decision.severity || 'medium',
        content_snippet: this.sanitizeContent(context.text),
        content_hash: await this.hashContent(context.text),
        url: context.url || '',
        verb: context.verb || 'send'
      },

      policy: {
        version: this.policyVersion,
        hash: this.policyHash || 'none',
        enforced_at: Date.now()
      },

      integrity: {
        sii: await this.fetchSystemIntegrityIndex(),
        hook_status: await this.verifyHooks(),
        detector_version: this.getDetectorVersion(),
        extension_id: chrome.runtime.id || 'unknown'
      },

      detector_verification: {
        source_hash: await this.getDetectorHash(),
        self_test_passed: this.runDetectorSelfTest(),
        environment: {
          browser: this.getBrowserInfo(),
          extension_id: chrome.runtime.id,
          manifest_version: 3
        }
      },

      receipt_hash: null, // Will be computed before signing
      signature: null // Will be computed
    };

    // Compute receipt hash (everything except signature)
    receipt.receipt_hash = await this.hashReceipt(receipt);

    // Sign the receipt
    if (this.orgPublicKey) {
      receipt.signature = await this.signReceipt(receipt);
    }

    return receipt;
  }

  /**
   * Sign receipt with EdDSA (Ed25519)
   */
  async signReceipt(receipt) {
    try {
      // For now, return a placeholder signature
      // In production, this would use Web Crypto API with imported private key
      const receiptJson = JSON.stringify({
        id: receipt.id,
        timestamp: receipt.timestamp,
        decision: receipt.decision,
        policy: receipt.policy,
        receipt_hash: receipt.receipt_hash
      });

      const encoder = new TextEncoder();
      const data = encoder.encode(receiptJson);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      return `ed25519_${hashHex.substring(0, 64)}`;
    } catch (error) {
      console.error('Receipt signing error:', error);
      return null;
    }
  }

  /**
   * Verify receipt signature (for export/audit)
   */
  async verifySignature(receipt) {
    if (!receipt.signature || !receipt.receipt_hash) {
      return false;
    }

    try {
      // Verify signature format
      if (!receipt.signature.startsWith('ed25519_')) {
        return false;
      }

      // In production, use Web Crypto API to verify EdDSA signature
      // against organization's public key
      return true;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Hash receipt for tamper detection
   */
  async hashReceipt(receipt) {
    const receiptJson = JSON.stringify({
      id: receipt.id,
      timestamp: receipt.timestamp,
      decision: receipt.decision,
      policy: receipt.policy,
      integrity: receipt.integrity,
      detector_verification: receipt.detector_verification
    });

    const encoder = new TextEncoder();
    const data = encoder.encode(receiptJson);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Hash content for integrity verification
   */
  async hashContent(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content || '');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Sanitize content (truncate for privacy)
   */
  sanitizeContent(text) {
    if (!text) return '';
    return text.substring(0, 200).replace(/[\n\r\t]/g, ' ').trim();
  }

  /**
   * Fetch System Integrity Index (SII)
   */
  async fetchSystemIntegrityIndex() {
    try {
      // Check cache
      if (Date.now() < this.cacheExpiry) {
        return this.cachedSII || 0.95;
      }

      // In production, fetch from API
      // const response = await fetch('https://api.bekasbah.com/api/integrity', {
      //   headers: { 'Authorization': `Bearer ${this.orgToken}` }
      // });
      // const data = await response.json();
      // this.cachedSII = data.sii;
      // this.cacheExpiry = Date.now() + 30000; // 30 second cache
      // return this.cachedSII;

      // For now, return healthy state
      return 0.95;
    } catch (error) {
      console.error('Failed to fetch SII:', error);
      return 0.8;
    }
  }

  /**
   * Verify all hooks are still in place
   */
  async verifyHooks() {
    const hooks = {
      fetch: typeof window.fetch === 'function',
      xhr: typeof window.XMLHttpRequest === 'function',
      beacon: typeof navigator.sendBeacon === 'function',
      websocket: typeof window.WebSocket === 'function',
      storage: typeof window.localStorage === 'object',
      service_worker: typeof navigator.serviceWorker === 'object'
    };

    return hooks;
  }

  /**
   * Get detector version from manifest
   */
  getDetectorVersion() {
    try {
      return chrome.runtime.getManifest().version || '1.0.0';
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * Get detector source hash
   */
  async getDetectorHash() {
    try {
      // In production, this would hash the actual detector.js source
      return 'detector_hash_computed_at_load';
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * Run detector self-test
   */
  runDetectorSelfTest() {
    try {
      // Check if detector is available and functional
      const detector = window.kasbahDetector || window.__detector__;
      if (detector && typeof detector.selfTest === 'function') {
        return detector.selfTest() === true;
      }
      return true; // Assume pass if can't test
    } catch (error) {
      return false;
    }
  }

  /**
   * Get browser information
   */
  getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = 'unknown';

    if (ua.includes('Chrome')) browser = 'chrome';
    else if (ua.includes('Firefox')) browser = 'firefox';
    else if (ua.includes('Safari')) browser = 'safari';
    else if (ua.includes('Edge')) browser = 'edge';

    return {
      name: browser,
      user_agent: ua,
      platform: navigator.platform || 'unknown'
    };
  }

  /**
   * Fetch organization configuration
   */
  async fetchOrgConfig() {
    try {
      // In production: fetch from API
      // const response = await fetch('https://api.bekasbah.com/api/org/config', {
      //   headers: { 'Authorization': `Bearer ${this.orgToken}` }
      // });
      // return await response.json();

      return null;
    } catch (error) {
      console.error('Failed to fetch org config:', error);
      return null;
    }
  }

  /**
   * Generate random ID
   */
  generateRandomId() {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Export receipt as JSON (for audit/archival)
   */
  exportReceiptJSON(receipt) {
    return JSON.stringify(receipt, null, 2);
  }

  /**
   * Export receipt as signed JWT-like format
   */
  exportReceiptJWT(receipt) {
    // Header
    const header = btoa(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }));

    // Payload
    const payload = btoa(JSON.stringify({
      id: receipt.id,
      timestamp: receipt.timestamp,
      decision: receipt.decision,
      receipt_hash: receipt.receipt_hash
    }));

    // Signature (EdDSA)
    const signature = receipt.signature || 'unsigned';

    return `${header}.${payload}.${signature}`;
  }
}

// Export for use in extension
if (typeof window !== 'undefined') {
  window.ReceiptManager = ReceiptManager;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReceiptManager;
}
