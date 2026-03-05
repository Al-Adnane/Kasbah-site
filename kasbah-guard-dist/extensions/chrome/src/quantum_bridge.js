/**
 * Kasbah Guard: Ed25519 Signature Bridge v2.0.0
 *
 * Provides Ed25519 digital signatures for detection results using
 * Web Crypto API (SubtleCrypto). Works in browser extension context
 * without any external dependencies.
 *
 * HONEST STATUS:
 * - Ed25519 via SubtleCrypto (real signatures, extension-native)
 * - Tauri IPC path retained for desktop app context
 * - No Dilithium/SPHINCS+ (PQC upgrade pending liboqs WASM port)
 *
 * Usage:
 *   const sig = await ed25519Bridge.signDetection(detectionId, hash, verdict, risk);
 *   const valid = await ed25519Bridge.verifyDetection(sig);
 */

/**
 * Ed25519SignatureBridge: Web Crypto Ed25519 signing for browser extensions.
 * Falls back to Tauri IPC when running inside the desktop app.
 */
class Ed25519SignatureBridge {
  constructor() {
    this._keyPair = null;           // CryptoKeyPair (generated on first use)
    this._keyPairReady = null;      // Promise<CryptoKeyPair>
    this._tauriAvailable = typeof window !== 'undefined' && window.__TAURI__ !== undefined;
    this.timeout = 5000;
    this._log = {
      info:  (m) => console.debug('[Ed25519Bridge] ℹ️', m),
      warn:  (m) => console.warn('[Ed25519Bridge] ⚠️', m),
      error: (m) => console.error('[Ed25519Bridge] ❌', m),
    };
  }

  // ── Key Management ──────────────────────────────────────────────────────

  async _getKeyPair() {
    if (this._keyPair) return this._keyPair;
    if (this._keyPairReady) return this._keyPairReady;

    this._keyPairReady = (async () => {
      // Check if stored in session
      const stored = await this._loadStoredKey();
      if (stored) {
        this._keyPair = stored;
        return stored;
      }
      // Generate fresh Ed25519 key pair
      const kp = await crypto.subtle.generateKey(
        { name: 'Ed25519' },
        true,   // extractable for export
        ['sign', 'verify']
      );
      this._keyPair = kp;
      await this._storeKey(kp);
      return kp;
    })();

    return this._keyPairReady;
  }

