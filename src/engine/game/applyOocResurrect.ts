// OOC cast apply for RESURRECT / RESURRECT_NEW schema effects. Cite: SpellEffects.cpp:4797–4871
// EffectResurrect; domain/spells/resurrectSpell.ts; KI-111/116/121.

import type { SpellEffect } from '../../data/schema.ts';
import { applyResurrectEffect } from '../../domain/spells/resurrectSpell.ts';
import type { GameState } from './types.ts';
import type { DataStore } from '../../data/dataStore.ts';
import { maxHealth, maxPower, powerType } from '../../domain/character/character.ts';
import { classHasParallelMana } from '../../domain/character/forms.ts';

type ResEff = Extract<SpellEffect, { kind: 'resurrect' } | { kind: 'resurrect_pct' }>;
type SelfResEff = Extract<SpellEffect, { kind: 'self_resurrect' }>;

// Apply one resurrect effect on the OOC cast path. Mutates `state` when a dead target is available
// (deathFlow GHOST/CORPSE or forceSelf). Returns log line.
export function applyOocResurrectEffect(
  state: GameState,
  ds: DataStore,
  eff: ResEff,
  spellName: string,
  forceSelf: boolean,
): string {
  const res = applyResurrectEffect({
    effect: eff,
    maxHealth: maxHealth(state.char, ds),
    maxMana: maxPower(state.char, ds),
    deathFlow: state.deathFlow,
    forceSelf,
    powerType: powerType(state.char),
    hasParallelMana: classHasParallelMana(state.char.cls),
  });
  if (res.health == null) {
    return `${spellName}: ${res.log}`;
  }
  if (res.clearDeathFlow && state.deathFlow) {
    state.deathFlow = {
      ...state.deathFlow,
      deathState: 'ALIVE',
      corpse: null,
      position: null,
      graveyard: null,
      reclaimDelayMs: 0,
      deathAtMs: 0,
      deathExpireTimeSec: res.clearDeathFlow.deathExpireTimeSec,
    };
  }
  state.char.health = res.health;
  if (res.mana != null) {
    const pt = powerType(state.char);
    if (pt === 'mana') state.char.power = res.mana;
    else if (classHasParallelMana(state.char.cls)) state.char.mana = res.mana;
  }
  return res.log;
}

// SPELL_EFFECT_SELF_RESURRECT (94) — always self, no party-corpse request. Cite: SpellEffects.cpp
// EffectSelfResurrect :4937–4968.
export function applyOocSelfResurrectEffect(
  state: GameState,
  ds: DataStore,
  eff: SelfResEff,
  spellName: string,
): string {
  // Map to RESURRECT / RESURRECT_NEW shapes for the shared apply helper.
  const mapped: ResEff =
    eff.percent != null
      ? { kind: 'resurrect_pct', percent: eff.percent }
      : { kind: 'resurrect', health: eff.health ?? 0, mana: eff.mana ?? 0 };
  // Self-res always targets the caster (forceSelf). Cite: :4939–4963 ResurrectPlayer on m_caster.
  return applyOocResurrectEffect(state, ds, mapped, spellName, true);
}
