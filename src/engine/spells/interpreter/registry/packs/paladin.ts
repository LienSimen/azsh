// The paladin dummy and script surface: Holy Shock and the two holy heals rank-generically by icon,
// with per-id entries only where the C++ scripts a specific id. Seals live in paladin-seals.ts.

import type { RegistryHandler, RegistryPack } from '../types.ts';
import { effectBaseAmount, truncTowardZero } from '../helpers.ts';
import { clampPositiveRange, effectAmountRange } from '../../amount.ts';

/** SPELLFAMILY_PALADIN. Cite: DBCEnums.h SPELLFAMILY_PALADIN = 10. */
export const SPELLFAMILY_PALADIN = 10;

/** Judgement (player ability). Cite: spell_template Id 20271; Paladin.cpp RegisterSpellScript. */
export const JUDGEMENT_SPELL_ID = 20271;

/** Holy Light CastCustomSpell payload. Cite: SpellEffects.cpp:4161 (19968). */
export const HOLY_LIGHT_HEAL_SPELL_ID = 19968;

/** Flash of Light CastCustomSpell payload. Cite: SpellEffects.cpp:4170 (19993). */
export const FLASH_OF_LIGHT_HEAL_SPELL_ID = 19993;

/** Judgement of Light Intermediate. Cite: Paladin.cpp:37–55; RegisterSpellScript. */
export const JUDGEMENT_OF_LIGHT_INTERMEDIATE_ID = 5373;

/** Judgement of Wisdom Intermediate. Cite: Paladin.cpp:58–75; RegisterSpellScript. */
export const JUDGEMENT_OF_WISDOM_INTERMEDIATE_ID = 1826;

/** Holy Shock SpellIconID. Cite: SpellEffects.cpp:1431 case 156. */
export const HOLY_SHOCK_ICON_ID = 156;

/** Holy Light SpellIconID. Cite: SpellEffects.cpp:4155. */
export const HOLY_LIGHT_ICON_ID = 70;

/** Flash of Light SpellIconID. Cite: SpellEffects.cpp:4164. */
export const FLASH_OF_LIGHT_ICON_ID = 242;

/** Judgement of Command SpellIconID. Cite: SpellEffects.cpp:1456 case 561. */
export const JUDGEMENT_OF_COMMAND_ICON_ID = 561;

// The Holy Shock branch tables, per id as the C++ switches them, with the sub-spell ranges read off
// the raw base points and dice. Cite: SpellEffects.cpp:1439-1443.

interface HolyShockBranch {
  hurt: number;
  heal: number;
  /** Shared min/max on hurt + heal sub-spells (Classic ranks match). */
  min: number;
  max: number;
}

// CMaNGOS per-id hurt/heal + bake-sourced ranges for classic ranks. Handler entry is rank-generic (icon
// 156); branch lookup stays id-keyed because C++ switches on Id. Cite: SpellEffects.cpp:1439–1443.
const HOLY_SHOCK_BRANCH: Readonly<Record<number, HolyShockBranch>> = {
  20473: { hurt: 25912, heal: 25914, min: 204, max: 220 },
  20929: { hurt: 25911, heal: 25913, min: 279, max: 301 },
  20930: { hurt: 25902, heal: 25903, min: 365, max: 395 },
};

// JoL intermediate: triggered-by Judgement of Light aura → periodic heal spell. CMaNGOS scripts per aura
// id. Cite: Paladin.cpp:47–51.
const JOL_INTERMEDIATE_TRIGGERS: Readonly<Record<number, number>> = {
  20185: 20267, // Rank 1
  20344: 20341, // Rank 2
  20345: 20342, // Rank 3
  20346: 20343, // Rank 4
};

// JoW intermediate: triggered-by Judgement of Wisdom aura → mana restore spell. CMaNGOS scripts per aura
// id. Cite: Paladin.cpp:69–71.
const JOW_INTERMEDIATE_TRIGGERS: Readonly<Record<number, number>> = {
  20186: 20268, // Rank 1
  20354: 20352, // Rank 2
  20355: 20353, // Rank 3
};

