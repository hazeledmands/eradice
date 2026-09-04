import type { NextApiRequest, NextApiResponse } from 'next';
import { AccessError } from '../../../../lib/identity';
import { getIdentityResolver, sendError } from '../../../../lib/api';
import { ValidationError, parseUuid } from '../../../../lib/validation';
import { ensureListening, subscribe, type RoomEvent } from '../../../../lib/events';
import {
  findRoomById,
  findRoll,
  findComment,
  listPresence,
  markPresent,
  markAbsent,
} from '../../../../lib/repository';
import { toRoomRoll, toRollComment, toPresence } from '../../../../lib/serialize';

/**
 * Server-Sent Events, replacing all five Supabase Realtime subscriptions plus
 * the presence channel.
 *
 * SSE rather than WebSockets: the traffic is one-way (the client mutates over
 * ordinary POSTs), it is plain HTTP so it needs nothing special from
 * cloudflared, and the browser's EventSource reconnects on its own.
 *
 * The stream carries fully serialized objects, not just row ids: the trigger
 * payload identifies what changed, and this handler re-reads the row so the
 * client can apply it directly. That keeps the NOTIFY payload well under its
 * 8000-byte cap regardless of how large a roll gets.
 */

// Well inside typical proxy idle timeouts, and it is what keeps a silent room
// from having its connection reaped.
const KEEPALIVE_MS = 25_000;
// Presence rows live 60s (PRESENCE_TTL_SECONDS); refresh at a third of that so
// two lost heartbeats in a row still do not drop a viewer.
const HEARTBEAT_MS = 20_000;

export const config = {
  api: {
    // Next buffers responses by default, which would hold every event until
    // the handler returned — i.e. forever.
    responseLimit: false,
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'method_not_allowed');
  }

  let identity;
  try {
    identity = await getIdentityResolver().resolve(req);
  } catch (err) {
    if (err instanceof AccessError) return sendError(res, 401, 'unauthorized');
    throw err;
  }

  let roomId: string;
  try {
    roomId = parseUuid(
      Array.isArray(req.query.roomId) ? req.query.roomId[0] : req.query.roomId,
      'roomId'
    );
  } catch (err) {
    if (err instanceof ValidationError) return sendError(res, 400, 'invalid_request', err.message);
    throw err;
  }

  const room = await findRoomById(roomId);
  if (!room) return sendError(res, 404, 'not_found');

  const nickname =
    (Array.isArray(req.query.nickname) ? req.query.nickname[0] : req.query.nickname) ??
    identity.name ??
    'Player';

  // The LISTEN connection must be up before we promise the client a stream;
  // failing here is a plain 503 rather than a half-open EventSource.
  try {
    await ensureListening();
  } catch (err) {
    console.error(`stream unavailable: ${(err as Error).message}`);
    return sendError(res, 503, 'stream_unavailable');
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    // cloudflared and any intermediary must not buffer this.
    'X-Accel-Buffering': 'no',
  });

  let open = true;
  const send = (event: string, data: unknown) => {
    if (!open) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  /**
   * Re-reads whatever the trigger says changed and forwards it.
   *
   * `shouldAnimate` is set true for live rolls — this is the equivalent of the
   * old client distinguishing a realtime INSERT from loaded history.
   */
  const onEvent = (event: RoomEvent) => {
    void (async () => {
      try {
        if (event.table === 'room_rolls') {
          const row = await findRoll(room.id, Number(event.roll_id));
          if (!row) return;
          const roll = toRoomRoll(row, identity.sub);
          send(event.op === 'INSERT' ? 'roll' : 'roll_updated', {
            ...roll,
            shouldAnimate: event.op === 'INSERT',
          });
        } else if (event.table === 'roll_comments') {
          if (event.op === 'DELETE') {
            send('comment_deleted', { id: String(event.id) });
            return;
          }
          const row = await findComment(String(event.id), room.id);
          if (!row) return;
          send(event.op === 'INSERT' ? 'comment' : 'comment_updated', toRollComment(row));
        } else if (event.table === 'room_presence') {
          send('presence', (await listPresence(room.id)).map(toPresence));
        }
      } catch (err) {
        console.error(`failed to deliver ${event.table} event: ${(err as Error).message}`);
      }
    })();
  };

  const unsubscribe = subscribe(room.id, onEvent);

  await markPresent(room.id, identity.sub, nickname);
  send('ready', { roomId: room.id, userId: identity.sub });
  send('presence', (await listPresence(room.id)).map(toPresence));

  const keepalive = setInterval(() => {
    // A comment frame: ignored by EventSource, but it keeps the socket alive.
    if (open) res.write(': keepalive\n\n');
  }, KEEPALIVE_MS);

  const heartbeat = setInterval(() => {
    markPresent(room.id, identity.sub, nickname).catch((err) => {
      console.error(`presence heartbeat failed: ${err.message}`);
    });
  }, HEARTBEAT_MS);

  const cleanup = () => {
    if (!open) return;
    open = false;
    clearInterval(keepalive);
    clearInterval(heartbeat);
    unsubscribe();
    // Best effort: if this never runs, the row ages out of listPresence anyway.
    markAbsent(room.id, identity.sub).catch(() => {});
    res.end();
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
}
