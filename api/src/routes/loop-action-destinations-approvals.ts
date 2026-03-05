/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGENTG2 API - LOOP DETECTION, ACTION GRAPH, DESTINATIONS, APPROVALS ROUTES
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import { auditLedger } from '../../../Kasbah-Core/src/agentguard/audit';

// ═══════════════════════════════════════════════════════════════════════════
// LOOP DETECTION ROUTES
// ═══════════════════════════════════════════════════════════════════════════

const loopDetectionRouter = Router();

interface ActionWindow {
  actions: Array<{ tool: string; ts: number }>;
  windowMs: number;
}

const actionWindows: Map<string, ActionWindow> = new Map();

loopDetectionRouter.post('/check', async (req: Request, res: Response) => {
  const { sessionId, tool } = req.body;
  
  if (!sessionId || !tool) {
    return res.status(400).json({ success: false, error: 'sessionId and tool required' });
  }
  
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  
  let window = actionWindows.get(sessionId);
  
  if (!window) {
    window = { actions: [], windowMs };
    actionWindows.set(sessionId, window);
  }
  
  // Add current action
  window.actions.push({ tool, ts: now });
  
  // Remove old actions outside window
  const cutoff = now - windowMs;
  window.actions = window.actions.filter(a => a.ts > cutoff);
  
  // Check for loops (same tool called >10 times in window)
  const toolCounts: Record<string, number> = {};
  for (const action of window.actions) {
    toolCounts[action.tool] = (toolCounts[action.tool] || 0) + 1;
  }
  
  const loops: Array<{ tool: string; count: number }> = [];
  for (const [tool, count] of Object.entries(toolCounts)) {
    if (count > 10) {
      loops.push({ tool, count });
    }
  }
  
  res.json({
    success: true,
    data: {
      sessionId,
      totalActions: window.actions.length,
      loops,
      loopDetected: loops.length > 0
    }
  });
});

loopDetectionRouter.get('/stats/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const window = actionWindows.get(sessionId);
  
  if (!window) {
    return res.json({ success: true, data: { sessionId, actions: 0, loops: [] } });
  }
  
  const toolCounts: Record<string, number> = {};
  for (const action of window.actions) {
    toolCounts[action.tool] = (toolCounts[action.tool] || 0) + 1;
  }
  
  res.json({
    success: true,
    data: {
      sessionId,
      totalActions: window.actions.length,
      toolCounts,
      windowMs: window.windowMs
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACTION GRAPH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

const actionGraphRouter = Router();

actionGraphRouter.get('/', async (req: Request, res: Response) => {
  const { limit = '100' } = req.query;
  const records = await auditLedger.read(parseInt(limit as string));
  
  // Build action graph
  const nodes: Map<string, { id: string; type: 'tool' | 'agent' | 'session'; count: number }> = new Map();
  const edges: Array<{ source: string; target: string; count: number }> = [];
  
  for (const record of records) {
    // Add tool node
    const toolId = `tool:${record.tool}`;
    const toolNode = nodes.get(toolId) || { id: toolId, type: 'tool' as const, count: 0 };
    toolNode.count++;
    nodes.set(toolId, toolNode);
    
    // Add agent node if available
    const agentId = `agent:${(record.intent as any)?.agentId || 'unknown'}`;
    const agentNode = nodes.get(agentId) || { id: agentId, type: 'agent' as const, count: 0 };
    agentNode.count++;
    nodes.set(agentId, agentNode);
    
    // Add edge
    edges.push({ source: agentId, target: toolId, count: 1 });
  }
  
  res.json({
    success: true,
    data: {
      nodes: Array.from(nodes.values()),
      edges,
      nodeCount: nodes.size,
      edgeCount: edges.length
    }
  });
});

actionGraphRouter.get('/paths', async (req: Request, res: Response) => {
  const { sessionId } = req.query;
  const records = await auditLedger.read(1000);
  
  // Find common action paths
  const paths: Map<string, number> = new Map();
  let currentPath: string[] = [];
  let lastSession: string | null = null;
  
  for (const record of records) {
    const session = (record.intent as any)?.sessionId;
    
    if (sessionId && session !== sessionId) continue;
    
    if (session !== lastSession) {
      if (currentPath.length > 0) {
        const pathKey = currentPath.join(' -> ');
        paths.set(pathKey, (paths.get(pathKey) || 0) + 1);
      }
      currentPath = [record.tool];
      lastSession = session;
    } else {
      currentPath.push(record.tool);
    }
  }
  
  // Sort by frequency
  const sortedPaths = Array.from(paths.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([path, count]) => ({ path, count }));
  
  res.json({
    success: true,
    data: {
      commonPaths: sortedPaths,
      totalPaths: paths.size
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DESTINATIONS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

const destinationsRouter = Router();

const ALLOWED_DESTINATIONS = [
  { id: 'internal-db', name: 'Internal Database', type: 'database', risk: 'low' },
  { id: 'internal-api', name: 'Internal API', type: 'api', risk: 'low' },
  { id: 'external-api', name: 'External API', type: 'api', risk: 'medium' },
  { id: 'email', name: 'Email', type: 'communication', risk: 'medium' },
  { id: 'file-system', name: 'File System', type: 'storage', risk: 'high' },
  { id: 'network', name: 'Network', type: 'network', risk: 'high' }
];

destinationsRouter.get('/', (req: Request, res: Response) => {
  const { type, risk } = req.query;
  let filtered = ALLOWED_DESTINATIONS;
  
  if (type) {
    filtered = filtered.filter(d => d.type === type);
  }
  if (risk) {
    filtered = filtered.filter(d => d.risk === risk);
  }
  
  res.json({ success: true, data: filtered });
});

destinationsRouter.post('/validate', (req: Request, res: Response) => {
  const { destination, action } = req.body;
  
  const dest = ALLOWED_DESTINATIONS.find(d => d.id === destination);
  
  if (!dest) {
    return res.json({
      success: true,
      data: { valid: false, reason: 'Unknown destination', blocked: true }
    });
  }
  
  // High risk destinations require approval for certain actions
  const requiresApproval = dest.risk === 'high' || 
    (dest.risk === 'medium' && ['write', 'delete', 'execute'].includes(action));
  
  res.json({
    success: true,
    data: {
      valid: true,
      destination: dest,
      requiresApproval,
      blocked: false
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVALS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

const approvalsRouter = Router();

const pendingApprovals: Map<string, any> = new Map();

approvalsRouter.get('/pending', async (req: Request, res: Response) => {
  const records = await auditLedger.read(100);
  const pending = records.filter(r => r.decision === 'pending');
  
  res.json({
    success: true,
    data: pending,
    count: pending.length
  });
});

approvalsRouter.post('/:id/approve', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { approvedBy } = req.body;
  
  // Log approval
  await auditLedger.append(
    'approved_by_human',
    'manual_approval',
    { intentId: id, approvedBy },
    id,
    null
  );
  
  res.json({
    success: true,
    data: {
      intentId: id,
      decision: 'approved',
      approvedBy,
      approvedAt: new Date().toISOString()
    }
  });
});

approvalsRouter.post('/:id/deny', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { deniedBy, reason } = req.body;
  
  // Log denial
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
});

export { loopDetectionRouter, actionGraphRouter, destinationsRouter, approvalsRouter };
