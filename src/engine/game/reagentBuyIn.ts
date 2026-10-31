// Stage a craft's vendor buy-in on a copy of the bags: the caller commits bags and gold together
// once the craft itself lands, so a refused craft never leaves a paid-for stack behind.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../../domain/character/character.ts';
import { addItem, canFit, type Inventory } from '../../domain/items/inventory.ts';
import { moneyMarked } from '../../domain/economy/money.ts';
import { vendorShortfall, type Reagent, type VendorReagentBuy } from '../../domain/professions/vendorReagents.ts';

export type StagedBuyIn =
  | { ok: true; inv: Inventory; cost: number; buys: VendorReagentBuy[] }
  | { ok: false; reason: string };

export function stageVendorReagents(
  ds: DataStore,
  char: Character,
  reagents: readonly Reagent[],
  inv: Inventory,
  cap: number | undefined,
): StagedBuyIn {
  const sf = vendorShortfall(ds, char, reagents, inv);
  // A reagent nobody sells leaves the craft short either way: buy nothing, let the craft refuse.
  if (sf.blocked.length || !sf.buys.length) return { ok: true, inv, cost: 0, buys: [] };
  if (sf.cost > char.gold) {
    return { ok: false, reason: `Not enough money for ${buyNames(ds, sf.buys)} (${moneyMarked(sf.cost)})` };
  }
  let working = inv;
  for (const b of sf.buys) {
    const stack = ds.item(b.item)?.stackable ?? 1;
    if (!canFit(working, b.item, b.units, stack, cap)) return { ok: false, reason: 'Not enough bag space' };
    working = addItem(working, b.item, b.units, stack);
  }
  return { ok: true, inv: working, cost: sf.cost, buys: sf.buys };
}

/** "Empty Vial x5, Coarse Thread x1" for a log line or a refusal. */
export function buyNames(ds: DataStore, buys: readonly VendorReagentBuy[]): string {
  return buys.map((b) => `${ds.item(b.item)?.name ?? b.item} x${b.units}`).join(', ');
}
