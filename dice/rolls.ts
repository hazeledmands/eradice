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
      isRolling: false, // Ledger will control when to start rolling
      isCancelled,
    });

    // Check for explosion success (roll 6 on exploding die)
    if (die.canExplodeSucceed && finalNumber === EXPLODE_SUCCESS_VALUE && !isCancelled) {
      // Recursively calculate exploding dice
      let currentExplodingDie: Die = {
        id: nextExplodingDieId++,
        isRolling: false,
        isExploding: true,
        canExplodeSucceed: true,
        canExplodeFail: false,
      };

      // Keep adding exploding dice as long as they roll 6
      while (currentExplodingDie.canExplodeSucceed) {
        const explodingFinalNumber = generateRandomFace();
        const explodingStopAfter = generateRollDuration();
        
        allDice.push({
          ...currentExplodingDie,
          finalNumber: explodingFinalNumber,
          stopAfter: explodingStopAfter,
        });

        // If this exploding die rolled 6, create another one
        if (explodingFinalNumber === EXPLODE_SUCCESS_VALUE) {
          currentExplodingDie = {
            id: nextExplodingDieId++,
            isRolling: false,
            isExploding: true,
            canExplodeSucceed: true,
            canExplodeFail: false,
          };
        } else {
          break;
        }
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
  };
}

