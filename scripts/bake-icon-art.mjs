// Bake spell and item icons for the windowed game: phonecraft's icon set (public/icons/<name>.png, 64 px)
// becomes one gzipped pack of tiny RGB squares that iconArt.mjs draws as half-block cells. Dev only; needs
// ffmpeg on PATH to decode the png.
//
//   node scripts/bake-icon-art.mjs [--src D:/projects/phonecraft/public/icons] [--all] [--hd]
//
// Default: every icon the spells table, the item table, the talent trees and the professions name. --all bakes every png
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
import { gunzipSync, gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SRC = opt('--src', 'D:/projects/phonecraft/public/icons');
const OUT = join(ROOT, 'src/data/icon-art.bin.gz');
const OUT_HD = join(ROOT, 'src/data/icon-art-hd.bin.br');
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
  for (const p of JSON.parse(gunzipSync(readFileSync(join(ROOT, 'src/data/profession-data.json.gz'))).toString('utf8')).professions ?? []) add(p.icon);
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

// --hd: each icon's picture at its own size (the inset square, 54 px from a 64 px png) over a palette of its
// own, for sixel.mjs to draw as real pixels. Pack: "AZICH" u8 version u32 count, then per icon u8 nameLen,
// name, u8 side, u8 palLen, palLen*3 palette bytes, side*side palette indices.
async function bakeHd(names) {
  const parts = [Buffer.from('AZICH'), Buffer.from([1]), Buffer.alloc(4)];
  let n = 0;
  for (let i = 0; i < names.length; i += PARALLEL) {
    const batch = names.slice(i, i + PARALLEL);
    const imgs = await Promise.all(batch.map((nm) => decode(nm).catch(() => null)));
    batch.forEach((nm, j) => {
      const img = imgs[j];
      if (!img) return;
      const inset = Math.round(INSET * img.side / 64), side = Math.min(255, img.side - inset * 2);
      const rgb = sample(img, side);
      const { pal, idx } = quantize(rgb, side * side);
      const name = Buffer.from(nm, 'ascii');
      parts.push(Buffer.from([name.length]), name, Buffer.from([side, pal.length / 3]), Buffer.from(pal), Buffer.from(idx));
      n++;
    });
  }
  parts[2].writeUInt32LE(n);
  const raw = Buffer.concat(parts);
  const br = brotliCompressSync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_LGWIN]: 24 } });
  writeFileSync(OUT_HD, br);
  console.error(`${n} icons baked at full size, ${(raw.length / 1e6).toFixed(1)} MB raw, ${(br.length / 1e6).toFixed(2)} MB brotli -> ${OUT_HD}`);
}

// Up to 255 colours: the most used 6-bit buckets (each its mean colour), the rest to the nearest kept one.
function quantize(rgb, count) {
  const buckets = new Map();
  for (let k = 0; k < count; k++) {
    const key = ((rgb[k * 3] >> 2) << 12) | ((rgb[k * 3 + 1] >> 2) << 6) | (rgb[k * 3 + 2] >> 2);
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += rgb[k * 3]; b.g += rgb[k * 3 + 1]; b.b += rgb[k * 3 + 2];
    buckets.set(key, b);
  }
  const kept = [...buckets.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 255);
  const pal = new Uint8Array(kept.length * 3), slot = new Map();
  kept.forEach(([key, b], i) => { slot.set(key, i); pal[i * 3] = b.r / b.n; pal[i * 3 + 1] = b.g / b.n; pal[i * 3 + 2] = b.b / b.n; });
  const idx = new Uint8Array(count);
  for (let k = 0; k < count; k++) {
    const r = rgb[k * 3], g = rgb[k * 3 + 1], b = rgb[k * 3 + 2];
    let s = slot.get(((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2));
    if (s == null) {
      let bd = Infinity;
      for (let i = 0; i < kept.length; i++) { const d = (pal[i * 3] - r) ** 2 + (pal[i * 3 + 1] - g) ** 2 + (pal[i * 3 + 2] - b) ** 2; if (d < bd) { bd = d; s = i; } }
    }
    idx[k] = s;
  }
  return { pal, idx };
}

const names = [...wantedNames()].sort();
if (args.includes('--hd')) { await bakeHd(names); process.exit(0); }
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
