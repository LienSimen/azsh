// Talent-active scripted residuals, formerly baked by the enricher. The generic modifier and dummy
// handlers emit intents, while combat needs concrete kinds. The values come from the same tables.

import type { SpellEffect } from '../../../data/schema.ts';
import {
  DEEP_WOUNDS_RANK1_SPELL_ID,
  DEEP_WOUNDS_RANK2_SPELL_ID,
  DEEP_WOUNDS_RANK3_SPELL_ID,
  EYE_FOR_AN_EYE_PCT,
  EYE_FOR_AN_EYE_RANK1_SPELL_ID,
  EYE_FOR_AN_EYE_RANK2_SPELL_ID,
  IGNITE_RANK1_SPELL_ID,
  IGNITE_RANK2_SPELL_ID,
  IGNITE_RANK3_SPELL_ID,
  IGNITE_RANK4_SPELL_ID,
  IGNITE_RANK5_SPELL_ID,
} from '../cmangos-special-cases.ts';
import {
  OBSIDIAN_ARMOR_SPELL_ID,
  ORACLE_HEALING_BONUS_PCT,
  ORACLE_HEALING_BONUS_SPELL_ID,
} from '../cmangos-special-cases-s19.ts';
import {
  ADAPTIVE_WARDING_SPELL_ID,
  CHEAT_DEATH_SPELL_ID,
  DREAMWALKER_HEALING_TOUCH_SPELL_ID,
  HOLY_POWER_SET_SPELL_ID,
  IDOL_HEALING_TOUCH_REFUND_SPELL_ID,
  MAGIC_ABSORPTION_PCT,
  MAGIC_ABSORPTION_RANK1_SPELL_ID,
  MAGIC_ABSORPTION_RANK2_SPELL_ID,
  MAGIC_ABSORPTION_RANK3_SPELL_ID,
  MAGIC_ABSORPTION_RANK4_SPELL_ID,
  MAGIC_ABSORPTION_RANK5_SPELL_ID,
  MASTER_OF_ELEMENTS_PCT,
  MASTER_OF_ELEMENTS_RANK1_SPELL_ID,
  MASTER_OF_ELEMENTS_RANK2_SPELL_ID,
  MASTER_OF_ELEMENTS_RANK3_SPELL_ID,
  TOTEMIC_POWER_SET_SPELL_ID,
  TOTEM_LESSER_HEALING_WAVE_SPELL_ID,
  VESTMENTS_GREATER_HEAL_SPELL_ID,
} from '../cmangos-special-cases-s20.ts';
import {
  IMPROVED_SPRINT_CHANCE_PCT,
  IMPROVED_SPRINT_RANK1_SPELL_ID,
  IMPROVED_SPRINT_RANK2_SPELL_ID,
  IMPROVED_SPRINT_TRIGGER_SPELL_ID,
} from '../cmangos-special-cases-s21.ts';
import {
  COMBUSTION_CRIT_PER_STACK,
  COMBUSTION_MAX_STACKS,
  COMBUSTION_SPELL_ID,
  COMBUSTION_STACK_SPELL_ID,
} from '../cmangos-special-cases-combustion.ts';
import {
  HEALING_WAY_CHANCE_PCT,
  HEALING_WAY_TALENT_RANK1_SPELL_ID,
  HEALING_WAY_TALENT_RANK2_SPELL_ID,
  HEALING_WAY_TALENT_RANK3_SPELL_ID,
} from './class-scripts-kit.ts';

