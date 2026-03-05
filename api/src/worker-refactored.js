/**
 * DEPRECATED: Alternate implementation, not deployed.
 * Maintained for reference only. The production worker is worker.js
 *
 * Kasbah Guard — Auth API (Cloudflare Worker)
 *
 * Refactored v2.0.0 - Modular Architecture
 *
 * Endpoints:
 *   Auth: /auth/register, /auth/verify, /auth/resend, /auth/login, /auth/me, /auth/logout, /auth/stats
 *   API:  /api/stats, /api/audit/recent, /api/policies, /api/team, /api/scan
 *   Moats: /api/moats/brittleness, /api/moats/forecast, /api/moats/thresholds
 *   Privacy: /api/privacy/consent, /api/privacy/status
 *   Health: /health, /health/waitlist
 * 
 * Storage: Cloudflare KV
 *   USERS    — key: email, value: { id, email, name, passwordHash, salt, plan, verified, createdAt, lastLogin }
 *   SESSIONS — key: token, value: { userId, email, createdAt, expiresAt }
 */

// ── Security Moats v1.0.1 ──
const {
  initializeMoats,
  checkRateLimit,
  getMoatStats
} = require('./moats/integration');

// ── Frontier Engine (GenAI Detection) ──
const {
  frontierScore
} = require('./frontier');

// ── Obfuscation Decoder (Moat 6) ──
const {
  analyzeObfuscation,
  detectObfuscation
} = require('./moats/obfuscation-decoder');

// ── Multi-Model AI Router ──
const {
  routeIntentToMultiModel
} = require('./multi-model-router');

// ── Route Handlers ──
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

// ── Utilities ──
const { json, err, CORS_HEADERS } = require('./utils/response');
const { extractBearer, verifyToken } = require('./utils/crypto');
const scanRequestRisk = require('./utils/risk-scan');

// ── Core State ──
const {
  _hyperCacheKey,
  _hyperCacheGet,
  _hyperCacheSet,
  _hyperCacheStats,
  _dynRecordThreat,
  _dynGetConfig,
} = require('./core/state');

// ── Authorization Pipeline ──
const { authzCheck } = require('./authz-pipeline');

// ══════════════════════════════════════════════════════════════
// System Integrity Index (Moat F Mirror)
// ══════════════════════════════════════════════════════════════
function computeSII(hookInt, patternInt, sessionHealth, latencyNorm) {
  return Math.pow(hookInt, 0.30) * Math.pow(patternInt, 0.30)
       * Math.pow(sessionHealth, 0.25) * Math.pow(latencyNorm, 0.15);
}

// ══════════════════════════════════════════════════════════════
// Three-Gate Policy Check (Moat O Mirror)
// ══════════════════════════════════════════════════════════════
const R_MIN = 0.72, B_MAX = 0.18, H_MAX = 0.35;
function apiGateCheck(reliability, brittleness, harm) {
  if (reliability < R_MIN) return { pass: false, gate: 'reliability', value: reliability, threshold: R_MIN };
  if (brittleness > B_MAX) return { pass: false, gate: 'brittleness', value: brittleness, threshold: B_MAX };
  if (harm > H_MAX)        return { pass: false, gate: 'harm',        value: harm,        threshold: H_MAX };
  return { pass: true };
}

