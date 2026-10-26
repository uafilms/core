import type { Context, MiddlewareHandler } from 'hono';
import { isTurnstileEnabled, verifyTurnstileToken } from './turnstile.js';
import {
  unauthenticatedParserRateLimiter,
  authenticatedParserRateLimiter,
} from './rateLimiter.js';
import {
  verifyAuthToken,
  validateApiKey,
  getUserById,
  type ApiKeyValidationResult,
} from '../auth/service.js';
import {
  extractPowFromRequest,
  verifyPowSessionToken,
  verifyPowSolution,
} from './pow.js';
import { autoBanService } from './autoBan.js';

export function getClientIp(c: Context): string {
  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  const realIp = c.req.header('x-real-ip');
  if (realIp) return realIp.trim();

  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return 'unknown';
}

export interface AuthIdentity {
  type: 'api_key' | 'user';
  id: string;
  userId: string;
  userCreatedAt: number;
}

export async function getAuthIdentity(c: Context): Promise<AuthIdentity | null> {
  // 1. Check if already validated by apiKeyMiddleware
  const apiKeyInfo = c.get('apiKeyInfo' as any) as ApiKeyValidationResult | undefined;
  if (apiKeyInfo) {
    return {
      type: 'api_key',
      id: apiKeyInfo.id,
      userId: apiKeyInfo.user_id,
      userCreatedAt: apiKeyInfo.user_created_at || apiKeyInfo.key_created_at || Date.now(),
    };
  }

  // 2. Check API Key in headers or query
  const headerKey = c.req.header('x-api-key');
  const authHeader = c.req.header('Authorization');
  let rawApiKey: string | undefined = undefined;

  if (headerKey) {
    rawApiKey = headerKey.trim();
  } else if (authHeader && authHeader.startsWith('Bearer uaf_')) {
    rawApiKey = authHeader.slice(7).trim();
  } else {
    const queryKey = c.req.query('api_key');
    if (queryKey) {
      rawApiKey = queryKey.trim();
    }
  }

  if (rawApiKey) {
    const valid = validateApiKey(rawApiKey);
    if (valid) {
      return {
        type: 'api_key',
        id: valid.id,
        userId: valid.user_id,
        userCreatedAt: valid.user_created_at || valid.key_created_at || Date.now(),
      };
    }
  }

  // 3. Check JWT token in Authorization header or query
  let jwtToken: string | undefined = undefined;
  if (authHeader && authHeader.startsWith('Bearer ') && !authHeader.startsWith('Bearer uaf_')) {
    jwtToken = authHeader.slice(7).trim();
  } else {
    const queryAuth = c.req.query('token') || c.req.query('auth_token');
    if (queryAuth) {
      jwtToken = queryAuth.trim();
    }
  }

  if (jwtToken) {
    const payload = await verifyAuthToken(jwtToken);
    if (payload?.sub) {
      const user = getUserById(payload.sub);
      if (user) {
        return {
          type: 'user',
          id: user.id,
          userId: user.id,
          userCreatedAt: user.created_at,
        };
      }
    }
  }

  return null;
}

export async function isRequestAuthenticated(c: Context): Promise<boolean> {
  const identity = await getAuthIdentity(c);
  return identity !== null;
}

export function extractTurnstileToken(c: Context, bodyToken?: string): string | undefined {
  if (bodyToken && typeof bodyToken === 'string' && bodyToken.trim()) {
    return bodyToken.trim();
  }

  const headerToken = c.req.header('cf-turnstile-response');
  if (headerToken && headerToken.trim()) {
    return headerToken.trim();
  }

  const queryToken = c.req.query('turnstile_token') || c.req.query('cf_turnstile_response');
  if (queryToken && queryToken.trim()) {
    return queryToken.trim();
  }

  return undefined;
}

/**
 * Middleware or guard for source parser endpoints (/v1/movies/*, /v1/tv/*)
 * - If user is unauthenticated: enforces 3 req/min sliding-window rate limit
 * - If user is authenticated: enforces 5 req/min (accounts < 14 days) or 15 req/min (>= 14 days)
 * - If Turnstile is enabled: enforces token verification for guests
 */