/** Spell id → engine effects for talent/grant scripted actives. */
export const TALENT_SCRIPTED_EFFECTS: Readonly<Record<number, readonly SpellEffect[]>> = {
  // Quest visual with no DBC effect slots; sibling 5409 is a dummy. Cite: spell_template 5408.
  5407: [{ kind: 'client_inform' }],
  5408: [{ kind: 'client_inform' }],
  6671: [{ kind: 'client_inform' }],
  12472: [{ kind: 'reset_cooldowns', scope: 'frost' }],
  14185: [{ kind: 'reset_cooldowns', scope: 'rogue' }],
  12975: [{ kind: 'buff', mod: 'max_health_pct', amount: 30, durationMs: 20_000 }],
  14177: [{ kind: 'next_cast_mod', appliesTo: 'any', critAdd: 1.0, durationMs: 0 }],
  12043: [{ kind: 'next_cast_mod', appliesTo: 'any', instant: true, durationMs: 0 }],
  16188: [{ kind: 'next_cast_mod', appliesTo: 'nature', instant: true, durationMs: 0 }],
  17116: [{ kind: 'next_cast_mod', appliesTo: 'nature', instant: true, durationMs: 0 }],
  14751: [{ kind: 'next_cast_mod', appliesTo: 'any', freeCost: true, critAdd: 0.25, durationMs: 0 }],
  16166: [{ kind: 'next_cast_mod', appliesTo: 'any', freeCost: true, critAdd: 1.0, durationMs: 0 }],
  19263: [
    { kind: 'buff', mod: 'parry', amount: 25, durationMs: 10_000 },
    { kind: 'buff', mod: 'dodge', amount: 25, durationMs: 10_000 },
  ],
  20216: [{ kind: 'next_cast_mod', appliesTo: 'heal', critAdd: 1.0, durationMs: 0 }],
  20217: [{ kind: 'buff', mod: 'all_stats_pct', amount: 10, durationMs: 300_000, applyTo: 'self' }],
  12042: [{ kind: 'buff', mod: 'damage_done_pct', amount: 30, durationMs: 15_000, applyTo: 'self' }],
  20218: [{
    kind: 'buff',
    mod: 'damage_done_pct',
    amount: 10,
    school: 'holy',
    durationMs: 1_800_000,
    applyTo: 'party',
  }],
  19574: [{ kind: 'buff', mod: 'damage_done_pct', amount: 50, durationMs: 18_000, applyTo: 'pet' }],
  10060: [
    { kind: 'buff', mod: 'damage_done_pct', amount: 20, durationMs: 15_000, applyTo: 'friendly' },
    { kind: 'buff', mod: 'healing_done_pct', amount: 20, durationMs: 15_000, applyTo: 'friendly' },
  ],
  // The DBC casting-time row is a FLAT -5500 ms, not an instant. Cite: spell_template 18708 eff 0.
  18708: [{
    kind: 'next_cast_mod',
    appliesTo: 'summon',
    castTimeFlat: -5500,
    costModPct: -50, // SPELLMOD_COST — not SpellDef.costPct / ManaCostPercentage
    costPct: -50, // deprecated alias for buildCombatant copy path
    durationMs: 15_000,
  }],
  18288: [{ kind: 'next_cast_mod', appliesTo: 'curse', effectPct: 50, durationMs: 30_000 }],
  19028: [
    { kind: 'buff', mod: 'damage_done_pct', amount: 3, durationMs: 1_800_000, applyTo: 'self' },
    { kind: 'buff', mod: 'damage_done_pct', amount: 3, durationMs: 1_800_000, applyTo: 'pet' },
    { kind: 'split_damage', pct: 30, schoolMask: 127, durationMs: 1_800_000 },
  ],
  // Adrenaline Rush 13750: aura 110 bp 99 -> +100% energy regen for 15s.
  // Cite: Unit.cpp:4611–4622; spell_template 13750; DurationIndex 8 -> 15s.
  13750: [{ kind: 'buff', mod: 'energy_regen_pct', amount: 100, durationMs: 15_000, applyTo: 'self' }],
  // Sweeping Strikes and its NPC twin: a dummy aura with five proc charges over 20 seconds.
  // Cite: enrich-talent-actives.mjs; UnitAuraProcHandler.cpp:810-842.
  12292: [{ kind: 'sweeping_strikes', charges: 5, durationMs: 20_000 }],
  18765: [{ kind: 'sweeping_strikes', charges: 5, durationMs: 20_000 }],
  // Pyroclasm ranks — Hellfire/RoF tick → chance stun 18093. DurationIndex 21 → 0.
  // Cite: UnitAuraProcHandler.cpp:1347–1375; spell_template 18096/18073.
  18096: [{ kind: 'pyroclasm', rankSpellId: 18096, durationMs: 0 }],
  18073: [{ kind: 'pyroclasm', rankSpellId: 18073, durationMs: 0 }],
  // Vampiric Embrace: a dummy aura healing 20% of the shadow damage, over 60 seconds.
  // Cite: UnitAuraProcHandler.cpp:1015-1028.
  15286: [{ kind: 'vampiric_embrace', pct: 20, durationMs: 60_000 }],
  // Demonic Sacrifice kills the pet and casts a result aura chosen by its entry, each a percentage
  // buff or regen over 30 minutes. Cite: Warlock.cpp:214-234; spell_template 18789-18792.
  18788: [{
    kind: 'demonic_sacrifice',
    byPet: {
      416: {
        resultSpellId: 18789,
        mod: 'damage_done_pct',
        amount: 15,
        school: 'fire',
        durationMs: 1_800_000,
      },
      1860: {
        resultSpellId: 18790,
        restore: 'health',
        pctOfMax: 3,
        tickMs: 4000,
        durationMs: 1_800_000,
      },
      1863: {
        resultSpellId: 18791,
        mod: 'damage_done_pct',
        amount: 15,
        school: 'shadow',
        durationMs: 1_800_000,
      },
      417: {
        resultSpellId: 18792,
        restore: 'power',
        pctOfMax: 2,
        tickMs: 4000,
        durationMs: 1_800_000,
      },
    },
  }],
  // Eye for an Eye: a dummy holder whose combat payload is a magic-damage reflect, until cancelled.
  // Cite: UnitAuraProcHandler.cpp:795-808; spell_template 9799 and 25988.
  [EYE_FOR_AN_EYE_RANK1_SPELL_ID]: [{
    kind: 'eye_for_an_eye',
    pct: EYE_FOR_AN_EYE_PCT[EYE_FOR_AN_EYE_RANK1_SPELL_ID]!,
    durationMs: 0,
  }],
  [EYE_FOR_AN_EYE_RANK2_SPELL_ID]: [{
    kind: 'eye_for_an_eye',
    pct: EYE_FOR_AN_EYE_PCT[EYE_FOR_AN_EYE_RANK2_SPELL_ID]!,
    durationMs: 0,
  }],
  // Oracle Healing Bonus — dummy; heal done → self-heal 10% as 26170. DurationIndex 21 → 0.
  // Cite: UnitAuraProcHandler.cpp:1046–1052.
  [ORACLE_HEALING_BONUS_SPELL_ID]: [{
    kind: 'oracle_healing_bonus',
    pct: ORACLE_HEALING_BONUS_PCT,
    durationMs: 0,
  }],
  // Obsidian Armor — dummy; school damage taken → resist buff. DurationIndex 21 → 0.
  // Cite: UnitAuraProcHandler.cpp:910–930.
  [OBSIDIAN_ARMOR_SPELL_ID]: [{ kind: 'obsidian_armor', durationMs: 0 }],
  // Adaptive Warding — dummy; Mage Armor gate + school resist buff. DurationIndex 21 → 0.
  // Cite: UnitAuraProcHandler.cpp:870–907.
  [ADAPTIVE_WARDING_SPELL_ID]: [{ kind: 'adaptive_warding', durationMs: 0 }],
  // Holy Power / Totemic Power set dummies — heal → class buff. DurationIndex 21 → 0.
  // Cite: UnitAuraProcHandler.cpp:1153–1181 / 1191–1219.
  [HOLY_POWER_SET_SPELL_ID]: [{ kind: 'class_power_set', setKind: 'holy_power', durationMs: 0 }],
  [TOTEMIC_POWER_SET_SPELL_ID]: [{ kind: 'class_power_set', setKind: 'totemic_power', durationMs: 0 }],
  // Vestments of Faith 4pc / Dreamwalker / Idol / Totem of Flowing Water.
  // Cite: UnitAuraProcHandler.cpp:1055–1058 / 1068–1081 / 1222–1226.
  [VESTMENTS_GREATER_HEAL_SPELL_ID]: [{ kind: 'vestments_greater_heal', durationMs: 0 }],
  [DREAMWALKER_HEALING_TOUCH_SPELL_ID]: [{ kind: 'dreamwalker_healing_touch', durationMs: 0 }],
  [IDOL_HEALING_TOUCH_REFUND_SPELL_ID]: [{ kind: 'idol_healing_touch_refund', durationMs: 0 }],
  [TOTEM_LESSER_HEALING_WAVE_SPELL_ID]: [{ kind: 'totem_lesser_healing_wave', durationMs: 0 }],
  // Cheat Death set — 20% HP gate on proc of 28846. DurationIndex 21 → 0.
  // Cite: UnitAuraProcHandler.cpp:1378–1383.
  [CHEAT_DEATH_SPELL_ID]: [{ kind: 'cheat_death', durationMs: 0 }],
  // Master of Elements ranks — spell crit mana refund %. DurationIndex 21 → 0.
  // Cite: UnitAuraProcHandler.cpp:949–964; tables/spells.json bp+die.
  [MASTER_OF_ELEMENTS_RANK1_SPELL_ID]: [{
    kind: 'master_of_elements',
    pct: MASTER_OF_ELEMENTS_PCT[MASTER_OF_ELEMENTS_RANK1_SPELL_ID]!,
    durationMs: 0,
  }],
  [MASTER_OF_ELEMENTS_RANK2_SPELL_ID]: [{
    kind: 'master_of_elements',
    pct: MASTER_OF_ELEMENTS_PCT[MASTER_OF_ELEMENTS_RANK2_SPELL_ID]!,
    durationMs: 0,
  }],
  [MASTER_OF_ELEMENTS_RANK3_SPELL_ID]: [{
    kind: 'master_of_elements',
    pct: MASTER_OF_ELEMENTS_PCT[MASTER_OF_ELEMENTS_RANK3_SPELL_ID]!,
    durationMs: 0,
  }],
  // Magic Absorption ranks — full resist → % max mana. DurationIndex 21 → 0.
  // Cite: UnitAuraProcHandler.cpp:938–947; tables/spells.json first-effect bp+die.
  [MAGIC_ABSORPTION_RANK1_SPELL_ID]: [{
    kind: 'magic_absorption',
    pct: MAGIC_ABSORPTION_PCT[MAGIC_ABSORPTION_RANK1_SPELL_ID]!,
    durationMs: 0,
  }],
  [MAGIC_ABSORPTION_RANK2_SPELL_ID]: [{
    kind: 'magic_absorption',
    pct: MAGIC_ABSORPTION_PCT[MAGIC_ABSORPTION_RANK2_SPELL_ID]!,
    durationMs: 0,
  }],
  [MAGIC_ABSORPTION_RANK3_SPELL_ID]: [{
    kind: 'magic_absorption',
    pct: MAGIC_ABSORPTION_PCT[MAGIC_ABSORPTION_RANK3_SPELL_ID]!,
    durationMs: 0,
  }],
  [MAGIC_ABSORPTION_RANK4_SPELL_ID]: [{
    kind: 'magic_absorption',
    pct: MAGIC_ABSORPTION_PCT[MAGIC_ABSORPTION_RANK4_SPELL_ID]!,
    durationMs: 0,
  }],
  [MAGIC_ABSORPTION_RANK5_SPELL_ID]: [{
    kind: 'magic_absorption',
    pct: MAGIC_ABSORPTION_PCT[MAGIC_ABSORPTION_RANK5_SPELL_ID]!,
    durationMs: 0,
  }],
  // Ignite ranks — dummy aura; fire damage → DoT 12654 at rank%. DurationIndex 21 → 0.
  // Cite: UnitAuraProcHandler.cpp:970–985.
  [IGNITE_RANK1_SPELL_ID]: [{ kind: 'ignite', rankSpellId: IGNITE_RANK1_SPELL_ID, durationMs: 0 }],
  [IGNITE_RANK2_SPELL_ID]: [{ kind: 'ignite', rankSpellId: IGNITE_RANK2_SPELL_ID, durationMs: 0 }],
  [IGNITE_RANK3_SPELL_ID]: [{ kind: 'ignite', rankSpellId: IGNITE_RANK3_SPELL_ID, durationMs: 0 }],
  [IGNITE_RANK4_SPELL_ID]: [{ kind: 'ignite', rankSpellId: IGNITE_RANK4_SPELL_ID, durationMs: 0 }],
  [IGNITE_RANK5_SPELL_ID]: [{ kind: 'ignite', rankSpellId: IGNITE_RANK5_SPELL_ID, durationMs: 0 }],
  // Deep Wounds ranks — aura 42 rewrite to custom DoT 12721 at weaponDamage×rank%/6.
  // DurationIndex 21 → 0 (until cancelled). Cite: UnitAuraProcHandler.cpp:1316–1342.
  [DEEP_WOUNDS_RANK1_SPELL_ID]: [{
    kind: 'deep_wounds',
    rankSpellId: DEEP_WOUNDS_RANK1_SPELL_ID,
    durationMs: 0,
  }],
  [DEEP_WOUNDS_RANK2_SPELL_ID]: [{
    kind: 'deep_wounds',
    rankSpellId: DEEP_WOUNDS_RANK2_SPELL_ID,
    durationMs: 0,
  }],
  [DEEP_WOUNDS_RANK3_SPELL_ID]: [{
    kind: 'deep_wounds',
    rankSpellId: DEEP_WOUNDS_RANK3_SPELL_ID,
    durationMs: 0,
  }],
  // Improved Sprint: a target-trigger aura that casts the root and snare purge on a Sprint hit, until
  // cancelled. Cite: Spell.cpp:7433-7468; SpellEffects.cpp:4140-4147.
  [IMPROVED_SPRINT_RANK1_SPELL_ID]: [{
    kind: 'improved_sprint',
    chancePct: IMPROVED_SPRINT_CHANCE_PCT[IMPROVED_SPRINT_RANK1_SPELL_ID]!,
    triggerSpellId: IMPROVED_SPRINT_TRIGGER_SPELL_ID,
    durationMs: 0,
  }],
  [IMPROVED_SPRINT_RANK2_SPELL_ID]: [{
    kind: 'improved_sprint',
    chancePct: IMPROVED_SPRINT_CHANCE_PCT[IMPROVED_SPRINT_RANK2_SPELL_ID]!,
    triggerSpellId: IMPROVED_SPRINT_TRIGGER_SPELL_ID,
    durationMs: 0,
  }],
  // Healing Way: a target-trigger aura whose Healing Wave mask lives in spell_affect rather than on
  // the row, until cancelled. Cite: Spell.cpp:7433-7468; Shaman.cpp:77-89.
  [HEALING_WAY_TALENT_RANK1_SPELL_ID]: [{
    kind: 'healing_way_talent',
    chancePct: HEALING_WAY_CHANCE_PCT[HEALING_WAY_TALENT_RANK1_SPELL_ID]!,
    durationMs: 0,
  }],
  [HEALING_WAY_TALENT_RANK2_SPELL_ID]: [{
    kind: 'healing_way_talent',
    chancePct: HEALING_WAY_CHANCE_PCT[HEALING_WAY_TALENT_RANK2_SPELL_ID]!,
    durationMs: 0,
  }],
  [HEALING_WAY_TALENT_RANK3_SPELL_ID]: [{
    kind: 'healing_way_talent',
    chancePct: HEALING_WAY_CHANCE_PCT[HEALING_WAY_TALENT_RANK3_SPELL_ID]!,
    durationMs: 0,
  }],
};

