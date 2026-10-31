// Pure pet selectors: PetState plus DataStore into a combat-ready spec, with stats from
// pet_levelstats and loyalty, happiness and TP per Pet.cpp. Imported by game.ts, never the engine.

import type { DataStore } from '../../data/dataStore.ts';
import type { CreatureDef, ItemDef, PowerType, School, SpellDef } from '../../data/schema.ts';
import type { Character, PetState } from '../character/character.ts';
import { applyAura, getActiveBuffIds, maxHealth } from '../character/character.ts';
import { pruneExpiredAuras } from '../character/characterStats.ts';
import type { CombatantSpec } from '../../engine/combat.ts';
import type { Rng } from '../../engine/core/rng.ts';
import { TUNING } from '../../engine/combat/formulas.ts';
import { getDamageMod } from '../creature/creatureScaling.ts';
import { resolveCombatSpell } from '../../engine/spells/interpreter/item-triggers.ts';
import { racialSpells } from '../character/races.ts';
import { resolveSpellId, type SpellLookup } from '../character/spellbook.ts';

const BEAST = 1;        // CreatureType: hunter-tameable beasts
const FOCUS_MAX = 100;  // hunter pet Focus pool (SharedDefines POWER_FOCUS practice)
/** All hunter pets look up pet_levelstats creature_entry=1. Cite: Pet.cpp ~1263. */
export const HUNTER_PET_LEVELSTATS_ENTRY = 1;
/** Imp template entry — special AP formula (str-10). Cite: StatSystem.cpp ~905–908. */
const IMP_ENTRY = 416;

// ── Loyalty / happiness (CMaNGOS Pet.cpp) ───────────────────────────────────
/** REBELLIOUS=1 … BEST_FRIEND=6. Cite: Pet.cpp loyalty enum. */
export const LOYALTY_REBELLIOUS = 1;
export const LOYALTY_BEST_FRIEND = 6;
/** Points to exceed for loyalty level-up, index loyalty-1. Cite: Pet.cpp LevelUpLoyalty. */
export const LEVEL_UP_LOYALTY = [5500, 11500, 17000, 23500, 31000, 39500] as const;
/** Points set when entering a loyalty level, index loyalty-1. Cite: Pet.cpp LevelStartLoyalty. */
export const LEVEL_START_LOYALTY = [2000, 4500, 7000, 10000, 13500, 17500] as const;
/** Display names for loyalty 1..6. */
export const LOYALTY_NAMES = [
  '', 'Rebellious', 'Unruly', 'Submissive', 'Dependable', 'Faithful', 'Best Friend',
] as const;
// Happiness bar range. Vanilla stores POWER_HAPPINESS on a raw 0..1,050,000 scale; we mirror the
// client's ÷1000 display, so a feed is +35 a bite and a mood band is 333.
export const HAPPINESS_MAX = 1000;
// Raw UNIT_FIELD_POWER5 units per display point. Dismiss Pet 2641 drains 50000 raw → 50 display,
// "reduce its happiness by 50". Cite: Pet.h HAPPINESS_LEVEL_SIZE 333000.
export const HAPPINESS_RAW_PER_DISPLAY = 1000;
/** One mood band = HAPPINESS_LEVEL_SIZE (333000 raw ÷1000). Thresholds sit at 333 / 666. */
export const HAPPINESS_LEVEL_SIZE = 333;
/** Death happiness loss = one full band (−HAPPINESS_LEVEL_SIZE). Cite: Pet.cpp ~618. */
export const HAPPINESS_DEATH_LOSS = HAPPINESS_LEVEL_SIZE;
/** LooseHappiness period (seconds). Cite: Pet.cpp ~731. */
const HAPPINESS_DECAY_PERIOD_S = 7.5;
/** TickLoyaltyChange period (seconds). Cite: Pet.cpp ~839. */
const LOYALTY_TICK_PERIOD_S = 12;

// Happiness damage mult from Pet::GetConditionalTotalPhysicalDamageModifier. We store 0..1000, so
// the CMaNGOS 333k / 666k thresholds are 333 and 666. Cite: Pet.cpp GetHappinessState ~863.
export function happinessDamageMult(happiness: number): number {
  const h = Math.max(0, Math.min(HAPPINESS_MAX, happiness));
  if (h < HAPPINESS_LEVEL_SIZE) return 0.75;       // UNHAPPY (< 333)
  if (h >= HAPPINESS_LEVEL_SIZE * 2) return 1.25;  // HAPPY   (>= 666)
  return 1.0;                                      // CONTENT
}

/** GetHappinessState on the 0..1000 scale (thresholds 333 / 666). Cite: Pet.cpp GetHappinessState ~863. */
export function happinessState(happiness: number): 'unhappy' | 'content' | 'happy' {
  const h = Math.max(0, Math.min(HAPPINESS_MAX, happiness));
  if (h < HAPPINESS_LEVEL_SIZE) return 'unhappy';
  if (h >= HAPPINESS_LEVEL_SIZE * 2) return 'happy';
  return 'content';
}

/** Whether this pet uses happiness (hunter beasts). Warlock demons do not. */
export function petHasHappiness(cdef: CreatureDef): boolean {
  return cdef.creatureType === BEAST || !!cdef.tameable;
}

// Apply POWER_DRAIN with POWER_HAPPINESS to a pet's display-scale bar, as ModifyPower does before
// EffectDismissPet unsummons. Amounts arrive already ÷1000. Cite: SpellEffects.cpp:1750.
export function applyPetHappinessPowerDrains(
  pet: PetState,
  effects: ReadonlyArray<{ kind: string; powerType?: number; min?: number; max?: number }>,
): PetState {
  let h = pet.happiness;
  let changed = false;
  for (const e of effects) {
    if (e.kind !== 'power_drain' || ((e.powerType ?? 0) | 0) !== 4) continue;
    // Fixed DBC range (min==max for 2641); take max of the rolled range.
    const amount = Math.max(0, Math.trunc(Math.max(e.min ?? 0, e.max ?? 0)));
    if (amount <= 0) continue;
    h = Math.max(0, Math.min(HAPPINESS_MAX, h - amount));
    changed = true;
  }
  return changed ? { ...pet, happiness: h } : pet;
}

// LooseHappiness on the ÷1000 scale: (140>>loyalty)*0.125 per 7.5s; ×1.5 in combat. Cite: Pet.cpp
// LooseHappiness ~731 ((140>>L)*125 raw ÷1000).
export function decayHappiness(
  happiness: number,
  loyalty: number,
  seconds: number,
  inCombat: boolean,
): number {
  if (seconds <= 0) return Math.max(0, Math.min(HAPPINESS_MAX, happiness));
  const L = Math.max(LOYALTY_REBELLIOUS, Math.min(LOYALTY_BEST_FRIEND, loyalty | 0));
  // Per 7.5s on the ÷1000 scale: (140 >> L) * 125 / 1000 = (140 >> L) * 0.125
  let perPeriod = (140 >> L) * 0.125;
  if (inCombat) perPeriod *= 1.5;
  const loss = (perPeriod / HAPPINESS_DECAY_PERIOD_S) * seconds;
  return Math.max(0, Math.min(HAPPINESS_MAX, happiness - loss));
}

