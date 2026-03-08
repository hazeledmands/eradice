export const BACKOFF_CONFIG = {
  baseDelay: 1000,
  maxDelay: 30000,
  maxJitter: 1000,
} as const;

export function getBackoffDelay(attempt: number): number {
  const exponential = Math.min(
    BACKOFF_CONFIG.baseDelay * Math.pow(2, attempt),
    BACKOFF_CONFIG.maxDelay
  );
  const jitter = Math.random() * BACKOFF_CONFIG.maxJitter;
  return exponential + jitter;
}
