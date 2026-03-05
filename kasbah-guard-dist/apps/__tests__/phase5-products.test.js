const { SlackGuard } = require('./slack-guard-complete');
const { DiscordGuardian } = require('./discord-guardian-complete');
const { HospitalGuardian } = require('./hospital-guardian-complete');
const { LegalShield } = require('./legal-shield-complete');

class MockStore {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.get(key); }
  async set(key, value) { this.data.set(key, value); }
}

describe('Phase 5: Roadmap Products', () => {
  describe('SlackGuard', () => {
    test('initializes with config', () => {
      const guard = new SlackGuard({ 
        slackBotToken: 'xoxb-test', 
        slackAppToken: 'xapp-test' 
      });
      expect(guard.config.slackBotToken).toBe('xoxb-test');
      expect(guard.app).toBeDefined();
    });

    test('creates block message', () => {
      const guard = new SlackGuard({ slackBotToken: 'x', slackAppToken: 'x' });
      const blocks = guard.createBlockMessage({ risk: 85, reason: 'AWS key' }, 'blocked');
      expect(blocks[0].type).toBe('header');
      expect(blocks[0].text.text).toContain('🛑');
    });

    test('generates help text', () => {
      const guard = new SlackGuard({ slackBotToken: 'x', slackAppToken: 'x' });
      const help = guard.getHelpText();
      expect(help).toContain('/kasbah');
      expect(help).toContain('scan');
    });
  });

  describe('DiscordGuardian', () => {
    test('initializes with config', () => {
      const guard = new DiscordGuardian({ discordBotToken: 'test-token' });
      expect(guard.config.discordBotToken).toBe('test-token');
      expect(guard.client).toBeDefined();
    });

    test('generates stats', () => {
      const guard = new DiscordGuardian({ discordBotToken: 'x' });
      guard.detections.push({ type: 'block', timestamp: Date.now() });
      const stats = guard.getStats();
      expect(stats).toContain('Today:');
      expect(stats).toContain('Blocked:');
    });
  });

  describe('HospitalGuardian', () => {
    test('detects HIPAA identifiers', () => {
      const guard = new HospitalGuardian({});
      const detections = guard.detectHIPAA('Patient SSN: 123-45-6789, MRN: 123456');
      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some(d => d.category === 'ssn')).toBe(true);
    });

    test('redacts PHI', () => {
      const guard = new HospitalGuardian({});
      const text = 'Patient John Doe, SSN: 123-45-6789';
      const redacted = guard.redactPHI(text);
      expect(redacted).toContain('[REDACTED::');
    });

    test('scans clinical note', async () => {
      const guard = new HospitalGuardian({});
      const result = await guard.scanNote('Patient SSN: 123-45-6789');
      expect(result.phiDetected).toBe(true);
      expect(result.decision).toBe('DENY');
    });

    test('generates compliance report', () => {
      const guard = new HospitalGuardian({});
      const now = Date.now();
      guard.auditLog.push({ 
        timestamp: now, 
        user: 'doc1', 
        patient: 'pat1', 
        action: 'view', 
        phiDetected: false,
        hipaaCompliant: true 
      });
      
      const report = guard.generateComplianceReport(now - 86400000, now + 86400000);
      expect(report.reportType).toBe('hipaa_compliance');
      expect(report.totalAccesses).toBe(1);
    });

    test('detects breach patterns', async () => {
      const guard = new HospitalGuardian({});
      const result = await guard.detectBreach({
        recordsAccessed: 100,
        unauthorizedPatients: 5
      });
      expect(result.breachDetected).toBe(true);
      expect(result.riskLevel).toBe('HIGH');
    });
  });

  describe('LegalShield', () => {
    test('detects privilege markers', () => {
      const shield = new LegalShield({});
      const detections = shield.detectPrivilege('ATTORNEY-CLIENT PRIVILEGED communication');
      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some(d => d.category === 'privilegeMarkers')).toBe(true);
    });

    test('classifies document', () => {
      const shield = new LegalShield({});
      const detections = [{ category: 'privilegeMarkers' }];
      const classification = shield.classifyDocument(detections);
      expect(classification).toBe('ATTORNEY_CLIENT_PRIVILEGED');
    });

    test('scans document', async () => {
      const shield = new LegalShield({});
      const result = await shield.scanDocument({ 
        content: 'ATTORNEY WORK PRODUCT - Confidential' 
      });
      expect(result.privileged).toBe(true);
      expect(result.decision).toBe('DENY');
    });

    test('generates privilege log', () => {
      const shield = new LegalShield({});
      const docs = [
        { id: 'doc1', content: 'ATTORNEY-CLIENT PRIVILEGED', date: '2026-01-01', author: 'Lawyer' }
      ];
      const log = shield.generatePrivilegeLog(docs);
      expect(log.privilegedDocuments).toBe(1);
      expect(log.log.length).toBe(1);
    });

    test('checks ABA rules compliance', () => {
      const shield = new LegalShield({});
      const result = shield.checkABARules({ 
        type: 'external_disclosure', 
        clientConsent: false 
      });
      expect(result.compliant).toBe(false);
      expect(result.violations.some(v => v.rule === 'ABA 1.6')).toBe(true);
    });

    test('creates matter with members', () => {
      const shield = new LegalShield({});
      shield.createMatter('matter1', { members: ['user1', 'user2'] });
      expect(shield.matters.has('matter1')).toBe(true);
    });

    test('checks matter access', async () => {
      const shield = new LegalShield({});
      shield.createMatter('matter1', { members: ['user1'] });
      const result = await shield.checkMatterAccess('matter1', 'user1');
      expect(result.allowed).toBe(true);
    });
  });
});