// Owner XP required to clear the loyalty level-up gate: GetXPForLevel * 5/100. Returns undefined when the
// XP table has no row (do not invent). Cite: Pet.cpp ~742.
export function loyaltyXpForOwnerLevel(ownerLevel: number, ds: DataStore): number | undefined {
  const xp = ds.xpToNext(ownerLevel);
  if (!Number.isFinite(xp)) return undefined;
  return Math.floor((xp * 5) / 100);
}

/** KillLoyaltyBonus(level): ((100-level)/10) + (6-loyalty), integer. Cite: Pet.cpp ~853. */
export function killLoyaltyBonus(petLevel: number, loyalty: number): number {
  const level = Math.max(1, Math.min(100, petLevel | 0));
  const L = Math.max(LOYALTY_REBELLIOUS, Math.min(LOYALTY_BEST_FRIEND, loyalty | 0));
  return Math.floor((100 - level) / 10) + (6 - L);
}

// ModifyLoyalty: add points, then level up or down with TP ± petLevel and a start-points reset.
// Rebellion clamps points at 0 — there is no abandon AI. Cite: Pet.cpp ~766.
export function modifyLoyalty(
  pet: PetState,
  delta: number,
  petLevel: number,
  ownerXpForLevel?: number,
): PetState {
  let loyalty = Math.max(LOYALTY_REBELLIOUS, Math.min(LOYALTY_BEST_FRIEND, (pet.loyalty ?? LOYALTY_REBELLIOUS) | 0));
  let points = (pet.loyaltyPoints ?? 0) + delta;
  let tp = pet.trainingPoints ?? 0;
  let xpReq = pet.loyaltyXpRequired;

  const setRequiredXp = (): number | undefined => {
    if (ownerXpForLevel != null && Number.isFinite(ownerXpForLevel)) {
      return Math.floor((ownerXpForLevel * 5) / 100);
    }
    return 0; // table missing: do not invent XP; unlock gate so points-only progress still works
  };

  if (points < 0) {
    if (loyalty > LOYALTY_REBELLIOUS) {
      loyalty -= 1;
      points = LEVEL_START_LOYALTY[loyalty - 1]!;
      tp = tp - petLevel; // SetTP is signed — tame debt persists. Cite: Pet.cpp:788/:976.
      xpReq = setRequiredXp();
    } else {
      // Minimal rebellion: clamp at 0; full abandon/aggressive AI is out of scope.
      points = 0;
    }
  } else if (
    loyalty < LOYALTY_BEST_FRIEND
    && points > LEVEL_UP_LOYALTY[loyalty - 1]!
    && (xpReq ?? 0) <= 0
  ) {
    loyalty += 1;
    points = LEVEL_START_LOYALTY[loyalty - 1]!;
    tp = tp + petLevel;
    xpReq = setRequiredXp();
  }

  return {
    ...pet,
    loyalty,
    loyaltyPoints: points,
    trainingPoints: tp,
    loyaltyXpRequired: xpReq,
  };
}

// TickLoyaltyChange over `seconds` (out-of-combat regen). Amount per 12s from happiness state: HAPPY +20,
// CONTENT +10, UNHAPPY −20. Fractional ticks: amount * seconds/12. Cite: Pet.cpp TickLoyaltyChange ~839.
export function tickLoyalty(
  pet: PetState,
  seconds: number,
  petLevel: number,
  ownerXpForLevel?: number,
): PetState {
  if (seconds <= 0) return pet;
  const st = happinessState(pet.happiness);
  const perTick = st === 'happy' ? 20 : st === 'content' ? 10 : -20;
  const delta = (perTick * seconds) / LOYALTY_TICK_PERIOD_S;
  return modifyLoyalty(pet, delta, petLevel, ownerXpForLevel);
}

// Apply kill XP toward the loyalty-XP gate, then KillLoyaltyBonus. Cite: Pet.cpp GivePetXP ~1087;
// UpdateRequireXpForNextLoyaltyLevel ~758.
export function applyKillLoyalty(
  pet: PetState,
  killXp: number,
  petLevel: number,
  ownerXpForLevel?: number,
): PetState {
  const xp = Math.max(0, Math.round(killXp));
  const req = Math.max(0, (pet.loyaltyXpRequired ?? 0) - xp);
  const withXp: PetState = { ...pet, loyaltyXpRequired: req };
  const bonus = killLoyaltyBonus(petLevel, withXp.loyalty ?? LOYALTY_REBELLIOUS);
  return modifyLoyalty(withXp, bonus, petLevel, ownerXpForLevel);
}

// GetTPForSpell: basetrainp − max already-spent TP in the same name chain. Cite: Pet.cpp GetTPForSpell
// ~916.
export function tpForSpell(spellId: number, knownPetSpellIds: readonly number[], ds: DataStore): number {
  const base = ds.petAbilityTP(spellId);
  if (base === 0) return 0;
  const target = ds.spell(spellId);
  if (!target) return base;
  let spent = 0;
  for (const id of knownPetSpellIds) {
    const s = ds.spell(id);
    if (!s || s.name !== target.name) continue;
    const tp = ds.petAbilityTP(id);
    if (tp > spent) spent = tp;
  }
  return base - spent;
}

// Cumulative TP a known set has consumed: the chain max per name, since GetTPForSpell charges
// base(rank) − spent(chain). Cite: Pet.cpp GetTPForSpell ~916; InitPetCreateSpells ~1990.
export function tpSpentOnKnown(ids: readonly number[], ds: DataStore): number {
  const byName = new Map<string, number>();
  for (const id of ids) {
    const tp = ds.petAbilityTP(id);
    if (tp <= 0) continue;
    const name = ds.spell(id)?.name ?? `#${id}`;
    if (tp > (byName.get(name) ?? 0)) byName.set(name, tp);
  }
  let sum = 0;
  for (const v of byName.values()) sum += v;
  return sum;
}

// True when `repertoire` already holds `spellId` or its LEARN_PET_SPELL / LEARN_SPELL live rank.
// CheckLearning rolls urand(0,100) < 10 per pet cast for the owner to learn it. Cite: Pet.cpp:2001.
export function petRepertoireHas(
  repertoire: readonly number[],
  spellId: number,
  ds: SpellLookup,
): boolean {
  const live = resolveSpellId(spellId, ds);
  return repertoire.some((id) => id === spellId || id === live || resolveSpellId(id, ds) === live);
}

