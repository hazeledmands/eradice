import React, { useState, useEffect, useCallback, useRef } from 'react';
import Die from '../Die/Die';
import { EXPLODE_SUCCESS_VALUE, EXPLODE_FAIL_VALUE } from '../../constants/dice';
import { generateRollDuration, generateRandomFace } from '../../utils/randomGenerator';
import styles from './DiceTray.module.css';

/**
 * Component that displays a group of dice for a single roll
 * Manages timeouts and state transitions for dice
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
  // Track die states: "rolling" | "stopped"
  const [dieStates, setDieStates] = useState({});
  const [hasReportedComplete, setHasReportedComplete] = useState(false);
  const timeoutRefs = useRef({});
  const processedExplosionsRef = useRef(new Set());

  // Handle explosion logic when a die stops
  const handleDieExplosion = useCallback((dieId) => {
    // Prevent processing the same die twice
    if (processedExplosionsRef.current.has(dieId)) {
      return;
    }

    setDice(prevDice => {
      const die = prevDice.find(d => d.id === dieId);
      if (!die) return prevDice;

      processedExplosionsRef.current.add(dieId);

      // Use finalNumber for explosion logic (pre-calculated)
      const finalNumber = die.finalNumber;
      if (finalNumber == null) return prevDice;

      const didExplodeSucceed = die.canExplodeSucceed && finalNumber === EXPLODE_SUCCESS_VALUE;
      const didExplodeFail = die.canExplodeFail && finalNumber === EXPLODE_FAIL_VALUE;

      let updatedDice = prevDice.map(d => {
        if (d.id !== dieId) return d;
        return { ...d, isCancelled: didExplodeFail };
      });

      // Add exploding die if success
      if (didExplodeSucceed) {
        const newDie = {
          id: Math.max(...updatedDice.map(d => d.id), -1) + 1,
          isRolling: true, // Ledger will detect and start it
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

      return updatedDice;
    });
  }, [onDiceUpdate, rollId]);

  useEffect(() => {
    if (initialDice !== dice) {
      setDice(initialDice);
      setHasReportedComplete(false);
      // Reset processed explosions when dice change
      processedExplosionsRef.current.clear();
    }
  }, [initialDice, dice]);

  // Initialize die states and set up timeouts when dice start rolling
  useEffect(() => {
    dice.forEach(die => {
      const currentState = dieStates[die.id];
      
      // If die should be rolling but isn't in state yet, start it
      if (die.isRolling && currentState !== 'rolling') {
        setDieStates(prev => ({
          ...prev,
          [die.id]: 'rolling'
        }));

        // Clear any existing timeout for this die
        if (timeoutRefs.current[die.id]) {
          clearTimeout(timeoutRefs.current[die.id]);
        }

        // Set timeout to stop the die after stopAfter duration
        const duration = die.stopAfter || generateRollDuration();
        timeoutRefs.current[die.id] = setTimeout(() => {
          // Update state to stopped
          setDieStates(prev => ({
            ...prev,
            [die.id]: 'stopped'
          }));

          // Notify parent that this die has stopped
          if (onDieStopped) {
            onDieStopped(die.id);
          }

          // Handle explosion logic when die stops
          handleDieExplosion(die.id);

          // Clean up timeout ref
          delete timeoutRefs.current[die.id];
        }, duration);
      } else if (!die.isRolling && currentState === 'rolling') {
        // If parent says die should not be rolling, stop it
        setDieStates(prev => ({
          ...prev,
          [die.id]: 'stopped'
        }));

        // Clear timeout
        if (timeoutRefs.current[die.id]) {
          clearTimeout(timeoutRefs.current[die.id]);
          delete timeoutRefs.current[die.id];
        }
      } else if (!die.isRolling && currentState === undefined) {
        // Initialize stopped dice
        setDieStates(prev => ({
          ...prev,
          [die.id]: 'stopped'
        }));
      }
    });

    // Cleanup function
    return () => {
      Object.values(timeoutRefs.current).forEach(timeout => {
        clearTimeout(timeout);
      });
    };
  }, [dice, dieStates, onDieStopped, handleDieExplosion]);

  // Check for completion and trigger explosion logic
  useEffect(() => {
    const isComplete = dice.every(die => {
      const state = dieStates[die.id];
      return state === 'stopped' || (!die.isRolling && state === undefined);
    });

    if (isComplete && !hasReportedComplete && onRollComplete) {
      setHasReportedComplete(true);
      onRollComplete(rollId, dice);
    }
  }, [dice, dieStates, hasReportedComplete, onRollComplete, rollId]);

  // Check if all dice are complete and apply cancellation logic
  useEffect(() => {
    const isComplete = dice.every(die => {
      const state = dieStates[die.id];
      return state === 'stopped' || (!die.isRolling && state === undefined);
    });

    if (isComplete) {
      const failures = dice.filter(
        d => d.canExplodeFail && d.finalNumber === EXPLODE_FAIL_VALUE
      ).length;

      if (failures > 0) {
        // Cancel highest non-exploding dice based on failure count
        setDice(prevDice => {
          let updatedDice = [...prevDice];
          const needsUpdate = updatedDice
            .filter(d => !d.isExploding && !d.isCancelled)
            .sort((a, b) => (b.finalNumber ?? 0) - (a.finalNumber ?? 0))
            .filter((d, i) => i < failures);

          if (needsUpdate.length === 0) return prevDice;

          needsUpdate.forEach(cancelDie => {
            updatedDice = updatedDice.map(d => {
              if (d.id !== cancelDie.id) return d;
              return { ...d, isCancelled: true };
            });
          });
          return updatedDice;
        });
      }
    }
  }, [dice, dieStates]);

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
      {dice.map(die => {
        const dieState = dieStates[die.id] || (die.isRolling ? 'rolling' : 'stopped');
        return (
          <Die
            key={die.id}
            state={dieState}
            finalNumber={die.finalNumber}
            isExploding={die.isExploding}
            isCancelled={die.isCancelled}
          />
        );
      })}
      <div className={styles.Math}>{mathText.join(' ')}</div>
    </div>
  );
}

