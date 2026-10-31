// Pure numeric helpers and tunable constants for combat and progression. Callers pass roll values in,
// so everything stays testable. The armor and partial-resist tables live in mitigation.ts.

import {
  effectiveMagicResistancePercent,
  spellMissChancePercent,
  SPELL_DAMAGE_CLASS,
} from './mitigation.ts';

// Re-export armor mitigation so existing `from './formulas'` imports keep working.
export { armorMitigation } from './mitigation.ts';

// Attack table (skill-based CMaNGOS port) — see attackTable.ts for gap notes + citations.
export {
  skillMaxForLevel,
  canGlanceInCombat,
  canCrushInCombat,
  calculateEffectiveMissChance,
  calculateEffectiveDodgeChance,
  calculateEffectiveParryChance,
  calculateEffectiveBlockChance,
  calculateEffectiveCrushChance,
  calculateEffectiveDazeChance,
  calculateAbilityDeflectChance,
  SPELL_RANGE_IDX,
  calculateEffectiveGlanceChance,
  calculateEffectiveCritChance,
  glanceDamageMultiplier,
  glanceDamageMultiplierFromContext,
  meleeAttackTable,
  pickMeleeOutcome,
  pickMeleeSpellLand,
  remapRangedWhiteOutcome,
  meleeOutcomeMultiplier,
  resolveMeleeAttack,
  type AttackResult,
  type AttackTypeKind,
  type AttackContext,
  type AttackTable,
} from './attackTable.ts';

export const TUNING = {
  tickMs: 100,
  // A runaway safety bound only, not a product time limit. Real pulls run longer than a couple of
  // minutes, and ending those as a timeout made the resolver treat them as a player death.
  maxMs: 30 * 60 * 1000, // 30 min combat-sim time
  gcdMs: 1500,

  meleeHitChance: 0.95, // vs an even-level target (miss folds in dodge/parry for MVP)
  spellHitChance: 0.96,
  baseCritChance: 0.05,
  meleeCritMult: 2,
  spellCritMult: 1.5,

  // Haste floor (cast times floor separately or not at all).
  // Melee crit/dodge from agi: use meleeCritFromAgility / dodgeFromAgility (class curves), not flat rates.
  minGcdMs: 1000,

  // Energy regen (CMaNGOS Player.cpp POWER_ENERGY): addvalue = uint32(diff/100) * Rate.Energy
  // with REGEN_TIME_FULL = 2000 ms → 20 energy / 2 s at rate 1.0 → 10 energy/sec in and out of combat.
  energyPerSec: 10,
  /** Combo point cap (Unit.cpp AddComboPoints clamps to 5). */
  comboPointsMax: 5,

  // Sitting / not standing: health (and OOC paths that still apply it) ×1.5. source: Player.cpp
  // RegenerateHealth — `if (!IsStandState()) addvalue *= 1.5`
  sitRegenMult: 1.5,

  // Legacy fallback only when pet_levelstats is absent (fixtures / pre-3A bake). Wave 3A: real HP from
  // pet_levelstats via petInitStats.
  petHealthFrac: 0.7,
  mendPetThreshold: 0.6, // the AI/rotation casts Mend Pet below this pet-health fraction
  /** Legacy mana scale when pet_levelstats is absent. Wave 3A: summon mana from table row. */
  petManaPerLevel: 15,
  // Hunter pet focus: 24 per 4 s quantum at the default rate, so 6 a second to a max of 100. Used in
  // combat and out of it. Cite: Pet.cpp:698–707; Creature.cpp:836–837.
  focusPer4Sec: 24,
  focusRegenPeriodMs: 4000,
  hpPerStamina: 10,      // combat HP granted per point of a `stamina` buff (Imp's Blood Pact); WoW's 1:10

  // ---- crowd control / resistances (all tunable) ----
  drSteps: [1, 0.5, 0.25, 0], // diminishing returns per category: full, ½, ¼, then immune
  drResetMs: 15_000,          // a DR category resets this long after its last application wears off
  // Pause between flee legs. Cite: RandomMovementGenerator.cpp:234 FleeingMovementGenerator
  //   → AbstractRandomMovementGenerator(…, 500, 1500); Update ~99–108 urand(min,max).
  fearFleeRepickMinMs: 500,
  fearFleeRepickMaxMs: 1_500,
  resistCcFactor: 0.5,        // fraction of average magic mitigation that becomes CC full-resist chance
} as const;

// Quarantined constants — NOT used by combat. Rage on swing and on hit are now the reward function,
// rage decay is its own, and the threat shares are the manager's sticky victim. Do not re-export.
export const DEPRECATED_TUNING = {
  rageOnSwing: 8,
  rageOnTakeHit: 4,
  rageDecayPerSec: 2,
  petThreatShare: 0.35,
  stoneclawThreatShare: 0.65,
} as const;

