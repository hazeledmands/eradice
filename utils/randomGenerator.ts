import * as Random from 'random-js';

// Animation constants
const ROLL_DURATION_MIN = 500;
const ROLL_DURATION_MAX = 1500;
const ROLL_DURATION_RANGE = ROLL_DURATION_MAX - ROLL_DURATION_MIN;

/**
 * Generates a random duration for dice rolling animation
 * @returns Duration in milliseconds
 */
export function generateRollDuration(): number {
  return ROLL_DURATION_MIN + Math.random() * ROLL_DURATION_RANGE;
}

/**
 * Generates a random dice face value
 * @param sides - Number of sides on the die (default: 6)
 * @returns Random face value between 1 and sides
 */
export function generateRandomFace(sides: number = 6): number {
  return Random.die(sides)(Random.browserCrypto);
}

