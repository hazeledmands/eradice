import { PAUSE_ANIMATION_AFTER_MS, resolveAnimationMode, SLOW_ANIMATION_AFTER_MS } from '../engagement';

describe('resolveAnimationMode', () => {
  it('stays active before idle threshold', () => {
    expect(resolveAnimationMode(SLOW_ANIMATION_AFTER_MS - 1, false)).toBe('active');
  });

  it('switches to slow after 60 seconds of inactivity', () => {
    expect(resolveAnimationMode(SLOW_ANIMATION_AFTER_MS, false)).toBe('slow');
  });

  it('pauses after longer inactivity', () => {
    expect(resolveAnimationMode(PAUSE_ANIMATION_AFTER_MS, false)).toBe('paused');
  });

  it('pauses immediately when tab is hidden', () => {
    expect(resolveAnimationMode(0, true)).toBe('paused');
  });
});
