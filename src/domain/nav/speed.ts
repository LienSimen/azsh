// Speed system — a Unit::UpdateSpeed port plus auto-best mount and form selection. Pure domain.
// Cite: Unit.cpp:63–71 baseMoveSpeed; :8325–8367 UpdateSpeed stacking; :8429 GetSpeed.

import type { Character } from '../character/character.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { TravelSpeeds } from './travelTypes.ts';
import { canUseMount } from '../items/mounts.ts';

// ---- Aura ids (SpellAuraDefines.h) ----

/** SPELL_AURA_MOD_INCREASE_SPEED — on-foot main (max positive). */
export const AURA_INCREASE_SPEED = 31;
/** SPELL_AURA_MOD_INCREASE_MOUNTED_SPEED — mounted main (max positive). */
export const AURA_INCREASE_MOUNTED_SPEED = 32;
/** SPELL_AURA_MOD_DECREASE_SPEED — slow/daze (max negative multiplies rate). */
export const AURA_DECREASE_SPEED = 33;
/** SPELL_AURA_MOD_INCREASE_SWIM_SPEED — swim main (max positive). */
export const AURA_INCREASE_SWIM_SPEED = 58;
/** SPELL_AURA_MOD_SPEED_ALWAYS — on-foot stack product. */
export const AURA_SPEED_ALWAYS = 129;
/** SPELL_AURA_MOD_MOUNTED_SPEED_ALWAYS — mounted stack product. */
export const AURA_MOUNTED_SPEED_ALWAYS = 130;
/** SPELL_AURA_MOD_SPEED_NOT_STACK — on-foot non-stack max. */
export const AURA_SPEED_NOT_STACK = 171;
/** SPELL_AURA_MOD_MOUNTED_SPEED_NOT_STACK — mounted non-stack max. */
export const AURA_MOUNTED_SPEED_NOT_STACK = 172;
/** SPELL_AURA_USE_NORMAL_MOVEMENT_SPEED — yd/s cap (Unit.cpp:8374–8384). */
export const AURA_USE_NORMAL_MOVEMENT_SPEED = 191;

// ---- Base speeds (Unit.cpp:63–71) ----

/** MOVE_RUN base yd/s. Cite: Unit.cpp:66. */
export const BASE_RUN_SPEED = 7.0;
/** MOVE_SWIM base yd/s. Cite: Unit.cpp:68 (`4.722222f`). */
export const BASE_SWIM_SPEED = 4.722222;
// MoveCharge default when SpellEntry.speed == 0. Cite: Unit.h BASE_CHARGE_SPEED 27.0f; SpellEffects.cpp
// EffectCharge :5021.
export const BASE_CHARGE_SPEED = 27;

/** One active speed-mod effect (baked `kind: 'speed'` or synthetic mount/form). */
export interface SpeedEffect {
  aura: number;
  /** Percent modifier (signed). Mount enrich / mapper: BasePoints+dice e.g. 59+1 → 60. */
  pct: number;
}

export interface EffectiveSpeedsInput {
  /** Active speed effects; runtime buckets by aura id (not pre-interpreted). */
  effects: readonly SpeedEffect[];
  /** When true, use mounted aura buckets (32 / 130 / 172); else on-foot (31 / 129 / 171). */
  mounted: boolean;
}

// Port of Unit::UpdateSpeed rate math, then × baseMoveSpeed for yd/s: max main bucket, Π stack,
// then the cap (aura 191) and the strongest slow (33). Cite: Unit.cpp:8341–8402; :8429 GetSpeed.
export function effectiveSpeeds(input: EffectiveSpeedsInput): TravelSpeeds {
  const { effects, mounted } = input;

  // --- MOVE_RUN ---
  let mainRun = 0;
  let stackRun = 1.0;
  let nonStackRun = 1.0;

  if (mounted) {
    // Unit.cpp:8345–8348
    mainRun = maxPositive(effects, AURA_INCREASE_MOUNTED_SPEED);
    stackRun = totalMultiplier(effects, AURA_MOUNTED_SPEED_ALWAYS);
    nonStackRun = (100.0 + maxPositive(effects, AURA_MOUNTED_SPEED_NOT_STACK)) / 100.0;
  } else {
    // Unit.cpp:8352–8355
    mainRun = maxPositive(effects, AURA_INCREASE_SPEED);
    stackRun = totalMultiplier(effects, AURA_SPEED_ALWAYS);
    nonStackRun = (100.0 + maxPositive(effects, AURA_SPEED_NOT_STACK)) / 100.0;
  }

  let runRate = composeRate(mainRun, stackRun, nonStackRun);
  runRate = applyNormalMovementSpeedCap(runRate, effects, BASE_RUN_SPEED);
  runRate = applySlow(runRate, effects);

  // --- MOVE_SWIM (Unit.cpp:8362–8365) — main only; stack/nonstack default 1.0 ---
  const mainSwim = maxPositive(effects, AURA_INCREASE_SWIM_SPEED);
  let swimRate = composeRate(mainSwim, 1.0, 1.0);
  swimRate = applyNormalMovementSpeedCap(swimRate, effects, BASE_SWIM_SPEED);
  swimRate = applySlow(swimRate, effects);

  return {
    run: runRate * BASE_RUN_SPEED,
    swim: swimRate * BASE_SWIM_SPEED,
  };
}

