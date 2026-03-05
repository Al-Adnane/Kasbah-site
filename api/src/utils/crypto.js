/**
 * Kasbah Guard — Crypto Utilities
 * 
 * Cryptographic helpers for:
 * - Password hashing (SHA-256)
 * - JWT token creation/verification
 * - Salt and ID generation
 * - Constant-time operations
 */

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

module.exports = {
  hashPassword,
  bufToHex,
  generateSalt,
  generateId,
  generateVerificationCode,
  createToken,
  verifyToken,
  extractBearer,
  getSigningKey,
};
