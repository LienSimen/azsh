# Bake the gear pack for the windowed game: phonecraft's paperdoll bake (sixteen bodies, their skins, the
# face / facial hair / hair overlays and every item appearance overlay, 512 px frame) becomes one brotli
# pack of small indexed images over one shared palette, which paperdoll.mjs stacks into a geared character.
# Dev only; Python with Pillow (the 105k webp decodes take minutes through ffmpeg, seconds through Pillow)
# and node for the final compression.
#
#   python scripts/bake-gear-art.py [--src D:/projects/phonecraft/datadump/paperdoll-renders] [--hd] [--only human-male]
#
# --hd bakes the same layers with the bare body BODY_PX_HD tall (--px to change it), one file a body in
# src/data/gear-art-hd/<slug>.bin.br so a game loads only the bodies it draws: "AZGEARB" u8 version 2, u8 palLen +
# that body's own palette, then its section as below with the canvas and every x y w h a u16 (LE), since a body
# 256 px tall stands on a canvas past 255. sixel.mjs composes a character from them where the terminal draws
# real pixels; the item -> overlay key table stays in the small pack. --only bakes one body.
#
# Every body is scaled so its bare body stands 56 px tall (the creature pack's height); the whole 512 frame
# becomes a square canvas of that scale and every layer keeps its frame offset, so overlays land where the
# bake put them. One 255-colour palette (median cut over the skins and a sample of overlays) serves all.
#
# Pack: "AZGEAR" u8 version, u8 palLen + palette, u8 bodies; per body u8 slugLen + slug, u8 canvas,
# u8 skins (u8 skin index + canvas*canvas indices each), u16 overlays (u8 keyLen + key, u8 x y w h,
# w*h indices each); then u16 items (u32 item entry, u8 keyLen + key). Index 0 is transparent.
import io, json, os, random, struct, subprocess, sys, time
from PIL import Image

args = sys.argv[1:]
SRC = args[args.index('--src') + 1] if '--src' in args else 'D:/projects/phonecraft/datadump/paperdoll-renders'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
HD = '--hd' in args
OUT = os.path.join(ROOT, 'src', 'data', 'gear-art.bin.br')
OUT_HD = os.path.join(ROOT, 'src', 'data', 'gear-art-hd')
# The bare body's height in the pack. 48 px is 24 rows, as tall as a pane gets on a 40-row terminal; the
# creature pack uses 56, but a hundred thousand overlays make every pixel count (56 px was 11.8 MB).
BODY_PX = 48
# The hd pack's: the Character sheet draws you about 460 px tall, and at 128 px that was a blur blown up 3.5x.
# 256 keeps the face, buckles and straps the 512 frame rendered (the body is about 430 px of it).
BODY_PX_HD = int(args[args.index('--px') + 1]) if '--px' in args else 256
if HD: BODY_PX = BODY_PX_HD
FRAME = 512
APP_FACIAL_REV = 3    # per-colour facial hair keys below this bake revision were bad (paperdollSprite.ts)

gear = json.load(open(f'{SRC}/manifest.json', encoding='utf-8'))['overlays']
app = json.load(open(f'{SRC}/appearance/manifest.json', encoding='utf-8'))['bodies']
items = json.load(open(f'{SRC}/runtime-items.json', encoding='utf-8'))['items']
slugs = sorted(set(gear) & set(app))
if '--only' in args:  # a size test: one body, written beside the pack instead of over it
    slugs = [args[args.index('--only') + 1]]
    OUT = OUT.replace('.bin.br', '.only.bin.br')
    OUT_HD += '.only'

def alpha_bbox(im):
    return im.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()