export function checkPetLearning(
  pet: PetState,
  repertoire: readonly number[],
  petCastIds: readonly number[],
  rng: Rng,
  ds: DataStore,
): { pet: PetState; learnedIds: number[] } {
  const queue = pet.teachSpells;
  if (!queue || queue.length === 0 || petCastIds.length === 0) return { pet, learnedIds: [] };
  const remaining = [...queue];
  const known = new Set(repertoire);
  const learnedIds: number[] = [];
  for (const cast of petCastIds) {
    const live = resolveSpellId(cast, ds);
    const i = remaining.findIndex((id) => id === cast || resolveSpellId(id, ds) === live);
    if (i < 0) continue;
    if (known.has(cast) || known.has(live) || petRepertoireHas([...known], live, ds)) {
      remaining.splice(i, 1);
      continue;
    }
    if (rng.int(0, 100) >= 10) continue;
    remaining.splice(i, 1);
    known.add(live);
    if (ds.spell(live)) learnedIds.push(live);
  }
  if (remaining.length === queue.length) return { pet, learnedIds };
  return {
    pet: { ...pet, teachSpells: remaining.length ? remaining : undefined },
    learnedIds,
  };
}

// HasTPForSpell. Cite: Pet.cpp HasTPForSpell ~916. True when need==0 or (need>=0 and trainingPoints >=
// need).
export function hasTpForSpell(
  pet: PetState,
  spellId: number,
  knownPetSpellIds: readonly number[],
  ds: DataStore,
): boolean {
  const need = tpForSpell(spellId, knownPetSpellIds, ds);
  return !(((pet.trainingPoints ?? 0) - need < 0 || need < 0) && need !== 0);
}

// SPELL_EFFECT_LEARN_PET_SPELL (57): SetTP(GetTPForSpell) then store the live rank in petSpells. Cite:
// SpellEffects.cpp:3386–3404 EffectLearnPetSpell; Pet.cpp GetTPForSpell ~916.
export function applyLearnPetSpellCast(
  char: Character,
  spellId: number,
  ds: DataStore,
): { ok: true; char: Character; needTp: number; spell: SpellDef; liveId: number } | { ok: false; reason: string } {
  const pet = char.pet;
  if (!pet) return { ok: false, reason: 'You have no pet' };
  if (pet.health <= 0) return { ok: false, reason: 'Your pet is dead' };
  const liveId = resolveSpellId(spellId, ds);
  const spell = ds.spell(liveId);
  if (!spell) return { ok: false, reason: 'Unknown ability' };

  const known = char.petSpells ?? [];
  if (petRepertoireHas(known, liveId, ds)) {
    return { ok: true, char, needTp: 0, spell, liveId };
  }

  const petDef = ds.creature(pet.creature);
  const taught = petDef ? petTaughtIds(char, petDef) : known;
  const needTp = tpForSpell(liveId, taught, ds);
  return {
    ok: true,
    needTp,
    spell,
    liveId,
    char: {
      ...char,
      pet: {
        ...pet,
        // Signed like SetTP — a 0-clamp would erase innate tame debt on a free teach.
        trainingPoints: (pet.trainingPoints ?? 0) - needTp,
      },
      petSpells: [...known, liveId],
    },
  };
}

/** FoodType display names, index foodType-1. Cite: SharedDefines.h PetDiet / item FoodType. */
export const FOOD_TYPE_NAMES = [
  'Meat', 'Fish', 'Cheese', 'Bread', 'Fungus', 'Fruit', 'Raw Meat', 'Raw Fish',
] as const;

// Anything a pet could conceivably be fed: the canonical item_template.FoodType marker (enrich-pet-diet),
// with the legacy consumable shape as fixture/seed fallback.
export function isPetFood(itemDef: ItemDef): boolean {
  return (itemDef.foodType ?? 0) > 0 || itemDef.consumable?.effect === 'food';
}

// HaveInDiet: family PetFoodMask & (1<<(FoodType-1)). Cite: Pet.cpp HaveInDiet ~1424. When the creature has
// no baked mask (fixtures / pre-diet bakes), any pet food passes.
export function petDiet(cdef: CreatureDef, itemDef: ItemDef): boolean {
  const mask = cdef.petFoodMask;
  if (mask != null && mask > 0) {
    const ft = itemDef.foodType ?? 0;
    return ft > 0 && (mask & (1 << (ft - 1))) !== 0;
  }
  return isPetFood(itemDef);
}

/** The food-type names a pet's family eats (["Meat", "Fish"]), for the Feed UI. */
export function petDietNames(cdef: CreatureDef): string[] {
  const mask = cdef.petFoodMask ?? 0;
  if (mask <= 0) return [];
  return FOOD_TYPE_NAMES.filter((_, i) => (mask & (1 << i)) !== 0);
}

// GetCurrentFoodBenefitLevel on the ÷1000 scale (35000/17000/8000 → 35/17/8) — the PER-TICK (per-bite)
// happiness a feeding energizes. Cite: Pet.cpp GetCurrentFoodBenefitLevel ~1442.
export function foodBenefit(petLevel: number, foodItemLevel: number): number {
  if (petLevel <= foodItemLevel + 5) return 35;
  if (petLevel <= foodItemLevel + 10) return 17;
  if (petLevel <= foodItemLevel + 14) return 8;
  return 0;
}

// Feed Pet 1539 ticks: 20000 ms duration over a 2000 ms amplitude, energizing happiness by the
// food benefit each tick. Cite: SpellEffects.cpp EffectFeedPet ~4699; spell_template 1539.
export const FEED_PET_TICKS = 10;
/** The eat lasts 20s; PetState.feedRemaining is absorbed at gain/20 per second OOC. */
export const FEED_PET_DURATION_S = 20;

/** Total happiness one feeding restores (350 / 170 / 80 = per-bite benefit × 10 bites). */
export function feedPetHappinessGain(petLevel: number, foodItemLevel: number): number {
  return foodBenefit(petLevel, foodItemLevel) * FEED_PET_TICKS;
}

// Auto-feed tops happiness back up to this level. A feeding restores exactly `gain`, so we hold
// off until happiness has dropped by that much and the food lands with no overcap waste.
export const AUTO_FEED_TARGET = 980;

// The happiness at or below which auto-feed should fire for a food worth `gain`: target − gain,
// clamped to [0, target]. The "should I fire" decision lives in game.ts.
export function autoFeedThreshold(gain: number, target = AUTO_FEED_TARGET): number {
  if (gain <= 0) return 0;
  return Math.max(0, Math.min(target, target - gain));
}

// Absorb an in-progress feeding over `seconds`, returning the pet unchanged when it is not eating.
// Eating is OOC-only: spell 1539's AuraInterruptFlags cancel it, and game.ts clears the fields.
export function tickFeeding(pet: PetState, seconds: number): PetState {
  const rem = pet.feedRemaining ?? 0;
  if (rem <= 0 || seconds <= 0) return pet;
  const perSec = pet.feedPerSec ?? rem / FEED_PET_DURATION_S;
  const eaten = Math.min(rem, perSec * seconds);
  const left = rem - eaten;
  return {
    ...pet,
    happiness: Math.min(HAPPINESS_MAX, pet.happiness + eaten),
    feedRemaining: left > 1e-9 ? left : undefined,
    feedPerSec: left > 1e-9 ? pet.feedPerSec : undefined,
  };
}

