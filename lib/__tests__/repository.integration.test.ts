/**
 * @jest-environment node
 *
 * Exercises every statement against a real PostgreSQL, because the things most
 * likely to be wrong here — the ownership WHERE clauses, keyset paging
 * boundaries, the upsert race, JSONB round-tripping — are exactly the things a
 * mocked client would happily agree with.
 *
 * Skipped unless TEST_DATABASE_URL is set, so `yarn test` stays hermetic:
 *
 *   docker run -d --rm -e POSTGRES_PASSWORD=test -e POSTGRES_DB=eradice \
 *     -p 55432:5432 postgres:16-alpine
 *   TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/eradice \
 *     yarn test repository.integration
 */
import { closePool } from '../db';
import {
  getOrCreateRoom,
  findRoomById,
  insertRoll,
  listRecentRolls,
  listRollsBefore,
  listRollsAfter,
  findRoll,
  revealRoll,
  updateRollData,
  insertComment,
  listComments,
  updateComment,
  deleteComment,
  truncateAll,
} from '../repository';
import type { Roll } from '../../dice/types';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

if (url) process.env.DATABASE_URL = url;

const ME = 'cf-sub-me';
const THEM = 'cf-sub-them';

function roll(id: number, text = '3d6'): Roll {
  return { id, text, dice: [{ id: 1, finalNumber: 4 }], diceCount: 3, modifier: 0,
           date: new Date(id).toISOString() };
}

