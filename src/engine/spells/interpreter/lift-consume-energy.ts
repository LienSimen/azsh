// Combat's apply reads the effect list only, so lift the consume and energy slots or Swiftmend,
// Conflagrate and Ferocious Bite never peel their resource. Cite: SpellEffects.cpp:1842-1877.

import type { SpellEffect } from '../../../data/schema.ts';
import type { InterpretIntent } from './types.ts';

export function liftConsumeEnergyIntents(
  intents: readonly InterpretIntent[] | undefined,
  effects: SpellEffect[],
): SpellEffect[] {
  if (!intents?.length) return effects;
  for (const intent of intents) {
    if (intent.kind === 'consume_aura') {
      const already = effects.some(
        (e) =>
          e.kind === 'consume_aura'
          && e.spellId === intent.spellId
          && e.spellFamilyFlags === intent.spellFamilyFlags,
      );
      if (already) continue;
      effects.push({
        kind: 'consume_aura',
        spellFamilyName: intent.spellFamilyName,
        spellFamilyFlags: intent.spellFamilyFlags,
        auraType: intent.auraType,
        ...(intent.spellId != null ? { spellId: intent.spellId } : {}),
        ...(intent.casterOnly ? { casterOnly: true } : {}),
        ...(intent.stacks != null ? { stacks: intent.stacks } : {}),
      });
    } else if (intent.kind === 'zero_energy') {
      if (!effects.some((e) => e.kind === 'zero_energy')) {
        effects.push({ kind: 'zero_energy' });
      }
    }
  }
  return effects;
}