// Sourced combat profile from Pet::InitStatsForLevel when pet_levelstats is present. Family scale
// is visual only, never applied to HP or damage. Cite: Pet.cpp InitStatsForLevel ~1199–1398.
export interface PetInitStats {
  maxHealth: number;
  armor: number;
  /** Base weapon min (before happiness total mult). */
  weaponMin: number;
  weaponMax: number;
  attackPower: number;
  powerType: PowerType;
  maxPower: number;
  attackTimeMs: number;
  /** pet_levelstats base stamina (sourced only) — the knee for stamina-buff HP folds. */
  stamina?: number;
  /** pet_levelstats intellect (for OCT mana regen / weapon skill bonuses). */
  intellect?: number;
  /** pet_levelstats spirit (for OCTRegenMPPerSpirit mana regen). */
  spirit?: number;
  /** creature UnitClass / classId for OCTRegenMPPerSpirit. */
  classId?: number;
  /** True when numbers came from pet_levelstats + InitStats formulas. */
  sourced: boolean;
}

// Melee AP for hunter/summon pets after create stats are set. Imp: str−10; all other pets: 2×str−20. Cite:
// StatSystem.cpp Pet::UpdateAttackPowerAndDamage ~905–908.
export function petMeleeAttackPower(strength: number, creatureEntry: number): number {
  if (creatureEntry === IMP_ENTRY) return strength - 10;
  return 2 * strength - 20;
}

// Hunter base weapon damage before AP layer / happiness. mDmg = (attackTimeMs * petlevel) / 2000; min =
// mDmg − mDmg/4; max = min×1.5. Cite: Pet.cpp ~1272–1277.
export function hunterPetBaseWeaponDamage(attackTimeMs: number, petLevel: number): { min: number; max: number } {
  const mDmg = (attackTimeMs * petLevel) / 2000;
  const min = mDmg - mDmg / 4;
  return { min, max: min * 1.5 };
}

// Summon pet base weapon damage from CLS + template multipliers, or Min/Max template interp. Cite: Pet.cpp
// ~1312–1332.
export function summonPetBaseWeaponDamage(
  cdef: CreatureDef,
  petLevel: number,
  ds: DataStore,
): { min: number; max: number } {
  const sc = cdef.scaling;
  const unitClass = sc?.unitClass ?? 1;
  const cls = ds.creatureClassLvlStats(petLevel, unitClass);
  const atkMs = (sc?.meleeBaseAttackTime || cdef.attackTimeMs || 2000);
  if (cls) {
    const variance = sc?.damageVariance ?? 1;
    const dmgMult = sc?.damageMultiplier ?? 1;
    const rank = sc?.rank ?? 0;
    let minDmg =
      (cls.baseDamage * variance + (cls.baseMeleeAttackPower / 14) * (atkMs / 1000)) * dmgMult;
    minDmg *= getDamageMod(rank);
    return { min: minDmg, max: minDmg * 1.5 };
  }
  // Template fallback when CLS missing for UnitClass/level.
  const minLevel = Math.max(1, sc?.minLevel ?? cdef.level ?? 1);
  const maxLevel = Math.max(minLevel, sc?.maxLevel ?? cdef.level ?? minLevel);
  const minMelee = sc?.minMeleeDmg ?? cdef.dmgMin;
  const maxMelee = sc?.maxMeleeDmg ?? cdef.dmgMax;
  const dMinLevel = minMelee / minLevel;
  const dMaxLevel = maxMelee / maxLevel;
  const mDmg = (dMaxLevel - (dMaxLevel - dMinLevel) / 2) * petLevel;
  const min = mDmg - mDmg / 4;
  return { min, max: min * 1.5 };
}

// Pet::InitStatsForLevel for the active owner level. Returns sourced stats when pet_levelstats is in the
// bundle; otherwise a legacy fallback (fixtures / pre-3A saves).
export function petInitStats(char: Character, cdef: CreatureDef, ds: DataStore): PetInitStats {
  const petLevel = Math.max(1, Math.min(60, char.level | 0));
  const attackTimeMs = (cdef.attackTimeMs || cdef.scaling?.meleeBaseAttackTime || 2000);
  const hunter = petHasHappiness(cdef);

  if (hunter) {
    const info = ds.petLevelStats(HUNTER_PET_LEVELSTATS_ENTRY, petLevel);
    if (info) {
      const wpn = hunterPetBaseWeaponDamage(attackTimeMs, petLevel);
      const ap = petMeleeAttackPower(info.str, HUNTER_PET_LEVELSTATS_ENTRY);
      return {
        maxHealth: Math.max(1, info.hp),
        armor: info.armor,
        weaponMin: wpn.min,
        weaponMax: wpn.max,
        attackPower: Math.max(0, ap),
        powerType: 'focus',
        maxPower: FOCUS_MAX,
        attackTimeMs,
        stamina: info.sta,
        intellect: info.inte,
        spirit: info.spi,
        classId: cdef.scaling?.unitClass ?? 1,
        sourced: true,
      };
    }
  } else {
    // SUMMON_PET path — warlock demons etc. Cite: Pet.cpp ~1297–1350.
    const info = ds.petLevelStats(cdef.entry, petLevel);
    if (info) {
      const wpn = summonPetBaseWeaponDamage(cdef, petLevel, ds);
      const ap = petMeleeAttackPower(info.str, cdef.entry);
      const mana = Math.max(0, info.mana);
      return {
        maxHealth: Math.max(1, info.hp),
        armor: info.armor,
        weaponMin: wpn.min,
        weaponMax: wpn.max,
        attackPower: Math.max(0, ap),
        powerType: mana > 0 ? 'mana' : (cdef.creatureType === BEAST || cdef.tameable ? 'focus' : 'mana'),
        maxPower: mana > 0 ? mana : (cdef.creatureType === BEAST || cdef.tameable ? FOCUS_MAX : 0),
        attackTimeMs,
        stamina: info.sta,
        intellect: info.inte,
        spirit: info.spi,
        classId: cdef.scaling?.unitClass ?? (mana > 0 ? 8 : 1),
        sourced: true,
      };
    }
  }

  // Legacy fallback when pet_levelstats absent (fixtures / pre-enrich bakes).
  // Do not invent DB rows — keep prior owner-fraction + template dmg behaviour.
  return legacyPetInitStats(char, cdef, ds, attackTimeMs);
}

