import type { Roll, Die } from './types';
import { generateRollDuration, generateRandomFace } from './randomGenerator';

// Dice-related constants
const EXPLODE_SUCCESS_VALUE = 6;
const EXPLODE_FAIL_VALUE = 1;

/**
 * Creates a new roll from dice notation components
 * Pre-calculates final values for all dice immediately, including exploding dice
 * @param text - Dice notation text (e.g., "3d+2")
 * @param dice - Array of initial dice (before final numbers are calculated)
 * @param modifier - Modifier value
 * @param diceCount - Original number of dice (before exploding)
 * @returns A new Roll object with pre-calculated final numbers, durations, and all exploding dice
 */
export function createRoll(
  text: string,
  dice: Die[],
  modifier: number,
  diceCount: number
): Roll {
  const allDice: Die[] = [];
  // Get the maximum ID from initial dice to ensure unique IDs for exploding dice
  const maxInitialId = dice.length > 0 ? Math.max(...dice.map((d) => d.id)) : -1;
  let nextExplodingDieId = maxInitialId + 1;

  // Process initial dice
  for (const die of dice) {
    const finalNumber = generateRandomFace();
    const stopAfter = generateRollDuration();
    
    // Check for explosion failure (roll 1 on exploding die)
    const isCancelled = die.canExplodeFail && finalNumber === EXPLODE_FAIL_VALUE;
    
    allDice.push({
      ...die,
      finalNumber,
      stopAfter,
      isCancelled,
      // Mark the original exploding die with chainDepth 0
      ...(die.canExplodeSucceed ? { chainDepth: 0 } : {}),
    });

    // Check for explosion success (roll 6 on exploding die)
    if (die.canExplodeSucceed && finalNumber === EXPLODE_SUCCESS_VALUE && !isCancelled) {
      let depth = 1;
      while (true) {
        const explodingFinalNumber = generateRandomFace();
        const explodingStopAfter = generateRollDuration();

        allDice.push({
            id: nextExplodingDieId++,
            isExploding: true,
            canExplodeSucceed: true,
            canExplodeFail: false,
            finalNumber: explodingFinalNumber,
            stopAfter: explodingStopAfter,
            chainDepth: depth,
          });

        // If this exploding die rolled 6, create another one
        if (explodingFinalNumber !== EXPLODE_SUCCESS_VALUE) {
          break;
        }
        depth++;
      }
    }
  }

  // Apply cancellation logic: if any exploding dice rolled 1, cancel highest non-exploding dice
  const failureCount = allDice.filter(
    (d) => d.canExplodeFail && d.finalNumber === EXPLODE_FAIL_VALUE
  ).length;

  if (failureCount > 0) {
    const nonExplodingDice = allDice
      .filter((d) => !d.isExploding && !d.isCancelled)
      .sort((a, b) => (b.finalNumber ?? 0) - (a.finalNumber ?? 0))
      .slice(0, failureCount);

    for (const dieToCancel of nonExplodingDice) {
      const dieIndex = allDice.findIndex((d) => d.id === dieToCancel.id);
      if (dieIndex !== -1) {
        allDice[dieIndex] = { ...allDice[dieIndex], isCancelled: true };
      }
    }
  }

  return {
    id: Date.now(),
    text,
    dice: allDice,
    modifier,
    diceCount,
    date: new Date().toISOString(),
  };
}

/**
 * Creates CP (character point) dice to append to an existing roll.
 * CP dice only explode on 6 (no cancel-on-1). If a CP die rolls 6,
 * it chain-spawns more dice following the same explosion rules.
 * @param count - Number of CP dice to create (1 or 2)
 * @param startingId - Starting ID to avoid collisions with existing dice
 * @returns Array of CP dice with pre-calculated values
 */
export function createCpDice(count: number, startingId: number): Die[] {
  const cpDice: Die[] = [];
  let nextId = startingId;

  for (let i = 0; i < count; i++) {
    const finalNumber = generateRandomFace();
    const stopAfter = generateRollDuration();

    cpDice.push({
      id: nextId++,
      isExploding: true,
      isCpDie: true,
      canExplodeSucceed: true,
      canExplodeFail: false,
      finalNumber,
      stopAfter,
      chainDepth: 0,
    });

    // Chain-explode on 6
    if (finalNumber === EXPLODE_SUCCESS_VALUE) {
      let depth = 1;
      while (true) {
        const explodingFinalNumber = generateRandomFace();
        const explodingStopAfter = generateRollDuration();

        cpDice.push({
          id: nextId++,
          isExploding: true,
          isCpDie: true,
          canExplodeSucceed: true,
          canExplodeFail: false,
          finalNumber: explodingFinalNumber,
          stopAfter: explodingStopAfter,
          chainDepth: depth,
        });

        if (explodingFinalNumber !== EXPLODE_SUCCESS_VALUE) {
          break;
        }
        depth++;
      }
    }
  }

  return cpDice;
}

