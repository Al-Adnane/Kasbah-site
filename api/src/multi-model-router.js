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
    name: 'claude-haiku-4-5',
    provider: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    headers: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }),
    modelParam: 'model',
    maxTokens: 512,
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
    name: 'llama-3.3-70b-versatile',
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

// ── Constitutional AI System Prompt (Bai et al., 2022 — critique-revise) ──
// Stage 1: Critique — identify any constitutional violations in the intent.
// Stage 2: Revise  — produce a safer reformulation if possible.
// Stage 3: Score   — output structured JSON assessment.
// All three stages run in a single prompt to stay within Worker CPU budget.
const SYSTEM_PROMPT = `You are a Constitutional AI safety evaluator implementing the critique-revision framework (Bai et al., 2022).

CONSTITUTIONAL PRINCIPLES:
1. No data exfiltration or unauthorized data access
2. No malware, exploits, or system compromise
3. No privacy violations or PII harvesting
4. No deception, manipulation, or social engineering
5. No illegal activity or facilitation thereof
6. No generation of CSAM or harmful content targeting minors
7. No weapons of mass destruction assistance
8. No undermining of AI oversight mechanisms

EVALUATION PROCESS:
Step 1 — CRITIQUE: Identify which principles (if any) the intent violates. Quote the harmful part.
Step 2 — REVISE: If violations exist, state a safer reformulation of what the user likely legitimately needs. If no violation, write "No revision needed."
Step 3 — ASSESS: Output a single JSON object on the LAST LINE, no markdown fences:
{"safe":true|false,"risk_score":0.0-1.0,"reasoning":"one sentence max 200 chars","requires_approval":true|false,"critique":"one sentence","revised_intent":"safe reformulation or null"}

SCORING GUIDE:
0.0–0.29 = clearly benign, no concerns
0.30–0.69 = ambiguous, requires human review
0.70–0.89 = likely harmful, deny with explanation
0.90–1.00 = clearly harmful, hard deny
requires_approval=true when 0.40<=risk_score<0.80`;

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
      auditor.auditModelCall(
        callResult.model,
        intent,
        callResult.reasoning || callResult.assessment,
        { risk_score: callResult.risk_score, safe: callResult.safe, timestamp: Date.now() }
      );
    }
  } catch (auditErr) {
    // Log but don't fail if auditing fails
    console.warn('LLM audit logging failed:', auditErr.message);
  }

  // Calculate consensus — require at least minConsensus successful responses
  if (successful.length < minConsensus) {
    return {
      ok: false,
      error: `Insufficient model responses: got ${successful.length}, need ${minConsensus}`,
      risk_score: 0.5,
      valid: false,
      requires_approval: true,
      consensus_count: 0,
      models_called: modelsToCall.length,
      models_successful: successful.length,
      models_failed: failed.length,
    };
  }

  const consensus = calculateConsensus(successful);

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
 * Parse JSON assessment from model response.
 * The CAI prompt instructs models to output critique+revision text first,
 * then the JSON object on the LAST LINE — so we extract the last {...} block.
 */
function parseIntentResult(rawText) {
  try {
    // Extract the last JSON object in the response (after critique/revise prose)
    const jsonMatch = rawText.match(/\{[^{}]*"safe"[^{}]*\}/s);
    const jsonStr = jsonMatch ? jsonMatch[0] : rawText;
    const result = JSON.parse(jsonStr);
    const riskScore = Math.max(0, Math.min(1, Number(result.risk_score) || 0.5));
    return {
      risk_score: riskScore,
      safe: result.safe === true,
      reasoning: (result.reasoning || 'No reasoning provided').slice(0, 256),
      requires_approval: result.requires_approval === true,
      critique: result.critique ? String(result.critique).slice(0, 256) : null,
      revised_intent: result.revised_intent ? String(result.revised_intent).slice(0, 512) : null,
    };
  } catch (e) {
    // Fallback if response is not valid JSON
    return {
      risk_score: 0.5,
      safe: false,
      reasoning: 'Model response parsing failed',
      requires_approval: true,
      critique: null,
      revised_intent: null,
    };
  }
}

/**
 * Calculate consensus from multiple model results
 */
function calculateConsensus(successful) {
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

  // Surface the critique and revised_intent from the most cautious model
  // (highest risk_score) so callers can present actionable feedback to users
  const mostCautious = successful.reduce((a, b) => a.risk_score >= b.risk_score ? a : b);

  return {
    valid: consensusSafe,
    risk_score: parseFloat(avgRiskScore.toFixed(4)),
    reasoning: `Consensus (${safeCount}/${successful.length} models safe, avg risk: ${avgRiskScore.toFixed(2)}): ${consensusSafe ? 'Intent appears safe.' : 'Intent flagged as unsafe.'}`,
    requires_approval: avgRiskScore >= 0.4 && avgRiskScore <= 0.8,
    consensus_count: successful.length,
    agreement_ratio: parseFloat(agreementRatio.toFixed(2)),
    has_strong_consensus: hasStrongConsensus,
    escalated_to_multimodel: true,
    // CAI critique-revise outputs from most cautious model
    critique: mostCautious.critique || null,
    revised_intent: mostCautious.revised_intent || null,
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
