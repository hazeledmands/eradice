import type { Roll } from '../types/dice';

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

