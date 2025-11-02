import React, { useState, useEffect, useRef } from 'react';
import { generateRandomFace } from '../../utils/randomGenerator';
import { DICE_UPDATE_INTERVAL } from '../../constants/dice';
import styles from './Die.module.css';

/**
 * Dumb die component - just animates when rolling, shows value when done
 * All state control is handled by the parent (Ledger)
 */
export default function Die({ 
  id, 
  finalNumber, 
  isRolling, 
  stopAfter,
  isExploding, 
  isCancelled,
  onStopped 
}) {
  // Display number - random during animation, finalNumber when stopped
  const [displayNumber, setDisplayNumber] = useState(finalNumber ?? generateRandomFace());
  const startTsRef = useRef(null);
  const lastUpdateTsRef = useRef(null);
  const timerRef = useRef(null);
  const hasCalledStoppedRef = useRef(false);
  const displayNumberRef = useRef(displayNumber);

  // Update display number ref
  useEffect(() => {
    displayNumberRef.current = displayNumber;
  }, [displayNumber]);

  // When not rolling, show finalNumber
  useEffect(() => {
    if (!isRolling && finalNumber != null) {
      setDisplayNumber(finalNumber);
    }
  }, [isRolling, finalNumber]);

  // Reset stopped flag when starting a new roll
  useEffect(() => {
    if (isRolling) {
      hasCalledStoppedRef.current = false;
    }
  }, [isRolling]);

  // Animation effect - only runs when isRolling is true
  useEffect(() => {
    if (!isRolling || !stopAfter) {
      // Clean up if not rolling
      if (timerRef.current) {
        cancelAnimationFrame(timerRef.current);
        timerRef.current = null;
      }
      startTsRef.current = null;
      lastUpdateTsRef.current = null;
      return;
    }

    // If we've already called onStopped, don't start animating again
    // (wait for parent to set isRolling to false)
    if (hasCalledStoppedRef.current) {
      return;
    }

    // Reset when starting to roll
    startTsRef.current = null;
    lastUpdateTsRef.current = null;
    
    // Start with a random number (not the final number)
    let initialNumber;
    do {
      initialNumber = generateRandomFace();
    } while (initialNumber === finalNumber);
    setDisplayNumber(initialNumber);

    // Animation loop
    const animate = (ts) => {
      if (startTsRef.current == null) {
        startTsRef.current = ts;
      }
      
      const elapsed = ts - startTsRef.current;
      
      // Check if animation duration is complete
      if (elapsed >= stopAfter) {
        // Animation complete - notify parent and clean up
        if (!hasCalledStoppedRef.current && onStopped) {
          hasCalledStoppedRef.current = true;
          onStopped();
        }
        if (timerRef.current) {
          cancelAnimationFrame(timerRef.current);
          timerRef.current = null;
        }
        return;
      }

      // Update display number periodically during animation
      if (lastUpdateTsRef.current == null) {
        lastUpdateTsRef.current = 0;
      }
      
      const timeSinceLastUpdate = ts - lastUpdateTsRef.current;
      if (timeSinceLastUpdate >= DICE_UPDATE_INTERVAL) {
        lastUpdateTsRef.current = ts;
        let newNumber;
        // Show random numbers during animation (avoid finalNumber)
        do {
          newNumber = generateRandomFace();
        } while (newNumber === displayNumberRef.current || newNumber === finalNumber);
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
  }, [isRolling, stopAfter, finalNumber, onStopped]);

  let className = styles.DieView;
  if (isExploding) className += ` ${styles.exploding}`;
  if (isCancelled) className += ` ${styles.cancelled}`;
  
  return <div className={className}>{displayNumber}</div>;
}