# ---- palette: median cut over the skin bases plus a sample of overlays ---------------------------------
# The small pack shares one over every body; an hd file carries its body's own.
def build_palette(slugs):
    t0 = time.time()
    tiles = []
    for slug in slugs:
        for s in app[slug]['skins']:
            tiles.append(Image.open(f'{SRC}/appearance/base/{slug}/skin-{s}.webp').convert('RGBA').resize((64, 64), Image.BOX))
    random.seed(7)
    for slug in slugs:
        keys = list(gear[slug])
        for k in random.sample(keys, min(60, len(keys))):
            im = Image.open(f'{SRC}/overlay/{slug}/{k}.webp').convert('RGBA')
            tiles.append(im.resize((32, 32), Image.BOX))
        for k in random.sample(list(app[slug]['overlays']), min(20, len(app[slug]['overlays']))):
            tiles.append(Image.open(f'{SRC}/appearance/overlay/{slug}/{k}.webp').convert('RGBA').resize((32, 32), Image.BOX))
    cols = 40
    rows = (len(tiles) + cols - 1) // cols
    mosaic = Image.new('RGB', (cols * 64, rows * 64), (0, 0, 0))
    mask = Image.new('L', mosaic.size, 0)
    for i, t in enumerate(tiles):
        t = t.resize((64, 64), Image.BOX)
        mosaic.paste(t.convert('RGB'), ((i % cols) * 64, (i // cols) * 64), t.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
        mask.paste(t.getchannel('A').point(lambda a: 255 if a >= 128 else 0), ((i % cols) * 64, (i // cols) * 64))
    # Only opaque pixels vote: gather them into one strip image.
    px = [p for p, m in zip(mosaic.getdata(), mask.getdata()) if m]
    strip = Image.new('RGB', (len(px), 1)); strip.putdata(px)
    pal_img = strip.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    print(f'palette from {len(px)} pixels in {time.time() - t0:.0f}s', file=sys.stderr)
    return pal_img, pal_img.getpalette()[:255 * 3]


def indexed(im, pal_img):
    """RGBA image -> bytes of palette indices (0 transparent, n = palette[n-1])."""
    q = im.convert('RGB').quantize(palette=pal_img, dither=Image.Dither.NONE)
    shifted = Image.frombytes('L', im.size, q.tobytes()).point(lambda v: v + 1)
    mask = im.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    return Image.composite(shifted, Image.new('L', im.size, 0), mask).tobytes()

if not HD:
    pal_img, palette = build_palette(slugs)
    out = io.BytesIO()
    out.write(b'AZGEAR' + bytes([1, 255]) + bytes(palette) + bytes([len(slugs)]))
n_ov = 0

def brotli(src, dst):
    """Node compresses: Python has no brotli in its standard library. Quality 11, a 16 MB window."""
    js = ("const z=require('node:zlib'),fs=require('node:fs');const raw=fs.readFileSync(process.argv[1]);"
          "fs.writeFileSync(process.argv[2],z.brotliCompressSync(raw,{params:{[z.constants.BROTLI_PARAM_QUALITY]:11,"
          "[z.constants.BROTLI_PARAM_LGWIN]:24,[z.constants.BROTLI_PARAM_SIZE_HINT]:raw.length}}));")
    subprocess.run(['node', '-e', js, src, dst], check=True)

if HD: os.makedirs(OUT_HD, exist_ok=True)
hd_total = 0
for slug in slugs:
    t1 = time.time()
    if HD:  # each body its own file, with its palette in front
        pal_img, palette = build_palette([slug])
        out = io.BytesIO()
        out.write(b'AZGEARB' + bytes([2, 255]) + bytes(palette))
    base = Image.open(f'{SRC}/base/{slug}.png').convert('RGBA')
    bb = alpha_bbox(base)
    s = BODY_PX / (bb[3] - bb[1])
    canvas = max(1, min(FRAME if HD else 255, round(FRAME * s)))
    sc = canvas / FRAME  # the exact scale the canvas rounds to
    u = (lambda *v: struct.pack(f'<{len(v)}H', *v)) if HD else (lambda *v: bytes(v))
    out.write(bytes([len(slug)]) + slug.encode('ascii') + u(canvas))
    skins = sorted(app[slug]['skins'])
    out.write(bytes([len(skins)]))
    for sk in skins:
        im = Image.open(f'{SRC}/appearance/base/{slug}/skin-{sk}.webp').convert('RGBA').resize((canvas, canvas), Image.BOX)
        out.write(bytes([sk]) + indexed(im, pal_img))
    layers = []
    for key, g in gear[slug].items():
        layers.append((key, g, f'{SRC}/overlay/{slug}/{key}.webp'))
    for key, g in app[slug]['overlays'].items():
        if key.startswith('facial-') and not key.endswith('-0') and (g.get('rev') or 0) < APP_FACIAL_REV: continue
        layers.append((key, g, f'{SRC}/appearance/overlay/{slug}/{key}.webp'))
    recs = []
    for key, g, path in layers:
        # A manifest row without a box is a failed or empty render (the bake notes them); nothing to draw.
        if not all(k in g for k in ('x', 'y', 'w', 'h')) or not os.path.exists(path): continue
        x0, y0 = round(g['x'] * sc), round(g['y'] * sc)
        x1, y1 = round((g['x'] + g['w']) * sc), round((g['y'] + g['h']) * sc)
        w, h = max(1, min(canvas - x0, x1 - x0)), max(1, min(canvas - y0, y1 - y0))
        if x0 < 0 or y0 < 0 or x0 >= canvas or y0 >= canvas: continue
        im = Image.open(path).convert('RGBA').resize((w, h), Image.BOX)
        idx = indexed(im, pal_img)
        if not any(idx): continue
        k = key.encode('ascii')
        recs.append(bytes([len(k)]) + k + u(x0, y0, w, h) + idx)
    out.write(struct.pack('<H', len(recs)))
    for r in recs: out.write(r)
    n_ov += len(recs)
    if HD:
        tmp = os.path.join(OUT_HD, f'{slug}.raw')
        open(tmp, 'wb').write(out.getvalue())
        brotli(tmp, os.path.join(OUT_HD, f'{slug}.bin.br'))
        os.remove(tmp)
        hd_total += os.path.getsize(os.path.join(OUT_HD, f'{slug}.bin.br'))
    print(f'{slug}: canvas {canvas}, {len(skins)} skins, {len(recs)} overlays, {time.time() - t1:.0f}s', file=sys.stderr)
if HD:
    print(f'{len(slugs)} bodies, {n_ov} overlays: {hd_total / 1e6:.2f} MB brotli -> {OUT_HD}', file=sys.stderr)
    sys.exit(0)
entries = [(int(e), k) for e, k in items.items()]
out.write(struct.pack('<H', len(entries)))
for e, k in entries:
    kb = k.encode('ascii')
    out.write(struct.pack('<I', e) + bytes([len(kb)]) + kb)
raw = out.getvalue()
# Brotli packs this a fifth smaller than gzip and Node decodes it natively; Node compresses it too, since
# Python has no brotli in its standard library. Quality 11 with a 16 MB window takes a couple of minutes.
tmp = OUT + '.raw'
open(tmp, 'wb').write(raw)
brotli(tmp, OUT)
os.remove(tmp)
print(f'{len(slugs)} bodies, {n_ov} overlays, {len(entries)} items: {len(raw) / 1e6:.1f} MB raw, {os.path.getsize(OUT) / 1e6:.2f} MB brotli -> {OUT}', file=sys.stderr)
