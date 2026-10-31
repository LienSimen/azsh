// Equipment rules: which paperdoll slot an item goes into, plus pure equip and unequip between
// bags and the slot map. Kept out of character.ts to avoid an import cycle.

import type { DataStore } from '../../data/dataStore.ts';
import type { EquipSlot, ItemDef, ItemSlot } from '../../data/schema.ts';
import type { Character, EquippedMap, EnchantMap } from '../character/character.ts';
import { clampResourcePools, equippedEntry, equippedInstance } from '../character/character.ts';
import { clearTempEnchantHand } from '../professions/characterEnchants.ts';
import type { DurabilityMap } from './durability.ts';
import type { Inventory } from './inventory.ts';
import { addInstance, takeStack, countItem, usedSlots, BACKPACK_SLOTS } from './inventory.ts';
import type { ItemInstance } from './itemInstance.ts';
import { hasIdentity } from './itemInstance.ts';
import { applyBindToInstance, resolveBonding } from './itemBonding.ts';
import { canEquipQuiverOrPouch } from './ammo.ts';
import type { WeaponSpender } from './weaponSpender.ts';
import { equipItemGates, checkUniqueRestriction } from './itemRestrictions.ts';
import { grantCreateCombatSkills } from '../character/combatSkills.ts';
import {
  applyItemEquipSpells,
  removeItemEquipSpells,
  syncHeldEnchantFromEquipped,
} from '../spells/equipSpells.ts';

export {
  INVTYPE_RELIC,
  ITEM_SUBCLASS_ARMOR_LIBRAM,
  ITEM_SUBCLASS_ARMOR_IDOL,
  ITEM_SUBCLASS_ARMOR_TOTEM,
  ITEM_SUBCLASS_ARMOR_MISC,
  isRelicItem,
  canEquipRelic,
  classHasRelicSlot,
} from './relic.ts';

/** Paperdoll slots in display order (roughly the vanilla character-sheet layout). Bag
 * slots are kept out of this gear list - they render in the Inventory panel (see BAG_SLOTS). */
export const EQUIP_SLOTS: EquipSlot[] = [
  'head', 'neck', 'shoulder', 'back', 'chest', 'shirt', 'wrist',
  'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2',
  'trinket1', 'trinket2', 'mainhand', 'offhand', 'ranged',
];

/** The four container slots (WoW's bag bar) that grow the backpack when a bag is equipped. */
export const BAG_SLOTS: EquipSlot[] = ['bag1', 'bag2', 'bag3', 'bag4'];

export const SLOT_LABEL: Record<EquipSlot, string> = {
  head: 'Head', neck: 'Neck', shoulder: 'Shoulder', back: 'Back', chest: 'Chest', shirt: 'Shirt',
  wrist: 'Wrists',
  hands: 'Hands', waist: 'Waist', legs: 'Legs', feet: 'Feet', finger1: 'Ring 1', finger2: 'Ring 2',
  trinket1: 'Trinket 1', trinket2: 'Trinket 2', mainhand: 'Main Hand', offhand: 'Off Hand', ranged: 'Ranged',
  bag1: 'Bag 1', bag2: 'Bag 2', bag3: 'Bag 3', bag4: 'Bag 4',
};

// The tooltip's slot word, keyed by item_template.InventoryType — NOT the paperdoll slot, so
// INVTYPE_WEAPON is "One-Hand". Cite: FrameXML/GlobalStrings.lua:1802-1824. 24–28 have no string.
export const INVTYPE_LABEL: Record<number, string> = {
  1: 'Head', 2: 'Neck', 3: 'Shoulder', 4: 'Shirt', 5: 'Chest', 6: 'Waist', 7: 'Legs',
  8: 'Feet', 9: 'Wrist', 10: 'Hands', 11: 'Finger', 12: 'Trinket', 13: 'One-Hand',
  14: 'Off Hand', 15: 'Ranged', 16: 'Back', 17: 'Two-Hand', 18: 'Bag', 19: 'Tabard',
  20: 'Chest', 21: 'Main Hand', 22: 'Off Hand', 23: 'Held In Off-hand',
};

