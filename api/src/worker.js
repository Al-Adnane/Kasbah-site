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
 * Storage: Cloudflare KV
 *   USERS    — key: email, value: { id, email, name, passwordHash, salt, plan, verified, createdAt, lastLogin }
 *   USERS    — key: verify:{email}, value: { code, createdAt, attempts } (TTL: 1 hour)
 *   SESSIONS — key: token, value: { userId, email, createdAt, expiresAt }
 */

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
  const name = (body.name || '').trim() || email.split('@')[0];

  if (!email || !email.includes('@') || !email.includes('.')) {
    return err('Valid email required');
  }
  if (password.length < 6) {
    return err('Password must be at least 6 characters');
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

async function handleLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON');
  }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  const userData = await env.USERS.get(email);
  if (!userData) {
    return err('Invalid credentials', 401);
  }

  const user = JSON.parse(userData);
  const attemptHash = await hashPassword(password, user.salt);

  if (attemptHash !== user.passwordHash) {
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

// ── Main router ──

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (method === 'POST' && path === '/auth/register') {
        return await handleRegister(request, env);
      }
      if (method === 'POST' && path === '/auth/verify') {
        return await handleVerify(request, env);
      }
      if (method === 'POST' && path === '/auth/resend') {
        return await handleResend(request, env);
      }
      if (method === 'POST' && path === '/auth/login') {
        return await handleLogin(request, env);
      }
      if (method === 'GET' && path === '/auth/me') {
        return await handleMe(request, env);
      }
      if (method === 'POST' && path === '/auth/logout') {
        return await handleLogout(request, env);
      }
      if (method === 'GET' && path === '/auth/stats') {
        return await handleStats(env);
      }
      if (method === 'GET' && path === '/health') {
        return json({ ok: true, service: 'kasbah-api', version: '2.0.0' });
      }

      return err('Not found', 404);
    } catch (e) {
      return err('Internal error: ' + e.message, 500);
    }
  },
};
