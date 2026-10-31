// Combat rating / chance selectors: crit, dodge, parry, block, haste, hit, skill.
// Extracted from character.ts (Wave 1 S3 barrel split). Pure move — no behavior change.

import type { DataStore } from '../../data/dataStore.ts';
import type { EquipSlot, School, ShapeshiftFormId, SpellDef, SpellEffect } from '../../data/schema.ts';
import type { Character } from './character.ts';
import { equippedEntry, equippedInstance, type EquippedValue } from '../items/itemInstance.ts';
import {
  TUNING,
  meleeCritFromAgility,
  dodgeChancePercent,
  spellCritFromIntellect,
  skillDisplayBonusPercentPoints,
} from '../../engine/combat/formulas.ts';
import { skillMaxForLevel } from '../../engine/combat/mitigation.ts';
import { isBroken } from '../items/durability.ts';
import { isAttackSpeedOverriddenShapeShift } from './forms.ts';
import {
  skillIdForItem,
  combatSkillValueWithBonus,
  skillIdFromEquipModKey,
  COMBAT_SKILL,
} from './combatSkills.ts';
import {
  effectiveStats,
  equippedStatBonuses,
  equippedItems,
  getActiveBuffIds,
  passiveBuffModPoints,
  pruneExpiredAuras,
  SPELL_SCHOOL_TO_STAT,
} from './characterStats.ts';
import { talentCritBonus } from './characterTalents.ts';
import { racialSpells } from './races.ts';
import { resolveCombatSpell } from '../../engine/spells/interpreter/item-triggers.ts';
import type { SpellBook } from './spellbook.ts';
import { gearEnchantGrant } from '../professions/gearEnchant.ts';

/** True if the off-hand holds a shield (an off-hand armor piece, not a weapon). A broken shield can't block. */
export function hasShieldEquipped(char: Character, ds: DataStore): boolean {
  const oh = equippedEntry(char.equipped.offhand);
  const it = oh != null ? ds.item(oh) : undefined;
  return !!it && it.slot === 'offhand' && (it.armor ?? 0) > 0 && !it.weapon && !isBroken(char, 'offhand', it);
}

// True if the player can parry: a weapon equipped AND CanParry trained, from a SPELL_EFFECT_PARRY
// in the spellbook or the mono combat skill. A broken main hand cannot. Cite: Player.cpp.
export function canParry(char: Character, ds: DataStore, sb?: SpellBook): boolean {
  const mh = equippedEntry(char.equipped.mainhand);
  if (mh == null) return false;
  const it = ds.item(mh);
  if (!it?.weapon || isBroken(char, 'mainhand', it)) return false;
  if (sb) {
    for (const id of sb.known) {
      const sp = ds.spell(id);
      if (!sp) continue;
      if ((sp.effects ?? []).some((e) => e.kind === 'can_parry')) return true;
      if ((sp.rawEffects ?? []).some((r) => (r.effect | 0) === 22)) return true;
    }
    return false;
  }
  if (char.combatSkills == null) return true;
  return (char.combatSkills[90]?.current ?? 0) > 0;
}

// Effective melee crit chance (0..1): the class/level agi curve plus gear crit points and talents.
// The combat value — it does NOT include the skill 0.04, which is UI-only in CMaNGOS.
export function critChance(char: Character, ds: DataStore): number {
  const st = effectiveStats(char, ds);
  const fromAgi = meleeCritFromAgility(char.cls, char.level, st.agi) / 100;
  const g = equippedStatBonuses(char, ds).crit ?? 0;
  const t = talentCritBonus(char, ds) / 100;
  // Temporary crit buffs (Elixir of the Mongoose aura 52, etc.) — whole %points.
  // Cite: SpellAuras HandleAuraModCritPercent; map-spell-effects aura 52; KI-591.
  let auraCrit = 0;
  for (const id of getActiveBuffIds(char, Date.now(), ds)) {
    for (const eff of ds.spell(id)?.effects ?? []) {
      if (eff.kind === 'buff' && eff.mod === 'crit') auraCrit += eff.amount || 0;
    }
  }
  return Math.max(0, fromAgi + g / 100 + t + auraCrit / 100);
}

