// What a PvP gear row costs in Honor Points. PRODUCT RULE: 1.12 has no honor currency and no
// item_extended_cost row, so the anchors below are operator-set, not ported.

import { hkHonorAtLevel } from '../run/honor.ts';
import { CONDITION } from '../../engine/spells/conditions.ts';
import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { ItemSlot } from '../../data/schema/primitives.ts';

/** Top-slot price by item_template.Quality. 3 rare, 4 epic; every other quality stays on coin. */
const BASE_BY_QUALITY: Readonly<Record<number, number>> = { 3: 5_000, 4: 15_000 };

// Slot weight against the base, following the vanilla item-budget grouping. A main weapon is worth
// two chests, which is what puts an epic weapon at 30,000 and the blue pieces in the 3,000-5,000 band.
const SLOT_WEIGHT: Readonly<Partial<Record<ItemSlot, number>>> = {
  head: 1, chest: 1, legs: 1,
  shoulder: 0.8, hands: 0.8, waist: 0.8, feet: 0.8,
  wrist: 0.6, back: 0.6, neck: 0.6, finger: 0.6, trinket: 0.6, shirt: 0.6,
  mainhand: 2, twohand: 2,
  offhand: 1, ranged: 1,
  // The two AV quivers are the only rank-or-battleground reward that equips into a bag slot.
  bag: 0.6,
};

// The six battleground reputations — Stormpike/Frostwolf (AV), Silverwing/Warsong (WSG), Arathor/
// Defilers (AB). Cite: factions.json 730/729, 890/889, 509/510.
export const BG_REPUTATION_FACTIONS: ReadonlySet<number> = new Set([730, 729, 890, 889, 509, 510]);

/** Prices are quoted to the nearest 100 Honor; every level-60 anchor above is already a multiple. */
const PRICE_STEP = 100;

const BG_REWARDS = new WeakMap<DataStore, ReadonlySet<number>>();

// Every faction a condition tree demands a MINIMUM rank with, walking AND/OR. A reversed condition
// (CONDITION_FLAG_REVERSE_RESULT) demands the opposite, so it names nobody.
function repMinFactions(
  byId: ReadonlyMap<number, { type: number; value1: number; value2?: number; flags?: number }>,
  id: number,
  out: Set<number>,
  seen: Set<number>,
): void {
  const c = byId.get(id);
  if (!c || seen.has(id)) return;
  seen.add(id);
  if ((c.flags ?? 0) & 0x1) return;
  if (c.type === CONDITION.REPUTATION_RANK_MIN) out.add(c.value1);
  if (c.type === CONDITION.AND || c.type === CONDITION.OR) {
    repMinFactions(byId, c.value1, out, seen);
    repMinFactions(byId, c.value2 ?? 0, out, seen);
  }
}

// Battleground reward gear, resolved once per store. AB names its faction on the item row
// (item_template.RequiredReputationFaction); AV and WSG name it on the vendor line instead
// (npc_vendor.condition_id → CONDITION_REPUTATION_RANK_MIN). 308 rows, 271 of them slotted.
export function bgRewardItems(ds: DataStore): ReadonlySet<number> {
  const cached = BG_REWARDS.get(ds);
  if (cached) return cached;
  const byId = new Map(ds.conditionsList().map((c) => [c.id, c]));
  const entries = new Set<number>();
  for (const vendor of ds.vendors()) {
    for (const line of vendor.itemConditions ?? []) {
      const factions = new Set<number>();
      repMinFactions(byId, line.conditionId, factions, new Set());
      for (const f of factions) {
        if (BG_REPUTATION_FACTIONS.has(f)) { entries.add(line.item); break; }
      }
    }
  }
  for (const def of ds.items()) {
    if (def.requiredRep && BG_REPUTATION_FACTIONS.has(def.requiredRep.faction)) entries.add(def.entry);
  }
  BG_REWARDS.set(ds, entries);
  return entries;
}

// The bracket term: a piece costs the same number of KILLS in every level bracket, because the price
// rides the same curve the kill pays. Cite: Formulas.h:37 via hkHonorAtLevel.
function bracketWeight(def: ItemDef): number {
  const named = def.requiredLevel > 0 ? def.requiredLevel : (def.itemLevel ?? 0) - 5;
  const level = Math.max(1, Math.min(60, named > 0 ? named : 60));
  return hkHonorAtLevel(level) / hkHonorAtLevel(60);
}

// Honor-priced = an equip slot AND a PvP source: item_template.requiredhonorrank, or a battleground
// quartermaster's shelf. Mounts, tabards and standards have no equip slot, so they stay on coin and
// keep their rank or reputation gate.
export function honorPriceOf(ds: DataStore, def: ItemDef): number {
  const pvp = (def.requiredHonorRank ?? 0) > 0 || bgRewardItems(ds).has(def.entry);
  if (!pvp || !def.slot) return 0;
  const base = BASE_BY_QUALITY[def.quality] ?? 0;
  const weight = SLOT_WEIGHT[def.slot] ?? 0;
  if (base <= 0 || weight <= 0) return 0;
  return Math.round(base * weight * bracketWeight(def) / PRICE_STEP) * PRICE_STEP;
}

/** "12,000 Honor" — the price as every surface prints it. */
export function honorPriceText(points: number): string {
  return `${Math.max(0, Math.trunc(points)).toLocaleString('en-US')} Honor`;
}