function legacyPetInitStats(
  char: Character,
  cdef: CreatureDef,
  ds: DataStore,
  attackTimeMs: number,
): PetInitStats {
  const maxHp = Math.max(1, Math.round(maxHealth(char, ds) * TUNING.petHealthFrac));
  const hunter = petHasHappiness(cdef);
  if (cdef.mana && cdef.mana > 0) {
    const maxPower = cdef.mana + Math.max(0, char.level - 1) * TUNING.petManaPerLevel;
    return {
      maxHealth: maxHp,
      armor: cdef.armor,
      weaponMin: cdef.dmgMin,
      weaponMax: cdef.dmgMax,
      attackPower: 0,
      powerType: 'mana',
      maxPower,
      attackTimeMs,
      intellect: 20,
      spirit: 20,
      classId: cdef.scaling?.unitClass ?? 8,
      sourced: false,
    };
  }
  if (hunter) {
    return {
      maxHealth: maxHp,
      armor: cdef.armor,
      weaponMin: cdef.dmgMin,
      weaponMax: cdef.dmgMax,
      attackPower: 0,
      powerType: 'focus',
      maxPower: FOCUS_MAX,
      attackTimeMs,
      sourced: false,
    };
  }
  return {
    maxHealth: maxHp,
    armor: cdef.armor,
    weaponMin: cdef.dmgMin,
    weaponMax: cdef.dmgMax,
    attackPower: 0,
    powerType: 'mana',
    maxPower: 0,
    attackTimeMs,
    sourced: false,
  };
}

// A pet's maximum health for OOC clamp and heal paths: InitStats create HP plus family and taught
// passives. Without the fold, Call Pet clipped a trained pet to base HP (KI-488).
export function petMaxHealth(char: Character, ds: DataStore): number {
  // Active pet preferred; dismissed pet still has a real max for Call Pet / revive clamps.
  const pet = char.pet ?? char.storedPet;
  if (!pet) {
    // No pet at all — legacy fallback for callers that pass a hypothetical owner.
    return Math.max(1, Math.round(maxHealth(char, ds) * TUNING.petHealthFrac));
  }
  const cdef = ds.creature(pet.creature);
  if (!cdef) return Math.max(1, Math.round(maxHealth(char, ds) * TUNING.petHealthFrac));
  // petTaughtIds / petLearnedGenericPassives read char.pet; when only storedPet is set,
  // present a view so taught Great Stamina / Hardiness still fold into max HP.
  const view: Character = char.pet ? char : { ...char, pet };
  const init = petInitStats(view, cdef, ds);
  // Same fold order as buildPet (family first, then taught generics). Attack power is
  // pass-through for maxHealth; happiness only scales weapon/AP, not HP.
  const familyFold = applyPetFamilyPassives(
    { maxHealth: init.maxHealth, armor: init.armor, attackPower: init.attackPower },
    cdef,
    ds,
    init.stamina,
  );
  const passive = applyPetPassiveEffects(
    familyFold,
    petLearnedGenericPassives(view, cdef, ds),
    init.stamina,
  );
  return passive.maxHealth;
}

// A pet's resource type + max for THIS owner (InitStats mana / fixed focus). `petPowerSpec` is the
// creature-only view; this is level-aware.
export function petPowerSpec(cdef: CreatureDef): { powerType: PowerType; maxPower: number } {
  if (cdef.mana && cdef.mana > 0) return { powerType: 'mana', maxPower: cdef.mana };
  if (cdef.creatureType === BEAST || cdef.tameable) return { powerType: 'focus', maxPower: FOCUS_MAX };
  return { powerType: 'mana', maxPower: 0 };
}

export function petMaxPower(char: Character, cdef: CreatureDef, ds?: DataStore): { powerType: PowerType; maxPower: number } {
  if (ds) {
    const init = petInitStats(char, cdef, ds);
    return { powerType: init.powerType, maxPower: init.maxPower };
  }
  // Legacy path for tests that omit DataStore levelstats.
  const spec = petPowerSpec(cdef);
  if (spec.powerType === 'mana' && spec.maxPower > 0) {
    return { powerType: 'mana', maxPower: spec.maxPower + Math.max(0, char.level - 1) * TUNING.petManaPerLevel };
  }
  return spec;
}

/** The active pet's resource (type + max), or null when there's no living pet — for the HUD. */
export function petPower(char: Character, ds: DataStore): { powerType: PowerType; maxPower: number; power: number } | null {
  const pet = char.pet;
  if (!pet || pet.health <= 0) return null;
  const cdef = ds.creature(pet.creature);
  if (!cdef) return null;
  const { powerType, maxPower } = petMaxPower(char, cdef, ds);
  const power = pet.power != null ? Math.max(0, Math.min(maxPower, pet.power)) : maxPower;
  return { powerType, maxPower, power };
}

// The ability ids feeding a pet's kit, per the vanilla split: a hunter pet's own taughtSpells,
// a demon's character-wide petSpells. A beast that is not this character's pet was taught nothing.
export function petTaughtIds(char: Character, cdef: CreatureDef): readonly number[] {
  if (!petHasHappiness(cdef)) return char.petSpells ?? [];
  const pet = char.pet;
  if (!pet || pet.creature !== cdef.entry) return [];
  return pet.taughtSpells ?? char.petSpells ?? [];
}

// GivePetLevel's training-point grant, once per pet level: SetTP(m_TP + loyalty − 1). Pet level
// tracks owner level here. Hunter pets only — demons have no TP. Cite: Pet.cpp:1128–1141.
export function grantPetLevelTrainingPoints(
  pet: PetState | undefined,
  levels: number,
): PetState | undefined {
  if (!pet || levels <= 0 || pet.loyalty == null) return pet;
  const gain = Math.max(0, pet.loyalty - 1) * levels;
  if (gain === 0) return pet;
  return { ...pet, trainingPoints: (pet.trainingPoints ?? 0) + gain };
}

// Abilities the active pet can cast: the innate kit plus taught ranks, intersected with the
// creature's petSpells, highest LEVEL-ELIGIBLE rank per name. Generic-line passives are excluded.
export function petKnownSpells(char: Character, cdef: CreatureDef, ds: DataStore): SpellDef[] {
  const familyIds = new Set(cdef.petSpells ?? []);
  const generic = petHasHappiness(cdef) ? (ds.petGenericSpells?.() ?? []).map((g) => g.id) : [];
  const usable = [...familyIds, ...generic];
  if (usable.length === 0) return [];
  const known = new Set([...(cdef.petDefaultSpells ?? []), ...petTaughtIds(char, cdef)]);
  // LEARN_PET_SPELL stubs (7886 Firebolt R1) hop to the live rank 3110, so a repertoire still
  // holding the stub id matches the family catalog. Cite: SpellEffects.cpp:3386–3404.
  const knownLive = new Set<number>();
  for (const id of known) {
    knownLive.add(id);
    knownLive.add(resolveSpellId(id, ds));
  }
  // Hunter tames only: demon create-spells are added regardless of owner level, so a reqLevel
  // floor there empties Felhunter and Succubus at L10. Cite: Pet.cpp InitPetCreateSpells.
  const petLevel = petHasHappiness(cdef) ? Math.max(1, char.level | 0) : Infinity;
  const byName = new Map<string, SpellDef>();
  for (const rawId of usable) {
    const id = resolveSpellId(rawId, ds);
    if (!knownLive.has(rawId) && !knownLive.has(id)) continue;
    const s = ds.spell(id);
    if (!s) continue;
    // Trust family catalog over a lone ATTR_PASSIVE bit; drop generic-line passives only.
    if (s.passive && !familyIds.has(id) && !familyIds.has(rawId)) continue;
    // Same floor as teachPetSpell — unusable ranks stay out of kit and rank pick.
    if ((s.reqLevel ?? 0) > petLevel) continue;
    const prev = byName.get(s.name);
    if (!prev || s.rank > prev.rank) byName.set(s.name, s);
  }
  return [...byName.values()];
}

