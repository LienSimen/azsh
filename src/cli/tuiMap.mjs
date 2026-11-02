// The world map on the Travel tab: phonecraft's combined Azeroth terrain map (the picture every zone's
// `mapPos` is measured on; scripts/bake-world-map.mjs) drawn in the detail pane with pins for where you
// stand, the zone under the cursor and the route a journey takes between them. On the road the pin walks its
// leg. Two packs, like the creature art: src/data/world-map.bin.gz as truecolour half-block cells (two map
// pixels a row), or src/data/world-map-sixel.bin.br as the terminal's own pixels where it draws sixel
// (sixel.mjs). No pack, no colour, or no room: no map, never an error.
import { readFileSync } from 'node:fs';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { useColor, cyan, yellow, dim, vis } from './text.mjs';
import { sixelImage, sixelOn, cellSize } from './sixel.mjs';

const SMALL_URL = new URL('../data/world-map.bin.gz', import.meta.url);
const SIXEL_URL = new URL('../data/world-map-sixel.bin.br', import.meta.url);

// ---- the packs ----------------------------------------------------------------------------------------

/** A pack as { w, h, pal, idx } (a palette index per pixel, every pixel drawn), or null. */
function parse(buf) {
  if (buf.toString('ascii', 0, 5) !== 'AZMAP' || buf[5] !== 1) return null;
  const w = buf.readUInt16LE(6), h = buf.readUInt16LE(8), palLen = buf[10], palEnd = 11 + palLen * 3;
  const idx = buf.subarray(palEnd, palEnd + w * h);
  return idx.length === w * h ? { w, h, pal: buf.subarray(11, palEnd), idx } : null;
}

let small, big; // undefined: not read yet; null: not there
function smallMap() {
  if (small === undefined) { try { small = parse(gunzipSync(readFileSync(SMALL_URL))); } catch { small = null; } }
  return small;
}
function sixelMap() {
  if (big === undefined) { try { big = parse(brotliDecompressSync(readFileSync(SIXEL_URL))); } catch { big = null; } }
  return big;
}

/** Is there a map to draw? */
export const hasWorldMap = () => useColor && !!smallMap();

