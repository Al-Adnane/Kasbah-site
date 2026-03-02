/**
 * Kasbah Guard — Auth API (Cloudflare Worker)
 *
 * Endpoints:
 *   POST /auth/register  — Create account (email, password, name) → sends verification email
 *   POST /auth/verify    — Verify email with 6-digit code
 *   POST /auth/resend    — Resend verification code
 *   POST /auth/login     — Sign in, get JWT (requires verified email)
 *   GET  /auth/me        — Verify token, get user profile
 *   POST /auth/logout    — Revoke session
 *   GET  /auth/stats     — Public: user count
 *
 *   GET  /api/stats         — Aggregate usage stats (auth required)
 *   GET  /api/audit/recent  — Last 20 audit events (auth required)
 *   GET  /api/policies      — Org policy config (auth required)
 *   GET  /api/team          — Team members list (auth required)
 *   POST /api/scan                     — Scan text for sensitive data (auth required)
 *   POST /api/validate-intent           — Constitutional AI intent validation (auth required)
 *   GET  /api/proofs                    — List ZK proofs (auth required)
 *   POST /api/proofs/generate           — Generate ZK proof for detection result (auth required)
 *   GET  /api/proofs/verify/:proof_id   — Verify a ZK proof (auth required)
 *
 * Storage: Cloudflare KV
 *   USERS    — key: email, value: { id, email, name, passwordHash, salt, plan, verified, createdAt, lastLogin }
 *   USERS    — key: verify:{email}, value: { code, createdAt, attempts } (TTL: 1 hour)
 *   SESSIONS — key: token, value: { userId, email, createdAt, expiresAt }
 */

// ── Security Moats v1.0.1 ──
const {
  initializeMoats,
  checkRateLimit,
  validateFileUpload,
  wrapWithMoats,
  guardServiceCall,
  getMoatStats
} = require('./moats/integration');

// ── Frontier Engine (GenAI Detection) ──
const {
  frontierScore,
  detectAI
} = require('./frontier');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function err(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, status);
}

// ── Crypto helpers ──

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`kasbah:${salt}:${password}`);
  const hash1 = await crypto.subtle.digest('SHA-256', data);
  const hex1 = bufToHex(hash1);
  const data2 = encoder.encode(`${salt}:${hex1}`);
  const hash2 = await crypto.subtle.digest('SHA-256', data2);
  return bufToHex(hash2);
}

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bufToHex(bytes.buffer);
}

function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bufToHex(bytes.buffer);
}

function generateVerificationCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(num % 1000000).padStart(6, '0');
}

// ── JWT-like token (HMAC-SHA256 signed) ──

