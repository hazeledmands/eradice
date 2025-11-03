import React, { useState, useEffect, useRef } from 'react';
import Ledger from '../Ledger/Ledger';
import DiceTray from '../DiceTray/DiceTray';
import { parseDiceNotation, createDiceArray } from '../../utils/diceParser';
import { generateRollDuration, generateRandomFace } from '../../utils/randomGenerator';
import { useDiceRollsStorage } from '../../hooks/useSessionStorage';
import styles from './Roller.module.css';

/**
 * Main dice roller component
 */
export default function Roller() {
  const [rolls, setRolls] = useState([]);
  const [text, setText] = useState('');
  const [dice, setDice] = useState([]);
  const [modifier, setModifier] = useState(0);
  const inputRef = useRef(null);
  const { saveRolls, loadRolls } = useDiceRollsStorage();

  useEffect(() => {
    // Load rolls from session storage on mount
    const loadedRolls = loadRolls();
    if (loadedRolls.length > 0) {
      setRolls(loadedRolls);
    }

    // Auto-focus the input when the page loads
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    // Save rolls to session storage whenever rolls change
    saveRolls(rolls);
  }, [rolls, saveRolls]);

  const handleChange = (e) => {
    const inputText = e.target.value;
    setText(inputText);

    const parsed = parseDiceNotation(inputText);
    if (parsed) {
      const { diceCount, modifier: parsedModifier } = parsed;
      const newDice = createDiceArray(diceCount);
      setDice(newDice);
      setModifier(parsedModifier);
    } else {
      setDice([]);
      setModifier(0);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.length === 0) return;

    // Pre-calculate final values for all dice immediately
    // Note: isRolling will be controlled by Ledger, so don't set it here
    const newRoll = {
      id: Date.now(),
      text,
      dice: dice.map(die => ({
        ...die,
        finalNumber: generateRandomFace(), // Pre-calculate the final result
        stopAfter: generateRollDuration(),
        isRolling: false, // Ledger will control when to start rolling
      })),
      modifier,
    };

    setRolls(prevRolls => [newRoll, ...prevRolls]);
    setText('');
    setDice([]);
    setModifier(0);
  };

  const handleRollComplete = (rollId, completedDice) => {
    setRolls(prevRolls =>
      prevRolls.map(roll =>
        roll.id === rollId ? { ...roll, dice: completedDice } : roll
      )
    );
  };

  return (
    <div className={styles.Roller}>
      <form onSubmit={handleSubmit}>
        <label htmlFor="dice-selector">What would you like to roll?</label>
        <div className={styles.inputRow}>
          <div className={styles.terminalInput}>
            <span className={styles.prompt}>$</span>
            <input
              id="dice-selector"
              ref={inputRef}
              onChange={handleChange}
              value={text}
              placeholder=" 3d+2"
              className={styles.terminalInputField}
            />
          </div>
          <button type="submit">Roll!</button>
        </div>
      </form>

      {text && <DiceTray dice={dice} />}

      <Ledger
        rolls={rolls}
        onRollComplete={handleRollComplete}
      />
    </div>
  );
}

