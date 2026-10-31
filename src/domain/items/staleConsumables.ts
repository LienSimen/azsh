// Food and drink the bags have OUTGROWN. Multi sell's "Food and drink" box exists so a fresh player
// never vendors the stack the next pull needs — but at 60 that box also guards the Tough Jerky and
// the Refreshing Spring Water nobody has eaten since Westfall.
//
// Rank comes off the RequiredLevel gate the ladder is built on (item_template.RequiredLevel, mirrored
// into the bake as consumable.reqLevel). Measured over the 17,603-row catalog, the gates are
// food 1/5/(10,12)/15/(20)/25/(26)/35/(40)/45/(53)/55 and drink 1/(4)/5/15/25/35/(40)/45/(54)/55, so
// a decade bucket puts each real gate on its own rank and folds the strays onto the gate they sit
// beside — no table to keep in step with a re-bake.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { Inventory } from './inventory.ts';

/** How far below the best rank in the bags a stack has to fall before it is vendor stock. */
export const FOOD_TIER_MARGIN = 1;

/** Rank of a food/drink gate. Cite: item_template.RequiredLevel; the gate histogram above. */
export function foodDrinkTier(reqLevel: number): number {
  return Math.floor(Math.max(0, reqLevel | 0) / 10);
}

/** The gate this stack is actually held behind — the bake's own stamp first, then the item row. */
export function foodDrinkReqLevel(it: ItemDef): number {
  return Math.max(it.consumable?.reqLevel ?? 0, it.requiredLevel | 0);
}

// Only a REAL food/drink row ranks. Raw meat and fish carry item_template.FoodType with no
// consumable block — that is pet food, and Feed Pet reads the same rows, so it never ranks here.
// A stat food (useBuff) is kept whatever its gate: it is worn for the buff, not the bite.
function rankedEffect(it: ItemDef | undefined): 'food' | 'drink' | null {
  if (!it || it.useBuff != null) return null;
  return it.consumable?.effect ?? null;
}

/**
 * Bag entries at least `margin` ranks below the best rank of the SAME kind the bags already hold and
 * the body can eat. Reading the bags, not the catalog, is the whole safety property: the only stack
 * you carry is always the best one you carry, so it can never be the thing that gets sold.
 */
export function outdatedFoodDrinkEntries(
  inv: Inventory,
  ds: DataStore,
  level: number,
  margin: number = FOOD_TIER_MARGIN,
): Set<number> {
  const ranked = new Map<number, { effect: 'food' | 'drink'; tier: number }>();
  const best = new Map<'food' | 'drink', number>();
  for (const stk of inv.stacks) {
    if (ranked.has(stk.item)) continue;
    const it = ds.item(stk.item);
    const effect = rankedEffect(it);
    if (!it || !effect) continue;
    const req = foodDrinkReqLevel(it);
    // Held for later, not outgrown: a gate above the body's level never sets or loses the bar.
    if (req > level) continue;
    const tier = foodDrinkTier(req);
    ranked.set(it.entry, { effect, tier });
    best.set(effect, Math.max(best.get(effect) ?? 0, tier));
  }
  const out = new Set<number>();
  for (const [entry, { effect, tier }] of ranked) {
    if ((best.get(effect) ?? 0) - tier >= margin) out.add(entry);
  }
  return out;
}
