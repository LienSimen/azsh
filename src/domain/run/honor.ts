// The classic honor system, a port of MaNGOS::Honor rather than a curve of our own: a kill pays
// contribution points, the weekly pass maps your position onto a fixed curve, and rank reads off RP.

import { detExp } from '../../engine/core/detMath.ts';
import { durMs } from '../../engine/spells/interpreter/duration.ts';

/** Player.h:362-364. */
export const NEGATIVE_HONOR_RANK_COUNT = 4;
export const POSITIVE_HONOR_RANK_COUNT = 15;
export const HONOR_RANK_COUNT = 19;

// Contribution points for one honorable kill of a level-`level` victim, the Formulas.h:37 curve. BG
// bonus honor uses the same function.
export function hkHonorAtLevel(level: number, count = 1): number {
  return Math.ceil(count * (-0.53177 + 0.59357 * detExp((level + 23.54042) / 26.07859)));
}

/** Formulas.h HonorRankInfo. `rank` is 0..18; `visualRank` is the 1..14 the player sees. */
export interface HonorRankInfo {
  positive: boolean;
  rank: number;
  visualRank: number;
  maxRP: number;
  minRP: number;
}

/** Cite: Formulas.h:43 InitRankInfo. */
export function initRankInfo(): HonorRankInfo {
  return { positive: true, rank: 0, visualRank: 0, maxRP: 2000, minRP: 0 };
}

/** Cite: Formulas.h:52 CalculateRankInfo. */
export function calculateRankInfo(prk: HonorRankInfo): HonorRankInfo {
  if (prk.rank === 0) return initRankInfo();
  const rank = prk.positive
    ? prk.rank - NEGATIVE_HONOR_RANK_COUNT - 1
    : prk.rank - NEGATIVE_HONOR_RANK_COUNT;
  let maxRP = rank * 5000;
  if (maxRP < 0) maxRP *= -1;
  const minRP = maxRP > 5000 ? maxRP - 5000 : 2000;
  const visualRank = prk.rank > NEGATIVE_HONOR_RANK_COUNT
    ? prk.rank - NEGATIVE_HONOR_RANK_COUNT
    : prk.rank * -1;
  return { ...prk, maxRP, minRP, visualRank };
}

// Rank from rank points. The first two bands are 0-2000 and 2000-5000; every band above that is 5000 RP
// wide. Negative RP gives a negative rank. Cite: Formulas.h:71 CalculateHonorRank.
export function calculateHonorRank(honorPoints: number): HonorRankInfo {
  const prk = initRankInfo();
  if (honorPoints === 0) return prk;

  prk.positive = honorPoints > 0;
  const hp = prk.positive ? honorPoints : -honorPoints;

  const rCount = prk.positive ? POSITIVE_HONOR_RANK_COUNT - 2 : NEGATIVE_HONOR_RANK_COUNT;
  const firstRank = prk.positive ? NEGATIVE_HONOR_RANK_COUNT + 1 : 1;

  if (hp < 2000) {
    prk.rank = prk.positive ? firstRank : NEGATIVE_HONOR_RANK_COUNT;
  } else if (hp > (rCount - 1) * 5000) {
    prk.rank = prk.positive ? HONOR_RANK_COUNT - 1 : firstRank;
  } else {
    // uint32 truncation, not rounding.
    const step = Math.trunc(hp / 5000) + firstRank;
    prk.rank = prk.positive ? step + 1 : NEGATIVE_HONOR_RANK_COUNT - step;
  }
  return calculateRankInfo(prk);
}

// Weekly standings

/** One row of the weekly standing list: a player and the CP they banked this week. */
export interface HonorStanding {
  guid: string;
  honorPoints: number;
}

/** Formulas.h HonorScores — the piecewise curve CP is interpolated on. */
export interface HonorScores {
  FX: number[];
  FY: number[];
  BRK: number[];
}

/** The 14 fixed breakpoint fractions. Cite: Formulas.h:110-124. */
const BREAKPOINTS = [
  1.0, 0.858, 0.715, 0.587, 0.477, 0.377, 0.287, 0.207, 0.137, 0.077, 0.037, 0.017, 0.007, 0.002,
] as const;

