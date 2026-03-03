/**
 * Multi-Model AI Router
 * Routes intent validation across multiple LLM providers:
 * - Anthropic (Claude Haiku/Opus)
 * - OpenAI (GPT-4o mini)
 * - Google Gemini (2.0 Flash)
 * - Mistral (Mistral Small)
 * - Groq (Mixtral 8x7B)
 * - Alibaba GLM-5 (Chinese LLM)
 *
 * Provides fallback routing, latency optimization, and consensus scoring.
 */

// ── LLM Supply Chain Auditor ──
const LLMSupplyChainAuditor = require('./llm_supply_chain_auditor');

// ── Model Configuration ──
const MODELS = {
  anthropic: {
    name: 'claude-haiku-4-5-20251001',
    provider: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    headers: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }),
    modelParam: 'model',
    maxTokens: 256,
  },
  openai: {
    name: 'gpt-4o-mini',
    provider: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }),
    modelParam: 'model',
    maxTokens: 256,
  },
  gemini: {
    name: 'gemini-2.0-flash',
    provider: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    headers: () => ({
      'content-type': 'application/json',
    }),
    useQueryParam: true, // Gemini uses ?key=
    maxTokens: 256,
  },
  mistral: {
    name: 'mistral-small-latest',
    provider: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }),
    modelParam: 'model',
    maxTokens: 256,
  },
  groq: {
    name: 'mixtral-8x7b-32768',
    provider: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }),
    modelParam: 'model',
    maxTokens: 256,
  },
  glm5: {
    name: 'glm-4-flash',
    provider: 'Alibaba GLM-5',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }),
    modelParam: 'model',
    maxTokens: 256,
  },
};

// ── Intent Assessment System Prompt ──
const SYSTEM_PROMPT = `You are a constitutional AI safety classifier. Assess whether a user intent violates safety policies.
Respond ONLY with a JSON object, no markdown:
{"safe":true|false,"risk_score":0.0-1.0,"reasoning":"one sentence","requires_approval":true|false}
Policies: no data exfiltration, no malware, no privacy violations, no deception, no illegal activity.
risk_score 0.0=clearly safe, 1.0=clearly harmful. requires_approval=true if 0.4<=risk_score<0.8.`;

/**
 * Route intent validation across multiple models with fallback and consensus
 *
 * @param {string} intent - User intent to evaluate
 * @param {Object} env - Cloudflare Workers environment with API keys
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Consensus result with multi-model scoring
 */
async function routeIntentToMultiModel(intent, env, options = {}) {
  const {
    timeout = 5000,
    minConsensus = 2,
    returnAll = false,
  } = options;

  // Determine which models to use based on env variables
  const modelsToCall = [];
  if (env.ANTHROPIC_API_KEY) modelsToCall.push('anthropic');
  if (env.OPENAI_API_KEY) modelsToCall.push('openai');
  if (env.GEMINI_API_KEY) modelsToCall.push('gemini');
  if (env.MISTRAL_API_KEY) modelsToCall.push('mistral');
  if (env.GROQ_API_KEY) modelsToCall.push('groq');
  if (env.GLM5_API_KEY) modelsToCall.push('glm5');

  // Fallback to Anthropic if nothing configured
  if (modelsToCall.length === 0) {
    if (env.ANTHROPIC_API_KEY) {
      modelsToCall.push('anthropic');
    } else {
      return {
        ok: false,
        error: 'No LLM API keys configured',
        risk_score: 0.5,
        safe: false,
      };
    }
  }

  // Call models in parallel with timeout
  const promises = modelsToCall.map((modelKey) =>
    callModelWithTimeout(modelKey, intent, env, timeout)
  );

  const results = await Promise.allSettled(promises);

  // Parse results
  const successful = [];
  const failed = [];

  results.forEach((result, idx) => {
    if (result.status === 'fulfilled' && result.value) {
      successful.push({
        model: modelsToCall[idx],
        ...result.value,
      });
    } else {
      failed.push({
        model: modelsToCall[idx],
        error: result.reason?.message || 'Unknown error',
      });
    }
  });

  // Audit all LLM calls
  try {
    const auditor = new LLMSupplyChainAuditor();
    for (const callResult of successful) {
      auditor.auditModelCall({
        provider: callResult.model,
        intent: intent,
        response: callResult.reasoning || callResult.assessment,
        timestamp: Date.now(),
        risk_score: callResult.risk_score,
        safe: callResult.safe,
      });
    }
  } catch (auditErr) {
    // Log but don't fail if auditing fails
    console.warn('LLM audit logging failed:', auditErr.message);
  }

  // Calculate consensus
  const consensus = calculateConsensus(successful, intent);

  return {
    ok: true,
    ...consensus,
    models_called: modelsToCall.length,
    models_successful: successful.length,
    models_failed: failed.length,
    ...(returnAll && { results: { successful, failed } }),
  };
}

