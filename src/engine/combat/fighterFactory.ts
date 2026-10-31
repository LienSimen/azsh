// Fighter factory + buff-mod / form helpers (Wave 4 S27) — extracted from engine/combat.ts.

import type { BuffMod, PowerType, School, ShapeshiftFormId } from '../../data/schema.ts';
import {
  LEADER_OF_THE_PACK_AURA_SPELL_ID,
  LEADER_OF_THE_PACK_CRIT_PCT,
  LEADER_OF_THE_PACK_SPELL_ID,
  leaderOfThePackAppliesInForm,
} from '../spells/cmangos-special-cases.ts';
import { CREATURE_TYPE, SHAPESHIFT_FORM } from '../../data/schema.ts';
import { UNIT_FLAG } from '../../domain/creature/unitFlags.ts';
import type { Side } from '../core/events.ts';
import { isEnemySide } from '../core/events.ts';
import {
  TUNING,
  scaleTime,
  meleeApPerStrength,
  formHasAgiAttackBonus,
  meleeCritFromAgility,
  dodgeFromAgility,
  meleeAttackPowerFromStats,
  rangedAttackPowerFromStats,
  spellCritFromIntellect,
  intellectToMana,
} from './formulas.ts';
import {
  formArmorDelta,
  formAttackTimeMs,
  formCombatPackage,
  formIdFromSpell,
  isFormSpell,
  isStealthShapeshift,
  resolveMeleeWeaponDamageRange,
} from '../../domain/character/forms.ts';
import { AURA_INTERRUPT } from '../../domain/spells/stealth.ts';
import { emptySchoolLockoutUntil } from '../spells/interrupt.ts';
import { emptyImmunityState } from '../spells/immunity.ts';
import type { ActiveWeaponImbue, CombatantSpec, Fighter } from './types.ts';
import { BASE_RUN_SPEED } from '../../domain/nav/speed.ts';
import {
  HEALING_WAY_CHANCE_PCT,
  HEALING_WAY_TALENT_RANK1_SPELL_ID,
  HEALING_WAY_TALENT_RANK2_SPELL_ID,
  HEALING_WAY_TALENT_RANK3_SPELL_ID,
  PREDATORY_STRIKES_SPELL_IDS,
  SETUP_TRIGGER_SPELL_ID,
  predatoryStrikesFormApBonus,
} from '../spells/interpreter/class-scripts-kit.ts';

/** Every magic + physical school (for all-school damage% buffs like Arcane Power / Bestial Wrath). */
export const ALL_SCHOOLS: School[] = ['physical', 'holy', 'fire', 'nature', 'frost', 'shadow', 'arcane'];

/** One-school MOD_DAMAGE_DONE BuffMod → school. Cite: SharedDefines.h SpellSchoolMask. */
const SPELL_DAMAGE_MOD_SCHOOL: Partial<Record<BuffMod, School>> = {
  spell_damage_holy: 'holy',
  spell_damage_fire: 'fire',
  spell_damage_nature: 'nature',
  spell_damage_frost: 'frost',
  spell_damage_shadow: 'shadow',
  spell_damage_arcane: 'arcane',
};

function addSpecSpellDamage(spec: CombatantSpec, school: School, delta: number): void {
  const map = spec.spellDamageBySchool ?? (spec.spellDamageBySchool = {});
  map[school] = (map[school] ?? 0) + delta;
}

/** SpellSchoolMask bit → School for damage_taken_pct (aura 87). Cite: SharedDefines SpellSchoolMask. */
const SCHOOL_BITS: Array<[School, number]> = [
  ['physical', 1 << 0], ['holy', 1 << 1], ['fire', 1 << 2], ['nature', 1 << 3],
  ['frost', 1 << 4], ['shadow', 1 << 5], ['arcane', 1 << 6],
];

/** Schools affected by damage_taken_pct: named school, else mask bits, else all. */
function schoolsForTakenPct(school?: School, schoolMask?: number): School[] {
  if (school) return [school];
  const mask = (schoolMask ?? 0) | 0;
  if (!mask) return ALL_SCHOOLS;
  const out: School[] = [];
  for (const [sch, bit] of SCHOOL_BITS) {
    if (mask & bit) out.push(sch);
  }
  return out.length ? out : ALL_SCHOOLS;
}

// The live cascade for a flat AGILITY delta, reaching every derivative the sheet folds in, so an
// elixir drunk mid-fight lands what it would pre-pull. AP is a difference over the class curve.
function applyAgilityDelta(f: Fighter, delta: number): void {
  f.spec.agility = (f.spec.agility ?? 0) + delta;
  f.armor += delta * 2;
  const cls = f.spec.classId;
  if (cls == null || cls <= 0) return; // mob / fixture spec: no class curve to walk
  const lvl = f.spec.level;
  f.spec.critChance = Math.max(0, f.spec.critChance + meleeCritFromAgility(cls, lvl, delta) / 100);
  f.spec.dodgeChance = Math.max(0, (f.spec.dodgeChance ?? 0) + dodgeFromAgility(cls, lvl, delta) / 100);
  const formAgiAp = formHasAgiAttackBonus(f.form);
  const meleeAp = meleeAttackPowerFromStats(cls, lvl, 0, delta, formAgiAp)
    - meleeAttackPowerFromStats(cls, lvl, 0, 0, formAgiAp);
  if (meleeAp) {
    f.attackPower += meleeAp;
    // Inside an AGI-AP form that term belongs to formApBonus, so leaving the form reverses it once.
    if (formAgiAp) f.formApBonus += meleeAp;
  }
  if (f.spec.rangedAttackPower != null) {
    f.spec.rangedAttackPower += rangedAttackPowerFromStats(cls, lvl, delta, f.form)
      - rangedAttackPowerFromStats(cls, lvl, 0, f.form);
  }
}

// Live cascade for a flat INTELLECT delta: max mana + the spell crit curve. Cite: StatSystem.cpp
// UpdateMaxPower POWER_MANA; Player.cpp GetSpellCritFromIntellect.
function applyIntellectDelta(f: Fighter, delta: number): void {
  const before = f.spec.intellect;
  const after = (before ?? 0) + delta;
  f.spec.intellect = after;
  // Cite: StatSystem.cpp:193 — ignore classes without mana (create_power > 0).
  if (f.createMana > 0) {
    // Mana from int is piecewise (1:1 to 20, then 15:1) — walk the curve from the sheet value so
    // the knee is exact. An absent base (mob/fixture spec) is already past it.
    const manaDelta = before != null
      ? intellectToMana(0, Math.max(0, after)) - intellectToMana(0, Math.max(0, before))
      : delta * 15;
    if (manaDelta) applyBuffMod(f, 'max_mana', manaDelta);
  }
  const cls = f.spec.classId;
  if (cls == null || cls <= 0) return;
  // The curve is base plus the int term, so the difference drops the class base. Written straight, not
  // through the buff-mod arm: that seeds an unset spell crit from melee crit, mid-transaction.
  const critPts = spellCritFromIntellect(cls, f.spec.level, delta)
    - spellCritFromIntellect(cls, f.spec.level, 0);
  if (critPts && f.spec.spellCritChance != null) {
    f.spec.spellCritChance = Math.max(0, f.spec.spellCritChance + critPts / 100);
  }
}

/** Live strength buff → AP using class coefficient (warrior/paladin/shaman/druid = 2; rogue/hunter/casters = 1). */
export function strengthToApDelta(spec: CombatantSpec, amount: number): number {
  // Absent classId (mobs/tests): keep historic str*2 so existing combat fixtures stay stable.
  const coeff = spec.classId != null ? meleeApPerStrength(spec.classId) : 2;
  return amount * coeff;
}

