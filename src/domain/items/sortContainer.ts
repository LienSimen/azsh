// One sort order for every container in the game — your bags, your bank, a companion's bags and
// their bank. Ported from the SortBags addon's `Item()` tier list (addons/SortBags/SortBags.lua:398-461)
// with this tree's own predicates standing in for its hardcoded id sets: `mountSpell` for MOUNTS,
// isKeyItem for KEYS, itemProtectCategory for TOOLS, and the disenchant table for ENCHANTING_MATERIALS.
// Pure: every function returns a new value.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { Inventory, ItemStack } from './inventory.ts';
import { addInstance, emptyInventory } from './inventory.ts';
import { isKeyItem } from './keyring.ts';
import {
  itemProtectCategory,
  protectLookupFor,
  type ProtectLookup,
  type ProtectSource,
} from './junkCategories.ts';

/** Hearthstone — first tile in the addon's order. Cite: SortBags.lua:411. */
export const HEARTHSTONE_ITEM = 6948;

/** Soul Shard — bucketed with junk so a warlock's shards never split the gear block. Cite: SortBags.lua:423. */
export const SOUL_SHARD_ITEM = 6265;

/** item_template.class TRADE_GOODS / subclass HERB. Cite: ItemPrototype.h; item-data.json Peacebloom (7/9). */
const ITEM_CLASS_TRADE_GOODS = 7;
const ITEM_SUBCLASS_HERB = 9;

/** The DataStore slice a sort needs: junkCategories' lookup plus the disenchant table. */
export type SortSource = ProtectSource & Pick<DataStore, 'disenchantRules' | 'item'>;

export interface SortLookup extends ProtectLookup {
  /** Every dust / essence / shard / crystal the disenchant table yields (24 rows). */
  enchantMats: ReadonlySet<number>;
  item: (entry: number) => ItemDef | undefined;
}

const matsByStore = new WeakMap<object, Set<number>>();

// Enchanting materials, derived instead of listed: disenchantRules' yield IS the addon's
// ENCHANTING_MATERIALS set, and both come to 24 entries.
export function enchantMaterialEntries(ds: SortSource): ReadonlySet<number> {
  let mats = matsByStore.get(ds);
  if (!mats) {
    mats = new Set<number>();
    for (const rule of ds.disenchantRules()) {
      for (const y of rule.yield ?? []) if (y.item > 0) mats.add(y.item);
    }
    matsByStore.set(ds, mats);
  }
  return mats;
}

/** One lookup per DataStore — protectLookupFor materializes 1,135 recipe rows. */
export function sortLookupFor(ds: SortSource): SortLookup {
  return { ...protectLookupFor(ds), enchantMats: enchantMaterialEntries(ds), item: ds.item };
}

// The addon's tier number, in the addon's own evaluation order (SortBags.lua:410-460). Lower sorts
// first. 3 is unused: its SPECIAL set is six unexplained ids, so those items take their own tier.
export function itemSortTier(
  stack: ItemStack,
  it: ItemDef | undefined,
  look: SortLookup,
): number {
  if (!it) return 16;
  const cat = itemProtectCategory(it, look);
  if (it.entry === HEARTHSTONE_ITEM) return 1;
  if (it.mountSpell != null || cat === 'mountPet') return 2;
  if (cat === 'key' || isKeyItem(it)) return 4;
  if (cat === 'tool') return 5;
  if (it.entry === SOUL_SHARD_ITEM) return 14;
  if (it.conjured) return 15;
  if (stack.bound) return 6;
  if (cat === 'reagent') return 7;
  if (cat === 'quest') return 9;
  if (cat === 'foodDrink' || cat === 'consumable') return 8;
  if (look.enchantMats.has(it.entry)) return 11;
  if (it.itemClass === ITEM_CLASS_TRADE_GOODS && it.itemSubclass === ITEM_SUBCLASS_HERB) return 12;
  if (it.quality > 1) return 10;
  if (it.quality === 0) return 14;
  return 13;
}

// Tier, then the addon's own tie-breakers. Entry rather than name groups an item's ranks
// (Minor → Lesser → Healing Potion) the way SortBags.lua:452-460 does.
export function itemSortKey(
  stack: ItemStack,
  it: ItemDef | undefined,
  look: SortLookup,
): number[] {
  return [
    itemSortTier(stack, it, look),
    it?.itemClass ?? 99,
    it?.inventoryType ?? 0,
    it?.itemSubclass ?? 0,
    -(it?.quality ?? 0),
    it?.entry ?? 0,
    -(stack.charges ?? 0),
    stack.randomPropertyId ?? 0,
    stack.permEnchantId ?? 0,
  ];
}

/** Element-wise compare; equal-length keys, so a shorter vector never appears. */
export function compareSortKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export interface SortContainerResult {
  inventory: Inventory;
  /** Slots the restack handed back (used before − used after). Never negative. */
  freed: number;
  /** True when the stack order or count actually changed. */
  changed: boolean;
}

// The addon's two halves (Stack() then Sort()) in one pass. addInstance merges only what
// instancesStackable allows, so a suffix, an enchant or a bound flag keeps its own slot.
export function sortInventory(inv: Inventory, ds: SortSource): SortContainerResult {
  const look = sortLookupFor(ds);
  let packed = emptyInventory();
  for (const s of inv.stacks) {
    packed = addInstance(packed, s, ds.item(s.item)?.stackable ?? 1);
  }
  const keyed = packed.stacks.map((s) => ({ s, k: itemSortKey(s, ds.item(s.item), look) }));
  keyed.sort((a, b) => compareSortKeys(a.k, b.k));
  const stacks = keyed.map((x) => x.s);
  const freed = Math.max(0, inv.stacks.length - stacks.length);
  const changed = freed > 0 || stacks.some((s, i) => {
    const was = inv.stacks[i];
    return !was || was.item !== s.item || was.count !== s.count;
  });
  return { inventory: { stacks }, freed, changed };
}
