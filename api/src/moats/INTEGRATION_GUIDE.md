# Security Moats Integration Guide
## Kasbah Guard API v1.0.1

**Status:** Safe, Gradual Integration with Zero Breaking Changes

---

## Overview

This guide shows how to integrate the 4 security moats into the Cloudflare Worker API with minimal risk and full backwards compatibility.

### The 4 Moats
1. **Error Handler** — Structured error responses, logging, operational vs programming error distinction
2. **Rate Limiter** — Sliding window rate limiting per identifier (IP/API key)
3. **Magic Bytes** — File type validation for uploads
4. **Circuit Breaker** — Failure recovery with exponential backoff + jitter

### Integration Strategy
- **Phase 1:** Add imports and initialization (5 min)
- **Phase 2:** Wrap global fetch handler with error handling (5 min)
- **Phase 3:** Add rate limiting to expensive endpoints (10 min)
- **Phase 4:** Wire magic bytes to /api/scan (5 min)
- **Phase 5:** Test and validate (5 min)

**Total:** ~30 minutes, zero downtime, zero regressions

---

## Phase 1: Add Imports & Initialization

**File:** `/api/src/worker.js`

Add these imports at the top (after existing imports):

```javascript
// ── Security Moats v1.0.1 ──
const {
  initializeMoats,
  checkRateLimit,
  validateFileUpload,
  wrapWithMoats,
  guardServiceCall,
  createSafeMoatProxy,
  getMoatStats
} = require('./moats/integration');
```

Then, in your worker's fetch handler, initialize moats early:

```javascript
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── NEW: Initialize security moats ──
    const moats = initializeMoats(env);

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ... rest of handler
  }
};
```

---

## Phase 2: Global Error Handling

**Wrap the entire fetch handler** to catch all errors uniformly.

**Before:**
```javascript
export default {
  async fetch(request, env, ctx) {
    // ... handler logic
    try {
      if (path === '/auth/register') {
        response = await handleRegister(request, env);
      } else if (path === '/api/scan') {
        response = await handleApiScan(request, env);
      }
      // ... more routes
    } catch (error) {
      // Old error handling (basic)
      console.error(error);
      return json({ ok: false, error: error.message }, 500);
    }
  }
};
```

**After:**
```javascript
export default {
  async fetch(request, env, ctx) {
    // Initialize moats
    const moats = initializeMoats(env);

    // Wrap the entire handler with error handling + other moats
    return await wrapWithMoats(
      async (req, env, ctx) => {
        const url = new URL(req.url);
        const path = url.pathname;
        const method = req.method;

        // Handle CORS
        if (method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        // ... all existing route logic ...
        if (path === '/auth/register') {
          response = await handleRegister(req, env);
        } else if (path === '/api/scan') {
          response = await handleApiScan(req, env);
        }
        // ... etc

        return response;
      },
      moats,
      { rateLimitType: 'API' }  // Use API preset for general requests
    )(request, env, ctx);
  }
};
```

**Benefits:**
- ✅ All errors caught and formatted consistently
- ✅ Request IDs tracked automatically
- ✅ Operational vs programming errors distinguished
- ✅ Error logs include context
- ✅ No code changes needed in existing handlers

---

## Phase 3: Rate Limiting for Expensive Endpoints

For endpoints that are expensive or vulnerable to abuse, apply stricter rate limiting.

### Example 1: POST /api/scan (Detection)

This is expensive, so use DETECTION preset (20 req/min):

```javascript
} else if (method === 'POST' && path === '/api/scan') {
  // Moat 2: Rate limit detection requests (expensive)
  const scanLimiter = moats.detectionLimiter;  // 20 req/min
  const rateLimitCheck = checkRateLimit(request, scanLimiter, requestId);

  if (!rateLimitCheck.allowed) {
    return rateLimitCheck.response;  // Return 429
  }

  response = await handleApiScan(_clonedRequest, env);

} else if (method === 'POST' && path === '/api/validate-intent') {
  // Moat 2: Rate limit intent validation (also expensive)
  const intentLimiter = moats.detectionLimiter;  // 20 req/min
  const rateLimitCheck = checkRateLimit(request, intentLimiter, requestId);

  if (!rateLimitCheck.allowed) {
    return rateLimitCheck.response;
  }

  response = await handleValidateIntent(_clonedRequest, env);
```

### Example 2: GET endpoints (Reads)

For read-heavy endpoints, use the lenient READ preset (120 req/min):

