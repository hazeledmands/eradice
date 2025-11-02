import React, { useState, useEffect, useRef } from 'react';
import { generateRandomFace } from '../../utils/randomGenerator';
import { DICE_UPDATE_INTERVAL } from '../../constants/dice';
import styles from '../../styles/App.module.css';

/**
 * Individual die component with rolling animation
 */
export default function Die({ 
  id, 
  number: initialNumber, 
  isRolling: initialIsRolling, 
  stopAfter,
  isExploding, 
  isCancelled,
  onStopped 
}) {
  const [number, setNumber] = useState(initialNumber ?? generateRandomFace());
  const [isRolling, setIsRolling] = useState(initialIsRolling);
  const startTsRef = useRef(null);
  const lastUpdateTsRef = useRef(null);
  const timerRef = useRef(null);
  const stopAfterRef = useRef(stopAfter);
  const onStoppedRef = useRef(onStopped);
  const hasStoppedRef = useRef(false);
  const currentNumberRef = useRef(number);

  // Update refs when props change
  useEffect(() => {
    stopAfterRef.current = stopAfter;
    onStoppedRef.current = onStopped;
  }, [stopAfter, onStopped]);

  // Update current number ref
  useEffect(() => {
    currentNumberRef.current = number;
  }, [number]);

  useEffect(() => {
    if (isRolling && stopAfter) {
      hasStoppedRef.current = false;
      startTsRef.current = null;
      lastUpdateTsRef.current = null;
      roll();
    }

    return () => {
      if (timerRef.current) {
        cancelAnimationFrame(timerRef.current);
      }
    };
  }, [isRolling, stopAfter]);

  useEffect(() => {
    if (!isRolling && !hasStoppedRef.current && onStoppedRef.current) {
      hasStoppedRef.current = true;
      onStoppedRef.current(currentNumberRef.current);
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
        // Ensure we get a different number
        while (newNumber === currentNumberRef.current) {
          newNumber = generateRandomFace();
        }
        setNumber(newNumber);
      }
      
      roll();
    });
  };

  let className = styles.DieView;
  if (isExploding) className += ` ${styles.exploding}`;
  if (isCancelled) className += ` ${styles.cancelled}`;
  
  return <div className={className}>{number}</div>;
}

