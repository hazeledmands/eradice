import type { Roll } from './types';

/**
 * Calculates the total result of a roll
 * @param roll - Roll object with dice array and optional modifier
 * @returns Total result, or null if roll has no dice or missing finalNumbers
 */
export function calculateRollResult(roll: Roll): number | null {
  if (!roll.dice || roll.dice.length === 0) return null;
  
  // Use finalNumber which is available immediately (pre-calculated)
  // No need to wait for animation to complete
  const diceWithFinalNumbers = roll.dice.filter(die => die.finalNumber != null);
  if (diceWithFinalNumbers.length === 0) return null;

  const totalFaces = diceWithFinalNumbers
    .filter(die => !die.isCancelled)
    .reduce((acc, die) => (die.finalNumber ?? 0) + acc, 0);
  
  const modifier = roll.modifier || 0;
  return totalFaces + modifier;
}

/**
 * Generates copy text for a roll
 * @param roll - Roll object with dice array and modifier
 * @returns Formatted copy text
 */
export function generateCopyText(roll: Roll): string {
  const result = calculateRollResult(roll);
  if (result === null) return '';

  // Use finalNumber which is available immediately (pre-calculated)
  const diceWithFinalNumbers = roll.dice.filter(die => die.finalNumber != null);
  const modifier = roll.modifier || 0;
  
  let copyText = `${roll.text} =`;
  
  // Add individual dice values
  if (diceWithFinalNumbers.length > 0) {
    const diceParts = diceWithFinalNumbers.map(die => {
      if (die.isCancelled) {
        return `[${die.finalNumber}-canceled]`;
      }
      if (die.isCpDie) {
        return `[${die.finalNumber}-cp]`;
      }
      return `[${die.finalNumber}]`;
    });
    copyText += ` ${diceParts.join(' ')}`;
  }
  
  // Add modifier if present
  if (modifier > 0) {
    copyText += ` + ${modifier}`;
  }
  
  // Add final result
  copyText += ` = ${result}`;
  
  return copyText;
}

/**
 * Generates a math breakdown string for a completed roll.
 * Assumes all dice have finalNumber set.
 * Returns null when no breakdown is needed (single die, no modifier, no crits/CP).
 */
export function generateMathText(roll: Roll): string | null {
  const dice = roll.dice;
  const modifier = roll.modifier || 0;

  const nonCpDice = dice.filter((d) => !d.isCpDie);
  const cpDice = dice.filter((d) => d.isCpDie);
  const cpSum = cpDice.reduce((acc, d) => (d.finalNumber ?? 0) + acc, 0);

  const hasCritSuccess = dice.some((d) => d.chainDepth != null && d.chainDepth >= 1);
  const hasCritFail = dice.some((d) => d.canExplodeFail && d.finalNumber === 1);
  const hasCpDice = cpDice.length > 0;
  const showDetailedMath = hasCritSuccess || hasCritFail || hasCpDice;

  const totalFaces = dice
    .filter((d) => !d.isCancelled && d.finalNumber != null)
    .reduce((acc, d) => (d.finalNumber ?? 0) + acc, 0);
  const hasCancelledDice = dice.some((d) => d.isCancelled);

  if (showDetailedMath) {
    const parts: string[] = [];

    if (hasCritFail) {
      // Exclude the wild die itself; show only non-wild dice math
      const nonWildNonCpDice = nonCpDice.filter((d) => !d.canExplodeFail);
      const rawSum = nonWildNonCpDice.reduce((acc, d) => (d.finalNumber ?? 0) + acc, 0);
      const cancelledSum = nonWildNonCpDice
        .filter((d) => d.isCancelled)
        .reduce((acc, d) => (d.finalNumber ?? 0) + acc, 0);

      if (cancelledSum > 0) {
        parts.push(`${rawSum} \u2212 ${cancelledSum}`);
      } else if (rawSum > 0) {
        parts.push(`${rawSum}`);
      }
    } else {
      // Crit success or CP: base dice (chainDepth null/0) vs spawned chain (chainDepth >= 1)
      const baseDice = nonCpDice.filter((d) => d.chainDepth == null || d.chainDepth === 0);
      const chainDice = nonCpDice.filter((d) => d.chainDepth != null && d.chainDepth >= 1);
      const baseSum = baseDice.reduce((acc, d) => (d.finalNumber ?? 0) + acc, 0);
      const chainSum = chainDice.reduce((acc, d) => (d.finalNumber ?? 0) + acc, 0);

      if (chainSum > 0) {
        parts.push(`${baseSum} + ${chainSum}`);
      } else {
        parts.push(`${baseSum}`);
      }
    }

    if (cpSum > 0) parts.push(`+ ${cpSum}`);
    if (modifier > 0) parts.push(`+ ${modifier}`);
    parts.push(`= ${totalFaces + modifier}`);
    return parts.join(' ');
  }

  // Simple math (no crits/CP)
  const text: string[] = [];
  if (dice.length > 1 || hasCancelledDice) text.push(`= ${totalFaces}`);
  if (modifier > 0) text.push(`+ ${modifier}`);
  if (modifier > 0) text.push(`= ${modifier + totalFaces}`);
  return text.length > 0 ? text.join(' ') : null;
}
