#!/usr/bin/env python
"""Replays a recording from scripts/demo-record.mjs through a small terminal emulator and writes a video or GIF.

The log is one JSON line per write the game made ({t, o: base64 bytes}) with marks ({t, m: name}) between
scenes. The emulator keeps a grid of cells (glyph, colours, attributes) and a pixel canvas: cells are drawn
with a monospace font (Cascadia Mono, with DejaVu Sans Mono and Hack behind it for glyphs it lacks), block
elements as exact rectangles, and sixel images (DCS q ... ST) are decoded and painted at the cursor, as a
terminal that draws them would. Frames are taken at a fixed rate between two marks and piped to ffmpeg.

  python scripts/demo-render.py media/rec/new.jsonl --clip fight --gif media/fight.gif [--mp4 media/fight.mp4]
  python scripts/demo-render.py media/rec/new.jsonl --clip create --png media/create.png --at 3.0
  Options: --fps 12, --from/--to seconds (instead of --clip), --scale 0.75 (GIF width), --colors 128, --gap 1500
  (ms held on the last frame), --theme campbell|dark.
"""
import argparse
import base64
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT_DIRS = [os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts'),
             os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Windows', 'Fonts'),
             '/usr/share/fonts', '/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/TTF']
FONTS = ['CascadiaMono.ttf', 'DejaVuSansMono.ttf', 'HackNerdFontMono-Regular.ttf', 'consola.ttf']

# Windows Terminal's Campbell scheme: what the game looks like out of the box on Windows.
CAMPBELL = [(12, 12, 12), (197, 15, 31), (19, 161, 14), (193, 156, 0), (0, 55, 218), (136, 23, 152), (58, 150, 221), (204, 204, 204),
            (118, 118, 118), (231, 72, 86), (22, 198, 12), (249, 241, 165), (59, 120, 255), (180, 0, 158), (97, 214, 214), (242, 242, 242)]
THEMES = {'campbell': dict(fg=(204, 204, 204), bg=(12, 12, 12), ansi=CAMPBELL),
          'dark': dict(fg=(220, 220, 220), bg=(24, 24, 24), ansi=CAMPBELL)}


def xterm256(n):
    if n < 16:
        return CAMPBELL[n]
    if n < 232:
        n -= 16
        r, g, b = n // 36, (n // 6) % 6, n % 6
        return tuple(0 if v == 0 else 55 + v * 40 for v in (r, g, b))
    v = 8 + (n - 232) * 10
    return (v, v, v)


def find_font(name):
    for d in FONT_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return None


def mask_bytes(font, g):
    """The glyph's bitmap, to tell a glyph the font lacks (drawn as .notdef) from one it has."""
    img = Image.new('L', (48, 64), 0)
    ImageDraw.Draw(img).text((4, 48), g, font=font, fill=255, anchor='ls')
    return img.tobytes()


class Glyphs:
    """Renders one cell at a time, cached by (glyph, fg, bg, bold, underline)."""

    def __init__(self, cw, ch):
        self.cw, self.ch = cw, ch
        self.fonts = []
        for name in FONTS:
            p = find_font(name)
            if not p:
                continue
            size = 6
            while size < 80:
                f = ImageFont.truetype(p, size + 1)
                if f.getlength('M') > cw or sum(f.getmetrics()) > ch + 2:
                    break
                size += 1
            f = ImageFont.truetype(p, size)
            bold = None
            try:
                bold = ImageFont.truetype(p, size)
                bold.set_variation_by_name('Bold')
            except Exception:
                bold = None
            self.fonts.append((f, bold))
        if not self.fonts:
            sys.exit('no monospace font found; set FONT_DIRS')
        self.notdef = [mask_bytes(f, '\u0378') for f, _ in self.fonts]
        self.which = {}
        self.cache = {}

    def font_for(self, g):
        w = self.which.get(g)
        if w is None:
            w = 0
            for i, (f, _) in enumerate(self.fonts):
                try:
                    if mask_bytes(f, g) != self.notdef[i]:
                        w = i
                        break
                except Exception:
                    continue
            self.which[g] = w
        return self.fonts[w]

    def cell(self, g, fg, bg, bold, underline):
        key = (g, fg, bg, bold, underline)
        a = self.cache.get(key)
        if a is not None:
            return a
        cw, ch = self.cw, self.ch
        img = Image.new('RGB', (cw, ch), bg)
        d = ImageDraw.Draw(img)
        rect = BLOCKS.get(g)
        if rect is not None:
            x0, y0, x1, y1, shade = rect
            if shade is None:
                d.rectangle((round(x0 * cw), round(y0 * ch), round(x1 * cw) - 1, round(y1 * ch) - 1), fill=fg)
            else:
                mix = tuple(round(bg[i] + (fg[i] - bg[i]) * shade) for i in range(3))
                d.rectangle((0, 0, cw - 1, ch - 1), fill=mix)
        elif g != ' ':
            f, fb = self.font_for(g)
            asc, desc = f.getmetrics()
            y = (ch - (asc + desc)) // 2 + asc
            x = (cw - f.getlength(g)) / 2
            if bold and fb is not None:
                d.text((x, y), g, font=fb, fill=fg, anchor='ls')
            else:
                d.text((x, y), g, font=f, fill=fg, anchor='ls')
                if bold:
                    d.text((x + 1, y), g, font=f, fill=fg, anchor='ls')
        if underline:
            d.line((0, ch - 2, cw - 1, ch - 2), fill=fg)
        a = np.asarray(img, dtype=np.uint8)
        self.cache[key] = a
        return a


