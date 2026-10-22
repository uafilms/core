import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';

export async function buildLampaPlugin(options?: { minify?: boolean; outfile?: string }) {
  const minify = options?.minify ?? true;
  const outfile = options?.outfile ?? path.resolve(process.cwd(), 'dist/lampa/plugin.js');

  const outDir = path.dirname(outfile);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const startTime = Date.now();
  const result = await esbuild.build({
    entryPoints: [path.resolve(process.cwd(), 'src/lampa/index.ts')],
    bundle: true,
    format: 'iife',
    target: ['es2018'],
    minify: true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    legalComments: 'none',
    outfile,
    sourcemap: false,
    write: true,
  });

  const duration = Date.now() - startTime;
  const stats = fs.statSync(outfile);
  const kb = (stats.size / 1024).toFixed(1);
  console.log(`[lampa-build] Built ${outfile} (${kb} KB) in ${duration}ms`);

  return { outfile, size: stats.size, duration };
}

// Run directly if invoked via CLI
if (process.argv[1] && process.argv[1].endsWith('build-lampa.ts')) {
  buildLampaPlugin().catch((err) => {
    console.error('[lampa-build] Build failed:', err);
    process.exit(1);
  });
}