// Fold MOD_SKILL / defense buffs from one spell into a skill-id → bonus map. Cite: SpellAuras.cpp
// HandleAuraModSkill → Player::ModifySkillBonus
function addSkillBonusEffects(
  out: Partial<Record<number, number>>,
  effects: readonly SpellEffect[] | undefined,
): void {
  if (!effects?.length) return;
  // pushModSkillIntent emits both mod_skill and buff.defense for SKILL_DEFENSE, so count mod_skill
  // only. buff.defense is the paperdoll Stat twin. Cite: SpellAuras.cpp:2055.
  for (const e of effects) {
    if (!e) continue;
    if (e.kind === 'mod_skill') {
      const id = e.skillId | 0;
      const amt = e.amount | 0;
      if (!id || !amt) continue;
      out[id] = (out[id] ?? 0) + amt;
    }
  }
}

function addSkillBonusSpell(
  out: Partial<Record<number, number>>,
  raw: SpellDef | undefined | null,
  casterLevel: number,
): void {
  if (!raw) return;
  const sp = resolveCombatSpell(raw, { casterLevel, unitTargetIsPlayer: true });
  addSkillBonusEffects(out, sp.effects as SpellEffect[]);
}

// Permanent plus temporary skill bonuses, from equip spells and mods, permanent SIE skill enchants,
// racials, passives, talents and OOC auras. Cite: Player.cpp ModifySkillBonus.
export function collectSkillBonuses(
  char: Character,
  ds: DataStore,
  sb?: SpellBook | null,
): Partial<Record<number, number>> {
  const out: Partial<Record<number, number>> = {};
  const level = char.level;

  // Gear: prefer equipSpells resolve (full MOD_SKILL); else baked equipMods only.
  // Never both — equipMods is the FI3 fold of the same equipSpells.
  for (const it of equippedItems(char, ds)) {
    const spells = it.equipSpells ?? [];
    if (spells.length > 0) {
      for (const sid of spells) addSkillBonusSpell(out, ds.spell(sid), level);
    } else {
      for (const m of it.equipMods ?? []) {
        if (!m || typeof m.mod !== 'string') continue;
        const amount = Number(m.amount);
        if (!Number.isFinite(amount) || amount === 0) continue;
        if (m.mod === 'defense') {
          out[COMBAT_SKILL.DEFENSE] = (out[COMBAT_SKILL.DEFENSE] ?? 0) + amount;
          continue;
        }
        const skillId = skillIdFromEquipModKey(m.mod);
        if (skillId) out[skillId] = (out[skillId] ?? 0) + amount;
      }
    }
  }
  // Random-prop type-3 + permanent enchants (SIE skill / of Defense / weapon skill).
  // Cite: Player.cpp ApplyEnchantment PROP_* + PERM; HandleAuraModSkill; KI-935.
  for (const [slot, v] of Object.entries(char.equipped ?? {}) as [EquipSlot, EquippedValue | undefined][]) {
    const entry = equippedEntry(v);
    if (entry == null) continue;
    const it = ds.item(entry);
    if (!it || isBroken(char, slot, it)) continue;
    const inst = equippedInstance(v);
    const rpId = inst?.randomPropertyId;
    if (rpId != null && rpId > 0) {
      const prop = ds.itemRandomProperty(rpId);
      if (prop?.equipSpellIds?.length) {
        for (const sid of prop.equipSpellIds) addSkillBonusSpell(out, ds.spell(sid), level);
      }
    }
    // Permanent enchant skill lines (Minor Deflect Defense, Mining/Herb/Skin/Fish gloves).
    const eid = inst?.permEnchantId ?? char.enchants?.[slot];
    if (eid == null || eid <= 0) continue;
    const grant = gearEnchantGrant(eid, ds);
    if (!grant?.grants?.length) continue;
    for (const g of grant.grants) {
      if (g.kind !== 'skill') continue;
      const id = g.skillLine | 0;
      const amt = g.amount | 0;
      if (!id || !amt) continue;
      out[id] = (out[id] ?? 0) + amt;
    }
  }

  // Racials (Human Sword Specialization, Orc Axe Specialization, …).
  const racialIds = new Set(ds.race(char.race)?.racials ?? []);
  for (const s of racialSpells(ds, char.race)) {
    addSkillBonusSpell(out, s, level);
  }

  // Known passives (create-kit / trained). Skip racials already folded above.
  if (sb?.known?.length) {
    for (const sid of sb.known) {
      if (racialIds.has(sid)) continue;
      const raw = ds.spell(sid);
      if (!raw?.passive) continue;
      addSkillBonusSpell(out, raw, level);
    }
  }

  // Spent talent ranks — rank spell carries MOD_SKILL_TALENT (Axe Specialization, …).
  for (const [tidStr, rank] of Object.entries(char.talents ?? {})) {
    const tid = Number(tidStr);
    if (!tid || !rank) continue;
    const tal = ds.talent(tid);
    if (!tal) continue;
    const rnkIdx = Math.max(0, Math.min((rank as number) - 1, tal.ranks.length - 1));
    const r = tal.ranks[rnkIdx];
    if (r?.spellId) addSkillBonusSpell(out, ds.spell(r.spellId), level);
  }

  // Live OOC auras (temp buffs that grant skill).
  for (const a of pruneExpiredAuras(char.activeAuras, Date.now())) {
    addSkillBonusSpell(out, ds.spell(a.spellId), level);
  }

  return out;
}

