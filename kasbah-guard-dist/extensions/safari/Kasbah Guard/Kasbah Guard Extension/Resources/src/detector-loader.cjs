/**
 * Detector.js Loader (CommonJS)
 * Loads detector.js in Node.js context using VM
 * Exports all detector functions for testing
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Get the directory of this file
const dir = __dirname;
const detectorPath = path.join(dir, 'detector.js');

// Read detector.js source
const detectorSource = fs.readFileSync(detectorPath, 'utf8');

// Create a context with all globals
const context = {
  console: console,
  Math: Math,
  Object: Object,
  Array: Array,
  String: String,
  Number: Number,
  Boolean: Boolean,
  RegExp: RegExp,
  Date: Date,
  Error: Error,
  JSON: JSON,
  Buffer: Buffer,
  Uint8Array: Uint8Array,
  crypto: require('crypto'),
  module: { exports: {} },
  exports: {},
  require: require,
  __dirname: dir,
  __filename: detectorPath,
  process: process,
  setTimeout: setTimeout,
  setInterval: setInterval,
  clearTimeout: clearTimeout,
  clearInterval: clearInterval
};

// Add globals to context
Object.assign(context, global);

// Run detector.js in the context
try {
  vm.runInThisContext(detectorSource, { filename: detectorPath });
} catch (error) {
  console.error('Error running detector.js in VM context:', error);
  throw error;
}

// Export the functions from global scope
module.exports = {
  classify: typeof classify !== 'undefined' ? classify : undefined,
  getRisk: typeof getRisk !== 'undefined' ? getRisk : undefined,
  getDecision: typeof getDecision !== 'undefined' ? getDecision : undefined,
  hashContent: typeof hashContent !== 'undefined' ? hashContent : undefined,
  hybridHash: typeof hybridHash !== 'undefined' ? hybridHash : undefined,
  djb2Hash: typeof djb2Hash !== 'undefined' ? djb2Hash : undefined,
  fnv1aHash: typeof fnv1aHash !== 'undefined' ? fnv1aHash : undefined,
  generateDetectionProof: typeof generateDetectionProof !== 'undefined' ? generateDetectionProof : undefined,
  constantTimeEqual: typeof constantTimeEqual !== 'undefined' ? constantTimeEqual : undefined,
  detectPlatform: typeof detectPlatform !== 'undefined' ? detectPlatform : undefined,
  getPatternStats: typeof getPatternStats !== 'undefined' ? getPatternStats : undefined,
  patternConfidenceBoost: typeof patternConfidenceBoost !== 'undefined' ? patternConfidenceBoost : undefined,
  computePatternHash: typeof computePatternHash !== 'undefined' ? computePatternHash : undefined,
  verifyPatternIntegrity: typeof verifyPatternIntegrity !== 'undefined' ? verifyPatternIntegrity : undefined,
  selfTest: typeof selfTest !== 'undefined' ? selfTest : undefined,
  luhnCheck: typeof luhnCheck !== 'undefined' ? luhnCheck : undefined,
  normalizeHomoglyphs: typeof normalizeHomoglyphs !== 'undefined' ? normalizeHomoglyphs : undefined,
  checkBehavioral: typeof checkBehavioral !== 'undefined' ? checkBehavioral : undefined,
  detectStringConcatBypass: typeof detectStringConcatBypass !== 'undefined' ? detectStringConcatBypass : undefined,
  lanzatechTransform: typeof lanzatechTransform !== 'undefined' ? lanzatechTransform : undefined,
  beeodiversityBoost: typeof beeodiversityBoost !== 'undefined' ? beeodiversityBoost : undefined,
  soilSecurityAggregate: typeof soilSecurityAggregate !== 'undefined' ? soilSecurityAggregate : undefined,
  fungiCorrelation: typeof fungiCorrelation !== 'undefined' ? fungiCorrelation : undefined,
  breatheEasyFilter: typeof breatheEasyFilter !== 'undefined' ? breatheEasyFilter : undefined,
  mlEntropyScore: typeof mlEntropyScore !== 'undefined' ? mlEntropyScore : undefined,
  contextFilter: typeof contextFilter !== 'undefined' ? contextFilter : undefined,
  PATTERN_VERSION: typeof PATTERN_VERSION !== 'undefined' ? PATTERN_VERSION : undefined,
  DECISION_MODE: typeof DECISION_MODE !== 'undefined' ? DECISION_MODE : undefined,
  FEATURES: typeof FEATURES !== 'undefined' ? FEATURES : undefined
};
