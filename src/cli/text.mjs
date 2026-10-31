// Text helpers shared by the line REPL and the windowed TUI: quest text codes, wrapping, fuzzy
// picking, ANSI colour and visible-width maths. Nothing here touches game state.
import { className, raceName } from '../domain/core/ids.ts';

export const useColor = !process.env.NO_COLOR;
const sgr = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const dim = sgr(2), bold = sgr(1), inverse = sgr(7), underline = sgr(4);
export const red = sgr(31), green = sgr(32), yellow = sgr(33), blue = sgr(34), magenta = sgr(35), cyan = sgr(36), white = sgr(37), gray = sgr(90);
export const brightRed = sgr(91), brightGreen = sgr(92), brightYellow = sgr(93), brightBlue = sgr(94), brightMagenta = sgr(95), brightCyan = sgr(96);
export const bgBlue = sgr(44), bgGray = sgr(100), bgRed = sgr(41);
/** 256-colour orange: the recipe difficulty that always grants a skill point. */
export const orange = sgr('38;5;208');

export const QUALITY = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'artifact'];
const QUALITY_PAINT = [gray, white, green, brightBlue, brightMagenta, brightYellow, brightYellow];
/** An item name in its 1.12 quality colour. */
export function qualityPaint(quality) { return QUALITY_PAINT[quality ?? 1] ?? white; }

const GENDER_TOKEN = /\$[Gg]\s*([^:]*):([^;]*);/g;
/** $N name, $C class, $R race, $B break, $G male:female; (SharedDefines.h:26). Same codes as phonecraft questText. */
export function questText(raw, ch) {
  return String(raw ?? '')
    .replace(GENDER_TOKEN, (_m, male, female) => (ch.gender === 1 ? female : male))
    .replace(/\$[Bb]/g, '\n')
    .replace(/\$[Nn]/g, () => ch.name)
    .replace(/\$[Cc]/g, () => className(ch.cls))
    .replace(/\$[Rr]/g, () => raceName(ch.race));
}

/** Wrap plain text to `width` visible columns; returns lines (no indent). Blank lines are kept. */
export function wrapLines(text, width) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if (line && vis(line) + 1 + vis(w) > width) { out.push(line); line = w; }
      else line = line ? `${line} ${w}` : w;
    }
    out.push(line);
  }
  return out;
}

/** Match `q` against a list: a number is an id, otherwise exact name, then prefix, then substring. */
export function pick(list, q, nameOf, idOf) {
  const query = String(q ?? '').trim().toLowerCase();
  if (!query) return { many: list };
  if (/^\d+$/.test(query)) {
    const hit = list.find((x) => idOf(x) === Number(query));
    return hit ? { one: hit } : { none: true };
  }
  const named = list.filter((x) => nameOf(x));
  const exact = named.filter((x) => nameOf(x).toLowerCase() === query);
  if (exact.length === 1) return { one: exact[0] };
  const prefix = named.filter((x) => nameOf(x).toLowerCase().startsWith(query));
  if (prefix.length === 1) return { one: prefix[0] };
  const sub = named.filter((x) => nameOf(x).toLowerCase().includes(query));
  if (sub.length === 1) return { one: sub[0] };
  if (sub.length === 0) return { none: true };
  return { many: sub };
}

const SGR_RE = /\x1b\[[0-9;]*m/g;
/** Visible column count (SGR sequences stripped). Wide glyphs are not used in this UI. */
export function vis(s) { return String(s).replace(SGR_RE, '').length; }
export function strip(s) { return String(s).replace(SGR_RE, ''); }

/** Cut `s` to at most `w` visible columns, keeping colour codes, and reset at the end. */
export function cut(s, w) {
  s = String(s);
  if (vis(s) <= w) return s;
  let out = '', n = 0, i = 0;
  while (i < s.length && n < w) {
    if (s[i] === '\x1b') {
      const m = s.slice(i).match(/^\x1b\[[0-9;]*m/);
      if (m) { out += m[0]; i += m[0].length; continue; }
    }
    out += s[i]; i++; n++;
  }
  return out + (useColor ? '\x1b[0m' : '');
}

/** Exactly `w` visible columns: cut or pad with spaces on the right (or left when `right`). */
export function fit(s, w, right = false) {
  s = cut(s, w);
  const pad = ' '.repeat(Math.max(0, w - vis(s)));
  return right ? pad + s : s + pad;
}

/** A horizontal gauge. `paint` colours the filled part. */
export function bar(cur, max, width, paint = green) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  const filled = Math.round(ratio * width);
  const glyphs = process.env.AZSH_ASCII ? ['#', '-'] : ['█', '░'];
  return paint(glyphs[0].repeat(filled)) + dim(glyphs[1].repeat(width - filled));
}

export function pct(cur, max) { return max > 0 ? Math.round((cur / max) * 100) : 0; }

export function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

export function secondsText(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
