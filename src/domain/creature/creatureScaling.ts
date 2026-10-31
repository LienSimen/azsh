// Pure CMaNGOS Classic Creature::SelectLevel port (1.12), emitting its base weapon damages as the
// fight weapon range. Health takes the rank mod then HealthMultiplier. Cite: Creature.cpp ~1265.

import type { Rng } from '../../engine/core/rng.ts';
import type {
  CreatureClassLvlStatsRow,
  CreatureDef,
  CreatureTemplateScaling,
} from '../../data/schema.ts';
import { CREATURE_ELITE } from '../../data/schema.ts';

/** Sentinel matching C++ USE_DEFAULT_DATABASE_LEVEL — roll/use template min–max. */
export const USE_DEFAULT_DATABASE_LEVEL = 0xffffffff;

// Classic config defaults (World.cpp setConfigPos Rate.Creature.*). All ranks 1.0 unless a future config
// layer overrides. Named after CONFIG_FLOAT_RATE_CREATURE_* keys.
export const RATE_CREATURE_HP: Readonly<Record<number, number>> = {
  [CREATURE_ELITE.NORMAL]: 1.0,       // CONFIG_FLOAT_RATE_CREATURE_NORMAL_HP
  [CREATURE_ELITE.ELITE]: 1.0,        // CONFIG_FLOAT_RATE_CREATURE_ELITE_ELITE_HP
  [CREATURE_ELITE.RAREELITE]: 1.0,    // CONFIG_FLOAT_RATE_CREATURE_ELITE_RAREELITE_HP
  [CREATURE_ELITE.WORLDBOSS]: 1.0,    // CONFIG_FLOAT_RATE_CREATURE_ELITE_WORLDBOSS_HP
  [CREATURE_ELITE.RARE]: 1.0,         // CONFIG_FLOAT_RATE_CREATURE_ELITE_RARE_HP
};

export const RATE_CREATURE_DAMAGE: Readonly<Record<number, number>> = {
  [CREATURE_ELITE.NORMAL]: 1.0,       // CONFIG_FLOAT_RATE_CREATURE_NORMAL_DAMAGE
  [CREATURE_ELITE.ELITE]: 1.0,        // CONFIG_FLOAT_RATE_CREATURE_ELITE_ELITE_DAMAGE
  [CREATURE_ELITE.RAREELITE]: 1.0,    // CONFIG_FLOAT_RATE_CREATURE_ELITE_RAREELITE_DAMAGE
  [CREATURE_ELITE.WORLDBOSS]: 1.0,    // CONFIG_FLOAT_RATE_CREATURE_ELITE_WORLDBOSS_DAMAGE
  [CREATURE_ELITE.RARE]: 1.0,         // CONFIG_FLOAT_RATE_CREATURE_ELITE_RARE_DAMAGE
};

/** Creature::_GetHealthMod — Creature.cpp ~1481–1498. Default branch uses elite rate. */
export function getHealthMod(rank: number): number {
  return RATE_CREATURE_HP[rank] ?? RATE_CREATURE_HP[CREATURE_ELITE.ELITE]!;
}

/** Creature::_GetDamageMod — Creature.cpp ~1500–1517. Default branch uses elite rate. */
export function getDamageMod(rank: number): number {
  return RATE_CREATURE_DAMAGE[rank] ?? RATE_CREATURE_DAMAGE[CREATURE_ELITE.ELITE]!;
}

// ObjectMgr::GetCreatureClassLvlStats validity — ObjectMgr.cpp ~795–796: (BaseHealth != 0 || Stamina > 0)
// && BaseDamage > 0.1f
export function isValidCreatureClassLvlStats(
  row: CreatureClassLvlStatsRow | null | undefined,
): row is CreatureClassLvlStatsRow {
  if (!row) return false;
  const stamina = row.stamina ?? 0;
  return (row.baseHealth !== 0 || stamina > 0) && row.baseDamage > 0.1;
}

