import React from 'react';
import DiceTray from '../DiceTray/DiceTray';
import type { Roll, RoomRoll } from '../../dice/types';
import styles from './Ledger.module.css';

interface LedgerProps {
  rolls: Roll[];
  isRoomMode?: boolean;
  onRevealRoll?: (rollId: number) => void;
  onReroll?: (roll: Roll) => void;
  onSpendCp?: (rollId: number, count: number) => void;
}

function isRoomRoll(roll: Roll): roll is RoomRoll {
  return 'nickname' in roll;
}

/**
 * Component that displays the history of all rolls
 * Simply renders a list of DiceTray components, each managing its own state timing logic
 */
export default function Ledger({ rolls, isRoomMode, onRevealRoll, onReroll, onSpendCp }: LedgerProps) {
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

  // Filter out hidden rolls from other players
  const visibleRolls = rolls.filter((roll) => {
    if (!isRoomMode || !isRoomRoll(roll)) return true;
    if (roll.visibility === 'hidden' && !roll.isLocal && !roll.isRevealed) return false;
    return true;
  });

  // Fractal only on the most recent critical success (a chained explosion die)
  const mostRecentCritId = visibleRolls.find((roll) =>
    roll.dice?.some((die) => die.chainDepth != null && die.chainDepth >= 1)
  )?.id;

  return (
    <div className={styles.Ledger}>
      <ul>
        {visibleRolls.map((roll) => {
          const rr = isRoomMode && isRoomRoll(roll) ? roll : null;
          const visibility = rr?.visibility || 'shared';
          const isRevealed = rr?.isRevealed || false;
          const isLocal = rr?.isLocal || false;

          // Secret roll from someone else that hasn't been revealed
          const isSecretPlaceholder =
            visibility === 'secret' && !isLocal && !isRevealed;

          // Show badge for non-shared rolls
          const badge = isRevealed
            ? 'revealed'
            : visibility !== 'shared'
              ? visibility
              : null;

          // Show reveal button for local secret/hidden rolls that haven't been revealed
          const showReveal =
            isLocal && !isRevealed && visibility !== 'shared';

          // Can spend CP: solo mode always, room mode only on own rolls
          const canSpendCp = !isRoomMode || isLocal;

          return (
            <li key={roll.id}>
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
    </div>
  );
}
