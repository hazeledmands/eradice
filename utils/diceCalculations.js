/**
 * Calculates the total result of a roll
 * @param {Object} roll - Roll object with dice array and optional modifier
 * @returns {number | null} Total result, or null if roll has no dice or missing finalNumbers
 */
export function calculateRollResult(roll) {
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
 * @param {Object} roll - Roll object with dice array and modifier
 * @returns {string} Formatted copy text
 */
export function generateCopyText(roll) {
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

