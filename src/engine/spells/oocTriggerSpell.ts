// The out-of-combat trigger-spell payload: combat applies the triggered spell as a proc, while out of
// combat the beneficial restore and buff effects are expanded onto the caster.
import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../../domain/character/character.ts';
import { applyAura } from '../../domain/character/character.ts';
import { resolveCombatSpell } from './interpreter/index.ts';

function isHostileBuffOrSnare(eff: {
  kind: string;
  hostile?: boolean;
  amount?: number;
  pct?: number;
}): boolean {
  if (eff.kind === 'buff') {
    if (eff.hostile === true) return true;
    if (eff.hostile === false) return false;
    return (eff.amount ?? 0) < 0;
  }
  if (eff.kind === 'speed') {
    return !!eff.hostile || (eff.pct ?? 0) < 0;
  }
  return false;
}

// Apply a trigger_spell payload's OOC-safe effects onto `char`. Returns the same character when the trigger
// id is missing or has nothing beneficial.
export function applyOocTriggerSpell(
  char: Character,
  triggerSpellId: number,
  now: number,
  ds: DataStore,
  casterLevel: number,
): Character {
  const trigRaw = ds.spell(triggerSpellId);
  if (!trigRaw) return char;
  const trig = resolveCombatSpell(trigRaw, { casterLevel });
  let next = char;
  for (const te of trig.effects) {
    if (te.kind === 'restore_health' || te.kind === 'restore_power') {
      const dur = te.durationMs > 0 ? te.durationMs : 0;
      if (dur > 0) {
        next = applyAura(next, trig.id, dur, now, ds);
      }
    } else if (te.kind === 'buff' && !isHostileBuffOrSnare(te)) {
      next = applyAura(next, trig.id, te.durationMs, now, ds);
    }
  }
  return next;
}
