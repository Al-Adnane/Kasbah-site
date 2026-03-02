/**
 * Kasbah Guard — Role-Based Access Control (RBAC) v1.0.0
 *
 * Implements fine-grained permission model for enterprise deployments.
 *
 * Roles:
 *   - admin:   Full access to all resources and operations
 *   - auditor: Read-only access to logs and reports
 *   - manager: Can manage team and exemptions in own department
 *   - user:    Read-only access to own data
 *
 * Permission Format: "action:resource"
 *   - read:all, write:all, delete:logs, manage:users
 *   - read:own, read:dept, manage:exemptions:dept, etc.
 *
 * Scope Validation:
 *   - org_id: Organization ID from JWT
 *   - dept_id: Department ID (for manager-scoped permissions)
 */

const ROLE_PERMISSIONS = {
  admin: {
    permissions: [
      'read:all',
      'write:all',
      'delete:logs',
      'manage:users',
      'manage:policies',
      'manage:escalations',
      'manage:deployments',
    ],
    scopes: ['*'], // All orgs (if super-admin)
    maxOrgScope: null, // No limit
  },
  auditor: {
    permissions: [
      'read:all',
      'read:logs',
      'export:reports',
      'read:audit:trail',
    ],
    scopes: ['org_id'],
    maxOrgScope: 1,
  },
  manager: {
    permissions: [
      'read:dept',
      'read:logs:dept',
      'manage:exemptions:dept',
      'manage:team:dept',
      'read:policies',
    ],
    scopes: ['org_id', 'dept_id'],
    maxOrgScope: 1, // Scoped to one org
  },
  user: {
    permissions: [
      'read:own',
      'read:own-logs',
      'report:fp', // Report false positives
    ],
    scopes: ['org_id'],
    maxOrgScope: 1,
  },
};

/**
 * Extract role and claims from JWT token
 */
function extractRoleFromToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Decode payload (part 1, 0-indexed)
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    return {
      role: decoded.role || 'user',
      org_id: decoded.org_id,
      dept_id: decoded.dept_id,
      user_id: decoded.sub,
      email: decoded.email,
      iat: decoded.iat,
      exp: decoded.exp,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Check if user has required permission(s)
 * Supports wildcard matching: "read:*" matches all "read:*" permissions
 */
function hasPermission(userRole, requiredPermission) {
  const roleDef = ROLE_PERMISSIONS[userRole];
  if (!roleDef) return false;

  // Check direct permission match
  if (roleDef.permissions.includes(requiredPermission)) {
    return true;
  }

  // Check wildcard patterns
  const [action, resource] = requiredPermission.split(':');
  if (action) {
    const wildcard = `${action}:*`;
    if (roleDef.permissions.includes(wildcard)) {
      return true;
    }
  }

  return false;
}

/**
 * Verify scope validity for the user's role
 * Ensures user can only access their own org/dept
 */
function verifyScopeAccess(claims, requestedOrgId, requestedDeptId) {
  if (!claims) return false;

  // Super-admin can access all orgs
  if (claims.role === 'admin' && ROLE_PERMISSIONS.admin.scopes.includes('*')) {
    return true;
  }

  // User's org must match requested org
  if (requestedOrgId && claims.org_id !== requestedOrgId) {
    return false;
  }

  // Manager can only access their department
  if (claims.role === 'manager' && requestedDeptId && claims.dept_id !== requestedDeptId) {
    return false;
  }

  return true;
}

/**
 * Middleware: Check authorization for a request
 * Usage: if (!authorize(request, 'read:policies')) return err('Forbidden', 403);
 */
function authorize(request, requiredPermission, options = {}) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return { authorized: false, error: 'No token provided' };
  }

  const claims = extractRoleFromToken(token);
  if (!claims) {
    return { authorized: false, error: 'Invalid token' };
  }

  // Check permission
  if (!hasPermission(claims.role, requiredPermission)) {
    return { authorized: false, error: 'Insufficient permissions', claims };
  }

  // Check scope (if org_id is provided)
  if (options.org_id && !verifyScopeAccess(claims, options.org_id, options.dept_id)) {
    return { authorized: false, error: 'Access denied to organization', claims };
  }

  return { authorized: true, claims };
}

/**
 * Generate JWT-like token with role and org_id (for testing)
 * In production, use createToken() from worker.js
 */
async function createRoleToken(env, userId, email, role, org_id, dept_id) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 30; // 30 days

  const payload = btoa(
    JSON.stringify({
      sub: userId,
      email: email,
      role: role,
      org_id: org_id,
      dept_id: dept_id,
      iss: 'kasbah-guard',
      iat: now,
      exp: exp,
    })
  ).replace(/=/g, '');

  // Sign (requires getSigningKey from worker.js)
  const key = await getSigningKey(env);
  const encoder = new TextEncoder();
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${header}.${payload}.${sigB64}`;
}

/**
 * List all permissions available to a role
 */
function getRolePermissions(role) {
  const roleDef = ROLE_PERMISSIONS[role];
  return roleDef ? roleDef.permissions : [];
}

/**
 * Check if role can perform action on resource
 */
function canAct(role, action, resource) {
  const permission = `${action}:${resource}`;
  return hasPermission(role, permission);
}

module.exports = {
  ROLE_PERMISSIONS,
  extractRoleFromToken,
  hasPermission,
  verifyScopeAccess,
  authorize,
  createRoleToken,
  getRolePermissions,
  canAct,
};