# Block elements drawn as rectangles (x0, y0, x1, y1 as fractions of the cell; shade for ░▒▓).
BLOCKS = {
    '█': (0, 0, 1, 1, None), '▀': (0, 0, 1, 0.5, None), '▄': (0, 0.5, 1, 1, None), '▌': (0, 0, 0.5, 1, None), '▐': (0.5, 0, 1, 1, None),
    '▁': (0, 7 / 8, 1, 1, None), '▂': (0, 6 / 8, 1, 1, None), '▃': (0, 5 / 8, 1, 1, None), '▅': (0, 3 / 8, 1, 1, None),
    '▆': (0, 2 / 8, 1, 1, None), '▇': (0, 1 / 8, 1, 1, None), '▔': (0, 0, 1, 1 / 8, None), '▏': (0, 0, 1 / 8, 1, None),
    '▎': (0, 0, 2 / 8, 1, None), '▍': (0, 0, 3 / 8, 1, None), '▋': (0, 0, 5 / 8, 1, None), '▊': (0, 0, 6 / 8, 1, None), '▉': (0, 0, 7 / 8, 1, None),
    '░': (0, 0, 1, 1, 0.25), '▒': (0, 0, 1, 1, 0.5), '▓': (0, 0, 1, 1, 0.75),
}


