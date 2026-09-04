/**
 * @jest-environment node
 */
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import { createLocalJWKSet } from 'jose';
import {
  readAccessConfig,
  createAccessVerifier,
  AccessError,
  type AccessConfig,
} from '../access';

const TEAM_DOMAIN = 'https://example.cloudflareaccess.com';
const AUDIENCE = 'aud-tag-for-eradice';

const config: AccessConfig = { teamDomain: TEAM_DOMAIN, audience: AUDIENCE };

let privateKey: CryptoKey;
let publicJwk: JWK;
let otherPrivateKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), alg: 'RS256', kid: 'test-key' };

  const other = await generateKeyPair('RS256', { extractable: true });
  otherPrivateKey = other.privateKey;
});

/** Mints a token shaped like a real Cloudflare Access application token. */
async function mint(
  claims: Record<string, unknown> = {},
  opts: { key?: CryptoKey; issuer?: string; audience?: string; expires?: string } = {}
) {
  return new SignJWT({ type: 'app', email: 'player@example.com', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuedAt()
    .setIssuer(opts.issuer ?? TEAM_DOMAIN)
    .setAudience(opts.audience ?? AUDIENCE)
    .setExpirationTime(opts.expires ?? '1h')
    .setSubject((claims.sub as string) ?? 'cf-subject-abc123')
    .sign(opts.key ?? privateKey);
}

function verifier() {
  return createAccessVerifier(config, createLocalJWKSet({ keys: [publicJwk] }));
}

describe('readAccessConfig', () => {
  it('returns null when neither variable is set', () => {
    expect(readAccessConfig({})).toBeNull();
  });

  it('returns null when only one variable is set', () => {
    expect(readAccessConfig({ CLOUDFLARE_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN })).toBeNull();
    expect(readAccessConfig({ CLOUDFLARE_ACCESS_AUDIENCE: AUDIENCE })).toBeNull();
  });

  it('returns config when both are set', () => {
    expect(
      readAccessConfig({
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
        CLOUDFLARE_ACCESS_AUDIENCE: AUDIENCE,
      })
    ).toEqual(config);
  });

  it('strips a trailing slash from the team domain so the issuer compares cleanly', () => {
    expect(
      readAccessConfig({
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: `${TEAM_DOMAIN}/`,
        CLOUDFLARE_ACCESS_AUDIENCE: AUDIENCE,
      })
    ).toEqual(config);
  });

  it('ignores blank values rather than treating them as configured', () => {
    expect(
      readAccessConfig({
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: '   ',
        CLOUDFLARE_ACCESS_AUDIENCE: AUDIENCE,
      })
    ).toBeNull();
  });
});

describe('verifyAccessJwt', () => {
  it('accepts a well-formed token and returns the identity', async () => {
    const identity = await verifier()(await mint());
    expect(identity).toEqual({
      sub: 'cf-subject-abc123',
      email: 'player@example.com',
      name: undefined,
    });
  });

  it('carries the name claim through when Access supplies one', async () => {
    const identity = await verifier()(await mint({ name: 'Hazel' }));
    expect(identity.name).toBe('Hazel');
  });

  it('falls back to preferred_username when name is absent', async () => {
    const identity = await verifier()(await mint({ preferred_username: 'hazel' }));
    expect(identity.name).toBe('hazel');
  });

  it('rejects a token signed by an unknown key', async () => {
    await expect(verifier()(await mint({}, { key: otherPrivateKey }))).rejects.toThrow(AccessError);
  });

  it('rejects a token for a different audience', async () => {
    await expect(verifier()(await mint({}, { audience: 'someone-elses-app' }))).rejects.toThrow(
      AccessError
    );
  });

  it('rejects a token from a different team domain', async () => {
    await expect(
      verifier()(await mint({}, { issuer: 'https://attacker.cloudflareaccess.com' }))
    ).rejects.toThrow(AccessError);
  });

  it('rejects an expired token', async () => {
    await expect(verifier()(await mint({}, { expires: '-5m' }))).rejects.toThrow(AccessError);
  });

  it('rejects a token that is not an application token', async () => {
    await expect(verifier()(await mint({ type: 'org' }))).rejects.toThrow(AccessError);
  });

  it('rejects a token with no verified email', async () => {
    await expect(verifier()(await mint({ email: undefined }))).rejects.toThrow(AccessError);
  });

  it('rejects an empty or missing assertion without hitting the JWKS', async () => {
    await expect(verifier()('')).rejects.toThrow(AccessError);
    await expect(verifier()(undefined)).rejects.toThrow(AccessError);
  });

  it('rejects a structurally invalid assertion', async () => {
    await expect(verifier()('not-a-jwt')).rejects.toThrow(AccessError);
  });
});
