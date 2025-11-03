import React from 'react';
import DiceTray from '../DiceTray/DiceTray';
import type { Roll } from '../../dice/types';
import styles from './Ledger.module.css';

interface LedgerProps {
  rolls: Roll[];
}

/**
 * Component that displays the history of all rolls
 * Simply renders a list of DiceTray components, each managing its own state timing logic
 */
export default function Ledger({ rolls }: LedgerProps) {
  return (
    <div className={styles.Ledger}>
      <ul>
        {rolls.map((roll) => (
          <li key={roll.id}>
            <div className={styles.rollHeader}>
              <span className={styles.text}>{roll.text}</span>
            </div>
            <DiceTray roll={roll} />
          </li>
        ))}
      </ul>
    </div>
  );
}

