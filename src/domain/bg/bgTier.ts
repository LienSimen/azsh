// BG difficulty tiers, Freemade → Apes. They gate the STRATEGY and ORDER layers plus the enemy kit
// — never the rotation layer and never vision. The levers are enemyGear and enemyStrategyMs.

import type { GearProfile } from '../bots/botGear.ts';

export type BgTierId = 'freemade' | 'low' | 'normal' | 'skilled' | 'apes';

export interface BgTierDef {
  id: BgTierId;
  name: string;
  blurb: string;
  enemyGear: GearProfile;
  /** Enemy strategy re-decide cadence, ms (§6a ~1 Hz baseline). Lower = sharper. */
  enemyStrategyMs: number;
}

export const BG_TIER_ORDER: readonly BgTierId[] = ['freemade', 'low', 'normal', 'skilled', 'apes'];

export const DEFAULT_BG_TIER: BgTierId = 'normal';

export const BG_TIERS: Readonly<Record<BgTierId, BgTierDef>> = Object.freeze({
  freemade: {
    id: 'freemade',
    name: 'Freemade',
    blurb: 'A thrown-together pug in shabby kit. They wander and react late.',
    enemyGear: 'shabby',
    enemyStrategyMs: 3000,
  },
  low: {
    id: 'low',
    name: 'Low',
    blurb: 'Quest-geared peers with slow shot-calling.',
    enemyGear: 'field',
    enemyStrategyMs: 2000,
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    blurb: 'Twink-kitted opponents on a standard 1 Hz strategy clock.',
    enemyGear: 'twink',
    enemyStrategyMs: 1000,
  },
  skilled: {
    id: 'skilled',
    name: 'Skilled',
    blurb: 'Raid-geared premade that re-decides fast.',
    enemyGear: 'raid-mixed',
    enemyStrategyMs: 600,
  },
  apes: {
    id: 'apes',
    name: 'Apes',
    blurb: 'Full T3 sweatlords calling the map near-instantly.',
    enemyGear: 'raid-t3',
    enemyStrategyMs: 300,
  },
});

export function bgTier(id: string | undefined | null): BgTierDef {
  return BG_TIERS[(id ?? DEFAULT_BG_TIER) as BgTierId] ?? BG_TIERS[DEFAULT_BG_TIER];
}
