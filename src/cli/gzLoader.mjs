// Module hooks: an `import x from './t.json' with { type: 'json' }` whose file is missing resolves to
// `t.json.gz` and is gunzipped on load. Lets every bake table ship gzipped without touching the
// 42 modules that static-import one. Registered in-thread by src/cli/register.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export function resolve(specifier, context, next) {
  if (specifier.endsWith('.json') && /^\.\.?\//.test(specifier) && context.parentURL) {
    const url = new URL(specifier, context.parentURL);
    const path = fileURLToPath(url);
    if (!existsSync(path) && existsSync(`${path}.gz`)) {
      return { url: `${url.href}.gz`, format: 'json', shortCircuit: true };
    }
  }
  return next(specifier, context);
}

export function load(url, context, next) {
  if (url.endsWith('.json.gz')) {
    const source = gunzipSync(readFileSync(fileURLToPath(url))).toString('utf8');
    return { format: 'json', source, shortCircuit: true };
  }
  return next(url, context);
}
