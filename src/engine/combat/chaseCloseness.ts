// ChaseMovementGenerator inside-model backpedal + same-victim fan.
// Cite: TargetedMovementGenerator.cpp:35,393–475 (CHASE_CLOSENESS_TIMER / Backpedal / FanOut).

import {
  CHASE_BACKPEDAL_DIST_FACTOR,
  CHASE_BACKPEDAL_MAX_DIST_YD,
  CHASE_BACKPEDAL_THRESHOLD_FACTOR,
  CHASE_CLOSENESS_TIMER_MS,
  CHASE_FAN_ANGLE_MAX_RAD,
  CHASE_FAN_ANGLE_MIN_RAD,
  CHASE_FANNING_RADIUS_YD,
} from '../../domain/creature/creatureAiConstants.ts';
import { MELEE_REACH_YD, type CombatPosYd } from './combatGeometry.ts';
import { detAtan2, detCos, detHypot, detSin } from '../core/detMath.ts';
import type { Rng } from '../core/rng.ts';

/** CreatureStaticFlags::BOSS_MOB — world bosses skip fanning. Cite: TargetedMovementGenerator.cpp:144. */
const STATIC_FLAG_BOSS_MOB = 0x00010000;

export type ChaseClosenessState = {
  /** ms left on closeness timer; 0 when idle or waiting on a reposition. */
  remainingMs: number;
  expired: boolean;
  /** Live backpedal / fan destination while the unit is stepping there. */
  dest: CombatPosYd | null;
};

/** targetDist = min(combinedCombatReach, 3.75). Cite: TargetedMovementGenerator.cpp:404. */
export function chaseBackpedalReachYd(combinedReachYd = MELEE_REACH_YD): number {
  return Math.min(combinedReachYd, CHASE_BACKPEDAL_MAX_DIST_YD);
}

/** distSq < (reach^2) * 0.33. Cite: TargetedMovementGenerator.cpp:408. */
export function isChaseInsideModel(distSq: number, reachYd: number): boolean {
  return distSq < (reachYd * reachYd) * CHASE_BACKPEDAL_THRESHOLD_FACTOR;
}

// Point at `reach * 0.75` from the target along the owner←target ray (away). Cite:
// TargetedMovementGenerator.cpp:410–411 GetNearPoint(ori = facing+π).
export function chaseBackpedalDest(
  owner: CombatPosYd,
  target: CombatPosYd,
  reachYd: number,
): CombatPosYd {
  const backDist = reachYd * CHASE_BACKPEDAL_DIST_FACTOR;
  const dx = owner.x - target.x;
  const dy = owner.y - target.y;
  const d = detHypot(dx, dy);
  const z = target.z ?? owner.z;
  if (d > 1e-6) {
    return {
      x: target.x + (dx / d) * backDist,
      y: target.y + (dy / d) * backDist,
      ...(z != null ? { z } : {}),
    };
  }
  return {
    x: target.x - backDist,
    y: target.y,
    ...(z != null ? { z } : {}),
  };
}

/** Fan spot at combined reach, facing+π ± [36°,45°]. Cite: TargetedMovementGenerator.cpp:428–452. */
export function chaseFanDest(
  owner: CombatPosYd,
  target: CombatPosYd,
  fanDistYd: number,
  signedAngleRad: number,
): CombatPosYd {
  const facing = detAtan2(target.y - owner.y, target.x - owner.x);
  const ori = facing + Math.PI + signedAngleRad;
  const z = target.z ?? owner.z;
  return {
    x: target.x + fanDistYd * detCos(ori),
    y: target.y + fanDistYd * detSin(ori),
    ...(z != null ? { z } : {}),
  };
}

export function chaseFanEnabled(staticFlags: number | undefined): boolean {
  return ((staticFlags ?? 0) & STATIC_FLAG_BOSS_MOB) === 0;
}

export function frandFanAngle(rng: Rng): number {
  return CHASE_FAN_ANGLE_MIN_RAD
    + rng.next() * (CHASE_FAN_ANGLE_MAX_RAD - CHASE_FAN_ANGLE_MIN_RAD);
}

/** irand(0,1) → ±1. Cite: TargetedMovementGenerator.cpp:447–448. */
export function fanDirectionSign(rng: Rng): 1 | -1 {
  return rng.int(0, 1) === 0 ? -1 : 1;
}

export { CHASE_CLOSENESS_TIMER_MS, CHASE_FANNING_RADIUS_YD };
