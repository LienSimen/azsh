// The XP formulas port: kill gain and its colour bands, quest XP value, exploration XP and the
// rest-bonus spend. The kill rate's classic default of 1.0 is applied as identity.

import { CREATURE_ELITE, CREATURE_TYPE } from '../data/schema.ts';
import type { CreatureDef } from '../data/schema.ts';

/** XP difficulty colour (Formulas.h XPColorChar). */
export type XpColorCode = 'red' | 'orange' | 'yellow' | 'green' | 'gray';

// Round half to even, as the C++ does before its cast.
// Cite: Formulas.h Gain ~387 nearbyint(xp_gain * rate).
export function nearbyint(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const f = Math.floor(x);
  const c = Math.ceil(x);
  if (f === c) return f;
  const mid = f + 0.5;
  if (x < mid) return f;
  if (x > mid) return c;
  // Exactly halfway: banker's round to even
  return f % 2 === 0 ? f : c;
}

// Formulas.h IsTrivialLevelDifference ~240–272. True when the player is high enough above the target that
// BaseGain returns 0. Only applies when unitLvl > targetLvl.
export function isTrivialLevelDifference(unitLvl: number, targetLvl: number): boolean {
  if (unitLvl <= targetLvl) return false;
  const diff = unitLvl - targetLvl;
  switch (Math.floor(unitLvl / 5)) {
    case 0: // 0-4
    case 1: // 5-9
      return diff > 4;
    case 2: // 10-14
    case 3: // 15-19
      return diff > 5;
    case 4: // 20-24
    case 5: // 25-29
      return diff > 6;
    case 6: // 30-34
    case 7: // 35-39
      return diff > 7;
    case 8: // 40-44
      return diff > 8;
    case 9: // 45-49
      return diff > 9;
    case 10: // 50-54
      return diff > 10;
    case 11: // 55-59
      return diff > 11;
    default: // 60+
      return diff > 12;
  }
}

/** Formulas.h GetQuestGreenRange ~274–302. */
export function getQuestGreenRange(unitLvl: number): number {
  switch (Math.floor(unitLvl / 5)) {
    case 0:
    case 1:
      return 4;
    case 2:
    case 3:
      return 5;
    case 4:
    case 5:
      return 6;
    case 6:
    case 7:
      return 7;
    case 8:
      return 8;
    case 9:
      return 9;
    case 10:
      return 10;
    case 11:
      return 11;
    default:
      return 12;
  }
}

/** Formulas.h GetGrayLevel ~306–315. Used for UI colour (not the XP trivial table). */
export function getGrayLevel(plLevel: number): number {
  if (plLevel <= 5) return 0;
  if (plLevel <= 39) return plLevel - 5 - Math.floor(plLevel / 10);
  if (plLevel <= 59) return plLevel - 1 - Math.floor(plLevel / 5);
  return plLevel - 9;
}

/** Formulas.h GetColorCode ~317–328. */
export function getColorCode(plLevel: number, mobLevel: number): XpColorCode {
  if (mobLevel >= plLevel + 5) return 'red';
  if (mobLevel >= plLevel + 3) return 'orange';
  if (mobLevel >= plLevel - 2) return 'yellow';
  if (mobLevel > getGrayLevel(plLevel)) return 'green';
  return 'gray';
}

/** Formulas.h GetZeroDifference ~330–344. */
export function getZeroDifference(unitLevel: number): number {
  if (unitLevel < 8) return 5;
  if (unitLevel < 10) return 6;
  if (unitLevel < 12) return 7;
  if (unitLevel < 16) return 8;
  if (unitLevel < 20) return 9;
  if (unitLevel < 30) return 11;
  if (unitLevel < 40) return 12;
  if (unitLevel < 45) return 13;
  if (unitLevel < 50) return 14;
  if (unitLevel < 55) return 15;
  if (unitLevel < 60) return 16;
  return 17;
}

