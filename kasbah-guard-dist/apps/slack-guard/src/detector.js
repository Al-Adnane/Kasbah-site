/**
 * Kasbah Guard — Detector (Shared)
 * 
 * Same detector as Discord Guardian, shared via npm package.
 */

const { 
  detectSecrets, 
  detectPII, 
  detectPhishing, 
  calculateRisk, 
  redact, 
  scan,
  PATTERNS 
} = require('./detector');

module.exports = {
  detectSecrets,
  detectPII,
  detectPhishing,
  calculateRisk,
  redact,
  scan,
  PATTERNS
};