class Term:
    def __init__(self, cols, rows, cw, ch, theme):
        self.cols, self.rows, self.cw, self.ch = cols, rows, cw, ch
        self.theme = theme
        self.glyphs = Glyphs(cw, ch)
        self.canvas = np.zeros((rows * ch, cols * cw, 3), dtype=np.uint8)
        self.canvas[:, :] = theme['bg']
        self.cells = [[(' ', None, None, 0) for _ in range(cols)] for _ in range(rows)]
        self.dirty = set()
        self.x = self.y = 0
        self.fg = self.bg = None
        self.attr = 0  # 1 bold, 2 dim, 4 underline, 8 inverse
        self.in_sync = False
        self.buf = b''
        self.pending = ''

    # ---- cells -> pixels ----------------------------------------------------------------------------
    def flush(self):
        th = self.theme
        for (x, y) in self.dirty:
            g, fg, bg, attr = self.cells[y][x]
            fg = fg or th['fg']
            bg = bg or th['bg']
            if attr & 8:
                fg, bg = bg, fg
            if attr & 2:
                fg = tuple(round(bg[i] + (fg[i] - bg[i]) * 0.55) for i in range(3))
            a = self.glyphs.cell(g, fg, bg, bool(attr & 1), bool(attr & 4))
            self.canvas[y * self.ch:(y + 1) * self.ch, x * self.cw:(x + 1) * self.cw] = a
        self.dirty.clear()

    def frame(self):
        self.flush()
        return self.canvas

    # ---- the stream -----------------------------------------------------------------------------------
    def feed(self, data):
        self.buf += data
        try:
            s = self.buf.decode('utf-8')
            self.buf = b''
        except UnicodeDecodeError as e:
            s = self.buf[:e.start].decode('utf-8')
            self.buf = self.buf[e.start:]
        self.parse(self.pending + s)

    def parse(self, s):
        self.pending = ''
        i, n = 0, len(s)
        while i < n:
            c = s[i]
            if c == '\x1b':
                if i + 1 >= n:
                    self.pending = s[i:]
                    return
                k = s[i + 1]
                if k == '[':
                    j = i + 2
                    while j < n and not ('\x40' <= s[j] <= '\x7e'):
                        j += 1
                    if j >= n:
                        self.pending = s[i:]
                        return
                    self.csi(s[i + 2:j], s[j])
                    i = j + 1
                    continue
                if k == 'P':
                    e = s.find('\x1b\\', i)
                    if e < 0:
                        self.pending = s[i:]
                        return
                    self.dcs(s[i + 2:e])
                    i = e + 2
                    continue
                if k == ']':
                    e1 = s.find('\x07', i)
                    e2 = s.find('\x1b\\', i)
                    ends = [e for e in (e1, e2) if e >= 0]
                    if not ends:
                        self.pending = s[i:]
                        return
                    e = min(ends)
                    i = e + (1 if e == e1 else 2)
                    continue
                i += 2  # ESC + one char (ESC c, ESC 7 ...)
                continue
            i += 1
            if c == '\n':
                self.y = min(self.rows - 1, self.y + 1)
            elif c == '\r':
                self.x = 0
            elif c == '\b':
                self.x = max(0, self.x - 1)
            elif c < ' ' or c == '\x7f':
                continue
            else:
                self.put(c)

    def put(self, g):
        if self.y < self.rows and self.x < self.cols:
            self.cells[self.y][self.x] = (g, self.fg, self.bg, self.attr)
            self.dirty.add((self.x, self.y))
        self.x += 1

    def clear(self, x0, y0, x1, y1):
        for y in range(y0, y1):
            for x in range(x0, x1):
                self.cells[y][x] = (' ', None, self.bg, 0)
                self.dirty.add((x, y))

    def csi(self, params, final):
        priv = params.startswith('?')
        p = [int(v) if v else 0 for v in params.lstrip('?').split(';')] if params.lstrip('?') else []
        if priv:
            if final == 'h' and 1049 in p:
                self.clear(0, 0, self.cols, self.rows)
                self.x = self.y = 0
            elif final == 'h' and 2026 in p:
                self.in_sync = True
            elif final == 'l' and 2026 in p:
                self.in_sync = False
            return
        if final == 'm':
            self.sgr(p)
        elif final in 'Hf':
            self.y = max(0, min(self.rows - 1, (p[0] if p else 1) - 1))
            self.x = max(0, min(self.cols - 1, (p[1] if len(p) > 1 else 1) - 1))
        elif final == 'J':
            m = p[0] if p else 0
            if m == 2 or m == 3:
                self.clear(0, 0, self.cols, self.rows)
            elif m == 0:
                self.clear(self.x, self.y, self.cols, self.y + 1)
                self.clear(0, self.y + 1, self.cols, self.rows)
            else:
                self.clear(0, 0, self.cols, self.y)
                self.clear(0, self.y, self.x + 1, self.y + 1)
        elif final == 'K':
            m = p[0] if p else 0
            if m == 2:
                self.clear(0, self.y, self.cols, self.y + 1)
            elif m == 0:
                self.clear(self.x, self.y, self.cols, self.y + 1)
            else:
                self.clear(0, self.y, self.x + 1, self.y + 1)
        elif final == 'A':
            self.y = max(0, self.y - (p[0] or 1 if p else 1))
        elif final == 'B':
            self.y = min(self.rows - 1, self.y + (p[0] or 1 if p else 1))
        elif final == 'C':
            self.x = min(self.cols - 1, self.x + (p[0] or 1 if p else 1))
        elif final == 'D':
            self.x = max(0, self.x - (p[0] or 1 if p else 1))
        elif final == 'G':
            self.x = max(0, min(self.cols - 1, (p[0] if p else 1) - 1))
        elif final == 'd':
            self.y = max(0, min(self.rows - 1, (p[0] if p else 1) - 1))

    def sgr(self, p):
        if not p:
            p = [0]
        i = 0
        while i < len(p):
            v = p[i]
            if v == 0:
                self.fg = self.bg = None
                self.attr = 0
            elif v == 1:
                self.attr |= 1
            elif v == 2:
                self.attr |= 2
            elif v == 4:
                self.attr |= 4
            elif v == 7:
                self.attr |= 8
            elif v == 22:
                self.attr &= ~3
            elif v == 24:
                self.attr &= ~4
            elif v == 27:
                self.attr &= ~8
            elif 30 <= v <= 37:
                self.fg = self.theme['ansi'][v - 30]
            elif 90 <= v <= 97:
                self.fg = self.theme['ansi'][v - 90 + 8]
            elif 40 <= v <= 47:
                self.bg = self.theme['ansi'][v - 40]
            elif 100 <= v <= 107:
                self.bg = self.theme['ansi'][v - 100 + 8]
            elif v == 39:
                self.fg = None
            elif v == 49:
                self.bg = None
            elif v in (38, 48) and i + 1 < len(p):
                if p[i + 1] == 2 and i + 4 < len(p):
                    col = (p[i + 2], p[i + 3], p[i + 4])
                    i += 4
                elif p[i + 1] == 5 and i + 2 < len(p):
                    col = xterm256(p[i + 2])
                    i += 2
                else:
                    col = None
                if v == 38:
                    self.fg = col
                else:
                    self.bg = col
            i += 1

    # ---- sixel ------------------------------------------------------------------------------------------
    def dcs(self, body):
        q = body.find('q')
        if q < 0:
            return
        params = body[:q]
        data = body[q + 1:]
        p2 = 0
        try:
            parts = params.split(';')
            if len(parts) > 1 and parts[1]:
                p2 = int(parts[1])
        except ValueError:
            pass
        img = decode_sixel(data, transparent=(p2 == 1), bg=self.theme['bg'])
        if img is None:
            return
        rgb, alpha = img
        self.flush()
        px, py = self.x * self.cw, self.y * self.ch
        h, w = alpha.shape
        H, W = self.canvas.shape[:2]
        h = min(h, H - py)
        w = min(w, W - px)
        if h <= 0 or w <= 0:
            return
        region = self.canvas[py:py + h, px:px + w]
        m = alpha[:h, :w]
        region[m] = rgb[:h, :w][m]