// The chance one damaging hit shakes a FEAR or a ROOT off early, measured against a cap built from
// the VICTIM's level. Both auras route to the SAME handler, and DoT ticks do roll it.
export function ccDamageBreakChance(victimLevel: number, damage: number): number {
  if (!(damage > 0)) return 0;
  const lvl = victimLevel | 0;
  const maxDmg = lvl > 8 ? 25 * lvl - 150 : 50;
  return Math.min(1, damage / maxDmg);
}

/** @deprecated Name predates roots sharing the handler — use {@link ccDamageBreakChance}. */
export const fearBreakChance = ccDamageBreakChance;

/** 5-second rule window after a mana spend (Unit.h SetLastManaUse / m_lastManaUseTimer = 5000). */
export const LAST_MANA_USE_MS = 5000;

// Power / regen (CMaNGOS Classic 1.12) — docs/cmangos_mapping/combat/rage.md,
// docs/cmangos_mapping/stats/regen.md, docs/cmangos_mapping/pets/mechanics.md

// Rage conversion coefficient at `level` (denominator in RewardRage). source: Player.cpp RewardRage
// ~2270–2274; docs/cmangos_mapping/combat/rage.md
export function rageConversion(level: number): number {
  const L = Math.max(1, level);
  return (0.0091107836 * L * L) + (3.225598133 * L) + 4.2652911;
}

// Rage gained from damage dealt or taken, in UI units. There is NO weapon-speed hit factor and no
// halving in the classic core — that shape is community theorycraft CMaNGOS does not implement.
export function rewardRage(
  damage: number,
  level: number,
  isAttacker: boolean,
  rateIncome = 1,
  /** Berserker Rage 18499: ×1.3 on *taken* rage only (Player.cpp:2284–2286). */
  berserkerRage = false,
): number {
  if (damage <= 0 || level <= 0) return 0;
  let addRage = damage / rageConversion(level) * (isAttacker ? 7.5 : 2.5);
  if (!isAttacker && berserkerRage) addRage *= 1.3;
  addRage *= rateIncome;
  // Match C++ uint32(addRage * 10) then map internal → UI (/10).
  return Math.floor(addRage * 10) / 10;
}

// UI rage lost over an interval while out of combat. At the default rate that is 2.5 rage per 2 s,
// about 1.25 a second. Cite: Player.cpp:2335–2340.
export function rageDecayAmount(diffMs: number, rateLoss = 1): number {
  if (diffMs <= 0) return 0;
  const internal = Math.floor(diffMs / 200) * 2.5 * rateLoss;
  return internal / 10;
}

// Health per second from spirit, on the class OCT coefficients — a class-switched linear curve.
// Negative results are clamped by the callers. Cite: Unit.cpp OCTRegenHPPerSpirit ~11863.
export function octRegenHpPerSpirit(classId: number, spirit: number): number {
  // Coefficients from Unit.cpp:Unit::OCTRegenHPPerSpirit switch (hardcoded, not invented).
  const Spirit = spirit;
  switch (classId) {
    case 11: return Spirit * 0.11 + 1;       // CLASS_DRUID
    case 3:  return Spirit * 0.43 - 5.5;     // CLASS_HUNTER
    case 8:  return Spirit * 0.11 + 1;       // CLASS_MAGE
    case 2:  return Spirit * 0.25;           // CLASS_PALADIN
    case 5:  return Spirit * 0.15 + 1.4;     // CLASS_PRIEST
    case 4:  return Spirit * 0.84 - 13;      // CLASS_ROGUE
    case 7:  return Spirit * 0.28 - 3.6;     // CLASS_SHAMAN
    case 9:  return Spirit * 0.12 + 1.5;     // CLASS_WARLOCK
    case 1:  return Spirit * 1.26 - 22.6;    // CLASS_WARRIOR
    default: return 0;
  }
}

// Mana per second from spirit, on the class OCT coefficients; a class with no mana pool returns 0.
// The C++ hardcodes these rather than reading a runtime DBC. Cite: Unit.cpp ~11886.
export function octRegenMpPerSpirit(classId: number, spirit: number): number {
  // Coefficients from Unit.cpp:Unit::OCTRegenMPPerSpirit switch (hardcoded, not invented).
  const Spirit = spirit;
  let addvalue = 0;
  switch (classId) {
    case 11: // DRUID
    case 3:  // HUNTER
    case 2:  // PALADIN
    case 9:  // WARLOCK
      addvalue = Spirit / 5 + 15;
      break;
    case 8:  // MAGE
    case 5:  // PRIEST
      addvalue = Spirit / 4 + 12.5;
      break;
    case 7:  // SHAMAN
      addvalue = Spirit / 5 + 17;
      break;
    default:
      return 0; // warrior / rogue — no mana
  }
  // source: Unit.cpp:Unit::OCTRegenMPPerSpirit — "per tick which occurs every 2 seconds"
  return addvalue / 2.0;
}