// Slot line for an item tooltip. Prefers the baked InventoryType; falls back to slot + armorSubclass for
// the rows that carry no InventoryType (shield 6 vs holdable).
export function itemTypeSlotLabel(
  item: Pick<ItemDef, 'slot' | 'inventoryType' | 'armorSubclass'>,
): string {
  const byType = item.inventoryType != null ? INVTYPE_LABEL[item.inventoryType] : undefined;
  if (byType) return byType;
  const slot = item.slot;
  if (!slot) return '';
  if (slot === 'bag') return INVTYPE_LABEL[18]!;
  if (slot === 'twohand') return INVTYPE_LABEL[17]!;
  if (slot === 'offhand') return item.armorSubclass === 6 ? INVTYPE_LABEL[14]! : INVTYPE_LABEL[23]!;
  if (slot === 'finger') return INVTYPE_LABEL[11]!;
  if (slot === 'trinket') return INVTYPE_LABEL[12]!;
  return SLOT_LABEL[slotTargets(slot)[0]!] ?? '';
}

/** The paperdoll slots an item of a given ItemSlot may occupy, in preference order. */
export function slotTargets(slot: ItemSlot): EquipSlot[] {
  switch (slot) {
    case 'finger': return ['finger1', 'finger2'];
    case 'trinket': return ['trinket1', 'trinket2'];
    case 'twohand': return ['mainhand'];
    case 'bag': return ['bag1', 'bag2', 'bag3', 'bag4'];
    // head/neck/shoulder/back/chest/wrist/hands/waist/legs/feet/mainhand/offhand/ranged
    default: return [slot as EquipSlot];
  }
}

// Dual Wield passive (spell 674). Learning it sets Unit::m_canDualWield. Cite: SpellEffects.cpp
// EffectDualWield ~2628–2632; spell_template Id 674; trainers War/Hunt L20, Rog L10.
export const DUAL_WIELD_SPELL_ID = 674;

/** Spell 674 or any row that emits SPELL_EFFECT_DUAL_WIELD. Cite: SpellEffects.cpp:2628. */
export function knowsDualWield(
  known: readonly number[],
  ds: { spell: (id: number) => { effects?: readonly { kind: string }[] } | undefined },
): boolean {
  for (const id of known) {
    if (id === DUAL_WIELD_SPELL_ID) return true;
    const sp = ds.spell(id);
    if (sp?.effects?.some((e) => e.kind === 'can_dual_wield')) return true;
  }
  return false;
}

/** Options that gate multi-slot equip rules (INVTYPE_WEAPON → OH) + gear scoring. */
export type EquipOpts = {
  // True when the unit knows Dual Wield (674). Without it, baked canOffhand weapons stay
  // mainhand-only. Cite: Player.cpp ViableEquipSlots ~7978; CanUseInventoryType OFFHAND ~9474.
  canDualWield?: boolean;
  // playerbots ai_playerbot_weightscales.id for upgrade scoring. When omitted, equipmentHelper
  // resolves it from talent tree or role. Cite: RandomItemMgr CalculateStatWeight.
  specId?: number;
  /** Companion/player role hint when resolving a default weightscale (tank/healer/dps). */
  role?: string;
  // Skip the post-swap bag capacity check: companion equip puts displaced gear in the bot's own
  // bags, so a player-inventory source must not be measured against the bot's capacity.
  skipBagCapacityCheck?: boolean;
  // The wearer's weapon-damage spender (Sinister Strike), so a main-hand candidate is priced per
  // cast and not by listed DPS alone. Absent → listed DPS only. Cite: weaponSpender.ts.
  weaponSpender?: WeaponSpender | null;
};

// Paperdoll slots an ItemDef may occupy, in preference order. INVTYPE_WEAPON rows are eligible for
// both hands when canDualWield; without it the field is ignored. Cite: Player.cpp:7978–7987.
export function itemSlotTargets(
  item: Pick<ItemDef, 'slot' | 'canOffhand'>,
  opts?: EquipOpts,
): EquipSlot[] {
  if (!item.slot) return [];
  if (item.canOffhand === true && opts?.canDualWield) {
    return ['mainhand', 'offhand'];
  }
  return slotTargets(item.slot);
}

// Multi-target slots the player must choose among. Empty means auto-equip can pick; two or more
// means every candidate is occupied and the UI should offer a picker.
export function equipSlotPickTargets(
  char: Pick<Character, 'equipped'>,
  item: Pick<ItemDef, 'slot' | 'canOffhand'>,
  opts?: EquipOpts,
): EquipSlot[] {
  const targets = itemSlotTargets(item, opts);
  if (targets.length <= 1) return [];
  const empty = targets.filter((s) => char.equipped[s] == null);
  if (empty.length > 0) return [];
  return targets;
}

