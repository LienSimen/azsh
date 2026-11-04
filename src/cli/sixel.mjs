// Sixel sprites: real pixels for the creatures on the fight stage, where the terminal can draw them
// (Windows Terminal 1.22+, WezTerm, foot, mlterm, xterm -ti vt340). The half-block art (modelArt.mjs) is a
// pixel per half cell; a sixel image is the terminal's own pixels, about ten per cell across and twenty down.
//
// A screen is lines of text, so an image travels through them as a placeholder: a block of blank cells
// whose rows each start with a marker, an SGR-shaped code (`ESC[9999;id;rowm`) the text helpers count as
// zero width. RealTerm.draw takes the markers out before it writes, then sends the image at the block's
// top-left cell after the text (term.mjs). The terminal says whether it speaks sixel in its DA1 reply.
//
// The pixels come from model-art-hd.bin.br (scripts/bake-model-art.mjs --hd): the same sprites as the
// half-block pack at the renders' own size, up to 128 px wide; icons from icon-art-hd.bin.br. Neither ships in
// the package: hdArt.mjs finds them (downloaded, or a checkout's bake). model-art-worn.bin.br does ship: the
// forms and costumes a player wears, read for any sprite the hd pack lacks. No pack, no sprite, or no sixel:
// null, and the caller draws the half-block art. AZSH_SIXEL=0 turns it off, AZSH_SIXEL=1 on without asking.
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { useColor } from './text.mjs';
import { hdArtPath } from './hdArt.mjs';

const MAGIC = 9999;
export const MARK_RE = /\x1b\[9999;(\d+);(\d+)m/g;

let on = process.env.AZSH_SIXEL === '1';
// The terminal's cell in pixels. Windows Terminal answers CSI 16 t with zeros and scales a sixel as if a
// cell were 10 x 20 (the VT340's), whatever the font; that is the fallback for any terminal that does not say.
let cellW = 10, cellH = 20;

/** Is sixel art on? Never without colour or under AZSH_SIXEL=0. */
export const sixelOn = () => on && useColor && process.env.AZSH_SIXEL !== '0';
/** The DA1 reply's parameters (`?62;4;22`): 4 is sixel graphics. True when this turned sixel on. */
export function noteDeviceAttributes(params) {
  if (on || process.env.AZSH_SIXEL === '0') return false;
  on = params.replace('?', '').split(';').includes('4');
  return on;
}
/** The CSI 16 t reply: the cell's height and width in pixels; zeros (Windows Terminal) keep the fallback. */
export function noteCellSize(h, w) {
  if (h > 0 && w > 0) { cellH = h; cellW = w; }
}
/** The cell in pixels, { w, h }: what a caller fitting its own picture to a pane sizes by. */
export const cellSize = () => ({ w: cellW, h: cellH });

// ---- the source images ------------------------------------------------------------------------------

const WORN_URL = new URL('../data/model-art-worn.bin.br', import.meta.url);
let index = null; // displayId -> { pack, off }: the sprite's bytes (the half-block pack's layout, AZART v1)

/** Index one pack's sprites; an id already indexed keeps the pack it came from. */
function indexPack(file) {
  try {
    const pack = brotliDecompressSync(readFileSync(file));
    if (pack.toString('ascii', 0, 5) !== 'AZART' || pack[5] !== 1) return;
    const count = pack.readUInt32LE(6);
    let off = 10;
    for (let i = 0; i < count && off + 7 <= pack.length; i++) {
      const id = pack.readUInt32LE(off);
      if (!index.has(id)) index.set(id, { pack, off });
      off += 7 + pack[off + 6] * 3 + pack[off + 4] * pack[off + 5];
    }
  } catch { /* no pack: its sprites draw half-block */ }
}

function load() {
  if (index) return index;
  index = new Map();
  const hd = hdArtPath('model-art-hd.bin.br');
  if (hd) indexPack(hd);
  indexPack(WORN_URL);
  return index;
}

/** Forget the packs (and what was missing) so the next draw reads them again: after a download. */
export function forgetSixelPacks() { index = iconIndex = iconPack = null; images.clear(); byKey.clear(); }

/** The sprite for a display id as { w, h, rgba } (already cropped to its opaque box), or null. */
function sourceOf(displayId) {
  const at = load().get(displayId);
  if (!at) return null;
  const { pack, off } = at;
  const w = pack[off + 4], h = pack[off + 5], palLen = pack[off + 6], pal = off + 7, idx = pal + palLen * 3;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const p = pack[idx + i];
    if (!p) continue;
    const c = pal + (p - 1) * 3;
    rgba[i * 4] = pack[c]; rgba[i * 4 + 1] = pack[c + 1]; rgba[i * 4 + 2] = pack[c + 2]; rgba[i * 4 + 3] = 255;
  }
  return { w, h, rgba };
}

