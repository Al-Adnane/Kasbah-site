/**
 * Kasbah Guard — Magic Bytes Validator
 * 
 * Validates file types by header bytes
 * Prevents MIME type confusion attacks
 */

const MAGIC_BYTES = {
  'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/gif': [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2D],
  'text/plain': null,
  'application/zip': [0x50, 0x4B, 0x03, 0x04],
  'application/x-tar': [0x75, 0x73, 0x74, 0x61, 0x72],
  'application/gzip': [0x1F, 0x8B],
  'video/mp4': [0x66, 0x74, 0x79, 0x70],
  'audio/mpeg': [0x49, 0x44, 0x33],
  'application/octet-stream': null
};

class MagicBytesValidator {
  validate(buffer, claimedType) {
    if (!buffer || buffer.length === 0) return { valid: false, reason: 'empty_file' };
    const expected = MAGIC_BYTES[claimedType];
    if (!expected) return { valid: true, reason: 'no_magic_bytes' };
    for (let i = 0; i < expected.length; i++) {
      if (buffer[i] !== expected[i]) {
        return { valid: false, reason: 'magic_bytes_mismatch', claimed: claimedType, actual: this.detectType(buffer) };
      }
    }
    return { valid: true };
  }

  detectType(buffer) {
    for (const [type, bytes] of Object.entries(MAGIC_BYTES)) {
      if (!bytes) continue;
      let matches = true;
      for (let i = 0; i < bytes.length && matches; i++) {
        if (buffer[i] !== bytes[i]) matches = false;
      }
      if (matches) return type;
    }
    return 'application/octet-stream';
  }
}

module.exports = { MagicBytesValidator, MAGIC_BYTES };
