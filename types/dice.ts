/**
 * Represents a single die
 */
export interface Die {
  id: number;
  isRolling?: boolean;
  isExploding?: boolean;
  isCancelled?: boolean;
  canExplodeSucceed?: boolean;
  canExplodeFail?: boolean;
  finalNumber?: number | null;
  stopAfter?: number;
}

/**
 * Represents a complete roll with dice and modifier
 */
export interface Roll {
  id: number;
  text: string;
  dice: Die[];
  modifier: number;
}

/**
 * Parsed dice notation result
 */
export interface ParsedDiceNotation {
  diceCount: number;
  modifier: number;
}

/**
 * Die state for display
 */
export type DieState = 'rolling' | 'stopped';

