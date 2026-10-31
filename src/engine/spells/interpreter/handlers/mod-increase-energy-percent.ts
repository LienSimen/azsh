// SPELL_AURA_MOD_INCREASE_ENERGY_PERCENT (132). Cite: SpellAuras.cpp:3734-3743
// HandleAuraModIncreaseEnergyPercent.

import type { RawSpellEffect, SpellEffect } from '../../../../data/schema.ts';
import { effectAmountRange } from '../amount.ts';
import { withHostile } from '../targeting.ts';
import type { HandlerState } from './shared.ts';
import { durationMsResolved } from './shared.ts';

export function handleModIncreaseEnergyPercent(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const power = raw.miscValue | 0;

  // UNIT_MOD_POWER_START + powerType TOTAL_PCT. Cite: SpellAuras.cpp:3741.
  state.intents.push({
    kind: 'mod_increase_energy_percent',
    powerType: power,
    amount: min,
    durationMs: dur,
  });

  if (power === 0) {
    state.effects.push(withHostile(
      { kind: 'buff' as const, mod: 'max_mana_pct' as const, amount: min, durationMs: dur },
      raw.targetA | 0,
      min,
    ) as SpellEffect);
  }
  state.role = state.role || 'buff';
}