// Formulas.h BaseGain ~346–364. nBaseExp = unit_level * 5 + 45 (player level). Higher mobs +5% per level
// (cap +4). Lower non-trivial: 1 - diff/ZeroDifference. Trivial → 0.
export function baseGain(unitLevel: number, mobLevel: number): number {
  const nBaseExp = unitLevel * 5 + 45;
  if (mobLevel >= unitLevel) {
    let nLevelDiff = mobLevel - unitLevel;
    if (nLevelDiff > 4) nLevelDiff = 4;
    return nBaseExp * (1.0 + 0.05 * nLevelDiff);
  }
  if (!isTrivialLevelDifference(unitLevel, mobLevel)) {
    const zd = getZeroDifference(unitLevel);
    const nLevelDiff = unitLevel - mobLevel;
    return nBaseExp * (1.0 - nLevelDiff / zd);
  }
  return 0;
}

// Creature::IsElite (Creature.h ~655–662). Pets never elite for XP. rank ≠ NORMAL and ≠ RARE → elite
// (includes ELITE, RAREELITE, WORLDBOSS).
export function isCreatureElite(rank: number, isPet = false): boolean {
  if (isPet) return false;
  return rank !== CREATURE_ELITE.NORMAL && rank !== CREATURE_ELITE.RARE;
}

// Elite XP mult from Formulas.h Gain ~375–381. 5-man / open world (IsNoRaid): ×2.5; raid map: ×2.0.
// Non-elite: ×1.
export function eliteXpMultiplier(rank: number, isNoRaid = true, isPet = false): number {
  if (!isCreatureElite(rank, isPet)) return 1;
  return isNoRaid ? 2.5 : 2.0;
}

// Formulas.h xp_in_group_rate ~390–408. Only apply when a real party context exists (Wave 3B: solo path
// omits this). isRaid is unused in Classic C++ (commented TODO); kept for signature parity.
export function xpInGroupRate(count: number, _isRaid = false): number {
  switch (count) {
    case 0:
    case 1:
    case 2:
      return 1.0;
    case 3:
      return 1.166;
    case 4:
      return 1.3;
    case 5:
      return 1.4;
    default:
      return Math.max(1 - count * 0.05, 0.01);
  }
}

export interface KillXpGainArgs {
  playerLevel: number;
  mobLevel: number;
  /** CREATURE_ELITE_* rank. Default NORMAL. */
  rank?: number;
  /** Template ExperienceMultiplier. Applied once. Default 1. */
  experienceMultiplier?: number;
  /** Map IsNoRaid (5-man / world). Default true → elite ×2.5. false → raid map elite ×2.0. */
  isNoRaid?: boolean;
  /** CreatureType — critters grant 0 (Formulas.h Gain early out). */
  creatureType?: number;
  /** Explicit no-XP flag (Creature::IsNoXp). */
  noXp?: boolean;
  isPet?: boolean;
  isTotem?: boolean;
  // When a party exists: multiply final Gain by xp_in_group_rate(count). Solo grant path must omit this (no
  // invented party). Full per-member sum_level share is Group.cpp — not applied here without party state.
  groupMemberCount?: number;
  /** Passed to xp_in_group_rate only; Classic ignores isRaid in the rate table. */
  isRaidGroup?: boolean;
  /** CONFIG_FLOAT_RATE_XP_KILL; stock Classic 1.0. */
  rateXpKill?: number;
}

// Formulas.h Gain ~366–388 (minus damage-received mod). Deterministic: no RNG. Returns uint32-style
// non-negative integer.
export function killXpGain(args: KillXpGainArgs): number {
  if (args.isTotem || args.isPet || args.noXp) return 0;
  if (args.creatureType === CREATURE_TYPE.CRITTER) return 0;

  let xp = baseGain(args.playerLevel, args.mobLevel);
  if (xp === 0) return 0;

  const rank = args.rank ?? CREATURE_ELITE.NORMAL;
  xp *= eliteXpMultiplier(rank, args.isNoRaid ?? true, args.isPet ?? false);
  xp *= args.experienceMultiplier ?? 1;

  // Damage-received mod skipped (no multi-attacker tracking).

  if (args.groupMemberCount != null && args.groupMemberCount > 0) {
    xp *= xpInGroupRate(args.groupMemberCount, args.isRaidGroup ?? false);
  }

  const rate = args.rateXpKill ?? 1;
  return Math.max(0, nearbyint(xp * rate));
}

