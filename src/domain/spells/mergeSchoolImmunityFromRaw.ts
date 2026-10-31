// Merge missing self school_immunity effects from rawEffects onto incomplete bake rows: Divine Shield
// shipped haste-only because effects[] was already non-empty. Hostile aura-39 is skipped.

import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import { durMs } from '../../engine/spells/interpreter/duration.ts';

/** SPELL_EFFECT_APPLY_AURA. Cite: SpellEffectDefines.h = 6. */
const SPELL_EFFECT_APPLY_AURA = 6;
/** SPELL_AURA_SCHOOL_IMMUNITY. Cite: SpellAuraDefines.h = 39. */
const SPELL_AURA_SCHOOL_IMMUNITY = 39;

// Enemy-family EffectImplicitTargetA values — same set as enrich-spell-effects.mjs HOSTILE_IMM_TGT (Banish
// etc.). Cite: SpellTargetDefines.h TARGET_UNIT_ENEMY=6, …
const HOSTILE_IMM_TGT = new Set([2, 6, 15, 16, 22, 24, 28, 36, 54]);

function durationFromSpell(spell: SpellDef): number {
  for (const e of spell.effects ?? []) {
    const d = (e as { durationMs?: number }).durationMs;
    if (d != null && d > 0) return d | 0;
  }
  return durMs(spell.durationIndex) ?? 0;
}

// Return a SpellDef whose effects[] include every self school_immunity from rawEffects. Idempotent; never
// invents masks or durations — only raw miscValue + sourced duration. Does not mutate the input.
export function mergeSchoolImmunityFromRaw(spell: SpellDef): SpellDef {
  const raw = spell.rawEffects;
  if (!raw?.length) return spell;

  const slots = raw.filter(
    (r) =>
      (r.effect | 0) === SPELL_EFFECT_APPLY_AURA
      && (r.auraName | 0) === SPELL_AURA_SCHOOL_IMMUNITY
      && !HOSTILE_IMM_TGT.has(r.targetA | 0),
  );
  if (!slots.length) return spell;

  const effects: SpellEffect[] = spell.effects ? spell.effects.slice() : [];
  const dur = durationFromSpell(spell);
  let changed = false;

  for (const r of slots) {
    const schoolMask = r.miscValue | 0;
    if (effects.some((e) => e.kind === 'school_immunity' && (e.schoolMask | 0) === schoolMask)) {
      continue;
    }
    effects.push({
      kind: 'school_immunity',
      schoolMask,
      durationMs: dur,
      positive: true,
    });
    changed = true;
  }

  if (!changed) return spell;
  return { ...spell, effects };
}

/** In-place hydrate for Map/list loaders (dataStore). Mutates spell.effects when needed. */
export function hydrateSchoolImmunityOnSpell(spell: SpellDef): void {
  const next = mergeSchoolImmunityFromRaw(spell);
  if (next !== spell) {
    spell.effects = next.effects;
  }
}
