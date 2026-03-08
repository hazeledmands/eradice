import { getBackoffDelay, BACKOFF_CONFIG } from '../backoff';

describe('getBackoffDelay', () => {
  it('returns the base delay on first attempt', () => {
    const delay = getBackoffDelay(0);
    // Should be baseDelay (1000ms) plus some jitter (0-500ms)
    expect(delay).toBeGreaterThanOrEqual(BACKOFF_CONFIG.baseDelay);
    expect(delay).toBeLessThanOrEqual(BACKOFF_CONFIG.baseDelay + BACKOFF_CONFIG.maxJitter);
  });

  it('increases delay exponentially with attempt number', () => {
    // With 0 jitter, delay should double each attempt
    // attempt 0: 1000ms, attempt 1: 2000ms, attempt 2: 4000ms
    const delay0 = getBackoffDelay(0);
    const delay1 = getBackoffDelay(1);
    const delay2 = getBackoffDelay(2);

    // Due to jitter, we can only verify the base grows
    // delay1 base >= delay0 base
    expect(delay1).toBeGreaterThanOrEqual(BACKOFF_CONFIG.baseDelay * 2);
    expect(delay2).toBeGreaterThanOrEqual(BACKOFF_CONFIG.baseDelay * 4);
  });

  it('caps delay at maxDelay', () => {
    const delay = getBackoffDelay(100); // Very high attempt
    expect(delay).toBeLessThanOrEqual(BACKOFF_CONFIG.maxDelay + BACKOFF_CONFIG.maxJitter);
  });

  it('adds jitter to prevent thundering herd', () => {
    // Run multiple times and verify not all identical
    const delays = Array.from({ length: 20 }, () => getBackoffDelay(0));
    const unique = new Set(delays);
    // With random jitter, extremely unlikely all 20 are identical
    expect(unique.size).toBeGreaterThan(1);
  });

  it('exports sensible config defaults', () => {
    expect(BACKOFF_CONFIG.baseDelay).toBe(1000);
    expect(BACKOFF_CONFIG.maxDelay).toBe(30000);
    expect(BACKOFF_CONFIG.maxJitter).toBe(1000);
  });
});
