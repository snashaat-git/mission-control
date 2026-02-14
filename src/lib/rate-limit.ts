/**
 * In-memory sliding window rate limiter
 * Keyed by IP address, configurable per route group
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private windowMs: number;
  private max: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: RateLimitConfig) {
    this.windowMs = opts.windowMs;
    this.max = opts.max;

    // Cleanup expired entries every 60s
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const entry = this.store.get(key);

    // No entry or window expired — start fresh
    if (!entry || now >= entry.resetAt) {
      const resetAt = now + this.windowMs;
      this.store.set(key, { count: 1, resetAt });
      return { success: true, limit: this.max, remaining: this.max - 1, resetAt };
    }

    // Within window — increment
    entry.count += 1;

    if (entry.count > this.max) {
      return {
        success: false,
        limit: this.max,
        remaining: 0,
        resetAt: entry.resetAt,
      };
    }

    return {
      success: true,
      limit: this.max,
      remaining: this.max - entry.count,
      resetAt: entry.resetAt,
    };
  }

  getConfig(): RateLimitConfig {
    return { windowMs: this.windowMs, max: this.max };
  }

  updateConfig(opts: Partial<RateLimitConfig>) {
    if (opts.windowMs !== undefined) this.windowMs = opts.windowMs;
    if (opts.max !== undefined) this.max = opts.max;
    // Clear existing entries so new limits apply immediately
    this.store.clear();
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

// Pre-configured limiters for each tier
export const strictLimiter = new RateLimiter({ windowMs: 60_000, max: 20 });
export const standardLimiter = new RateLimiter({ windowMs: 60_000, max: 60 });
export const relaxedLimiter = new RateLimiter({ windowMs: 60_000, max: 120 });

/** Get all tier configs */
export function getAllConfigs() {
  return {
    strict: strictLimiter.getConfig(),
    standard: standardLimiter.getConfig(),
    relaxed: relaxedLimiter.getConfig(),
  };
}

/** Update tier configs */
export function updateAllConfigs(configs: {
  strict?: Partial<RateLimitConfig>;
  standard?: Partial<RateLimitConfig>;
  relaxed?: Partial<RateLimitConfig>;
}) {
  if (configs.strict) strictLimiter.updateConfig(configs.strict);
  if (configs.standard) standardLimiter.updateConfig(configs.standard);
  if (configs.relaxed) relaxedLimiter.updateConfig(configs.relaxed);
}
