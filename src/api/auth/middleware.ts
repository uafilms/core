import type { MiddlewareHandler } from 'hono';
import { validateApiKey, recordApiUsage } from './service.js';

export const apiKeyMiddleware: MiddlewareHandler = async (c, next) => {
  let rawKey: string | undefined = undefined;

  const headerKey = c.req.header('x-api-key');
  if (headerKey) {
    rawKey = headerKey.trim();
  } else {
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer uaf_')) {
      rawKey = authHeader.slice(7).trim();
    } else {
      const queryKey = c.req.query('api_key');
      if (queryKey) {
        rawKey = queryKey.trim();
      }
    }
  }

  let apiKeyId: string | null = null;

  if (rawKey) {
    const valid = validateApiKey(rawKey);
    if (!valid) {
      return c.json(
        {
          error: {
            code: 'INVALID_API_KEY',
            message: 'Вказано недійсний або деактивований API-ключ',
          },
        },
        401
      );
    }
    apiKeyId = valid.id;
    c.set('apiKeyId' as any, valid.id);
  }

  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  if (apiKeyId) {
    recordApiUsage(apiKeyId, c.req.method, c.req.path, c.res.status, duration);
  }
};