export function talentScriptedEffects(spellId: number): SpellEffect[] | undefined {
  const row = TALENT_SCRIPTED_EFFECTS[spellId];
  return row ? row.map((e) => ({ ...e })) : undefined;
}

// Scripted payloads that ride ALONGSIDE a non-empty effect list, because the DBC slots are real and
// the C++ case is extra. Cite: spellModIntents mergeExtra; UnitAuraProcHandler.cpp:991-1003.
const TALENT_SCRIPTED_APPEND: Readonly<Record<number, readonly SpellEffect[]>> = {
  // 11129 slot 0 is the DUMMY holder and slot 1 casts 28682 once; the stacking and the 3-crit
  // charge counter live only in HandleDummyAuraProc. 28682 StackAmount 10, aura 107 op 7 +10.
  [COMBUSTION_SPELL_ID]: [{
    kind: 'combustion',
    charges: 3,
    stackSpellId: COMBUSTION_STACK_SPELL_ID,
    critPerStack: COMBUSTION_CRIT_PER_STACK,
    maxStacks: COMBUSTION_MAX_STACKS,
    durationMs: 0,
  }],
};

export function talentScriptedAppendEffects(spellId: number): SpellEffect[] | undefined {
  const row = TALENT_SCRIPTED_APPEND[spellId];
  return row ? row.map((e) => ({ ...e })) : undefined;
}

// 107/108 intents fold in spellModIntents.ts (outside the interpreter tree) so the census D reader is a
// real consumer. Cite: SpellAuras.cpp HandleAddModifier.
export { materializeSpellModIntents } from '../spellModIntents.ts';
export { materializeOverrideClassScriptIntents } from '../overrideClassScripts.ts';

