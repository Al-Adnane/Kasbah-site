/**
 * Kasbah Guard - Red Team Test Handler
 * Stores and manages red-team simulation results in Cloudflare KV
 *
 * Endpoints:
 *   POST /api/redteam/submit     — Store red-team test results
 *   GET  /api/redteam/results    — Retrieve latest red-team results for org
 *   GET  /api/redteam/history    — Retrieve historical results
 */

/**
 * Handle red-team result submission
 */
async function handleRedTeamSubmit(req, env, ctx) {
  const { organization_id, test_results } = await req.json();

  if (!organization_id) {
    return json({ ok: false, error: 'Missing organization_id' }, 400);
  }

  if (!test_results || !test_results.summary) {
    return json({ ok: false, error: 'Invalid test_results format' }, 400);
  }

  try {
    // Create result ID
    const resultId = `redteam:${organization_id}:${Date.now()}:${generateId().substring(0, 8)}`;

    // Prepare result record
    const record = {
      result_id: resultId,
      organization_id: organization_id,
      summary: test_results.summary,
      critical_failures: test_results.critical_failures || [],
      high_priority_issues: test_results.high_priority_issues || [],
      by_severity: test_results.by_severity || {},
      by_category: test_results.by_category || {},
      recommendations: test_results.recommendations || [],
      submitted_at: new Date().toISOString(),
      detector_version: test_results.summary.detector_version,
      success_rate: test_results.summary.success_rate,
      total_vectors: test_results.summary.total_vectors,
      blocked_vectors: test_results.summary.blocked,
      compromised_vectors: test_results.summary.compromised
    };

    // Store in KV with TTL (90 days)
    const ttl = 90 * 24 * 60 * 60;
    await env.KV.put(resultId, JSON.stringify(record), {
      expirationTtl: ttl,
      metadata: {
        organization: organization_id,
        timestamp: Date.now(),
        type: 'red_team_result'
      }
    });

    // Also store latest pointer for quick retrieval
    const latestKey = `redteam:latest:${organization_id}`;
    await env.KV.put(latestKey, resultId, {
      expirationTtl: ttl,
      metadata: {
        organization: organization_id,
        timestamp: Date.now(),
        type: 'red_team_latest'
      }
    });

    // Log analytics
    await logAnalytics(env, {
      event: 'red_team_submitted',
      organization_id,
      success_rate: test_results.summary.success_rate,
      total_vectors: test_results.summary.total_vectors,
      detector_version: test_results.summary.detector_version,
      critical_failures: test_results.critical_failures.length
    });

    return json({
      ok: true,
      result_id: resultId,
      message: 'Red team test results recorded successfully',
      summary: {
        success_rate: test_results.summary.success_rate,
        blocked: test_results.summary.blocked,
        compromised: test_results.summary.compromised,
        total: test_results.summary.total_vectors
      }
    });

  } catch (error) {
    console.error('Red team submit error:', error);
    return json({
      ok: false,
      error: 'Failed to store red team results',
      details: error.message
    }, 500);
  }
}

/**
 * Get latest red-team results for organization
 */
async function handleRedTeamResults(req, env, ctx) {
  const url = new URL(req.url);
  const organization_id = url.searchParams.get('org') || url.searchParams.get('organization_id');

  if (!organization_id) {
    return json({ ok: false, error: 'Missing organization_id' }, 400);
  }

  try {
    // Get latest result ID
    const latestKey = `redteam:latest:${organization_id}`;
    const resultId = await env.KV.getWithMetadata(latestKey);

    if (!resultId.value) {
      return json({
        ok: true,
        results: null,
        message: 'No red team results found for this organization'
      });
    }

    // Fetch full result
    const result = await env.KV.get(resultId.value, 'json');

    return json({
      ok: true,
      result: result,
      timestamp: resultId.metadata?.timestamp
    });

  } catch (error) {
    console.error('Red team results error:', error);
    return json({
      ok: false,
      error: 'Failed to retrieve red team results',
      details: error.message
    }, 500);
  }
}

/**
 * Get historical red-team results for organization
 */
