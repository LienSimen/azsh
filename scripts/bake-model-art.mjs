// Bake creature sprites for the windowed game: phonecraft's full-body renders (public/portraits/creature/
// <displayId>.webp, 128 px, alpha) become one gzipped pack of small indexed-colour images that modelArt.mjs
// draws as half-block cells. Dev only; needs ffmpeg on PATH to decode the webp.
//
//   node scripts/bake-model-art.mjs [--src D:/projects/phonecraft/public/portraits/creature] [--all]
//
// Default: every display id a huntable, dungeon, quest or raid creature uses. --all bakes every display id
// in the creature table. Each sprite is cropped to its opaque box and area-sampled to at most 28x56 px.
//
// Pack: "AZART" u8 version u32 count, then per sprite u32 displayId u8 w u8 h u8 palLen, palLen*3 palette
// bytes, w*h palette indices (0 = transparent, n = palette[n-1]).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SRC = opt('--src', 'D:/projects/phonecraft/public/portraits/creature');
const OUT = join(ROOT, 'src/data/model-art.bin.gz');
// 28 px is as wide as any pane draws a sprite; 127 colours a sprite keeps the pack near 3 MB.
const MAX_W = 28, MAX_H = 56, MAX_COLORS = 127, PARALLEL = 8;

const table = (f) => JSON.parse(gunzipSync(readFileSync(join(ROOT, 'src/data/tables', f))).toString('utf8'));
const rows = (t) => (Array.isArray(t) ? t : Object.values(t));

function wantedDisplayIds() {
  const creatures = rows(table('creatures.json.gz'));
  const byEntry = new Map(creatures.map((c) => [c.entry, c]));
  if (args.includes('--all')) return new Set(creatures.map((c) => c.displayId).filter(Boolean));
  const entries = new Set();
  for (const z of rows(table('zones.json.gz'))) for (const e of z.huntable ?? []) entries.add(e);
  for (const m of JSON.stringify(table('dungeonSpawns.json.gz')).matchAll(/"(?:entry|creatureEntry|creature)":(\d+)/g)) entries.add(+m[1]);
  for (const q of rows(table('quests.json.gz'))) for (const k of q.killTargets ?? []) entries.add(k.creatureEntry);
  for (const f of ['dungeonPacks.json.gz', 'dungeonCensus.json.gz', 'creaturePatrolPacks.json.gz', 'creatureAggroGroups.json.gz', 'alteracValley.json.gz']) {
    try { for (const m of JSON.stringify(table(f)).matchAll(/"(?:entry|creatureEntry|creature|boss)":(\d+)/g)) entries.add(+m[1]); } catch { /* optional */ }
  }
  const ids = new Set();
  for (const e of entries) { const c = byEntry.get(e); if (c?.displayId) ids.add(c.displayId); }
  console.error(`${entries.size} creature entries reachable, ${ids.size} display ids`);
  return ids;
}

async function decode(file) {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { encoding: 'buffer', maxBuffer: 1 << 26 });
  let w = 128, h = 128;
  if (stdout.length !== w * h * 4) {
    const p = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
    [w, h] = p.stdout.toString().trim().split(',').map(Number);
  }
  return { w, h, px: new Uint8Array(stdout.buffer, stdout.byteOffset, stdout.length) };
}

function bbox({ w, h, px }) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

// Area-average the crop into gw x gh samples, colour weighted by alpha so edges keep the model's colour.
function sample({ w, px }, box, gw, gh) {
  const cw = (box.x1 - box.x0 + 1) / gw, ch = (box.y1 - box.y0 + 1) / gh;
  const rgb = new Uint8Array(gw * gh * 3), on = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const sx0 = Math.floor(box.x0 + gx * cw), sx1 = Math.max(sx0 + 1, Math.floor(box.x0 + (gx + 1) * cw));
    const sy0 = Math.floor(box.y0 + gy * ch), sy1 = Math.max(sy0 + 1, Math.floor(box.y0 + (gy + 1) * ch));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
      const o = (y * w + x) * 4, al = px[o + 3] / 255;
      r += px[o] * al; g += px[o + 1] * al; b += px[o + 2] * al; a += al; n++;
    }
    const k = gy * gw + gx;
    if (a / n > 0.5) { on[k] = 1; rgb[k * 3] = r / a; rgb[k * 3 + 1] = g / a; rgb[k * 3 + 2] = b / a; }
  }
  return { gw, gh, rgb, on };
}