/** The map area-averaged to tw x th, as packed rgb. */
function resample(m, tw, th) {
  const out = new Uint8Array(tw * th * 3), sx = m.w / tw, sy = m.h / th;
  for (let ty = 0; ty < th; ty++) {
    const y0 = Math.floor(ty * sy), y1 = Math.max(y0 + 1, Math.floor((ty + 1) * sy));
    for (let tx = 0; tx < tw; tx++) {
      const x0 = Math.floor(tx * sx), x1 = Math.max(x0 + 1, Math.floor((tx + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1 && y < m.h; y++) for (let x = x0; x < x1 && x < m.w; x++) {
        const p = m.idx[y * m.w + x] * 3;
        r += m.pal[p]; g += m.pal[p + 1]; b += m.pal[p + 2]; n++;
      }
      if (!n) continue;
      const d = (ty * tw + tx) * 3;
      out[d] = r / n; out[d + 1] = g / n; out[d + 2] = b / n;
    }
  }
  return out;
}

// ---- what to pin -----------------------------------------------------------------------------------------

/**
 * The pins in map fractions (0..1 from the top-left, a zone's `mapPos`): `you`, walking its leg when a journey
 * is under way; `dest`, the zone under the cursor (a journey's destination when none is given); `route`, the
 * zones the trip passes after you, in order. `legs` is a travel preview's plan (or any list of { to }); a
 * journey under way brings its own legs.
 */
function marks(app, dest, legs) {
  const ds = app.ds, pos = (id) => ds.zone(id)?.mapPos ?? null;
  const st = app.g.state.char.journey ? app.g.journeyStatus() : null;
  let you = pos(app.ch.zoneId);
  if (st) {
    const i = st.progress.legIndex, leg = st.legs[i];
    const a = leg ? pos(leg.from) : null, b = leg ? pos(leg.to) : null;
    const t = leg?.seconds > 0 ? Math.min(1, Math.max(0, st.progress.legElapsedSeconds / leg.seconds)) : 1;
    // Snapped to 1/250 of the map, so a tick that moves the pin under a pixel does not redraw (or re-encode) it.
    you = a && b ? [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t].map((v) => Math.round(v * 250) / 250) : b ?? a ?? you;
    legs = st.legs.slice(i);
    dest ??= ds.zone(st.destination);
  }
  const route = [];
  for (const l of legs ?? []) { const p = pos(l.to); if (p) route.push(p); }
  return { you, dest: dest?.mapPos ?? null, route };
}

const at3 = (p) => (p ? `${p[0].toFixed(3)},${p[1].toFixed(3)}` : '-');

// ---- half-block cells -------------------------------------------------------------------------------------

const RESET = '\x1b[0m';
const YOU = { glyph: '●', rgb: '255;210;60' }, DEST = { glyph: '◆', rgb: '90;220;255' }, ROUTE = { glyph: '·', rgb: '255;240;190' };

/** The cells a straight line crosses between two cells (Bresenham), both ends included. */
function lineCells([x0, y0], [x1, y1]) {
  const out = [], dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** The map as half-block lines that fit maxCols x maxRows keeping its proportions, the pins as glyphs on
 *  their cells (the cell's own colour behind them). */
function halfBlockLines(m, mk, maxCols, maxRows) {
  const scale = Math.min(maxCols / m.w, (maxRows * 2) / m.h);
  const gw = Math.max(2, Math.round(m.w * scale)), gh = Math.max(2, Math.round(m.h * scale) + 1) & ~1, rows = gh / 2;
  const s = resample(m, gw, gh);
  const cell = (p) => [Math.min(gw - 1, Math.floor(p[0] * gw)), Math.min(rows - 1, Math.floor(p[1] * rows))];
  const over = new Map();
  const pts = [mk.you, ...mk.route].filter(Boolean).map(cell);
  for (let i = 0; i + 1 < pts.length; i++) for (const c of lineCells(pts[i], pts[i + 1])) over.set(c.join(), ROUTE);
  if (mk.dest) over.set(cell(mk.dest).join(), DEST);
  if (mk.you) over.set(cell(mk.you).join(), YOU);
  const lines = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < gw; x++) {
      const t = (y * 2 * gw + x) * 3, u = ((y * 2 + 1) * gw + x) * 3, o = over.get(`${x},${y}`);
      if (o) line += `\x1b[38;2;${o.rgb}m\x1b[48;2;${(s[t] + s[u]) >> 1};${(s[t + 1] + s[u + 1]) >> 1};${(s[t + 2] + s[u + 2]) >> 1}m${o.glyph}${RESET}`;
      else line += `\x1b[38;2;${s[t]};${s[t + 1]};${s[t + 2]}m\x1b[48;2;${s[u]};${s[u + 1]};${s[u + 2]}m▀${RESET}`;
    }
    lines.push(line);
  }
  return lines;
}

const cache = new Map();
const CACHE_MAX = 48;
function remember(key, lines) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, lines);
  return lines;
}

// ---- sixel pixels ------------------------------------------------------------------------------------------

const fitted = new Map(); // `${w}|${tw}x${th}` -> the map resampled to that size, kept for the next pin move
const FIT_MAX = 4;

/** The pins painted on the fitted map: a dashed route, a cyan diamond at the destination, a gold disc on you,
 *  each with a dark rim so it reads on any terrain. Sizes follow the picture's width. */
