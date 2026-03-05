/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENTG2 API - INTENTS ROUTE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Agent intent tracking and management
 * Based on AGentG2.tar API endpoints
 */

import { Router, Request, Response } from 'express';
import { auditLedger } from '../../../Kasbah-Core/src/agentguard/audit';
import { ticketService } from '../../../Kasbah-Core/src/agentguard/tickets';
import { policyEngine } from '../../../Kasbah-Core/src/agentguard/policy';

const router = Router();

interface IntentBody {
  tenantId: string;
  sessionId: string;
  agentId: string;
  toolName: string;
  toolVersion?: string;
  argsJson: Record<string, unknown>;
  origin: string;
  trustLevel: 'TRUSTED' | 'UNTRUSTED' | 'MIXED';
  riskScore: number;
}

// GET /api/intents - List all intents (from audit ledger)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, tenantId, limit = '100' } = req.query;
    const limitNum = Math.min(parseInt(limit as string), 1000);

    // Read from audit ledger
    const records = await auditLedger.read(limitNum);
    
    // Filter if needed
    let filtered = records;
    if (status) {
      filtered = records.filter(r => r.decision === status);
    }
    if (tenantId) {
      filtered = records.filter(r => (r.intent as any)?.tenantId === tenantId);
    }

    res.json({
      success: true,
      data: filtered,
      count: filtered.length
    });
  } catch (error) {
    console.error('Error fetching intents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch intents',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/intents - Create a new intent
router.post('/', async (req: Request, res: Response) => {
  try {
    const body: IntentBody = req.body;

    // Validate required fields
    if (!body.tenantId || !body.sessionId || !body.agentId || !body.toolName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenantId, sessionId, agentId, toolName'
      });
    }

    // Evaluate policy
    const policyDecision = policyEngine.decide({
      tool: body.toolName,
      args: body.argsJson,
      risk_score: body.riskScore,
      trust_level: body.trustLevel
    });

    // Create intent hash
    const intentHash = createHash(JSON.stringify(body));

    // Map policy decision to our decision format
    let decision: 'allowed' | 'blocked' | 'pending';
    let reason: string | undefined;

    switch (policyDecision.decision) {
      case 'allow':
        decision = 'allowed';
        break;
      case 'block':
        decision = 'blocked';
        reason = policyDecision.reason;
        break;
      case 'require_human':
      case 'require_scan':
        decision = 'pending';
        reason = policyDecision.reason;
        break;
      default:
        decision = 'blocked';
        reason = 'Unknown policy decision';
    }

    // If allowed, mint a ticket
    let ticketId: string | null = null;
    if (decision === 'allowed') {
      const ticket = ticketService.mint(
        intentHash,
        'system',
        100, // 100ms TTL
        { maxExecutions: 1 }
      );
      ticketId = ticket.ticket_id;
      ticketService.markUsed(ticket.ticket_id, ticket.expires_at);
    }

    // Log to audit ledger
    const auditRecord = await auditLedger.append(
      decision,
      body.toolName,
      body,
      intentHash,
      ticketId
    );

    res.status(201).json({
      success: true,
      data: {
        intentId: auditRecord.id,
        decision,
        reason,
        ticketId,
        auditHash: auditRecord.hash,
        createdAt: new Date(auditRecord.ts).toISOString()
      }
    });
  } catch (error) {
    console.error('Error creating intent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create intent',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/intents/:id - Get specific intent
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const records = await auditLedger.read(1000);
    const record = records.find(r => r.id === id);

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Intent not found'
      });
    }

    res.json({
      success: true,
      data: record
    });
  } catch (error) {
    console.error('Error fetching intent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch intent',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/intents/:id/approve - Approve pending intent
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approvedBy } = req.body;

    if (!approvedBy) {
      return res.status(400).json({
        success: false,
        error: 'approvedBy is required'
      });
    }

    // Mint approval ticket
    const ticket = ticketService.mint(id, approvedBy, 100, {});

    // Log approval to audit ledger
    await auditLedger.append(
      'approved_by_human',
      'manual_approval',
      { intentId: id, approvedBy },
      id,
      ticket.ticket_id
    );

    res.json({
      success: true,
      data: {
        intentId: id,
        decision: 'approved',
        ticketId: ticket.ticket_id,
        approvedBy,
        approvedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error approving intent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve intent',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/intents/:id/deny - Deny pending intent
router.post('/:id/deny', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { deniedBy, reason } = req.body;

    if (!deniedBy) {
      return res.status(400).json({
        success: false,
        error: 'deniedBy is required'
      });
    }

    // Log denial to audit ledger
    await auditLedger.append(
      'denied_by_human',
      'manual_denial',
      { intentId: id, deniedBy, reason },
      id,
      null
    );

    res.json({
      success: true,
      data: {
        intentId: id,
        decision: 'denied',
        deniedBy,
        reason,
        deniedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error denying intent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deny intent',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

function createHash(data: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
}

export { router as intentsRouter };
