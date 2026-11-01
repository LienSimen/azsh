// Creature art for the windowed game: the sprites scripts/bake-model-art.mjs packed into
// src/data/model-art.bin.gz, drawn as truecolour half-block cells (▀ with the top pixel in the foreground
// and the bottom one in the background), two pixels a row. A sprite is scaled to the room it gets, so
// the same pack serves a 12-column corner and a 32-column pane. Transparent pixels stay bare spaces,
// so the art sits on whatever the screen paints behind it. No pack, or NO_COLOR: no art, never an error.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { useColor } from './text.mjs';

const PACK_URL = new URL('../data/model-art.bin.gz', import.meta.url);
let index = null; // displayId -> byte offset of the sprite header in `pack`
let pack = null;

function load() {
  if (index) return index;
  index = new Map();
  try {
    pack = gunzipSync(readFileSync(PACK_URL));
    if (pack.toString('ascii', 0, 5) !== 'AZART' || pack[5] !== 1) return index;
    const count = pack.readUInt32LE(6);
    let off = 10;
    for (let i = 0; i < count && off + 7 <= pack.length; i++) {
      const id = pack.readUInt32LE(off), w = pack[off + 4], h = pack[off + 5], palLen = pack[off + 6];
      index.set(id, off);
      off += 7 + palLen * 3 + w * h;
    }
  } catch { pack = null; }
  return index;
}

/** The baked sprite for a display id: `{ w, h, pal, idx }` (idx 0 is transparent, n is pal[n-1]), or null. */
export function spriteOf(displayId) {
  const off = load().get(displayId);
  if (off == null) return null;
  const w = pack[off + 4], h = pack[off + 5], palLen = pack[off + 6];
  const palStart = off + 7, idxStart = palStart + palLen * 3;
  return { w, h, pal: pack.subarray(palStart, idxStart), idx: pack.subarray(idxStart, idxStart + w * h) };
}

/** Is there art for this display id? Cheap once the pack is loaded. */
export const hasArt = (displayId) => useColor && load().has(displayId);

// Area-average the sprite into gw x gh samples: colour from the palette, coverage from the transparent count.
function sample(sp, gw, gh) {
  const { w, h, pal, idx } = sp;
  const cw = w / gw, ch = h / gh;
  const out = new Float32Array(gw * gh * 4);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const sx0 = Math.floor(gx * cw), sx1 = Math.max(sx0 + 1, Math.floor((gx + 1) * cw));
    const sy0 = Math.floor(gy * ch), sy1 = Math.max(sy0 + 1, Math.floor((gy + 1) * ch));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = sy0; y < sy1 && y < h; y++) for (let x = sx0; x < sx1 && x < w; x++) {
      const p = idx[y * w + x];
      n++;
      if (!p) continue;
      r += pal[(p - 1) * 3]; g += pal[(p - 1) * 3 + 1]; b += pal[(p - 1) * 3 + 2]; a++;
    }
    const k = (gy * gw + gx) * 4;
    if (a) { out[k] = r / a; out[k + 1] = g / a; out[k + 2] = b / a; }
    out[k + 3] = n ? a / n : 0;
  }
  return out;
}

const fg = (s, k) => `\x1b[38;2;${s[k] | 0};${s[k + 1] | 0};${s[k + 2] | 0}m`;
const bg = (s, k) => `\x1b[48;2;${s[k] | 0};${s[k + 1] | 0};${s[k + 2] | 0}m`;
const RESET = '\x1b[0m';

const cache = new Map();
const CACHE_MAX = 96;

/**
 * The sprite as lines of half-block cells that fit in `maxCols` x `maxRows` (keeping its proportions), each
 * line exactly as wide as the art, or null when there is no art, no colour, or no room (under 3 rows).
 */
export function creatureArt(displayId, maxCols, maxRows) {
  if (!useColor || maxCols < 2 || maxRows < 3) return null;
  const sp = spriteOf(displayId);
  if (!sp) return null;
  const scale = Math.min(1, maxCols / sp.w, (maxRows * 2) / sp.h);
  const gw = Math.max(1, Math.round(sp.w * scale)), gh = Math.max(2, Math.round(sp.h * scale) + 1) & ~1;
  const key = `${displayId}:${gw}x${gh}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = sample(sp, gw, gh);
  const lines = [];
  for (let y = 0; y < gh; y += 2) {
    let line = '';
    for (let x = 0; x < gw; x++) {
      const t = (y * gw + x) * 4, u = ((y + 1) * gw + x) * 4;
      const ta = s[t + 3] > 0.5, ua = s[u + 3] > 0.5;
      if (ta && ua) line += `${fg(s, t)}${bg(s, u)}▀${RESET}`;
      else if (ta) line += `${fg(s, t)}▀${RESET}`;
      else if (ua) line += `${fg(s, u)}▄${RESET}`;
      else line += ' ';
    }
    lines.push(line);
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, lines);
  return lines;
}

/** Width in cells of art lines from creatureArt (every line is the same width). */
export const artWidth = (lines) => (lines?.length ? lines[0].replace(/\x1b\[[0-9;]*m/g, '').length : 0);
