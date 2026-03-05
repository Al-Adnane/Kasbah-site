/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENTG2 API - AGENTS, AUDIT, BUDGETS ROUTES
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import { auditLedger } from '../../../Kasbah-Core/src/agentguard/audit';
import { usageMeter } from '../../../Kasbah-Core/src/agentguard/metering';
import { policyEngine } from '../../../Kasbah-Core/src/agentguard/policy';

// ═══════════════════════════════════════════════════════════════════════════
// AGENTS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

const agentsRouter = Router();

interface Agent {
  id: string;
  orgId: string;
  name: string;
  riskTier: 'LOW' | 'MED' | 'HIGH';
  createdAt: string;
}

const agents: Agent[] = []; // In-memory store (use DB in production)

agentsRouter.get('/', (req: Request, res: Response) => {
  const { orgId, riskTier } = req.query;
  let filtered = agents;
  
  if (orgId) {
    filtered = filtered.filter(a => a.orgId === orgId);
  }
  if (riskTier) {
    filtered = filtered.filter(a => a.riskTier === riskTier);
  }
  
  res.json({ success: true, data: filtered });
});

agentsRouter.post('/', (req: Request, res: Response) => {
  const { orgId, name, riskTier = 'MED' } = req.body;
  
  if (!orgId || !name) {
    return res.status(400).json({ success: false, error: 'orgId and name required' });
  }
  
  const agent: Agent = {
    id: `agent_${Date.now()}`,
    orgId,
    name,
    riskTier,
    createdAt: new Date().toISOString()
  };
  
  agents.push(agent);
  res.status(201).json({ success: true, data: agent });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

const auditRouter = Router();

auditRouter.get('/recent', async (req: Request, res: Response) => {
  try {
    const { limit = '20' } = req.query;
    const records = await auditLedger.read(parseInt(limit as string));
    
    res.json({
      success: true,
      data: records,
      count: records.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit records',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

auditRouter.get('/verify', async (req: Request, res: Response) => {
  try {
    const result = await auditLedger.verify();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to verify audit chain',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// BUDGETS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

const budgetsRouter = Router();

budgetsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { accountId, period = 'day' } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ success: false, error: 'accountId required' });
    }
    
    const now = new Date();
    let usage;
    
    if (period === 'day') {
      usage = await usageMeter.getDailyUsage(accountId as string, now.toISOString().slice(0, 10));
    } else if (period === 'month') {
      usage = await usageMeter.getMonthlyUsage(
        accountId as string,
        now.getFullYear(),
        now.getMonth() + 1
      );
    } else {
      return res.status(400).json({ success: false, error: 'Invalid period' });
    }
    
    res.json({
      success: true,
      data: {
        accountId,
        period,
        totalUnits: usage
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch budget usage',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

budgetsRouter.post('/check', async (req: Request, res: Response) => {
  try {
    const { accountId, usage } = req.body;
    
    const policyDecision = policyEngine.checkBudgets(usage);
    
    res.json({
      success: true,
      data: {
        accountId,
        withinBudget: policyDecision.ok,
        exceeded: policyDecision.exceeded
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check budget',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { agentsRouter, auditRouter, budgetsRouter };
