// Discover registered dungeon instance ids from src/data/dungeons/*.ts (without importing TS InstanceDef
// modules).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = new Set([
  'index.ts',
  'boss-eventai.ts',
  'pack-from-clusters.ts',
]);

/** @param {string} [dungeonsDir]
 *  @returns {string[]} */
export function listDungeonIds(dungeonsDir) {
  const dir = dungeonsDir ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'dungeons');
  const ids = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts') || f.includes('.test.') || SKIP.has(f)) continue;
    const text = readFileSync(join(dir, f), 'utf8');
    // Prefer the InstanceDef object: `export const FOO: InstanceDef = { ... id: '...'`
    const defIdx = text.search(/export const \w+\s*:\s*InstanceDef\s*=\s*\{/);
    const slice = defIdx >= 0 ? text.slice(defIdx, defIdx + 800) : text;
    const m = slice.match(/\bid:\s*['"]([^'"]+)['"]/);
    if (m) ids.push(m[1]);
  }
  return ids.sort();
}
