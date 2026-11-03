import axios, { type AxiosRequestConfig } from 'axios';
import dns from 'node:dns/promises';
import net from 'node:net';
import type { Context, MiddlewareHandler } from 'hono';
import { getClientIp } from '../services/security.js';
import { autoBanService } from '../services/autoBan.js';
import { logWarn } from '../../utils/logger.js';

type StreamKind = 'manifest' | 'segment' | 'subtitle' | 'play';

export class StreamGuardError extends Error {
  constructor(
    public readonly status: 400 | 403 | 413 | 429 | 502 | 503,
    message: string
  ) {
    super(message);
    this.name = 'StreamGuardError';
  }
}

function intEnv(name: string, fallback: number): number {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boolEnv(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

const MAX_MANIFEST_BYTES = intEnv('STREAM_MAX_MANIFEST_BYTES', 2 * 1024 * 1024);
const MAX_SUBTITLE_BYTES = intEnv('STREAM_MAX_SUBTITLE_BYTES', 2 * 1024 * 1024);
const MAX_ASS_BYTES = intEnv('STREAM_MAX_ASS_BYTES', 5 * 1024 * 1024);
const MAX_SEGMENT_BYTES = intEnv('STREAM_MAX_SEGMENT_BYTES', 32 * 1024 * 1024);
const MAX_CONCURRENT_SEGMENTS = intEnv('STREAM_MAX_CONCURRENT_SEGMENTS', 24);
const DNS_TIMEOUT_MS = intEnv('STREAM_DNS_TIMEOUT_MS', 3000);
const DNS_TTL_MS = 5 * 60 * 1000;
const DNS_NEGATIVE_TTL_MS = 60 * 1000;

const GLOBAL_LIMITS: Record<StreamKind, { burst: number; perMinute: number }> = {
  manifest: {
    burst: intEnv('STREAM_GLOBAL_MANIFEST_BURST', 2000),
    perMinute: intEnv('STREAM_GLOBAL_MANIFEST_PER_MINUTE', 3000),
  },
  segment: {
    burst: intEnv('STREAM_GLOBAL_SEGMENT_BURST', 3000),
    perMinute: intEnv('STREAM_GLOBAL_SEGMENT_PER_MINUTE', 10000),
  },
  subtitle: {
    burst: intEnv('STREAM_GLOBAL_SUBTITLE_BURST', 500),
    perMinute: intEnv('STREAM_GLOBAL_SUBTITLE_PER_MINUTE', 1000),
  },
  play: {
    burst: intEnv('STREAM_GLOBAL_PLAY_BURST', 500),
    perMinute: intEnv('STREAM_GLOBAL_PLAY_PER_MINUTE', 1000),
  },
};

const RATE_LIMITS: Record<StreamKind, { burst: number; perMinute: number; daily: number }> = {
  manifest: {
    burst: intEnv('STREAM_MANIFEST_BURST', 120),
    perMinute: intEnv('STREAM_MANIFEST_PER_MINUTE', 120),
    daily: intEnv('STREAM_MANIFEST_DAILY_QUOTA', 10000),
  },
  segment: {
    burst: intEnv('STREAM_SEGMENT_BURST', 300),
    perMinute: intEnv('STREAM_SEGMENT_PER_MINUTE', 1200),
    daily: intEnv('STREAM_SEGMENT_DAILY_QUOTA', 50000),
  },
  subtitle: {
    burst: intEnv('STREAM_SUBTITLE_BURST', 30),
    perMinute: intEnv('STREAM_SUBTITLE_PER_MINUTE', 60),
    daily: intEnv('STREAM_SUBTITLE_DAILY_QUOTA', 500),
  },
  play: {
    burst: intEnv('STREAM_PLAY_BURST', 30),
    perMinute: intEnv('STREAM_PLAY_PER_MINUTE', 30),
    daily: intEnv('STREAM_PLAY_DAILY_QUOTA', 2000),
  },
};

interface Bucket {
  tokens: number;
  updatedAt: number;
}

class TokenBucketLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number
  ) {
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref();
  }

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.capacity, updatedAt: now };
      this.buckets.set(key, bucket);
    } else {
      const elapsed = Math.max(0, now - bucket.updatedAt);
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerMs);
      bucket.updatedAt = now;
    }

    if (bucket.tokens < 1) {
      return {
        allowed: false,
        retryAfterMs: Math.ceil((1 - bucket.tokens) / this.refillPerMs),
      };
    }

    bucket.tokens -= 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  private cleanup() {
    const staleBefore = Date.now() - 30 * 60 * 1000;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.updatedAt < staleBefore) this.buckets.delete(key);
    }
  }
}