// ── Handlers ─────────────────────────────────────────────────────────────────

// The judgement script finds the seal's dummy pointer, removes the seal and casts what it names. The
// bake already carries a judgement kind, so that is always emitted. Cite: Paladin.cpp:78-116.
const handleJudgement: RegistryHandler = (state, _raw, _slot) => {
  // Bake surface — LOCK 9a. Cite: game-data Judgement effects; schema kind judgement.
  state.effects.push({ kind: 'judgement' });

  const seal = state.ctx.activeSeal;
  if (seal && seal.judgementSpellId > 1) {
    // Cite: Paladin.cpp:104–115 spellId2 from seal; RemoveAurasDueToSpell; CastSpell.
    state.intents.push({
      kind: 'judgement_cast',
      sealSpellId: seal.spellId,
      judgementSpellId: seal.judgementSpellId,
    });
    // Seal consume as generic consume_aura (SPELL_AURA_DUMMY = 4).
    // Cite: Paladin.cpp:110 RemoveAurasDueToSpell((*itr)->GetId()).
    state.intents.push({
      kind: 'consume_aura',
      spellId: seal.spellId,
      spellFamilyName: SPELLFAMILY_PALADIN,
      spellFamilyFlags: 0,
      auraType: 4, // SPELL_AURA_DUMMY
      casterOnly: true,
    });
  }

  return true;
};

// Judgement of Command casts the spell id in the effect base points.
// Cite: SpellEffects.cpp:1456-1465.
const handleJudgementOfCommand: RegistryHandler = (state, raw, _slot) => {
  const spellId = effectBaseAmount(raw, state.ctx);
  if (spellId > 0) {
    state.intents.push({ kind: 'cast_triggered_spell', spellId });
  }
  return true;
};

// Holy Shock casts the heal on a friendly target and the hurt on anyone else. A thin bake emits both
// halves from the branch table; with a target known, the branch cast is emitted too.
const handleHolyShock: RegistryHandler = (state, _raw, _slot) => {
  const id = state.spell.id | 0;
  const rank = HOLY_SHOCK_BRANCH[id];
  if (!rank) {
    // Unknown rank under icon 156: handled no-op (C++ logs error and returns).
    // Cite: SpellEffects.cpp:1444–1446 default.
    return true;
  }

  // Bake dual surface — combat branches on target reaction. Cite: schema holy_shock;
  //   enrich-talent-actives.mjs 20473; game-data sub-spells 25912/25914.
  state.effects.push({
    kind: 'holy_shock',
    damage: { school: 'holy', min: rank.min, max: rank.max },
    heal: { min: rank.min, max: rank.max },
  });

  // Cast-time branch when unit reaction is known.
  // Cite: SpellEffects.cpp:1449–1452 CanAssistSpell → heal else hurt.
  if (state.ctx.targetCanAssist != null) {
    const spellId = state.ctx.targetCanAssist ? rank.heal : rank.hurt;
    state.intents.push({ kind: 'cast_spell', spellId });
  }

  return true;
};

// Holy Light and Flash of Light's script effect casts a custom heal for the effect value, emitted as a
// plain heal to match the bake mapper. Cite: SpellEffects.cpp:4154-4171.
function makeHolyHealScript(customSpellId: number): RegistryHandler {
  return (state, raw, _slot) => {
    const { min, max } = effectAmountRange(raw, state.ctx);
    // Mapper: Math.max(1, min/max). Cite: map-spell-effects.mjs:410.
    if (min > 1) {
      const range = clampPositiveRange(min, max);
      state.effects.push({ kind: 'heal', min: range.min, max: range.max });
    }

    // C++ uses rolled damage; bake-thin uses range min as bp0 (deterministic snapshot).
    // Cite: SpellEffects.cpp:4159–4161 heal = damage; CastCustomSpell(…, &heal, &spellid).
    const healBp = truncTowardZero(effectBaseAmount(raw, state.ctx));
    if (healBp > 0) {
      state.intents.push({
        kind: 'cast_custom_spell',
        spellId: customSpellId,
        bp0: healBp,
        bp1: state.spell.id | 0, // main spell id as unused effect basepoints
      });
    }

    return true;
  };
}

