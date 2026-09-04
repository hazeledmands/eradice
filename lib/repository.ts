import { query, transaction } from './db';
import type { Roll, RollVisibility } from '../dice/types';

/**
 * Every statement eradice runs, in one place.
 *
 * These replace the PostgREST calls the browser used to make directly. Two
 * things moved in with them:
 *
 *   * Authorization. The old RLS policies allowed an update when
 *     `auth.uid() = user_id OR user_id IS NULL`; that rule is preserved
 *     verbatim in the WHERE clauses below, so pre-identity rows stay editable
 *     and everything else is owner-only.
 *   * Ordering and paging. The hooks' keyset paging is preserved in shape but
 *     re-keyed from `created_at` onto the monotonic `id` — see the note above
 *     listRecentRolls for why the old cursor was not a total order.
 */

export interface RoomRecord {
  id: string;
  slug: string;
}

export interface RollRow {
  id: string;
  room_id: string;
  roll_id: string;
  user_nickname: string;
  roll_data: Roll;
  visibility: RollVisibility;
  is_revealed: boolean;
  user_id: string | null;
  created_at: string;
}

export interface CommentRow {
  id: string;
  room_id: string;
  roll_id: string;
  text: string;
  author_nickname: string;
  author_id: string | null;
  created_at: string;
  updated_at: string | null;
}

/* ── rooms ─────────────────────────────────────────────────────────────── */

/**
 * Get-or-create by slug, in one statement.
 *
 * The old client did select-then-insert and caught the unique violation by
 * retrying the select, because two browsers joining a fresh room raced. The
 * upsert collapses that into a single atomic round trip; `DO NOTHING` cannot
 * return the existing row, so the conflict path falls through to the select.
 */
export async function getOrCreateRoom(slug: string): Promise<RoomRecord> {
  const inserted = await query<RoomRecord>(
    `INSERT INTO rooms (slug) VALUES ($1)
     ON CONFLICT (slug) DO NOTHING
     RETURNING id, slug`,
    [slug]
  );
  if (inserted.length > 0) return inserted[0];

  const existing = await query<RoomRecord>('SELECT id, slug FROM rooms WHERE slug = $1', [slug]);
  if (existing.length === 0) throw new Error(`room "${slug}" vanished between insert and select`);
  return existing[0];
}

export async function findRoomById(id: string): Promise<RoomRecord | null> {
  const rows = await query<RoomRecord>('SELECT id, slug FROM rooms WHERE id = $1', [id]);
  return rows[0] ?? null;
}

/* ── rolls ─────────────────────────────────────────────────────────────── */

const ROLL_COLUMNS = `id, room_id, roll_id, user_nickname, roll_data,
                      visibility, is_revealed, user_id, created_at`;

/**
 * Paging is keyed on `id`, not `created_at`.
 *
 * The Supabase client paged on `created_at`, which is only a total order when
 * no two inserts share a timestamp — and `NOW()` is transaction-start time, so
 * rolls landing in the same clock tick genuinely tie. Ordering was then
 * arbitrary among tied rows and a `>` cursor could skip or repeat them. `id`
 * is `GENERATED ALWAYS AS IDENTITY`: strictly monotonic, unique, already the
 * primary key, and preserved by a data-only restore, so it is both the correct
 * sort key and the cheapest one. `created_at` remains for display.
 */
export function listRecentRolls(roomId: string, limit: number): Promise<RollRow[]> {
  return query<RollRow>(
    `SELECT ${ROLL_COLUMNS} FROM room_rolls
     WHERE room_id = $1
     ORDER BY id DESC
     LIMIT $2`,
    [roomId, limit]
  );
}

export function listRollsBefore(roomId: string, cursor: string, limit: number): Promise<RollRow[]> {
  return query<RollRow>(
    `SELECT ${ROLL_COLUMNS} FROM room_rolls
     WHERE room_id = $1 AND id < $2
     ORDER BY id DESC
     LIMIT $3`,
    [roomId, cursor, limit]
  );
}

export function listRollsAfter(roomId: string, cursor: string, limit: number): Promise<RollRow[]> {
  return query<RollRow>(
    `SELECT ${ROLL_COLUMNS} FROM room_rolls
     WHERE room_id = $1 AND id > $2
     ORDER BY id ASC
     LIMIT $3`,
    [roomId, cursor, limit]
  );
}

export async function findRoll(roomId: string, rollId: number): Promise<RollRow | null> {
  const rows = await query<RollRow>(
    `SELECT ${ROLL_COLUMNS} FROM room_rolls WHERE room_id = $1 AND roll_id = $2`,
    [roomId, rollId]
  );
  return rows[0] ?? null;
}

export interface InsertRollInput {
  roomId: string;
  roll: Roll;
  nickname: string;
  visibility: RollVisibility;
  userId: string;
}

/**
 * Inserts a roll, ignoring a replay of one already recorded.
 *
 * The client sends its optimistic roll once, but a retry after a dropped
 * response would otherwise duplicate it — the old code deduplicated on the
 * client by roll id, which did nothing for the stored row.
 */
export async function insertRoll(input: InsertRollInput): Promise<RollRow | null> {
  const rows = await query<RollRow>(
    `INSERT INTO room_rolls (room_id, roll_id, user_nickname, roll_data, visibility, user_id)
     SELECT $1, $2, $3, $4, $5, $6
     WHERE NOT EXISTS (
       SELECT 1 FROM room_rolls WHERE room_id = $1 AND roll_id = $2
     )
     RETURNING ${ROLL_COLUMNS}`,
    [input.roomId, input.roll.id, input.nickname, input.roll, input.visibility, input.userId]
  );
  return rows[0] ?? null;
}

