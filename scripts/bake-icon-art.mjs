// Bake spell and item icons for the windowed game: phonecraft's icon set (public/icons/<name>.png, 64 px)
// becomes one gzipped pack of tiny RGB squares that iconArt.mjs draws as half-block cells. Dev only; needs
// ffmpeg on PATH to decode the png.
//
//   node scripts/bake-icon-art.mjs [--src D:/projects/phonecraft/public/icons] [--all]
//
// Default: every icon the spells table, the item table and the talent trees name. --all bakes every png
// in the folder. Each icon has a dark frame about five pixels wide baked into its square; that frame is
// cropped off first so every cell goes to the picture. Three sizes a pixel each: 8x8 (a detail pane),
// 6x6 (an ability bar, a bag grid) and 4x4 (a list row, an aura strip); a cell is one pixel wide and
// two tall, so they draw as 4, 3 and 2 lines.
//
// Pack: "AZICO" u8 version u32 count, then per icon u8 nameLen, name (ascii, lower case), then the 8x8,
// 6x6 and 4x4 squares as rows of RGB bytes (192 + 108 + 48 bytes).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SRC = opt('--src', 'D:/projects/phonecraft/public/icons');
const OUT = join(ROOT, 'src/data/icon-art.bin.gz');
const SIZES = [8, 6, 4], INSET = 5, PARALLEL = 8;

const table = (f) => JSON.parse(gunzipSync(readFileSync(join(ROOT, 'src/data/tables', f))).toString('utf8'));
const rows = (t) => (Array.isArray(t) ? t : Object.values(t));

function wantedNames() {
  const names = new Set();
  const add = (n) => { if (typeof n === 'string' && n) names.add(n.toLowerCase()); };
  if (args.includes('--all')) { for (const f of readdirSync(SRC)) if (f.endsWith('.png')) add(f.slice(0, -4)); return names; }
  const spells = rows(table('spells.json.gz'));
  const byId = new Map(spells.map((s) => [s.id, s]));
  for (const s of spells) add(s.icon);
  const items = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'src/data/item-data.json.gz'))).toString('utf8'));
  for (const it of (Array.isArray(items) ? items : Object.values(items)).flat()) add(it?.icon);
  for (const tab of rows(table('talents.json.gz'))) for (const t of tab.talents ?? []) for (const r of t.ranks ?? []) add(byId.get(r.spellId)?.icon);
  return names;
}

async function decode(name) {
  const file = join(SRC, `${name}.png`);
  if (!existsSync(file)) return null;
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { encoding: 'buffer', maxBuffer: 1 << 22 });
  const side = Math.round(Math.sqrt(stdout.length / 4));
  return side * side * 4 === stdout.length ? { side, px: stdout } : null;
}

// Area-average the inset square into g x g RGB samples.
function sample(img, g) {
  const inset = Math.round(INSET * img.side / 64), span = img.side - inset * 2, cw = span / g;
  const out = Buffer.alloc(g * g * 3);
  for (let gy = 0; gy < g; gy++) for (let gx = 0; gx < g; gx++) {
    let r = 0, gg = 0, b = 0, n = 0;
    for (let y = Math.floor(inset + gy * cw); y < Math.floor(inset + (gy + 1) * cw); y++) for (let x = Math.floor(inset + gx * cw); x < Math.floor(inset + (gx + 1) * cw); x++) {
      const k = (y * img.side + x) * 4; r += img.px[k]; gg += img.px[k + 1]; b += img.px[k + 2]; n++;
    }
    const k = (gy * g + gx) * 3;
    out[k] = Math.round(r / n); out[k + 1] = Math.round(gg / n); out[k + 2] = Math.round(b / n);
  }
  return out;
}

const names = [...wantedNames()].sort();
console.error(`${names.length} icons wanted`);
const baked = [];
let missing = 0, done = 0;
for (let i = 0; i < names.length; i += PARALLEL) {
  const batch = names.slice(i, i + PARALLEL);
  const imgs = await Promise.all(batch.map((n) => decode(n).catch(() => null)));
  batch.forEach((n, j) => {
    const img = imgs[j];
    if (!img) { missing++; return; }
    baked.push({ name: n, squares: SIZES.map((g) => sample(img, g)) });
  });
  done += batch.length;
  if (done % 400 < PARALLEL) console.error(`  ${done}/${names.length}`);
}
const parts = [Buffer.from('AZICO'), Buffer.from([1]), Buffer.alloc(4)];
parts[2].writeUInt32LE(baked.length);
for (const b of baked) {
  const name = Buffer.from(b.name, 'ascii');
  parts.push(Buffer.from([name.length]), name, ...b.squares);
}
const raw = Buffer.concat(parts);
writeFileSync(OUT, gzipSync(raw, { level: 9 }));
console.error(`${baked.length} icons baked (${missing} without a png), ${(raw.length / 1024).toFixed(0)} KB raw → ${OUT}`);