// Build the week's CP-to-RP curve from the ACTUAL standing list for one team. The list must be sorted
// by honorPoints DESCENDING, so position 1 is the top scorer. Cite: Formulas.h:105.
export function generateScores(standingList: readonly HonorStanding[]): HonorScores {
  const BRK: number[] = [];
  for (let group = 0; group < 14; group++) {
    BRK[group] = Math.floor(BREAKPOINTS[group]! * standingList.length + 0.5);
  }

  const FY: number[] = [0, 400];
  for (let i = 2; i <= 13; i++) FY[i] = (i - 1) * 1000;
  FY[14] = 13000;

  /** GetHonorStandingByPosition — 1-based, undefined past the end. */
  const at = (pos: number): HonorStanding | undefined =>
    (pos >= 1 && pos <= standingList.length ? standingList[pos - 1] : undefined);

  const FX: number[] = [0];
  for (let i = 1; i <= 13; i++) {
    let honor = 0;
    const a = at(BRK[i]!);
    if (a) {
      honor += a.honorPoints;
      const b = at(BRK[i]! + 1);
      if (b) honor += b.honorPoints;
    }
    FX[i] = honor ? honor / 2 : 0;
  }
  // Always pin the top scorer. C++ does `FX[14] = FX[13] ? top : 0`; BRK[13] = round(0.002*n)
  // is 0 for n<250, so standing 1 earned ~1000 RP (rank 1) instead of 13000 (rank 4.6).
  FX[14] = standingList[0]?.honorPoints ?? 0;

  return { FX, FY, BRK };
}

/** Control points with collapsed BRK holes dropped, so FX stays increasing. Cite: Formulas.h:172. */
function rpCurvePoints(sc: HonorScores): { fx: number; fy: number }[] {
  const pts: { fx: number; fy: number }[] = [{ fx: sc.FX[0] ?? 0, fy: sc.FY[0] ?? 0 }];
  for (let i = 1; i <= 13; i++) {
    if ((sc.BRK[i] ?? 0) > 0) pts.push({ fx: sc.FX[i] ?? 0, fy: sc.FY[i] ?? 0 });
  }
  const topFx = sc.FX[14] ?? 0;
  const lastFx = pts[pts.length - 1]?.fx ?? 0;
  if (topFx > lastFx) pts.push({ fx: topFx, fy: sc.FY[14] ?? 13000 });
  return pts;
}

// Interpolate CP→RP on the real control points. A BRK that rounded to 0 is a hole, not a floor.
export function calculateRpEarning(cp: number, sc: HonorScores): number {
  const pts = rpCurvePoints(sc);
  let i = 0;
  while (i < pts.length && pts[i]!.fx <= cp) i++;
  if (i === 0) return pts[0]!.fy;
  if (i >= pts.length) return pts[pts.length - 1]!.fy;
  const hi = pts[i]!;
  const lo = pts[i - 1]!;
  if (hi.fx === lo.fx) return lo.fy;
  return (hi.fy - lo.fy) * (cp - lo.fx) / (hi.fx - lo.fx) + lo.fy;
}

// Apply this week's earning to a standing: 20 % decay, halved losses, floored at -2500. Cite:
// Formulas.h:184 CalculateRpDecay.
export function calculateRpDecay(rpEarning: number, rp: number): number {
  const decay = Math.floor(0.2 * rp + 0.5);
  let delta = rpEarning - decay;
  if (delta < 0) delta = delta / 2;
  if (delta < -2500) delta = -2500;
  return rp + delta;
}

/** CP LOST for a dishonorable kill (civilian). Capped at 100. Cite: Formulas.h:199. */
export function dishonorableKillPoints(level: number): number {
  let result = 10;
  if (level >= 30 && level <= 35) result += 1.5 * (level - 29);
  if (level >= 36 && level <= 41) result += 9 + 2 * (level - 35);
  if (level >= 42 && level <= 50) result += 21 + 3.2 * (level - 41);
  if (level >= 51) result += 50 + 4 * (level - 50);
  return result > 100 ? 100 : result;
}

