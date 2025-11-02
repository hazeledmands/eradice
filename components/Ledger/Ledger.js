import React, { useState, useEffect } from 'react';
import DiceTray from '../DiceTray/DiceTray';
import { calculateRollResult, generateCopyText } from '../../utils/diceCalculations';
import { copyToClipboard } from '../../utils/clipboard';
import styles from '../../styles/App.module.css';

/**
 * Component that displays the history of all rolls
 */
export default function Ledger({ rolls, onRollComplete, onReroll }) {
  const [completedRolls, setCompletedRolls] = useState({});

  useEffect(() => {
    // Initialize tracking for new rolls
    const newRolls = rolls.filter(roll => !completedRolls[roll.id]);
    if (newRolls.length > 0) {
      setCompletedRolls(prevState => {
        const updated = { ...prevState };
        newRolls.forEach(roll => {
          updated[roll.id] = false;
        });
        return updated;
      });
    }
  }, [rolls]);

  const handleRollComplete = (rollId, completedDice) => {
    setCompletedRolls(prevState => ({
      ...prevState,
      [rollId]: true,
    }));

    if (onRollComplete) {
      onRollComplete(rollId, completedDice);
    }
  };

  const handleCopy = async (roll) => {
    const copyText = generateCopyText(roll);
    if (!copyText) return;

    try {
      await copyToClipboard(copyText);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className={styles.Ledger}>
      <ul>
        {rolls.map(roll => {
          const result = calculateRollResult(roll);
          const isComplete = roll.dice && roll.dice.every(die => !die.isRolling);

          return (
            <li key={roll.id}>
              <div className={styles.rollHeader}>
                <span className={styles.text}>{roll.text}</span>
                {isComplete && result !== null && (
                  <div className={styles.buttonGroup}>
                    <button
                      className={styles.rerollButton}
                      onClick={() => onReroll && onReroll(roll.id)}
                      title="Reroll dice"
                    >
                      Reroll
                    </button>
                    <button
                      className={styles.copyButton}
                      onClick={() => handleCopy(roll)}
                      title="Copy to clipboard"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
              <DiceTray
                dice={roll.dice}
                modifier={roll.modifier}
                rollId={roll.id}
                onRollComplete={handleRollComplete}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

