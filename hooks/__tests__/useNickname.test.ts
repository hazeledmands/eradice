import { renderHook, act } from '@testing-library/react';
import { useNickname } from '../useNickname';

const STORAGE_KEY = 'userNickname';

beforeEach(() => {
  localStorage.clear();
});

describe('useNickname', () => {
  it('generates and stores a nickname on first use', () => {
    const { result } = renderHook(() => useNickname());

    expect(typeof result.current.nickname).toBe('string');
    expect(result.current.nickname.length).toBeGreaterThan(0);
    // Should have been persisted to localStorage
    expect(localStorage.getItem(STORAGE_KEY)).toBe(result.current.nickname);
  });

  it('loads an existing nickname from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'SpaceAce');
    const { result } = renderHook(() => useNickname());

    expect(result.current.nickname).toBe('SpaceAce');
  });

  it('updates the nickname and persists it', () => {
    const { result } = renderHook(() => useNickname());

    act(() => { result.current.setNickname('Stardust'); });

    expect(result.current.nickname).toBe('Stardust');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('Stardust');
  });

  it('trims whitespace when setting a nickname', () => {
    const { result } = renderHook(() => useNickname());

    act(() => { result.current.setNickname('  Cosmo  '); });

    expect(result.current.nickname).toBe('Cosmo');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('Cosmo');
  });

  it('ignores blank or whitespace-only nicknames', () => {
    localStorage.setItem(STORAGE_KEY, 'Orion');
    const { result } = renderHook(() => useNickname());

    act(() => { result.current.setNickname('   '); });

    // Should remain unchanged
    expect(result.current.nickname).toBe('Orion');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('Orion');
  });
});
