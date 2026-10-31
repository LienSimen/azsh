// SPELL_EFFECT_DISENCHANT: a player caster plus an item target with a disenchant id updates the craft
// skill and shows the loot. The destroy and yield stay on the existing domain path.

import type { RawSpellEffect } from '../../../../data/schema.ts';
import type { HandlerState } from './shared.ts';

export function handleDisenchant(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  // Cite: :4642–4643 !TYPEID_PLAYER return.
  if (state.ctx.casterIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'DISENCHANT requires player caster' });
    return;
  }
  // itemTarget + DisenchantID are runtime (C++ :4646–4647). Bake-thin emit so the
  // opcode is not empty-effects inert; OOC cast hits game.disenchant(itemEntry).
  state.effects.push({ kind: 'disenchant' });
  state.role = state.role || 'utility';
}