// Spell crit base: the intellect curve when present, else melee crit for mobs and tests. A creature
// can never crit with a spell, and without that gate the fallback handed every boss nuke player crit.
export function fighterSpellCrit(src: { spec: CombatantSpec; side?: Side }): number {
  if (src.side !== undefined && isEnemySide(src.side)) return 0;
  return src.spec.spellCritChance ?? src.spec.critChance;
}

// Live armor: base times its own percent, plus the total-value slice, times the total percent. The
// difference from base armor IS that slice — agility, flat buffs and the form package.
export function fighterEffectiveArmor(
  f: { armor: number; armorPctMod: number; baseArmor?: number; armorBasePctMod?: number },
): number {
  const basePct = f.armorBasePctMod ?? 0;
  const base = f.baseArmor ?? 0;
  const value = basePct ? f.armor + base * (basePct / 100) : f.armor;
  return Math.max(0, value * (1 + f.armorPctMod / 100));
}

// Whether this unit still holds `amount` in the pool spend would drain, with the same routing — so a
// cost held for an in-flight cast is re-checked against the bar it will actually come from.
export function canPayPower(f: Fighter, amount: number, pt?: PowerType): boolean {
  if (amount <= 0) return true;
  const powerKind = pt ?? f.spec.powerType;
  // POWER_HEALTH: CheckPower requires GetHealth() > cost (strict). Cite: Spell.cpp:6383–6387.
  if (powerKind === 'health') return f.hp > amount;
  if (powerKind === 'mana' && f.spec.powerType !== 'mana') return f.mana >= amount;
  return f.power >= amount;
}

// Round a stat conversion WITHOUT eating the sign. Flooring at 1 looks harmless for a buff, but it
// flipped a −1 stamina drain into +10 HP, so every hostile stat aura landed as a tiny heal.
export function signedAtLeastOne(x: number): number {
  if (!x) return 0;
  const mag = Math.max(1, Math.round(Math.abs(x)));
  return x < 0 ? -mag : mag;
}

/** Optional mask fields for versus / target_resistance BuffMods. */
export type BuffModOpts = {
  creatureTypeMask?: number;
  schoolMask?: number;
};

