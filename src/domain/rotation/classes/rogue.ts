// PURE: no DOM/RNG/Date. Rogue rotation post-pass + kit policy.
// Shared pipeline + JSON pack cover current rogue needs; class fixes land here.

import { cond } from '../classify.ts';
import { expandFinisherLadder } from '../finisherLadder.ts';
import { rebuildPhaseUsed, type ClassRotationHooks, type FinalizeContext } from './hooks.ts';
import type { RotationRule } from '../types.ts';
import { bestFamilyItem, consumableFamilyKey } from '../../items/consumableFamily.ts';
import { INSTANT_POISON_ITEM, isPoisonCraftRecipe } from '../../professions/poisons.ts';

// A poisons vial is CRAFTED in the profession tab and never cast: oocCastMethods.ts:75 refuses a
// poison craft with "Craft that from the profession tab". A craft row in buffs therefore stops the
// whole pre-pull prep loop at itself (liveRunControl.ts:401 breaks on the first refusal), so the
// rogue's authored poison rows are the two COATS instead — the item, on each hand.
function isPoisonCraftRow(ctx: FinalizeContext, r: RotationRule): boolean {
  return r.action.kind === 'spell' && isPoisonCraftRecipe(ctx.ds.recipe(r.action.spellId));
}

// Best Instant Poison rank this rogue can use, resolved as a family LADDER so the row follows the
// bags: 6947 is the r1 vial the profession grants (poisons.ts INSTANT_POISON_ITEM) and anchors the
// ladder. Bags win over the catalog, and requiredLevel 20 is what keeps the row off a low rogue.
function instantPoisonCoatRows(ctx: FinalizeContext): RotationRule[] {
  const family = consumableFamilyKey(ctx.ds.item(INSTANT_POISON_ITEM), ctx.ds);
  if (!family) return [];
  const best = bestFamilyItem(family, ctx.ds, {
    char: ctx.char,
    ...(ctx.inventory ? { inventory: ctx.inventory } : {}),
  });
  if (!best) return [];
  // ref 0 is mainhand and 1 is offhand, the same gate a hand-added imbue row gets (build.ts:415).
  return (['mainhand', 'offhand'] as const).map((hand, i) => ({
    id: ctx.nextFallbackId(),
    action: { kind: 'item' as const, itemEntry: best.entry, family, hand },
    conditions: [cond('self', 'weaponImbuePresent', '==', 0, i)],
    enabled: true,
  }));
}

function finalizeRoguePoisonBuffs(ctx: FinalizeContext): void {
  const kept = ctx.phases.buffs.filter((r) => !isPoisonCraftRow(ctx, r));
  const coats = ctx.phases.buffs.some((r) => r.action.kind === 'item' && r.action.hand != null)
    ? []
    : instantPoisonCoatRows(ctx);
  if (kept.length === ctx.phases.buffs.length && !coats.length) return;
  ctx.phases.buffs = [...coats, ...kept];
  rebuildPhaseUsed(ctx, 'buffs');
}

// Eviscerate on the ladder instead of a bare `combo points >= 4`. finisherLadder.ts owns the rungs.
function finalizeRogueFinishers(ctx: FinalizeContext): void {
  // PvE only. A duel has no "it will die inside two builder GCDs" that a trinket cannot undo, and
  // pvp rogue burst is authored against Cold Blood windows in the duel lab, not against a band.
  if (ctx.mode === 'pvp') return;
  const spellOf = (id: number) => ctx.knownById.get(id) ?? ctx.ds.spell(id);
  if (expandFinisherLadder(ctx.phases.combat, spellOf, ctx.nextFallbackId)) {
    rebuildPhaseUsed(ctx, 'combat');
  }
}

export const rogueHooks: ClassRotationHooks = {
  afterSuggestion(ctx) {
    finalizeRoguePoisonBuffs(ctx);
    finalizeRogueFinishers(ctx);
  },
  afterFallback(ctx) {
    finalizeRoguePoisonBuffs(ctx);
    finalizeRogueFinishers(ctx);
  },
};
