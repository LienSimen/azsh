// KNOCK_BACK (98) — the combat apply. Classic non-player units are a server no-op, so the geometry
// session models the planar landing of the same ballistic trajectory instead of an intent only.

import type { SpellDef } from '../../data/schema.ts';
import type { Side } from '../core/events.ts';
import type { CombatPosYd } from './combatGeometry.ts';
import { combatDistanceYd } from './combatGeometry.ts';
import { MOVEMENT_GRAVITY } from '../spells/interpreter/handlers/shared.ts';
import { detHypot } from '../core/detMath.ts';
import { projectWorld, type MapPct, type Viewport } from '../../world/dungeonMapProjection.ts';
import {
  cellOfPct,
  lineOfSightPct,
  snapToFloor,
  type NavGrid,
} from '../../world/dungeonNav.ts';

/** Floorplan nav + viewport — dest is clamped on this mask, not teleported through it. */
export type KnockBackNav = {
  grid: NavGrid;
  viewport: Viewport;
};

function keepLaunchZ(p: CombatPosYd, from: CombatPosYd): CombatPosYd {
  return from.z != null && Number.isFinite(from.z) ? { x: p.x, y: p.y, z: from.z } : { x: p.x, y: p.y };
}

/** Search-grid walkable on `band`. Same lattice as dungeonNav cellOfPct. */
function onBand(grid: NavGrid, band: number, pct: MapPct): boolean {
  if (band < 0 || band >= grid.nBands) return false;
  const c = cellOfPct(grid, pct);
  if (c.x < 0 || c.y < 0 || c.x >= grid.res || c.y >= grid.res) return false;
  return grid.cells[band * grid.res * grid.res + c.y * grid.res + c.x] === 1;
}

// Last world point on the start storey along from→dest before a blocked cell. GetHitPosition analog — stop
// at the first hit; do not land on another storey.
export function clampKnockBackToNav(
  from: CombatPosYd,
  dest: CombatPosYd,
  nav: KnockBackNav,
): CombatPosYd {
  const { grid, viewport } = nav;
  const fromPct = projectWorld(viewport, from);
  const destPct = projectWorld(viewport, dest);
  const start = snapToFloor(grid, { pct: fromPct, z: from.z });
  if (!start) return keepLaunchZ(from, from);

  const destSnap = snapToFloor(grid, { pct: destPct, z: from.z });
  if (
    onBand(grid, start.band, destPct)
    && destSnap != null
    && destSnap.band === start.band
    && lineOfSightPct(grid, start.band, fromPct, destPct)
  ) {
    return keepLaunchZ(dest, from);
  }

  const dx = dest.x - from.x;
  const dy = dest.y - from.y;
  const dist = detHypot(dx, dy);
  if (!(dist > 0)) return keepLaunchZ(from, from);

  // Same half-cell fine sampling lineOfSightPct uses (dungeonNav.ts:718).
  const fine = grid.fine.res - 1 || 1;
  const spanYd = viewport.box[1] - viewport.box[0];
  const stepYd = (spanYd / fine) / 2;
  const n = Math.max(1, Math.ceil(dist / stepYd));
  let last = keepLaunchZ(from, from);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const p = keepLaunchZ({ x: from.x + dx * t, y: from.y + dy * t }, from);
    const pct = projectWorld(viewport, p);
    if (!onBand(grid, start.band, pct)) break;
    if (!lineOfSightPct(grid, start.band, fromPct, pct)) break;
    const snap = snapToFloor(grid, { pct, z: from.z });
    if (!snap || snap.band !== start.band) break;
    last = p;
  }
  return last;
}

/** Planar yards for a knock-back with sourced horizontal/vertical speeds. */
function knockBackDistanceYd(horizontal: number, vertical: number): number {
  const h = Number(horizontal);
  const v = Number(vertical);
  if (!(h > 0) || !(v > 0) || !Number.isFinite(h) || !Number.isFinite(v)) return 0;
  // Flat-ground flight time under constant gravity: t = 2v/g.
  const flightTime = (2 * v) / MOVEMENT_GRAVITY;
  if (!(flightTime > 0) || !Number.isFinite(flightTime)) return 0;
  return h * flightTime;
}