function paintPixels(base, tw, th, mk) {
  const rgba = new Uint8Array(tw * th * 4);
  for (let i = 0; i < tw * th; i++) { rgba[i * 4] = base[i * 3]; rgba[i * 4 + 1] = base[i * 3 + 1]; rgba[i * 4 + 2] = base[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < tw && y < th) { const d = (y * tw + x) * 4; rgba[d] = c[0]; rgba[d + 1] = c[1]; rgba[d + 2] = c[2]; } };
  const disc = (cx, cy, r, c) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, c); };
  const diamond = (cx, cy, r, c) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.abs(x - cx) + Math.abs(y - cy) <= r) put(x, y, c); };
  const DARK = [24, 20, 16], r = Math.max(3, tw / 90), px = (p) => [p[0] * tw, p[1] * th];
  const pts = [mk.you, ...mk.route].filter(Boolean).map(px);
  const dash = r * 2.2, gap = r * 1.6;
  for (const [rad, c] of [[r / 2.6 + 1, DARK], [r / 2.6, [255, 240, 190]]]) {
    let along = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], len = Math.hypot(x1 - x0, y1 - y0);
      for (let d = 0; d <= len; d++) if ((along + d) % (dash + gap) < dash) disc(x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len, rad, c);
      along += len;
    }
  }
  if (mk.dest) { const [x, y] = px(mk.dest); diamond(x, y, r * 1.5 + 1.5, DARK); diamond(x, y, r * 1.5, [90, 220, 255]); }
  if (mk.you) { const [x, y] = px(mk.you); disc(x, y, r + 1.5, DARK); disc(x, y, r, [255, 210, 60]); disc(x, y, r / 3, DARK); }
  return rgba;
}

/** The map as sixel placeholder lines (sixel.mjs) fitted to maxCols x maxRows, or null when sixel is off. */
function sixelLines(m, mk, key, maxCols, maxRows) {
  if (!sixelOn()) return null;
  const { w: cw, h: ch } = cellSize();
  const scale = Math.min((maxCols * cw) / m.w, (maxRows * ch) / m.h);
  const tw = Math.max(1, Math.round(m.w * scale)), th = Math.max(1, Math.round(m.h * scale));
  return sixelImage(`map|${m.w}|${tw}x${th}|${key}`, () => {
    const fitKey = `${m.w}|${tw}x${th}`;
    let base = fitted.get(fitKey);
    if (!base) {
      if (fitted.size >= FIT_MAX) fitted.delete(fitted.keys().next().value);
      fitted.set(fitKey, (base = resample(m, tw, th)));
    }
    return { w: tw, h: th, rgba: paintPixels(base, tw, th, mk) };
  }, maxCols, maxRows);
}

// ---- the lines a pane draws ---------------------------------------------------------------------------------

/**
 * The world map for a detail pane, as lines no wider than `maxCols` and no more than `maxRows` of them (the
 * last a legend): you pinned where you stand, `dest` (a zone) pinned if given, the `legs` of a planned trip
 * (or the journey under way) drawn as a route. Null without colour, a pack, a position, or room.
 */
export function worldMapLines(app, { dest = null, legs = null, maxCols, maxRows } = {}) {
  if (!useColor || !(maxCols >= 10) || !(maxRows >= 6)) return null;
  const m = smallMap();
  if (!m) return null;
  const mk = marks(app, dest, legs);
  if (!mk.you && !mk.dest) return null;
  const key = [mk.you, mk.dest, ...mk.route].map(at3).join('|');
  const rows = maxRows - 1;
  let art = sixelLines(sixelMap() ?? m, mk, key, maxCols, rows);
  if (!art) {
    const ck = `${maxCols}x${rows}|${key}`;
    art = cache.get(ck) ?? remember(ck, halfBlockLines(m, mk, maxCols, rows));
  }
  const legend = `${yellow(YOU.glyph)} you${mk.dest ? `  ${cyan(DEST.glyph)} destination` : ''}${mk.route.length ? dim('  ┄ route') : ''}`;
  return [...art, legend];
}

/** `lines` with the map under them, as large as the detail pane has room for; `lines` alone when there is none. */
export function withWorldMap(app, lines, opts = {}) {
  const L = app.layout?.();
  if (!L || !(L.detailW > 2)) return lines;
  const w = L.detailW - 2, used = lines.reduce((n, l) => n + Math.max(1, Math.ceil(vis(l) / w)), 0);
  const map = worldMapLines(app, { ...opts, maxCols: w, maxRows: L.mainH - used - 1 });
  return map ? [...lines, '', ...map] : lines;
}
