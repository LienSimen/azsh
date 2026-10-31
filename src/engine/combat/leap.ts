// LEAP (29) EffectLeapForward. The dest is a planar point the spell's radius along the caster's
// orientation, with the current foe as the facing proxy. Without geometry the position is a no-op.

import type { SpellDef } from '../../data/schema.ts';
import type { Side } from '../core/events.ts';
import type { CombatPosYd } from './combatGeometry.ts';
import { combatDistanceYd } from './combatGeometry.ts';
import { detHypot } from '../core/detMath.ts';

// Destination `distanceYd` yards from `from` along unit vector toward `toward`. Co-located / zero dist →
// orientation 0 (+x).
export function leapForwardPosition(
  from: CombatPosYd,
  toward: CombatPosYd | undefined,
  distanceYd: number,
): CombatPosYd {
  if (!(distanceYd > 0) || !Number.isFinite(distanceYd)) {
    return from.z != null ? { x: from.x, y: from.y, z: from.z } : { x: from.x, y: from.y };
  }
  let ux = 1;
  let uy = 0;
  if (toward) {
    const dx = toward.x - from.x;
    const dy = toward.y - from.y;
    const len = detHypot(dx, dy);
    if (len > 0) {
      ux = dx / len;
      uy = dy / len;
    }
  }
  const dest = { x: from.x + ux * distanceYd, y: from.y + uy * distanceYd };
  return from.z != null ? { ...dest, z: from.z } : dest;
}

export interface ApplyLeapArgs {
  t: number;
  spell: SpellDef;
  /** unitTarget of the leap (caster for Blink). */
  actor: Side;
  /** Yards from SpellRadius.dbc (spell.radiusYd); 0 → no motion. */
  distanceYd: number;
  /** Facing proxy — current foe position, or omit for orientation 0. */
  faceToward?: CombatPosYd;
  posOf: (side: Side | string) => CombatPosYd | undefined;
  setPos: (side: Side | string, p: CombatPosYd) => void;
  // GetHitPosition analog — last walkable on the start storey. Wired from displaceFloor when the session
  // has a nav map; omit for Euclidean outdoor / no-map sessions.
  clampLanding?: (from: CombatPosYd, dest: CombatPosYd) => CombatPosYd;
  /** Landing is not where the walk was planned from: drop the corridor and the motion claim. */
  displaced?: (side: Side | string) => void;
  push: (e: {
    t: number;
    kind: 'spell_hit';
    actor: Side;
    target: Side;
    spellId: number;
    name: string;
    result: 'hit';
    amount: number;
    school: string;
  }) => void;
}

/** Apply leap at the combat surface. @returns planar yards moved (0 without geometry). */
export function applyLeapEffect(args: ApplyLeapArgs): number {
  const { t, spell, actor, distanceYd, faceToward, posOf, setPos, push, displaced, clampLanding } = args;
  const from = posOf(actor);
  let moved = 0;
  if (from && distanceYd > 0) {
    const raw = leapForwardPosition(from, faceToward, distanceYd);
    const next = clampLanding ? clampLanding(from, raw) : raw;
    setPos(actor, next);
    displaced?.(actor);
    moved = combatDistanceYd(from, next) ?? 0;
  }
  // Observable land so the ability is not silent (parity with prior leap stub).
  push({
    t,
    kind: 'spell_hit',
    actor,
    target: actor,
    spellId: spell.id,
    name: spell.name,
    result: 'hit',
    amount: 0,
    school: spell.school || 'arcane',
  });
  return moved;
}