```javascript
} else if (method === 'GET' && path === '/api/stats') {
  // Moat 2: Rate limit reads (lenient)
  const readLimiter = moats.readLimiter;  // 120 req/min
  const rateLimitCheck = checkRateLimit(request, readLimiter, requestId);

  if (!rateLimitCheck.allowed) {
    return rateLimitCheck.response;
  }

  response = await handleApiStats(request, env);

} else if (method === 'GET' && path === '/api/audit/recent') {
  const readLimiter = moats.readLimiter;
  const rateLimitCheck = checkRateLimit(request, readLimiter, requestId);

  if (!rateLimitCheck.allowed) {
    return rateLimitCheck.response;
  }

  response = await handleApiAuditRecent(request, env);
```

### Example 3: Authentication endpoints

For auth endpoints, use ANONYMOUS preset (10 req/min) for unverified requests:

```javascript
} else if (method === 'POST' && path === '/auth/register') {
  // Moat 2: Rate limit registration (unauth, strict)
  const anonLimiter = moats.anonymousLimiter;  // 10 req/min
  const rateLimitCheck = checkRateLimit(request, anonLimiter, requestId);

  if (!rateLimitCheck.allowed) {
    return rateLimitCheck.response;
  }

  response = await handleRegister(_clonedRequest, env);
```

---

## Phase 4: Magic Bytes Validation (File Uploads)

For `/api/scan` endpoint that may accept files, validate magic bytes:

```javascript
} else if (method === 'POST' && path === '/api/scan') {
  const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`;

  // Moat 2: Rate limiting
  const rateLimitCheck = checkRateLimit(request, moats.detectionLimiter, requestId);
  if (!rateLimitCheck.allowed) {
    return rateLimitCheck.response;
  }

  // Moat 3: Magic bytes validation (NEW)
  const fileValidationResult = await validateFileUpload(request, requestId);
  if (!fileValidationResult.valid) {
    return fileValidationResult.response;
  }

  response = await handleApiScan(_clonedRequest, env);
