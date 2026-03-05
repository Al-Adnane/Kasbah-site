/**
 * Kasbah Guard — API Guard Detector
 * 
 * File scanning functions for API Guard.
 */

const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');
const { scan: scanText, redact } = require('@kasbah/detector');

/**
 * Scan a file for secrets
 * @param {string} filePath - Path to file
 * @returns {Promise<Object>} Scan result
 */
async function scanFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const result = scanText(content);
    result.file = filePath;
    return result;
  } catch (error) {
    return {
      file: filePath,
      error: error.message,
      risk: 0,
      decision: 'ERROR'
    };
  }
}

/**
 * Scan a directory for secrets
 * @param {string} dirPath - Path to directory
 * @param {Object} options - Scan options
 * @returns {Promise<Array>} Array of scan results
 */
async function scanDirectory(dirPath, options = {}) {
  const {
    recursive = true,
    maxDepth = 10,
    exclude = ['node_modules', 'vendor', '.git', 'dist', 'build']
  } = options;
  
  // Build glob pattern
  const pattern = recursive ? '**/*' : '*';
  const ignorePatterns = exclude.map(e => `**/${e}/**`);
  
  // File extensions to scan
  const extensions = [
    '.js', '.ts', '.jsx', '.tsx',
    '.json', '.yaml', '.yml', '.toml',
    '.env', '.env.*',
    '.py', '.rb', '.php', '.java', '.go',
    '.rs', '.swift', '.kt', '.scala',
    '.sh', '.bash', '.zsh',
    '.md', '.txt', '.rst',
    '.sql', '.graphql',
    '.xml', '.html', '.htm',
    '.css', '.scss', '.sass', '.less',
    '.vue', '.svelte',
    '.tf', '.hcl',
    '.dockerfile', '.gitignore', '.npmrc', '.pypirc'
  ];
  
  const files = await glob(`${dirPath}/${pattern}`, {
    ignore: ignorePatterns,
    nodir: true,
    absolute: true
  });
  
  // Filter by extension and depth
  const filteredFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    const relativePath = path.relative(dirPath, file);
    const depth = relativePath.split(path.sep).length;
    
    return extensions.includes(ext) && depth <= maxDepth;
  });
  
  // Scan all files
  const results = [];
  for (const file of filteredFiles) {
    try {
      const result = await scanFile(file);
      if (result.risk >= 40) {
        results.push(result);
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }
  
  return results;
}

module.exports = {
  scanFile,
  scanDirectory,
  redact,
  scan: scanText
};
