/**
 * Kasbah Guard — User Management API v1.0.0
 *
 * Handles team member management: add, list, update role, remove users
 * Requires admin role for most operations
 */

const { authorize } = require('./rbac');

/**
 * List all users in organization
 * GET /api/admin/team/users
 */
async function handleListUsers(request, env) {
  const auth = authorize(request, 'read:all');
  if (!auth.authorized) {
    return json({ ok: false, error: auth.error }, 403);
  }

  const org_id = auth.claims.org_id;
  const key = `org:${org_id}:users`;

  try {
    const data = await env.USERS.get(key);
    const users = data ? JSON.parse(data) : [];

    // Sanitize: don't return password hashes
    const sanitized = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      dept_id: u.dept_id,
      status: u.status,
      created_at: u.created_at,
      last_login: u.last_login,
    }));

    return json({ ok: true, users: sanitized });
  } catch (error) {
    return err('Failed to fetch users', 500);
  }
}

/**
 * Add user to organization
 * POST /api/admin/team/users
 * Body: { email, role, dept_id (optional) }
 */
async function handleAddUser(request, env) {
  const auth = authorize(request, 'manage:users');
  if (!auth.authorized) {
    return json({ ok: false, error: auth.error }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON');
  }

  const email = (body.email || '').trim().toLowerCase();
  const role = body.role || 'user';
  const dept_id = body.dept_id || null;

  // Validate
  if (!email.includes('@')) {
    return err('Valid email required');
  }
  if (!['admin', 'auditor', 'manager', 'user'].includes(role)) {
    return err('Invalid role');
  }

  const org_id = auth.claims.org_id;
  const key = `org:${org_id}:users`;

  try {
    const data = await env.USERS.get(key);
    const users = data ? JSON.parse(data) : [];

    // Check if user already exists
    if (users.some((u) => u.email === email)) {
      return err('User already exists', 409);
    }

    // Create new user
    const newUser = {
      id: generateId(),
      email: email,
      name: email.split('@')[0],
      role: role,
      dept_id: dept_id,
      status: 'active',
      created_at: new Date().toISOString(),
      last_login: null,
    };

    users.push(newUser);
    await env.USERS.put(key, JSON.stringify(users));

    // Log audit event
    await logAuditEvent(env, org_id, auth.claims.user_id, 'user_added', 'user', newUser.id, 'success', {
      email: newUser.email,
      role: newUser.role,
    });

    return json({
      ok: true,
      user: newUser,
      message: `User ${email} added with role: ${role}`,
    });
  } catch (error) {
    return err('Failed to add user', 500);
  }
}

/**
 * Update user role
 * PUT /api/admin/team/users/{userId}/role
 * Body: { role }
 */
async function handleUpdateUserRole(request, env, userId) {
  const auth = authorize(request, 'manage:users');
  if (!auth.authorized) {
    return json({ ok: false, error: auth.error }, 403);
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

  const org_id = auth.claims.org_id;
  const key = `org:${org_id}:users`;

  try {
    const data = await env.USERS.get(key);
    const users = data ? JSON.parse(data) : [];

    const user = users.find((u) => u.id === userId);
    if (!user) {
      return err('User not found', 404);
    }

    const oldRole = user.role;
    user.role = newRole;

    await env.USERS.put(key, JSON.stringify(users));

    // Log audit event
    await logAuditEvent(env, org_id, auth.claims.user_id, 'role_changed', 'user', userId, 'success', {
      email: user.email,
      old_role: oldRole,
      new_role: newRole,
    });

    return json({
      ok: true,
      user: sanitizeUser(user),
      message: `User role updated from ${oldRole} to ${newRole}`,
    });
  } catch (error) {
    return err('Failed to update user role', 500);
  }
}

/**
 * Remove user from organization
 * DELETE /api/admin/team/users/{userId}
 */
async function handleRemoveUser(request, env, userId) {
  const auth = authorize(request, 'manage:users');
  if (!auth.authorized) {
    return json({ ok: false, error: auth.error }, 403);
  }

  const org_id = auth.claims.org_id;
  const key = `org:${org_id}:users`;

  try {
    const data = await env.USERS.get(key);
    const users = data ? JSON.parse(data) : [];

    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      return err('User not found', 404);
    }

    const removedUser = users[userIndex];
    users.splice(userIndex, 1);

    await env.USERS.put(key, JSON.stringify(users));

    // Log audit event
    await logAuditEvent(env, org_id, auth.claims.user_id, 'user_removed', 'user', userId, 'success', {
      email: removedUser.email,
    });

    return json({
      ok: true,
      message: `User ${removedUser.email} removed`,
    });
  } catch (error) {
    return err('Failed to remove user', 500);
  }
}

/**
 * Helper: Generate unique ID
 */
function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Helper: Sanitize user object
 */
function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    dept_id: user.dept_id,
    status: user.status,
    created_at: user.created_at,
    last_login: user.last_login,
  };
}

/**
 * Helper: Log audit event
 */
async function logAuditEvent(env, org_id, user_id, action, resource_type, resource_id, result, details) {
  const logKey = `audit:${org_id}:${Date.now()}`;
  const logEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    user_id: user_id,
    action: action,
    resource_type: resource_type,
    resource_id: resource_id,
    result: result,
    details: details,
  };

  try {
    await env.AUDIT_LOGS.put(logKey, JSON.stringify(logEntry), { expirationTtl: 7776000 }); // 90 days
  } catch (e) {
    console.error('Failed to log audit event:', e);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

module.exports = {
  handleListUsers,
  handleAddUser,
  handleUpdateUserRole,
  handleRemoveUser,
};
