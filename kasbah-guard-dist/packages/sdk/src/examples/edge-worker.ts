/**
 * @kasbah/guard — Cloudflare Worker / Vercel Edge example
 *
 * Drop-in edge handler that scans request bodies and adds risk headers.
 *
 * @example Cloudflare Worker:
 * ```ts
 * import { kasbahEdgeHandler } from '@kasbah/guard/examples/edge-worker';
 * export default { fetch: kasbahEdgeHandler };
 * ```
 */

import { classify } from '@kasbah/guard';

interface EdgeOptions {
  /** Pass-through to your actual handler after scanning */
  handler?: (request: Request) => Promise<Response> | Response;
  /** Block DENY-level requests (default: false) */
  blockOnDeny?: boolean;
  blockThreshold?: number;
}

export async function kasbahEdgeHandler(
  request: Request,
  options: EdgeOptions = {}
): Promise<Response> {
  const { handler, blockOnDeny = false, blockThreshold = 70 } = options;

  // Only scan POST/PUT/PATCH with bodies
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    try {
      const clone = request.clone();
      const bodyText = await clone.text();
      if (bodyText.length >= 5) {
        const result = classify(bodyText);

        if (blockOnDeny && result.risk >= blockThreshold) {
          return new Response(JSON.stringify({
            error: 'Sensitive data detected',
            decision: result.decision,
            risk: result.risk,
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'X-Kasbah-Risk': String(result.risk),
              'X-Kasbah-Decision': result.decision,
            }
          });
        }

        // Add risk headers to pass-through response
        if (handler) {
          const response = await handler(request);
          const newHeaders = new Headers(response.headers);
          newHeaders.set('X-Kasbah-Risk', String(result.risk));
          newHeaders.set('X-Kasbah-Decision', result.decision);
          return new Response(response.body, { status: response.status, headers: newHeaders });
        }
      }
    } catch (_e) {
      // Never block on scan errors
    }
  }

  return handler ? handler(request) : new Response('OK');
}