// Taught Pet-Generic PASSIVES (Great Stamina, Natural Armor, resistances): taught ids ∩
// petGenericSpells that are passive, highest rank per name. They fold into InitStats, not casts.
export function petLearnedGenericPassives(char: Character, cdef: CreatureDef, ds: DataStore): SpellDef[] {
  if (!petHasHappiness(cdef)) return [];
  const learned = new Set(petTaughtIds(char, cdef));
  if (learned.size === 0) return [];
  const byName = new Map<string, SpellDef>();
  for (const g of ds.petGenericSpells?.() ?? []) {
    const live = resolveSpellId(g.id, ds);
    if (!learned.has(g.id) && !learned.has(live)) continue;
    const s = ds.spell(live);
    if (!s?.passive) continue;
    const prev = byName.get(s.name);
    if (!prev || s.rank > prev.rank) byName.set(s.name, s);
  }
  return [...byName.values()];
}

// Autocast: a pet ability is on unless any rank of its name chain is in autocastOff, so learning
// a new rank keeps the toggle. Mirrors PetSpellMap ACT_ENABLED / ACT_DISABLED.
export function petAutocastOn(pet: PetState, spell: SpellDef, ds: DataStore): boolean {
  const off = pet.autocastOff;
  if (!off || off.length === 0) return true;
  if (off.includes(spell.id)) return false;
  return !off.some((id) => ds.spell(id)?.name === spell.name);
}

// Append TRIGGER_SPELL and aura-42 companions that known pet abilities fire. Outside name-rank
// dedup: Spell Lock's silence 24259 shares the name at rank 0 and would lose to r1.
export function petSpellsWithTriggers(known: SpellDef[], ds: DataStore): SpellDef[] {
  if (known.length === 0) return known;
  const have = new Set(known.map((s) => s.id));
  const extra: SpellDef[] = [];
  for (const s of known) {
    for (const e of s.effects) {
      let tid: number | undefined;
      if (e.kind === 'trigger_spell') tid = e.spellId;
      else if (e.kind === 'proc_trigger_spell') tid = e.triggerSpellId;
      if (tid == null || have.has(tid)) continue;
      const t = ds.spell(tid);
      if (!t) continue;
      extra.push(t);
      have.add(tid);
    }
  }
  return extra.length === 0 ? known : [...known, ...extra];
}

// Unit::GetHealthBonusFromStamina: first 20 stamina give 1 HP each, the rest 10 HP each. Cite:
// StatSystem.cpp ~144–150.
export function healthBonusFromStamina(stamina: number): number {
  const baseStam = Math.min(stamina, 20);
  return baseStam + (stamina - baseStam) * 10;
}

interface PetPassiveBase {
  maxHealth: number;
  armor: number;
  attackPower: number;
  resistances?: Partial<Record<School, number>>;
  mp5?: number;
}

// Fold passive SpellDefs' stat effects into base InitStats; empty or non-stat effects are skipped.
// Stamina buffs convert via GetHealthBonusFromStamina on top of the pet_levelstats base. Pure.
export function applyPetPassiveEffects(
  base: PetPassiveBase,
  spells: readonly SpellDef[],
  staBase?: number,
): PetPassiveBase {
  if (spells.length === 0) return base;

  let maxHealth = base.maxHealth;
  let armor = base.armor;
  let attackPower = base.attackPower;
  let resistances = base.resistances ? { ...base.resistances } : undefined;
  let mp5 = base.mp5;
  let sta = staBase ?? 20; // unknown base: all bonus stamina is past the 20-point knee

  for (const s of spells) {
    for (const e of s.effects) {
      if (e.kind === 'buff') {
        // Only mods with a direct CombatantSpec surface. STR/INT curves are not invented here.
        const amt = e.amount ?? 0;
        if (amt === 0) continue;
        if (e.mod === 'armor') armor += amt;
        else if (e.mod === 'attack_power') attackPower += amt;
        else if (e.mod === 'mp5') mp5 = (mp5 ?? 0) + amt;
        else if (e.mod === 'stamina') {
          maxHealth += healthBonusFromStamina(sta + amt) - healthBonusFromStamina(sta);
          sta += amt;
        }
      } else if (e.kind === 'resist') {
        const amt = e.amount ?? 0;
        if (amt === 0) continue;
        resistances = resistances ?? {};
        resistances[e.school] = (resistances[e.school] ?? 0) + amt;
      }
      // Empty effects, proc_trigger_spell, unmapped stat_mod — skip (do not fabricate).
    }
  }

  return {
    maxHealth: Math.max(1, Math.round(maxHealth)),
    armor,
    attackPower: Math.max(0, attackPower),
    ...(resistances && Object.keys(resistances).length > 0 ? { resistances } : {}),
    ...(mp5 != null && mp5 !== 0 ? { mp5 } : {}),
  };
}

/** Fold CreatureDef.petFamilyPassives’ stat-affecting effects into base InitStats. */
export function applyPetFamilyPassives(
  base: PetPassiveBase,
  cdef: CreatureDef,
  ds: DataStore,
  staBase?: number,
): PetPassiveBase {
  const ids = cdef.petFamilyPassives;
  if (!ids || ids.length === 0) return base;
  const defs: SpellDef[] = [];
  for (const id of ids) {
    const s = ds.spell(id);
    if (s) defs.push(s);
  }
  return applyPetPassiveEffects(base, defs, staBase);
}

// Fresh full-health PetState from a creature, with power full and hunter loyalty/TP defaults.
// Happiness starts at HAPPINESS_MAX for playability — a deliberate deviation from the 166k tame.
export function newPet(creature: number, ds: DataStore, char: Character): PetState | null {
  const cdef = ds.creature(creature);
  if (!cdef) return null;
  const init = petInitStats(char, cdef, ds);
  const base: PetState = {
    creature,
    name: cdef.name,
    health: init.maxHealth,
    // CMaNGOS hunter tame: 166500/1e6 ≈ 166 UNHAPPY — we keep HAPPINESS_MAX for playability.
    happiness: HAPPINESS_MAX,
    power: init.maxPower,
  };
  if (!petHasHappiness(cdef)) return base;
  const xpReq = loyaltyXpForOwnerLevel(char.level, ds);
  // InitPetCreateSpells: the innate kit charges its reqtrainpoints, so TP starts in debt, and
  // innate actives the owner has not learned queue as teachable. Cite: Pet.cpp:1955–1998.
  const innate = cdef.petDefaultSpells ?? [];
  const known = new Set(char.petSpells ?? []);
  const teachSpells = innate.filter((id) => {
    const s = ds.spell(id);
    return !!s && !s.passive && !known.has(id) && !known.has(resolveSpellId(id, ds));
  });
  return {
    ...base,
    loyalty: LOYALTY_REBELLIOUS,
    loyaltyPoints: 1000,
    trainingPoints: -tpSpentOnKnown(innate, ds),
    loyaltyXpRequired: xpReq ?? 0,
    // Fresh tames know only their innate kit — abilities from the character's Beast
    // Training repertoire are taught per-pet for TP (game.teachPetSpell).
    taughtSpells: [],
    teachSpells,
  };
}