// ---- scaling and encoding -----------------------------------------------------------------------------

/** The image scaled to tw x th, placed bottom-centre on a cw x ch canvas: area-sampled when it shrinks,
 *  bilinear when it grows. Colour is weighted by alpha; a pixel shows where more than half of it is covered. */
function scaleOnto(img, tw, th, cw, ch) {
  const out = new Uint8Array(cw * ch * 4);
  const ox = Math.floor((cw - tw) / 2), oy = ch - th;
  const sx = img.w / tw, sy = img.h / th;
  if (sx < 1) {
    const at = (x, y, c) => img.rgba[(Math.min(img.h - 1, Math.max(0, y)) * img.w + Math.min(img.w - 1, Math.max(0, x))) * 4 + c];
    for (let ty = 0; ty < th; ty++) {
      const fy = (ty + 0.5) * sy - 0.5, y0 = Math.floor(fy), wy = fy - y0;
      for (let tx = 0; tx < tw; tx++) {
        const fx = (tx + 0.5) * sx - 0.5, x0 = Math.floor(fx), wx = fx - x0;
        let r = 0, g = 0, b = 0, a = 0;
        for (const [x, y, wt] of [[x0, y0, (1 - wx) * (1 - wy)], [x0 + 1, y0, wx * (1 - wy)], [x0, y0 + 1, (1 - wx) * wy], [x0 + 1, y0 + 1, wx * wy]]) {
          const al = at(x, y, 3) * wt;
          r += at(x, y, 0) * al; g += at(x, y, 1) * al; b += at(x, y, 2) * al; a += al;
        }
        if (a < 128) continue;
        const d = ((oy + ty) * cw + ox + tx) * 4;
        out[d] = r / a; out[d + 1] = g / a; out[d + 2] = b / a; out[d + 3] = 255;
      }
    }
    return out;
  }
  for (let ty = 0; ty < th; ty++) {
    const y0 = Math.floor(ty * sy), y1 = Math.max(y0 + 1, Math.floor((ty + 1) * sy));
    for (let tx = 0; tx < tw; tx++) {
      const x0 = Math.floor(tx * sx), x1 = Math.max(x0 + 1, Math.floor((tx + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1 && y < img.h; y++) for (let x = x0; x < x1 && x < img.w; x++) {
        const k = (y * img.w + x) * 4, al = img.rgba[k + 3];
        r += img.rgba[k] * al; g += img.rgba[k + 1] * al; b += img.rgba[k + 2] * al; a += al; n++;
      }
      if (!n || a / n < 128) continue;
      const d = ((oy + ty) * cw + ox + tx) * 4;
      out[d] = r / a; out[d + 1] = g / a; out[d + 2] = b / a; out[d + 3] = 255;
    }
  }
  return out;
}

/** Up to 255 colours: the most used 15-bit buckets (each the mean of its pixels), the rest mapped to the
 *  nearest kept one. Returns the palette and a colour index per pixel (-1 where transparent). */
function quantize(rgba, n) {
  const count = new Uint32Array(32768), sum = new Float64Array(32768 * 3), bucket = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (!rgba[i * 4 + 3]) continue;
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    bucket[i] = k; count[k]++; sum[k * 3] += r; sum[k * 3 + 1] += g; sum[k * 3 + 2] += b;
  }
  const used = [];
  for (let k = 0; k < 32768; k++) if (count[k]) used.push(k);
  used.sort((a, b) => count[b] - count[a]);
  const kept = used.slice(0, 255);
  const pal = kept.map((k) => [sum[k * 3] / count[k], sum[k * 3 + 1] / count[k], sum[k * 3 + 2] / count[k]]);
  const slot = new Int32Array(32768).fill(-1);
  kept.forEach((k, i) => { slot[k] = i; });
  for (const k of used.slice(255)) {
    const r = ((k >> 10) & 31) * 8 + 4, g = ((k >> 5) & 31) * 8 + 4, b = (k & 31) * 8 + 4;
    let best = 0, bd = Infinity;
    pal.forEach(([pr, pg, pb], i) => { const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2; if (d < bd) { bd = d; best = i; } });
    slot[k] = best;
  }
  const idx = new Int16Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (bucket[i] >= 0) idx[i] = slot[bucket[i]];
  return { pal, idx };
}

/** An RGBA image as a sixel string: 1:1 pixels, unset pixels transparent (P2=1), run-length coded. */
function encode(rgba, w, h) {
  const { pal, idx } = quantize(rgba, w * h);
  let out = `\x1bP0;1;0q"1;1;${w};${h}`;
  pal.forEach(([r, g, b], i) => { out += `#${i};2;${Math.round((r * 100) / 255)};${Math.round((g * 100) / 255)};${Math.round((b * 100) / 255)}`; });
  const rle = (ch, n) => (n > 3 ? `!${n}${ch}` : ch.repeat(n));
  for (let y0 = 0; y0 < h; y0 += 6) {
    // Each colour in the band: a six-bit column per x, the rows it covers.
    const bands = new Map();
    for (let dy = 0; dy < 6 && y0 + dy < h; dy++) for (let x = 0; x < w; x++) {
      const c = idx[(y0 + dy) * w + x];
      if (c < 0) continue;
      let cols = bands.get(c);
      if (!cols) bands.set(c, (cols = new Uint8Array(w)));
      cols[x] |= 1 << dy;
    }
    let first = true;
    for (const [c, cols] of bands) {
      let last = w - 1;
      while (last >= 0 && !cols[last]) last--;
      let s = `#${c}`, run = 0, prev = -1;
      for (let x = 0; x <= last; x++) {
        if (cols[x] === prev) { run++; continue; }
        if (run) s += rle(String.fromCharCode(63 + prev), run);
        prev = cols[x]; run = 1;
      }
      if (run) s += rle(String.fromCharCode(63 + prev), run);
      out += (first ? '' : '$') + s;
      first = false;
    }
    out += '-';
  }
  return `${out}\x1b\\`;
}

// ---- placements ----------------------------------------------------------------------------------------

// Encoded images by id, the oldest dropped past IMAGES_MAX (a marker for a dropped id is ignored, and the
// next draw that wants the picture encodes it again under a new id).
const IMAGES_MAX = 480;
const images = new Map(); // id -> { cols, rows, sixel, holes }
const byKey = new Map(); // what was drawn and at which cell size -> id
let nextId = 0;

/** The sixel string, size in cells and transparent `holes` of a placed image, by the id its markers carry. */
export const imageOf = (id) => images.get(id) ?? null;

// While a list's cursor is still moving, the detail pane draws only the pictures it has made before: a new
// one (a sprite to unpack, a sixel to encode and send) waits until the cursor rests (tui.mjs mainLines), so
// paging down a list never stalls on art for rows it is only passing. Icons are cheap and always drawn.
let held = null;

/** Run `fn` with new pictures held back: `{ value, missed }`, `missed` when one was held. */
export function holdNewArt(fn) {
  const was = held;
  held = { missed: false };
  try { const value = fn(); return { value, missed: held.missed }; } finally { held = was; }
}

/** A new picture is about to be made: true to go ahead, false (and noted) while they are held. */
export function mayMakeArt() {
  if (!held) return true;
  held.missed = true;
  return false;
}

/** Is a holdNewArt pass running? */
export const holdingArt = () => !!held;

/** The id of the image under `key`, built by `make()` -> { cols, rows, rgba, holes? } (cols x rows cells of
 *  pixels, `holes` the cells left transparent) the first time; null when `make` has nothing, or while new
 *  pictures are held (`always`: an icon, made regardless). */
function imageId(key, make, always = false) {
  key = `${key}|${cellW}x${cellH}`;
  const hit = byKey.get(key);
  if (hit != null && images.has(hit)) return hit;
  if (!always && !mayMakeArt()) return null;
  const img = make();
  if (!img) return null;
  const id = nextId++;
  images.set(id, { cols: img.cols, rows: img.rows, holes: img.holes ?? [], sixel: encode(img.rgba, img.cols * cellW, img.rows * cellH) });
  byKey.set(key, id);
  if (images.size > IMAGES_MAX) {
    const old = images.keys().next().value;
    images.delete(old);
    for (const [k, v] of byKey) if (v === old) { byKey.delete(k); break; }
  }
  return id;
}

/** The placeholder for image `id`: one array of cells per row, the row's marker riding on its first cell. */
function placeholderCells(id) {
  const { cols, rows } = images.get(id);
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, x) => (x ? ' ' : `[${MAGIC};${id};${r}m `)));
}