// UpdateManaRegen — the spirit OCT term, the mp5 aura and the five-second-rule interrupt percent,
// returned per second. The regen multiplier is the product of the percent auras, default 1.
export function updateManaRegen(
  classId: number,
  spirit: number,
  mp5FromAuras = 0,
  interruptPct = 0,
  powerRegenMultiplier = 1,
): { modManaRegen: number; modManaRegenInterrupt: number } {
  let power_regen = octRegenMpPerSpirit(classId, spirit);
  // Cite: StatSystem.cpp:551–552 power_regen *= GetTotalAuraMultiplierByMiscValue(110, POWER_MANA).
  if (powerRegenMultiplier > 0 && powerRegenMultiplier !== 1) {
    power_regen *= powerRegenMultiplier;
  }
  const power_regen_mp5 = mp5FromAuras / 5.0;
  const pct = Math.min(100, Math.max(0, interruptPct));
  return {
    modManaRegen: power_regen_mp5 + power_regen,
    modManaRegenInterrupt: power_regen_mp5 + power_regen * pct / 100.0,
  };
}

// Product of (100+amount)/100 for SPELL_AURA_MOD_POWER_REGEN_PERCENT amounts. Cite: Unit.cpp:4611–4622
// GetTotalAuraMultiplierByMiscValue.
export function powerRegenPercentMultiplier(amounts: readonly number[]): number {
  let mult = 1;
  for (const a of amounts) {
    if (!a) continue;
    mult *= (100 + a) / 100;
  }
  return mult;
}

// Focus gained over `diffMs` for hunter pets (24 * Rate.Focus every 4s quantum). source:
// Creature.cpp:836–837; Pet.cpp RegenerateAll ~698–707
function focusRegenAmount(diffMs: number, rateFocus = 1): number {
  if (diffMs <= 0) return 0;
  const periods = Math.floor(diffMs / TUNING.focusRegenPeriodMs);
  return periods * TUNING.focusPer4Sec * rateFocus;
}

// Combat mana a PET gains over an interval while not under the five-second rule. The max-mana
// fallback is gated on not being a pet, so an unresolvable OCT returns 0 rather than a made-up rate.
export function petCombatManaRegenAmount(
  diffMs: number,
  intellect: number,
  spirit: number,
  classId?: number | null,
  rateMana = 1,
): number {
  if (diffMs <= 0 || intellect <= 0) return 0;
  const periods = Math.floor(diffMs / TUNING.focusRegenPeriodMs);
  if (periods <= 0) return 0;
  // OCTRegenMPPerSpirit is class-switched (Unit.cpp:11886–11906). Pets use
  // their creature UnitClass (or fallback from scaling / mana).
  const oct = classId != null && classId > 0 ? octRegenMpPerSpirit(classId, spirit) : 0;
  if (oct <= 0) return 0;
  // Per 4s tick: sqrt(int) * OCT * rate / 5 * timerMultiplier(4)
  const perPeriod = Math.sqrt(intellect) * oct * rateMana / 5 * 4;
  return periods * perPeriod;
}

// OOC pet mana regen per second: maxValue/3.0 per Pet::RegenerateAll 4s quantum. Converted to a continuous
// per-second rate for `rest.ts` (same pattern as focus OOC). source: Creature.cpp:830; Pet.cpp:698–708
export function petOocManaRegenPerSec(maxMana: number): number {
  if (maxMana <= 0) return 0;
  return (maxMana / 3) / (TUNING.focusRegenPeriodMs / 1000);
}

// Out-of-combat health regen per second, preferring the class OCT curve when the class is known. The
// sitting multiplier is the caller's. Deprecated without a class — a generic fallback only.
export function healthRegenPerSec(spirit: number, level: number, classId?: number): number {
  if (classId != null && classId > 0) {
    return Math.max(0, octRegenHpPerSpirit(classId, spirit));
  }
  // Legacy generic (pre-OCT); pets without a class id still use this path.
  return spirit * 0.12 + level * 0.2 + 0.5;
}

// Mana per second at FULL spirit, with no five-second rule. Deprecated and class-agnostic: prefer
// updateManaRegen, which takes the class, the mp5 and the interrupt percent.
function manaRegenPerSec(spirit: number, classId?: number, mp5 = 0): number {
  if (classId != null && classId > 0) {
    return updateManaRegen(classId, spirit, mp5, 0).modManaRegen;
  }
  return spirit * 0.18 + 1.5;
}

