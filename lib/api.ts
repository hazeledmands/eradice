import type { NextApiRequest, NextApiResponse } from 'next';
import { createIdentityResolver, AccessError, type AccessIdentity } from './identity';
import { ValidationError } from './validation';
import { checkRateLimit, RATE_LIMITS, type RateLimit } from './ratelimit';

/**
 * Shared API-route plumbing: identity, method dispatch, rate limiting and
 * error mapping, so each route file contains only its own logic.
 *
 * Error codes are stable and distinguish invalid input, throttling,
 * authorization and unexpected failure, so the client can react to each
 * without parsing prose.
 */

export class NotFoundError extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Authenticated, but not permitted — someone else's roll or comment. */
export class ForbiddenError extends Error {
  constructor(message = 'forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export interface ApiContext {
  req: NextApiRequest;
  res: NextApiResponse;
  identity: AccessIdentity;
}

export type ApiHandler = (ctx: ApiContext) => Promise<void>;

export interface RouteConfig {
  GET?: ApiHandler;
  POST?: ApiHandler;
  PATCH?: ApiHandler;
  DELETE?: ApiHandler;
  /** Bucket applied to non-GET methods; defaults to `write`. */
  rateLimit?: RateLimit;
}

// Built once per process from the real environment. Tests construct their own.
let resolver = createIdentityResolver(process.env as Record<string, string | undefined>);

/** Test seam; also used by the readiness probe to report configuration state. */
export function getIdentityResolver() {
  return resolver;
}

export function setIdentityResolver(next: ReturnType<typeof createIdentityResolver>) {
  resolver = next;
}

export function sendError(res: NextApiResponse, status: number, code: string, message?: string) {
  res.status(status).json(message ? { error: code, message } : { error: code });
}

export function route(config: RouteConfig) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Authenticated data must never be cached by a proxy or the browser.
    res.setHeader('Cache-Control', 'no-store');

    const method = (req.method ?? 'GET').toUpperCase() as keyof RouteConfig;
    const handle = config[method];
    if (typeof handle !== 'function') {
      res.setHeader(
        'Allow',
        (['GET', 'POST', 'PATCH', 'DELETE'] as const).filter((m) => config[m]).join(', ')
      );
      return sendError(res, 405, 'method_not_allowed');
    }

    let identity: AccessIdentity;
    try {
      identity = await resolver.resolve(req);
    } catch (err) {
      if (err instanceof AccessError) return sendError(res, 401, 'unauthorized');
      throw err;
    }

    const bucket = method === 'GET' ? RATE_LIMITS.default : config.rateLimit ?? RATE_LIMITS.write;
    const limitKey = `${identity.sub}:${method}:${req.url?.split('?')[0] ?? ''}`;
    const verdict = checkRateLimit(limitKey, bucket);
    if (!verdict.allowed) {
      res.setHeader('Retry-After', String(verdict.retryAfter));
      return sendError(res, 429, 'rate_limited');
    }

    try {
      await handle({ req, res, identity });
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendError(res, 400, 'invalid_request', err.message);
      }
      if (err instanceof NotFoundError) return sendError(res, 404, 'not_found');
      if (err instanceof ForbiddenError) return sendError(res, 403, 'forbidden');
      if (err instanceof AccessError) return sendError(res, 401, 'unauthorized');

      // Unexpected: log with detail, answer without it.
      console.error(`unhandled error in ${req.method} ${req.url}: ${(err as Error).stack}`);
      if (!res.headersSent) sendError(res, 500, 'server_error');
    }
  };
}

/** Reads a single-valued query parameter, rejecting the repeated form. */
export function queryParam(req: NextApiRequest, name: string): string | undefined {
  const value = req.query[name];
  if (Array.isArray(value)) throw new ValidationError(`${name} must be given once`);
  return value;
}

export function requireQueryParam(req: NextApiRequest, name: string): string {
  const value = queryParam(req, name);
  if (!value) throw new ValidationError(`${name} is required`);
  return value;
}

/** Next parses JSON bodies already; this only enforces the shape. */
export function jsonBody(req: NextApiRequest): Record<string, unknown> {
  const body = req.body;
  if (body === undefined || body === null || body === '') return {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}
