// Pure spell-effect resolvers for the kinds combat still skips, honestly inert. Callers roll the
// amount and apply the damage bonuses before passing it, exactly where the C++ handler does.

import type { PowerType } from '../../data/schema.ts';

/** Classic Power enum values used by EffectMiscValue / schema.powerType. */
export const POWER_MANA = 0;
export const POWER_RAGE = 1;
export const POWER_FOCUS = 2;
export const POWER_ENERGY = 3;

/** EffectMiscValue index → the bar name this project uses. Anything else (happiness) is null. */
export function powerTypeName(powerType: number): PowerType | null {
  if (powerType === POWER_MANA) return 'mana';
  if (powerType === POWER_RAGE) return 'rage';
  if (powerType === POWER_FOCUS) return 'focus';
  if (powerType === POWER_ENERGY) return 'energy';
  return null;
}

/** EffectAddExtraAttacks cap — SpellEffects.cpp:4878–4880. */
export const EXTRA_ATTACKS_CAP = 5;

// ── SPELL_EFFECT_HEAL_MAX_HEALTH (67) ───────────────────────────────────────

// EffectHealMaxHealth: the heal equals the CASTER's max health, not the target's (Lay on Hands).
// Cite: SpellEffects.cpp:3579-3589.
export function resolveHealMaxHealth(input: {
  casterMaxHealth: number;
}): { healAmount: number } {
  const healAmount = Math.max(0, Math.trunc(input.casterMaxHealth));
  return { healAmount };
}

// ── SPELL_EFFECT_POWER_DRAIN (8) ────────────────────────────────────────────

// EffectPowerDrain: drain up to the target's current power, then energize the caster by that much,
// multiplied only when the power types match and it is not a self-drain. Cite: SpellEffects.cpp:1750.
export function resolvePowerDrain(input: {
  amount: number;
  targetCurrentPower: number;
  /** EffectMultipleValue — used only when power types match and not self. */
  multiplier: number;
  /** Caster primary power type equals drained powerType. Default true. */
  powerTypesMatch?: boolean;
  /** Caster is the drain target. Default false. */
  isSelf?: boolean;
}): { drained: number; casterGain: number } {
  if (input.amount < 0) return { drained: 0, casterGain: 0 };
  const cur = Math.max(0, Math.trunc(input.targetCurrentPower));
  const amount = Math.trunc(input.amount);
  const drained = cur < amount ? cur : amount;

  const match = input.powerTypesMatch !== false;
  const isSelf = input.isSelf === true;
  // SpellEffects.cpp:1777–1786 — default 1.0; EffectMultipleValue only when match && !self
  const gainMultiplier = match && !isSelf ? input.multiplier : 1.0;
  const casterGain = Math.trunc(drained * gainMultiplier);
  return { drained, casterGain };
}

// ── SPELL_EFFECT_POWER_BURN (62) ────────────────────────────────────────────

// EffectPowerBurn: burn up to the target's current power, then deal that much times the effect's
// multiple value as damage. Cite: SpellEffects.cpp:1801-1829.
export function resolvePowerBurn(input: {
  amount: number;
  targetCurrentPower: number;
  multiplier: number;
}): { burned: number; damage: number } {
  if (input.amount < 0) return { burned: 0, damage: 0 };
  const cur = Math.max(0, Math.trunc(input.targetCurrentPower));
  const amount = Math.trunc(input.amount);
  const burned = cur < amount ? cur : amount;
  const damage = Math.trunc(burned * input.multiplier);
  return { burned, damage };
}

// ── SPELL_EFFECT_HEALTH_LEECH (9) ───────────────────────────────────────────

// EffectHealthLeech: damage capped at the target's current health, and a heal of that times the
// effect's multiple value before the caster's healing bonus. Cite: SpellEffects.cpp:1905-1934.
export function resolveHealthLeech(input: {
  amount: number;
  targetCurrentHealth: number;
  multiplier: number;
}): { damage: number; heal: number } {
  if (input.amount < 0) return { damage: 0, heal: 0 };
  const curHealth = Math.max(0, Math.trunc(input.targetCurrentHealth));
  let damage = Math.trunc(input.amount);
  if (curHealth < damage) damage = curHealth;
  const heal = Math.trunc(damage * input.multiplier);
  return { damage, heal };
}

// ── SPELL_EFFECT_ENERGIZE (30) ──────────────────────────────────────────────

