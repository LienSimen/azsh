// ITEM_SPELLTRIGGER_ON_EQUIP materialization — equip auras plus ENCHANT_HELD_ITEM chains. We keep
// the combat kit on the temp slot while the item stays equipped, and never overwrite another coat.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { Character, TempEnchantState } from '../character/character.ts';
import { applyAura, equippedItems, getActiveBuffIds } from '../character/characterStats.ts';
import { applyTempEnchant, clearTempEnchantHand, getTempEnchant } from '../professions/characterEnchants.ts';
import {
  combatPayloadFromSpell,
  kitFromItemEnchant,
} from '../../engine/spells/interpreter/weapon-imbue-kit.ts';
import { SPELL_EFFECT_ENCHANT_HELD_ITEM } from '../../engine/spells/interpreter/opcodes.ts';
import { AD_COMMISSION_AURA_SPELL_IDS } from '../../engine/spells/conditions.ts';

/** Resolved held-item combat kit from an equip-spell chain (Firestone Passive → Effect → enchant). */
export interface HeldEnchantFromEquip {
  /** Passive equip spell (e.g. 758 Firestone Passive). */
  passiveSpellId: number;
  /** Intermediate ENCHANT_HELD_ITEM spell (e.g. 1054). */
  effectSpellId: number;
  enchantId: number;
  combatSpellId: number;
  combat: NonNullable<TempEnchantState['combat']>;
  combatChancePct?: number;
  combatPpm?: number;
}

// Walk equip-spell → proc_trigger (or raw trigger) → ENCHANT_HELD_ITEM (92) → combat kit. Returns undefined
// when the chain is absent or has no combat_spell payload.
export function heldItemEnchantFromEquipSpell(
  ds: DataStore,
  equipSpellId: number,
): HeldEnchantFromEquip | undefined {
  const passive = ds.spell(equipSpellId);
  if (!passive) return undefined;

  // Prefer baked proc_trigger_spell; fall back to raw APPLY_AURA triggerSpell.
  let effectSpellId: number | undefined;
  for (const e of passive.effects ?? []) {
    if (e.kind === 'proc_trigger_spell' && e.triggerSpellId) {
      effectSpellId = e.triggerSpellId | 0;
      break;
    }
  }
  if (effectSpellId == null) {
    for (const r of passive.rawEffects ?? []) {
      const trig = r.triggerSpell | 0;
      if (trig > 0) {
        effectSpellId = trig;
        break;
      }
    }
  }
  if (effectSpellId == null || effectSpellId <= 0) return undefined;

  const effectSpell = ds.spell(effectSpellId);
  if (!effectSpell) return undefined;

  let enchantId = 0;
  for (const r of effectSpell.rawEffects ?? []) {
    if ((r.effect | 0) === SPELL_EFFECT_ENCHANT_HELD_ITEM && (r.miscValue | 0) > 0) {
      enchantId = r.miscValue | 0;
      break;
    }
  }
  if (enchantId <= 0) return undefined;

  const ench = ds.itemEnchant?.(enchantId);
  if (!ench) return undefined;

  const kit = kitFromItemEnchant(ench, (id) => {
    const sp = ds.spell(id);
    return sp ?? undefined;
  });
  if (!kit?.combatSpellId) return undefined;

  let combat = kit.combat;
  if (!combat) {
    const proc = ds.spell(kit.combatSpellId);
    if (proc) combat = combatPayloadFromSpell(proc);
  }
  if (!combat?.direct && !combat?.dot) return undefined;

  return {
    passiveSpellId: equipSpellId,
    effectSpellId,
    enchantId,
    combatSpellId: kit.combatSpellId,
    combat,
    ...(kit.combatChancePct != null ? { combatChancePct: kit.combatChancePct } : {}),
    ...(kit.combatPpm != null ? { combatPpm: kit.combatPpm } : {}),
  };
}

/** First held-enchant chain among an item's equipSpells (Firestone ranks). */
export function heldItemEnchantFromItem(
  ds: DataStore,
  item: ItemDef | undefined,
): HeldEnchantFromEquip | undefined {
  if (!item?.equipSpells?.length) return undefined;
  for (const sid of item.equipSpells) {
    const held = heldItemEnchantFromEquipSpell(ds, sid);
    if (held) return held;
  }
  return undefined;
}

// Scan all equipped gear for a Firestone-style held enchant chain. Cite: Player.cpp ApplyItemEquipSpell on
// each equipped item.
export function heldItemEnchantFromEquipped(
  char: Pick<Character, 'equipped'>,
  ds: DataStore,
): HeldEnchantFromEquip | undefined {
  for (const it of equippedItems(char as Character, ds)) {
    const held = heldItemEnchantFromItem(ds, it);
    if (held) return held;
  }
  return undefined;
}

