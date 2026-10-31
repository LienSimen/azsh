// Pure reputation engine: absolute standing (Phonecraft stores the total, not the CMaNGOS delta).
// No DOM, no I/O, no RNG. Cite: ReputationMgr.cpp; Player.cpp CalculateReputationGain ~6293.

import type {
  FactionDef,
  ReputationRankDef,
  ReputationRateDef,
  ReputationSpilloverDef,
} from '../../data/schema.ts';
import {
  getQuestGreenRange,
  isTrivialLevelDifference,
} from '../../progression/xpGain.ts';

// ── Constants (ReputationMgr.cpp / .h) ──────────────────────────────────────

/** PointsInRank[MAX_REPUTATION_RANK]. Cite: ReputationMgr.cpp:25. */
export const POINTS_IN_RANK = [36000, 3000, 3000, 3000, 6000, 12000, 21000, 1000] as const;

/** Reputation_Cap. Cite: ReputationMgr.h. */
export const REPUTATION_CAP = 42999;
/** Reputation_Bottom. Cite: ReputationMgr.h. */
export const REPUTATION_BOTTOM = -42000;

export const MAX_REPUTATION_RANK = 8;
export const MIN_REPUTATION_RANK = 0;

/** ReputationRank enum. Cite: SharedDefines.h. */
export const REP_RANK = {
  HATED: 0,
  HOSTILE: 1,
  UNFRIENDLY: 2,
  NEUTRAL: 3,
  FRIENDLY: 4,
  HONORED: 5,
  REVERED: 6,
  EXALTED: 7,
} as const;

export type ReputationRank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const RANK_NAMES = [
  'Hated',
  'Hostile',
  'Unfriendly',
  'Neutral',
  'Friendly',
  'Honored',
  'Revered',
  'Exalted',
] as const;

/** FactionFlags. Cite: ReputationMgr.h enum FactionFlags. */
export const FACTION_FLAG = {
  VISIBLE: 0x01,
  AT_WAR: 0x02,
  HIDDEN: 0x04,
  INVISIBLE_FORCED: 0x08,
  PEACE_FORCED: 0x10,
  INACTIVE: 0x20,
  RIVAL: 0x40,
} as const;

/** Default CONFIG_FLOAT_RATE_REPUTATION_LOWLEVEL_* (kill/quest). */
export const DEFAULT_LOWLEVEL_REP_MIN_RATE = 0.2;
/** Default CONFIG_FLOAT_RATE_REPUTATION_GAIN. */
export const DEFAULT_REPUTATION_GAIN_RATE = 1.0;

export type ReputationSource = 'kill' | 'quest' | 'spell';

export type ReputationsMap = Record<number, number>;
export type FactionFlagsMap = Record<number, number>;

// ── Rank math ───────────────────────────────────────────────────────────────

// ReputationMgr::ReputationToRank. Cite: ReputationMgr.cpp:27. Walks backward from Cap+1 subtracting
// PointsInRank.
export function reputationToRank(standing: number): ReputationRank {
  let limit = REPUTATION_CAP + 1; // 43000
  for (let i = MAX_REPUTATION_RANK - 1; i >= MIN_REPUTATION_RANK; --i) {
    limit -= POINTS_IN_RANK[i]!;
    if (standing >= limit) return i as ReputationRank;
  }
  return MIN_REPUTATION_RANK as ReputationRank;
}

// Rank from baked `reputationRanks` min thresholds (UI path). Both this and `reputationToRank` must agree
// on the same standing. Uses the highest rank whose min <= standing (ascending mins).
export function rankFromThresholds(
  standing: number,
  reputationRanks: readonly ReputationRankDef[],
): ReputationRank {
  if (reputationRanks.length === 0) return reputationToRank(standing);
  let best = MIN_REPUTATION_RANK as ReputationRank;
  for (const r of reputationRanks) {
    if (standing >= r.min) best = r.rank as ReputationRank;
  }
  return best;
}

/** Build the 8 rank bands from PointsInRank (same as enrich-reputation.mjs). */
export function buildReputationRanks(): ReputationRankDef[] {
  const out: ReputationRankDef[] = [];
  let min = REPUTATION_BOTTOM;
  for (let i = 0; i < RANK_NAMES.length; i++) {
    out.push({ rank: i, name: RANK_NAMES[i]!, min });
    min += POINTS_IN_RANK[i]!;
  }
  return out;
}

