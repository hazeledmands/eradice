import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Die from '../Die/Die';
import { calculateRollResult, generateCopyText } from '../../dice/calculations';
import { copyToClipboard } from '../../utils/clipboard';
import type { Roll } from '../../dice/types';
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

  // Only animate rolls explicitly flagged (newly created or incoming from room)
  const shouldAnimate = useMemo(() => {
    if (!roll?.dice?.length) return false;
    return roll.shouldAnimate === true;
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
  const dice = roll?.dice || [];
  const totalFaces = dice
    .filter((die) => !die.isCancelled && die.finalNumber != null)
    .reduce((acc, die) => (die.finalNumber ?? 0) + acc, 0);

  const hasAllFinalNumbers = dice.length > 0 && dice.every((die) => die.finalNumber != null);
  const hasCancelledDice = dice.some((die) => die.isCancelled);
  const hasCpDice = dice.some((die) => die.isCpDie);

  // Detect critical success (explosion chain) and critical failure (cancellation)
  const hasCritSuccess = dice.some((die) => die.chainDepth != null && die.chainDepth >= 1);
  const hasCritFail = dice.some((die) => die.canExplodeFail && die.finalNumber === 1);

  // Show detailed math breakdown for crits and CP rolls
  const showDetailedMath = hasAllFinalNumbers && (hasCritSuccess || hasCritFail || hasCpDice);
  const modifier = roll?.modifier || 0;

  const mathContent = useMemo(() => {
    if (!hasAllFinalNumbers) return null;

    if (showDetailedMath) {
      const parts: string[] = [];
      const nonCpDice = dice.filter((d) => !d.isCpDie);
      const cpDice = dice.filter((d) => d.isCpDie);
      const cpSum = cpDice.reduce((acc, d) => (d.finalNumber ?? 0) + acc, 0);

      if (hasCritFail) {
        // Raw sum of all non-CP dice, minus what was cancelled
        const rawSum = nonCpDice.reduce((acc, d) => (d.finalNumber ?? 0) + acc, 0);
        const cancelledSum = dice
          .filter((d) => d.isCancelled)
          .reduce((acc, d) => (d.finalNumber ?? 0) + acc, 0);
        parts.push(`${rawSum} \u2212 ${cancelledSum}`);
      } else {
        // Crit success or CP: base dice + chain dice
        const baseDice = nonCpDice.filter((d) => !d.isExploding);
        const chainDice = nonCpDice.filter((d) => d.isExploding);
        const baseSum = baseDice.reduce((acc, d) => (d.finalNumber ?? 0) + acc, 0);
        const chainSum = chainDice.reduce((acc, d) => (d.finalNumber ?? 0) + acc, 0);

        if (chainSum > 0) {
          parts.push(`${baseSum} + ${chainSum}`);
        } else {
          parts.push(`${baseSum}`);
        }
      }

      if (cpSum > 0) parts.push(`+ ${cpSum}`);
      if (modifier > 0) parts.push(`+ ${modifier}`);
      parts.push(`= ${totalFaces + modifier}`);
      return parts.join(' ');
    }

    // Simple math (no crits/CP)
    const text: string[] = [];
    if (dice.length > 1 || hasCancelledDice) text.push(`= ${totalFaces}`);
    if (modifier > 0) text.push(`+ ${modifier}`);
    if (modifier > 0) text.push(`= ${modifier + totalFaces}`);
    return text.length > 0 ? text.join(' ') : null;
  }, [hasAllFinalNumbers, showDetailedMath, dice, modifier, totalFaces, hasCancelledDice, hasCritFail]);

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
              canExplodeFail={die.canExplodeFail}
              isCancelled={die.isCancelled && (cancellationRevealed || isComplete || !shouldAnimate)}
              isCpDie={die.isCpDie}
              chainDepth={die.chainDepth}
              skipAnimation={!shouldAnimate}
            />
          );
        })}
      </div>
      {hasCritSuccess && isComplete && (
        <div className={styles.critSuccess}>Critical Success</div>
      )}
      {hasCritFail && (cancellationRevealed || (isComplete && !shouldAnimate)) && (
        <div className={styles.critFail}>Critical Failure</div>
      )}
      <div className={styles.bottomRow}>
        {isComplete && (<React.Fragment>
          {mathContent && <div className={styles.Math}>{mathContent}</div>}
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