/** Linear interpolation between min and max by a [0,1) roll. */
export function rollBetween(min: number, max: number, roll01: number): number {
  return min + (max - min) * roll01;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

// Attack table: see attackTable.ts (re-exported above).

// Apply shield block absorb to physical damage: the blocked amount is the block value capped at the
// damage, and what remains may be 0 on a full block. Cite: Unit.cpp MELEE_HIT_BLOCK ~2033.
export function applyShieldBlockAbsorb(damage: number, blockValue: number, blockValuePct: number = 0): number {
  if (damage <= 0) return 0;
  let bv = Math.max(0, blockValue | 0);
  if (blockValuePct > 0) {
    bv = (bv * (100 + blockValuePct)) / 100;
  } else if (blockValuePct < 0) {
    bv = (bv * Math.max(0, 100 + blockValuePct)) / 100;
  }
  const blocked = Math.min(bv, damage);
  return Math.max(0, damage - blocked);
}

// Spell hit chance on the magic path — a 4% base miss plus the level gap. The `base` argument is kept
// for call-site compatibility; a custom value falls back to the old level-gap shape.
export function spellHitChance(atkLevel: number, defLevel: number, base = 0.96): number {
  if (base !== 0.96) {
    const gap = defLevel - atkLevel;
    return clamp(base - 0.02 * Math.max(0, gap) - (gap >= 3 ? 0.01 : 0), 0.1, 1);
  }
  // Equal level: 4% miss → 0.96 hit. +3 vs NPC: 17% miss → 0.83 hit.
  const missPct = spellMissChancePercent({ atkLevel, defLevel, victimPlayerControlled: false });
  return clamp(1 - missPct / 100, 0.01, 1);
}

/** Spell crit. MAGIC/NONE skip level suppression; MELEE/RANGED (or omitted) keep 1%/level. Cite: Unit.cpp:3814–3823. */
export function spellCritChance(
  baseCrit: number,
  atkLevel: number,
  defLevel: number,
  dmgClass?: number,
): number {
  if (dmgClass === SPELL_DAMAGE_CLASS.MAGIC || dmgClass === SPELL_DAMAGE_CLASS.NONE) {
    return clamp(baseCrit, 0, 1);
  }
  return clamp(baseCrit - 0.01 * Math.max(0, defLevel - atkLevel), 0, 1);
}

// Stamina -> bonus health. Classic: 1 health per point up to 20, then 10 per point. `baseHp`
// (player_classlevelstats) is "before the stamina bonus".
export function staminaToHealth(baseHp: number, sta: number): number {
  const bonus = sta <= 20 ? sta : 20 + (sta - 20) * 10;
  return Math.round(baseHp + bonus);
}

/** Intellect -> bonus mana. Classic: 1 mana per point up to 20, then 15 per point. */
export function intellectToMana(baseMana: number, intel: number): number {
  const bonus = intel <= 20 ? intel : 20 + (intel - 20) * 15;
  return Math.round(baseMana + bonus);
}

// Haste percent to the speed factor the timer scaler divides by. Positive haste shortens; NEGATIVE
// haste lengthens by that percent instead of the symmetric form, which is what the C++ does.
export function hasteFactor(haste: number): number {
  if (!haste) return 1;
  if (haste > 0) return 1 + haste / 100;
  // Slow: time *= (100 + |haste|) / 100 → factor = 100 / (100 + |haste|).
  // Cap |haste| at 99.99 so factor never reaches 0 (CMaNGOS −100 guard).
  const slowPct = Math.min(-haste, 99.99);
  return 100 / (100 + slowPct);
}

// The unarmed band and attack time a DISARM falls back to. Disarm does NOT stop the swing: the C++
// substitutes the base damage band and forces the base attack time. Off hand and ranged are exempt.
export const UNARMED_DMG_MIN = 1;
export const UNARMED_DMG_MAX = 2;
export const BASE_ATTACK_TIME_MS = 2000;

/** Same profile with the unarmed band and BASE_ATTACK_TIME. Generic so WeaponProfile survives. */
export function disarmedWeaponProfile<T extends {
  dmgMin: number;
  dmgMax: number;
  speedMs: number;
}>(w: T): T {
  return {
    ...w,
    dmgMin: UNARMED_DMG_MIN,
    dmgMax: UNARMED_DMG_MAX,
    speedMs: BASE_ATTACK_TIME_MS,
  };
}

export function scaleTime(baseMs: number, haste: number, floorMs = 0): number {
  if (baseMs <= 0) return 0;
  const scaled = Math.round(baseMs / hasteFactor(haste));
  return floorMs > 0 ? Math.max(floorMs, scaled) : scaled;
}

// ---- CMaNGOS Classic 1.12 stats pipeline (pure ports) ---------------------
// Cite: Player.cpp GetMeleeCritFromAgility / GetDodgeFromAgility; StatSystem.cpp UpdateAttackPower.

/** Linear class-rate interpolation used by crit/dodge from agi (lvl 1 ↔ 60 tables). */
function classRateAtLevel(valLevel1: number, valLevel60: number, level: number): number {
  const lvl = Math.max(1, level);
  return valLevel1 * (60.0 - lvl) / 59.0 + valLevel60 * (lvl - 1.0) / 59.0;
}

// Melee crit % from agility (percentage points, e.g. 5.0 = 5%). source: Player.cpp GetMeleeCritFromAgility;
// docs/cmangos_mapping/stats/derived-crit-dodge-spellcrit.md
export function meleeCritFromAgility(classId: number, level: number, agi: number): number {
  let valLevel1 = 0.0;
  let valLevel60 = 0.0;
  switch (classId) {
    case 2: case 7: case 11: // paladin, shaman, druid
      valLevel1 = 4.6; valLevel60 = 20.0; break;
    case 8: // mage
      valLevel1 = 12.9; valLevel60 = 20.0; break;
    case 4: // rogue
      valLevel1 = 2.2; valLevel60 = 29.0; break;
    case 3: // hunter
      valLevel1 = 3.5; valLevel60 = 53.0; break;
    case 5: // priest
      valLevel1 = 11.0; valLevel60 = 20.0; break;
    case 9: // warlock
      valLevel1 = 8.4; valLevel60 = 20.0; break;
    case 1: // warrior
      valLevel1 = 3.9; valLevel60 = 20.0; break;
    default:
      return 0.0;
  }
  const classrate = classRateAtLevel(valLevel1, valLevel60, level);
  if (classrate <= 0) return 0.0;
  return agi / classrate;
}

// Dodge percentage points from agility alone; the class base is added separately by the caller.
// Cite: Player.cpp GetDodgeFromAgility, with the base array in StatSystem.cpp.
export function dodgeFromAgility(classId: number, level: number, agi: number): number {
  let valLevel1 = 0.0;
  let valLevel60 = 0.0;
  switch (classId) {
    case 2: case 7: case 11: // paladin, shaman, druid
      valLevel1 = 4.6; valLevel60 = 20.0; break;
    case 8: // mage
      valLevel1 = 12.9; valLevel60 = 20.0; break;
    case 4: // rogue
      valLevel1 = 1.1; valLevel60 = 14.5; break;
    case 3: // hunter
      valLevel1 = 1.8; valLevel60 = 26.5; break;
    case 5: // priest
      valLevel1 = 11.0; valLevel60 = 20.0; break;
    case 9: // warlock
      valLevel1 = 8.4; valLevel60 = 20.0; break;
    case 1: // warrior
      valLevel1 = 3.9; valLevel60 = 20.0; break;
    default:
      return 0.0;
  }
  const classrate = classRateAtLevel(valLevel1, valLevel60, level);
  if (classrate <= 0) return 0.0;
  return agi / classrate;
}

// Class base dodge % (percentage points). Indexed by class id; unused slots 0. source: StatSystem.cpp
// PLAYER_BASE_DODGE[MAX_CLASSES]
export const PLAYER_BASE_DODGE: readonly number[] = [
  0.00, // [0] unused
  0.00, // [1] warrior
  0.75, // [2] paladin
  0.64, // [3] hunter
  0.00, // [4] rogue
  3.00, // [5] priest
  0.00, // [6] unused
  1.75, // [7] shaman
  3.25, // [8] mage
  2.00, // [9] warlock
  0.00, // [10] unused
  0.75, // [11] druid
] as const;

/** Total dodge % from class base + agility (percentage points). */
export function dodgeChancePercent(classId: number, level: number, agi: number): number {
  const base = (classId >= 0 && classId < PLAYER_BASE_DODGE.length) ? PLAYER_BASE_DODGE[classId]! : 0;
  return base + dodgeFromAgility(classId, level, agi);
}

// Spell crit % from intellect (percentage points). chance = base + INT / (rate0 + rate1 * LEVEL) source:
// Player.cpp GetSpellCritFromIntellect; docs/cmangos_mapping/stats/derived-crit-dodge-spellcrit.md
const SPELL_CRIT_DATA: readonly { base: number; rate0: number; rate1: number }[] = [
  { base: 0.0, rate0: 0.0, rate1: 10.0 },   // 0 unused
  { base: 0.0, rate0: 0.0, rate1: 10.0 },   // 1 warrior
  { base: 3.70, rate0: 14.77, rate1: 0.65 }, // 2 paladin
  { base: 0.0, rate0: 0.0, rate1: 10.0 },   // 3 hunter (FIXME in CMaNGOS)
  { base: 0.0, rate0: 0.0, rate1: 10.0 },   // 4 rogue
  { base: 2.97, rate0: 10.03, rate1: 0.82 }, // 5 priest
  { base: 0.0, rate0: 0.0, rate1: 10.0 },   // 6 unused
  { base: 3.54, rate0: 11.51, rate1: 0.80 }, // 7 shaman
  { base: 3.70, rate0: 14.77, rate1: 0.65 }, // 8 mage
  { base: 3.18, rate0: 11.30, rate1: 0.82 }, // 9 warlock
  { base: 0.0, rate0: 0.0, rate1: 10.0 },   // 10 unused
  { base: 3.33, rate0: 12.41, rate1: 0.79 }, // 11 druid
];

export function spellCritFromIntellect(classId: number, level: number, intellect: number): number {
  if (classId < 0 || classId >= SPELL_CRIT_DATA.length) return 0.0;
  const d = SPELL_CRIT_DATA[classId]!;
  const critRatio = d.rate0 + d.rate1 * Math.max(1, level);
  if (critRatio <= 0) return d.base;
  return d.base + intellect / critRatio;
}

// The shapeshift flag for the agility attack bonus, extracted from the 1.12.1 client DBC: Cat carries
// it and no other playable form does.
export const SHAPESHIFT_FLAG_AGILITY_ATTACK_BONUS = 0x00000020;

/** Form ids whose DBC flags1 include AGILITY_ATTACK_BONUS (only Cat in 1.12.1). */
export const FORMS_WITH_AGI_ATTACK_BONUS: ReadonlySet<number> = new Set([1]);

export function formHasAgiAttackBonus(formId: number | undefined | null): boolean {
  if (formId == null || formId === 0) return false;
  return FORMS_WITH_AGI_ATTACK_BONUS.has(formId | 0);
}

// Melee attack power base, before the unit-mod flat and multiplier, on the per-class curves. A form
// carrying the agility attack bonus adds full agility on top.
export function meleeAttackPowerFromStats(
  classId: number,
  level: number,
  str: number,
  agi: number,
  formAgiAttackBonus = false,
): number {
  const lvl = level;
  let val2 = 0.0;
  switch (classId) {
    case 1: // warrior — StatSystem.cpp:246
    case 2: // paladin — StatSystem.cpp:247
      val2 = lvl * 3.0 + str * 2.0 - 20.0;
      break;
    case 4: // rogue  — StatSystem.cpp:248
    case 3: // hunter — StatSystem.cpp:249
      val2 = lvl * 2.0 + str + agi - 20.0;
      break;
    case 7: // shaman — StatSystem.cpp:250
      val2 = lvl * 2.0 + str * 2.0 - 20.0;
      break;
    case 11: // druid — StatSystem.cpp:253: level * 3 + str * 2 - 20, plus AGI when SHAPESHIFT_FLAG_AGILITY_ATTACK_BONUS (Cat).
      val2 = lvl * 3.0 + str * 2.0 - 20.0 + (formAgiAttackBonus ? agi : 0);
      break;
    case 8: // mage    — StatSystem.cpp:260
    case 5: // priest  — StatSystem.cpp:261
    case 9: // warlock — StatSystem.cpp:262
      val2 = str - 10.0;
      break;
    default:
      val2 = 0.0;
      break;
  }
  return val2;
}

// Ranged attack power base, before the unit-mod flat and multiplier: hunters double both terms,
// rogues and warriors take one each, and the cat and bear forms take none at all.
export function rangedAttackPowerFromStats(
  classId: number,
  level: number,
  agi: number,
  formId = 0,
): number {
  const lvl = level;
  switch (classId) {
    case 3: // hunter — StatSystem.cpp:225
      return lvl * 2.0 + agi * 2.0 - 10.0;
    case 4: // rogue   — StatSystem.cpp:226
    case 1: // warrior — StatSystem.cpp:227
      return lvl + agi - 10.0;
    case 11: { // druid — StatSystem.cpp:228–237
      // FORM_CAT=1, FORM_BEAR=5, FORM_DIREBEAR=8 (SpellDefines.h / schema SHAPESHIFT_FORM)
      if (formId === 1 || formId === 5 || formId === 8) return 0.0;
      return agi - 10.0;
    }
    default: // StatSystem.cpp:239
      return agi - 10.0;
  }
}

// The strength contribution coefficient to melee AP, for equipment scoring and mid-fight strength
// buffs — 1 or 2, derived from the same per-class curve.
export function meleeApPerStrength(classId: number): number {
  switch (classId) {
    case 1: case 2: case 7: case 11: return 2; // warrior, paladin, shaman, druid
    case 3: case 4: case 5: case 8: case 9: return 1; // hunter, rogue, priest, mage, warlock
    default: return 0;
  }
}

// Shield block VALUE, the flat damage absorbed on a successful block, not the block chance:
// (flat + strength / 20 − 1) × percent, floored at 0. Cite: Player.cpp GetShieldBlockValue ~4878.
export function shieldBlockValue(str: number, auraFlat = 0, auraPct = 1): number {
  // source: Player.cpp:Player::GetShieldBlockValue — str/20 - 1, clamp 0, uint32 truncate
  let value = (auraFlat + str / 20 - 1) * auraPct;
  if (value < 0) value = 0;
  return Math.floor(value);
}

// The layered unit-mod total: (base + create) × base percent, plus the total value, × the total
// percent. Both percentages default to 1, as the C++ initialises them.
export function unitModValue(
  baseValue: number,
  create: number,
  basePct = 1,
  totalValue = 0,
  totalPct = 1,
): number {
  if (totalPct <= 0) return 0;
  let value = baseValue + create;
  value *= basePct;
  value += totalValue;
  value *= totalPct;
  return value;
}

// Final attack power from the class base, the flat total and the multiplier. The multiplier here is
// the full factor, where 1.0 is no change, matching the layered helper above.
export function totalAttackPower(baseAp: number, totalValue = 0, basePct = 1, totalPct = 1): number {
  const v = unitModValue(baseAp, 0, basePct, totalValue, totalPct);
  return Math.max(0, Math.floor(v));
}

// Armor from total agility doubled, plus the gear, enchant and aura flats. Cite: StatSystem.cpp
// UpdateArmor; Player.cpp InitStatsForLevel SetArmor(createAgi*2).
export function armorFromAgiAndGear(agi: number, gearAndAuraArmor: number): number {
  return Math.floor(agi * 2.0 + gearAndAuraArmor);
}

// The DISPLAY-only percentage bonus from skill over the level cap. CMaNGOS applies it to the printed
// value alone — combat reads the pre-skill number, so this must never reach a roll.
export function skillDisplayBonusPercentPoints(skill: number, level: number): number {
  const cap = Math.max(1, Math.floor(level)) * 5; // Unit.h GetSkillMaxForLevel
  return (skill - cap) * 0.04;
}

/** @deprecated Prefer meleeCritFromAgility(classId, level, agi) / 100. A thin warrior-L60-shaped
 * fallback, kept only for call sites with no class context. */
function critChanceFromAgi(agi: number): number {
  // Warrior L60 rate is 20 agi per 1% — historical TUNING.agiPerCrit shape, not authoritative.
  return meleeCritFromAgility(1, 60, agi) / 100;
}

/** @deprecated Prefer dodgeChancePercent(classId, level, agi) / 100. */
function dodgeChanceFromAgi(agi: number): number {
  return dodgeFromAgility(1, 60, agi) / 100;
}

/** @deprecated Prefer meleeAttackPowerFromStats(classId, level, str, agi). A warrior-shaped curve for
 * call sites that only have a level and strength. */
function attackPowerFromStats(level: number, str: number): number {
  return Math.max(0, meleeAttackPowerFromStats(1, level, str, 0));
}

// ---- Resistances & crowd control ------------------------------------------
// The average-resist helpers are rng-free, for CC land rolls; combat DAMAGE uses the partial table.

// The average fraction of magic damage resistance removes, with no partial table. For CC, the UI and
// tests only — combat damage must roll the table. Returns 0 at or below zero resistance.
export function resistMitigation(resistance: number, casterLevel: number): number {
  if (resistance <= 0) return 0;
  const pct = effectiveMagicResistancePercent({
    school: 'fire', // school-agnostic average of a raw resistance amount
    resistance,
    attackerLevel: casterLevel,
    victimLevel: casterLevel,
    binary: false,
    victimIsNpc: false,
  });
  return Math.max(0, pct) / 100;
}

// The legacy CC full-resist roll. applySpell no longer uses it, since hostile CC shares the cast's own
// hit result; it survives for the inline proc CC path.
export function ccResistChance(resistance: number, atkLevel: number, defLevel: number): number {
  const level = 1 - spellHitChance(atkLevel, defLevel);      // same level-gap shape as a spell miss
  const fromRes = resistMitigation(resistance, atkLevel) * TUNING.resistCcFactor;
  return clamp(level + fromRes, 0, 0.9);
}

// Diminishing-returns duration multiplier for the Nth application in a category (0 → full, 1 → ½, 2 → ¼, ≥3
// → immune). Pure arithmetic — DR draws no rng.
export function drFactor(step: number): number {
  const s = TUNING.drSteps;
  return s[Math.min(Math.max(0, step), s.length - 1)];
}

// Off-hand physical damage TOTAL_PCT default (50% weapon+AP). source: Unit.cpp constructor ~375–376
// `m_auraModifiersGroup[UNIT_MOD_DAMAGE_OFFHAND][TOTAL_PCT] = 0.5f`
export const OFFHAND_DAMAGE_TOTAL_PCT = 0.5;

// The off-hand total percent after the off-hand damage aura. That percent is a MOD of the 0.5 default,
// so a full Dual Wield Specialization gives 0.625, not 0.75.
export function offhandDamageTotalPct(pctBonus: number | undefined): number {
  const pct = Number(pctBonus) || 0;
  return OFFHAND_DAMAGE_TOTAL_PCT * (100 + pct) / 100;
}

// The crit multiplier after the versus-creature-type aura: the base times one plus the bonus, when the
// victim's type matches. Heals never take it — the C++ guards the whole block.
export function critMultiplierWithVersus(
  base: number,
  rows: ReadonlyArray<{ creatureTypeMask: number; amount: number }> | undefined,
  creatureType: number | undefined,
): number {
  const type = (creatureType ?? 0) | 0;
  if (!rows?.length || type < 1) return base;
  const typeMask = 1 << (type - 1);
  let bonus = 0;
  for (const r of rows) if (((r.creatureTypeMask ?? 0) | 0) & typeMask) bonus += r.amount;
  return bonus ? base * (1 + bonus / 100) : base;
}

/** Unarmed fallback when !CanUseEquippedWeapon (Unit.h BASE_MINDAMAGE / BASE_MAXDAMAGE). */
export const BASE_MINDAMAGE = 1;
export const BASE_MAXDAMAGE = 2;

// Inputs for CalculateMinMaxDamage. The defaults match the C++ unit-mod init, except that an off-hand
// caller should pass the off-hand total percent.
export interface MinMaxDamageArgs {
  weaponMin: number;
  weaponMax: number;
  attackPower: number;
  /** Attack time in ms; att_speed = speedMs/1000 when !normalized. */
  speedMs: number;
  /** UNIT_MOD_* BASE_VALUE (usually 0 for players). */
  baseValueMod?: number;
  basePct?: number;
  totalValue?: number;
  /** UNIT_MOD_* TOTAL_PCT; off-hand default is 0.5 in Unit.cpp. */
  totalPct?: number;
  // GetEnchantmentModifier flat — only applied on the equipped-weapon branch. Gap: Phonecraft item/enchant
  // data has no baked weapon-damage flat today → pass 0.
  enchantFlat?: number;
  /** Ranged ammo DPS (min/max) × att_speed added to weapon. Gap: no ammo DPS in schema → 0. */
  ammoDpsMin?: number;
  ammoDpsMax?: number;
  /** IsAttackSpeedOverridenShapeShift — form level×speed weapon bands. */
  formOverride?: boolean;
  /** Level for form override (clamped ≤60). */
  level?: number;
  /** CanUseEquippedWeapon; false → BASE_MINDAMAGE/BASE_MAXDAMAGE. Default true. */
  canUseWeapon?: boolean;
  // Multi-damage-line index. When index ≠ 0 on equipped branch, base_value and total_value are zeroed
  // (secondary weapon damage lines carry no AP/enchant).
  index?: number;
  // Normalized ability path: use normalizedSpeedSec as att_speed (GetAPMultiplier). White attacks leave
  // this false.
  normalized?: boolean;
  /** Seconds; required when normalized=true (dagger 1.7 / 1H 2.4 / 2H 3.3 / ranged 2.8). */
  normalizedSpeedSec?: number;
}

// The CalculateMinMaxDamage structure, giving min and max before the damage roll: the base value is
// attack power over 14 times the attack speed, then the weapon band through both percent layers.
export function calculateMinMaxDamage(args: MinMaxDamageArgs): { min: number; max: number } {
  const attSpeed = args.normalized && args.normalizedSpeedSec != null
    ? Math.max(0, args.normalizedSpeedSec)
    : Math.max(0, args.speedMs) / 1000;

  let baseValue = (args.baseValueMod ?? 0) + (args.attackPower / 14) * attSpeed;
  const basePct = args.basePct ?? 1;
  let totalValue = args.totalValue ?? 0;
  const totalPct = args.totalPct ?? 1;

  let weaponMin = args.weaponMin;
  let weaponMax = args.weaponMax;

  if (args.formOverride) {
    let lvl = (args.level ?? 1) | 0;
    if (lvl > 60) lvl = 60;
    if (lvl < 1) lvl = 1;
    weaponMin = lvl * 0.85 * attSpeed;
    weaponMax = lvl * 1.25 * attSpeed;
  } else if (args.canUseWeapon === false) {
    weaponMin = BASE_MINDAMAGE;
    weaponMax = BASE_MAXDAMAGE;
  } else {
    totalValue += args.enchantFlat ?? 0;
    if (args.ammoDpsMin != null && args.ammoDpsMin !== 0) {
      weaponMin += args.ammoDpsMin * attSpeed;
    }
    if (args.ammoDpsMax != null && args.ammoDpsMax !== 0) {
      weaponMax += args.ammoDpsMax * attSpeed;
    }
    if ((args.index ?? 0) !== 0) {
      baseValue = 0;
      totalValue = 0;
    }
  }

  return {
    min: ((baseValue + weaponMin) * basePct + totalValue) * totalPct,
    max: ((baseValue + weaponMax) * basePct + totalValue) * totalPct,
  };
}

// Roll raw white or ability weapon damage between that min and max. The options select the off-hand
// half, a form override and the enchant or ammo hooks; omitted, it matches the prior shape.
export function meleeBaseDamage(
  weaponMin: number,
  weaponMax: number,
  attackPower: number,
  speedMs: number,
  roll01: number,
  opts?: Omit<MinMaxDamageArgs, 'weaponMin' | 'weaponMax' | 'attackPower' | 'speedMs'>,
): number {
  const range = calculateMinMaxDamage({
    weaponMin,
    weaponMax,
    attackPower,
    speedMs,
    ...opts,
  });
  return rollBetween(range.min, range.max, roll01);
}
