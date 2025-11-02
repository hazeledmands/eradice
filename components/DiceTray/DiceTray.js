import React, { useState, useEffect, useCallback } from 'react';
import Die from '../Die/Die';
import { EXPLODE_SUCCESS_VALUE, EXPLODE_FAIL_VALUE } from '../../constants/dice';
import { generateRollDuration, generateRandomFace } from '../../utils/randomGenerator';
import styles from './DiceTray.module.css';

/**
 * Component that displays a group of dice for a single roll
 */
export default function DiceTray({ 
  dice: initialDice, 
  modifier,
  rollId,
  onDieStopped,
  onDiceUpdate,
  onRollComplete 
}) {
  const [dice, setDice] = useState(initialDice);
  const [hasReportedComplete, setHasReportedComplete] = useState(false);

  useEffect(() => {
    if (initialDice !== dice) {
      setDice(initialDice);
      setHasReportedComplete(false);
    }
  }, [initialDice, dice]);

  useEffect(() => {
    const isComplete = dice.every(die => !die.isRolling);
    if (isComplete && !hasReportedComplete && onRollComplete) {
      setHasReportedComplete(true);
      onRollComplete(rollId, dice);
    }
  }, [dice, hasReportedComplete, onRollComplete, rollId]);

  const handleDieStopped = useCallback((dieId) => {
    // Notify parent (Ledger) that this die has stopped
    if (onDieStopped) {
      onDieStopped(dieId);
    }

    setDice(prevDice => {
      const stoppedDie = prevDice.find(d => d.id === dieId);
      if (!stoppedDie) return prevDice;

      // Use finalNumber for explosion logic (pre-calculated)
      const finalNumber = stoppedDie.finalNumber;
      if (finalNumber == null) return prevDice;

      const didExplodeSucceed = stoppedDie.canExplodeSucceed && finalNumber === EXPLODE_SUCCESS_VALUE;
      const didExplodeFail = stoppedDie.canExplodeFail && finalNumber === EXPLODE_FAIL_VALUE;

      let updatedDice = prevDice.map(d => {
        if (d.id !== dieId) return d;
        // Note: isRolling state is controlled by Ledger, don't set it here
        return { ...d, isCancelled: didExplodeFail };
      });

      // Add exploding die if success
      if (didExplodeSucceed) {
        const newDie = {
          id: Math.max(...prevDice.map(d => d.id), -1) + 1,
          isRolling: false, // Ledger will control this
          isExploding: true,
          canExplodeSucceed: true,
          canExplodeFail: false,
          finalNumber: generateRandomFace(), // Pre-calculate the exploding die's result
          stopAfter: generateRollDuration(),
        };
        updatedDice = [...updatedDice, newDie];
        // Notify parent about the dice update so Ledger can control the new die
        if (onDiceUpdate) {
          onDiceUpdate(rollId, updatedDice);
        }
      }

      // Check if all dice are complete to apply cancellation logic
      const isComplete = updatedDice.every(d => !d.isRolling);
      if (isComplete) {
        const failures = updatedDice.filter(
          d => d.canExplodeFail && d.finalNumber === EXPLODE_FAIL_VALUE
        ).length;

        // Cancel highest non-exploding dice based on failure count
        updatedDice
          .filter(d => !d.isExploding)
          .sort((a, b) => (b.finalNumber ?? 0) - (a.finalNumber ?? 0))
          .filter((d, i) => i < failures)
          .forEach(cancelDie => {
            updatedDice = updatedDice.map(d => {
              if (d.id !== cancelDie.id) return d;
              return { ...d, isCancelled: true };
            });
          });
      }

      return updatedDice;
    });
  }, [onDieStopped]);

  // isRolling is now controlled by Ledger via props
  const isComplete = dice.every(die => !die.isRolling);
  // Use finalNumber for calculations (available immediately, not waiting for animation)
  // Can calculate result even while dice are still animating
  const totalFaces = dice
    .filter(die => !die.isCancelled && die.finalNumber != null)
    .reduce((acc, die) => (die.finalNumber ?? 0) + acc, 0);

  const mathText = [];
  // Show calculation as soon as we have finalNumbers (can show while animating)
  const hasAllFinalNumbers = dice.length > 0 && dice.every(die => die.finalNumber != null);
  if (hasAllFinalNumbers && dice.length > 1) mathText.push(`= ${totalFaces}`);
  if (modifier > 0) mathText.push(`+ ${modifier}`);
  if (hasAllFinalNumbers && modifier > 0) mathText.push(`= ${modifier + totalFaces}`);

  return (
    <div className={styles.DiceTray}>
      {dice.map(die => (
        <Die
          key={die.id}
          {...die}
          onStopped={() => handleDieStopped(die.id)}
        />
      ))}
      <div className={styles.Math}>{mathText.join(' ')}</div>
    </div>
  );
}