// Apply a flat buff-mod delta to a fighter's live stats — one source of truth, so a new mod is wired
// here and in the reversal rather than at every site. The delta MAY be negative; every branch signs.
export function applyBuffMod(
  tgt: Fighter,
  mod: BuffMod,
  delta: number,
  school?: School,
  opts?: BuffModOpts,
): void {
  if (!delta && mod !== 'attack_power_versus' && mod !== 'ranged_attack_power_versus'
    && mod !== 'spell_damage_versus' && mod !== 'target_resistance') {
    return;
  }
  switch (mod) {
    case 'attack_power': tgt.attackPower += delta; break;
    // Its own pool. `f.spec.rangedAttackPower` is what applySpell.ts:2885 reads for a shot, and
    // the agility path already mutates it live at :107.
    case 'ranged_attack_power':
      if (tgt.spec.rangedAttackPower != null) tgt.spec.rangedAttackPower += delta;
      break;
    case 'armor': tgt.armor += delta; break;
    case 'armor_pct': tgt.armorPctMod += delta; break;
    case 'armor_base_pct': tgt.armorBasePctMod += delta; break;
    case 'haste': tgt.haste += delta; break;
    case 'cast_haste': tgt.castHaste += delta; break;
    case 'strength': tgt.attackPower += strengthToApDelta(tgt.spec, delta); break;
    case 'physical_taken': tgt.physicalTakenMod += delta; break;
    case 'ranged_taken': tgt.rangedTakenMod += delta; break;
    // SPELL_AURA_MOD_DAMAGE_PERCENT_TAKEN (87 physical) / MOD_MELEE_DAMAGE_TAKEN_PCT (126).
    // Cite: Unit.cpp:7628 / :7634 TakenTotalMod ×= (100+amount)/100.
    case 'physical_taken_pct': tgt.physicalTakenPctMod += delta; break;
    // Aura 87 magic / multi-school mask (CoE, CoS, Stormstrike). Cite: Unit.cpp:7628; KI-767.
    case 'damage_taken_pct': {
      const schools = schoolsForTakenPct(school, opts?.schoolMask);
      for (const s of schools) {
        tgt.damageTakenPctBySchool[s] = (tgt.damageTakenPctBySchool[s] ?? 0) + delta;
      }
      break;
    }
    case 'spell_taken': tgt.spellTakenMod += delta; break;
    case 'attacker_attack_power': tgt.attackerAttackPowerBonus += delta; break;
    // Victim auras 185-188. Cite: Unit.cpp:3525-3528, :3794, :3874.
    case 'offhand_damage_pct': tgt.offhandDamagePct += delta; break;
    case 'attacker_melee_crit': tgt.attackerMeleeCrit += delta; break;
    case 'attacker_ranged_crit': tgt.attackerRangedCrit += delta; break;
    case 'attacker_ranged_hit': tgt.attackerRangedHit += delta; break;
    case 'attacker_spell_hit': {
      const schoolMask = (opts?.schoolMask ?? 0) | 0;
      if (!schoolMask || !delta) break;
      for (const [sch, bit] of SCHOOL_MASK_BITS) {
        if (schoolMask & bit) {
          tgt.attackerSpellHitBySchool[sch] = (tgt.attackerSpellHitBySchool[sch] ?? 0) + delta;
        }
      }
      break;
    }
    // SPELL_AURA_MOD_ATTACKER_SPELL_CRIT_CHANCE (179). schoolMask from opts. SCHOOL_MASK_BITS is shared
    // with aura 186 below. Cite: Unit.cpp:3530–3531 GetTotalAuraModifierByMiscMask.
    case 'attacker_spell_crit': {
      const schoolMask = (opts?.schoolMask ?? 0) | 0;
      if (!schoolMask || !delta) break;
      for (const [sch, bit] of SCHOOL_MASK_BITS) {
        if (schoolMask & bit) {
          tgt.attackerSpellCritBySchool[sch] = (tgt.attackerSpellCritBySchool[sch] ?? 0) + delta;
        }
      }
      break;
    }
    case 'threat_mod': {
      // MOD_THREAT: a single-bit school scopes to that school, while a multi-bit or absent one is
      // total generation. Cite: SpellAuras.cpp:2836–2838 ApplyPercentModFloatVar.
      if (school) {
        tgt.threatSchoolPct[school] = (tgt.threatSchoolPct[school] ?? 0) + delta;
      } else {
        tgt.threatModPct += delta;
      }
      break;
    }
    case 'healing_taken': tgt.healingTakenMod += delta; break;
    // SPELL_AURA_MOD_HEALING_PCT (118). Cite: Unit.cpp:7239–7245 TakenTotalMod ×= (100+amount)/100.
    case 'healing_taken_pct': tgt.healingTakenPctMod += delta; break;
    case 'mp5': tgt.mp5Bonus += delta; break;
    // SPELL_AURA_MOD_POWER_REGEN_PERCENT (110): product of (100+amount)/100 on spirit OCT.
    // Cite: Unit.cpp:4611–4622; StatSystem.cpp:551–552; KI-424.
    case 'mana_regen_pct':
      tgt.manaRegenPctMult *= (100 + delta) / 100;
      break;
    case 'energy_regen_pct':
      tgt.energyRegenPctMod += delta;
      break;
    // SPELL_AURA_MOD_MANA_REGEN_INTERRUPT (134): additive % of spirit while casting.
    case 'mana_regen_interrupt':
      tgt.manaRegenInterruptBonus += delta;
      break;
    // Stamina is 1:10 max HP in BOTH directions. Gaining max HP heals by the same delta; LOSING it
    // clamps current HP down and never deals damage, exactly as the max-health branch does.
    case 'stamina': {
      const hp = signedAtLeastOne(delta * TUNING.hpPerStamina);
      tgt.spec.maxHealth = Math.max(1, tgt.spec.maxHealth + hp);
      if (hp > 0) tgt.hp += hp; else tgt.hp = Math.min(tgt.hp, tgt.spec.maxHealth);
      break;
    }
    case 'max_health': {
      tgt.spec.maxHealth = Math.max(1, tgt.spec.maxHealth + delta);
      if (delta > 0) tgt.hp += delta; else tgt.hp = Math.min(tgt.hp, tgt.spec.maxHealth);
      break;
    }
    // SPELL_AURA_MOD_INCREASE_ENERGY (mana): flat TOTAL_VALUE on max power. Does not auto-fill
    // current mana (HandleAuraModIncreaseEnergy only touches unit mod). Cite: SpellAuras.cpp:3719–3726.
    case 'max_mana': {
      if (tgt.spec.powerType === 'mana') {
        tgt.spec.maxPower = Math.max(0, tgt.spec.maxPower + delta);
        tgt.power = Math.min(tgt.power, tgt.spec.maxPower);
      } else {
        // Dual-bar (e.g. form): raise the parallel mana pool.
        tgt.maxMana = Math.max(0, (tgt.maxMana ?? 0) + delta);
        if (tgt.mana != null) tgt.mana = Math.min(tgt.mana, tgt.maxMana);
      }
      break;
    }
    case 'parry': tgt.spec.parryChance = Math.max(0, (tgt.spec.parryChance ?? 0) + delta / 100); tgt.spec.canParry = true; break;
    case 'dodge': tgt.spec.dodgeChance = Math.max(0, (tgt.spec.dodgeChance ?? 0) + delta / 100); break;
    // SPELL_AURA_MOD_BLOCK_PERCENT (51) — Shield Block +75. Cite: SpellAuras.cpp:3789–3800.
    case 'block':
      tgt.spec.blockChance = Math.max(0, (tgt.spec.blockChance ?? 0) + delta / 100);
      tgt.spec.canBlock = true;
      break;
    // SPELL_AURA_MOD_CRIT_PERCENT (52) / MOD_HIT_CHANCE (54) — whole %points.
    // Cite: SpellAuras.cpp HandleAuraModCritPercent / HandleModHitChance; schema BuffMod crit/hit.
    case 'crit':
      tgt.spec.critChance = Math.max(0, (tgt.spec.critChance ?? 0) + delta / 100);
      break;
    case 'hit':
      tgt.spec.hitChance = Math.min(1, Math.max(0, (tgt.spec.hitChance ?? 0) + delta / 100));
      break;
    case 'aoe_avoidance':
      tgt.aoeAvoidancePercent = (tgt.aoeAvoidancePercent ?? 0) + delta;
      break;
    // Percentage POINTS off the magic miss roll — kept separate from the melee hit table.
    case 'spell_hit':
      tgt.spellHitBonusPercent += delta;
      break;
    // MOD_SPELL_CRIT_CHANCE — whole points on the SPELL crit roll. Seeded from melee crit when unset,
    // matching the reader's own fallback; without that a +3 buff replaced real crit with 0.03.
    case 'spell_crit':
      tgt.spec.spellCritChance = Math.max(
        0,
        (tgt.spec.spellCritChance ?? tgt.spec.critChance ?? 0) + delta / 100,
      );
      break;
    // defense skill is paperdoll-only (Stat.defense); no live Fighter field.
    case 'defense':
      break;
    // SPELL_AURA_MOD_SHIELD_BLOCKVALUE (158) — flat block absorb. Cite: SpellAuras.cpp:4426.
    case 'block_value':
      tgt.spec.blockValue = Math.max(0, (tgt.spec.blockValue ?? 0) + delta);
      break;
    case 'block_value_pct':
      tgt.spec.blockValuePct = Math.max(0, (tgt.spec.blockValuePct ?? 0) + delta);
      break;
    // SPELL_AURA_MOD_HEALING_DONE (135) — flat +healing. Cite: SpellAuras.cpp:3528; rollHeal.
    case 'healing_done':
      tgt.healingDoneFlat = (tgt.healingDoneFlat ?? 0) + delta;
      break;
    // MOD_DAMAGE_DONE: a generic mask feeds spell power and a single school feeds the per-school map.
    // A physical-only mask is attack power and is handled above.
    case 'spell_power':
      tgt.spec.spellPower = (tgt.spec.spellPower ?? 0) + delta;
      break;
    case 'spell_damage_holy':
    case 'spell_damage_fire':
    case 'spell_damage_nature':
    case 'spell_damage_frost':
    case 'spell_damage_shadow':
    case 'spell_damage_arcane': {
      const sch = SPELL_DAMAGE_MOD_SCHOOL[mod];
      if (sch) addSpecSpellDamage(tgt.spec, sch, delta);
      break;
    }
    case 'damage_done_pct': {
      // Whole percent onto the per-school damage map, scoped when the buff named a school and global
      // otherwise. Additive, so the reversal subtracts the same percent, exactly and symmetrically.
      const schools = school ? [school] : ALL_SCHOOLS;
      for (const s of schools) tgt.damagePctBySchool[s] = (tgt.damagePctBySchool[s] ?? 0) + delta;
      break;
    }
    case 'healing_done_pct': tgt.healingPct += delta; break;
    // Cost auras are school-scoped by EffectMiscValue mask; no school named = every school.
    case 'power_cost': {
      const schools = school ? [school] : ALL_SCHOOLS;
      for (const s of schools) tgt.powerCostFlatBySchool[s] = (tgt.powerCostFlatBySchool[s] ?? 0) + delta;
      break;
    }
    case 'power_cost_pct': {
      const schools = school ? [school] : ALL_SCHOOLS;
      for (const s of schools) tgt.powerCostPctBySchool[s] = (tgt.powerCostPctBySchool[s] ?? 0) + delta;
      break;
    }
    // Creature-type versus — store row; damage path matches mask. Cite: Unit.cpp:7471–7476 / :7055.
    case 'attack_power_versus': {
      const mask = (opts?.creatureTypeMask ?? 0) | 0;
      if (mask && delta) tgt.attackPowerVersus.push({ creatureTypeMask: mask, amount: delta });
      break;
    }
    case 'ranged_attack_power_versus': {
      const mask = (opts?.creatureTypeMask ?? 0) | 0;
      if (mask && delta) tgt.rangedAttackPowerVersus.push({ creatureTypeMask: mask, amount: delta });
      break;
    }
    case 'spell_damage_versus': {
      const mask = (opts?.creatureTypeMask ?? 0) | 0;
      if (mask && delta) tgt.spellDamageVersus.push({ creatureTypeMask: mask, amount: delta });
      break;
    }
    case 'damage_done_versus_pct': {
      const mask = (opts?.creatureTypeMask ?? 0) | 0;
      if (mask && delta) tgt.damageDoneVersusPct.push({ creatureTypeMask: mask, amount: delta });
      break;
    }
    case 'damage_done_creature': {
      const mask = (opts?.creatureTypeMask ?? 0) | 0;
      if (mask && delta) tgt.damageDoneCreature.push({ creatureTypeMask: mask, amount: delta });
      break;
    }
    // MOD_TARGET_RESISTANCE: DBC amount usually negative; pen = −amount. Cite: Unit.cpp:3892–3894.
    case 'target_resistance': {
      const schoolMask = (opts?.schoolMask ?? 0) | 0;
      if (!schoolMask || !delta) break;
      const p = -delta;
      if (!p) break;
      const pen = tgt.spec.resistancePenetration ?? (tgt.spec.resistancePenetration = {});
      const bits: Array<[School, number]> = [
        ['physical', 1 << 0], ['holy', 1 << 1], ['fire', 1 << 2], ['nature', 1 << 3],
        ['frost', 1 << 4], ['shadow', 1 << 5], ['arcane', 1 << 6],
      ];
      for (const [sch, bit] of bits) {
        if (schoolMask & bit) pen[sch] = (pen[sch] ?? 0) + p;
      }
      break;
    }
    case 'agility': applyAgilityDelta(tgt, delta); break;
    case 'intellect': applyIntellectDelta(tgt, delta); break;
    // Spirit's live derivatives are the OCT mana regen and the aura-116 health regen, both of
    // which re-read spec.spirit every tick. Cite: powerForm.ts updateManaRegen / octRegenHpPerSpirit.
    case 'spirit': tgt.spec.spirit = (tgt.spec.spirit ?? 0) + delta; break;
    // SPELL_AURA_MOD_STAT with EffectMiscValue −1 (Mark of the Wild, Blessing of Kings rank 1).
    case 'all_stats':
      applyBuffMod(tgt, 'strength', delta);
      applyBuffMod(tgt, 'stamina', delta);
      applyBuffMod(tgt, 'agility', delta);
      applyBuffMod(tgt, 'intellect', delta);
      applyBuffMod(tgt, 'spirit', delta);
      break;
    default: break; // all_stats_pct / max_health_pct / max_mana_pct / the per-stat *_pct mods
    // (pre-converted to a flat mod at apply: max_health_pct → max_health, all_stats_pct →
    // attack_power, intellect_pct → intellect, spirit_pct → spirit. Cite: applySpell.ts.)
  }
}