def decode_sixel(data, transparent, bg):
    pal = {}
    i, n = 0, len(data)
    width = height = 0
    # Raster attributes say the size; otherwise it is found by walking the data once.
    if data.startswith('"'):
        j = 1
        while j < n and data[j] not in '#$-!?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~':
            j += 1
        try:
            parts = data[1:j].split(';')
            width, height = int(parts[2]), int(parts[3])
        except (ValueError, IndexError):
            width = height = 0
        i = j
    if not width or not height:
        x = y = mx = 0
        k, rep = i, 1
        while k < n:
            c = data[k]
            if c == '!':
                e = k + 1
                while e < n and data[e].isdigit():
                    e += 1
                rep = int(data[k + 1:e] or 1)
                k = e
                continue
            if c == '#':
                e = k + 1
                while e < n and (data[e].isdigit() or data[e] == ';'):
                    e += 1
                k = e
                continue
            if c == '$':
                x = 0
            elif c == '-':
                x = 0
                y += 6
            elif '?' <= c <= '~':
                x += rep
                mx = max(mx, x)
            rep = 1
            k += 1
        width, height = mx, y + 6
    if not width or not height:
        return None
    idx = np.zeros((height + 6, width + 1), dtype=np.int16)
    idx.fill(-1)
    x = y = 0
    color = 0
    rep = 1
    bits = np.array([1, 2, 4, 8, 16, 32], dtype=np.uint8)
    while i < n:
        c = data[i]
        if c == '#':
            e = i + 1
            while e < n and (data[e].isdigit() or data[e] == ';'):
                e += 1
            parts = data[i + 1:e].split(';')
            try:
                color = int(parts[0])
                if len(parts) >= 5 and parts[1] == '2':
                    pal[color] = tuple(round(int(v) * 255 / 100) for v in parts[2:5])
            except ValueError:
                pass
            i = e
            continue
        if c == '!':
            e = i + 1
            while e < n and data[e].isdigit():
                e += 1
            rep = int(data[i + 1:e] or 1)
            i = e
            continue
        if c == '$':
            x = 0
        elif c == '-':
            x = 0
            y += 6
        elif '?' <= c <= '~':
            v = ord(c) - 63
            if v and y < height + 6:
                rows = np.nonzero(bits & v)[0]
                x1 = min(x + rep, width + 1)
                for r in rows:
                    idx[y + r, x:x1] = color
            x += rep
        rep = 1
        i += 1
    idx = idx[:height, :width]
    alpha = idx >= 0
    rgb = np.zeros((height, width, 3), dtype=np.uint8)
    rgb[:, :] = bg
    if pal:
        maxc = max(pal) + 1
        table = np.zeros((maxc, 3), dtype=np.uint8)
        for k, v in pal.items():
            table[k] = v
        safe = np.where(alpha, idx, 0)
        safe = np.clip(safe, 0, maxc - 1)
        rgb = np.where(alpha[:, :, None], table[safe], rgb)
    if not transparent:
        alpha = np.ones_like(alpha)
    return rgb, alpha


