/**
 * Kasbah Guard: Zero-Knowledge Proof Controller
 *
 * End-to-end ZK proof workflow for detections:
 * 1. Detection occurs in content.js
 * 2. Proof generation triggered by background.js
 * 3. Verification in popup.html
 * 4. Proof storage and auditing in chrome.storage.local
 */

const ZKProofController = (() => {
  // ─────────────────────────────────────────────────────────────────
  // PHASE 1: Proof Generation (background.js)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Generate complete ZK proof for a detection
   * Combines Schnorr sigma protocol with detection metadata
   *
   * @param {Object} detection - Detection result from content.js
   * @param {Object} sender - Message sender info (tab, url, frameId)
   * @returns {Promise<Object>} Complete proof object ready for storage
   */
  async function generateProof(detection, sender) {
    try {
      // Validate detection
      if (!detection || !detection.decision) {
        throw new Error('Invalid detection object');
      }

      // Step 1: Generate prover identity key (one per browser session)
      const proverKey = await generateProverKey();

      // Step 2: Create Schnorr commitment
      const { commitmentHex, ephemeralPrivateKey } = await proverCommit();

      // Step 3: Hash detection data
      const detectionHash = await hashDetection(detection);

      // Step 4: Generate challenge
      const challengeHex = await verifierChallenge(commitmentHex, detectionHash);

      // Step 5: Prover responds with signature
      const responseHex = await proverRespond(proverKey.privateKey, challengeHex);

      // Step 6: Verify locally (optional double-check)
      const localVerified = await verifierVerify(proverKey.publicKeyHex, challengeHex, responseHex);

      // Construct proof object
      const proof = {
        id: `zk-proof-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),

        // Schnorr sigma protocol components
        schnorr: {
          prover_public_key: proverKey.publicKeyHex,
          commitment: commitmentHex,
          challenge: challengeHex,
          response: responseHex,
          verified: localVerified,
        },

        // Detection metadata
        detection: {
          decision: detection.decision,
          risk_score: detection.risk || 0,
          reason: detection.reason || '',
          platform: detection.platform || 'unknown',
          detected_pattern: detection.pattern || '',
          content_hash: detectionHash,
        },

        // Source information
        source: {
          url: sender.url || '',
          tab_id: sender.tab?.id || null,
          tab_title: sender.tab?.title || 'Unknown',
          frame_id: sender.frameId || 0,
          timestamp: new Date().toISOString(),
        },

        // Compliance metadata
        compliance: {
          quantum_resistant: false,
          zk_verified: localVerified,
          blockchain_registered: false,
          ccl_level: determineComplianceLevel(detection),
        },

        // Versioning
        version: '1.0.0',
        protocol: 'Schnorr-ECDSA-P256',
      };

      return proof;
    } catch (error) {
      console.error('[ZKProofController] Proof generation failed:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // PHASE 2: Proof Verification (popup.html / popup.js)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Verify a stored ZK proof
   * Can be called from popup to verify detections before displaying
   *
   * @param {Object} proof - Proof object from storage
   * @returns {Promise<Object>} Verification result
   */
  async function verifyProof(proof) {
    try {
      if (!proof || !proof.schnorr) {
        throw new Error('Invalid proof object');
      }

      const { schnorr, detection } = proof;

      // Recalculate challenge to verify it was correctly formed
      const recalculatedChallenge = await verifierChallenge(
        schnorr.commitment,
        detection.content_hash
      );

      const challengeMatches = recalculatedChallenge === schnorr.challenge;

      // Verify the Schnorr proof
      const verified = await verifierVerify(
        schnorr.prover_public_key,
        schnorr.challenge,
        schnorr.response
      );

      return {
        id: proof.id,
        verified: verified && challengeMatches,
        challenge_valid: challengeMatches,
        signature_valid: verified,
        timestamp_created: proof.timestamp,
        proof_age_ms: Date.now() - new Date(proof.timestamp).getTime(),
      };
    } catch (error) {
      console.error('[ZKProofController] Proof verification failed:', error);
      return {
        verified: false,
        error: error.message,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // PHASE 3: Proof Storage & Audit Trail (background.js)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Store proof in chrome.storage.local with audit trail
   *
   * @param {Object} proof - Generated proof
   * @returns {Promise<boolean>} Success indicator
   */
  async function storeProof(proof) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['zk_proofs', 'proof_audit_log'], (result) => {
        try {
          const proofs = result.zk_proofs || [];
          const auditLog = result.proof_audit_log || [];

          // Add proof
          proofs.push(proof);

          // Keep only last 500 proofs
          if (proofs.length > 500) {
            proofs.shift();
          }

          // Add audit entry
          const auditEntry = {
            timestamp: new Date().toISOString(),
            action: 'proof_created',
            proof_id: proof.id,
            verified: proof.schnorr.verified,
            risk_score: proof.detection.risk_score,
            decision: proof.detection.decision,
          };

          auditLog.push(auditEntry);
          if (auditLog.length > 1000) {
            auditLog.shift();
          }

          // Store in chrome.storage.local
          chrome.storage.local.set(
            {
              zk_proofs: proofs,
              proof_audit_log: auditLog,
              last_proof_id: proof.id,
              last_proof_timestamp: proof.timestamp,
            },
            () => {
              if (chrome.runtime.lastError) {
                console.error('[ZKProofController] Storage error:', chrome.runtime.lastError);
                resolve(false);
              } else {
                console.log('[ZKProofController] Proof stored:', proof.id);
                resolve(true);
              }
            }
          );
        } catch (error) {
          console.error('[ZKProofController] Storage failed:', error);
          resolve(false);
        }
      });
    });
  }

  /**
   * Retrieve proof by ID
   */
  async function getProof(proofId) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['zk_proofs'], (result) => {
        const proofs = result.zk_proofs || [];
        const proof = proofs.find((p) => p.id === proofId);
        resolve(proof || null);
      });
    });
  }

  /**
   * Get recent proofs for display in popup
   */
  async function getRecentProofs(limit = 10) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['zk_proofs'], (result) => {
        const proofs = (result.zk_proofs || []).slice(-limit).reverse();
        resolve(proofs);
      });
    });
  }

  /**
   * Export proof audit log (for compliance/dashboard)
   */
  async function exportAuditLog(format = 'json') {
    return new Promise((resolve) => {
      chrome.storage.local.get(['proof_audit_log'], (result) => {
        const log = result.proof_audit_log || [];

        if (format === 'json') {
          resolve(JSON.stringify(log, null, 2));
        } else if (format === 'csv') {
          const csv = [
            'timestamp,action,proof_id,verified,risk_score,decision',
            ...log.map((e) =>
              `${e.timestamp},${e.action},${e.proof_id},${e.verified},${e.risk_score},${e.decision}`
            ),
          ].join('\n');
          resolve(csv);
        } else {
          resolve(log);
        }
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Hash detection data for inclusion in proof
   */
  async function hashDetection(detection) {
    const data = JSON.stringify({
      decision: detection.decision,
      platform: detection.platform,
      pattern: detection.pattern,
      reason: detection.reason,
      risk: detection.risk,
    });

    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Determine CCL (Compliance Classification Level) from detection
   */
  function determineComplianceLevel(detection) {
    const risk = detection.risk || 0;
    if (risk >= 0.8) return 'RESTRICTED';
    if (risk >= 0.5) return 'CONFIDENTIAL';
    if (risk >= 0.2) return 'INTERNAL';
    return 'PUBLIC';
  }

  // ─────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────

  return {
    generateProof,
    verifyProof,
    storeProof,
    getProof,
    getRecentProofs,
    exportAuditLog,
  };
})();

// Export for use in background.js and popup.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZKProofController;
}