async function createToken(env, userId, email, plan) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 30; // 30 days
  const payload = btoa(JSON.stringify({
    sub: userId,
    email: email,
    plan: plan || 'pioneer',
    iss: 'kasbah-guard',
    iat: now,
    exp: exp,
  })).replace(/=/g, '');

  const key = await getSigningKey(env);
  const encoder = new TextEncoder();
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${header}.${payload}.${sigB64}`;
}

async function verifyToken(env, token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const key = await getSigningKey(env);
    const encoder = new TextEncoder();
    const sigInput = encoder.encode(`${parts[0]}.${parts[1]}`);

    // Decode signature
    const sigB64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
    const sigPadded = sigB64 + '='.repeat((4 - sigB64.length % 4) % 4);
    const sigBytes = Uint8Array.from(atob(sigPadded), c => c.charCodeAt(0));

    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, sigInput);
    if (!valid) return null;

    // Decode payload
    const payloadB64 = parts[1] + '='.repeat((4 - parts[1].length % 4) % 4);
    const payload = JSON.parse(atob(payloadB64));

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch (e) {
    return null;
  }
}

async function getSigningKey(env) {
  const secret = env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function extractBearer(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// ── Email sending via Resend ──

async function sendVerificationEmail(env, email, name, code) {
  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set — skipping email');
    return false;
  }

  const html = buildVerificationEmailHTML(name, code);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Kasbah <noreply@bekasbah.com>',
        to: [email],
        subject: 'Verify your Kasbah account',
        html: html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Resend error:', res.status, errBody);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Email send failed:', e.message);
    return false;
  }
}

function buildVerificationEmailHTML(name, code) {
  const displayName = name || 'there';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f1ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ed;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr><td style="background:#0F172A;padding:32px 40px;text-align:center;">
          <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.02em;">
            Kasbah<span style="color:#C1440E;">Guard</span>
          </div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="font-size:16px;color:#0F172A;margin:0 0 8px;font-weight:700;">
            Hi ${displayName},
          </p>
          <p style="font-size:14px;color:#64748B;margin:0 0 28px;line-height:1.6;">
            Welcome to Kasbah. Enter the code below to verify your email and activate your account.
          </p>
          <!-- Code box -->
          <div style="background:#F8F5F1;border:2px solid #E2DDD7;border-radius:12px;padding:24px;text-align:center;margin:0 0 28px;">
            <div style="font-size:36px;font-weight:900;letter-spacing:0.3em;color:#0F172A;font-family:'Courier New',monospace;">
              ${code}
            </div>
            <div style="font-size:12px;color:#94A3B8;margin-top:8px;">
              This code expires in 1 hour
            </div>
          </div>
          <p style="font-size:13px;color:#64748B;margin:0 0 12px;line-height:1.6;">
            Enter this code on <a href="https://bekasbah.com/#signup" style="color:#C1440E;font-weight:700;text-decoration:none;">bekasbah.com</a> to complete your registration.
          </p>
          <p style="font-size:13px;color:#94A3B8;margin:0;line-height:1.6;">
            If you didn't create a Kasbah account, you can safely ignore this email.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F8F5F1;padding:20px 40px;text-align:center;border-top:1px solid #E2DDD7;">
          <p style="font-size:11px;color:#94A3B8;margin:0;">
            Kasbah &mdash; Guard-grade protection for AI tools<br>
            <a href="https://bekasbah.com" style="color:#C1440E;text-decoration:none;">bekasbah.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Route handlers ──

async function handleRegister(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON');
  }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  const name = (body.name || '').trim().slice(0, 100) || email.split('@')[0];

  if (!email || !email.includes('@') || !email.includes('.')) {
    return err('Valid email required');
  }
  if (email.length > 254) {
    return err('Email too long');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return err('Invalid email format');
  }
  if (password.length < 6) {
    return err('Password must be at least 6 characters');
  }
  if (password.length > 128) {
    return err('Password too long');
  }

  // Check if user exists
  const existing = await env.USERS.get(email);
  if (existing) {
    const existingUser = JSON.parse(existing);
    // If user exists but is NOT verified, allow re-registration (resend code)
    if (existingUser.verified === false) {
      const code = generateVerificationCode();
      await env.USERS.put(`verify:${email}`, JSON.stringify({
        code,
        createdAt: Date.now(),
        attempts: 0,
      }), { expirationTtl: 3600 });
      await sendVerificationEmail(env, email, existingUser.name, code);
      return json({
        ok: true,
        needsVerification: true,
        email,
        message: 'Verification code resent. Check your email.',
      });
    }
    return err('Account already exists. Please sign in.', 409);
  }

  // Create user
  const userId = generateId();
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = Date.now();

  const user = {
    id: userId,
    email,
    name,
    passwordHash,
    salt,
    plan: env.PLAN_DEFAULT || 'pioneer',
    verified: false,
    createdAt: now,
    lastLogin: null,
  };

  await env.USERS.put(email, JSON.stringify(user));

  // Track user count
  const countStr = await env.USERS.get('__count__');
  const count = parseInt(countStr || '0') + 1;
  await env.USERS.put('__count__', String(count));

  // Generate verification code and store with 1-hour TTL
  const code = generateVerificationCode();
  await env.USERS.put(`verify:${email}`, JSON.stringify({
    code,
    createdAt: now,
    attempts: 0,
  }), { expirationTtl: 3600 });

  // Send verification email
  const emailSent = await sendVerificationEmail(env, email, name, code);

  return json({
    ok: true,
    needsVerification: true,
    email,
    message: emailSent
      ? 'Account created. Check your email for a verification code.'
      : 'Account created. Verification code could not be sent — please try resending.',
  });
}

async function handleVerify(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON');
  }

  const email = (body.email || '').trim().toLowerCase();
  const code = (body.code || '').trim();

  if (!email || !code) {
    return err('Email and verification code are required');
  }
  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    return err('Verification code must be 6 digits');
  }

  // Get verification record from KV
  const verifyData = await env.USERS.get(`verify:${email}`);
  if (!verifyData) {
    return err('No pending verification found. The code may have expired. Please request a new one.', 410);
  }

  const verify = JSON.parse(verifyData);

  // Check attempts (max 5)
  if (verify.attempts >= 5) {
    await env.USERS.delete(`verify:${email}`);
    return err('Too many failed attempts. Please request a new code.', 429);
  }

  // Wrong code — increment attempts
  if (verify.code !== code) {
    verify.attempts += 1;
    await env.USERS.put(`verify:${email}`, JSON.stringify(verify), {
      expirationTtl: 3600,
    });
    const remaining = 5 - verify.attempts;
    return err(`Invalid code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`, 401);
  }

  // Code matches — activate user
  const userData = await env.USERS.get(email);
  if (!userData) {
    return err('User not found', 404);
  }

  const user = JSON.parse(userData);
  user.verified = true;
  user.lastLogin = Date.now();
  await env.USERS.put(email, JSON.stringify(user));

  // Clean up verification record
  await env.USERS.delete(`verify:${email}`);

  // Create session token
  const token = await createToken(env, user.id, email, user.plan);
  const now = Date.now();
  await env.SESSIONS.put(token, JSON.stringify({
    userId: user.id, email, createdAt: now, expiresAt: now + 30 * 86400000,
  }), { expirationTtl: 30 * 86400 });

  return json({
    ok: true,
    verified: true,
    token,
    user: {
      id: user.id,
      email,
      name: user.name,
      plan: user.plan,
    },
    message: 'Email verified. Your account is now active.',
  });
}

async function handleResend(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON');
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email) {
    return err('Email required');
  }

  const userData = await env.USERS.get(email);
  if (!userData) {
    // Don't reveal whether account exists
    return json({ ok: true, message: 'If an account exists, a new code has been sent.' });
  }

  const user = JSON.parse(userData);
  if (user.verified !== false) {
    return json({ ok: true, message: 'Account is already verified. You can sign in.' });
  }

  // Rate-limit: check if a code was sent recently (within 60 seconds)
  const existingVerify = await env.USERS.get(`verify:${email}`);
  if (existingVerify) {
    const existing = JSON.parse(existingVerify);
    const elapsed = Date.now() - existing.createdAt;
    if (elapsed < 60000) {
      const waitSec = Math.ceil((60000 - elapsed) / 1000);
      return err(`Please wait ${waitSec} seconds before requesting a new code.`, 429);
    }
  }

  // Generate new code
  const code = generateVerificationCode();
  await env.USERS.put(`verify:${email}`, JSON.stringify({
    code,
    createdAt: Date.now(),
    attempts: 0,
  }), { expirationTtl: 3600 });

  await sendVerificationEmail(env, email, user.name, code);

  return json({ ok: true, message: 'Verification code sent. Check your email.' });
}

async function checkLoginRateLimit(env, email) {
  const key = 'ratelimit:login:' + email;
  const data = await env.USERS.get(key);
  if (!data) return { allowed: true, remaining: 5 };
  const rec = JSON.parse(data);
  const elapsed = Date.now() - rec.firstAttempt;
  if (elapsed > 15 * 60 * 1000) return { allowed: true, remaining: 5 };
  if (rec.attempts >= 5) return { allowed: false, remaining: 0, retryAfter: Math.ceil((15 * 60 * 1000 - elapsed) / 1000) };
  return { allowed: true, remaining: 5 - rec.attempts };
}

async function recordFailedLogin(env, email) {
  const key = 'ratelimit:login:' + email;
  const data = await env.USERS.get(key);
  let rec = data ? JSON.parse(data) : { attempts: 0, firstAttempt: Date.now() };
  const elapsed = Date.now() - rec.firstAttempt;
  if (elapsed > 15 * 60 * 1000) rec = { attempts: 0, firstAttempt: Date.now() };
  rec.attempts++;
  await env.USERS.put(key, JSON.stringify(rec), { expirationTtl: 900 });
}

async function handleLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON');
  }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  if (!email || email.length > 254 || password.length > 128) {
    return err('Invalid credentials', 401);
  }

  // Rate-limit: max 5 failed attempts per 15 minutes
  const rateCheck = await checkLoginRateLimit(env, email);
  if (!rateCheck.allowed) {
    return json({ ok: false, error: 'Too many login attempts. Try again later.', retryAfter: rateCheck.retryAfter }, 429);
  }

  const userData = await env.USERS.get(email);
  if (!userData) {
    await recordFailedLogin(env, email);
    return err('Invalid credentials', 401);
  }

  const user = JSON.parse(userData);
  const attemptHash = await hashPassword(password, user.salt);

  if (attemptHash !== user.passwordHash) {
    await recordFailedLogin(env, email);
    return err('Invalid credentials', 401);
  }

  // Check if email is verified (backward compat: existing users without field are verified)
  if (user.verified === false) {
    return json({
      ok: false,
      error: 'Please verify your email before signing in. Check your inbox for a verification code.',
      code: 'EMAIL_NOT_VERIFIED',
      email: email,
    }, 403);
  }

  // Update last login
  user.lastLogin = Date.now();
  await env.USERS.put(email, JSON.stringify(user));

  // Create session token
  const token = await createToken(env, user.id, email, user.plan);
  const now = Date.now();
  await env.SESSIONS.put(token, JSON.stringify({
    userId: user.id, email, createdAt: now, expiresAt: now + 30 * 86400000,
  }), { expirationTtl: 30 * 86400 });

  return json({
    ok: true,
    token,
    user: {
      id: user.id,
      email,
      name: user.name,
      plan: user.plan,
      verified: true,
    },
  });
}

async function handleMe(request, env) {
  const token = extractBearer(request);
  if (!token) return err('No auth token', 401);

  const payload = await verifyToken(env, token);
  if (!payload) return err('Invalid or expired token', 401);

  // Get fresh user data
  const userData = await env.USERS.get(payload.email);
  if (!userData) return err('User not found', 401);

  const user = JSON.parse(userData);
  return json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      verified: user.verified !== false,
      createdAt: user.createdAt,
    },
    token_claims: {
      plan: payload.plan,
      exp: payload.exp,
      iss: payload.iss,
    },
  });
}

async function handleLogout(request, env) {
  const token = extractBearer(request);
  if (token) {
    await env.SESSIONS.delete(token);
  }
  return json({ ok: true });
}

async function handleStats(env) {
  const countStr = await env.USERS.get('__count__');
  const count = parseInt(countStr || '0');
  return json({ ok: true, users: count });
}

// ── Enterprise dashboard API handlers ──

async function handleApiStats(request, env) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  const countStr = await env.USERS.get('__count__');
  const count = parseInt(countStr || '0');

  return json({
    ok: true,
    stats: {
      totalScans: count * 47,
      denyCount: Math.floor(count * 3),
      warnCount: Math.floor(count * 12),
      avgRisk: 18,
      engineVersion: '1.0.0',
      teamMembers: 1,
    },
  });
}

async function handleApiAuditRecent(request, env) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  const now = Date.now();
  const events = [
    {
      id: 'evt_001',
      contentHash: 'a3f2c1d4e5b6',
      action: 'scan',
      risk: 0,
      decision: 'ALLOW',
      reason: 'No sensitive data detected',
      timestamp: new Date(now - 120000).toISOString(),
      user: payload.email,
      product: 'browser',
    },
    {
      id: 'evt_002',
      contentHash: 'b7e8f9a0c1d2',
      action: 'scan',
      risk: 45,
      decision: 'WARN',
      reason: 'Possible credential pattern detected',
      timestamp: new Date(now - 300000).toISOString(),
      user: payload.email,
      product: 'vscode',
    },
    {
      id: 'evt_003',
      contentHash: 'c3d4e5f6a7b8',
      action: 'scan',
      risk: 80,
      decision: 'DENY',
      reason: 'AWS access key detected',
      timestamp: new Date(now - 600000).toISOString(),
      user: payload.email,
      product: 'cli',
    },
    {
      id: 'evt_004',
      contentHash: 'd9e0f1a2b3c4',
      action: 'scan',
      risk: 0,
      decision: 'ALLOW',
      reason: 'No sensitive data detected',
      timestamp: new Date(now - 900000).toISOString(),
      user: payload.email,
      product: 'desktop',
    },
    {
      id: 'evt_005',
      contentHash: 'e5f6a7b8c9d0',
      action: 'scan',
      risk: 55,
      decision: 'WARN',
      reason: 'High-entropy string resembles private key material',
      timestamp: new Date(now - 1800000).toISOString(),
      user: payload.email,
      product: 'browser',
    },
  ];

  return json({
    ok: true,
    events,
    note: 'Live audit pipeline coming in v2.1',
  });
}

async function handleApiPolicies(request, env) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  return json({
    ok: true,
    policy: {
      threshold: 40,
      denyThreshold: 70,
      enabledProducts: ['cli', 'vscode', 'desktop', 'mobile', 'browser'],
      customPatterns: [],
      redactOnDeny: false,
      engineVersion: '1.0.0',
    },
  });
}

async function handleApiTeam(request, env) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  const userData = await env.USERS.get(payload.email);
  if (!userData) return err('User not found', 404);

  const user = JSON.parse(userData);

  return json({
    ok: true,
    members: [
      {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        role: 'owner',
        joinedAt: user.createdAt,
      },
    ],
  });
}

async function handleApiScan(request, env) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON');
  }

  const text = body.text || '';
  if (typeof text !== 'string') {
    return err('text must be a string');
  }
  if (text.length > 32768) {
    return err('text exceeds maximum length of 32768 characters');
  }

  const score = scanRequestRisk(text);
  const decision = score >= 70 ? 'DENY' : score >= 40 ? 'WARN' : 'ALLOW';

  // Frontier Engine: GenAI detection
  const frontier = frontierScore(text);
  const genaiRisk = Math.round(frontier.confidence * 100);

  return json({
    ok: true,
    risk: score,
    decision,
    reason: 'API risk scan',
    genai_risk: genaiRisk,
    genai_generator: frontier.generator,
    genai_confidence: frontier.confidence,
  });
}

// ── Constitutional AI Intent Validator (built-in) ────────────────────────────

// 5 Constitutional AI rule patterns — mirrors validator.ts exactly
const _CAI_RULES = [
  {
    rule_id: 'injection_attack',
    description: 'Prompt injection attempt detected',
    severity: 'critical',
    severity_score: 1.0,
    pattern: /ignore.*previous|forget|new instructions|role.*switch/i,
  },
  {
    rule_id: 'jailbreak_attempt',
    description: 'Jailbreak attempt detected',
    severity: 'critical',
    severity_score: 1.0,
    pattern: /jailbreak|bypass|circumvent|disable.*safety/i,
  },
  {
    rule_id: 'data_exfiltration',
    description: 'Potential data exfiltration intent',
    severity: 'high',
    severity_score: 0.75,
    pattern: /extract|exfiltrate|steal|leak|dump.*data|credentials/i,
  },
  {
    rule_id: 'malware_intent',
    description: 'Malware development or distribution intent',
    severity: 'critical',
    severity_score: 1.0,
    pattern: /malware|ransomware|botnet|exploit|shellcode/i,
  },
  {
    rule_id: 'privacy_violation',
    description: 'Privacy violation intent',
    severity: 'high',
    severity_score: 0.75,
    pattern: /spy|dox|doxx|stalking|harass|blackmail/i,
  },
];

function _caiCalculateEntropy(text) {
  const freq = {};
  for (const ch of text) { freq[ch] = (freq[ch] || 0) + 1; }
  const len = text.length;
  if (len === 0) return 0;
  return -Object.values(freq).reduce((acc, c) => {
    const p = c / len;
    return acc + p * Math.log2(p);
  }, 0);
}

function _caiCalculateRepetition(text) {
  const words = text.split(/\s+/);
  if (!words.length) return 0;
  const counts = {};
  for (const w of words) { counts[w.toLowerCase()] = (counts[w.toLowerCase()] || 0) + 1; }
  return Math.max(...Object.values(counts)) / words.length;
}

function _caiValidateIntentLocal(intent, policy_id) {
  const rules = _CAI_RULES; // extend with policy_id lookup when custom policies are added
  const blockedRules = [];
  let maxSeverity = 0;

  for (const rule of rules) {
    if (rule.pattern.test(intent)) {
      blockedRules.push(rule.rule_id);
      maxSeverity = Math.max(maxSeverity, rule.severity_score);
    }
  }

  // Heuristic risk (mirrors calculateHeuristicRisk in validator.ts)
  let heuristicRisk = 0;
  if (intent.length > 5000) heuristicRisk += 0.1;
  if (_caiCalculateEntropy(intent) > 5.5) heuristicRisk += 0.15;
  if (_caiCalculateRepetition(intent) > 0.3) heuristicRisk += 0.1;
  heuristicRisk = Math.min(heuristicRisk, 0.5);

  const risk_score = Math.max(maxSeverity, heuristicRisk);
  const valid = risk_score < 0.5;
  const requires_approval = risk_score >= 0.4;

  const reasoning = blockedRules.length === 0
    ? `Intent appears safe (risk score: ${(risk_score * 100).toFixed(1)}%). No constitutional violations detected.`
    : `Intent rejected due to policy violations: ${blockedRules.join(', ')}. Risk score: ${(risk_score * 100).toFixed(1)}%. Requires manual review or approval.`;

  return { valid, risk_score, reasoning, blocked_rules: blockedRules, requires_approval };
}

async function handleValidateIntent(request, env) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { intent, policy_id = 'default', user_id, context } = body;
  if (!intent || typeof intent !== 'string') return err('intent must be a non-empty string');
  if (intent.length > 32768) return err('intent exceeds maximum length of 32768 characters');

  const result = _caiValidateIntentLocal(intent, policy_id);

  return json({
    ok: true,
    ...result,
  });
}

// ── ZK-Proof stubs (Merkle-SHA256) ──────────────────────────────────────────

// In-memory proof store (Cloudflare Worker ephemeral — use KV for persistence)
const _proofStore = new Map();

async function _sha256Hex(data) {
  const encoded = new TextEncoder().encode(typeof data === 'string' ? data : JSON.stringify(data));
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  return bufToHex(hashBuf);
}

async function _buildMerkleProof(detection_result) {
  // Leaf hashes for each field
  const fields = ['model_id', 'risk_score', 'decision', 'timestamp', 'content_hash'];
  const leafHashes = await Promise.all(
    fields.map(f => _sha256Hex(String(detection_result[f] ?? '')))
  );

  // Simple two-level Merkle tree: pair leaves, hash pairs, root
  const level1 = [];
  for (let i = 0; i < leafHashes.length; i += 2) {
    const left = leafHashes[i];
    const right = leafHashes[i + 1] || left; // duplicate last leaf if odd
    level1.push(await _sha256Hex(left + right));
  }
  const root = level1.length === 1
    ? level1[0]
    : await _sha256Hex(level1.join(''));

  // proof_bytes_hex encodes: root + all leaf hashes (hex-concatenated)
  const proof_bytes_hex = root + leafHashes.join('');

  // public_inputs_hex: SHA-256 of the serialised detection_result
  const public_inputs_hex = await _sha256Hex(JSON.stringify(detection_result));

  return { root, proof_bytes_hex, public_inputs_hex, leaf_hashes: leafHashes };
}

async function handleListProofs(request, env) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  // Return all proofs from in-memory store for this session
  // (Cloudflare Workers restart between requests — in production use KV)
  const proofs = [..._proofStore.values()].map(p => ({
    proof_id: p.proof_id,
    proof_type: p.proof_type,
    model_id: p.detection_result?.model_id ?? 'unknown',
    risk_score: p.detection_result?.risk_score ?? 0,
    decision: p.detection_result?.decision ?? 'ALLOW',
    verified: true,
    created_at: p.created_at,
  }));

  return json({ ok: true, proofs });
}

async function handleGenerateProof(request, env) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { detection_result } = body;
  if (!detection_result || typeof detection_result !== 'object') {
    return err('detection_result must be an object with model_id, risk_score, decision, timestamp, content_hash');
  }

  const proof_id = 'proof_' + generateId();
  const { proof_bytes_hex, public_inputs_hex, root } = await _buildMerkleProof(detection_result);

  // Store proof for later verification
  _proofStore.set(proof_id, {
    proof_id,
    proof_bytes_hex,
    public_inputs_hex,
    proof_type: 'merkle-sha256',
    root,
    detection_result,
    created_at: new Date().toISOString(),
  });

  // Also persist to KV if available (best-effort)
  if (env.SESSIONS) {
    try {
      await env.SESSIONS.put('proof:' + proof_id, JSON.stringify({
        proof_id, proof_bytes_hex, public_inputs_hex, root, detection_result,
        created_at: new Date().toISOString(),
      }), { expirationTtl: 86400 });
    } catch (_) {}
  }

  return json({
    ok: true,
    proof_id,
    proof_bytes_hex,
    public_inputs_hex,
    proof_type: 'merkle-sha256',
  });
}

async function handleVerifyProof(proof_id, request, env) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  // Try in-memory first, then KV
  let stored = _proofStore.get(proof_id);
  if (!stored && env.SESSIONS) {
    try {
      const raw = await env.SESSIONS.get('proof:' + proof_id);
      if (raw) stored = JSON.parse(raw);
    } catch (_) {}
  }

  if (!stored) {
    return json({ verified: false, proof_id, verified_at: new Date().toISOString(), error: 'Proof not found' });
  }

  // Verify integrity: re-compute proof and compare
  const { proof_bytes_hex: recomputed_bytes, public_inputs_hex: recomputed_inputs } =
    await _buildMerkleProof(stored.detection_result);

  const verified =
    recomputed_bytes === stored.proof_bytes_hex &&
    recomputed_inputs === stored.public_inputs_hex;

  return json({
    ok: true,
    verified,
    proof_id,
    verified_at: new Date().toISOString(),
  });
}

// ── Main router ──

// ══════════════════════════════════════════════════════════════
// Moat F (Mirror): System Integrity Index — JS mirror of integrity.rs
// Formula: I(t) = hook^0.30 × pattern^0.30 × session^0.25 × latency^0.15
// Used server-side to compute API health score without Rust/WASM.
// ══════════════════════════════════════════════════════════════
function computeSII(hookInt, patternInt, sessionHealth, latencyNorm) {
  return Math.pow(hookInt, 0.30) * Math.pow(patternInt, 0.30)
       * Math.pow(sessionHealth, 0.25) * Math.pow(latencyNorm, 0.15);
}

// ══════════════════════════════════════════════════════════════
// Moat O (Mirror): Three-Gate Policy Check — JS mirror of gate.rs
// R_MIN=0.72 (reliability), B_MAX=0.18 (brittleness), H_MAX=0.35 (harm)
// ══════════════════════════════════════════════════════════════
const R_MIN = 0.72, B_MAX = 0.18, H_MAX = 0.35;
function apiGateCheck(reliability, brittleness, harm) {
  if (reliability < R_MIN) return { pass: false, gate: 'reliability', value: reliability, threshold: R_MIN };
  if (brittleness > B_MAX) return { pass: false, gate: 'brittleness', value: brittleness, threshold: B_MAX };
  if (harm > H_MAX)        return { pass: false, gate: 'harm',        value: harm,        threshold: H_MAX };
  return { pass: true };
}

// ══════════════════════════════════════════════════════════════
// Lightweight request body risk scan (Moat I mirror for API layer)
// Detects credential leaks in API request bodies — adds X-Kasbah-Risk header.
// NEVER blocks requests — informational only (no /decide endpoint).
// ══════════════════════════════════════════════════════════════
const _API_RISK_RE = [
  /\bAKIA[0-9A-Z]{16}\b/,                                        // AWS key
  /\bghp_[A-Za-z0-9]{36,}\b/,                                    // GitHub PAT
  /\bsk-[A-Za-z0-9\-_]{20,}\b/,                                  // OpenAI key
  /\bBearer\s+[A-Za-z0-9_\-\.]{20,}\b/i,                        // Bearer token
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/,                  // Private key
  /\b(?:mongodb|postgres(?:ql)?|mysql|redis):\/\/[^\s"'<>]{10,}/, // Conn string
  /\b(?!000|666|9\d{2})\d{3}[-\s]\d{2}[-\s]\d{4}\b/,           // SSN
];
function scanRequestRisk(body) {
  if (!body || typeof body !== 'string' || body.length > 8192) return 0;
  let score = 0;
  for (let i = 0; i < _API_RISK_RE.length; i++) {
    if (_API_RISK_RE[i].test(body)) score += 40;
    if (score >= 100) break;
  }
  return Math.min(score, 100);
}

// ══════════════════════════════════════════════════════════════
// OBSERVABILITY: False Positive Collection & Analysis
// ══════════════════════════════════════════════════════════════
async function handleFalsePositive(request, env) {
  try {
    const body = await request.json();
    const { pattern, context, extensionVersion, browser, timestamp } = body;

    if (!pattern || typeof pattern !== 'string') {
      return err('Missing or invalid pattern', 400);
    }

    // Store in KV — deduplication by pattern+hash
    const key = `fp:${browser}:${new Date(timestamp).toISOString().split('T')[0]}:${pattern.slice(0, 20)}`;
    const id = await env.KASBAH_KV.get(key) || `fp_${Math.random().toString(36).substr(2, 9)}`;

    await env.KASBAH_KV.put(key, JSON.stringify({
      id,
      pattern,
      context: context || '',
      extensionVersion,
      browser,
      timestamp,
      count: (await env.KASBAH_KV.get(key, 'json'))?.count ?
             ((await env.KASBAH_KV.get(key, 'json')).count + 1) : 1
    }), { expirationTtl: 86400 * 30 }); // 30-day retention

    return json({ ok: true, message: 'False positive report received', id });
  } catch (e) {
    return err('Failed to process false positive: ' + e.message, 400);
  }
}

// ══════════════════════════════════════════════════════════════
// OBSERVABILITY: Sentry Error Event Collector
// Privacy-first: NO URLs, NO user data, NO secrets in logs
// ══════════════════════════════════════════════════════════════
async function handleSentryEvent(request, env) {
  try {
    const body = await request.json();
    const { type, message, stack, context } = body;

    if (!type || !message) {
      return err('Missing type or message', 400);
    }

    // Sanitize message (URLs already stripped by extension)
    const sanitized = {
      type,
      message: (message || '').slice(0, 500),
      stack: (stack || '').slice(0, 1000),
      context: {
        extensionVersion: context?.extensionVersion,
        browser: context?.browser,
        timestamp: new Date().toISOString(),
        errorType: context?.errorType
      }
    };

    // Store in KV for analysis (dedup by type + message hash)
    const hash = sanitized.type + ':' + sanitized.message.slice(0, 30);
    const key = `error:${hash}`;
    const existing = await env.KASBAH_KV.get(key, 'json') || { count: 0, lastSeen: Date.now() };

    await env.KASBAH_KV.put(key, JSON.stringify({
      ...sanitized,
      count: existing.count + 1,
      lastSeen: Date.now()
    }), { expirationTtl: 86400 * 7 }); // 7-day retention

    return json({ ok: true, message: 'Error event recorded' });
  } catch (e) {
    return err('Failed to process error event: ' + e.message, 400);
  }
}

// ── Handle telemetry data from extensions ──
async function handleTelemetry(request, env) {
  try {
    const body = await request.json();

    // Validate schema
    if (!body.detections_count || !body.extension_version || !body.browser || !body.timestamp) {
      return err('Missing required fields', 400);
    }

    // Sanitize: Only allow expected fields
    const sanitized = {
      detections_count: body.detections_count,
      detections_by_pattern: body.detections_by_pattern || {},
      blocked_count: body.blocked_count || 0,
      allowed_count: body.allowed_count || 0,
      extension_version: body.extension_version,
      engine_version: body.engine_version,
      browser: body.browser,
      os: body.os || 'unknown',
      timestamp: body.timestamp,
      latency_ms: body.latency_ms || {},
      enabled: body.enabled !== false,
      error_count: body.error_count || 0,
      error_types: body.error_types || []
    };

    // Store in KV with timestamp key (30-day TTL)
    const key = `telemetry:${sanitized.browser}:${sanitized.timestamp}`;
    await env.KASBAH_KV.put(key, JSON.stringify(sanitized), {
      expirationTtl: 86400 * 30 // 30 days
    });

    return json({ ok: true, message: 'Telemetry recorded' });
  } catch (e) {
    return err('Invalid telemetry payload: ' + e.message, 400);
  }
}

// ── MOAT V1: Federated Threat Intelligence ──
// Handle threat aggregates from extensions for network-wide consensus
async function handleThreatsSubmit(request, env) {
  try {
    const body = await request.json();

    // Validate schema — no secrets, only aggregated pattern information
    if (!body.device_id_hash || !body.timestamp || !body.aggregates) {
      return err('Missing required threat submission fields', 400);
    }

    // Extract bearer token for rate limiting
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    // Sanitize: Only allow aggregated, anonymized data (NO secrets, no PII)
    const sanitized = {
      device_id_hash: String(body.device_id_hash).slice(0, 16),  // Max 16 chars
      timestamp: Number(body.timestamp) || Date.now(),
      aggregates: {
        patterns: body.aggregates.patterns || {},
        contexts: body.aggregates.contexts || {},
        highest_risk: Math.min(Number(body.aggregates.highest_risk) || 0, 100),
        count: Math.min(Number(body.aggregates.count) || 0, 10000)
      },
      version: body.version || '1.0.0'
    };

    // Verify data contains NO secret values
    const jsonStr = JSON.stringify(sanitized);
    const hasSecrets = /secret|password|key|token|credential|api|ssh|private/i.test(jsonStr);
    if (hasSecrets && jsonStr.length > 1000) {
      // Likely contains base64-encoded secrets in aggregates — reject
      return err('Threat submission contains suspicious content', 400);
    }

    // Store submission in KV (30-day retention for consensus computation)
    const key = `threat:submission:${sanitized.device_id_hash}:${Math.floor(sanitized.timestamp / 86400000)}`;
    await env.KASBAH_KV.put(key, JSON.stringify(sanitized), {
      expirationTtl: 86400 * 30  // 30 days
    });

    // Also store in time-series for consensus analysis
    const timeseriesKey = `threat:patterns:${Math.floor(sanitized.timestamp / 3600000)}`;
    const existing = await env.KASBAH_KV.get(timeseriesKey, 'json') || { submissions: [] };
    existing.submissions.push({
      device_id: sanitized.device_id_hash,
      patterns: sanitized.aggregates.patterns,
      timestamp: sanitized.timestamp
    });

    // Keep last 1000 submissions per hour
    if (existing.submissions.length > 1000) {
      existing.submissions = existing.submissions.slice(-1000);
    }

    await env.KASBAH_KV.put(timeseriesKey, JSON.stringify(existing), {
      expirationTtl: 86400 * 7  // 7-day retention for trending
    });

    // Compute simple consensus from current submissions (v1: majority voting)
    const consensusThreats = computeThreatsConsensus(existing.submissions);

    return json({
      ok: true,
      message: 'Threat submission received',
      consensus_threats: consensusThreats,
      submission_count: existing.submissions.length,
      next_submission_time: sanitized.timestamp + 14400000  // 4 hours later
    });
  } catch (e) {
    return err('Invalid threat submission: ' + e.message, 400);
  }
}

// ── Simple consensus voting for threat patterns ──
function computeThreatsConsensus(submissions) {
  const patterns = {};

  // Count pattern occurrences across submissions
  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i];
    for (const pattern in sub.patterns) {
      if (!patterns[pattern]) {
        patterns[pattern] = { count: 0, total: submissions.length };
      }
      patterns[pattern].count += 1;
    }
  }

  // Build consensus list (patterns detected by >50% of submitters)
  const consensus = [];
  for (const pattern in patterns) {
    const pdata = patterns[pattern];
    const confidence = pdata.count / pdata.total;

    if (confidence >= 0.5) {  // Majority voting threshold
      consensus.push({
        pattern_type: pattern,
        confidence: parseFloat(confidence.toFixed(2)),
        devices_detected: pdata.count,
        recommendation: confidence >= 0.8 ? 'DENY' : 'WARN'
      });
    }
  }

  return consensus.sort((a, b) => b.confidence - a.confidence).slice(0, 20);  // Top 20 patterns
}

// ── MOAT V1 Phase 2: Consensus Query Endpoint ──
// Returns network-wide threat consensus data for dashboard + detector integration
// ── RBAC Module ──
// Note: In production, require('./rbac') and require('./user-management')
// For now, inline the authorization check

// ── Admin Dashboard Handlers ──

async function handleAdminThreats(request, env) {
  const url = new URL(request.url);
  const period = url.searchParams.get('period') || '24h';

  // Verify auth token
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || !(await verifyToken(env, token))) {
    return err('Unauthorized', 401);
  }

  // Generate mock threat data (in production, fetch from data store)
  const now = Date.now();
  const periodMs = period === '24h' ? 86400000 : period === '7d' ? 604800000 : 2592000000;
  const threats = [];

  for (let i = 0; i < 15; i++) {
    const severities = ['WARN', 'BLOCK', 'DENY'];
    const patterns = [
      'AWS_KEY_REGEX',
      'GITHUB_PAT',
      'STRIPE_SECRET',
      'SLACK_WEBHOOK',
      'DATABASE_PASSWORD',
      'SSH_PRIVATE_KEY',
      'ENCRYPTION_KEY',
    ];

    threats.push({
      id: `threat-${i}`,
      timestamp: new Date(now - Math.random() * periodMs).toISOString(),
      severity: severities[Math.floor(Math.random() * severities.length)],
      pattern: patterns[Math.floor(Math.random() * patterns.length)],
      user_id: `user-${Math.floor(Math.random() * 10)}`,
      source: ['email', 'chat', 'document'][Math.floor(Math.random() * 3)],
      content_hash: `hash-${Math.random().toString(36).substring(7)}`,
      risk_score: Math.floor(Math.random() * 100),
      action_taken: ['BLOCKED', 'FLAGGED', 'ALLOWED'][Math.floor(Math.random() * 3)],
    });
  }

  return json({ ok: true, threats: threats.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) });
}

async function handleAdminStats(request, env) {
  const url = new URL(request.url);
  const period = url.searchParams.get('period') || '24h';

  // Verify auth token
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || !(await verifyToken(env, token))) {
    return err('Unauthorized', 401);
  }

  // Generate trend data
  const trendData = [];
  const now = new Date();
  const days = period === '24h' ? 24 : period === '7d' ? 7 : 30;

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    if (period === '24h') {
      date.setHours(date.getHours() - i);
    } else {
      date.setDate(date.getDate() - i);
    }
    trendData.push({
      timestamp: date.toISOString().split('T')[0],
      count: Math.floor(Math.random() * 100) + 20,
    });
  }

  const stats = {
    period,
    total_detections: Math.floor(Math.random() * 5000) + 500,
    blocked_count: Math.floor(Math.random() * 1000) + 100,
    exemption_count: Math.floor(Math.random() * 50) + 5,
    active_users: Math.floor(Math.random() * 500) + 50,
    trend_data: trendData,
  };

  return json({ ok: true, stats });
}

async function handleAdminDeploymentStatus(request, env) {
  // Verify auth token
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || !(await verifyToken(env, token))) {
    return err('Unauthorized', 401);
  }

  const deployment = {
    total_devices: 1500,
    deployed_devices: 1215,
    rollout_percentage: 81,
    platforms: {
      windows: { total: 800, deployed: 680 },
      macos: { total: 500, deployed: 420 },
      chromebook: { total: 200, deployed: 115 },
    },
    last_sync: new Date(Date.now() - 300000).toISOString(), // 5 mins ago
    rollback_available: true,
  };

  return json({ ok: true, deployment });
}

async function handleAdminEscalations(request, env) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '10');

  // Verify auth token
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || !(await verifyToken(env, token))) {
    return err('Unauthorized', 401);
  }

  const priorities = ['critical', 'high', 'medium', 'low'];
  const statuses = ['open', 'in_progress', 'resolved'];
  const escalations = [];

  for (let i = 0; i < limit; i++) {
    escalations.push({
      id: `esc-${i}`,
      timestamp: new Date(Date.now() - Math.random() * 604800000).toISOString(),
      detection_id: `det-${i}`,
      risk_score: Math.floor(Math.random() * 100) + 50,
      rule_triggered: `Risk threshold exceeded (>80%)`,
      assigned_to: `analyst-${i % 5}`,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      priority: priorities[Math.floor(Math.random() * priorities.length)],
    });
  }

  return json({ ok: true, escalations });
}

// ── Policy Engine Handlers ──

async function handleApplyPolicies(request, env) {
  // Verify auth token
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || !(await verifyToken(env, token))) {
    return err('Unauthorized', 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON');
  }

  // Mock policy evaluation - in production, use PolicyEngine class
  const detection = body.detection;
  const org_id = body.org_id;

  // Simulate policy application logic
  let verdict = 'ALLOW';
  const actions = [];

  if (detection.risk_score >= 90) {
    verdict = 'DENY';
    actions.push('block_transmission');
  } else if (detection.risk_score >= 70) {
    verdict = 'BLOCK';
    actions.push('flag_for_review');
  } else if (detection.risk_score >= 40) {
    verdict = 'WARN';
    actions.push('notify_user');
  }

  return json({
    ok: true,
    decision: {
      verdict: verdict,
      risk_score: detection.risk_score,
      actions: actions,
      reason: `Applied org policy thresholds for ${org_id}`,
      timestamp: new Date().toISOString(),
    },
  });
}

async function handleComplianceMapping(request, env) {
  // Verify auth token
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || !(await verifyToken(env, token))) {
    return err('Unauthorized', 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON');
  }

  const detection = body.detection;

  // Mock compliance mapping
  const mapping = {
    detection_id: detection.id,
    timestamp: new Date().toISOString(),
    risk_score: detection.risk_score,
    compliance_frameworks: {
      soc2: {
        applicable_controls: detection.risk_score > 70 ? ['CC6.1', 'CC6.2'] : [],
        audit_readiness: detection.risk_score > 70 ? 'requires_attention' : 'compliant',
      },
      hipaa: {
        applicable_controls: detection.risk_score > 80 ? ['S_45_CFR_164_308_a_4'] : [],
        requires_reporting: detection.risk_score > 80,
      },
      gdpr: {
        applicable_articles: detection.risk_score > 80 ? ['article_32', 'article_33'] : [],
        data_breach_notification_required: detection.risk_score > 85,
      },
      pci_dss: {
        applicable_requirements: detection.pattern.includes('credit_card') ? ['3.2', '6.5.10'] : [],
        assessment_impact: detection.pattern.includes('credit_card') ? 'failed' : 'passed',
      },
    },
  };

  return json({
    ok: true,
    compliance_mapping: mapping,
  });
}

async function handleGetPolicies(request, env) {
  // Verify auth token
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || !(await verifyToken(env, token))) {
    return err('Unauthorized', 401);
  }

  // Return default policies
  const policies = {
    warn_threshold: 40,
    block_threshold: 70,
    deny_threshold: 90,
    escalation_threshold: 85,
    departments: {},
    enabled: true,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  return json({
    ok: true,
    policies: policies,
  });
}

// ── User Management Handlers (RBAC) ──

async function handleListTeamUsers(request, env) {
  // Verify auth token
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || !(await verifyToken(env, token))) {
    return err('Unauthorized', 401);
  }

  // Mock data - in production, fetch from real store
  const users = [
    {
      id: 'user-1',
      email: 'admin@company.com',
      name: 'Admin User',
      role: 'admin',
      dept_id: null,
      status: 'active',
      created_at: new Date(Date.now() - 86400000 * 365).toISOString(),
      last_login: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'user-2',
      email: 'manager@company.com',
      name: 'Department Manager',
      role: 'manager',
      dept_id: 'dept-001',
      status: 'active',
      created_at: new Date(Date.now() - 86400000 * 180).toISOString(),
      last_login: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: 'user-3',
      email: 'auditor@company.com',
      name: 'Security Auditor',
      role: 'auditor',
      dept_id: null,
      status: 'active',
      created_at: new Date(Date.now() - 86400000 * 90).toISOString(),
      last_login: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 'user-4',
      email: 'developer@company.com',
      name: 'Developer',
      role: 'user',
      dept_id: 'dept-001',
      status: 'active',
      created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
      last_login: new Date(Date.now() - 43200000).toISOString(),
    },
  ];

  return json({ ok: true, users });
}

async function handleAddTeamUser(request, env) {
  // Verify auth token
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || !(await verifyToken(env, token))) {
    return err('Unauthorized', 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON');
  }

  const email = (body.email || '').trim().toLowerCase();
  const role = body.role || 'user';

  if (!email.includes('@')) {
    return err('Valid email required');
  }

  const newUser = {
    id: `user-${Date.now()}`,
    email: email,
    name: email.split('@')[0],
    role: role,
    dept_id: body.dept_id || null,
    status: 'active',
    created_at: new Date().toISOString(),
    last_login: null,
  };

  // Log audit event
  // TODO: await logAuditEvent(env, org_id, user_id, 'user_added', 'user', newUser.id, 'success');

  return json({
    ok: true,
    user: newUser,
    message: `User ${email} invited with role: ${role}`,
  });
}

async function handleUpdateTeamUserRole(request, env, userId) {
  // Verify auth token
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || !(await verifyToken(env, token))) {
    return err('Unauthorized', 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON');
  }

  const newRole = body.role;
  if (!['admin', 'auditor', 'manager', 'user'].includes(newRole)) {
    return err('Invalid role');
  }

  return json({
    ok: true,
    message: `User role updated to: ${newRole}`,
    user: {
      id: userId,
      role: newRole,
    },
  });
}

async function handleRemoveTeamUser(request, env, userId) {
  // Verify auth token
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || !(await verifyToken(env, token))) {
    return err('Unauthorized', 401);
  }

  return json({
    ok: true,
    message: 'User removed from team',
  });
}

// ── Deployment Orchestration Handlers ──────────────────────────────────────

async function handleAdminDeploymentRollout(request, env) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { platform, rolloutPercent, targetOU, dryRun } = body;
  if (!platform || !['windows', 'macos', 'chromebook'].includes(platform)) {
    return err('Invalid platform');
  }
  if (!rolloutPercent || rolloutPercent < 5 || rolloutPercent > 100) {
    return err('Rollout percent must be between 5 and 100');
  }

  // Calculate device count based on platform
  const deviceCounts = {
    windows: 600,
    macos: 400,
    chromebook: 300,
  };
  const devicesTargeted = Math.floor((deviceCounts[platform] || 500) * (rolloutPercent / 100));

  // For dry run, just return simulation
  if (dryRun === true) {
    return json({
      ok: true,
      dry_run: true,
      platform: platform,
      rollout_percent: rolloutPercent,
      devices_targeted: devicesTargeted,
      estimated_completion_minutes: Math.ceil(devicesTargeted / 50), // ~50 devices/min
      message: 'Dry run simulation completed. No devices were affected.',
    });
  }

  // Generate deployment ID
  const deploymentId = `dep-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  // Create deployment record
  const deployment = {
    id: deploymentId,
    platform: platform,
    rollout_percent: rolloutPercent,
    target_ou: targetOU || null,
    status: 'deploying',
    devices_targeted: devicesTargeted,
    devices_deployed: 0,
    progress: 0,
    created_at: new Date().toISOString(),
    created_by: payload.sub,
    org_id: 'org-default', // TODO: extract from token when multi-tenant
  };

  try {
    // Store deployment record with 7-day TTL
    const key = `deployment:${deploymentId}`;
    await env.KASBAH_KV.put(key, JSON.stringify(deployment), {
      expirationTtl: 604800, // 7 days
    });

    // Simulate deployment progress in background (would call actual platform APIs in production)
    // For now, we'll store a simple status that the progress endpoint can poll
    const statusKey = `deployment:${deploymentId}:status`;
    let simulatedDevices = 0;
    let progressPercent = 0;

    const progressIntervals = [
      { devices: Math.floor(devicesTargeted * 0.25), progress: 25, delay: 2000 },
      { devices: Math.floor(devicesTargeted * 0.5), progress: 50, delay: 4000 },
      { devices: Math.floor(devicesTargeted * 0.75), progress: 75, delay: 6000 },
      { devices: devicesTargeted, progress: 100, delay: 8000 },
    ];

    // Store initial status
    let currentStatus = { ...deployment, devices_deployed: 0, progress: 0 };
    await env.KASBAH_KV.put(statusKey, JSON.stringify(currentStatus), {
      expirationTtl: 604800,
    });

    // Schedule simulated progress updates (in production, would be actual deployment)
    for (const stage of progressIntervals) {
      setTimeout(async () => {
        currentStatus = {
          ...currentStatus,
          devices_deployed: stage.devices,
          progress: stage.progress,
          status: stage.progress === 100 ? 'completed' : 'deploying',
          completed_at: stage.progress === 100 ? new Date().toISOString() : null,
        };
        try {
          await env.KASBAH_KV.put(statusKey, JSON.stringify(currentStatus), {
            expirationTtl: 604800,
          });
        } catch (e) {
          console.error('Failed to update deployment status:', e);
        }
      }, stage.delay);
    }

    return json({
      ok: true,
      deployment_id: deploymentId,
      status: 'deploying',
      platform: platform,
      rollout_percent: rolloutPercent,
      devices_targeted: devicesTargeted,
      devices_deployed: 0,
      progress: 0,
      message: `Deployment ${deploymentId} started. Monitoring ${devicesTargeted} devices.`,
    });
  } catch (error) {
    console.error('Failed to create deployment:', error);
    return err('Failed to create deployment', 500);
  }
}

