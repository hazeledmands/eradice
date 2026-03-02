import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, supabaseEnabled } from '../lib/supabase';
import type { RollComment } from '../dice/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

const LOCAL_STORAGE_KEY = 'eradice-roll-comments';

interface UseRollCommentsOptions {
  roomId?: string;
  userId?: string;
  nickname: string;
}

interface UseRollCommentsReturn {
  commentsByRoll: Record<number, RollComment[]>;
  addComment: (rollId: number, text: string, visibility: 'public' | 'private') => Promise<void>;
  editComment: (id: string, newText: string) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
}

function loadLocalComments(): RollComment[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RollComment[];
  } catch {
    return [];
  }
}

function saveLocalComments(comments: RollComment[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(comments));
  } catch { /* ignore */ }
}

function groupByRoll(comments: RollComment[]): Record<number, RollComment[]> {
  const result: Record<number, RollComment[]> = {};
  for (const c of comments) {
    if (!result[c.rollId]) result[c.rollId] = [];
    result[c.rollId].push(c);
  }
  return result;
}

export function useRollComments({ roomId, userId, nickname }: UseRollCommentsOptions): UseRollCommentsReturn {
  // Local (private) comments — always from localStorage
  const [localComments, setLocalComments] = useState<RollComment[]>([]);
  // Public comments from Supabase (room mode only)
  const [remoteComments, setRemoteComments] = useState<RollComment[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomIdRef = useRef<string | undefined>(roomId);
  const userIdRef = useRef<string | undefined>(userId);

  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // Load local comments on mount
  useEffect(() => {
    setLocalComments(loadLocalComments());
  }, []);

  // Persist local comments whenever they change
  useEffect(() => {
    saveLocalComments(localComments);
  }, [localComments]);

  // Room mode: fetch + subscribe to public comments
  useEffect(() => {
    if (!roomId || !supabase || !supabaseEnabled) {
      setRemoteComments([]);
      return;
    }

    // Fetch existing public comments for this room
    supabase
      .from('roll_comments')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        const comments: RollComment[] = data.map((row) => ({
          id: row.id,
          rollId: row.roll_id,
          text: row.text,
          visibility: 'public' as const,
          authorNickname: row.author_nickname,
          authorId: row.author_id ?? undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at ?? undefined,
        }));
        setRemoteComments(comments);
      });

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`comments:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'roll_comments', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as {
            id: string; room_id: string; roll_id: number; text: string;
            author_nickname: string; author_id: string | null;
            created_at: string; updated_at: string | null;
          };
          if (row.room_id !== roomIdRef.current) return;
          const comment: RollComment = {
            id: row.id,
            rollId: row.roll_id,
            text: row.text,
            visibility: 'public',
            authorNickname: row.author_nickname,
            authorId: row.author_id ?? undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at ?? undefined,
          };
          setRemoteComments((prev) => {
            if (prev.some((c) => c.id === comment.id)) return prev;
            return [...prev, comment];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'roll_comments', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as {
            id: string; room_id: string; text: string; updated_at: string | null;
          };
          if (row.room_id !== roomIdRef.current) return;
          setRemoteComments((prev) =>
            prev.map((c) => c.id === row.id ? { ...c, text: row.text, updatedAt: row.updated_at ?? undefined } : c)
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'roll_comments', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.old as { id: string };
          setRemoteComments((prev) => prev.filter((c) => c.id !== row.id));
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (supabase) supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId]);

  // Merge: public remote comments + private local comments
  const commentsByRoll = (() => {
    const all = roomId
      ? [
          ...remoteComments,
          ...localComments.filter((c) => c.visibility === 'private'),
        ]
      : localComments;
    // Sort each roll's comments by createdAt
    const grouped = groupByRoll(all);
    for (const rollId of Object.keys(grouped)) {
      grouped[Number(rollId)].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }
    return grouped;
  })();

  const addComment = useCallback(async (
    rollId: number,
    text: string,
    visibility: 'public' | 'private'
  ) => {
    if (!text.trim()) return;

    if (visibility === 'private' || !roomId) {
      // Private or solo — localStorage only
      const comment: RollComment = {
        id: crypto.randomUUID(),
        rollId,
        text: text.trim(),
        visibility: 'private',
        authorNickname: roomId ? nickname : 'You',
        authorId: userId,
        createdAt: new Date().toISOString(),
      };
      setLocalComments((prev) => [...prev, comment]);
    } else {
      // Public + room mode — Supabase (optimistic)
      if (!supabase) return;
      const optimisticId = crypto.randomUUID();
      const now = new Date().toISOString();
      const optimistic: RollComment = {
        id: optimisticId,
        rollId,
        text: text.trim(),
        visibility: 'public',
        authorNickname: nickname,
        authorId: userId,
        createdAt: now,
      };
      setRemoteComments((prev) => [...prev, optimistic]);

      const { data, error } = await supabase
        .from('roll_comments')
        .insert({
          room_id: roomId,
          roll_id: rollId,
          text: text.trim(),
          author_nickname: nickname,
          author_id: userId ?? null,
        })
        .select('id, created_at')
        .single();

      if (!error && data) {
        // Replace optimistic with real id/timestamp
        setRemoteComments((prev) =>
          prev.map((c) =>
            c.id === optimisticId
              ? { ...c, id: data.id, createdAt: data.created_at }
              : c
          )
        );
      } else if (error) {
        // Rollback optimistic
        setRemoteComments((prev) => prev.filter((c) => c.id !== optimisticId));
      }
    }
  }, [roomId, userId, nickname]);

  const editComment = useCallback(async (id: string, newText: string) => {
    if (!newText.trim()) return;

    // Check if it's a local (private) comment
    const isLocal = localComments.some((c) => c.id === id);
    if (isLocal) {
      const now = new Date().toISOString();
      setLocalComments((prev) =>
        prev.map((c) => c.id === id ? { ...c, text: newText.trim(), updatedAt: now } : c)
      );
      return;
    }

    // Remote public comment
    if (!supabase || !roomId) return;
    const now = new Date().toISOString();
    setRemoteComments((prev) =>
      prev.map((c) => c.id === id ? { ...c, text: newText.trim(), updatedAt: now } : c)
    );
    await supabase
      .from('roll_comments')
      .update({ text: newText.trim(), updated_at: now })
      .eq('id', id)
      .eq('room_id', roomId);
  }, [localComments, roomId]);

  const deleteComment = useCallback(async (id: string) => {
    // Check if it's a local (private) comment
    const isLocal = localComments.some((c) => c.id === id);
    if (isLocal) {
      setLocalComments((prev) => prev.filter((c) => c.id !== id));
      return;
    }

    // Remote public comment
    if (!supabase || !roomId) return;
    setRemoteComments((prev) => prev.filter((c) => c.id !== id));
    await supabase
      .from('roll_comments')
      .delete()
      .eq('id', id)
      .eq('room_id', roomId);
  }, [localComments, roomId]);

  return { commentsByRoll, addComment, editComment, deleteComment };
}
