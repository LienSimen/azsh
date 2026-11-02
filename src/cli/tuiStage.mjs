// The stage under a fight: a canvas of W x H cells that sprites, plates, numbers and bars are drawn onto
// at a column and a row, instead of a list of frames. The duel (tuiFight duelStage) places you down the
// left and the foe down the right; the dungeon room and the pack are meant to be more actor lists through
// the same canvas. Sizes come from the design page: a sprite's box says its rank, and the terminal's
// width says which boxes it can afford.
import { bold, dim, cyan, yellow, green, red, gray, inverse, fit, vis, cut, bar, brightBlue, orange, useColor, strip, itemText, coinText } from './text.mjs';
import { className } from '../domain/core/ids.ts';
import { iconArt, iconsOn } from './iconArt.mjs';
import { sixelOn } from './sixel.mjs';

const RESET = '\x1b[0m';

export const POWER_PAINT = { mana: brightBlue, rage: red, energy: yellow, focus: yellow };
export const POP_MS = 1500;      // a hit or heal stays on screen this long (fight time)
export const POP_RISE_MS = 400;  // a pop climbs one row every this long
export const LUNGE_MS = 250;     // an auto-attack swing moves the sprite two columns toward its target this long
export const SHORT_BUFF_MS = 60_000; // a frame shows only buffs about to run out; the long ones are under s on the Character tab
export const ROLE_GLYPH = { tank: cyan('T'), healer: green('H'), damage: red('D') };

/** Sprite boxes, columns x rows: a pack add or a pet, dungeon trash, a normal foe, you or an elite, a boss. */
export const SIZES = { xs: [10, 5], s: [14, 7], m: [20, 10], l: [28, 14], xl: [40, 22] };

/** The box your own sprite gets at this width: large from 140 columns, medium from 110, a bust under that. */
export const youSize = (W) => (W >= 140 ? 'l' : W >= 110 ? 'm' : 'xs');

/** The foe's box by creature rank (0 normal, 1 elite, 2 rare elite, 3 boss, 4 rare) and the width:
 *  a normal foe is medium, an elite or rare large, a boss the largest thing on screen. */
export function foeSize(W, rank = 0) {
  const byRank = rank === 3 ? 'xl' : rank > 0 ? 'l' : 'm';
  if (W >= 140) return byRank;
  if (W >= 110) return byRank === 'xl' ? 'l' : byRank;
  return 'm';
}

/** The word a rank prints after the level on a plate; nothing for a normal creature. */
export const RANK_WORD = { 1: 'elite', 2: 'rare elite', 3: 'boss', 4: 'rare' };

/** A blank canvas: H lines of W spaces. */
export const canvas = (W, H) => Array.from({ length: Math.max(0, H) }, () => ' '.repeat(W));

/** The painted string without its first `n` visible characters; the colour codes among them stay, so the
 *  rest keeps the colour it was in. */
