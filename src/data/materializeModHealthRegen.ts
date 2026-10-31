// Materialize aura 161 MOD_HEALTH_REGEN_IN_COMBAT → restore_health, and correct stale rows that
// baked tickMs 1000 — the DBC amount is HP per 5 sec. Cite: Player.cpp:2407–2412; KI-575/576/685.

import type { SpellDef, SpellEffect } from './schema.ts';
import { durMs } from '../engine/spells/interpreter/duration.ts';

/** SPELL_EFFECT_APPLY_AURA */
const APPLY_AURA = 6;
/** SPELL_AURA_MOD_HEALTH_REGEN_IN_COMBAT */
const MOD_HEALTH_REGEN_IN_COMBAT = 161;
/** Tooltip / DBC period when EffectAmplitude is 0. */
const HP5_TICK_MS = 5000;

function hasRestoreHealth(effects: SpellEffect[] | undefined): boolean {
  return (effects ?? []).some((e) => e.kind === 'restore_health');
}

// True when the raw slots carry aura 161. It and aura 8 bake to the same `restore_health` shape but
// are consumed oppositely — a regen rate vs a discrete tick — and without the split HoTs heal twice.
export function hasModHealthRegenInCombat(spell: SpellDef | undefined): boolean {
  return (spell?.rawEffects ?? []).some(
    (r) => (r.effect | 0) === APPLY_AURA && (r.auraName | 0) === MOD_HEALTH_REGEN_IN_COMBAT,
  );
}

function durationFromSpell(spell: SpellDef): number {
  for (const e of spell.effects ?? []) {
    if ('durationMs' in e && typeof (e as { durationMs?: number }).durationMs === 'number') {
      const d = (e as { durationMs: number }).durationMs;
      if (d > 0) return d;
    }
  }
  if (spell.durationIndex != null) {
    return durMs(spell.durationIndex) || 0;
  }
  return 0;
}

/** Resolved tickMs for one aura-161 raw slot: amplitude when set, else HP5 period. */
function tickMsForRaw(r: { amplitude?: number }): number {
  const amp = (r.amplitude ?? 0) | 0;
  return amp > 0 ? amp : HP5_TICK_MS;
}

// Mutates `spell.effects` in place: adds restore_health when aura 161 has none, and rewrites a
// stale tickMs 1000 to 5000 when amp is 0. Idempotent.
export function materializeModHealthRegenInCombat(spell: SpellDef): void {
  const raw = spell.rawEffects;
  if (!raw?.length) return;
  if (!hasModHealthRegenInCombat(spell)) return;

  // Correct stale 1000ms period on already-baked restore_health (KI-575/576/685).
  // Only when every aura-161 slot has amp 0 (the Demon Skin / Troll's Blood class).
  const slots161 = raw.filter(
    (r) => (r.effect | 0) === APPLY_AURA && (r.auraName | 0) === MOD_HEALTH_REGEN_IN_COMBAT,
  );
  const allAmpZero = slots161.every((r) => (r.amplitude | 0) === 0);
  if (allAmpZero && hasRestoreHealth(spell.effects)) {
    for (const e of spell.effects ?? []) {
      if (e.kind !== 'restore_health') continue;
      if ((e.tickMs | 0) === 1000) {
        (e as { tickMs: number }).tickMs = HP5_TICK_MS;
      }
    }
    return;
  }

  if (hasRestoreHealth(spell.effects)) return;

  const durationMs = durationFromSpell(spell);
  const extras: SpellEffect[] = [];

  for (const r of slots161) {
    // effectAmountRange min: bp + max(baseDice, 0). Cite: amount.ts; map-spell-effects.
    const bp = r.basePoints | 0;
    const bd = r.baseDice | 0;
    const min = bp + Math.max(bd, 0);
    extras.push({
      kind: 'restore_health',
      amountPerTick: Math.max(1, min),
      tickMs: tickMsForRaw(r),
      durationMs,
    });
  }

  if (extras.length === 0) return;
  if (!spell.effects) spell.effects = [];
  for (const e of extras) spell.effects.push(e);
}
