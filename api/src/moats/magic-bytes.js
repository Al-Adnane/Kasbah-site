/**
 * Magic Bytes Validation Moat
 * Prevents file type spoofing attacks
 *
 * Integrated from: workspace archive src/lib/validation.ts
 * Status: Production-ready, tested with 25+ test cases
 */

// File type magic bytes signatures
const MAGIC_BYTES = {
  // Images
  'image/jpeg': { bytes: [0xFF, 0xD8, 0xFF], offset: 0 },
  'image/png': { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], offset: 0 },
  'image/gif': { bytes: [0x47, 0x49, 0x46, 0x38], offset: 0 },
  'image/webp': { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
  'image/bmp': { bytes: [0x42, 0x4D], offset: 0 },

  // Videos
  'video/mp4': { bytes: [0x00, 0x00, 0x00, 0x20], offset: 0 },
  'video/webm': { bytes: [0x1A, 0x45, 0xDF, 0xA3], offset: 0 },

  // Audio
  'audio/mpeg': { bytes: [0xFF], offset: 0, mask: [0xE0] },
  'audio/wav': { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
  'audio/ogg': { bytes: [0x4F, 0x67, 0x67, 0x53], offset: 0 },
};

// Secondary signatures for accuracy
const SECONDARY_SIGNATURES = {
  'image/webp': [{ bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }],
  'audio/wav': [{ bytes: [0x57, 0x41, 0x56, 0x45], offset: 8 }],
  'video/mp4': [
    { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
    { bytes: [0x6D, 0x70, 0x34, 0x32], offset: 8 },
  ],
};

// File size limits
const FILE_SIZE_LIMITS = {
  'image/jpeg': 50 * 1024 * 1024,
  'image/png': 50 * 1024 * 1024,
  'image/gif': 50 * 1024 * 1024,
  'image/webp': 50 * 1024 * 1024,
  'video/mp4': 500 * 1024 * 1024,
  'video/webm': 500 * 1024 * 1024,
  'audio/mpeg': 100 * 1024 * 1024,
  'audio/wav': 100 * 1024 * 1024,
  'audio/ogg': 100 * 1024 * 1024,
};

const MIN_FILE_SIZE = 100; // bytes
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

/**
 * Verify file magic bytes to prevent file type spoofing
 * @param {Buffer} buffer - File content as buffer
 * @param {string} claimedMimeType - MIME type claimed by client
 * @returns {Object} Validation result
 */
function verifyMagicBytes(buffer, claimedMimeType) {
  const warnings = [];

  // Get expected signature for claimed MIME type
  const signature = MAGIC_BYTES[claimedMimeType];
  if (!signature) {
    return {
      valid: false,
      error: `Unsupported MIME type: ${claimedMimeType}`,
      code: 'UNSUPPORTED_MIME_TYPE'
    };
  }

  // Check if buffer is large enough
  if (buffer.length < signature.bytes.length + signature.offset) {
    return {
      valid: false,
      error: 'File is too small or corrupted',
      code: 'FILE_TOO_SMALL'
    };
  }

  // Verify primary signature
  let primaryMatch = true;
  for (let i = 0; i < signature.bytes.length; i++) {
    const bufferByte = buffer[signature.offset + i];
    const expectedByte = signature.bytes[i];

    if (signature.mask && signature.mask[i]) {
      if ((bufferByte & signature.mask[i]) !== (expectedByte & signature.mask[i])) {
        primaryMatch = false;
        break;
      }
    } else {
      if (bufferByte !== expectedByte) {
        primaryMatch = false;
        break;
      }
    }
  }

  if (!primaryMatch) {
    // Try to detect actual MIME type
    let detectedType = claimedMimeType;
    for (const [mimeType, sig] of Object.entries(MAGIC_BYTES)) {
      let match = true;
      if (buffer.length >= sig.bytes.length + sig.offset) {
        for (let i = 0; i < sig.bytes.length; i++) {
          const bufferByte = buffer[sig.offset + i];
          const expectedByte = sig.bytes[i];
          if (sig.mask && sig.mask[i]) {
            if ((bufferByte & sig.mask[i]) !== (expectedByte & sig.mask[i])) {
              match = false;
              break;
            }
          } else {
            if (bufferByte !== expectedByte) {
              match = false;
              break;
            }
          }
        }
        if (match) {
          detectedType = mimeType;
          break;
        }
      }
    }
    return {
      valid: false,
      detected: detectedType,
      error: `File type mismatch: expected ${claimedMimeType}, detected ${detectedType}`,
      code: 'INVALID_SIGNATURE'
    };
  }

  // Check secondary signatures if available
  const secondary = SECONDARY_SIGNATURES[claimedMimeType];
  if (secondary) {
    for (const sig of secondary) {
      let match = true;
      for (let i = 0; i < sig.bytes.length; i++) {
        if (buffer[sig.offset + i] !== sig.bytes[i]) {
          match = false;
          break;
        }
      }
      if (!match) {
        warnings.push(`Secondary signature mismatch for ${claimedMimeType}`);
      }
    }
  }

  return {
    valid: true,
    detected: claimedMimeType,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Validate file before processing
 * @param {ArrayBuffer|Buffer} fileData - File content
 * @param {string} mimeType - MIME type
 * @param {number} fileSize - File size
 * @returns {Object} Validation result
 */
function validateFile(fileData, mimeType, fileSize) {
  // Check file size
  if (fileSize < MIN_FILE_SIZE) {
    return {
      valid: false,
      error: 'File is too small',
      code: 'FILE_TOO_SMALL'
    };
  }

  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'File exceeds maximum size (500MB)',
      code: 'FILE_TOO_LARGE'
    };
  }

  // Check MIME-specific limits
  const limit = FILE_SIZE_LIMITS[mimeType];
  if (limit && fileSize > limit) {
    return {
      valid: false,
      error: `File exceeds limit for ${mimeType}`,
      code: 'FILE_EXCEEDS_LIMIT'
    };
  }

  // Convert ArrayBuffer to Buffer-like object if needed
  let buffer;
  if (fileData instanceof ArrayBuffer) {
    buffer = new Uint8Array(fileData);
  } else if (Buffer.isBuffer(fileData)) {
    buffer = fileData;
  } else {
    buffer = new Uint8Array(fileData);
  }

  // Verify magic bytes
  return verifyMagicBytes(buffer, mimeType);
}

module.exports = {
  validateFile,
  verifyMagicBytes,
  MAGIC_BYTES,
  FILE_SIZE_LIMITS,
  MIN_FILE_SIZE,
  MAX_FILE_SIZE
};
