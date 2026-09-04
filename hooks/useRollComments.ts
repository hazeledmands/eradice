import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/apiClient';
import { withAsyncSpan } from '../lib/tracing';
import type { RollComment } from '../dice/types';

/**
 * Comments on rolls.
 *
 * Unchanged in shape: private comments never leave the browser's localStorage,
 * and public comments are shared. What changed is the transport — public
 * comments were PostgREST writes plus a Realtime subscription, and are now
 * ordinary requests plus the room's SSE stream, which this hook listens to
 * through a DOM event relayed by useRoom's EventSource.
 */

const LOCAL_STORAGE_KEY = 'eradice-roll-comments';

export const MAX_INITIAL_COMMENTS = 500;

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
  const [localComments, setLocalComments] = useState<RollComment[]>([]);
  const [remoteComments, setRemoteComments] = useState<RollComment[]>([]);
  const roomIdRef = useRef<string | undefined>(roomId);

  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  useEffect(() => {
    setLocalComments(loadLocalComments());
  }, []);

  useEffect(() => {
    saveLocalComments(localComments);
  }, [localComments]);

  // Room mode: load the existing public comments, then follow the stream.
  useEffect(() => {
    if (!roomId) {
      setRemoteComments([]);
      return;
    }

    let cancelled = false;

    api
      .get<{ comments: RollComment[] }>(`/api/rooms/${roomId}/comments?limit=${MAX_INITIAL_COMMENTS}`)
      .then(({ comments }) => {
        if (!cancelled) setRemoteComments(comments);
      })
      .catch((err) => console.error(`could not load comments: ${err.message}`));

    // useRoom owns the EventSource; it relays comment events on window so this
    // hook does not open a second stream for the same room.
    const onComment = (event: Event) => {
      const { type, comment, id } = (event as CustomEvent).detail as {
        type: 'comment' | 'comment_updated' | 'comment_deleted';
        comment?: RollComment;
        id?: string;
      };
      if (type === 'comment_deleted') {
        setRemoteComments((prev) => prev.filter((c) => c.id !== id));
        return;
      }
      if (!comment) return;
      setRemoteComments((prev) => {
        const existing = prev.findIndex((c) => c.id === comment.id);
        if (existing === -1) return [...prev, comment];
        const next = [...prev];
        next[existing] = comment;
        return next;
      });
    };

    window.addEventListener('eradice:comment', onComment);
    return () => {
      cancelled = true;
      window.removeEventListener('eradice:comment', onComment);
    };
  }, [roomId]);

  const commentsByRoll = (() => {
    const all = roomId
      ? [...remoteComments, ...localComments.filter((c) => c.visibility === 'private')]
      : localComments;
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

    return withAsyncSpan('comment.add', {
      'comment.visibility': visibility,
      'comment.text_length': text.trim().length,
      'comment.storage': (visibility === 'private' || !roomId) ? 'local' : 'remote',
    }, async () => {
      if (visibility === 'private' || !roomId) {
        setLocalComments((prev) => [...prev, {
          id: crypto.randomUUID(),
          rollId,
          text: text.trim(),
          visibility: 'private',
          authorNickname: roomId ? nickname : 'You',
          authorId: userId,
          createdAt: new Date().toISOString(),
        }]);
        return;
      }

      // Public, in a room: optimistic insert, reconciled with the server's row.
      const optimisticId = crypto.randomUUID();
      setRemoteComments((prev) => [...prev, {
        id: optimisticId,
        rollId,
        text: text.trim(),
        visibility: 'public',
        authorNickname: nickname,
        authorId: userId,
        createdAt: new Date().toISOString(),
      }]);

      try {
        const { comment } = await api.post<{ comment: RollComment }>(
          `/api/rooms/${roomId}/comments`,
          { rollId, text: text.trim(), nickname }
        );
        setRemoteComments((prev) => {
          // The stream echo may already have added the real row.
          const withoutOptimistic = prev.filter((c) => c.id !== optimisticId);
          return withoutOptimistic.some((c) => c.id === comment.id)
            ? withoutOptimistic
            : [...withoutOptimistic, comment];
        });
      } catch (err) {
        setRemoteComments((prev) => prev.filter((c) => c.id !== optimisticId));
        throw err;
      }
    });
  }, [roomId, userId, nickname]);

  const editComment = useCallback(async (id: string, newText: string) => {
    if (!newText.trim()) return;

    const isLocal = localComments.some((c) => c.id === id);
    return withAsyncSpan('comment.edit', {
      'comment.storage': isLocal ? 'local' : 'remote',
      'comment.text_length': newText.trim().length,
    }, async () => {
      const now = new Date().toISOString();
      if (isLocal) {
        setLocalComments((prev) =>
          prev.map((c) => c.id === id ? { ...c, text: newText.trim(), updatedAt: now } : c)
        );
        return;
      }

      if (!roomId) return;
      const previous = remoteComments.find((c) => c.id === id);
      setRemoteComments((prev) =>
        prev.map((c) => c.id === id ? { ...c, text: newText.trim(), updatedAt: now } : c)
      );
      try {
        await api.patch(`/api/rooms/${roomId}/comments/${id}`, { text: newText.trim() });
      } catch (err) {
        if (previous) {
          setRemoteComments((prev) => prev.map((c) => (c.id === id ? previous : c)));
        }
        throw err;
      }
    });
  }, [localComments, remoteComments, roomId]);

  const deleteComment = useCallback(async (id: string) => {
    const isLocal = localComments.some((c) => c.id === id);
    return withAsyncSpan('comment.delete', {
      'comment.storage': isLocal ? 'local' : 'remote',
    }, async () => {
      if (isLocal) {
        setLocalComments((prev) => prev.filter((c) => c.id !== id));
        return;
      }

      if (!roomId) return;
      const previous = remoteComments.find((c) => c.id === id);
      setRemoteComments((prev) => prev.filter((c) => c.id !== id));
      try {
        await api.del(`/api/rooms/${roomId}/comments/${id}`);
      } catch (err) {
        if (previous) setRemoteComments((prev) => [...prev, previous]);
        throw err;
      }
    });
  }, [localComments, remoteComments, roomId]);

  return { commentsByRoll, addComment, editComment, deleteComment };
}
