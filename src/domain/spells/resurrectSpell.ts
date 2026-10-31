// Player-corpse resurrection effects from the raw spell slots, stamped into schema effects so the
// DataStore and OOC cast see a live payload. Cite: SpellEffects.cpp:4797–4871 EffectResurrect.

import type { RawSpellEffect, SpellDef, SpellEffect } from '../../data/schema.ts';

/** SpellEffectDefines.h SPELL_EFFECT_RESURRECT = 18 */
export const SPELL_EFFECT_RESURRECT = 18;
/** SpellEffectDefines.h SPELL_EFFECT_RESURRECT_NEW = 113 */
export const SPELL_EFFECT_RESURRECT_NEW = 113;

/** The only two kinds resurrectEffectsFromRaw emits. */
export type ResurrectEffect = Extract<SpellEffect, { kind: 'resurrect' } | { kind: 'resurrect_pct' }>;

/** Bake-parity amount: basePoints + max(baseDice, 0). Cite: map-spell-effects.mjs; amount.ts. */
function effectMinAmount(raw: RawSpellEffect): number {
  const bp = raw.basePoints | 0;
  const bd = raw.baseDice | 0;
  return bp + Math.max(bd, 0);
}

/** Map raw RESURRECT / RESURRECT_NEW slots to schema effects. Empty when no resurrect opcodes present. */
export function resurrectEffectsFromRaw(
  rawEffects: readonly RawSpellEffect[] | undefined,
): ResurrectEffect[] {
  const out: ResurrectEffect[] = [];
  for (const r of rawEffects ?? []) {
    const eff = r.effect | 0;
    if (eff === SPELL_EFFECT_RESURRECT_NEW) {
      // Flat health = damage, mana = misc. Cite: EffectResurrect :4815–4818.
      out.push({
        kind: 'resurrect',
        health: Math.max(0, effectMinAmount(r)),
        mana: Math.max(0, r.miscValue | 0),
      });
    } else if (eff === SPELL_EFFECT_RESURRECT) {
      // Percent of max. Cite: EffectResurrect :4819–4824.
      out.push({
        kind: 'resurrect_pct',
        percent: Math.max(0, effectMinAmount(r)),
      });
    }
  }
  return out;
}

// When the bake left effects empty but raw carries a resurrect, stamp the schema payload and mark it
// out-of-combat only. Never clobbers non-empty effects.
export function withResurrectEffectsIfEmpty(spell: SpellDef): SpellDef {
  if ((spell.effects?.length ?? 0) > 0) return spell;
  const fx = resurrectEffectsFromRaw(spell.rawEffects);
  if (!fx.length) return spell;
  return {
    ...spell,
    effects: fx,
    outOfCombatOnly: true,
  };
}

/** Subset of DeathFlowState used for OOC res apply (avoids circular domain imports). */
export interface ResurrectDeathFlow {
  deathState: string;
  deathExpireTimeSec: number;
}

export interface ApplyResurrectInput {
  effect: ResurrectEffect;
  maxHealth: number;
  maxMana: number;
  deathFlow: ResurrectDeathFlow | null | undefined;
  /** Harness / self-force when no multiparty corpse model. */
  forceSelf?: boolean;
  powerType: string;
  hasParallelMana: boolean;
}

export interface ApplyResurrectResult {
  /** Flat HP after res (clamped 1..maxHealth). Null when no dead target. */
  health: number | null;
  mana: number | null;
  /** New ALIVE death flow when self was dead; undefined when unchanged. */
  clearDeathFlow?: { deathState: 'ALIVE'; deathExpireTimeSec: number };
  log: string;
}

// Pure OOC apply for RESURRECT and RESURRECT_NEW. The core offers a res request to a dead player, so
// single-player only applies when the caster is dead or forceSelf is set. No sickness.
export function applyResurrectEffect(input: ApplyResurrectInput): ApplyResurrectResult {
  const flow = input.deathFlow;
  const selfDead = !!flow
    && flow.deathState !== 'ALIVE'
    && flow.deathState !== 'JUST_ALIVED';
  if (!selfDead && !input.forceSelf) {
    return {
      health: null,
      mana: null,
      log: 'no dead target (party corpse resurrection not modelled in single-player)',
    };
  }
  const maxHp = Math.max(1, input.maxHealth | 0);
  const maxMp = Math.max(0, input.maxMana | 0);
  let healthAmt: number;
  let manaAmt: number;
  if (input.effect.kind === 'resurrect') {
    healthAmt = Math.max(1, Math.min(maxHp, input.effect.health | 0));
    manaAmt = Math.max(0, Math.min(maxMp, input.effect.mana | 0));
  } else {
    const pct = Math.max(0, input.effect.percent | 0);
    // Integer division like C++: max * damage / 100. Cite: :4822–4823.
    healthAmt = Math.max(1, Math.trunc((maxHp * pct) / 100));
    manaAmt = Math.max(0, Math.trunc((maxMp * pct) / 100));
  }
  const out: ApplyResurrectResult = {
    health: healthAmt,
    mana: manaAmt,
    log: `You return to life with ${healthAmt} health.`,
  };
  if (selfDead && flow) {
    out.clearDeathFlow = {
      deathState: 'ALIVE',
      deathExpireTimeSec: flow.deathExpireTimeSec,
    };
  }
  return out;
}
