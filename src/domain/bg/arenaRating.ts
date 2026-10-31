// Arena rating: an Elo per bracket that REPLACES the Freemade..Apes picker, deciding which comp you
// face and at which tier. A PRODUCT RULE like the arena itself - 1.12 has neither (plan section 3).

import { BG_TIERS, BG_TIER_ORDER, type BgTierId } from './bgTier.ts';
import { compsForBracket, type ArenaBracket, type ArenaComp } from './arenaComps.ts';

/** Where a character starts. 1500 is `normal`, which is DEFAULT_BG_TIER - a fresh seat faces what it faced before. */
export const ARENA_RATING_START = 1500;

/** Elo K-factor. Product rule: no source, so the chess-standard 32 rather than a number invented here. */
export const ARENA_RATING_K = 32;

/** `freemade` sits here and each tier is one step above the last, so a tier IS a rating band. */
const TIER_RATING_BASE = 1100;
const TIER_RATING_STEP = 200;

/** How many rating-nearest comps `pickRatedComp` rolls between, so a re-queue is not the same pair. */
const PICK_POOL = 5;

/** The rating a tier sits at. Derived from BG_TIER_ORDER, so a new tier moves the band with it. */
export function tierRating(tier: BgTierId): number {
  const i = Math.max(0, BG_TIER_ORDER.indexOf(tier));
  return TIER_RATING_BASE + TIER_RATING_STEP * i;
}

/** The tier a rating fights at: nearest band, clamped to the ends. The inverse of `tierRating`. */
export function ratingTier(rating: number): BgTierId {
  const raw = Math.round((rating - TIER_RATING_BASE) / TIER_RATING_STEP);
  const i = Math.min(BG_TIER_ORDER.length - 1, Math.max(0, raw));
  return BG_TIER_ORDER[i]!;
}

// The re-decide cadence a comp fights at. The SAME number bgScreen.ts:385 hands a BG tier, now
// handed to the combat surface through `pacedActionProvider`.
export function compDecideMs(comp: ArenaComp): number {
  return BG_TIERS[comp.tier].enemyStrategyMs;
}

/** Brackets that carry a rating. 1 is the duel gauntlet; 2, 3 and 5 are the team arenas. */
export const RATED_BRACKETS: readonly ArenaBracket[] = [1, 2, 3, 5];

let ratingById: Map<string, number> | null = null;

function compRatings(): Map<string, number> {
  if (ratingById) return ratingById;
  const m = new Map<string, number>();
  for (const bracket of RATED_BRACKETS) {
    const all = compsForBracket(bracket);
    for (const tier of BG_TIER_ORDER) {
      const group = all.filter((c) => c.tier === tier);
      const base = tierRating(tier);
      group.forEach((c, i) => {
        m.set(c.id, group.length <= 1 ? base : Math.round(base + (TIER_RATING_STEP * i) / group.length));
      });
    }
  }
  ratingById = m;
  return m;
}

// A comp's own rating, so the Elo has a rated opponent rather than a flat step. Its tier sets the
// band; its place in the bracket's tier group spreads it inside that band, never across.
export function compRating(comp: ArenaComp): number {
  return compRatings().get(comp.id) ?? tierRating(comp.tier);
}

/** A comp's rating by id, for a settle that only kept the id. Null when nothing is authored under it. */
export function compRatingById(id: string | null | undefined): number | null {
  if (!id) return null;
  return compRatings().get(id) ?? null;
}

/** Elo expectation for `rating` against `oppRating`. Cite: the standard logistic curve, 400-point scale. */
export function expectedScore(rating: number, oppRating: number): number {
  return 1 / (1 + 10 ** ((oppRating - rating) / 400));
}

export type ArenaOutcome = 'win' | 'loss' | 'draw';

// The rating after one match. NO FLOOR (operator, 2026-09-01): a losing streak really does walk you
// back down the tiers.
export function ratingAfter(rating: number, oppRating: number, outcome: ArenaOutcome): number {
  const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  return Math.round(rating + ARENA_RATING_K * (score - expectedScore(rating, oppRating)));
}

// The comp this rating faces: the `PICK_POOL` nearest by rating, one off the match seed. A re-queue
// is a different opponent and a replay the same one, the promise at bgScreen.ts:219.
export function pickRatedComp(
  bracket: ArenaBracket,
  rating: number,
  seed: number,
): ArenaComp | null {
  const all = compsForBracket(bracket);
  if (!all.length) return null;
  const near = [...all].sort((a, b) => {
    const d = Math.abs(compRating(a) - rating) - Math.abs(compRating(b) - rating);
    return d !== 0 ? d : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }).slice(0, PICK_POOL);
  return near[Math.abs(seed | 0) % near.length] ?? null;
}

/** This character's rating in a bracket. An absent or junk entry reads as the start. */
export function arenaRatingOf(
  ratings: Partial<Record<number, number>> | undefined | null,
  bracket: ArenaBracket,
): number {
  const v = ratings?.[bracket];
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : ARENA_RATING_START;
}