// Progress within the current rank band. `current` = standing − rank.min; `span` = PointsInRank[rank].
// Exalted: min 42000, hard cap 42999 → at most 999 progress of span 1000.
export function progressInRank(standing: number): {
  rank: ReputationRank;
  name: string;
  min: number;
  current: number;
  span: number;
  remaining: number;
} {
  const rank = reputationToRank(standing);
  const min = rankMinStanding(rank);
  const span = POINTS_IN_RANK[rank]!;
  // Clamp displayed progress to [0, span]; Exalted hard-cap leaves 999 of 1000.
  const raw = standing - min;
  const current = Math.max(0, Math.min(span, raw));
  const toCap = Math.max(0, REPUTATION_CAP - standing);
  const remaining = rank === REP_RANK.EXALTED ? toCap : Math.max(0, span - current);
  return { rank, name: RANK_NAMES[rank]!, min, current, span, remaining };
}

/** Lowest absolute standing that maps to `rank` (cumulative from Bottom). */
export function rankMinStanding(rank: number): number {
  let min = REPUTATION_BOTTOM;
  for (let i = 0; i < rank && i < POINTS_IN_RANK.length; i++) {
    min += POINTS_IN_RANK[i]!;
  }
  return min;
}

export function clampStanding(standing: number): number {
  if (standing > REPUTATION_CAP) return REPUTATION_CAP;
  if (standing < REPUTATION_BOTTOM) return REPUTATION_BOTTOM;
  return standing | 0; // int32-ish trunc toward 0 for non-integers
}

// ── Base standing (GetIndexFitTo) ───────────────────────────────────────────

/** Race bit mask: `1 << (raceId - 1)`. Cite: standard CMaNGOS getRaceMask. */
export function raceMask(raceId: number): number {
  return 1 << (raceId - 1);
}

/** Class bit mask: `1 << (classId - 1)`. Cite: standard CMaNGOS getClassMask. */
export function classMask(classId: number): number {
  return 1 << (classId - 1);
}

// FactionEntry::GetIndexFitTo. Cite: DBCStructure.h. First of up to 4 base slots where race/class masks fit
// (0 mask = wildcard). Returns index into faction.base, or -1.
export function getIndexFitTo(
  faction: FactionDef,
  raceId: number,
  classId: number,
): number {
  const rMask = raceMask(raceId);
  const cMask = classMask(classId);
  const n = Math.min(4, faction.base.length);
  for (let i = 0; i < n; i++) {
    const b = faction.base[i]!;
    if ((b.raceMask === 0 || (b.raceMask & rMask) !== 0) &&
        (b.classMask === 0 || (b.classMask & cMask) !== 0)) {
      return i;
    }
  }
  return -1;
}

/** GetBaseReputation. Cite: ReputationMgr.cpp:74. base = idx >= 0 ? BaseRepValue[idx] : 0 */
export function baseStanding(
  faction: FactionDef,
  raceId: number,
  classId: number,
): number {
  const idx = getIndexFitTo(faction, raceId, classId);
  return idx >= 0 ? faction.base[idx]!.value : 0;
}

/** Default state flags from the matching BaseRep slot. Cite: GetDefaultStateFlags. */
export function defaultStateFlags(
  faction: FactionDef,
  raceId: number,
  classId: number,
): number {
  const idx = getIndexFitTo(faction, raceId, classId);
  return idx >= 0 ? faction.base[idx]!.flags : 0;
}

// ── Get standing / rank ─────────────────────────────────────────────────────

// Absolute standing for a faction. Sparse map: missing key → FactionDef base for race/class. Cite:
// character.ts reputations scaffold (absolute, not delta).
export function getStanding(
  reputations: ReputationsMap | undefined,
  faction: FactionDef,
  raceId: number,
  classId: number,
): number {
  const map = reputations ?? {};
  if (Object.prototype.hasOwnProperty.call(map, faction.id)) {
    return map[faction.id]!;
  }
  return baseStanding(faction, raceId, classId);
}

export function getRank(
  reputations: ReputationsMap | undefined,
  faction: FactionDef,
  raceId: number,
  classId: number,
): ReputationRank {
  return reputationToRank(getStanding(reputations, faction, raceId, classId));
}

// ── Flags (runtime-only; not persisted on Character) ────────────────────────

export function hasFlag(flags: number, bit: number): boolean {
  return (flags & bit) !== 0;
}

