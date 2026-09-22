import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'fs';
import path from 'path';
import { omssRouter } from './omss/routes.js';
import { streamRouter } from './stream/master.js';
import { catalogRouter } from './catalog/routes.js';

export const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Accept', 'Authorization', 'Range', 'x-api-key'],
  exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
}));

// Mount routers
app.route('/api', catalogRouter);
app.route('/', omssRouter);
app.route('/', streamRouter);

// Serve frontend SPA from web/dist if built
const distDir = path.resolve(process.cwd(), 'web/dist');
if (fs.existsSync(distDir)) {
  app.use('/assets/*', serveStatic({ root: './web/dist' }));
  app.use('/favicon.ico', serveStatic({ root: './web/dist' }));
  app.use('/vite.svg', serveStatic({ root: './web/dist' }));

  // Fallback for SPA routing
  app.get('*', (c, next) => {
    const p = c.req.path;
    if (p.startsWith('/api') || p.startsWith('/v1') || p.startsWith('/master.m3u8')) {
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
      message: `Endpoint not found: ${c.req.path}`,
    },
    traceId: crypto.randomUUID(),
  }, 404);
});

export function startServer(port = 3000) {
  console.log(`🚀 Starting UAFilms OMSS v1.1.0 server on port ${port}...`);
  return serve({
    fetch: app.fetch,
    port,
  }, (info) => {
    console.log(`✅ OMSS Server running at http://localhost:${info.port}`);
  });
}

// Auto-start if run directly
declare const require: any;
declare const module: any;
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  startServer(port);
}

