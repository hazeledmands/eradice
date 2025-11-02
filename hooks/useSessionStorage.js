import { useState, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants/storage';

/**
 * Custom hook for managing session storage
 * @param {string} key - Storage key
 * @param {*} initialValue - Initial value if no stored value exists
 * @returns {[*, Function]} Stored value and setter function
 */
export function useSessionStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.sessionStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error loading ${key} from sessionStorage:`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value) => {
    try {
      setStoredValue(currentValue => {
        const valueToStore = value instanceof Function ? value(currentValue) : value;
        
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(key, JSON.stringify(valueToStore));
        }
        
        return valueToStore;
      });
    } catch (error) {
      console.error(`Error saving ${key} to sessionStorage:`, error);
    }
  }, [key]);

  return [storedValue, setValue];
}

/**
 * Custom hook specifically for managing dice rolls in session storage
 * Only stores completed rolls (no dice still rolling)
 */
export function useDiceRollsStorage() {
  const [storedRolls, setStoredRolls] = useSessionStorage(STORAGE_KEYS.DICE_ROLLS, []);

  const saveRolls = useCallback((rolls) => {
    // Only save completed rolls (no dice still rolling)
    const completedRolls = rolls.filter(roll =>
      roll.dice && roll.dice.every(die => !die.isRolling)
    );
    setStoredRolls(completedRolls);
  }, [setStoredRolls]);

  const loadRolls = useCallback(() => {
    // Only return completed rolls
    return storedRolls.filter(roll =>
      roll.dice && roll.dice.every(die => !die.isRolling)
    );
  }, [storedRolls]);

  return { saveRolls, loadRolls };
}