// Create-screen paperdoll preview: the starter kit a race×class would wear after newGameState
// auto-equip, walking createInfo through the same equipItemGates path, inventing nothing.
export function starterEquippedPreview(
  ds: Pick<DataStore, 'createInfo' | 'item' | 'combatSkillMeta' | 'faction'>,
  race: number,
  cls: number,
): EquippedMap {
  const ci = ds.createInfo(race, cls);
  const combatSkills = grantCreateCombatSkills(
    ci?.skills ?? [],
    1,
    ds.combatSkillMeta?.(),
    race,
    cls,
  );
  // Minimal L1 shell for equipItemGates — same race/class/level/skills as newGameState seed.
  const gateChar = {
    name: '',
    race,
    cls,
    level: 1,
    xp: 0,
    gold: 0,
    zoneId: '',
    health: 1,
    power: 0,
    equipped: {} as EquippedMap,
    activeBuffs: [] as number[],
    skills: {},
    knownRecipes: [] as number[],
    combatSkills,
    reputations: {},
  } as Character;

  const equipped: EquippedMap = {};
  for (const it of ci?.items ?? []) {
    const def = ds.item(it.item);
    if (!def?.slot) continue;
    // Same gates equipItem applies — proficiency-blocked starter weapons stay bags-only.
    if (!equipItemGates(gateChar, def, ds as DataStore).ok) continue;
    // Starters never need Dual Wield for create kits (INVTYPE_WEAPON goes MH first).
    const targets = itemSlotTargets(def, { canDualWield: false });
    const target = targets.find((s) => equipped[s] == null) ?? targets[0];
    // Two-hand ⟷ off-hand exclusivity (same as equipItem).
    if (def.slot === 'twohand' && equipped.offhand != null) {
      delete equipped.offhand;
    } else if (
      (def.slot === 'offhand' || (def.canOffhand === true && target === 'offhand'))
      && equipped.mainhand != null
      && ds.item(equippedEntry(equipped.mainhand)!)?.slot === 'twohand'
    ) {
      delete equipped.mainhand;
    }
    equipped[target] = it.item;
  }
  return equipped;
}

// Total backpack capacity: the base 16-slot pack plus the bagSlots of every worn bag. Data-driven
// — no slot count is hardcoded per bag; it comes from the item's own bagSlots.
export function bagCapacity(char: Character, ds: DataStore): number {
  let cap = BACKPACK_SLOTS;
  for (const slot of BAG_SLOTS) {
    const entry = equippedEntry(char.equipped[slot]);
    const it = entry != null ? ds.item(entry) : undefined;
    if (it?.slot === 'bag') cap += it.bagSlots ?? 0;
  }
  return cap;
}

export interface EquipResult {
  ok: boolean;
  reason?: string;
  char: Character;
  inventory: Inventory;
  slot?: EquipSlot; // where the item landed, on success
}

const stack = (ds: DataStore, entry: number): number => ds.item(entry)?.stackable ?? 1;

