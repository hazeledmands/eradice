import { useState, useCallback } from 'react';
import { generateNickname } from '../lib/nickname';

const STORAGE_KEY = 'userNickname';

function getStoredNickname(): string {
  if (typeof window === 'undefined') return generateNickname();
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  const name = generateNickname();
  window.localStorage.setItem(STORAGE_KEY, name);
  return name;
}

export function useNickname() {
  const [nickname, setNicknameState] = useState(getStoredNickname);

  const setNickname = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setNicknameState(trimmed);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, trimmed);
    }
  }, []);

  return { nickname, setNickname };
}
