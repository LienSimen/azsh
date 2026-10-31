// Spare bags and quivers Multi sell may offer. The "Bags and containers" / "Quivers and ammo
// pouches" boxes exist for the bag you are about to wear; a 6-slot pack sitting behind four 16s is
// not that bag, it is 50 copper.
//
// "Not an upgrade" is findUpgrades' own answer (equipmentHelper.ts:185-190 scores a bag by bagSlots
// and replaces the SMALLEST worn one), taken for the player AND every companion via
// partyUpgradeEntries. That alone is not enough for a class-11 quiver: quiverPouchValue returns 0
// for a wrong ranged family, so an unarmed hunter's only spare quiver reads "not an upgrade". Both
// families therefore also have to be beaten by something the body is ALREADY WEARING.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { EquippedMap } from '../character/character.ts';
import { isQuiverOrPouch } from './ammo.ts';
import { BAG_SLOTS } from './equipment.ts';
import { equippedEntry } from './itemInstance.ts';
import type { Inventory } from './inventory.ts';

/** item_template.class 1 CONTAINER / 11 QUIVER. Cite: ItemPrototype.h:144-159. */
const ITEM_CLASS_CONTAINER = 1;
const ITEM_CLASS_QUIVER = 11;

type ContainerFamily = 'bag' | 'quiver';

/** Which of the two never-sell boxes owns this row, or null when it is not a container at all. */
export function containerFamily(it: ItemDef | undefined): ContainerFamily | null {
  if (!it) return null;
  if (isQuiverOrPouch(it) || it.itemClass === ITEM_CLASS_QUIVER) return 'quiver';
  if (it.itemClass === ITEM_CLASS_CONTAINER || it.slot === 'bag') return 'bag';
  return null;
}

/** Biggest worn container of each family. A body wearing nothing keeps every spare it carries. */
function wornSlotsByFamily(equipped: EquippedMap, ds: DataStore): Map<ContainerFamily, number> {
  const out = new Map<ContainerFamily, number>();
  for (const slot of BAG_SLOTS) {
    const entry = equippedEntry(equipped[slot]);
    const it = entry != null ? ds.item(entry) : undefined;
    const fam = containerFamily(it);
    if (!fam || !it) continue;
    out.set(fam, Math.max(out.get(fam) ?? 0, it.bagSlots ?? 0));
  }
  return out;
}

/**
 * Bag entries that are a container nobody would wear: not an upgrade for the party, and no bigger
 * than what this body already has on in the same family.
 */
export function spareContainerEntries(
  inv: Inventory,
  ds: DataStore,
  equipped: EquippedMap,
  upgradeEntries: ReadonlySet<number> | undefined,
): Set<number> {
  const worn = wornSlotsByFamily(equipped, ds);
  const out = new Set<number>();
  const seen = new Set<number>();
  for (const stk of inv.stacks) {
    if (seen.has(stk.item)) continue;
    seen.add(stk.item);
    if (upgradeEntries?.has(stk.item)) continue;
    const it = ds.item(stk.item);
    const fam = containerFamily(it);
    if (!it || !fam) continue;
    const wornSlots = worn.get(fam);
    if (wornSlots == null || wornSlots < (it.bagSlots ?? 0)) continue;
    out.add(it.entry);
  }
  return out;
}
