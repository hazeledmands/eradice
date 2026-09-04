/**
 * @jest-environment node
 */
const { selectPending, applyMigrations, LOCK_KEY } = require('../migrate');

describe('selectPending', () => {
  it('returns migrations in numeric order', () => {
    const pending = selectPending(['010_j.sql', '002_b.sql', '001_a.sql'], []);
    expect(pending).toEqual(['001_a.sql', '002_b.sql', '010_j.sql']);
  });

  it('skips files already recorded in the ledger', () => {
    const pending = selectPending(
      ['001_a.sql', '002_b.sql', '003_c.sql'],
      ['001_a.sql', '002_b.sql']
    );
    expect(pending).toEqual(['003_c.sql']);
  });

  it('returns nothing when the schema is current', () => {
    expect(selectPending(['001_a.sql'], ['001_a.sql'])).toEqual([]);
  });

  it('ignores non-sql files', () => {
    expect(selectPending(['001_a.sql', 'README.md', '.keep'], [])).toEqual(['001_a.sql']);
  });

  it('throws when a migration is missing its numeric prefix', () => {
    expect(() => selectPending(['no_prefix.sql'], [])).toThrow(/numeric prefix/);
  });

  it('throws when two migrations share a number, rather than silently picking one', () => {
    expect(() => selectPending(['001_a.sql', '001_b.sql'], [])).toThrow(/duplicate/i);
  });

  it('throws when an applied migration has vanished from disk', () => {
    expect(() => selectPending(['002_b.sql'], ['001_a.sql'])).toThrow(/001_a\.sql/);
  });
});

describe('applyMigrations', () => {
  // The runner is a CLI and logging each applied migration is part of its job;
  // silence it so a passing suite stays quiet.
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  /** Minimal stand-in for a pg client that records the SQL it is given. */
  function fakeClient(applied = []) {
    const calls = [];
    return {
      calls,
      query: jest.fn(async (sql, params) => {
        calls.push({ sql: String(sql).trim(), params });
        if (String(sql).includes('SELECT name FROM schema_migrations')) {
          return { rows: applied.map((name) => ({ name })) };
        }
        return { rows: [] };
      }),
    };
  }

  const read = (name) => `-- ${name}\nSELECT 1;`;

  it('takes an advisory lock before touching the schema and releases it after', async () => {
    const client = fakeClient();
    await applyMigrations(client, ['001_a.sql'], read);
    const locks = client.calls.filter((c) => c.sql.includes('advisory'));
    expect(locks[0].sql).toContain('pg_advisory_lock');
    expect(locks[0].params).toEqual([LOCK_KEY]);
    expect(locks[locks.length - 1].sql).toContain('pg_advisory_unlock');
  });

  it('creates the ledger table before reading it', async () => {
    const client = fakeClient();
    await applyMigrations(client, [], read);
    const create = client.calls.findIndex((c) => c.sql.includes('CREATE TABLE IF NOT EXISTS'));
    const select = client.calls.findIndex((c) => c.sql.includes('SELECT name FROM'));
    expect(create).toBeGreaterThanOrEqual(0);
    expect(create).toBeLessThan(select);
  });

  it('wraps each migration in its own transaction and records it', async () => {
    const client = fakeClient();
    const result = await applyMigrations(client, ['001_a.sql'], read);

    const sqls = client.calls.map((c) => c.sql);
    const begin = sqls.indexOf('BEGIN');
    const commit = sqls.indexOf('COMMIT');
    const body = sqls.findIndex((s) => s.includes('-- 001_a.sql'));
    const insert = sqls.findIndex((s) => s.includes('INSERT INTO schema_migrations'));

    expect(begin).toBeGreaterThanOrEqual(0);
    expect(begin).toBeLessThan(body);
    expect(body).toBeLessThan(insert);
    expect(insert).toBeLessThan(commit);
    expect(result.applied).toEqual(['001_a.sql']);
  });

  it('is a no-op when every migration is already recorded', async () => {
    const client = fakeClient(['001_a.sql']);
    const result = await applyMigrations(client, ['001_a.sql'], read);
    expect(result.applied).toEqual([]);
    expect(client.calls.map((c) => c.sql)).not.toContain('BEGIN');
  });

  it('rolls back and releases the lock when a migration fails', async () => {
    const client = fakeClient();
    client.query.mockImplementation(async (sql) => {
      client.calls.push({ sql: String(sql).trim() });
      if (String(sql).includes('SELECT name FROM schema_migrations')) return { rows: [] };
      if (String(sql).includes('-- 001_a.sql')) throw new Error('syntax error at or near');
      return { rows: [] };
    });

    await expect(applyMigrations(client, ['001_a.sql'], read)).rejects.toThrow('syntax error');

    const sqls = client.calls.map((c) => c.sql);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls.some((s) => s.includes('pg_advisory_unlock'))).toBe(true);
  });

  it('stops at the first failure instead of applying later migrations', async () => {
    const client = fakeClient();
    client.query.mockImplementation(async (sql) => {
      client.calls.push({ sql: String(sql).trim() });
      if (String(sql).includes('SELECT name FROM schema_migrations')) return { rows: [] };
      if (String(sql).includes('-- 001_a.sql')) throw new Error('boom');
      return { rows: [] };
    });

    await expect(applyMigrations(client, ['001_a.sql', '002_b.sql'], read)).rejects.toThrow('boom');
    expect(client.calls.some((c) => c.sql.includes('-- 002_b.sql'))).toBe(false);
  });
});
