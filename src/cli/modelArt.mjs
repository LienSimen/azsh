// Model art for the windowed game, drawn as truecolour half-block cells (▀ with the top pixel in the
// foreground and the bottom one in the background), two pixels a row. Two packs:
//   src/data/model-art.bin.gz  (scripts/bake-model-art.mjs)  creature sprites by display id, a palette each
//   src/data/gear-art.bin.br   (scripts/bake-gear-art.py)    the sixteen player bodies with their skins, faces,
//                                                            hair and every item appearance, one shared palette
//   src/data/go-art.bin.gz     (bake-model-art.mjs --go)     gameobjects (chests, veins, signs) by GO display id
// A creature is one sprite; a character is a skin with its layers stacked on it (paperdoll.mjs decides the
// layers). Either is scaled to the room it gets, so the same pack serves a 12-column corner and a 32-column
// pane. Transparent pixels stay bare spaces, so the art sits on whatever the screen paints behind it. No
// pack, or NO_COLOR: no art, never an error.
import { readFileSync } from 'node:fs';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { useColor } from './text.mjs';
import { sixelCreature, sixelImage, sixelOn, forgetSixelPacks, mayMakeArt, holdingArt } from './sixel.mjs';
import { hdArtPath } from './hdArt.mjs';

const PACK_URL = new URL('../data/model-art.bin.gz', import.meta.url);
const GO_URL = new URL('../data/go-art.bin.gz', import.meta.url);
const GEAR_URL = new URL('../data/gear-art.bin.br', import.meta.url); // brotli: a fifth smaller than gzip for a hundred thousand tiny images

// ---- the creature and gameobject packs --------------------------------------------------------------

// A sprite pack ("AZART" v1, scripts/bake-model-art.mjs): the bytes and display id -> byte offset of each
// sprite's header, read on first use.
function openPack(url) {
  const index = new Map();
  try {
    const pack = gunzipSync(readFileSync(url));
    if (pack.toString('ascii', 0, 5) !== 'AZART' || pack[5] !== 1) return { index, pack: null };
    const count = pack.readUInt32LE(6);
    let off = 10;
    for (let i = 0; i < count && off + 7 <= pack.length; i++) {
      const id = pack.readUInt32LE(off), w = pack[off + 4], h = pack[off + 5], palLen = pack[off + 6];
      index.set(id, off);
      off += 7 + palLen * 3 + w * h;
    }
    return { index, pack };
  } catch { return { index, pack: null }; }
}

let creatures = null, objects = null;
const load = () => (creatures ??= openPack(PACK_URL));
const loadGo = () => (objects ??= openPack(GO_URL));

function spriteIn({ index, pack }, displayId) {
  const off = index.get(displayId);
  if (off == null) return null;
  const w = pack[off + 4], h = pack[off + 5], palLen = pack[off + 6];
  const palStart = off + 7, idxStart = palStart + palLen * 3;
  return { w, h, pal: pack.subarray(palStart, idxStart), idx: pack.subarray(idxStart, idxStart + w * h) };
}

/** The baked sprite for a display id: `{ w, h, pal, idx }` (idx 0 is transparent, n is pal[n-1]), or null. */
export const spriteOf = (displayId) => spriteIn(load(), displayId);

/** Is there art for this display id? Cheap once the pack is loaded. */
export const hasArt = (displayId) => useColor && load().index.has(displayId);

/** A sprite as an image: `rgb` per pixel and an `on` mask (1 where the pixel is drawn). */
function spriteImage(sp) {
  const n = sp.w * sp.h, rgb = new Uint8Array(n * 3), on = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = sp.idx[i];
    if (!p) continue;
    on[i] = 1;
    rgb[i * 3] = sp.pal[(p - 1) * 3]; rgb[i * 3 + 1] = sp.pal[(p - 1) * 3 + 1]; rgb[i * 3 + 2] = sp.pal[(p - 1) * 3 + 2];
  }
  return { w: sp.w, h: sp.h, rgb, on };
}

