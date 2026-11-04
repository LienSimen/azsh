// Copy the 5-man dungeons' server nav meshes out of a phonecraft checkout into src/data/navmesh, brotli'd, so the
// continuous floor (src/cli/tuiFloor.mjs) walks without one. Raids and battlegrounds stay in phonecraft: Naxxramas
// and Alterac Valley alone would double the package. PHONECRAFT points at the checkout (default ../phonecraft).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(process.env.PHONECRAFT ?? join(ROOT, '..', 'phonecraft'), 'public', 'maps', 'bake');
const OUT = join(ROOT, 'src', 'data', 'navmesh');

// Bake slugs of the 5-man instances (src/world/bakeSlug.ts); Blackrock Spire's one mesh serves LBRS and UBRS.
const SLUGS = [
  'ragefire-chasm', 'wailing-caverns', 'deadmines', 'shadowfang-keep', 'the-stockade', 'blackfathom-deeps',
  'gnomeregan', 'razorfen-kraul', 'scarlet-monastery', 'razorfen-downs', 'uldaman', 'zul-farrak', 'maraudon',
  'sunken-temple', 'blackrock-depths', 'blackrock-spire', 'dire-maul', 'scholomance', 'stratholme',
];

if (!existsSync(SRC)) { console.error(`No phonecraft bake at ${SRC}. Set PHONECRAFT.`); process.exit(1); }
mkdirSync(OUT, { recursive: true });
let raw = 0, packed = 0;
for (const slug of SLUGS) {
  const file = join(SRC, `${slug}.navmesh.bin`);
  if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1); }
  const buf = readFileSync(file);
  const br = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
  writeFileSync(join(OUT, `${slug}.navmesh.bin.br`), br);
  raw += buf.length; packed += br.length;
  console.log(`${slug.padEnd(20)} ${(buf.length / 1024).toFixed(0).padStart(6)} KB -> ${(br.length / 1024).toFixed(0).padStart(5)} KB`);
}
console.log(`${SLUGS.length} meshes, ${(raw / 1048576).toFixed(1)} MB -> ${(packed / 1048576).toFixed(1)} MB`);