/** Ownership rule carried over from the owner_update_reveal RLS policy. */
const OWNED_BY = `(user_id = $3 OR user_id IS NULL)`;

export async function revealRoll(
  roomId: string,
  rollId: number,
  userId: string
): Promise<RollRow | null> {
  const rows = await query<RollRow>(
    `UPDATE room_rolls SET is_revealed = true
     WHERE room_id = $1 AND roll_id = $2 AND ${OWNED_BY}
     RETURNING ${ROLL_COLUMNS}`,
    [roomId, rollId, userId]
  );
  return rows[0] ?? null;
}

export async function updateRollData(
  roomId: string,
  rollId: number,
  roll: Roll,
  userId: string
): Promise<RollRow | null> {
  const rows = await query<RollRow>(
    `UPDATE room_rolls SET roll_data = $4
     WHERE room_id = $1 AND roll_id = $2 AND ${OWNED_BY}
     RETURNING ${ROLL_COLUMNS}`,
    [roomId, rollId, userId, roll]
  );
  return rows[0] ?? null;
}

/* ── comments ──────────────────────────────────────────────────────────── */

const COMMENT_COLUMNS = `id, room_id, roll_id, text, author_nickname,
                         author_id, created_at, updated_at`;

export function listComments(roomId: string, limit: number): Promise<CommentRow[]> {
  return query<CommentRow>(
    `SELECT ${COMMENT_COLUMNS} FROM roll_comments
     WHERE room_id = $1
     ORDER BY created_at ASC, id ASC
     LIMIT $2`,
    [roomId, limit]
  );
}

export interface InsertCommentInput {
  roomId: string;
  rollId: number;
  text: string;
  nickname: string;
  authorId: string;
}

export async function insertComment(input: InsertCommentInput): Promise<CommentRow> {
  const rows = await query<CommentRow>(
    `INSERT INTO roll_comments (room_id, roll_id, text, author_nickname, author_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COMMENT_COLUMNS}`,
    [input.roomId, input.rollId, input.text, input.nickname, input.authorId]
  );
  return rows[0];
}

export async function updateComment(
  id: string,
  roomId: string,
  text: string,
  authorId: string
): Promise<CommentRow | null> {
  const rows = await query<CommentRow>(
    `UPDATE roll_comments SET text = $4, updated_at = NOW()
     WHERE id = $1 AND room_id = $2 AND (author_id = $3 OR author_id IS NULL)
     RETURNING ${COMMENT_COLUMNS}`,
    [id, roomId, authorId, text]
  );
  return rows[0] ?? null;
}

export async function deleteComment(
  id: string,
  roomId: string,
  authorId: string
): Promise<CommentRow | null> {
  const rows = await query<CommentRow>(
    `DELETE FROM roll_comments
     WHERE id = $1 AND room_id = $2 AND (author_id = $3 OR author_id IS NULL)
     RETURNING ${COMMENT_COLUMNS}`,
    [id, roomId, authorId]
  );
  return rows[0] ?? null;
}

export async function findComment(id: string, roomId: string): Promise<CommentRow | null> {
  const rows = await query<CommentRow>(
    `SELECT ${COMMENT_COLUMNS} FROM roll_comments WHERE id = $1 AND room_id = $2`,
    [id, roomId]
  );
  return rows[0] ?? null;
}

/** Exported for the tests that need a clean slate; never called by the app. */
export async function truncateAll(): Promise<void> {
  await transaction(async (client) => {
    await client.query('TRUNCATE TABLE roll_comments, room_rolls, rooms RESTART IDENTITY CASCADE');
  });
}

/* ── presence ──────────────────────────────────────────────────────────── */

/**
 * How long a presence row stays live without a heartbeat. Comfortably more
 * than two heartbeat intervals, so one missed beat on a slow connection does
 * not flicker someone out of the room.
 */
export const PRESENCE_TTL_SECONDS = 60;

export interface PresenceRow {
  user_id: string;
  nickname: string;
  last_seen: string;
}

/**
 * Announces or refreshes a viewer's presence.
 *
 * Called once when a stream opens and then on every heartbeat. The nickname is
 * updated in place, which is what makes a rename propagate — and the trigger
 * only fires on a genuine change, so heartbeats are silent.
 */
export async function markPresent(
  roomId: string,
  userId: string,
  nickname: string
): Promise<void> {
  await query(
    `INSERT INTO room_presence (room_id, user_id, nickname, last_seen)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (room_id, user_id)
     DO UPDATE SET nickname = EXCLUDED.nickname, last_seen = NOW()`,
    [roomId, userId, nickname]
  );
}

export async function markAbsent(roomId: string, userId: string): Promise<void> {
  await query('DELETE FROM room_presence WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
}

/** Live viewers only; rows that stopped heartbeating age out of this filter. */
export function listPresence(roomId: string): Promise<PresenceRow[]> {
  return query<PresenceRow>(
    `SELECT user_id, nickname, last_seen FROM room_presence
     WHERE room_id = $1 AND last_seen > NOW() - ($2 || ' seconds')::interval
     ORDER BY last_seen DESC`,
    [roomId, String(PRESENCE_TTL_SECONDS)]
  );
}
