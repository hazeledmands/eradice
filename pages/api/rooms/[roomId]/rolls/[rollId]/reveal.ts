import { route, requireQueryParam, NotFoundError, ForbiddenError }
  from '../../../../../../lib/api';
import { parseUuid, parseRollId } from '../../../../../../lib/validation';
import { revealRoll, findRoll } from '../../../../../../lib/repository';
import { toRoomRoll } from '../../../../../../lib/serialize';
import { RATE_LIMITS } from '../../../../../../lib/ratelimit';

/**
 * Reveal a secret roll. Owner-only, enforced in the UPDATE's WHERE clause —
 * the same rule the owner_update_reveal RLS policy used to apply.
 */
export default route({
  rateLimit: RATE_LIMITS.mutate,
  POST: async ({ req, res, identity }) => {
    const roomId = parseUuid(requireQueryParam(req, 'roomId'), 'roomId');
    const rollId = parseRollId(requireQueryParam(req, 'rollId'));

    const updated = await revealRoll(roomId, rollId, identity.sub);
    if (updated) {
      return res.status(200).json({ roll: toRoomRoll(updated, identity.sub) });
    }

    // No row updated: either it does not exist, or it is not this user's.
    // Distinguish the two rather than returning a misleading 404.
    const existing = await findRoll(roomId, rollId);
    throw existing ? new ForbiddenError('not your roll') : new NotFoundError('roll not found');
  },
});
