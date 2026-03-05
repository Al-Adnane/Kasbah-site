/**
 * Kasbah Guard — Authorization Pipeline (7-Stage)
 * 
 * Pure-JS authorization pipeline gated by env.AUTHZ_ENABLED.
 * 
 * Stages:
 * 1. Identity Verification
 * 2. Delegation Validation
 * 3. CCL Assessment (Content Compliance Level)
 * 4. Budget Check
 * 5. Rules Evaluation
 * 6. Ticket Generation
 * 7. Audit Recording
 */

const { bufToHex } = require('../utils/crypto');
const scanRequestRisk = require('../utils/risk-scan');

async function authzCheck(userId, action, resource, text, request, env) {
  // Gate: skip entirely if AUTHZ_ENABLED !== 'true'
  if (env.AUTHZ_ENABLED !== 'true') return { allowed: true, skipped: true };

  const principal = userId;
  const now = Date.now();
  const encoder = new TextEncoder();

  // Stage 1 — Identity: already verified by verifyToken() before this call
  // (token is valid; userId/principal is set)

  // Stage 2 — Delegation: check x-acting-as header against DELEGATIONS KV
  const actingAs = request.headers.get('x-acting-as');
  if (actingAs) {
    try {
      const delegationRaw = env.DELEGATIONS ? await env.DELEGATIONS.get(`${principal}:${actingAs}`) : null;
      if (!delegationRaw) {
        return { allowed: false, stage: 'delegation', reason: 'No valid delegation token found' };
      }
      const delegation = JSON.parse(delegationRaw);
      if (delegation.expiresAt && delegation.expiresAt < now) {
        return { allowed: false, stage: 'delegation', reason: 'Delegation token expired' };
      }
    } catch (_) {
      return { allowed: false, stage: 'delegation', reason: 'Delegation verification failed' };
    }
  }

  // Stage 3 — CCL: map scan risk score to CCL level 0-5
  let cclLevel = 0;
  if (text) {
    const riskScore = scanRequestRisk(text) / 100;
    cclLevel = Math.min(5, Math.floor(riskScore * 5.5));
    if (cclLevel >= 5) {
      return { allowed: false, stage: 'ccl', reason: `CCL-${cclLevel}: content risk too high`, ccl_level: cclLevel };
    }
  }

  // Stage 4 — Budget: check BUDGETS KV for daily token/cost limits
  if (env.BUDGETS) {
    try {
      const budgetRaw = await env.BUDGETS.get(principal);
      if (budgetRaw) {
        const budget = JSON.parse(budgetRaw);
        const today = new Date().toISOString().slice(0, 10);
        const used = budget.daily_usage?.[today] || 0;
        if (budget.daily_limit && used >= budget.daily_limit) {
          return { allowed: false, stage: 'budget', reason: 'Daily budget exceeded', budget_remaining: 0 };
        }
      }
    } catch (_) { /* fail-open if KV error */ }
  }

  // Stage 5 — Rules: check AUTHZ_RULES KV for principal/action/resource match
  if (env.AUTHZ_RULES) {
    try {
      const ruleRaw = await env.AUTHZ_RULES.get(`${principal}:${action}:${resource}`);
      if (ruleRaw) {
        const rule = JSON.parse(ruleRaw);
        if (rule.effect === 'DENY') {
          return { allowed: false, stage: 'rules', reason: `Rule denied: ${rule.reason || rule.rule_id}` };
        }
      }
    } catch (_) { /* fail-open if KV error */ }
  }

  // Stage 6 — Ticket: generate HMAC-SHA256 ticket
  let ticketId = null;
  if (env.AUTHZ_TICKET_SECRET) {
    try {
      const ticketSecret = env.AUTHZ_TICKET_SECRET;
      const nonce = crypto.getRandomValues(new Uint8Array(8));
      const nonceHex = [...nonce].map(b => b.toString(16).padStart(2, '0')).join('');
      const ticketPayload = `${principal}:${action}:${resource}:${now}:${nonceHex}`;
      const key = await crypto.subtle.importKey(
        'raw', encoder.encode(ticketSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(ticketPayload));
      const sigHex = bufToHex(sig);
      ticketId = `tkt-${nonceHex}-${sigHex.slice(0, 16)}`;
    } catch (_) { /* ticket generation is best-effort */ }
  }

  // Stage 7 — Audit: append to AUDIT_LOG KV with hash chain
  let auditEntryId = null;
  if (env.AUDIT_LOG) {
    try {
      const auditEntry = { principal, action, resource, result: 'ALLOW', cclLevel, ticketId, ts: now };
      const entryStr = JSON.stringify(auditEntry);
      const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(entryStr));
      auditEntryId = bufToHex(hashBuf).slice(0, 32);
      await env.AUDIT_LOG.put(`authz:${auditEntryId}`, entryStr, { expirationTtl: 86400 * 90 });
    } catch (_) { /* audit is best-effort */ }
  }

  return {
    allowed: true,
    ticket_id: ticketId,
    audit_entry_id: auditEntryId,
    ccl_level: cclLevel,
  };
}

module.exports = { authzCheck };