// Whether the faction is at war. If a flags map entry exists, use AT_WAR bit; else derive: rank ≤ HOSTILE.
export function isAtWar(
  factionId: number,
  rank: ReputationRank,
  flags?: FactionFlagsMap,
): boolean {
  if (flags && Object.prototype.hasOwnProperty.call(flags, factionId)) {
    return hasFlag(flags[factionId]!, FACTION_FLAG.AT_WAR);
  }
  return rank <= REP_RANK.HOSTILE;
}

// Set VISIBLE on first gain, respecting INVISIBLE_FORCED / HIDDEN. Cite: ReputationMgr::SetVisible ~373.
// Returns updated flags map (new object).
export function setVisible(
  flags: FactionFlagsMap | undefined,
  factionId: number,
  currentFlags?: number,
): FactionFlagsMap {
  const next: FactionFlagsMap = { ...(flags ?? {}) };
  let f = currentFlags ?? next[factionId] ?? 0;
  if (f & (FACTION_FLAG.INVISIBLE_FORCED | FACTION_FLAG.HIDDEN)) {
    next[factionId] = f;
    return next;
  }
  if (f & FACTION_FLAG.VISIBLE) {
    next[factionId] = f;
    return next;
  }
  f |= FACTION_FLAG.VISIBLE;
  next[factionId] = f;
  return next;
}

export function isVisible(flags: number): boolean {
  if (flags & (FACTION_FLAG.INVISIBLE_FORCED | FACTION_FLAG.HIDDEN)) return false;
  return (flags & FACTION_FLAG.VISIBLE) !== 0;
}

// The flags actually in force for a faction: the stored per-character state, else the FactionDef
// defaults for that race and class. Cite: ReputationMgr::Initialize.
export function effectiveFactionFlags(
  faction: FactionDef,
  flags: FactionFlagsMap | undefined,
  raceId: number,
  classId: number,
): number {
  const stored = flags?.[faction.id];
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
  return defaultStateFlags(faction, raceId, classId);
}

// Does this faction belong on the player's reputation list? HIDDEN / INVISIBLE_FORCED never show;
// otherwise the VISIBLE bit decides, and earned standing counts as visible on an old save.
export function isFactionVisible(
  faction: FactionDef,
  reputations: ReputationsMap | undefined,
  flags: FactionFlagsMap | undefined,
  raceId: number,
  classId: number,
): boolean {
  const eff = effectiveFactionFlags(faction, flags, raceId, classId);
  if (eff & (FACTION_FLAG.INVISIBLE_FORCED | FACTION_FLAG.HIDDEN)) return false;
  if (eff & FACTION_FLAG.VISIBLE) return true;
  return !!reputations && Object.prototype.hasOwnProperty.call(reputations, faction.id);
}

/** INACTIVE — the player parked this faction at the bottom of the list. */
export function isInactiveFlags(flags: number): boolean {
  return (flags & FACTION_FLAG.INACTIVE) !== 0;
}

// At-war state for a faction: the explicit AT_WAR bit when the player (or a rank change) has written one,
// else derived from standing (Hostile or worse fights you on sight).
export function isFactionAtWar(
  faction: FactionDef,
  reputations: ReputationsMap | undefined,
  flags: FactionFlagsMap | undefined,
  raceId: number,
  classId: number,
): boolean {
  const eff = effectiveFactionFlags(faction, flags, raceId, classId);
  if (eff & FACTION_FLAG.AT_WAR) return true;
  // An explicitly stored state is authoritative — peace the player chose stays peace.
  if (flags && Object.prototype.hasOwnProperty.call(flags, faction.id)) return false;
  return getRank(reputations, faction, raceId, classId) <= REP_RANK.HOSTILE;
}

// ReputationMgr::SetAtWar. War cannot be declared on a PEACE_FORCED faction (your own side), and
// hidden/always-invisible factions have no war state at all. Cite: ReputationMgr.cpp ~424.
export function canToggleAtWar(effFlags: number, on: boolean): boolean {
  if (effFlags & (FACTION_FLAG.INVISIBLE_FORCED | FACTION_FLAG.HIDDEN)) return false;
  if (on && (effFlags & FACTION_FLAG.PEACE_FORCED)) return false;
  return true;
}

