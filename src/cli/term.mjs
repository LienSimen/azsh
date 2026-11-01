// Terminal layer for the TUI. `RealTerm` owns the alternate screen, raw-mode keys and resize; `HeadlessTerm`
// has a fixed size, takes scripted keys and keeps the last frame, so the UI can be driven from a check script.
//
// Keys are decoded here rather than by readline's keypress parser: that parser cannot tell a lone Esc from
// the start of an escape sequence, so it holds Esc for half a second and, if another key lands first, folds
// both into an Alt chord. Terminals deliver a whole sequence in one read, so a chunk that is exactly ESC is
// the Esc key and is reported at once.
import { stdin, stdout } from 'node:process';
import { fit } from './text.mjs';

const ESC = '\x1b[';

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
    this.isTTY = stdout.isTTY === true && stdin.isTTY === true;
    this.last = [];
  }
  get cols() { return Math.max(60, stdout.columns || 100); }
  get rows() { return Math.max(20, stdout.rows || 32); }
  open() {
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdout.write(`${ESC}?1049h${ESC}?25l${ESC}H${ESC}2J`);
    this._data = (chunk) => { for (const k of decodeKeys(chunk)) this.onKey(k); };
    this._resize = () => { this.last = []; this.onResize(); };
    stdin.on('data', this._data);
    stdout.on('resize', this._resize);
  }
  close() {
    stdin.off('data', this._data);
    stdout.off('resize', this._resize);
    stdout.write(`${ESC}?25h${ESC}?1049l`);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  }
  /** Paint a whole frame. Lines are fitted to the width; unchanged lines are skipped. The last column stays
   *  blank so a terminal without deferred wrap never scrolls the frame when the bottom row is painted. */
  draw(lines) {
    const w = this.cols - 1, h = this.rows;
    let out = '';
    const next = [];
    for (let i = 0; i < h; i++) {
      const line = fit(lines[i] ?? '', w);
      next.push(line);
      if (this.last[i] === line) continue;
      out += `${ESC}${i + 1};1H${ESC}0m${line}`;
    }
    this.last = next;
    if (out) stdout.write(out);
  }
  /** Delay helper for real-time loops. */
  setInterval(fn, ms) { return setInterval(fn, ms); }
  clearInterval(h) { clearInterval(h); }
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
  draw(lines) { this.frame = lines.slice(0, this.rows).map((l) => fit(l ?? '', this.cols)); this.frames++; }
  /** Feed keys one at a time, as `decodeKeys` would produce them. */
  press(...keys) { for (const k of keys) this.onKey(k); }
  /** Type a string as individual character keys, then Enter. */
  type(text) { for (const ch of text) this.onKey(ch === ' ' ? 'space' : ch); this.onKey('return'); }
  text() { return this.frame.map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+$/, '')).join('\n'); }
  // Headless loops do not run on timers: the check script steps them by hand through app hooks.
  setInterval() { return null; }
  clearInterval() {}
}
