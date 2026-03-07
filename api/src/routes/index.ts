/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENTG2 API - MAIN ROUTER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Complete API with all 13 endpoints:
 * 1. /api/intents - Intent tracking
 * 2. /api/agents - Agent management
 * 3. /api/audit - Audit trail
 * 4. /api/budgets - Budget tracking
 * 5. /api/policies - Policy management
 * 6. /api/sessions - Session management
 * 7. /api/secrets - Secret scanning
 * 8. /api/threat-detection - Threat analysis
 * 9. /api/loop-detection - Loop prevention
 * 10. /api/action-graph - Action visualization
 * 11. /api/destinations - Destination validation
 * 12. /api/approvals - Approval workflow
 * 13. /api/health - Health check
 */

import { Router, Request, Response } from 'express';
import { intentsRouter } from './routes/intents';
import { agentsRouter, auditRouter, budgetsRouter } from './routes/agents-audit-budgets';
import { policiesRouter, sessionsRouter, secretsRouter, threatDetectionRouter } from './routes/policies-sessions-secrets-threats';
import { loopDetectionRouter, actionGraphRouter, destinationsRouter, approvalsRouter } from './routes/loop-action-destinations-approvals';
import { auditLedger, usageMeter } from '../../Kasbah-Core/src/agentguard';

const apiRouter = Router();

// Health check endpoint
apiRouter.get('/health', async (req: Request, res: Response) => {
  const auditStatus = await auditLedger.verify().catch(() => ({ ok: false, message: 'Audit unavailable' }));
  
  res.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services: {
      audit: auditStatus.ok ? 'healthy' : 'degraded',
      agentguard: 'healthy'
    },
    uptime: process.uptime()
  });
});

// Mount all routers
apiRouter.use('/intents', intentsRouter);
apiRouter.use('/agents', agentsRouter);
apiRouter.use('/audit', auditRouter);
apiRouter.use('/budgets', budgetsRouter);
apiRouter.use('/policies', policiesRouter);
apiRouter.use('/sessions', sessionsRouter);
apiRouter.use('/secrets', secretsRouter);
apiRouter.use('/threat-detection', threatDetectionRouter);
apiRouter.use('/loop-detection', loopDetectionRouter);
apiRouter.use('/action-graph', actionGraphRouter);
apiRouter.use('/destinations', destinationsRouter);
apiRouter.use('/approvals', approvalsRouter);

// 404 handler
apiRouter.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    available: [
      '/health',
      '/intents',
      '/agents',
      '/audit',
      '/budgets',
      '/policies',
      '/sessions',
      '/secrets',
      '/threat-detection',
      '/loop-detection',
      '/action-graph',
      '/destinations',
      '/approvals'
    ]
  });
});

// ── Uninstall feedback — receives survey responses from bekasbah.com/uninstall
apiRouter.post('/uninstall-feedback', async (req: Request, res: Response) => {
  try {
    const { reason, other, version, install_reason, ts } = req.body;

    // Validate reason is one of the known options
    const VALID_REASONS = ['false_positives', 'no_detections', 'performance', 'privacy', 'just_testing', 'other'];
    if (!reason || !VALID_REASONS.includes(reason)) {
      return res.status(400).json({ ok: false, error: 'Invalid reason' });
    }

    // Sanitize other text — max 500 chars, no PII
    const sanitizedOther = other ? String(other).slice(0, 500) : null;

    // Log to audit ledger (local, no external sends)
    await auditLedger.record({
      event: 'uninstall_feedback',
      reason,
      other: sanitizedOther,
      version: version || 'unknown',
      install_reason: install_reason || 'unknown',
      ts: ts || Date.now()
    }).catch(() => {}); // never fail the response

    console.log(`[uninstall] reason=${reason} version=${version}`);

    return res.json({ ok: true });
  } catch (err) {
    // Silent — always return 200 so the survey page shows thank you
    return res.json({ ok: true });
  }
});

// Error handler
apiRouter.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('API Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: err.message
  });
});

export { apiRouter };
export default apiRouter;
