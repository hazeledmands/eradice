import { selectPrompt } from '../Roller/terminalPrompts';

describe('selectPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = selectPrompt(null);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('avoids returning the previous prompt', () => {
    // Run many times to confirm we never repeat the previous prompt
    let previous = selectPrompt(null);
    for (let i = 0; i < 200; i++) {
      const next = selectPrompt(previous);
      expect(next).not.toBe(previous);
      previous = next;
    }
  });

  it('accepts null as previous (no prior prompt)', () => {
    expect(() => selectPrompt(null)).not.toThrow();
  });

  it('returns different prompts across multiple calls (not always the same)', () => {
    const results = new Set<string>();
    let last = selectPrompt(null);
    results.add(last);
    for (let i = 0; i < 50; i++) {
      last = selectPrompt(last);
      results.add(last);
    }
    // With >1 prompt available we should see more than one distinct value
    expect(results.size).toBeGreaterThan(1);
  });
});
