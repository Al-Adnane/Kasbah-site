/**
 * Kasbah CORS & Security Headers Configuration
 *
 * Production-ready CORS and security header setup
 *
 * Features:
 * - Origin whitelisting
 * - Content-Security-Policy
 * - X-Frame-Options, X-Content-Type-Options
 * - HSTS headers
 * - Referrer-Policy
 * - Permissions-Policy
 * - Subresource Integrity
 *
 * Status: Production-Ready
 */

/**
 * CORS configuration
 */
export interface CORSConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
  optionsSuccessStatus: number;
}

/**
 * Default CORS configuration
 */
export const DEFAULT_CORS_CONFIG: CORSConfig = {
  // Only allow bekasbah.com and localhost for development
  allowedOrigins: [
    'https://bekasbah.com',
    'https://www.bekasbah.com',
    'https://api.bekasbah.com',
    'https://dashboard.bekasbah.com',
    'https://enterprise.bekasbah.com',
    // Chrome extensions
    'chrome-extension://*',
    'moz-extension://*',
    'ms-browser-extension://',
    'safari-extension://',
    // Development
    'http://localhost:3000',
    'http://localhost:8000',
    'http://127.0.0.1:3000'
  ],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-API-Key',
    'Accept',
    'Accept-Encoding',
    'Accept-Language'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Content-Type-Options',
    'X-Frame-Options'
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200
};

/**
 * Security headers configuration
 */
export interface SecurityHeadersConfig {
  'Content-Security-Policy': string;
  'X-Content-Type-Options': string;
  'X-Frame-Options': string;
  'X-XSS-Protection': string;
  'Strict-Transport-Security': string;
  'Referrer-Policy': string;
  'Permissions-Policy': string;
  'Cross-Origin-Embedder-Policy': string;
  'Cross-Origin-Opener-Policy': string;
  'Cross-Origin-Resource-Policy': string;
}

/**
 * Default security headers (production)
 */
export const DEFAULT_SECURITY_HEADERS: SecurityHeadersConfig = {
  // Content Security Policy - strict policy for production
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'self' https://cdn.jsdelivr.net https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://api.bekasbah.com https://bekasbah.com wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join('; '),

  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking
  'X-Frame-Options': 'DENY',

  // XSS protection (legacy, but still useful)
  'X-XSS-Protection': '1; mode=block',

  // HSTS - enforce HTTPS for 1 year including subdomains
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // Referrer policy - limited referrer info
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Permissions Policy - disable risky features
  'Permissions-Policy': [
    'geolocation=()',
    'microphone=()',
    'camera=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
    'vr=()',
    'xr-spatial-tracking=()',
    'payment=()',
    'midi=()'
  ].join(', '),

  // COEP - Cross-Origin Embedder Policy
  'Cross-Origin-Embedder-Policy': 'require-corp',

  // COOP - Cross-Origin Opener Policy
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',

  // CORP - Cross-Origin Resource Policy
  'Cross-Origin-Resource-Policy': 'same-origin'
};

/**
 * Development security headers (relaxed for dev)
 */
export const DEV_SECURITY_HEADERS: SecurityHeadersConfig = {
  'Content-Security-Policy': [
    "default-src 'self' http://localhost:*",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*",
    "style-src 'self' 'unsafe-inline' http://localhost:*",
    "img-src 'self' data: http: https: blob:",
    "font-src 'self' data: http:",
    "connect-src 'self' http: https: ws: wss:",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests"
  ].join('; '),

  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), usb=()',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'cross-origin'
};

/**
 * Validate CORS origin
 */
export function validateOrigin(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;

  for (const allowed of allowedOrigins) {
    // Exact match
    if (origin === allowed) return true;

    // Wildcard matching for extensions
    if (allowed.endsWith('*')) {
      const pattern = allowed.slice(0, -1); // Remove *
      if (origin.startsWith(pattern)) return true;
    }
  }

  return false;
}

/**
 * Add CORS headers to response
 */
