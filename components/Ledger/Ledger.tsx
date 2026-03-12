import React, { useMemo, useRef, useEffect, useState } from 'react';
import DiceTray from '../DiceTray/DiceTray';
import type { Roll, RoomRoll, RollComment } from '../../dice/types';
import styles from './Ledger.module.css';

interface LedgerProps {
  rolls: Roll[];
  isRoomMode?: boolean;
  onRevealRoll?: (rollId: number) => void;
  onReroll?: (roll: Roll) => void;
  onSpendCp?: (rollId: number, count: number) => void;
  commentsByRoll?: Record<number, RollComment[]>;
  onAddComment?: (rollId: number, text: string, visibility: 'public' | 'private') => void;
  onEditComment?: (id: string, text: string) => void;
  onDeleteComment?: (id: string) => void;
  currentUserId?: string;
  currentNickname?: string;
  hasMore?: boolean;
  hasNewer?: boolean;
  isLoadingMore?: boolean;
  isLoadingNewer?: boolean;
  onLoadMore?: () => void;
  onLoadNewer?: () => void;
  onSnapToRecent?: () => void;
}

function isRoomRoll(roll: Roll): roll is RoomRoll {
  return 'nickname' in roll;
}

export default function Ledger({
  rolls, isRoomMode, onRevealRoll, onReroll, onSpendCp,
  commentsByRoll, onAddComment, onEditComment, onDeleteComment,
  currentUserId, currentNickname,
  hasMore = false, hasNewer = false,
  isLoadingMore = false, isLoadingNewer = false,
  onLoadMore, onLoadNewer, onSnapToRecent,
}: LedgerProps) {
  const topTriggerRef = useRef<HTMLDivElement | null>(null);
  const bottomTriggerRef = useRef<HTMLDivElement | null>(null);
  const jumpThresholdRef = useRef<HTMLLIElement | null>(null);
  const [showJumpToRecent, setShowJumpToRecent] = useState(false);

  useEffect(() => {
    if (!onLoadMore || !hasMore || !bottomTriggerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting || isLoadingMore) return;
        onLoadMore();
      },
      {
        root: null,
        rootMargin: '600px 0px',
        threshold: 0.1,
      }
    );

    observer.observe(bottomTriggerRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

  useEffect(() => {
    if (!topTriggerRef.current || (!hasNewer && !onSnapToRecent)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting || isLoadingNewer) return;

        if (hasNewer && onLoadNewer) {
          onLoadNewer();
          return;
        }
        if (onSnapToRecent) {
          onSnapToRecent();
        }
      },
      {
        root: null,
        rootMargin: '200px 0px',
        threshold: 0.1,
      }
    );

    observer.observe(topTriggerRef.current);
    return () => observer.disconnect();
  }, [hasNewer, isLoadingNewer, onLoadNewer, onSnapToRecent]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const visibleRolls = useMemo(() => rolls.filter((roll) => {
    if (!isRoomMode || !isRoomRoll(roll)) return true;
    if (roll.visibility === 'hidden' && !roll.isLocal && !roll.isRevealed) return false;
    return true;
  }), [rolls, isRoomMode]);

  const mostRecentCritId = useMemo(() => visibleRolls.find((roll) =>
    roll.dice?.some((die) => die.chainDepth != null && die.chainDepth >= 2)
  )?.id, [visibleRolls]);

  useEffect(() => {
    if (!isRoomMode || !jumpThresholdRef.current || visibleRolls.length <= 30) {
      setShowJumpToRecent(false);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry) return;
        const isPastThreshold = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        setShowJumpToRecent(isPastThreshold);
      },
      {
        root: null,
        threshold: 0,
      }
    );

    observer.observe(jumpThresholdRef.current);
    return () => observer.disconnect();
  }, [isRoomMode, visibleRolls.length]);

  const handleJumpToRecent = () => {
    if (onSnapToRecent) {
      onSnapToRecent();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={styles.Ledger}>
      {isRoomMode && <div ref={topTriggerRef} className={styles.loadTrigger} aria-hidden="true" />}

      <ul>
        {visibleRolls.map((roll, index) => {
          const rr = isRoomMode && isRoomRoll(roll) ? roll : null;
          const visibility = rr?.visibility || 'shared';
          const isRevealed = rr?.isRevealed || false;
          const isLocal = rr?.isLocal || false;

          const isSecretPlaceholder =
            visibility === 'secret' && !isLocal && !isRevealed;

          const badge = isRevealed
            ? 'revealed'
            : visibility !== 'shared'
              ? visibility
              : null;

          const showReveal =
            isLocal && !isRevealed && visibility !== 'shared';

          const canSpendCp = !isRoomMode || isLocal;

          return (
            <li
              key={roll.id}
              ref={index === 29 ? jumpThresholdRef : null}
            >
              <div className={styles.rollHeader}>
                {rr && (
                  <span className={styles.nickname}>
                    {rr.nickname}
                    {isLocal && ' (you)'}
                    {badge && (
                      <span className={styles[`${badge}Badge`]}>
                        {badge}
                      </span>
                    )}
                  </span>
                )}
                {isSecretPlaceholder ? (
                  <span className={styles.secretPlaceholder}>
                    rolled secretly
                  </span>
                ) : (
                  <>
                    <span className={styles.text}>{roll.text}</span>
                    <span className={styles.date}>
                      {formatDate(roll.date)}
                    </span>
                  </>
                )}
              </div>
              {!isSecretPlaceholder && (
                <DiceTray
                  roll={roll}
                  onReroll={onReroll}
                  onSpendCp={onSpendCp}
                  canSpendCp={canSpendCp}
                  showFractal={roll.id === mostRecentCritId}
                  comments={commentsByRoll?.[roll.id] ?? []}
                  onAddComment={onAddComment}
                  onEditComment={onEditComment}
                  onDeleteComment={onDeleteComment}
                  currentUserId={currentUserId}
                  currentNickname={currentNickname}
                  isRoomMode={isRoomMode}
                />
              )}
              {showReveal && onRevealRoll && (
                <button
                  type="button"
                  className={styles.revealButton}
                  onClick={() => onRevealRoll(roll.id)}
                >
                  Reveal Roll
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {isRoomMode && (
        <>
          {showJumpToRecent && onSnapToRecent && (
            <button
              type="button"
              className={styles.jumpToRecentButton}
              onClick={handleJumpToRecent}
            >
              🚀 Back to Recent
            </button>
          )}
          <div ref={bottomTriggerRef} className={styles.loadTrigger} aria-hidden="true" />
          {(isLoadingMore || isLoadingNewer) && <div className={styles.loadStatus}>Loading rolls…</div>}
          {!hasMore && visibleRolls.length > 0 && (
            <div className={styles.loadStatus}>Beginning of roll history.</div>
          )}
        </>
      )}
    </div>
  );
}
