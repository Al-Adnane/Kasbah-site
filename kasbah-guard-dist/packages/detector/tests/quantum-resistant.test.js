const { QuantumResistantCrypto } = require('../quantum-resistant-crypto');

describe('Quantum Resistant Cryptography', () => {
  let crypto;

  beforeEach(() => {
    crypto = new QuantumResistantCrypto();
  });

  describe('KyberKEM', () => {
    test('generates key pair', async () => {
      const keyPair = await crypto.generateKeyPair('kyber');
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey.algorithm).toBe('kyber512');
    });

    test('encapsulates and decapsulates', async () => {
      const keyPair = await crypto.generateKeyPair('kyber');
      const { ciphertext, sharedSecret } = await crypto.algorithms.kyber.encapsulate(keyPair.publicKey);
      
      expect(ciphertext).toBeDefined();
      expect(sharedSecret).toBeDefined();
      expect(sharedSecret.length).toBe(32);
    });

    test('encrypts and decrypts data', async () => {
      const keyPair = await crypto.generateKeyPair('kyber');
      const data = Buffer.from('Secret message for post-quantum encryption');
      
      const encrypted = await crypto.algorithms.kyber.encrypt(keyPair.publicKey, data);
      const decrypted = await crypto.algorithms.kyber.decrypt(keyPair.privateKey, encrypted);
      
      expect(decrypted.equals(data)).toBe(true);
    });
  });

  describe('DilithiumSignature', () => {
    test('generates key pair', async () => {
      const keyPair = await crypto.generateKeyPair('dilithium');
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey.algorithm).toBe('dilithium2');
    });

    test('signs and verifies message', async () => {
      const keyPair = await crypto.generateKeyPair('dilithium');
      const message = Buffer.from('Message to sign with post-quantum signature');
      
      const signature = await crypto.algorithms.dilithium.sign(keyPair.privateKey, message);
      const verification = await crypto.algorithms.dilithium.verify(
        keyPair.publicKey, 
        signature, 
        message
      );
      
      expect(verification.valid).toBe(true);
      expect(verification.algorithm).toBe('dilithium2');
    });

    test('rejects invalid signature', async () => {
      const keyPair = await crypto.generateKeyPair('dilithium');
      const message = Buffer.from('Original message');
      const tamperedMessage = Buffer.from('Tampered message');
      
      const signature = await crypto.algorithms.dilithium.sign(keyPair.privateKey, message);
      const verification = await crypto.algorithms.dilithium.verify(
        keyPair.publicKey,
        signature,
        tamperedMessage
      );
      
      expect(verification.valid).toBe(false);
    });
  });

  describe('SPHINCSPlus', () => {
    test('generates key pair', async () => {
      const keyPair = await crypto.generateKeyPair('sphincs');
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey.algorithm).toBe('sphincs-plus-128s');
    });

    test('signs and verifies message', async () => {
      const keyPair = await crypto.generateKeyPair('sphincs');
      const message = Buffer.from('Message to sign with hash-based signature');
      
      const signature = await crypto.algorithms.sphincs.sign(keyPair.privateKey, message);
      const verification = await crypto.algorithms.sphincs.verify(
        keyPair.publicKey,
        signature,
        message
      );
      
      expect(verification.valid).toBe(true);
      expect(verification.algorithm).toBe('sphincs-plus-128s');
    });
  });

  describe('McElieceEncryption', () => {
    test('generates key pair', async () => {
      const keyPair = await crypto.generateKeyPair('mceliece');
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey.algorithm).toBe('mceliece6960119');
    });

    test('encrypts and decrypts message', async () => {
      const keyPair = await crypto.generateKeyPair('mceliece');
      const message = crypto.randomBytes(676); // k/8 bytes
      
      const encrypted = await crypto.algorithms.mceliece.encrypt(keyPair.publicKey, message);
      const decrypted = await crypto.algorithms.mceliece.decrypt(keyPair.privateKey, encrypted);
      
      expect(decrypted.message.equals(message)).toBe(true);
    });
  });

  describe('Hybrid Encryption', () => {
    test('encrypts and decrypts with hybrid scheme', async () => {
      const classicalKey = crypto.randomBytes(32);
      const pqKey = await crypto.generateKeyPair('kyber');
      const data = Buffer.from('Secret message with hybrid encryption');
      
      const encrypted = await crypto.hybridEncrypt(classicalKey, pqKey, data);
      const decrypted = await crypto.hybridDecrypt(classicalKey, pqKey, encrypted);
      
      expect(decrypted.decrypted.equals(data)).toBe(true);
      expect(decrypted.pqSharedSecret).toBeDefined();
    });

    test('provides both classical and post-quantum security', async () => {
      const classicalKey = crypto.randomBytes(32);
      const pqKey = await crypto.generateKeyPair('kyber');
      
      const encrypted = await crypto.hybridEncrypt(classicalKey, pqKey, Buffer.from('test'));
      
      expect(encrypted.encrypted).toBeDefined(); // Classical encryption
      expect(encrypted.pqCiphertext).toBeDefined(); // Post-quantum encapsulation
      expect(encrypted.pqSharedSecret).toBeDefined(); // PQ shared secret
    });
  });
});