// Reverse a buff-mod's stored amount when its aura is removed. Health mods clamp rather than damage on
// loss — losing max HP never drops you below the new max. Every other mod is a symmetric subtraction.
export function reverseBuffMod(
  tgt: Fighter,
  mod: BuffMod | undefined,
  amount: number,
  school?: School,
  opts?: BuffModOpts,
): void {
  if (!mod || !amount) return;
  switch (mod) {
    case 'attack_power': tgt.attackPower -= amount; break;
    case 'ranged_attack_power':
      if (tgt.spec.rangedAttackPower != null) tgt.spec.rangedAttackPower -= amount;
      break;
    case 'armor': tgt.armor -= amount; break;
    case 'armor_pct': tgt.armorPctMod -= amount; break;
    case 'armor_base_pct': tgt.armorBasePctMod -= amount; break;
    case 'haste': tgt.haste -= amount; break;
    case 'cast_haste': tgt.castHaste -= amount; break;
    case 'strength': tgt.attackPower -= strengthToApDelta(tgt.spec, amount); break;
    case 'physical_taken': tgt.physicalTakenMod -= amount; break;
    case 'ranged_taken': tgt.rangedTakenMod -= amount; break;
    case 'physical_taken_pct': tgt.physicalTakenPctMod -= amount; break;
    case 'damage_taken_pct': {
      const schools = schoolsForTakenPct(school, opts?.schoolMask);
      for (const s of schools) {
        tgt.damageTakenPctBySchool[s] = (tgt.damageTakenPctBySchool[s] ?? 0) - amount;
      }
      break;
    }
    case 'spell_taken': tgt.spellTakenMod -= amount; break;
    case 'attacker_attack_power': tgt.attackerAttackPowerBonus -= amount; break;
    case 'offhand_damage_pct': tgt.offhandDamagePct -= amount; break;
    case 'attacker_melee_crit': tgt.attackerMeleeCrit -= amount; break;
    case 'attacker_ranged_crit': tgt.attackerRangedCrit -= amount; break;
    case 'attacker_ranged_hit': tgt.attackerRangedHit -= amount; break;
    case 'attacker_spell_hit': {
      const schoolMask = (opts?.schoolMask ?? 0) | 0;
      if (!schoolMask || !amount) break;
      for (const [sch, bit] of SCHOOL_MASK_BITS) {
        if (schoolMask & bit) {
          tgt.attackerSpellHitBySchool[sch] = (tgt.attackerSpellHitBySchool[sch] ?? 0) - amount;
        }
      }
      break;
    }
    case 'attacker_spell_crit': {
      const schoolMask = (opts?.schoolMask ?? 0) | 0;
      if (!schoolMask || !amount) break;
      for (const [sch, bit] of SCHOOL_MASK_BITS) {
        if (schoolMask & bit) {
          tgt.attackerSpellCritBySchool[sch] = (tgt.attackerSpellCritBySchool[sch] ?? 0) - amount;
        }
      }
      break;
    }
    case 'threat_mod': {
      if (school) {
        tgt.threatSchoolPct[school] = (tgt.threatSchoolPct[school] ?? 0) - amount;
      } else {
        tgt.threatModPct -= amount;
      }
      break;
    }
    case 'healing_taken': tgt.healingTakenMod -= amount; break;
    case 'healing_taken_pct': tgt.healingTakenPctMod -= amount; break;
    case 'mp5': tgt.mp5Bonus -= amount; break;
    case 'mana_regen_pct': {
      const factor = (100 + amount) / 100;
      if (factor !== 0) tgt.manaRegenPctMult /= factor;
      break;
    }
    case 'energy_regen_pct':
      tgt.energyRegenPctMod -= amount;
      break;
    case 'mana_regen_interrupt':
      tgt.manaRegenInterruptBonus -= amount;
      break;
    case 'damage_done_pct': {
      const schools = school ? [school] : ALL_SCHOOLS;
      for (const s of schools) tgt.damagePctBySchool[s] = (tgt.damagePctBySchool[s] ?? 0) - amount;
      break;
    }
    case 'healing_done_pct': tgt.healingPct -= amount; break;
    case 'power_cost': {
      const schools = school ? [school] : ALL_SCHOOLS;
      for (const s of schools) tgt.powerCostFlatBySchool[s] = (tgt.powerCostFlatBySchool[s] ?? 0) - amount;
      break;
    }
    case 'power_cost_pct': {
      const schools = school ? [school] : ALL_SCHOOLS;
      for (const s of schools) tgt.powerCostPctBySchool[s] = (tgt.powerCostPctBySchool[s] ?? 0) - amount;
      break;
    }
    // Reversal must use the SAME signed conversion as apply, or removing a −1 stamina debuff
    // subtracts a positive 1 instead of adding back the 10 it took.
    case 'stamina': {
      const hp = signedAtLeastOne(amount * TUNING.hpPerStamina);
      tgt.spec.maxHealth = Math.max(1, tgt.spec.maxHealth - hp);
      tgt.hp = Math.min(tgt.hp, tgt.spec.maxHealth);
      break;
    }
    case 'max_health': {
      tgt.spec.maxHealth = Math.max(1, tgt.spec.maxHealth - amount);
      tgt.hp = Math.min(tgt.hp, tgt.spec.maxHealth);
      break;
    }
    case 'max_mana': {
      if (tgt.spec.powerType === 'mana') {
        tgt.spec.maxPower = Math.max(0, tgt.spec.maxPower - amount);
        tgt.power = Math.min(tgt.power, tgt.spec.maxPower);
      } else {
        tgt.maxMana = Math.max(0, (tgt.maxMana ?? 0) - amount);
        if (tgt.mana != null) tgt.mana = Math.min(tgt.mana, tgt.maxMana);
      }
      break;
    }
    case 'parry': tgt.spec.parryChance = Math.max(0, (tgt.spec.parryChance ?? 0) - amount / 100); break;
    case 'dodge': tgt.spec.dodgeChance = Math.max(0, (tgt.spec.dodgeChance ?? 0) - amount / 100); break;
    case 'block': tgt.spec.blockChance = Math.max(0, (tgt.spec.blockChance ?? 0) - amount / 100); break;
    case 'crit':
      tgt.spec.critChance = Math.max(0, (tgt.spec.critChance ?? 0) - amount / 100);
      break;
    case 'hit':
      tgt.spec.hitChance = Math.min(1, Math.max(0, (tgt.spec.hitChance ?? 0) - amount / 100));
      break;
    case 'aoe_avoidance':
      tgt.aoeAvoidancePercent = (tgt.aoeAvoidancePercent ?? 0) - amount;
      break;
    case 'spell_hit':
      tgt.spellHitBonusPercent -= amount;
      break;
    case 'spell_crit':
      tgt.spec.spellCritChance = Math.max(
        0,
        (tgt.spec.spellCritChance ?? tgt.spec.critChance ?? 0) - amount / 100,
      );
      break;
    case 'defense':
      break;
    case 'block_value':
      tgt.spec.blockValue = Math.max(0, (tgt.spec.blockValue ?? 0) - amount);
      break;
    case 'block_value_pct':
      tgt.spec.blockValuePct = Math.max(0, (tgt.spec.blockValuePct ?? 0) - amount);
      break;
    case 'healing_done':
      tgt.healingDoneFlat = (tgt.healingDoneFlat ?? 0) - amount;
      break;
    case 'spell_power':
      tgt.spec.spellPower = (tgt.spec.spellPower ?? 0) - amount;
      break;
    case 'spell_damage_holy':
    case 'spell_damage_fire':
    case 'spell_damage_nature':
    case 'spell_damage_frost':
    case 'spell_damage_shadow':
    case 'spell_damage_arcane': {
      const sch = SPELL_DAMAGE_MOD_SCHOOL[mod];
      if (sch) addSpecSpellDamage(tgt.spec, sch, -amount);
      break;
    }
    case 'attack_power_versus': {
      const mask = (opts?.creatureTypeMask ?? 0) | 0;
      if (!mask) break;
      const i = tgt.attackPowerVersus.findIndex(
        (r) => r.creatureTypeMask === mask && r.amount === amount,
      );
      if (i >= 0) tgt.attackPowerVersus.splice(i, 1);
      break;
    }
    case 'ranged_attack_power_versus': {
      const mask = (opts?.creatureTypeMask ?? 0) | 0;
      if (!mask) break;
      const i = tgt.rangedAttackPowerVersus.findIndex(
        (r) => r.creatureTypeMask === mask && r.amount === amount,
      );
      if (i >= 0) tgt.rangedAttackPowerVersus.splice(i, 1);
      break;
    }
    case 'spell_damage_versus': {
      const mask = (opts?.creatureTypeMask ?? 0) | 0;
      if (!mask) break;
      const i = tgt.spellDamageVersus.findIndex(
        (r) => r.creatureTypeMask === mask && r.amount === amount,
      );
      if (i >= 0) tgt.spellDamageVersus.splice(i, 1);
      break;
    }
    case 'damage_done_versus_pct': {
      const mask = (opts?.creatureTypeMask ?? 0) | 0;
      if (!mask) break;
      const i = tgt.damageDoneVersusPct.findIndex(
        (r) => r.creatureTypeMask === mask && r.amount === amount,
      );
      if (i >= 0) tgt.damageDoneVersusPct.splice(i, 1);
      break;
    }
    case 'damage_done_creature': {
      const mask = (opts?.creatureTypeMask ?? 0) | 0;
      if (!mask) break;
      const i = tgt.damageDoneCreature.findIndex(
        (r) => r.creatureTypeMask === mask && r.amount === amount,
      );
      if (i >= 0) tgt.damageDoneCreature.splice(i, 1);
      break;
    }
    case 'target_resistance': {
      // Reverse: subtract the same pen that apply added (= −amount per school bit).
      const schoolMask = (opts?.schoolMask ?? 0) | 0;
      if (!schoolMask || !amount) break;
      const p = -amount;
      const pen = tgt.spec.resistancePenetration;
      if (!pen || !p) break;
      const bits: Array<[School, number]> = [
        ['physical', 1 << 0], ['holy', 1 << 1], ['fire', 1 << 2], ['nature', 1 << 3],
        ['frost', 1 << 4], ['shadow', 1 << 5], ['arcane', 1 << 6],
      ];
      for (const [sch, bit] of bits) {
        if (schoolMask & bit) pen[sch] = (pen[sch] ?? 0) - p;
      }
      break;
    }
    // Primary stats reverse through the same cascade helpers with a negated delta, so every
    // derivative (armor, crit, dodge, AP, max mana, spell crit, regen) comes back off exactly.
    case 'agility': applyAgilityDelta(tgt, -amount); break;
    case 'intellect': applyIntellectDelta(tgt, -amount); break;
    case 'spirit': tgt.spec.spirit = (tgt.spec.spirit ?? 0) - amount; break;
    case 'all_stats':
      reverseBuffMod(tgt, 'strength', amount);
      reverseBuffMod(tgt, 'stamina', amount);
      reverseBuffMod(tgt, 'agility', amount);
      reverseBuffMod(tgt, 'intellect', amount);
      reverseBuffMod(tgt, 'spirit', amount);
      break;
    default: break;
  }
}

