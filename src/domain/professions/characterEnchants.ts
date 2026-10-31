// Temp weapon enchant (TEMP_ENCHANTMENT_SLOT) selectors + mutations.
// Extracted from character.ts (Wave 1 S3 barrel split). Pure move — no behavior change.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character, TempEnchantHand, TempEnchantState, TempEnchantMap, EquippedMap } from '../character/character.ts';
import { equippedInstance, hasIdentity } from '../items/itemInstance.ts';
import { withTempEnchant } from './enchantApply.ts';
import { pruneExpiredAuras, getActiveBuffIds } from '../character/characterStats.ts';

// True when a spell applies a temporary weapon enchant (imbue or poison). Thin bake rows ship
// effects:[] with rawEffects 54 only, and without that check a prior imbue is never dropped.
export function isWeaponImbueSpell(spell: {
  effects?: readonly { kind: string }[];
  rawEffects?: readonly { effect?: number }[];
} | null | undefined): boolean {
  if (!spell) return false;
  if (spell.effects?.some((e) => e.kind === 'weapon_imbue')) return true;
  // SPELL_EFFECT_ENCHANT_ITEM_TEMPORARY = 54
  return !!spell.rawEffects?.some((e) => (e.effect ?? 0) === 54);
}

// Hunter Aspects — spell_group 10, rule UNIQUE_PER_CASTER. The bake's exclusionGroup and
// spellGroupId are preferred; the name prefix is last-resort for fixtures missing both.
export function isHunterAspectSpell(
  spell: { name?: string; exclusionGroup?: number; spellGroupId?: number } | null | undefined,
): boolean {
  if (!spell) return false;
  if (spell.exclusionGroup === 10 || spell.spellGroupId === 10) return true;
  // Fallback when bake fields absent (legacy fixtures).
  const n = spell.name;
  return typeof n === 'string' && n.startsWith('Aspect of the ');
}

// Mutual-exclusion group id for UNIQUE_PER_CASTER / EXCLUSIVE spell groups (Aspects = 10, Mage Armors = 13,
// …). Prefers exclusionGroup, then spellGroupId.
export function spellExclusionGroup(
  spell: { exclusionGroup?: number; spellGroupId?: number } | null | undefined,
): number | null {
  if (!spell) return null;
  if (spell.exclusionGroup != null && spell.exclusionGroup > 0) return spell.exclusionGroup;
  if (spell.spellGroupId != null && spell.spellGroupId > 0) return spell.spellGroupId;
  return null;
}

// spell_group Rule 2 (UNIQUE_PER_CASTER): only the SAME caster's row is replaced, so two paladins
// leave two Blessings on one body. Rule 1 (UNIQUE) replaces whoever cast it. Cite: SpellStacking.h:31
// SpellGroupRule; Unit.cpp:4973 personal = rule == UNIQUE_PER_CASTER, :5021 RemoveAurasByCasterSpell.
// Ids off src_spell_group Rule=2: 6 Judgement, 7 Blessing, 8 Aura, 9 Sting, 10 Aspect, 12 Curse,
// 21 Alcohol. The bake collapses Rule>=1 to one flag, so the rule itself is read here.
const PER_CASTER_EXCLUSION_GROUPS: ReadonlySet<number> = new Set([6, 7, 8, 9, 10, 12, 21]);

/** True when this spell's exclusion group only replaces the same caster's own aura. */
export function exclusionIsPerCaster(
  spell: { exclusionGroup?: number; spellGroupId?: number } | null | undefined,
): boolean {
  const g = spellExclusionGroup(spell);
  return g != null && PER_CASTER_EXCLUSION_GROUPS.has(g);
}

