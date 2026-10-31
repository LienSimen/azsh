// Relic class gate. AllowableClass is 32767 on all 19 classic relics; lock is subclass × class.
// Cite: Player.cpp ViableEquipSlots 8039–8083 (6 idol / 7 libram / 6 totem).

import { CLASS } from '../../data/schema.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { EquipGateResult } from './itemRestrictions.ts';

/** INVTYPE_RELIC — equips into EQUIPMENT_SLOT_RANGED. */
export const INVTYPE_RELIC = 28;
/** ITEM_SUBCLASS_ARMOR_LIBRAM */
export const ITEM_SUBCLASS_ARMOR_LIBRAM = 7;
/** ITEM_SUBCLASS_ARMOR_IDOL */
export const ITEM_SUBCLASS_ARMOR_IDOL = 8;
/** ITEM_SUBCLASS_ARMOR_TOTEM */
export const ITEM_SUBCLASS_ARMOR_TOTEM = 9;
/** ITEM_SUBCLASS_ARMOR_MISC (ViableEquipSlots warlock branch) */
export const ITEM_SUBCLASS_ARMOR_MISC = 0;

export type RelicKind = 'libram' | 'idol' | 'totem' | 'misc';

// Armor subclass for relic gates. Prefer armorSubclass — a bare itemSubclass is shared across ALL
// item classes (tradegoods Herb 9 is the totem enum), so use it only for armor or a fixture.
function armorSubclassOf(item: ItemDef): number | undefined {
  if (item.armorSubclass != null) return item.armorSubclass;
  if (item.itemClass === 4) return item.itemSubclass;
  if (item.itemClass == null && (item.inventoryType === INVTYPE_RELIC || item.typeName != null)) {
    return item.itemSubclass;
  }
  return undefined;
}

/** True when the item is a relic (libram / idol / totem / invtype 28). */
export function isRelicItem(item: ItemDef | undefined): boolean {
  if (!item) return false;
  if (item.inventoryType === INVTYPE_RELIC) return true;
  const sub = armorSubclassOf(item);
  if (sub === ITEM_SUBCLASS_ARMOR_LIBRAM
    || sub === ITEM_SUBCLASS_ARMOR_IDOL
    || sub === ITEM_SUBCLASS_ARMOR_TOTEM) {
    return true;
  }
  const tn = (item.typeName ?? '').toLowerCase();
  return tn === 'libram' || tn === 'idol' || tn === 'totem' || tn === 'relic';
}

export function relicKindOf(item: ItemDef): RelicKind | undefined {
  const sub = armorSubclassOf(item);
  const tn = (item.typeName ?? '').toLowerCase();
  if (sub === ITEM_SUBCLASS_ARMOR_LIBRAM || tn === 'libram') return 'libram';
  if (sub === ITEM_SUBCLASS_ARMOR_IDOL || tn === 'idol') return 'idol';
  if (sub === ITEM_SUBCLASS_ARMOR_TOTEM || tn === 'totem') return 'totem';
  if (sub === ITEM_SUBCLASS_ARMOR_MISC && item.inventoryType === INVTYPE_RELIC) return 'misc';
  return undefined;
}

/** Class ids ViableEquipSlots accepts for this relic, or undefined if not a relic. */
export function relicRequiredClasses(item: ItemDef | undefined): number[] | undefined {
  if (!item || !isRelicItem(item)) return undefined;
  const kind = relicKindOf(item);
  if (kind === 'libram') return [CLASS.PALADIN];
  if (kind === 'idol') return [CLASS.DRUID];
  if (kind === 'totem') return [CLASS.SHAMAN];
  if (kind === 'misc') return [CLASS.WARLOCK];
  if (item.allowClass?.length) return item.allowClass;
  return undefined;
}

// Class gate for INVTYPE_RELIC into the ranged paperdoll slot. Non-relics return ok (no-op). Wrong class →
// refuse.
export function canEquipRelic(
  char: { cls: number },
  item: ItemDef | undefined,
): EquipGateResult {
  if (!item || !isRelicItem(item)) return { ok: true };

  if (item.allowClass && !item.allowClass.includes(char.cls)) {
    return { ok: false, reason: 'Your class cannot use that relic' };
  }

  const kind = relicKindOf(item);
  if (kind == null) {
    if (item.allowClass?.length) return { ok: true };
    return { ok: false, reason: 'Your class cannot use that relic' };
  }

  switch (kind) {
    case 'libram':
      if (char.cls === CLASS.PALADIN) return { ok: true };
      return { ok: false, reason: 'Only paladins can equip librams' };
    case 'idol':
      if (char.cls === CLASS.DRUID) return { ok: true };
      return { ok: false, reason: 'Only druids can equip idols' };
    case 'totem':
      if (char.cls === CLASS.SHAMAN) return { ok: true };
      return { ok: false, reason: 'Only shamans can equip totems' };
    case 'misc':
      if (char.cls === CLASS.WARLOCK) return { ok: true };
      return { ok: false, reason: 'Your class cannot use that relic' };
  }
}

/** Paladin / Druid / Shaman use Relic.blp and hide ammo. Cite: Player.cpp:8046-8065; PaperDollFrame.lua UnitHasRelicSlot. */
export function classHasRelicSlot(cls: number): boolean {
  return cls === CLASS.PALADIN || cls === CLASS.DRUID || cls === CLASS.SHAMAN;
}