/** Command racial ids: Warlock 20575 / Hunter 20576. Cite: playercreateinfo_spell. */
const ORC_COMMAND_SPELL_IDS = new Set([20575, 20576]);

// Owner permanent +% pet damage from Command racial (applyTo pet, duration 0). Race list shows 20575;
// createInfo grants 20575 (warlock) / 20576 (hunter). Cite: spell_template; races.json orc racials; KI-824.
function ownerCommandPetDamagePct(char: Character, ds: DataStore): number {
  if (char.race !== 2) return 0; // Orc only
  let best = 0;
  for (const id of ORC_COMMAND_SPELL_IDS) {
    const raw = ds.spell(id);
    if (!raw) continue;
    const sp = resolveCombatSpell(raw, { unitTargetIsPlayer: true });
    for (const e of sp.effects ?? []) {
      if (e.kind === 'buff' && e.mod === 'damage_done_pct' && e.applyTo === 'pet') {
        best = Math.max(best, e.amount | 0);
      }
    }
  }
  // Also fold display racial row (same effect) if not already covered.
  for (const s of racialSpells(ds, char.race)) {
    if (!ORC_COMMAND_SPELL_IDS.has(s.id)) continue;
    const sp = resolveCombatSpell(s, { unitTargetIsPlayer: true });
    for (const e of sp.effects ?? []) {
      if (e.kind === 'buff' && e.mod === 'damage_done_pct' && e.applyTo === 'pet') {
        best = Math.max(best, e.amount | 0);
      }
    }
  }
  return best;
}

// Party buffs the pet carries into this pull. A pet has no character sheet to fold them into, so each
// mod seeds as a live row (applyBuffMod) and resistances, which have no live row, go on the spec.
function carriedPetAuras(
  pet: PetState,
  level: number,
  ds: DataStore,
  now: number,
): {
  display: NonNullable<CombatantSpec['startDisplayAuras']>;
  resistances: Partial<Record<School, number>>;
} {
  const display: NonNullable<CombatantSpec['startDisplayAuras']> = [];
  const resistances: Partial<Record<School, number>> = {};
  for (const a of pruneExpiredAuras(pet.prePullAuras, now)) {
    const raw = ds.spell(a.spellId);
    if (!raw) continue;
    const sp = resolveCombatSpell(raw, { casterLevel: level });
    const liveBuffs: NonNullable<NonNullable<CombatantSpec['startDisplayAuras']>[number]['liveBuffs']> = [];
    for (const e of sp.effects) {
      if (e.kind === 'buff' && e.mod && !e.hostile && (e.amount ?? 0) !== 0) {
        liveBuffs.push({ mod: e.mod, amount: e.amount, ...(e.school ? { school: e.school } : {}) });
      } else if (e.kind === 'resist' && (e.amount ?? 0) !== 0) {
        resistances[e.school] = (resistances[e.school] ?? 0) + e.amount;
      }
    }
    const permanent = a.expiresAt == null;
    display.push({
      spellId: sp.id,
      name: sp.name,
      ...(permanent ? { permanent: true } : { remainingMs: Math.max(0, a.expiresAt! - now) }),
      ...(liveBuffs.length > 0 ? { liveBuffs } : {}),
    });
  }
  return { display, resistances };
}

// Combat-ready spec for the living pet, or null. Level follows the owner, HP and damage come from
// InitStats, and happiness applies 0.75 / 1 / 1.25 to physical damage. Power persists between fights.
export function buildPet(char: Character, ds: DataStore): CombatantSpec | null {
  const pet = char.pet;
  if (!pet || pet.health <= 0) return null;
  const cdef = ds.creature(pet.creature);
  if (!cdef) return null;
  const init = petInitStats(char, cdef, ds);
  const happy = petHasHappiness(cdef) ? happinessDamageMult(pet.happiness ?? HAPPINESS_MAX) : 1;
  // Happiness multiplies total physical (weapon + AP). Cite: StatSystem.cpp ~930–951.
  const happyAp = Math.max(0, Math.round(init.attackPower * happy));
  const familyFold = applyPetFamilyPassives(
    { maxHealth: init.maxHealth, armor: init.armor, attackPower: happyAp },
    cdef,
    ds,
    init.stamina,
  );
  // Trainer-taught generic passives (Pet Hardiness → HP via stamina, Pet Resistance → armor…)
  // stack on the family fold; stamina knee advances past any family stamina already applied.
  const passive = applyPetPassiveEffects(
    familyFold,
    petLearnedGenericPassives(char, cdef, ds),
    init.stamina,
  );
  // Party buffs the pet is carrying in from the last pull / the zone-in "Buff up".
  const carried = carriedPetAuras(pet, char.level, ds, Date.now());
  const petResists = { ...(passive.resistances ?? {}) };
  for (const [school, amt] of Object.entries(carried.resistances)) {
    petResists[school as School] = (petResists[school as School] ?? 0) + (amt ?? 0);
  }
  const startPower =
    pet.power != null
      ? Math.max(0, Math.min(init.maxPower, pet.power))
      : init.maxPower;
  // Autocast: right-click-disabled abilities stay learned but the AI never picks them. The full kit
  // rides along so the bar can flip one on mid-fight without rebuilding the spec.
  const fullKit = petKnownSpells(char, cdef, ds);
  const known = fullKit.filter((s) => petAutocastOn(pet, s, ds));
  // Owner Command racial (+5% pet damage). Cite: spell_template 20575/20576; KI-824.
  const ownerPetDmgPct = ownerCommandPetDamagePct(char, ds);
  return {
    name: pet.name,
    petFullKit: fullKit,
    // Player-controlled, same as its owner. Cite: the field's own contract, types.ts:311.
    isPlayerOrPet: true,
    level: char.level,
    maxHealth: passive.maxHealth,
    startHealth: Math.min(pet.health, passive.maxHealth),
    powerType: init.powerType,
    maxPower: init.maxPower,
    startPower,
    armor: passive.armor,
    weapon: {
      dmgMin: Math.max(1, Math.round(init.weaponMin * happy)),
      dmgMax: Math.max(2, Math.round(init.weaponMax * happy)),
      speedMs: init.attackTimeMs,
      school: 'physical',
    },
    attackPower: passive.attackPower,
    critChance: TUNING.baseCritChance,
    hitChance: TUNING.meleeHitChance,
    haste: 0,
    canParry: false,
    canBlock: false,
    ...(init.intellect != null ? { intellect: init.intellect } : {}),
    ...(init.spirit != null ? { spirit: init.spirit } : {}),
    ...(init.classId != null ? { classId: init.classId } : {}),
    // Carry the creature identity so scripted effects can key off it — CC immunity (creatureType)
    // and warlock Demonic Sacrifice's per-demon buff (creatureEntry: Imp 416 / Succubus 1863 / …).
    ...(cdef.creatureType != null ? { creatureType: cdef.creatureType } : {}),
    creatureEntry: pet.creature,
    ...(Object.keys(petResists).length > 0 ? { resistances: petResists } : {}),
    ...(passive.mp5 != null ? { mp5: passive.mp5 } : {}),
    ...(ownerPetDmgPct
      ? { damagePctBySchool: { physical: ownerPetDmgPct, holy: ownerPetDmgPct, fire: ownerPetDmgPct, nature: ownerPetDmgPct, frost: ownerPetDmgPct, shadow: ownerPetDmgPct, arcane: ownerPetDmgPct } }
      : {}),
    // Pet bar state the fight opens with (the session owns it from here; 'attack' is a
    // one-shot order and never persists). Cite: Unit.h CommandStates / UnitAI.h ReactStates.
    petCommand: pet.command ?? 'follow',
    petReact: pet.react ?? 'defensive',
    // Triggers appended by id (outside name-rank dedup) so Spell Lock → 24259 silence works.
    spells: petSpellsWithTriggers(known, ds),
    ...(carried.display.length > 0 ? { startDisplayAuras: carried.display } : {}),
  };
}

