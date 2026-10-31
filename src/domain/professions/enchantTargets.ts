// Which equipped slots an enchant apply spell may legally target, as ONE answer for the picker and
// the validator. The rule is Item::IsFitToSpellRequirements, ANDing the three equipped-item masks.

import type { EnchantApplicatorDef, EquipSlot, ItemDef, ItemEnchantDef } from '../../data/schema.ts';
import type { EquippedMap } from '../character/character.ts';
import { equippedEntry, equippedInstance } from '../items/itemInstance.ts';

export interface EnchantTargetDs {
  item(entry: number): ItemDef | undefined;
  itemEnchant(id: number): ItemEnchantDef | undefined;
}

/** Why a slot cannot take this enchant — surfaced verbatim so the refusal is never mysterious. */
export interface SlotRejection {
  slot: EquipSlot;
  reason: string;
}

export interface EnchantTargetScan {
  /** Slots that would accept it right now. */
  eligible: EquipSlot[];
  /** Slots that hold an item but were refused, with the reason. */
  rejected: SlotRejection[];
}

/** EquipSlot → the InventoryType bits an item in that slot can have. Cite: ItemPrototype.h. */
const SLOT_INVTYPES: Readonly<Record<string, number[]>> = {
  head: [1], neck: [2], shoulder: [3], shirt: [4], chest: [5, 20], waist: [6],
  legs: [7], feet: [8], wrist: [9], hands: [10],
  finger1: [11], finger2: [11], trinket1: [12], trinket2: [12],
  mainhand: [13, 17, 21], offhand: [13, 22, 23, 14], back: [16],
  ranged: [15, 25, 26, 28],
  bag1: [18], bag2: [18], bag3: [18], bag4: [18],
};

/** item_template.class for the two classes an enchant can target. */
const ITEM_CLASS_WEAPON = 2;
const ITEM_CLASS_ARMOR = 4;

// Can `app` be applied to `item` sitting in `slot`? Returns null when it can, else the reason.
// `mainhandOnly` comes from the ENCHANT (DBC flag 0x04), not the applicator.
export function rejectionFor(
  app: EnchantApplicatorDef,
  item: ItemDef,
  slot: EquipSlot,
  enchant?: ItemEnchantDef,
): string | null {
  // --- item class -----------------------------------------------------------
  if (app.target.itemClass === ITEM_CLASS_WEAPON && !item.weapon) {
    return 'That only goes on a weapon';
  }
  if (app.target.itemClass === ITEM_CLASS_ARMOR && item.weapon) {
    return 'That only goes on armor';
  }

  // --- inventory type -------------------------------------------------------
  const mask = app.target.inventoryTypeMask;
  if (mask) {
    // Prefer the item's real InventoryType; fall back to what the slot implies for bakes that
    // omit the column (never guess a MATCH from absence — an unknown type must fail closed).
    const bits = item.inventoryType != null ? [item.inventoryType] : (SLOT_INVTYPES[slot] ?? []);
    if (!bits.some((b) => (mask & (1 << b)) !== 0)) return "That can't go on that slot";
  }

  // --- subclass -------------------------------------------------------------
  const sub = item.weapon ? item.weaponSubclass : item.armorSubclass;
  if (app.target.subClassMask && sub != null) {
    if ((app.target.subClassMask & (1 << sub)) === 0) return "That can't go on that kind of item";
  }

  // --- item level floor (permanent enchants only) ---------------------------
  // Temp imbues use baseLevel as the rank gate, not weapon ilvl. Cite: Spell.cpp:6672 vs :6689.
  if (
    app.permanent &&
    app.target.minItemLevel > 0 &&
    (item.itemLevel ?? 0) < app.target.minItemLevel
  ) {
    return `Requires an item of level ${app.target.minItemLevel} or higher`;
  }

  // --- main-hand-only enchants ---------------------------------------------
  if (enchant?.mainhandOnly && slot !== 'mainhand') return 'That can only go on your main hand';

  return null;
}

// Scan a wearer's equipped gear for slots this applicator accepts. Empty slots are skipped entirely — there
// is nothing there to enchant.
export function scanEnchantTargets(
  equipped: EquippedMap,
  app: EnchantApplicatorDef,
  ds: EnchantTargetDs,
): EnchantTargetScan {
  const enchant = ds.itemEnchant(app.enchantId);
  const eligible: EquipSlot[] = [];
  const rejected: SlotRejection[] = [];

  for (const [slot, v] of Object.entries(equipped) as [EquipSlot, unknown][]) {
    const entry = equippedEntry(v as never);
    if (entry == null) continue;
    const item = ds.item(entry);
    if (!item) continue;
    const why = rejectionFor(app, item, slot, enchant);
    if (why) rejected.push({ slot, reason: why });
    else eligible.push(slot);
  }
  eligible.sort();
  return { eligible, rejected };
}

/** True when `slot` already carries a permanent enchant (re-enchanting REPLACES, as in WoW). */
export function slotHasPermEnchant(equipped: EquippedMap, slot: EquipSlot): boolean {
  return equippedInstance(equipped[slot])?.permEnchantId != null;
}