// MOD_RESISTANCE — add or remove a school resistance while an aura is up. This was write-once from the
// spec, so a Resistance Totem changed nothing; the damage path already reads the field.
export function applyResistMod(tgt: Fighter, school: School | undefined, delta: number): void {
  if (!school || !delta) return;
  tgt.resistances[school] = Math.max(0, (tgt.resistances[school] ?? 0) + delta);
}

/** SPELL_AURA_MOD_MECHANIC_RESISTANCE (117). Cite: Unit.cpp:4015–4031. */
export function applyMechanicResist(unit: Fighter, mechanic: number, amount: number): void {
  if (!mechanic || !amount) return;
  if (!unit.spec.mechanicResistPct) unit.spec.mechanicResistPct = {};
  unit.spec.mechanicResistPct[mechanic] = (unit.spec.mechanicResistPct[mechanic] ?? 0) + amount;
}

export function reverseMechanicResist(
  unit: Fighter,
  e: { mechanicResist?: { mechanic: number; amount: number } },
): void {
  const mr = e.mechanicResist;
  if (!mr?.mechanic || !mr.amount || !unit.spec.mechanicResistPct) return;
  const next = Math.max(0, (unit.spec.mechanicResistPct[mr.mechanic] ?? 0) - mr.amount);
  if (next === 0) delete unit.spec.mechanicResistPct[mr.mechanic];
  else unit.spec.mechanicResistPct[mr.mechanic] = next;
}

// Strip form package + Cat AGI AP tracked on the fighter (reverse of applyFormCombatEnter). Cite:
// HandleShapeshiftBoosts remove path + UpdateAttackPowerAndDamage form flag off.
export function clearFormCombatBonuses(f: Fighter): void {
  if (f.formApBonus) f.attackPower -= f.formApBonus;
  if (f.formArmorBonus) f.armor -= f.formArmorBonus;
  if (f.formHealthBonus) {
    f.spec.maxHealth = Math.max(1, f.spec.maxHealth - f.formHealthBonus);
    f.hp = Math.min(f.hp, f.spec.maxHealth);
  }
  // Reverse warrior-stance damage mods applied via applyBuffMod on enter.
  if (f.formPhysicalTakenPctBonus) {
    applyBuffMod(f, 'physical_taken_pct', -f.formPhysicalTakenPctBonus);
  }
  if (f.formDamageDonePctBonus) {
    applyBuffMod(f, 'damage_done_pct', -f.formDamageDonePctBonus);
  }
  // Leader of the Pack form crit (24932) ends with the form. Cite: SpellAuras.cpp:4306–4311.
  if (f.leaderOfThePackCritBonus) {
    applyBuffMod(f, 'crit', -f.leaderOfThePackCritBonus);
    f.buffActive.delete(LEADER_OF_THE_PACK_AURA_SPELL_ID);
    f.leaderOfThePackCritBonus = 0;
  }
  // Moonkin Aura (24907) +3% spell crit ends with Moonkin form.
  if (f.buffActive.has(24907)) {
    reverseBuffMod(f, 'spell_crit', 3);
    f.buffActive.delete(24907);
  }
  // Form-gated talent auras end with the form, exactly as they were applied on enter.
  clearFormTalentAuras(f);
  f.formApBonus = 0;
  f.formArmorBonus = 0;
  f.formHealthBonus = 0;
  f.formThreatPct = 0;
  f.formPhysicalTakenPctBonus = 0;
  f.formDamageDonePctBonus = 0;
}