/** Bonus points for one skill line (0 if none). */
export function skillBonusFor(
  char: Character,
  ds: DataStore,
  skillId: number,
  sb?: SpellBook | null,
  cached?: Partial<Record<number, number>> | null,
): number {
  const map = cached ?? collectSkillBonuses(char, ds, sb);
  return map[skillId | 0] ?? 0;
}

// Defense skill: trained (or L×5 if combatSkills absent) + MOD_SKILL / equip defense. source: Unit.cpp
// GetDefenseSkillValue; Player::GetSkillValue(SKILL_DEFENSE)
export function defenseSkill(char: Character, ds: DataStore, sb?: SpellBook | null): number {
  const bonuses = collectSkillBonuses(char, ds, sb);
  let bonus = bonuses[COMBAT_SKILL.DEFENSE] ?? 0;
  // Legacy: equipMods.defense via Stat when no MOD_SKILL path filled defense.
  if (bonus === 0) bonus = equippedStatBonuses(char, ds).defense ?? 0;
  return combatSkillValueWithBonus(char.combatSkills, COMBAT_SKILL.DEFENSE, char.level, bonus);
}

// Weapon skill for the equipped main-hand (or unarmed / feral max) including +skill. source: Unit.cpp
// GetWeaponSkillValue; Player::GetSkillValue; Item::GetSkill
export function weaponSkill(char: Character, ds: DataStore, sb?: SpellBook | null): number {
  const form = (char.form ?? 0) | 0;
  if (isAttackSpeedOverriddenShapeShift(form as ShapeshiftFormId)) {
    return skillMaxForLevel(char.level); // IsNoWeaponShapeShift → max skill (no weapon bonuses)
  }
  const mh = equippedEntry(char.equipped.mainhand);
  const it = mh != null ? ds.item(mh) : undefined;
  const skillId = it?.weapon && !isBroken(char, 'mainhand', it)
    ? (skillIdForItem(it) || COMBAT_SKILL.UNARMED)
    : COMBAT_SKILL.UNARMED;
  const bonus = skillBonusFor(char, ds, skillId, sb);
  return combatSkillValueWithBonus(char.combatSkills, skillId, char.level, bonus);
}

/** Effective weapon skill for a paperdoll hand (MH / OH / ranged). */
export function weaponSkillForHand(
  char: Character,
  ds: DataStore,
  hand: 'mainhand' | 'offhand' | 'ranged',
  sb?: SpellBook | null,
  cachedBonuses?: Partial<Record<number, number>> | null,
): number {
  const form = (char.form ?? 0) | 0;
  if (hand === 'mainhand' && isAttackSpeedOverriddenShapeShift(form as ShapeshiftFormId)) {
    return skillMaxForLevel(char.level);
  }
  const skillId = weaponSkillIdForHand(char, ds, hand);
  if (!skillId) return 0;
  const bonus = skillBonusFor(char, ds, skillId, sb, cachedBonuses);
  return combatSkillValueWithBonus(char.combatSkills, skillId, char.level, bonus);
}

