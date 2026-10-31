// The weekly honor maintenance — the pass that turns a week of contribution points into a RANK. Rank
// is RELATIVE, so the ledger records every character who fought; the pass runs on maintenance day.

import {
  distributeRankPoints,
  generateScores,
  newHonorState,
  rankForRp,
  type HonorStanding,
  type HonorState,
} from './honor.ts';

/** tm_wday of the maintenance day. 3 = Wednesday. Cite: mangosd.conf.dist MaintenanceDay = 3. */
export const MAINTENANCE_DAY = 3;

/** The player's own key in the standing ledger. Bots use their character name. */
export const PLAYER_STANDING_KEY = '@player';

// CMaNGOS drops anyone below the min-kills floor before building the curve. The shipped default 15
// would empty our roster, so the field stays and is 1 — a character with no kill is not a standing.
export const MIN_HONOR_KILLS = 1;

/** One character's week: what they banked and how many honorable kills paid for it. */
export interface WeeklyStandingRow {
  /** Contribution points banked this week. */
  cp: number;
  /** Honorable kills this week — the MIN_HONOR_KILLS gate reads this. */
  hk: number;
}

// The realm's weekly standing ledger. `weekStart` is the ISO date of the maintenance day the open week
// began on, so a stale ledger is what tells the pass it is owed.
export interface HonorWeekLedger {
  /** ISO date (YYYY-MM-DD) of the maintenance day this open week started on. */
  weekStart: string;
  /** character key → this week's contribution. Includes `@player`. */
  rows: Record<string, WeeklyStandingRow>;
}

export function newHonorWeekLedger(weekStart = ''): HonorWeekLedger {
  return { weekStart, rows: {} };
}

/** Local-time ISO date (YYYY-MM-DD). `Date.prototype.toISOString` would shift the day in UTC-. */
function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// The most recent maintenance day at or before `nowMs`, as a local ISO date. Today IS the boundary
// when today is maintenance day. Cite: World.h:461-467 GetDateLastMaintenanceDay.
export function lastMaintenanceDate(nowMs: number, maintenanceDay = MAINTENANCE_DAY): string {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() - maintenanceDay + 7) % 7;
  d.setDate(d.getDate() - back);
  return localIsoDate(d);
}

/** How many whole maintenance weeks separate two boundary dates (0 when same or in the future). */
export function weeksBetween(fromIsoDate: string, toIsoDate: string): number {
  const a = Date.parse(`${fromIsoDate}T00:00:00`);
  const b = Date.parse(`${toIsoDate}T00:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / (7 * 24 * 60 * 60 * 1000));
}

/** Bank `cp` (and `hk` kills) for one character in the open week. Pure. */
export function recordWeeklyContribution(
  ledger: HonorWeekLedger,
  key: string,
  cp: number,
  hk = 0,
): HonorWeekLedger {
  const addCp = Math.max(0, Math.trunc(cp));
  const addHk = Math.max(0, Math.trunc(hk));
  if (addCp <= 0 && addHk <= 0) return ledger;
  const prev = ledger.rows[key] ?? { cp: 0, hk: 0 };
  return {
    ...ledger,
    rows: { ...ledger.rows, [key]: { cp: prev.cp + addCp, hk: prev.hk + addHk } },
  };
}

// The standing list GenerateScores wants: sorted by CP DESCENDING with everyone below the kill floor
// dropped. Ties break on the key, so the order is deterministic under lockstep.
export function standingListOf(ledger: HonorWeekLedger): HonorStanding[] {
  return Object.entries(ledger.rows)
    .filter(([, r]) => r.hk >= MIN_HONOR_KILLS && r.cp > 0)
    .map(([guid, r]) => ({ guid, honorPoints: r.cp }))
    .sort((a, b) => b.honorPoints - a.honorPoints || (a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0));
}

/** 1-based position of `key` in the standing list, or 0 when it is not on it. */
export function standingPositionOf(list: readonly HonorStanding[], key: string): number {
  for (let i = 0; i < list.length; i++) {
    if (list[i]!.guid === key) return i + 1;
  }
  return 0;
}

export interface MaintenanceResult {
  honor: HonorState;
  ledger: HonorWeekLedger;
  /** Maintenance passes actually run (0 = nothing was owed). */
  passes: number;
  /** Visual rank before and after, so a caller can announce a promotion. */
  rankBefore: number;
  rankAfter: number;
  /** Standing position the last pass scored the player at (0 = not on the list). */
  standing: number;
}

// Run every maintenance pass this save owes, oldest first. The first scores the recorded week; any
// further owed pass scores an empty one, a pure 20% decay. An unstamped ledger adopts this week.
export function runHonorMaintenance(
  honor: HonorState | null | undefined,
  ledger: HonorWeekLedger | null | undefined,
  nowMs: number,
  maintenanceDay = MAINTENANCE_DAY,
): MaintenanceResult {
  let h = honor ?? newHonorState();
  let led = ledger ?? newHonorWeekLedger();
  const today = lastMaintenanceDate(nowMs, maintenanceDay);
  const rankBefore = visualOf(h);

  if (!led.weekStart) {
    return {
      honor: h,
      ledger: { ...led, weekStart: today },
      passes: 0,
      rankBefore,
      rankAfter: rankBefore,
      standing: 0,
    };
  }

  const owed = weeksBetween(led.weekStart, today);
  if (owed <= 0) {
    return { honor: h, ledger: led, passes: 0, rankBefore, rankAfter: rankBefore, standing: 0 };
  }

  let standing = 0;
  for (let i = 0; i < owed; i++) {
    // Only the first owed pass has a recorded week; later ones ran while the save was closed.
    const week = i === 0 ? led : newHonorWeekLedger();
    const list = standingListOf(week);
    const pos = standingPositionOf(list, PLAYER_STANDING_KEY);
    h = distributeRankPoints(h, generateScores(list), pos);
    if (i === 0) standing = pos;
    led = newHonorWeekLedger();
  }
  led = { ...led, weekStart: today };

  return { honor: h, ledger: led, passes: owed, rankBefore, rankAfter: visualOf(h), standing };
}

// The NEXT maintenance day at or after `nowMs`, as a local ISO date. When today IS maintenance day
// the pass has already run, so the next one is seven days out.
export function nextMaintenanceDate(nowMs: number, maintenanceDay = MAINTENANCE_DAY): string {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  const ahead = (maintenanceDay - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (ahead === 0 ? 7 : ahead));
  return localIsoDate(d);
}

/** Whole days from `nowMs` to the next maintenance day (1..7). */
export function daysToNextMaintenance(nowMs: number, maintenanceDay = MAINTENANCE_DAY): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  const ahead = (maintenanceDay - d.getDay() + 7) % 7;
  return ahead === 0 ? 7 : ahead;
}

function visualOf(h: HonorState): number {
  return rankForRp(h.rp)?.rank ?? 0;
}
