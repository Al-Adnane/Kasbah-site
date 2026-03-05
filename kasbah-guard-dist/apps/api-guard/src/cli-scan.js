/**
 * Kasbah Guard — API Guard CLI Scan
 * 
 * CLI-specific scan wrapper.
 */

const { scan: scanText } = require('@kasbah/detector');

/**
 * CLI scan function (placeholder for future enhancements)
 */
function scanCLI(text) {
  return scanText(text);
}

module.exports = { scanCLI };
