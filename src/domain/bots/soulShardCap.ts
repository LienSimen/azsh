// Soul Shard 6265 is stackable 1, so every shard a warlock banks costs a bag slot. An uncapped bank
// filled a companion's bags and equipOnCompanion then refused every equip on that body.

import { SOUL_SHARD_ITEM } from '../core/ids.ts';
import { countItem, removeItem, type Inventory } from '../items/inventory.ts';

// What PlayerbotFactory hands a warlock at spawn (botInventory.ts:186 regCount = 10) — a five-man
// stone run plus the two-shard reserve a re-summon needs. Cite: healthstoneSupply.ts.
export const COMPANION_SOUL_SHARD_CAP = 10;

/** Shards over the cap, dropped lowest-slot-first. Returns the same object when nothing is over. */
export function trimSoulShards(
  bags: Inventory,
  cap: number = COMPANION_SOUL_SHARD_CAP,
): { bags: Inventory; dropped: number } {
  const have = countItem(bags, SOUL_SHARD_ITEM);
  const over = have - Math.max(0, cap);
  if (over <= 0) return { bags, dropped: 0 };
  const [next, removed] = removeItem(bags, SOUL_SHARD_ITEM, over);
  return { bags: next, dropped: removed };
}

/** Shards this bag may still take. Cite: Spell.cpp DoCreateItem EQUIP_ERR_INVENTORY_FULL. */
export function soulShardRoom(
  bags: Inventory,
  freeBagSlots: number,
  cap: number = COMPANION_SOUL_SHARD_CAP,
): number {
  return Math.max(0, Math.min(cap - countItem(bags, SOUL_SHARD_ITEM), freeBagSlots));
}

/** True when `entry` is the Soul Shard row. Keeps the id out of the call sites. */
export function isSoulShard(entry: number): boolean {
  return entry === SOUL_SHARD_ITEM;
}