// ObjectMgr loader post-processing (ObjectMgr.cpp ~779–782), applied at bake so runtime rows match
// the in-memory C++ CLS: mana, melee and ranged AP and armor lose their primary-stat share.
export function applyClassLvlStatsLoaderAdjustments(
  row: CreatureClassLvlStatsRow,
): CreatureClassLvlStatsRow {
  const intellect = row.intellect ?? 0;
  const strength = row.strength ?? 0;
  const agility = row.agility ?? 0;

  const baseInt = intellect < 20 ? intellect : 20;
  const manaBonus = baseInt + (intellect - baseInt) * 15;
  const strAp = strength >= 10 ? (strength - 10) * 2 : 0;
  const agiRap = agility >= 10 ? agility - 10 : 0;
  const agiArmor = agility * 2;

  return {
    ...row,
    baseMana: row.baseMana - Math.min(row.baseMana, Math.max(0, Math.floor(manaBonus))),
    baseMeleeAttackPower:
      row.baseMeleeAttackPower - Math.min(row.baseMeleeAttackPower, Math.max(0, strAp)),
    baseRangedAttackPower:
      row.baseRangedAttackPower - Math.min(row.baseRangedAttackPower, Math.max(0, agiRap)),
    baseArmor: row.baseArmor - Math.min(row.baseArmor, Math.max(0, agiArmor)),
  };
}

export interface SelectLevelResult {
  level: number;
  maxHealth: number;
  mana: number;
  armor: number;
  dmgMin: number;
  dmgMax: number;
  attackTimeMs: number;
  meleeAttackPower: number;
  rangedAttackPower: number;
  experienceMultiplier: number;
  /** True when CLS damage path was used (DamageMultiplier>=0 && ArmorMultiplier>=0). */
  usedClassLevelStatsDamage: boolean;
}

export type CreatureClassLvlStatsLookup = (
  level: number,
  unitClass: number,
) => CreatureClassLvlStatsRow | undefined;

export interface SelectLevelOptions {
  /** Forced level, or USE_DEFAULT_DATABASE_LEVEL / omit to roll Min–Max. */
  forcedLevel?: number;
  /** Required when minLevel !== maxLevel and forcedLevel is default. */
  rng?: Rng;
  /** Pets force rank 0 (Creature.cpp SelectLevel: IsPet() ? 0 : cinfo->Rank). */
  isPet?: boolean;
}

