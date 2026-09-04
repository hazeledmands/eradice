import { useState, useCallback, useRef, useEffect } from 'react';
import { api, ApiError } from '../lib/apiClient';
import { generateSlug } from '../lib/slug';
import { useIdentity } from './useIdentity';
import { withAsyncSpan } from '../lib/tracing';
import type { Roll, RoomRoll, RollVisibility } from '../dice/types';

/**
 * Shared-room state.
 *
 * Was a Supabase Realtime channel carrying postgres_changes plus presence;
 * it is now an EventSource against `/api/rooms/:id/stream` and ordinary POSTs
 * for mutations. The public shape of this hook is unchanged so the components
 * above it did not have to move.
 *
 * Two things the browser used to do are gone because the server does them now:
 * reconnect backoff (EventSource reconnects on its own) and presence tracking
 * (the stream heartbeats it).
 */

const ROOM_ROLLS_PAGE_SIZE = 10;
const MAX_LOADED_ROOM_ROLLS = 30;

interface RoomState {
  id: string;
  slug: string;
}

export interface PresenceUser {
  nickname: string;
  online_at: string;
}

/** A roll as the API returns it, carrying the paging cursor. */
type ApiRoll = RoomRoll & { _cursor: string };

interface RollsResponse {
  rolls: ApiRoll[];
  hasMore: boolean;
}

const cursorOf = (roll: RoomRoll): string | null =>
  (roll as ApiRoll)._cursor ?? null;

