#!/usr/bin/env node
/**
 * Export the eradice dataset from Supabase over PostgREST, as SQL.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_KEY=<secret key> \
 *     node scripts/export-supabase-rest.js > supabase-data.sql
 *
 * The companion path is `pg_dump` (see scripts/import-supabase.sh), which is
 * better in every way when the database password is available: it is a single
 * command and it cannot disagree with the source about types. This exists for
 * the case where only an API key is on hand — a Supabase secret key
 * authenticates against PostgREST, not against PostgreSQL, so pg_dump cannot
 * use it.
 *
 * The output is deliberately shaped like a pg_dump data-only dump so the same
 * import path applies: FK-safe table order, explicit ids, and a setval to lift
 * the identity sequence clear of the imported rows.
 */

'use strict';

const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_KEY || '';
const PAGE = 500;

if (!BASE || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_KEY are required');
  process.exit(1);
}

/** rooms first: both other tables carry a FK to it. */
const TABLES = [
  { name: 'rooms', order: 'created_at', columns: ['id', 'slug', 'created_at'] },
  {
    name: 'roll_comments',
    order: 'created_at',
    columns: ['id', 'room_id', 'roll_id', 'text', 'author_nickname', 'author_id',
      'created_at', 'updated_at'],
  },
  {
    // Identity column, so rows are restored with OVERRIDING SYSTEM VALUE and
    // the sequence is advanced afterwards.
    name: 'room_rolls',
    order: 'id',
    identity: 'id',
    columns: ['id', 'room_id', 'roll_id', 'user_nickname', 'roll_data',
      'created_at', 'visibility', 'is_revealed', 'user_id'],
  },
];

const JSON_COLUMNS = new Set(['roll_data']);

function quote(value, column) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`non-finite number in ${column}`);
    return String(value);
  }
  const text = JSON_COLUMNS.has(column) ? JSON.stringify(value) : String(value);
  return `'${text.replace(/'/g, "''")}'`;
}

async function fetchPage(table, order, offset) {
  const url = `${BASE}/rest/v1/${table}?select=*&order=${order}.asc&limit=${PAGE}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`${table} page at offset ${offset}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function fetchAll(table, order) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchPage(table, order, offset);
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function main() {
  const out = [];
  out.push('-- eradice data exported from Supabase over PostgREST');
  out.push(`-- ${new Date().toISOString()}`);
  out.push('SET client_encoding = \'UTF8\';');
  out.push('');

  const counts = [];
  for (const table of TABLES) {
    const rows = await fetchAll(table.name, table.order);
    counts.push(`${table.name}=${rows.length}`);
    out.push(`-- ${table.name}: ${rows.length} rows`);

    for (const row of rows) {
      // Every row lists every column explicitly, so a NULL that PostgREST
      // omits cannot silently become a default.
      const values = table.columns.map((c) => quote(row[c], c)).join(', ');
      const overriding = table.identity ? ' OVERRIDING SYSTEM VALUE' : '';
      out.push(`INSERT INTO public.${table.name} (${table.columns.join(', ')})${overriding} VALUES (${values});`);
    }

    if (table.identity) {
      const max = rows.reduce((m, r) => Math.max(m, Number(r[table.identity])), 0);
      out.push('');
      out.push(`-- lift the identity sequence clear of the imported ids`);
      out.push(`SELECT pg_catalog.setval('public.${table.name}_${table.identity}_seq', ${max}, true);`);
    }
    out.push('');
  }

  process.stdout.write(out.join('\n') + '\n');
  console.error(`exported ${counts.join(', ')}`);
}

main().catch((err) => {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
});
