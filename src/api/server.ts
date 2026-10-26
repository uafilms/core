import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'fs';
import path from 'path';
import { omssRouter } from './omss/routes.js';
import { streamRouter } from './stream/master.js';
import { catalogRouter } from './catalog/routes.js';
import { authRouter } from './auth/routes.js';
import { lampaRouter } from './lampa/routes.js';
import { lampacRouter } from './lampac/routes.js';
import { apiKeyMiddleware } from './auth/middleware.js';
import { registerWsRoutes, wsServer } from './ws/index.js';
import { isTurnstileEnabled, getTurnstileSiteKey } from './services/turnstile.js';
import { generatePowChallenge, verifyPowSolution } from './services/pow.js';
import { getClientIp } from './services/security.js';
import { formatHttpLog, log } from '../utils/logger.js';

export const app = new Hono();

// Global request logger
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(formatHttpLog(c.req.method, c.req.path, c.res.status, duration));
});

// Global CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Accept',
    'Authorization',
    'Range',
    'x-api-key',
    'cf-turnstile-response',
    'x-pow-token',
    'x-pow-response',
    'x-app-version',
    'x-platform',
  ],
  exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'x-pow-token'],
}));

// API Key usage tracking
app.use('*', apiKeyMiddleware);

// Serve static logos
app.use('/logos/*', serveStatic({ root: './public' }));

// Serve frontend SPA from web/dist if built
const distDir = path.resolve(process.cwd(), 'web/dist');
const hasWebDist = fs.existsSync(distDir);

if (hasWebDist) {
  app.use('/assets/*', serveStatic({ root: './web/dist' }));
  app.use('/favicon.ico', serveStatic({ root: './web/dist' }));
  app.use('/vite.svg', serveStatic({ root: './web/dist' }));

  // Root request: return SPA index.html for browsers, or JSON if explicitly requested as application/json
  app.get('/', (c, next) => {
    const accept = c.req.header('accept') || '';
    if (accept.includes('application/json') && !accept.includes('text/html')) {
      return next();
    }
    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      return c.html(fs.readFileSync(indexPath, 'utf-8'));
    }
    return next();
  });
}

// Mount routers
app.get('/api', (c) => c.json({ status: 'ok', message: 'UAFilms API', version: '1.0.0' }));
app.get('/api/', (c) => c.json({ status: 'ok', message: 'UAFilms API', version: '1.0.0' }));
app.get('/api/config', (c) => {
  return c.json({
    turnstile: {
      enabled: isTurnstileEnabled(),
      siteKey: getTurnstileSiteKey(),
    },
  });
});
app.get('/config', (c) => {
  return c.json({
    turnstile: {
      enabled: isTurnstileEnabled(),
      siteKey: getTurnstileSiteKey(),
    },
  });
});
app.get('/api/challenge', (c) => c.json(generatePowChallenge()));
app.get('/challenge', (c) => c.json(generatePowChallenge()));
app.post('/api/challenge/verify', async (c) => {
  const ip = getClientIp(c);
  const body = (await c.req.json().catch(() => ({}))) as any;
  const res = verifyPowSolution(body, ip);
  if (!res.success) {
    return c.json({ error: res.error || 'INVALID_SOLUTION' }, 400);
  }
  return c.json({ success: true, token: res.sessionToken });
});
app.post('/challenge/verify', async (c) => {
  const ip = getClientIp(c);
  const body = (await c.req.json().catch(() => ({}))) as any;
  const res = verifyPowSolution(body, ip);
  if (!res.success) {
    return c.json({ error: res.error || 'INVALID_SOLUTION' }, 400);
  }
  return c.json({ success: true, token: res.sessionToken });
});
app.route('/api', catalogRouter);
app.route('/', catalogRouter);
app.route('/', omssRouter);
app.route('/api', omssRouter);
app.route('/', streamRouter);
app.route('/api', streamRouter);
app.route('/', lampaRouter);
app.route('/api', lampaRouter);
app.route('/', lampacRouter);
app.route('/l', lampacRouter);
app.route('/api', lampacRouter);
app.route('/api/l', lampacRouter);
app.route('/api/auth', authRouter);
app.route('/auth', authRouter);

// WebSocket-канал для живої синхронізації прогресу перегляду
registerWsRoutes(app);

// SPA fallback for frontend client routing
if (hasWebDist) {
  app.get('*', (c, next) => {
    const p = c.req.path;
    if (
      p.startsWith('/api') ||
      p.startsWith('/auth') ||
      p.startsWith('/v1') ||
      p.startsWith('/master.m3u8') ||
      p.startsWith('/play.m3u8') ||
      p.startsWith('/play.mp4') ||
      p === '/play' ||
      p.startsWith('/video.mp4') ||
      p.startsWith('/subs') ||
      p === '/l' ||
      p.startsWith('/l/') ||
      p === '/lampa' ||
      p.startsWith('/lampa') ||
      p.startsWith('/challenge') ||
      p === '/config' ||
      p === '/home' ||
      p === '/details' ||
      p === '/season' ||
      p === '/comments' ||
      p === '/segments' ||
      p === '/batch-meta' ||
      p.startsWith('/lite') ||
      p.startsWith('/lifeevents') ||
      p.startsWith('/externalids')
    ) {
      return next();
    }
    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      return c.html(fs.readFileSync(indexPath, 'utf-8'));
    }
    return next();
  });
}

// 404 handler
app.notFound((c) => {
  return c.json({
    error: {
      code: 'ENDPOINT_NOT_FOUND',
      message: `endpoint not found: ${c.req.path}`,
    },
    traceId: crypto.randomUUID(),
  }, 404);
});

import { startTelegramBot } from './services/telegramVerification.js';

export function startServer(port = 3000) {
  startTelegramBot().catch((err) => {
    console.error('[TelegramBot] Failed to start:', err);
  });

  return serve({
    fetch: app.fetch,
    port,
    websocket: { server: wsServer },
  }, (info) => {
    log('uafilms', `listening on http://localhost:${info.port}`);
  });
}

// Auto-start if run directly
declare const require: any;
declare const module: any;
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  startServer(port);
}
