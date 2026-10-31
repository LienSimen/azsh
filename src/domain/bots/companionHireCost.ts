// Inn companion hire pricing: hireCostCopper(level, profile) = bodyFee(level) + kitFee(profile,
// level). The first world-pool hire pays it; a re-hire from botRoster is free. GS is display-only.

import type { GearProfile } from './botGear.ts';
import { isRaidGearProfile } from './botGear.ts';
import type { EquippedMap } from '../character/character.ts';
import type { DataStore } from '../../data/dataStore.ts';
import { equippedEntry } from '../items/itemInstance.ts';
import { moneyMarked } from '../economy/money.ts';

/** WoW copper units: 100c = 1s, 100s = 1g. */
export const COPPER_PER_GOLD = 10_000;
export const COPPER_PER_SILVER = 100;

/** Pre-30 knots are this fraction of the L15 purse table (no 29→30 step). */
const PRE_30_SCALE = 0.8;

function pre30(copper: number): number {
  return Math.round(copper * PRE_30_SCALE);
}

// Product totals at the curve knots. L10/L15/L25 are the purse table × 0.8; L60 is the unchanged endgame
// sink. Linear 10→15→25, then L² to 60.
export const HIRE_ANCHOR_COPPER = {
  /** L10 shabby — a few quest turn-ins. */
  shabbyL10: pre30(8 * COPPER_PER_SILVER),
  /** L15 shabby (10–15s table × 0.8). */
  shabbyL15: pre30(12 * COPPER_PER_SILVER),
  /** L25 shabby (1g table × 0.8). */
  shabbyL25: pre30(1 * COPPER_PER_GOLD),
  /** L59–60 shabby ~25g */
  shabbyL60: 25 * COPPER_PER_GOLD,
  /** L10 field — stretch, not a full-squad buy. */
  fieldL10: pre30(18 * COPPER_PER_SILVER),
  /** L15 field (25–35s table × 0.8). */
  fieldL15: pre30(30 * COPPER_PER_SILVER),
  /** L25 field (2g table × 0.8). */
  fieldL25: pre30(2 * COPPER_PER_GOLD),
  /** L60 field ~50g */
  fieldL60: 50 * COPPER_PER_GOLD,
  /** L10 twink — one luxury hire if you sold greens. */
  twinkL10: pre30(80 * COPPER_PER_SILVER),
  /** L15 twink (1–3g table × 0.8). */
  twinkL15: pre30(2 * COPPER_PER_GOLD),
  /** L25 twink (10g table × 0.8). */
  twinkL25: pre30(10 * COPPER_PER_GOLD),
  /** L60 twink ~200g */
  twinkL60: 200 * COPPER_PER_GOLD,
  /** L59–60 naked = 0 */
  naked: 0,
  /** L60 raid-mixed ~1000g */
  raidMixedL60: 1000 * COPPER_PER_GOLD,
  /** L60 raid-t2 ~2000g */
  raidT2L60: 2000 * COPPER_PER_GOLD,
  /** L60 raid-t3 ~3000g */
  raidT3L60: 3000 * COPPER_PER_GOLD,
} as const;

// bodyFee kBody — `round((L * L * kBody) / 100)`. Cheap shell under the kit product (L15 → 9s, L25 → 25s;
// kit is the rest).
const BODY_K = 400;

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(60, Math.floor(level)));
}

// Cheap body shell: bodyFee(L) ≈ round((L * L * kBody) / 100) copper.
// Cite: docs/archive/INN-COMPANION-HIRE-DESIGN.md §3.3.
export function bodyFeeCopper(level: number): number {
  const L = clampLevel(level);
  return Math.round((L * L * BODY_K) / 100);
}

// Interpolate a product total across L10 / L15 / L25 / L60 knots. L≤10 → scale to at10; L10..15 and L15..25
// linear; L25..60 in L² space.
function curveTotal(
  level: number,
  at10: number,
  at15: number,
  at25: number,
  at60: number,
): number {
  const L = clampLevel(level);
  if (L <= 10) {
    return Math.round((L / 10) * at10);
  }
  if (L <= 15) {
    const t = (L - 10) / (15 - 10);
    return Math.round(at10 + t * (at15 - at10));
  }
  if (L <= 25) {
    const t = (L - 15) / (25 - 15);
    return Math.round(at15 + t * (at25 - at15));
  }
  const t25 = 25 * 25;
  const t60 = 60 * 60;
  const t = (L * L - t25) / (t60 - t25);
  return Math.round(at25 + t * (at60 - at25));
}

