/**
 * Kasbah Analysis Handlers
 *
 * Bridge between API routes and Python backend modules.
 * Routes requests to Kasbah-Core Python implementations.
 *
 * Status: Production-Ready
 * Version: 1.0.0
 */

import { Request, Response } from 'itty-router';

/**
 * Kasbah Analysis Request Handler
 * Wraps requests to Python backend with proper error handling
 */
export class KasbahAnalysisHandler {
  private pythonApiUrl: string;

  constructor(pythonApiUrl: string) {
    this.pythonApiUrl = pythonApiUrl;
  }

  /**
   * Forward request to Python backend
   */
  async forward(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<Response> {
    try {
      const options: any = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kasbah/1.0.0'
        }
      };

      if (body && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(`${this.pythonApiUrl}${endpoint}`, options);

      if (!response.ok) {
        throw new Error(`Python API error: ${response.status}`);
      }

      const data = await response.json();

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      console.error('[Kasbah Handler] Error:', error);

      return new Response(
        JSON.stringify({
          error: error.message,
          status: 'error',
          timestamp: new Date().toISOString()
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  /**
   * Spatial Analysis Handler
   */
  async analyzeSpatial(data: any): Promise<Response> {
    return this.forward('/kasbah/spatial/analyze', 'POST', data);
  }

  /**
   * Generator Attribution Handler
   */
  async identifyGenerator(data: any): Promise<Response> {
    return this.forward('/kasbah/generator/identify', 'POST', data);
  }

  /**
   * Confidence Calibration Handler
   */
  async calibrateConfidence(data: any): Promise<Response> {
    return this.forward('/kasbah/calibration/calibrate', 'POST', data);
  }

  /**
   * Ethics Evaluation Handler
   */
  async evaluateEthics(data: any): Promise<Response> {
    return this.forward('/kasbah/ethics/evaluate', 'POST', data);
  }

  /**
   * Quantum-Safe Signature Handler
   */
  async signDetection(data: any): Promise<Response> {
    return this.forward('/kasbah/crypto/sign-detection', 'POST', data);
  }

  /**
   * Content Passport Handler
   */
  async issuePassport(data: any): Promise<Response> {
    return this.forward('/kasbah/passport/issue', 'POST', data);
  }

  /**
   * Zero-Knowledge Proof Handler
   */
  async generateProof(data: any): Promise<Response> {
    return this.forward('/kasbah/zk/generate-proof', 'POST', data);
  }

  /**
   * Verification Network Handler
   */
  async requestVerification(data: any): Promise<Response> {
    return this.forward('/kasbah/verification/request', 'POST', data);
  }

  /**
   * Federation Learning Handler
   */
  async submitFederationUpdate(data: any): Promise<Response> {
    return this.forward('/kasbah/federation/update', 'POST', data);
  }
}

/**
 * Create handler instance
 */
export function createKasbahHandler(env: any): KasbahAnalysisHandler {
  const pythonApiUrl = env.PYTHON_API_URL || 'http://localhost:8000';
  return new KasbahAnalysisHandler(pythonApiUrl);
}

/**
 * Helper: Validate request data
 */
export function validateRequest(data: any, requiredFields: string[]): boolean {
  if (!data) return false;
  return requiredFields.every(field => data[field] !== undefined);
}

/**
 * Helper: Extract auth token from headers
 */
export function extractAuthToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;

  const parts = auth.split(' ');
  return parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : null;
}

/**
 * Helper: Create error response
 */
export function errorResponse(
  message: string,
  status: number = 400,
  details?: any
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      status: 'error',
      details,
      timestamp: new Date().toISOString()
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Helper: Create success response
 */
export function successResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
