// Hunter kit materialization at the play surface for Feign Death, Aspect of the Beast and the traps.
// A trap arms a gameobject that casts on proximity to the PLACED point, not to the hunter.

import type { SpellDef, SpellEffect } from '../../../data/schema.ts';
import type { InterpretResult } from './types.ts';
import { durMs as durFromIndex } from './duration.ts';

// Trap gameobject entry to the spell cast when it springs.
// Cite: gameobject-data.json trap.spellId; enrich-gameobjects.mjs.
export const HUNTER_TRAP_GO_TRIGGER: ReadonlyMap<number, number> = new Map([
  // Freezing ranks. Cite: gameobject-data 2561/164876/164877.
  [2561, 3355],
  [164876, 14308],
  [164877, 14309],
  // Immolation ranks. Cite: gameobject-data 164638/164872–164875.
  [164638, 13797],
  [164872, 14298],
  [164873, 14299],
  [164874, 14300],
  [164875, 14301],
  // Frost. Cite: gameobject-data 164639 → 13810 Frost Trap Aura.
  [164639, 13810],
  // Explosive ranks. Cite: gameobject-data 164839/164879/164880.
  [164839, 13812],
  [164879, 14314],
  [164880, 14315],
]);

// A SECOND source of truth for values the bake now carries: these ranks were compared against the
// baked rows and match exactly, so the duplication is recorded rather than hidden, and will drift.
export const FREEZING_TRAP_EFFECT_DURATION_MS: Readonly<Record<number, number>> = {
  3355: 10_000, // DurationIndex 1
  14308: 15_000, // DurationIndex 8
  14309: 20_000, // DurationIndex 18
};

// Frost Trap Aura, also absent from the bake: a 60% snare over 30 s, simplified from a ground
// persistent area to a single-target speed on whoever springs it. Cite: z2691 spell_template 13810.
export const FROST_TRAP_AURA_SPELL_ID = 13810;
export const FROST_TRAP_SLOW_PCT = -60; // bp -61 + 1 die
export const FROST_TRAP_DURATION_MS = 30_000; // DurationIndex 9

// Aspect of the Beast — SPELL_AURA_UNTRACKABLE only (no combat stat). Cite: spell_template 13161 aura 120;
// SpellAuras.cpp:4374–4379.
export const ASPECT_OF_THE_BEAST_SPELL_ID = 13161;

/** SPELL_EFFECT_SUMMON_OBJECT_SLOT1. Cite: SpellEffects.cpp:4737. */
const SPELL_EFFECT_SUMMON_OBJECT_SLOT1 = 104;

// Trap arm duration = cast spell DurationIndex (all classic trap arms use index 3 → 60s). Cite:
// spell_template DurationIndex=3; FALLBACK_DURATION_MS[3]=60000.
export const HUNTER_TRAP_ARM_DURATION_MS = 60_000;

/** GO trap charges = 1 (single spring). Cite: gameobject-data trap.charges. */
export const HUNTER_TRAP_CHARGES = 1;

// Hunter trap GO trigger radius (yards). All classic Freezing/Immolation/Frost/Explosive GOs bake
// trap.radius = 5 (diameter data2 → radius). Cite: gameobject-data.json trap.radius.
export const HUNTER_TRAP_RADIUS_YD = 5;

/** GO trap.spellId values (trigger payloads). */
const HUNTER_TRAP_TRIGGER_IDS: ReadonlySet<number> = new Set(HUNTER_TRAP_GO_TRIGGER.values());

/** True when `id` is a hunter trap GO trigger spell (Freezing Effect, Immolation DoT, …). */
export function isHunterTrapTriggerSpellId(id: number): boolean {
  return HUNTER_TRAP_TRIGGER_IDS.has(id | 0);
}

// Live/baked proc row for an armed hunter trap GO — a ground object, not a unit aura. Cite:
// SpellEffects.cpp EffectSummonObject SLOT1; GameObject.cpp trap Use.
export function isHunterTrapArmProc(e: { kind?: string; triggerSpellId?: number }): boolean {
  return e.kind === 'proc_trigger_spell' && isHunterTrapTriggerSpellId(e.triggerSpellId ?? 0);
}

