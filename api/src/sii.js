/**
 * Kasbah Guard - System Integrity Index API
 * Computes and distributes SII to extension clients
 *
 * Endpoints:
 *   GET  /api/integrity          — Get current SII for client
 *   POST /api/integrity/compute   — Compute SII from components
 *   GET  /api/integrity/status    — Get SII status report
 *   POST /api/integrity/escalate  — Record escalation event
 *   GET  /api/integrity/analytics — Get SII analytics
 */

/**
 * Get current System Integrity Index
 */
async function handleGetSII(req, env, ctx) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get('org') || url.searchParams.get('organization_id');
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');

  try {
    // Validate authentication
    if (!token || token === 'default') {
      return jsonSuccess({
        sii: 0.95,
        status: 'healthy',
        message: 'Using default SII for unauthenticated request',
        timestamp: new Date().toISOString()
      });
    }

    // Get cached SII for org
    let sii = 0.95; // Default healthy state
    let cacheKey = null;

    if (organizationId) {
      cacheKey = `sii:${organizationId}`;
      const cached = await env.KV.get(cacheKey);
      if (cached) {
        sii = JSON.parse(cached).sii;
      }
    }

    return jsonSuccess({
      sii: parseFloat(sii.toFixed(2)),
      organization_id: organizationId || 'default',
      status: sii >= 0.85 ? 'healthy' : sii >= 0.7 ? 'warning' : 'critical',
      timestamp: new Date().toISOString(),
      cache_key: cacheKey
    });

  } catch (error) {
    console.error('Get SII error:', error);
    return jsonSuccess({
      sii: 0.95,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Compute SII from component status
 */
async function handleComputeSII(req, env, ctx) {
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  try {
    const { organization_id, components } = await req.json();

    if (!components) {
      return jsonError('Missing components data', 400);
    }

    // Validate component scores (0-1)
    const hookScore = Math.min(Math.max(components.hooks || 1.0, 0), 1);
    const detectorScore = Math.min(Math.max(components.detector || 1.0, 0), 1);
    const sessionScore = Math.min(Math.max(components.session || 1.0, 0), 1);

    // Compute weighted SII (hooks: 50%, detector: 30%, session: 20%)
    const sii = (hookScore * 0.5) + (detectorScore * 0.3) + (sessionScore * 0.2);

    // Determine status
    let status = 'healthy';
    let escalationRequired = false;

    if (sii < 0.5) {
      status = 'critical';
      escalationRequired = true;
    } else if (sii < 0.7) {
      status = 'warning';
      escalationRequired = true;
    } else if (sii < 0.85) {
      status = 'degraded';
    }

    // Store in KV
    if (organization_id) {
      const key = `sii:${organization_id}`;
      await env.KV.put(key, JSON.stringify({
        sii: parseFloat(sii.toFixed(2)),
        status: status,
        components: {
          hooks: parseFloat(hookScore.toFixed(2)),
          detector: parseFloat(detectorScore.toFixed(2)),
          session: parseFloat(sessionScore.toFixed(2))
        },
        computed_at: new Date().toISOString(),
        escalation_required: escalationRequired
      }), {
        expirationTtl: 60 // Cache for 60 seconds
      });
    }

    return jsonSuccess({
      sii: parseFloat(sii.toFixed(2)),
      status: status,
      escalation_required: escalationRequired,
      components: {
        hooks: parseFloat(hookScore.toFixed(2)),
        detector: parseFloat(detectorScore.toFixed(2)),
        session: parseFloat(sessionScore.toFixed(2))
      },
      organization_id: organization_id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Compute SII error:', error);
    return jsonError('SII computation failed: ' + error.message, 500);
  }
}

/**
 * Get SII status report
 */
async function handleSIIStatus(req, env, ctx) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get('org') || url.searchParams.get('organization_id');

  try {
    if (!organizationId) {
      return jsonError('Missing organization_id', 400);
    }

    const key = `sii:${organizationId}`;
    const data = await env.KV.get(key, 'json');

    if (!data) {
      return jsonSuccess({
        organization_id: organizationId,
        status: 'not_computed',
        message: 'No SII data available for this organization',
        default_sii: 0.95
      });
    }

    return jsonSuccess({
      organization_id: organizationId,
      ...data,
      age_seconds: Math.round((Date.now() - new Date(data.computed_at).getTime()) / 1000)
    });

  } catch (error) {
    console.error('SII status error:', error);
    return jsonError('Failed to retrieve SII status', 500);
  }
}

/**
 * Record escalation event
 */
async function handleEscalationEvent(req, env, ctx) {
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  try {
    const {
      organization_id,
      severity,
      reason,
      sii,
      decision_type,
      context
    } = await req.json();

    if (!organization_id || !severity) {
      return jsonError('Missing organization_id or severity', 400);
    }

    // Store escalation event
    const eventId = `escalation:${organization_id}:${Date.now()}:${generateId()}`;
    const event = {
      event_id: eventId,
      organization_id,
      severity,
      reason,
      sii: sii || 0,
      decision_type,
      context: context || {},
      timestamp: new Date().toISOString(),
      processed: false
    };

    await env.KV.put(eventId, JSON.stringify(event), {
      expirationTtl: 30 * 24 * 60 * 60 // 30 days retention
    });

    // Update escalation counter
    const counterKey = `escalation_count:${organization_id}`;
    const count = parseInt(await env.KV.get(counterKey) || '0');
    await env.KV.put(counterKey, String(count + 1), {
      expirationTtl: 24 * 60 * 60 // 24 hour rolling count
    });

    // Log analytics
    console.log(`Escalation recorded: ${organization_id} - ${severity}`);

    return jsonSuccess({
      event_id: eventId,
      organization_id,
      status: 'recorded',
      severity,
      timestamp: event.timestamp
    });

  } catch (error) {
    console.error('Escalation event error:', error);
    return jsonError('Failed to record escalation', 500);
  }
}

/**
 * Get SII analytics
 */
async function handleSIIAnalytics(req, env, ctx) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get('org') || url.searchParams.get('organization_id');
  const days = Math.min(parseInt(url.searchParams.get('days') || '7'), 30);

  try {
    if (!organizationId) {
      return jsonError('Missing organization_id', 400);
    }

    // Get escalation count
    const counterKey = `escalation_count:${organizationId}`;
    const escalationCount = parseInt(await env.KV.get(counterKey) || '0');

    // Get current SII
    const siiKey = `sii:${organizationId}`;
    const currentSII = await env.KV.get(siiKey, 'json');

    // Calculate trends
    let avgSII = currentSII?.sii || 0.95;
    let trend = 'stable';

    if (escalationCount > 10) {
      trend = 'declining';
    } else if (escalationCount === 0 && currentSII?.sii > 0.95) {
      trend = 'improving';
    }

    return jsonSuccess({
      organization_id: organizationId,
      period_days: days,
      current_sii: currentSII?.sii || 0.95,
      average_sii: parseFloat(avgSII.toFixed(2)),
      trend: trend,
      escalation_count: escalationCount,
      escalation_rate_per_day: (escalationCount / days).toFixed(2),
      status: currentSII?.status || 'healthy',
      components: currentSII?.components || {
        hooks: 1.0,
        detector: 1.0,
        session: 1.0
      },
      recommendations: getRecommendations(currentSII?.sii || 0.95, escalationCount),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('SII analytics error:', error);
    return jsonError('Failed to retrieve analytics', 500);
  }
}

/**
 * Get remediation recommendations
 */
function getRecommendations(sii, escalationCount) {
  const recommendations = [];

  if (sii < 0.5) {
    recommendations.push({
      priority: 'P0',
      issue: 'Critical system integrity failure',
      action: 'Restart browser immediately'
    });
  }

  if (sii < 0.7) {
    recommendations.push({
      priority: 'P1',
      issue: 'Multiple system components compromised',
      action: 'Verify all hooks are in place, check for malware'
    });
  }

  if (escalationCount > 20) {
    recommendations.push({
      priority: 'P1',
      issue: 'High escalation rate detected',
      action: 'Review detector policies, may need adjustment'
    });
  }

  if (sii < 0.85) {
    recommendations.push({
      priority: 'P2',
      issue: 'Minor integrity degradation',
      action: 'Monitor system and check for issues'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'INFO',
      issue: 'System operating normally',
      action: 'Continue monitoring'
    });
  }

  return recommendations;
}

/**
 * Generate random ID
 */
function generateId() {
  return Math.random().toString(36).substring(2, 15);
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
      'Cache-Control': 'public, max-age=30'
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
    handleGetSII,
    handleComputeSII,
    handleSIIStatus,
    handleEscalationEvent,
    handleSIIAnalytics
  };
}