class DailyQuota {
  private day = this.currentDay();
  private counts = new Map<string, number>();

  check(key: string, limit: number): boolean {
    const today = this.currentDay();
    if (today !== this.day) {
      this.day = today;
      this.counts.clear();
    }

    const next = (this.counts.get(key) || 0) + 1;
    this.counts.set(key, next);
    return next <= limit;
  }

  private currentDay(): string {
    return new Date().toISOString().slice(0, 10);
  }
}

class DailyByteQuota {
  private day = this.currentDay();
  private used = new Map<string, number>();

  hasBudget(key: string, limit: number): boolean {
    this.rotate();
    return (this.used.get(key) || 0) < limit;
  }

  consume(key: string, bytes: number): void {
    this.rotate();
    this.used.set(key, (this.used.get(key) || 0) + Math.max(0, bytes));
  }

  private rotate(): void {
    const today = this.currentDay();
    if (today !== this.day) {
      this.day = today;
      this.used.clear();
    }
  }

  private currentDay(): string {
    return new Date().toISOString().slice(0, 10);
  }
}

const limiters: Record<StreamKind, TokenBucketLimiter> = {
  manifest: new TokenBucketLimiter(
    RATE_LIMITS.manifest.burst,
    RATE_LIMITS.manifest.perMinute / 60000
  ),
  segment: new TokenBucketLimiter(
    RATE_LIMITS.segment.burst,
    RATE_LIMITS.segment.perMinute / 60000
  ),
  subtitle: new TokenBucketLimiter(
    RATE_LIMITS.subtitle.burst,
    RATE_LIMITS.subtitle.perMinute / 60000
  ),
  play: new TokenBucketLimiter(RATE_LIMITS.play.burst, RATE_LIMITS.play.perMinute / 60000),
};

const globalLimiters: Record<StreamKind, TokenBucketLimiter> = {
  manifest: new TokenBucketLimiter(
    GLOBAL_LIMITS.manifest.burst,
    GLOBAL_LIMITS.manifest.perMinute / 60000
  ),
  segment: new TokenBucketLimiter(
    GLOBAL_LIMITS.segment.burst,
    GLOBAL_LIMITS.segment.perMinute / 60000
  ),
  subtitle: new TokenBucketLimiter(
    GLOBAL_LIMITS.subtitle.burst,
    GLOBAL_LIMITS.subtitle.perMinute / 60000
  ),
  play: new TokenBucketLimiter(
    GLOBAL_LIMITS.play.burst,
    GLOBAL_LIMITS.play.perMinute / 60000
  ),
};

const dailyQuotas: Record<StreamKind, DailyQuota> = {
  manifest: new DailyQuota(),
  segment: new DailyQuota(),
  subtitle: new DailyQuota(),
  play: new DailyQuota(),
};

const segmentByteQuota = new DailyByteQuota();

export function getSegmentDailyByteLimit(): number {
  return intEnv('STREAM_SEGMENT_DAILY_BYTES', 50 * 1024 * 1024 * 1024);
}

export function segmentByteBudgetAvailable(ip: string): boolean {
  return segmentByteQuota.hasBudget(ip, getSegmentDailyByteLimit());
}

export function consumeSegmentBytes(ip: string, bytes: number): void {
  segmentByteQuota.consume(ip, bytes);
}

class Semaphore {
  private active = 0;

  constructor(private readonly max: number) {}

  tryAcquire(): (() => void) | null {
    if (this.active >= this.max) return null;

    this.active += 1;
    let released = false;

    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }
}

const segmentSemaphore = new Semaphore(MAX_CONCURRENT_SEGMENTS);

/**
 * getClientIp() trust-ить заголовки проксі. Якщо їх немає (прямий запит
 * на origin), беремо адресу сокета, інакше флуд без заголовків обходив би ліміти.
 */
export function getStreamClientIp(c: Context): string {
  const ip = getClientIp(c);
  if (ip && ip !== 'unknown') return ip;

  const incoming = (c.env as any)?.incoming;
  const socketIp: string | undefined =
    incoming?.socket?.remoteAddress || incoming?.connection?.remoteAddress;

  if (!socketIp) return 'unknown';
  return socketIp.startsWith('::ffff:') ? socketIp.slice(7) : socketIp;
}

function classifyStreamPath(path: string): StreamKind {
  const normalized = path.replace(/^\/api(?=\/)/, '');

  if (normalized === '/segment') return 'segment';
  if (normalized.startsWith('/subs')) return 'subtitle';
  if (normalized === '/play' || normalized.startsWith('/play.')) return 'play';

  return 'manifest';
}

