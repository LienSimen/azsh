// Pure session-accounting helpers for journey-aware autopilot (L1 / D5). Wall-clock honesty: gold/XP per
// hour use TOTAL elapsed time including travel. No DOM / RNG / Date — callers pass measured milliseconds.

/** Accumulated wall-clock split across autopilot phases. */
export interface SessionTimeSplit {
  travelMs: number;
  fightMs: number;
  restMs: number;
  /** travel + fight + rest (not necessarily equal to session wall-clock if a phase is open). */
  totalMs: number;
}

/** Per-hour rates from gains and total wall-clock (including travel). */
export interface SessionRates {
  /** XP gained ÷ hours of wall-clock. */
  xpPerHour: number;
  /** Copper gained ÷ hours of wall-clock. */
  goldPerHour: number;
}

/**
 * Whether the session should open in travel before the farm/quest plan loop.
 * - `travel`: a journey is already active (mid-route resume).
 * - `depart`: caller should call `game.travelTo(travelToZone)` then enter travel.
 * - `farm`: already at the target (or no target); start the normal plan loop.
 */
export type TravelEntryKind = 'travel' | 'depart' | 'farm';

export function travelEntryKind(
  currentZoneId: string,
  travelToZone: string | undefined,
  hasActiveJourney: boolean,
): TravelEntryKind {
  if (hasActiveJourney) return 'travel';
  if (travelToZone != null && travelToZone !== '' && travelToZone !== currentZoneId) return 'depart';
  return 'farm';
}

/** Clamp non-finite / negative phase buckets and sum them. */
export function sessionTimeSplit(parts: {
  travelMs: number;
  fightMs: number;
  restMs: number;
}): SessionTimeSplit {
  const travelMs = finiteNonNeg(parts.travelMs);
  const fightMs = finiteNonNeg(parts.fightMs);
  const restMs = finiteNonNeg(parts.restMs);
  return { travelMs, fightMs, restMs, totalMs: travelMs + fightMs + restMs };
}

/**
 * Gold/XP per hour from TOTAL wall-clock (including travel and rest).
 * Hand-check: 1800 XP over 30 min (1_800_000 ms) → 3600 XP/h;
 * 500 copper over 10 min (600_000 ms) → 3000 copper/h.
 * Zero or non-positive total → 0 (no divide-by-zero).
 *
 * `gold` is fight copper drops; `soldCopper` is vendor trash (auto-sold greys).
 * Both count toward gold/h — greys are the main copper source for many farm sessions.
 */
export function sessionRates(
  gains: { xp: number; gold: number; soldCopper?: number },
  totalWallMs: number,
): SessionRates {
  const wall = finiteNonNeg(totalWallMs);
  if (wall <= 0) return { xpPerHour: 0, goldPerHour: 0 };
  const hours = wall / 3_600_000;
  const sold = gains.soldCopper;
  const gold =
    (Number.isFinite(gains.gold) ? gains.gold : 0)
    + (typeof sold === 'number' && Number.isFinite(sold) ? sold : 0);
  return {
    xpPerHour: (Number.isFinite(gains.xp) ? gains.xp : 0) / hours,
    goldPerHour: gold / hours,
  };
}

/** Round rates for display (whole XP / copper per hour). */
export function roundSessionRates(rates: SessionRates): { xpPerHour: number; goldPerHour: number } {
  return {
    xpPerHour: Math.round(rates.xpPerHour),
    goldPerHour: Math.round(rates.goldPerHour),
  };
}

function finiteNonNeg(n: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return 0;
  return n;
}
