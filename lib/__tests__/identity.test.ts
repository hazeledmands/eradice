/**
 * @jest-environment node
 */
import { createIdentityResolver, AccessError } from '../identity';

const CONFIGURED = {
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CLOUDFLARE_ACCESS_AUDIENCE: 'aud-tag',
};

function reqWith(assertion?: string) {
  return { headers: assertion ? { 'cf-access-jwt-assertion': assertion } : {} };
}

describe('createIdentityResolver — production', () => {
  it('is not ready when Access is unconfigured, so readiness can fail closed', () => {
    const resolver = createIdentityResolver({ NODE_ENV: 'production' });
    expect(resolver.ready).toBe(false);
    expect(resolver.reason).toMatch(/CLOUDFLARE_ACCESS/);
  });

  it('never falls back to a development identity in production', async () => {
    const resolver = createIdentityResolver({
      NODE_ENV: 'production',
      DEV_AUTH_SUB: 'sneaky',
      DEV_AUTH_EMAIL: 'sneaky@example.com',
    });
    expect(resolver.ready).toBe(false);
    await expect(resolver.resolve(reqWith())).rejects.toThrow(AccessError);
  });

  it('is ready when Access is configured', () => {
    const resolver = createIdentityResolver({ NODE_ENV: 'production', ...CONFIGURED });
    expect(resolver.ready).toBe(true);
    expect(resolver.reason).toBeNull();
  });

  it('rejects a request with no assertion once configured', async () => {
    const resolver = createIdentityResolver({ NODE_ENV: 'production', ...CONFIGURED });
    await expect(resolver.resolve(reqWith())).rejects.toThrow(AccessError);
  });

  it('ignores DEV_AUTH_* even when Access is configured', async () => {
    const resolver = createIdentityResolver({
      NODE_ENV: 'production',
      ...CONFIGURED,
      DEV_AUTH_SUB: 'sneaky',
    });
    await expect(resolver.resolve(reqWith())).rejects.toThrow(AccessError);
  });
});

describe('createIdentityResolver — development', () => {
  it('supplies a development identity when Access is unconfigured', async () => {
    const resolver = createIdentityResolver({ NODE_ENV: 'development' });
    expect(resolver.ready).toBe(true);
    await expect(resolver.resolve(reqWith())).resolves.toEqual({
      sub: 'dev-user',
      email: 'dev@localhost',
      name: 'Dev',
    });
  });

  it('lets DEV_AUTH_* override the development identity', async () => {
    const resolver = createIdentityResolver({
      NODE_ENV: 'development',
      DEV_AUTH_SUB: 'player-two',
      DEV_AUTH_EMAIL: 'two@localhost',
      DEV_AUTH_NAME: 'Player Two',
    });
    await expect(resolver.resolve(reqWith())).resolves.toEqual({
      sub: 'player-two',
      email: 'two@localhost',
      name: 'Player Two',
    });
  });

  it('still enforces Access when it is configured, even in development', async () => {
    const resolver = createIdentityResolver({ NODE_ENV: 'development', ...CONFIGURED });
    await expect(resolver.resolve(reqWith())).rejects.toThrow(AccessError);
    await expect(resolver.resolve(reqWith('garbage'))).rejects.toThrow(AccessError);
  });
});

describe('assertion header handling', () => {
  it('reads the assertion from the Cf-Access-Jwt-Assertion header', async () => {
    const seen: Array<string | undefined> = [];
    const resolver = createIdentityResolver({ NODE_ENV: 'production', ...CONFIGURED }, async (a) => {
      seen.push(a);
      return { sub: 's', email: 'e@example.com' };
    });
    await resolver.resolve(reqWith('the-token'));
    expect(seen).toEqual(['the-token']);
  });

  it('accepts an array-valued header by taking the first entry', async () => {
    const resolver = createIdentityResolver(
      { NODE_ENV: 'production', ...CONFIGURED },
      async (a) => ({ sub: a ?? 'none', email: 'e@example.com' })
    );
    const identity = await resolver.resolve({
      headers: { 'cf-access-jwt-assertion': ['first', 'second'] },
    });
    expect(identity.sub).toBe('first');
  });
});