export function dropVisible(s, n) {
  let i = 0, seen = 0;
  while (i < s.length && seen < n) {
    if (s[i] === '\x1b') { const m = s.slice(i).match(/^\x1b\[[0-9;]*m/); if (m) { i += m[0].length; continue; } }
    i++; seen++;
  }
  return s.slice(i);
}

/** `line` with `text` drawn over it from visible column `x`. The line keeps its width: text past the
 *  right edge is cut, and a negative x cuts the text's left. Half-block art cells are self-contained
 *  (each resets), so drawing over a sprite leaves the cells around the text intact. */
export function overlay(line, x, text) {
  const w = vis(line);
  if (x < 0) { text = dropVisible(text, -x); x = 0; }
  const tw = Math.min(vis(text), w - x);
  if (tw <= 0) return line;
  if (vis(text) > tw) text = cut(text, tw);
  const head = cut(line, x), pad = ' '.repeat(Math.max(0, x - vis(head)));
  const tail = dropVisible(line, x + tw);
  return `${head}${pad}${text}${useColor ? RESET : ''}${tail}`;
}

/** Draw `text` at (x, y) on the canvas; nothing when y is off it. */
export function put(c, x, y, text) {
  if (y < 0 || y >= c.length || !text || !Number.isFinite(x)) return;
  c[y] = overlay(c[y], x, text);
}

/** Draw `lines` down from (x, y). */
export function putLines(c, x, y, lines) {
  for (let i = 0; i < lines.length; i++) put(c, x, y + i, lines[i]);
}

/** Draw `text` so that its right edge sits at column `right`. */
export function putRight(c, right, y, text) {
  put(c, right - vis(text), y, text);
}

/** Draw `text` centred on column `mid`. */
export function putCentred(c, mid, y, text) {
  put(c, Math.round(mid - vis(text) / 2), y, text);
}

/** The ground line: a dark run of low blocks with a bump every so often, so the stage has a floor. */
export function floorLine(W, paint) {
  if (process.env.AZSH_ASCII) return paint('_'.repeat(W));
  let s = '';
  for (let x = 0; x < W; x++) s += (x * 7) % 23 === 5 ? '▂' : '▁';
  return paint(s);
}

// ---- plates, casts and auras: what hangs under a sprite on any stage, and what a frame row reuses --------

/** A unit's plate: name, level and class or rank (the faced foe marked); HP; power. `small` keeps to the
 *  first two. Every line is `plateW` wide. */
export function plateLines(app, v, { isPlayer, focused, friend, small, dead, barW, plateW, rank = 0 }) {
  const paint = dead ? gray : isPlayer ? green : friend ? cyan : focused ? red : yellow;
  const tag = isPlayer ? dim(className(app.ch.cls)) : RANK_WORD[rank] ? orange(RANK_WORD[rank]) : '';
  let head = `${paint(bold(v.name))}  ${dim(`L${v.level}`)}${tag ? `  ${tag}` : ''}${dead ? gray('  dead') : ''}`;
  head = focused && !dead ? `${fit(head, plateW - 10)} ${dim('◀ target')}` : fit(head, plateW);
  const hp = `${bar(v.hp, v.maxHp, barW, dead ? gray : v.hp / Math.max(1, v.maxHp) < 0.25 ? red : green)} ${(dead ? gray : (t) => t)(String(v.hp))}${dim(`/${v.maxHp}`)}`;
  if (small) return [head, fit(hp, plateW)];
  const pp = POWER_PAINT[v.powerType] ?? cyan;
  const power = v.maxPower > 0 && !dead ? `${bar(v.power, v.maxPower, barW, pp)} ${pp(String(v.power))}${v.powerType !== 'mana' ? dim(` ${v.powerType}`) : ''}` : '';
  return [head, fit(hp, plateW), fit(power, plateW)];
}

/** A number in up to four cells: 999, 1.2k, 12k, 123k. */
export function shortNum(n) {
  n = Math.round(n);
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

/**
 * The narrow plate of a crowded stage, `w` wide: the name (a party member's role letter first, the faced foe
 * red), the HP bar with its percent, the power bar with its figure (blank for a unit without power or dead).
 * The bars are what the plate is for, so nothing else squeezes in; the level and the rank go when `w` is short.
 */
export function narrowPlate(app, v, { isPlayer, focused, friend, dead, role, rank = 0, w }) {
  const paint = dead ? gray : isPlayer ? green : friend ? cyan : focused ? red : yellow;
  const tag = friend || isPlayer ? `${ROLE_GLYPH[role] ?? dim('·')} ` : '';
  const after = dead ? '' : focused ? red(' ◀') : RANK_WORD[rank] && w >= 18 ? `  ${orange(RANK_WORD[rank])}` : w >= 16 ? `  ${dim(`L${v.level}`)}` : '';
  const room = w - vis(tag) - vis(after);
  const head = `${tag}${paint(bold(cut(v.name, Math.max(1, room))))}${after}`;
  const hp = `${bar(v.hp, v.maxHp, w - 4, dead ? gray : v.hp / Math.max(1, v.maxHp) < 0.25 ? red : green)}${(dead ? gray : (t) => t)(fit(`${Math.round((100 * v.hp) / Math.max(1, v.maxHp))}%`, 4, true))}`;
  const pp = POWER_PAINT[v.powerType] ?? cyan;
  const power = v.maxPower > 0 && !dead ? `${bar(v.power, v.maxPower, w - 5, pp)}${pp(fit(shortNum(v.power), 5, true))}` : '';
  return [fit(head, w), fit(hp, w), fit(power, w)];
}

/** The state row of a narrow plate, `w` wide: a cast bar that fills under the spell's name (a channel drains
 *  it), else crowd control, the cast just done (castSlot), stealth, or "dead"; empty when idle. */
export function narrowState(v, now, w, recent) {
  if (v.hp <= 0) return gray('dead');
  if (v.casting) {
    const { prog, left } = castProgress(v.casting, now);
    const secs = w >= 14 ? ` ${(left / 1000).toFixed(1)}s` : '';
    const text = fit(cut(v.casting.name, w - secs.length), w - secs.length);
    const filled = Math.round(prog * vis(text));
    return `${inverse(yellow(text.slice(0, filled)))}${yellow(text.slice(filled))}${dim(secs)}`;
  }
  if (v.controlled) return red(cut(v.controlled.control, w));
  const last = freshCast(recent, now);
  if (last) return cyan(bold(cut(last.name, w)));
  if (v.stealthed) return dim('stealthed');
  return '';
}

/** The aura strip under a plate: short buffs then debuffs in the order they first showed up. With icons
 *  three rows (the icon's two, then its time or stacks); without, one row of names. */
export function auraRows(app, mem, v, key, plateW, icons) {
  if (!icons) return [cut(auraText(app, mem, v, key), plateW)];
  const order = mem.auraOrder.get(key) ?? new Map();
  mem.auraOrder.set(key, order);
  const placed = (list) => {
    for (const a of list) if (!order.has(a.spellId)) order.set(a.spellId, order.size);
    return [...list].sort((a, b) => order.get(a.spellId) - order.get(b.spellId));
  };
  const short = v.buffs.filter((a) => a.remainingMs != null && a.remainingMs < SHORT_BUFF_MS);
  const all = [...placed(short).slice(0, 6).map((a) => [a, green]), ...placed(v.debuffs).slice(0, 6).map((a) => [a, red])].slice(0, Math.floor((plateW + 1) / 5));
  const rows = ['', '', ''];
  for (const [a, paint] of all) {
    const sp = app.ds.spell(a.spellId);
    const art = iconArt(sp?.icon, 4);
    const name = sp?.name ?? String(a.spellId);
    rows[0] += `${art ? art[0] : paint(fit(name, 4))} `;
    rows[1] += `${art ? art[1] : paint(fit(name.slice(4), 4))} `;
    rows[2] += `${a.stacks > 1 ? yellow(fit(`x${a.stacks}`, 4)) : paint(fit(a.remainingMs != null ? auraTime(a.remainingMs).trim() : '', 4))} `;
  }
  return rows;
}

export const CAST_NAME_MS = 2000;  // a cast just done keeps its name in the cast slot this long (fight time)
export const CAST_TRAIL_MS = 8000; // and its icon in the trail beside it this long, greyed for the second half

/** The cast bar's progress and seconds left, 0..1. */
function castProgress(casting, now) {
  const total = Math.max(1, casting.endsAt - casting.startedAt);
  const left = Math.max(0, casting.endsAt - now);
  return { prog: Math.max(0, Math.min(1, casting.channeled ? left / total : 1 - left / total)), left };
}

/** The last cast while its icon is still in the trail, with `fresh` set while it keeps its name lit. `recent`
 *  is the unit's casts, newest first ({ t, spellId, name, instant }, noteCasts in tuiFight). */
function lastCast(recent, now) {
  const r = recent?.[0];
  return r && now - r.t < CAST_TRAIL_MS ? { ...r, fresh: now - r.t < CAST_NAME_MS } : null;
}
const freshCast = (recent, now) => { const r = lastCast(recent, now); return r?.fresh ? r : null; };

/** The cast slot's text: a cast bar, else crowd control, else the cast just done (an instant says so, the
 *  casts before it trail after it), else stealth, else the last cast gone dim; empty when idle. */
export function castSlot(v, now, recent) {
  if (v.casting) {
    const { prog, left } = castProgress(v.casting, now);
    return `${fit(yellow(v.casting.name), 14)} ${bar(prog, 1, 10, yellow)} ${dim(`${(left / 1000).toFixed(1)}s`)}`;
  }
  if (v.controlled) return red(v.controlled.control);
  const last = lastCast(recent, now);
  if (!last || (!last.fresh && v.stealthed)) return v.stealthed ? dim('stealthed') : '';
  const before = recent.slice(1).filter((r) => now - r.t < CAST_TRAIL_MS).map((r) => r.name);
  const trail = before.length ? dim(`  ‹ ${before.join(' ‹ ')}`) : '';
  return last.fresh ? `${cyan(bold(last.name))}${last.instant ? dim(' instant') : ''}${trail}` : `${dim(last.name)}${trail}`;
}

/**
 * The cast slot two rows tall and `w` wide, where icons draw: the spell's icon, its name beside it and under
 * the name the cast bar (a cast in progress) or "instant" (one just gone off, for CAST_NAME_MS; after that the
 * name stays dim). The icons of the casts before it trail off to the right, newest first, grey once they are
 * half way out, like an aura strip of what you pressed. Crowd control and stealth take the lead as castSlot has them.
 */
export function castRows(app, v, recent, now, w) {
  const spell = (id) => app.ds.spell(id);
  let lead = null, top = '', under = '';
  const last = lastCast(recent, now);
  if (v.casting) {
    const { prog, left } = castProgress(v.casting, now);
    lead = { spellId: v.casting.spellId, since: v.casting.startedAt };
    top = yellow(v.casting.name);
    under = `${bar(prog, 1, 10, yellow)} ${dim(`${(left / 1000).toFixed(1)}s`)}`;
  } else if (v.controlled) top = red(v.controlled.control);
  else if (last && (last.fresh || !v.stealthed)) {
    lead = { spellId: last.spellId, since: last.t, gray: now - last.t > CAST_TRAIL_MS / 2 };
    top = !last.fresh ? dim(last.name) : now - last.t > CAST_NAME_MS / 2 ? cyan(last.name) : cyan(bold(last.name));
    under = last.fresh && last.instant ? dim('instant') : '';
  } else if (v.stealthed) top = dim('stealthed');
  const nameW = Math.min(16, Math.max(8, w - 5));
  const art = lead ? iconArt(spell(lead.spellId)?.icon, 4, lead.gray ? 'gray' : '') : null;
  const rows = art ? [`${art[0]} ${fit(cut(top, nameW), nameW)}`, `${art[1]} ${fit(cut(under, nameW), nameW)}`] : [fit(cut(top, nameW + 5), nameW + 5), fit(cut(under, nameW + 5), nameW + 5)];
  // The trail: what went off before the lead (a channel is in `recent` from its first tick, so it is the lead,
  // not its own trail).
  const room = Math.floor((w - vis(rows[0]) - 1) / 5);
  const trail = (recent ?? []).filter((r) => now - r.t < CAST_TRAIL_MS && !(lead && r.spellId === lead.spellId && r.t >= lead.since)).slice(0, Math.max(0, room));
  for (const r of trail) {
    const old = now - r.t > CAST_TRAIL_MS / 2;
    const ic = iconArt(spell(r.spellId)?.icon, 4, old ? 'gray' : '');
    rows[0] += ` ${ic ? ic[0] : dim(fit(r.name, 4))}`;
    rows[1] += ` ${ic ? ic[1] : dim(fit(r.name.slice(4), 4))}`;
  }
  return rows.every((l) => !strip(l).trim()) ? ['', ''] : rows;
}

/** Short buffs green then debuffs red, in the order they first showed up, so a refreshed one keeps its place. */
export function auraText(app, mem, v, key) {
  const order = mem.auraOrder.get(key) ?? new Map();
  mem.auraOrder.set(key, order);
  const placed = (list) => {
    for (const a of list) if (!order.has(a.spellId)) order.set(a.spellId, order.size);
    return [...list].sort((a, b) => order.get(a.spellId) - order.get(b.spellId));
  };
  const aura = (a, paint) => paint(`${app.ds.spell(a.spellId)?.name ?? a.spellId}${a.stacks > 1 ? ` x${a.stacks}` : ''}${a.remainingMs != null ? dim(` ${auraTime(a.remainingMs)}`) : ''}`);
  const short = v.buffs.filter((a) => a.remainingMs != null && a.remainingMs < SHORT_BUFF_MS);
  return [...placed(short).slice(0, 6).map((a) => aura(a, green)), ...placed(v.debuffs).slice(0, 6).map((a) => aura(a, red))].join('  ');
}

/** Aura time left at a fixed width: "  9s", " 12s", " 30m". */
export function auraTime(ms) {
  const s = Math.ceil(ms / 1000);
  return (s < 60 ? `${s}s` : `${Math.ceil(s / 60)}m`).padStart(3);
}

// ---- what moves over a stage ------------------------------------------------------------------------------

/**
 * The engine's missiles in flight (spells with a travel speed: a Fireball, an arrow; never a strike or a
 * seal): a glyph with a two-dot trail crossing from the caster's column to the target's, the spell's name
 * over it. A column is `{ key, isPlayer, x, plateW, art, ax, aw }`; `laneRow` is the row the glyphs fly on.
 */
export function putMissiles(c, s, cols, now, laneRow, spellName) {
  const colOf = (side) => cols.find((x) => x.key === side || (side === 'player' && x.isPlayer));
  for (const m of s.missilesInFlight?.() ?? []) {
    if (now < m.launchAt || m.landAt <= m.launchAt) continue;
    const from = colOf(m.casterSide), to = colOf(m.targetSide);
    if (!from || !to || from === to) continue;
    const edge = (col, side) => (side === 'r' ? (col.art ? col.ax + col.aw : col.x + col.plateW) + 1 : (col.art ? col.ax : col.x) - 1);
    const rightward = from.x < to.x;
    const a = edge(rightward ? from : to, 'r'), b = edge(rightward ? to : from, 'l');
    const glyph = rightward ? `${dim('·  ·')}  ${yellow(bold('✦'))}` : `${yellow(bold('✦'))}  ${dim('·  ·')}`;
    const run = Math.max(0, b - a - vis(glyph)), step = Math.floor(Math.min(1, (now - m.launchAt) / (m.landAt - m.launchAt)) * run);
    const x = rightward ? a + step : b - vis(glyph) - step;
    put(c, x, laneRow, glyph);
    const name = spellName(m.spellId);
    if (name && laneRow > 0) put(c, x + (rightward ? 2 : 0), laneRow - 1, dim(cut(name, Math.max(0, b - a))));
  }
}

/** The hits and heals still up on a column's unit, rising one row per POP_RISE_MS above its head, centred on
 *  the sprite (above the plate when it has none); the older half of a pop's life is dim. */
export function putPopsAbove(c, col, pops, now, zone) {
  pops.forEach((p, i) => {
    const text = now - p.t > POP_MS / 2 ? dim(p.text) : p.text;
    const top = col.art ? col.top : zone;
    const mid = col.art ? col.ax + col.aw / 2 : col.x + col.plateW / 2;
    put(c, Math.round(mid - vis(text) / 2), top - 1 - Math.floor((now - p.t) / POP_RISE_MS) - i, text);
  });
}

// ---- the drops after a win -------------------------------------------------------------------------

const TOAST_IN_MS = 200;  // a drop slides in from the right over this long (phonecraft's loot toast fades in)
const TOAST_SLIDE = 6;    // columns it slides
const TOAST_OUT_MS = 400; // and the stack greys out over the last this long of the hold
const POP_GAP = 7;        // columns left for the last hit's number between the stack and the corpse
// The pack has the copper and silver piles; gold has none and draws as a yellow dot.
const coinIcon = (copper) => (copper < 100 ? 'inv_misc_coin_05' : copper < 10_000 ? 'inv_misc_coin_03' : null);

/** What the foe dropped, items then the coin: each with its icon name and its line in the quality colour. */
export function lootToasts(app, hold) {
  const out = hold.loot.map((d) => { const it = app.ds.item(d.item); return { icon: it?.icon, text: `${itemText(it, String(d.item))}${d.count > 1 ? dim(` x${d.count}`) : ''}` }; });
  if (hold.copper) out.push({ icon: coinIcon(hold.copper), coin: true, text: coinText(hold.copper) });
  return out;
}

/** The drops as toasts stacked on the right, like loot in combat text. Each slides out from the right a beat
 *  after the one above, icon beside the name, and the stack greys out as the hold ends. Drawn over `lines`
 *  (the stage) above the plates, so the 0 under the foe's feet stays in view. */
export function putLootToasts(app, lines, hold, W, now) {
  const drops = lootToasts(app, hold);
  if (!drops.length) return;
  const icons = iconsOn(), rowH = icons ? 2 : 1, top = 1;
  const textW = Math.min(28, Math.max(...drops.map((d) => vis(d.text))));
  const boxW = (icons ? 5 : 2) + textW, lane = lines.lane;
  const room = Math.max(1, Math.floor(((lane?.rows ?? Math.floor(lines.length * 0.55)) - top) / rowH));
  const shown = drops.length > room ? [...drops.slice(0, room - 1), { more: drops.length - room + 1 }] : drops;
  // Where: the duel's open lane against the corpse, clear of the killing blow's number still rising off its
  // shoulder; else open ground on the stage's right half (not under sixel, whose pictures are blank cells in
  // the text); else the right edge on a cleared card. A win leaves only corpses on the right, so the card
  // covers the dead, never the party.
  const fits = (gap) => lane && lane.right - lane.left - 3 - gap >= boxW;
  const open = fits(POP_GAP) ? lane.right - 1 - POP_GAP - boxW : fits(0) ? lane.right - 1 - boxW : sixelOn() ? -1 : openGround(lines, boxW, shown.length * rowH, top, W);
  const card = open < 0, x0 = card ? W - boxW - 2 : open;
  const fading = now > hold.until - TOAST_OUT_MS;
  shown.forEach((d, i) => {
    const age = now - (i + 1) * hold.stagger;
    if (age < 0) return;
    const sliding = age < TOAST_IN_MS, x = x0 + (sliding ? Math.round((1 - age / TOAST_IN_MS) * TOAST_SLIDE) : 0), y = top + i * rowH;
    const quiet = fading || sliding;
    if (card) for (let r = y - (i ? 0 : 1); r < y + rowH; r++) put(lines, x - 1, r, ' '.repeat(boxW + 2));
    if (d.more) { put(lines, x, y, dim(`+${d.more} more`)); return; }
    const text = cut(quiet ? dim(strip(d.text)) : d.text, textW);
    const dot = d.coin ? (quiet ? dim('●') : yellow('●')) : dim('•');
    const art = icons && d.icon ? iconArt(d.icon, 4, quiet ? 'gray' : '') : null;
    if (art) putLines(lines, x, y, [`${art[0]} ${text}`, art[1]]);
    else put(lines, x + (icons ? 3 : 0), y, `${dot} ${text}`); // no art: the mark sits by the name, the sprite shows round it
  });
}

/** The rightmost column on the stage's right half where a box `w` x `h` from row `top`, with a column of air
 *  either side, covers only blank cells; -1 when there is none. */
function openGround(lines, w, h, top, W) {
  const rows = lines.slice(top, top + h).map(strip);
  if (rows.length < h) return -1;
  for (let x = W - w - 2; x >= Math.floor(W * 0.45); x--) if (rows.every((r) => !r.slice(x - 1, x + w + 1).trim())) return x;
  return -1;
}
