import { createDiceArray } from '../parser';

describe('createDiceArray', () => {
  it('creates the correct number of dice', () => {
    const dice = createDiceArray(4);
    expect(dice).toHaveLength(4);
  });

  it('assigns sequential IDs starting from 0', () => {
    const dice = createDiceArray(3);
    expect(dice.map((d) => d.id)).toEqual([0, 1, 2]);
  });

  it('marks only the last die as exploding', () => {
    const dice = createDiceArray(3);

    // Non-last dice: not exploding
    expect(dice[0].isExploding).toBe(false);
    expect(dice[0].canExplodeSucceed).toBe(false);
    expect(dice[0].canExplodeFail).toBe(false);

    expect(dice[1].isExploding).toBe(false);
    expect(dice[1].canExplodeSucceed).toBe(false);
    expect(dice[1].canExplodeFail).toBe(false);

    // Last die: exploding
    expect(dice[2].isExploding).toBe(true);
    expect(dice[2].canExplodeSucceed).toBe(true);
    expect(dice[2].canExplodeFail).toBe(true);
  });

  it('marks the only die as exploding for a single-die roll', () => {
    const dice = createDiceArray(1);
    expect(dice).toHaveLength(1);
    expect(dice[0].isExploding).toBe(true);
    expect(dice[0].canExplodeSucceed).toBe(true);
    expect(dice[0].canExplodeFail).toBe(true);
  });

  it('returns an empty array for 0 dice', () => {
    const dice = createDiceArray(0);
    expect(dice).toHaveLength(0);
  });
});