function rateLimitResponse(c: Context, kind: StreamKind, ip: string, retryAfterMs: number) {
  const violation = autoBanService.recordViolation(ip);

  if (violation.banned) {
    logWarn(
      'stream',
      `rate limit ${kind} ip=${ip} path=${c.req.path} banned=${violation.banMinutes}m`
    );

    return c.json(
      {
        error: {
          code: 'IP_TEMPORARILY_BANNED',
          message: `Вашу IP-адресу заблоковано на ${violation.banMinutes} хв. через систематичне перевищення ліміту запитів.`,
        },
        traceId: crypto.randomUUID(),
      },
      403
    );
  }

  c.header('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
  return c.json(
    {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Забагато запитів до стрімінгових endpoint-ів. Спробуйте пізніше.',
      },
      traceId: crypto.randomUUID(),
    },
    429
  );
}

/**
 * Ліміти для публічних HLS-роутів. Діють до парсингу джерел і до
 * будь-яких запитів у CDN, тому флуд не витрачає ні CPU, ні трафік.
 */
export const streamGuardMiddleware: MiddlewareHandler = async (c, next) => {
  const ip = getStreamClientIp(c);

  // Без реальної IP (локальні тести, невідомий проксі) не групуємо всіх в один ліміт.
  if (!ip || ip === 'unknown') {
    return next();
  }

  const ban = autoBanService.check(ip);
  if (ban.banned) {
    return c.json(
      {
        error: {
          code: 'IP_TEMPORARILY_BANNED',
          message: `Вашу IP-адресу тимчасово заблоковано. Розблокування через ${ban.formattedRemaining}.`,
        },
        traceId: crypto.randomUUID(),
      },
      403
    );
  }

  const kind = classifyStreamPath(c.req.path);
  const config = RATE_LIMITS[kind];

  const globalBucket = globalLimiters[kind].check('global');
  if (!globalBucket.allowed) {
    c.header('Retry-After', String(Math.max(1, Math.ceil(globalBucket.retryAfterMs / 1000))));
    return c.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Сервер тимчасово перевантажений запитами до стрімінгу. Спробуйте пізніше.',
        },
        traceId: crypto.randomUUID(),
      },
      429
    );
  }

  if (!dailyQuotas[kind].check(ip, config.daily)) {
    return rateLimitResponse(c, kind, ip, 60 * 60 * 1000);
  }

  const bucket = limiters[kind].check(ip);
  if (!bucket.allowed) {
    return rateLimitResponse(c, kind, ip, bucket.retryAfterMs);
  }

  return next();
};

// --- SSRF / upstream URL guard -------------------------------------------------

const dnsCache = new Map<string, { addresses: string[]; expiresAt: number }>();

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((part) => Number(part));
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);

  return BLOCKED_IPV4_RANGES.some(([base, prefix]) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

function isBlockedIpv6(ip: string): boolean {
  const value = ip.toLowerCase();

  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true; // fc00::/7
  if (/^fe[89ab]/.test(value)) return true; // fe80::/10
  if (value.startsWith('ff')) return true; // ff00::/8

  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);

  const compatible = value.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (compatible) return isBlockedIpv4(compatible[1]);

  return false;
}

export function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) {
    return true;
  }
  if (host === 'metadata.google.internal' || host === 'metadata' || host === 'instance-data') {
    return true;
  }

  if (net.isIP(host)) return isPrivateIp(host);

  return false;
}

