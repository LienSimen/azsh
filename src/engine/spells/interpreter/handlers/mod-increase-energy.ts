// SPELL_AURA_MOD_INCREASE_ENERGY (35), peeled from auras-misc for the filesize ceiling.
// Cite: SpellAuras.cpp:3719-3726 HandleAuraModIncreaseEnergy; characterStats maxMana.

import type { RawSpellEffect, SpellEffect } from '../../../../data/schema.ts';
import { effectAmountRange } from '../amount.ts';
import { withHostile } from '../targeting.ts';
import type { HandlerState } from './shared.ts';
import { durationMsResolved } from './shared.ts';

/** Powers misc: 0 mana → max_mana buff; other pools intent-only (no BuffMod yet). */
export function handleModIncreaseEnergy(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const power = raw.miscValue | 0;
  // UNIT_MOD_POWER_START + powerType TOTAL_VALUE. Cite: SpellAuras.cpp:3722–3726.
  state.intents.push({
    kind: 'mod_increase_energy',
    powerType: power,
    amount: min,
    durationMs: dur,
  });
  // Dual-push effects[] so resolveCombatSpell / consume apply flasks (KI-907).
  if (power === 0) {
    state.effects.push(withHostile(
      { kind: 'buff' as const, mod: 'max_mana' as const, amount: min, durationMs: dur },
      raw.targetA | 0,
      min,
    ) as SpellEffect);
  }
  state.role = state.role || 'buff';
}
