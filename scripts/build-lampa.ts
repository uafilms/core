import path from 'path';
import { buildLampaBundleFile } from '../src/api/lampa/bundle.js';

export async function buildLampaPlugin(options?: { minify?: boolean; outfile?: string }) {
  const minify = options?.minify ?? true;
  const outfile = options?.outfile ?? path.resolve(process.cwd(), 'dist/lampa/plugin.js');

  const startTime = Date.now();
  const { size } = buildLampaBundleFile(outfile, minify);
  const duration = Date.now() - startTime;

  const kb = (size / 1024).toFixed(1);
  console.log(`[lampa-build] Built ${outfile} (${kb} KB) in ${duration}ms`);

  return { outfile, size, duration };
}

// Run directly if invoked via CLI
if (process.argv[1] && process.argv[1].endsWith('build-lampa.ts')) {
  buildLampaPlugin().catch((err) => {
    console.error('[lampa-build] Build failed:', err);
    process.exit(1);
  });
}