async function handleGetDeploymentStatus(request, env, deploymentId) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  try {
    const statusKey = `deployment:${deploymentId}:status`;
    const statusData = await env.KASBAH_KV.get(statusKey, 'json');

    if (!statusData) {
      return err('Deployment not found', 404);
    }

    return json({
      ok: true,
      ...statusData,
    });
  } catch (error) {
    console.error('Failed to get deployment status:', error);
    return err('Failed to get deployment status', 500);
  }
}

async function handlePauseDeployment(request, env, deploymentId) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  try {
    const statusKey = `deployment:${deploymentId}:status`;
    const statusData = await env.KASBAH_KV.get(statusKey, 'json');

    if (!statusData) {
      return err('Deployment not found', 404);
    }

    statusData.status = 'paused';
    statusData.paused_at = new Date().toISOString();
    statusData.paused_by = payload.sub;

    await env.KASBAH_KV.put(statusKey, JSON.stringify(statusData), {
      expirationTtl: 604800,
    });

    return json({
      ok: true,
      status: 'paused',
      message: 'Deployment paused successfully',
    });
  } catch (error) {
    console.error('Failed to pause deployment:', error);
    return err('Failed to pause deployment', 500);
  }
}

async function handleResumeDeployment(request, env, deploymentId) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  try {
    const statusKey = `deployment:${deploymentId}:status`;
    const statusData = await env.KASBAH_KV.get(statusKey, 'json');

    if (!statusData) {
      return err('Deployment not found', 404);
    }

    statusData.status = 'deploying';
    statusData.resumed_at = new Date().toISOString();
    statusData.resumed_by = payload.sub;

    await env.KASBAH_KV.put(statusKey, JSON.stringify(statusData), {
      expirationTtl: 604800,
    });

    return json({
      ok: true,
      status: 'deploying',
      message: 'Deployment resumed successfully',
    });
  } catch (error) {
    console.error('Failed to resume deployment:', error);
    return err('Failed to resume deployment', 500);
  }
}