async function resolveHost(hostname: string): Promise<string[]> {
  const now = Date.now();
  const cached = dnsCache.get(hostname);
  if (cached && cached.expiresAt > now) {
    return cached.addresses;
  }

  let timer: NodeJS.Timeout | undefined;

  try {
    const results = await Promise.race([
      dns.lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`DNS lookup timed out for ${hostname}`)),
          DNS_TIMEOUT_MS
        );
      }),
    ]);

    const addresses = results.map((entry) => entry.address);
    dnsCache.set(hostname, { addresses, expiresAt: now + DNS_TTL_MS });
    return addresses;
  } catch (err) {
    dnsCache.set(hostname, { addresses: [], expiresAt: now + DNS_NEGATIVE_TTL_MS });
    throw new StreamGuardError(502, `DNS lookup failed for ${hostname}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function assertSafeUpstreamUrl(raw: string): Promise<URL> {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new StreamGuardError(400, 'Invalid upstream URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new StreamGuardError(400, 'Only http(s) upstream URLs are allowed');
  }

  if (parsed.username || parsed.password) {
    throw new StreamGuardError(400, 'Upstream URL must not contain credentials');
  }

  if (boolEnv('STREAM_ALLOW_PRIVATE_HOSTS')) {
    return parsed;
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if (isBlockedHostname(hostname)) {
    throw new StreamGuardError(403, 'Upstream host is not allowed');
  }

  const addresses = await resolveHost(hostname);
  if (addresses.length === 0 || addresses.some((address) => isPrivateIp(address))) {
    throw new StreamGuardError(403, 'Upstream host resolves to a private address');
  }

  return parsed;
}

function assertSafeRedirect(options: { hostname?: string; host?: string; protocol?: string }) {
  const protocol = options.protocol;
  if (protocol && protocol !== 'http:' && protocol !== 'https:') {
    throw new StreamGuardError(403, 'Redirect protocol is not allowed');
  }

  const rawHost = options.hostname || options.host || '';
  const hostname = rawHost.startsWith('[')
    ? rawHost.slice(1, rawHost.indexOf(']'))
    : rawHost.split(':')[0];

  if (hostname && isBlockedHostname(hostname)) {
    throw new StreamGuardError(403, 'Redirect host is not allowed');
  }
}

export function isTooLargeError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const message = String((err as Error)?.message || '');

  return (
    code === 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED' ||
    message.includes('maxContentLength') ||
    message.includes('maxBodyLength')
  );
}

export interface LimitedFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  axiosConfig?: AxiosRequestConfig;
}

export interface LimitedTextResponse {
  data: string;
  contentType: string;
  finalUrl: string;
}

export async function fetchTextLimited(
  url: string,
  options: LimitedFetchOptions = {}
): Promise<LimitedTextResponse> {
  await assertSafeUpstreamUrl(url);

  const maxBytes = options.maxBytes ?? MAX_MANIFEST_BYTES;
  const res = await axios.get<string>(url, {
    headers: options.headers,
    responseType: 'text',
    timeout: options.timeoutMs ?? 10000,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    maxRedirects: 5,
    beforeRedirect: (redirectOptions: any) => assertSafeRedirect(redirectOptions),
    ...options.axiosConfig,
  });

  return {
    data: typeof res.data === 'string' ? res.data : String(res.data ?? ''),
    contentType: String(res.headers['content-type'] || ''),
    finalUrl: (res.request as any)?.res?.responseUrl || url,
  };
}

export interface LimitedBufferResponse {
  data: ArrayBuffer;
  status: number;
  headers: Record<string, unknown>;
}

export async function fetchBufferLimited(
  url: string,
  options: LimitedFetchOptions = {}
): Promise<LimitedBufferResponse> {
  await assertSafeUpstreamUrl(url);

  const maxBytes = options.maxBytes ?? MAX_SEGMENT_BYTES;
  const res = await axios.get<ArrayBuffer>(url, {
    headers: options.headers,
    responseType: 'arraybuffer',
    timeout: options.timeoutMs ?? 20000,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    maxRedirects: 5,
    beforeRedirect: (redirectOptions: any) => assertSafeRedirect(redirectOptions),
    validateStatus: () => true,
    ...options.axiosConfig,
  });

  return {
    data: res.data,
    status: res.status,
    headers: res.headers as Record<string, unknown>,
  };
}

export function acquireSegmentSlot(): (() => void) | null {
  return segmentSemaphore.tryAcquire();
}

export function isM3u8Content(data: string): boolean {
  const trimmed = data.replace(/^\uFEFF/, '').trimStart();
  return trimmed.startsWith('#EXTM3U');
}

export function isVttContent(data: string): boolean {
  const trimmed = data.replace(/^\uFEFF/, '').trimStart();
  return /^WEBVTT\b/i.test(trimmed) || trimmed.includes('-->');
}

export function isAssContent(data: string): boolean {
  return /\[Script Info\]/i.test(data) || /^Dialogue:/m.test(data);
}

export function isBinarySegmentContentType(contentType: string): boolean {
  const value = contentType.toLowerCase().trim();
  if (!value) return true;

  return (
    value.startsWith('video/') ||
    value.startsWith('audio/') ||
    value.startsWith('application/octet-stream') ||
    value.startsWith('binary/octet-stream') ||
    value.startsWith('application/mp4')
  );
}

export const STREAM_LIMITS = {
  manifestBytes: MAX_MANIFEST_BYTES,
  subtitleBytes: MAX_SUBTITLE_BYTES,
  assBytes: MAX_ASS_BYTES,
  segmentBytes: MAX_SEGMENT_BYTES,
};
