// Charge travel for the motion phase, peeled from sessionMotion for the filesize ratchet: arrival and
// the straight displacement dash to the precomputed landing. Extracted modules must not import combat.

import type { SpellDef } from '../../data/schema.ts';
import { isEnemySide, type Side } from '../core/events.ts';
import { chargeLandingPos, moveStepYd, combatDistanceYd, type CombatPosYd } from './combatGeometry.ts';
import { MIN_AGGRO_DISTANCE } from '../../domain/creature/creatureAi.ts';
import { roleOf } from './roles.ts';
import {
  clampDisplacementToFloor,
  displaceFloorOf,
  stepDisplacement,
} from './displaceFloor.ts';
import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import type { MotionGenerator } from './motionGenerator.ts';
import type { MotionClaims } from './motionClaim.ts';

/** Closures the charge arm needs from installSessionMotion. */
export interface ChargeDeps {
  ctx: CombatContext;
  claims: MotionClaims;
  tickMs: number;
  posOf: (side: Side | string) => CombatPosYd | undefined;
  setPos: (side: Side | string, p: CombatPosYd) => void;
  dead: (f: Fighter) => boolean;
  fighterByThreatId: (id: string) => Fighter | null;
  hostileTargetOf: (f: Fighter) => Fighter | null;
  foeOf: (f: Fighter) => Fighter | null;
  weaponStrike: (f: Fighter, tgt: Fighter, spell: SpellDef) => unknown;
  castOnTargets: (f: Fighter, tgt: Fighter, spell: SpellDef) => void;
  dropStaleCorridor: (side: string) => void;
  floorOf: () => ReturnType<typeof displaceFloorOf>;
}

export function createChargeArm(deps: ChargeDeps): {
  finishChargeArrival: (f: Fighter, tgt: Fighter, spell: SpellDef) => void;
  advanceChargeMove: (f: Fighter) => void;
  // The same travel as a movement generator's update, which always returns true: a charge in flight is
  // a displacement at the top of the claim order. The advance stays exported for the cancel path.
  charge: MotionGenerator;
} {
  const {
    ctx, claims, tickMs, posOf, setPos, dead,
    fighterByThreatId, hostileTargetOf, foeOf,
    weaponStrike, castOnTargets, dropStaleCorridor, floorOf,
  } = deps;

  // Resolve charge or intercept on arrival, or instantly without geometry. A creature's Charge often
  // bakes a strike bonus with empty effects, so it lands as a weapon strike; a player's keeps its own.
  const finishChargeArrival = (f: Fighter, tgt: Fighter, spell: SpellDef): void => {
    f.pendingCharge = null;
    claims.release(f.side, 'forced', ctx.t);
    (ctx as { unitMoveOrders?: Map<string, CombatPosYd[]> }).unitMoveOrders?.delete(f.side);
    dropStaleCorridor(f.side);
    f.autoAttackEnabled = true;
    // A friendly charge (spell-driven, range-gated at cast) claims its landing spot as
    // the new hold-ground anchor — otherwise the unit charges in and then walks home.
    if (ctx.cfg.friendlyHoldYd != null && !isEnemySide(f.side)) {
      const at = posOf(f.side);
      const anchors = (ctx as { unitAnchors?: Map<string, CombatPosYd> }).unitAnchors;
      if (at && anchors) anchors.set(f.side, { x: at.x, y: at.y });
    }
    if (f.swingReadyAt > ctx.t + 60_000) f.swingReadyAt = ctx.t;
    if (spell.strikeBonus || roleOf(spell) === 'strike') {
      weaponStrike(f, tgt, spell);
    }
    if (spell.effects.length > 0) {
      castOnTargets(f, tgt, spell);
    }
  };

  const advanceChargeMove = (f: Fighter): void => {
    if (!ctx.unitPositionsMutable || !f.pendingCharge) return;
    if (f.rootedUntil > ctx.t || f.stunnedUntil > ctx.t || f.incapUntil > ctx.t) {
      f.pendingCharge = null;
      return;
    }
    // Hold / move-only cancel mid-charge travel (setUnitStance also clears pendingCharge).
    const st = (ctx as { unitStance?: Map<string, string> }).unitStance?.get(f.side);
    if (st === 'hold' || st === 'passive') {
      f.pendingCharge = null;
      return;
    }
    // Charge travel is a displacement: it outranks every decision and nothing may interrupt it.
    if (!claims.take(f.side, 'forced', null, ctx.t)) return;
    const pc = f.pendingCharge;
    let tgt: Fighter | null = fighterByThreatId(pc.targetSide);
    if (!tgt || dead(tgt)) {
      // Retarget: re-path straight-line toward current threat/focus.
      tgt = isEnemySide(f.side) ? hostileTargetOf(f) : foeOf(f);
      // Same foeOf self-sentinel as the gap-close acquire — a charge must not retarget the charger.
      if (!tgt || tgt === f || dead(tgt)) {
        f.pendingCharge = null;
        return;
      }
      pc.targetSide = tgt.side;
      pc.dest = undefined;
    }
    const from = posOf(f.side);
    const to = posOf(tgt.side);
    if (!from || !to) {
      // Missing coords — complete charge without travel (do not invent).
      finishChargeArrival(f, tgt, pc.spell);
      return;
    }
    if (!pc.dest) pc.dest = clampDisplacementToFloor(from, chargeLandingPos(from, to), floorOf());
    const step = moveStepYd(pc.speed, tickMs);
    // Straight dash to the precomputed land — not a walk corridor past the mob.
    const next = stepDisplacement(from, pc.dest, step, floorOf());
    setPos(f.side, next);
    const at = combatDistanceYd(next, pc.dest) ?? 0;
    const d = combatDistanceYd(next, to);
    if (at <= 0.35 || (d != null && d <= MIN_AGGRO_DISTANCE)) {
      finishChargeArrival(f, tgt, pc.spell);
    }
  };

  return {
    finishChargeArrival,
    advanceChargeMove,
    charge: { owner: 'forced', update: (f) => { advanceChargeMove(f); return true; } },
  };
}