// CP for one honorable kill: falls off with repeat kills of the same victim today, scales with the
// victim's visual rank and the level ratio, caps at 400, and is split across the group.
export function honorableKillPoints(
  killer: { level: number; rankPoints: number },
  victim: { level: number; rankPoints: number; visualRank: number },
  groupSize: number,
  totalKillsToday: number,
): number {
  if (!groupSize || killer.level <= 0 || victim.level <= 0) return 0;
  const diffHonor = victim.rankPoints / (killer.rankPoints + 1) + 1;
  const diffLevel = victim.level * (1.0 / killer.level);
  const f = Math.max(0, 10 - totalKillsToday);
  const honorPoints = Math.trunc(
    f * 0.25 * ((killer.level + (victim.visualRank * 5 + 1)) * (1 + 0.05 * diffHonor) * diffLevel),
  );
  // INTEGER division: `honor_points` is int and `groupsize` uint32, so the C++ truncates
  // before the float return. A 165 CP kill split by 2 pays 82 each, not 82.5.
  return Math.trunc((honorPoints <= 400 ? honorPoints : 400) / groupSize);
}

// Battleground bracket honor

// BG_BRACKET_ID 0..5 — 10-level ranges from the BG's MinLevel; everything above MaxLevel folds into the
// last. Cite: BattleGround.h BattleGroundBracketId; battleground_template.
export function bgBracketId(level: number, bgMinLevel: number, bgMaxLevel: number): number {
  const lvl = Math.max(bgMinLevel, Math.min(level | 0, bgMaxLevel));
  return Math.max(0, Math.min(5, Math.floor((lvl - bgMinLevel) / 10)));
}

/** BG_WSG_FlagCapturedHonor — honor per flag capture, by bracket. Cite: BattleGroundWS.h. */
export const WSG_FLAG_CAPTURED_HONOR = [48, 82, 136, 226, 378, 396] as const;
/** BG_WSG_WinMatchHonor — honor for winning, by bracket. Cite: BattleGroundWS.h. */
export const WSG_WIN_MATCH_HONOR = [24, 41, 68, 113, 189, 198] as const;

/**
 * BattleGround::RewardMark — the Marks of Honor a match pays. Every player on the winning team is
 * cast the winner spell (3 marks), everyone else the loser spell (1); a draw pays the loser count
 * to both. The spells are conjures, so the item and the count come off the bake, not from here.
 * Cite: BattleGround.cpp:824-830 RewardMark(ITEM_WINNER_COUNT|ITEM_LOSER_COUNT); :890-914
 *       RewardMark/RewardSpellCast; BattleGround.h:69-80.
 */
export const BG_MARK_SPELL = {
  wsg: { winner: 24951, loser: 24950 },
  ab: { winner: 24953, loser: 24952 },
  av: { winner: 24955, loser: 24954 },
} as const;

export type BgMarkMode = keyof typeof BG_MARK_SPELL;

// Per-character ledger

// Serializable honor progress. The internals keep the MaNGOS names, cp and rp, while the Honor tab
// shows the classic period breakdown — Today, Yesterday, This Week, Last Week, Lifetime.
export interface HonorState {
  /** This week's contribution (UI: This Week → Honor). Zeroed by the weekly pass. */
  cp: number;
  // Spendable Honor Points (UI: Honor Points). PRODUCT RULE — 1.12 has no honor currency, so this
  // is the TBC purse riding the classic ladder. Earned with `cp`; the weekly pass never touches it.
  honorPoints: number;
  /** Honor Points ever earned. Never spent down. */
  lifetimeHonorPoints: number;
  /** Rank points — rank title is derived from this; never shown as "RP" in UI. */
  rp: number;
  /** Lifetime honorable kills. */
  lifetimeKills: number;
  /** Lifetime dishonorable kills. */
  dishonorableKills: number;
  /** ISO date (YYYY-MM-DD) today's counters / killsToday belong to. */
  killsDate: string;
  /** victim id → times killed on `killsDate` (same-victim diminishing). */
  killsToday: Record<string, number>;
  /** Today honorable kills (PLAYER_FIELD_SESSION_KILLS lo). */
  todayHk: number;
  /** Today dishonorable kills (PLAYER_FIELD_SESSION_KILLS hi). */
  todayDk: number;
  /** Today contribution (rolled into yesterdayHonor on day change). */
  todayHonor: number;
  /** Yesterday honorable kills. */
  yesterdayHk: number;
  /** Yesterday contribution (UI: Yesterday → Honor). */
  yesterdayHonor: number;
  /** This week honorable kills. */
  thisWeekHk: number;
  /** Last week honorable kills. */
  lastWeekHk: number;
  /** Last week contribution (UI: Last Week → Honor). */
  lastWeekHonor: number;
  /** Last week standing position (0 = none). */
  lastWeekStanding: number;
  /** Peak positive visualRank 0..15 (UI: Lifetime → Highest Rank). */
  highestRank: number;
}