// Apply equip-trigger combat surfaces for `item`: a permanent aura for passives carrying a proc or
// damage shield, and a main-hand temp enchant for a held-item chain. Stat-only equips are skipped.
export function applyItemEquipSpells(
  char: Character,
  item: ItemDef | undefined,
  ds: DataStore,
  now: number = Date.now(),
): Character {
  if (!item?.equipSpells?.length) return char;
  let next = char;

  for (const sid of item.equipSpells) {
    const sp = ds.spell(sid);
    if (!sp) continue;

    // Combat aura shells: proc triggers and damage shields, and SPELL_AURA_DUMMY too. Pure stat
    // buffs already collapsed into ItemDef.equipMods are skipped.
    const hasCombatAura = (sp.effects ?? []).some(
      (e) => e.kind === 'proc_trigger_spell' || e.kind === 'damage_shield',
    );
    const rawHasProcTrigger = (sp.rawEffects ?? []).some(
      (r) => (r.effect | 0) === 6 && ((r.auraName | 0) === 42 || (r.auraName | 0) === 23)
        && (r.triggerSpell | 0) > 0,
    );
    const rawDummy = (sp.rawEffects ?? []).some(
      (r) => (r.effect | 0) === 6 && (r.auraName | 0) === 4,
    );
    // Seal/Rune/Mark of the Champion are AP/SP auras, not dummy — still HasAura for type 10.
    // Cite: Conditions.cpp:228-234; Player.cpp ApplyItemEquipSpell.
    const adCommission = AD_COMMISSION_AURA_SPELL_IDS.has(sid);
    if (hasCombatAura || rawHasProcTrigger || rawDummy || adCommission) {
      // durationMs undefined → permanent while equipped (ITEM_SPELLTRIGGER_ON_EQUIP).
      next = applyAura(next, sid, undefined, now, ds);
    }
  }

  const held = heldItemEnchantFromItem(ds, item);
  if (held) {
    next = applyHeldEnchantIfFree(next, held, ds, now);
  }
  return next;
}

/** Remove equip auras + firestone held enchant when `item` leaves the paperdoll. */
export function removeItemEquipSpells(
  char: Character,
  item: ItemDef | undefined,
  ds: DataStore,
  now: number = Date.now(),
): Character {
  if (!item?.equipSpells?.length) return char;
  let next = char;

  const held = heldItemEnchantFromItem(ds, item);
  if (held) {
    const te = getTempEnchant(next, 'mainhand', now);
    if (te && te.enchantId === held.enchantId) {
      next = clearTempEnchantHand(next, 'mainhand', now, ds);
    }
  }

  // Drop permanent equip-spell auras that this item owned.
  const drop = new Set(item.equipSpells);
  if (next.activeAuras?.some((a) => drop.has(a.spellId))) {
    const auras = (next.activeAuras ?? []).filter((a) => !drop.has(a.spellId));
    next = {
      ...next,
      activeAuras: auras,
      activeBuffs: getActiveBuffIds({ ...next, activeAuras: auras }, now, ds),
    };
  }
  return next;
}

// After a main-hand swap or unequip of a poison, re-apply a held enchant from the remaining equip.
// A no-op when the main hand already has a different temp enchant.
export function syncHeldEnchantFromEquipped(
  char: Character,
  ds: DataStore,
  now: number = Date.now(),
): Character {
  const held = heldItemEnchantFromEquipped(char, ds);
  if (!held) return char;
  return applyHeldEnchantIfFree(char, held, ds, now);
}

function applyHeldEnchantIfFree(
  char: Character,
  held: HeldEnchantFromEquip,
  ds: DataStore,
  now: number,
): Character {
  const existing = getTempEnchant(char, 'mainhand', now);
  // EffectEnchantHeldItem: do not overwrite a different temp enchant (poison/oil/shaman).
  if (existing && existing.enchantId !== held.enchantId) return char;

  // Refresh same enchant or apply fresh. No expiresAt — lives while equip item is worn
  // (vanilla re-applies every 5s for 10s; we keep authority continuous while equipped).
  const state: TempEnchantState = {
    spellId: held.passiveSpellId,
    enchantId: held.enchantId,
    combatSpellId: held.combatSpellId,
    combat: held.combat,
    ...(held.combatChancePct != null ? { combatChancePct: held.combatChancePct } : {}),
    ...(held.combatPpm != null ? { combatPpm: held.combatPpm } : {}),
  };
  return applyTempEnchant(char, 'mainhand', state, now, ds);
}

// Combat-time kit for buildCombatant when char.tempEnchants is empty but a firestone (or similar) is still
// equipped — e.g. after poison expiry mid-session.
export function combatHeldEnchantFromEquipped(
  char: Pick<Character, 'equipped'>,
  ds: DataStore,
): TempEnchantState | undefined {
  const held = heldItemEnchantFromEquipped(char, ds);
  if (!held) return undefined;
  return {
    spellId: held.passiveSpellId,
    enchantId: held.enchantId,
    combatSpellId: held.combatSpellId,
    combat: held.combat,
    ...(held.combatChancePct != null ? { combatChancePct: held.combatChancePct } : {}),
    ...(held.combatPpm != null ? { combatPpm: held.combatPpm } : {}),
  };
}
