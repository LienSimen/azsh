// The party stage: a dungeon pull or a squad fight drawn the way the duel is, every body small on one floor.
// The party stands down the left (you in your gear, the companions in theirs, the pets a size under), the pack
// down the right, and each column stands where its unit really is: its yards projected onto the line from
// where the party opened to where the pack stood, so the tank runs in, the healer hangs back and a mob that
// chases a caster crosses over. Under every sprite a narrow plate (name, HP, power) and a state row (a cast
// bar filling under the spell's name, crowd control, dead); hits rise over the head; missiles cross the lane.
// The boxes shrink with the crowd: the widest size whose rows and columns fit, down to the smallest, after
// which the furthest foes and the pets are hidden and counted on the floor.
import { dim, gray, fit } from './text.mjs';
import { SIZES, canvas, put, putLines, putRight, floorLine, narrowPlate, narrowState, auraRows, putMissiles, putPopsAbove, POP_MS, LUNGE_MS } from './tuiStage.mjs';
import { creatureArt, artWidth } from './modelArt.mjs';
import { paperdollArt } from './paperdoll.mjs';
import { playerArt } from './tuiViews.mjs';
import { iconsOn } from './iconArt.mjs';
import { allyIndexOfSide } from '../engine/core/events.ts';
import { combatDistanceYd, DEFAULT_OPEN_YD, MELEE_CONTACT_YD } from '../engine/combat/combatGeometry.ts';

const GAP = 1;        // columns between two columns of the same side
const LANE = 6;       // columns kept open between a party column and a foe column, for the glyphs that cross
const PLATE_MIN = 9;  // a plate's narrowest: a 5-cell bar and "100%"
const PLATE_FULL = 14; // and its widest when the stage has width to spare: a 10-cell bar, a 12-letter name
const SIZE_ORDER = ['xs', 's', 'm', 'l'];
// Who stands nearest the foes among units on the same spot (the melee pile opens on one): the healer last.
const ROLE_RANK = { healer: 0, damage: 2, tank: 3 };

/** The companion an ally seat holds: ally_N is squad[N] (the humans first), else the one of that name. */
function companionOf(app, v) {
  const squad = app.g.state.squad ?? [];
  const i = allyIndexOfSide(v.side);
  const byIndex = i >= 0 && i < squad.length ? squad[i] : null;
  return byIndex?.name === v.name ? byIndex : squad.find((c) => c.name === v.name) ?? byIndex;
}

/** A unit's sprite in a box: you in your gear, a creature by its display id, a companion in its gear. */
function spriteOf(app, u, cols, rows) {
  if (u.isPlayer) return playerArt(app, cols, rows)?.lines ?? null;
  if (u.v.creatureEntry != null) return creatureArt(app.ds.creature(u.v.creatureEntry)?.displayId, cols, rows);
  const comp = u.friend ? companionOf(app, u.v) : null;
  return comp ? paperdollArt(comp, cols, rows) : null;
}

/** The box a unit gets when the big ones get `size`: pets a size under, a boss a size over. */
function sizeOf(u, size) {
  const i = SIZE_ORDER.indexOf(size);
  if (u.small) return SIZE_ORDER[Math.max(0, i - 1)];
  if (u.rank === 3) return SIZE_ORDER[Math.min(SIZE_ORDER.length - 1, i + 1)];
  return size;
}

/**
 * The party stage W x H: H lines each W wide, or null when the rows or the columns leave the sprites no
 * room (the frames list draws instead). `inline` is the autopilot's run panel (the ability bar's keys dim).
 */
