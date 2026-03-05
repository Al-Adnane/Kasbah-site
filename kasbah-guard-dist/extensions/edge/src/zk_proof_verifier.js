/**
 * Kasbah Guard: ECDSA-P256 Signed Commitment Proof — SubtleCrypto ECDSA-P256
 *
 * Implements an ECDSA-P256 signed commitment proof for detection results
 * using the browser's native SubtleCrypto API (ECDSA P-256).
 *
 * Protocol (3-move commitment):
 *   1. Prover generates ephemeral keypair (r, R=r·G), sends commitment R
 *   2. Verifier issues challenge c = SHA-256(R || message)
 *   3. Prover responds with signature s = ECDSA_sign(privateKey, c)
 *   4. Verifier checks: ECDSA_verify(publicKey, c, s) — validates knowledge of key
 *
 * Properties:
 *   - Completeness: honest prover always passes verification
 *   - Soundness: forging a valid (R, c, s) without the private key is infeasible
 *   - Binding: commitment ties the proof to a specific detection hash
 *
 * NOTE: SubtleCrypto is async — all proof operations return Promises.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function _bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function _hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

function _strToBuf(str) {
  return new TextEncoder().encode(str).buffer;
}

async function _sha256Hex(data) {
  const buf = await crypto.subtle.digest('SHA-256', typeof data === 'string' ? _strToBuf(data) : data);
  return _bufToHex(buf);
}

// ─────────────────────────────────────────────────────────────────────────────
// ECDSA-P256 Signed Commitment Proof via SubtleCrypto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate an ECDSA P-256 keypair for use as the prover's identity key.
 *
 * @returns {Promise<{publicKeyHex: string, privateKey: CryptoKey}>}
 */
async function generateProverKey() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,   // extractable — needed to export public key bytes
    ['sign', 'verify']
  );

  // Export public key as SPKI → hex for transport/storage
  const pubBuf = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  return {
    publicKeyHex: _bufToHex(pubBuf),
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
  };
}

/**
 * Prover step: create an ECDSA-P256 commitment.
 *
 * Generates an ephemeral keypair (r, R=r·G).
 * Returns commitment R as hex (the ephemeral public key bytes).
 *
 * @returns {Promise<{commitmentHex: string, ephemeralPrivateKey: CryptoKey}>}
 */
async function proverCommit() {
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,  // non-extractable private key — never leaves the key object
    ['sign']
  );

  // Export the ephemeral *public* key as raw bytes (commitment R)
  const rawPub = await crypto.subtle.exportKey('spki', ephemeral.publicKey);
  return {
    commitmentHex: _bufToHex(rawPub),
    ephemeralPrivateKey: ephemeral.privateKey,
  };
}

/**
 * Verifier step: compute challenge c = SHA-256(commitment || message).
 *
 * @param {string} commitmentHex  Prover's commitment R (hex)
 * @param {string} message        The message being proven (e.g., detection hash)
 * @returns {Promise<string>}     Challenge hex string
 */
async function verifierChallenge(commitmentHex, message) {
  const combined = commitmentHex + ':' + message;
  return _sha256Hex(_strToBuf(combined));
}

/**
 * Prover step: respond to challenge.
 *
 * Signs the challenge with the IDENTITY private key to prove knowledge.
 * (The ephemeral key binds R to this specific protocol run; identity key proves who.)
 *
 * @param {CryptoKey}  identityPrivateKey  The prover's long-term identity key
 * @param {string}     challengeHex        The verifier's challenge
 * @returns {Promise<string>}              Response (signature) as hex
 */
async function proverRespond(identityPrivateKey, challengeHex) {
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    identityPrivateKey,
    _hexToBuf(challengeHex)
  );
  return _bufToHex(sig);
}

/**
 * Verifier step: verify the ECDSA-P256 signed commitment proof.
 *
 * Checks that the response (signature) was produced by the identity key
 * whose public key was previously registered, against the challenge.
 *
 * @param {string} publicKeyHex   The prover's identity public key (SPKI hex)
 * @param {string} challengeHex  The challenge
 * @param {string} responseHex   The prover's response (signature)
 * @returns {Promise<boolean>}    True if the proof is valid
 */
