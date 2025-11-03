import type { ParsedRollNotation, Die } from './types';

/**
 * Parses dice notation string (e.g., "3d+2" or "5d")
 * @param text - Dice notation string
 * @returns Parsed dice count and modifier, or null if invalid
 */
export function parseDiceNotation(text: string): ParsedRollNotation | null {
  const parser = /(?<dice>\d+)\s*d\s*(\+\s*(?<modifier>\d+))?/i;
  const result = parser.exec(text);

  if (result == null || !result.groups) {
    return null;
  }

  const diceCount = parseInt(result.groups.dice, 10);
  const modifier = result.groups.modifier == null ? 0 : parseInt(result.groups.modifier, 10);

  return { diceCount, modifier };
}

/**
 * Creates initial dice array for a given dice count
 * @param diceCount - Number of dice to create
 * @returns Array of dice objects
 */
export function createDiceArray(diceCount: number): Die[] {
  const dice: Die[] = [];
  for (let i = 0; i < diceCount; ++i) {
    const isExploding = i === diceCount - 1;
    dice.push({
      id: i,
      isRolling: true,
      isExploding,
      canExplodeSucceed: isExploding,
      canExplodeFail: isExploding,
    });
  }
  return dice;
}

