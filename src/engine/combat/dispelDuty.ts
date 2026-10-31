// ONE ANSWER TO "WHO OWNS THIS (TARGET, DISPEL CATEGORY)". Three callers asked three different
// questions, and a channel reads as not-casting, so two of them answered oppositely on one tick.
import { dispelClaimKey, getDispelMask, pruneDispelClaims } from '../../domain/spells/dispel.ts';
import { unitIsCastingOrChanneling } from '../spells/interrupt.ts';
import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import type { CombatantId } from './threat.ts';
import type { Side } from '../core/events.ts';

/** Drop every claim whose holder, target or category no longer justifies it. */
export function pruneDispelDuty(ctx: CombatContext, dead: (f: Fighter) => boolean): void {
  const alive = (id: string): boolean => {
    const u = ctx.bySide(id as Side);
    return !!u && !dead(u);
  };
  pruneDispelClaims(
    ctx.dispelClaim,
    alive,
    (targetId, cat) => {
      const u = ctx.bySide(targetId as Side);
      if (!u || dead(u) || !ctx.dispellableAurasOn) return false;
      const mask = getDispelMask(cat);
      return ctx.dispellableAurasOn(u, mask, true).length > 0
        || ctx.dispellableAurasOn(u, mask, false).length > 0;
    },
    (id) => {
      const u = ctx.bySide(id as Side);
      return !!u && !dead(u) && unitIsCastingOrChanneling(u, ctx.t);
    },
  );
}

/** The seat that owns this (target, category) right now, or null when the key is free. */
export function dispelOwnerThisTick(
  ctx: CombatContext,
  targetId: CombatantId,
  cat: number,
  dead: (f: Fighter) => boolean,
): CombatantId | null {
  pruneDispelDuty(ctx, dead);
  return ctx.dispelClaim.get(dispelClaimKey(targetId, cat)) ?? null;
}

/** Somebody other than `actorId` owns it. The predicate all three call sites used to spell. */
export function dispelClaimedByOtherSeat(
  ctx: CombatContext,
  targetId: CombatantId,
  actorId: CombatantId,
  cat: number,
  dead: (f: Fighter) => boolean,
): boolean {
  const owner = dispelOwnerThisTick(ctx, targetId, cat, dead);
  return owner != null && owner !== actorId;
}
