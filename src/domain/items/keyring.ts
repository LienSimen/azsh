// Keyring — a separate unbounded container for BagFamily KEYS items, so keys never flood backpack
// slots. The classic client grows 4→8→12 by level; we keep it unbounded. Cite: Player.cpp ~8613.

import type { ItemDef } from '../../data/schema.ts';
import type { Inventory, ItemStack } from './inventory.ts';
import {
  addInstance,
  addItem,
  countItem,
  emptyInventory,
  removeItem,
  takeStack,
} from './inventory.ts';
import type { ItemInstance } from './itemInstance.ts';
import { hasIdentity } from './itemInstance.ts';

/** ItemPrototype.h BagFamily KEYS. */
export const BAG_FAMILY_KEYS = 9;

/** ItemPrototype.h ITEM_CLASS_KEY (many keys; not exclusive — see isKeyItem). */
export const ITEM_CLASS_KEY = 13;

// True when the item belongs on the keyring, by BagFamily KEYS only. Class 13 alone is wrong —
// Defias Gunpowder and Soft-shelled Clam share that class.
export function isKeyItem(item: ItemDef | null | undefined): boolean {
  if (!item) return false;
  return item.bagFamily === BAG_FAMILY_KEYS;
}

/** Count of a given entry across keyring stacks. */
export function countKeyring(keyring: Inventory, entry: number): number {
  return countItem(keyring, entry);
}

// Pull every key stack out of a bag inventory into the keyring. Non-keys stay in bags. Used on save migrate
// and after bulk adds. Pure. Preserves instance identity via addInstance when present.
export function migrateKeysToKeyring(
  bags: Inventory,
  keyring: Inventory,
  itemDef: (entry: number) => ItemDef | undefined,
): { bags: Inventory; keyring: Inventory; moved: number } {
  let nextBags = bags;
  let nextKey = keyring;
  let moved = 0;
  // Walk a snapshot of indices so removals stay stable.
  const snapshot = nextBags.stacks.map((s, i) => ({ s, i }));
  // Remove from the end so earlier indices stay valid when we re-scan… easier:
  // rebuild bags without keys.
  const keep: ItemStack[] = [];
  for (const s of nextBags.stacks) {
    const def = itemDef(s.item);
    if (isKeyItem(def)) {
      const maxStack = Math.max(1, def?.stackable ?? 1);
      if (hasIdentity(s)) nextKey = addInstance(nextKey, s, maxStack);
      else nextKey = addItem(nextKey, s.item, s.count, maxStack);
      moved += s.count;
    } else {
      keep.push({ ...s });
    }
  }
  nextBags = { stacks: keep };
  return { bags: nextBags, keyring: nextKey, moved };
}

// Add a key quantity into the keyring (always succeeds — unbounded). Non-keys are rejected (caller should
// use bags). Pure.
export function addToKeyring(
  keyring: Inventory,
  entry: number,
  count: number,
  def: ItemDef | undefined,
  instance?: ItemInstance,
): Inventory {
  if (count <= 0) return keyring;
  const maxStack = Math.max(1, def?.stackable ?? 1);
  if (instance && hasIdentity(instance)) {
    return addInstance(keyring, { ...instance, item: entry, count }, maxStack);
  }
  return addItem(keyring, entry, count, maxStack);
}

/** Remove up to `count` of `entry` from the keyring. Pure. Returns [newKeyring, removedCount]. */
export function removeFromKeyring(
  keyring: Inventory,
  entry: number,
  count: number,
): [Inventory, number] {
  return removeItem(keyring, entry, count);
}

/** Take the stack at index (for destroy / move). Pure. */
export function takeKeyringStack(
  keyring: Inventory,
  index: number,
  count: number,
): [Inventory, ItemInstance | null] {
  return takeStack(keyring, index, count);
}

export function emptyKeyring(): Inventory {
  return emptyInventory();
}

// Read-only union of bags, keyring and mailbox overflow, for "do I own this?" questions: the
// keyring broke every gate that asked countItem(inventory, key). Counting only, never written to.
export function ownedInventory(
  bags: Inventory,
  keyring: Inventory | undefined,
  overflow?: Inventory,
): Inventory {
  const extra: ItemStack[] = [];
  if (keyring && keyring.stacks.length > 0) extra.push(...keyring.stacks);
  if (overflow && overflow.stacks.length > 0) extra.push(...overflow.stacks);
  if (extra.length === 0) return bags;
  return { ...bags, stacks: [...bags.stacks, ...extra] };
}

// Spend `count` of `entry` from the bags first, then the keyring, returning how many were actually
// removed. A door key that had migrated to the keyring was being consumed from the bags, i.e. not.
export function spendOwned(
  bags: Inventory,
  keyring: Inventory | undefined,
  entry: number,
  count: number,
): { bags: Inventory; keyring: Inventory; removed: number } {
  const keys = keyring ?? emptyInventory();
  const [nextBags, fromBags] = removeItem(bags, entry, count);
  if (fromBags >= count) return { bags: nextBags, keyring: keys, removed: fromBags };
  const [nextKeys, fromKeys] = removeItem(keys, entry, count - fromBags);
  return { bags: nextBags, keyring: nextKeys, removed: fromBags + fromKeys };
}