// Build a synthetic SpellDef for the trap payloads missing from the live bake. The numbers are
// SQL-sourced, from the constants above.
export function syntheticHunterTrapPayload(triggerSpellId: number): SpellDef | null {
  const freezeDur = FREEZING_TRAP_EFFECT_DURATION_MS[triggerSpellId];
  if (freezeDur != null) {
    // Freezing Trap Effect: MOD_STUN + damage break. Cite: spell_template 3355 family.
    return {
      id: triggerSpellId,
      name: 'Freezing Trap Effect',
      rank: 0,
      school: 'frost',
      powerType: 'mana',
      cost: 0,
      castTimeMs: 0,
      cooldownMs: 0,
      gcdMs: 0,
      rangeMax: 0,
      reqLevel: 0,
      effects: [
        {
          kind: 'cc',
          control: 'stun',
          mechanic: 'stun',
          durationMs: freezeDur,
          school: 'frost',
          breakOnDamage: true, // AuraInterruptFlags = 2
        },
      ],
    };
  }
  if (triggerSpellId === FROST_TRAP_AURA_SPELL_ID) {
    // Frost Trap Aura: MOD_DECREASE_SPEED −60% for 30s (single-target simplification).
    // Cite: spell_template 13810 EffectApplyAuraName1=33 bp=-61; aura 33 = speed.
    return {
      id: FROST_TRAP_AURA_SPELL_ID,
      name: 'Frost Trap Aura',
      rank: 0,
      school: 'frost',
      powerType: 'mana',
      cost: 0,
      castTimeMs: 0,
      cooldownMs: 0,
      gcdMs: 0,
      rangeMax: 0,
      reqLevel: 0,
      effects: [
        {
          kind: 'speed',
          aura: 33, // SPELL_AURA_MOD_DECREASE_SPEED
          pct: FROST_TRAP_SLOW_PCT,
          durationMs: FROST_TRAP_DURATION_MS,
          hostile: true,
        },
      ],
    };
  }
  return null;
}

/** True when this spell is a hunter trap arm (effect 104 → known trap GO entry). */
export function isHunterTrapCast(spell: SpellDef): boolean {
  for (const r of spell.rawEffects ?? []) {
    if ((r.effect | 0) === SPELL_EFFECT_SUMMON_OBJECT_SLOT1) {
      const go = r.miscValue | 0;
      if (HUNTER_TRAP_GO_TRIGGER.has(go)) return true;
    }
  }
  return false;
}

/** Resolve GO trigger spell id from a trap cast's raw effect 104 miscValue. */
export function hunterTrapTriggerSpellId(spell: SpellDef): number | null {
  for (const r of spell.rawEffects ?? []) {
    if ((r.effect | 0) === SPELL_EFFECT_SUMMON_OBJECT_SLOT1) {
      const go = r.miscValue | 0;
      const tid = HUNTER_TRAP_GO_TRIGGER.get(go);
      if (tid != null) return tid;
    }
  }
  return null;
}

// Materialize Hunter play-surface effects from interpret intents + trap GO map. Mutates nothing on `spell`;
// returns a new effects array.
export function materializeHunterKitEffects(
  spell: SpellDef,
  result: InterpretResult,
  effectsIn: SpellEffect[],
): SpellEffect[] {
  let effects = effectsIn.slice();
  const id = spell.id | 0;
  const intents = result.intents ?? [];

  // Hunter traps arm a one-charge gameobject that casts its payload on proximity to the placed point.
  // Cite: SpellEffects.cpp:4732-4795; GameObject.cpp:436-503.
  if (isHunterTrapCast(spell) && !effects.some((e) => e.kind === 'proc_trigger_spell')) {
    const triggerSpellId = hunterTrapTriggerSpellId(spell);
    if (triggerSpellId != null) {
      const armMs = durFromIndex(spell.durationIndex) ?? HUNTER_TRAP_ARM_DURATION_MS;
      effects.push({
        kind: 'proc_trigger_spell',
        triggerSpellId,
        durationMs: armMs > 0 ? armMs : HUNTER_TRAP_ARM_DURATION_MS,
        charges: HUNTER_TRAP_CHARGES,
      });
    }
  }

  // Aspect of the Beast is an untrackable self aspect with no combat stat, permanent until cancelled
  // and in the same exclusion group as the other aspects. Cite: SpellAuras.cpp:4374-4379.
  if (id === ASPECT_OF_THE_BEAST_SPELL_ID && !effects.some((e) => e.kind === 'buff')) {
    const untrack = intents.find((i) => i.kind === 'untrackable');
    const durationMs =
      untrack && untrack.kind === 'untrackable'
        ? untrack.durationMs
        : (durFromIndex(spell.durationIndex) ?? 0);
    // amount 0: applyBuffMod no-ops; aura still arms for exclusion-group aspect swap.
    effects.push({
      kind: 'buff',
      mod: 'armor',
      amount: 0,
      durationMs,
      hostile: false,
    });
  }

  return effects;
}
