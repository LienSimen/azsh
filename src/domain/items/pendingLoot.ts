// The open loot container — the haul a corpse, chest, vein or bag-item HOLDS while the window is
// up. Outdoor leftovers despawn on close; an inventory container's remainder stays claimable.

import type { ItemInstance } from './itemInstance.ts';
import type { Inventory } from './inventory.ts';
import {
  GAMEOBJECT_TYPE_CHEST, GAMEOBJECT_TYPE_FISHINGNODE, GAMEOBJECT_TYPE_FISHINGHOLE,
} from '../world/gameObjects.ts';

/** One row of held loot. `instance` carries a rolled suffix/enchant so taking never re-rolls it. */
export interface PendingLootRow {
  item: number;
  count: number;
  /** Wave Q identity, rolled when the loot was generated (LOCK 1: never re-rolled on take). */
  instance?: ItemInstance;
  /** True once a take attempt failed for space — the UI shows why instead of silently no-oping. */
  blocked?: boolean;
}

/** What kind of thing is holding the loot. Drives the portrait, the title and the open cue. */
export type PendingLootKind =
  | 'corpse' | 'chest' | 'object' | 'mining' | 'herbalism' | 'fishing' | 'skinning' | 'container';

export interface PendingLoot {
  kind: PendingLootKind;
  /** Frame title — the creature / object / node / container name. */
  title: string;
  rows: PendingLootRow[];
  /** Copper still in the container (corpse gold). Taken as its own click, like WoW's coin row. */
  copper: number;
  /** Icon name for the portrait when there is no creature to draw. */
  icon?: string;
  /** Creature entry for a corpse — the portrait uses its baked sprite. */
  creatureEntry?: number;
  /** Item entry of the container that was opened (picks the open cue: clam vs lockbox vs crate). */
  containerItem?: number;
  /** A key/lockpick was consumed opening this — the metal click leads the cue. */
  keyUsed?: boolean;
  /** Footer line: skill-up, charges left, "bags full", "nothing usable". */
  note?: string;
}

/** Bags plus still-held loot rows so findUpgrades can score the corpse before take. */
export function inventoryPlusPending(
  inv: Inventory,
  pending: PendingLoot | null | undefined,
): Inventory {
  if (!pending?.rows.length) return inv;
  return {
    stacks: [
      ...inv.stacks,
      ...pending.rows.map((r) => r.instance ?? { item: r.item, count: r.count }),
    ],
  };
}

/** Nothing left to take: no rows and no money. An emptied container closes itself. */
export function isLootEmpty(loot: PendingLoot | null | undefined): boolean {
  if (!loot) return true;
  return loot.copper <= 0 && loot.rows.length === 0;
}

/** How many separate things are still in there (money counts as one), for badges/labels. */
export function lootRowCount(loot: PendingLoot | null | undefined): number {
  if (!loot) return 0;
  return loot.rows.length + (loot.copper > 0 ? 1 : 0);
}

/** Drop the row at `index`, keeping the rest in order. Out-of-range returns the list unchanged. */
export function removeLootRow(loot: PendingLoot, index: number): PendingLoot {
  if (index < 0 || index >= loot.rows.length) return loot;
  return { ...loot, rows: loot.rows.filter((_, i) => i !== index) };
}

/** Mark the row at `index` as blocked (bags full) or clear that mark on every row. */
export function markLootBlocked(loot: PendingLoot, index: number, blocked: boolean): PendingLoot {
  return {
    ...loot,
    rows: loot.rows.map((r, i) => {
      if (i !== index) return r;
      const next = { ...r };
      if (blocked) next.blocked = true; else delete next.blocked;
      return next;
    }),
  };
}

/** Loot-container kind for a gather node, by its profession line. */
export function gatherLootKind(skill: string | undefined): PendingLootKind {
  if (skill === 'mining') return 'mining';
  if (skill === 'herbalism') return 'herbalism';
  if (skill === 'fishing') return 'fishing';
  if (skill === 'skinning') return 'skinning';
  return 'object';
}

// Loot-container kind for a GameObject: a chest or anything locked gets the lid cue, a fishing
// node the water cue, everything else clickable is a plain object.
export function goLootKind(go: {
  type?: number; lockId?: number; chest?: unknown; fishnode?: unknown; fishinghole?: unknown;
} | undefined): PendingLootKind {
  if (!go) return 'object';
  if (go.type === GAMEOBJECT_TYPE_FISHINGNODE || go.type === GAMEOBJECT_TYPE_FISHINGHOLE
    || go.fishnode != null || go.fishinghole != null) return 'fishing';
  if (go.type === GAMEOBJECT_TYPE_CHEST || go.chest != null || (go.lockId ?? 0) > 0) return 'chest';
  return 'object';
}
