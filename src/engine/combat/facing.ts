// Facing as one heading scalar plus the front-arc predicate. Four rules read it — dodge from behind,
// parry, block and daze — so this is a heading and a test, with no turn rate, renderer or pathing.

import { detAtan2, detCos } from '../core/detMath.ts';

/** HasInArc's default arc is π, so the front arc is ±π/2 off the heading. Cite: Object.h:1031. */
export const FRONT_ARC_RAD = Math.PI;

// Dazed — the -50% movement snare (4 s) an NPC white hit lands from a player's back arc. Cite:
// Unit.cpp:2227 CastSpell(victim, 1604, TRIGGERED_OLD_TRIGGERED).
export const DAZED_SPELL_ID = 1604;

/** A 2-D point in combat yards. Structural so both CombatPosYd and a bare {x,y} fit. */
export interface FacingPoint {
  x: number;
  y: number;
}

/** Wrap to (-π, +π]. Mirrors MapManager::NormalizeOrientation then the >π fold. */
function normalizeSignedAngle(rad: number): number {
  const twoPi = Math.PI * 2;
  let a = rad % twoPi;
  if (a > Math.PI) a -= twoPi;
  if (a <= -Math.PI) a += twoPi;
  return a;
}

/** Heading from `from` to `to`. Null when the two points coincide (no direction exists). */
export function headingTo(from: FacingPoint, to: FacingPoint): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  return detAtan2(dy, dx);
}

/** WorldObject::HasInArcAt — is `other` inside `arc` centred on `heading`? Cite: Object.cpp:1515-1535. */
export function hasInArc(
  self: FacingPoint,
  heading: number,
  other: FacingPoint,
  arc: number = FRONT_ARC_RAD,
): boolean {
  const to = headingTo(self, other);
  if (to == null) return true; // "always have self in arc" (Object.cpp:1517)
  const angle = normalizeSignedAngle(to - heading);
  const border = arc / 2;
  return angle >= -border && angle <= border;
}

// The heading a unit is facing, from the four sources above. Every argument is a primitive so the module
// stays pure and the session owns the lookups.
export function facingFrom(input: {
  /** Explicit override (SET_FACING). Null when none. */
  override?: number | null;
  /** This unit's position. Null → no geometry, no heading. */
  self: FacingPoint | null | undefined;
  /** The unit's current foe's position, when it has a live foe. */
  foe?: FacingPoint | null;
  /** Last movement heading, when the unit has moved. */
  moveHeading?: number | null;
}): number | null {
  if (input.override != null) return input.override;
  const self = input.self;
  if (!self) return input.override ?? null;
  const toFoe = input.foe ? headingTo(self, input.foe) : null;
  const move = input.moveHeading;
  if (toFoe != null) {
    // Walking away from the foe (the headings differ by more than 90°) means the unit turned
    // its back; anything else — chasing, strafing, standing — keeps the foe in view.
    if (move != null && detCos(normalizeSignedAngle(move - toFoe)) < 0) return move;
    return toFoe;
  }
  return move ?? null;
}
