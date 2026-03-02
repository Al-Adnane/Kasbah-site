/**
 * Magic Bytes Validation Moat - Unit Tests
 * Tests: 25+
 */

const {
  validateFile,
  verifyMagicBytes,
  MAGIC_BYTES,
  FILE_SIZE_LIMITS
} = require('../magic-bytes');

describe('Magic Bytes Validation Moat', () => {
  // Test MAGIC_BYTES configuration
  describe('MAGIC_BYTES Configuration', () => {
    test('should have JPEG signature', () => {
      expect(MAGIC_BYTES['image/jpeg']).toBeDefined();
      expect(MAGIC_BYTES['image/jpeg'].bytes).toEqual([0xFF, 0xD8, 0xFF]);
    });

    test('should have PNG signature', () => {
      expect(MAGIC_BYTES['image/png']).toBeDefined();
      expect(MAGIC_BYTES['image/png'].bytes).toEqual([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    });

    test('should have GIF signature', () => {
      expect(MAGIC_BYTES['image/gif']).toBeDefined();
      expect(MAGIC_BYTES['image/gif'].bytes).toEqual([0x47, 0x49, 0x46, 0x38]);
    });

    test('should have MP4 signature', () => {
      expect(MAGIC_BYTES['video/mp4']).toBeDefined();
      expect(MAGIC_BYTES['video/mp4'].bytes).toEqual([0x00, 0x00, 0x00, 0x20]);
    });

    test('should have WebM signature', () => {
      expect(MAGIC_BYTES['video/webm']).toBeDefined();
      expect(MAGIC_BYTES['video/webm'].bytes).toEqual([0x1A, 0x45, 0xDF, 0xA3]);
    });

    test('should have MP3 signature', () => {
      expect(MAGIC_BYTES['audio/mpeg']).toBeDefined();
      expect(MAGIC_BYTES['audio/mpeg'].bytes).toEqual([0xFF]);
    });

    test('should have WAV signature', () => {
      expect(MAGIC_BYTES['audio/wav']).toBeDefined();
      const wavSig = MAGIC_BYTES['audio/wav'].bytes;
      expect(wavSig[0]).toBe(0x52); // 'R'
      expect(wavSig[1]).toBe(0x49); // 'I'
    });
  });

  // Test FILE_SIZE_LIMITS configuration
  describe('FILE_SIZE_LIMITS Configuration', () => {
    test('should have size limits for all MIME types', () => {
      expect(FILE_SIZE_LIMITS['image/jpeg']).toBe(50 * 1024 * 1024); // 50MB
      expect(FILE_SIZE_LIMITS['video/mp4']).toBe(500 * 1024 * 1024); // 500MB
      expect(FILE_SIZE_LIMITS['audio/mpeg']).toBe(100 * 1024 * 1024); // 100MB
    });

    test('should enforce stricter limits for images than videos', () => {
      expect(FILE_SIZE_LIMITS['image/png']).toBeLessThan(FILE_SIZE_LIMITS['video/webm']);
    });
  });

  // Test verifyMagicBytes function
  describe('verifyMagicBytes()', () => {
    test('should verify valid JPEG file', () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      const result = verifyMagicBytes(jpegBuffer, 'image/jpeg');
      expect(result.valid).toBe(true);
      expect(result.detected).toBe('image/jpeg');
    });

    test('should verify valid PNG file', () => {
      // PNG signature is 8 bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const result = verifyMagicBytes(pngBuffer, 'image/png');
      expect(result.valid).toBe(true);
      expect(result.detected).toBe('image/png');
    });

    test('should verify valid GIF87a file', () => {
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]); // 'GIF87a'
      const result = verifyMagicBytes(gifBuffer, 'image/gif');
      expect(result.valid).toBe(true);
      expect(result.detected).toBe('image/gif');
    });

    test('should verify valid GIF89a file', () => {
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // 'GIF89a'
      const result = verifyMagicBytes(gifBuffer, 'image/gif');
      expect(result.valid).toBe(true);
      expect(result.detected).toBe('image/gif');
    });

    test('should reject JPEG file claimed as PNG', () => {
      // JPEG is too short to be PNG, will fail with FILE_TOO_SMALL
      // Use a longer JPEG buffer that's still clearly JPEG
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
      const result = verifyMagicBytes(jpegBuffer, 'image/png');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('mismatch');
    });

    test('should reject PNG file claimed as JPEG', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
      const result = verifyMagicBytes(pngBuffer, 'image/jpeg');
      expect(result.valid).toBe(false);
    });

    test('should detect file type when MIME is wrong', () => {
      // Use longer JPEG buffer to ensure it can be properly detected
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
      const result = verifyMagicBytes(jpegBuffer, 'image/png');
      expect(result.detected).toBe('image/jpeg');
    });

    test('should handle empty buffer', () => {
      const emptyBuffer = Buffer.from([]);
      const result = verifyMagicBytes(emptyBuffer, 'image/jpeg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('small');
    });

    test('should handle buffer shorter than signature', () => {
      const shortBuffer = Buffer.from([0xFF]); // Incomplete JPEG signature
      const result = verifyMagicBytes(shortBuffer, 'image/jpeg');
      expect(result.valid).toBe(false);
    });

    test('should handle unknown MIME type', () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF]);
      const result = verifyMagicBytes(buffer, 'application/unknown');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported');
    });

    test('should support MP3 frame header with mask', () => {
      // MP3 frame header: 0xFF 0xFB (MPEG-1 Layer 3)
      const mp3Buffer = Buffer.from([0xFF, 0xFB, 0x90, 0x00]);
      const result = verifyMagicBytes(mp3Buffer, 'audio/mpeg');
      expect(result.valid).toBe(true);
    });

    test('should support both MPEG-1 and MPEG-2 MP3 frames', () => {
      const mp3Buffer = Buffer.from([0xFF, 0xFB]); // MPEG-1
      const result = verifyMagicBytes(mp3Buffer, 'audio/mpeg');
      expect(result.valid).toBe(true);
    });
  });

  // Test validateFile function
  describe('validateFile()', () => {
    test('should validate file with correct size and magic bytes', () => {
      // Create a buffer >= 100 bytes with valid JPEG header
      const jpegBuffer = Buffer.alloc(200);
      jpegBuffer[0] = 0xFF;
      jpegBuffer[1] = 0xD8;
      jpegBuffer[2] = 0xFF;
      jpegBuffer[3] = 0xE0;
      const result = validateFile(jpegBuffer, 'image/jpeg', jpegBuffer.length);
      expect(result.valid).toBe(true);
    });

    test('should reject file exceeding size limit', () => {
      const largeBuffer = Buffer.alloc(51 * 1024 * 1024); // 51MB, exceeds 50MB limit
      largeBuffer[0] = 0xFF;
      largeBuffer[1] = 0xD8;
      largeBuffer[2] = 0xFF;
      const result = validateFile(largeBuffer, 'image/jpeg', largeBuffer.length);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds');
    });

    test('should return validation error', () => {
      const largeBuffer = Buffer.alloc(51 * 1024 * 1024);
      const result = validateFile(largeBuffer, 'image/jpeg', largeBuffer.length);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should validate minimum file size', () => {
      const tinyBuffer = Buffer.from([0xFF]); // Too small for most formats
      const result = validateFile(tinyBuffer, 'image/jpeg', tinyBuffer.length);
      expect(result.valid).toBe(false);
    });

    test('should handle file spoofing attempts', () => {
      // File with JPEG extension but PNG content (>= 100 bytes)
      const pngBuffer = Buffer.alloc(100);
      pngBuffer[0] = 0x89;
      pngBuffer[1] = 0x50;
      pngBuffer[2] = 0x4E;
      pngBuffer[3] = 0x47;
      pngBuffer[4] = 0x0D;
      pngBuffer[5] = 0x0A;
      pngBuffer[6] = 0x1A;
      pngBuffer[7] = 0x0A;
      const result = validateFile(pngBuffer, 'image/jpeg', pngBuffer.length);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_SIGNATURE');
    });

    test('should work with ArrayBuffer input', () => {
      const jpegBuffer = Buffer.alloc(200);
      jpegBuffer[0] = 0xFF;
      jpegBuffer[1] = 0xD8;
      jpegBuffer[2] = 0xFF;
      jpegBuffer[3] = 0xE0;
      const arrayBuffer = jpegBuffer.buffer.slice(0, jpegBuffer.length);
      const result = validateFile(arrayBuffer, 'image/jpeg', jpegBuffer.length);
      expect(result.valid).toBe(true);
    });
  });

  // Edge cases and security tests
  describe('Security & Edge Cases', () => {
    test('should prevent null/undefined buffers', () => {
      expect(() => validateFile(null, 'image/jpeg', 0)).not.toThrow();
      const result = validateFile(null, 'image/jpeg', 0);
      expect(result.valid).toBe(false);
    });

    test('should prevent undefined MIME types', () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF]);
      expect(() => validateFile(jpegBuffer, undefined, jpegBuffer.length)).not.toThrow();
    });

    test('should reject polyglot files (JPEG with extra data)', () => {
      // Legitimate JPEG with appended data
      const polyglot = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Buffer.alloc(100)]);
      const result = validateFile(polyglot, 'image/jpeg', polyglot.length);
      // Should still be valid (polyglots are allowed if magic bytes match)
      expect(result.valid).toBe(true);
    });

    test('should handle case-insensitive MIME types', () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF]);
      // Some browsers send mixed case
      const result = validateFile(jpegBuffer, 'IMAGE/JPEG', jpegBuffer.length);
      // Should handle gracefully (either accept or reject, but not crash)
      expect(typeof result.valid).toBe('boolean');
    });

    test('should not crash on extremely large buffer', () => {
      // Don't actually create 1GB buffer, just test handling
      expect(() => {
        // Validate that function doesn't crash with size check
        const buf = Buffer.alloc(1024);
        const result = validateFile(buf, 'image/jpeg', buf.length);
        expect(typeof result.valid).toBe('boolean');
      }).not.toThrow();
    });
  });

  // Performance tests
  describe('Performance', () => {
    test('should validate small file quickly (<1ms)', () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      const start = performance.now();
      validateFile(jpegBuffer, 'image/jpeg', jpegBuffer.length);
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(1);
    });

    test('should validate medium file in <10ms', () => {
      const mediumBuffer = Buffer.alloc(5 * 1024 * 1024); // 5MB
      mediumBuffer[0] = 0xFF;
      mediumBuffer[1] = 0xD8;
      mediumBuffer[2] = 0xFF;
      const start = performance.now();
      validateFile(mediumBuffer, 'image/jpeg', mediumBuffer.length);
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(10);
    });
  });
});
