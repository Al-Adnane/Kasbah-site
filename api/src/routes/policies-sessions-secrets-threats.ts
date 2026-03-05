/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENTG2 API - POLICIES, SESSIONS, SECRETS, THREAT DETECTION ROUTES
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import { policyEngine } from '../../../Kasbah-Core/src/agentguard/policy';
import { auditLedger } from '../../../Kasbah-Core/src/agentguard/audit';

// ═══════════════════════════════════════════════════════════════════════════
// POLICIES ROUTES
// ═══════════════════════════════════════════════════════════════════════════

const policiesRouter = Router();

policiesRouter.get('/', (req: Request, res: Response) => {
  const { name } = req.query;
  
  if (name) {
    const policy = policyEngine.getActivePolicy();
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    return res.json({ success: true, data: policy });
  }
  
  // Return all available policies (just default for now)
  res.json({
    success: true,
    data: [policyEngine.getActivePolicy()],
    count: 1
  });
});

policiesRouter.post('/', (req: Request, res: Response) => {
  const { name, version, rules, budgets } = req.body;
  
  if (!name || !rules) {
    return res.status(400).json({ success: false, error: 'name and rules required' });
  }
  
  policyEngine.loadPolicy(name, { version: version || '1.0', name, rules, budgets });
  
  res.status(201).json({
    success: true,
    data: { name, version: version || '1.0', message: 'Policy loaded' }
  });
});

policiesRouter.post('/set-active', (req: Request, res: Response) => {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ success: false, error: 'name required' });
  }
  
  const success = policyEngine.setActivePolicy(name);
  
  if (!success) {
    return res.status(404).json({ success: false, error: 'Policy not found' });
  }
  
  res.json({ success: true, data: { activePolicy: name } });
});

policiesRouter.get('/export', (req: Request, res: Response) => {
  const { name } = req.query;
  const yaml = policyEngine.exportPolicy(name as string);
  
  if (!yaml) {
    return res.status(404).json({ success: false, error: 'Policy not found' });
  }
  
  res.setHeader('Content-Type', 'application/x-yaml');
  res.send(yaml);
});

// ═══════════════════════════════════════════════════════════════════════════
// SESSIONS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

const sessionsRouter = Router();

const sessions: Map<string, any> = new Map();

sessionsRouter.get('/', (req: Request, res: Response) => {
  const allSessions = Array.from(sessions.entries()).map(([id, data]) => ({ id, ...data }));
  res.json({ success: true, data: allSessions, count: allSessions.length });
});

sessionsRouter.post('/', (req: Request, res: Response) => {
  const { orgId, agentId, metadata } = req.body;
  
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  sessions.set(sessionId, {
    orgId,
    agentId,
    metadata,
    createdAt: new Date().toISOString(),
    lastActivity: Date.now()
  });
  
  res.status(201).json({
    success: true,
    data: { sessionId, orgId, agentId, createdAt: new Date().toISOString() }
  });
});

sessionsRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const session = sessions.get(id);
  
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  
  res.json({ success: true, data: { id, ...session } });
});

sessionsRouter.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  sessions.delete(id);
  res.json({ success: true, message: 'Session deleted' });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECRETS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

const secretsRouter = Router();

const SECRET_PATTERNS = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'OpenAI Key', pattern: /sk-[a-zA-Z0-9]{20,}/ },
  { name: 'GitHub PAT', pattern: /ghp_[a-zA-Z0-9]{36}/ },
  { name: 'Stripe Key', pattern: /sk_live_[a-zA-Z0-9]{24}/ },
  { name: 'Generic Secret', pattern: /(?:secret|password|token|key)\s*[=:]\s*['"][^'"]{8,}['"]/i }
];

secretsRouter.post('/scan', (req: Request, res: Response) => {
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ success: false, error: 'content required' });
  }
  
  const findings: Array<{ type: string; preview: string; confidence: number }> = [];
  
  for (const { name, pattern } of SECRET_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        findings.push({
          type: name,
          preview: match.slice(0, 20) + '...',
          confidence: 0.9
        });
      }
    }
  }
  
  res.json({
    success: true,
    data: {
      findings,
      count: findings.length,
      scanned: content.length
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THREAT DETECTION ROUTES
// ═══════════════════════════════════════════════════════════════════════════

const threatDetectionRouter = Router();

threatDetectionRouter.post('/analyze', async (req: Request, res: Response) => {
  const { intent, context } = req.body;
  
  // Analyze for threats
  const threats: Array<{ type: string; severity: 'low' | 'medium' | 'high' | 'critical'; description: string }> = [];
  
  // Check for high-risk tools
  if (['shell.exec', 'code.exec', 'file.write'].includes(intent?.tool)) {
    threats.push({
      type: 'high_risk_tool',
      severity: 'high',
      description: `Tool ${intent.tool} has high risk potential`
    });
  }
  
  // Check for external destinations
  if (context?.destination?.external) {
    threats.push({
      type: 'external_destination',
      severity: 'medium',
      description: 'Action targets external system'
    });
  }
  
  // Check audit ledger for recent similar actions
  const recentActions = await auditLedger.read(100);
  const similarCount = recentActions.filter(r => r.tool === intent?.tool).length;
  
  if (similarCount > 10) {
    threats.push({
      type: 'unusual_frequency',
      severity: 'medium',
      description: `High frequency of ${intent.tool} actions (${similarCount} in recent history)`
    });
  }
  
  const riskLevel = threats.length === 0 ? 'low' :
    threats.some(t => t.severity === 'critical') ? 'critical' :
    threats.some(t => t.severity === 'high') ? 'high' :
    threats.some(t => t.severity === 'medium') ? 'medium' : 'low';
  
  res.json({
    success: true,
    data: {
      riskLevel,
      threats,
      threatCount: threats.length,
      analyzedAt: new Date().toISOString()
    }
  });
});

threatDetectionRouter.get('/recent', async (req: Request, res: Response) => {
  const { limit = '20' } = req.query;
  const records = await auditLedger.read(parseInt(limit as string));
  
  // Filter for blocked/denied actions (potential threats)
  const threats = records.filter(r => ['blocked', 'denied_by_human'].includes(r.decision));
  
  res.json({
    success: true,
    data: threats,
    count: threats.length
  });
});

export { policiesRouter, sessionsRouter, secretsRouter, threatDetectionRouter };
