/**
 * Represents a single die
 */
export interface Die {
  id: number;
  isExploding?: boolean;
  isCancelled?: boolean;
  canExplodeSucceed?: boolean;
  canExplodeFail?: boolean;
  isCpDie?: boolean;
  chainDepth?: number;
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
  date: string; // ISO date string of when the roll was created
}

/**
 * Die state for display
 */
export type DieState = 'rolling' | 'stopped';

export type RollVisibility = 'shared' | 'secret' | 'hidden';

export interface RoomRoll extends Roll {
  nickname: string;
  isLocal: boolean;       // true = current user's roll
  shouldAnimate: boolean; // false for history loaded on join
  visibility: RollVisibility;
  isRevealed?: boolean;
}

