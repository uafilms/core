import fs from 'fs';
import path from 'path';
import esbuild from 'esbuild';

/**
 * Lampa runs on TV browsers that are much older than desktop ones. webOS and
 * Tizen devices in particular often stop at Chromium 38-47, and some of them
 * do not understand template literals at all: V8 below Chrome 41 aborts the
 * whole plugin with "Unexpected token ILLEGAL". esbuild cannot lower
 * let/const/async below ES2015, so Babel finishes the job and the bundle is
 * emitted as plain ES5.
 *
 * The final esbuild pass minifies the result again and doubles as a guard: it
 * fails the build if any syntax newer than ES5 is left in the output.
 */
const BABEL_TARGETS = { ie: '11' };

let babelModules: { core: any; presetEnv: any } | null = null;

function getBabel(): { core: any; presetEnv: any } {
  if (!babelModules) {
    const req = typeof require === 'function' ? require : (0, eval)('require');
    const presetEnvModule = req('@babel/preset-env');
    babelModules = {
      core: req('@babel/core'),
      presetEnv: presetEnvModule.default || presetEnvModule,
    };
  }
  return babelModules;
}

export interface LampaBundleOptions {
  minify?: boolean;
  entryFile?: string;
}

/** Compile `src/lampa` into a single IIFE string, legacy-TV safe. */
export function buildLampaBundle(options: LampaBundleOptions = {}): string {
  const entryFile = options.entryFile ?? path.resolve(process.cwd(), 'src/lampa/index.ts');
  const minify = options.minify ?? true;

  const result = esbuild.buildSync({
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

  const code = result.outputFiles[0].text;
  const { core, presetEnv } = getBabel();
  const transformed = core.transformSync(code, {
    babelrc: false,
    configFile: false,
    sourceType: 'script',
    filename: 'lampa-plugin.js',
    compact: true,
    comments: false,
    presets: [[presetEnv, { targets: BABEL_TARGETS, bugfixes: true, modules: false }]],
  });

  if (!transformed || !transformed.code) {
    throw new Error('Babel produced no output');
  }

  const es5 = esbuild.transformSync(transformed.code, {
    target: 'es5',
    minify,
    legalComments: 'none',
  }).code;

  // Babel hoists its helpers to the top level, so wrap the result to keep them
  // out of the global scope shared with other Lampa plugins.
  return `(function(){${es5}})();`;
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
