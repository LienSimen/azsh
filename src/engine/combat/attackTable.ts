// Classic 1.12 melee and ranged attack table, a port of the CalculateEffective* family: skill-based
// parity, dual-wield miss, crush and glance, rolled in the C++ die order with no renormalize. Pure.

import {
  skillMaxForLevel,
  SPELL_PARTIAL_RESIST_DISTRIBUTION,
  SPELL_PARTIAL_RESIST_PCT_100,
} from './mitigation.ts';

export { skillMaxForLevel };

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** Percent (0–100) → fraction (0–1). */
function pctToFrac(pct: number): number {
  return clamp(pct, 0, 100) / 100;
}

// ---- Types ------------------------------------------------------------------

// SpellRange.dbc indices the parry clause names. Cite: SharedDefines.h:489-490. 1 is range 0 (self), 2 is
// the dynamic melee combat range.
export const SPELL_RANGE_IDX = {
  SELF_ONLY: 1,
  COMBAT: 2,
} as const;

export type AttackResult =
  | 'miss'
  | 'dodge'
  | 'parry'
  // Deflect — the ability die's own side for the shapes parry refuses. The same chance as parry, with
  // only the reported outcome differing. Never on a white swing. Cite: Unit.cpp:2828-2851.
  | 'deflect'
  | 'block'
  | 'glancing'
  | 'crit'
  | 'crushing'
  /** Full avoid, 0 damage — SPELL_MISS_IMMUNE. Present so this union matches HitResult. */
  | 'immune'
  | 'hit';

export type AttackTypeKind = 'melee' | 'ranged';

export interface AttackContext {
  atkLevel: number;
  defLevel: number;
  /** Attacker's base crit as fraction 0..1 (sheet crit before skill vs defense). */
  baseCrit: number;
  /** Defender can parry (armed). Ignored for ranged (parry chance forced 0). */
  defenderParries: boolean;
  /** Defender can block (shield). */
  defenderBlocks: boolean;
  /** Base dodge chance 0..1 (pre skill-diff). Default 0.05. */
  defenderDodge?: number;
  /** Base parry chance 0..1 (pre skill-diff). Default 0.05 when defenderParries. */
  defenderParry?: number;
  /** Base block chance 0..1 (pre skill-diff). Default 0.05 when defenderBlocks. */
  defenderBlock?: number;
  // Absolute melee hit fraction (gear + base), e.g. 0.95 = no extra hit, 1.0 = +5% hit. Mapped to CMaNGOS
  // GetHitChance subtract: hitBonusPp = (attackerHit - 0.95) * 100. Absent → treat as 0.95 (no gear hit).
  attackerHit?: number;

  // Attacker weapon skill for this attack type. Default: skillMaxForLevel(atkLevel). Caps applied inside
  // formulas where C++ caps (glance caps weapon skill at attacker max).
  attackerWeaponSkill?: number;
  /** Defender defense skill. Default: skillMaxForLevel(defLevel). */
  defenderDefenseSkill?: number;

  // Player / player-controlled (pets, totems). Defaults: attacker true, defender false (player→NPC
  // fixtures). Glance only for player-controlled attackers; crush only for NPCs.
  attackerIsPlayerOrPet?: boolean;
  defenderIsPlayerOrPet?: boolean;

