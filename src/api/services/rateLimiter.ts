export class SlidingWindowRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private records = new Map<string, number[]>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(windowMs = 60000, maxRequests = 10) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Periodic cleanup of stale IP records every 2 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 2 * 60 * 1000);

    if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  public check(key: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const threshold = now - this.windowMs;

    let timestamps = this.records.get(key) || [];
    // Filter timestamps within current window
    timestamps = timestamps.filter((t) => t > threshold);

    if (timestamps.length >= this.maxRequests) {
      const oldest = timestamps[0];
      const resetMs = Math.max(0, oldest + this.windowMs - now);
      this.records.set(key, timestamps);
      return { allowed: false, remaining: 0, resetMs };
    }

    timestamps.push(now);
    this.records.set(key, timestamps);
    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetMs: this.windowMs,
    };
  }

  public reset(key: string) {
    this.records.delete(key);
  }

  private cleanup() {
    const threshold = Date.now() - this.windowMs;
    for (const [key, timestamps] of this.records.entries()) {
      const active = timestamps.filter((t) => t > threshold);
      if (active.length === 0) {
        this.records.delete(key);
      } else {
        this.records.set(key, active);
      }
    }
  }
}

// 10 requests per minute for unauthenticated parsing
export const unauthenticatedParserRateLimiter = new SlidingWindowRateLimiter(60000, 10);
