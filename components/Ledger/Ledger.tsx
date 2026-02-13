import React from 'react';
import DiceTray from '../DiceTray/DiceTray';
import type { Roll, RoomRoll } from '../../dice/types';
import styles from './Ledger.module.css';

interface LedgerProps {
  rolls: Roll[];
  isRoomMode?: boolean;
}

/**
 * Component that displays the history of all rolls
 * Simply renders a list of DiceTray components, each managing its own state timing logic
 */
export default function Ledger({ rolls, isRoomMode }: LedgerProps) {
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

  return (
    <div className={styles.Ledger}>
      <ul>
        {rolls.map((roll) => (
          <li key={roll.id}>
            <div className={styles.rollHeader}>
              {isRoomMode && 'nickname' in roll && (
                <span className={styles.nickname}>
                  {(roll as RoomRoll).nickname}
                  {(roll as RoomRoll).isLocal && ' (you)'}
                </span>
              )}
              <span className={styles.text}>{roll.text}</span>
              <span className={styles.date}>{formatDate(roll.date)}</span>
            </div>
            <DiceTray roll={roll} />
          </li>
        ))}
      </ul>
    </div>
  );
}
