// Remaining live-castable effect opcodes (spellops remainder). Real payloads emit effects[] a host reads;
// unused/empty C++ is a cited no-op.

import type { RawSpellEffect } from '../../../../data/schema.ts';
import { effectAmountRange } from '../amount.ts';
import type { HandlerState } from './shared.ts';
import { schoolOf } from './shared.ts';

// SPELL_EFFECT_ADD_HONOR (45). Player unitTarget → AddHonorCP(damage, HONORABLE). Amount is calculated
// effect value. Cite: SpellEffects.cpp:3026–3035 EffectAddHonor.
export function handleAddHonor(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'ADD_HONOR requires player unitTarget' });
    return;
  }
  const { min } = effectAmountRange(raw, state.ctx);
  const amount = Math.max(0, min);
  state.effects.push({ kind: 'add_honor', amount });
  state.role = state.role || 'utility';
}

// SPELL_EFFECT_ENVIRONMENTAL_DAMAGE (7). damage = CalculateSimpleValue; EnvironmentalDamage on caster
// (GO-cast hack). Cite: SpellEffects.cpp:223–238 EffectEnvironmentalDMG.
export function handleEnvironmentalDamage(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const { min, max } = effectAmountRange(raw, state.ctx);
  state.effects.push({
    kind: 'direct_damage',
    school: schoolOf(state.spell),
    min: Math.max(0, min),
    max: Math.max(0, max),
  });
}

// SPELL_EFFECT_DESTROY_ALL_TOTEMS (110). UnSummon every slot. Cite: SpellEffects.cpp:5202–5207
// EffectDestroyAllTotems.
export function handleDestroyAllTotems(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.effects.push({ kind: 'destroy_all_totems' });
  state.role = state.role || 'utility';
}

// SPELL_EFFECT_SPIRIT_HEAL (117). ResurrectPlayer(1.0f) — 100% health. Spell 22012 also requires aura 2584
// at runtime (Waiting to Resurrect). Cite: SpellEffects.cpp:5462–5496 EffectSpiritHeal.
export function handleSpiritHeal(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  if (state.ctx.unitTargetIsAlive === true) {
    state.intents.push({ kind: 'skip_effect', reason: 'SPIRIT_HEAL target is alive' });
    return;
  }
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'SPIRIT_HEAL requires player unitTarget' });
    return;
  }
  state.effects.push({ kind: 'resurrect_pct', percent: 1 });
  state.role = state.role || 'utility';
}

// SPELL_EFFECT_EVADE (21) — EffectEmpty marker. Cite: SpellEffects.cpp:79 dispatch → EffectEmpty :190–193.
export function handleEvade(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.effects.push({ kind: 'client_inform' });
}

// SPELL_EFFECT_STEALTH (48) — EffectUnused. Cite: SpellEffects.cpp:106 dispatch → EffectUnused :200–203.
export function handleStealthUnused(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.effects.push({ kind: 'client_inform' });
}

// SPELL_EFFECT_CREATE_HOUSE (81) — EffectUnused TEST. Cite: SpellEffects.cpp:139 dispatch → EffectUnused
// :200–203.
export function handleCreateHouse(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.effects.push({ kind: 'client_inform' });
}

/** SPELL_EFFECT_PULL (70) — TODO dummy, DEBUG_LOG only. Cite: SpellEffects.cpp:2634–2638 EffectPull. */
export function handlePullDummy(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.effects.push({ kind: 'client_inform' });
}

// SPELL_EFFECT_SUMMON_PLAYER (85) — SetSummonPoint + SMSG_SUMMON_REQUEST (world-sim). Cite:
// SpellEffects.cpp:4356–4375 EffectSummonPlayer.
export function handleSummonPlayer(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'SUMMON_PLAYER requires player unitTarget' });
    return;
  }
  state.effects.push({ kind: 'summon_player' });
}

// SPELL_EFFECT_SEND_TAXI (123) — ActivateTaxiPathTo (world-sim). Cite: SpellEffects.cpp:5124–5130
// EffectSendTaxi.
export function handleSendTaxi(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'SEND_TAXI requires player unitTarget' });
    return;
  }
  state.effects.push({ kind: 'send_taxi', pathId: raw.miscValue | 0 });
}

/** SPELL_EFFECT_122 — EffectUnused. Cite: SpellEffects.cpp:180, :200–203. */
export function handleEffect122(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.effects.push({ kind: 'client_inform' });
}

/** SPELL_EFFECT_126 — EffectUnused (one test spell). Cite: SpellEffects.cpp:184, :200–203. */
export function handleEffect126(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.effects.push({ kind: 'client_inform' });
}