// ---- the gear pack ------------------------------------------------------------------------------------

let gear = null; // { buf, pal, bodies: slug -> { canvas, skins: skin -> offset, overlays: key -> { off, x, y, w, h } }, items: entry -> key }

function loadGear() {
  if (gear) return gear;
  gear = { buf: null, pal: null, bodies: new Map(), items: new Map() };
  try {
    const buf = brotliDecompressSync(readFileSync(GEAR_URL)); // about 170 ms once, on the first character drawn
    if (buf.toString('ascii', 0, 6) !== 'AZGEAR' || buf[6] !== 1) return gear;
    let off = 7;
    const palLen = buf[off++];
    const pal = buf.subarray(off, off + palLen * 3); off += palLen * 3;
    const bodyCount = buf[off++];
    const bodies = new Map();
    for (let b = 0; b < bodyCount; b++) {
      const slugLen = buf[off++];
      const slug = buf.toString('ascii', off, off + slugLen); off += slugLen;
      const canvas = buf[off++];
      const body = { canvas, skins: new Map(), overlays: new Map() };
      const skinCount = buf[off++];
      for (let i = 0; i < skinCount; i++) { body.skins.set(buf[off], off + 1); off += 1 + canvas * canvas; }
      const ovCount = buf.readUInt16LE(off); off += 2;
      for (let i = 0; i < ovCount; i++) {
        const keyLen = buf[off++];
        const key = buf.toString('ascii', off, off + keyLen); off += keyLen;
        const x = buf[off], y = buf[off + 1], w = buf[off + 2], h = buf[off + 3]; off += 4;
        body.overlays.set(key, { off, x, y, w, h });
        off += w * h;
      }
      bodies.set(slug, body);
    }
    const items = new Map();
    const itemCount = buf.readUInt16LE(off); off += 2;
    for (let i = 0; i < itemCount; i++) {
      const entry = buf.readUInt32LE(off); off += 4;
      const keyLen = buf[off++];
      items.set(entry, buf.toString('ascii', off, off + keyLen)); off += keyLen;
    }
    gear = { buf, pal, bodies, items };
  } catch { /* no gear pack: characters draw as bare bodies from the creature pack, or not at all */ }
  return gear;
}

/** The gear pack's body for a slug ("human-male"): `{ canvas, skins, overlays }`, or null. */
export const gearBody = (slug) => (useColor ? loadGear().bodies.get(slug) ?? null : null);
/** The overlay key ("5-29958": InventoryType-appearance) an item entry draws as, or null. */
export const gearKeyOfItem = (entry) => loadGear().items.get(entry) ?? null;

/**
 * A character composed on the gear pack: the body's `skin` with `layers` ({ key, z, mirrored }) stacked
 * in z order, then cropped and drawn like a creature. A mirrored layer flips about the frame's centre (a
 * main-hand weapon drawn in the off hand). Null without the pack, the body or room.
 */
