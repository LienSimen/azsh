// Peeled from createSession (Wave 4 createSession.md P2) — pattern (D).
// posOf / snapToMesh / placeEnemyAt / distanceBetween / setPos.

import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import type { Side } from '../core/events.ts';
import { isEnemySide } from '../core/events.ts';
import { snapPosToMesh } from './snapToFloor.ts';
import { facingFrom, hasInArc, headingTo } from './facing.ts';
import { AURA_INTERRUPT } from '../../domain/spells/stealth.ts';
import { SPELL_ATTR_EX, hasAttrEx } from '../spells/spellAttributes.ts';
import { combatDistanceYd, positionOf, type CombatPosYd } from './combatGeometry.ts';

/** Enemy placement snap radius (yd). Source: createSession ENEMY_SNAP_YD. */
export const ENEMY_SNAP_YD = 6;

export function installSessionGeometry(ctx: CombatContext): void {
  const posOf = (side: Side | string): CombatPosYd | undefined =>
    positionOf(ctx.unitPositionsMutable, side);

  // The session's half of the ONE snap rule (snapToFloor.ts). The facade's main-thread mirror calls the
  // same function with the same anchor, so neither can drift from the other.
  const snapToMesh = (
    pos: CombatPosYd,
    radiusYd: number,
    refZ?: number | null,
  ): CombatPosYd | null => snapPosToMesh(ctx.cfg.geometryAnchor, pos, radiusYd, refZ);

  // Enemy placement gets a TIGHT radius, unlike a move order's. A spawn point is real world-DB data
  // and our mask is the approximation, so a wide search would drag a boss out of its own room.
  const placeEnemyAt = (pos: CombatPosYd): CombatPosYd => {
    // No floor nearby ⇒ keep the sourced position. Spawning where the DB says beats not
    // spawning, and beats teleporting to an unrelated room.
    return snapToMesh(pos, ENEMY_SNAP_YD, pos.z) ?? { x: pos.x, y: pos.y, ...(pos.z != null ? { z: pos.z } : {}) };
  };

  // Pairwise yards between two combatants: the position map when there is one, else the single
  // encounter distance. With the map present but a side missing, undefined — never an invented number.
  const distanceBetween = (a: Fighter, b: Fighter): number | undefined => {
    if (ctx.unitPositionsMutable) {
      return combatDistanceYd(posOf(a.side), posOf(b.side));
    }
    return ctx.cfg.encounterDistanceYd;
  };

  // The last movement heading per side, stamped with the time of the step. Orientation follows
  // movement, and doing it in the one position writer covers all twenty-odd movement paths at once.
  const moveHeading = new Map<string, { rad: number; t: number }>();

  /** Write position only when geometry session is mutable (seeded or inject-opened). */
  const setPos = (side: Side | string, p: CombatPosYd): void => {
    if (!ctx.unitPositionsMutable) return;
    const from = ctx.unitPositionsMutable[side];
    const xyzChanged = !from || from.x !== p.x || from.y !== p.y || from.z !== p.z;
    if (from && xyzChanged) {
      const rad = headingTo(from, p);
      if (rad != null) {
        moveHeading.set(String(side), { rad, t: ctx.t });
      }
      // The moving and turning interrupt flags on the movement packet. Stealth carries neither by
      // design; Feign Death, Torpor and the channel visuals do. Cite: Player.cpp:6020-6025.
      const mover = ctx.sideFighter?.(side as Side);
      if (mover) {
        ctx.removeAurasWithInterruptFlags?.(
          mover,
          AURA_INTERRUPT.MOVING | AURA_INTERRUPT.TURNING,
          'moving',
        );
      }
    }
    ctx.unitPositionsMutable[side] = p;
    // Acquire/free-fire caches key on posGen. A parked nudge that rewrites the same xyz
    // was bumping it every tick and forcing 47 livingHostilesFor rebuilds.
    if (xyzChanged) ctx.posGen++;
  };

  // A heading is only "where I am walking" while the unit is still walking. One tick of slack, so a
  // read taken before this tick's step still sees the previous one; older means it stopped.
  const liveMoveHeading = (side: string): number | null => {
    const row = moveHeading.get(side);
    if (!row) return null;
    return ctx.t - row.t <= Math.max(ctx.tickMs, 1) ? row.rad : null;
  };

  /** `Unit::IsMoving` - a heading younger than one tick means the unit is under way. */
  const isMoving = (side: Side | string): boolean => liveMoveHeading(String(side)) != null;

  let facingTick = -1;
  let facingPosGen = -1;
  const facingCache = new Map<string, number | undefined>();
  // Heading held while stunned: SetStunned broadcasts the orientation the unit had and nothing
  // re-faces while the state holds, which is what lets a rogue get behind. Cite: Unit.cpp:10016-10025.
  const stunHeading = new Map<string, number>();
  const facingOf = (f: Fighter): number | undefined => {
    if (ctx.t !== facingTick || ctx.posGen !== facingPosGen) {
      facingCache.clear();
      facingTick = ctx.t;
      facingPosGen = ctx.posGen;
    }
    if (facingCache.has(f.side)) return facingCache.get(f.side);
    const self = posOf(f.side);
    if (!self) {
      facingCache.set(f.side, undefined);
      return undefined;
    }
    const stunned = f.facing == null && ctx.controlActive?.(f, 'stun') === true;
    if (!stunned) stunHeading.delete(f.side);
    else {
      const held = stunHeading.get(f.side);
      if (held != null) {
        facingCache.set(f.side, held);
        return held;
      }
    }
    // A creature points at the unit it is FIGHTING, not at whoever it would pick next. The foe lookup
    // falls back to the tank on an empty list, so an idle mob read as already staring at you.
    const tm = isEnemySide(f.side) ? ctx.threatOf?.(f) : undefined;
    const idle = isEnemySide(f.side) && (!tm || tm.isEmpty());
    const foe = idle ? undefined : ctx.foeOf?.(f);
    let foePos: CombatPosYd | null | undefined = undefined;
    if (f.channeling && hasAttrEx(f.channeling.spell, SPELL_ATTR_EX.TRACK_TARGET_IN_CHANNEL)) {
      const trackSide = f.channeling.targetSides.find((s) => s !== f.side);
      if (trackSide) foePos = posOf(trackSide);
    }
    if (foePos === undefined) {
      foePos = foe && foe !== f ? posOf(foe.side) : null;
    }
    const rad = facingFrom({
      override: f.facing,
      self,
      foe: foePos,
      moveHeading: liveMoveHeading(String(f.side)),
    }) ?? undefined;
    if (stunned && rad != null) stunHeading.set(f.side, rad);
    facingCache.set(f.side, rad);
    return rad;
  };

  const isInFrontArc = (observer: Fighter, other: Fighter): boolean => {
    const self = posOf(observer.side);
    const at = posOf(other.side);
    // No geometry for either unit: every arc test passes, so nothing changes for a fight
    // that never had positions.
    if (!self || !at) return true;
    const heading = facingOf(observer);
    if (heading == null) return true;
    return hasInArc(self, heading, at);
  };

  // IsFacingTargetsBack — the target does NOT have me in its front arc and I do have it in mine. Null,
  // not false, without a position or heading: a positionless fight keeps the old non-spatial answer.
  const facingTargetsBack = (self: Fighter, target: Fighter): boolean | null => {
    const from = posOf(self.side);
    const at = posOf(target.side);
    if (!from || !at) return null;
    if (facingOf(self) == null || facingOf(target) == null) return null;
    return !isInFrontArc(target, self) && isInFrontArc(self, target);
  };

  // `WorldObject::IsFacingTargetsFront` — both units have each other in their front arc. Same null contract
  // as facingTargetsBack. Cite: Object.cpp:1558-1572.
  const facingTargetsFront = (self: Fighter, target: Fighter): boolean | null => {
    const from = posOf(self.side);
    const at = posOf(target.side);
    if (!from || !at) return null;
    if (facingOf(self) == null || facingOf(target) == null) return null;
    return isInFrontArc(target, self) && isInFrontArc(self, target);
  };

  ctx.posOf = posOf;
  ctx.setPos = setPos;
  ctx.isMoving = isMoving;
  ctx.facingOf = facingOf;
  ctx.isInFrontArc = isInFrontArc;
  ctx.facingTargetsBack = facingTargetsBack;
  ctx.facingTargetsFront = facingTargetsFront;
  ctx.distanceBetween = distanceBetween;
  ctx.snapToMesh = snapToMesh;
  ctx.placeEnemyAt = placeEnemyAt;

  // The SEEDED pack is where most mobs come from, so checking only the mid-fight inject
  // path would fix the minority of them.
  if (ctx.unitPositionsMutable) {
    for (const [side, p] of Object.entries(ctx.unitPositionsMutable)) {
      if (isEnemySide(side)) ctx.unitPositionsMutable[side] = placeEnemyAt(p);
    }
  }
}
