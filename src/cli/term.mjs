// Terminal layer for the TUI. `RealTerm` owns the alternate screen, raw-mode keys and resize; `HeadlessTerm`
// has a fixed size, takes scripted keys and keeps the last frame, so the UI can be driven from a check script.
//
// Keys are decoded here rather than by readline's keypress parser: that parser cannot tell a lone Esc from
// the start of an escape sequence, so it holds Esc for half a second and, if another key lands first, folds
// both into an Alt chord. Terminals deliver a whole sequence in one read, so a chunk that is exactly ESC is
// the Esc key and is reported at once.
import { stdin, stdout } from 'node:process';
import { fit } from './text.mjs';
import { splitCells } from './iconGrid.mjs';
import { MARK_RE, imageOf, noteDeviceAttributes, noteCellSize } from './sixel.mjs';

const ESC = '\x1b[';
const MIN_COLS = 60, MIN_ROWS = 20;

const CSI_FINAL = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end', Z: 'shift-tab', P: 'f1', Q: 'f2', R: 'f3', S: 'f4' };
const CSI_TILDE = { 1: 'home', 2: 'insert', 3: 'delete', 4: 'end', 5: 'pageup', 6: 'pagedown', 7: 'home', 8: 'end', 11: 'f1', 12: 'f2', 13: 'f3', 14: 'f4', 15: 'f5', 17: 'f6', 18: 'f7', 19: 'f8', 20: 'f9', 21: 'f10', 23: 'f11', 24: 'f12' };

/** Decode one chunk of raw terminal input into key names: 'up', 'return', 'escape', 'ctrl-c', 'shift-tab', 'a', 'A', ':' ... */
export function decodeKeys(chunk) {
  const s = String(chunk);
  const keys = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\x1b') {
      const rest = s.slice(i + 1);
      // CSI: ESC [ params final
      let m = rest.match(/^\[([0-9;]*)([A-Za-z~])/);
      if (m) {
        i += 1 + m[0].length;
        const [, params, final] = m;
        if (final === '~') keys.push(CSI_TILDE[params.split(';')[0]] ?? 'unknown');
        else {
          const name = CSI_FINAL[final] ?? 'unknown';
          const mod = Number(params.split(';')[1] ?? 1);
          keys.push(mod === 2 ? `shift-${name}` : mod === 5 ? `ctrl-${name}` : mod === 3 ? `alt-${name}` : name);
        }
        continue;
      }
      // SS3: ESC O final (application cursor keys, F1-F4)
      m = rest.match(/^O([A-Za-z])/);
      if (m) { i += 1 + m[0].length; keys.push(CSI_FINAL[m[1]] ?? 'unknown'); continue; }
      // ESC + printable = Alt chord; a lone ESC (or ESC ESC) is the Esc key.
      if (rest.length && rest[0] !== '\x1b' && rest[0] >= ' ') { keys.push(`alt-${rest[0]}`); i += 2; continue; }
      keys.push('escape'); i += 1;
      continue;
    }
    i += 1;
    if (c === '\r' || c === '\n') { if (c === '\n' && s[i - 2] === '\r') continue; keys.push('return'); continue; }
    if (c === '\t') { keys.push('tab'); continue; }
    if (c === '\x7f' || c === '\b') { keys.push('backspace'); continue; }
    if (c === ' ') { keys.push('space'); continue; }
    const code = c.charCodeAt(0);
    if (code < 32) { keys.push(`ctrl-${String.fromCharCode(code + 96)}`); continue; }
    // Surrogate pairs stay one key.
    if (code >= 0xd800 && code <= 0xdbff && i < s.length) { keys.push(c + s[i]); i += 1; continue; }
    keys.push(c);
  }
  return keys;
}