async function handleRedTeamHistory(req, env, ctx) {
  const url = new URL(req.url);
  const organization_id = url.searchParams.get('org') || url.searchParams.get('organization_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 100);

  if (!organization_id) {
    return json({ ok: false, error: 'Missing organization_id' }, 400);
  }

  try {
    // List all red team results for organization
    const prefix = `redteam:${organization_id}:`;
    const results = [];

    const list = await env.KV.list({ prefix });

    for (const item of list.keys) {
      const record = await env.KV.get(item.name, 'json');
      results.push({
        result_id: record.result_id,
        submitted_at: record.submitted_at,
        detector_version: record.detector_version,
        success_rate: record.success_rate,
        blocked_vectors: record.blocked_vectors,
        compromised_vectors: record.compromised_vectors,
        total_vectors: record.total_vectors
      });
    }

    // Sort by timestamp descending
    results.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

    return json({
      ok: true,
      count: results.length,
      limit: limit,
      results: results.slice(0, limit),
      organization_id: organization_id
    });

  } catch (error) {
    console.error('Red team history error:', error);
    return json({
      ok: false,
      error: 'Failed to retrieve red team history',
      details: error.message
    }, 500);
  }
}

/**
 * Get red-team statistics for organization
 */
async function handleRedTeamStats(req, env, ctx) {
  const url = new URL(req.url);
  const organization_id = url.searchParams.get('org') || url.searchParams.get('organization_id');

  if (!organization_id) {
    return json({ ok: false, error: 'Missing organization_id' }, 400);
  }

  try {
    const prefix = `redteam:${organization_id}:`;
    const results = [];

    const list = await env.KV.list({ prefix });

    // Fetch all results
    for (const item of list.keys) {
      const record = await env.KV.get(item.name, 'json');
      results.push({
        success_rate: parseInt(record.success_rate),
        blocked_vectors: record.blocked_vectors,
        compromised_vectors: record.compromised_vectors,
        total_vectors: record.total_vectors,
        submitted_at: record.submitted_at
      });
    }

    if (results.length === 0) {
      return json({
        ok: true,
        organization_id,
        message: 'No test results available',
        stats: null
      });
    }

    // Calculate statistics
    const successRates = results.map(r => r.success_rate);
    const avgSuccessRate = Math.round(
      successRates.reduce((a, b) => a + b, 0) / successRates.length
    );

    const totalBlocked = results.reduce((sum, r) => sum + r.blocked_vectors, 0);
    const totalCompromised = results.reduce((sum, r) => sum + r.compromised_vectors, 0);
    const totalTests = results.reduce((sum, r) => sum + r.total_vectors, 0);

    const trend = results.length >= 2
      ? successRates[0] - successRates[results.length - 1]
      : 0;

    return json({
      ok: true,
      organization_id,
      stats: {
        total_runs: results.length,
        average_success_rate: `${avgSuccessRate}%`,
        trend: trend > 0 ? 'improving' : trend < 0 ? 'declining' : 'stable',
        trend_value: trend,
        latest_success_rate: results[0]?.success_rate + '%' || 'N/A',
        all_time_blocked: totalBlocked,
        all_time_compromised: totalCompromised,
        all_time_tests: totalTests,
        first_test: results[results.length - 1]?.submitted_at,
        last_test: results[0]?.submitted_at,
        tests: results.slice(0, 5) // Last 5 for trend visualization
      }
    });

  } catch (error) {
    console.error('Red team stats error:', error);
    return json({
      ok: false,
      error: 'Failed to calculate red team statistics',
      details: error.message
    }, 500);
  }
}

/**
 * Generate detailed assessment report
 */
async function handleRedTeamReport(req, env, ctx) {
  const url = new URL(req.url);
  const resultId = url.searchParams.get('result_id');

  if (!resultId) {
    return json({ ok: false, error: 'Missing result_id' }, 400);
  }

  try {
    const result = await env.KV.get(resultId, 'json');

    if (!result) {
      return json({ ok: false, error: 'Result not found' }, 404);
    }

    // Generate detailed report
    const report = {
      result_id: result.result_id,
      organization_id: result.organization_id,
      submitted_at: result.submitted_at,
      detector_version: result.detector_version,
      summary: {
        success_rate: result.success_rate,
        blocked_vectors: result.blocked_vectors,
        compromised_vectors: result.compromised_vectors,
        total_vectors: result.total_vectors,
        assessment: getAssessmentLevel(result.success_rate)
      },
      issues: {
        critical: result.critical_failures?.length || 0,
        high: result.high_priority_issues?.length || 0,
        critical_failures: result.critical_failures || [],
        high_priority_issues: result.high_priority_issues || []
      },
      by_severity: result.by_severity,
      by_category: result.by_category,
      top_recommendations: result.recommendations.slice(0, 10),
      generated_at: new Date().toISOString()
    };

    return json({
      ok: true,
      report
    });

  } catch (error) {
    console.error('Red team report error:', error);
    return json({
      ok: false,
      error: 'Failed to generate report',
      details: error.message
    }, 500);
  }
}

/**
 * Get assessment level from success rate
 */
function getAssessmentLevel(successRateStr) {
  const rate = parseInt(successRateStr);
  if (rate >= 95) return 'EXCELLENT - Highly resistant to bypass attacks';
  if (rate >= 85) return 'GOOD - Strong security posture with minor improvements needed';
  if (rate >= 70) return 'FAIR - Moderate vulnerabilities present';
  return 'CRITICAL - Significant security gaps identified';
}

/**
 * Log analytics event
 */
async function logAnalytics(env, event) {
  try {
    const analyticsKey = `analytics:${event.event}:${Date.now()}`;
    await env.KV.put(analyticsKey, JSON.stringify(event), {
      expirationTtl: 30 * 24 * 60 * 60 // 30 days
    });
  } catch (e) {
    console.error('Analytics logging error:', e);
    // Don't throw - analytics failure shouldn't block main request
  }
}

/**
 * Generate random ID
 */
function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * JSON response helper
 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}

// Export handlers
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleRedTeamSubmit,
    handleRedTeamResults,
    handleRedTeamHistory,
    handleRedTeamStats,
    handleRedTeamReport
  };
}
