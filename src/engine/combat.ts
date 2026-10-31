// Deterministic, seeded, fixed-tick combat. A CombatSession advances one tick at a time; simulate()
// runs it to the end and the UI advances it live. Every mutation appends to one event log.

export { missileTravelMs } from './combat/combatGeometry.ts';

// ---- Wave 4 S24–S27: types / predicates / roles / fighter factory ----
import type {
  ActiveWeaponImbue,
  WeaponProfile,
  ProcDef,
  DamagePctBySchool,
  GroupRole,
  CombatantSpec,
  CombatItem,
  CombatAction,
  AllyCombatAction,
  AllyActionProvider,
  ProviderNeeds,
  CombatConfig,
  CombatResult,
  CombatantView,
  AbilityStatus,
  CombatItemStatus,
  TotemView,
  TrapView,
  CombatSession,
} from './combat/types.ts';
export type {
  ActiveWeaponImbue,
  WeaponProfile,
  ProcDef,
  DamagePctBySchool,
  GroupRole,
  CombatantSpec,
  CombatItem,
  CombatAction,
  AllyCombatAction,
  AllyActionProvider,
  ProviderNeeds,
  CombatConfig,
  CombatResult,
  CombatantView,
  AbilityStatus,
  CombatItemStatus,
  TotemView,
  TrapView,
  CombatSession,
};
import {
  RECENT_DODGE_MS,
  RECENT_DEFENSE_REACT_MS,
  ALLY_HEAL_THRESHOLD,
} from './combat/types.ts';
export {
  RECENT_DODGE_MS,
  RECENT_DEFENSE_REACT_MS,
  ALLY_HEAL_THRESHOLD,
};

import { DRAIN_SOUL_ID, isDrainSoulSpell } from './combat/predicates.ts';
export { DRAIN_SOUL_ID, isDrainSoulSpell } from './combat/predicates.ts';

import { inferRole } from './combat/roles.ts';
export { inferRole } from './combat/roles.ts';


// Divine Shield and Banish are DATA-driven: Divine Shield ranks bake school_immunity effects and
// Banish ranks a cc effect with mechanic 'banish'. Cite: SpellAuras.cpp HandleAuraModSchoolImmunity.


// Seal of Righteousness per-swing holy damage, ported from UnitAuraProcHandler.cpp:1116-1134 off the
// weapon delay and the seal's base point. The spell-power term is omitted: no holy SP is modelled.
export function sealRighteousnessSwing(coeff: number, weapon: WeaponProfile): number {
  const speed = weapon.speedMs / 1000;
  const scaled = coeff * 1.2 * 1.03 * speed / 100;
  const base = weapon.twoHand ? (1.20 * scaled + 1) : (0.85 * Math.ceil(scaled) - 1);
  return Math.max(1, Math.floor(base + 0.03 * (weapon.dmgMin + weapon.dmgMax) / 2) + 1);
}



export { createSession, simulate, UNATTRIBUTED_VICTIM } from './combat/createSession.ts';
// Debug view knob: draw the aura chips SPELL_ATTR_DO_NOT_DISPLAY hides (Settings > Combat display).
export { setShowHiddenAuras } from './combat/sessionView.ts';
