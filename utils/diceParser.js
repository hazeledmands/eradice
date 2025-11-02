/**
 * Parses dice notation string (e.g., "3d+2" or "5d")
 * @param {string} text - Dice notation string
 * @returns {{diceCount: number, modifier: number} | null} Parsed dice count and modifier, or null if invalid
 */
export function parseDiceNotation(text) {
  const parser = /(?<dice>\d+)\s*d\s*(\+\s*(?<modifier>\d+))?/i;
  const result = parser.exec(text);

  if (result == null) {
    return null;
  }

  const diceCount = parseInt(result.groups.dice, 10);
  const modifier = result.groups.modifier == null ? 0 : parseInt(result.groups.modifier, 10);

  return { diceCount, modifier };
}

/**
 * Creates initial dice array for a given dice count
 * @param {number} diceCount - Number of dice to create
 * @returns {Array} Array of dice objects
 */
export function createDiceArray(diceCount) {
  const dice = [];
  for (let i = 0; i < diceCount; ++i) {
    const isExploding = i === diceCount - 1;
    dice.push({
      id: i,
      isRolling: true,
      isExploding,
      canExplodeSucceed: isExploding,
      canExplodeFail: isExploding,
    });
  }
  return dice;
}