/**
 * A creature as a sixel placeholder that fits in `maxCols` x `maxRows` cells (bottom-centred, keeping its
 * proportions): `rows` lines of `cols` blank cells, each line starting with its marker. Null when sixel is
 * off or the pack has no sprite for the display id.
 */
export function sixelCreature(displayId, maxCols, maxRows) {
  if (!sixelOn() || displayId == null || maxCols < 2 || maxRows < 2) return null;
  return sixelImage(`c${displayId}`, () => sourceOf(displayId), maxCols, maxRows);
}

/** Any image (`source()` -> { w, h, rgba }, cropped) fitted to `maxCols` x `maxRows` cells as placeholder lines,
 *  cached under `key`; null when sixel is off or there is no image. */
export function sixelImage(key, source, maxCols, maxRows) {
  if (!sixelOn()) return null;
  const id = imageId(`${key}|${maxCols}x${maxRows}`, () => {
    const img = source();
    if (!img) return null;
    const scale = Math.min((maxCols * cellW) / img.w, (maxRows * cellH) / img.h);
    const tw = Math.max(1, Math.round(img.w * scale)), th = Math.max(1, Math.round(img.h * scale));
    const cols = Math.ceil(tw / cellW), rows = Math.ceil(th / cellH);
    return { cols, rows, rgba: scaleOnto(img, tw, th, cols * cellW, rows * cellH) };
  });
  return id == null ? null : placeholderCells(id).map((r) => r.join(''));
}

