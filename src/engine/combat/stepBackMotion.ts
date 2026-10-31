// After-cast retreat: lock a walkable heading AWAY from the enemy, then hop along it.
// Live radial-from-center walks THROUGH the mob when you overlap.

import { detHypot } from '../core/detMath.ts';
import type { CombatPosYd } from './combatGeometry.ts';

/** Inside this, unit centers overlap — the live radial is the approach heading, not "back". */
const OVERLAP_YD = 2.5;

/** 80% of asked yards is CMaNGOS's "good enough" collision dest. Object.cpp:1600. */
const GOOD_FRAC = 0.8;
/** Below this the heading is a wall lip, not a retreat. */
const MIN_WALK_YD = 2;

function lockStepBackDir(
  from: CombatPosYd,
  enemy: CombatPosYd,
  lastMoveFrom: CombatPosYd | null,
): { x: number; y: number } {
  const dist = detHypot(from.x - enemy.x, from.y - enemy.y);
  if (lastMoveFrom) {
    const lastD = detHypot(lastMoveFrom.x - enemy.x, lastMoveFrom.y - enemy.y);
    const mx = from.x - lastMoveFrom.x;
    const my = from.y - lastMoveFrom.y;
    const mlen = detHypot(mx, my);
    // We were closing: reverse that heading (back out the way we walked in).
    if (mlen > 0.05 && lastD > dist + 0.05) {
      return { x: -mx / mlen, y: -my / mlen };
    }
    // Overlapped with no clear close: the last place we stood is the safe side.
    if (dist < OVERLAP_YD && lastD > dist + 0.05) {
      const lx = lastMoveFrom.x - enemy.x;
      const ly = lastMoveFrom.y - enemy.y;
      const llen = detHypot(lx, ly);
      if (llen > 0.05) return { x: lx / llen, y: ly / llen };
    }
  }
  if (dist > 0.05) {
    return { x: (from.x - enemy.x) / dist, y: (from.y - enemy.y) / dist };
  }
  return { x: 1, y: 0 };
}

/** Dest is on the retreat half-plane (same side of the enemy as `dir`). */
export function onRetreatSide(
  enemy: CombatPosYd,
  dest: CombatPosYd,
  dir: { x: number; y: number },
): boolean {
  return (dest.x - enemy.x) * dir.x + (dest.y - enemy.y) * dir.y > 0;
}

export function alongDir(
  from: CombatPosYd,
  to: CombatPosYd,
  dir: { x: number; y: number },
): number {
  return (to.x - from.x) * dir.x + (to.y - from.y) * dir.y;
}

function rotate(ux: number, uy: number, c: number, s: number): { x: number; y: number } {
  return { x: ux * c - uy * s, y: ux * s + uy * c };
}

// Lock-time fan: back, then 30/60/90/105 each way. ±90 is the wall-strafe a 75° hop fan
// cannot take (`alongDir` on a back-locked heading is 0). Cite: Object.cpp:1594–1603.
const PICK_FAN: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0.8660254, 0.5], [0.8660254, -0.5],
  [0.5, 0.8660254], [0.5, -0.8660254],
  [0, 1], [0, -1],
  [-0.2588190, 0.9659258], [-0.2588190, -0.9659258],
];

/** Last walkable point along `aim` — GetFirstCollisionPosition, not A*. */
type ClampAlong = (aim: CombatPosYd) => CombatPosYd;

// Probe each heading with a straight-line floor clamp (PathFinder.cpp:802 m_straightLine).
// Pick the one that actually walks, preferring away-from-enemy. Null = cornered.
export function pickStepBackDir(
  from: CombatPosYd,
  enemy: CombatPosYd,
  lastMoveFrom: CombatPosYd | null,
  needYd: number,
  clampAlong: ClampAlong,
): { x: number; y: number } | null {
  if (!(needYd > 0)) return null;
  const base = lockStepBackDir(from, enemy, lastMoveFrom);
  const blen = detHypot(base.x, base.y);
  if (!(blen > 0)) return null;
  const ux = base.x / blen;
  const uy = base.y / blen;
  const z = from.z != null ? { z: from.z } : {};
  const startD = detHypot(from.x - enemy.x, from.y - enemy.y);
  const goodAt = needYd * GOOD_FRAC;
  const minWalk = Math.max(0.5, Math.min(MIN_WALK_YD, needYd * 0.2));
  let best: { x: number; y: number; walk: number; away: number; align: number } | null = null;
  for (const [c, s] of PICK_FAN) {
    const h = rotate(ux, uy, c, s);
    const hlen = detHypot(h.x, h.y);
    if (!(hlen > 0)) continue;
    const dx = h.x / hlen;
    const dy = h.y / hlen;
    const aim: CombatPosYd = { x: from.x + dx * needYd, y: from.y + dy * needYd, ...z };
    const hit = clampAlong(aim);
    const walk = detHypot(hit.x - from.x, hit.y - from.y);
    if (walk < minWalk) continue;
    const away = detHypot(hit.x - enemy.x, hit.y - enemy.y) - startD;
    if (away < -0.25) continue;
    const align = dx * ux + dy * uy;
    const cand = { x: dx, y: dy, walk, away, align };
    if (!best) { best = cand; continue; }
    const aGood = cand.walk >= goodAt;
    const bGood = best.walk >= goodAt;
    if (aGood !== bGood) {
      if (aGood) best = cand;
      continue;
    }
    if (aGood) {
      if (Math.abs(cand.away - best.away) > 0.05) {
        if (cand.away > best.away) best = cand;
      } else if (cand.align > best.align) {
        best = cand;
      }
    } else if (cand.walk > best.walk) {
      best = cand;
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

// Headings tried as literal (cos, sin) pairs off the locked heading — back, then 30, 60 and 75 degrees
// each way. Three headings could not round a corner, and a blocked retreat gates every hostile spell.
const RETREAT_FAN: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0.8660254, 0.5], [0.8660254, -0.5],
  [0.5, 0.8660254], [0.5, -0.8660254],
  [0.2588190, 0.9659258], [0.2588190, -0.9659258],
];

// One hop along the locked heading, fanning outward. Never toward / through the enemy. `tryStep` is a
// clamp-only walk (no A*). Returns the accepted next pos or null.
export function planStepBackHop(
  from: CombatPosYd,
  enemy: CombatPosYd,
  dir: { x: number; y: number },
  hop: number,
  tryStep: (aim: CombatPosYd) => CombatPosYd,
): CombatPosYd | null {
  if (!(hop > 0)) return null;
  const z = from.z != null ? { z: from.z } : {};
  const dlen = detHypot(dir.x, dir.y);
  if (!(dlen > 0)) return null;
  const ux = dir.x / dlen;
  const uy = dir.y / dlen;
  // Scale-free: one tick's hop shrinks with the tick rate, so a fixed 0.05 yd floor
  // rejected legal wide-fan steps outright on a short tick.
  const minGain = Math.max(1e-3, hop * 0.05);
  for (const [c, s] of RETREAT_FAN) {
    const aim: CombatPosYd = {
      x: from.x + (ux * c - uy * s) * hop,
      y: from.y + (ux * s + uy * c) * hop,
      ...z,
    };
    const next = tryStep(aim);
    if (alongDir(from, next, dir) < minGain) continue;
    if (!onRetreatSide(enemy, next, dir)) continue;
    return next;
  }
  return null;
}
