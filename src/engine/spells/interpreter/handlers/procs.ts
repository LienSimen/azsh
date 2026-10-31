/** SI2.5 / SI3 handlers — procs (split from handlers.ts, pure move). */

import type { RawSpellEffect, SpellEffect } from '../../../../data/schema.ts';
import { effectAmountRange, clampPositiveRange } from '../amount.ts';
import {
  bakeEffectFromProcMeta,
  buildProcTriggerSpellMeta,
  tryProcTriggerSpell,
} from '../proc.ts';
import type {
  InterpretIntent,
} from '../types.ts';
import type {
  HandlerState,
} from './shared.ts';
import {
  schoolOf,
  durationMsResolved,
} from './shared.ts';
import { interpretTriggerSpell } from './registry.ts';
// ── SPELL_AURA_PROC_TRIGGER_SPELL (42) ── the chance, PPM and cooldown subsystem lives in proc.ts.
// Cite: SpellAuras.cpp:3062 apply; UnitAuraProcHandler.cpp:515, :1242 fire.
export function handleProcTriggerSpell(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  const { min, max } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const school = schoolOf(state.spell);

  const meta = buildProcTriggerSpellMeta(state.spell, raw, min, max, dur, school);
  if (!meta) return;

  // Bake surface (LOCK 9a). Cite: map-spell-effects.mjs:1112–1156.
  const bakeFx = bakeEffectFromProcMeta(meta, dur);
  if (bakeFx) {
    state.effects.push(bakeFx);
    state.role = state.role || 'buff';
  }

  // Full proc meta intent for SI5/SI6 fire path.
  const intent: InterpretIntent = {
    kind: 'proc_trigger_spell',
    holderSpellId: meta.holderSpellId,
    triggerSpellId: meta.triggerSpellId,
    procFlags: meta.procFlags,
    chancePct: meta.chancePct,
    amount: meta.amount,
  };
  if (meta.procEx != null) intent.procEx = meta.procEx;
  if (meta.ppmRate != null) intent.ppmRate = meta.ppmRate;
  if (meta.cooldownMs != null) intent.cooldownMs = meta.cooldownMs;
  if (meta.charges != null) intent.charges = meta.charges;
  if (meta.schoolMask != null) intent.schoolMask = meta.schoolMask;
  if (meta.spellFamilyName != null) intent.spellFamilyName = meta.spellFamilyName;
  if (meta.spellFamilyMask != null) intent.spellFamilyMask = meta.spellFamilyMask;

  // Fire-time evaluation only when the combat context supplies an event and an rng; a thin bake omits
  // the proc event, so no roll is drawn and the RNG order is unchanged.
  if (state.ctx.procEvent && state.ctx.rng) {
    const nowMs = state.ctx.nowMs ?? 0;
    const eventCtx = {
      procFlags: state.ctx.procEvent.procFlags,
      procEx: state.ctx.procEvent.procEx,
      weaponSpeedMs: state.ctx.weaponSpeedMs,
      nowMs,
      schoolMask: state.ctx.procEvent.schoolMask,
      spellFamilyName: state.ctx.procEvent.spellFamilyName,
      spellFamilyFlags: state.ctx.procEvent.spellFamilyFlags,
    };
    // Adapt () => number rng seam to Rng.chance. Cite: types.ts InterpretContext.rng.
    const rngFn = state.ctx.rng;
    const rngAdapter = {
      next: rngFn,
      int: (lo: number, hi: number) => lo + Math.floor(rngFn() * (hi - lo + 1)),
      chance: (p: number) => rngFn() < p,
    };
    const result = tryProcTriggerSpell(meta, eventCtx, rngAdapter, {
      cooldownReadyAt: state.ctx.procCooldownReadyAt,
    });
    intent.fired = result.fired;
    intent.cooldownReadyAt = result.cooldownReadyAt;

    // On fire: resolve trigger through interpreter dispatch.
    // Cite: UnitAuraProcHandler.cpp:698–725 TriggerProccedSpell.
    if (result.fired && meta.triggerSpellId > 0 && state.ctx.spellLookup) {
      const triggerDef = state.ctx.spellLookup(meta.triggerSpellId);
      if (triggerDef) {
        // A local import would cycle through index, so the trigger is interpreted by constructing a
        // thin state and running the handler table inline.
        const nested = interpretTriggerSpell(triggerDef, state.ctx);
        state.intents.push({
          kind: 'proc_triggered_cast',
          triggerSpellId: meta.triggerSpellId,
          effects: nested.effects,
        });
      }
    }
  }

  state.intents.push(intent);
}

// ── SPELL_AURA_PROC_TRIGGER_DAMAGE (43) ── baked as a damage shield.
// Cite: SpellAuras.cpp:104; UnitAuraProcHandler.cpp:1557-1583 HandleProcTriggerDamageAuraProc.
export function handleProcTriggerDamage(
  state: HandlerState,
  raw: RawSpellEffect,
  _slot: number,
  _effectType: number,
): void {
  // Proc: CalculateSpellDamage(amount) + DealSpellDamage on successful hit.
  // Cite: UnitAuraProcHandler.cpp:1577–1582. Resist/miss → resist log. Cite: :1568–1571.
  const { min, max } = effectAmountRange(raw, state.ctx);
  const dur = durationMsResolved(state);
  const clamped = clampPositiveRange(min, max || min);
  const effect: SpellEffect = {
    kind: 'damage_shield',
    school: schoolOf(state.spell),
    min: clamped.min,
    max: clamped.max,
    durationMs: dur || 600_000,
  };
  // Bake attaches proc charges when present. Cite: map-spell-effects.mjs:773–775.
  const charges = (state.spell.procCharges ?? 0) | 0;
  if (charges > 0) effect.charges = charges;
  state.effects.push(effect);
  state.role = state.role || 'buff';
}
