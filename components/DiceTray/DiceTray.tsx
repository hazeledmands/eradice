import React, { useState, useEffect, useRef, useCallback } from 'react';
import Die from '../Die/Die';
import { generateRollDuration } from '../../dice/randomGenerator';
import { calculateRollResult, generateCopyText } from '../../dice/calculations';
import { copyToClipboard } from '../../utils/clipboard';
import type { Roll } from '../../dice/types';
import styles from './DiceTray.module.css';

interface DiceTrayProps {
  roll: Roll | null;
}

/**
 * Component that displays a group of dice for a single roll
 * Manages all state timing logic including sequential animation:
 * - Starts first diceCount dice rolling
 * - Then animates exploding dice one by one
 */
export default function DiceTray({ roll }: DiceTrayProps) {
  const dice = roll?.dice || [];
  const modifier = roll?.modifier || 0;
  const diceCount = roll?.diceCount || 0;
  
  // Track die states: "rolling" | "stopped"
  const [dieStates, setDieStates] = useState<Record<number, 'rolling' | 'stopped'>>({});
  // Track which dice should be rolling (controlled by sequential animation logic)
  const [diceRollingStates, setDiceRollingStates] = useState<Record<number, boolean>>({});
  // Track if this roll has been initialized
  const [isInitialized, setIsInitialized] = useState(false);
  // Track if all dice have completed
  const [isComplete, setIsComplete] = useState(false);
  
  const timeoutRefs = useRef<Record<number, NodeJS.Timeout>>({});
  const prevRollIdRef = useRef<number | null>(null);

  // Reset state when roll changes
  useEffect(() => {
    if (!roll) {
      setIsInitialized(false);
      setIsComplete(false);
      setDieStates({});
      setDiceRollingStates({});
      return;
    }

    // If this is a new roll (different ID), reset everything
    if (prevRollIdRef.current !== roll.id) {
      prevRollIdRef.current = roll.id;
      setIsInitialized(false);
      setIsComplete(false);
      setDieStates({});
      setDiceRollingStates({});
      
      // Clear all existing timeouts
      Object.values(timeoutRefs.current).forEach((timeout) => {
        clearTimeout(timeout);
      });
      timeoutRefs.current = {};
    }
  }, [roll]);

  // Initialize new roll: start only the first diceCount dice rolling
  useEffect(() => {
    if (!roll || !dice.length || isInitialized) return;

    setIsInitialized(true);
    
    // Start only the first diceCount dice rolling
    const initialDice = dice.slice(0, diceCount);
    const newRollingStates: Record<number, boolean> = {};
    initialDice.forEach((die) => {
      newRollingStates[die.id] = true;
    });
    setDiceRollingStates(newRollingStates);
  }, [roll, dice, diceCount, isInitialized]);

  // Handle die stopped - manages sequential animation logic
  const handleDieStopped = useCallback((dieId: number) => {
    if (!roll) return;

    // Update the rolling state for this specific die
    setDiceRollingStates((prevState) => {
      const updated = { ...prevState };
      updated[dieId] = false;

      // Find which die index this was
      const dieIndex = dice.findIndex((d) => d.id === dieId);
      
      // Check if all initial diceCount dice have completed
      const initialDice = dice.slice(0, diceCount);
      const allInitialDiceStopped = initialDice.every(
        (die) => updated[die.id] === false || updated[die.id] === undefined
      );
      
      // If all initial dice have stopped and we haven't started exploding dice yet,
      // start the first exploding die
      if (allInitialDiceStopped && dieIndex < diceCount && dice.length > diceCount) {
        const firstExplodingDie = dice[diceCount];
        if (firstExplodingDie && updated[firstExplodingDie.id] === undefined) {
          updated[firstExplodingDie.id] = true;
        }
      }
      
      // If this was an exploding die, start the next one if it exists
      if (dieIndex >= diceCount) {
        const nextIndex = dieIndex + 1;
        if (nextIndex < dice.length) {
          const nextExplodingDie = dice[nextIndex];
          if (nextExplodingDie && updated[nextExplodingDie.id] === undefined) {
            updated[nextExplodingDie.id] = true;
          }
        }
      }

      // Check if all dice are now complete
      const allStopped = dice.every(
        (die) => updated[die.id] === false || updated[die.id] === undefined
      );
      
      if (allStopped) {
        setIsComplete(true);
      }

      return updated;
    });
  }, [roll, dice, diceCount]);

  // Initialize die states and set up timeouts when dice start rolling
  useEffect(() => {
    dice.forEach((die) => {
      const currentState = dieStates[die.id];
      const shouldBeRolling = diceRollingStates[die.id] === true;

      // If die should be rolling but isn't in state yet, start it
      if (shouldBeRolling && currentState !== 'rolling') {
        setDieStates((prev) => ({
          ...prev,
          [die.id]: 'rolling',
        }));

        // Clear any existing timeout for this die
        if (timeoutRefs.current[die.id]) {
          clearTimeout(timeoutRefs.current[die.id]);
        }

        // Set timeout to stop the die after stopAfter duration
        const duration = die.stopAfter || generateRollDuration();
        timeoutRefs.current[die.id] = setTimeout(() => {
          // Update state to stopped
          setDieStates((prev) => ({
            ...prev,
            [die.id]: 'stopped',
          }));

          // Notify that this die has stopped (handles sequential animation)
          handleDieStopped(die.id);

          // Clean up timeout ref
          delete timeoutRefs.current[die.id];
        }, duration);
      } else if (!shouldBeRolling && currentState === 'rolling') {
        // If die should not be rolling, stop it
        setDieStates((prev) => ({
          ...prev,
          [die.id]: 'stopped',
        }));

        // Clear timeout
        if (timeoutRefs.current[die.id]) {
          clearTimeout(timeoutRefs.current[die.id]);
          delete timeoutRefs.current[die.id];
        }
      } else if (!shouldBeRolling && currentState === undefined) {
        // Initialize stopped dice
        setDieStates((prev) => ({
          ...prev,
          [die.id]: 'stopped',
        }));
      }
    });

    // Cleanup function
    return () => {
      Object.values(timeoutRefs.current).forEach((timeout) => {
        clearTimeout(timeout);
      });
    };
  }, [dice, dieStates, diceRollingStates, handleDieStopped]);

  // Use finalNumber for calculations (available immediately, not waiting for animation)
  // Can calculate result even while dice are still animating
  const totalFaces = dice
    .filter((die) => !die.isCancelled && die.finalNumber != null)
    .reduce((acc, die) => (die.finalNumber ?? 0) + acc, 0);

  const mathText: string[] = [];
  // Show calculation as soon as we have finalNumbers (can show while animating)
  const hasAllFinalNumbers =
    dice.length > 0 && dice.every((die) => die.finalNumber != null);
  if (hasAllFinalNumbers && dice.length > 1) mathText.push(`= ${totalFaces}`);
  if (modifier > 0) mathText.push(`+ ${modifier}`);
  if (hasAllFinalNumbers && modifier > 0)
    mathText.push(`= ${modifier + totalFaces}`);

  // Calculate result for button display
  const result = roll ? calculateRollResult(roll) : null;

  const handleCopy = async () => {
    if (!roll) return;
    const copyText = generateCopyText(roll);
    if (!copyText) return;

    try {
      await copyToClipboard(copyText);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className={styles.DiceTray}>
      <div className={styles.controls}>
        {dice.map((die) => {
          const dieState =
            dieStates[die.id] || (diceRollingStates[die.id] === true ? 'rolling' : 'stopped');
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
      </div>
      <div className={styles.bottomRow}>
        <div className={styles.Math}>{mathText.join(' ')}</div>
        {/* Show button after animation completes, but result is available immediately */}
        {isComplete && result !== null && (
          <button
            className={styles.copyButton}
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            Copy
          </button>
        )}
      </div>
    </div>
  );
}

