/**
 * Per-identity request limiting.
 *
 * Cloudflare's WAF rate-limiting rules are behind a sales paywall on this
 * account's plan, so there is no edge-level cap in front of eradice: an
 * admitted user can still make the cluster do work. This is the only limiter,
 * and it is deliberately modest — Access already bounds *who* can reach the
 * app to a short allowlist, so this exists to stop a runaway client or a stuck
 * retry loop, not to withstand a determined attacker.
 *
 * Counters live in process memory. They reset on restart and apply per replica,
 * which is a real limitation and the reason this is a backstop rather than a
 * guarantee.
 */

export interface RateLimit {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export const RATE_LIMITS = {
  /** Everything, as a floor. Generous: normal play is bursty. */
  default: { limit: 120, windowMs: 60_000 },
  /** Roll submission and CP spends. */
  mutate: { limit: 20, windowMs: 10_000 },
  /** Comment writes and renames. */
  write: { limit: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimit>;

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets; suitable for a Retry-After header. */
  retryAfter: number;
  remaining: number;
}

export function checkRateLimit(key: string, limit: RateLimit, now = Date.now()): RateLimitResult {
  // Opportunistic sweep. Without it the map grows once per identity per bucket
  // and never shrinks; doing it here keeps the limiter free of timers, which
  // would otherwise hold the process open.
  if (windows.size > 1000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { allowed: true, retryAfter: 0, remaining: limit.limit - 1 };
  }

  existing.count += 1;
  if (existing.count > limit.limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0,
    };
  }
  return { allowed: true, retryAfter: 0, remaining: limit.limit - existing.count };
}

/** Test helper. */
export function resetRateLimits(): void {
  windows.clear();
}
