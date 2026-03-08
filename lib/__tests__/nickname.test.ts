import { generateNickname } from '../nickname';

describe('generateNickname', () => {
  it('returns a string with two words separated by a space', () => {
    const name = generateNickname();
    const parts = name.split(' ');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('generates different nicknames (not always the same)', () => {
    const names = new Set(Array.from({ length: 20 }, () => generateNickname()));
    // With 20x20=400 combinations and 20 draws, collisions are possible
    // but getting only 1 unique name is astronomically unlikely
    expect(names.size).toBeGreaterThan(1);
  });
});
