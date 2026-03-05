/**
 * Kasbah Guard — Red-Team Simulation Toolkit
 * 
 * 50 attack vectors for testing DLP effectiveness
 * Interactive HTML/JS simulator
 * PDF/JSON report generation
 */

class RedTeamToolkit {
  constructor() {
    this.attackVectors = this.loadAttackVectors();
  }

  loadAttackVectors() {
    return [
      // Category 1: Obfuscation Bypass (10 vectors)
      { id: 'OBF001', category: 'obfuscation', name: 'Base64 Encoded Secret', payload: 'QVdTX0tFWT1BS0lBSU9TRk9ETjdFWEFNUExF', expected: 'AWS_KEY', difficulty: 2 },
      { id: 'OBF002', category: 'obfuscation', name: 'Hex Encoded Secret', payload: '0x4157535f4b45593d414b4941494f53464f444e4e374558414d504c45', expected: 'AWS_KEY', difficulty: 2 },
      { id: 'OBF003', category: 'obfuscation', name: 'URL Encoded Secret', payload: 'AWS%5FKEY%3DAKIAIOSFODNN7EXAMPLE', expected: 'AWS_KEY', difficulty: 1 },
      { id: 'OBF004', category: 'obfuscation', name: 'Caesar Cipher (ROT13)', payload: 'NJVX_XRL=NXVNVBFOSBAAN7RKNZCYR', expected: 'AWS_KEY', difficulty: 3 },
      { id: 'OBF005', category: 'obfuscation', name: 'Homoglyph Attack (Cyrillic)', payload: 'аws_key=АКIАIОSFОDNN7EXAMPLE', expected: 'AWS_KEY', difficulty: 4 },
      { id: 'OBF006', category: 'obfuscation', name: 'String Concatenation', payload: '"AKIA" + "IOSF" + "ODNN7EXAMPLE"', expected: 'AWS_KEY', difficulty: 3 },
      { id: 'OBF007', category: 'obfuscation', name: 'Character Escaping', payload: 'AKIA\\x49\\x4f\\x53\\x46', expected: 'AWS_KEY', difficulty: 4 },
      { id: 'OBF008', category: 'obfuscation', name: 'Unicode Normalization', payload: 'AWS_KEY=AΚIAIOSFODNN7EXAMPLE', expected: 'AWS_KEY', difficulty: 3 },
      { id: 'OBF009', category: 'obfuscation', name: 'Multi-layer Encoding', payload: 'UVdTX0tFWT1BS0lBSU9TRk9ETjdFWEFNUExF', expected: 'AWS_KEY', difficulty: 5 },
      { id: 'OBF010', category: 'obfuscation', name: 'Comment Hiding', payload: '// AWS_KEY=AKIAIOSFODNN7EXAMPLE', expected: 'AWS_KEY', difficulty: 2 },

      // Category 2: Secret Types (15 vectors)
      { id: 'SEC001', category: 'secrets', name: 'AWS Access Key', payload: 'AKIAIOSFODNN7EXAMPLE', expected: 'AWS_KEY', difficulty: 1 },
      { id: 'SEC002', category: 'secrets', name: 'AWS Secret Key', payload: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', expected: 'AWS_SECRET', difficulty: 2 },
      { id: 'SEC003', category: 'secrets', name: 'GitHub PAT', payload: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', expected: 'GITHUB_TOKEN', difficulty: 1 },
      { id: 'SEC004', category: 'secrets', name: 'OpenAI Key', payload: 'sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV', expected: 'OPENAI_KEY', difficulty: 1 },
      { id: 'SEC005', category: 'secrets', name: 'Slack Token', payload: 'TEST_SLACK_BOT_TOKEN_0000', expected: 'SLACK_TOKEN', difficulty: 1 },
      { id: 'SEC006', category: 'secrets', name: 'Discord Token', payload: 'TEST_DISCORD_USER_TOKEN_0000', expected: 'DISCORD_TOKEN', difficulty: 2 },
      { id: 'SEC007', category: 'secrets', name: 'Private RSA Key', payload: '-----BEGIN RSA PRIVATE KEY-----', expected: 'PRIVATE_KEY', difficulty: 1 },
      { id: 'SEC008', category: 'secrets', name: 'MongoDB URI', payload: 'mongodb://user:password@host:27017/db', expected: 'DATABASE_URI', difficulty: 1 },
      { id: 'SEC009', category: 'secrets', name: 'Stripe Key', payload: 'TEST_STRIPE_KEY_1234567890', expected: 'STRIPE_KEY', difficulty: 1 },
      { id: 'SEC010', category: 'secrets', name: 'Google API Key', payload: 'AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe', expected: 'GOOGLE_KEY', difficulty: 2 },
      { id: 'SEC011', category: 'secrets', name: 'JWT Secret', payload: 'jwt_secret = "super-secret-jwt-key-12345"', expected: 'JWT_SECRET', difficulty: 2 },
      { id: 'SEC012', category: 'secrets', name: 'NPM Token', payload: '//registry.npmjs.org/:_authToken=xxxxxxxx', expected: 'NPM_TOKEN', difficulty: 2 },
      { id: 'SEC013', category: 'secrets', name: 'Heroku API Key', payload: '12345678-1234-1234-1234-123456789012', expected: 'HEROKU_KEY', difficulty: 3 },
      { id: 'SEC014', category: 'secrets', name: 'Twilio API Key', payload: 'SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', expected: 'TWILIO_KEY', difficulty: 2 },
      { id: 'SEC015', category: 'secrets', name: 'SendGrid Key', payload: 'SG.xxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', expected: 'SENDGRID_KEY', difficulty: 2 },

      // Category 3: PII (10 vectors)
      { id: 'PII001', category: 'pii', name: 'Social Security Number', payload: '123-45-6789', expected: 'SSN', difficulty: 1 },
      { id: 'PII002', category: 'pii', name: 'Credit Card (Visa)', payload: '4532-1234-5678-9999', expected: 'CREDIT_CARD', difficulty: 1 },
      { id: 'PII003', category: 'pii', name: 'Credit Card (Amex)', payload: '3782-822463-10005', expected: 'CREDIT_CARD', difficulty: 1 },
      { id: 'PII004', category: 'pii', name: 'Phone Number', payload: '(555) 123-4567', expected: 'PHONE', difficulty: 1 },
      { id: 'PII005', category: 'pii', name: 'Email Address', payload: 'john.doe@example.com', expected: 'EMAIL', difficulty: 1 },
      { id: 'PII006', category: 'pii', name: 'IP Address', payload: '192.168.1.100', expected: 'IP_ADDRESS', difficulty: 1 },
      { id: 'PII007', category: 'pii', name: 'Date of Birth', payload: '01/15/1980', expected: 'DOB', difficulty: 2 },
      { id: 'PII008', category: 'pii', name: 'Medical Record Number', payload: 'MRN-123456', expected: 'MRN', difficulty: 2 },
      { id: 'PII009', category: 'pii', name: 'Health Insurance ID', payload: 'BCBS-123456789', expected: 'HEALTH_PLAN', difficulty: 2 },
      { id: 'PII010', category: 'pii', name: 'Passport Number', payload: 'A12345678', expected: 'PASSPORT', difficulty: 2 },

      // Category 4: Phishing (10 vectors)
      { id: 'PHI001', category: 'phishing', name: 'Fake Nitro Link', payload: 'discord.gift/xxxxxxx', expected: 'PHISHING', difficulty: 1 },
      { id: 'PHI002', category: 'phishing', name: 'URL Shortener', payload: 'bit.ly/xxxxx', expected: 'PHISHING', difficulty: 2 },
      { id: 'PHI003', category: 'phishing', name: 'Malware Extension', payload: 'download.exe', expected: 'MALWARE', difficulty: 1 },
      { id: 'PHI004', category: 'phishing', name: 'Token Grabber URL', payload: 'https://discord.com/api/webhooks/123456/xxxxx', expected: 'TOKEN_GRABBER', difficulty: 2 },
      { id: 'PHI005', category: 'phishing', name: 'IP Logger', payload: 'iplogger.com/xxxxx', expected: 'IP_LOGGER', difficulty: 2 },
      { id: 'PHI006', category: 'phishing', name: 'Fake Steam Link', payload: 'steamcommunity.com/gift/xxxxx', expected: 'PHISHING', difficulty: 2 },
      { id: 'PHI007', category: 'phishing', name: 'Free Nitro Bait', payload: 'FREE NITRO CLICK HERE', expected: 'PHISHING', difficulty: 1 },
      { id: 'PHI008', category: 'phishing', name: 'Suspicious TLD', payload: 'sketchy-site.tk', expected: 'PHISHING', difficulty: 2 },
      { id: 'PHI009', category: 'phishing', name: 'Typosquatting', payload: 'gooogle.com', expected: 'PHISHING', difficulty: 3 },
      { id: 'PHI010', category: 'phishing', name: 'Homograph Attack', payload: 'раypаl.com', expected: 'PHISHING', difficulty: 4 },

      // Category 5: Contextual (5 vectors)
      { id: 'CTX001', category: 'contextual', name: 'Secret in Comment', payload: '// TODO: Fix this AWS key: AKIAIOSFODNN7EXAMPLE', expected: 'AWS_KEY', difficulty: 3 },
      { id: 'CTX002', category: 'contextual', name: 'Secret in String', payload: 'const key = "sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV";', expected: 'OPENAI_KEY', difficulty: 2 },
      { id: 'CTX003', category: 'contextual', name: 'Secret in Env Var', payload: 'process.env.AWS_SECRET_ACCESS_KEY', expected: 'AWS_SECRET', difficulty: 2 },
      { id: 'CTX004', category: 'contextual', name: 'Secret in Config File', payload: 'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', expected: 'AWS_SECRET', difficulty: 2 },
      { id: 'CTX005', category: 'contextual', name: 'Multiple Secrets', payload: 'AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', expected: 'AWS_CREDENTIALS', difficulty: 3 }
    ];
  }

  /**
   * Run single attack vector test
   */
  async runTest(vector, detector) {
    const startTime = Date.now();
    const result = await detector.scan(vector.payload);
    const duration = Date.now() - startTime;

    const detected = result.violations.some(v => 
      v.type.toLowerCase().includes(vector.expected.toLowerCase().split('_')[0])
    );

    return {
      vectorId: vector.id,
      name: vector.name,
      category: vector.category,
      detected,
      expectedType: vector.expected,
      actualDetections: result.violations.map(v => v.type),
      riskScore: result.risk,
      duration,
      difficulty: vector.difficulty
    };
  }

  /**
   * Run full attack suite
   */
  async runFullSuite(detector) {
    const results = [];
    const byCategory = {};

    for (const vector of this.attackVectors) {
      const result = await this.runTest(vector, detector);
      results.push(result);

      if (!byCategory[result.category]) {
        byCategory[result.category] = { total: 0, detected: 0, results: [] };
      }
      byCategory[result.category].total++;
      if (result.detected) byCategory[result.category].detected++;
      byCategory[result.category].results.push(result);
    }

    const totalDetected = results.filter(r => r.detected).length;
    
    return {
      summary: {
        total: results.length,
        detected: totalDetected,
        missed: results.length - totalDetected,
        detectionRate: (totalDetected / results.length) * 100,
        avgDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length
      },
      byCategory: Object.entries(byCategory).map(([cat, data]) => ({
        category: cat,
        total: data.total,
        detected: data.detected,
        detectionRate: (data.detected / data.total) * 100
      })),
      results,
      timestamp: Date.now()
    };
  }

  /**
   * Generate PDF report (simplified - use pdfkit in production)
   */
  generatePDFReport(results) {
    // In production: use pdfkit, puppeteer, or similar
    return {
      format: 'pdf',
      title: 'Kasbah Guard Red-Team Report',
      generatedAt: new Date().toISOString(),
      summary: results.summary,
      byCategory: results.byCategory,
      downloadUrl: '/api/reports/redteam-' + Date.now() + '.pdf'
    };
  }

  /**
   * Generate JSON report
   */
  generateJSONReport(results) {
    return {
      reportType: 'redteam',
      version: '1.0',
      generatedAt: Date.now(),
      ...results
    };
  }

  /**
   * Get attack vector catalog
   */
  getCatalog() {
    return {
      total: this.attackVectors.length,
      categories: [...new Set(this.attackVectors.map(v => v.category))],
      vectors: this.attackVectors.map(v => ({
        id: v.id,
        name: v.name,
        category: v.category,
        difficulty: v.difficulty
      }))
    };
  }
}

module.exports = { RedTeamToolkit };