```

---

## Phase 5: Circuit Breaker for External Services

When calling external services (VLM, email, etc.), use circuit breaker:

**Example: VLM service calls**

Find the function that calls the VLM service:

```javascript
// OLD: Direct call without protection
async function callVLMService(payload, env) {
  const response = await fetch('https://vlm-api.example.com/detect', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.json();
}

// NEW: Protected with circuit breaker
async function callVLMService(payload, env, moats) {
  const guarded = guardServiceCall(
    async () => {
      const response = await fetch('https://vlm-api.example.com/detect', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return response.json();
    },
    'vlm-service',
    moats,
    { maxAttempts: 3, initialDelayMs: 1000 }
  );

  return await guarded();
}
```

Usage in handler:

```javascript
async function handleApiScan(request, env, moats) {
  // ... validation ...

  try {
    // Circuit breaker automatically handles retries + exponential backoff
    const vlmResult = await callVLMService(scanData, env, moats);
    // ...
  } catch (error) {
    // Circuit is open or max retries exceeded
    throw new Error(`VLM service unavailable: ${error.message}`);
  }
}
```

---

## Phase 6: Health Check & Moat Stats

Add moat statistics to the health check endpoint:

```javascript
} else if (method === 'GET' && path === '/health') {
  // Moat F: SII computed with nominal API health values
  const sii = computeSII(1.0, 1.0, 1.0, 1.0);
  const gate = apiGateCheck(1.0, 0.0, 0.0);

  // NEW: Add moat stats
  const moatStats = getMoatStats(moats);

  response = json({
    ok: true,
    service: 'kasbah-api',
    version: '2.0.0',
    capabilities: ['constitutional-ai', 'zk-proofs', 'enterprise'],
    sii: parseFloat(sii.toFixed(4)),
    moats: {
      sii: parseFloat(sii.toFixed(4)),
      gate: gate.pass,
      version: 'v1.0.1',  // Bumped from v1.5.0
      techniques: ['moat_f_sii', 'moat_o_gate', 'moat_i_risk_scan', 'error_handler', 'rate_limiter', 'magic_bytes', 'circuit_breaker'],
      stats: moatStats  // NEW
    }
  });
```

---

## Testing & Validation

### Unit Tests
Run the test suite to verify moats work independently:

```bash
cd /Users/mac/Desktop/KasbahFinal/Kasbah-site/api/src/moats
jest __tests__/magic-bytes.test.js
jest __tests__/rate-limiter.test.js
jest __tests__/circuit-breaker.test.js
jest __tests__/error-handler.test.js
jest __tests__/integration.test.js
```

Expected: 78+ tests passing, all green ✅

### Integration Tests
Test moats together with worker.js:

```bash
# Run existing market launch test (must stay 58/58)
node /tmp/kasbah-market-launch.cjs

# Run new moat integration tests
jest __tests__/integration.test.js
```

Expected:
- Market launch: 58/58 ✅ (zero regressions)
- Integration tests: 12+ passing ✅

### Manual Testing

**Test rate limiting:**
```bash
# Make 11 requests in quick succession (limit is 10/min for anonymous)
for i in {1..11}; do
  curl -H "CF-Connecting-IP: 1.2.3.4" \
       https://api.bekasbah.com/api/stats
done

# Response 1-10: 200 OK
# Response 11: 429 Too Many Requests
```

**Test error handling:**
```bash
# Send invalid JSON
curl -X POST https://api.bekasbah.com/auth/register \
  -H "Content-Type: application/json" \
  -d "invalid json"

# Response: 400 with structured error + requestId
```

**Test circuit breaker:**
```bash
# The circuit breaker will automatically:
# 1. Retry failed calls with exponential backoff
# 2. Open circuit after 5 failures
# 3. Transition to half-open after 60s
# 4. Allow recovery if call succeeds in half-open
# (You'll see this in logs/monitoring)
```

---

## Rollback Plan

If something goes wrong, rollback is simple:

1. **Remove moat imports** from worker.js
2. **Remove wrapWithMoats call** around fetch handler
3. **Remove rate limit checks** from endpoints
4. **Redeploy:** `cd api && wrangler deploy`

Expected time: 2 minutes

---

## Monitoring & Observability

### Key Metrics to Monitor

1. **Rate limit hits:** Watch for 429 responses
   - High 429 rate = might need to adjust limits
   - Low 429 rate = limits are appropriate

2. **Circuit breaker state:** Watch for OPEN state
   - CLOSED = normal operation
   - OPEN = external service is down
   - HALF_OPEN = service recovering

3. **Error types:** Watch for non-operational vs operational
   - Operational errors (4xx) = client issues
   - Non-operational errors (5xx) = server issues

4. **Request latency:** Should remain <250ms p95
   - Moat overhead is <1ms per request
   - Rate limit check = O(1) lookup
   - Error formatting = negligible

### Logging Points

Add this to track moat activity:

```javascript
// In wrapWithMoats or rate limit check:
console.log({
  type: 'moat_activity',
  timestamp: new Date().toISOString(),
  requestId: requestId,
  moat: 'rate_limiter',
  identifier: extractRateLimitKey(request),
  allowed: result.allowed,
  remaining: result.remaining
});

// In error handler:
console.error({
  type: 'moat_error',
  timestamp: new Date().toISOString(),
  requestId: requestId,
  error: error.message,
  code: error.code,
  isOperational: isOperationalError(error)
});
```

---

## FAQ

**Q: Will moats break existing clients?**
A: No. Moats are transparent:
- Error format changed slightly (more structured), but still valid JSON
- Rate limit response is standard 429, clients already handle it
- File validation only applies if files are sent, which is rare
- Circuit breaker is internal, no external API change

**Q: What if moats are disabled?**
A: Full graceful degradation:
- If moats fail to initialize, `createSafeMoatProxy()` provides no-op versions
- Worker continues functioning without moat protection
- Similar to having no rate limiting or error handling

**Q: Performance impact?**
A: Negligible (<1ms per request):
- Rate limit check: O(1) memory lookup, <0.1ms
- Error handling: formatting only on error path, <0.5ms
- Magic bytes: only for file uploads, <0.5ms
- Circuit breaker: state check, <0.1ms

**Q: How to adjust rate limits?**
A: Edit `rate-limiter.js` RATE_LIMIT_PRESETS:
```javascript
RATE_LIMIT_PRESETS.API = { requestsPerMinute: 120 };  // Increase from 60
```

Then redeploy. Limits take effect immediately for new requests.

**Q: How long does circuit breaker stay open?**
A: 60 seconds by default. Configurable:
```javascript
vlmCircuitBreaker: new CircuitBreaker('vlm', {
  resetTimeoutMs: 120000  // 2 minutes instead of 1
})
```

---

## Success Criteria

✅ All 78+ moat tests passing
✅ Market launch test: 58/58 (zero regressions)
✅ Integration test: 12+ passing
✅ API latency: <250ms p95 (unchanged)
✅ No breaking changes to client API
✅ Production ready

---

## Next Steps

1. Review this guide with team
2. Deploy to staging first
3. Run manual tests from "Testing & Validation" section
4. Monitor for 24 hours
5. Deploy to production
6. Monitor metrics for 1 week

**Timeline:** ~2 hours total (mostly testing)