  /** Dual-wield auto path: +19% miss when CMaNGOS would apply it. */
  dualWield?: boolean;
  // Instant weapon ability (MeleeSpellHitResult land die + separate crit). No glance/crush; no DW +19%.
  // White and on-next-swing keep isAbility false.
  isAbility?: boolean;
  // SPELL_ATTR_EX3_CANT_MISS-shaped ability that takes the parry number on the DEFLECT side. Cite:
  // Unit.cpp:3377-3386 CanDeflectAbility.
  abilityDeflects?: boolean;
  completelyBlocked?: boolean;
  // Next-melee swing queued (Heroic Strike etc.): exempts DW +19% on the white swing even when isAbility is
  // false. Unit.cpp CalculateEffectiveMissChance ~3767.
  onNextSwing?: boolean;
  /** Melee (default) vs ranged — parry is always 0 on ranged. */
  attackType?: AttackTypeKind;
  // Victim aura 187 or 188, signed percentage points ADDED to the attacker's crit chance. Sleight of
  // Hand ships -2, so it subtracts. Cite: Unit.cpp:3744-3746 GetCritTakenChance.
  defenderCritTakenPp?: number;
  // Victim aura 185, signed percentage points SUBTRACTED from the attacker's miss chance, so a
  // negative amount raises miss. The melee twin has no source in this tree and is not wired.
  defenderHitTakenPp?: number;
  // CLASSMASK_WAND_USERS glance-chance special (pre-30 curve). Default false. Only wire when class is
  // known; unit-tested branch.
  wandUser?: boolean;
  // Caster glance *amount* bases (CLASSMASK_WAND_USERS). Default false. Unit.cpp CalculateGlanceAmount
  // ~3356.
  casterGlance?: boolean;
  /** CreatureStaticFlags2::NO_CRUSHING_BLOWS on the attacker. Cite: Unit.cpp:3109 CanCrushInCombat. */
  noCrushingBlows?: boolean;
  // Attacker is charmed by a creature (GetCharmerGuid().IsCreature()). Player-controlled crushers only
  // crush in that case. Cite: Unit.cpp:2983–2988 CanCrush.
  attackerCharmerIsCreature?: boolean;
  // NO_ACTIVE_DEFENSE — CanReactOnAbility is false, so no dodge, parry or block side is set at all.
  // 51 playable rows. Cite: Unit.cpp:3129-3132 CanReactOnAbility.
  noActiveDefense?: boolean;
  // NO_AVOIDANCE — the caster skips the whole hit-result switch, so every side including miss is 0
  // and the cast simply lands. 13 playable rows. Cite: Unit.cpp:2952-2966 SpellHitResult.
  noAvoidance?: boolean;
  // Victim is a totem: `GetMissChance` returns 0 flat, so the miss side is 0 whatever the level gap. Cite:
  // Unit.cpp:3670-3688.
  defenderIsTotem?: boolean;
  // The attacking weapon's school is magical (creature_template.DamageSchool non-zero, 100 templates).
  // Pre-WotLK such a swing has no block side at all. Cite: Unit.cpp:3075-3079 CanBlockInCombat.
  attackSchoolIsMagic?: boolean;
  // The attacker is inside the defender's front arc. Parry and block need it from EVERY defender,
  // dodge only from a player. Absent is true, so a session with no geometry keeps the old behaviour.
  attackerInDefendersFront?: boolean;
  // Victim effective magic-resist % for a white magic swing: the 100% bin of the partial-resist
  // table becomes extra miss, and the damage path still rolls absorb and resist after a hit.
  magicWhiteResistPercent?: number;
}

export interface AttackTable {
  miss: number;
  dodge: number;
  parry: number;
  /** Deflect side — the parry chance moved here for a deflect-shaped ability. 0 otherwise. */
  deflect: number;
  block: number;
  glancing: number;
  crit: number;
  crushing: number;
}

// ---- Skill helpers ----------------------------------------------------------

function weaponSkill(ctx: AttackContext): number {
  return ctx.attackerWeaponSkill ?? skillMaxForLevel(ctx.atkLevel);
}

function defenseSkill(ctx: AttackContext): number {
  return ctx.defenderDefenseSkill ?? skillMaxForLevel(ctx.defLevel);
}

function attackerPlayer(ctx: AttackContext): boolean {
  return ctx.attackerIsPlayerOrPet !== false; // default true
}

function defenderPlayer(ctx: AttackContext): boolean {
  return ctx.defenderIsPlayerOrPet === true; // default false (NPC)
}

// Glance-eligible auto: player-controlled attacker, non-player victim, victim level > 10. Unit.cpp
// CanGlance ~2991 + CanGlanceInCombat ~3119.
export function canGlanceInCombat(ctx: AttackContext): boolean {
  if (ctx.isAbility) return false;
  if (!attackerPlayer(ctx)) return false;
  if (defenderPlayer(ctx)) return false;
  return ctx.defLevel > 10;
}

// Crush-eligible auto: NPC (or creature-charmed player-controlled) attacker vs player victim. Unit.cpp
// CanCrush ~2983 + CanCrushInCombat ~3105–3116.
export function canCrushInCombat(ctx: AttackContext): boolean {
  if (ctx.isAbility) return false;
  if (ctx.noCrushingBlows) return false;
  if (!defenderPlayer(ctx)) return false;
  if (attackerPlayer(ctx)) return ctx.attackerCharmerIsCreature === true;
  return true;
}

