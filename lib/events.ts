import { Client } from 'pg';

/**
 * One LISTEN connection per process, fanned out to the SSE streams.
 *
 * This replaces Supabase Realtime's postgres_changes subscriptions. The
 * database announces every mutation on a single `eradice_events` channel (see
 * migrations 006 and 007) and this module routes each announcement to the
 * streams watching that room. Because the source of truth is the database, any
 * replica can serve any stream — there is no in-process state a viewer depends
 * on landing back on.
 *
 * A pooled connection cannot be used: LISTEN is session state, and a pooled
 * client would stop listening the moment it was returned. So this holds its
 * own dedicated Client, outside the pool.
 */

export interface RoomEvent {
  table: 'room_rolls' | 'roll_comments' | 'room_presence';
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  room_id: string;
  roll_id?: string | number;
  id?: string | number;
}

type Listener = (event: RoomEvent) => void;

const CHANNEL = 'eradice_events';

const listeners = new Map<string, Set<Listener>>();

let client: Client | null = null;
let connecting: Promise<void> | null = null;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

/** Same shape as lib/backoff, kept local so this module has no React coupling. */
function backoffDelay(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** Math.min(attempt, 6));
}

function dispatch(raw: string | undefined) {
  if (!raw) return;
  let event: RoomEvent;
  try {
    event = JSON.parse(raw) as RoomEvent;
  } catch {
    console.error('ignoring malformed eradice_events payload');
    return;
  }
  const room = listeners.get(event.room_id);
  if (!room) return;
  for (const listener of room) {
    try {
      listener(event);
    } catch (err) {
      // One bad stream must not stop delivery to the rest of the room.
      console.error(`event listener failed: ${(err as Error).message}`);
    }
  }
}

async function connect(): Promise<void> {
  const next = new Client({ connectionString: process.env.DATABASE_URL });

  next.on('error', (err) => {
    console.error(`event listener connection error: ${err.message}`);
    scheduleReconnect();
  });
  next.on('end', () => scheduleReconnect());
  next.on('notification', (msg) => dispatch(msg.payload));

  await next.connect();
  await next.query(`LISTEN ${CHANNEL}`);

  client = next;
  reconnectAttempt = 0;
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  if (client) {
    const dead = client;
    client = null;
    dead.removeAllListeners();
    dead.end().catch(() => {});
  }
  connecting = null;

  // Nothing to listen for; reconnect lazily when a stream next subscribes.
  if (listeners.size === 0) return;

  const delay = backoffDelay(reconnectAttempt++);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureListening().catch((err) => {
      console.error(`event listener reconnect failed: ${err.message}`);
      scheduleReconnect();
    });
  }, delay);
}

/** Idempotent; concurrent callers share one in-flight connect. */
export function ensureListening(): Promise<void> {
  if (client) return Promise.resolve();
  if (!connecting) {
    stopped = false;
    connecting = connect().finally(() => {
      connecting = null;
    });
  }
  return connecting;
}

/**
 * Subscribes to one room's events. Returns the unsubscribe function.
 *
 * Note the caller is expected to have already awaited `ensureListening()`;
 * subscribing does not itself block on the connection, so that an SSE response
 * can start streaming immediately.
 */
export function subscribe(roomId: string, listener: Listener): () => void {
  let room = listeners.get(roomId);
  if (!room) {
    room = new Set();
    listeners.set(roomId, room);
  }
  room.add(listener);

  return () => {
    const current = listeners.get(roomId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(roomId);
  };
}

/** Test/shutdown helper. */
export async function stopListening(): Promise<void> {
  stopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  listeners.clear();
  if (client) {
    const closing = client;
    client = null;
    closing.removeAllListeners();
    await closing.end();
  }
}

/** Exposed for tests. */
export function listenerCount(roomId: string): number {
  return listeners.get(roomId)?.size ?? 0;
}
