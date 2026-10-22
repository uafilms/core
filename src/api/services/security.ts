import type { Context, MiddlewareHandler } from 'hono';
import { isTurnstileEnabled, verifyTurnstileToken } from './turnstile.js';
import { unauthenticatedParserRateLimiter } from './rateLimiter.js';
import { verifyAuthToken, validateApiKey } from '../auth/service.js';
import {
  extractPowFromRequest,
  verifyPowSessionToken,
  verifyPowSolution,
} from './pow.js';

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

export async function isRequestAuthenticated(c: Context): Promise<boolean> {
  // 1. Check if already marked by apiKeyMiddleware
  if (c.get('apiKeyId' as any)) {
    return true;
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
    if (valid) return true;
  }

  // 3. Check JWT token in Authorization header or query
  if (authHeader && authHeader.startsWith('Bearer ') && !authHeader.startsWith('Bearer uaf_')) {
    const jwtToken = authHeader.slice(7).trim();
    const payload = await verifyAuthToken(jwtToken);
    if (payload) return true;
  }

  const queryAuth = c.req.query('token') || c.req.query('auth_token');
  if (queryAuth) {
    const payload = await verifyAuthToken(queryAuth.trim());
    if (payload) return true;
  }

  return false;
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
 * - If user is unauthenticated: enforces 10 req/min sliding-window rate limit
 * - If Turnstile is enabled: enforces token verification
 */
export async function enforceParsingSecurity(c: Context): Promise<Response | null> {
  const ip = getClientIp(c);
  const isAuthenticated = await isRequestAuthenticated(c);

  // Rate limiting for guest / unauthenticated requests (5-10 requests/min)
  if (!isAuthenticated) {
    const { allowed } = unauthenticatedParserRateLimiter.check(ip);
    if (!allowed) {
      return c.json(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Забагато запитів на парсинг джерел. Зареєструйтесь або використовуйте API-ключ для зняття обмежень (ліміт: 10 запитів на хвилину для гостей).',
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