// Apply a temporary weapon enchant to one hand, replacing any prior temp enchant on THAT HAND
// only. Also writes ItemInstance.tempEnchant so identity travels with the item on unequip.
export function applyTempEnchant(
  char: Character,
  hand: TempEnchantHand,
  state: TempEnchantState,
  now: number = Date.now(),
  ds?: DataStore,
): Character {
  const prev = char.tempEnchants?.[hand];
  const otherHand: TempEnchantHand = hand === 'mainhand' ? 'offhand' : 'mainhand';
  const other = char.tempEnchants?.[otherHand];
  const tempEnchants: TempEnchantMap = { ...(char.tempEnchants ?? {}) };
  tempEnchants[hand] = state;

  // Mirror as an aura for buffPresent and the UI, stripping only this hand's prior apply and equip
  // auras — never every imbue, which lied "one imbue" while both hands stayed coated.
  let auras = pruneExpiredAuras(char.activeAuras, now).slice();
  auras = auras.filter((a) => {
    if (prev && a.spellId === prev.spellId) {
      // Other hand still carries the same apply spell → keep one chip.
      if (other?.spellId === prev.spellId) return true;
      return false;
    }
    if (prev?.equipSpellId != null && a.spellId === prev.equipSpellId) {
      if (other?.equipSpellId === prev.equipSpellId) return true;
      return false;
    }
    // Drop then re-push so expiresAt refreshes; other hand with same id still gets one chip.
    if (a.spellId === state.spellId) return false;
    if (state.equipSpellId != null && a.spellId === state.equipSpellId) return false;
    return true;
  });
  const expiresAt = state.expiresAt;
  auras.push({ spellId: state.spellId, expiresAt });
  // Oil / Rockbiter equip passive while TEMP is live (duration = temp expiresAt).
  // durationMs 0 on the equip spell means "while enchanted", not permanent character-wide.
  if (state.equipSpellId != null && state.equipSpellId > 0) {
    auras.push({ spellId: state.equipSpellId, expiresAt });
  }

  // LOCK 2: dual-write identity onto the equipped instance (one-release migration with slot map).
  const equipped: EquippedMap = { ...char.equipped };
  const cur = equippedInstance(equipped[hand]);
  if (cur != null) {
    const te: { id: number; expiresAt?: number } = { id: state.enchantId };
    if (state.expiresAt != null) te.expiresAt = state.expiresAt;
    const next = withTempEnchant(cur, te);
    equipped[hand] = hasIdentity(next) ? next : next.item;
  }

  return {
    ...char,
    equipped,
    tempEnchants,
    activeAuras: auras,
    activeBuffs: getActiveBuffIds({ ...char, activeAuras: auras }, now, ds),
  };
}

// Drop TEMP_ENCHANTMENT_SLOT combat authority + equip-spell auras for a hand. Used by equip/unequip so a
// poison/oil does not follow a weapon swap (W5 D1).
export function clearTempEnchantHand(
  char: Character,
  hand: TempEnchantHand,
  now: number = Date.now(),
  ds?: DataStore,
): Character {
  const te = char.tempEnchants?.[hand];
  if (!te) return char;
  const otherHand: TempEnchantHand = hand === 'mainhand' ? 'offhand' : 'mainhand';
  const other = char.tempEnchants?.[otherHand];
  const tempEnchants: TempEnchantMap = { ...(char.tempEnchants ?? {}) };
  delete tempEnchants[hand];
  const nextMap = (tempEnchants.mainhand || tempEnchants.offhand) ? tempEnchants : undefined;
  let auras = pruneExpiredAuras(char.activeAuras, now).slice();
  // Keep apply/equip aura when the other hand still uses the same spell ids.
  auras = auras.filter((a) => {
    if (a.spellId === te.spellId) return other?.spellId === te.spellId;
    if (te.equipSpellId != null && a.spellId === te.equipSpellId) {
      return other?.equipSpellId === te.equipSpellId;
    }
    return true;
  });
  return {
    ...char,
    tempEnchants: nextMap,
    activeAuras: auras,
    activeBuffs: getActiveBuffIds({ ...char, activeAuras: auras }, now, ds),
  };
}

// Living, non-expired temp enchant on a hand, or undefined. Combat authority is char.tempEnchants;
// the instance field is identity transport only, and no id→spell rehydrate happens here.
export function getTempEnchant(
  char: Character,
  hand: TempEnchantHand,
  now: number = Date.now(),
): TempEnchantState | undefined {
  const te = char.tempEnchants?.[hand];
  if (!te) return undefined;
  if (te.expiresAt != null && te.expiresAt <= now) return undefined;
  return te;
}

// Flat AP from temp enchants that cache attackPower without an equip-spell aura. Rockbiter stamps
// both, and AP must come from the aura alone or sheet and combat read 2× tooltip (KI-1039).
export function tempEnchantAttackPower(char: Character, now: number = Date.now()): number {
  let ap = 0;
  for (const hand of ['mainhand', 'offhand'] as const) {
    const te = getTempEnchant(char, hand, now);
    if (!te?.attackPower) continue;
    if (te.equipSpellId != null && te.equipSpellId > 0) continue;
    ap += te.attackPower;
  }
  return ap;
}
