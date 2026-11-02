// Icon grids for views that draw their list side as a picture instead of rows: the paperdoll's slots round
// your body (tuiGear.mjs) and the talent trees' 4x7 nodes (tuiTalents.mjs). A grid is a canvas of one-column
// cells, each a painted character that resets after itself, so icons, frames, arrows and text can be laid
// over one another and joined into lines at the end. The view keeps its rows (detail, Enter, row keys all
// work as in a list); the grid only decides where each row is drawn and where the arrows move the cursor.
import { iconCells } from './iconArt.mjs';

const RESET = '\x1b[0m';
const SGR_RE = /\x1b\[[0-9;]*m/g;

/** A painted string split into one string per visible column, each carrying the paint open at it. */
export function splitCells(s) {
  const out = [];
  let open = '';
  const str = String(s);
  let i = 0;
  while (i < str.length) {
    if (str[i] === '\x1b') {
      SGR_RE.lastIndex = i;
      const m = SGR_RE.exec(str);
      if (m && m.index === i) { open = m[0] === RESET || m[0] === '\x1b[m' ? '' : open + m[0]; i += m[0].length; continue; }
    }
    out.push(open ? `${open}${str[i]}${RESET}` : str[i]);
    i++;
  }
  return out;
}

/** A blank canvas `w` columns by `h` lines. */
export function canvas(w, h) {
  const cells = Array.from({ length: Math.max(0, h) }, () => Array(Math.max(0, w)).fill(' '));
  const put = (x, y, c) => { if (y >= 0 && y < h && x >= 0 && x < w) cells[y][x] = c; };
  return {
    w, h, put,
    /** Painted text from (x, y), cut at `max` columns (default: the canvas edge). */
    text(x, y, s, max = w - x) { splitCells(s).slice(0, Math.max(0, max)).forEach((c, k) => put(x + k, y, c)); },
    /** Lines of art (equal widths) with their top-left at (x, y); blank art cells leave the canvas as it is. */
    art(x, y, lines) { lines.forEach((l, dy) => splitCells(l).forEach((c, dx) => { if (c !== ' ') put(x + dx, y + dy, c); })); },
    lines: () => cells.map((r) => r.join('')),
  };
}

const paint = (codes, ch) => `\x1b[${codes}m${ch}${RESET}`;
const EMPTY_BG = '48;2;34;34;38';

/**
 * One framed icon at (x, y): a column of frame each side of an `s`-wide icon (s / 2 lines), so a cell is
 * s + 2 columns. The frame is thin in `frame` (an SGR code: the item's quality, the talent's state) and
 * thick and bright when `selected`. No icon draws a dark slot with `empty` (a short label) on its middle
 * line. `badge` (a rank, a count) sits in the bottom-right corner and `mark` (an upgrade arrow) top-right,
 * each `{ text, codes }` on black.
 */
export function drawCell(cv, x, y, s, { icon, tone = '', frame = '90', selected = false, empty = '', badge = null, mark = null } = {}) {
  const rows = s / 2;
  const art = icon ? iconCells(icon, s, tone) : null;
  for (let dy = 0; dy < rows; dy++) {
    cv.put(x, y + dy, selected ? paint('1;97', '▐') : paint(frame, '▕'));
    cv.put(x + s + 1, y + dy, selected ? paint('1;97', '▌') : paint(frame, '▏'));
    for (let dx = 0; dx < s; dx++) cv.put(x + 1 + dx, y + dy, art ? art[dy][dx] : paint(EMPTY_BG, ' '));
  }
  if (!art && empty) {
    const label = empty.slice(0, s);
    const lx = x + 1 + Math.floor((s - label.length) / 2);
    [...label].forEach((ch, k) => cv.put(lx + k, y + Math.floor((rows - 1) / 2), paint(`${EMPTY_BG};38;2;110;110;118`, ch)));
  }
  const corner = (o, yy) => [...o.text].reverse().forEach((ch, k) => cv.put(x + s - k, yy, paint(`48;2;0;0;0;${o.codes}`, ch)));
  if (badge?.text) corner(badge, y + rows - 1);
  if (mark?.text) corner(mark, y);
}

/**
 * Where the cursor goes from row `cur` toward `dir` among the drawn points `{ i, x, y, g? }`, or null.
 * Up and down take the nearest point that way scored `|dy| * dyW + |dx| * dxW`, inside the same group `g`
 * when points have one (one talent tree). Left and right take the nearest point that way on the same line,
 * or up to `slack` lines off when that line has none.
 */
export function gridStep(pts, cur, dir, { dyW = 1, dxW = 10, slack = 0 } = {}) {
  const at = pts.find((p) => p.i === cur) ?? pts[0];
  if (!at) return null;
  if (at.i !== cur) return at.i;
  let best = null, bestScore = Infinity;
  for (const p of pts) {
    if (p === at) continue;
    const dx = p.x - at.x, dy = p.y - at.y;
    let score;
    if (dir === 'up' || dir === 'down') {
      if ((dir === 'up' ? -dy : dy) <= 0 || (at.g != null && p.g !== at.g)) continue;
      score = Math.abs(dy) * dyW + Math.abs(dx) * dxW;
    } else {
      if ((dir === 'left' ? -dx : dx) <= 0 || Math.abs(dy) > slack) continue;
      score = Math.abs(dy) * 100 + Math.abs(dx);
    }
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best?.i ?? null;
}