/** Target total hire price for a profile (before body/kit split). */
export function profileTotalCopper(profile: GearProfile, level: number): number {
  const L = clampLevel(level);
  switch (profile) {
    case 'naked':
      return HIRE_ANCHOR_COPPER.naked;
    case 'shabby':
      return curveTotal(
        L,
        HIRE_ANCHOR_COPPER.shabbyL10,
        HIRE_ANCHOR_COPPER.shabbyL15,
        HIRE_ANCHOR_COPPER.shabbyL25,
        HIRE_ANCHOR_COPPER.shabbyL60,
      );
    case 'field':
      return curveTotal(
        L,
        HIRE_ANCHOR_COPPER.fieldL10,
        HIRE_ANCHOR_COPPER.fieldL15,
        HIRE_ANCHOR_COPPER.fieldL25,
        HIRE_ANCHOR_COPPER.fieldL60,
      );
    case 'twink':
      return curveTotal(
        L,
        HIRE_ANCHOR_COPPER.twinkL10,
        HIRE_ANCHOR_COPPER.twinkL15,
        HIRE_ANCHOR_COPPER.twinkL25,
        HIRE_ANCHOR_COPPER.twinkL60,
      );
    case 'raid-mixed':
      return raidTotalCopper(L, HIRE_ANCHOR_COPPER.raidMixedL60);
    case 'raid-t2':
      return raidTotalCopper(L, HIRE_ANCHOR_COPPER.raidT2L60);
    case 'raid-t3':
      return raidTotalCopper(L, HIRE_ANCHOR_COPPER.raidT3L60);
    default: {
      const _x: never = profile;
      void _x;
      return 0;
    }
  }
}

// Raid kits are level-gated (design §3.3: L≥58 / L60 stripe). Below 58, price like twink so a stray call
// stays ordered under true raid@60. At 58–60, ramp from twink@L to the raid anchor at 60.
function raidTotalCopper(level: number, at60: number): number {
  const L = clampLevel(level);
  const twink = profileTotalCopper('twink', L);
  if (L < 58) return twink;
  // L58 → just above twink; L60 → full raid anchor
  const t = (L - 58) / (60 - 58);
  return Math.round(twink + t * (at60 - twink));
}

// Kit product fee. Design §3.1/§3.3: kitFee(profile, level). Implemented as max(0, profileTotal − bodyFee)
// so hireCost = body + kit and naked stays 0.
export function kitFeeCopper(profile: GearProfile, level: number): number {
  if (profile === 'naked') return 0;
  const total = profileTotalCopper(profile, level);
  const body = bodyFeeCopper(level);
  return Math.max(0, total - body);
}

// First-hire cost in copper: bodyFee(level) + kitFee(profile, level), integers only.
// Naked is free. Cite: INN-COMPANION-HIRE-DESIGN.md §3.1 / §3.2.
export function hireCostCopper(level: number, profile: GearProfile): number {
  if (profile === 'naked') return HIRE_ANCHOR_COPPER.naked;
  return bodyFeeCopper(level) + kitFeeCopper(profile, level);
}

/** UI / log label for a kit profile (design §8.1). */
export function gearProfileLabel(profile: GearProfile): string {
  switch (profile) {
    case 'naked': return 'Naked';
    case 'shabby': return 'Shabby';
    case 'field': return 'Field';
    case 'twink': return 'Twink';
    case 'raid-mixed': return 'Raid';
    case 'raid-t2': return 'Raid (T2)';
    case 'raid-t3': return 'Raid (T3)';
    default: {
      const _x: never = profile;
      void _x;
      return 'Kit';
    }
  }
}

/** Hire price for the activity log / flash — coin markers, painted by ui/format coinsHtml. */
export function hirePriceLabel(copper: number): string {
  return copper <= 0 ? 'Free' : moneyMarked(copper);
}

// Display-only gear estimate: average itemLevel of worn paperdoll pieces (shirt and bags skipped).
// Spec weightscale sums differ by magnitude per spec, so ilvl is the cross-companion number.
// Not used for price (design D3 / §8.1).
export function displayGearScore(
  gear: EquippedMap,
  ds: DataStore,
): number {
  let sum = 0;
  let worn = 0;
  for (const [slot, v] of Object.entries(gear)) {
    if (slot.startsWith('bag') || slot === 'shirt') continue;
    const e = equippedEntry(v as never);
    if (e == null) continue;
    const it = ds.item(e);
    if (!it) continue;
    sum += it.itemLevel ?? 0;
    worn++;
  }
  return worn ? Math.round(sum / worn) : 0;
}

/** Profiles ordered cheapest → most expensive at a fixed level (design §3.3). */
export const HIRE_PROFILE_TIER_ORDER: readonly GearProfile[] = [
  'naked',
  'shabby',
  'field',
  'twink',
  'raid-mixed',
  'raid-t2',
  'raid-t3',
] as const;

/** True when profile is a luxury raid kit (same as botGear.isRaidGearProfile). */
export function isRaidHireProfile(profile: GearProfile): boolean {
  return isRaidGearProfile(profile);
}

/** Design §5.2: a "cheap" L59–60 face is naked or shabby (≤ ~25g). */
export function isCheapHireProfile(profile: GearProfile): boolean {
  return profile === 'naked' || profile === 'shabby';
}
