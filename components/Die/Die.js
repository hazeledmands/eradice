import React, { useState, useEffect, useRef } from 'react';
import { generateRandomFace } from '../../utils/randomGenerator';
import { DICE_UPDATE_INTERVAL } from '../../constants/dice';
import styles from './Die.module.css';

/**
 * Individual die component with rolling animation
 * The finalNumber is pre-calculated immediately, and animation is purely visual
 */
export default function Die({ 
  id, 
  finalNumber, 
  isRolling: initialIsRolling, 
  stopAfter,
  isExploding, 
  isCancelled,
  onStopped 
}) {
  // Display number - starts as random for animation, resolves to finalNumber when done
  const [displayNumber, setDisplayNumber] = useState(generateRandomFace());
  const [isRolling, setIsRolling] = useState(initialIsRolling);
  const startTsRef = useRef(null);
  const lastUpdateTsRef = useRef(null);
  const timerRef = useRef(null);
  const stopAfterRef = useRef(stopAfter);
  const onStoppedRef = useRef(onStopped);
  const hasStoppedRef = useRef(false);
  const currentDisplayNumberRef = useRef(displayNumber);
  const finalNumberRef = useRef(finalNumber);

  // Update refs when props change
  useEffect(() => {
    stopAfterRef.current = stopAfter;
    onStoppedRef.current = onStopped;
    finalNumberRef.current = finalNumber;
  }, [stopAfter, onStopped, finalNumber]);

  // Update current display number ref
  useEffect(() => {
    currentDisplayNumberRef.current = displayNumber;
  }, [displayNumber]);

  // When finalNumber changes (e.g., on reroll), update display if not rolling
  useEffect(() => {
    if (!isRolling && finalNumber != null) {
      setDisplayNumber(finalNumber);
    }
  }, [finalNumber, isRolling]);

  useEffect(() => {
    if (isRolling && stopAfter) {
      hasStoppedRef.current = false;
      startTsRef.current = null;
      lastUpdateTsRef.current = null;
      // Reset display to a random number for animation (not the final number)
      let initialDisplayNumber;
      do {
        initialDisplayNumber = generateRandomFace();
      } while (initialDisplayNumber === finalNumberRef.current);
      setDisplayNumber(initialDisplayNumber);
      roll();
    }

    return () => {
      if (timerRef.current) {
        cancelAnimationFrame(timerRef.current);
      }
    };
  }, [isRolling, stopAfter]);

  useEffect(() => {
    if (!isRolling && !hasStoppedRef.current) {
      hasStoppedRef.current = true;
      // Set display to final number when animation completes
      if (finalNumberRef.current != null) {
        setDisplayNumber(finalNumberRef.current);
      }
      // Notify parent that animation is complete (no number needed, it's already in finalNumber)
      if (onStoppedRef.current) {
        onStoppedRef.current();
      }
    }
  }, [isRolling]);

  const roll = () => {
    timerRef.current = requestAnimationFrame((ts) => {
      if (startTsRef.current == null) {
        startTsRef.current = ts;
      }
      
      const elapsedSinceStart = ts - startTsRef.current;
      if (elapsedSinceStart > stopAfterRef.current) {
        setIsRolling(false);
        return;
      }

      if (lastUpdateTsRef.current == null) {
        lastUpdateTsRef.current = 0;
      }
      
      const elapsedBetweenUpdates = ts - lastUpdateTsRef.current;
      if (elapsedBetweenUpdates > DICE_UPDATE_INTERVAL) {
        lastUpdateTsRef.current = ts;
        let newNumber;
        // Ensure we get a different number for animation
        // During animation, show random numbers (but not the final number until animation completes)
        while (newNumber === currentDisplayNumberRef.current || 
               newNumber === finalNumberRef.current) {
          newNumber = generateRandomFace();
        }
        setDisplayNumber(newNumber);
      }
      
      roll();
    });
  };

  let className = styles.DieView;
  if (isExploding) className += ` ${styles.exploding}`;
  if (isCancelled) className += ` ${styles.cancelled}`;
  
  return <div className={className}>{displayNumber}</div>;
}

