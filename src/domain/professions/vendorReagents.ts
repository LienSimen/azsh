// Vendor buy-in for a craft: short reagents an unlimited-stock vendor sells are bought at its price.
// npc_vendor.maxcount > 0 is limited supply and never counts. Cite: Creature.cpp:2512 GetVendorItemCurrentCount.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../character/character.ts';
import { canInteractWithCreature } from '../creature/faction.ts';
import { buyCostCopper } from '../economy/trading.ts';
import { honorPriceOf } from '../economy/honorPrice.ts';
import { addItem, countItem, type Inventory } from '../items/inventory.ts';
import { vendorsSelling } from '../../world/world.ts';

export type Reagent = { item: number; count: number };

export interface VendorReagentBuy {
  item: number;
  /** Units the bags are short. */
  short: number;
  /** item_template.BuyCount: the vendor sells in multiples of this (Empty Vial x5). */
  buyCount: number;
  purchases: number;
  /** Units that land in the bags: purchases * buyCount, so the rounding surplus stays with you. */
  units: number;
  cost: number;
  vendorEntry: number;
}

export interface VendorShortfall {
  buys: VendorReagentBuy[];
  cost: number;
  /** Short reagents no unlimited vendor sells to this race: the craft stays "Missing reagents". */
  blocked: number[];
}

const vendorMemo = new WeakMap<DataStore, Map<string, number | null>>();

/** A vendor this race can trade with that sells `itemId` unconditionally and without a stock cap. */
export function unlimitedVendorFor(ds: DataStore, itemId: number, race: number): number | null {
  let memo = vendorMemo.get(ds);
  if (!memo) {
    memo = new Map();
    vendorMemo.set(ds, memo);
  }
  const key = `${itemId}:${race}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const def = ds.item(itemId);
  let found: number | null = null;
  if (def && def.buyPrice > 0 && honorPriceOf(ds, def) === 0) {
    for (const h of vendorsSelling(ds, itemId)) {
      const v = ds.vendor(h.vendorEntry);
      if (!v) continue;
      const stock = v.stock?.find((s) => s.item === itemId);
      if (stock && stock.maxcount > 0) continue;
      if (v.itemConditions?.some((c) => c.item === itemId)) continue;
      if (!canInteractWithCreature(ds, race, v.entry)) continue;
      found = v.entry;
      break;
    }
  }
  memo.set(key, found);
  return found;
}

/** What the bags lack for `reagents`, split into vendor buys and reagents nobody sells. */
export function vendorShortfall(
  ds: DataStore,
  char: Character,
  reagents: readonly Reagent[],
  inv: Inventory,
): VendorShortfall {
  const buys: VendorReagentBuy[] = [];
  const blocked: number[] = [];
  let cost = 0;
  for (const rg of reagents) {
    const short = rg.count - countItem(inv, rg.item);
    if (short <= 0) continue;
    const vendorEntry = unlimitedVendorFor(ds, rg.item, char.race);
    const def = ds.item(rg.item);
    if (vendorEntry == null || !def) {
      blocked.push(rg.item);
      continue;
    }
    const buyCount = Math.max(1, def.buyCount ?? 1);
    const purchases = Math.ceil(short / buyCount);
    const rowCost = buyCostCopper(def, purchases);
    buys.push({ item: rg.item, short, buyCount, purchases, units: purchases * buyCount, cost: rowCost, vendorEntry });
    cost += rowCost;
  }
  return { buys, cost, blocked };
}

/** The craft is one tap away: nothing blocked and the purse covers every buy. Cost 0 when nothing is bought. */
export function vendorBuyInReady(
  ds: DataStore,
  char: Character,
  reagents: readonly Reagent[],
  inv: Inventory,
): { ok: boolean; cost: number; buys: VendorReagentBuy[]; blocked: number[] } {
  const sf = vendorShortfall(ds, char, reagents, inv);
  return { ok: sf.blocked.length === 0 && sf.cost <= char.gold, cost: sf.cost, buys: sf.buys, blocked: sf.blocked };
}

/** The bags after the buys land, stack sizes from item_template.stackable. */
export function applyVendorBuys(ds: DataStore, inv: Inventory, buys: readonly VendorReagentBuy[]): Inventory {
  let working = inv;
  for (const b of buys) working = addItem(working, b.item, b.units, ds.item(b.item)?.stackable ?? 1);
  return working;
}

/** Crafts one Create All press may buy for: gold alone would let a vendor recipe run to hardCap. */
export const VENDOR_RUN_CAP = 100;

// Crafts the bags plus the purse allow: unsold reagents cap by count, vendor goods by gold.
// Walks k upward because BuyCount lots make the cost lumpy.
export function maxCraftsWithVendor(
  ds: DataStore,
  char: Character,
  reagents: readonly Reagent[],
  inv: Inventory,
  hardCap = 999,
): number {
  if (!reagents.length) return 0;
  let byBags = Infinity;
  const vendorRows: Array<{ rg: Reagent; have: number; buyCount: number; price: number }> = [];
  for (const rg of reagents) {
    const have = countItem(inv, rg.item);
    const vendorEntry = unlimitedVendorFor(ds, rg.item, char.race);
    const def = ds.item(rg.item);
    if (vendorEntry == null || !def) {
      byBags = Math.min(byBags, Math.floor(have / rg.count));
      continue;
    }
    vendorRows.push({ rg, have, buyCount: Math.max(1, def.buyCount ?? 1), price: def.buyPrice });
  }
  const cap = Math.min(hardCap, byBags);
  if (cap <= 0) return 0;
  if (!vendorRows.length) return cap;
  // The bags cover this many for free; every craft past it buys, so one press runs VENDOR_RUN_CAP further.
  const bagCovered = Math.min(...vendorRows.map((row) => Math.floor(row.have / row.rg.count)));
  const runCap = Math.min(cap, bagCovered + VENDOR_RUN_CAP);
  let best = 0;
  for (let k = 1; k <= runCap; k++) {
    let cost = 0;
    for (const row of vendorRows) {
      const short = k * row.rg.count - row.have;
      if (short > 0) cost += Math.ceil(short / row.buyCount) * row.price;
    }
    if (cost > char.gold) break;
    best = k;
  }
  return best;
}
