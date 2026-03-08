import { createRoll, createCpDice } from '../rolls';
import type { Die } from '../types';
import { createDiceArray } from '../parser';

// Mock the random generator so we can control dice outcomes
jest.mock('../randomGenerator', () => ({
  generateRandomFace: jest.fn(),
  generateRollDuration: jest.fn().mockReturnValue(800),
}));

import { generateRandomFace } from '../randomGenerator';

const mockFace = generateRandomFace as jest.MockedFunction<typeof generateRandomFace>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createRoll', () => {
  it('assigns finalNumber and stopAfter to every die', () => {
    mockFace.mockReturnValue(3);
    const dice = createDiceArray(2);
    const roll = createRoll('2d', dice, 0, 2);

    expect(roll.dice).toHaveLength(2);
    for (const die of roll.dice) {
      expect(die.finalNumber).toBeDefined();
      expect(die.stopAfter).toBeDefined();
    }
  });

  it('preserves text, modifier, and diceCount on the roll', () => {
    mockFace.mockReturnValue(4);
    const dice = createDiceArray(3);
    const roll = createRoll('3d+2', dice, 2, 3);

    expect(roll.text).toBe('3d+2');
    expect(roll.modifier).toBe(2);
    expect(roll.diceCount).toBe(3);
    expect(roll.date).toBeDefined();
    expect(roll.id).toBeDefined();
  });

  it('does not explode when the exploding die rolls a non-6', () => {
    mockFace.mockReturnValue(4);
    const dice = createDiceArray(2);
    const roll = createRoll('2d', dice, 0, 2);

    // Should have exactly 2 dice (no explosion)
    expect(roll.dice).toHaveLength(2);
  });

  it('spawns chain dice when the exploding die rolls a 6', () => {
    // Die 0 = 3, Die 1 (exploding) = 6, chain die = 4 (stops)
    mockFace.mockReturnValueOnce(3).mockReturnValueOnce(6).mockReturnValueOnce(4);
    const dice = createDiceArray(2);
    const roll = createRoll('2d', dice, 0, 2);

    expect(roll.dice).toHaveLength(3);
    // The chain die should have chainDepth 1
    expect(roll.dice[2].chainDepth).toBe(1);
    expect(roll.dice[2].isExploding).toBe(true);
    expect(roll.dice[2].canExplodeSucceed).toBe(true);
    expect(roll.dice[2].canExplodeFail).toBe(false);
  });

  it('chains multiple explosion dice when consecutive 6s are rolled', () => {
    // Die 0 = 3, Die 1 (exploding) = 6, chain = 6, chain = 2 (stops)
    mockFace
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(6)
      .mockReturnValueOnce(6)
      .mockReturnValueOnce(2);
    const dice = createDiceArray(2);
    const roll = createRoll('2d', dice, 0, 2);

    expect(roll.dice).toHaveLength(4);
    expect(roll.dice[2].chainDepth).toBe(1);
    expect(roll.dice[3].chainDepth).toBe(2);
  });

  it('cancels the highest non-exploding die when the exploding die rolls a 1', () => {
    // Die 0 = 5, Die 1 = 3, Die 2 (exploding) = 1
    mockFace.mockReturnValueOnce(5).mockReturnValueOnce(3).mockReturnValueOnce(1);
    const dice = createDiceArray(3);
    const roll = createRoll('3d', dice, 0, 3);

    expect(roll.dice).toHaveLength(3);
    // The exploding die itself should be cancelled
    expect(roll.dice[2].isCancelled).toBe(true);
    // The highest non-exploding die (5) should also be cancelled
    expect(roll.dice[0].isCancelled).toBe(true);
    expect(roll.dice[0].finalNumber).toBe(5);
    // The lower die (3) should NOT be cancelled
    expect(roll.dice[1].isCancelled).toBeFalsy();
  });

  it('marks the exploding die with chainDepth 0', () => {
    mockFace.mockReturnValue(3);
    const dice = createDiceArray(2);
    const roll = createRoll('2d', dice, 0, 2);

    // Die 1 is the exploding die
    expect(roll.dice[1].chainDepth).toBe(0);
    // Die 0 is not exploding, no chainDepth
    expect(roll.dice[0].chainDepth).toBeUndefined();
  });

  it('handles a single die that rolls 1 (crit fail, nothing to cancel)', () => {
    mockFace.mockReturnValueOnce(1);
    const dice = createDiceArray(1);
    const roll = createRoll('1d', dice, 0, 1);

    expect(roll.dice).toHaveLength(1);
    expect(roll.dice[0].isCancelled).toBe(true);
    expect(roll.dice[0].finalNumber).toBe(1);
  });

  it('handles a single die that rolls 6 (crit success)', () => {
    // Exploding die = 6, chain = 4 (stops)
    mockFace.mockReturnValueOnce(6).mockReturnValueOnce(4);
    const dice = createDiceArray(1);
    const roll = createRoll('1d', dice, 0, 1);

    expect(roll.dice).toHaveLength(2);
    expect(roll.dice[0].finalNumber).toBe(6);
    expect(roll.dice[0].chainDepth).toBe(0);
    expect(roll.dice[1].finalNumber).toBe(4);
    expect(roll.dice[1].chainDepth).toBe(1);
  });

  it('assigns unique IDs to all dice including chain dice', () => {
    // 3 initial dice, last one explodes twice
    mockFace
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(4)
      .mockReturnValueOnce(6)
      .mockReturnValueOnce(6)
      .mockReturnValueOnce(3);
    const dice = createDiceArray(3);
    const roll = createRoll('3d', dice, 0, 3);

    const ids = roll.dice.map((d) => d.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('createCpDice', () => {
  it('creates the correct number of CP dice', () => {
    mockFace.mockReturnValue(3);
    const cpDice = createCpDice(2, 100);

    expect(cpDice).toHaveLength(2);
    for (const die of cpDice) {
      expect(die.isCpDie).toBe(true);
      expect(die.isExploding).toBe(true);
      expect(die.canExplodeSucceed).toBe(true);
      expect(die.canExplodeFail).toBe(false);
      expect(die.chainDepth).toBe(0);
    }
  });

  it('chain-explodes CP dice that roll 6', () => {
    // CP die 1 = 6, chain = 4 (stops), CP die 2 = 3
    mockFace.mockReturnValueOnce(6).mockReturnValueOnce(4).mockReturnValueOnce(3);
    const cpDice = createCpDice(2, 100);

    expect(cpDice).toHaveLength(3);
    expect(cpDice[0].finalNumber).toBe(6);
    expect(cpDice[0].chainDepth).toBe(0);
    expect(cpDice[1].finalNumber).toBe(4);
    expect(cpDice[1].chainDepth).toBe(1);
    expect(cpDice[1].isCpDie).toBe(true);
    expect(cpDice[2].finalNumber).toBe(3);
    expect(cpDice[2].chainDepth).toBe(0);
  });

  it('does not cancel on rolling a 1 (CP dice have canExplodeFail=false)', () => {
    mockFace.mockReturnValueOnce(1);
    const cpDice = createCpDice(1, 100);

    expect(cpDice).toHaveLength(1);
    expect(cpDice[0].finalNumber).toBe(1);
    expect(cpDice[0].isCancelled).toBeUndefined();
  });

  it('uses startingId for sequential IDs', () => {
    mockFace.mockReturnValue(3);
    const cpDice = createCpDice(2, 50);

    expect(cpDice[0].id).toBe(50);
    expect(cpDice[1].id).toBe(51);
  });
});
