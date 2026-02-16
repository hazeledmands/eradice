import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Die from '../Die/Die';
import { calculateRollResult, generateCopyText } from '../../dice/calculations';
import { copyToClipboard } from '../../utils/clipboard';
import type { Roll, RoomRoll } from '../../dice/types';
import styles from './DiceTray.module.css';

interface DiceTrayProps {
  roll: Roll | null;
  onReroll?: (roll: Roll) => void;
  onSpendCp?: (rollId: number, count: number) => void;
  canSpendCp?: boolean;
}

/**
 * Component that displays a group of dice for a single roll
 * Manages all state timing logic including sequential animation:
 * - Starts first diceCount dice rolling
 * - Then animates exploding dice one by one
 */
export default function DiceTray({ roll, onReroll, onSpendCp, canSpendCp }: DiceTrayProps) {
  const [diceCompleteStates, setDiceCompleteStates] = useState<boolean[]>([]);
  const [showCpPicker, setShowCpPicker] = useState(false);
  const prevDiceCountRef = useRef(0);

  // Tray-level explosion effects
  const [trayBursting, setTrayBursting] = useState(false);
  const [glitchActive, setGlitchActive] = useState(false);
  const [cancellationRevealed, setCancellationRevealed] = useState(false);
  const [activeChainLength, setActiveChainLength] = useState(0);

  // Compute shouldAnimate as a memo so it can be used in multiple places
  const shouldAnimate = useMemo(() => {
    if (!roll?.dice?.length) return false;
    if ('shouldAnimate' in roll) {
      return (roll as RoomRoll).shouldAnimate;
    }
    if (roll?.date) {
      const rollDate = new Date(roll.date);
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      return rollDate > oneMinuteAgo;
    }
    return true;
  }, [roll]);

  useEffect(() => {
      if (!roll?.dice?.length) {
        setDiceCompleteStates([]);
        prevDiceCountRef.current = 0;
        return;
      }

      const currentDiceCount = roll.dice.length;
      const prevDiceCount = prevDiceCountRef.current;
      prevDiceCountRef.current = currentDiceCount;

      // CP dice appended: keep existing states as complete, add false for new dice
      if (prevDiceCount > 0 && currentDiceCount > prevDiceCount) {
        setDiceCompleteStates((prev) => {
          const extended = new Array<boolean>(currentDiceCount).fill(false);
          for (let i = 0; i < prev.length; i++) {
            extended[i] = true;
          }
          return extended;
        });
        setShowCpPicker(false);
        return;
      }

      // Reset tray effects on new roll
      setTrayBursting(false);
      setGlitchActive(false);
      setCancellationRevealed(false);
      setActiveChainLength(0);

      // If roll is older than a minute, skip animation and show all dice as complete
      if (!shouldAnimate) {
        setDiceCompleteStates(new Array<boolean>(roll.dice.length).fill(true));
        return;
      }

      const timeoutRefs: NodeJS.Timeout[] = [];

      // Start the first diceCount dice rolling
      const newCompleteStates = new Array<boolean>(roll.dice.length).fill(false);
      for (let i = 0; i < roll.diceCount; i++) {
        if (!roll.dice[i].stopAfter) {
          continue;
        }
        timeoutRefs.push(setTimeout(() => {
          handleDieStopped(i);
        }, roll.dice[i].stopAfter));
      }
      setDiceCompleteStates(newCompleteStates);

      return () => {
        for (const timeout of timeoutRefs) {
          clearTimeout(timeout);
        }
      };
  }, [roll]);

  const handleDieStopped = useCallback((dieIndex: number) => {
    setDiceCompleteStates((prevState) => {
      const updated = [...prevState];
      updated[dieIndex] = true;
      return updated;
    });
  }, []);

  useEffect(() => {
    if (!roll || diceCompleteStates.length === 0) return;

    // iterate until we find a die that is not complete
    let i = 0;
    for (; i < roll.dice.length; i++) {
      if (!diceCompleteStates[i]) { break; }
    }

    // If we're completely done, finish
    if (i >= roll.dice.length) {
      return;
    }

    // if we're still rolling the first diceCount dice, wait til they finish
    if (i < roll.diceCount) {
      return;
    }

    // set a timeout for the next exploding/CP die
    const timeoutRef = setTimeout(() => handleDieStopped(i), roll.dice[i].stopAfter);
    return () => clearTimeout(timeoutRef);
  }, [diceCompleteStates, roll, handleDieStopped]);

  // Chain tracking: count completed exploding dice that rolled 6
  useEffect(() => {
    if (!roll || !shouldAnimate) return;

    let chainLen = 0;
    for (let i = 0; i < roll.dice.length; i++) {
      const die = roll.dice[i];
      if (die.isCpDie) continue;
      if (die.chainDepth != null && diceCompleteStates[i] && die.finalNumber === 6) {
        chainLen++;
      }
    }
    setActiveChainLength(chainLen);

    if (chainLen >= 2 && !trayBursting) {
      setTrayBursting(true);
      const duration = 500 + (chainLen - 2) * 80;
      const timer = setTimeout(() => setTrayBursting(false), duration);
      return () => clearTimeout(timer);
    }
  }, [diceCompleteStates, roll, shouldAnimate]);

  // Cancellation timing: reveal cancelled dice early when exploding die rolls 1
  useEffect(() => {
    if (!roll || !shouldAnimate) return;

    for (let i = 0; i < roll.dice.length; i++) {
      const die = roll.dice[i];
      if (die.canExplodeFail && diceCompleteStates[i] && die.finalNumber === 1) {
        if (!cancellationRevealed) {
          setCancellationRevealed(true);
          setGlitchActive(true);
          const timer = setTimeout(() => setGlitchActive(false), 2000);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [diceCompleteStates, roll, shouldAnimate, cancellationRevealed]);


  const isComplete = useMemo(() => {
    return diceCompleteStates.length > 0 && diceCompleteStates.every((state) => state);
  }, [diceCompleteStates]);

  // Use finalNumber for calculations (available immediately, not waiting for animation)
  // Can calculate result even while dice are still animating
  const totalFaces = (roll?.dice || [])
    .filter((die) => !die.isCancelled && die.finalNumber != null)
    .reduce((acc, die) => (die.finalNumber ?? 0) + acc, 0);

  const mathText: string[] = [];
  // Show calculation as soon as we have finalNumbers (can show while animating)
  const hasAllFinalNumbers =
    (roll?.dice || []).length > 0 && (roll?.dice || []).every((die) => die.finalNumber != null);
  const hasCancelledDice = (roll?.dice || []).some((die) => die.isCancelled);
  if (hasAllFinalNumbers && ((roll?.dice || []).length > 1 || hasCancelledDice)) mathText.push(`= ${totalFaces}`);
  if ((roll?.modifier || 0) > 0) mathText.push(`+ ${roll?.modifier || 0}`);
  if (hasAllFinalNumbers && (roll?.modifier || 0) > 0)
    mathText.push(`= ${(roll?.modifier || 0) + totalFaces}`);

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

  const handleCpSpend = (count: number) => {
    if (!roll || !onSpendCp) return;
    onSpendCp(roll.id, count);
  };

  // Build tray class name
  let trayClassName = styles.DiceTray;
  if (trayBursting) trayClassName += ` ${styles.trayBursting}`;
  if (glitchActive) trayClassName += ` ${styles.trayGlitch}`;

  // Tray inline style for --chain-length
  const trayStyle: React.CSSProperties = {};
  if (activeChainLength >= 2) {
    (trayStyle as any)['--chain-length'] = activeChainLength;
  }

  return (
    <div className={trayClassName} style={trayStyle}>
      <div className={styles.controls}>
        {(roll?.dice || []).map((die, dieIndex) => {
          // Hide explosion/CP dice until the previous die has stopped,
          // so they don't spoil the surprise of the preceding die's result
          if (shouldAnimate && dieIndex >= (roll?.diceCount ?? 0) && !diceCompleteStates[dieIndex - 1]) {
            return null;
          }
          return (
            <Die
              key={die.id}
              state={diceCompleteStates[dieIndex] ? 'stopped' : 'rolling'}
              finalNumber={die.finalNumber}
              isExploding={die.isExploding}
              isCancelled={die.isCancelled && (cancellationRevealed || isComplete || !shouldAnimate)}
              isCpDie={die.isCpDie}
              chainDepth={die.chainDepth}
              skipAnimation={!shouldAnimate}
            />
          );
        })}
      </div>
      <div className={styles.bottomRow}>
        {isComplete && (<React.Fragment>
          <div className={styles.Math}>{mathText.join(' ')}</div>
          <div className={styles.actionButtons}>
            <button
              className={styles.copyButton}
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              Copy
            </button>
            {onReroll && roll && (
              <button
                className={styles.rerollButton}
                onClick={() => onReroll(roll)}
                title="Reroll with same dice"
              >
                Reroll
              </button>
            )}
            {canSpendCp && onSpendCp && roll && (
              showCpPicker ? (
                <div className={styles.cpPicker}>
                  <button
                    className={styles.cpPickerButton}
                    onClick={() => handleCpSpend(1)}
                  >
                    1 CP
                  </button>
                  <button
                    className={styles.cpPickerButton}
                    onClick={() => handleCpSpend(2)}
                  >
                    2 CP
                  </button>
                  <button
                    className={styles.cpCancelButton}
                    onClick={() => setShowCpPicker(false)}
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <button
                  className={styles.cpButton}
                  onClick={() => setShowCpPicker(true)}
                  title="Spend Character Points"
                >
                  Spend CP
                </button>
              )
            )}
          </div>
        </React.Fragment>)}
      </div>
    </div>
  );
}
