import { route, jsonBody, requireQueryParam, queryParam, NotFoundError }
  from '../../../../../lib/api';
import { parseUuid, parseLimit, parseRollId, parseCommentText, parseNickname }
  from '../../../../../lib/validation';
import { findRoomById, listComments, insertComment } from '../../../../../lib/repository';
import { toRollComment } from '../../../../../lib/serialize';

/**
 * Public comments for a room. Private comments never reach the server — they
 * stay in the browser's localStorage exactly as before.
 */
const MAX_INITIAL_COMMENTS = 500;

export default route({
  GET: async ({ req, res }) => {
    const roomId = parseUuid(requireQueryParam(req, 'roomId'), 'roomId');
    const limit = parseLimit(queryParam(req, 'limit'), MAX_INITIAL_COMMENTS);
    const rows = await listComments(roomId, limit);
    res.status(200).json({ comments: rows.map(toRollComment) });
  },

  POST: async ({ req, res, identity }) => {
    const roomId = parseUuid(requireQueryParam(req, 'roomId'), 'roomId');
    if (!(await findRoomById(roomId))) throw new NotFoundError('room not found');

    const body = jsonBody(req);
    const comment = await insertComment({
      roomId,
      rollId: parseRollId(body.rollId),
      text: parseCommentText(body.text),
      nickname: parseNickname(body.nickname),
      authorId: identity.sub,
    });
    res.status(201).json({ comment: toRollComment(comment) });
  },
});