// Kill XP grant helper from a CreatureDef + levels. Uses Formulas::Gain pieces — not the legacy baked
// `cdef.xp` column. ExperienceMultiplier applied once (template field or scaling block).
export function killXpAmount(
  cdef: CreatureDef,
  playerLevel: number,
  mobLevel?: number,
  opts?: {
    isNoRaid?: boolean;
    groupMemberCount?: number;
    isRaidGroup?: boolean;
    isPet?: boolean;
    isTotem?: boolean;
    noXp?: boolean;
  },
): number {
  const multi =
    cdef.experienceMultiplier ??
    cdef.scaling?.experienceMultiplier ??
    1;
  const rank = cdef.scaling?.rank ?? CREATURE_ELITE.NORMAL;
  return killXpGain({
    playerLevel,
    mobLevel: mobLevel ?? cdef.level,
    rank,
    experienceMultiplier: multi,
    creatureType: cdef.creatureType,
    isNoRaid: opts?.isNoRaid,
    groupMemberCount: opts?.groupMemberCount,
    isRaidGroup: opts?.isRaidGroup,
    isPet: opts?.isPet,
    // The template's own flags decide this, so a caller that passes no opts still gets the
    // Formulas.h:368 early-out. Cite: SharedDefines.h:1151 CREATURE_TYPE_TOTEM.
    isTotem: opts?.isTotem ?? cdef.creatureType === CREATURE_TYPE.TOTEM,
    noXp: opts?.noXp ?? cdef.noXp,
  });
}

// Wave D2 — quest XPValue, exploration XP, kill-only rest spend

/** Classic CONFIG_UINT32_MAX_PLAYER_LEVEL default. */
export const CLASSIC_MAX_PLAYER_LEVEL = 60;

// The quest XP value then the rate: the full amount is the max-level money over a tiered divisor,
// decayed once the player is more than five levels over. A max-level player gets gold instead.
export function questXpValue(
  playerLevel: number,
  questLevel: number,
  rewMoneyMaxLevel: number,
  rate = 1,
  maxPlayerLevel = CLASSIC_MAX_PLAYER_LEVEL,
): number {
  if (rewMoneyMaxLevel <= 0) return 0;
  if (playerLevel >= maxPlayerLevel) return 0;

  let fullxp = 0;
  if (questLevel >= 65) fullxp = rewMoneyMaxLevel / 6.0;
  else if (questLevel === 64) fullxp = rewMoneyMaxLevel / 4.8;
  else if (questLevel === 63) fullxp = rewMoneyMaxLevel / 3.6;
  else if (questLevel === 62) fullxp = rewMoneyMaxLevel / 2.4;
  else if (questLevel === 61) fullxp = rewMoneyMaxLevel / 1.2;
  else if (questLevel > 0 && questLevel <= 60) fullxp = rewMoneyMaxLevel / 0.6;
  // questLevel 0 or other: fullxp stays 0 (matches C++ — no else branch)

  let xp: number;
  if (playerLevel <= questLevel + 5) xp = Math.ceil(fullxp);
  else if (playerLevel === questLevel + 6) xp = Math.ceil(fullxp * 0.8);
  else if (playerLevel === questLevel + 7) xp = Math.ceil(fullxp * 0.6);
  else if (playerLevel === questLevel + 8) xp = Math.ceil(fullxp * 0.4);
  else if (playerLevel === questLevel + 9) xp = Math.ceil(fullxp * 0.2);
  else xp = Math.ceil(fullxp * 0.1);

  // uint32(xp * rate) — truncate toward 0
  return Math.max(0, Math.floor(xp * rate));
}