/**
 * Call a single model with timeout protection
 */
async function callModelWithTimeout(modelKey, intent, env, timeout) {
  return Promise.race([
    callModel(modelKey, intent, env),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
    ),
  ]);
}

/**
 * Call a specific LLM provider
 */
async function callModel(modelKey, intent, env) {
  const model = MODELS[modelKey];
  if (!model) throw new Error(`Unknown model: ${modelKey}`);

  const apiKey = env[`${modelKey.toUpperCase()}_API_KEY`];
  if (!apiKey) throw new Error(`No API key for ${modelKey}`);

  let payload;
  let url = model.endpoint;

  // Model-specific payload formatting
  switch (modelKey) {
    case 'anthropic':
      payload = {
        model: model.name,
        max_tokens: model.maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Assess this intent: ${intent.slice(0, 2000)}` }],
      };
      break;

    case 'openai':
    case 'mistral':
    case 'groq':
      payload = {
        model: model.name,
        max_tokens: model.maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Assess this intent: ${intent.slice(0, 2000)}` },
        ],
      };
      break;

    case 'gemini':
      url = `${model.endpoint}?key=${apiKey}`;
      payload = {
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT },
              { text: `Assess this intent: ${intent.slice(0, 2000)}` },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: model.maxTokens,
        },
      };
      break;

    case 'glm5':
      payload = {
        model: model.name,
        max_tokens: model.maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Assess this intent: ${intent.slice(0, 2000)}` },
        ],
      };
      break;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: model.headers(apiKey),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`${model.provider} API error: ${response.status}`);
  }

  const data = await response.json();
  const rawText = extractResponseText(data, modelKey);
  return parseIntentResult(rawText);
}

/**
 * Extract text response from model-specific response format
 */
function extractResponseText(data, modelKey) {
  switch (modelKey) {
    case 'anthropic':
      return (data.content?.[0]?.text || '').trim();
    case 'openai':
    case 'mistral':
    case 'groq':
      return (data.choices?.[0]?.message?.content || '').trim();
    case 'gemini':
      return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    case 'glm5':
      return (data.choices?.[0]?.message?.content || '').trim();
    default:
      return '';
  }
}

/**
 * Parse JSON response from model
 */
function parseIntentResult(rawText) {
  try {
    const result = JSON.parse(rawText);
    return {
      risk_score: Number(result.risk_score) || 0.5,
      safe: result.safe === true,
      reasoning: (result.reasoning || 'No reasoning provided').slice(0, 256),
      requires_approval: result.requires_approval === true,
    };
  } catch (e) {
    // Fallback if response is not valid JSON
    return {
      risk_score: 0.5,
      safe: false,
      reasoning: 'Model response parsing failed',
      requires_approval: true,
    };
  }
}

/**
 * Calculate consensus from multiple model results
 */
function calculateConsensus(successful, intent) {
  if (successful.length === 0) {
    return {
      valid: false,
      risk_score: 0.5,
      reasoning: 'All models failed to respond',
      requires_approval: true,
      consensus_count: 0,
      escalated_to_multimodel: false,
    };
  }

  // Calculate average risk score
  const avgRiskScore = successful.reduce((sum, r) => sum + r.risk_score, 0) / successful.length;

  // Count how many models agree on safety
  const safeCount = successful.filter((r) => r.safe).length;
  const unsafeCount = successful.length - safeCount;
  const agreementRatio = Math.max(safeCount, unsafeCount) / successful.length;

  // Determine consensus
  const consensusSafe = safeCount > unsafeCount;
  const hasStrongConsensus = agreementRatio >= 0.66; // 2/3 majority

  return {
    valid: consensusSafe,
    risk_score: avgRiskScore,
    reasoning: `Consensus (${safeCount}/${successful.length}): ${consensusSafe ? 'Safe' : 'Unsafe'} (avg risk: ${avgRiskScore.toFixed(2)})`,
    requires_approval: avgRiskScore >= 0.4 && avgRiskScore <= 0.8,
    consensus_count: successful.length,
    agreement_ratio: parseFloat(agreementRatio.toFixed(2)),
    has_strong_consensus: hasStrongConsensus,
    escalated_to_multimodel: true,
  };
}

// ── Exports for Cloudflare Worker ──
module.exports = {
  routeIntentToMultiModel,
  callModel,
  parseIntentResult,
  calculateConsensus,
  MODELS,
};