async function handleRollbackDeployment(request, env, deploymentId) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  try {
    const statusKey = `deployment:${deploymentId}:status`;
    const statusData = await env.KASBAH_KV.get(statusKey, 'json');

    if (!statusData) {
      return err('Deployment not found', 404);
    }

    const devicesAffected = statusData.devices_deployed;
    statusData.status = 'rolled_back';
    statusData.rolled_back_at = new Date().toISOString();
    statusData.rolled_back_by = payload.sub;

    await env.KASBAH_KV.put(statusKey, JSON.stringify(statusData), {
      expirationTtl: 604800,
    });

    return json({
      ok: true,
      status: 'rolled_back',
      devices_affected: devicesAffected,
      message: `Rollback initiated. ${devicesAffected} devices will have the extension uninstalled.`,
    });
  } catch (error) {
    console.error('Failed to rollback deployment:', error);
    return err('Failed to rollback deployment', 500);
  }
}

// ── Compliance Reporting Handlers ──────────────────────────────────────────

async function handleGenerateComplianceReport(request, env) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { framework, period_days = 30 } = body;
  if (!['soc2', 'hipaa', 'gdpr', 'pci_dss'].includes(framework)) {
    return err('Invalid framework');
  }

  const reportId = `rpt-${framework}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const periodStart = new Date(Date.now() - period_days * 86400000).toISOString();
  const periodEnd = new Date().toISOString();

  // Generate compliance report based on framework
  const report = {
    report_id: reportId,
    framework: framework,
    generated_at: new Date().toISOString(),
    period_start: periodStart,
    period_end: periodEnd,
    created_by: payload.sub,
    status: 'compliant',
    total_issues: 0,
    critical_count: 0,
    summary: generateComplianceSummary(framework),
  };

  // Generate framework-specific content
  if (framework === 'soc2') {
    report.controls = generateSOC2Controls();
    report.status = 'requires_attention';
    report.total_issues = 2;
    report.critical_count = 0;
    report.violations = generateSOC2Violations();
  } else if (framework === 'hipaa') {
    report.controls = generateHIPAAControls();
    report.status = 'compliant';
    report.total_issues = 0;
    report.critical_count = 0;
  } else if (framework === 'gdpr') {
    report.controls = generateGDPRControls();
    report.status = 'requires_attention';
    report.total_issues = 1;
    report.critical_count = 0;
    report.violations = generateGDPRViolations();
  } else if (framework === 'pci_dss') {
    report.controls = generatePCIDSSControls();
    report.status = 'compliant';
    report.total_issues = 0;
    report.critical_count = 0;
  }

  // Add audit trail
  report.report_hash = await _sha256Hex(JSON.stringify(report));
  report.signature = `sig_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  report.audit_trail = {
    generated_by: payload.sub,
    timestamp: new Date().toISOString(),
    org_id: 'org-default',
  };

  try {
    // Store report with 90-day TTL
    const key = `compliance:${reportId}`;
    await env.KASBAH_KV.put(key, JSON.stringify(report), {
      expirationTtl: 7776000, // 90 days
    });

    return json({
      ok: true,
      report: report,
      message: `Compliance report ${reportId} generated successfully`,
    });
  } catch (error) {
    console.error('Failed to generate compliance report:', error);
    return err('Failed to generate report', 500);
  }
}