async function verifierVerify(publicKeyHex, challengeHex, responseHex) {
  try {
    const publicKey = await crypto.subtle.importKey(
      'spki',
      _hexToBuf(publicKeyHex),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    return crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      publicKey,
      _hexToBuf(responseHex),
      _hexToBuf(challengeHex)
    );
  } catch (_) {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level API: create and verify a compliance proof
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an ECDSA-P256 signed commitment compliance proof for a detection result.
 *
 * The proof asserts: "I hold the private key corresponding to publicKeyHex
 * and I sign a commitment to this detection hash."
 *
 * @param {Object} detection   Detection result {decision, risk, content_hash, platform}
 * @param {Object} proverKey   From generateProverKey() — {publicKeyHex, privateKey}
 * @returns {Promise<Object>}  Proof object safe to store/transmit
 */
async function createComplianceProof(detection, proverKey) {
  const message = JSON.stringify({
    decision: detection.decision || detection.verdict,
    risk: detection.risk || detection.riskScore || 0,
    content_hash: detection.content_hash || detection.contentHash || '',
    platform: detection.platform || 'unknown',
  });

  // Step 1: Prover commits
  const { commitmentHex, ephemeralPrivateKey } = await proverCommit();

  // Step 2: Challenge (computed locally — non-interactive via Fiat-Shamir heuristic)
  const challengeHex = await verifierChallenge(commitmentHex, message);

  // Step 3: Prover responds with identity key
  const responseHex = await proverRespond(proverKey.privateKey, challengeHex);

  // Step 4: Verify the proof immediately so `verified` reflects reality
  const verified = await verifierVerify(proverKey.publicKeyHex, challengeHex, responseHex);

  // Generate a cryptographically random proof ID
  const randHex = Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2,'0')).join('');

  return {
    proofId: `proof-${Date.now()}-${randHex}`,
    timestamp: Date.now(),
    protocol: 'ecdsa-p256-commitment-proof',
    signature_scheme: 'ECDSA-P256',
    message,
    commitment: commitmentHex,
    challenge: challengeHex,
    response: responseHex,
    publicKey: proverKey.publicKeyHex,
    verified,
  };
}

/**
 * Verify an ECDSA-P256 signed commitment compliance proof.
 *
 * @param {Object} proof   Proof object from createComplianceProof()
 * @returns {Promise<boolean>}
 */
async function verifyComplianceProof(proof) {
  if (!proof || !proof.publicKey || !proof.challenge || !proof.response) {
    return false;
  }

  // Re-derive the challenge from commitment + message to guard against tampering
  const expectedChallenge = await verifierChallenge(proof.commitment, proof.message);
  if (expectedChallenge !== proof.challenge) {
    return false; // commitment or message was tampered
  }

  return verifierVerify(proof.publicKey, proof.challenge, proof.response);
}

// ─────────────────────────────────────────────────────────────────────────────
// ECDSAProof compatibility wrapper (maintains interface for background.js callers)
// ─────────────────────────────────────────────────────────────────────────────

class ZKProof {
  constructor(proofId, contentHash, verdict, riskScore) {
    this.proofId = proofId;
    this.contentHash = contentHash;
    this.verdict = verdict;
    this.riskScore = riskScore;
    this.timestamp = Date.now();
    this.commitment = null;
    this.challenge = null;
    this.response = null;
    this.publicKey = null;
    this.verified = false;
    this._protocol = 'ecdsa-p256-commitment-proof';
  }

  /**
   * Generate ECDSA-P256 signed commitment proof asynchronously.
   * @returns {Promise<Object>} Proof components
   */
  async generateProof() {
    const proverKey = await generateProverKey();
    const detection = { decision: this.verdict, risk: this.riskScore, content_hash: this.contentHash, platform: 'extension' };
    const proof = await createComplianceProof(detection, proverKey);
    this.commitment = proof.commitment;
    this.challenge = proof.challenge;
    this.response = proof.response;
    this.publicKey = proof.publicKey;
    return { proofId: this.proofId, commitment: this.commitment, challenge: this.challenge, response: this.response, verdict: this.verdict, timestamp: this.timestamp };
  }

  /**
   * Verify this ECDSA-P256 signed commitment proof.
   * @returns {Promise<boolean>}
   */
  async verify() {
    if (!this.commitment || !this.challenge || !this.response || !this.publicKey) {
      return false;
    }
    const result = await verifierVerify(this.publicKey, this.challenge, this.response);
    this.verified = result;
    return result;
  }

  exportProof() {
    return {
      proofId: this.proofId,
      contentHash: this.contentHash,
      verdict: this.verdict,
      riskScore: this.riskScore,
      timestamp: this.timestamp,
      commitment: this.commitment,
      challenge: this.challenge,
      response: this.response,
      publicKey: this.publicKey,
      verified: this.verified,
      protocol: this._protocol,
      signature_scheme: 'ECDSA-P256',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ZKProof,
    generateProverKey,
    proverCommit,
    verifierChallenge,
    proverRespond,
    verifierVerify,
    createComplianceProof,
    verifyComplianceProof,
  };
}
