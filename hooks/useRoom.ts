import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase, supabaseEnabled } from '../lib/supabase';
import { generateSlug } from '../lib/slug';
import type { Roll, RoomRoll } from '../dice/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface RoomState {
  id: string;
  slug: string;
}

export function useRoom() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [roomRolls, setRoomRolls] = useState<RoomRoll[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const cleanup = useCallback(() => {
    if (channelRef.current && supabase) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const joinRoom = useCallback(async (slug: string) => {
    if (!supabase || !supabaseEnabled) {
      setError('Supabase is not configured');
      return;
    }

    setError(null);
    cleanup();

    // Find or create room
    let roomData: RoomState;
    const { data: existing } = await supabase
      .from('rooms')
      .select('id, slug')
      .eq('slug', slug)
      .single();

    if (existing) {
      roomData = existing;
    } else {
      const { data: created, error: createErr } = await supabase
        .from('rooms')
        .insert({ slug })
        .select('id, slug')
        .single();

      if (createErr || !created) {
        setError('Failed to create room');
        return;
      }
      roomData = created;
    }

    setRoom(roomData);

    // Fetch existing rolls
    const { data: historyRows } = await supabase
      .from('room_rolls')
      .select('*')
      .eq('room_id', roomData.id)
      .order('created_at', { ascending: true });

    const history: RoomRoll[] = (historyRows ?? []).map((row) => ({
      ...(row.roll_data as Roll),
      nickname: row.user_nickname,
      isLocal: false,
      shouldAnimate: false,
    }));
    setRoomRolls(history);

    // Subscribe to new rolls
    const channel = supabase
      .channel(`room:${roomData.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_rolls',
          filter: `room_id=eq.${roomData.id}`,
        },
        (payload) => {
          const row = payload.new as {
            roll_id: number;
            user_nickname: string;
            roll_data: Roll;
          };
          const incoming: RoomRoll = {
            ...row.roll_data,
            nickname: row.user_nickname,
            isLocal: false,
            shouldAnimate: true,
          };
          setRoomRolls((prev) => {
            // Deduplicate: if we already have this roll_id (from optimistic add), skip
            if (prev.some((r) => r.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;
  }, [cleanup]);

  const createRoom = useCallback(async (): Promise<string | null> => {
    const slug = generateSlug();
    await joinRoom(slug);
    return room ? slug : slug; // slug is available synchronously
  }, [joinRoom, room]);

  const broadcastRoll = useCallback(async (roll: Roll, nickname: string) => {
    if (!supabase || !room) return;

    // Optimistic: add to local state immediately
    const localRoomRoll: RoomRoll = {
      ...roll,
      nickname,
      isLocal: true,
      shouldAnimate: true,
    };
    setRoomRolls((prev) => [...prev, localRoomRoll]);

    // Persist to DB (triggers realtime for other clients)
    await supabase.from('room_rolls').insert({
      room_id: room.id,
      roll_id: roll.id,
      user_nickname: nickname,
      roll_data: roll,
    });
  }, [room]);

  const leaveRoom = useCallback(() => {
    cleanup();
    setRoom(null);
    setRoomRolls([]);
    setError(null);
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    room,
    roomRolls,
    isConnected,
    error,
    createRoom,
    joinRoom,
    broadcastRoll,
    leaveRoom,
  };
}
