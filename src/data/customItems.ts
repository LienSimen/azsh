// Items this game adds that no 1.12 row backs. NOT SOURCED, so they never enter the bake.
// NEVER set notObtainable here: loadReconcile.ts:362 stripJunk deletes such an item on load.

import type { ItemDef } from './schema.ts';

/** Above item_template's max entry (25818), so a custom id can never shadow a real row. */
export const CUSTOM_ITEM_BASE = 900000;

export const GIGA_BAG_ENTRY = CUSTOM_ITEM_BASE + 1;

// Field shape copied from Onyxia Hide Backpack (17966), the closest real bag row. Name parts are
// real 1.12 rows: Bingles' items 7343/7345/7346, Elementium Bar 17771, Wizbang's Gunnysack 2082.
export const CUSTOM_ITEMS: readonly ItemDef[] = [
  {
    entry: GIGA_BAG_ENTRY,
    name: "Bingles' Elementium Gunnysack",
    quality: 4,
    requiredLevel: 0,
    sellPrice: 0,
    buyPrice: 0,
    stackable: 1,
    slot: 'bag',
    bagSlots: 40,
    itemClass: 1,
    itemSubclass: 0,
    inventoryType: 18,
    itemLevel: 62,
    binding: 1,
    bonding: 1,
    material: 8,
    icon: 'inv_misc_bag_15',
  },
];