// EffectEnergize, the non-rage instant restore: nothing on an invalid power, a negative amount, or a
// zero maximum. Rage stays on its own field, so this resolver refuses it rather than remapping it.
export function resolveEnergize(input: {
  amount: number;
  powerType: number;
  /** When set, restore is capped so current + gain ≤ max (EnergizeBySpell behavior). */
  targetCurrentPower?: number;
  targetMaxPower?: number;
}): {
  restored: number;
  /** True when rage (or other non-instant path) — caller must not invent a substitute. */
  skipped: boolean;
  reason?: string;
} {
  if (input.powerType === POWER_RAGE) {
    return {
      restored: 0,
      skipped: true,
      reason: 'rage uses rageGenerated path; EffectEnergize non-rage only',
    };
  }
  if (input.powerType < 0 || input.powerType > POWER_ENERGY) {
    return { restored: 0, skipped: true, reason: 'invalid powerType (EffectMiscValue)' };
  }
  if (input.amount < 0) {
    return { restored: 0, skipped: false };
  }
  if (input.targetMaxPower !== undefined && input.targetMaxPower === 0) {
    return { restored: 0, skipped: false, reason: 'target max power is 0' };
  }

  let restored = Math.trunc(input.amount);
  if (input.targetCurrentPower !== undefined && input.targetMaxPower !== undefined) {
    const room = Math.max(0, Math.trunc(input.targetMaxPower) - Math.trunc(input.targetCurrentPower));
    restored = Math.min(restored, room);
  }
  return { restored, skipped: false };
}

// ── SPELL_EFFECT_MODIFY_THREAT_PERCENT (125) ────────────────────────────────

// EffectModifyThreatPercent packages the percent for the TARGET's threat list toward the caster. The
// math lives in threat.ts: -100 wipes the entry, below that removes it, else it scales.
export function resolveModifyThreatPercent(input: {
  threatPercent: number;
}): {
  threatPercent: number;
  /** Documented wiring target — do not reimplement percent math here. */
  applyVia: 'ThreatManager.modifyThreatPercent';
} {
  return {
    threatPercent: Math.trunc(input.threatPercent),
    applyVia: 'ThreatManager.modifyThreatPercent',
  };
}

// Pure threat-percent application for a single numeric threat value, for callers with no manager.
// It does not model the remove-entry case below -100, which returns 0.
function applyThreatPercentToValue(
  currentThreat: number,
  threatPercent: number,
): number {
  if (threatPercent < -100 || threatPercent === -100) return 0;
  const delta = (currentThreat * threatPercent) / 100;
  return currentThreat + delta;
}

// ── SPELL_EFFECT_ADD_EXTRA_ATTACKS (19) ─────────────────────────────────────

// EffectAddExtraAttacks adds to the extra-attack counter and caps it at five, the same scalar
// Windfury uses. Cite: SpellEffects.cpp:4873-4882.
export function resolveAddExtraAttacks(input: {
  current: number;
  add: number;
}): number {
  const next = Math.trunc(input.current) + Math.trunc(input.add);
  return next > EXTRA_ATTACKS_CAP ? EXTRA_ATTACKS_CAP : next;
}

// ── SPELL_EFFECT_WEAPON_PERCENT_DAMAGE (31) — pure pct only ─────────────────

// The weapon-percent branch of EffectWeaponDmg: apply the effect's percent to an already-resolved
// weapon damage sample. It invents no weapon tables — the caller supplies the damage.
export function resolveWeaponPercentDamage(input: {
  weaponDamage: number;
  /** Percent points from effect (110 → 110% of weapon damage). */
  pct: number;
}): { damage: number } {
  const damage = Math.trunc(input.weaponDamage * (input.pct / 100.0));
  return { damage };
}

// ── SPELL_AURA_OBS_MOD_HEALTH (20) / OBS_MOD_MANA (21) ───────────────────────

// A periodic percent-of-max restore tick: the aura's amount as an integer percent of the target's max
// health or mana. Non-positive percent or maximum gives 0. Cite: SpellAuras.cpp PeriodicTick.
export function resolvePeriodicPctOfMax(input: {
  maxResource: number;
  /** Integer percent of max (e.g. 3 → 3% of max per tick). */
  pctOfMax: number;
}): number {
  const max = Math.max(0, Math.trunc(input.maxResource));
  const pct = Math.trunc(input.pctOfMax);
  if (max <= 0 || pct <= 0) return 0;
  return Math.trunc((max * pct) / 100);
}
