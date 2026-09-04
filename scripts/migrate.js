#!/usr/bin/env node
/**
 * Forward-only migration runner.
 *
 * Run before starting a new application revision:
 *
 *   node scripts/migrate.js
 *
 * In the cluster this is an Argo CD PreSync hook, so a new Deployment revision
 * is never applied until its migrations succeed. That also means a migration
 * runs while pods from the PREVIOUS revision may still be serving: every
 * migration must stay compatible with the revision before it. Use
 * expand/contract across two releases for anything destructive.
 *
 * Deliberately CommonJS. The container runs it directly with no build step,
 * and Jest can require it without any ESM interop.
 */
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/**
 * Advisory lock key, held for the whole run so two runners — a retried hook, a
 * hand-run migration during a sync — serialize instead of interleaving.
 */
const LOCK_KEY = 4552391;

const CREATE_LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

/**
 * Works out which migrations still need applying.
 *
 * Throws rather than guessing on any inconsistency: an unordered filename, two
 * files claiming the same number, or a recorded migration that no longer
 * exists on disk. Each of those means the migration set is not what the ledger
 * thinks it is, and continuing would produce a schema nobody can reproduce.
 */
function selectPending(fileNames, appliedNames) {
  const sqlFiles = fileNames.filter((name) => name.endsWith('.sql'));

  const seen = new Map();
  for (const name of sqlFiles) {
    const match = /^(\d+)_/.exec(name);
    if (!match) {
      throw new Error(`migration "${name}" has no numeric prefix (expected e.g. 001_name.sql)`);
    }
    const number = Number(match[1]);
    if (seen.has(number)) {
      throw new Error(`duplicate migration number ${match[1]}: "${seen.get(number)}" and "${name}"`);
    }
    seen.set(number, name);
  }

  const ordered = [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, name]) => name);

  const present = new Set(ordered);
  for (const name of appliedNames) {
    if (!present.has(name)) {
      throw new Error(
        `migration "${name}" is recorded as applied but is missing from ${MIGRATIONS_DIR}`
      );
    }
  }

  const applied = new Set(appliedNames);
  return ordered.filter((name) => !applied.has(name));
}

/**
 * Applies the given migrations in order, one transaction each, under the
 * advisory lock. Exits successfully when the schema is already current.
 *
 * `readFile` is injected so the transaction and ledger behaviour can be tested
 * without a filesystem or a database.
 */
async function applyMigrations(client, fileNames, readFile) {
  await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
  try {
    await client.query(CREATE_LEDGER);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const pending = selectPending(fileNames, rows.map((row) => row.name));

    const applied = [];
    for (const name of pending) {
      const sql = readFile(name);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      applied.push(name);
      console.log(`applied ${name}`);
    }
    return { applied, pending };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
  }
}

async function main() {
  const { Client } = require('pg');
  // node-postgres reads the libpq PG* variables on its own but does NOT look
  // at DATABASE_URL, so it is passed explicitly; undefined falls through to
  // the PG* handling. The chart supplies PG* straight from the CNPG secret, so
  // there is no connection string to keep in sync with the Cluster CR.
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR);
    const { applied } = await applyMigrations(client, files, (name) =>
      fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8')
    );
    console.log(applied.length ? `${applied.length} migration(s) applied` : 'schema is current');
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`migration failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { selectPending, applyMigrations, LOCK_KEY, MIGRATIONS_DIR };
