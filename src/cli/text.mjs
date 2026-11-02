// Text helpers shared by the line REPL and the windowed TUI: quest text codes, wrapping, fuzzy
// picking, ANSI colour and visible-width maths. Nothing here touches game state.
import { className, raceName } from '../domain/core/ids.ts';

export const useColor = !process.env.NO_COLOR;
// A reset inside the painted text (a coloured item name in a green sentence) re-opens this paint,
// so the rest of the sentence keeps its colour.
const sgr = (code) => (s) => (useColor ? `\x1b[${code}m${String(s).replace(/\x1b\[0m/g, `\x1b[0m\x1b[${code}m`)}\x1b[0m` : String(s));
export const dim = sgr(2), bold = sgr(1), inverse = sgr(7), underline = sgr(4);
export const red = sgr(31), green = sgr(32), yellow = sgr(33), blue = sgr(34), magenta = sgr(35), cyan = sgr(36), white = sgr(37), gray = sgr(90);
export const brightRed = sgr(91), brightGreen = sgr(92), brightYellow = sgr(93), brightBlue = sgr(94), brightMagenta = sgr(95), brightCyan = sgr(96);
export const bgBlue = sgr(44), bgGray = sgr(100), bgRed = sgr(41);
/** 256-colour orange: the recipe difficulty that always grants a skill point. */
export const orange = sgr('38;5;208');

export const QUALITY = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'artifact'];
// The client's item quality colours (24-bit): grey poor, white common, green uncommon, blue rare,
// purple epic, orange legendary, light gold artifact.
const QUALITY_RGB = [[157, 157, 157], [255, 255, 255], [30, 255, 0], [0, 112, 221], [163, 53, 238], [255, 128, 0], [230, 204, 128]];
const QUALITY_PAINT = QUALITY_RGB.map(([r, g, b]) => sgr(`38;2;${r};${g};${b}`));
/** The quality colour as a bare SGR code, for a painter that builds its own escapes (an icon frame). */
export function qualityCodes(quality) { const [r, g, b] = QUALITY_RGB[quality ?? 1] ?? QUALITY_RGB[1]; return `38;2;${r};${g};${b}`; }
/** An item name in its 1.12 quality colour. */
export function qualityPaint(quality) { return QUALITY_PAINT[quality ?? 1] ?? white; }
/** An item record's name in its quality colour; `fallback` when the record is missing. */
export function itemText(it, fallback = 'item') { return qualityPaint(it?.quality)(it?.name ?? fallback); }

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
  // A paint still open at a break is closed there and re-opened on the next line, so a wrapped dim
  // sentence neither bleeds into the screen row below nor loses its colour after the break.
  if (!useColor) return out;
  let open = '';
  return out.map((l) => {
    const line = open + l;
    for (const m of l.match(SGR_RE) ?? []) open = m === '\x1b[0m' || m === '\x1b[m' ? '' : open + m;
    return open ? `${line}\x1b[0m` : line;
  });
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
