import { route, jsonBody, requireQueryParam, NotFoundError, ForbiddenError }
  from '../../../../../lib/api';
import { parseUuid, parseCommentText } from '../../../../../lib/validation';
import { updateComment, deleteComment, findComment } from '../../../../../lib/repository';
import { toRollComment } from '../../../../../lib/serialize';

/**
 * Edit or delete one comment. Author-only, enforced in the WHERE clause — the
 * owner_update_comment / owner_delete_comment policies, moved into SQL here.
 */
async function reject(commentId: string, roomId: string): Promise<never> {
  const existing = await findComment(commentId, roomId);
  throw existing ? new ForbiddenError('not your comment') : new NotFoundError('comment not found');
}

export default route({
  PATCH: async ({ req, res, identity }) => {
    const roomId = parseUuid(requireQueryParam(req, 'roomId'), 'roomId');
    const commentId = parseUuid(requireQueryParam(req, 'commentId'), 'commentId');
    const text = parseCommentText(jsonBody(req).text);

    const updated = await updateComment(commentId, roomId, text, identity.sub);
    if (!updated) await reject(commentId, roomId);
    res.status(200).json({ comment: toRollComment(updated!) });
  },

  DELETE: async ({ req, res, identity }) => {
    const roomId = parseUuid(requireQueryParam(req, 'roomId'), 'roomId');
    const commentId = parseUuid(requireQueryParam(req, 'commentId'), 'commentId');

    const deleted = await deleteComment(commentId, roomId, identity.sub);
    if (!deleted) await reject(commentId, roomId);
    res.status(204).end();
  },
});
