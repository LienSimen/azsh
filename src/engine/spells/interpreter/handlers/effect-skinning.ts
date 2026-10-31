// SPELL_EFFECT_SKINNING: a player caster plus a creature target shows the skinning loot and updates the
// gather skill. The yield itself stays on the existing corpse path.

import type { RawSpellEffect } from '../../../../data/schema.ts';
import type { HandlerState } from './shared.ts';

export function handleSkinning(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  // Cite: :4972–4974 !IsCreature / !IsPlayer return.
  if (state.ctx.unitTargetIsCreature === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'SKINNING requires creature unitTarget' });
    return;
  }
  if (state.ctx.casterIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'SKINNING requires player caster' });
    return;
  }
  // Bake-thin emit; OOC hits game.skin(). Cite: Spell.cpp:5503–5514 UNIT_FLAG_SKINNABLE.
  state.effects.push({ kind: 'skinning' });
  state.role = state.role || 'utility';
}