const handleHolyLight = makeHolyHealScript(HOLY_LIGHT_HEAL_SPELL_ID);
const handleFlashOfLight = makeHolyHealScript(FLASH_OF_LIGHT_HEAL_SPELL_ID);

// The Judgement of Light intermediate reads the triggering aura's rank and heals from it.
// Cite: Paladin.cpp:37-55.
const handleJudgementOfLightIntermediate: RegistryHandler = (state, _raw, _slot) => {
  const byAura = state.ctx.triggeredByAuraSpellId;
  if (byAura == null) {
    state.effects.push({ kind: 'script_handled_noop', spellId: JUDGEMENT_OF_LIGHT_INTERMEDIATE_ID } as never);
    return true;
  }
  const triggerSpell = JOL_INTERMEDIATE_TRIGGERS[byAura];
  if (triggerSpell) {
    state.intents.push({ kind: 'cast_spell', spellId: triggerSpell });
  }
  return true;
};

// The Judgement of Wisdom intermediate reads the triggering aura's rank and restores mana from it.
// Cite: Paladin.cpp:58-75.
const handleJudgementOfWisdomIntermediate: RegistryHandler = (state, _raw, _slot) => {
  const byAura = state.ctx.triggeredByAuraSpellId;
  if (byAura == null) {
    state.effects.push({ kind: 'script_handled_noop', spellId: JUDGEMENT_OF_WISDOM_INTERMEDIATE_ID } as never);
    return true;
  }
  const triggerSpell = JOW_INTERMEDIATE_TRIGGERS[byAura];
  if (triggerSpell) {
    state.intents.push({ kind: 'cast_spell', spellId: triggerSpell });
  }
  return true;
};

// ── Pack maps ────────────────────────────────────────────────────────────────

export const paladinPack: RegistryPack = {
  id: 'paladin',
  // Per-id: CMaNGOS RegisterSpellScript / intermediate dummies are single ids.
  // Cite: Paladin.cpp LoadPaladinScripts; JoL 5373 / JoW 1826.
  dummy: {
    [JUDGEMENT_OF_LIGHT_INTERMEDIATE_ID]: handleJudgementOfLightIntermediate,
    [JUDGEMENT_OF_WISDOM_INTERMEDIATE_ID]: handleJudgementOfWisdomIntermediate,
  },
  // Rank-generic Holy Shock: all ranks share icon 156 under family paladin.
  // Cite: SpellEffects.cpp:1429–1454 switch (SpellIconID) case 156.
  dummyMatchers: [
    {
      spellFamilyName: SPELLFAMILY_PALADIN,
      spellIconId: HOLY_SHOCK_ICON_ID,
      handler: handleHolyShock,
    },
    {
      spellFamilyName: SPELLFAMILY_PALADIN,
      spellIconId: JUDGEMENT_OF_COMMAND_ICON_ID,
      handler: handleJudgementOfCommand,
    },
  ],
  // Judgement is a single player ability id. Cite: Paladin.cpp spell_judgement 20271.
  script: {
    [JUDGEMENT_SPELL_ID]: handleJudgement,
  },
  // Rank-generic HL / FoL: C++ keys on SpellIconID 70 / 242, not a rank id list.
  // Cite: SpellEffects.cpp:4154–4171.
  scriptMatchers: [
    {
      spellFamilyName: SPELLFAMILY_PALADIN,
      spellIconId: HOLY_LIGHT_ICON_ID,
      handler: handleHolyLight,
    },
    {
      spellFamilyName: SPELLFAMILY_PALADIN,
      spellIconId: FLASH_OF_LIGHT_ICON_ID,
      handler: handleFlashOfLight,
    },
  ],
};
