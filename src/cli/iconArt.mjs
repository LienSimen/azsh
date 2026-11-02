// Spell and item icons for the windowed game, drawn as truecolour half-block cells like the model art
// (modelArt.mjs): a cell is ▀ with the top pixel in the foreground and the bottom one in the background.
// The pack src/data/icon-art.bin.gz (scripts/bake-icon-art.mjs) holds every icon the spells, items,
// talents and professions name at three sizes a pixel each: 8x8 (4 lines, a detail pane), 6x6 (3 lines, a
// bag grid or an ability bar) and 4x4 (2 lines, a list row or an aura strip). Icons are keyed by the icon
// name the tables carry (`spell_holy_holysmite`, `inv_ore_truesilver_01`). No pack, or NO_COLOR: no art,
// never an error.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { useColor, vis, wrapLines } from './text.mjs';
import { sixelIconCells, sixelOn } from './sixel.mjs';

const PACK_URL = new URL('../data/icon-art.bin.gz', import.meta.url);
const SIZES = [8, 6, 4];
const BYTES = SIZES.map((g) => g * g * 3);
const RECORD = BYTES.reduce((a, b) => a + b, 0);

let index = null; // name -> byte offset of the 8x8 square
let pack = null;

function load() {
  if (index) return index;
  index = new Map();
  try {
    pack = gunzipSync(readFileSync(PACK_URL));
    if (pack.toString('ascii', 0, 5) !== 'AZICO' || pack[5] !== 1) return index;
    const count = pack.readUInt32LE(6);
    let off = 10;
    for (let i = 0; i < count && off < pack.length; i++) {
      const len = pack[off];
      index.set(pack.toString('ascii', off + 1, off + 1 + len), off + 1 + len);
      off += 1 + len + RECORD;
    }
  } catch { pack = null; }
  return index;
}

/** Are icons drawable at all (colour on and the pack present)? Cheap once loaded. */
export const iconsOn = () => useColor && load().size > 0;

/** Is there art for this icon name? */
export const hasIcon = (name) => !!name && useColor && load().has(String(name).toLowerCase());

/** Lines an icon of `cols` pixels a side takes: 4, 3 or 2. */
export const iconRows = (cols) => cols / 2;

const RESET = '\x1b[0m';
const cache = new Map();
const CACHE_MAX = 768;

/**
 * The icon `name` as `cols / 2` rows of `cols` cells, each cell a self-contained painted ▀ (it resets after
 * itself), or null when there is no art. `tone` 'gray' draws it desaturated and dark: a talent you cannot
 * take yet. A grid (iconGrid.mjs) lays cells one by one so it can paint a rank or a count over a corner;
 * where the terminal draws sixel the icon is a picture instead (sixel.mjs), and `holes` ([{ x, y, w }] in
 * cells) are the corners it leaves see-through for that text.
 */
export function iconCells(name, cols = 4, tone = '', holes = []) {
  if (!name || !useColor) return null;
  const six = sixelIconCells(name, cols, tone, holes);
  if (six) return six;
  const key = `${String(name).toLowerCase()}|${cols}|${tone}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const sz = SIZES.indexOf(cols);
  const off = load().get(String(name).toLowerCase());
  let rows = null;
  if (off != null && sz >= 0) {
    let start = off;
    for (let i = 0; i < sz; i++) start += BYTES[i];
    const px = (k) => {
      const r = pack[k], g = pack[k + 1], b = pack[k + 2];
      if (tone !== 'gray') return `${r};${g};${b}`;
      const l = Math.round((0.3 * r + 0.59 * g + 0.11 * b) * 0.6);
      return `${l};${l};${l}`;
    };
    rows = [];
    for (let y = 0; y < cols; y += 2) {
      const row = [];
      for (let x = 0; x < cols; x++) row.push(`\x1b[38;2;${px(start + (y * cols + x) * 3)}m\x1b[48;2;${px(start + ((y + 1) * cols + x) * 3)}m▀${RESET}`);
      rows.push(row);
    }
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, rows);
  return rows;
}

/**
 * The icon `name` as `cols / 2` lines of `cols` half-block cells (cols 8, 6 or 4), or null when there is no
 * art. Each line resets at its end, so it can sit inside any painted text.
 */
export function iconArt(name, cols = 4, tone = '') {
  return iconCells(name, cols, tone)?.map((row) => row.join('')) ?? null;
}

/**
 * A one-line icon two cells wide and a space, to lead a line of text in a list (what someone wears, a
 * quest's rewards). Only where the terminal draws sixel: as half-block cells it would be a smudge of colour,
 * so there it is ''. A name with no art keeps the column with blanks.
 */
export function miniIcon(name) {
  if (!sixelOn()) return '';
  return `${iconArt(name, 2)?.[0] ?? '  '} `;
}

/** A blank the size of an icon, for rows in a list that mixes icons and none. */
export const iconBlank = (cols = 4) => Array.from({ length: cols / 2 }, () => ' '.repeat(cols));

/**
 * `lines` with the icon beside their head: the first `cols / 2` lines get an icon cell row and a space
 * before them (the name, the kind, the first facts), the rest run on at full width. Without art the lines
 * come back as they are. The result remembers its parts (`iconHead`) so a pane can wrap it with
 * wrapIconLines and keep the text beside the icon instead of wrapping under it.
 */
export function withIcon(name, lines, cols = 8) {
  const art = iconArt(name, cols);
  if (!art) return lines;
  const out = [];
  for (let i = 0; i < Math.max(art.length, lines.length); i++) out.push(i < art.length ? `${art[i]} ${lines[i] ?? ''}` : lines[i]);
  out.iconHead = { art, lines };
  return out;
}

/**
 * Detail lines wrapped to `width`. Beside an icon (a withIcon result) the text wraps to the room right of
 * it, so a long first sentence never runs back under the art; once the icon's rows are used the rest of
 * that sentence and every later line take the full width.
 */
export function wrapIconLines(lines, width) {
  const wrap = (l, w) => (vis(l) > w ? wrapLines(l, w) : [l]);
  const head = lines?.iconHead;
  if (!head) return (lines ?? []).flatMap((l) => wrap(l, width));
  const { art, lines: text } = head;
  const beside = width - vis(art[0]) - 1;
  const out = [];
  for (const l of text) {
    if (out.length >= art.length) { out.push(...wrap(l, width)); continue; }
    const pieces = wrap(l, beside);
    while (pieces.length && out.length < art.length) out.push(`${art[out.length]} ${pieces.shift()}`);
    if (pieces.length) out.push(...wrap(pieces.join(' '), width));
  }
  while (out.length < art.length) out.push(art[out.length]);
  return out;
}
