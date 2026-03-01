/**
 * Kasbah Guard - Enterprise Policy API
 * Manages organization security policies with versioning and canary deployment
 *
 * Endpoints:
 *   POST /api/policies/upload       — Upload new policy
 *   GET  /api/policies/current      — Get current policy for client
 *   GET  /api/policies/versions     — List policy versions
 *   POST /api/policies/canary       — Configure canary deployment
 *   POST /api/policies/enforcement-report — Report enforcement metrics
 *   GET  /api/policies/status       — Get policy deployment status
 */

/**
 * Upload new organization policy
 */
async function handlePolicyUpload(req, env, ctx) {
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  try {
    const {
      organization_id,
      policy,
      version,
      escalation_rules,
      detection_rules,
      approval_workflow
    } = await req.json();

    if (!organization_id || !policy) {
      return jsonError('Missing organization_id or policy', 400);
    }

    if (!version) {
      return jsonError('Missing version', 400);
    }

    // Validate policy structure
    if (typeof policy !== 'object') {
      return jsonError('Invalid policy format', 400);
    }

    // Compute policy hash
    const policyHash = await computePolicyHash(policy);

    // Create policy record
    const policyId = `policy:${organization_id}:${version}:${Date.now()}`;
    const policyRecord = {
      policy_id: policyId,
      organization_id,
      version,
      policy: policy,
      escalation_rules: escalation_rules || {},
      detection_rules: detection_rules || {},
      approval_workflow: approval_workflow || 'auto',
      policy_hash: policyHash,
      created_at: new Date().toISOString(),
      status: 'active',
      rollout_percentage: 0, // Starts at 0% (canary mode)
      created_by: 'admin' // Would come from auth in production
    };

    // Store policy
    await env.KV.put(policyId, JSON.stringify(policyRecord), {
      expirationTtl: 365 * 24 * 60 * 60 // 1 year retention
    });

    // Set as current policy
    const currentKey = `policy:current:${organization_id}`;
    await env.KV.put(currentKey, JSON.stringify({
      policy_id: policyId,
      version: version,
      policy: policy,
      escalation_rules: escalation_rules || {},
      detection_rules: detection_rules || {},
      policy_hash: policyHash,
      signature: await signPolicy(policyRecord, env),
      canary_mode: true,
      canary_percentage: 5, // Start with 5% canary
      deployed_at: new Date().toISOString()
    }));

    // Create version index
    const versionKey = `policy:versions:${organization_id}`;
    const versions = JSON.parse(await env.KV.get(versionKey) || '[]');
    versions.push({
      version: version,
      policy_id: policyId,
      created_at: policyRecord.created_at,
      status: 'active'
    });
    await env.KV.put(versionKey, JSON.stringify(versions));

    return jsonSuccess({
      policy_id: policyId,
      organization_id,
      version,
      policy_hash: policyHash,
      status: 'uploaded',
      canary_mode: true,
      initial_canary_percentage: 5,
      message: 'Policy uploaded and set to 5% canary deployment'
    });

  } catch (error) {
    console.error('Policy upload error:', error);
    return jsonError('Policy upload failed: ' + error.message, 500);
  }
}

/**
 * Get current policy for client
 */
async function handleGetCurrentPolicy(req, env, ctx) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get('org') || url.searchParams.get('organization_id');
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');

  try {
    if (!organizationId) {
      return jsonError('Missing organization_id', 400);
    }

    // Get current policy
    const currentKey = `policy:current:${organizationId}`;
    const currentPolicy = await env.KV.get(currentKey, 'json');

    if (!currentPolicy) {
      return jsonSuccess({
        policy: null,
        message: 'No policy found for organization',
        version: '1.0.0',
        canary_mode: false
      });
    }

    return jsonSuccess(currentPolicy);

  } catch (error) {
    console.error('Get policy error:', error);
    return jsonError('Failed to retrieve policy', 500);
  }
}

/**
 * Get policy version history
 */