// Pure SelectLevel, deterministic for the same template, CLS lookup and forced level. CLS ×
// multipliers first, then the Min/Max template fallback, then rank mods and HealthMultiplier.
export function selectCreatureLevel(
  template: CreatureTemplateScaling,
  clsLookup: CreatureClassLvlStatsLookup,
  opts: SelectLevelOptions = {},
): SelectLevelResult {
  const rank = opts.isPet ? 0 : template.rank;
  const minlevel = template.minLevel;
  const maxlevel = template.maxLevel;

  let level: number;
  const forced = opts.forcedLevel ?? USE_DEFAULT_DATABASE_LEVEL;
  if (forced === USE_DEFAULT_DATABASE_LEVEL) {
    level = minlevel === maxlevel
      ? minlevel
      : (opts.rng ?? missingRng()).int(minlevel, maxlevel);
  } else {
    level = forced;
  }

  // Unset sentinels matching C++ (uint32(-1) health/mana, armor -1.f)
  let health = -1;
  let mana = -1;
  let armor = -1;
  let mainMinDmg = 0;
  let mainMaxDmg = 0;
  let meleeAttackPwr = 0;
  let rangedAttackPwr = 0;

  let healthMultiplier = 1;
  let powerMultiplier = 1;

  const damageMod = getDamageMod(rank);
  const damageMulti = template.damageMultiplier * damageMod;
  let usedDamageMulti = false;

  const cCLS = clsLookup(level, template.unitClass);
  if (isValidCreatureClassLvlStats(cCLS)) {
    // Health — Creature.cpp ~1317–1322
    if (template.healthMultiplier >= 0) {
      health = cCLS.baseHealth;
    }
    if (template.healthMultiplier > 0) {
      healthMultiplier = template.healthMultiplier;
    }

    // Mana — ~1324–1329
    if (template.powerMultiplier >= 0) {
      mana = cCLS.baseMana;
    }
    if (template.powerMultiplier > 0) {
      powerMultiplier = template.powerMultiplier;
    }

    // Armor — ~1331–1332 (std::round)
    if (template.armorMultiplier >= 0) {
      armor = Math.round(cCLS.baseArmor * template.armorMultiplier);
    }

    // Damage — ~1333–1347 (requires BOTH damage and armor multi >= 0)
    if (template.damageMultiplier >= 0 && template.armorMultiplier >= 0) {
      usedDamageMulti = true;
      const atkSec = template.meleeBaseAttackTime / 1000;
      const ap14 = cCLS.baseMeleeAttackPower / 14;
      mainMinDmg =
        ((cCLS.baseDamage * template.damageVariance) + ap14) * atkSec * damageMulti;
      mainMaxDmg =
        ((cCLS.baseDamage * template.damageVariance * 1.5) + ap14) * atkSec * damageMulti;

      meleeAttackPwr = cCLS.baseMeleeAttackPower;
      rangedAttackPwr = cCLS.baseRangedAttackPower;
      // Ranged weapon damages computed in C++ but Phonecraft mob model is melee-only.
    }
    // Primary stats × multipliers exist in C++ (~1350–1360) but only affect pets/auras
    // and AP re-layer; combat uses baked base weapon damage — skip for fight stats.
  }

  if (!usedDamageMulti || armor === -1) {
    const defaultLevel = forced === USE_DEFAULT_DATABASE_LEVEL;
    const inBand = forced >= minlevel && forced <= maxlevel;
    if (defaultLevel || inBand) {
      const rellevel =
        maxlevel === minlevel ? 0 : (level - minlevel) / (maxlevel - minlevel);

      if (armor === -1) {
        const minhealth = Math.min(template.maxLevelHealth, template.minLevelHealth);
        const maxhealth = Math.max(template.maxLevelHealth, template.minLevelHealth);
        // uint32(minhealth + uint32(rellevel * (maxhealth - minhealth)))
        health = (minhealth + Math.floor(rellevel * (maxhealth - minhealth))) >>> 0;

        const minmana = Math.min(template.maxLevelMana, template.minLevelMana);
        const maxmana = Math.max(template.maxLevelMana, template.minLevelMana);
        mana = (minmana + Math.floor(rellevel * (maxmana - minmana))) >>> 0;

        armor = template.armor;
      }

      if (!usedDamageMulti) {
        mainMinDmg = template.minMeleeDmg * damageMulti;
        mainMaxDmg = template.maxMeleeDmg * damageMulti;
        meleeAttackPwr = template.meleeAttackPower;
        rangedAttackPwr = template.rangedAttackPower;
      }
    } else {
      // Out-of-range forced level — Creature.cpp ~1397–1404 ("probably wrong")
      health = template.maxLevel > 0
        ? Math.floor((template.maxLevelHealth / template.maxLevel) * level)
        : 1;
      mana = template.maxLevel > 0
        ? Math.floor((template.maxLevelMana / template.maxLevel) * level)
        : 0;
      armor = 0;
    }
  }

  // Rank health mod then HealthMultiplier (createHealth * m_healthMultiplier in UpdateMaxHealth)
  let maxHealth = health * getHealthMod(rank);
  maxHealth = Math.round(Math.max(maxHealth * healthMultiplier, 1));

  // Mana × power TOTAL_PCT (Unit::UpdateMaxPower) with no intellect bonus beyond create
  let maxMana = mana < 0 ? 0 : mana;
  maxMana = Math.round(Math.max(0, maxMana * powerMultiplier));

  const armorOut = armor < 0 ? 0 : armor;

  return {
    level,
    maxHealth,
    mana: maxMana,
    armor: armorOut,
    dmgMin: mainMinDmg,
    dmgMax: mainMaxDmg,
    attackTimeMs: template.meleeBaseAttackTime || 2000,
    // SelectLevel sets AP modifier as meleeAttackPwr * damageMod (~1460–1461)
    meleeAttackPower: meleeAttackPwr * damageMod,
    rangedAttackPower: rangedAttackPwr * damageMod,
    experienceMultiplier: template.experienceMultiplier,
    usedClassLevelStatsDamage: usedDamageMulti,
  };
}

function missingRng(): Rng {
  throw new Error(
    'selectCreatureLevel: rng required when minLevel !== maxLevel and forcedLevel is default',
  );
}