export function newHonorState(): HonorState {
  return {
    cp: 0,
    honorPoints: 0,
    lifetimeHonorPoints: 0,
    rp: 0,
    lifetimeKills: 0,
    dishonorableKills: 0,
    killsDate: '',
    killsToday: {},
    todayHk: 0,
    todayDk: 0,
    todayHonor: 0,
    yesterdayHk: 0,
    yesterdayHonor: 0,
    thisWeekHk: 0,
    lastWeekHk: 0,
    lastWeekHonor: 0,
    lastWeekStanding: 0,
    highestRank: 0,
  };
}

// GetHonorHighestRankInfo().rank — the peak rank ever HELD, on the internal 0..18 scale item gates
// use. HonorState stores the peak VISUAL rank, so it is shifted back over the four negative bands.
export function highestInternalRank(state: Pick<HonorState, 'highestRank'> | null | undefined): number {
  const visual = state?.highestRank ?? 0;
  return visual > 0 ? visual + NEGATIVE_HONOR_RANK_COUNT : 0;
}

// item_template.requiredhonorrank as a player-facing title ("Requires Knight"). The baked value is the
// internal rank, so subtract the negative bands to index PVP_RANKS.
export function honorRankRequirementTitle(requiredHonorRank: number, faction: Faction): string {
  const visual = (requiredHonorRank | 0) - NEGATIVE_HONOR_RANK_COUNT;
  const entry = visual >= 1 && visual <= 14 ? PVP_RANKS[visual - 1] : undefined;
  return entry ? rankTitle(entry, faction) : `rank ${Math.max(1, visual)}`;
}

export interface KillResult {
  state: HonorState;
  /** CP gained (honorable) or RP lost (dishonorable, negative). */
  cp: number;
  dishonorable: boolean;
}

/** Bump highestRank when current visual rank is a new peak. Cite: Player.cpp:6528. */
function withHighestRank(state: HonorState): HonorState {
  const v = visualRankHeld(state.rp);
  return v > state.highestRank ? { ...state, highestRank: v } : state;
}

// Day rollover: freeze previous today → yesterday, clear today counters + victim DR map. Cite:
// Player.cpp:6442 date buckets.
function rolled(state: HonorState, today: string): HonorState {
  if (state.killsDate === today) return state;
  if (!state.killsDate) {
    return { ...state, killsDate: today, killsToday: {} };
  }
  return {
    ...state,
    killsDate: today,
    killsToday: {},
    yesterdayHk: state.todayHk,
    yesterdayHonor: Math.max(0, Math.trunc(state.todayHonor)),
    todayHk: 0,
    todayDk: 0,
    todayHonor: 0,
  };
}

// Bank an honorable kill. `today` is an ISO date the caller supplies — this module takes no clock, so the
// same inputs always give the same result.
export function recordHonorableKill(
  state: HonorState,
  killer: { level: number },
  victim: { id: string; level: number; rankPoints: number },
  today: string,
  groupSize = 1,
): KillResult {
  const s = rolled(state, today);
  const prior = s.killsToday[victim.id] ?? 0;
  const vRank = calculateHonorRank(victim.rankPoints).visualRank;
  const cp = honorableKillPoints(
    { level: killer.level, rankPoints: s.rp },
    { level: victim.level, rankPoints: victim.rankPoints, visualRank: vRank },
    groupSize,
    prior,
  );
  const paid = cp > 0;
  return {
    state: withHighestRank({
      ...s,
      cp: s.cp + cp,
      honorPoints: s.honorPoints + cp,
      lifetimeHonorPoints: s.lifetimeHonorPoints + cp,
      todayHonor: s.todayHonor + cp,
      lifetimeKills: s.lifetimeKills + (paid ? 1 : 0),
      todayHk: s.todayHk + (paid ? 1 : 0),
      thisWeekHk: s.thisWeekHk + (paid ? 1 : 0),
      killsToday: { ...s.killsToday, [victim.id]: prior + 1 },
    }),
    cp,
    dishonorable: false,
  };
}