// ReputationMgr::SetInactive. Only a visible, non-hidden faction can be parked as inactive (re-activating
// is always allowed). Cite: ReputationMgr.cpp ~456.
export function canToggleInactive(effFlags: number, on: boolean): boolean {
  if (!on) return true;
  if (effFlags & (FACTION_FLAG.INVISIBLE_FORCED | FACTION_FLAG.HIDDEN)) return false;
  return (effFlags & FACTION_FLAG.VISIBLE) !== 0;
}

// Write one flag bit for a faction, seeding the entry from its defaults so a first toggle does not silently
// drop PEACE_FORCED / VISIBLE. Returns a new map.
export function setFactionFlagBit(
  flags: FactionFlagsMap | undefined,
  faction: FactionDef,
  bit: number,
  on: boolean,
  raceId: number,
  classId: number,
): FactionFlagsMap {
  const eff = effectiveFactionFlags(faction, flags, raceId, classId);
  const next = on ? eff | bit : eff & ~bit;
  return { ...(flags ?? {}), [faction.id]: next };
}

/** Faction ids the player is currently at war with (explicit flag or Hostile-and-below rank). */
export function atWarFactionIds(
  factions: readonly FactionDef[],
  reputations: ReputationsMap | undefined,
  flags: FactionFlagsMap | undefined,
  raceId: number,
  classId: number,
): Set<number> {
  const out = new Set<number>();
  for (const f of factions) {
    if (isFactionAtWar(f, reputations, flags, raceId, classId)) out.add(f.id);
  }
  return out;
}

// Auto at-war transitions on rank change: dropping below Unfriendly forces AT_WAR, rising above it
// clears it. PEACE_FORCED, HIDDEN and INVISIBLE_FORCED still win. Cite: ReputationMgr.cpp ~331.
export function applyAutoAtWar(
  flags: number,
  rankOld: ReputationRank,
  rankNew: ReputationRank,
): number {
  if (rankNew === rankOld) return flags;
  if (flags & (FACTION_FLAG.INVISIBLE_FORCED | FACTION_FLAG.HIDDEN)) return flags;

  let f = flags;
  if (rankNew < REP_RANK.UNFRIENDLY && rankNew < rankOld && rankOld > REP_RANK.HOSTILE) {
    if (!(f & FACTION_FLAG.PEACE_FORCED)) f |= FACTION_FLAG.AT_WAR;
  } else if (rankNew > REP_RANK.UNFRIENDLY && rankNew > rankOld && rankOld < REP_RANK.NEUTRAL) {
    f &= ~FACTION_FLAG.AT_WAR;
  }
  return f;
}

// ── Modify standing + spillover ─────────────────────────────────────────────

export interface SpilloverApplied {
  faction: number;
  delta: number;
}

export interface ModifyReputationArgs {
  reputations: ReputationsMap;
  faction: FactionDef;
  delta: number;
  raceId: number;
  classId: number;
  /** When true, skip spillover (quest spillover mask bit). Default false. */
  noSpillover?: boolean;
  spillover?: readonly ReputationSpilloverDef[];
  /** Needed to resolve spillover target base standings / ranks. */
  factions?: ReadonlyMap<number, FactionDef> | readonly FactionDef[];
  flags?: FactionFlagsMap;
}

export interface ModifyReputationResult {
  reputations: ReputationsMap;
  flags?: FactionFlagsMap;
  /** Delta actually applied to the primary faction (after clamp may shrink). */
  deltaApplied: number;
  spilloverApplied: SpilloverApplied[];
}

function resolveFaction(
  factions: ReadonlyMap<number, FactionDef> | readonly FactionDef[] | undefined,
  id: number,
): FactionDef | undefined {
  if (!factions) return undefined;
  if (factions instanceof Map) return factions.get(id);
  return (factions as readonly FactionDef[]).find((f) => f.id === id);
}

function findSpillover(
  spillover: readonly ReputationSpilloverDef[] | undefined,
  factionId: number,
): ReputationSpilloverDef | undefined {
  if (!spillover) return undefined;
  return spillover.find((s) => s.faction === factionId);
}

