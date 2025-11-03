import React, { useState, useEffect, useRef } from 'react';
import Die from '../Die/Die';
import { generateRollDuration } from '../../dice/randomGenerator';
import { calculateRollResult, generateCopyText } from '../../dice/calculations';
import { copyToClipboard } from '../../utils/clipboard';
import type { Roll } from '../../dice/types';
import styles from './DiceTray.module.css';

interface DiceTrayProps {
  roll: Roll | null;
  onDieStopped?: (dieId: number) => void;
}

/**
 * Component that displays a group of dice for a single roll
 * Manages timeouts and state transitions for dice
 */
export default function DiceTray({
  roll,
  onDieStopped,
}: DiceTrayProps) {
  const dice = roll?.dice || [];
  const modifier = roll?.modifier || 0;
  // Track die states: "rolling" | "stopped"
  const [dieStates, setDieStates] = useState<Record<number, 'rolling' | 'stopped'>>({});
  const timeoutRefs = useRef<Record<number, NodeJS.Timeout>>({});


  // Initialize die states and set up timeouts when dice start rolling
  useEffect(() => {
    dice.forEach((die) => {
      const currentState = dieStates[die.id];

      // If die should be rolling but isn't in state yet, start it
      if (die.isRolling && currentState !== 'rolling') {
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

          // Notify parent that this die has stopped
          if (onDieStopped) {
            onDieStopped(die.id);
          }

          // Clean up timeout ref
          delete timeoutRefs.current[die.id];
        }, duration);
      } else if (!die.isRolling && currentState === 'rolling') {
        // If parent says die should not be rolling, stop it
        setDieStates((prev) => ({
          ...prev,
          [die.id]: 'stopped',
        }));

        // Clear timeout
        if (timeoutRefs.current[die.id]) {
          clearTimeout(timeoutRefs.current[die.id]);
          delete timeoutRefs.current[die.id];
        }
      } else if (!die.isRolling && currentState === undefined) {
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
  }, [dice, dieStates, onDieStopped]);

  // Check if dice are complete
  const isComplete = dice.every((die) => {
    const state = dieStates[die.id];
    return state === 'stopped' || (!die.isRolling && state === undefined);
  });

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
            dieStates[die.id] || (die.isRolling ? 'rolling' : 'stopped');
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

