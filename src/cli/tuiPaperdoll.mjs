// The Gear tab as a character sheet: you in your gear in the middle, the worn pieces' icons down both sides
// the way the client's paperdoll lays them out (head to wrists on the left, hands to trinkets on the right,
// the weapons and the bag bar underneath), each framed in its quality colour. Arrows move between the
// slots (Up and Down in order, Shift+arrows across the picture), the detail pane is the piece's tooltip, and Enter, x and r act on the slot as they do in the list.
// The rows are the gear view's own (a slot row carries `cell`); this file only places them. No colour, or a
// window too small for the sheet, and the view lists its rows as before.
import { canvas, drawCell, gridStep } from './iconGrid.mjs';
import { iconsOn } from './iconArt.mjs';
import { artWidth } from './modelArt.mjs';
import { bold, dim, green, inverse, fit, cut, vis, qualityPaint, qualityCodes, plural } from './text.mjs';
import { SLOT_LABEL } from '../domain/items/equipment.ts';

const LEFT = ['head', 'neck', 'shoulder', 'back', 'chest', 'shirt', 'wrist'];
const RIGHT = ['hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2'];
const WEAPONS = ['mainhand', 'offhand', 'ranged'];
const BAGS = ['bag1', 'bag2', 'bag3', 'bag4'];
const SIDE = RIGHT.length;
// What an empty slot says on its dark square (four columns at most).
const SHORT = {
  head: 'Head', neck: 'Neck', shoulder: 'Shld', back: 'Back', chest: 'Chst', shirt: 'Shrt', wrist: 'Wrst',
  hands: 'Hand', waist: 'Wst', legs: 'Legs', feet: 'Feet', finger1: 'Ring', finger2: 'Ring', trinket1: 'Trk', trinket2: 'Trk',
  mainhand: 'MH', offhand: 'OH', ranged: 'Rng', bag1: 'Bag', bag2: 'Bag', bag3: 'Bag', bag4: 'Bag',
};

/** The icon size the sheet takes in a `w` x `h` list pane and how many of the `extras` rows (repair, ammo,
 *  outfits) fit under it, or null when it does not fit and the view should list instead. Big icons win over
 *  the upkeep rows: R and o reach those from the keys, and the view leaves undrawn ones out of its rows. */
function sheetSize(w, h, extras) {
  for (const s of [6, 4]) {
    for (const room of [extras, 0]) {
      const need = 2 + SIDE * (s / 2) + 1 + s / 2 + (room ? 1 + room : 0);
      if (h >= need && w >= 7 * (s + 2) + 6) return { s, extras: room };
    }
  }
  return null;
}

/** Will the Gear tab draw as the sheet right now? `extras` is how many rows follow the slots. */
export function paperdollPlan(app, extras) {
  if (!iconsOn()) return null;
  const L = app.layout();
  return L.detailW ? sheetSize(L.listW, L.mainH, extras) : null;
}

/**
 * The sheet's lines for the gear view's `rows` in a `W` x `H` pane, with `body(cols, lines)` drawing the
 * character (playerArt), plus where the arrows go; null when it does not fit.
 */
export function paperdollGrid(app, rows, W, H, body) {
  const extraRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r.cell && !r.header);
  const plan = iconsOn() ? sheetSize(W, H, extraRows.length) : null;
  if (!plan) return null;
  const { s } = plan, cw = s + 2, ch = s / 2;
  const cur = app.top()?.cursor ?? 0;
  const cv = canvas(W, H);
  const pts = [];
  const index = new Map(rows.map((r, i) => [r.cell?.slot, i]));
  const top = 2, colH = SIDE * ch;

  const ups = rows.filter((r) => r.cell?.up).length;
  cv.text(1, 0, `${bold('Equipment')}   ${ups ? green(`▲ ${plural(ups, 'upgrade')} in your bags   u: put on all`) : dim(`Shift+arrows: move on the sheet   Enter: change${plan.extras ? '' : '   R: repair all   o: outfits'}`)}`);

  // Labels take a share of the width beside each column; the body gets the middle.
  const lw = Math.max(0, Math.min(22, Math.floor((W - 2 * cw) * 0.28)));
  const midX = cw + lw + 1, midW = W - 2 * cw - 2 * lw - 2;
  const art = midW >= 6 ? body(midW, colH) : null;
  if (art?.length) cv.art(midX + Math.floor((midW - artWidth(art)) / 2), top + Math.max(0, Math.floor((colH - art.length) / 2)), art);

  const cell = (slot, x, y, px, py, side) => {
    const i = index.get(slot);
    if (i == null) return;
    const c = rows[i].cell, it = c.it;
    const sel = i === cur;
    drawCell(cv, x, y, s, {
      icon: it?.icon, frame: it ? qualityCodes(it.quality) : '90', selected: sel, empty: SHORT[slot],
      mark: c.up ? { text: '▲', codes: '92' } : null,
    });
    pts.push({ i, x: px, y: py });
    if (!side || lw < 4) return;
    const name = it ? qualityPaint(it.quality)(it.name) : dim(SLOT_LABEL[slot] ?? slot);
    const lines = [sel ? bold(name) : name, ...(ch > 2 ? [c.sub ?? '', c.dur ?? ''] : [c.dur || c.sub || ''])].slice(0, ch);
    lines.forEach((t, k) => {
      const text = cut(t, lw - 1);
      cv.text(side === 'left' ? x + cw + 1 : x - 1 - vis(text), y + k, text);
    });
  };
  LEFT.forEach((slot, k) => cell(slot, 0, top + k * ch, 0, k, 'left'));
  RIGHT.forEach((slot, k) => cell(slot, W - cw, top + k * ch, 4, k, 'right'));

  // Under the columns: the weapons centred under the body, the bag bar at the right edge.
  const by = top + colH + 1;
  const bagsX = W - BAGS.length * cw;
  const wx = Math.max(0, Math.min(Math.round(midX + midW / 2 - 1.5 * cw), bagsX - 3 * cw - 2));
  WEAPONS.forEach((slot, k) => cell(slot, wx + k * cw, by, 1 + k, SIDE));
  BAGS.forEach((slot, k) => cell(slot, bagsX + k * cw, by, 5 + k, SIDE));

  // Upkeep rows (repair all, ammo, outfits, auto use) under the sheet when they fit.
  const ey = by + ch + 1;
  extraRows.slice(0, plan.extras).forEach(({ r, i }, k) => {
    const sel = i === cur;
    const text = ` ${sel ? '▶' : ' '} ${r.text}`;
    cv.text(0, ey + k, sel ? inverse(fit(text, W - 1)) : text, W - 1);
    pts.push({ i, x: 1, y: SIDE + 1 + k });
  });

  return { lines: cv.lines(), nav: (dir, from) => gridStep(pts, from, dir, { dyW: 1, dxW: 10 }) };
}
