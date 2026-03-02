import type { Roll, Die } from '../types';
import { calculateRollResult, generateMathText } from '../calculations';

function makeRoll(overrides: Partial<Roll> & { dice: Die[] }): Roll {
  return {
    id: 1,
    text: '1d',
    diceCount: 1,
    modifier: 0,
    date: new Date().toISOString(),
    dice: [],
    ...overrides,
  };
}

describe('generateMathText', () => {
  it('returns null for a single die with no modifier, no crit', () => {
    const roll = makeRoll({
      dice: [{ id: 0, finalNumber: 4, isExploding: true, canExplodeSucceed: true, canExplodeFail: true, chainDepth: 0 }],
    });
    expect(generateMathText(roll)).toBeNull();
  });

  it('returns "= 9" for multi-die roll with no crit', () => {
    const roll = makeRoll({
      diceCount: 3,
      text: '3d',
      dice: [
        { id: 0, finalNumber: 4 },
        { id: 1, finalNumber: 2 },
        { id: 2, finalNumber: 3, isExploding: true, canExplodeSucceed: true, canExplodeFail: true, chainDepth: 0 },
      ],
    });
    expect(generateMathText(roll)).toBe('= 9');
  });

  it('returns "= 9 + 2 = 11" for multi-die roll with modifier', () => {
    const roll = makeRoll({
      diceCount: 3,
      text: '3d+2',
      modifier: 2,
      dice: [
        { id: 0, finalNumber: 4 },
        { id: 1, finalNumber: 2 },
        { id: 2, finalNumber: 3, isExploding: true, canExplodeSucceed: true, canExplodeFail: true, chainDepth: 0 },
      ],
    });
    expect(generateMathText(roll)).toBe('= 9 + 2 = 11');
  });

  it('returns "6 + 3 = 9" for 1d crit success (not "0 + 9 = 9")', () => {
    const roll = makeRoll({
      text: '1d',
      dice: [
        { id: 0, finalNumber: 6, isExploding: true, canExplodeSucceed: true, canExplodeFail: true, chainDepth: 0 },
        { id: 1, finalNumber: 3, isExploding: true, canExplodeSucceed: true, canExplodeFail: false, chainDepth: 1 },
      ],
    });
    expect(generateMathText(roll)).toBe('6 + 3 = 9');
  });

  it('returns "12 + 3 = 15" for 3d crit success (trigger die in base sum)', () => {
    const roll = makeRoll({
      diceCount: 3,
      text: '3d',
      dice: [
        { id: 0, finalNumber: 4 },
        { id: 1, finalNumber: 2 },
        { id: 2, finalNumber: 6, isExploding: true, canExplodeSucceed: true, canExplodeFail: true, chainDepth: 0 },
        { id: 3, finalNumber: 3, isExploding: true, canExplodeSucceed: true, canExplodeFail: false, chainDepth: 1 },
      ],
    });
    expect(generateMathText(roll)).toBe('12 + 3 = 15');
  });

  it('returns "9 \u2212 5 = 4" for 3d crit fail (not "10 \u2212 6 = 4")', () => {
    const roll = makeRoll({
      diceCount: 3,
      text: '3d',
      dice: [
        { id: 0, finalNumber: 5, isCancelled: true },
        { id: 1, finalNumber: 4 },
        { id: 2, finalNumber: 1, isExploding: true, canExplodeFail: true, canExplodeSucceed: true, isCancelled: true },
      ],
    });
    expect(generateMathText(roll)).toBe('9 \u2212 5 = 4');
  });

  it('returns "= 0" for 1d crit fail with nothing to cancel', () => {
    const roll = makeRoll({
      text: '1d',
      dice: [
        { id: 0, finalNumber: 1, isExploding: true, canExplodeFail: true, canExplodeSucceed: true, isCancelled: true },
      ],
    });
    expect(generateMathText(roll)).toBe('= 0');
  });

  it('returns "12 + 3 + 2 = 17" for 3d crit success with modifier', () => {
    const roll = makeRoll({
      diceCount: 3,
      text: '3d+2',
      modifier: 2,
      dice: [
        { id: 0, finalNumber: 4 },
        { id: 1, finalNumber: 2 },
        { id: 2, finalNumber: 6, isExploding: true, canExplodeSucceed: true, canExplodeFail: true, chainDepth: 0 },
        { id: 3, finalNumber: 3, isExploding: true, canExplodeSucceed: true, canExplodeFail: false, chainDepth: 1 },
      ],
    });
    expect(generateMathText(roll)).toBe('12 + 3 + 2 = 17');
  });

  it('returns "6 + 3 = 9" for roll with CP dice', () => {
    const roll = makeRoll({
      diceCount: 2,
      text: '2d',
      dice: [
        { id: 0, finalNumber: 4 },
        { id: 1, finalNumber: 2, isExploding: true, canExplodeSucceed: true, canExplodeFail: true, chainDepth: 0 },
        { id: 2, finalNumber: 3, isCpDie: true, isExploding: true, canExplodeSucceed: true, chainDepth: 0 },
      ],
    });
    expect(generateMathText(roll)).toBe('6 + 3 = 9');
  });
});
