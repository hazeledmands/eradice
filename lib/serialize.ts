import type { RollRow, CommentRow, PresenceRow } from './repository';
import type { RoomRoll, RollComment } from '../dice/types';

/**
 * Database rows to the shapes the client already renders.
 *
 * These deliberately produce exactly what the hooks used to assemble inline
 * from PostgREST rows, so the components below them did not have to change.
 * The one addition is `_cursor`, the row id used for keyset paging — it
 * replaces the `_createdAt` timestamp the old cursor logic carried.
 */

export interface SerializedRoll extends RoomRoll {
  /** `room_rolls.id`, the paging cursor. Not for display. */
  _cursor: string;
}

export function toRoomRoll(row: RollRow, viewerSub: string): SerializedRoll {
  return {
    ...row.roll_data,
    nickname: row.user_nickname,
    isLocal: row.user_id === viewerSub,
    // History is never animated; only events arriving live are. The stream
    // sets this explicitly, so the default here is the quiet one.
    shouldAnimate: false,
    visibility: row.visibility ?? 'shared',
    isRevealed: row.is_revealed ?? false,
    _cursor: row.id,
  };
}

export function toRollComment(row: CommentRow): RollComment {
  return {
    id: row.id,
    rollId: Number(row.roll_id),
    text: row.text,
    visibility: 'public',
    authorNickname: row.author_nickname,
    authorId: row.author_id ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

export interface SerializedPresence {
  nickname: string;
  online_at: string;
}

export function toPresence(row: PresenceRow): SerializedPresence {
  return { nickname: row.nickname, online_at: new Date(row.last_seen).toISOString() };
}
