import { generateSlug } from '../slug';

describe('generateSlug', () => {
  it('returns a slug in word-word-number format', () => {
    const slug = generateSlug();
    expect(slug).toMatch(/^[a-z]+-[a-z]+-\d+$/);
  });

  it('generates a number between 0 and 99', () => {
    // Run several times to increase confidence
    for (let i = 0; i < 50; i++) {
      const slug = generateSlug();
      const num = parseInt(slug.split('-').pop()!, 10);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThan(100);
    }
  });

  it('generates different slugs (not always the same)', () => {
    const slugs = new Set(Array.from({ length: 20 }, () => generateSlug()));
    expect(slugs.size).toBeGreaterThan(1);
  });
});
