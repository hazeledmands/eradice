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
 * Parsed dice notation result
 */
export interface ParsedRollNotation {
  diceCount: number;
  modifier: number;
}

/**
 * Represents a complete roll with dice and modifier
 */
export interface Roll extends ParsedRollNotation {
  id: number;
  text: string;
  dice: Die[];
}

/**
 * Die state for display
 */
export type DieState = 'rolling' | 'stopped';