// ---- CalculateEffective* (percent 0–100 internally, export fraction) --------

/** Unit.cpp CalculateEffectiveMissChance ~3756. Returns fraction 0..1. */
export function calculateEffectiveMissChance(ctx: AttackContext): number {
  // NO_AVOIDANCE skips the hit-result switch entirely, so nothing can be avoided.
  if (ctx.noAvoidance) return 0;
  // GetMissChance base 5% (Unit.cpp:3670-3678); a totem victim returns 0 and the
  // `chance < 0.005f` early return then skips the level/skill terms too.
  let chance = ctx.defenderIsTotem ? 0 : 5.0;
  if (chance < 0.005) return 0;

  const ranged = ctx.attackType === 'ranged';
  const ability = !!ctx.isAbility;
  // Dual-wield +19% when !ability && !ranged && dualWield && !onNextSwing exemption.
  // Unit.cpp ~3767–3768.
  if (!ability && !ranged && ctx.dualWield && !ctx.onNextSwing) {
    chance += 19.0;
  }

  const vsPlayerOrPet = defenderPlayer(ctx);
  const skill = weaponSkill(ctx); // weapon path; non-weapon ability uses max — we treat strikes as weapon
  let difference = Math.trunc(defenseSkill(ctx) - skill);
  let factor = 0.04;
  // NPC victim: bonus miss from positive skill difference (same shape as parry).
  if (!vsPlayerOrPet && difference > 0) {
    if (difference > 10) {
      chance += 10 * 0.1;
      difference -= 10;
      factor = 0.4;
      chance += difference * 0.2;
    } else {
      factor = 0.1;
    }
  }
  chance += difference * factor;

  // Victim auras affecting the attacker's hit contribution (185). Cite: Unit.cpp:3793-3794.
  chance -= ctx.defenderHitTakenPp ?? 0;

  // Elemental white swings: the 100% resist bin is extra miss, not a second land roll. The bin is
  // percentage points on a 0..10000 weight. Skipped for abilities and ranged.
  if (!ability && !ranged && ctx.attackSchoolIsMagic) {
    const percent = ctx.magicWhiteResistPercent ?? 0;
    if (percent > 0) {
      const index = Math.min(10000, (percent * 100) | 0);
      if (index > 0) {
        const row = SPELL_PARTIAL_RESIST_DISTRIBUTION[index]!;
        chance += row[SPELL_PARTIAL_RESIST_PCT_100]! / 100;
      }
    }
  }

  // Hit: CMaNGOS chance -= GetHitChance (percentage points).
  // Map attackerHit absolute fraction: 0.95 → 0 pp, 1.0 → 5 pp.
  const hitFrac = ctx.attackerHit ?? 0.95;
  const hitBonusPp = (hitFrac - 0.95) * 100;
  chance -= hitBonusPp;

  // Minimum: 1% when ability magic or difference > 10; else 0. Unit.cpp ~3810.
  // Recompute raw defense-skill difference for the floor (pre NPC step mutation).
  const rawDiff = Math.trunc(defenseSkill(ctx) - skill);
  const minimum = rawDiff > 10 ? 1.0 : 0.0;
  return pctToFrac(Math.max(minimum, Math.min(chance, 100.0)));
}

// Unit.cpp CalculateEffectiveDodgeChance ~3215. `baseDodge` is GetDodgeChance() as fraction (default 0.05).
export function calculateEffectiveDodgeChance(ctx: AttackContext, baseDodge?: number): number {
  if (ctx.noAvoidance || ctx.noActiveDefense) return 0;
  let chance = (baseDodge ?? ctx.defenderDodge ?? 0.05) * 100;
  if (chance < 0.005) return 0;

  const isPlayerOrPet = defenderPlayer(ctx);
  // "Players can't dodge attacks from behind" — creatures can, and do.
  // Cite: Unit.cpp:3045-3053 CanDodgeInCombat(attacker).
  if (isPlayerOrPet && ctx.attackerInDefendersFront === false) return 0;
  const skill = weaponSkill(ctx);
  const difference = Math.trunc(defenseSkill(ctx) - skill);
  let factor = 0.04;
  if (!isPlayerOrPet && difference > 0) factor = 0.1;
  chance += difference * factor;
  return pctToFrac(Math.max(0, Math.min(chance, 100)));
}