// Auto-best speeds for a trip: the fastest owned mount the rider's rank, level and race permit,
// else the on-foot candidates as-is. tripConsumables only when the caller passes them.
export function bestTravelSpeeds(input: {
  char: Character;
  /** Owned mount items (need `mountSpeedPct` / riding fields for the gate). */
  ownedMounts: readonly ItemDef[];
  // On-foot / passive / form speed effects the character knows. Mounted vs on-foot wrong-bucket auras are
  // ignored by UpdateSpeed buckets.
  onFootCandidates?: readonly SpeedEffect[];
  // Limited-use consumables (e.g. Swiftness Potion). Strictly opt-in — omit or pass [] to exclude them
  // (D7).
  tripConsumables?: readonly SpeedEffect[];
  /** Forwarded to canUseMount (mounts require out-of-combat). */
  inCombat?: boolean;
}): TravelSpeeds {
  const effects: SpeedEffect[] = [];

  if (input.tripConsumables) {
    for (const e of input.tripConsumables) effects.push({ aura: e.aura, pct: e.pct });
  }
  if (input.onFootCandidates) {
    for (const e of input.onFootCandidates) effects.push({ aura: e.aura, pct: e.pct });
  }

  const bestMount = pickBestUsableMount(input.char, input.ownedMounts, input.inCombat);
  if (bestMount != null && bestMount.mountSpeedPct != null && bestMount.mountSpeedPct > 0) {
    // Mount speed enters as aura-32 main (Unit.cpp:8345–8346 GetMaxPositiveAuraModifier 32).
    effects.push({ aura: AURA_INCREASE_MOUNTED_SPEED, pct: bestMount.mountSpeedPct });
    return effectiveSpeeds({ effects, mounted: true });
  }

  return effectiveSpeeds({ effects, mounted: false });
}

/** Highest `mountSpeedPct` among mounts that pass `canUseMount`. */
export function pickBestUsableMount(
  char: Character,
  ownedMounts: readonly ItemDef[],
  inCombat?: boolean,
): ItemDef | null {
  let best: ItemDef | null = null;
  let bestPct = -1;
  for (const item of ownedMounts) {
    if (!canUseMount(char, item, { inCombat }).ok) continue;
    const pct = item.mountSpeedPct ?? 0;
    if (pct > bestPct) {
      bestPct = pct;
      best = item;
    }
  }
  return best;
}

// ---- helpers matching Unit.cpp aura aggregators ----

/** GetMaxPositiveAuraModifier — Unit.cpp:4503–4512. */
function maxPositive(effects: readonly SpeedEffect[], aura: number): number {
  let modifier = 0;
  for (const e of effects) {
    if (e.aura === aura && e.pct > modifier) modifier = e.pct;
  }
  return modifier;
}

/** GetMaxNegativeAuraModifier — Unit.cpp:4515–4524. */
function maxNegative(effects: readonly SpeedEffect[], aura: number): number {
  let modifier = 0;
  for (const e of effects) {
    if (e.aura === aura && e.pct < modifier) modifier = e.pct;
  }
  return modifier;
}

// GetTotalAuraMultiplier — Unit.cpp:4492–4500: multiplier *= (100 + amount) / 100 per aura.
function totalMultiplier(effects: readonly SpeedEffect[], aura: number): number {
  let multiplier = 1.0;
  for (const e of effects) {
    if (e.aura === aura) {
      multiplier *= (100.0 + e.pct) / 100.0;
    }
  }
  return multiplier;
}

// Unit.cpp:8375–8377: bonus = max(non_stack, stack), then main ? bonus * (100 + main) / 100 : bonus.
function composeRate(main: number, stack: number, nonStack: number): number {
  const bonus = nonStack > stack ? nonStack : stack;
  return main ? (bonus * (100.0 + main)) / 100.0 : bonus;
}

// Unit.cpp:8399–8402 — the strongest slow (aura 33) multiplies the rate: speed *= (100 + slow)/100,
// with slow negative, so −50 is ×0.5.
function applySlow(rate: number, effects: readonly SpeedEffect[]): number {
  const slow = maxNegative(effects, AURA_DECREASE_SPEED);
  if (slow) return (rate * (100.0 + slow)) / 100.0;
  return rate;
}

/** Unit.cpp:8378–8383 — max rate = amount / baseMoveSpeed[mtype]; clamp if higher. */
function applyNormalMovementSpeedCap(
  rate: number,
  effects: readonly SpeedEffect[],
  baseYd: number,
): number {
  const normalization = maxPositive(effects, AURA_USE_NORMAL_MOVEMENT_SPEED);
  if (!normalization) return rate;
  const maxRate = normalization / baseYd;
  return rate > maxRate ? maxRate : rate;
}