// Apply the form combat package and the Cat agility AP on entering a form. The spec's attack power is
// form-free base, so this always adds both. Warrior stances bring threat and damage percentages.
export function applyFormCombatEnter(f: Fighter, form: ShapeshiftFormId): void {
  if (!form || isStealthShapeshift(form)) return;
  const pkg = formCombatPackage(form);
  const agiAp = formHasAgiAttackBonus(form) ? Math.max(0, (f.spec.agility ?? 0) | 0) : 0;
  // Aura 142 is BASE_PCT: the item slice only, never the agi×2 / flat-buff TOTAL_VALUE.
  // Cite: Unit.cpp:9067 GetTotalResistanceValue; SpellAuras.cpp:3435; StatSystem.cpp:138.
  const armorDelta = formArmorDelta(f.baseArmor, form);
  // Predatory Strikes: form MOD_ATTACK_POWER += level * talentAmt / 100.
  // Cite: Druid.cpp:53–65 FormScalingAttackPowerAuras; ranks 16972/16974/16975 → 50/100/150.
  let predatoryAp = 0;
  if (pkg.attackPowerFlat > 0) {
    const known = f.spec.spells ?? [];
    const amt = known.some((s) => s.id === PREDATORY_STRIKES_SPELL_IDS[0]) ? 150
      : known.some((s) => s.id === PREDATORY_STRIKES_SPELL_IDS[1]) ? 100
        : known.some((s) => s.id === PREDATORY_STRIKES_SPELL_IDS[2]) ? 50
          : 0;
    if (amt > 0) predatoryAp = predatoryStrikesFormApBonus(f.spec.level, amt);
  }
  const apDelta = pkg.attackPowerFlat + agiAp + predatoryAp;
  f.attackPower += apDelta;
  f.armor += armorDelta;
  if (pkg.healthFlat) {
    f.spec.maxHealth += pkg.healthFlat;
    f.hp += pkg.healthFlat;
  }
  f.formApBonus = apDelta;
  f.formArmorBonus = armorDelta;
  f.formHealthBonus = pkg.healthFlat;
  f.formThreatPct = pkg.threatPct;
  // Stance damage mods (Defensive −10% done/−10% taken; Berserker +10% taken).
  if (pkg.physicalTakenPct) {
    applyBuffMod(f, 'physical_taken_pct', pkg.physicalTakenPct);
    f.formPhysicalTakenPctBonus = pkg.physicalTakenPct;
  } else {
    f.formPhysicalTakenPctBonus = 0;
  }
  if (pkg.damageDonePct) {
    applyBuffMod(f, 'damage_done_pct', pkg.damageDonePct);
    f.formDamageDonePctBonus = pkg.damageDonePct;
  } else {
    f.formDamageDonePctBonus = 0;
  }
  // Leader of the Pack: if talent known and form allows 24932, +3% crit while shaped.
  // Cite: SpellAuras.cpp:4306–4311 HasSpell(17007) CastSpell(24932); spell_template 24932 bp2.
  if (
    leaderOfThePackAppliesInForm(form)
    && (f.spec.spells ?? []).some((s) => s.id === LEADER_OF_THE_PACK_SPELL_ID)
  ) {
    applyBuffMod(f, 'crit', LEADER_OF_THE_PACK_CRIT_PCT);
    f.leaderOfThePackCritBonus = LEADER_OF_THE_PACK_CRIT_PCT;
    f.buffActive.add(LEADER_OF_THE_PACK_AURA_SPELL_ID);
  }
  // Moonkin Aura: if form is Moonkin, +3% spell crit while shaped.
  // Cite: SpellAuras.cpp:4306–4311 Moonkin Form -> CastSpell(24907) (+3% spell crit).
  if (form === SHAPESHIFT_FORM.MOONKIN) {
    applyBuffMod(f, 'spell_crit', 3);
    f.buffActive.add(24907);
  }
  applyFormTalentAuras(f, form);
}

// HandleShapeshiftBoosts' own loop: this body's form-gated talent auras as one delta on the form-free
// spec. Cite: SpellAuras.cpp:4296–4304; SpellMgr.h:1378 IsNeedCastSpellAtFormApply.
function applyFormTalentAuras(f: Fighter, form: ShapeshiftFormId): void {
  const row = f.spec.formTalentAuras?.[form | 0];
  if (!row) return;
  if (row.crit) applyBuffMod(f, 'crit', row.crit);
  if (row.dodge) applyBuffMod(f, 'dodge', row.dodge);
  for (const [school, pct] of Object.entries(row.threatPctBySchool) as [School, number][]) {
    if (pct) applyBuffMod(f, 'threat_mod', pct, school);
  }
  if (row.speedAuras.length) {
    f.spec.permanentSpeedAuras = [...(f.spec.permanentSpeedAuras ?? []), ...row.speedAuras];
    f.speedDirty = true;
  }
  if (row.stealthLevel) f.stealthLevelBonus += row.stealthLevel;
  // Rides the form package's own threat, which clearFormCombatBonuses zeroes wholesale on leave.
  if (row.formThreatPct) f.formThreatPct += row.formThreatPct;
  for (const [school, pct] of Object.entries(row.damagePctBySchool) as [School, number][]) {
    if (pct) f.damagePctBySchool[school] = (f.damagePctBySchool[school] ?? 0) + pct;
  }
  if (row.attackPower) f.attackPower += row.attackPower;
  if (row.health) {
    f.spec.maxHealth += row.health;
    f.hp += row.health;
  }
  f.formTalentAuraForm = form | 0;
}

/** Reverse of applyFormTalentAuras — the same row, so a partial bake can never strand half of it. */
function clearFormTalentAuras(f: Fighter): void {
  const was = f.formTalentAuraForm | 0;
  if (!was) return;
  f.formTalentAuraForm = 0;
  const row = f.spec.formTalentAuras?.[was];
  if (!row) return;
  if (row.crit) applyBuffMod(f, 'crit', -row.crit);
  if (row.dodge) applyBuffMod(f, 'dodge', -row.dodge);
  for (const [school, pct] of Object.entries(row.threatPctBySchool) as [School, number][]) {
    if (pct) applyBuffMod(f, 'threat_mod', -pct, school);
  }
  if (row.speedAuras.length && f.spec.permanentSpeedAuras?.length) {
    const drop = new Set(row.speedAuras.map((r) => `${r.aura}:${r.pct}`));
    const kept: Array<{ aura: number; pct: number }> = [];
    for (const r of f.spec.permanentSpeedAuras) {
      const key = `${r.aura}:${r.pct}`;
      if (drop.has(key)) { drop.delete(key); continue; }
      kept.push(r);
    }
    f.spec.permanentSpeedAuras = kept;
    f.speedDirty = true;
  }
  if (row.stealthLevel) f.stealthLevelBonus = Math.max(0, f.stealthLevelBonus - row.stealthLevel);
  for (const [school, pct] of Object.entries(row.damagePctBySchool) as [School, number][]) {
    if (pct) f.damagePctBySchool[school] = (f.damagePctBySchool[school] ?? 0) - pct;
  }
  if (row.attackPower) f.attackPower -= row.attackPower;
  if (row.health) {
    f.spec.maxHealth = Math.max(1, f.spec.maxHealth - row.health);
    f.hp = Math.min(f.hp, f.spec.maxHealth);
  }
}

// How long a spawn-time UNIT_FLAG state holds. Cite: eventAi.ts:635, the same horizon a scripted
// SET_UNIT_FLAG opens; a remove_unit_flag or a real break clears it early.
const SPAWN_FLAG_MS = 3_600_000;