// Push `from` away from `origin` by `distanceYd` yards (planar). When co-located, no direction exists —
// leave position unchanged. Direction matches Unit::KnockBackFrom: caster→target angle (away from caster).
function knockBackPosition(
  origin: CombatPosYd,
  from: CombatPosYd,
  distanceYd: number,
): CombatPosYd {
  if (!(distanceYd > 0) || !Number.isFinite(distanceYd)) return keepLaunchZ(from, from);
  const dx = from.x - origin.x;
  const dy = from.y - origin.y;
  const len = detHypot(dx, dy);
  if (!(len > 0)) return keepLaunchZ(from, from);
  const ux = dx / len;
  const uy = dy / len;
  return keepLaunchZ({ x: from.x + ux * distanceYd, y: from.y + uy * distanceYd }, from);
}

// Planar landing of a knock-back. With `nav`, dest is clamped to the last walkable cell on the start storey
// — GetHitPosition analog, not a teleport through the wall.
function resolveKnockBackLanding(
  origin: CombatPosYd,
  from: CombatPosYd,
  distanceYd: number,
  nav?: KnockBackNav,
  clampLanding?: (from: CombatPosYd, dest: CombatPosYd) => CombatPosYd,
): CombatPosYd {
  const dest = knockBackPosition(origin, from, distanceYd);
  if (clampLanding) return clampLanding(from, dest);
  return nav ? clampKnockBackToNav(from, dest, nav) : dest;
}

export interface ApplyKnockBackArgs {
  t: number;
  spell: SpellDef;
  /** Caster (KnockBackFrom m_caster). */
  actor: Side;
  /** unitTarget being pushed. */
  target: Side;
  horizontal: number;
  vertical: number;
  /** Live combat time for rootedUntil check. */
  now: number;
  /** Target rootedUntil (UNIT_STAT_ROOT skip). */
  targetRootedUntil: number;
  posOf: (side: Side | string) => CombatPosYd | undefined;
  setPos: (side: Side | string, p: CombatPosYd) => void;
  /** When set, landing is resolved against the instance floorplan navmask. */
  nav?: KnockBackNav;
  // GetHitPosition analog on the combat nav map / mesh (displaceFloor). Preferred over `nav` when both are
  // present — the session floor is the live dungeon mask.
  clampLanding?: (from: CombatPosYd, dest: CombatPosYd) => CombatPosYd;
  // Drop whatever the target was walking. A landing spot is not where its corridor starts, and a stale
  // claim would walk it straight back off the ledge it was just thrown from.
  displaced?: (side: Side | string) => void;
  push: (e: {
    t: number;
    kind: 'knock_back';
    actor: Side;
    target: Side;
    spellId: number;
    name: string;
    horizontal: number;
    vertical: number;
    distanceYd: number;
  }) => void;
}

// Apply knock-back at the combat surface, returning the distance applied — 0 when it is skipped, when
// there is no geometry, or when both speeds are zero.
export function applyKnockBackEffect(args: ApplyKnockBackArgs): number {
  const {
    t, spell, actor, target, horizontal, vertical,
    now, targetRootedUntil, posOf, setPos, push, nav, displaced, clampLanding,
  } = args;

  // Cite: SpellEffects.cpp:5117–5118 hasUnitState(UNIT_STAT_ROOT) → return.
  if (targetRootedUntil > now) return 0;

  const distanceYd = knockBackDistanceYd(horizontal, vertical);
  const origin = posOf(actor);
  const from = posOf(target);
  if (origin && from && distanceYd > 0) {
    const next = resolveKnockBackLanding(origin, from, distanceYd, nav, clampLanding);
    setPos(target, next);
    displaced?.(target);
  }

  push({
    t,
    kind: 'knock_back',
    actor,
    target,
    spellId: spell.id,
    name: spell.name,
    horizontal,
    vertical,
    distanceYd: origin && from ? distanceYd : 0,
  });
  return distanceYd;
}

/** Observability helper for tests — planar yards after a knock. */
function planarKnockDeltaYd(
  before: CombatPosYd,
  after: CombatPosYd,
): number {
  return combatDistanceYd(before, after) ?? 0;
}
