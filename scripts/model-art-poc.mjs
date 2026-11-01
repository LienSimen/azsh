// Proof of concept: a WoW model render (PNG/JPG/WebP) -> terminal cell art.
// Usage: node art.mjs <image> [--cols 32] [--mode half|braille|ascii|plain] [--out file]
// Decodes via ffmpeg (RGBA at native size), crops to the opaque bbox, then downsamples by area
// into terminal cells. Transparent pixels (or the keyed background colour) stay as bare spaces so
// the art sits on whatever the TUI paints behind it.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const COLS = +opt('cols', 32);
const MODE = opt('mode', 'half');
const OUT = opt('out', null);
const FLIP = args.includes('--flip');

function probe(f) {
  const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim();
  const [w, h] = s.split(',').map(Number);
  return { w, h };
}
function decode(f) {
  const { w, h } = probe(f);
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 });
  return { w, h, px: new Uint8Array(buf.buffer, buf.byteOffset, buf.length) };
}

// If the image has no real alpha, key out the background: the colour at the four corners, within a
// tolerance. (Blizzard's render.worldofwarcraft.com JPGs sit on a flat dark grey.)
function keyBackground(img) {
  const { w, h, px } = img;
  let hasAlpha = false;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { hasAlpha = true; break; }
  if (hasAlpha) return;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
  const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((s, o) => s + px[o + c], 0) / 4));
  const TOL = 28;
  for (let i = 0; i < px.length; i += 4) {
    const d = Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]);
    if (d < TOL) px[i + 3] = 0;
    else if (d < TOL * 2) px[i + 3] = Math.round(255 * (d - TOL) / TOL); // soft edge
  }
}

function bbox(img) {
  const { w, h, px } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 } : { x0, y0, x1, y1 };
}

// Area-average the crop into gw x gh samples. Colour is alpha-weighted so edge samples keep the
// model's colour rather than fading toward black; returns Float32 r,g,b,a per sample (a in 0..1).
function sample(img, box, gw, gh) {
  const { w, px } = img;
  const cw = (box.x1 - box.x0 + 1) / gw, ch = (box.y1 - box.y0 + 1) / gh;
  const out = new Float32Array(gw * gh * 4);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const sx0 = Math.floor(box.x0 + gx * cw), sx1 = Math.max(sx0 + 1, Math.floor(box.x0 + (gx + 1) * cw));
    const sy0 = Math.floor(box.y0 + gy * ch), sy1 = Math.max(sy0 + 1, Math.floor(box.y0 + (gy + 1) * ch));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
      const o = (y * w + x) * 4, al = px[o + 3] / 255;
      r += px[o] * al; g += px[o + 1] * al; b += px[o + 2] * al; a += al; n++;
    }
    const k = (gy * gw + gx) * 4;
    if (a > 0) { out[k] = r / a; out[k + 1] = g / a; out[k + 2] = b / a; }
    out[k + 3] = a / n;
  }
  return out;
}

const fg = (r, g, b) => `\x1b[38;2;${r | 0};${g | 0};${b | 0}m`;
const bg = (r, g, b) => `\x1b[48;2;${r | 0};${g | 0};${b | 0}m`;
const RESET = '\x1b[0m';
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Terminal cells are ~2:1 tall; the aspect numbers below keep the model's proportions.
function render(img, mode, cols) {
  const box = bbox(img);
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  const lines = [];
  if (mode === 'half') {
    // One cell = 1 px wide, 2 px tall. Rows of cells = cols * (bh/bw) / 2.
    const gw = cols, gh = Math.max(2, Math.round(cols * (bh / bw))) & ~1;
    const s = sample(img, box, gw, gh);
    for (let y = 0; y < gh; y += 2) {
      let line = '';
      for (let x = 0; x < gw; x++) {
        const t = (y * gw + x) * 4, u = ((y + 1) * gw + x) * 4;
        const ta = s[t + 3] > 0.5, ua = s[u + 3] > 0.5;
        if (ta && ua) line += fg(s[t], s[t + 1], s[t + 2]) + bg(s[u], s[u + 1], s[u + 2]) + '▀';
        else if (ta) line += fg(s[t], s[t + 1], s[t + 2]) + '▀' + RESET;
        else if (ua) line += fg(s[u], s[u + 1], s[u + 2]) + '▄' + RESET;
        else line += ' ';
        if (ta && ua) line += RESET;
      }
      lines.push(line);
    }
  } else if (mode === 'braille') {
    // One cell = 2 px wide, 4 px tall, dots on; colour = cell average. Dots follow alpha, so this is
    // a silhouette with colour rather than shading.
    const gw = cols * 2, gh = Math.max(4, Math.round(cols * 2 * (bh / bw))) & ~3;
    const s = sample(img, box, gw, gh);
    const bit = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];
    for (let y = 0; y < gh; y += 4) {
      let line = '';
      for (let x = 0; x < gw; x += 2) {
        let code = 0, r = 0, g = 0, b = 0, n = 0;
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
          const k = ((y + dy) * gw + x + dx) * 4;
          if (s[k + 3] > 0.5) { code |= bit[dy][dx]; r += s[k]; g += s[k + 1]; b += s[k + 2]; n++; }
        }
        line += n ? fg(r / n, g / n, b / n) + String.fromCharCode(0x2800 + code) + RESET : ' ';
      }
      lines.push(line);
    }
  } else {
    // ascii: luminance ramp + the cell's colour in the foreground. plain: ramp only.
    const RAMP = ' .:-=+*#%@';
    const gw = cols, gh = Math.max(1, Math.round(cols * (bh / bw) / 2));
    const s = sample(img, box, gw, gh);
    for (let y = 0; y < gh; y++) {
      let line = '';
      for (let x = 0; x < gw; x++) {
        const k = (y * gw + x) * 4;
        if (s[k + 3] <= 0.4) { line += ' '; continue; }
        const L = lum(s[k], s[k + 1], s[k + 2]) / 255;
        const ch = RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(L * (RAMP.length - 1)))];
        if (mode === 'plain') line += ch;
        else {
          // Lift the colour so dark fur still reads; the glyph carries the luminance.
          const m = Math.max(1, s[k], s[k + 1], s[k + 2]), lift = Math.min(255, 110 + L * 145) / m;
          line += fg(s[k] * lift, s[k + 1] * lift, s[k + 2] * lift) + ch + RESET;
        }
      }
      lines.push(line);
    }
  }
  return lines;
}

const img = decode(file);
keyBackground(img);
const lines = render(img, MODE, COLS);
const text = lines.join('\n') + '\n';
if (OUT) fs.writeFileSync(OUT, text); else process.stdout.write(text);
console.error(`${MODE} ${COLS} cols x ${lines.length} rows, ${text.length} bytes`);
