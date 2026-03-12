import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase, supabaseEnabled } from '../lib/supabase';
import { generateSlug } from '../lib/slug';
import { getBackoffDelay } from '../lib/backoff';
import { useIdentity } from './useIdentity';
import { withAsyncSpan } from '../lib/tracing';
import type { Roll, RoomRoll, RollVisibility } from '../dice/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

const ROOM_ROLLS_PAGE_SIZE = 10;

interface RoomState {
  id: string;
  slug: string;
}

export interface PresenceUser {
  nickname: string;
  online_at: string;
}

export function useRoom() {
  const { userId, isReady: identityReady } = useIdentity();
  const userIdRef = useRef<string | null>(null);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [roomRolls, setRoomRolls] = useState<RoomRoll[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [hasOlderRolls, setHasOlderRolls] = useState(false);
  const [isLoadingOlderRolls, setIsLoadingOlderRolls] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const joinOpRef = useRef(0);
  const roomRef = useRef<RoomState | null>(null);
  const nicknameRef = useRef<string>('');
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const oldestLoadedCreatedAtRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (channelRef.current && supabase) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setIsConnected(false);
    setPresenceUsers([]);
  }, []);

  const mapRoomRows = useCallback((rows: Array<{
    roll_data: Roll;
    user_nickname: string;
    visibility?: string;
    is_revealed?: boolean;
    user_id?: string;
  }>): RoomRoll[] => rows.map((row) => ({
    ...(row.roll_data as Roll),
    nickname: row.user_nickname,
    isLocal: !!userIdRef.current && row.user_id === userIdRef.current,
    shouldAnimate: false,
    visibility: (row.visibility as RollVisibility) || 'shared',
    isRevealed: row.is_revealed || false,
  })), []);

  const fetchRecentRolls = useCallback(async (roomId: string) => {
    if (!supabase) return;
    const sb = supabase;
    return withAsyncSpan('room.fetch_recent_rolls', { 'room.id': roomId }, async (span) => {
      const { data: historyRows } = await sb
        .from('room_rolls')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(ROOM_ROLLS_PAGE_SIZE);

      const rows = historyRows ?? [];
      const oldestRow = rows[rows.length - 1];
      oldestLoadedCreatedAtRef.current = oldestRow?.created_at ?? null;

      const history = mapRoomRows(rows).reverse();
      span.setAttribute('room.recent_rolls_count', history.length);
      span.setAttribute('room.page_size', ROOM_ROLLS_PAGE_SIZE);
      setRoomRolls(history);
      setHasOlderRolls(rows.length === ROOM_ROLLS_PAGE_SIZE);
    });
  }, [mapRoomRows]);

  const loadOlderRolls = useCallback(async () => {
    if (!supabase || !roomRef.current || !oldestLoadedCreatedAtRef.current || isLoadingOlderRolls || !hasOlderRolls) {
      return;
    }

    setIsLoadingOlderRolls(true);
    const sb = supabase;
    const roomId = roomRef.current.id;

    try {
      const { data: olderRows } = await sb
        .from('room_rolls')
        .select('*')
        .eq('room_id', roomId)
        .lt('created_at', oldestLoadedCreatedAtRef.current)
        .order('created_at', { ascending: false })
        .limit(ROOM_ROLLS_PAGE_SIZE);

      const rows = olderRows ?? [];
      if (rows.length === 0) {
        setHasOlderRolls(false);
        return;
      }

      oldestLoadedCreatedAtRef.current = rows[rows.length - 1]?.created_at ?? oldestLoadedCreatedAtRef.current;
      const history = mapRoomRows(rows).reverse();
      setRoomRolls((prev) => {
        const existing = new Set(prev.map((r) => r.id));
        const dedupedHistory = history.filter((r) => !existing.has(r.id));
        return [...dedupedHistory, ...prev];
      });

      if (rows.length < ROOM_ROLLS_PAGE_SIZE) {
        setHasOlderRolls(false);
      }
    } finally {
      setIsLoadingOlderRolls(false);
    }
  }, [hasOlderRolls, isLoadingOlderRolls, mapRoomRows]);

  const subscribeToRoom = useCallback((roomData: RoomState, currentNickname: string) => {
    if (!supabase) return;

    const roomId = roomData.id;
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_rolls',
        },
        (payload) => {
          const row = payload.new as {
            room_id: string;
            roll_id: number;
            user_nickname: string;
            roll_data: Roll;
            visibility?: string;
            is_revealed?: boolean;
            user_id?: string;
          };
          if (row.room_id !== roomId) return;
          const incoming: RoomRoll = {
            ...row.roll_data,
            nickname: row.user_nickname,
            isLocal: !!userIdRef.current && row.user_id === userIdRef.current,
            shouldAnimate: true,
            visibility: (row.visibility as RollVisibility) || 'shared',
            isRevealed: row.is_revealed || false,
          };
          setRoomRolls((prev) => {
            if (prev.some((r) => r.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'room_rolls',
        },
        (payload) => {
          const row = payload.new as {
            room_id: string;
            roll_id: number;
            is_revealed?: boolean;
            roll_data?: Roll;
          };
          if (row.room_id !== roomId) return;
          setRoomRolls((prev) =>
            prev.map((r) => {
              if (r.id !== row.roll_id) return r;
              // CP dice appended: dice count changed
              if (row.roll_data && row.roll_data.dice.length !== r.dice.length) {
                return { ...r, dice: row.roll_data.dice, shouldAnimate: true };
              }
              const isRevealed = row.is_revealed || false;
              // Nothing meaningful changed — return same reference to prevent re-render
              if (isRevealed === (r.isRevealed || false)) {
                return r;
              }
              return { ...r, isRevealed, shouldAnimate: isRevealed ? false : r.shouldAnimate };
            })
          );
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>();
        const users: PresenceUser[] = [];
        for (const key of Object.keys(state)) {
          for (const presence of state[key]) {
            users.push({
              nickname: presence.nickname,
              online_at: presence.online_at,
            });
          }
        }
        setPresenceUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          reconnectAttemptRef.current = 0;
          await channel.track({
            nickname: currentNickname,
            online_at: new Date().toISOString(),
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsConnected(false);
          // Auto-reconnect with exponential backoff + jitter
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          const delay = getBackoffDelay(reconnectAttemptRef.current);
          reconnectAttemptRef.current++;
          reconnectTimerRef.current = setTimeout(() => {
            const currentRoom = roomRef.current;
            if (currentRoom && supabase) {
              // Clean up old channel and re-subscribe
              if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
              }
              // Refresh recent rolls then re-subscribe
              fetchRecentRolls(currentRoom.id).then(() => {
                subscribeToRoom(currentRoom, nicknameRef.current);
              });
            }
          }, delay);
        } else if (status === 'CLOSED') {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;
  }, [fetchRecentRolls]); // eslint-disable-line react-hooks/exhaustive-deps

  const joinRoom = useCallback(async (slug: string) => {
    if (!supabase || !supabaseEnabled) {
      setError('Supabase is not configured');
      return;
    }

    const sb = supabase;
    return withAsyncSpan('room.join', { 'room.slug': slug }, async (span) => {
      const opId = ++joinOpRef.current;
      const isStale = () => opId !== joinOpRef.current;

      setError(null);
      setIsJoining(true);
      cleanup();

      try {
        // Find or create room
        let roomData: RoomState;
        const { data: existing } = await sb
          .from('rooms')
          .select('id, slug')
          .eq('slug', slug)
          .maybeSingle();

        if (isStale()) return;

        if (existing) {
          span.setAttribute('room.created', false);
          roomData = existing;
        } else {
          span.setAttribute('room.created', true);
          const { data: created, error: createErr } = await sb
            .from('rooms')
            .insert({ slug })
            .select('id, slug')
            .single();

          if (isStale()) return;

          if (createErr || !created) {
            const { data: retry } = await sb
              .from('rooms')
              .select('id, slug')
              .eq('slug', slug)
              .maybeSingle();
            if (isStale()) return;
            if (retry) {
              roomData = retry;
            } else {
              setError('Failed to create room');
              return;
            }
          } else {
            roomData = created;
          }
        }

        span.setAttribute('room.id', roomData.id);
        setRoom(roomData);
        roomRef.current = roomData;

        // Fetch existing rolls
        await fetchRecentRolls(roomData.id);
        if (isStale()) return;

        // Subscribe to new rolls and presence
        subscribeToRoom(roomData, nicknameRef.current);
      } catch (err) {
        if (!isStale()) {
          setError('Failed to join room');
        }
        span.recordException(err as Error);
      } finally {
        if (!isStale()) {
          setIsJoining(false);
        }
      }
    });
  }, [cleanup, fetchRecentRolls, subscribeToRoom]);

  const createRoom = useCallback(async (): Promise<string | null> => {
    const slug = generateSlug();
    await joinRoom(slug);
    return slug;
  }, [joinRoom]);

  const broadcastRoll = useCallback(async (roll: Roll, nickname: string, visibility: RollVisibility = 'shared') => {
    if (!supabase || !room) return;
    const sb = supabase;
    const roomId = room.id;

    return withAsyncSpan('room.broadcast_roll', {
      'room.id': roomId,
      'roll.notation': roll.text,
      'roll.visibility': visibility,
      'roll.dice_count': roll.dice.length,
    }, async () => {
      const localRoomRoll: RoomRoll = {
        ...roll,
        nickname,
        isLocal: true,
        shouldAnimate: true,
        visibility,
        isRevealed: false,
      };
      setRoomRolls((prev) => [...prev, localRoomRoll]);

      await sb.from('room_rolls').insert({
        room_id: roomId,
        roll_id: roll.id,
        user_nickname: nickname,
        roll_data: roll,
        visibility,
        user_id: userIdRef.current ?? undefined,
      });
    });
  }, [room]);

  const revealRoll = useCallback(async (rollId: number) => {
    if (!supabase || !room) return;
    const sb = supabase;
    const roomId = room.id;

    return withAsyncSpan('room.reveal_roll', { 'room.id': roomId, 'roll.id': rollId }, async () => {
      // Optimistic local update — also clear shouldAnimate so DiceTray doesn't replay
      setRoomRolls((prev) =>
        prev.map((r) => (r.id === rollId ? { ...r, isRevealed: true, shouldAnimate: false } : r))
      );

      // Persist — triggers UPDATE realtime for other clients
      await sb
        .from('room_rolls')
        .update({ is_revealed: true })
        .eq('room_id', roomId)
        .eq('roll_id', rollId);
    });
  }, [room]);

  const broadcastCpSpend = useCallback(async (rollId: number, updatedRoll: Roll) => {
    if (!supabase || !room) return;
    const sb = supabase;
    const roomId = room.id;

    return withAsyncSpan('room.broadcast_cp_spend', {
      'room.id': roomId,
      'roll.id': rollId,
      'roll.dice_count': updatedRoll.dice.length,
    }, async () => {
      // Optimistic local update
      setRoomRolls((prev) =>
        prev.map((r) => (r.id === rollId ? { ...r, dice: updatedRoll.dice, shouldAnimate: true } : r))
      );

      // Persist — triggers UPDATE realtime for other clients
      await sb
        .from('room_rolls')
        .update({ roll_data: updatedRoll })
        .eq('room_id', roomId)
        .eq('roll_id', rollId);
    });
  }, [room]);

  const leaveRoom = useCallback(() => {
    cleanup();
    setRoom(null);
    roomRef.current = null;
    oldestLoadedCreatedAtRef.current = null;
    setRoomRolls([]);
    setHasOlderRolls(false);
    setIsLoadingOlderRolls(false);
    setError(null);
    setIsJoining(false);
  }, [cleanup]);

  const updatePresenceNickname = useCallback(async (newNickname: string) => {
    nicknameRef.current = newNickname;
    if (channelRef.current && isConnected) {
      await channelRef.current.track({
        nickname: newNickname,
        online_at: new Date().toISOString(),
      });
    }
  }, [isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    room,
    roomRolls,
    isConnected,
    isJoining,
    identityReady,
    error,
    presenceUsers,
    createRoom,
    joinRoom,
    broadcastRoll,
    revealRoll,
    broadcastCpSpend,
    hasOlderRolls,
    isLoadingOlderRolls,
    loadOlderRolls,
    leaveRoom,
    updatePresenceNickname,
  };
}