/** Unit.cpp CalculateEffectiveParryChance ~3239. Ranged → 0. */
export function calculateEffectiveParryChance(ctx: AttackContext, baseParry?: number): number {
  if (ctx.attackType === 'ranged') return 0;
  if (ctx.noAvoidance || ctx.noActiveDefense) return 0;
  if (!ctx.defenderParries) return 0;
  // Nobody parries from behind. Cite: Unit.cpp:3070 CanParryInCombat(attacker).
  if (ctx.attackerInDefendersFront === false) return 0;

  let chance = (baseParry ?? ctx.defenderParry ?? 0.05) * 100;
  if (chance < 0.005) return 0;

  const isPlayerOrPet = defenderPlayer(ctx);
  const skill = weaponSkill(ctx);
  const difference = Math.trunc(defenseSkill(ctx) - skill);
  let factor = 0.04;
  if (!isPlayerOrPet && difference > 0) {
    factor = difference > 10 ? 0.6 : 0.1;
  }
  chance += difference * factor;
  return pctToFrac(Math.max(0, Math.min(chance, 100)));
}

/** Unit.cpp CalculateEffectiveBlockChance ~3271. NPC: no bonus from positive skill diff (factor = 0). */
export function calculateEffectiveBlockChance(ctx: AttackContext, baseBlock?: number): number {
  if (ctx.noAvoidance || ctx.noActiveDefense) return 0;
  // Pre-WotLK an elemental or magic melee auto-attack cannot be blocked at all — a Fire
  // Elemental's white hit has no block side. Cite: Unit.cpp:3075-3079 CanBlockInCombat.
  if (ctx.attackSchoolIsMagic) return 0;
  if (!ctx.defenderBlocks) return 0;
  // Nobody blocks from behind either. Cite: Unit.cpp:3100 CanBlockInCombat(attacker, mask).
  if (ctx.attackerInDefendersFront === false) return 0;

  let chance = (baseBlock ?? ctx.defenderBlock ?? 0.05) * 100;
  if (chance < 0.005) return 0;

  const isPlayerOrPet = defenderPlayer(ctx);
  const skill = weaponSkill(ctx);
  const difference = Math.trunc(defenseSkill(ctx) - skill);
  let factor = 0.04;
  if (!isPlayerOrPet && difference > 0) factor = 0.0;
  chance += difference * factor;
  return pctToFrac(Math.max(0, Math.min(chance, 100)));
}

// CalculateEffectiveDazeChance — an NPC white hit in a player's back arc dazes at this chance: 20%
// base at level 30+, a ramp below, plus the skill term times four, capped at 40%. Fraction 0..1.
export function calculateEffectiveDazeChance(ctx: AttackContext): number {
  const level = ctx.defLevel;
  let chance = level < 30 ? (0.65 * level) + 0.5 : 20;
  chance += (weaponSkill(ctx) - defenseSkill(ctx)) * 0.04 * 4;
  return pctToFrac(Math.max(0, Math.min(chance, 40)));
}

// Unit.cpp CalculateEffectiveCrushChance ~3295. Returns fraction. 0 when ineligible or deficit < 15. At
// deficit 15 → 15%; 16 → 17%; formula (2*deficit - 15) percent.
export function calculateEffectiveCrushChance(ctx: AttackContext): number {
  if (!canCrushInCombat(ctx)) return 0;

  const cap = skillMaxForLevel(ctx.defLevel);
  const defense = Math.min(defenseSkill(ctx), cap);
  const deficit = Math.trunc(weaponSkill(ctx) - defense);
  if (deficit < 15) return 0;
  const chance = 2 * deficit - 15;
  return pctToFrac(Math.max(0, Math.min(chance, 100)));
}

