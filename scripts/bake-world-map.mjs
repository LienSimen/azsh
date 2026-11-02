// Bake the world map for the Travel tab: phonecraft's combined Azeroth terrain map (public/maps/hq-azeroth.webp,
// 2400 x 2215, the image every zone's `mapPos` is measured on) becomes one indexed-colour picture that
// tuiMap.mjs draws as half-block cells, or as sixel pixels where the terminal can. Dev only; needs ffmpeg on PATH.
//
//   node scripts/bake-world-map.mjs [--src D:/projects/phonecraft/public/maps/hq-azeroth.webp] [--sixel]
//
// Default: 320 px wide, gzipped, src/data/world-map.bin.gz: a pane draws it at most about 80 cells wide, so
// 320 px leaves room to area-sample down. --sixel: 1200 px wide, brotli, src/data/world-map-sixel.bin.br,
// the pixels sixel draws. Both ship in the package: the big one is under 400 kB, unlike the creature and gear
// packs sixel draws (those are release assets, hdArt.mjs), so a sixel terminal has its map without a download.
//
// Pack: "AZMAP" u8 version u16 w u16 h u8 palLen, palLen*3 palette bytes, w*h palette indices (every pixel
// is drawn: the map has no transparency).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SRC = opt('--src', 'D:/projects/phonecraft/public/maps/hq-azeroth.webp');
const HD = args.includes('--sixel');
const WIDTH = +opt('--width', HD ? 1200 : 320);
const OUT = join(ROOT, HD ? 'src/data/world-map-sixel.bin.br' : 'src/data/world-map.bin.gz');
const MAX_COLORS = 255;

/** The source scaled to WIDTH px wide (lanczos), as packed rgb24. */
async function decode(file) {
  const p = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
  const [sw, sh] = p.stdout.toString().trim().split(',').map(Number);
  const w = WIDTH, h = Math.round((sh * WIDTH) / sw);
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${w}:${h}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 1 << 28 });
  if (stdout.length !== w * h * 3) throw new Error(`ffmpeg gave ${stdout.length} bytes for ${w}x${h}`);
  return { w, h, px: new Uint8Array(stdout.buffer, stdout.byteOffset, stdout.length) };
}

// Palette: colours bucketed to 5 bits a channel, the most common MAX_COLORS kept (each as its bucket's mean),
// the rest mapped to the nearest kept one. The map is mostly ocean and a few terrain tones, so the common
// buckets carry it; the rare bright marks (snow, a settlement) survive as their nearest kept colour.
function quantize({ w, h, px }) {
  const n = w * h, count = new Uint32Array(32768), sum = new Float64Array(32768 * 3);
  for (let i = 0; i < n; i++) {
    const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2], k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    count[k]++; sum[k * 3] += r; sum[k * 3 + 1] += g; sum[k * 3 + 2] += b;
  }
  const used = [];
  for (let k = 0; k < 32768; k++) if (count[k]) used.push(k);
  used.sort((a, b) => count[b] - count[a]);
  const kept = used.slice(0, MAX_COLORS);
  const pal = new Uint8Array(kept.length * 3);
  const slot = new Int16Array(32768).fill(-1);
  kept.forEach((k, i) => { slot[k] = i; pal[i * 3] = sum[k * 3] / count[k]; pal[i * 3 + 1] = sum[k * 3 + 1] / count[k]; pal[i * 3 + 2] = sum[k * 3 + 2] / count[k]; });
  for (const k of used.slice(MAX_COLORS)) {
    const r = ((k >> 10) & 31) * 8 + 4, g = ((k >> 5) & 31) * 8 + 4, b = (k & 31) * 8 + 4;
    let best = 0, bd = Infinity;
    for (let i = 0; i < kept.length; i++) {
      const d = (pal[i * 3] - r) ** 2 + (pal[i * 3 + 1] - g) ** 2 + (pal[i * 3 + 2] - b) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    slot[k] = best;
  }
  const idx = new Uint8Array(n);
  for (let i = 0; i < n; i++) idx[i] = slot[((px[i * 3] >> 3) << 10) | ((px[i * 3 + 1] >> 3) << 5) | (px[i * 3 + 2] >> 3)];
  return { pal, idx, colours: kept.length, dropped: used.length - kept.length };
}

const img = await decode(SRC);
const { pal, idx, colours, dropped } = quantize(img);
const head = Buffer.alloc(11);
head.write('AZMAP', 0, 'ascii'); head[5] = 1; head.writeUInt16LE(img.w, 6); head.writeUInt16LE(img.h, 8); head[10] = colours;
const raw = Buffer.concat([head, Buffer.from(pal), Buffer.from(idx)]);
const out = HD
  ? brotliCompressSync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_LGWIN]: 24, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: raw.length } })
  : gzipSync(raw, { level: 9 });
writeFileSync(OUT, out);
console.error(`${img.w}x${img.h}, ${colours} colours (${dropped} buckets folded in), ${(raw.length / 1e6).toFixed(2)} MB raw, ${(out.length / 1e3).toFixed(0)} kB ${HD ? 'brotli' : 'gzipped'} -> ${OUT}`);
