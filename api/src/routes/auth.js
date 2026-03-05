/**
 * Kasbah Guard — Auth Routes (Cloudflare Worker)
 * 
 * Handles all authentication-related endpoints:
 * - POST /auth/register
 * - POST /auth/verify
 * - POST /auth/resend
 * - POST /auth/login
 * - GET /auth/me
 * - POST /auth/logout
 * - GET /auth/stats
 */

const { hashPassword, bufToHex, generateSalt, generateId, generateVerificationCode, createToken, verifyToken, extractBearer, getSigningKey } = require('../utils/crypto');
const { buildVerificationEmailHTML, sendVerificationEmail } = require('../utils/email');
const { json, err } = require('../utils/response');
const { checkRateLimit } = require('../moats/integration');

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

  // Check if email is verified
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

module.exports = {
  handleRegister,
  handleVerify,
  handleResend,
  handleLogin,
  handleMe,
  handleLogout,
  handleStats,
  checkLoginRateLimit,
  recordFailedLogin,
};
