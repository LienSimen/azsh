// Fold unread SPELL_AURA_SPELL_MAGNET intents into a combat effect. Cite: SpellAuras.cpp:159
// HandleNoImmediateEffect; Unit.cpp:6896–6922 SelectMagnetTarget.

import type { SpellDef, SpellEffect } from '../../../data/schema.ts';
import type { InterpretIntent } from './types.ts';

export function materializeSpellMagnetIntents(
  intents: readonly InterpretIntent[] | undefined,
  effectsIn: SpellEffect[],
  spell: SpellDef,
): SpellEffect[] {
  if (!intents?.length) return effectsIn;
  if (effectsIn.some((e) => e.kind === 'spell_magnet')) return effectsIn;
  let effects = effectsIn;
  for (const intent of intents) {
    if (intent.kind !== 'spell_magnet') continue;
    const charges = spell.procCharges != null && spell.procCharges > 0 ? spell.procCharges : 1;
    effects = [...effects, { kind: 'spell_magnet', durationMs: intent.durationMs | 0, charges }];
    break;
  }
  return effects;
}