// Bank a DISHONORABLE kill (a civilian). RP is docked immediately rather than at the weekly pass. Cite:
// Player.cpp:6690.
export function recordDishonorableKill(
  state: HonorState,
  victimLevel: number,
  today: string,
): KillResult {
  const s = rolled(state, today);
  const lost = dishonorableKillPoints(victimLevel);
  return {
    state: withHighestRank({
      ...s,
      rp: s.rp - lost,
      dishonorableKills: s.dishonorableKills + 1,
      todayDk: s.todayDk + 1,
    }),
    cp: -lost,
    dishonorable: true,
  };
}

// Honorless Target. Classic DB: only spell 2479 uses aura 159. Cite: spells.json id 2479;
// SpellAuras.cpp:220; Player.cpp:6626–6627 RewardHonor.
export const SPELL_HONORLESS_TARGET = 2479;
/** durationIndex 9. Cite: spells.json id 2479; duration.ts FALLBACK_DURATION_MS[9]. */
export const HONORLESS_TARGET_DURATION_MS = durMs(9) ?? 0;

// Player::RewardHonor returns false while the victim holds aura 2479. Cite: Player.cpp:6626–6627
// GetAura(2479, EFFECT_INDEX_0).
export function victimGrantsPvpCredit(
  honorlessUntilMs: number | undefined,
  nowMs: number,
): boolean {
  return honorlessUntilMs == null || nowMs >= honorlessUntilMs;
}

// Award flat bonus honor (BG objectives / GetBonusHonorFromKill). `opts.today` rolls the day bucket;
// `opts.asKill` also tallies an HK (BG kill credit).
export function addBonusHonor(
  state: HonorState,
  amount: number,
  opts?: { today?: string; asKill?: boolean },
): HonorState {
  const a = Math.max(0, Math.trunc(amount));
  if (a <= 0 && !opts?.asKill) return state;
  let s = opts?.today ? rolled(state, opts.today) : state;
  s = {
    ...s,
    cp: s.cp + a,
    honorPoints: s.honorPoints + a,
    lifetimeHonorPoints: s.lifetimeHonorPoints + a,
    todayHonor: s.todayHonor + a,
  };
  if (opts?.asKill) {
    s = {
      ...s,
      todayHk: s.todayHk + 1,
      thisWeekHk: s.thisWeekHk + 1,
      lifetimeKills: s.lifetimeKills + 1,
    };
  }
  return withHighestRank(s);
}

// Pay `amount` Honor Points. Null when the purse is short, so a caller that cannot afford the line
// keeps the state it had. The weekly pass never sees this field — spending cannot cost you rank.
export function spendHonorPoints(state: HonorState, amount: number): HonorState | null {
  const cost = Math.max(0, Math.trunc(amount));
  if (cost <= 0) return state;
  if (state.honorPoints < cost) return null;
  return { ...state, honorPoints: state.honorPoints - cost };
}

// The weekly pass for ONE character against the week's real standing list. Freezes this-week counters
// into last-week for the UI, then resets. Cite: ObjectMgr.cpp:3843 DistributeRankPoints.
export function distributeRankPoints(
  state: HonorState,
  scores: HonorScores,
  standingPos = 0,
): HonorState {
  const earning = calculateRpEarning(state.cp, scores);
  return withHighestRank({
    ...state,
    rp: calculateRpDecay(earning, state.rp),
    lastWeekHk: state.thisWeekHk,
    lastWeekHonor: Math.max(0, Math.trunc(state.cp)),
    lastWeekStanding: Math.max(0, Math.trunc(standingPos)),
    thisWeekHk: 0,
    cp: 0,
  });
}

// ---- PvP rank titles --------------------------------------------------------

export type Faction = 'alliance' | 'horde';

export interface PvpRank {
  /** visualRank 1..15. */
  rank: number;
  alliance: string;
  horde: string;
}