  async _storeKey(kp) {
    try {
      const raw = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
      const hex = Array.from(new Uint8Array(raw)).map(b => b.toString(16).padStart(2,'0')).join('');
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.session.set({ _ed25519_pk: hex }).catch(() => {});
      }
    } catch (_) { /* non-fatal */ }
  }

  async _loadStoredKey() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) return null;
      const data = await new Promise(r => chrome.storage.session.get(['_ed25519_pk'], r));
      if (!data._ed25519_pk) return null;
      const buf = new Uint8Array(data._ed25519_pk.match(/.{2}/g).map(h => parseInt(h, 16)));
      const priv = await crypto.subtle.importKey('pkcs8', buf.buffer, { name: 'Ed25519' }, true, ['sign']);
      const raw = await crypto.subtle.exportKey('raw', priv);
      const pub = await crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, true, ['verify']);
      return { privateKey: priv, publicKey: pub };
    } catch (_) { return null; }
  }

  async _getPublicKeyHex() {
    const kp = await this._getKeyPair();
    const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
    return Array.from(new Uint8Array(raw)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Sign a detection result with Ed25519.
   *
   * @param {string} detectionId - Unique detection identifier
   * @param {string} contentHash - SHA-256 hex hash of detected content
   * @param {string} verdict - 'BLOCK'|'WARN'|'ALLOW'
   * @param {number} riskScore - 0–100
   * @returns {Promise<{detection_id, scheme, signature, public_key, timestamp, content_hash}|null>}
   */
  async signDetection(detectionId, contentHash, verdict, riskScore) {
    if (!this._validateInput(detectionId, contentHash, verdict, riskScore)) return null;

    // Prefer Tauri IPC in desktop context (real Dilithium if available)
    if (this._tauriAvailable) {
      return this._signViaTauri(detectionId, contentHash, verdict, riskScore);
    }

    try {
      const kp = await this._getKeyPair();
      const payload = JSON.stringify({ detectionId, contentHash, verdict, riskScore });
      const msgBuf = new TextEncoder().encode(payload);
      const sigBuf = await crypto.subtle.sign('Ed25519', kp.privateKey, msgBuf);
      const sigHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
      const pubHex = await this._getPublicKeyHex();

      this._log.info(`Signed detection ${detectionId} (Ed25519, ${sigHex.length / 2} bytes)`);

      return {
        detection_id: detectionId,
        scheme: 'Ed25519',           // honest: classical, not PQC
        pqc_note: 'PQC upgrade pending (liboqs WASM)',
        signature: sigHex,
        public_key: pubHex,
        timestamp: Date.now(),
        content_hash: contentHash,
        payload_signed: payload,
      };
    } catch (err) {
      this._log.error(`Sign failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Verify an Ed25519 signed detection.
   *
   * @param {object} signedDetection - Result from signDetection()
   * @returns {Promise<boolean>}
   */
  async verifyDetection(signedDetection) {
    if (!signedDetection || !signedDetection.signature || !signedDetection.public_key) {
      this._log.error('Invalid signed detection object');
      return false;
    }

    if (this._tauriAvailable && signedDetection.scheme !== 'Ed25519') {
      return this._verifyViaTauri(signedDetection);
    }

    try {
      const sigBuf = new Uint8Array(signedDetection.signature.match(/.{2}/g).map(h => parseInt(h, 16)));
      const pubBuf = new Uint8Array(signedDetection.public_key.match(/.{2}/g).map(h => parseInt(h, 16)));
      const pubKey = await crypto.subtle.importKey('raw', pubBuf.buffer, { name: 'Ed25519' }, false, ['verify']);
      const msgBuf = new TextEncoder().encode(signedDetection.payload_signed || '');
      const valid = await crypto.subtle.verify('Ed25519', pubKey, sigBuf.buffer, msgBuf);
      this._log.info(`Verify: ${valid} for detection ${signedDetection.detection_id}`);
      return valid;
    } catch (err) {
      this._log.error(`Verify failed: ${err.message}`);
      return false;
    }
  }

  isAvailable() {
    return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
  }

  // ── Tauri IPC Fallthrough (desktop app only) ───────────────────────────

  async _signViaTauri(detectionId, contentHash, verdict, riskScore) {
    try {
      const result = await Promise.race([
        window.__TAURI__.invoke('sign_detection', { detection_id: detectionId, content_hash: contentHash, verdict, risk_score: riskScore }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Tauri timeout')), this.timeout)),
      ]);
      return result;
    } catch (err) {
      this._log.warn(`Tauri sign failed (${err.message}), falling back to Ed25519`);
      this._tauriAvailable = false;
      return this.signDetection(detectionId, contentHash, verdict, riskScore);
    }
  }

  async _verifyViaTauri(signedDetection) {
    try {
      const result = await Promise.race([
        window.__TAURI__.invoke('verify_detection', { signed_json: JSON.stringify(signedDetection) }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Tauri timeout')), this.timeout)),
      ]);
      return result.is_valid || false;
    } catch (err) {
      this._log.warn(`Tauri verify failed: ${err.message}`);
      return false;
    }
  }

  // ── Input Validation ───────────────────────────────────────────────────

  _validateInput(detectionId, contentHash, verdict, riskScore) {
    if (!detectionId || detectionId.length === 0) { this._log.error('detectionId empty'); return false; }
    if (!contentHash || contentHash.length < 64) { this._log.error('contentHash must be 64+ hex chars'); return false; }
    if (!['DEEPFAKE','AUTHENTIC','WARN','BLOCK','ALLOW'].includes(verdict)) { this._log.error('Invalid verdict'); return false; }
    if (typeof riskScore !== 'number' || riskScore < 0 || riskScore > 100) { this._log.error('riskScore 0-100'); return false; }
    return true;
  }
}

/**
 * Global singleton — replaces the old quantumBridge.
 * Same API: signDetection(), verifyDetection(), isAvailable()
 */
const quantumBridge = new Ed25519SignatureBridge();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Ed25519SignatureBridge;
}
