import { route, jsonBody, requireQueryParam, NotFoundError, ForbiddenError }
  from '../../../../../../lib/api';
import { parseUuid, parseRollId, parseRoll } from '../../../../../../lib/validation';
import { updateRollData, findRoll } from '../../../../../../lib/repository';
import { toRoomRoll } from '../../../../../../lib/serialize';
import { RATE_LIMITS } from '../../../../../../lib/ratelimit';
import { ValidationError } from '../../../../../../lib/validation';

/**
 * Record a CP spend, which adds dice to an existing roll.
 *
 * The client sends the whole updated Roll, as it did to PostgREST. Owner-only,
 * and the roll id in the body must match the one in the path so a spend cannot
 * be redirected onto a different roll.
 */
export default route({
  rateLimit: RATE_LIMITS.mutate,
  POST: async ({ req, res, identity }) => {
    const roomId = parseUuid(requireQueryParam(req, 'roomId'), 'roomId');
    const rollId = parseRollId(requireQueryParam(req, 'rollId'));
    const roll = parseRoll(jsonBody(req).roll);

    if (roll.id !== rollId) {
      throw new ValidationError('roll.id must match the roll being updated');
    }

    const updated = await updateRollData(roomId, rollId, roll, identity.sub);
    if (updated) {
      return res.status(200).json({ roll: toRoomRoll(updated, identity.sub) });
    }

    const existing = await findRoll(roomId, rollId);
    throw existing ? new ForbiddenError('not your roll') : new NotFoundError('roll not found');
  },
});
