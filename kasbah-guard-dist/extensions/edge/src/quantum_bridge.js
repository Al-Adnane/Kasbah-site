/**
 * Kasbah Guard: Quantum Crypto Bridge v1.0.0
 *
 * Extension ↔ Tauri Backend Bridge
 * Communicates with Tauri IPC for quantum-safe cryptographic operations
 *
 * Usage in content.js or background.js:
 *   const sig = await quantumBridge.signDetection(detectionId, hash, verdict, risk);
 *   const valid = await quantumBridge.verifyDetection(sig);
 */

/**
 * QuantumBridge: IPC communication layer
 * Detects Tauri availability and provides fallback behavior
 */
class QuantumBridge {
  constructor() {
    this.enabled = window.__TAURI__ !== undefined;
    this.timeout = 5000; // 5 second timeout for IPC calls
    this.logger = this._createLogger();
  }

  _createLogger() {
    return {
      info: (msg) => console.log(`[QuantumBridge] ℹ️ ${msg}`),
      warn: (msg) => console.warn(`[QuantumBridge] ⚠️ ${msg}`),
      error: (msg) => console.error(`[QuantumBridge] ❌ ${msg}`),
    };
  }

  /**
   * Sign detection: Generate Dilithium-2 quantum-safe signature
   *
   * Parameters:
   *   - detectionId: Unique detection identifier (UUID)
   *   - contentHash: SHA-256 hash of detected content (hex string, 64 chars)
   *   - verdict: Classification ("DEEPFAKE", "AUTHENTIC", "WARN")
   *   - riskScore: Confidence 0-100
   *
   * Returns: Promise<QuantumSignatureResult | null>
   *   {
   *     detection_id: string
   *     scheme: "Dilithium2" | "SPHINCS256"
   *     signature: string (hex-encoded)
   *     public_key: string (hex-encoded)
   *     timestamp: number
   *     content_hash: string
   *   }
   *
   * Returns null if Tauri unavailable (fallback behavior)
   */
  async signDetection(detectionId, contentHash, verdict, riskScore) {
    if (!this.enabled) {
      this.logger.warn(
        'Tauri not available, skipping quantum signature (extension-only mode)'
      );
      return null;
    }

    if (!this._validateSignInput(detectionId, contentHash, verdict, riskScore)) {
      return null;
    }

    try {
      // Create timeout wrapper
      const promise = window.__TAURI__.invoke('sign_detection', {
        detection_id: detectionId,
        content_hash: contentHash,
        verdict: verdict,
        risk_score: riskScore,
      });

      const result = await Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tauri timeout')), this.timeout)
        ),
      ]);

      this.logger.info(
        `Signature generated: scheme=${result.scheme} detection_id=${detectionId}`
      );
      return result;
    } catch (error) {
      this.logger.error(`Signature failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Verify detection: Validate quantum signature
   *
   * Parameters:
   *   - signedDetection: QuantumSignatureResult (from signDetection)
   *
   * Returns: Promise<boolean>
   *   true = signature valid
   *   false = signature invalid or verification failed
   */
  async verifyDetection(signedDetection) {
    if (!this.enabled) {
      this.logger.warn('Tauri not available, skipping verification');
      return false;
    }

    if (!signedDetection || !signedDetection.detection_id) {
      this.logger.error('Invalid signed detection object');
      return false;
    }

    try {
      const result = await Promise.race([
        window.__TAURI__.invoke('verify_detection', {
          signed_json: JSON.stringify(signedDetection),
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tauri timeout')), this.timeout)
        ),
      ]);

      this.logger.info(
        `Verification: is_valid=${result.is_valid} detection_id=${result.detection_id}`
      );
      return result.is_valid || false;
    } catch (error) {
      this.logger.error(`Verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Export audit proof: Generate compliance-ready audit report
   *
   * Parameters:
   *   - signedDetection: QuantumSignatureResult
   *   - metadata: Optional metadata object
   *
   * Returns: Promise<string>
   *   Formatted audit proof report (ready for PDF export)
   */
  async exportAuditProof(signedDetection, metadata = null) {
    if (!this.enabled) {
      this.logger.warn('Tauri not available, cannot export proof');
      return null;
    }

    try {
      const metadataJson = metadata ? JSON.stringify(metadata) : null;

      const proof = await Promise.race([
        window.__TAURI__.invoke('export_audit_proof', {
          signed_json: JSON.stringify(signedDetection),
          metadata: metadataJson,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tauri timeout')), this.timeout)
        ),
      ]);

      this.logger.info('Audit proof exported');
      return proof;
    } catch (error) {
      this.logger.error(`Audit export failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Get Tauri availability status
   */
  isAvailable() {
    return this.enabled;
  }

  // ─────────────────────────────────────────────────────
  // Private Validation Methods
  // ─────────────────────────────────────────────────────

  _validateSignInput(detectionId, contentHash, verdict, riskScore) {
    if (!detectionId || detectionId.length === 0) {
      this.logger.error('detectionId cannot be empty');
      return false;
    }

    if (!contentHash || contentHash.length < 64) {
      this.logger.error('contentHash must be 64+ character SHA-256 hex string');
      return false;
    }

    const validVerdicts = ['DEEPFAKE', 'AUTHENTIC', 'WARN'];
    if (!validVerdicts.includes(verdict)) {
      this.logger.error(`verdict must be one of: ${validVerdicts.join(', ')}`);
      return false;
    }

    if (typeof riskScore !== 'number' || riskScore < 0 || riskScore > 100) {
      this.logger.error('riskScore must be number between 0-100');
      return false;
    }

    return true;
  }
}

/**
 * Global singleton instance
 * Available on window object for cross-script access
 */
const quantumBridge = new QuantumBridge();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QuantumBridge;
}

/**
 * Example Usage (in detector.js or content.js)
 *
 * async function classifyWithQuantumSignature(content) {
 *   const verdict = classify(content);
 *
 *   // Sign detection if Tauri available
 *   if (quantumBridge.isAvailable()) {
 *     const signature = await quantumBridge.signDetection(
 *       generateDetectionId(),
 *       sha256(content),
 *       verdict.decision,
 *       verdict.risk
 *     );
 *
 *     if (signature) {
 *       verdict.quantumSignature = signature;
 *       console.log('Detection signed with Dilithium-2');
 *     }
 *   }
 *
 *   return verdict;
 * }
 */
