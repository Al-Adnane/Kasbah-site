/**
 * Kasbah Guard — API Guard
 * 
 * Developer-first secret detection library and CLI.
 * 
 * Usage:
 *   import { scan, scanFile, scanDirectory, redact } from '@kasbah/api-guard';
 *   
 *   const result = await scan('API_KEY=sk-1234567890');
 *   console.log(result.decision); // 'DENY'
 */

const { scan, scanFile, scanDirectory, redact, detectSecrets, detectPII, detectPhishing } = require('./detector');
const { scanCLI } = require('./cli-scan');

module.exports = {
  // Main scan functions
  scan,
  scanFile,
  scanDirectory,
  redact,
  
  // Specific detectors
  detectSecrets,
  detectPII,
  detectPhishing,
  
  // CLI function
  scanCLI
};
