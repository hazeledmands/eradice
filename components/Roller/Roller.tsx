import React, { useState, useEffect, useRef, useMemo } from 'react';
import Ledger from '../Ledger/Ledger';
import DiceTray from '../DiceTray/DiceTray';
import { parseDiceNotation, createDiceArray } from '../../dice/parser';
import { createRoll } from '../../dice/rolls';
import { useDiceRollsStorage } from '../../hooks/useSessionStorage';
import type { Roll, Die } from '../../dice/types';
import styles from './Roller.module.css';

/**
 * Main dice roller component
 */
export default function Roller() {
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [text, setText] = useState('');
  const [dice, setDice] = useState<Die[]>([]);
  const [modifier, setModifier] = useState(0);
  const [diceCount, setDiceCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  useEffect(() => {
    // Save rolls to session storage whenever rolls change
    saveRolls(rolls);
  }, [rolls, saveRolls]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputText = e.target.value;
    setText(inputText);

    const parsed = parseDiceNotation(inputText);
    if (parsed) {
      const { diceCount: parsedDiceCount, modifier: parsedModifier } = parsed;
      const newDice = createDiceArray(parsedDiceCount);
      setDice(newDice);
      setModifier(parsedModifier);
      setDiceCount(parsedDiceCount);
    } else {
      setDice([]);
      setModifier(0);
      setDiceCount(0);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (text.length === 0) return;

    const newRoll = createRoll(text, dice, modifier, diceCount);

    setRolls((prevRolls) => [newRoll, ...prevRolls]);
    setText('');
    setDice([]);
    setModifier(0);
    setDiceCount(0);
  };

  // Memoize the preview roll object to prevent unnecessary re-renders in DiceTray
  const previewRoll = useMemo(() => {
    if (!text || !dice.length) return null;
    return { id: 0, text, dice, modifier, diceCount };
  }, [text, dice, modifier, diceCount]);

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

      {previewRoll && <DiceTray roll={previewRoll} />}

      <Ledger rolls={rolls} />
    </div>
  );
}

