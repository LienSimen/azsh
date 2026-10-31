// Materialize SPELL_AURA_MOD_DAMAGE_PERCENT_TAKEN (87) onto bake rows that kept only the resist half
// of Curse of the Elements / Shadow. Physical-only mask → physical_taken_pct. Cite: Unit.cpp:7628.

import type { SpellDef, SpellEffect } from './schema.ts';
import { durMs } from '../engine/spells/interpreter/duration.ts';

const APPLY_AURA = 6;
const MOD_DAMAGE_PERCENT_TAKEN = 87;

function hasTakenPct(effects: SpellEffect[] | undefined): boolean {
  return (effects ?? []).some(
    (e) =>
      e.kind === 'buff'
      && (e.mod === 'damage_taken_pct' || e.mod === 'physical_taken_pct'),
  );
}

function durationFromSpell(spell: SpellDef): number {
  for (const e of spell.effects ?? []) {
    if ('durationMs' in e && typeof (e as { durationMs?: number }).durationMs === 'number') {
      const d = (e as { durationMs: number }).durationMs;
      if (d > 0) return d;
    }
  }
  if (spell.durationIndex != null) return durMs(spell.durationIndex) || 0;
  return 0;
}

/** Stamp missing aura-87 taken-% buffs onto spell.effects. Idempotent. */
export function materializeModDamagePercentTaken(spell: SpellDef): void {
  const raw = spell.rawEffects;
  if (!raw?.length) return;
  if (hasTakenPct(spell.effects)) return;

  const slots = raw.filter(
    (r) => (r.effect | 0) === APPLY_AURA && (r.auraName | 0) === MOD_DAMAGE_PERCENT_TAKEN,
  );
  if (!slots.length) return;

  const durationMs = durationFromSpell(spell);
  if (!spell.effects) spell.effects = [];

  for (const r of slots) {
    const bp = r.basePoints | 0;
    const bd = r.baseDice | 0;
    const min = bp + Math.max(bd, 0);
    const misc = r.miscValue | 0;
    const tgtA = r.targetA | 0;
    // Hostile enemy targets (TARGET_UNIT_ENEMY=6 and family). Cite: withHostile HOSTILE_IMPLICIT.
    const hostile = tgtA === 6 || tgtA === 25 || tgtA === 15 || min < 0;
    if (misc === 1) {
      spell.effects.push({
        kind: 'buff',
        mod: 'physical_taken_pct',
        amount: min,
        durationMs,
        ...(hostile ? { hostile: true as const } : {}),
      });
    } else {
      spell.effects.push({
        kind: 'buff',
        mod: 'damage_taken_pct',
        amount: min,
        durationMs,
        ...(misc ? { schoolMask: misc } : {}),
        ...(hostile ? { hostile: true as const } : {}),
      });
    }
  }
}
