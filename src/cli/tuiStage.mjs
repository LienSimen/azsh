// The stage under a fight: a canvas of W x H cells that sprites, plates, numbers and bars are drawn onto
// at a column and a row, instead of a list of frames. The duel (tuiFight duelStage) places you down the
// left and the foe down the right; the dungeon room and the pack are meant to be more actor lists through
// the same canvas. Sizes come from the design page: a sprite's box says its rank, and the terminal's
// width says which boxes it can afford.
import { vis, cut, useColor } from './text.mjs';

const RESET = '\x1b[0m';

/** Sprite boxes, columns x rows: a pack add or a pet, dungeon trash, a normal foe, you or an elite, a boss. */
export const SIZES = { xs: [10, 5], s: [14, 7], m: [20, 10], l: [28, 14], xl: [40, 22] };

/** The box your own sprite gets at this width: large from 140 columns, medium from 110, a bust under that. */
export const youSize = (W) => (W >= 140 ? 'l' : W >= 110 ? 'm' : 'xs');

/** The foe's box by creature rank (0 normal, 1 elite, 2 rare elite, 3 boss, 4 rare) and the width:
 *  a normal foe is medium, an elite or rare large, a boss the largest thing on screen. */
export function foeSize(W, rank = 0) {
  const byRank = rank === 3 ? 'xl' : rank > 0 ? 'l' : 'm';
  if (W >= 140) return byRank;
  if (W >= 110) return byRank === 'xl' ? 'l' : byRank;
  return 'm';
}

/** The word a rank prints after the level on a plate; nothing for a normal creature. */
export const RANK_WORD = { 1: 'elite', 2: 'rare elite', 3: 'boss', 4: 'rare' };

/** A blank canvas: H lines of W spaces. */
export const canvas = (W, H) => Array.from({ length: Math.max(0, H) }, () => ' '.repeat(W));

/** The painted string without its first `n` visible characters; the colour codes among them stay, so the
 *  rest keeps the colour it was in. */
export function dropVisible(s, n) {
  let i = 0, seen = 0;
  while (i < s.length && seen < n) {
    if (s[i] === '\x1b') { const m = s.slice(i).match(/^\x1b\[[0-9;]*m/); if (m) { i += m[0].length; continue; } }
    i++; seen++;
  }
  return s.slice(i);
}

/** `line` with `text` drawn over it from visible column `x`. The line keeps its width: text past the
 *  right edge is cut, and a negative x cuts the text's left. Half-block art cells are self-contained
 *  (each resets), so drawing over a sprite leaves the cells around the text intact. */
export function overlay(line, x, text) {
  const w = vis(line);
  if (x < 0) { text = dropVisible(text, -x); x = 0; }
  const tw = Math.min(vis(text), w - x);
  if (tw <= 0) return line;
  if (vis(text) > tw) text = cut(text, tw);
  const head = cut(line, x), pad = ' '.repeat(Math.max(0, x - vis(head)));
  const tail = dropVisible(line, x + tw);
  return `${head}${pad}${text}${useColor ? RESET : ''}${tail}`;
}

/** Draw `text` at (x, y) on the canvas; nothing when y is off it. */
export function put(c, x, y, text) {
  if (y < 0 || y >= c.length || !text) return;
  c[y] = overlay(c[y], x, text);
}

/** Draw `lines` down from (x, y). */
export function putLines(c, x, y, lines) {
  for (let i = 0; i < lines.length; i++) put(c, x, y + i, lines[i]);
}

/** Draw `text` so that its right edge sits at column `right`. */
export function putRight(c, right, y, text) {
  put(c, right - vis(text), y, text);
}

/** Draw `text` centred on column `mid`. */
export function putCentred(c, mid, y, text) {
  put(c, Math.round(mid - vis(text) / 2), y, text);
}

/** The ground line: a dark run of low blocks with a bump every so often, so the stage has a floor. */
export function floorLine(W, paint) {
  if (process.env.AZSH_ASCII) return paint('_'.repeat(W));
  let s = '';
  for (let x = 0; x < W; x++) s += (x * 7) % 23 === 5 ? '▂' : '▁';
  return paint(s);
}
