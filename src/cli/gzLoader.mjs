// Module hooks: an `import x from './t.json' with { type: 'json' }` whose file is missing resolves to
// `t.json.gz` and is gunzipped on load. Lets every bake table ship gzipped without touching the
// 42 modules that static-import one. Registered in-thread by src/cli/register.mjs.
//
// Every .ts module is also type-stripped here instead of by Node, with the stripped JS cached on disk
// under $AZSH_HOME/cache: Node's own stripper runs its wasm over all 900+ engine files on every launch
// (about a second), and deciding each file's module kind walks up for a package.json; a cache hit skips
// both. Stripping keeps line positions, so stack traces stay right. Set AZSH_NO_JS_CACHE to bypass.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CACHE_DIR = process.env.AZSH_NO_JS_CACHE ? null : join(process.env.AZSH_HOME ?? join(homedir(), '.azsh'), 'cache', 'js');
let cacheReady = false;

/** Stripped source for one .ts file: from the cache when its stamp (size, mtime, Node version) still matches. */
function stripCached(path) {
  const st = statSync(path);
  const stamp = `// ${process.version} ${st.size} ${Math.floor(st.mtimeMs)}\n`;
  const file = CACHE_DIR && join(CACHE_DIR, `${createHash('sha1').update(path).digest('hex').slice(0, 20)}.mjs`);
  if (file) {
    try {
      const cached = readFileSync(file, 'utf8');
      if (cached.startsWith(stamp)) return cached.slice(stamp.length);
    } catch { /* miss */ }
  }
  // The stripper announces itself as experimental on its first call; that would print over the screen.
  const warn = process.emitWarning;
  process.emitWarning = () => {};
  let source;
  try { source = stripTypeScriptTypes(readFileSync(path, 'utf8')); }
  finally { process.emitWarning = warn; }
  if (file) {
    try {
      if (!cacheReady) { mkdirSync(CACHE_DIR, { recursive: true }); cacheReady = true; }
      const tmp = `${file}.${process.pid}.tmp`; // another launch filling the same entry must not read half a file
      writeFileSync(tmp, stamp + source);
      renameSync(tmp, file);
    } catch { /* a read-only home: strip every launch */ }
  }
  return source;
}

export function resolve(specifier, context, next) {
  if (!/^\.\.?\//.test(specifier) || !context.parentURL) return next(specifier, context);
  if (specifier.endsWith('.json')) {
    const url = new URL(specifier, context.parentURL);
    const path = fileURLToPath(url);
    if (!existsSync(path) && existsSync(`${path}.gz`)) {
      return { url: `${url.href}.gz`, format: 'json', shortCircuit: true };
    }
  }
  // Node's own resolve labels a .ts file's format by walking up to its package.json, once per file; every
  // engine module is ESM, so say so here and skip the walk. A missing file still fails, in `load`.
  if (specifier.endsWith('.ts')) return { url: new URL(specifier, context.parentURL).href, format: 'module', shortCircuit: true };
  return next(specifier, context);
}

export function load(url, context, next) {
  if (url.endsWith('.json.gz')) {
    const source = gunzipSync(readFileSync(fileURLToPath(url))).toString('utf8');
    return { format: 'json', source, shortCircuit: true };
  }
  if (url.endsWith('.ts') && url.startsWith('file:')) {
    return { format: 'module', source: stripCached(fileURLToPath(url)), shortCircuit: true };
  }
  return next(url, context);
}