/** True when this def has raw SelectLevel inputs (ETL/enrich scaling block). */
export function hasCreatureScaling(cdef: CreatureDef): cdef is CreatureDef & {
  scaling: CreatureTemplateScaling;
} {
  return cdef.scaling != null;
}

// Kill XP at the grant choke — full Formulas.h Gain (BaseGain + elite + multi). Implementation lives in
// progression/xpGain.ts (Wave 3B). Re-exported here so existing import sites keep working.
export { killXpAmount } from '../../progression/xpGain.ts';

/** Map a SQL-shaped creature_template row into CreatureTemplateScaling (no invented values). */
export function scalingFromTemplateRow(c: {
  MinLevel?: number; minLevel?: number;
  MaxLevel?: number; maxLevel?: number;
  UnitClass?: number; unitClass?: number;
  Rank?: number; rank?: number;
  HealthMultiplier?: number; healthMultiplier?: number;
  PowerMultiplier?: number; powerMultiplier?: number;
  DamageMultiplier?: number; damageMultiplier?: number;
  DamageVariance?: number; damageVariance?: number;
  ArmorMultiplier?: number; armorMultiplier?: number;
  ExperienceMultiplier?: number; experienceMultiplier?: number;
  MinLevelHealth?: number; minLevelHealth?: number;
  MaxLevelHealth?: number; maxLevelHealth?: number;
  MinLevelMana?: number; minLevelMana?: number;
  MaxLevelMana?: number; maxLevelMana?: number;
  MinMeleeDmg?: number; minMeleeDmg?: number;
  MaxMeleeDmg?: number; maxMeleeDmg?: number;
  MinRangedDmg?: number; minRangedDmg?: number;
  MaxRangedDmg?: number; maxRangedDmg?: number;
  Armor?: number; armor?: number;
  MeleeAttackPower?: number; meleeAttackPower?: number;
  RangedAttackPower?: number; rangedAttackPower?: number;
  MeleeBaseAttackTime?: number; meleeBaseAttackTime?: number;
  RangedBaseAttackTime?: number; rangedBaseAttackTime?: number;
}): CreatureTemplateScaling {
  const num = (a: number | undefined, b: number | undefined, d = 0): number =>
    Number(a ?? b ?? d);
  return {
    minLevel: num(c.MinLevel, c.minLevel, 1),
    maxLevel: num(c.MaxLevel, c.maxLevel, 1),
    unitClass: num(c.UnitClass, c.unitClass, 1),
    rank: num(c.Rank, c.rank, 0),
    healthMultiplier: num(c.HealthMultiplier, c.healthMultiplier, 1),
    powerMultiplier: num(c.PowerMultiplier, c.powerMultiplier, 1),
    damageMultiplier: num(c.DamageMultiplier, c.damageMultiplier, 1),
    damageVariance: num(c.DamageVariance, c.damageVariance, 1),
    armorMultiplier: num(c.ArmorMultiplier, c.armorMultiplier, 1),
    experienceMultiplier: num(c.ExperienceMultiplier, c.experienceMultiplier, 1),
    minLevelHealth: num(c.MinLevelHealth, c.minLevelHealth, 1),
    maxLevelHealth: num(c.MaxLevelHealth, c.maxLevelHealth, 1),
    minLevelMana: num(c.MinLevelMana, c.minLevelMana, 0),
    maxLevelMana: num(c.MaxLevelMana, c.maxLevelMana, 0),
    minMeleeDmg: num(c.MinMeleeDmg, c.minMeleeDmg, 0),
    maxMeleeDmg: num(c.MaxMeleeDmg, c.maxMeleeDmg, 0),
    minRangedDmg: num(c.MinRangedDmg, c.minRangedDmg, 0),
    maxRangedDmg: num(c.MaxRangedDmg, c.maxRangedDmg, 0),
    armor: num(c.Armor, c.armor, 0),
    meleeAttackPower: num(c.MeleeAttackPower, c.meleeAttackPower, 0),
    rangedAttackPower: num(c.RangedAttackPower, c.rangedAttackPower, 0),
    meleeBaseAttackTime: num(c.MeleeBaseAttackTime, c.meleeBaseAttackTime, 2000) || 2000,
    rangedBaseAttackTime: num(c.RangedBaseAttackTime, c.rangedBaseAttackTime, 2000) || 2000,
  };
}