/** Weapon skill id for MH/OH/ranged hand (0 if none). */
export function weaponSkillIdForHand(
  char: Character,
  ds: DataStore,
  hand: 'mainhand' | 'offhand' | 'ranged',
): number {
  const slot = hand === 'mainhand' ? 'mainhand' : hand === 'offhand' ? 'offhand' : 'ranged';
  const entry = equippedEntry(char.equipped[slot]);
  if (entry == null) return hand === 'mainhand' ? COMBAT_SKILL.UNARMED : 0;
  const it = ds.item(entry);
  if (!it?.weapon || isBroken(char, slot, it)) {
    return hand === 'mainhand' ? COMBAT_SKILL.UNARMED : 0;
  }
  return skillIdForItem(it) || (hand === 'mainhand' ? COMBAT_SKILL.UNARMED : 0);
}

// Sheet-only melee crit % (0..1): combat crit + (weaponSkill − L×5)×0.04 / 100. source: StatSystem.cpp
// UpdateCritPercentage UI line
export function critChanceDisplay(char: Character, ds: DataStore): number {
  const base = critChance(char, ds);
  const skillPts = skillDisplayBonusPercentPoints(weaponSkill(char, ds), char.level);
  return Math.max(0, base + skillPts / 100);
}

// Spell crit chance (0..1) from intellect class curves + talent crit %. Recomputes from live effectiveStats
// (includes all_stats_pct → higher int). source: Player.cpp GetSpellCritFromIntellect
export function spellCritChanceFromStats(char: Character, ds: DataStore): number {
  const st = effectiveStats(char, ds);
  const fromInt = spellCritFromIntellect(char.cls, char.level, st.int) / 100;
  const t = talentCritBonus(char, ds) / 100;
  // Gear SPELL_AURA_MOD_SPELL_CRIT_CHANCE (57) via equipMods / resolveEquipBuffMods.
  const g = equippedStatBonuses(char, ds).spellCrit ?? 0;
  return Math.max(0, fromInt + t + g / 100);
}

// Gear SPELL_AURA_MOD_SPELL_HIT_CHANCE (55) in percentage POINTS, seeding the spec's
// spellHitBonusPercent and the character panel's Spell Hit line. Cite: SpellAuras.cpp:3868.
export function spellHitBonusFromGear(char: Character, ds: DataStore): number {
  return equippedStatBonuses(char, ds).spellHit ?? 0;
}

const MAGIC_SPELL_SCHOOLS = ['holy', 'fire', 'nature', 'frost', 'shadow', 'arcane'] as const;

/** Resolve aura-13 effects (bake hollow → rawEffects). Cite: Player.cpp ApplyEnchantment TYPE_EQUIP_SPELL. */
function resolvedAuraBuffs(raw: SpellDef): SpellEffect[] {
  const effs = (raw.effects?.length ? raw.effects : resolveCombatSpell(raw).effects) ?? [];
  return effs;
}

// Advertised spell damage (SpellBaseDamageBonusDone): with no school, generic spell power only;
// with one, generic plus that school's gear Stat and its auras. Cite: Unit.cpp ~7129.
export function spellPower(char: Character, ds: DataStore, school?: School): number {
  const gear = equippedStatBonuses(char, ds);
  let total = gear.spellPower ?? 0;
  if (school && school !== 'physical') {
    const stat = SPELL_SCHOOL_TO_STAT[school];
    if (stat) total += gear[stat] ?? 0;
  }
  for (const id of getActiveBuffIds(char, undefined, ds)) {
    const raw = ds.spell(id);
    if (!raw) continue;
    for (const eff of resolvedAuraBuffs(raw)) {
      if (eff.kind !== 'buff') continue;
      if (eff.mod === 'spell_power') total += eff.amount || 0;
      else if (school && school !== 'physical' && eff.mod === `spell_damage_${school}`) {
        total += eff.amount || 0;
      }
    }
  }
  return total;
}

