/**
 * Kasbah API Routes
 *
 * Exposes all 9 kasbah modules via REST API:
 * - Spatial Intelligence (4 endpoints)
 * - Generator Attribution (3 endpoints)
 * - Confidence Calibration (3 endpoints)
 * - Ethics Evaluation (3 endpoints)
 * - Quantum-Safe Crypto (2 endpoints)
 * - Content Passport (3 endpoints)
 * - Zero-Knowledge Proofs (3 endpoints)
 * - Verification Network (3 endpoints)
 * - Federation Learning (4 endpoints)
 * - Image AI Detection (3 endpoints) — local, no Python backend required
 * - Document Intelligence (2 endpoints) — forwarded to Python backend
 *
 * Total: 34 endpoints
 *
 * Status: Production-Ready
 * Version: 1.1.0
 * Date: 2026-03-02
 */

import { Router, Request, Response } from 'itty-router';
import { analyzeFromBase64, analyzeFromBuffer, analyzeFromURL } from '../advanced-detection.js';

const kasbah = Router({ base: '/api/kasbah' });

/**
 * Status endpoint - Check module availability
 */
kasbah.get('/status', async (req: Request, env: any) => {
  return new Response(
    JSON.stringify({
      status: 'operational',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      modules: {
        spatial: true,
        generator: true,
        calibration: true,
        ethics: true,
        crypto: true,
        passport: true,
        zk: true,
        verification: true,
        federation: true
      }
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});

/**
 * ═══════════════════════════════════════════════════════════════
 * SPATIAL INTELLIGENCE ENDPOINTS (4)
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * POST /api/kasbah/spatial/analyze
 * Analyze spatial consistency (geometry, physics, lighting, depth)
 */
kasbah.post('/spatial/analyze', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    // Call Python backend
    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/spatial/analyze`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * POST /api/kasbah/spatial/validate-image
 * Validate image spatial consistency
 */
kasbah.post('/spatial/validate-image', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/spatial/validate-image`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * POST /api/kasbah/spatial/validate-video
 * Validate video spatial consistency
 */
kasbah.post('/spatial/validate-video', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/spatial/validate-video`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/spatial/status
 * Get spatial analysis status and metrics
 */
kasbah.get('/spatial/status', async (req: Request, env: any) => {
  try {
    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/spatial/status`,
      { method: 'GET' }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * ═══════════════════════════════════════════════════════════════
 * GENERATOR ATTRIBUTION ENDPOINTS (3)
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * POST /api/kasbah/generator/identify
 * Identify which AI generator created content
 */
kasbah.post('/generator/identify', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/generator/identify`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/generator/list
 * List all supported generators
 */
kasbah.get('/generator/list', async (req: Request, env: any) => {
  try {
    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/generator/list`,
      { method: 'GET' }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/generator/:name/info
 * Get info about specific generator
 */
kasbah.get('/generator/:name/info', async (req: Request, env: any) => {
  try {
    const { name } = req.params;

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/generator/${name}/info`,
      { method: 'GET' }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * ═══════════════════════════════════════════════════════════════
 * CONFIDENCE CALIBRATION ENDPOINTS (3)
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * POST /api/kasbah/calibration/calibrate
 * Calibrate confidence score for domain
 */
kasbah.post('/calibration/calibrate', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/calibration/calibrate`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * POST /api/kasbah/calibration/track
 * Track prediction for calibration learning
 */
kasbah.post('/calibration/track', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/calibration/track`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/calibration/stats
 * Get calibration statistics
 */
kasbah.get('/calibration/stats', async (req: Request, env: any) => {
  try {
    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/calibration/stats`,
      { method: 'GET' }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * ═══════════════════════════════════════════════════════════════
 * ETHICS EVALUATION ENDPOINTS (3)
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * POST /api/kasbah/ethics/evaluate
 * Evaluate detection against Islamic ethical principles
 */
kasbah.post('/ethics/evaluate', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/ethics/evaluate`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/ethics/partnerships
 * Get available partnership models
 */
kasbah.get('/ethics/partnerships', async (req: Request, env: any) => {
  try {
    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/ethics/partnerships`,
      { method: 'GET' }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/ethics/quranic
 * Get Qur'anic references
 */
kasbah.get('/ethics/quranic', async (req: Request, env: any) => {
  try {
    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/ethics/quranic`,
      { method: 'GET' }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * ═══════════════════════════════════════════════════════════════
 * QUANTUM-SAFE CRYPTO ENDPOINTS (2)
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * POST /api/kasbah/crypto/sign-detection
 * Sign detection result with quantum-safe signature
 */
kasbah.post('/crypto/sign-detection', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/crypto/sign-detection`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * POST /api/kasbah/crypto/verify-signature
 * Verify quantum-safe signature
 */
kasbah.post('/crypto/verify-signature', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/crypto/verify-signature`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * ═══════════════════════════════════════════════════════════════
 * CONTENT PASSPORT ENDPOINTS (3)
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * POST /api/kasbah/passport/issue
 * Issue blockchain-backed content passport
 */
kasbah.post('/passport/issue', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/passport/issue`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * POST /api/kasbah/passport/verify
 * Verify content passport
 */
kasbah.post('/passport/verify', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/passport/verify`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/passport/:hash
 * Get passport information
 */
kasbah.get('/passport/:hash', async (req: Request, env: any) => {
  try {
    const { hash } = req.params;

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/passport/${hash}`,
      { method: 'GET' }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * ═══════════════════════════════════════════════════════════════
 * ZERO-KNOWLEDGE PROOF ENDPOINTS (3)
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * POST /api/kasbah/zk/generate-proof
 * Generate zero-knowledge proof
 */
kasbah.post('/zk/generate-proof', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/zk/generate-proof`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * POST /api/kasbah/zk/verify-proof
 * Verify zero-knowledge proof
 */
kasbah.post('/zk/verify-proof', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/zk/verify-proof`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/zk/algorithms
 * Get available ZK algorithms
 */
kasbah.get('/zk/algorithms', async (req: Request, env: any) => {
  try {
    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/zk/algorithms`,
      { method: 'GET' }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * ═══════════════════════════════════════════════════════════════
 * VERIFICATION NETWORK ENDPOINTS (3)
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * POST /api/kasbah/verification/request
 * Request human expert verification
 */
kasbah.post('/verification/request', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/verification/request`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/verification/verifiers
 * Get available verifiers
 */
kasbah.get('/verification/verifiers', async (req: Request, env: any) => {
  try {
    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/verification/verifiers`,
      { method: 'GET' }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/verification/request/:id
 * Get verification request status
 */
kasbah.get('/verification/request/:id', async (req: Request, env: any) => {
  try {
    const { id } = req.params;

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/verification/request/${id}`,
      { method: 'GET' }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * ═══════════════════════════════════════════════════════════════
 * FEDERATION LEARNING ENDPOINTS (4)
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * POST /api/kasbah/federation/register
 * Register as federation participant
 */
kasbah.post('/federation/register', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/federation/register`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * POST /api/kasbah/federation/update
 * Submit federated learning update
 */
kasbah.post('/federation/update', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/federation/update`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/federation/participants
 * Get federation participants
 */
kasbah.get('/federation/participants', async (req: Request, env: any) => {
  try {
    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/federation/participants`,
      { method: 'GET' }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/federation/round/:num
 * Get federation round information
 */
kasbah.get('/federation/round/:num', async (req: Request, env: any) => {
  try {
    const { num } = req.params;

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/federation/round/${num}`,
      { method: 'GET' }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * ═══════════════════════════════════════════════════════════════
 * TELEMETRY ENDPOINT
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * POST /api/kasbah/telemetry
 * Log telemetry for federation learning
 */
kasbah.post('/telemetry', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/telemetry`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * ═══════════════════════════════════════════════════════════════
 * IMAGE AI DETECTION ENDPOINTS (3) — local JS, no Python backend
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * POST /api/kasbah/image/detect-base64
 * Detect whether a base64-encoded image was AI-generated.
 *
 * Request body:
 *   { "image": "<base64 string, with or without data-URL prefix>" }
 *
 * Response:
 *   {
 *     "is_ai_generated": boolean,
 *     "confidence": number,          // 0–1: fraction of methods voting AI
 *     "ai_score": number,            // 0–1: weighted ensemble score
 *     "generator_hint": string|null, // e.g. "stable-diffusion"
 *     "method_scores": { ... },
 *     "dominant_artifacts": string[],
 *     "decoded": boolean,            // true = sharp decoded; false = fallback
 *     "timestamp": string
 *   }
 */
kasbah.post('/image/detect-base64', async (req: Request, _env: any) => {
  try {
    const body: any = await req.json();
    const b64: string = body?.image ?? body?.data ?? '';

    if (!b64 || b64.length < 100) {
      return new Response(
        JSON.stringify({ error: 'Missing or too-short "image" field (base64 required)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await analyzeFromBase64(b64);

    return new Response(
      JSON.stringify({
        is_ai_generated: result.isAiGenerated,
        confidence: result.confidence,
        ai_score: result.aiScore,
        generator_hint: result.generatorHint,
        method_scores: result.methodScores,
        dominant_artifacts: result.dominantArtifacts,
        decoded: result.decoded,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * POST /api/kasbah/image/detect-url
 * Fetch an image from a URL and detect AI generation.
 *
 * Request body:
 *   { "url": "https://..." }
 */
kasbah.post('/image/detect-url', async (req: Request, _env: any) => {
  try {
    const body: any = await req.json();
    const url: string = body?.url ?? '';

    if (!url || !url.startsWith('http')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid "url" field' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await analyzeFromURL(url);

    return new Response(
      JSON.stringify({
        is_ai_generated: result.isAiGenerated,
        confidence: result.confidence,
        ai_score: result.aiScore,
        generator_hint: result.generatorHint,
        method_scores: result.methodScores,
        dominant_artifacts: result.dominantArtifacts,
        decoded: result.decoded,
        source_url: url,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/image/methods
 * List all detection methods and their weights.
 */
kasbah.get('/image/methods', async (_req: Request, _env: any) => {
  return new Response(
    JSON.stringify({
      methods: [
        { name: 'DiffusionModelFingerprinting',  weight: 0.25, description: 'FFT power spectrum, noise kurtosis, channel correlation, grid artifact detection' },
        { name: 'TransformerAttentionForensics',  weight: 0.20, description: 'Gradient-magnitude attention proxy, spatial entropy, patch boundary discontinuities' },
        { name: 'SelfSupervisedAnomalyDetector', weight: 0.18, description: '1/f² power-law PSD slope fit; natural images have slope ≈ −2' },
        { name: 'NeuralArchitectureSignatures',   weight: 0.15, description: 'Checkerboard variance, BatchNorm stripe variance, GAN ringing detection' },
        { name: 'CLIPSemanticConsistency',        weight: 0.10, description: 'Colour histogram entropy, inter-channel correlation anomaly' },
        { name: 'ContrastiveLearningEmbeddings',  weight: 0.07, description: 'DCT-based multi-view embedding cosine similarity' },
        { name: 'GraphCoherenceAnalyzer',         weight: 0.05, description: 'Patch similarity graph degree-entropy' },
        { name: 'MetaLearningDetector',           weight: 0.05, description: 'Nearest-prototype classifier (SD, DALL-E, MJ, StyleGAN3, FLUX)' },
      ],
      ai_threshold: 0.55,
      version: '1.1.0',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});

/**
 * ═══════════════════════════════════════════════════════════════
 * DOCUMENT INTELLIGENCE ENDPOINTS (2) — forwarded to Python backend
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * POST /api/kasbah/document/scan
 * Scan a document (PDF, image, Office file) via the OCR pipeline.
 *
 * Request body:
 *   {
 *     "file_base64": string,          // base64-encoded file bytes
 *     "filename": string,             // original filename (used for MIME detection)
 *     "ocr_backend"?: string,         // optional: "lighton"|"paddle"|"tesseract"|"auto"
 *   }
 *
 * Response mirrors DocumentScanResult from ocr_document_intelligence.py:
 *   {
 *     "extracted_text": string,
 *     "ocr_backend": string,
 *     "decision": "ALLOW"|"REVIEW"|"DENY",
 *     "risk_score": number,
 *     "findings": [...],
 *     "ccl_level": number,
 *     "ccl_name": string,
 *     "compliance_receipt_id": string|null,
 *     "image_ai_score": number|null,
 *     "image_generator_hint": string|null,
 *     "image_method_scores": {...}|null
 *   }
 */
kasbah.post('/document/scan', async (req: Request, env: any) => {
  try {
    const data = await req.json();

    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/document/scan`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /api/kasbah/document/backends
 * List available OCR backends and their status.
 */
kasbah.get('/document/backends', async (_req: Request, env: any) => {
  try {
    const result = await env.PYTHON_API.fetch(
      `${env.PYTHON_API_URL}/kasbah/document/backends`,
      { method: 'GET' }
    );

    return result;
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

export default kasbah;