/** True when a spell effect is APPLY_AREA_AURA_PARTY (baked applyTo:'party', non-hostile). */
function isPartyAreaBuffSpell(sp: SpellDef | undefined): boolean {
  return !!sp?.effects.some((e) => e.kind === 'buff' && e.applyTo === 'party' && !e.hostile);
}

// APPLY_AREA_AURA_PARTY spells on the living pet's autocast kit (Blood Pact, Furious Howl), which
// are permanent while it is out. Returns [] when the pet is absent or dead.
export function petPartyAuraSpellIds(char: Character, ds: DataStore): number[] {
  const built = buildPet(char, ds);
  if (!built) return [];
  const out: number[] = [];
  for (const sp of built.spells) {
    if (isPartyAreaBuffSpell(sp)) out.push(sp.id);
  }
  return out;
}

// Pet-repertoire party aura ids, used to strip orphan owner copies after an Imp→Voidwalker swap
// or after death, when buildPet is already null. Player party buffs are never in petSpells.
export function petRepertoirePartyAuraIds(char: Character, ds: DataStore): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const consider = (id: number) => {
    if (seen.has(id)) return;
    if (!isPartyAreaBuffSpell(ds.spell(id))) return;
    seen.add(id);
    out.push(id);
  };
  for (const id of char.petSpells ?? []) consider(id);
  for (const id of char.pet?.taughtSpells ?? []) consider(id);
  return out;
}

// Grant the owner permanent chips for pet party auras while the pet is out, so sheet maxHealth
// includes the +sta before the next pull (KI-066). Cite: AreaAura::Update party copies.
export function applyPetPartyAuras(char: Character, ds: DataStore, now: number = Date.now()): Character {
  if (!char.pet || char.pet.health <= 0) return char;
  const ids = petPartyAuraSpellIds(char, ds);
  if (ids.length === 0) return char;
  const beforeMax = maxHealth(char, ds);
  let next = char;
  for (const id of ids) {
    // durationMs undefined → permanent until dismiss/death (matches durationMs 0 combat path).
    next = applyAura(next, id, undefined, now, ds);
  }
  const afterMax = maxHealth(next, ds);
  // Stamina buffs raise current HP by the same delta (combat applyBuffMod stamina does this).
  if (afterMax > beforeMax) {
    next = { ...next, health: Math.min(afterMax, next.health + (afterMax - beforeMax)) };
  }
  return next;
}

// Drop owner auras that were pet party copies. Call while the pet is still on `char` so the kit is
// known, or pass explicit ids; a dead pet falls back to the repertoire auras still on the owner.
export function stripPetPartyAuras(
  char: Character,
  ds: DataStore,
  partySpellIds?: readonly number[],
  now: number = Date.now(),
): Character {
  let ids: number[];
  if (partySpellIds != null) {
    ids = [...partySpellIds];
  } else {
    const fromKit = petPartyAuraSpellIds(char, ds);
    // Dead/absent pet → kit empty; still drop repertoire orphans (Blood Pact after Imp death).
    ids = fromKit.length > 0 ? fromKit : petRepertoirePartyAuraIds(char, ds);
  }
  if (ids.length === 0) return char;
  const names = new Set<string>();
  for (const id of ids) {
    const n = ds.spell(id)?.name;
    if (n) names.add(n);
  }
  const drop = (spellId: number): boolean => {
    if (ids.includes(spellId)) return true;
    const sp = ds.spell(spellId);
    return !!(sp?.name && names.has(sp.name));
  };
  const prevAuras = char.activeAuras;
  const auras = (prevAuras ?? []).filter((a) => !drop(a.spellId));
  const legacyBuffs = (char.activeBuffs ?? []).filter((id) => !drop(id));
  if (
    auras.length === (prevAuras ?? []).length
    && legacyBuffs.length === (char.activeBuffs ?? []).length
  ) {
    return char;
  }
  const next: Character = {
    ...char,
    activeAuras: prevAuras !== undefined ? auras : undefined,
    activeBuffs: prevAuras !== undefined
      ? getActiveBuffIds({ ...char, activeAuras: auras }, now, ds)
      : legacyBuffs,
  };
  const cap = maxHealth(next, ds);
  if (next.health > cap) return { ...next, health: cap };
  return next;
}

// Align owner party-aura copies with the living pet's kit: strip what the current kit does not
// provide, apply what it does. A dead or absent pet strips them all. Cite: KI-555 / KI-589.
export function reconcilePetPartyAuras(
  char: Character,
  ds: DataStore,
  now: number = Date.now(),
): Character {
  const provide = petPartyAuraSpellIds(char, ds);
  const provideIds = new Set(provide);
  const provideNames = new Set<string>();
  for (const id of provide) {
    const n = ds.spell(id)?.name;
    if (n) provideNames.add(n);
  }
  // Repertoire party auras the living pet does not currently provide.
  const toStrip: number[] = [];
  for (const id of petRepertoirePartyAuraIds(char, ds)) {
    if (provideIds.has(id)) continue;
    const n = ds.spell(id)?.name;
    if (n && provideNames.has(n)) continue;
    toStrip.push(id);
  }
  let next = toStrip.length > 0 ? stripPetPartyAuras(char, ds, toStrip, now) : char;
  if (char.pet && char.pet.health > 0) {
    next = applyPetPartyAuras(next, ds, now);
  }
  return next;
}