// The 14 classic PvP ranks plus rank 15 at the RP ceiling. Alliance and Horde use different titles
// for the sourced 14; rank 15 does not. Badge art is shared, faction emblems are separate.
export const PVP_RANKS: readonly PvpRank[] = [
  { rank: 1, alliance: 'Private', horde: 'Scout' },
  { rank: 2, alliance: 'Corporal', horde: 'Grunt' },
  { rank: 3, alliance: 'Sergeant', horde: 'Sergeant' },
  { rank: 4, alliance: 'Master Sergeant', horde: 'Senior Sergeant' },
  { rank: 5, alliance: 'Sergeant Major', horde: 'First Sergeant' },
  { rank: 6, alliance: 'Knight', horde: 'Stone Guard' },
  { rank: 7, alliance: 'Knight-Lieutenant', horde: 'Blood Guard' },
  { rank: 8, alliance: 'Knight-Captain', horde: 'Legionnaire' },
  { rank: 9, alliance: 'Knight-Champion', horde: 'Centurion' },
  { rank: 10, alliance: 'Lieutenant Commander', horde: 'Champion' },
  { rank: 11, alliance: 'Commander', horde: 'Lieutenant General' },
  { rank: 12, alliance: 'Marshal', horde: 'General' },
  { rank: 13, alliance: 'Field Marshal', horde: 'Warlord' },
  { rank: 14, alliance: 'Grand Marshal', horde: 'High Warlord' },
  { rank: 15, alliance: 'City Defender', horde: 'City Defender' },
] as const;

// Rank 15 is the RP ceiling: Formulas.h:71 clamps visual at 14, weekly pass converges at 64,998
// (47 #1 weeks of 13,000 against 20% decay). PRODUCT RULE.
export const CITY_DEFENDER_MIN_RP = 64_998;

function visualRankHeld(rp: number): number {
  if (rp >= CITY_DEFENDER_MIN_RP) return 15;
  const info = calculateHonorRank(rp);
  return info.positive && info.visualRank > 0 ? info.visualRank : 0;
}

/** True at rank 15. Travel reads this for the capital-teleport grant. */
export function isCityDefender(state: HonorState | null | undefined): boolean {
  return visualRankHeld(state?.rp ?? 0) >= 15;
}

/** Rank held at `rp`, or undefined below rank 1 (RP 0 and negative ranks have no title). */
export function rankForRp(rp: number): PvpRank | undefined {
  const visual = visualRankHeld(rp);
  if (visual < 1) return undefined;
  return PVP_RANKS[visual - 1];
}

/** The faction-appropriate title for a rank (Alliance ≠ Horde names). */
export function rankTitle(rank: PvpRank, faction: Faction): string {
  return faction === 'alliance' ? rank.alliance : rank.horde;
}

/** The title the sheet prints, or nothing (RP 0 and the four negative bands have no title). */
export function honorTitle(
  state: HonorState | null | undefined,
  faction: Faction,
): string | null {
  const rank = rankForRp(state?.rp ?? 0);
  return rank ? rankTitle(rank, faction) : null;
}

// Curated public/ui path for a visual rank badge (1..14), or the faction emblem when unranked. Art from
// Interface\PvPRankBadges (seed-ui.mjs → public/ui/pvprank-*.png).
export function pvpRankBadgeSrc(visualRank: number, faction: Faction): string {
  const badge = visualRank >= 15 ? 14 : visualRank;
  if (badge >= 1 && badge <= 14) {
    return `/ui/pvprank-${String(badge).padStart(2, '0')}.png`;
  }
  return pvpFactionEmblemSrc(faction);
}

/** Alliance lion / Horde crest — faction-only emblems (not rank chevrons). */
export function pvpFactionEmblemSrc(faction: Faction): string {
  return faction === 'horde' ? '/ui/pvprank-horde.png' : '/ui/pvprank-alliance.png';
}

/** Progress through the current RP band, 0..1 — for a rank bar. */
export function rankProgress(rp: number): { info: HonorRankInfo; pct: number } {
  const info = calculateHonorRank(rp);
  const span = info.maxRP - info.minRP;
  const pct = span > 0 ? Math.max(0, Math.min(1, (Math.abs(rp) - info.minRP) / span)) : 0;
  return { info, pct };
}

/** Integer rank plus within-band progress (13000 RP → 4.6). Rank 15 has no band above it. */
export function visualRankDecimal(rp: number): number {
  const visual = visualRankHeld(rp);
  if (visual < 1) return 0;
  if (visual >= 15) return 15;
  return visual + rankProgress(rp).pct;
}
