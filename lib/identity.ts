import {
  AccessError,
  createAccessVerifier,
  readAccessConfig,
  type AccessIdentity,
  type AccessVerifier,
} from './access';

export { AccessError, type AccessIdentity };

type Env = Record<string, string | undefined>;

/** The shape we need from a Next API request — kept minimal so it is trivial to test. */
export interface IdentityRequest {
  headers: Record<string, string | string[] | undefined>;
}

export interface IdentityResolver {
  /**
   * False only when the deployment is misconfigured: Access is absent in an
   * environment that requires it. `/health/ready` reports 503 on this, so a
   * bad rollout is caught by the probe rather than by a user.
   */
  ready: boolean;
  /** Human-readable cause when `ready` is false, for the readiness payload and logs. */
  reason: string | null;
  resolve(req: IdentityRequest): Promise<AccessIdentity>;
}

const ASSERTION_HEADER = 'cf-access-jwt-assertion';

function headerValue(req: IdentityRequest, name: string): string | undefined {
  const raw = req.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Decides how a request's identity is established.
 *
 * Two modes, and the split is deliberately by configuration rather than by a
 * feature flag: if Access is configured we enforce it, everywhere, including
 * local development. The development identity exists only for the case where
 * Access is absent AND we are not in production — production with no Access
 * configuration is a broken deployment, not an open one.
 *
 * `verifier` is injectable for testing; production builds one from the
 * configured team domain and audience.
 */
export function createIdentityResolver(env: Env, verifier?: AccessVerifier): IdentityResolver {
  const config = readAccessConfig(env);
  const isProduction = env.NODE_ENV === 'production';

  if (config) {
    const verify = verifier ?? createAccessVerifier(config);
    return {
      ready: true,
      reason: null,
      resolve: (req) => verify(headerValue(req, ASSERTION_HEADER)),
    };
  }

  if (isProduction) {
    const reason =
      'CLOUDFLARE_ACCESS_TEAM_DOMAIN and CLOUDFLARE_ACCESS_AUDIENCE are required in production';
    return {
      ready: false,
      reason,
      // Fails closed. Without this, an unconfigured production pod would serve
      // every request as one shared anonymous user.
      resolve: () => Promise.reject(new AccessError(reason)),
    };
  }

  const devIdentity: AccessIdentity = {
    sub: env.DEV_AUTH_SUB?.trim() || 'dev-user',
    email: env.DEV_AUTH_EMAIL?.trim() || 'dev@localhost',
    name: env.DEV_AUTH_NAME?.trim() || 'Dev',
  };

  return {
    ready: true,
    reason: null,
    resolve: () => Promise.resolve(devIdentity),
  };
}
