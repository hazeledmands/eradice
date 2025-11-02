import React, { useState, useEffect } from 'react';
import DiceTray from '../DiceTray/DiceTray';
import { calculateRollResult, generateCopyText } from '../../utils/diceCalculations';
import { copyToClipboard } from '../../utils/clipboard';
import styles from './Ledger.module.css';

/**
 * Component that displays the history of all rolls
 * Controls when individual dice should roll or finish rolling
 */
export default function Ledger({ rolls, onRollComplete, onReroll }) {
  const [completedRolls, setCompletedRolls] = useState({});
  // Track rolling state for each die in each roll - Ledger controls this
  const [diceRollingStates, setDiceRollingStates] = useState({});

  useEffect(() => {
    // Initialize tracking for new rolls and start them rolling
    // Also detect when dice change in existing rolls (rerolls, exploding dice)
    setDiceRollingStates(prevState => {
      const updated = { ...prevState };
      let hasChanges = false;

      rolls.forEach(roll => {
        if (!roll.dice || roll.dice.length === 0) return;

        // Check if this roll is new or if dice have changed
        const existingState = updated[roll.id] || {};
        const existingDieIds = new Set(Object.keys(existingState).map(Number));
        const currentDieIds = new Set(roll.dice.map(d => d.id));

        // Detect new dice (reroll or exploding dice)
        const newDice = roll.dice.filter(die => !existingDieIds.has(die.id));
        
        if (newDice.length > 0) {
          if (!updated[roll.id]) {
            updated[roll.id] = {};
          }
          newDice.forEach(die => {
            updated[roll.id][die.id] = true; // Start new dice rolling
          });
          hasChanges = true;
        }

        // Initialize new rolls (all dice should roll)
        if (!completedRolls[roll.id] && Object.keys(existingState).length === 0) {
          updated[roll.id] = roll.dice.reduce((acc, die) => {
            acc[die.id] = true; // Start all dice rolling
            return acc;
          }, {});
          hasChanges = true;
        }
      });

      return hasChanges ? updated : prevState;
    });

    // Initialize completion tracking for new rolls
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
  }, [rolls, completedRolls]);

  const handleDieStopped = (rollId, dieId) => {
    // Update the rolling state for this specific die
    setDiceRollingStates(prevState => {
      const updated = { ...prevState };
      if (!updated[rollId]) {
        updated[rollId] = {};
      }
      updated[rollId][dieId] = false;
      return updated;
    });
  };

  const handleDiceUpdate = (rollId, updatedDice) => {
    // Update the roll's dice (for exploding dice)
    if (onRollComplete) {
      onRollComplete(rollId, updatedDice);
    }
    // Ledger's useEffect will detect new dice and start them rolling
  };

  const handleRollComplete = (rollId, completedDice) => {
    setCompletedRolls(prevState => ({
      ...prevState,
      [rollId]: true,
    }));

    if (onRollComplete) {
      onRollComplete(rollId, completedDice);
    }
  };

  const handleReroll = (rollId) => {
    // Stop all dice in this roll first
    const roll = rolls.find(r => r.id === rollId);
    if (roll && roll.dice) {
      setDiceRollingStates(prevState => {
        const updated = { ...prevState };
        roll.dice.forEach(die => {
          if (!updated[rollId]) {
            updated[rollId] = {};
          }
          updated[rollId][die.id] = false;
        });
        return updated;
      });
    }

    // Reset completion state for reroll
    setCompletedRolls(prevState => ({
      ...prevState,
      [rollId]: false,
    }));

    // Trigger the reroll which will create new dice
    // The useEffect will detect the new dice and start them rolling
    if (onReroll) {
      onReroll(rollId);
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
          // Result can be calculated immediately using pre-calculated finalNumber
          const result = calculateRollResult(roll);
          // Check rolling state from Ledger's control
          const rollStates = diceRollingStates[roll.id] || {};
          const isComplete = roll.dice && roll.dice.every(die => {
            const dieState = rollStates[die.id];
            return dieState === false || dieState === undefined; // Not rolling or not started
          });

          // Enhance dice with controlled isRolling state from Ledger
          const controlledDice = roll.dice.map(die => ({
            ...die,
            isRolling: rollStates[die.id] ?? die.isRolling ?? false,
          }));

          return (
            <li key={roll.id}>
              <div className={styles.rollHeader}>
                <span className={styles.text}>{roll.text}</span>
                {/* Show buttons after animation completes, but result is available immediately */}
                {isComplete && result !== null && (
                  <div className={styles.buttonGroup}>
                    <button
                      className={styles.rerollButton}
                      onClick={() => handleReroll(roll.id)}
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
                dice={controlledDice}
                modifier={roll.modifier}
                rollId={roll.id}
                onDieStopped={(dieId) => handleDieStopped(roll.id, dieId)}
                onDiceUpdate={handleDiceUpdate}
                onRollComplete={handleRollComplete}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

