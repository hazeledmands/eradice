import React, { useState, useEffect } from 'react';
import DiceTray from '../DiceTray/DiceTray';
import type { Roll, Die } from '../../dice/types';
import styles from './Ledger.module.css';

interface LedgerProps {
  rolls: Roll[];
}

/**
 * Component that displays the history of all rolls
 * Controls when individual dice should roll or finish rolling
 * Animates dice sequentially: first diceCount dice, then exploding dice one by one
 */
export default function Ledger({ rolls }: LedgerProps) {
  const [completedRolls, setCompletedRolls] = useState<Record<number, boolean>>({});
  // Track rolling state for each die in each roll - Ledger controls this
  const [diceRollingStates, setDiceRollingStates] = useState<
    Record<number, Record<number, boolean>>
  >({});

  useEffect(() => {
    // Initialize new rolls: start only the first diceCount dice rolling
    const newRolls = rolls.filter((roll) => !completedRolls[roll.id]);
    if (newRolls.length > 0) {
      setDiceRollingStates((prevState) => {
        const updated = { ...prevState };
        let hasChanges = false;

        newRolls.forEach((roll) => {
          if (!roll.dice || roll.dice.length === 0) return;
          if (updated[roll.id]) return; // Already initialized

          updated[roll.id] = {};
          
          // Start only the first diceCount dice rolling
          const diceToStart = roll.dice.slice(0, roll.diceCount);
          diceToStart.forEach((die) => {
            updated[roll.id][die.id] = true;
          });
          
          hasChanges = true;
        });

        return hasChanges ? updated : prevState;
      });

      setCompletedRolls((prevState) => {
        const updated = { ...prevState };
        newRolls.forEach((roll) => {
          updated[roll.id] = false;
        });
        return updated;
      });
    }
  }, [rolls, completedRolls]);

  const handleDieStopped = (rollId: number, dieId: number) => {
    const roll = rolls.find((r) => r.id === rollId);
    if (!roll) return;

    // Update the rolling state for this specific die
    setDiceRollingStates((prevState) => {
      const updated = { ...prevState };
      if (!updated[rollId]) {
        updated[rollId] = {};
      }
      updated[rollId][dieId] = false;

      // Find which die index this was
      const dieIndex = roll.dice.findIndex((d) => d.id === dieId);
      const rollState = updated[rollId];
      
      // Check if all initial diceCount dice have completed
      const initialDice = roll.dice.slice(0, roll.diceCount);
      const allInitialDiceStopped = initialDice.every(
        (die) => rollState[die.id] === false || rollState[die.id] === undefined
      );
      
      // If all initial dice have stopped and we haven't started exploding dice yet,
      // start the first exploding die
      if (allInitialDiceStopped && dieIndex < roll.diceCount && roll.dice.length > roll.diceCount) {
        const firstExplodingDie = roll.dice[roll.diceCount];
        if (firstExplodingDie && rollState[firstExplodingDie.id] === undefined) {
          updated[rollId][firstExplodingDie.id] = true;
        }
      }
      
      // If this was an exploding die, start the next one if it exists
      if (dieIndex >= roll.diceCount) {
        const nextIndex = dieIndex + 1;
        if (nextIndex < roll.dice.length) {
          const nextExplodingDie = roll.dice[nextIndex];
          if (nextExplodingDie && rollState[nextExplodingDie.id] === undefined) {
            updated[rollId][nextExplodingDie.id] = true;
          }
        }
      }

      // Check if all dice are now complete
      const allStopped = roll.dice.every(
        (die) => rollState[die.id] === false || rollState[die.id] === undefined
      );
      
      if (allStopped) {
        setCompletedRolls((prevCompleted) => ({
          ...prevCompleted,
          [rollId]: true,
        }));
      }

      return updated;
    });
  };

  return (
    <div className={styles.Ledger}>
      <ul>
        {rolls.map((roll) => {
          // Check rolling state from Ledger's control
          const rollStates = diceRollingStates[roll.id] || {};

          // Enhance dice with controlled isRolling state from Ledger
          const controlledDice = roll.dice.map((die) => ({
            ...die,
            isRolling: rollStates[die.id] ?? die.isRolling ?? false,
          }));

          // Create roll object with controlled dice
          const controlledRoll: Roll = {
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
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