export class RealTerm {
  constructor() {
    this.onKey = () => {};
    this.onResize = () => {};
    this.onSixel = () => {}; // the terminal said it draws sixel
    this.isTTY = stdout.isTTY === true && stdin.isTTY === true;
    this.last = [];
  }
  /** Layout size: never below the minimum the screens are laid out for (see `tooSmall`). */
  get cols() { return Math.max(MIN_COLS, stdout.columns || 100); }
  get rows() { return Math.max(MIN_ROWS, stdout.rows || 32); }
  get tooSmall() { return (stdout.columns || 100) < MIN_COLS || (stdout.rows || 32) < MIN_ROWS; }
  open() {
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    // Autowrap off: a line a terminal measures wider than we do (an ambiguous-width glyph) is clipped
    // instead of wrapping and scrolling the whole frame out of step with `last`.
    // Then ask what the terminal is (DA1: does it draw sixel) and its cell size in pixels (CSI 16 t); each
    // image keeps its own colour registers (?1070h).
    stdout.write(`${ESC}?1049h${ESC}?25l${ESC}?7l${ESC}H${ESC}2J${ESC}?1070h${ESC}c${ESC}16t`);
    // Ctrl-L forgets what is on screen and repaints everything, to recover from a terminal that moved it.
    // The replies to the questions above arrive as input; they are taken out before the keys are read.
    this._data = (chunk) => {
      let s = String(chunk), repaint = false;
      s = s.replace(/\x1b\[(\?[0-9;]*)c/g, (_, p) => { if (noteDeviceAttributes(p)) { repaint = true; this.onSixel(); } return ''; });
      s = s.replace(/\x1b\[6;(\d+);(\d+)t/g, (_, h, w) => { noteCellSize(+h, +w); repaint = true; return ''; });
      if (repaint) this.refresh();
      if (!s) return;
      for (const k of decodeKeys(s)) { if (k === 'ctrl-l') this.refresh(); else this.onKey(k); }
    };
    this._resize = () => this.refresh();
    stdin.on('data', this._data);
    stdout.on('resize', this._resize);
  }
  close() {
    stdin.off('data', this._data);
    stdout.off('resize', this._resize);
    stdout.write(`${ESC}0m${ESC}?7h${ESC}?25h${ESC}?1049l`);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  }
  refresh() { this.last = []; this.lastImages = []; this.onResize(); }
  /** Paint a whole frame. Lines are fitted to the width; of a changed line only the cells that changed are
   *  written, unless most of the frame changed (a new screen), which repaints it all so a stale row cannot
   *  outlive a screen change. The last column stays blank so a terminal without deferred wrap never scrolls
   *  when the bottom row is painted. Sixel placeholders (sixel.mjs) are taken out of the lines and their images
   *  sent after the text: an image that moved or went has its old rows erased, and one goes out again only when
   *  a cell written this frame lies on its pixels (text in a hole, a count on an icon, leaves it be). The frame
   *  is one synchronized update (mode 2026), so a terminal that knows it never shows the half-drawn state; one
   *  that does not ignores it. */
  draw(lines) {
    if (this.tooSmall) { this.drawTooSmall(); return; }
    const w = this.cols - 1, h = this.rows;
    const next = [], placed = new Map(); // `id@x,y` -> { id, x, y, bottom }: the same picture can stand twice
    for (let i = 0; i < h; i++) next.push(takeMarks(fit(lines[i] ?? '', w), i, placed));
    // An image goes out only when its bottom row made it to the screen: a pane that cut it short (a detail
    // pane's last rows) would otherwise have it hang over what is below. Text drawn over its upper rows (a
    // hit rising from the chest) can take a marker; the bottom row says where the image is all the same.
    const images = [...placed.values()].filter((im) => im.bottom);
    const same = (a, b) => a.id === b.id && a.x === b.x && a.y === b.y;
    const erase = new Set();
    for (const p of this.lastImages ?? []) {
      if (images.some((im) => same(im, p))) continue;
      for (let r = 0; r < (imageOf(p.id)?.rows ?? 0); r++) erase.add(p.y + r);
    }
    const changed = next.filter((line, i) => this.last[i] !== line || erase.has(i)).length;
    const full = !this.last.length || changed * 2 > h;
    // Every row is padded to the width, so only a frame with nothing known on screen needs a clear first.
    let out = this.last.length ? '' : `${ESC}0m${ESC}H${ESC}2J`;
    const wrote = new Map(); // row -> [from, to) column spans written
    next.forEach((line, i) => {
      if (full || erase.has(i)) {
        out += `${ESC}${i + 1};1H${ESC}2K${ESC}0m${line}`;
        wrote.set(i, [[0, w]]);
        return;
      }
      if (this.last[i] === line) return;
      const spans = changedSpans(this.last[i], line);
      for (const [from, to, text] of spans) out += `${ESC}${i + 1};${from + 1}H${ESC}0m${text}`;
      wrote.set(i, spans);
    });
    for (const im of images) {
      const img = imageOf(im.id);
      const known = (this.lastImages ?? []).some((p) => same(im, p));
      if (!known || covers(img, im, wrote)) out += `${ESC}${im.y + 1};${im.x + 1}H${img.sixel}`;
    }
    this.last = next;
    this.lastImages = images;
    if (out) stdout.write(`${ESC}?2026h${out}${ESC}?2026l`);
  }
  /** The screens need MIN_COLS x MIN_ROWS; a smaller terminal gets a notice instead of a frame drawn off its edge. */
  drawTooSmall() {
    const c = stdout.columns || 100, r = stdout.rows || 32;
    const msg = [`Terminal is ${c}x${r}.`, `azsh needs at least ${MIN_COLS}x${MIN_ROWS}.`, 'Make the window larger.'];
    const top = Math.max(0, Math.floor((r - msg.length) / 2));
    let out = `${ESC}0m${ESC}H${ESC}2J`;
    msg.forEach((m, i) => { if (top + i < r) out += `${ESC}${top + i + 1};${Math.max(1, Math.floor((c - m.length) / 2) + 1)}H${m.slice(0, c)}`; });
    this.last = [];
    stdout.write(out);
  }
  /** Delay helper for real-time loops. */
  setInterval(fn, ms) { return setInterval(fn, ms); }
  clearInterval(h) { clearInterval(h); }
}

/** The runs of cells that differ between two painted lines of one width, as [from, to, text]: `text` paints
 *  columns from..to-1 of `line`, each cell carrying its own paint. */
export function changedSpans(prev, line) {
  const a = splitCells(prev ?? ''), b = splitCells(line);
  const spans = [];
  for (let x = 0; x < b.length; x++) {
    if (a[x] === b[x]) continue;
    let end = x + 1;
    while (end < b.length && a[end] !== b[end]) end++;
    spans.push([x, end, b.slice(x, end).join('')]);
    x = end;
  }
  return spans;
}

/** Does a written span lie on the pixels of image `img` placed at `im` (a hole's cells are no pixels)? */
function covers(img, im, wrote) {
  for (let r = 0; r < img.rows; r++) {
    for (const [from, to] of wrote.get(im.y + r) ?? []) {
      for (let x = Math.max(from, im.x); x < Math.min(to, im.x + img.cols); x++) {
        const cx = x - im.x;
        if (!img.holes.some((h) => h.y === r && cx >= h.x && cx < h.x + h.w)) return true;
      }
    }
  }
  return false;
}

/** `line` without its sixel markers; each marker found notes a placement's top-left cell in `placed` (a row's
 *  marker sits at the image's left edge, and its row number says how far down the image the line is). */
export function takeMarks(line, y, placed) {
  if (!line.includes('\x1b[9999;')) return line;
  let out = '', col = 0, i = 0;
  for (const m of line.matchAll(MARK_RE)) {
    const before = line.slice(i, m.index);
    out += before;
    col += before.replace(/\x1b\[[0-9;]*m/g, '').length;
    const id = +m[1], row = +m[2], img = imageOf(id);
    if (img) {
      const at = `${id}@${col},${y - row}`;
      const p = placed.get(at) ?? { id, x: col, y: y - row, bottom: false };
      if (row === img.rows - 1) p.bottom = true;
      placed.set(at, p);
    }
    i = m.index + m[0].length;
  }
  return out + line.slice(i);
}

export class HeadlessTerm {
  constructor(cols = 100, rows = 32) {
    this.cols = cols; this.rows = rows;
    this.onKey = () => {};
    this.onResize = () => {};
    this.frame = [];
    this.frames = 0;
    this.isTTY = false;
  }
  open() {}
  close() {}
  draw(lines) { this.frame = lines.slice(0, this.rows).map((l, i) => takeMarks(fit(l ?? '', this.cols), i, new Map())); this.frames++; }
  /** Feed keys one at a time, as `decodeKeys` would produce them. */
  press(...keys) { for (const k of keys) this.onKey(k); }
  /** Type a string as individual character keys, then Enter. */
  type(text) { for (const ch of text) this.onKey(ch === ' ' ? 'space' : ch); this.onKey('return'); }
  text() { return this.frame.map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+$/, '')).join('\n'); }
  // Headless loops do not run on timers: the check script steps them by hand through app hooks.
  setInterval() { return null; }
  clearInterval() {}
}