export function compositeArt(slug, skin, layers, maxCols, maxRows) {
  if (!useColor || maxCols < 2 || maxRows < 3) return null;
  const look = `${slug}|${skin}|${layers.map((l) => (l.mirrored ? `~${l.key}` : l.key)).join(',')}`;
  if (sixelOn()) {
    const hd = gearBodyHd(slug);
    const six = hd && sixelImage(`g${look}`, () => {
      const img = compose(hd, hd.buf, hd.pal, skin, layers);
      return img && rgbaOf(crop(img));
    }, maxCols, maxRows);
    if (six) return six;
  }
  if (sixelOn() && holdingArt()) return null; // held back, as in creatureArt
  const g = loadGear(), body = g.bodies.get(slug);
  if (!body || !g.buf) return null;
  const key = `${look}|${maxCols}x${maxRows}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!mayMakeArt()) return null;
  const img = compose(body, g.buf, g.pal, skin, layers);
  return img ? remember(key, renderImage(crop(img), maxCols, maxRows)) : null;
}

/** A body's `skin` with `layers` stacked on it, as { w, h, rgb, on } on the body's square canvas; null
 *  without the skin. The pack (`buf`, `pal`) is the small one or a body's hd file. */
function compose(body, buf, pal, skin, layers) {
  const skinOff = body.skins.get(skin) ?? body.skins.get(0);
  if (skinOff == null) return null;
  const c = body.canvas, n = c * c, rgb = new Uint8Array(n * 3), on = new Uint8Array(n);
  const paint = (k, p) => { on[k] = 1; rgb[k * 3] = pal[(p - 1) * 3]; rgb[k * 3 + 1] = pal[(p - 1) * 3 + 1]; rgb[k * 3 + 2] = pal[(p - 1) * 3 + 2]; };
  for (let k = 0; k < n; k++) { const p = buf[skinOff + k]; if (p) paint(k, p); }
  for (const l of [...layers].sort((a, b) => a.z - b.z)) {
    const ov = body.overlays.get(l.key);
    if (!ov) continue;
    const x0 = l.mirrored ? c - (ov.x + ov.w) : ov.x;
    for (let y = 0; y < ov.h; y++) for (let x = 0; x < ov.w; x++) {
      const p = buf[ov.off + y * ov.w + x];
      if (!p) continue;
      const cx = x0 + (l.mirrored ? ov.w - 1 - x : x), cy = ov.y + y;
      if (cx < 0 || cx >= c || cy >= c) continue;
      paint(cy * c + cx, p);
    }
  }
  return { w: c, h: c, rgb, on };
}

/** { w, h, rgb, on } as { w, h, rgba }, the shape sixel.mjs scales. */
function rgbaOf({ w, h, rgb, on }) {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) if (on[i]) { rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
  return { w, h, rgba };
}

// ---- the hd gear bodies (sixel) -------------------------------------------------------------------------

const gearHd = new Map(); // slug -> { buf, pal, canvas, skins, overlays } or null

/** Forget every full-size pack read or found missing, so the next draw looks again (after a download), and
 *  the half-block art cached in their place. */
export function forgetHdArt() { forgetSixelPacks(); gearHd.clear(); cache.clear(); }

/** A body's hd file (scripts/bake-gear-art.py --hd): its palette, then the body section the small pack has
 *  for it. Version 1 (a release's 128 px bodies) holds the canvas and each x y w h in a byte, version 2 (256 px,
 *  past a byte) in a u16. Read the first time the body is drawn. */
function gearBodyHd(slug) {
  if (gearHd.has(slug)) return gearHd.get(slug);
  let body = null;
  try {
    const buf = brotliDecompressSync(readFileSync(hdArtPath(`gear-art-hd/${slug}.bin.br`)));
    const version = buf[7];
    if (buf.toString('ascii', 0, 7) === 'AZGEARB' && (version === 1 || version === 2)) {
      let off = 8;
      const n = version === 2 ? 2 : 1, num = (o) => (n === 2 ? buf.readUInt16LE(o) : buf[o]);
      const palLen = buf[off++];
      const pal = buf.subarray(off, off + palLen * 3); off += palLen * 3;
      off += 1 + buf[off]; // the slug again
      const canvas = num(off); off += n;
      body = { buf, pal, canvas, skins: new Map(), overlays: new Map() };
      const skinCount = buf[off++];
      for (let i = 0; i < skinCount; i++) { body.skins.set(buf[off], off + 1); off += 1 + canvas * canvas; }
      const ovCount = buf.readUInt16LE(off); off += 2;
      for (let i = 0; i < ovCount; i++) {
        const keyLen = buf[off++];
        const key = buf.toString('ascii', off, off + keyLen); off += keyLen;
        const x = num(off), y = num(off + n), w = num(off + 2 * n), h = num(off + 3 * n); off += 4 * n;
        body.overlays.set(key, { off, x, y, w, h });
        off += w * h;
      }
    }
  } catch { /* no hd file for this body: the half-block art draws it */ }
  gearHd.set(slug, body);
  return body;
}

// ---- drawing ------------------------------------------------------------------------------------------

/** The image cut to its drawn pixels (the whole image when nothing is drawn). */
function crop(img) {
  const { w, h, rgb, on } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (on[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return img;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, crgb = new Uint8Array(cw * ch * 3), con = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const s = (y + y0) * w + x + x0, d = y * cw + x;
    con[d] = on[s]; crgb[d * 3] = rgb[s * 3]; crgb[d * 3 + 1] = rgb[s * 3 + 1]; crgb[d * 3 + 2] = rgb[s * 3 + 2];
  }
  return { w: cw, h: ch, rgb: crgb, on: con };
}

// Area-average the image into gw x gh samples: colour from the drawn pixels, coverage from their share.
function sample(img, gw, gh) {
  const { w, h, rgb, on } = img;
  const cw = w / gw, ch = h / gh;
  const out = new Float32Array(gw * gh * 4);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const sx0 = Math.floor(gx * cw), sx1 = Math.max(sx0 + 1, Math.floor((gx + 1) * cw));
    const sy0 = Math.floor(gy * ch), sy1 = Math.max(sy0 + 1, Math.floor((gy + 1) * ch));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = sy0; y < sy1 && y < h; y++) for (let x = sx0; x < sx1 && x < w; x++) {
      const k = y * w + x;
      n++;
      if (!on[k]) continue;
      r += rgb[k * 3]; g += rgb[k * 3 + 1]; b += rgb[k * 3 + 2]; a++;
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

/** The image as half-block lines that fit `maxCols` x `maxRows` keeping its proportions; each line as wide as the art. */
function renderImage(img, maxCols, maxRows) {
  const scale = Math.min(1, maxCols / img.w, (maxRows * 2) / img.h);
  const gw = Math.max(1, Math.round(img.w * scale)), gh = Math.max(2, Math.round(img.h * scale) + 1) & ~1;
  const s = sample(img, gw, gh);
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
  return lines;
}

const cache = new Map();
const CACHE_MAX = 96;
function remember(key, lines) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, lines);
  return lines;
}

/**
 * A creature's sprite as lines of half-block cells that fit in `maxCols` x `maxRows` (keeping its
 * proportions), or null when there is no art, no colour, or no room (under 3 rows).
 */
export function creatureArt(displayId, maxCols, maxRows) {
  if (!useColor || maxCols < 2 || maxRows < 3) return null;
  const six = sixelCreature(displayId, maxCols, maxRows); // real pixels where the terminal draws sixel
  if (six) return six;
  if (sixelOn() && holdingArt()) return null; // the sixel is held back (holdNewArt): no half-block stand-in either
  const sp = spriteOf(displayId);
  if (!sp) return null;
  const key = `${displayId}|${maxCols}x${maxRows}`;
  return cache.get(key) ?? (mayMakeArt() ? remember(key, renderImage(spriteImage(sp), maxCols, maxRows)) : null);
}

/** Is there a sprite for this gameobject display id? */
export const hasObjectArt = (displayId) => useColor && !!displayId && loadGo().index.has(displayId);

/** A gameobject's sprite (a chest, an ore vein, a sign) by its GO display id, like creatureArt: the small
 *  pack's sprite, as sixel where the terminal draws it. Null without art, colour or room, or while held. */
export function objectArt(displayId, maxCols, maxRows) {
  if (!hasObjectArt(displayId) || maxCols < 2 || maxRows < 2) return null;
  const sp = spriteIn(loadGo(), displayId);
  if (sixelOn()) return sixelImage(`o${displayId}`, () => rgbaOf(spriteImage(sp)), maxCols, maxRows);
  const key = `go:${displayId}|${maxCols}x${maxRows}`;
  return cache.get(key) ?? (mayMakeArt() ? remember(key, renderImage(spriteImage(sp), maxCols, maxRows)) : null);
}

/** Width in cells of art lines (every line is the same width). */
export const artWidth = (lines) => (lines?.length ? lines[0].replace(/\x1b\[[0-9;]*m/g, '').length : 0);
