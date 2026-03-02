import React, { useState, useRef, useEffect } from 'react';
import type { RollComment } from '../../dice/types';
import styles from './CommentThread.module.css';

interface CommentThreadProps {
  rollId: number;
  comments: RollComment[];
  currentUserId?: string;
  currentNickname: string;
  isRoomMode: boolean;
  onAdd: (text: string, visibility: 'public' | 'private') => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface CommentItemProps {
  comment: RollComment;
  isOwner: boolean;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

function CommentItem({ comment, isOwner, onEdit, onDelete }: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(editText.length, editText.length);
    }
  }, [editing]);

  const handleSave = () => {
    if (editText.trim()) {
      onEdit(comment.id, editText);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditText(comment.text);
      setEditing(false);
    }
  };

  return (
    <div className={styles.commentItem}>
      <div className={styles.commentHeader}>
        <span className={styles.commentAuthor}>{comment.authorNickname}</span>
        <span className={styles.commentMeta}>
          {formatRelativeTime(comment.createdAt)}
          {comment.updatedAt && ' · edited'}
        </span>
        {comment.visibility === 'private' && (
          <span className={styles.privateBadge} title="Only visible to you">🔒</span>
        )}
        {isOwner && !editing && (
          <span className={styles.commentActions}>
            <button
              className={styles.actionBtn}
              onClick={() => setEditing(true)}
              title="Edit comment"
            >
              Edit
            </button>
            <button
              className={styles.actionBtn}
              onClick={() => onDelete(comment.id)}
              title="Delete comment"
            >
              Delete
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <div className={styles.editArea}>
          <textarea
            ref={textareaRef}
            className={styles.editTextarea}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <div className={styles.editButtons}>
            <button className={styles.saveBtn} onClick={handleSave}>Save</button>
            <button
              className={styles.cancelBtn}
              onClick={() => { setEditText(comment.text); setEditing(false); }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className={styles.commentText}>{comment.text}</p>
      )}
    </div>
  );
}

export default function CommentThread({
  rollId,
  comments,
  currentUserId,
  currentNickname,
  isRoomMode,
  onAdd,
  onEdit,
  onDelete,
}: CommentThreadProps) {
  const [inputText, setInputText] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handlePost = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onAdd(trimmed, isRoomMode ? visibility : 'private');
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePost();
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  return (
    <div className={styles.commentThread}>
      {comments.length === 0 ? (
        <p className={styles.emptyState}>No notes yet</p>
      ) : (
        <div className={styles.commentList}>
          {comments.map((comment) => {
            const isOwner =
              !currentUserId
                ? comment.visibility === 'private' // solo: own all private
                : comment.authorId === currentUserId || comment.visibility === 'private';
            return (
              <CommentItem
                key={comment.id}
                comment={comment}
                isOwner={isOwner}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            );
          })}
        </div>
      )}
      <div className={styles.commentInput}>
        <textarea
          ref={textareaRef}
          className={styles.inputTextarea}
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Add a note... (Enter to post, Shift+Enter for newline)"
          rows={1}
          aria-label="Add a comment"
        />
        <div className={styles.inputRow}>
          {isRoomMode && (
            <button
              type="button"
              className={`${styles.visibilityToggle} ${visibility === 'private' ? styles.visibilityPrivate : styles.visibilityPublic}`}
              onClick={() => setVisibility((v) => v === 'public' ? 'private' : 'public')}
              title={visibility === 'public' ? 'Visible to everyone — click for private' : 'Private note — click for public'}
            >
              {visibility === 'public' ? '🌐 Public' : '🔒 Private'}
            </button>
          )}
          <button
            type="button"
            className={styles.postBtn}
            onClick={handlePost}
            disabled={!inputText.trim()}
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