// Unit.cpp CalculateEffectiveGlanceChance ~3309. Base 10 + (defense - cappedWeaponSkill)*2; wand-user
// pre-30 special.
export function calculateEffectiveGlanceChance(ctx: AttackContext): number {
  if (!canGlanceInCombat(ctx)) return 0;

  const cap = skillMaxForLevel(ctx.atkLevel);
  const skill = Math.min(weaponSkill(ctx), cap);
  const defense = defenseSkill(ctx);
  const level = Math.trunc(ctx.atkLevel);
  let chance: number;
  if (ctx.wandUser) {
    chance = level < 30
      ? level + (defense - skill) * 2
      : 30 + (defense - skill) * 2;
  } else {
    chance = 10 + (defense - skill) * 2;
  }
  return pctToFrac(Math.max(0, Math.min(chance, 100)));
}

// Unit.cpp CalculateEffectiveCritChance ~3719. vs NPC: factor 0.2 (crit suppression); weapon skill used. vs
// player: factor 0.04; skill forced to attacker L×5 (weapon skill does not benefit vs PCs).
export function calculateEffectiveCritChance(ctx: AttackContext): number {
  let chance = ctx.baseCrit * 100;
  if (chance < 0.005) return 0;

  const vsPlayerOrPet = defenderPlayer(ctx);
  // Weapon skill does not benefit crit % against an NPC — the inverted reading of the C++. Against a
  // creature use the weapon skill; against a player use the max skill for level.
  const skill = !vsPlayerOrPet
    ? weaponSkill(ctx)
    : skillMaxForLevel(ctx.atkLevel);
  const difference = Math.trunc(skill - defenseSkill(ctx));
  let factor = 0.04;
  if (!vsPlayerOrPet) factor = 0.2; // 1% crit per level of target above
  chance += difference * factor;
  // Victim's crit taken chance (187 melee / 188 ranged). Cite: Unit.cpp:3744-3746.
  chance += ctx.defenderCritTakenPp ?? 0;
  return pctToFrac(Math.max(0, Math.min(chance, 100)));
}

// Unit.cpp CalculateGlanceAmount ~3344 — damage multiplier in [lowEnd, highEnd]. `roll01` in [0,1) picks
// within the band (C++ uses urand on hundredths). Returns 1 when skill beats defense (difference < 0).
export function glanceDamageMultiplier(
  weaponSkillValue: number,
  defenseSkillValue: number,
  roll01: number,
  caster = false,
): number {
  const difference = Math.trunc(defenseSkillValue - weaponSkillValue);
  if (difference < 0) return 1;

  const baseHighEnd = caster ? 0.9 : 1.2;
  const baseLowEnd = caster ? 0.6 : 1.3;
  const maxLowEnd = caster ? 0.6 : 0.91;

  let highEnd = baseHighEnd - 0.03 * difference;
  let lowEnd = baseLowEnd - 0.05 * difference;
  // 0.2 <= highEnd <= 0.99
  highEnd = Math.min(Math.max(highEnd, 0.2), 0.99);
  // 0.01 <= lowEnd <= maxLowEnd <= highEnd
  lowEnd = Math.min(Math.max(lowEnd, 0.01), Math.min(maxLowEnd, highEnd));

  const r = clamp(roll01, 0, 0.999999);
  // Continuous stand-in for urand(low*100, high*100)*0.01
  return lowEnd + (highEnd - lowEnd) * r;
}

/** Glance mult from full attack context. */
export function glanceDamageMultiplierFromContext(ctx: AttackContext, roll01: number): number {
  return glanceDamageMultiplier(
    weaponSkill(ctx),
    defenseSkill(ctx),
    roll01,
    !!ctx.casterGlance || !!ctx.wandUser,
  );
}

// ---- Table assembly + resolve -----------------------------------------------

// Build non-hit side probabilities (0..1). Hit = remainder after ordered sum (may be 0 if earlier sides
// fill the die — Die does not renormalize).
export function meleeAttackTable(ctx: AttackContext): AttackTable {
  const miss = calculateEffectiveMissChance(ctx);
  const dodge = calculateEffectiveDodgeChance(ctx);
  // A deflect-shaped ability takes the parry chance on the DEFLECT side instead. Both gates run
  // through CanParryInCombat, so the defender still needs a weapon and the attacker in front.
  const deflectShape = ctx.isAbility === true && ctx.abilityDeflects === true;
  const parrySide = calculateEffectiveParryChance(ctx);
  const parry = deflectShape ? 0 : parrySide;
  const deflect = deflectShape ? calculateAbilityDeflectChance(ctx) : 0;
  const block = calculateEffectiveBlockChance(ctx);
  const glancing = calculateEffectiveGlanceChance(ctx);
  const crit = calculateEffectiveCritChance(ctx);
  const crushing = calculateEffectiveCrushChance(ctx);
  return { miss, dodge, parry, deflect, block, glancing, crit, crushing };
}