// Apply a delta to one faction's absolute standing (no nested spillover). Writes absolute standing into the
// map. Updates flags (visible + auto at-war).
function setOneFactionReputation(
  reputations: ReputationsMap,
  faction: FactionDef,
  delta: number,
  raceId: number,
  classId: number,
  flags: FactionFlagsMap | undefined,
): {
  reputations: ReputationsMap;
  flags: FactionFlagsMap | undefined;
  deltaApplied: number;
} {
  const oldAbs = getStanding(reputations, faction, raceId, classId);
  const rankOld = reputationToRank(oldAbs);
  const newAbs = clampStanding(oldAbs + delta);
  const rankNew = reputationToRank(newAbs);
  const deltaApplied = newAbs - oldAbs;

  const nextRep: ReputationsMap = { ...reputations, [faction.id]: newAbs };

  let nextFlags = flags;
  // SetVisible on any gain. Seed from the FactionDef defaults when the faction has no stored state,
  // so the first grant cannot wipe PEACE_FORCED and declare war on your own side.
  nextFlags = setVisible(
    nextFlags,
    faction.id,
    effectiveFactionFlags(faction, nextFlags, raceId, classId),
  );
  let f = nextFlags[faction.id] ?? 0;
  f = applyAutoAtWar(f, rankOld, rankNew);
  nextFlags = { ...nextFlags, [faction.id]: f };

  return { reputations: nextRep, flags: nextFlags, deltaApplied };
}

// ModifyReputation plus spillover: spillover first (no nesting), then the primary delta clamped
// to [Bottom, Cap], then flags, then the absolute standing. Cite: ReputationMgr.cpp ~266.
export function modifyReputation(args: ModifyReputationArgs): ModifyReputationResult {
  const {
    reputations,
    faction,
    delta,
    raceId,
    classId,
    noSpillover = false,
    spillover,
    factions,
    flags,
  } = args;

  let rep = reputations;
  let fl = flags;
  const spilloverApplied: SpilloverApplied[] = [];

  if (!noSpillover && delta !== 0) {
    const tmpl = findSpillover(spillover, faction.id);
    if (tmpl) {
      for (const t of tmpl.targets) {
        if (!t.faction) continue;
        const targetDef = resolveFaction(factions, t.faction);
        if (!targetDef) continue;
        const curRank = getRank(rep, targetDef, raceId, classId);
        // rank threshold: apply only when current rank <= template rank
        if (curRank > t.rank) continue;
        // CMaNGOS: int32 spilloverRep = standing * rate (float→int trunc toward 0).
        // Mission: floor(delta * rate). For positive deltas these agree; use floor for clarity.
        const spillDelta = Math.floor(delta * t.rate);
        if (spillDelta === 0) continue;
        const one = setOneFactionReputation(rep, targetDef, spillDelta, raceId, classId, fl);
        rep = one.reputations;
        fl = one.flags;
        if (one.deltaApplied !== 0) {
          spilloverApplied.push({ faction: t.faction, delta: one.deltaApplied });
        }
      }
    }
  }

  const primary = setOneFactionReputation(rep, faction, delta, raceId, classId, fl);
  return {
    reputations: primary.reputations,
    flags: primary.flags,
    deltaApplied: primary.deltaApplied,
    spilloverApplied,
  };
}

// ── calculateReputationGain ─────────────────────────────────────────────────

// Sum SPELL_AURA_MOD_REPUTATION_GAIN from known/racial passives (Diplomacy 20599). Cite: Player.cpp:6297
// GetTotalAuraModifier(156); KI-815.
export function reputationAuraModFromSpells(
  spells: readonly { effects?: readonly { kind: string; amount?: number; factionId?: number }[] }[],
  factionId?: number,
): number {
  let total = 0;
  for (const sp of spells) {
    for (const e of sp.effects ?? []) {
      if (e.kind !== 'mod_reputation_gain' || !e.amount) continue;
      const fac = (e.factionId ?? 0) | 0;
      if (fac && (factionId == null || fac !== (factionId | 0))) continue;
      total += e.amount | 0;
    }
  }
  return total;
}

export interface CalculateReputationGainArgs {
  source: ReputationSource;
  rep: number;
  factionId: number;
  playerLevel: number;
  /** Creature level (kill) or quest level (quest). 0 ⇒ skip level penalty. */
  creatureOrQuestLevel: number;
  /** Optional aura mod total (SPELL_AURA_MOD_REPUTATION_GAIN [+ faction for kill]). Default 0. */
  repMod?: number;
  rates?: readonly ReputationRateDef[];
  /** CONFIG_FLOAT_RATE_REPUTATION_GAIN. Default 1.0. */
  rateGain?: number;
  /** CONFIG_FLOAT_RATE_REPUTATION_LOWLEVEL_KILL / QUEST. Default 0.2. */
  minRate?: number;
}