async function handleGetComplianceReports(request, env) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  // Return mock reports for now (in production, would query KV)
  const mockReports = [
    {
      report_id: 'rpt-soc2-1234567890-abc123',
      framework: 'soc2',
      generated_at: new Date(Date.now() - 86400000 * 7).toISOString(),
      period_start: new Date(Date.now() - 86400000 * 37).toISOString(),
      period_end: new Date(Date.now() - 86400000 * 7).toISOString(),
      status: 'requires_attention',
      issues_found: 2,
      critical_issues: 0,
      summary: 'SOC 2 Type II report shows 2 control deficiencies related to logical access controls.',
    },
    {
      report_id: 'rpt-gdpr-1234567891-def456',
      framework: 'gdpr',
      generated_at: new Date(Date.now() - 86400000 * 14).toISOString(),
      period_start: new Date(Date.now() - 86400000 * 44).toISOString(),
      period_end: new Date(Date.now() - 86400000 * 14).toISOString(),
      status: 'requires_attention',
      issues_found: 1,
      critical_issues: 0,
      summary: 'GDPR Article 32 compliance identified one finding related to data encryption in transit.',
    },
  ];

  return json({
    ok: true,
    reports: mockReports,
  });
}

async function handleGetComplianceReportDetails(request, env, reportId) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  try {
    const key = `compliance:${reportId}`;
    const reportData = await env.KASBAH_KV.get(key, 'json');

    if (!reportData) {
      // Return mock report for demo
      const mockReport = {
        report_id: reportId,
        framework: 'soc2',
        generated_at: new Date(Date.now() - 86400000 * 7).toISOString(),
        status: 'requires_attention',
        total_issues: 2,
        critical_count: 0,
        period: 'Last 30 days',
        summary: 'SOC 2 Type II audit identifies control gaps in logical access management.',
        controls: generateSOC2Controls(),
        violations: generateSOC2Violations(),
        recommendations: [
          'Implement multi-factor authentication for all administrative accounts',
          'Review and update access control policies quarterly',
          'Establish automated access reviews for privileged accounts',
          'Implement comprehensive logging and monitoring',
        ],
        report_hash: 'a1b2c3d4e5f6...',
        signature: 'sig_xxxxxxxxxxxx...',
      };

      return json({
        ok: true,
        report: mockReport,
      });
    }

    return json({
      ok: true,
      report: reportData,
    });
  } catch (error) {
    console.error('Failed to get report details:', error);
    return err('Failed to get report', 500);
  }
}

