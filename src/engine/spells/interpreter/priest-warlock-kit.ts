// Priest and warlock kit materialization at the play surface: the intents that never became combat
// effects — Life Tap's dummy and Lightwell's gameobject — folded in without inventing numbers.

import type { SpellDef, SpellEffect } from '../../../data/schema.ts';
import type { InterpretResult } from './types.ts';
import { durMs as durFromIndex } from './duration.ts';
import {
  HOLY_NOVA_HEAL_AMOUNTS,
  holyNovaTriggeredHealSpellId,
} from '../cmangos-special-cases.ts';

// The Life Tap mana spell, which is not in the bake: the C++ casts it with a custom base point.
// Cite: Warlock.cpp:102 CastCustomSpell(nullptr, 31818, &mana).
export const LIFE_TAP_MANA_SPELL_ID = 31818;

// Rank to the base health and mana, with no Improved Life Tap and no spell-damage bonus.
// Cite: game-data rawEffects base points plus one; Warlock.cpp OnInit.
export const LIFE_TAP_BASE_AMOUNT: Readonly<Record<number, number>> = {
  1454: 20,
  1455: 65,
  1456: 130,
  11687: 210,
  11688: 300,
  11689: 420,
};

// The Lightwell cast ranks, each a gameobject summon. Rank 1 is talent-only while the other two are
// kit-taught through learn stubs. Cite: spell_template 724, 27870, 27871.
export const LIGHTWELL_SPELL_IDS = new Set([724, 27870, 27871]);

// The Lightwell Renew total heal per charge: the per-tick amount times five ticks over ten seconds.
// Cite: z2691 spell_template 7001, 27873, 27874.
export const LIGHTWELL_HEAL_PER_CHARGE: Readonly<Record<number, number>> = {
  724: 800, // Renew 7001
  27870: 1165, // Renew 27873
  27871: 1600, // Renew 27874
};

// GO entry → Lightwell cast rank (for intent path). Cite: spell_template EffectMiscValue on
// 724/27870/27871.
export const LIGHTWELL_GO_TO_SPELL: Readonly<Record<number, number>> = {
  181102: 724,
  181105: 27870,
  181106: 27871,
};

/** ProcCharges / description "5 charges". Cite: spell_template tooltip; enrich 724. */
export const LIGHTWELL_CHARGES = 5;
// Reactive click model interval (auto-battler simplification of party click). Cite: combat.ts lightwell
// pulse; enrich-talent-actives.mjs SCRIPTED 724.
export const LIGHTWELL_INTERVAL_MS = 2000;
/** DurationIndex for Lightwell cast → 180_000 ms (3 min). Cite: duration intent. */
export const LIGHTWELL_DURATION_MS = 180_000;

// Materialize Priest/Warlock play-surface effects from interpret intents. Mutates nothing on `spell`;
// returns a new effects array.
export function materializePriestWarlockKitEffects(
  spell: SpellDef,
  result: InterpretResult,
  effectsIn: SpellEffect[],
): SpellEffect[] {
  let effects = effectsIn.slice();
  const id = spell.id | 0;
  const intents = result.intents ?? [];

  // Life Tap: the health is paid as a power cost and the mana comes from a custom cast, so the play
  // surface is a single effect and combat deducts and grants atomically. Cite: Warlock.cpp:52-103.
  const ltIntent = intents.find((i) => i.kind === 'life_tap');
  if (ltIntent && ltIntent.kind === 'life_tap' && !effects.some((e) => e.kind === 'life_tap')) {
    // Fizzle on cast is OnCheckCast (script value > health) — still emit the effect
    // so resolve/census see a live payload; combat re-checks HP before applying.
    effects.push({
      kind: 'life_tap',
      healthCost: ltIntent.healthCost,
      manaGain: ltIntent.manaGain,
    });
  }

  // Lightwell summons a gameobject the party clicks to cast Renew, modelled here as a reactive well
  // with charges. Cite: SpellEffects.cpp:5271-5420; GameObject.cpp:1832-1859.
  if (LIGHTWELL_SPELL_IDS.has(id) && !effects.some((e) => e.kind === 'lightwell')) {
    const healPerCharge = LIGHTWELL_HEAL_PER_CHARGE[id];
    if (healPerCharge != null) {
      const goIntent = intents.find((i) => i.kind === 'transmitted_object');
      const durationMs =
        goIntent && goIntent.kind === 'transmitted_object'
          ? goIntent.durationMs
          : (durFromIndex(spell.durationIndex) ?? LIGHTWELL_DURATION_MS);
      effects.push({
        kind: 'lightwell',
        charges: LIGHTWELL_CHARGES,
        healPerCharge,
        intervalMs: LIGHTWELL_INTERVAL_MS,
        durationMs: durationMs > 0 ? durationMs : LIGHTWELL_DURATION_MS,
      });
    }
  }

  // Periodic leech: the interpretation keeps the bake-shaped plain dot while the intent carries the
  // multiplier, so stamp it on the dot and combat heals the caster for the damage times it.
  const leechIntent = intents.find((i) => i.kind === 'periodic_leech_heal');
  if (leechIntent && leechIntent.kind === 'periodic_leech_heal') {
    const mult = leechIntent.multipleValue > 0 ? leechIntent.multipleValue : 1;
    effects = effects.map((e) => {
      if (e.kind !== 'dot') return e;
      if (e.leechMultiple != null && e.leechMultiple > 0) return e;
      return { ...e, leechMultiple: mult };
    });
  }

  // Periodic mana leech: a positive multiplier gives the caster the drained mana, while a zero one is
  // a pure drain. Cite: SpellAuras.cpp:4747-4806 HandlePeriodicManaLeech.
  const manaLeechIntent = intents.find((i) => i.kind === 'periodic_mana_leech');
  if (manaLeechIntent && manaLeechIntent.kind === 'periodic_mana_leech') {
    const mult = manaLeechIntent.multipleValue;
    if (mult > 0) {
      effects = effects.map((e) => {
        if (e.kind !== 'restore_power' || e.amountPerTick >= 0) return e;
        if (e.leechMultiple != null && e.leechMultiple > 0) return e;
        return { ...e, leechMultiple: mult };
      });
    }
  }

  // Holy Nova's damage row is school damage only and its heal fires as a triggered spell, so fold the
  // heal onto the cast for the session to apply. Cite: Spell.cpp:3130-3136 AddTriggeredSpell.
  const healAmt = HOLY_NOVA_HEAL_AMOUNTS[id];
  if (healAmt && holyNovaTriggeredHealSpellId(id) && !effects.some((e) => e.kind === 'heal')) {
    // `applyTo: 'party'` off the triggered row's own bake (27805 heal applyTo party) - the damage
    // rank's rawEffects name no friendly, so resolveHealApplyTo would leave the fan off.
    effects.push({ kind: 'heal', min: healAmt.min, max: healAmt.max, applyTo: 'party' });
  }

  return effects;
}