function rateForSource(
  rates: readonly ReputationRateDef[] | undefined,
  factionId: number,
  source: ReputationSource,
): number | undefined {
  if (!rates) return undefined;
  const row = rates.find((r) => r.faction === factionId);
  if (!row) return undefined;
  if (source === 'kill') return row.creature;
  if (source === 'quest') return row.quest;
  return row.spell;
}

// Player::CalculateReputationGain. Cite: Player.cpp ~6293. Aura mods omitted unless `repMod` is passed.
// Final int32 trunc toward 0.
export function calculateReputationGain(args: CalculateReputationGainArgs): number {
  const {
    source,
    rep,
    factionId,
    playerLevel,
    creatureOrQuestLevel,
    repMod = 0,
    rates,
    rateGain = DEFAULT_REPUTATION_GAIN_RATE,
    minRate: minRateArg,
  } = args;

  let percent = 100.0;
  // percent += rep > 0 ? repMod : -repMod
  percent += rep > 0 ? repMod : -repMod;

  let minRate = minRateArg;
  if (minRate === undefined) {
    if (source === 'kill' || source === 'quest') minRate = DEFAULT_LOWLEVEL_REP_MIN_RATE;
    else minRate = 1.0;
  }

  // Level zero treated as always equal — skip penalty when level is 0.
  if (creatureOrQuestLevel > 0) {
    if (source === 'kill') {
      if (isTrivialLevelDifference(playerLevel, creatureOrQuestLevel)) {
        const greenRange = getQuestGreenRange(playerLevel);
        percent *= Math.max(
          minRate,
          1.0 - 0.2 * (playerLevel - greenRange - creatureOrQuestLevel),
        );
      }
    } else if (source === 'quest') {
      // Pre-3.0.8: declines 20% per level when 6+ levels below player.
      const threshold = creatureOrQuestLevel + 5;
      if (playerLevel > threshold) {
        percent *= Math.max(
          minRate,
          1.0 - 0.2 * (playerLevel - threshold),
        );
      }
    }
  }

  if (percent <= 0) return 0;

  const repRate = rateForSource(rates, factionId, source);
  if (repRate !== undefined) {
    // rate ≤ 0 ⇒ totally disable
    if (repRate <= 0) return 0;
    percent *= repRate;
  }

  // int32(rateGain * rep * percent / 100)
  return (rateGain * rep * percent / 100) | 0;
}

// ── Kill / quest reward transforms (pure; C3 wires these) ───────────────────

export interface OnKillRepReward {
  faction: number;
  value: number;
  maxStanding: number;
  isTeamAward: boolean;
}

export interface OnKillRep {
  teamDependent: boolean;
  rewards: OnKillRepReward[];
}

export interface RewardKillArgs {
  onKillRep: OnKillRep;
  playerTeam: 'alliance' | 'horde';
  playerLevel: number;
  creatureLevel: number;
  raceId: number;
  classId: number;
  reputations: ReputationsMap;
  factions: ReadonlyMap<number, FactionDef> | readonly FactionDef[];
  rates?: readonly ReputationRateDef[];
  spillover?: readonly ReputationSpilloverDef[];
  flags?: FactionFlagsMap;
  /** Multiplier on calculated kill rep (group/share). Default 1. */
  rate?: number;
  rateGain?: number;
  minRate?: number;
  repMod?: number;
}

export interface RewardApplied {
  faction: number;
  delta: number;
  teamAward?: boolean;
}

export interface RewardKillResult {
  reputations: ReputationsMap;
  flags?: FactionFlagsMap;
  applied: RewardApplied[];
}

