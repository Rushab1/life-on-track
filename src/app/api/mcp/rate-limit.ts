/** Simple fixed-window rate limiter. Per-instance only (no shared state). */
class RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  /** Returns true if allowed, false if rate-limited. */
  check(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = this.windows.get(key);

    if (!entry || now >= entry.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (entry.count >= limit) return false;
    entry.count++;
    return true;
  }

  /** Remove expired entries to prevent memory growth. */
  cleanup() {
    const now = Date.now();
    this.windows.forEach((entry, key) => {
      if (now >= entry.resetAt) this.windows.delete(key);
    });
  }
}

const limiter = new RateLimiter();

// Cleanup every 60 seconds in long-lived processes
if (typeof setInterval !== "undefined") {
  setInterval(() => limiter.cleanup(), 60_000);
}

const MINUTE = 60_000;

/** Pre-auth: absorb junk traffic by IP. */
export function checkIpLimit(ip: string): boolean {
  return limiter.check(`ip:${ip}`, 100, MINUTE);
}

/** Auth failures: tighter bucket per IP. */
export function checkAuthFailureLimit(ip: string): boolean {
  return limiter.check(`auth-fail:${ip}`, 10, MINUTE);
}

/** Post-auth: limit per user to cap DB load. */
export function checkUserLimit(userId: string): boolean {
  return limiter.check(`user:${userId}`, 60, MINUTE);
}