describeDb('repository', () => {
  let room: { id: string; slug: string };

  beforeEach(async () => {
    await truncateAll();
    room = await getOrCreateRoom('test-room');
  });

  afterAll(async () => {
    await closePool();
  });

  describe('rooms', () => {
    it('creates a room on first request and returns the same one after', async () => {
      const again = await getOrCreateRoom('test-room');
      expect(again.id).toBe(room.id);
    });

    it('does not race when two clients join a fresh room at once', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, () => getOrCreateRoom('contended-room'))
      );
      const ids = new Set(results.map((r) => r.id));
      expect(ids.size).toBe(1);
    });

    it('finds a room by id', async () => {
      expect(await findRoomById(room.id)).toMatchObject({ slug: 'test-room' });
    });

    it('returns null for an unknown room', async () => {
      expect(await findRoomById('00000000-0000-0000-0000-000000000000')).toBeNull();
    });
  });

  describe('rolls', () => {
    it('round-trips a roll including its JSONB payload', async () => {
      const inserted = await insertRoll({
        roomId: room.id, roll: roll(1000), nickname: 'hazel',
        visibility: 'shared', userId: ME,
      });
      expect(inserted).not.toBeNull();
      expect(inserted!.roll_data).toEqual(roll(1000));
      expect(inserted!.user_id).toBe(ME);
      expect(inserted!.is_revealed).toBe(false);
      expect(inserted!.visibility).toBe('shared');
    });

    it('ignores a replayed insert of the same roll id', async () => {
      await insertRoll({ roomId: room.id, roll: roll(1000), nickname: 'hazel',
                         visibility: 'shared', userId: ME });
      const replay = await insertRoll({ roomId: room.id, roll: roll(1000), nickname: 'hazel',
                                        visibility: 'shared', userId: ME });
      expect(replay).toBeNull();
      expect(await listRecentRolls(room.id, 10)).toHaveLength(1);
    });

    it('returns the newest page newest-first', async () => {
      for (const id of [1000, 2000, 3000]) {
        await insertRoll({ roomId: room.id, roll: roll(id), nickname: 'hazel',
                           visibility: 'shared', userId: ME });
      }
      const rows = await listRecentRolls(room.id, 2);
      expect(rows.map((r) => Number(r.roll_id))).toEqual([3000, 2000]);
    });

    it('pages backwards and forwards across the same cursor without overlap', async () => {
      for (const id of [1000, 2000, 3000, 4000]) {
        await insertRoll({ roomId: room.id, roll: roll(id), nickname: 'hazel',
                           visibility: 'shared', userId: ME });
      }
      const page = await listRecentRolls(room.id, 2);          // 4000, 3000
      expect(page.map((r) => Number(r.roll_id))).toEqual([4000, 3000]);

      const oldest = page[page.length - 1].id;
      const older = await listRollsBefore(room.id, oldest, 10); // 2000, 1000
      expect(older.map((r) => Number(r.roll_id))).toEqual([2000, 1000]);

      // Nothing is newer than the newest row.
      expect(await listRollsAfter(room.id, page[0].id, 10)).toEqual([]);

      // Walking forward from the oldest row returns the rest in order, with no
      // repeat of the cursor row itself.
      const fromOldest = await listRollsAfter(room.id, older[older.length - 1].id, 10);
      expect(fromOldest.map((r) => Number(r.roll_id))).toEqual([2000, 3000, 4000]);
    });

    it('scopes rolls to their own room', async () => {
      const other = await getOrCreateRoom('other-room');
      await insertRoll({ roomId: other.id, roll: roll(9000), nickname: 'someone',
                         visibility: 'shared', userId: THEM });
      expect(await listRecentRolls(room.id, 10)).toEqual([]);
      expect(await listRecentRolls(other.id, 10)).toHaveLength(1);
    });

    it('reveals a roll for its owner', async () => {
      await insertRoll({ roomId: room.id, roll: roll(1000), nickname: 'hazel',
                         visibility: 'secret', userId: ME });
      const revealed = await revealRoll(room.id, 1000, ME);
      expect(revealed!.is_revealed).toBe(true);
    });

    it('refuses to reveal another user\'s roll', async () => {
      await insertRoll({ roomId: room.id, roll: roll(1000), nickname: 'hazel',
                         visibility: 'secret', userId: ME });
      expect(await revealRoll(room.id, 1000, THEM)).toBeNull();
      expect((await findRoll(room.id, 1000))!.is_revealed).toBe(false);
    });

    it('still allows editing a legacy row with no owner, as the old RLS policy did', async () => {
      await insertRoll({ roomId: room.id, roll: roll(1000), nickname: 'old',
                         visibility: 'secret', userId: null as unknown as string });
      expect(await revealRoll(room.id, 1000, THEM)).not.toBeNull();
    });

    it('updates roll data for a CP spend by the owner only', async () => {
      await insertRoll({ roomId: room.id, roll: roll(1000), nickname: 'hazel',
                         visibility: 'shared', userId: ME });
      const spent = { ...roll(1000), dice: [{ id: 1, finalNumber: 4 }, { id: 2, isCpDie: true }] };

      expect(await updateRollData(room.id, 1000, spent, THEM)).toBeNull();

      const updated = await updateRollData(room.id, 1000, spent, ME);
      expect(updated!.roll_data.dice).toHaveLength(2);
    });
  });

  describe('comments', () => {
    async function addComment(text = 'nice roll', author = ME) {
      return insertComment({ roomId: room.id, rollId: 1000, text,
                             nickname: 'hazel', authorId: author });
    }

    it('round-trips a comment', async () => {
      const c = await addComment();
      expect(c).toMatchObject({ text: 'nice roll', author_id: ME, updated_at: null });
    });

    it('lists a room\'s comments oldest-first', async () => {
      await addComment('first');
      await addComment('second');
      const rows = await listComments(room.id, 10);
      expect(rows.map((r) => r.text)).toEqual(['first', 'second']);
    });

    it('edits only the author\'s own comment, and stamps updated_at', async () => {
      const c = await addComment();
      expect(await updateComment(c.id, room.id, 'edited', THEM)).toBeNull();

      const edited = await updateComment(c.id, room.id, 'edited', ME);
      expect(edited!.text).toBe('edited');
      expect(edited!.updated_at).not.toBeNull();
    });

    it('deletes only the author\'s own comment', async () => {
      const c = await addComment();
      expect(await deleteComment(c.id, room.id, THEM)).toBeNull();
      expect(await deleteComment(c.id, room.id, ME)).not.toBeNull();
      expect(await listComments(room.id, 10)).toEqual([]);
    });

    it('will not edit a comment through the wrong room', async () => {
      const other = await getOrCreateRoom('other-room');
      const c = await addComment();
      expect(await updateComment(c.id, other.id, 'edited', ME)).toBeNull();
    });

    it('cascades comments and rolls when a room is deleted', async () => {
      await insertRoll({ roomId: room.id, roll: roll(1000), nickname: 'hazel',
                         visibility: 'shared', userId: ME });
      await addComment();
      await truncateAll();
      expect(await listComments(room.id, 10)).toEqual([]);
    });
  });
});
