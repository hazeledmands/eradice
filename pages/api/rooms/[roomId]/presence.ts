import { route, jsonBody, requireQueryParam, NotFoundError } from '../../../../lib/api';
import { parseUuid, parseNickname } from '../../../../lib/validation';
import { findRoomById, markPresent, markAbsent, listPresence } from '../../../../lib/repository';
import { toPresence } from '../../../../lib/serialize';
import { RATE_LIMITS } from '../../../../lib/ratelimit';

/**
 * Presence heartbeat.
 *
 * POST announces or refreshes the viewer, and is also how a rename propagates.
 * DELETE is the graceful-leave path; it is an optimization only, since rows
 * age out of listPresence on their own once heartbeats stop.
 *
 * The `mutate` bucket rather than `write`: a heartbeat every few seconds is
 * expected traffic here, unlike a comment edit.
 */
export default route({
  rateLimit: RATE_LIMITS.mutate,

  GET: async ({ req, res }) => {
    const roomId = parseUuid(requireQueryParam(req, 'roomId'), 'roomId');
    res.status(200).json({ presence: (await listPresence(roomId)).map(toPresence) });
  },

  POST: async ({ req, res, identity }) => {
    const roomId = parseUuid(requireQueryParam(req, 'roomId'), 'roomId');
    if (!(await findRoomById(roomId))) throw new NotFoundError('room not found');

    await markPresent(roomId, identity.sub, parseNickname(jsonBody(req).nickname));
    res.status(200).json({ presence: (await listPresence(roomId)).map(toPresence) });
  },

  DELETE: async ({ req, res, identity }) => {
    const roomId = parseUuid(requireQueryParam(req, 'roomId'), 'roomId');
    await markAbsent(roomId, identity.sub);
    res.status(204).end();
  },
});
