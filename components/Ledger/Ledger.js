import React, { useState, useEffect } from 'react';
import DiceTray from '../DiceTray/DiceTray';
import styles from './Ledger.module.css';

/**
 * Component that displays the history of all rolls
 * Controls when individual dice should roll or finish rolling
 */
export default function Ledger({ rolls, onRollComplete }) {
  const [completedRolls, setCompletedRolls] = useState({});
  // Track rolling state for each die in each roll - Ledger controls this
  const [diceRollingStates, setDiceRollingStates] = useState({});

  useEffect(() => {
      // Initialize tracking for new rolls and start them rolling
      // Also detect when dice change in existing rolls (exploding dice)
    setDiceRollingStates(prevState => {
      const updated = { ...prevState };
      let hasChanges = false;

      rolls.forEach(roll => {
        if (!roll.dice || roll.dice.length === 0) return;

        // Check if this roll is new or if dice have changed
        const existingState = updated[roll.id] || {};
        const existingDieIds = new Set(Object.keys(existingState).map(Number));
        const currentDieIds = new Set(roll.dice.map(d => d.id));

        // Detect new dice (exploding dice)
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

  return (
    <div className={styles.Ledger}>
      <ul>
        {rolls.map(roll => {
          // Check rolling state from Ledger's control
          const rollStates = diceRollingStates[roll.id] || {};

          // Enhance dice with controlled isRolling state from Ledger
          const controlledDice = roll.dice.map(die => ({
            ...die,
            isRolling: rollStates[die.id] ?? die.isRolling ?? false,
          }));

          // Create roll object with controlled dice
          const controlledRoll = {
            ...roll,
            dice: controlledDice,
          };

          return (
            <li key={roll.id}>
              <div className={styles.rollHeader}>
                <span className={styles.text}>{roll.text}</span>
              </div>
              <DiceTray
                roll={controlledRoll}
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

