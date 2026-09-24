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
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Accept', 'Authorization', 'Range', 'x-api-key'],
  exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
}));

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
      return c.html(fs.readFileSync(indexPath, 'utf-8'));
    }
    return next();
  });
}

// Mount routers
app.route('/api', catalogRouter);
app.route('/', catalogRouter);
app.route('/', omssRouter);
app.route('/api', omssRouter);
app.route('/', streamRouter);
app.route('/api', streamRouter);

// SPA fallback for frontend client routing
if (hasWebDist) {
  app.get('*', (c, next) => {
    const p = c.req.path;
    if (
      p.startsWith('/api') ||
      p.startsWith('/v1') ||
      p.startsWith('/master.m3u8') ||
      p.startsWith('/subs') ||
      p === '/home' ||
      p === '/details' ||
      p === '/season' ||
      p === '/comments'
    ) {
      return next();
    }
    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexPath)) {
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

export function startServer(port = 3000) {
  return serve({
    fetch: app.fetch,
    port,
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