// CalculateAbilityDeflectChance — the parry chance, computed with the RANGED weapon type for a magic
// ability. Ranged is forced past the white-swing early return, which is what deflect exists for.
export function calculateAbilityDeflectChance(ctx: AttackContext): number {
  return calculateEffectiveParryChance({ ...ctx, attackType: 'melee' });
}

// Ordered sides for autos: miss, dodge, parry, block, glance, crit, crush, hit. An instant ability
// uses the land die instead. Chances accumulate and the first match wins, with no renormalize.
export function pickMeleeOutcome(table: AttackTable, roll01: number): AttackResult {
  const r = clamp(roll01, 0, 0.999999);
  let c = 0;
  if (r < (c += table.miss)) return 'miss';
  if (r < (c += table.dodge)) return 'dodge';
  if (r < (c += table.parry)) return 'parry';
  if (r < (c += table.deflect)) return 'deflect';
  if (r < (c += table.block)) return 'block';
  if (r < (c += table.glancing)) return 'glancing';
  if (r < (c += table.crit)) return 'crit';
  if (r < (c += table.crushing)) return 'crushing';
  return 'hit';
}

// The ability land die: miss, dodge, parry, block, hit — no glance, crit or crush. Crit is a second
// roll after the land. Resist and deflect sides are omitted until those chances are wired.
export function pickMeleeSpellLand(table: AttackTable, roll01: number): AttackResult {
  const r = clamp(roll01, 0, 0.999999);
  let c = 0;
  if (r < (c += table.miss)) return 'miss';
  if (r < (c += table.dodge)) return 'dodge';
  if (r < (c += table.parry)) return 'parry';
  if (r < (c += table.deflect)) return 'deflect';
  if (r < (c += table.block)) return 'block';
  return 'hit';
}

// White ranged post-process: parry → hit, dodge → miss. Parry chance is already 0 for RANGED_ATTACK; dodge
// stays on the die then remaps. Cite: Unit.cpp:1953–1958 CalculateMeleeDamage.
export function remapRangedWhiteOutcome(result: AttackResult): AttackResult {
  if (result === 'parry') return 'hit';
  if (result === 'dodge') return 'miss';
  return result;
}

// Damage multiplier for a resolved outcome. Crush = 1.5 (Unit.cpp MELEE_HIT_CRUSHING ~2085). Block mult = 1
// (flat absorb applied later by combat). Glance uses glanceRoll01 (default mid-band 0.5 when omitted).
export function meleeOutcomeMultiplier(
  ctx: AttackContext,
  result: AttackResult,
  critMult: number,
  glanceRoll01 = 0.5,
): number {
  switch (result) {
    case 'miss':
    case 'dodge':
    case 'parry':
    // A deflected or immune ability is a full avoid. Cite: Unit.cpp:2851 SPELL_MISS_DEFLECT.
    case 'deflect':
    case 'immune':
      return 0;
    case 'glancing':
      return glanceDamageMultiplierFromContext(ctx, glanceRoll01);
    case 'crit':
      return critMult;
    case 'crushing':
      return 1.5;
    case 'block':
      if (ctx.completelyBlocked) return 0;
      return 1;
    case 'hit':
    default:
      return 1;
  }
}

// Resolve a physical swing from one table roll into an outcome and damage multiplier, with an
// optional roll for the glance band. Block keeps mult 1 — the shield value reduces it later.
export function resolveMeleeAttack(
  ctx: AttackContext,
  critMult: number,
  roll01: number,
  glanceRoll01 = 0.5,
): { result: AttackResult; mult: number } {
  const p = meleeAttackTable(ctx);
  const result = pickMeleeOutcome(p, roll01);
  const mult = meleeOutcomeMultiplier(ctx, result, critMult, glanceRoll01);
  return { result, mult };
}
