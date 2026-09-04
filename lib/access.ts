import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/**
 * Cloudflare Access is eradice's only production identity boundary.
 *
 * Every authenticated origin request arrives with a `Cf-Access-Jwt-Assertion`
 * header. We verify it ourselves rather than trusting any header the proxy
 * sets: RS256 against the team domain's rotating JWKS, plus issuer, audience,
 * time bounds, application-token type, subject and verified email. Supplying
 * Cloudflare-looking headers is therefore not sufficient to be admitted.
 */

export interface AccessConfig {
  /** Origin such as `https://example.cloudflareaccess.com`, no trailing slash. */
  teamDomain: string;
  /** The Access application's `aud` tag. */
  audience: string;
}

export interface AccessIdentity {
  /** Stable Access user id. This is the ownership key everywhere in eradice. */
  sub: string;
  email: string;
  /** Presentation only — never grants permission. */
  name?: string;
}

/** Thrown for every rejection, so callers can map the whole class to a 401. */
export class AccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessError';
  }
}

type Env = Record<string, string | undefined>;

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Reads Access configuration from the environment. Returns null when it is
 * absent or incomplete — the caller decides whether that is a readiness
 * failure (production) or a cue to use the development identity.
 */
export function readAccessConfig(env: Env): AccessConfig | null {
  const teamDomain = clean(env.CLOUDFLARE_ACCESS_TEAM_DOMAIN);
  const audience = clean(env.CLOUDFLARE_ACCESS_AUDIENCE);
  if (!teamDomain || !audience) return null;
  // Cloudflare issues tokens with `iss` set to the bare origin, so a
  // configured trailing slash would fail an otherwise valid token.
  return { teamDomain: teamDomain.replace(/\/+$/, ''), audience };
}

export type AccessVerifier = (assertion: string | undefined) => Promise<AccessIdentity>;

/**
 * Builds a verifier bound to one Access application.
 *
 * `jwks` is injectable for testing; in production it defaults to the team
 * domain's rotating key set, which `jose` fetches lazily and caches. That
 * fetch is the reason the app needs HTTPS egress — and because it is lazy,
 * blocking it does not fail readiness, it fails the first real sign-in.
 */
export function createAccessVerifier(config: AccessConfig, jwks?: JWTVerifyGetKey): AccessVerifier {
  const keys =
    jwks ?? createRemoteJWKSet(new URL(`${config.teamDomain}/cdn-cgi/access/certs`));

  return async function verifyAccessJwt(assertion) {
    if (!assertion) throw new AccessError('missing Cf-Access-Jwt-Assertion');

    let payload;
    try {
      ({ payload } = await jwtVerify(assertion, keys, {
        issuer: config.teamDomain,
        audience: config.audience,
        algorithms: ['RS256'],
      }));
    } catch (cause) {
      // Deliberately opaque: the caller gets a 401 either way, and echoing
      // jose's reason back to the client narrates the check to an attacker.
      throw new AccessError('invalid Cf-Access-Jwt-Assertion');
    }

    // An org-level token is not an application token. Accepting one would
    // admit anyone in the Zero Trust org rather than anyone this app's
    // Access policy admits.
    if (payload.type !== 'app') {
      throw new AccessError('assertion is not an application token');
    }

    const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    if (!sub) throw new AccessError('assertion has no subject');

    const email = typeof payload.email === 'string' ? payload.email.trim() : '';
    if (!email) throw new AccessError('assertion has no verified email');

    const name =
      (typeof payload.name === 'string' && payload.name.trim()) ||
      (typeof payload.preferred_username === 'string' && payload.preferred_username.trim()) ||
      undefined;

    return { sub, email, name: name || undefined };
  };
}
