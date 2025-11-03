import fc from 'fast-check';
import { parseDiceNotation } from '../diceParser';

describe('parseDiceNotation - Property-Based Tests', () => {
  /**
   * Property 1: Valid dice notation strings should always parse successfully
   * Format: <number>d[+<modifier>] with optional whitespace and case-insensitive 'd'
   * Includes zero dice count as an edge case
   */
  it('should parse valid dice notation strings', () => {
    // Helper to generate whitespace strings
    const whitespaceArb = fc.array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 3 }).map((arr) => arr.join(''));

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }), // dice count (includes 0)
        fc.boolean(), // whether to include modifier
        fc.integer({ min: 0, max: 1000 }), // modifier value
        fc.constantFrom('d', 'D'), // case-insensitive 'd' character
        whitespaceArb, // whitespace before 'd'
        whitespaceArb, // whitespace after 'd'
        whitespaceArb, // whitespace around '+'
        (diceCount, includeModifier, modifier, dChar, ws1, ws2, ws3) => {
          let input: string;
          if (includeModifier) {
            input = `${diceCount}${ws1}${dChar}${ws2}+${ws3}${modifier}`;
          } else {
            input = `${diceCount}${ws1}${dChar}${ws2}`;
          }

          const result = parseDiceNotation(input);

          expect(result).not.toBeNull();
          expect(result).toHaveProperty('diceCount');
          expect(result).toHaveProperty('modifier');
          expect(result?.diceCount).toBe(diceCount);
          expect(result?.modifier).toBe(includeModifier ? modifier : 0);
        }
      )
    );
  });

  /**
   * Property 2: Invalid strings should return null
   * The parser matches: <digits><optional whitespace>d<optional whitespace><optional +<digits>>
   * Since the regex uses exec() (not anchored), it matches any substring matching the pattern.
   * So we test strings that cannot contain this pattern anywhere.
   */
  it('should return null for invalid dice notation strings', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Strings without 'd' or 'D' at all (guaranteed no match)
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.toLowerCase().includes('d')),
          // Strings without any digits (guaranteed no match since pattern requires digits)
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/\d/.test(s)),
          // Empty string
          fc.constant(''),
          // Just whitespace without 'd'
          fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^\s+$/.test(s) && !s.toLowerCase().includes('d'))
        ),
        (invalidInput) => {
          const result = parseDiceNotation(invalidInput);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 } // Reduce runs since some filters might be slow
    );
  });

  /**
   * Property 3: Parsed values should be integers
   */
  it('should always return integer values for diceCount and modifier', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.boolean(),
        fc.integer({ min: 0, max: 1000 }),
        (diceCount, includeModifier, modifier) => {
          const input = includeModifier ? `${diceCount}d+${modifier}` : `${diceCount}d`;
          const result = parseDiceNotation(input);

          expect(result).not.toBeNull();
          expect(Number.isInteger(result?.diceCount)).toBe(true);
          expect(Number.isInteger(result?.modifier)).toBe(true);
        }
      )
    );
  });

  /**
   * Property 4: Round-trip property - parsing should be consistent
   * If we parse a valid string, the result should match what we expect
   */
  it('should consistently parse the same notation multiple times', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.boolean(),
        fc.integer({ min: 0, max: 1000 }),
        (diceCount, includeModifier, modifier) => {
          const input = includeModifier ? `${diceCount}d+${modifier}` : `${diceCount}d`;

          const result1 = parseDiceNotation(input);
          const result2 = parseDiceNotation(input);
          const result3 = parseDiceNotation(input);

          expect(result1).toEqual(result2);
          expect(result2).toEqual(result3);
        }
      )
    );
  });
});

