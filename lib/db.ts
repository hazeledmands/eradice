import { Pool, type PoolClient, type QueryResultRow } from 'pg';

/**
 * The application's single PostgreSQL pool.
 *
 * No explicit connection config: node-postgres reads `DATABASE_URL`, or the
 * discrete `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` variables,
 * natively. The chart supplies the discrete form straight from the CNPG
 * secret, so there is no connection string to build and nothing to keep in
 * sync with the Cluster CR.
 */

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      // node-postgres reads the libpq PG* variables on its own but does NOT
      // look at DATABASE_URL, so the deployment contract's "either form works"
      // only holds if it is passed explicitly. Undefined here falls through to
      // the PG* handling, which is what the chart actually supplies.
      connectionString: process.env.DATABASE_URL,
      // Two replicas plus the CNPG cluster's own connection budget; well under
      // the default max_connections of 100 with room for pgAdmin and backups.
      max: Number(process.env.PGPOOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      // Fail a stuck connect rather than hanging a request until the client
      // gives up — readiness then reports the database as unreachable.
      connectionTimeoutMillis: 5_000,
    });
    // A pool-level error (a dropped backend during CNPG failover) is emitted
    // on the pool, and an unhandled 'error' event would take the process down.
    pool.on('error', (err) => {
      console.error(`postgres pool error: ${err.message}`);
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/** Runs `fn` inside a transaction, rolling back on any throw. */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Readiness check: a real round-trip, not just a pool handle. */
export async function checkDatabase(): Promise<void> {
  await getPool().query('SELECT 1');
}

/** Test and shutdown helper; the next getPool() builds a fresh pool. */
export async function closePool(): Promise<void> {
  if (pool) {
    const closing = pool;
    pool = null;
    await closing.end();
  }
}
