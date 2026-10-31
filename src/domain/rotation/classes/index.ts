// PURE: no DOM/RNG/Date. Per-class rotation hooks registry + public kit filters.

import type { SpellDef } from '../../../data/schema.ts';
import { inferRole } from '../../../engine/combat.ts';
import type { SuggestionClassKey } from '../rotationSuggestions.ts';
import { isDispelSpell, isInterruptSpell } from '../classify.ts';
import type { ClassRotationHooks, FinalizeContext } from './hooks.ts';
import { druidHooks } from './druid.ts';
import { hunterHooks } from './hunter.ts';
import { mageHooks } from './mage.ts';
import { paladinHooks } from './paladin.ts';
import { priestHooks } from './priest.ts';
import { rogueHooks } from './rogue.ts';
import { shamanHooks } from './shaman.ts';
import { warlockHooks } from './warlock.ts';
import { reconcilePullStanceWithCombat, warriorHooks } from './warrior.ts';
import { ensureCastTimePullOpener, orderPullByTimeToLand } from './pullOpener.ts';

export type { ClassRotationHooks, FinalizeContext } from './hooks.ts';
export { rebuildPhaseUsed } from './hooks.ts';
export { finalizePaladinSealJudge } from './paladin.ts';
export { finalizeHunterRangedPrimary } from './hunter.ts';
export { reconcilePullStanceWithCombat } from './warrior.ts';

/** Static registry — one hooks object per suggestion class key. */
export const CLASS_HOOKS: Record<SuggestionClassKey, ClassRotationHooks> = {
  warrior: warriorHooks,
  paladin: paladinHooks,
  hunter: hunterHooks,
  rogue: rogueHooks,
  priest: priestHooks,
  shaman: shamanHooks,
  mage: mageHooks,
  warlock: warlockHooks,
  druid: druidHooks,
};

export function getClassHooks(classKey: SuggestionClassKey): ClassRotationHooks {
  return CLASS_HOOKS[classKey];
}

// Whether a known spell may appear in the role-bucket FALLBACK for this class and spec. Interrupts,
// dispels, seals, pet tools and heals stay open; combat damage is restricted to the spec's kit.
export function spellAllowedInRoleBucketFallback(
  spell: SpellDef,
  classKey: SuggestionClassKey,
  spec: string,
): boolean {
  const role = spell.role ?? inferRole(spell);
  const hooks = CLASS_HOOKS[classKey];

  // Always-safe utility categories (not cross-kit DPS mash).
  if (isInterruptSpell(spell) || isDispelSpell(spell)) return true;
  if (role === 'shoot' || role === 'pet_summon' || role === 'pet_heal' || role === 'pet_tame') return true;
  if (role === 'totem_summon' || role === 'conjure' || role === 'seal' || role === 'judgement') return true;
  if (role === 'charge') return true;

  // Form enter: only on form-using specs (Feral druids; warriors any stance tree).
  if (role === 'form') {
    return hooks.allowFormFallback?.(spec) ?? true;
  }

  // Heals / self keep-ups are not the cross-kit problem (recovery + buffs).
  if (role === 'buff') {
    // Misclassified ranged channels already corrected in inferRole; any remaining buff
    // with only proc_trigger + range is still blocked below if reclassified as damage.
    return true;
  }

  const isDamageRole =
    role === 'nuke' ||
    role === 'instant_nuke' ||
    role === 'strike' ||
    role === 'dot' ||
    role === 'control';

  if (!isDamageRole) return true;

  // Class/spec kit filter (school tables, feral vs caster, …).
  return hooks.allowFallbackSpell?.(spell, spec) ?? true;
}

/** After authored suggestion rows — class post-pass (e.g. paladin seals). */
export function applyClassAfterSuggestion(ctx: FinalizeContext): void {
  CLASS_HOOKS[ctx.classKey].afterSuggestion?.(ctx);
}

// After role-bucket tail + interrupt hoist. Always runs stance reconcile (historical global; body in
// warrior.ts), then class hooks.
export function applyClassAfterFallback(ctx: FinalizeContext): void {
  // Fury thrash: combat wants Berserker Stance while pull still lists Battle Stance and Charge.
  // Align the pull form with combat's and swap Charge for Intercept when berserking.
  ctx.phases.pull = reconcilePullStanceWithCombat(
    ctx.phases.pull,
    ctx.phases.combat,
    ctx.knownById,
    ctx.ds,
    ctx.known,
  );
  CLASS_HOOKS[ctx.classKey].afterFallback?.(ctx);
  ensureCastTimePullOpener(ctx);
  // Slowest-landing cast first so a multi-cast opener lands together (Shadow Bolt -> Immolate).
  orderPullByTimeToLand(ctx);
}
