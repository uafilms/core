import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { isTurnstileEnabled } from '../services/turnstile.js';

export const lampaRouter = new Hono();

let memoryCache: { code: string; mtime: number } | null = null;
let esbuildModule: any = null;

function getEsbuild() {
  if (!esbuildModule) {
    try {
      const req = typeof require === 'function' ? require : (0, eval)('require');
      esbuildModule = req('esbuild');
    } catch {
      // esbuild not available
    }
  }
  return esbuildModule;
}

function getLampaDirectoryMtime(): number {
  const dir = path.resolve(process.cwd(), 'src/lampa');
  if (!fs.existsSync(dir)) return 0;
  let maxMtime = 0;
  try {
    const files = fs.readdirSync(dir, { recursive: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.toString());
      const stats = fs.statSync(fullPath);
      if (stats.mtimeMs > maxMtime) {
        maxMtime = stats.mtimeMs;
      }
    }
  } catch {
    // Ignore read errors
  }
  return maxMtime;
}

function getPluginBundle(isDev: boolean): string {
  const distFile = path.resolve(process.cwd(), 'dist/lampa/plugin.js');
  const entryFile = path.resolve(process.cwd(), 'src/lampa/index.ts');

  // In production with prebuilt dist file, serve directly from disk/cache
  if (!isDev && fs.existsSync(distFile)) {
    if (!memoryCache) {
      memoryCache = { code: fs.readFileSync(distFile, 'utf-8'), mtime: 0 };
    }
    return memoryCache.code;
  }

  // In development, build on the fly or reload on edit across ALL files in src/lampa
  const esbuild = getEsbuild();
  if (esbuild && (isDev || !fs.existsSync(distFile))) {
    try {
      const dirMtime = getLampaDirectoryMtime();
      if (memoryCache && dirMtime > 0 && memoryCache.mtime === dirMtime) {
        return memoryCache.code;
      }

      const buildResult = esbuild.buildSync({
        entryPoints: [entryFile],
        bundle: true,
        format: 'iife',
        target: ['es2015'],
        minify: true,
        minifyWhitespace: true,
        minifyIdentifiers: true,
        minifySyntax: true,
        legalComments: 'none',
        write: false,
      });
      const code = buildResult.outputFiles[0].text;
      memoryCache = { code, mtime: dirMtime };

      // Update dist file on disk
      try {
        const outDir = path.dirname(distFile);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(distFile, code, 'utf-8');
      } catch {
        // Ignore write errors
      }

      return code;
    } catch (err) {
      console.error('[lampaRouter] Failed to build plugin on the fly:', err);
    }
  }

  if (fs.existsSync(distFile)) {
    return fs.readFileSync(distFile, 'utf-8');
  }

  throw new Error('Lampa plugin bundle not found and esbuild is not available');
}

const servePluginHandler = (c: any) => {
  const isDev = process.env.NODE_ENV !== 'production';

  // Compute origin host from request headers
  const proto =
    c.req.header('x-forwarded-proto') || (c.req.url.startsWith('https') ? 'https' : 'http');
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3000';
  const serverHost = `${proto}://${host}`;

  try {
    const bundleCode = getPluginBundle(isDev);
    const powRequired = isTurnstileEnabled();
    const injected =
      `window.__UAFILMS_SERVER_HOST__ = ${JSON.stringify(serverHost)};\n` +
      `window.__UAFILMS_POW_REQUIRED__ = ${powRequired ? 'true' : 'false'};\n` +
      bundleCode;

    c.header('Content-Type', 'application/javascript; charset=utf-8');
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');

    return c.body(injected);
  } catch (err: unknown) {
    return c.text(`/* Plugin compilation error: ${(err as Error).message} */`, 500, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
  }
};

lampaRouter.get('/l', servePluginHandler);
lampaRouter.get('/lampa', servePluginHandler);
lampaRouter.get('/lampa.js', servePluginHandler);
lampaRouter.get('/online.js', servePluginHandler);
