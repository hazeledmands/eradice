import { route, jsonBody, requireQueryParam, queryParam, NotFoundError } from '../../../../../lib/api';
import { parseUuid, parseCursor, parseLimit, parseRoll, parseNickname, parseVisibility }
  from '../../../../../lib/validation';
import { findRoomById, listRecentRolls, listRollsBefore, listRollsAfter, insertRoll, findRoll }
  from '../../../../../lib/repository';
import { toRoomRoll } from '../../../../../lib/serialize';
import { RATE_LIMITS } from '../../../../../lib/ratelimit';

const PAGE_SIZE = 10;

async function requireRoom(roomIdRaw: string) {
  const roomId = parseUuid(roomIdRaw, 'roomId');
  const room = await findRoomById(roomId);
  if (!room) throw new NotFoundError('room not found');
  return room;
}

export default route({
  rateLimit: RATE_LIMITS.mutate,

  /**
   * One endpoint serving all three of the client's reads, chosen by cursor:
   * no cursor is the newest page, `before` pages backwards, `after` forwards.
   * Rows always come back oldest-first so the client can append directly.
   */
  GET: async ({ req, res, identity }) => {
    const room = await requireRoom(requireQueryParam(req, 'roomId'));
    const before = parseCursor(queryParam(req, 'before'));
    const after = parseCursor(queryParam(req, 'after'));
    const limit = parseLimit(queryParam(req, 'limit'), PAGE_SIZE);

    const rows = after
      ? await listRollsAfter(room.id, after, limit)
      : before
        ? await listRollsBefore(room.id, before, limit)
        : await listRecentRolls(room.id, limit);

    // `after` already returns ascending; the other two are newest-first.
    const ordered = after ? rows : [...rows].reverse();

    res.status(200).json({
      rolls: ordered.map((row) => toRoomRoll(row, identity.sub)),
      // Whether a full page came back is how the client knows to keep offering
      // "load more" in that direction.
      hasMore: rows.length === limit,
    });
  },

  POST: async ({ req, res, identity }) => {
    const room = await requireRoom(requireQueryParam(req, 'roomId'));
    const body = jsonBody(req);
    const roll = parseRoll(body.roll);
    const nickname = parseNickname(body.nickname);
    const visibility = parseVisibility(body.visibility);

    const inserted = await insertRoll({
      roomId: room.id, roll, nickname, visibility, userId: identity.sub,
    });

    // A null insert means this roll id was already recorded — a retry of a
    // request whose response was lost. Return the stored row so the client
    // converges instead of treating its own retry as a failure.
    const row = inserted ?? (await findRoll(room.id, roll.id));
    if (!row) throw new NotFoundError('roll could not be stored');

    res.status(inserted ? 201 : 200).json({ roll: toRoomRoll(row, identity.sub) });
  },
});
