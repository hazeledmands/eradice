import React, { useState, useEffect, useRef, useMemo } from 'react';
import Ledger from '../Ledger/Ledger';
import DiceTray from '../DiceTray/DiceTray';
import RoomBar from '../RoomBar/RoomBar';
import { parseDiceNotation, createDiceArray } from '../../dice/parser';
import { createRoll } from '../../dice/rolls';
import { useDiceRollsStorage } from '../../hooks/useSessionStorage';
import { useRoom } from '../../hooks/useRoom';
import { useNickname } from '../../hooks/useNickname';
import { supabaseEnabled } from '../../lib/supabase';
import { generateSlug } from '../../lib/slug';
import type { Roll, Die } from '../../dice/types';
import styles from './Roller.module.css';

interface RollerProps {
  roomSlug?: string | null;
  onRoomCreated?: (slug: string) => void;
}

/**
 * Main dice roller component
 */
export default function Roller({ roomSlug, onRoomCreated }: RollerProps) {
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [text, setText] = useState('');
  const [dice, setDice] = useState<Die[]>([]);
  const [modifier, setModifier] = useState(0);
  const [diceCount, setDiceCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { saveRolls, loadRolls } = useDiceRollsStorage();
  const { nickname, setNickname } = useNickname();
  const {
    room,
    roomRolls,
    isConnected,
    error: roomError,
    joinRoom,
    broadcastRoll,
    leaveRoom,
  } = useRoom();

  const isRoomMode = !!room;

  // Join room when roomSlug prop changes
  useEffect(() => {
    if (roomSlug && supabaseEnabled) {
      joinRoom(roomSlug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomSlug]);

  useEffect(() => {
    // Load rolls from session storage on mount (solo mode only)
    if (!roomSlug) {
      const loadedRolls = loadRolls();
      if (loadedRolls.length > 0) {
        setRolls(loadedRolls);
      }
    }

    // Auto-focus the input when the page loads
    if (inputRef.current) {
      inputRef.current.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  useEffect(() => {
    // Save rolls to session storage whenever rolls change (solo mode only)
    if (!isRoomMode) {
      saveRolls(rolls);
    }
  }, [rolls, saveRolls, isRoomMode]);

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
    if (text.length === 0 || dice.length === 0) return;

    const newRoll = createRoll(text, dice, modifier, diceCount);

    if (isRoomMode) {
      broadcastRoll(newRoll, nickname);
    } else {
      setRolls((prevRolls) => [newRoll, ...prevRolls]);
    }
    setText('');
    setDice([]);
    setModifier(0);
    setDiceCount(0);
  };

  const handleCreateRoom = () => {
    const slug = generateSlug();
    joinRoom(slug);
    onRoomCreated?.(slug);
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    // Navigate back to solo mode
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', window.location.pathname);
    }
  };

  // Memoize the preview roll object to prevent unnecessary re-renders in DiceTray
  const previewRoll = useMemo(() => {
    if (!text || !dice.length) return null;
    return { id: 0, text, dice, modifier, diceCount, date: new Date().toISOString() };
  }, [text, dice, modifier, diceCount]);

  // Room rolls are stored oldest-first, display newest-first
  const displayRolls = isRoomMode ? [...roomRolls].reverse() : rolls;

  return (
    <div className={styles.Roller}>
      {isRoomMode && room && (
        <RoomBar
          slug={room.slug}
          nickname={nickname}
          isConnected={isConnected}
          onNicknameChange={setNickname}
          onLeave={handleLeaveRoom}
        />
      )}

      {roomError && (
        <div className={styles.roomError}>{roomError}</div>
      )}

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

      {!isRoomMode && supabaseEnabled && !roomSlug && (
        <button
          type="button"
          className={styles.createRoomButton}
          onClick={handleCreateRoom}
        >
          Create Room
        </button>
      )}

      {previewRoll && <DiceTray roll={previewRoll} />}

      <Ledger rolls={displayRolls} isRoomMode={isRoomMode} />
    </div>
  );
}