// Per-school extras only (not generic spellPower). Feed CombatantSpec.spellDamageBySchool. Cite: Unit.cpp
// SpellBaseDamageBonusDone one-school mask bits.
export function spellDamageBySchool(char: Character, ds: DataStore): Partial<Record<School, number>> {
  const gear = equippedStatBonuses(char, ds);
  const out: Partial<Record<School, number>> = {};
  for (const school of MAGIC_SPELL_SCHOOLS) {
    const stat = SPELL_SCHOOL_TO_STAT[school];
    const n = stat ? (gear[stat] ?? 0) : 0;
    if (n) out[school] = n;
  }
  for (const id of getActiveBuffIds(char, undefined, ds)) {
    const raw = ds.spell(id);
    if (!raw) continue;
    for (const eff of resolvedAuraBuffs(raw)) {
      if (eff.kind !== 'buff' || typeof eff.mod !== 'string' || !eff.mod.startsWith('spell_damage_')) continue;
      const school = eff.mod.slice('spell_damage_'.length);
      if (!SPELL_SCHOOL_TO_STAT[school]) continue;
      const amt = eff.amount || 0;
      if (!amt) continue;
      out[school as School] = (out[school as School] ?? 0) + amt;
    }
  }
  return out;
}

/** Effective melee hit chance (0..1) base + gear 'hit' rating as %points. */
export function hitChance(char: Character, ds: DataStore): number {
  let h = TUNING.meleeHitChance;
  const g = equippedStatBonuses(char, ds).hit ?? 0;
  h += g / 100;
  return Math.min(1, Math.max(0, h));
}

/** Haste percent from gear (e.g. 5 for +5% speed). Used for scaleTime. */
export function haste(char: Character, ds: DataStore): number {
  return equippedStatBonuses(char, ds).haste ?? 0;
}

// Effective dodge chance (0..1): base by class, the agi curve, gear, and permanent passive points
// in one fold. Timed dodge stays on liveBuffs. The combat value, with no UI-only skill term.
export function dodgeChance(char: Character, ds: DataStore, sb?: SpellBook): number {
  const st = effectiveStats(char, ds);
  const fromClassAgi = dodgeChancePercent(char.cls, char.level, st.agi) / 100;
  const g = equippedStatBonuses(char, ds).dodge ?? 0;
  const passive = passiveBuffModPoints(char, ds, 'dodge', sb?.known);
  return Math.max(0, fromClassAgi + g / 100 + passive / 100);
}

// Sheet-only dodge % (0..1): combat dodge + (defenseSkill − L×5)×0.04 / 100. source: StatSystem.cpp
// UpdateDodgePercentage UI line
export function dodgeChanceDisplay(char: Character, ds: DataStore): number {
  const base = dodgeChance(char, ds);
  const skillPts = skillDisplayBonusPercentPoints(defenseSkill(char, ds), char.level);
  return Math.max(0, base + skillPts / 100);
}

// Effective parry chance (0..1) — combat, no skill 0.04. Base 5 + GetTotalAuraModifier (MOD_PARRY_PERCENT:
// Deflection talent ranks). Cite: StatSystem.cpp:454 UpdateParryPercentage.
export function parryChance(char: Character, ds: DataStore, sb?: SpellBook): number {
  if (!canParry(char, ds, sb)) return 0;
  const g = equippedStatBonuses(char, ds).parry ?? 0;
  const passive = passiveBuffModPoints(char, ds, 'parry', sb?.known);
  return 0.05 + g / 100 + passive / 100;
}

/** Sheet-only parry % with defense skill 0.04. */
export function parryChanceDisplay(char: Character, ds: DataStore, sb?: SpellBook): number {
  if (!canParry(char, ds, sb)) return 0;
  const base = parryChance(char, ds, sb);
  const skillPts = skillDisplayBonusPercentPoints(defenseSkill(char, ds), char.level);
  return Math.max(0, base + skillPts / 100);
}

// Effective block chance (0..1) — combat, no skill 0.04. Base 5 + GetTotalAuraModifier (MOD_BLOCK_PERCENT:
// Shield Specialization ranks). Cite: StatSystem.cpp:397 UpdateBlockPercentage.
export function blockChance(char: Character, ds: DataStore, sb?: SpellBook): number {
  if (!hasShieldEquipped(char, ds)) return 0;
  const g = equippedStatBonuses(char, ds).block ?? 0;
  const passive = passiveBuffModPoints(char, ds, 'block', sb?.known);
  return 0.05 + g / 100 + passive / 100;
}

/** Sheet-only block % with defense skill 0.04. */
export function blockChanceDisplay(char: Character, ds: DataStore): number {
  if (!hasShieldEquipped(char, ds)) return 0;
  const base = blockChance(char, ds);
  const skillPts = skillDisplayBonusPercentPoints(defenseSkill(char, ds), char.level);
  return Math.max(0, base + skillPts / 100);
}