// ── Main Router ──
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── Moat v1.0.1: Initialize security moats ──
    const moats = initializeMoats(env);

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Moat I (API mirror): scan POST body for credential risk
    let _bodyRisk = 0;
    let _clonedRequest = request;
    if (method === 'POST') {
      try {
        const clone = request.clone();
        const bodyText = await clone.text();
        _bodyRisk = scanRequestRisk(bodyText);
        _clonedRequest = new Request(request.url, { 
          method: request.method, 
          headers: request.headers, 
          body: bodyText 
        });
      } catch (_) {}
    }

    try {
      let response;

      // ── Auth Routes ──
      if (method === 'POST' && path === '/auth/register') {
        const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`;
        const rateLimitCheck = checkRateLimit(request, moats.anonymousLimiter, requestId);
        response = rateLimitCheck.allowed 
          ? await authRoutes.handleRegister(_clonedRequest, env)
          : rateLimitCheck.response;
      } 
      else if (method === 'POST' && path === '/auth/verify') {
        const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`;
        const rateLimitCheck = checkRateLimit(request, moats.anonymousLimiter, requestId);
        response = rateLimitCheck.allowed
          ? await authRoutes.handleVerify(_clonedRequest, env)
          : rateLimitCheck.response;
      }
      else if (method === 'POST' && path === '/auth/resend') {
        const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`;
        const rateLimitCheck = checkRateLimit(request, moats.anonymousLimiter, requestId);
        response = rateLimitCheck.allowed
          ? await authRoutes.handleResend(_clonedRequest, env)
          : rateLimitCheck.response;
      }
      else if (method === 'POST' && path === '/auth/login') {
        const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`;
        const rateLimitCheck = checkRateLimit(request, moats.anonymousLimiter, requestId);
        response = rateLimitCheck.allowed
          ? await authRoutes.handleLogin(_clonedRequest, env)
          : rateLimitCheck.response;
      }
      else if (method === 'GET' && path === '/auth/me') {
        response = await authRoutes.handleMe(request, env);
      }
      else if (method === 'POST' && path === '/auth/logout') {
        response = await authRoutes.handleLogout(_clonedRequest, env);
      }
      else if (method === 'GET' && path === '/auth/stats') {
        response = await authRoutes.handleStats(env);
      }

      // ── API Routes ──
      else if (method === 'GET' && path === '/api/stats') {
        response = await apiRoutes.handleApiStats(request, env);
      }
      else if (method === 'GET' && path === '/api/audit/recent') {
        response = await apiRoutes.handleApiAuditRecent(request, env);
      }
      else if (method === 'GET' && path === '/api/policies') {
        response = await apiRoutes.handleApiPolicies(request, env);
      }
      else if (method === 'GET' && path === '/api/team') {
        response = await apiRoutes.handleApiTeam(request, env);
      }
      else if (method === 'POST' && path === '/api/scan') {
        const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`;
        const rateLimitCheck = checkRateLimit(request, moats.detectionLimiter, requestId);
        response = rateLimitCheck.allowed
          ? await apiRoutes.handleApiScan(_clonedRequest, env)
          : rateLimitCheck.response;
      }

      // ── Health Endpoints ──
      else if (method === 'GET' && path === '/health') {
        const sii = computeSII(1.0, 1.0, 1.0, 1.0);
        const gate = apiGateCheck(1.0, 0.0, 0.0);
        response = json({
          ok: true, 
          service: 'kasbah-api', 
          version: '2.0.0',
          capabilities: ['constitutional-ai', 'commitment-proofs', 'enterprise'],
          sii: parseFloat(sii.toFixed(4)),
          moats: {
            sii: parseFloat(sii.toFixed(4)),
            gate: gate.pass,
            version: 'v1.5.0',
            techniques: ['moat_f_sii', 'moat_o_gate', 'moat_i_risk_scan'],
          }
        });
      }
      else if (method === 'GET' && path === '/health/waitlist') {
        try {
          const testKey = await env.KASBAH_KV.get('HEALTH_CHECK_MARKER');
          response = json({
            ok: true,
            endpoint: '/waitlist',
            status: 'operational',
            timestamp: new Date().toISOString(),
            kv_accessible: true,
            lastFailureTime: null
          });
        } catch (healthErr) {
          console.error(`[HEALTH] Waitlist health check failed: ${healthErr.message}`);
          response = json({
            ok: false,
            endpoint: '/waitlist',
            status: 'degraded',
            timestamp: new Date().toISOString(),
            kv_accessible: false,
            error: healthErr.message
          }, 503);
        }
      }

      // ── Cache Stats ──
      else if (method === 'GET' && path === '/api/cache/stats') {
        const token = extractBearer(request);
        const payload = await verifyToken(env, token);
        if (!payload) {
          response = err('Unauthorized', 401);
        } else {
          response = json({ ok: true, cache: _hyperCacheStats() });
        }
      }

      // ── Default: 404 ──
      else {
        response = err('Not found', 404);
      }

      // Moat I: attach X-Kasbah-Risk header when POST body contained suspicious patterns
      if (_bodyRisk > 0) {
        const newHeaders = new Headers(response.headers);
        newHeaders.set('X-Kasbah-Risk', String(_bodyRisk));
        response = new Response(response.body, { 
          status: response.status, 
          headers: newHeaders 
        });
      }

      return response;
    } catch (error) {
      // ── Moat 1: Structured error handling with request tracking ──
      const requestId = request.headers.get('x-request-id') || `err-${Date.now()}`;

      console.error({
        type: 'handler_error',
        requestId,
        method,
        path,
        errorMessage: error.message,
        errorCode: error.code || 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });

      const errorStatus = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            message: error.message || 'Internal server error',
            code: errorCode,
            statusCode: errorStatus,
            timestamp: new Date().toISOString(),
            requestId
          }
        }),
        {
          status: errorStatus,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
            ...CORS_HEADERS
          }
        }
      );
    }
  },
};