export function partyStage(app, ctl, W, H, { inline }) {
  const s = ctl.session, now = ctl.clock(), mem = ctl.frames;
  const pv = s.playerView(), pet = s.petView(), focus = s.enemyView();
  const icons = iconsOn();
  const petSides = new Set((s.companionPets?.() ?? []).map((p) => p.side));
  const rankOf = (v) => { const c = v.creatureEntry != null ? app.ds.creature(v.creatureEntry) : null; return c?.rank ?? c?.scaling?.rank ?? 0; };
  const order = (v, fallback) => ROLE_RANK[v.groupRole] ?? (v.mode === 'ranged' ? 1 : fallback);
  const units = [
    { v: pv, key: 'player', isPlayer: true, friend: true, role: pv.groupRole, order: order(pv, 2.5) },
    ...(pet ? [{ v: pet, key: pet.side ?? pet.name, friend: true, small: true, order: 2 }] : []),
    ...s.alliesView().map((v) => ({ v, key: v.side, friend: true, small: petSides.has(v.side) || !!v.summoned, role: v.groupRole, order: order(v, 2) })),
    ...s.enemiesView().map((v) => ({ v, key: v.side, foe: true, focused: v === focus, rank: rankOf(v), order: v === focus ? 0 : 1 })),
  ];
  // Rows the scene keeps whatever the sprites get: the plate (3), the state row, the floor and the ability bar
  // (dropped under auto-play when rows are short); the aura strip only when the sprites still get a box after it.
  const barLines = ctl.abilityRows(W, W >= 140 ? 6 : 4, { live: !inline });
  let barRows = barLines.length;
  const auraH = icons ? 3 : 1;
  let fixed = 3 + 1 + 1 + barRows;
  if (H - fixed < SIZES.xs[1] && ctl.auto) { barRows = 0; fixed = 5; }
  const showAuras = H - fixed - auraH >= SIZES.s[1];
  if (showAuras) fixed += auraH;
  const artRows = H - fixed;
  if (artRows < SIZES.xs[1]) return null;
  // The widest size whose rows fit and whose columns fit the width: every column its sprite's width or a plate
  // at least PLATE_MIN wide, a gap between neighbours, one lane between the sides, a margin at each edge. When
  // even the smallest does not fit, the foes you do not face go first (from the far end), then the pets, then
  // the party's tail, and the floor counts them.
  const margin = Math.max(GAP, Math.floor(W / 40));
  const columnOf = (u, size) => {
    const box = SIZES[sizeOf(u, size)];
    const art = spriteOf(app, u, box[0], Math.min(box[1], artRows));
    const cw = Math.max(PLATE_MIN, art ? artWidth(art) : 0);
    return { ...u, art, aw: artWidth(art), cw, plateW: cw };
  };
  const widthOf = (list) => list.reduce((n, col) => n + col.cw, 0) + (list.length - 1) * GAP + (LANE - GAP) + 2 * margin;
  let cols = null, hidden = 0;
  for (const size of ['m', 's', 'xs'].filter((k) => SIZES[k][1] <= artRows)) {
    const all = units.map((u) => columnOf(u, size));
    if (widthOf(all) <= W) { cols = all; break; }
    if (size !== 'xs') continue;
    const drop = (pick) => { const i = all.findLastIndex(pick); if (i < 0) return false; all.splice(i, 1); hidden++; return true; };
    while (widthOf(all) > W && (drop((u) => u.foe && !u.focused) || drop((u) => u.small) || drop((u) => u.friend && !u.isPlayer)));
    if (widthOf(all) <= W) cols = all;
  }
  if (!cols) return null;
  // Width to spare goes to the plates, up to PLATE_FULL each, so names and bars get longer as the crowd thins.
  const spare = Math.floor((W - widthOf(cols)) / cols.length);
  if (spare > 0) for (const col of cols) { col.cw = Math.max(col.cw, Math.min(col.cw + spare, PLATE_FULL)); col.plateW = col.cw; }
  // Where each unit stands in its half: by its distance in yards to the nearest living unit of the other side,
  // from the far edge at the widest gap this fight has seen to the lane at melee contact (the duel's rule, one
  // unit at a time). The place it opened at is its own; the closing since then goes to whoever walked it, so
  // a mob that runs onto the healer crosses to the lane while the healer stays put, and a mage walking into
  // range slides in while its mob stands. Melee units park all round a mob, so this is read off distances, not
  // bearings: a rogue behind its target still stands on the party's side.
  const posOf = (u) => s.unitPosYd?.(u.key);
  mem.openPos ??= new Map(); mem.openD ??= new Map();
  const nearest = (u) => {
    let best = null;
    for (const o of units) {
      if (!!o.friend === !!u.friend || o.v.hp <= 0) continue;
      const d = combatDistanceYd(posOf(u), posOf(o));
      if (d != null && (!best || d < best.d)) best = { o, d };
    }
    return best;
  };
  const near = new Map(units.map((u) => [u.key, nearest(u)]));
  mem.openYd = Math.max(mem.openYd ?? DEFAULT_OPEN_YD, ...[...near.values()].map((n) => n?.d ?? 0));
  const frac = (d) => Math.max(0, Math.min(1, (d - MELEE_CONTACT_YD) / Math.max(1, mem.openYd - MELEE_CONTACT_YD)));
  const walked = (u) => combatDistanceYd(mem.openPos.get(u.key), posOf(u)) ?? 0;
  const closingOf = (u) => {
    const n = near.get(u.key), p = posOf(u);
    if (p && !mem.openPos.has(u.key)) mem.openPos.set(u.key, { ...p });
    if (!n) return mem.openD.has(u.key) ? 1 - frac(mem.openD.get(u.key)) : 1; // no positions: everyone at the lane
    if (!mem.openD.has(u.key)) mem.openD.set(u.key, n.d);
    const w = walked(u), wo = walked(n.o);
    const share = w + wo > 0 ? w / (w + wo) : u.friend ? 1 : 0;
    const c0 = 1 - frac(mem.openD.get(u.key));
    return Math.max(0, Math.min(1, c0 + (1 - frac(n.d) - c0) * share));
  };
  for (const col of cols) col.c = closingOf(col);
  // The party's half and the pack's, the free width shared by head count, the lane between. In each half the
  // columns stand by their closing, the nearest to the lane innermost; on the same spot the healer, the
  // ranged, the melee, then the tank, and the foe you face before the rest. Then nobody overlaps: a column
  // is pushed away from the one before it, and what runs past the half's far edge is pushed back in turn.
  const side = (friend) => cols.filter((col) => !!col.friend === friend);
  const widthOfSide = (list) => list.reduce((n, col) => n + col.cw, 0) + Math.max(0, list.length - 1) * GAP;
  const friends = side(true), foes = side(false);
  const free = Math.max(0, W - 2 * margin - LANE - widthOfSide(friends) - widthOfSide(foes));
  const partyR = margin + widthOfSide(friends) + Math.floor((free * friends.length) / Math.max(1, cols.length));
  const foeL = Math.min(W - margin - widthOfSide(foes), partyR + LANE);
  const q = (col) => Math.round(col.c * 50);
  friends.sort((a, b) => q(a) - q(b) || a.order - b.order);
  foes.sort((a, b) => q(b) - q(a) || a.order - b.order);
  const place = (list, L, R) => {
    for (const col of list) col.x = col.friend ? L + col.c * (R - col.cw - L) : R - col.cw - col.c * (R - col.cw - L);
    for (let i = 1; i < list.length; i++) list[i].x = Math.max(list[i].x, list[i - 1].x + list[i - 1].cw + GAP);
    for (let i = list.length - 1; i >= 0; i--) list[i].x = Math.min(list[i].x, i === list.length - 1 ? R - list[i].cw : list[i + 1].x - GAP - list[i].cw);
    for (const col of list) col.x = Math.max(0, Math.round(col.x));
  };
  place(friends, margin, partyR);
  place(foes, foeL, W - margin);
  const zone = artRows, stateRow = zone + 3, auraTop = zone + 4, floorRow = auraTop + (showAuras ? auraH : 0), barTop = floorRow + 1;
  const c = canvas(W, H);
  for (const col of cols) {
    const v = col.v, dead = v.hp <= 0;
    // The sprite stands on its plate, centred over it; a swing lunges it two columns toward the other side.
    if (col.art) {
      const lunge = now - (mem.lunge?.get(col.key) ?? -Infinity) < LUNGE_MS ? (col.friend ? 2 : -2) : 0;
      col.ax = col.x + Math.max(0, Math.floor((col.cw - col.aw) / 2)) + lunge; col.top = zone - col.art.length;
      putLines(c, col.ax, col.top, col.art);
    }
    putLines(c, col.x, zone, narrowPlate(app, v, { ...col, dead, w: col.cw }));
    const state = narrowState(v, now, col.cw);
    if (state) put(c, col.x, stateRow, state);
    if (showAuras && !col.small && !dead) putLines(c, col.x, auraTop, auraRows(app, mem, v, col.key, col.cw, icons));
    putPopsAbove(c, col, (mem.pops.get(col.key) ?? []).filter((p) => now - p.t < POP_MS), now, zone);
  }
  putMissiles(c, s, cols, now, Math.max(0, zone - 1 - Math.floor(Math.min(artRows, 10) / 2)), (id) => app.ds.spell(id)?.name);
  c[floorRow] = floorLine(W, gray);
  if (hidden) putRight(c, W - 1, floorRow, dim(` +${hidden} more in the fight `));
  if (barRows) putLines(c, 0, barTop, barLines);
  return c.map((l) => fit(l, W));
}