// ---- icons ----------------------------------------------------------------------------------------------

let iconIndex = null; // name -> byte offset in `iconPack`
let iconPack = null;

function loadIcons() {
  if (iconIndex) return iconIndex;
  iconIndex = new Map();
  try {
    iconPack = brotliDecompressSync(readFileSync(hdArtPath('icon-art-hd.bin.br')));
    if (iconPack.toString('ascii', 0, 5) !== 'AZICH' || iconPack[5] !== 1) return iconIndex;
    const count = iconPack.readUInt32LE(6);
    let off = 10;
    for (let i = 0; i < count && off < iconPack.length; i++) {
      const n = iconPack[off];
      iconIndex.set(iconPack.toString('ascii', off + 1, off + 1 + n), off + 1 + n);
      off += 1 + n;
      off += 2 + iconPack[off + 1] * 3 + iconPack[off] * iconPack[off];
    }
  } catch { iconPack = null; }
  return iconIndex;
}

/** An icon's picture as { w, h, rgba }; `tone` 'gray' greys and darkens it (a talent out of reach). */
function iconSource(name, tone) {
  const off = loadIcons().get(name);
  if (off == null) return null;
  const side = iconPack[off], palLen = iconPack[off + 1], pal = off + 2, idx = pal + palLen * 3;
  const rgba = new Uint8Array(side * side * 4);
  for (let i = 0; i < side * side; i++) {
    const c = pal + iconPack[idx + i] * 3;
    let r = iconPack[c], g = iconPack[c + 1], b = iconPack[c + 2];
    if (tone === 'gray') r = g = b = Math.round((0.3 * r + 0.59 * g + 0.11 * b) * 0.6);
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
  }
  return { w: side, h: side, rgba };
}

/** Is there a full-size icon for `name` to draw as sixel? */
export const sixelIconOn = (name) => sixelOn() && !!name && loadIcons().has(String(name).toLowerCase());

/**
 * The icon `name` filling `cols` x `cols / 2` cells, as rows of cells like iconCells (iconArt.mjs) makes,
 * or null. `holes` ([{ x, y, w }] in cells) stay transparent so text drawn there (a rank, a count) shows
 * through the picture.
 */
export function sixelIconCells(name, cols, tone = '', holes = []) {
  if (!sixelIconOn(name)) return null;
  name = String(name).toLowerCase();
  const rows = cols / 2;
  const id = imageId(`i${name}|${cols}|${tone}|${holes.map((h) => `${h.x},${h.y},${h.w}`).join(';')}`, () => {
    const img = iconSource(name, tone);
    if (!img) return null;
    const pw = cols * cellW, ph = rows * cellH;
    const rgba = scaleOnto(img, pw, ph, pw, ph);
    for (const h of holes) for (let y = h.y * cellH; y < (h.y + 1) * cellH; y++) {
      for (let x = h.x * cellW; x < (h.x + h.w) * cellW; x++) rgba[(y * pw + x) * 4 + 3] = 0;
    }
    return { cols, rows, rgba, holes };
  }, true);
  return id == null ? null : placeholderCells(id);
}