async function handleGetPolicyVersions(req, env, ctx) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get('org') || url.searchParams.get('organization_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

  try {
    if (!organizationId) {
      return jsonError('Missing organization_id', 400);
    }

    const versionKey = `policy:versions:${organizationId}`;
    const versions = JSON.parse(await env.KV.get(versionKey) || '[]');

    return jsonSuccess({
      organization_id: organizationId,
      total_versions: versions.length,
      versions: versions.slice(-limit).reverse(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get versions error:', error);
    return jsonError('Failed to retrieve policy versions', 500);
  }
}

/**
 * Configure canary deployment
 */
async function handleCanaryConfig(req, env, ctx) {
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  try {
    const {
      organization_id,
      canary_percentage,
      canary_enabled
    } = await req.json();

    if (!organization_id) {
      return jsonError('Missing organization_id', 400);
    }

    // Get current policy
    const currentKey = `policy:current:${organization_id}`;
    const currentPolicy = await env.KV.get(currentKey, 'json');

    if (!currentPolicy) {
      return jsonError('No policy found', 404);
    }

    // Update canary settings
    currentPolicy.canary_mode = canary_enabled !== false;
    currentPolicy.canary_percentage = Math.min(
      Math.max(parseInt(canary_percentage || 5), 0),
      100
    );
    currentPolicy.canary_updated_at = new Date().toISOString();

    // Store updated policy
    await env.KV.put(currentKey, JSON.stringify(currentPolicy));

    // Log canary change
    console.log(`Canary config: ${organization_id} - ${currentPolicy.canary_percentage}%`);

    return jsonSuccess({
      organization_id,
      canary_mode: currentPolicy.canary_mode,
      canary_percentage: currentPolicy.canary_percentage,
      message: `Canary deployment configured to ${currentPolicy.canary_percentage}%`,
      timestamp: currentPolicy.canary_updated_at
    });

  } catch (error) {
    console.error('Canary config error:', error);
    return jsonError('Failed to configure canary', 500);
  }
}

/**
 * Report enforcement metrics
 */
async function handleEnforcementReport(req, env, ctx) {
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  try {
    const {
      organization_id,
      severity,
      enforcement,
      policy_version,
      timestamp,
      canary_applied
    } = await req.json();

    if (!organization_id) {
      return jsonError('Missing organization_id', 400);
    }

    // Store enforcement report
    const reportId = `enforcement:${organization_id}:${Date.now()}`;
    const report = {
      report_id: reportId,
      organization_id,
      severity,
      enforcement,
      policy_version,
      timestamp: timestamp || new Date().toISOString(),
      canary_applied: canary_applied || false
    };

    await env.KV.put(reportId, JSON.stringify(report), {
      expirationTtl: 30 * 24 * 60 * 60 // 30 days retention
    });

    // Update statistics
    const statsKey = `enforcement_stats:${organization_id}`;
    const stats = JSON.parse(await env.KV.get(statsKey) || '{"total": 0}');
    stats.total = (stats.total || 0) + 1;
    stats[enforcement] = (stats[enforcement] || 0) + 1;
    stats[severity] = (stats[severity] || 0) + 1;
    stats.last_update = new Date().toISOString();

    await env.KV.put(statsKey, JSON.stringify(stats), {
      expirationTtl: 30 * 24 * 60 * 60
    });

    return jsonSuccess({
      report_id: reportId,
      status: 'recorded',
      organization_id
    });

  } catch (error) {
    console.error('Enforcement report error:', error);
    return jsonError('Failed to record enforcement report', 500);
  }
}

/**
 * Get policy deployment status
 */
async function handlePolicyStatus(req, env, ctx) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get('org') || url.searchParams.get('organization_id');

  try {
    if (!organizationId) {
      return jsonError('Missing organization_id', 400);
    }

    // Get current policy
    const currentKey = `policy:current:${organizationId}`;
    const currentPolicy = await env.KV.get(currentKey, 'json');

    // Get enforcement stats
    const statsKey = `enforcement_stats:${organizationId}`;
    const stats = JSON.parse(await env.KV.get(statsKey) || '{}');

    if (!currentPolicy) {
      return jsonSuccess({
        organization_id: organizationId,
        policy_deployed: false,
        message: 'No policy deployed'
      });
    }

    return jsonSuccess({
      organization_id: organizationId,
      policy_deployed: true,
      version: currentPolicy.version,
      canary_mode: currentPolicy.canary_mode,
      canary_percentage: currentPolicy.canary_percentage,
      deployed_at: currentPolicy.deployed_at,
      enforcement_stats: {
        total_enforcements: stats.total || 0,
        blocks: stats.block || 0,
        warnings: stats.warn || 0,
        logged: stats.log || 0,
        by_severity: {
          critical: stats.critical || 0,
          high: stats.high || 0,
          medium: stats.medium || 0,
          low: stats.low || 0
        }
      },
      last_update: stats.last_update || currentPolicy.deployed_at,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Policy status error:', error);
    return jsonError('Failed to retrieve policy status', 500);
  }
}

/**
 * Compute policy hash
 */
async function computePolicyHash(policy) {
  try {
    const policyJson = JSON.stringify(policy);
    const encoder = new TextEncoder();
    const data = encoder.encode(policyJson);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Hash computation error:', error);
    return 'hash_error';
  }
}

/**
 * Sign policy (placeholder - would use org private key in production)
 */
async function signPolicy(policyRecord, env) {
  // In production, sign with organization's private key
  // For now, return placeholder
  return `ed25519_${policyRecord.policy_hash.substring(0, 64)}`;
}

/**
 * JSON response helpers
 */
function jsonSuccess(data) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'public, max-age=60'
    }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

// Export handlers
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handlePolicyUpload,
    handleGetCurrentPolicy,
    handleGetPolicyVersions,
    handleCanaryConfig,
    handleEnforcementReport,
    handlePolicyStatus
  };
}
