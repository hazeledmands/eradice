import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Ledger from '../Ledger/Ledger';
import DiceTray from '../DiceTray/DiceTray';
import RoomBar from '../RoomBar/RoomBar';
import VisibilityToggle from '../VisibilityToggle/VisibilityToggle';
import { parseDiceNotation, createDiceArray } from '../../dice/parser';
import { createRoll, createCpDice } from '../../dice/rolls';
import { useDiceRollsStorage } from '../../hooks/useSessionStorage';
import { useRoom } from '../../hooks/useRoom';
import { useNickname } from '../../hooks/useNickname';
import { supabaseEnabled } from '../../lib/supabase';
import { generateSlug } from '../../lib/slug';
import { useTypewriter } from '../../hooks/useTypewriter';
import { selectPrompt } from './terminalPrompts';
import type { Roll, Die, RollVisibility } from '../../dice/types';
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
  const [rollVisibility, setRollVisibility] = useState<RollVisibility>('shared');
  const [currentPrompt, setCurrentPrompt] = useState(() => selectPrompt(null));
  const { displayText: promptDisplayText, isTyping: promptIsTyping } = useTypewriter(currentPrompt);
  const inputRef = useRef<HTMLInputElement>(null);
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { saveRolls, loadRolls } = useDiceRollsStorage();
  const { nickname, setNickname } = useNickname();
  const {
    room,
    roomRolls,
    isConnected,
    isJoining,
    error: roomError,
    presenceUsers,
    joinRoom,
    broadcastRoll,
    revealRoll,
    broadcastCpSpend,
    leaveRoom,
    updatePresenceNickname,
  } = useRoom();

  const isRoomMode = !!room;
  // Reconnecting = was connected (have a room) but connection dropped and not in initial join
  const isReconnecting = isRoomMode && !isConnected && !isJoining;

  // Clean up prompt rotation timer on unmount
  useEffect(() => {
    return () => { if (promptTimerRef.current) clearTimeout(promptTimerRef.current); };
  }, []);

  // Join room when roomSlug prop changes (skip if already in this room)
  useEffect(() => {
    if (roomSlug && supabaseEnabled && room?.slug !== roomSlug) {
      joinRoom(roomSlug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomSlug]);

  // Sync nickname to presence whenever we connect (or reconnect)
  useEffect(() => {
    if (isConnected) {
      updatePresenceNickname(nickname);
    }
  }, [isConnected, nickname, updatePresenceNickname]);

  useEffect(() => {
    // Load rolls from session storage on mount (solo mode only)
    if (!roomSlug) {
      const loadedRolls = loadRolls();
      if (loadedRolls.length > 0) {
        setRolls(loadedRolls);
      }
    }

    // Load saved visibility preference
    try {
      const saved = localStorage.getItem('eradice-roll-visibility');
      if (saved === 'secret' || saved === 'hidden') {
        setRollVisibility(saved);
      }
    } catch { /* ignore */ }

    // Auto-focus the input when the page loads
    if (inputRef.current) {
      inputRef.current.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const handleVisibilityChange = useCallback((v: RollVisibility) => {
    setRollVisibility(v);
    try { localStorage.setItem('eradice-roll-visibility', v); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    // Save rolls to session storage whenever rolls change (solo mode only)
    if (!isRoomMode) {
      saveRolls(rolls);
    }
  }, [rolls, saveRolls, isRoomMode]);

  const handleNicknameChange = (name: string) => {
    setNickname(name);
    updatePresenceNickname(name);
  };

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
    newRoll.shouldAnimate = true;

    if (isRoomMode) {
      broadcastRoll(newRoll, nickname, rollVisibility);
    } else {
      setRolls((prevRolls) => [newRoll, ...prevRolls]);
    }
    setText('');
    setDice([]);
    setModifier(0);
    setDiceCount(0);

    // Delay the new prompt until after dice animations finish
    const maxStopAfter = Math.max(0, ...newRoll.dice.map((d) => d.stopAfter ?? 0));
    if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    promptTimerRef.current = setTimeout(() => {
      setCurrentPrompt((prev) => selectPrompt(prev));
    }, maxStopAfter + 600);
  };

  const handleReroll = useCallback((originalRoll: Roll) => {
    const newDice = createDiceArray(originalRoll.diceCount);
    const newRoll = createRoll(originalRoll.text, newDice, originalRoll.modifier, originalRoll.diceCount);
    newRoll.shouldAnimate = true;

    if (isRoomMode) {
      broadcastRoll(newRoll, nickname, rollVisibility);
    } else {
      setRolls((prevRolls) => [newRoll, ...prevRolls]);
    }
  }, [isRoomMode, broadcastRoll, nickname, rollVisibility]);

  const handleSpendCp = useCallback((rollId: number, count: number) => {
    // Find the roll to spend CP on
    const sourceRolls = isRoomMode ? roomRolls : rolls;
    const targetRoll = sourceRolls.find((r) => r.id === rollId);
    if (!targetRoll) return;

    const maxId = Math.max(...targetRoll.dice.map((d) => d.id));
    const cpDice = createCpDice(count, maxId + 1);
    const updatedRoll = { ...targetRoll, dice: [...targetRoll.dice, ...cpDice], shouldAnimate: true };

    if (isRoomMode) {
      broadcastCpSpend(rollId, updatedRoll);
    } else {
      setRolls((prevRolls) =>
        prevRolls.map((r) => (r.id === rollId ? updatedRoll : r))
      );
    }
  }, [isRoomMode, roomRolls, rolls, broadcastCpSpend]);

  const handleCreateRoom = () => {
    const slug = generateSlug();
    // Don't call joinRoom here — the URL change triggers the useEffect which calls joinRoom
    onRoomCreated?.(slug);
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    // Navigate back to solo mode
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', window.location.pathname);
    }
  };

  const handleRetry = () => {
    if (roomSlug) {
      joinRoom(roomSlug);
    } else if (room?.slug) {
      joinRoom(room.slug);
    }
  };

  // Memoize the preview roll object to prevent unnecessary re-renders in DiceTray
  const previewRoll = useMemo(() => {
    if (!text || !dice.length) return null;
    return { id: 0, text, dice, modifier, diceCount, date: new Date().toISOString(), shouldAnimate: true };
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
          isReconnecting={isReconnecting}
          presenceUsers={presenceUsers}
          onNicknameChange={handleNicknameChange}
          onLeave={handleLeaveRoom}
        />
      )}

      {isJoining && (
        <div className={styles.roomJoining}>Joining room...</div>
      )}

      {roomError && (
        <div className={styles.roomError}>
          {roomError}
          <button className={styles.retryButton} onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.terminalWindow}>
          <label
            htmlFor="dice-selector"
            aria-label={currentPrompt}
            className={`${styles.terminalLabel}${promptIsTyping ? ` ${styles.terminalLabelTyping}` : ''}`}
          >
            <span aria-hidden="true">{promptDisplayText}</span>
          </label>
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
            {isRoomMode && (
              <VisibilityToggle
                visibility={rollVisibility}
                onChange={handleVisibilityChange}
              />
            )}
            <button type="submit">Roll!</button>
          </div>
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

      <Ledger rolls={displayRolls} isRoomMode={isRoomMode} onRevealRoll={revealRoll} onReroll={handleReroll} onSpendCp={handleSpendCp} />
    </div>
  );
}