export function useRoom() {
  const { userId, isReady: identityReady } = useIdentity();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [roomRolls, setRoomRolls] = useState<RoomRoll[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [hasOlderRolls, setHasOlderRolls] = useState(false);
  const [hasNewerRolls, setHasNewerRolls] = useState(false);
  const [isLoadingOlderRolls, setIsLoadingOlderRolls] = useState(false);
  const [isLoadingNewerRolls, setIsLoadingNewerRolls] = useState(false);

  const sourceRef = useRef<EventSource | null>(null);
  const joinOpRef = useRef(0);
  const roomRef = useRef<RoomState | null>(null);
  const nicknameRef = useRef<string>('');
  const oldestCursorRef = useRef<string | null>(null);
  const newestCursorRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setIsConnected(false);
    setPresenceUsers([]);
  }, []);

  /** Applies a page of rolls, keeping the loaded window bounded at both ends. */
  const applyPage = useCallback(
    (incoming: ApiRoll[], edge: 'older' | 'newer') => {
      setRoomRolls((prev) => {
        const existing = new Set(prev.map((r) => r.id));
        const deduped = incoming.filter((r) => !existing.has(r.id));
        if (deduped.length === 0) return prev;

        const next = edge === 'older' ? [...deduped, ...prev] : [...prev, ...deduped];

        if (next.length <= MAX_LOADED_ROOM_ROLLS) {
          oldestCursorRef.current = cursorOf(next[0]) ?? oldestCursorRef.current;
          newestCursorRef.current = cursorOf(next[next.length - 1]) ?? newestCursorRef.current;
          return next;
        }

        // Trim from the far end so the direction being scrolled stays loaded,
        // and flag that there is now more to fetch back the other way.
        const trimmed =
          edge === 'older'
            ? next.slice(0, MAX_LOADED_ROOM_ROLLS)
            : next.slice(next.length - MAX_LOADED_ROOM_ROLLS);

        oldestCursorRef.current = cursorOf(trimmed[0]) ?? oldestCursorRef.current;
        newestCursorRef.current =
          cursorOf(trimmed[trimmed.length - 1]) ?? newestCursorRef.current;

        if (edge === 'older') setHasNewerRolls(true);
        else setHasOlderRolls(true);
        return trimmed;
      });
    },
    []
  );

  const fetchRecentRolls = useCallback(async (roomId: string) => {
    return withAsyncSpan('room.fetch_recent_rolls', { 'room.id': roomId }, async () => {
      const { rolls, hasMore } = await api.get<RollsResponse>(
        `/api/rooms/${roomId}/rolls?limit=${ROOM_ROLLS_PAGE_SIZE}`
      );

      if (rolls.length === 0) {
        oldestCursorRef.current = null;
        newestCursorRef.current = null;
        setRoomRolls([]);
        setHasOlderRolls(false);
        setHasNewerRolls(false);
        return;
      }

      oldestCursorRef.current = rolls[0]._cursor;
      newestCursorRef.current = rolls[rolls.length - 1]._cursor;
      setRoomRolls(rolls);
      setHasOlderRolls(hasMore);
      setHasNewerRolls(false);
    });
  }, []);

  const loadOlderRolls = useCallback(async () => {
    const current = roomRef.current;
    if (!current || !oldestCursorRef.current || isLoadingOlderRolls || !hasOlderRolls) return;

    setIsLoadingOlderRolls(true);
    try {
      const { rolls, hasMore } = await api.get<RollsResponse>(
        `/api/rooms/${current.id}/rolls?before=${oldestCursorRef.current}&limit=${ROOM_ROLLS_PAGE_SIZE}`
      );
      if (rolls.length === 0) {
        setHasOlderRolls(false);
        return;
      }
      applyPage(rolls, 'older');
      if (!hasMore) setHasOlderRolls(false);
    } catch (err) {
      console.error(`could not load older rolls: ${(err as Error).message}`);
    } finally {
      setIsLoadingOlderRolls(false);
    }
  }, [applyPage, hasOlderRolls, isLoadingOlderRolls]);

  const loadNewerRolls = useCallback(async () => {
    const current = roomRef.current;
    if (!current || !newestCursorRef.current || isLoadingNewerRolls || !hasNewerRolls) return;

    setIsLoadingNewerRolls(true);
    try {
      const { rolls, hasMore } = await api.get<RollsResponse>(
        `/api/rooms/${current.id}/rolls?after=${newestCursorRef.current}&limit=${ROOM_ROLLS_PAGE_SIZE}`
      );
      if (rolls.length === 0) {
        setHasNewerRolls(false);
        return;
      }
      applyPage(rolls, 'newer');
      if (!hasMore) setHasNewerRolls(false);
    } catch (err) {
      console.error(`could not load newer rolls: ${(err as Error).message}`);
    } finally {
      setIsLoadingNewerRolls(false);
    }
  }, [applyPage, hasNewerRolls, isLoadingNewerRolls]);

  const snapToRecentRolls = useCallback(async () => {
    const current = roomRef.current;
    if (!current || isLoadingOlderRolls || isLoadingNewerRolls) return;
    await fetchRecentRolls(current.id);
  }, [fetchRecentRolls, isLoadingNewerRolls, isLoadingOlderRolls]);

  /**
   * Opens the event stream.
   *
   * No manual reconnect loop: EventSource retries on its own, and `onopen`
   * re-syncs history so anything missed while disconnected is picked up. That
   * replaces the hand-rolled backoff the Supabase channel needed.
   */
  const subscribeToRoom = useCallback(
    (roomData: RoomState, nickname: string) => {
      const source = new EventSource(
        `/api/rooms/${roomData.id}/stream?nickname=${encodeURIComponent(nickname)}`
      );

      source.addEventListener('open', () => {
        // Only re-sync on a *re*-connection; the initial fetch already ran.
        if (sourceRef.current === source && isConnected) {
          void fetchRecentRolls(roomData.id);
        }
      });

      source.addEventListener('ready', () => setIsConnected(true));

      source.addEventListener('roll', (event) => {
        const incoming = JSON.parse((event as MessageEvent).data) as ApiRoll;
        setRoomRolls((prev) => {
          if (prev.some((r) => r.id === incoming.id)) return prev;
          const next = [...prev, incoming];
          newestCursorRef.current = incoming._cursor;
          if (next.length <= MAX_LOADED_ROOM_ROLLS) return next;
          setHasOlderRolls(true);
          return next.slice(next.length - MAX_LOADED_ROOM_ROLLS);
        });
      });

      source.addEventListener('roll_updated', (event) => {
        const incoming = JSON.parse((event as MessageEvent).data) as ApiRoll;
        setRoomRolls((prev) =>
          prev.map((r) => {
            if (r.id !== incoming.id) return r;
            // A CP spend changes the dice; animate those. A reveal only flips
            // a flag and must not restart the animation.
            if (incoming.dice.length !== r.dice.length) {
              return { ...r, dice: incoming.dice, shouldAnimate: true };
            }
            if ((incoming.isRevealed ?? false) === (r.isRevealed ?? false)) return r;
            return { ...r, isRevealed: incoming.isRevealed ?? false, shouldAnimate: false };
          })
        );
      });

      source.addEventListener('presence', (event) => {
        setPresenceUsers(JSON.parse((event as MessageEvent).data) as PresenceUser[]);
      });

      // Comments live in useRollComments, but the room has exactly one stream.
      // Relaying them on window lets that hook stay independent without
      // opening a second EventSource for the same room.
      const relayComment = (type: string) => (event: Event) => {
        const data = JSON.parse((event as MessageEvent).data);
        window.dispatchEvent(
          new CustomEvent('eradice:comment', {
            detail:
              type === 'comment_deleted'
                ? { type, id: data.id as string }
                : { type, comment: data },
          })
        );
      };
      source.addEventListener('comment', relayComment('comment'));
      source.addEventListener('comment_updated', relayComment('comment_updated'));
      source.addEventListener('comment_deleted', relayComment('comment_deleted'));

      source.addEventListener('error', () => {
        // EventSource sets readyState to CONNECTING while it retries and CLOSED
        // only when it has given up.
        setIsConnected(false);
        if (source.readyState === EventSource.CLOSED) {
          setError('Lost connection to the room');
        }
      });

      sourceRef.current = source;
    },
    [fetchRecentRolls, isConnected]
  );

  const joinRoom = useCallback(
    async (slug: string) => {
      return withAsyncSpan('room.join', { 'room.slug': slug }, async (span) => {
        const opId = ++joinOpRef.current;
        const isStale = () => opId !== joinOpRef.current;

        setError(null);
        setIsJoining(true);
        cleanup();

        try {
          const { room: roomData } = await api.post<{ room: RoomState }>('/api/rooms', { slug });
          if (isStale()) return;

          span.setAttribute('room.id', roomData.id);
          setRoom(roomData);
          roomRef.current = roomData;

          await fetchRecentRolls(roomData.id);
          if (isStale()) return;

          subscribeToRoom(roomData, nicknameRef.current);
        } catch (err) {
          if (!isStale()) {
            setError(
              err instanceof ApiError && err.isUnauthorized
                ? 'Your session expired — reload the page'
                : 'Failed to join room'
            );
          }
          span.recordException(err as Error);
        } finally {
          if (!isStale()) setIsJoining(false);
        }
      });
    },
    [cleanup, fetchRecentRolls, subscribeToRoom]
  );

  const createRoom = useCallback(async (): Promise<string | null> => {
    const slug = generateSlug();
    await joinRoom(slug);
    return slug;
  }, [joinRoom]);

  const broadcastRoll = useCallback(
    async (roll: Roll, nickname: string, visibility: RollVisibility = 'shared') => {
      const current = roomRef.current;
      if (!current) return;

      return withAsyncSpan(
        'room.broadcast_roll',
        {
          'room.id': current.id,
          'roll.notation': roll.text,
          'roll.visibility': visibility,
          'roll.dice_count': roll.dice.length,
        },
        async () => {
          // Optimistic, as before: the roll appears immediately and the stream
          // echo is deduplicated by id.
          setRoomRolls((prev) => [
            ...prev,
            { ...roll, nickname, isLocal: true, shouldAnimate: true, visibility, isRevealed: false },
          ]);

          try {
            await api.post(`/api/rooms/${current.id}/rolls`, { roll, nickname, visibility });
          } catch (err) {
            setRoomRolls((prev) => prev.filter((r) => r.id !== roll.id));
            setError('Your roll could not be shared');
            throw err;
          }
        }
      );
    },
    []
  );

  const revealRoll = useCallback(async (rollId: number) => {
    const current = roomRef.current;
    if (!current) return;

    return withAsyncSpan('room.reveal_roll', { 'room.id': current.id, 'roll.id': rollId }, async () => {
      setRoomRolls((prev) =>
        prev.map((r) => (r.id === rollId ? { ...r, isRevealed: true, shouldAnimate: false } : r))
      );
      try {
        await api.post(`/api/rooms/${current.id}/rolls/${rollId}/reveal`);
      } catch (err) {
        setRoomRolls((prev) =>
          prev.map((r) => (r.id === rollId ? { ...r, isRevealed: false } : r))
        );
        throw err;
      }
    });
  }, []);

  const broadcastCpSpend = useCallback(async (rollId: number, updatedRoll: Roll) => {
    const current = roomRef.current;
    if (!current) return;

    return withAsyncSpan(
      'room.broadcast_cp_spend',
      { 'room.id': current.id, 'roll.id': rollId, 'roll.dice_count': updatedRoll.dice.length },
      async () => {
        setRoomRolls((prev) =>
          prev.map((r) => (r.id === rollId ? { ...r, dice: updatedRoll.dice, shouldAnimate: true } : r))
        );
        await api.post(`/api/rooms/${current.id}/rolls/${rollId}/cp`, { roll: updatedRoll });
      }
    );
  }, []);

  const leaveRoom = useCallback(() => {
    const current = roomRef.current;
    cleanup();
    // Best effort: presence also ages out on its own once heartbeats stop.
    if (current) void api.del(`/api/rooms/${current.id}/presence`).catch(() => {});

    setRoom(null);
    roomRef.current = null;
    oldestCursorRef.current = null;
    newestCursorRef.current = null;
    setRoomRolls([]);
    setHasOlderRolls(false);
    setHasNewerRolls(false);
    setIsLoadingOlderRolls(false);
    setIsLoadingNewerRolls(false);
    setError(null);
    setIsJoining(false);
  }, [cleanup]);

  const updatePresenceNickname = useCallback(async (newNickname: string) => {
    nicknameRef.current = newNickname;
    const current = roomRef.current;
    if (!current || !isConnected) return;
    try {
      await api.post(`/api/rooms/${current.id}/presence`, { nickname: newNickname });
    } catch (err) {
      console.error(`could not update nickname: ${(err as Error).message}`);
    }
  }, [isConnected]);

  useEffect(() => cleanup, [cleanup]);

  return {
    room,
    roomRolls,
    isConnected,
    isJoining,
    identityReady,
    error,
    presenceUsers,
    userId,
    createRoom,
    joinRoom,
    broadcastRoll,
    revealRoll,
    broadcastCpSpend,
    hasOlderRolls,
    hasNewerRolls,
    isLoadingOlderRolls,
    isLoadingNewerRolls,
    loadOlderRolls,
    loadNewerRolls,
    snapToRecentRolls,
    leaveRoom,
    updatePresenceNickname,
  };
}
