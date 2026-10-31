// The fleeing movement generator for a feared unit, peeled from sessionMotion for the filesize
// ratchet. A pure factory over the motion primitives; it imports no combat and installs no method.

import type { Rng } from '../core/rng.ts';
import { arcCos, arcSin, detHypot } from '../core/detMath.ts';
import { TUNING } from './formulas.ts';
import type { CombatPosYd } from './combatGeometry.ts';
import type { Fighter } from './types.ts';
import type { MotionClaims } from './motionClaim.ts';
import type { MotionGenerator } from './motionGenerator.ts';
import {
  FLEE_MAX_QUIET_DISTANCE_YD,
  FLEE_MIN_QUIET_DISTANCE_YD,
} from '../../domain/creature/creatureAiConstants.ts';

/** Per-unit leg: where this leg runs, when the next one may launch, and the pinned source. */
type FleeLeg = { dest: CombatPosYd; holdUntil: number; src: CombatPosYd };

export interface FearFleeDeps {
  rng: Rng;
  /** Sim clock in ms. */
  now: () => number;
  /** Where the unit is now, in the session's yard frame. */
  posOf: (f: Fighter) => CombatPosYd | undefined;
  setPos: (f: Fighter, p: CombatPosYd) => void;
  /** Position of the aura's caster (FleeingMovementGenerator reads it off `source`). */
  sourcePos: (f: Fighter) => CombatPosYd | null;
  /** One tick of travel toward `to`, mesh-clamped or corridor-pathed. */
  step: (f: Fighter, from: CombatPosYd, to: CombatPosYd) => CombatPosYd;
  // Last walkable point on the start storey along from→dest (GetHitPosition). Omit only when the session
  // has no nav map — dest stays Euclidean.
  clampDest?: (from: CombatPosYd, dest: CombatPosYd) => CombatPosYd;
  /** Within this many yards of the leg end counts as arrived. */
  arriveYd: number;
  /** Forced flight claims the unit for its whole duration and releases on Finalize. */
  claims: MotionClaims;
}

export interface FearFlee {
  /** Advance one tick of forced flee. */
  advance: (f: Fighter) => void;
  /** Fear over → Finalize(); a later fear must pin its own source. */
  clear: (f: Fighter) => void;
  // The same two as the generator's update and finalize. `update` always returns true: forced flight
  // outranks every decision below it, so the chain has nothing to fall through to.
  generator: MotionGenerator;
}

// Classic fear is FORCED FLEE at run speed and NOT a straight line: each leg runs to a random point
// around the pinned source, then pauses 500–1500 ms. A straight line measured 136.8 yd off the map.
export function createFearFlee(deps: FearFleeDeps): FearFlee {
  const legs = new WeakMap<Fighter, FleeLeg>();
  const frand = (lo: number, hi: number): number => lo + deps.rng.next() * (hi - lo);

  /** A random point around `src` at the band radius for `d` = current distance from it. */
  const pickRaw = (src: CombatPosYd, d: number): CombatPosYd => {
    const radius = d < FLEE_MIN_QUIET_DISTANCE_YD
      ? frand(0.4, 1.3) * (FLEE_MIN_QUIET_DISTANCE_YD - d)
      : d > FLEE_MAX_QUIET_DISTANCE_YD
        ? frand(0.4, 1.0) * (FLEE_MAX_QUIET_DISTANCE_YD - FLEE_MIN_QUIET_DISTANCE_YD)
        : frand(0.6, 1.2) * (FLEE_MAX_QUIET_DISTANCE_YD - FLEE_MIN_QUIET_DISTANCE_YD);
    // Deterministic trig: π/30 slots, never Math.cos — lockstep peers must agree bit for bit.
    const slot = deps.rng.int(0, 59);
    const dest = { x: src.x + radius * arcCos(slot), y: src.y + radius * arcSin(slot) };
    return src.z == null ? dest : { ...dest, z: src.z };
  };

  /** PATHFIND_NOPATH retry: a dest through a wall / into void is not a leg. */
  const pickDest = (from: CombatPosYd, src: CombatPosYd): CombatPosYd => {
    const d = detHypot(from.x - src.x, from.y - src.y);
    for (let n = 0; n < 8; n++) {
      const raw = pickRaw(src, d);
      const dest = deps.clampDest ? deps.clampDest(from, raw) : raw;
      if (detHypot(dest.x - from.x, dest.y - from.y) > deps.arriveYd) return dest;
    }
    return { x: from.x, y: from.y, ...(from.z != null ? { z: from.z } : {}) };
  };

  const advance = (f: Fighter): void => {
    const from = deps.posOf(f);
    if (!from) return;
    const t = deps.now();

    let leg = legs.get(f);
    // The source is captured once when the flee starts, not re-read per tick, or the aim chases a
    // caster who is himself running. The first leg launches on the tick the fear lands.
    if (!leg) {
      const p = deps.sourcePos(f);
      const src = {
        x: p ? p.x : from.x - 1,
        y: p ? p.y : from.y,
        ...(from.z != null ? { z: from.z } : {}),
      };
      leg = { dest: pickDest(from, src), holdUntil: 0, src };
      legs.set(f, leg);
    }

    if (detHypot(from.x - leg.dest.x, from.y - leg.dest.y) <= deps.arriveYd) {
      // Standing at the leg end: the pause timer only runs while the spline is finalized.
      if (leg.holdUntil === 0) {
        leg.holdUntil = t + deps.rng.int(TUNING.fearFleeRepickMinMs, TUNING.fearFleeRepickMaxMs);
        return;
      }
      if (t < leg.holdUntil) return;
      leg.dest = pickDest(from, leg.src);
      leg.holdUntil = 0;
    }

    const next = deps.step(f, from, leg.dest);
    deps.setPos(f, next);
    // Walled in / off-mesh: the step went nowhere, so this leg is unreachable. Re-pick next tick
    // instead of grinding into the wall for the whole fear (PATHFIND_NOPATH → retry).
    if (detHypot(next.x - from.x, next.y - from.y) <= 1e-6) {
      leg.dest = { x: from.x, y: from.y, ...(from.z != null ? { z: from.z } : {}) };
    }
  };

  const clear = (f: Fighter): void => { if (legs.has(f)) legs.delete(f); };
  const finalize = (f: Fighter): void => {
    const t = deps.now();
    if (deps.claims.ownerOf(f.side, t) === 'flee') deps.claims.release(f.side, 'flee', t);
    clear(f);
  };

  return {
    advance,
    clear,
    generator: {
      owner: 'flee',
      update: (f: Fighter): boolean => {
        if (deps.claims.take(f.side, 'flee', null, deps.now())) advance(f);
        return true;
      },
      finalize,
    },
  };
}