export async function enforceParsingSecurity(c: Context): Promise<Response | null> {
  const ip = getClientIp(c);

  // 1. Check if IP is currently banned by Fail2Ban
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

  const identity = await getAuthIdentity(c);
  const isAuthenticated = identity !== null;

  // Rate limiting for guest / unauthenticated requests (3 requests/min)
  if (!isAuthenticated) {
    const { allowed } = unauthenticatedParserRateLimiter.check(ip, 3);
    if (!allowed) {
      const ban = autoBanService.recordViolation(ip);
      if (ban.banned) {
        return c.json(
          {
            error: {
              code: 'IP_TEMPORARILY_BANNED',
              message: `Вашу IP-адресу заблоковано на ${ban.banMinutes} хв. через систематичне перевищення ліміту запитів.`,
            },
            traceId: crypto.randomUUID(),
          },
          403
        );
      }
      return c.json(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Забагато запитів на парсинг джерел. Ліміт для гостей: 3 запити на хвилину. Зареєструйтесь або використовуйте API-ключ для підвищення ліміту.',
          },
          traceId: crypto.randomUUID(),
        },
        429
      );
    }
  } else {
    // Authenticated user / API Key rate limiting:
    // 5 req/min for new accounts (< 14 days old), 15 req/min after 14 days
    const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
    const accountAgeMs = Date.now() - (identity.userCreatedAt || Date.now());
    const isNewbie = accountAgeMs < FOURTEEN_DAYS_MS;
    const maxRequests = isNewbie ? 5 : 15;
    const rateKey = identity.type === 'api_key' ? `key:${identity.id}` : `user:${identity.userId}`;

    const { allowed } = authenticatedParserRateLimiter.check(rateKey, maxRequests);
    if (!allowed) {
      const ban = autoBanService.recordViolation(ip);
      if (ban.banned) {
        return c.json(
          {
            error: {
              code: 'IP_TEMPORARILY_BANNED',
              message: `Вашу IP-адресу заблоковано на ${ban.banMinutes} хв. через систематичне перевищення ліміту запитів.`,
            },
            traceId: crypto.randomUUID(),
          },
          403
        );
      }
      const remainingDays = Math.max(1, Math.ceil((FOURTEEN_DAYS_MS - accountAgeMs) / (24 * 60 * 60 * 1000)));
      return c.json(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: isNewbie
              ? `Перевищено ліміт запитів: 5 запитів на хвилину для нових акаунтів (до 14 днів). Через ${remainingDays} дн. ліміт автоматично зросте до 15 запитів/хв.`
              : 'Перевищено ліміт запитів: 15 запитів на хвилину для перевірених акаунтів.',
          },
          traceId: crypto.randomUUID(),
        },
        429
      );
    }
  }

  // Turnstile or PoW verification (only required for unauthenticated / guest requests when Turnstile is enabled)
  if (!isAuthenticated && isTurnstileEnabled()) {
    // 1. Try Turnstile token first (default for web frontend)
    const turnstileToken = extractTurnstileToken(c);
    if (turnstileToken) {
      const turnstileResult = await verifyTurnstileToken(turnstileToken, ip);
      if (turnstileResult.success) {
        return null;
      }
    }

    // 2. Try PoW verification (for Lampa plugin / TV / non-browser clients)
    const { token: powToken, solution: powSolution } = extractPowFromRequest(c);

    if (powToken && verifyPowSessionToken(powToken, ip)) {
      return null;
    }

    if (powSolution) {
      const powResult = verifyPowSolution(powSolution, ip);
      if (powResult.success && powResult.sessionToken) {
        c.header('x-pow-token', powResult.sessionToken);
        return null;
      }
    }

    return c.json(
      {
        error: {
          code: 'VERIFICATION_REQUIRED',
          message: 'Потрібна перевірка Cloudflare Turnstile або Proof-of-Work челендж. Оновіть сторінку або вкажіть API-ключ.',
        },
        traceId: crypto.randomUUID(),
      },
      403
    );
  }

  return null;
}
