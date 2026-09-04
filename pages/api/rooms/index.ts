import { route, jsonBody } from '../../../lib/api';
import { parseSlug } from '../../../lib/validation';
import { getOrCreateRoom } from '../../../lib/repository';

/**
 * Join a room by slug, creating it if it does not exist.
 *
 * POST rather than GET because it may create. The old client did
 * select-then-insert-then-retry here; the race is handled in the repository.
 */
export default route({
  POST: async ({ res, req }) => {
    const slug = parseSlug(jsonBody(req).slug);
    const room = await getOrCreateRoom(slug);
    res.status(200).json({ room });
  },
});