// The quest flag that zeroes the max-level GOLD only — the XP value reads the raw member, so sub-60 XP
// is untouched. 139 baked quests set it, nearly all repeatable turn-ins. Cite: QuestDef.h:141.
export const QUEST_FLAGS_NO_MONEY_FROM_XP = 0x100;

// At max level, quest turn-in converts RewMoneyMaxLevel → copper (not XP). Cite: Player.cpp RewardQuest
// ~12594–12598; the flag gate is QuestDef.cpp:227-232.
export function questMoneyAtMaxLevel(
  rewMoneyMaxLevel: number,
  moneyRate = 1,
  questFlags = 0,
): number {
  if (rewMoneyMaxLevel <= 0) return 0;
  if ((questFlags | 0) & QUEST_FLAGS_NO_MONEY_FROM_XP) return 0;
  return Math.max(0, Math.floor(rewMoneyMaxLevel * moneyRate));
}

// A zone's area level as a PROXY from the median level of the quests it offers. The real column is not
// baked yet, and quest level is real data that tracks the zone's intended band.
export function zoneAreaLevelProxy(questLevels: readonly number[]): number | undefined {
  const lv = questLevels.filter((l) => Number.isFinite(l) && l > 0).sort((a, b) => a - b);
  if (lv.length === 0) return undefined;
  const mid = Math.floor(lv.length / 2);
  return lv.length % 2 === 1 ? lv[mid]! : Math.round((lv[mid - 1]! + lv[mid]!) / 2);
}

export interface ExplorationXpOpts {
  // AreaTableEntry.area_level. Required for over/under-level scaling. When omitted, treats as equal-level:
  // basexp * rate only.
  areaLevel?: number;
  // The base XP lookup for a level. With an area level, the underlevel path uses the player's level
  // plus five and the overlevel path the area's own value.
  baseXpFor?: (level: number) => number;
  maxPlayerLevel?: number;
}

// Exploration XP: more than five levels under the area takes the player's own level plus five, more
// than five over decays by 5% a level down to zero, and the max level gets none.
export function explorationXp(
  playerLevel: number,
  basexp: number,
  rate = 1,
  opts?: ExplorationXpOpts,
): number {
  const maxLvl = opts?.maxPlayerLevel ?? CLASSIC_MAX_PLAYER_LEVEL;
  if (playerLevel >= maxLvl) return 0;

  const areaLevel = opts?.areaLevel;
  if (areaLevel == null || areaLevel <= 0) {
    // No area level: grant basexp * rate (caller pre-selected table row)
    return Math.max(0, Math.floor(basexp * rate));
  }

  const diff = playerLevel - areaLevel;
  if (diff < -5) {
    const high = opts?.baseXpFor?.(playerLevel + 5) ?? basexp;
    return Math.max(0, Math.floor(high * rate));
  }
  if (diff > 5) {
    let explorationPercent = 100 - (diff - 5) * 5;
    if (explorationPercent > 100) explorationPercent = 100;
    else if (explorationPercent < 0) explorationPercent = 0;
    return Math.max(0, Math.floor((basexp * explorationPercent) / 100 * rate));
  }
  return Math.max(0, Math.floor(basexp * rate));
}

// Kill-only rested XP spend (Player::GetXPRestBonus ~7754). bonus = min(restedXp, killXp); remaining =
// restedXp - bonus. Quest/explore GiveXP paths pass victim==nullptr and must NOT call this.
export function restBonusSpend(
  restedXp: number,
  killXp: number,
): { bonus: number; remainingRested: number } {
  const pool = Math.max(0, restedXp);
  const xp = Math.max(0, killXp);
  // uint32 rested_bonus = uint32(GetRestBonus()) — the float pool truncates to int
  // before min(bonus, xp); the fractional remainder stays in the pool.
  const bonus = Math.min(Math.floor(pool), xp);
  return {
    bonus,
    remainingRested: pool - bonus,
  };
}
