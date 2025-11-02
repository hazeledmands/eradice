/**
 * Calculates the total result of a roll
 * @param {Object} roll - Roll object with dice array and optional modifier
 * @returns {number | null} Total result, or null if roll is incomplete
 */
export function calculateRollResult(roll) {
  if (!roll.dice || roll.dice.length === 0) return null;
  
  const isComplete = roll.dice.every(die => !die.isRolling);
  if (!isComplete) return null;

  const totalFaces = roll.dice
    .filter(die => !die.isRolling && !die.isCancelled)
    .reduce((acc, die) => die.number + acc, 0);
  
  const modifier = roll.modifier || 0;
  return totalFaces + modifier;
}

/**
 * Generates copy text for a completed roll
 * @param {Object} roll - Roll object with dice array and modifier
 * @returns {string} Formatted copy text
 */
export function generateCopyText(roll) {
  const result = calculateRollResult(roll);
  if (result === null) return '';

  const allCompletedDice = roll.dice.filter(die => !die.isRolling);
  const modifier = roll.modifier || 0;
  
  let copyText = `${roll.text} =`;
  
  // Add individual dice values
  if (allCompletedDice.length > 0) {
    const diceParts = allCompletedDice.map(die => {
      if (die.isCancelled) {
        return `[${die.number}-canceled]`;
      }
      return `[${die.number}]`;
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