/** SpellSchoolMask bit per school. Cite: SharedDefines.h SPELL_SCHOOL_MASK_*. */
const SCHOOL_MASK_BITS: ReadonlyArray<readonly [School, number]> = [
  ['physical', 1 << 0], ['holy', 1 << 1], ['fire', 1 << 2], ['nature', 1 << 3],
  ['frost', 1 << 4], ['shadow', 1 << 5], ['arcane', 1 << 6],
];

export function makeFighter(side: Side, spec: CombatantSpec): Fighter {
  spec = { ...spec };
  let form = ((spec.form ?? 0) | 0) as ShapeshiftFormId;
  const maxMana = spec.maxMana ?? (spec.powerType === 'mana' ? spec.maxPower : 0);
  const mana = spec.mana ?? (spec.powerType === 'mana' ? spec.startPower : maxMana);
  const levelBonus = (spec.stealth?.levelBonus ?? spec.stealthLevelBonus ?? 0) | 0;
  const startStealth = spec.stealth;
  if (startStealth && !form) form = SHAPESHIFT_FORM.STEALTH;
  // Start-in-form: apply InitDataForForm attack time and damage range (buildCombatant also does this; raw specs may not).
  const formAtk = formAttackTimeMs(form);
  if (formAtk > 0 && !isStealthShapeshift(form)) {
    // Form single-weapon path: strip dual-wield OH (Cat/Bear use one attack timer) and apply form damage bands.
    const dmgRange = resolveMeleeWeaponDamageRange(form, spec.level, spec.weapon.dmgMin, spec.weapon.dmgMax, formAtk);
    spec = {
      ...spec,
      weapon: { ...spec.weapon, speedMs: formAtk, dmgMin: dmgRange.min, dmgMax: dmgRange.max },
      dualWield: false,
      offhand: undefined,
    };
  }
  // Dual-wield: delay first OH swing to half OH period (Unit.cpp Attack ~6312).
  const dualWield = !!spec.dualWield && !!spec.offhand;
  const ohHalf = dualWield
    ? Math.floor(scaleTime(spec.offhand!.speedMs, spec.haste ?? 0, 0) / 2)
    : 0;
  const startShields = spec.startDamageShields ?? [];
  // Cooldowns carried in from the world clock (spec-relative ms at t=0). The player gets the
  // same seed from cfg in createSession; allies and pets have no cfg, so this is their path.
  const seedRemaining = (src: Record<number, number> | undefined): Map<number, number> => {
    const m = new Map<number, number>();
    if (src) for (const [k, v] of Object.entries(src)) { const r = Number(v); if (r > 0) m.set(Number(k), r); }
    return m;
  };
  const f: Fighter = {
    side, spec,
    // SPELLMOD_RADIUS mods (Totemic Mastery / Guardian Totems / baked gear rows).
    radiusSpellMods: (() => {
      const rows = spec.radiusSpellMods ? spec.radiusSpellMods.map((m) => ({ ...m })) : [];
      for (const m of spec.startOwnedSpellMods ?? []) {
        if (m.op !== 6) continue; // SPELLMOD_RADIUS — SpellDefines.h:401
        rows.push({ type: m.type, value: m.value, op: 'RADIUS', id: `owned:${m.spellId}:${m.op}` });
      }
      return rows;
    })(),
    ownedSpellMods: spec.startOwnedSpellMods ? spec.startOwnedSpellMods.map((m) => ({ ...m })) : [],
    hp: spec.startHealth ?? spec.maxHealth,
    power: spec.startPower,
    attackPower: spec.attackPower,
    armor: spec.armor,
    // Mobs and fixtures carry one armor number with no separable agi×2 term (Creature::UpdateArmor
    // splits it, CombatantSpec does not), so BASE_PCT falls back to the whole value there.
    baseArmor: spec.baseArmor ?? spec.armor,
    armorPctMod: 0,
    armorBasePctMod: 0,
    haste: spec.haste ?? 0,
    sitting: false,
    // Gear haste seeds BOTH scalars: CombatantSpec carries one number for melee and cast
    // (buildCombatant.ts:1401), so splitting the aura path must not silently un-haste gear.
    castHaste: spec.haste ?? 0,
    // Seed versus / pen lists from equip (buildCombatant). Mid-fight auras push more rows.
    // Cite: Unit.cpp MeleeDamageBonusDone / SpellDamageBonusDone creature-type masks.
    attackPowerVersus: (spec.attackPowerVersus ?? []).map((r) => ({ ...r })),
    rangedAttackPowerVersus: (spec.rangedAttackPowerVersus ?? []).map((r) => ({ ...r })),
    spellDamageVersus: (spec.spellDamageVersus ?? []).map((r) => ({ ...r })),
    damageDoneVersusPct: (spec.damageDoneVersusPct ?? []).map((r) => ({ ...r })),
    damageDoneCreature: (spec.damageDoneCreature ?? []).map((r) => ({ ...r })),
    critDamageVersusPct: (spec.critDamageVersusPct ?? []).map((r) => ({ ...r })),
    offhandDamagePct: spec.offhandDamagePct ?? 0,
    overrideScriptIds: new Set(spec.overrideScriptIds ?? []),
    formApBonus: 0,
    formArmorBonus: 0,
    formHealthBonus: 0,
    formThreatPct: 0,
    formPhysicalTakenPctBonus: 0,
    formDamageDonePctBonus: 0,
    mp5Bonus: 0,
    // Seed OOC aura 110 product (Evocation); mid-fight buffs multiply further.
    manaRegenPctMult: spec.manaRegenPctMult != null && spec.manaRegenPctMult > 0
      ? spec.manaRegenPctMult
      : 1,
    manaRegenInterruptBonus: 0,
    energyRegenPctMod: 0,
    swingReadyAt: 0,
    ohSwingReadyAt: ohHalf,
    decideDirty: true,
    nextWakeAt: 0,
    gcdUntil: 0,
    castingSpell: null, castDest: null, castStartedAt: 0, castFinishAt: 0, castPushbacks: 0, castBaseMs: 0,
    castCost: 0, castCostPower: undefined,
    lastDodgedAt: Number.NEGATIVE_INFINITY,
    lastDefenseReactAt: Number.NEGATIVE_INFINITY,
    lastHunterParryAt: Number.NEGATIVE_INFINITY,
    facing: null,
    targetUnreachableMs: 0,
    cooldowns: seedRemaining(spec.initialSpellCooldowns),
    categoryCooldowns: seedRemaining(spec.initialCategoryCooldowns),
    procCooldowns: new Map(), rootedUntil: 0,
    // creature_template.UnitFlags at spawn: STUNNED and PACIFIED are states, not bookkeeping, so
    // they open on the fighter's own timers. Same 1 h horizon eventAi.ts:635 uses for a set flag.
    stunnedUntil: (spec.spawnUnitFlags ?? 0) & UNIT_FLAG.STUNNED ? SPAWN_FLAG_MS : 0,
    fearedUntil: 0, incapUntil: 0, silencedUntil: 0, disarmedUntil: 0,
    charmedUntil: 0, charmedBy: null, charmSpellId: 0, charmBreakHpFrac: 0, charmPeriodicAt: 0, unattackableUntil: 0,
    feigningUntil: 0, feignSpellId: 0,
    pacifiedUntil: (spec.spawnUnitFlags ?? 0) & UNIT_FLAG.PACIFIED ? SPAWN_FLAG_MS : 0,
    schoolLockoutUntil: emptySchoolLockoutUntil(),
    ccImmuneUntil: new Map(), dr: new Map(),
    // Copy: one spec builds many fighters, and a resist debuff on one must not reach the others.
    resistances: { ...(spec.resistances ?? {}) },
    creatureType: spec.creatureType ?? CREATURE_TYPE.HUMANOID,
    // Auto-attack mode: a ranged-auto class starts at range and everyone else, casters included,
    // melees by default and only switches to a wand via Shoot.
    mode: spec.rangedAuto && spec.ranged ? 'ranged' : 'melee',
    buffActive: new Set([
      ...Object.values(spec.tempEnchants ?? {})
        .filter((te): te is ActiveWeaponImbue => !!te)
        .map((te) => te.spellId),
      ...startShields.map((s) => s.spellId),
    ]),
    movementFlags: spec.movementFlags ?? 0,
    activeSeal: null,
    weaponImbues: { ...(spec.tempEnchants ?? {}) },
    pendingWeaponImbueHand: undefined,
    chargeUsed: false, combatUntil: 0, combatEnteredAt: 0, pendingCharge: null, pendingSwing: null,
    // Copied, not aliased: applyBuffMod and the form-talent hooks both mutate this per fighter, so
    // sharing the spec's object leaks a Shadowform's +15% onto the next body built from it.
    damagePctBySchool: { ...(spec.damagePctBySchool ?? {}) },
    powerCostFlatBySchool: {},
    powerCostPctBySchool: {},
    spellHitBonusPercent: spec.spellHitBonusPercent ?? 0,
    aoeAvoidancePercent: 0,
    procs: spec.procs ?? [],
    gearProcs: spec.gearProcs ?? [],
    comboPoints: 0, comboTarget: null, energyAccMs: 0, manaAccMs: 0, lastManaUseAt: -1, focusAccMs: 0,
    healthRegenFrac: 0, rageDecayAccMs: 0,
    form,
    formSpellId: 0, // resolved below when starting already in form
    mana,
    maxMana,
    createMana: spec.createMana ?? maxMana,
    createHealth: spec.createHealth ?? 0,
    baseWeaponSpeedMs: spec.baseWeaponSpeedMs ?? spec.weapon.speedMs,
    baseWeaponDmgMin: spec.baseWeaponDmgMin ?? spec.weapon.dmgMin,
    baseWeaponDmgMax: spec.baseWeaponDmgMax ?? spec.weapon.dmgMax,
    physicalTakenMod: 0,
    rangedTakenMod: 0,
    physicalTakenPctMod: 0,
    damageTakenPctBySchool: {},
    spellTakenMod: 0,
    attackerAttackPowerBonus: 0,
    attackerSpellCritBySchool: {},
    // Permanent victim auras 185-188 seed from the sheet; mid-fight auras add to them.
    attackerMeleeCrit: spec.attackerMeleeCrit ?? 0,
    attackerRangedCrit: spec.attackerRangedCrit ?? 0,
    attackerRangedHit: spec.attackerRangedHit ?? 0,
    attackerSpellHitBySchool: { ...(spec.attackerSpellHitBySchool ?? {}) },
    threatModPct: 0,
    threatSchoolPct: {},
    healingTakenMod: 0,
    healingTakenPctMod: 0,
    stealthed: !!startStealth,
    stealthAuraStrength: startStealth?.strength ?? 0,
    stealthLevelBonus: levelBonus,
    stealthDetectStrength: spec.stealthDetectStrength ?? 0,
    stealthBreakFlags: startStealth?.breakFlags
      ?? (AURA_INTERRUPT.DAMAGE | AURA_INTERRUPT.ACTION | AURA_INTERRUPT.ATTACKING),
    autoAttackEnabled: !startStealth, // stealth enter cancels AA
    // The aura that granted a pre-pull stealth: breakStealth deletes it off buffActive, so a
    // fight started stealthed drops the chip on its opener like an in-fight Stealth cast does.
    stealthSpellId: startStealth?.spellId ?? 0,
    schoolAbsorbs: [],
    manaShields: [],
    splitDamage: null,
    splitDamageFlat: null,
    pushbackResistChance: 0,
    channeling: null,
    blessingOfLight: null,
    healingWay: null,
    healingWayChancePct: (() => {
      const known = spec.spells ?? [];
      if (known.some((s) => s.id === HEALING_WAY_TALENT_RANK3_SPELL_ID)) {
        return HEALING_WAY_CHANCE_PCT[HEALING_WAY_TALENT_RANK3_SPELL_ID]!;
      }
      if (known.some((s) => s.id === HEALING_WAY_TALENT_RANK2_SPELL_ID)) {
        return HEALING_WAY_CHANCE_PCT[HEALING_WAY_TALENT_RANK2_SPELL_ID]!;
      }
      if (known.some((s) => s.id === HEALING_WAY_TALENT_RANK1_SPELL_ID)) {
        return HEALING_WAY_CHANCE_PCT[HEALING_WAY_TALENT_RANK1_SPELL_ID]!;
      }
      return 0;
    })(),
    immunity: emptyImmunityState(),
    extraAttacks: 0,
    extraAttacksExecuting: false,
    extraAttackSource: null,
    pendingSpellMod: null,
    castCritAdd: 0,
    castEffectPct: 0,
    healingPct: 0,
    // Seed from sheet healingPower (SIE healing_power / equipMods). KI-590.
    healingDoneFlat: spec.healingPower ?? 0,
    sweepingStrikesCharges: 0,
    combustionCharges: 0,
    combustionStacks: 0,
    vampiricEmbracePct: 0,
    eyeForAnEyePct: 0,
    oracleHealingBonusPct: 0,
    obsidianArmorActive: false,
    adaptiveWardingActive: false,
    classPowerSetKind: null,
    vestmentsGreaterHealActive: false,
    dreamwalkerHealingTouchActive: false,
    idolHealingTouchRefundActive: false,
    totemLesserHealingWaveActive: false,
    cheatDeathActive: false,
    masterOfElementsPct: 0,
    magicAbsorptionPct: 0,
    igniteRankSpellId: 0,
    setupTriggerSpellId: (spec.procs ?? []).some((p) => p.triggerSpellId === SETUP_TRIGGER_SPELL_ID)
      ? SETUP_TRIGGER_SPELL_ID
      : 0,
    deepWoundsRankSpellId: 0,
    improvedSprintChancePct: 0,
    addTargetTriggers: (spec.startAddTargetTriggers ?? []).map((r) => ({
      spellId: r.spellId,
      triggerSpellId: r.triggerSpellId,
      chancePct: r.chancePct,
      familyName: r.familyName,
      familyFlags: r.familyFlags,
      expiresAt: Number.POSITIVE_INFINITY,
    })),
    pyroclasmRankSpellId: 0,
    leaderOfThePackCritBonus: 0,
    formTalentAuraForm: 0,
    pendingFinisherComboPoints: 0,
    lightwell: null,
    speedDirty: true,
    speedCache: BASE_RUN_SPEED * (spec.speedRun ?? 1),
    lastAvoidanceDir: null,
  };
  // Start-in-form: full package + Cat AGI (spec.attackPower is form-free base).
  if (form && !isStealthShapeshift(form)) applyFormCombatEnter(f, form);
  // Stance / form indication: resolve the form spell so buff bar + formSpellId are live at t=0.
  // Cite: Aura::HandleAuraModShapeshift — form is an until-cancelled aura.
  if (form) {
    const formSpell = (spec.spells ?? []).find((s) =>
      isFormSpell(s) && formIdFromSpell(s) === form,
    );
    if (formSpell) {
      f.formSpellId = formSpell.id;
      f.buffActive.add(formSpell.id);
    } else if (form === SHAPESHIFT_FORM.GHOSTWOLF) {
      f.formSpellId = 2645;
      f.buffActive.add(2645);
    } else if (form === SHAPESHIFT_FORM.TRAVEL) {
      f.formSpellId = 783;
      f.buffActive.add(783);
    } else if (form === SHAPESHIFT_FORM.AQUA) {
      f.formSpellId = 1066;
      f.buffActive.add(1066);
    }
  }
  return f;
}