// Equip `entry` from the bags, filling an empty ring or trinket slot when possible and otherwise
// swapping the occupant back. A two-hander frees the off hand, and an off-hand frees a 2H.
export function equipItem(
  char: Character, inv: Inventory, ds: DataStore, entry: number, preferred?: EquipSlot,
  opts?: EquipOpts,
): EquipResult {
  const fail = (reason: string): EquipResult => ({ ok: false, reason, char, inventory: inv });
  const it = ds.item(entry);
  if (!it) return fail('Unknown item');
  // Level / class / proficiency / requiredRep / allowableRace (FI4).
  // Cite: Player.cpp CanUseItem; domain/items/itemRestrictions.ts.
  const gates = equipItemGates(char, it, ds);
  if (!gates.ok) return fail(gates.reason);
  if (countItem(inv, entry) <= 0) return fail("You don't have that");

  // Preferred offhand on an INVTYPE_WEAPON without Dual Wield → explicit refuse (not "falls back to
  // mainhand"), matching EQUIP_ERR_CANT_DUAL_WIELD. Cite: Player.cpp:9474–9479.
  if (
    preferred === 'offhand'
    && it.canOffhand === true
    && !opts?.canDualWield
  ) {
    return fail('You cannot dual wield');
  }

  const targets = itemSlotTargets(it, opts);
  if (targets.length === 0) return fail('That cannot be equipped');
  // Preferred slot wins when legal, else the first empty target. Bags are special when every bag
  // slot is filled: pick the SMALLEST occupant so a larger bag can replace it 1-for-1.
  let target: EquipSlot;
  if (preferred && targets.includes(preferred)) {
    target = preferred;
  } else {
    const empty = targets.find((s) => char.equipped[s] == null);
    if (empty) {
      target = empty;
    } else if (it.slot === 'bag') {
      let best = targets[0]!;
      let bestSlots = Infinity;
      for (const s of targets) {
        const occ = equippedEntry(char.equipped[s]);
        const slots = occ != null ? (ds.item(occ)?.bagSlots ?? 0) : 0;
        if (slots < bestSlots) {
          bestSlots = slots;
          best = s;
        }
      }
      target = best;
    } else {
      target = targets[0]!;
    }
  }

  // Unique / Unique-Equipped: ItemDef signals and/or bag instance.unique (LOCK 1).
  // checkUniqueRestriction scans bag stacks for instance.unique when equipping by entry.
  const uniq = checkUniqueRestriction(char, it, inv, target);
  if (!uniq.ok) return fail(uniq.reason);

  // Class-11 quiver/pouch: only one among bag slots. Cite: Player.cpp 9452–9469.
  if (it.slot === 'bag') {
    const qGate = canEquipQuiverOrPouch(char, ds, entry, { swapSlot: target });
    if (!qGate.ok) return fail(qGate.reason ?? 'Cannot equip that bag');
  }

  const equipped: EquippedMap = { ...char.equipped };
  // Slot-map durability and enchants describe the CURRENT occupant, so clear them when it changes.
  // Identity fields live on the ItemInstance and travel with the item — never wipe those.
  const durability: DurabilityMap = { ...char.durability };
  const enchants: EnchantMap = { ...char.enchants };

  // Pull the specific bag stack out, preserving its instance identity, and store a bare entry when
  // there is none. Under a full inventory: take the new bag, equip it, then return the old one.
  const srcIdx = inv.stacks.findIndex((s) => s.item === entry);
  const [invAfterTake, taken] = takeStack(inv, srcIdx, 1);
  let inventory = invAfterTake;
  // BoE soulbinds on equip (BoP/quest already bound from loot). LOCK 1: set instance.bound.
  // Cite: Player equip path sets ITEM_DYNFLAG_BINDED for BIND_WHEN_EQUIPPED.
  let newInstance: ItemInstance = applyBindToInstance(
    taken ?? { item: entry, count: 1 },
    resolveBonding(it),
    'equip',
  );

  const displaced = equippedInstance(equipped[target]);
  if (displaced != null) inventory = addInstance(inventory, displaced, stack(ds, displaced.item));
  // hasIdentity is true when bound / permEnchantId / tempEnchant / etc. — store full instance.
  equipped[target] = hasIdentity(newInstance) ? newInstance : newInstance.item;
  delete durability[target];
  delete enchants[target];
  // One-release migration surface: mirror a bag instance's perm enchant into the slot map so legacy
  // readers of char.enchants still see it. The stats path prefers the instance.
  if (newInstance.permEnchantId != null) {
    enchants[target] = newInstance.permEnchantId;
  }
  // Never inherit the PREVIOUS occupant's temp enchant: the slot map is combat authority, so a
  // fresh weapon starts clean. Also strips equip-spell auras (oils) tied to that hand.
  const now = Date.now();
  let workChar = char;
  // Drop ITEM_SPELLTRIGGER_ON_EQUIP from the displaced occupant (Firestone passive / held enchant).
  // Cite: Player.cpp ApplyItemEquipSpell(item, false).
  if (displaced != null) {
    workChar = removeItemEquipSpells(workChar, ds.item(displaced.item), ds, now);
  }
  if (target === 'mainhand' || target === 'offhand') {
    // Instance-carried temp identity alone is not a full combat payload — clear the combat
    // slot map so we don't leave a stale poison from the prior weapon.
    if (workChar.tempEnchants?.[target]) {
      workChar = clearTempEnchantHand(workChar, target, now, ds);
    }
  }

  // Two-hand and off-hand exclusivity: an INVTYPE_WEAPON going into the off hand also frees a worn
  // 2H, the same as a shield. Cite: Player.cpp:9486–9487 IsTwoHandUsed; ViableEquipSlots.
  const equippingOffhandWeaponOrShield =
    target === 'offhand'
    && (it.slot === 'offhand' || it.canOffhand === true);
  if (it.slot === 'twohand' && equipped.offhand != null) {
    const oh = equippedInstance(equipped.offhand)!;
    inventory = addInstance(inventory, oh, stack(ds, oh.item));
    delete equipped.offhand;
    delete durability.offhand;
    delete enchants.offhand;
    workChar = removeItemEquipSpells(workChar, ds.item(oh.item), ds, now);
    if (workChar.tempEnchants?.offhand) {
      workChar = clearTempEnchantHand(workChar, 'offhand', now, ds);
    }
  } else if (
    equippingOffhandWeaponOrShield
    && equipped.mainhand != null
    && ds.item(equippedEntry(equipped.mainhand)!)?.slot === 'twohand'
  ) {
    const mh = equippedInstance(equipped.mainhand)!;
    inventory = addInstance(inventory, mh, stack(ds, mh.item));
    delete equipped.mainhand;
    delete durability.mainhand;
    delete enchants.mainhand;
    workChar = removeItemEquipSpells(workChar, ds.item(mh.item), ds, now);
    if (workChar.tempEnchants?.mainhand) {
      workChar = clearTempEnchantHand(workChar, 'mainhand', now, ds);
    }
  }

  // Paperdoll first so applyItemEquipSpells / sync see the new occupant.
  workChar = {
    ...workChar,
    equipped,
    durability,
    enchants,
  };
  // ITEM_SPELLTRIGGER_ON_EQUIP: Firestone Passive aura + MH held enchant combat kit.
  // Cite: Player.cpp ApplyItemEquipSpell(item, true); EffectEnchantHeldItem.
  workChar = applyItemEquipSpells(workChar, it, ds, now);
  // MH swap cleared TEMP slot — re-apply Firestone held enchant if offhand still worn.
  workChar = syncHeldEnchantFromEquipped(workChar, ds, now);

  const newChar: Character = clampResourcePools(workChar, ds);
  // Bag-for-bag is a net-zero stack change, so capacity only shrinks when the new bag is smaller —
  // block that overflow. Callers that re-home displaced gear set skipBagCapacityCheck.
  if (
    it.slot === 'bag'
    && !opts?.skipBagCapacityCheck
    && usedSlots(inventory) > bagCapacity(newChar, ds)
  ) {
    return fail('Not enough room - empty a bag slot first');
  }
  return { ok: true, char: newChar, inventory, slot: target };
}

