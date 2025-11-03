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
  
  // Track which dice should be rolling (controlled by sequential animation logic)
  const [diceRollingStates, setDiceRollingStates] = useState<boolean[]>([]);
  // Track if all dice have completed
  const [isComplete, setIsComplete] = useState(false);
  
  const timeoutRefs = useRef<Record<number, NodeJS.Timeout>>({});
  const prevRollIdRef = useRef<number | null>(null);

  // Reset state when roll changes
  useEffect(() => {
    if (!roll) {
      setIsComplete(false);
      setDiceRollingStates([]);
      return;
    }

    // If this is a new roll (different ID), reset everything
    if (prevRollIdRef.current !== roll.id) {
      prevRollIdRef.current = roll.id;
      setIsComplete(false);
      setDiceRollingStates([]);
      
      // Clear all existing timeouts
      Object.values(timeoutRefs.current).forEach((timeout) => {
        clearTimeout(timeout);
      });
      timeoutRefs.current = {};
    }
  }, [roll]);

  // Initialize new roll: start only the first diceCount dice rolling
  useEffect(() => {
    if (!roll || !dice.length) return;
    
    // Start only the first diceCount dice rolling
    const newRollingStates = new Array<boolean>(dice.length).fill(false);
    for (let i = 0; i < diceCount; i++) {
      newRollingStates[i] = true;
    }
    setDiceRollingStates(newRollingStates);
  }, [roll, dice, diceCount]);

  // Handle die stopped - manages sequential animation logic
  const handleDieStopped = useCallback((dieIndex: number) => {
    if (!roll) return;

    // Update the rolling state for this specific die
    setDiceRollingStates((prevState) => {
      const updated = [...prevState];
      updated[dieIndex] = false;
      
      // Check if all initial diceCount dice have completed
      const allInitialDiceStopped = updated
        .slice(0, diceCount)
        .every((isRolling) => !isRolling);
      
      // If all initial dice have stopped and we haven't started exploding dice yet,
      // start the first exploding die
      if (allInitialDiceStopped && dieIndex < diceCount && dice.length > diceCount) {
        if (!updated[diceCount]) {
          updated[diceCount] = true;
        }
      }
      
      // If this was an exploding die, start the next one if it exists
      if (dieIndex >= diceCount) {
        const nextIndex = dieIndex + 1;
        if (nextIndex < dice.length && !updated[nextIndex]) {
          updated[nextIndex] = true;
        }
      }

      // Check if all dice are now complete
      const allStopped = updated.every((isRolling) => !isRolling);
      
      if (allStopped) {
        setIsComplete(true);
      }

      return updated;
    });
  }, [roll, dice, diceCount]);

  // Set up timeouts when dice start rolling
  useEffect(() => {
    dice.forEach((die, dieIndex) => {
      const shouldBeRolling = diceRollingStates[dieIndex] === true;
      const hasTimeout = timeoutRefs.current[dieIndex] !== undefined;

      // If die should be rolling but doesn't have a timeout yet, start it
      if (shouldBeRolling && !hasTimeout) {
        // Clear any existing timeout for this die (safety check)
        if (timeoutRefs.current[dieIndex]) {
          clearTimeout(timeoutRefs.current[dieIndex]);
        }

        // Set timeout to stop the die after stopAfter duration
        const duration = die.stopAfter || generateRollDuration();
        timeoutRefs.current[dieIndex] = setTimeout(() => {
          // Notify that this die has stopped (handles sequential animation)
          handleDieStopped(dieIndex);

          // Clean up timeout ref
          delete timeoutRefs.current[dieIndex];
        }, duration);
      } else if (!shouldBeRolling && hasTimeout) {
        // If die should not be rolling, clear its timeout
        if (timeoutRefs.current[dieIndex]) {
          clearTimeout(timeoutRefs.current[dieIndex]);
          delete timeoutRefs.current[dieIndex];
        }
      }
    });

    // Cleanup function
    return () => {
      Object.values(timeoutRefs.current).forEach((timeout) => {
        clearTimeout(timeout);
      });
    };
  }, [dice, diceRollingStates, handleDieStopped]);

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
        {dice.map((die, dieIndex) => {
          const dieState = diceRollingStates[dieIndex] === true ? 'rolling' : 'stopped';
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