// Player::RewardReputation(Creature*): team-dependent rewards apply to the matching team only,
// maxStanding 0 is uncapped, and a team award adds floor(done/2). Cite: Player.cpp ~6373.
export function rewardKillReputation(args: RewardKillArgs): RewardKillResult {
  const {
    onKillRep,
    playerTeam,
    playerLevel,
    creatureLevel,
    raceId,
    classId,
    rates,
    spillover,
    rate = 1,
    rateGain,
    minRate,
    repMod,
  } = args;

  let rep = args.reputations;
  let fl = args.flags;
  const applied: RewardApplied[] = [];

  const rewards = onKillRep.rewards;
  for (let i = 0; i < rewards.length; i++) {
    const r = rewards[i]!;
    if (!r.faction) continue;

    // teamDependent: slot 0 = Alliance, slot 1 = Horde
    if (onKillRep.teamDependent) {
      if (i === 0 && playerTeam !== 'alliance') continue;
      if (i === 1 && playerTeam !== 'horde') continue;
      // extra rewards beyond 2 ignored for team pick; still process if present without team gate
      if (i > 1) continue;
    }

    const factionDef = resolveFaction(args.factions, r.faction);
    if (!factionDef) continue;

    let done = calculateReputationGain({
      source: 'kill',
      rep: r.value,
      factionId: r.faction,
      playerLevel,
      creatureOrQuestLevel: creatureLevel,
      rates,
      rateGain,
      minRate,
      repMod,
    });
    done = (done * rate) | 0;

    // Primary grant gated by maxStanding, where 0 is uncapped. The team award is OUTSIDE this
    // gate and still applies when the primary is blocked. Cite: Player.cpp ~6389–6392.
    const currentRank = getRank(rep, factionDef, raceId, classId);
    const primaryAllowed =
      done !== 0 && (r.maxStanding === 0 || currentRank <= r.maxStanding);

    if (primaryAllowed) {
      const mod = modifyReputation({
        reputations: rep,
        faction: factionDef,
        delta: done,
        raceId,
        classId,
        spillover,
        factions: args.factions,
        flags: fl,
      });
      rep = mod.reputations;
      fl = mod.flags;
      if (mod.deltaApplied !== 0) {
        applied.push({ faction: r.faction, delta: mod.deltaApplied });
      }
    }

    // Team award: half to faction.team even if maxStanding blocked primary.
    // Cite: Player.cpp ~6394–6400 (is_teamaward outside the max_cap if).
    if (r.isTeamAward && factionDef.team && done !== 0) {
      const teamDef = resolveFaction(args.factions, factionDef.team);
      if (teamDef) {
        const half = (done / 2) | 0;
        if (half !== 0) {
          const teamMod = modifyReputation({
            reputations: rep,
            faction: teamDef,
            delta: half,
            raceId,
            classId,
            spillover,
            factions: args.factions,
            flags: fl,
          });
          rep = teamMod.reputations;
          fl = teamMod.flags;
          if (teamMod.deltaApplied !== 0) {
            applied.push({
              faction: teamDef.id,
              delta: teamMod.deltaApplied,
              teamAward: true,
            });
          }
        }
      }
    }
  }

  return { reputations: rep, flags: fl, applied };
}

export interface RewardQuestArgs {
  rewRep: ReadonlyArray<{ faction: number; value: number }>;
  playerLevel: number;
  questLevel: number;
  raceId: number;
  classId: number;
  reputations: ReputationsMap;
  factions: ReadonlyMap<number, FactionDef> | readonly FactionDef[];
  rates?: readonly ReputationRateDef[];
  spillover?: readonly ReputationSpilloverDef[];
  flags?: FactionFlagsMap;
  rateGain?: number;
  minRate?: number;
  repMod?: number;
  // Per-index spillover mask (Quest ReputationSpilloverMask). Bit set ⇒ noSpillover. Not baked yet; default
  // 0 (spillover allowed). Cite: Player.cpp ~6421.
  spilloverMask?: number;
}

export interface RewardQuestResult {
  reputations: ReputationsMap;
  flags?: FactionFlagsMap;
  applied: RewardApplied[];
}

// Player::RewardReputation(Quest*). Cite: Player.cpp ~6421. Applies each rewRep via calculate + modify.
// noSpillover from mask bit (default all spill).
export function rewardQuestReputation(args: RewardQuestArgs): RewardQuestResult {
  const {
    rewRep,
    playerLevel,
    questLevel,
    raceId,
    classId,
    rates,
    spillover,
    rateGain,
    minRate,
    repMod,
    spilloverMask = 0,
  } = args;

  let rep = args.reputations;
  let fl = args.flags;
  const applied: RewardApplied[] = [];

  for (let i = 0; i < rewRep.length; i++) {
    const entry = rewRep[i]!;
    if (!entry.faction || !entry.value) continue;

    const factionDef = resolveFaction(args.factions, entry.faction);
    if (!factionDef) continue;

    const done = calculateReputationGain({
      source: 'quest',
      rep: entry.value,
      factionId: entry.faction,
      playerLevel,
      creatureOrQuestLevel: questLevel,
      rates,
      rateGain,
      minRate,
      repMod,
    });
    if (done === 0) continue;

    const noSpillover = (spilloverMask & (1 << i)) !== 0;
    const mod = modifyReputation({
      reputations: rep,
      faction: factionDef,
      delta: done,
      raceId,
      classId,
      noSpillover,
      spillover,
      factions: args.factions,
      flags: fl,
    });
    rep = mod.reputations;
    fl = mod.flags;
    if (mod.deltaApplied !== 0) {
      applied.push({ faction: entry.faction, delta: mod.deltaApplied });
    }
  }

  return { reputations: rep, flags: fl, applied };
}

