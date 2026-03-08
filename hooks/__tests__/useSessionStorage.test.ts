import { renderHook, act } from '@testing-library/react';
import { useDiceRollsStorage, MAX_STORED_ROLLS } from '../useSessionStorage';
import type { Roll } from '../../dice/types';

function makeRoll(id: number): Roll {
  return {
    id,
    text: '1d',
    diceCount: 1,
    modifier: 0,
    date: new Date().toISOString(),
    dice: [{ id: 0, finalNumber: 3, isExploding: true, canExplodeSucceed: true, canExplodeFail: true, chainDepth: 0 }],
  };
}

describe('useDiceRollsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exports MAX_STORED_ROLLS constant', () => {
    expect(MAX_STORED_ROLLS).toBe(200);
  });

  it('saves and loads rolls normally when under the cap', () => {
    const { result } = renderHook(() => useDiceRollsStorage());

    const rolls = Array.from({ length: 5 }, (_, i) => makeRoll(i));
    act(() => result.current.saveRolls(rolls));

    const loaded = result.current.loadRolls();
    expect(loaded).toHaveLength(5);
  });

  it('prunes to the most recent MAX_STORED_ROLLS when saving more', () => {
    const { result } = renderHook(() => useDiceRollsStorage());

    const rolls = Array.from({ length: MAX_STORED_ROLLS + 50 }, (_, i) => makeRoll(i));
    act(() => result.current.saveRolls(rolls));

    const loaded = result.current.loadRolls();
    expect(loaded).toHaveLength(MAX_STORED_ROLLS);
    // Should keep the most recent (last) rolls, not the oldest
    expect(loaded[0].id).toBe(50);
    expect(loaded[loaded.length - 1].id).toBe(MAX_STORED_ROLLS + 49);
  });

  it('keeps exactly MAX_STORED_ROLLS when saving that exact amount', () => {
    const { result } = renderHook(() => useDiceRollsStorage());

    const rolls = Array.from({ length: MAX_STORED_ROLLS }, (_, i) => makeRoll(i));
    act(() => result.current.saveRolls(rolls));

    const loaded = result.current.loadRolls();
    expect(loaded).toHaveLength(MAX_STORED_ROLLS);
  });
});