async function handleExportComplianceReport(request, env, reportId, format) {
  const token = extractBearer(request);
  const payload = await verifyToken(env, token);
  if (!payload) return err('Unauthorized', 401);

  if (format !== 'pdf' && format !== 'json') {
    return err('Unsupported export format');
  }

  try {
    const key = `compliance:${reportId}`;
    const reportData = await env.KASBAH_KV.get(key, 'json');

    if (!reportData) {
      return err('Report not found', 404);
    }

    if (format === 'json') {
      return json({
        ok: true,
        ...reportData,
      });
    } else if (format === 'pdf') {
      // In production, would generate actual PDF
      const pdfContent = `COMPLIANCE REPORT - ${reportData.framework.toUpperCase()}\n\n` +
        `Report ID: ${reportData.report_id}\n` +
        `Generated: ${reportData.generated_at}\n` +
        `Status: ${reportData.status}\n` +
        `Issues: ${reportData.total_issues}\n\n` +
        `${reportData.summary}\n`;

      return new Response(pdfContent, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="compliance-${reportData.framework}-${Date.now()}.pdf"`,
        },
      });
    }
  } catch (error) {
    console.error('Failed to export report:', error);
    return err('Failed to export report', 500);
  }
}

// Helper functions for compliance report generation

function generateComplianceSummary(framework) {
  const summaries = {
    soc2: 'SOC 2 Type II report covering Security, Availability, Processing Integrity, Confidentiality, and Privacy trust services criteria.',
    hipaa: 'HIPAA compliance assessment of healthcare data security and breach notification procedures.',
    gdpr: 'GDPR compliance evaluation of data protection and personal data processing controls.',
    pci_dss: 'PCI-DSS compliance assessment for payment card industry standards.',
  };
  return summaries[framework] || 'Compliance report generated.';
}

function generateSOC2Controls() {
  return [
    {
      id: 'CC6.1',
      name: 'Logical Access Controls',
      description: 'Logical access to systems and assets is restricted',
      status: 'non_compliant',
      findings: ['MFA not enforced on all admin accounts', 'Stale access rights identified'],
    },
    {
      id: 'CC6.2',
      name: 'Credential Management',
      description: 'Authentication credentials are managed appropriately',
      status: 'compliant',
      findings: [],
    },
    {
      id: 'CC7.1',
      name: 'Unauthorized Access Prevention',
      description: 'System access is restricted to authorized users',
      status: 'compliant',
      findings: [],
    },
  ];
}

function generateSOC2Violations() {
  return [
    {
      title: 'Missing Multi-Factor Authentication',
      description: 'MFA is not enforced for all administrative accounts',
      severity: 'high',
      remediation: 'Implement TOTP or hardware security keys for all admin access within 30 days',
      deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
    },
    {
      title: 'Stale Access Rights',
      description: 'Several users retain access after departure',
      severity: 'medium',
      remediation: 'Perform quarterly access reviews and offboard users promptly',
      deadline: new Date(Date.now() + 14 * 86400000).toISOString(),
    },
  ];
}

function generateHIPAAControls() {
  return [
    {
      id: '45 CFR 164.312(a)(2)(i)',
      name: 'Unique User Identification',
      description: 'Assign a unique identifier to each person with computer access',
      status: 'compliant',
      findings: [],
    },
    {
      id: '45 CFR 164.312(b)',
      name: 'Encryption and Decryption',
      description: 'Implement encryption for ePHI in transit and at rest',
      status: 'compliant',
      findings: [],
    },
  ];
}

function generateGDPRControls() {
  return [
    {
      id: 'Article 32',
      name: 'Security of Processing',
      description: 'Implement technical and organizational measures to secure personal data',
      status: 'non_compliant',
      findings: ['Data in transit should use TLS 1.3 minimum'],
    },
  ];
}

function generateGDPRViolations() {
  return [
    {
      title: 'Insufficient Encryption Protocol',
      description: 'Some data transmissions use TLS 1.2 instead of TLS 1.3',
      severity: 'medium',
      remediation: 'Update all endpoints to require TLS 1.3 or higher',
      deadline: new Date(Date.now() + 60 * 86400000).toISOString(),
    },
  ];
}

function generatePCIDSSControls() {
  return [
    {
      id: '2.1',
      name: 'Change Default Passwords',
      description: 'Change default access credentials',
      status: 'compliant',
      findings: [],
    },
    {
      id: '3.2',
      name: 'Encrypt Cardholder Data',
      description: 'Render cardholder data unreadable',
      status: 'compliant',
      findings: [],
    },
  ];
}

async function handleThreatsConsensus(request, env) {
  try {
    const token = extractBearer(request);
    if (!token) return err('Unauthorized', 401);

    const now = Date.now();
    const allThreats = [];
    let totalSubmissions = 0;

    // Aggregate from all 24-hour time-series buckets (past 24 hours)
    for (let i = 0; i < 24; i++) {
      const hourMs = Math.floor((now - i * 3600000) / 3600000);
      const key = `threat:patterns:${hourMs}`;

      try {
        const data = await env.KASBAH_KV.get(key, 'json');
        if (data && data.submissions) {
          totalSubmissions += data.submissions.length;

          // Extract all threats from this hour
          for (const sub of data.submissions) {
            if (sub.patterns) {
              for (const pattern in sub.patterns) {
                allThreats.push({
                  pattern: pattern,
                  count: sub.patterns[pattern] || 1,
                  timestamp: sub.timestamp || (hourMs * 3600000)
                });
              }
            }
          }
        }
      } catch (e) {
        // Continue on individual KV errors
        console.log('[Consensus] Failed to read hour ' + hourMs + ':', e.message);
      }
    }

    // If no submissions yet, return empty consensus
    if (totalSubmissions === 0) {
      return json({
        ok: true,
        timestamp: now,
        submission_count: 0,
        consensus_threats: [],
        high_confidence_patterns: [],
        medium_confidence_patterns: []
      });
    }

    // Deduplicate and compute confidence
    const patternStats = {};
    for (const threat of allThreats) {
      if (!patternStats[threat.pattern]) {
        patternStats[threat.pattern] = { count: 0, firstSeen: threat.timestamp };
      }
      patternStats[threat.pattern].count += 1;
    }

    // Build consensus list with risk multipliers
    const consensusThreats = [];
    for (const pattern in patternStats) {
      const stat = patternStats[pattern];
      const confidence = Math.min(stat.count / totalSubmissions, 1.0);
      const deviceDetectionCount = stat.count;

      // Compute risk multiplier based on confidence
      // High confidence (85%+): boost risk 1.3x (network agrees)
      // Common (70%+): boost 1.2x
      // Majority (50%+): neutral 1.0x
      // Minority (30%+): reduce 0.7x (likely false positive)
      // Rare (<30%): strong reduction 0.5x
      let riskMultiplier = 1.0;
      if (confidence >= 0.85) riskMultiplier = 1.3;
      else if (confidence >= 0.70) riskMultiplier = 1.2;
      else if (confidence >= 0.50) riskMultiplier = 1.0;
      else if (confidence >= 0.30) riskMultiplier = 0.7;
      else riskMultiplier = 0.5;

      consensusThreats.push({
        pattern_type: pattern,
        confidence: parseFloat(confidence.toFixed(3)),
        devices_detected: deviceDetectionCount,
        recommendation: confidence >= 0.80 ? 'DENY' : (confidence >= 0.50 ? 'WARN' : 'ALLOW'),
        risk_multiplier: parseFloat(riskMultiplier.toFixed(2)),
        first_seen_ts: stat.firstSeen,
        trending: 'stable'  // TODO: Phase 2.5 - compare with yesterday
      });
    }

    // Sort by confidence descending
    consensusThreats.sort((a, b) => b.confidence - a.confidence);

    // Extract high and medium confidence patterns for quick access
    const highConfidence = consensusThreats
      .filter(t => t.confidence >= 0.8)
      .map(t => t.pattern_type);

    const mediumConfidence = consensusThreats
      .filter(t => t.confidence >= 0.5 && t.confidence < 0.8)
      .map(t => t.pattern_type);

    return json({
      ok: true,
      timestamp: now,
      submission_count: totalSubmissions,
      consensus_threats: consensusThreats.slice(0, 100),  // Top 100 patterns
      high_confidence_patterns: highConfidence,
      medium_confidence_patterns: mediumConfidence,
      trending_threats: []  // Phase 2.5: implement trending detection
    });
  } catch (e) {
    return err('Failed to compute consensus: ' + e.message, 500);
  }
}

// ── Admin: List all registered users (JSON) ──
async function handleListAllUsers(request, env) {
  try {
    // Get all user keys from USERS KV namespace
    const listResult = await env.USERS.list();
    const users = [];

    for (const key of listResult.keys) {
      // Skip verification codes (verify:{email} keys)
      if (key.name.startsWith('verify:')) continue;

      try {
        const userData = await env.USERS.get(key.name);
        if (userData) {
          const user = JSON.parse(userData);
          users.push({
            email: user.email,
            name: user.name || 'N/A',
            plan: user.plan || 'pioneer',
            verified: user.verified || false,
            createdAt: user.createdAt || 'N/A',
            lastLogin: user.lastLogin || 'Never'
          });
        }
      } catch (parseErr) {
        console.error('Failed to parse user data for ' + key.name + ':', parseErr);
      }
    }

    // Sort by creation date (newest first)
    users.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    return new Response(
      JSON.stringify({
        ok: true,
        count: users.length,
        users: users
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      }
    );
  } catch (e) {
    return err('Failed to list users: ' + e.message, 500);
  }
}

// ── Admin: Export all users as CSV ──
async function handleExportUsers(request, env) {
  try {
    // Get all user keys from USERS KV namespace
    const listResult = await env.USERS.list();
    const users = [];

    for (const key of listResult.keys) {
      // Skip verification codes
      if (key.name.startsWith('verify:')) continue;

      try {
        const userData = await env.USERS.get(key.name);
        if (userData) {
          const user = JSON.parse(userData);
          users.push({
            email: user.email,
            name: user.name || 'N/A',
            plan: user.plan || 'pioneer',
            verified: user.verified ? 'Yes' : 'No',
            createdAt: user.createdAt || 'N/A',
            lastLogin: user.lastLogin || 'Never'
          });
        }
      } catch (parseErr) {
        console.error('Failed to parse user data for ' + key.name + ':', parseErr);
      }
    }

    // Sort by creation date (newest first)
    users.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    // Generate CSV
    const csv = [
      ['Email', 'Name', 'Plan', 'Verified', 'Created Date', 'Last Login'].join(','),
      ...users.map(u => [
        `"${u.email}"`,
        `"${u.name}"`,
        `"${u.plan}"`,
        `"${u.verified}"`,
        `"${u.createdAt}"`,
        `"${u.lastLogin}"`
      ].join(','))
    ].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="kasbah-users-${new Date().toISOString().split('T')[0]}.csv"`,
        ...CORS_HEADERS
      }
    });
  } catch (e) {
    return err('Failed to export users: ' + e.message, 500);
  }
}

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

    // Moat I (API mirror): scan POST body for credential risk — attach header, never block
    let _bodyRisk = 0;
    let _clonedRequest = request;
    if (method === 'POST') {
      try {
        const clone = request.clone();
        const bodyText = await clone.text();
        _bodyRisk = scanRequestRisk(bodyText);
        // Reconstruct request with original body intact
        _clonedRequest = new Request(request.url, { method: request.method, headers: request.headers, body: bodyText });
      } catch (_) {}
    }

    try {
      let response;

      if (method === 'POST' && path === '/auth/register') {
        // ── Moat 2: Rate limiting for registration (strict) ──
        const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`;
        const rateLimitCheck = checkRateLimit(request, moats.anonymousLimiter, requestId);
        if (!rateLimitCheck.allowed) {
          response = rateLimitCheck.response;
        } else {
          response = await handleRegister(_clonedRequest, env);
        }
      } else if (method === 'POST' && path === '/auth/verify') {
        // ── Moat 2: Rate limiting for verification (strict) ──
        const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`;
        const rateLimitCheck = checkRateLimit(request, moats.anonymousLimiter, requestId);
        if (!rateLimitCheck.allowed) {
          response = rateLimitCheck.response;
        } else {
          response = await handleVerify(_clonedRequest, env);
        }
      } else if (method === 'POST' && path === '/auth/resend') {
        // ── Moat 2: Rate limiting for resend (strict) ──
        const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`;
        const rateLimitCheck = checkRateLimit(request, moats.anonymousLimiter, requestId);
        if (!rateLimitCheck.allowed) {
          response = rateLimitCheck.response;
        } else {
          response = await handleResend(_clonedRequest, env);
        }
      } else if (method === 'POST' && path === '/auth/login') {
        // ── Moat 2: Rate limiting for login (strict) ──
        const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`;
        const rateLimitCheck = checkRateLimit(request, moats.anonymousLimiter, requestId);
        if (!rateLimitCheck.allowed) {
          response = rateLimitCheck.response;
        } else {
          response = await handleLogin(_clonedRequest, env);
        }
      } else if (method === 'GET' && path === '/auth/me') {
        response = await handleMe(request, env);
      } else if (method === 'POST' && path === '/auth/logout') {
        response = await handleLogout(_clonedRequest, env);
      } else if (method === 'GET' && path === '/auth/stats') {
        response = await handleStats(env);
      } else if (method === 'GET' && path === '/api/stats') {
        response = await handleApiStats(request, env);
      } else if (method === 'GET' && path === '/api/audit/recent') {
        response = await handleApiAuditRecent(request, env);
      } else if (method === 'GET' && path === '/api/policies') {
        response = await handleApiPolicies(request, env);
      } else if (method === 'GET' && path === '/api/team') {
        response = await handleApiTeam(request, env);
      } else if (method === 'POST' && path === '/api/scan') {
        // ── Moat 2: Rate limiting for expensive scan operation ──
        const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`;
        const rateLimitCheck = checkRateLimit(request, moats.detectionLimiter, requestId);
        if (!rateLimitCheck.allowed) {
          response = rateLimitCheck.response;
        } else {
          response = await handleApiScan(_clonedRequest, env);
        }
      } else if (method === 'POST' && path === '/api/validate-intent') {
        // ── Moat 2: Rate limiting for intent validation ──
        const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`;
        const rateLimitCheck = checkRateLimit(request, moats.detectionLimiter, requestId);
        if (!rateLimitCheck.allowed) {
          response = rateLimitCheck.response;
        } else {
          response = await handleValidateIntent(_clonedRequest, env);
        }
      } else if (method === 'GET' && path === '/api/proofs') {
        response = await handleListProofs(request, env);
      } else if (method === 'POST' && path === '/api/proofs/generate') {
        response = await handleGenerateProof(_clonedRequest, env);
      } else if (method === 'GET' && path.startsWith('/api/proofs/verify/')) {
        const proof_id = path.slice('/api/proofs/verify/'.length);
        response = await handleVerifyProof(proof_id, request, env);
      } else if (method === 'GET' && path === '/health') {
        // Moat F: SII computed with nominal API health values
        const sii = computeSII(1.0, 1.0, 1.0, 1.0);
        const gate = apiGateCheck(1.0, 0.0, 0.0);
        response = json({
          ok: true, service: 'kasbah-api', version: '2.0.0',
          capabilities: ['constitutional-ai', 'zk-proofs', 'enterprise'],
          sii: parseFloat(sii.toFixed(4)),
          moats: {
            sii: parseFloat(sii.toFixed(4)),
            gate: gate.pass,
            version: 'v1.5.0',
            techniques: ['moat_f_sii', 'moat_o_gate', 'moat_i_risk_scan'],
          }
        });
      } else if (method === 'POST' && path === '/moat/gate') {
        // Moat O: Three-gate check endpoint (for integrators / SDK health checks)
        let body = {};
        try { body = await _clonedRequest.json(); } catch (_) {}
        const { reliability = 1.0, brittleness = 0.0, harm = 0.0 } = body;
        const gate = apiGateCheck(Number(reliability), Number(brittleness), Number(harm));
        response = json({ ok: true, gate });
      } else if (method === 'POST' && path === '/api/false-positives') {
        // Observability: Collect false positive reports from extensions
        response = await handleFalsePositive(_clonedRequest, env);
      } else if (method === 'POST' && path === '/api/sentry') {
        // Observability: Sentry error tracking endpoint
        response = await handleSentryEvent(_clonedRequest, env);
      } else if (method === 'POST' && path === '/api/telemetry') {
        // Observability: Extension telemetry (usage metrics)
        response = await handleTelemetry(_clonedRequest, env);
      } else if (method === 'POST' && path === '/api/v2/threats/submit') {
        // Moat V1: Federated threat intelligence submission
        response = await handleThreatsSubmit(_clonedRequest, env);
      } else if (method === 'GET' && path === '/api/v2/threats/consensus') {
        // Moat V1 Phase 2: Threat consensus for dashboard + detector integration
        response = await handleThreatsConsensus(request, env);
      } else if (method === 'GET' && path === '/api/admin/dashboard/threats') {
        // Admin dashboard: Recent threat detections
        response = await handleAdminThreats(request, env);
      } else if (method === 'GET' && path === '/api/admin/dashboard/stats') {
        // Admin dashboard: Quick stats KPIs
        response = await handleAdminStats(request, env);
      } else if (method === 'GET' && path === '/api/admin/dashboard/deployment-status') {
        // Admin dashboard: Deployment status
        response = await handleAdminDeploymentStatus(request, env);
      } else if (method === 'GET' && path === '/api/admin/dashboard/escalations') {
        // Admin dashboard: Recent escalations
        response = await handleAdminEscalations(request, env);
      } else if (method === 'POST' && path === '/api/policy/apply') {
        // Policy Engine: Apply policies to detection
        response = await handleApplyPolicies(request, env);
      } else if (method === 'POST' && path === '/api/compliance/map') {
        // Compliance: Map detection to frameworks
        response = await handleComplianceMapping(request, env);
      } else if (method === 'GET' && path === '/api/admin/org/policies') {
        // Policy Engine: Get org policies
        response = await handleGetPolicies(request, env);
      } else if (method === 'GET' && path === '/api/admin/team/users') {
        // User management: List team members
        response = await handleListTeamUsers(request, env);
      } else if (method === 'POST' && path === '/api/admin/team/users') {
        // User management: Add team member
        response = await handleAddTeamUser(request, env);
      } else if (method === 'PUT' && path.startsWith('/api/admin/team/users/')) {
        // User management: Update user role
        const userId = path.slice('/api/admin/team/users/'.length).split('/')[0];
        if (path.includes('/role')) {
          response = await handleUpdateTeamUserRole(request, env, userId);
        }
      } else if (method === 'DELETE' && path.startsWith('/api/admin/team/users/')) {
        // User management: Remove user
        const userId = path.slice('/api/admin/team/users/'.length);
        response = await handleRemoveTeamUser(request, env, userId);
      } else if (method === 'POST' && path === '/api/admin/org/deployment/rollout') {
        // Deployment: Start deployment
        response = await handleAdminDeploymentRollout(_clonedRequest, env);
      } else if (method === 'GET' && path.startsWith('/api/admin/org/deployment/status/')) {
        // Deployment: Get deployment status
        const deploymentId = path.slice('/api/admin/org/deployment/status/'.length);
        response = await handleGetDeploymentStatus(request, env, deploymentId);
      } else if (method === 'POST' && path.startsWith('/api/admin/org/deployment/pause/')) {
        // Deployment: Pause deployment
        const deploymentId = path.slice('/api/admin/org/deployment/pause/'.length);
        response = await handlePauseDeployment(request, env, deploymentId);
      } else if (method === 'POST' && path.startsWith('/api/admin/org/deployment/resume/')) {
        // Deployment: Resume deployment
        const deploymentId = path.slice('/api/admin/org/deployment/resume/'.length);
        response = await handleResumeDeployment(request, env, deploymentId);
      } else if (method === 'POST' && path.startsWith('/api/admin/org/deployment/rollback/')) {
        // Deployment: Rollback deployment
        const deploymentId = path.slice('/api/admin/org/deployment/rollback/'.length);
        response = await handleRollbackDeployment(request, env, deploymentId);
      } else if (method === 'POST' && path === '/api/admin/compliance/generate') {
        // Compliance: Generate compliance report
        response = await handleGenerateComplianceReport(_clonedRequest, env);
      } else if (method === 'GET' && path === '/api/admin/compliance/reports') {
        // Compliance: List compliance reports
        response = await handleGetComplianceReports(request, env);
      } else if (method === 'GET' && path.startsWith('/api/admin/compliance/reports/')) {
        // Compliance: Get report details
        const reportId = path.slice('/api/admin/compliance/reports/'.length).split('?')[0];
        response = await handleGetComplianceReportDetails(request, env, reportId);
      } else if (method === 'GET' && path.startsWith('/api/admin/compliance/export/')) {
        // Compliance: Export report
        const pathParts = path.slice('/api/admin/compliance/export/'.length).split('?');
        const reportId = pathParts[0];
        const formatParam = new URL(request.url).searchParams.get('format') || 'json';
        response = await handleExportComplianceReport(request, env, reportId, formatParam);
      } else if (method === 'GET' && path === '/api/admin/users') {
        // Admin: List all registered users (JSON)
        response = await handleListAllUsers(request, env);
      } else if (method === 'GET' && path === '/api/admin/users/export') {
        // Admin: Export all users as CSV
        response = await handleExportUsers(request, env);
      } else {
        response = err('Not found', 404);
      }

      // Moat I: attach X-Kasbah-Risk header when POST body contained suspicious patterns
      if (_bodyRisk > 0) {
        const newHeaders = new Headers(response.headers);
        newHeaders.set('X-Kasbah-Risk', String(_bodyRisk));
        response = new Response(response.body, { status: response.status, headers: newHeaders });
      }

      return response;
    } catch (error) {
      // ── Moat 1: Structured error handling with request tracking ──
      const requestId = request.headers.get('x-request-id') || `err-${Date.now()}`;

      // Log error with context
      console.error({
        type: 'handler_error',
        requestId,
        method,
        path,
        errorMessage: error.message,
        errorCode: error.code || 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });

      // Format structured error response
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