export interface RewardSpellArgs {
  /** EffectMiscValue — the Faction.dbc id. */
  factionId: number;
  /** m_currentBasePoints — the raw rep change before the source rate. */
  repChange: number;
  playerLevel: number;
  raceId: number;
  classId: number;
  reputations: ReputationsMap;
  factions: ReadonlyMap<number, FactionDef> | readonly FactionDef[];
  rates?: readonly ReputationRateDef[];
  spillover?: readonly ReputationSpilloverDef[];
  flags?: FactionFlagsMap;
  rateGain?: number;
  repMod?: number;
}

// Spell::EffectReputation — CalculateReputationGain(REPUTATION_SOURCE_SPELL, …) then ModifyReputation. No
// spillover mask on the spell path, so spillover applies. Cite: SpellEffects.cpp:4908–4926.
export function rewardSpellReputation(args: RewardSpellArgs): RewardQuestResult {
  const { factionId, repChange, playerLevel, raceId, classId, rates, spillover, rateGain, repMod } = args;
  const applied: RewardApplied[] = [];
  const factionDef = resolveFaction(args.factions, factionId);
  // Cite: :4918–4921 — no FactionStore row ⇒ return.
  if (!factionId || !repChange || !factionDef) {
    return { reputations: args.reputations, flags: args.flags, applied };
  }
  const done = calculateReputationGain({
    source: 'spell',
    rep: repChange,
    factionId,
    playerLevel,
    // Spell source skips the level-trivial cut, so creatureOrQuestLevel is the player's own.
    creatureOrQuestLevel: playerLevel,
    rates,
    rateGain,
    repMod,
  });
  if (done === 0) return { reputations: args.reputations, flags: args.flags, applied };
  const mod = modifyReputation({
    reputations: args.reputations,
    faction: factionDef,
    delta: done,
    raceId,
    classId,
    spillover,
    factions: args.factions,
    flags: args.flags ?? {},
  });
  if (mod.deltaApplied !== 0) applied.push({ faction: factionId, delta: mod.deltaApplied });
  return { reputations: mod.reputations, flags: mod.flags, applied };
}

// ── Gating / vendor helpers ─────────────────────────────────────────────────

// Vendor price multiplier from reputation rank: Honored+ is 0.9, else 1.0. The PvP-grade half is
// omitted — no honor-rank check without FactionTemplate data. Cite: Player.cpp ~18339.
export function reputationPriceDiscount(
  rank: ReputationRank | number,
  visualRank?: number,
  isFriendly?: boolean,
): number {
  let discount = 100;
  if (rank >= REP_RANK.HONORED) {
    discount -= 10;
  }
  if (visualRank != null && visualRank >= 3 && isFriendly) {
    discount -= 10;
  }
  return discount / 100.0;
}

/** Item/vendor gate: standing rank must be >= required rank. */
export function meetsRequiredRep(
  standingRank: ReputationRank | number,
  requiredRank: ReputationRank | number,
): boolean {
  return standingRank >= requiredRank;
}

// Quest SatisfyQuestReputation-style: required min rank (must have >=). For absolute standing min values,
// callers compare getStanding(...) >= minValue.
export function rankMeetsMin(
  standingRank: ReputationRank | number,
  minRank: ReputationRank | number,
): boolean {
  return standingRank >= minRank;
}

// Quest RequiredMaxRep: must have rank < maxRank (strict). For absolute standing max values, callers
// compare getStanding(...) < maxValue.
export function rankMeetsMax(
  standingRank: ReputationRank | number,
  maxRank: ReputationRank | number,
): boolean {
  return standingRank < maxRank;
}
