import type { Roll, Die } from '../types';
import { calculateRollResult, generateCopyText } from '../calculations';

function makeRoll(overrides: Partial<Roll> & { dice: Die[] }): Roll {
  return {
    id: 1,
    text: '1d',
    diceCount: 1,
    modifier: 0,
    date: new Date().toISOString(),
    ...overrides,
  };
}

describe('calculateRollResult', () => {
  it('returns null for a roll with no dice', () => {
    const roll = makeRoll({ dice: [] });
    expect(calculateRollResult(roll)).toBeNull();
  });

  it('returns null when no dice have finalNumber', () => {
    const roll = makeRoll({
      dice: [{ id: 0 }],
    });
    expect(calculateRollResult(roll)).toBeNull();
  });

  it('sums dice face values for a simple roll', () => {
    const roll = makeRoll({
      diceCount: 3,
      dice: [
        { id: 0, finalNumber: 4 },
        { id: 1, finalNumber: 2 },
        { id: 2, finalNumber: 3 },
      ],
    });
    expect(calculateRollResult(roll)).toBe(9);
  });

  it('adds modifier to the total', () => {
    const roll = makeRoll({
      diceCount: 2,
      modifier: 5,
      dice: [
        { id: 0, finalNumber: 3 },
        { id: 1, finalNumber: 4 },
      ],
    });
    expect(calculateRollResult(roll)).toBe(12);
  });

  it('excludes cancelled dice from the total', () => {
    const roll = makeRoll({
      diceCount: 3,
      dice: [
        { id: 0, finalNumber: 5, isCancelled: true },
        { id: 1, finalNumber: 3 },
        { id: 2, finalNumber: 1, isCancelled: true },
      ],
    });
    expect(calculateRollResult(roll)).toBe(3);
  });

  it('returns 0 when all dice are cancelled', () => {
    const roll = makeRoll({
      dice: [
        { id: 0, finalNumber: 4, isCancelled: true },
      ],
    });
    expect(calculateRollResult(roll)).toBe(0);
  });

  it('returns modifier alone when all dice are cancelled and a modifier exists', () => {
    const roll = makeRoll({
      modifier: 3,
      dice: [
        { id: 0, finalNumber: 4, isCancelled: true },
      ],
    });
    expect(calculateRollResult(roll)).toBe(3);
  });

  it('includes exploding chain dice in the total', () => {
    const roll = makeRoll({
      dice: [
        { id: 0, finalNumber: 6, chainDepth: 0 },
        { id: 1, finalNumber: 4, chainDepth: 1, isExploding: true },
      ],
    });
    expect(calculateRollResult(roll)).toBe(10);
  });
});

describe('generateCopyText', () => {
  it('returns empty string for a roll with no dice', () => {
    const roll = makeRoll({ dice: [] });
    expect(generateCopyText(roll)).toBe('');
  });

  it('formats a simple roll', () => {
    const roll = makeRoll({
      text: '2d',
      diceCount: 2,
      dice: [
        { id: 0, finalNumber: 4 },
        { id: 1, finalNumber: 3 },
      ],
    });
    expect(generateCopyText(roll)).toBe('2d = [4] [3] = 7');
  });

  it('includes modifier in the output', () => {
    const roll = makeRoll({
      text: '2d+3',
      diceCount: 2,
      modifier: 3,
      dice: [
        { id: 0, finalNumber: 4 },
        { id: 1, finalNumber: 2 },
      ],
    });
    expect(generateCopyText(roll)).toBe('2d+3 = [4] [2] + 3 = 9');
  });

  it('marks cancelled dice', () => {
    const roll = makeRoll({
      text: '2d',
      diceCount: 2,
      dice: [
        { id: 0, finalNumber: 5, isCancelled: true },
        { id: 1, finalNumber: 1, isCancelled: true },
      ],
    });
    expect(generateCopyText(roll)).toBe('2d = [5-canceled] [1-canceled] = 0');
  });

  it('marks CP dice', () => {
    const roll = makeRoll({
      text: '1d',
      dice: [
        { id: 0, finalNumber: 4 },
        { id: 1, finalNumber: 3, isCpDie: true },
      ],
    });
    expect(generateCopyText(roll)).toBe('1d = [4] [3-cp] = 7');
  });

  it('formats a roll with cancelled, CP, and modifier together', () => {
    const roll = makeRoll({
      text: '2d+1',
      diceCount: 2,
      modifier: 1,
      dice: [
        { id: 0, finalNumber: 5, isCancelled: true },
        { id: 1, finalNumber: 3 },
        { id: 2, finalNumber: 2, isCpDie: true },
      ],
    });
    // Result = 3 + 2 + 1 = 6 (5 is cancelled)
    expect(generateCopyText(roll)).toBe('2d+1 = [5-canceled] [3] [2-cp] + 1 = 6');
  });
});
