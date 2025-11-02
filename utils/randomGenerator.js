import * as Random from 'random-js';
import { ROLL_DURATION_MIN, ROLL_DURATION_RANGE } from '../constants/dice';

/**
 * Generates a random duration for dice rolling animation
 * @returns {number} Duration in milliseconds
 */
export function generateRollDuration() {
  return ROLL_DURATION_MIN + Math.random() * ROLL_DURATION_RANGE;
}

/**
 * Generates a random dice face value
 * @param {number} sides - Number of sides on the die (default: 6)
 * @returns {number} Random face value between 1 and sides
 */
export function generateRandomFace(sides = 6) {
  return Random.die(sides)(Random.browserCrypto);
}

