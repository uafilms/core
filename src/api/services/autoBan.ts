import type { Context, MiddlewareHandler } from 'hono';
import crypto from 'crypto';
import { getClientIp } from './security.js';

interface IpBanRecord {
  strikes: number[];
  banCount: number;
  bannedUntil: number | null;
}

export class AutoBanService {
  private records = new Map<string, IpBanRecord>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);

    if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  private isEnabled(): boolean {
    return process.env.AUTOBAN_ENABLED !== 'false';
  }

  private getThreshold(): number {
    return parseInt(process.env.AUTOBAN_THRESHOLD || '3', 10);
  }

  private getWindowMs(): number {
    const minutes = parseInt(process.env.AUTOBAN_WINDOW_MINUTES || '10', 10);
    return minutes * 60 * 1000;
  }

  private getBaseMinutes(): number {
    return parseInt(process.env.AUTOBAN_BASE_MINUTES || '30', 10);
  }

  /**
   * Progressive ban duration (Option B):
   * 1st ban: 30 minutes (or AUTOBAN_BASE_MINUTES)
   * 2nd ban: 2 hours (120 minutes)
   * 3rd+ ban: 24 hours (1440 minutes)
   */
  private getBanDurationMs(banCount: number): number {
    const baseMin = this.getBaseMinutes();
    if (banCount <= 1) {
      return baseMin * 60 * 1000; // e.g. 30 min
    }
    if (banCount === 2) {
      return 2 * 60 * 60 * 1000; // 2 hours
    }
    return 24 * 60 * 60 * 1000; // 24 hours
  }

  public check(ip: string): { banned: boolean; remainingMs: number; formattedRemaining: string; banCount: number } {
    if (!this.isEnabled() || !ip || ip === 'unknown' || ip === '127.0.0.1' || ip === 'localhost') {
      return { banned: false, remainingMs: 0, formattedRemaining: '', banCount: 0 };
    }

    const record = this.records.get(ip);
    if (!record || !record.bannedUntil) {
      return { banned: false, remainingMs: 0, formattedRemaining: '', banCount: record?.banCount || 0 };
    }

    const now = Date.now();
    if (now >= record.bannedUntil) {
      // Ban expired
      record.bannedUntil = null;
      record.strikes = [];
      return { banned: false, remainingMs: 0, formattedRemaining: '', banCount: record.banCount };
    }

    const remainingMs = record.bannedUntil - now;
    const remainingMin = Math.ceil(remainingMs / 60000);
    const formattedRemaining =
      remainingMin >= 60
        ? `${Math.floor(remainingMin / 60)} год. ${remainingMin % 60} хв.`
        : `${remainingMin} хв.`;

    return {
      banned: true,
      remainingMs,
      formattedRemaining,
      banCount: record.banCount,
    };
  }

  public recordViolation(ip: string): {
    banned: boolean;
    bannedUntil: number | null;
    banMinutes: number;
    banCount: number;
    strikes: number;
  } {
    if (!this.isEnabled() || !ip || ip === 'unknown' || ip === '127.0.0.1' || ip === 'localhost') {
      return { banned: false, bannedUntil: null, banMinutes: 0, banCount: 0, strikes: 0 };
    }

    const now = Date.now();
    const windowMs = this.getWindowMs();
    const threshold = this.getThreshold();

    let record = this.records.get(ip);
    if (!record) {
      record = { strikes: [], banCount: 0, bannedUntil: null };
      this.records.set(ip, record);
    }

    // Filter strikes within sliding window
    record.strikes = record.strikes.filter((t) => t > now - windowMs);
    record.strikes.push(now);

    if (record.strikes.length >= threshold) {
      record.banCount += 1;
      const banDurationMs = this.getBanDurationMs(record.banCount);
      record.bannedUntil = now + banDurationMs;
      record.strikes = [];

      const banMinutes = Math.round(banDurationMs / 60000);
      console.warn(
        `[AutoBan] IP ${ip} temporarily banned for ${banMinutes} min (ban #${record.banCount}, threshold=${threshold})`
      );

      return {
        banned: true,
        bannedUntil: record.bannedUntil,
        banMinutes,
        banCount: record.banCount,
        strikes: threshold,
      };
    }

    return {
      banned: false,
      bannedUntil: null,
      banMinutes: 0,
      banCount: record.banCount,
      strikes: record.strikes.length,
    };
  }

  public unban(ip: string) {
    this.records.delete(ip);
  }

  private cleanup() {
    const now = Date.now();
    const windowMs = this.getWindowMs();

    for (const [ip, record] of this.records.entries()) {
      const isStillBanned = record.bannedUntil && record.bannedUntil > now;
      const hasRecentStrikes = record.strikes.some((t) => t > now - windowMs);

      if (!isStillBanned && !hasRecentStrikes) {
        this.records.delete(ip);
      }
    }
  }
}

export const autoBanService = new AutoBanService();

export const autoBanMiddleware: MiddlewareHandler = async (c, next) => {
  const ip = getClientIp(c);
  const banStatus = autoBanService.check(ip);

  if (banStatus.banned) {
    return c.json(
      {
        error: {
          code: 'IP_TEMPORARILY_BANNED',
          message: `Вашу IP-адресу тимчасово заблоковано через повторні порушення лімітів. Розблокування через ${banStatus.formattedRemaining}.`,
        },
        traceId: crypto.randomUUID(),
      },
      403
    );
  }

  return next();
};