# ---- the run ----------------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('rec')
    ap.add_argument('--clip')
    ap.add_argument('--from', dest='t_from', type=float)
    ap.add_argument('--to', dest='t_to', type=float)
    ap.add_argument('--fps', type=float, default=12)
    ap.add_argument('--gif')
    ap.add_argument('--mp4')
    ap.add_argument('--png')
    ap.add_argument('--at', type=float, default=None, help='seconds into the clip for --png')
    ap.add_argument('--scale', type=float, default=1.0)
    ap.add_argument('--colors', type=int, default=160)
    ap.add_argument('--gap', type=int, default=1500)
    ap.add_argument('--theme', default='campbell')
    ap.add_argument('--marks', action='store_true', help='list the marks and exit')
    a = ap.parse_args()

    with open(a.rec, encoding='utf-8') as f:
        head = json.loads(f.readline())
        recs = [json.loads(l) for l in f if l.strip()]
    marks = [(r['t'], r['m']) for r in recs if 'm' in r]
    if a.marks:
        for t, m in marks:
            print(f'{t / 1000:8.1f}s  {m}')
        return
    t_from, t_to = 0, recs[-1]['t']
    if a.clip:
        names = [m for _, m in marks]
        if a.clip not in names:
            sys.exit(f'no mark {a.clip}; have {", ".join(names)}')
        k = names.index(a.clip)
        t_from = marks[k][0]
        t_to = marks[k + 1][0] if k + 1 < len(marks) else recs[-1]['t']
    if a.t_from is not None:
        t_from = (t_from if a.clip else 0) + a.t_from * 1000
    if a.t_to is not None:
        t_to = (marks[names.index(a.clip)][0] if a.clip else 0) + a.t_to * 1000

    term = Term(head['cols'], head['rows'], head['cellW'], head['cellH'], THEMES[a.theme])
    W, H = head['cols'] * head['cellW'], head['rows'] * head['cellH']
    step = 1000.0 / a.fps
    frames = []
    nxt = t_from
    outs = [r for r in recs if 'o' in r]
    if a.png is not None:
        want = t_from + (a.at or 0) * 1000
        for r in outs:
            if r['t'] > want:
                break
            term.feed(base64.b64decode(r['o']))
        Image.fromarray(term.frame()).save(a.png)
        print(f'wrote {a.png}')
        return

    ff = []
    procs = []
    if a.mp4 or a.gif:
        tmp_mp4 = a.mp4 or (a.gif + '.tmp.mp4')
        os.makedirs(os.path.dirname(os.path.abspath(tmp_mp4)), exist_ok=True)
        cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(a.fps), '-i', '-',
               '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-movflags', '+faststart', tmp_mp4]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    else:
        sys.exit('nothing to write: give --gif, --mp4 or --png')

    count = 0
    due = []

    def emit():
        nonlocal count
        proc.stdin.write(term.frame().tobytes())
        count += 1

    for r in outs:
        if r['t'] > t_to:
            break
        while nxt <= r['t'] and nxt <= t_to:
            if nxt >= t_from:
                due.append(nxt)
            nxt += step
        if due and not term.in_sync:
            for _ in due:
                emit()
            due = []
        term.feed(base64.b64decode(r['o']))
    while nxt <= t_to:
        due.append(nxt)
        nxt += step
    for _ in due:
        emit()
    for _ in range(int(a.gap / step)):
        emit()
    proc.stdin.close()
    proc.wait()
    print(f'{count} frames -> {tmp_mp4}')
    if a.gif:
        gw = max(2, int(W * a.scale) // 2 * 2)
        vf = f'fps={a.fps},scale={gw}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors={a.colors}:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle'
        subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp_mp4, '-vf', vf, '-loop', '0', a.gif])
        print(f'wrote {a.gif} ({os.path.getsize(a.gif) // 1024} KB)')
        if not a.mp4:
            os.remove(tmp_mp4)


if __name__ == '__main__':
    main()
