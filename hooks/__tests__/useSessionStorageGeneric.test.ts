import { renderHook, act } from '@testing-library/react';
import { useSessionStorage } from '../useSessionStorage';

beforeEach(() => {
  localStorage.clear();
});

describe('useSessionStorage', () => {
  it('returns the initial value when nothing is stored', () => {
    const { result } = renderHook(() => useSessionStorage('testKey', 42));
    expect(result.current[0]).toBe(42);
  });

  it('loads an existing value from localStorage', () => {
    localStorage.setItem('testKey', JSON.stringify(99));
    const { result } = renderHook(() => useSessionStorage('testKey', 0));
    expect(result.current[0]).toBe(99);
  });

  it('stores and retrieves an updated value', () => {
    const { result } = renderHook(() => useSessionStorage('testKey', 0));
    const [, setValue] = result.current;

    act(() => { setValue(7); });

    expect(result.current[0]).toBe(7);
    expect(JSON.parse(localStorage.getItem('testKey')!)).toBe(7);
  });

  it('supports functional updates', () => {
    const { result } = renderHook(() => useSessionStorage('testKey', 10));
    const [, setValue] = result.current;

    act(() => { setValue((prev) => prev + 5); });

    expect(result.current[0]).toBe(15);
  });

  it('works with object values', () => {
    const initial = { name: 'test', count: 0 };
    const { result } = renderHook(() => useSessionStorage('objKey', initial));
    const [, setValue] = result.current;

    const updated = { name: 'updated', count: 1 };
    act(() => { setValue(updated); });

    expect(result.current[0]).toEqual(updated);
    expect(JSON.parse(localStorage.getItem('objKey')!)).toEqual(updated);
  });

  it('works with array values', () => {
    const { result } = renderHook(() => useSessionStorage<number[]>('arrKey', []));
    const [, setValue] = result.current;

    act(() => { setValue([1, 2, 3]); });

    expect(result.current[0]).toEqual([1, 2, 3]);
  });

  it('returns the initial value when localStorage contains invalid JSON', () => {
    localStorage.setItem('badKey', 'not-json{{{');
    const { result } = renderHook(() => useSessionStorage('badKey', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });
});
