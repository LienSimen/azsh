// Fold unread DISPEL_MECHANIC intents into a combat/OOC effect. CC mechanics stay on warrior-druid-kit
// cleanse. Cite: SpellEffects.cpp:2499–2519.

import type { SpellEffect } from '../../../data/schema.ts';
import type { InterpretIntent } from './types.ts';

/** Same ControlKind set warrior-druid-kit.mechanicToControl maps. Cite: SharedDefines.h:351–374. */
const CLEANSE_MECHANICS = new Set([1, 3, 5, 7, 9, 10, 11, 12]);

export function materializeDispelMechanicIntents(
  intents: readonly InterpretIntent[] | undefined,
  effectsIn: SpellEffect[],
): SpellEffect[] {
  if (!intents?.length) return effectsIn;
  let effects = effectsIn;
  for (const intent of intents) {
    if (intent.kind !== 'dispel_mechanic') continue;
    const mechanic = intent.mechanic | 0;
    if (!mechanic || CLEANSE_MECHANICS.has(mechanic)) continue;
    if (effects.some((e) => e.kind === 'dispel_mechanic' && e.mechanic === mechanic)) continue;
    const count = Math.max(1, intent.count | 0);
    effects = [...effects, { kind: 'dispel_mechanic', mechanic, count }];
  }
  return effects;
}
