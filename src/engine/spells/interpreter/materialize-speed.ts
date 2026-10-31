// Runtime merge of the speed auras the raw effects carry but a re-bake dropped. The resolver already
// interprets them at cast; this stamps the missing rows for kit, display and repro inspection.

import type { Mechanic, SpellDef, SpellEffect } from '../../../data/schema.ts';
import { MECHANIC_ID } from '../../../domain/creature/creatureAiConstants.ts';
import { effectAmountRange } from './amount.ts';
import { resolveDurationMs } from './duration.ts';
import {
  SPELL_AURA_MOD_DECREASE_SPEED,
  SPELL_AURA_MOD_INCREASE_MOUNTED_SPEED,
  SPELL_AURA_MOD_INCREASE_SPEED,
  SPELL_AURA_MOD_INCREASE_SWIM_SPEED,
  SPELL_AURA_MOD_MOUNTED_SPEED_ALWAYS,
  SPELL_AURA_MOD_SPEED_ALWAYS,
  SPELL_AURA_USE_NORMAL_MOVEMENT_SPEED,
  SPELL_EFFECT_APPLY_AURA,
} from './opcodes.ts';
import { withHostile } from './targeting.ts';

/** SharedDefines Mechanics id → name (inverse of MECHANIC_ID). */
const MECHANIC_NAME_FROM_ID: Readonly<Record<number, Mechanic>> = Object.freeze(
  Object.fromEntries(
    Object.entries(MECHANIC_ID)
      .filter(([, id]) => id != null && id > 0)
      .map(([name, id]) => [id as number, name as Mechanic]),
  ),
);

/** SpellAuraDefines speed family — same set as map-spell-effects.mjs J2. */
const SPEED_AURAS = new Set<number>([
  SPELL_AURA_MOD_INCREASE_SPEED, // 31
  SPELL_AURA_MOD_INCREASE_MOUNTED_SPEED, // 32
  SPELL_AURA_MOD_DECREASE_SPEED, // 33
  SPELL_AURA_MOD_INCREASE_SWIM_SPEED, // 58
  SPELL_AURA_MOD_SPEED_ALWAYS, // 129
  SPELL_AURA_MOD_MOUNTED_SPEED_ALWAYS, // 130
  171, // SPELL_AURA_MOD_SPEED_NOT_STACK (no opcode export yet)
  172, // SPELL_AURA_MOD_MOUNTED_SPEED_NOT_STACK
  SPELL_AURA_USE_NORMAL_MOVEMENT_SPEED, // 191
]);

// Append missing `kind:'speed'` effects derived from raw APPLY_AURA speed slots. Returns a new effects
// array (may equal a copy of input when nothing to add). Does not mutate `spell`.
export function materializeMissingSpeedFromRaw(
  spell: SpellDef,
  effectsIn?: readonly SpellEffect[],
): SpellEffect[] {
  const effects = effectsIn ? effectsIn.slice() : (spell.effects ? spell.effects.slice() : []);
  const raw = spell.rawEffects;
  if (!raw?.length) return effects;

  // Prefer SpellDuration index; fall back to a sibling effect's durationMs (channel spells
  // like Mind Flay carry the window on the DoT row). Cite: KI-529; duration.ts durMs.
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
    if (!SPEED_AURAS.has(aura)) continue;
    if (effects.some((e) => e.kind === 'speed' && e.aura === aura)) continue;

    // Signed pct (slows negative). Cite: map-spell-effects.mjs:727–738; amount.ts.
    const { min } = effectAmountRange(r, {});
    // targetB decides hostility for a dest-at-caster location, which is a POINT on its own: dropping
    // it read a fear's flee rider as a caster self-buff. Cite: targeting.ts withHostile.
    const tagged = withHostile(
      {
        kind: 'speed' as const,
        aura,
        pct: min,
        durationMs,
      },
      r.targetA | 0,
      min,
      r.targetB | 0,
    );
    // A hostile speed row carries its own mechanic, or the engine defaults to snare — which made a
    // fear's flee rider both dispellable as a snare and reported as one. The same rule as the ETL.
    if (tagged.hostile === true || min < 0) {
      const mechId = (r.mechanic | 0) || (MECHANIC_ID[spell.mechanic as Mechanic] ?? 0);
      const mech = MECHANIC_NAME_FROM_ID[mechId] ?? 'snare';
      (tagged as { mechanic?: Mechanic }).mechanic = mech;
    }
    effects.push(tagged as SpellEffect);
  }
  return effects;
}

// In-place stamp of the missing speed effects onto the shared bake row, idempotent and reassigning
// when frozen. A no-op on a hollow bake, where stamping one row would mint a partial materialization.
export function stampMissingSpeedFromRaw(spell: SpellDef): boolean {
  if (!spell.effects?.length) return false;
  const next = materializeMissingSpeedFromRaw(spell);
  const missing = next.filter(
    (e) => e.kind === 'speed'
      && !(spell.effects ?? []).some((x) => x.kind === 'speed' && x.aura === e.aura),
  );
  if (missing.length === 0) return false;
  const base = spell.effects ? spell.effects.slice() : [];
  for (const e of missing) base.push({ ...e });
  spell.effects = base;
  return true;
}
