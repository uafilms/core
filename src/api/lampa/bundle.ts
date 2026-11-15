import fs from 'fs';
import path from 'path';
import esbuild from 'esbuild';

/**
 * Samsung Tizen 2.x/3.0 and old LG webOS run Chromium 45-47. Such engines
 * parse arrow functions and template literals, but not destructuring, default
 * parameters, classes or spread. A bare esbuild `target: es2015` bundle dies
 * with "Unexpected token [", and esbuild cannot lower those features at all,
 * so Babel finishes the job.
 */
const LEGACY_TARGET = { chrome: '45' };

function getBabel(): any {
  const req = typeof require === 'function' ? require : (0, eval)('require');
  return req('@babel/core');
}

export interface LampaBundleOptions {
  minify?: boolean;
  entryFile?: string;
}

/** Compile `src/lampa` into a single IIFE string, legacy-TV safe. */
export function buildLampaBundle(options: LampaBundleOptions = {}): string {
  const entryFile = options.entryFile ?? path.resolve(process.cwd(), 'src/lampa/index.ts');

  const result = esbuild.buildSync({
    entryPoints: [entryFile],
    bundle: true,
    format: 'iife',
    target: ['es2015'],
    minify: options.minify ?? true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    legalComments: 'none',
    write: false,
  });

  const code = result.outputFiles[0].text;
  const babel = getBabel();
  const transformed = babel.transformSync(code, {
    babelrc: false,
    configFile: false,
    sourceType: 'script',
    filename: 'lampa-plugin.js',
    compact: true,
    comments: false,
    presets: [
      [
        require.resolve('@babel/preset-env'),
        { targets: LEGACY_TARGET, bugfixes: true, modules: false },
      ],
    ],
  });

  // Babel hoists its helpers to the top level, so wrap the result to keep them
  // out of the global scope shared with other Lampa plugins.
  return transformed?.code ? `(function(){${transformed.code}})();` : code;
}

/** Build the bundle and write it to disk. */
export function buildLampaBundleFile(
  outfile: string,
  minify = true
): { outfile: string; size: number } {
  const code = buildLampaBundle({ minify });
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  fs.writeFileSync(outfile, code, 'utf-8');
  return { outfile, size: Buffer.byteLength(code) };
}