export function addCORSHeaders(
  response: Response,
  origin: string,
  config: CORSConfig = DEFAULT_CORS_CONFIG
): Response {
  const headers = new Headers(response.headers);

  // Set origin
  if (validateOrigin(origin, config.allowedOrigins)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  // Set allowed methods
  headers.set('Access-Control-Allow-Methods', config.allowedMethods.join(', '));

  // Set allowed headers
  headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));

  // Set exposed headers
  if (config.exposedHeaders.length > 0) {
    headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
  }

  // Set credentials
  if (config.credentials) {
    headers.set('Access-Control-Allow-Credentials', 'true');
  }

  // Set max age
  headers.set('Access-Control-Max-Age', config.maxAge.toString());

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/**
 * Add security headers to response
 */
export function addSecurityHeaders(
  response: Response,
  isDevelopment: boolean = false
): Response {
  const headers = new Headers(response.headers);
  const securityHeaders = isDevelopment ? DEV_SECURITY_HEADERS : DEFAULT_SECURITY_HEADERS;

  for (const [key, value] of Object.entries(securityHeaders)) {
    headers.set(key, value);
  }

  // Additional headers
  headers.set('Cache-Control', 'public, max-age=3600'); // 1 hour cache
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Request-ID', generateRequestId());

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/**
 * Generate unique request ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
}

/**
 * Handle CORS preflight request
 */
export function handleCORSPreflight(
  request: Request,
  config: CORSConfig = DEFAULT_CORS_CONFIG
): Response {
  const origin = request.headers.get('origin');

  if (!validateOrigin(origin, config.allowedOrigins)) {
    return new Response('CORS origin not allowed', {
      status: 403,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  const response = new Response(null, { status: 204 });
  return addCORSHeaders(response, origin, config);
}

/**
 * CORS and security headers middleware
 */
export function corsSecurityMiddleware(isDevelopment: boolean = false) {
  return (request: Request): { response?: Response; passthrough: boolean } => {
    const method = request.method;
    const origin = request.headers.get('origin');

    // Handle preflight
    if (method === 'OPTIONS') {
      return {
        response: handleCORSPreflight(request),
        passthrough: false
      };
    }

    return {
      passthrough: true
    };
  };
}

/**
 * Apply all security headers to response
 */
export function applySecurityHeaders(
  response: Response,
  request: Request,
  isDevelopment: boolean = false
): Response {
  let result = response;
  const origin = request.headers.get('origin');

  // Add CORS headers if origin provided
  if (origin) {
    result = addCORSHeaders(result, origin);
  }

  // Add security headers
  result = addSecurityHeaders(result, isDevelopment);

  return result;
}

/**
 * Subresource Integrity validator
 */
export class SRIValidator {
  /**
   * Generate SRI hash for resource
   */
  static async generateSRI(url: string, algorithm: 'sha256' | 'sha384' | 'sha512' = 'sha384'): Promise<string> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    // Use crypto API if available
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
      const hashBuffer = await globalThis.crypto.subtle.digest(
        algorithm.toUpperCase(),
        arrayBuffer
      );
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashBase64 = btoa(String.fromCharCode(...hashArray));
      return `${algorithm}-${hashBase64}`;
    }

    // Fallback
    return '';
  }

  /**
   * Validate SRI for resource
   */
  static async validateSRI(
    url: string,
    expectedSRI: string
  ): Promise<boolean> {
    const [algorithm] = expectedSRI.split('-');
    const generated = await this.generateSRI(url, algorithm as 'sha256' | 'sha384' | 'sha512');
    return generated === expectedSRI;
  }
}

export default {
  DEFAULT_CORS_CONFIG,
  DEFAULT_SECURITY_HEADERS,
  DEV_SECURITY_HEADERS,
  validateOrigin,
  addCORSHeaders,
  addSecurityHeaders,
  generateRequestId,
  handleCORSPreflight,
  corsSecurityMiddleware,
  applySecurityHeaders,
  SRIValidator
};