// Per-sprite palette: colours bucketed to 6 bits a channel, the most common MAX_COLORS kept (each as the
// bucket's mean colour), the rest mapped to the nearest kept one.
function quantize({ gw, gh, rgb, on }) {
  const buckets = new Map();
  for (let k = 0; k < gw * gh; k++) {
    if (!on[k]) continue;
    const r = rgb[k * 3], g = rgb[k * 3 + 1], b = rgb[k * 3 + 2];
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bk.n++; bk.r += r; bk.g += g; bk.b += b;
    buckets.set(key, bk);
  }
  const kept = [...buckets.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, MAX_COLORS);
  const pal = new Uint8Array(kept.length * 3);
  const slot = new Map();
  kept.forEach(([key, bk], i) => { slot.set(key, i + 1); pal[i * 3] = bk.r / bk.n; pal[i * 3 + 1] = bk.g / bk.n; pal[i * 3 + 2] = bk.b / bk.n; });
  const nearest = (r, g, b) => {
    let best = 1, bd = Infinity;
    for (let i = 0; i < kept.length; i++) {
      const d = (pal[i * 3] - r) ** 2 + (pal[i * 3 + 1] - g) ** 2 + (pal[i * 3 + 2] - b) ** 2;
      if (d < bd) { bd = d; best = i + 1; }
    }
    return best;
  };
  const idx = new Uint8Array(gw * gh);
  for (let k = 0; k < gw * gh; k++) {
    if (!on[k]) continue;
    const r = rgb[k * 3], g = rgb[k * 3 + 1], b = rgb[k * 3 + 2];
    idx[k] = slot.get(((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2)) ?? nearest(r, g, b);
  }
  return { pal, idx };
}

async function bake(id) {
  const file = join(SRC, `${id}.webp`);
  if (!existsSync(file)) return null;
  const img = await decode(file);
  const box = bbox(img);
  if (!box) return null;
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  const s = Math.min(1, MAX_W / bw, MAX_H / bh);
  const gw = Math.max(1, Math.round(bw * s)), gh = Math.max(2, Math.round(bh * s) + 1) & ~1;
  const { pal, idx } = quantize(sample(img, box, gw, gh));
  if (!pal.length) return null;
  const head = Buffer.alloc(7);
  head.writeUInt32LE(id, 0); head[4] = gw; head[5] = gh; head[6] = pal.length / 3;
  return Buffer.concat([head, Buffer.from(pal), Buffer.from(idx)]);
}

const ids = [...wantedDisplayIds()].sort((a, b) => a - b);
const parts = [];
let missing = 0, done = 0;
const queue = ids.slice();
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  for (let id = queue.shift(); id != null; id = queue.shift()) {
    const buf = await bake(id);
    if (buf) parts.push(buf); else missing++;
    if (++done % 500 === 0) console.error(`${done}/${ids.length}`);
  }
}));
parts.sort((a, b) => a.readUInt32LE(0) - b.readUInt32LE(0));
const header = Buffer.alloc(10);
header.write('AZART', 0, 'ascii'); header[5] = 1; header.writeUInt32LE(parts.length, 6);
const raw = Buffer.concat([header, ...parts]);
const gz = gzipSync(raw, { level: 9 });
writeFileSync(OUT, gz);
console.error(`${parts.length} sprites (${missing} without a render), ${(raw.length / 1e6).toFixed(1)} MB raw, ${(gz.length / 1e6).toFixed(2)} MB gzipped -> ${OUT}`);
