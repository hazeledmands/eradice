import React, { useState, useEffect, useRef } from 'react';
import { generateRandomFace } from '../../dice/randomGenerator';
import type { DieState } from '../../dice/types';
import styles from './Die.module.css';

// Animation frame throttling (milliseconds between updates)
const DICE_UPDATE_INTERVAL = 50;

interface DieProps {
  state: 'rolling' | 'stopped';
  finalNumber?: number | null;
  isExploding?: boolean;
  canExplodeFail?: boolean;
  isCancelled?: boolean;
  isCpDie?: boolean;
  chainDepth?: number;
  skipAnimation?: boolean;
}

/**
 * Controlled die component - displays based on state prop
 * Parent component handles all state transitions and timeouts
 */
export default function Die({
  state,
  finalNumber,
  isExploding,
  canExplodeFail,
  isCancelled,
  isCpDie,
  chainDepth,
  skipAnimation,
}: DieProps) {
  // Display number - random during rolling, finalNumber when stopped
  const [displayNumber, setDisplayNumber] = useState(generateRandomFace());
  const lastUpdateTsRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const displayNumberRef = useRef(displayNumber);

  // Explosion visual states
  const [isBursting, setIsBursting] = useState(false);
  const [isGlitching, setIsGlitching] = useState(false);
  const [isSettled, setIsSettled] = useState(false);
  const [isSettledQuiet, setIsSettledQuiet] = useState(false);
  const [isCancelledSurging, setIsCancelledSurging] = useState(false);

  const prevStateRef = useRef(state);
  const prevCancelledRef = useRef(isCancelled);

  // Update display number ref
  useEffect(() => {
    displayNumberRef.current = displayNumber;
  }, [displayNumber]);

  // When stopped, show finalNumber
  useEffect(() => {
    if (state === 'stopped' && finalNumber != null) {
      setDisplayNumber(finalNumber);
    }
  }, [state, finalNumber]);

  // Detect rolling → stopped transition for explosion effects
  useEffect(() => {
    const prevState = prevStateRef.current;
    prevStateRef.current = state;

    if (prevState === 'rolling' && state === 'stopped' && !skipAnimation && isExploding) {
      if (finalNumber === 6) {
        setIsBursting(true);
        const timer = setTimeout(() => {
          setIsBursting(false);
          setIsSettled(true);
        }, 500);
        return () => clearTimeout(timer);
      } else if (canExplodeFail && finalNumber === 1) {
        setIsGlitching(true);
        const timer = setTimeout(() => {
          setIsGlitching(false);
        }, 2500);
        return () => clearTimeout(timer);
      } else {
        setIsSettledQuiet(true);
      }
    }

    // Skip animation path — go directly to settled state
    if (skipAnimation && state === 'stopped' && isExploding) {
      if (finalNumber === 6) {
        setIsSettled(true);
      } else {
        setIsSettledQuiet(true);
      }
    }
  }, [state, finalNumber, isExploding, canExplodeFail, isCpDie, skipAnimation]);

  // Detect isCancelled transition for surge animation
  useEffect(() => {
    const prevCancelled = prevCancelledRef.current;
    prevCancelledRef.current = isCancelled;

    if (!prevCancelled && isCancelled && !skipAnimation) {
      setIsCancelledSurging(true);
      const timer = setTimeout(() => {
        setIsCancelledSurging(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isCancelled, skipAnimation]);

  // Animation effect - only runs when state is "rolling"
  useEffect(() => {
    if (state !== 'rolling') {
      // Clean up if not rolling
      if (timerRef.current) {
        cancelAnimationFrame(timerRef.current);
        timerRef.current = null;
      }
      lastUpdateTsRef.current = null;
      return;
    }

    // Reset when starting to roll
    lastUpdateTsRef.current = null;

    // Start with a random number (not the final number)
    let initialNumber: number;
    do {
      initialNumber = generateRandomFace();
    } while (finalNumber != null && initialNumber === finalNumber);
    setDisplayNumber(initialNumber);

    // Animation loop
    const animate = (ts: number) => {
      // Check if we're still rolling (parent may have changed state)
      if (state !== 'rolling') {
        if (timerRef.current) {
          cancelAnimationFrame(timerRef.current);
          timerRef.current = null;
        }
        return;
      }

      // Update display number periodically during animation
      if (lastUpdateTsRef.current == null) {
        lastUpdateTsRef.current = ts;
      }

      const timeSinceLastUpdate = ts - lastUpdateTsRef.current;
      if (timeSinceLastUpdate >= DICE_UPDATE_INTERVAL) {
        lastUpdateTsRef.current = ts;
        let newNumber: number;
        // Show random numbers during animation (avoid finalNumber if set)
        do {
          newNumber = generateRandomFace();
        } while (
          newNumber === displayNumberRef.current ||
          (finalNumber != null && newNumber === finalNumber)
        );
        setDisplayNumber(newNumber);
      }

      // Continue animation
      timerRef.current = requestAnimationFrame(animate);
    };

    timerRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      if (timerRef.current) {
        cancelAnimationFrame(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state, finalNumber]);

  // Build class name
  let className = styles.DieView;
  if (isCpDie) {
    className += ` ${styles.cpDie}`;
  }
  if (isExploding) {
    if (isBursting) {
      className += ` ${styles.exploding} ${styles.bursting}`;
    } else if (isGlitching) {
      className += ` ${styles.glitching}`;
    } else if (isSettled) {
      className += ` ${styles.settled}`;
    } else if (isSettledQuiet) {
      className += ` ${styles.settledQuiet}`;
    } else {
      className += ` ${styles.exploding}`;
    }
  }
  if (isCancelledSurging) {
    className += ` ${styles.cancelledSurging}`;
  } else if (isCancelled) {
    className += ` ${styles.cancelled}`;
  }

  // Pass --chain-depth as CSS custom property
  const dieStyle: React.CSSProperties = {};
  if (chainDepth != null && chainDepth > 0) {
    (dieStyle as any)['--chain-depth'] = chainDepth;
  }

  return <div className={className} style={dieStyle}>{displayNumber}</div>;
}
