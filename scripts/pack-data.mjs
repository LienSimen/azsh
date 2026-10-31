// Gzip the bake on disk: src/data/tables/*.json and the five lazy chunks become .json.gz.
// src/cli/bootData.mjs reads either form. `--unpack` reverses it. Rotation, raid-plan and
// dungeon JSON stay raw because TypeScript modules static-import them.
import { readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src', 'data');
const CHUNKS = ['loot-data', 'item-data', 'spell-data', 'gameobject-data', 'profession-data'];
const unpack = process.argv.includes('--unpack');

const targets = [
  ...readdirSync(join(DATA, 'tables')).map((f) => join(DATA, 'tables', f)),
  ...CHUNKS.flatMap((c) => [join(DATA, `${c}.json`), join(DATA, `${c}.json.gz`)]),
];

let before = 0, after = 0, n = 0;
for (const p of targets) {
  let st;
  try { st = statSync(p); } catch { continue; }
  if (unpack && p.endsWith('.json.gz')) {
    const out = gunzipSync(readFileSync(p));
    writeFileSync(p.slice(0, -3), out);
    unlinkSync(p);
    before += st.size; after += out.length; n++;
  } else if (!unpack && p.endsWith('.json')) {
    const out = gzipSync(readFileSync(p), { level: 9 });
    writeFileSync(`${p}.gz`, out);
    unlinkSync(p);
    before += st.size; after += out.length; n++;
  }
}
const mb = (b) => (b / 1048576).toFixed(1);
console.log(`${unpack ? 'unpacked' : 'packed'} ${n} files: ${mb(before)} MB -> ${mb(after)} MB`);
