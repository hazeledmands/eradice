import React, { useState, useEffect, useRef } from 'react';
import { generateRandomFace } from '../../utils/randomGenerator';
import { DICE_UPDATE_INTERVAL } from '../../constants/dice';
import styles from './Die.module.css';

/**
 * Controlled die component - displays based on state prop
 * Parent component handles all state transitions and timeouts
 * 
 * @param {Object} props
 * @param {string} props.state - One of: "rolling" | "stopped"
 * @param {number} props.finalNumber - The final number to display when stopped
 * @param {boolean} props.isExploding - Whether this die is exploding
 * @param {boolean} props.isCancelled - Whether this die is cancelled
 */
export default function Die({ 
  state,
  finalNumber, 
  isExploding, 
  isCancelled
}) {
  // Display number - random during rolling, finalNumber when stopped
  const [displayNumber, setDisplayNumber] = useState(generateRandomFace());
  const lastUpdateTsRef = useRef(null);
  const timerRef = useRef(null);
  const displayNumberRef = useRef(displayNumber);

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
    let initialNumber;
    do {
      initialNumber = generateRandomFace();
    } while (finalNumber != null && initialNumber === finalNumber);
    setDisplayNumber(initialNumber);

    // Animation loop
    const animate = (ts) => {
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
        let newNumber;
        // Show random numbers during animation (avoid finalNumber if set)
        do {
          newNumber = generateRandomFace();
        } while (newNumber === displayNumberRef.current || (finalNumber != null && newNumber === finalNumber));
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

  let className = styles.DieView;
  if (isExploding) className += ` ${styles.exploding}`;
  if (isCancelled) className += ` ${styles.cancelled}`;
  
  return <div className={className}>{displayNumber}</div>;
}

