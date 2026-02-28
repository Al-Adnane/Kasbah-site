/**
 * @kasbah/guard — Express / Fastify middleware example
 *
 * Scans incoming request bodies for sensitive data leaks.
 * Adds X-Kasbah-Risk header; can optionally block DENY-level requests.
 *
 * @example Express:
 * ```ts
 * import express from 'express';
 * import { kasbahMiddleware } from '@kasbah/guard/examples/node-middleware';
 *
 * const app = express();
 * app.use(express.json());
 * app.use(kasbahMiddleware({ blockOnDeny: false }));
 * ```
 */

import { classify } from '@kasbah/guard';

interface MiddlewareOptions {
  /** If true, requests with DENY-level content are rejected with 400 (default: false — informational only) */
  blockOnDeny?: boolean;
  /** Custom threshold for blocking (default: 70) */
  blockThreshold?: number;
  /** Paths to skip (e.g. ['/health', '/metrics']) */
  skipPaths?: string[];
}

// Express-compatible middleware
export function kasbahMiddleware(options: MiddlewareOptions = {}) {
  const { blockOnDeny = false, blockThreshold = 70, skipPaths = [] } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req: any, res: any, next: any) => {
    if (skipPaths.includes(req.path)) return next();

    const bodyText = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || '');
    if (!bodyText || bodyText.length < 5) return next();

    const result = classify(bodyText);
    res.setHeader('X-Kasbah-Risk', String(result.risk));
    res.setHeader('X-Kasbah-Decision', result.decision);

    if (blockOnDeny && result.risk >= blockThreshold) {
      return res.status(400).json({
        error: 'Sensitive data detected in request',
        decision: result.decision,
        risk: result.risk,
        reason: result.reason,
      });
    }

    next();
  };
}

// Fastify plugin equivalent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function kasbahFastifyPlugin(fastify: any, options: MiddlewareOptions = {}) {
  const { blockOnDeny = false, blockThreshold = 70, skipPaths = [] } = options;

  fastify.addHook('preHandler', async (request: any, reply: any) => {
    if (skipPaths.includes(request.url)) return;
    const bodyText = typeof request.body === 'string' ? request.body : JSON.stringify(request.body || '');
    if (!bodyText || bodyText.length < 5) return;

    const result = classify(bodyText);
    reply.header('X-Kasbah-Risk', String(result.risk));
    reply.header('X-Kasbah-Decision', result.decision);

    if (blockOnDeny && result.risk >= blockThreshold) {
      reply.status(400).send({
        error: 'Sensitive data detected in request',
        decision: result.decision,
        risk: result.risk,
        reason: result.reason,
      });
    }
  });
}
