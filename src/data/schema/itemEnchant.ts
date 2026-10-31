// SpellItemEnchantment — what an enchant GRANTS (keyed by enchant id) and which slots an apply
// spell may target (keyed by apply spell). Separate because 16 enchant ids are shared across slots.

import type { School, Stat } from './primitives.ts';

/** School index for ITEM_ENCHANTMENT_TYPE_RESISTANCE: 0 is ARMOR, 1..6 are the magic schools. */
export type EnchantResistSchool = 'armor' | School;

// What an EQUIP_SPELL (type 3) enchant grants, resolved from the arg spell's aura. 111 of 134
// permanent enchants are EQUIP_SPELL, which is why a stats[]-only shape covered 10 of 201 ids.
export type EnchantGrant =
  | { kind: 'stat'; stat: Stat; amount: number }                              // aura 29 MOD_STAT
  /** aura 29 with EffectMiscValue -1 — "+N to all stats". */
  | { kind: 'all_stats'; amount: number }
  | { kind: 'resist'; school: EnchantResistSchool; amount: number }           // aura 22 MOD_RESISTANCE
  | { kind: 'armor'; amount: number }                                         // type 4, arg 0
  | { kind: 'health'; amount: number }                                        // aura 34
  | { kind: 'mana'; amount: number }                                          // aura 35
  | { kind: 'attack_power'; amount: number }                                  // aura 99
  | { kind: 'ranged_attack_power'; amount: number }                           // aura 124
  | { kind: 'spell_power'; amount: number; school?: School }                  // aura 13
  | { kind: 'healing_power'; amount: number }                                 // aura 135
  | { kind: 'mp5'; amount: number }                                           // aura 85
  | { kind: 'hp5'; amount: number }                                           // aura 84
  | { kind: 'haste_pct'; amount: number }                                     // aura 138 / 140
  | { kind: 'crit_pct'; amount: number }                                      // aura 52
  | { kind: 'hit_pct'; amount: number }                                       // aura 54
  | { kind: 'dodge_pct'; amount: number }                                     // aura 49
  | { kind: 'block_pct'; amount: number }                                     // aura 51
  | { kind: 'skill'; skillLine: number; amount: number }                      // aura 30
  | { kind: 'threat_pct'; amount: number }                                    // aura 10
  | { kind: 'stealth_level'; amount: number }                                 // aura 154
  | { kind: 'move_speed_pct'; amount: number }                                // aura 31
  | { kind: 'mount_speed_pct'; amount: number }                               // aura 130
  | { kind: 'attack_power_vs'; creatureTypeMask: number; amount: number }     // aura 102 / 131
  | { kind: 'spell_damage_vs'; creatureTypeMask: number; amount: number }     // aura 180
  | { kind: 'damage_done_creature'; creatureTypeMask: number; amount: number }// aura 59
  | { kind: 'mechanic_immunity'; mechanic: number }                           // aura 77 — Weapon Chain → disarm
  | { kind: 'hp5_combat'; amount: number }                                    // aura 161 (in combat only)
  | { kind: 'spell_crit_pct'; amount: number }                                // aura 57
  | { kind: 'spell_hit_pct'; amount: number }                                 // aura 55
  | { kind: 'block_value'; amount: number }                                   // aura 158
  /** aura 42 PROC_TRIGGER_SPELL — Crusader, Fiery Weapon, Lifestealing. The chance lives on the
   *  arg spell's ProcChance, the payload on its EffectTriggerSpell. */
  | { kind: 'proc_spell'; spellId: number; chancePct?: number }
  /** aura 43 PROC_TRIGGER_DAMAGE — flat damage back on the attacker (thorns-shaped). */
  | { kind: 'proc_damage'; amount: number }
  /** An arg spell whose aura this decode does not model yet. Kept so the row is never silently
   *  dropped — a reader can see the enchant grants SOMETHING and go look it up. */
  | { kind: 'unmapped_aura'; auraId: number; amount: number };

/** One of the three effect slots on a SpellItemEnchantment row, as ApplyEnchantment iterates 0..2. */
export type ItemEnchantEffect =
  | { type: 'combat_spell'; spellId: number; chancePct?: number; ppm?: number }   // 1
  | { type: 'weapon_damage'; amount: number }                                     // 2
  | { type: 'equip_spell'; spellId: number; grants: EnchantGrant[] }              // 3
  | { type: 'resistance'; school: EnchantResistSchool; amount: number }           // 4
  | { type: 'stat'; stat: Stat; amount: number }                                  // 5
  | { type: 'totem'; amountPerSecOfSpeed: number };                               // 6

// One SpellItemEnchantment row, slot-agnostic on purpose — see the file header.
// Cite: DBCStructure.h SpellItemEnchantmentEntry (24 fields, recordSize 96); DBCEnums.h.
export interface ItemEnchantDef {
  /** SpellItemEnchantment.ID — the link that did not exist in the bake at all. */
  id: number;
  /** Recovered name from the DBC string block. */
  name: string;
  /** Up to three, in DBC slot order. */
  effects: ItemEnchantEffect[];
  // DBC Flags 0x01 — blocks application to an item in the TRADE window. Cite: Spell.cpp CheckCast, effect
  // 53 / effect 54 branches.
  soulbound?: boolean;
  /** DBC Flags 0x04 — main hand only. Cite: Item::IsMainHandOnlyEnchant. */
  mainhandOnly?: boolean;
  /** ItemVisual / aura_id (DBC field 22). Cosmetic; kept because the column exists. */
  itemVisual?: number;
}

// One apply spell — an item's `useSpell`, or a shaman/rogue cast — carrying pure targeting and
// duration. This is what a "where do you want it?" picker reads. Cite: Item::IsFitToSpellRequirements.
export interface EnchantApplicatorDef {
  spellId: number;
  /** → ItemEnchantDef.id */
  enchantId: number;
  /** effect 53 (PERM_ENCHANTMENT_SLOT) vs effect 54 (TEMP_ENCHANTMENT_SLOT). */
  permanent: boolean;
  /** Effect 54 only. cmangos: `damage > 0 ? damage : 3600` seconds. Cite: SpellEffects.cpp
   *  EffectEnchantItemTmp. */
  durationMs?: number;
  target: {
    /** 2 weapon | 4 armor | -1 any. */
    itemClass: 2 | 4 | -1;
    /** 0 = any. Bit per ItemPrototype subclass. */
    subClassMask: number;
    /** 0 = any. Bit per InventoryType. */
    inventoryTypeMask: number;
    // Permanent only: spell_template.BaseLevel as weapon/armor ItemLevel floor (Spell.cpp:6672-6673).
    // Temporary applicators always 0 — baseLevel is player rank, not ilvl.
    minItemLevel: number;
  };
  /** Targets & TARGET_FLAG_ITEM. */
  requiresItemTarget: boolean;
  /** AttributesEx2 & 0x2000 — refuses an item in the trade window (someone else's). */
  ownItemOnly: boolean;
}
