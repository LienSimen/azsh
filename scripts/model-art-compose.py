# Composite a phonecraft paperdoll: base body + gear overlays in the game's z order.
# Usage: python compose.py <base e.g. human-male> <out.png> <overlayKey>...
import json, sys
from PIL import Image
ROOT = r'D:\projects\phonecraft\datadump\paperdoll-renders'
base, out, keys = sys.argv[1], sys.argv[2], sys.argv[3:]
man = json.load(open(f'{ROOT}/manifest.json', encoding='utf-8'))['overlays'][base]
Z = {4: 2, 7: 3, 8: 4, 5: 5, 20: 5, 6: 6, 19: 7, 9: 8, 10: 9, 16: 12, 3: 13, 1: 14,
     13: 15, 17: 15, 21: 15, 15: 15, 25: 15, 26: 15, 14: 16, 22: 16, 23: 16}
img = Image.open(f'{ROOT}/base/{base}.png').convert('RGBA')
for k in sorted(keys, key=lambda k: Z.get(int(k.split('-')[0]), 15)):
    m = man.get(k)
    if not m: print('no manifest entry', k); continue
    ov = Image.open(f'{ROOT}/overlay/{base}/{k}.webp').convert('RGBA')
    if ov.size != (m['w'], m['h']): print('size mismatch', k, ov.size, (m['w'], m['h']))
    img.alpha_composite(ov, (m['x'], m['y']))
img.save(out); print(out, img.size, len(keys), 'layers')
