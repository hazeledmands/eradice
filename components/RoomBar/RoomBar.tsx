import React, { useState } from 'react';
import { copyToClipboard } from '../../utils/clipboard';
import type { PresenceUser } from '../../hooks/useRoom';
import styles from './RoomBar.module.css';

interface RoomBarProps {
  slug: string;
  nickname: string;
  isConnected: boolean;
  isReconnecting: boolean;
  presenceUsers: PresenceUser[];
  onNicknameChange: (name: string) => void;
  onLeave: () => void;
}

export default function RoomBar({ slug, nickname, isConnected, isReconnecting, presenceUsers, onNicknameChange, onLeave }: RoomBarProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nickname);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${slug}`;
    try {
      await copyToClipboard(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: do nothing
    }
  };

  const handleNicknameSubmit = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      onNicknameChange(trimmed);
    } else {
      setDraft(nickname);
    }
    setEditing(false);
  };

  return (
    <div className={styles.RoomBar}>
      <div className={styles.roomInfo}>
        <span
          className={styles.status}
          data-connected={isConnected}
          data-reconnecting={isReconnecting}
        />
        <span className={styles.slug}>{slug}</span>
        {isReconnecting && (
          <span className={styles.reconnecting}>Reconnecting...</span>
        )}
      </div>

      {presenceUsers.length > 0 && (
        <div className={styles.presenceSection}>
          <span className={styles.presenceCount}>{presenceUsers.length}</span>
          <span className={styles.presenceLabel}>
            {presenceUsers.length === 1 ? 'user' : 'users'}
          </span>
          <span
            className={styles.presenceList}
            title={[...new Set(presenceUsers.map((u) => u.nickname))].join(', ')}
          >
            {[...new Set(presenceUsers.map((u) => u.nickname))].join(', ')}
          </span>
        </div>
      )}

      <div className={styles.nicknameSection}>
        {editing ? (
          <input
            className={styles.nicknameInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleNicknameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNicknameSubmit();
              if (e.key === 'Escape') { setDraft(nickname); setEditing(false); }
            }}
            autoFocus
            maxLength={30}
          />
        ) : (
          <button className={styles.nicknameButton} onClick={() => { setDraft(nickname); setEditing(true); }}>
            {nickname}
          </button>
        )}
      </div>

      <div className={styles.actions}>
        <button className={styles.actionButton} onClick={handleShare}>
          {copied ? 'Copied!' : 'Share Link'}
        </button>
        <button className={styles.actionButton} onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}
