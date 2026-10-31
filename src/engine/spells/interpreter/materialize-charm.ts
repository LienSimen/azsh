// Runtime stamp of a charm or possess aura the partial bake dropped: the mapper kept only the haste
// rider while the raw effects still carry the control, so the row is stamped for inspection.

import type { SpellDef, SpellEffect } from '../../../data/schema.ts';
import { resolveDurationMs } from './duration.ts';
import {
  SPELL_AURA_AOE_CHARM,
  SPELL_AURA_MOD_CHARM,
  SPELL_AURA_MOD_POSSESS,
  SPELL_AURA_MOD_POSSESS_PET,
  SPELL_EFFECT_APPLY_AURA,
} from './opcodes.ts';

/** Charm/possess family — same set as map-spell-effects.mjs P0.5. */
const CHARM_AURAS = new Set<number>([
  SPELL_AURA_MOD_POSSESS, // 2
  SPELL_AURA_MOD_CHARM, // 6
  SPELL_AURA_MOD_POSSESS_PET, // 128
  SPELL_AURA_AOE_CHARM, // 177 — TakeCharmOf advertised=false
]);

function hasCharmControl(effects: readonly SpellEffect[] | undefined): boolean {
  return (effects ?? []).some(
    (e) =>
      e.kind === 'cc'
      && ((e as { mechanic?: string }).mechanic === 'charm'
        || (e as { control?: string }).control === 'charm'),
  );
}

// Append missing charm/possess cc from raw APPLY_AURA slots. Does not mutate `spell`. No-op when bake is
// hollow — fillEmpty / resolveCombatSpell owns those rows.
export function materializeMissingCharmFromRaw(
  spell: SpellDef,
  effectsIn?: readonly SpellEffect[],
): SpellEffect[] {
  const effects = effectsIn ? effectsIn.slice() : (spell.effects ? spell.effects.slice() : []);
  if (!effects.length) return effects;
  if (hasCharmControl(effects)) return effects;
  const raw = spell.rawEffects;
  if (!raw?.length) return effects;
  if (!raw.some((r) => (r.effect | 0) === SPELL_EFFECT_APPLY_AURA && CHARM_AURAS.has(r.auraName | 0))) {
    return effects;
  }

  let durationMs = resolveDurationMs(undefined, undefined, spell.durationIndex) ?? 0;
  if (durationMs <= 0) {
    for (const e of effects) {
      const d = (e as { durationMs?: number }).durationMs;
      if (typeof d === 'number' && d > 0) { durationMs = d; break; }
    }
  }
  // map-spell-effects fallback for charm when DurationIndex is unset.
  // Cite: map-spell-effects.mjs:768 durationMs: dur || 10000.
  if (durationMs <= 0) durationMs = 10_000;

  const school = typeof spell.school === 'string' ? spell.school : 'shadow';
  // One cc row for the family. Aura 177 is non-advertised (HandleAoECharm).
  // control:'charm' drives TakeCharmOf thrall path (not incap). Cite: KI-896.
  effects.push({
    kind: 'cc',
    control: 'charm',
    mechanic: 'charm',
    durationMs,
    school,
  } as SpellEffect);
  return effects;
}

// In-place stamp of missing charm onto a non-empty bake row. Idempotent. Retags role buff→control when
// charm is added (haste rider had set role buff). Cite: stampMissingSpeedFromRaw; KI-801.
export function stampMissingCharmFromRaw(spell: SpellDef): boolean {
  if (!spell.effects?.length) return false;
  if (hasCharmControl(spell.effects)) return false;
  const next = materializeMissingCharmFromRaw(spell);
  const missing = next.filter(
    (e) =>
      e.kind === 'cc'
      && (e as { mechanic?: string }).mechanic === 'charm'
      && !hasCharmControl(spell.effects),
  );
  if (missing.length === 0) return false;
  const base = spell.effects.slice();
  for (const e of missing) base.push({ ...e });
  spell.effects = base;
  if (spell.role === 'buff' || !spell.role) spell.role = 'control';
  return true;
}