// Unequip whatever is in `slot`, returning it with its full instance identity to the bags.
// Slot-map enchants and durability for the slot are cleared; the instance keeps its own.
export function unequipItem(char: Character, inv: Inventory, ds: DataStore, slot: EquipSlot): EquipResult {
  const inst = equippedInstance(char.equipped[slot]);
  if (inst == null) return { ok: false, reason: 'Nothing equipped there', char, inventory: inv };
  const equipped: EquippedMap = { ...char.equipped };
  delete equipped[slot];
  const durability: DurabilityMap = { ...char.durability };
  delete durability[slot];
  const enchants: EnchantMap = { ...char.enchants };
  delete enchants[slot];
  // The temp enchant lives on char.tempEnchants[hand] for combat: clearing only the paperdoll slot
  // left the poison on the next weapon in that hand. Also strips oil equip-spell auras.
  const now = Date.now();
  let workChar = char;
  // Drop ITEM_SPELLTRIGGER_ON_EQUIP while the paperdoll slot still identifies the occupant —
  // a firestone's held enchant clears through removeItemEquipSpells. Cite: ApplyItemEquipSpell.
  workChar = removeItemEquipSpells(workChar, ds.item(inst.item), ds, now);
  if ((slot === 'mainhand' || slot === 'offhand') && workChar.tempEnchants?.[slot]) {
    workChar = clearTempEnchantHand(workChar, slot, now, ds);
  }
  // Full instance (including perm/temp enchant identity) returns to bags.
  const inventory = addInstance(inv, inst, stack(ds, inst.item));
  workChar = {
    ...workChar,
    equipped,
    durability,
    enchants,
  };
  // Other worn equip items (Firestone still in offhand after MH unequip) re-apply held enchant.
  workChar = syncHeldEnchantFromEquipped(workChar, ds, now);
  const newChar: Character = clampResourcePools(workChar, ds);
  // Unequipping a bag both returns it to the pack and removes its slots - reject if that
  // would leave more stacks than the shrunken pack can hold (WoW: can't remove a full bag).
  if (ds.item(inst.item)?.slot === 'bag' && usedSlots(inventory) > bagCapacity(newChar, ds)) {
    return { ok: false, reason: 'That bag is holding too much - free up space first', char, inventory: inv };
  }
  return { ok: true, char: newChar, inventory, slot };
}
