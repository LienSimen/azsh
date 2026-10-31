// Runtime stamp of the rating buffs a partial bake dropped from a second aura slot: the resolver
// already interprets both, and this puts the missing one on the shared bake row.

import type { SpellDef, SpellEffect } from '../../../data/schema.ts';
import { effectAmountRange } from './amount.ts';
import { resolveDurationMs } from './duration.ts';
import {
  SPELL_EFFECT_APPLY_AURA,
} from './opcodes.ts';
import { withHostile } from './targeting.ts';

/** SpellAuraDefines → BuffMod string (same as map-spell-effects rating block). */
const RATING_AURA_TO_MOD: Readonly<Record<number, 'parry' | 'dodge' | 'block' | 'crit' | 'hit'>> = {
  47: 'parry',
  49: 'dodge',
  51: 'block',
  52: 'crit',
  54: 'hit',
};

// Append missing rating buffs from raw APPLY_AURA slots. Does not mutate `spell`. No-op when bake is hollow
// — full resolve owns those rows.
export function materializeMissingRatingBuffsFromRaw(
  spell: SpellDef,
  effectsIn?: readonly SpellEffect[],
): SpellEffect[] {
  const effects = effectsIn ? effectsIn.slice() : (spell.effects ? spell.effects.slice() : []);
  if (!effects.length) return effects;
  const raw = spell.rawEffects;
  if (!raw?.length) return effects;

  let durationMs = resolveDurationMs(undefined, undefined, spell.durationIndex) ?? 0;
  if (durationMs <= 0) {
    for (const e of effects) {
      const d = (e as { durationMs?: number }).durationMs;
      if (typeof d === 'number' && d > 0) { durationMs = d; break; }
    }
  }

  for (const r of raw) {
    if ((r.effect | 0) !== SPELL_EFFECT_APPLY_AURA) continue;
    const aura = r.auraName | 0;
    const mod = RATING_AURA_TO_MOD[aura];
    if (!mod) continue;
    if (effects.some((e) => e.kind === 'buff' && (e as { mod?: string }).mod === mod)) continue;

    const { min } = effectAmountRange(r, {});
    const tagged = withHostile(
      {
        kind: 'buff' as const,
        mod,
        amount: min,
        durationMs: durationMs || 0,
      },
      r.targetA | 0,
      min,
    );
    effects.push(tagged as SpellEffect);
  }
  return effects;
}

// In-place stamp of missing rating buffs onto a non-empty bake row. Idempotent. Cite:
// stampMissingSpeedFromRaw; KI-591.
export function stampMissingRatingBuffsFromRaw(spell: SpellDef): boolean {
  if (!spell.effects?.length) return false;
  const next = materializeMissingRatingBuffsFromRaw(spell);
  const missing = next.filter(
    (e) => e.kind === 'buff'
      && typeof (e as { mod?: string }).mod === 'string'
      && ['parry', 'dodge', 'block', 'crit', 'hit'].includes((e as { mod: string }).mod)
      && !(spell.effects ?? []).some(
        (x) => x.kind === 'buff' && (x as { mod?: string }).mod === (e as { mod: string }).mod,
      ),
  );
  if (missing.length === 0) return false;
  const base = spell.effects.slice();
  for (const e of missing) base.push({ ...e });
  spell.effects = base;
  return true;
}
