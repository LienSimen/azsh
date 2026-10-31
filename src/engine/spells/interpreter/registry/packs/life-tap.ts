// Life Tap, the warlock dummy that converts health to mana. Rank-generic on the warlock family plus
// its family flag, so every rank matches. Cite: Warlock.cpp LifeTap ~52-103.

import type { RegistryHandler, RegistryPack } from '../types.ts';
import { effectBaseAmount, truncTowardZero } from '../helpers.ts';
import { LIFE_TAP_BASE_AMOUNT } from '../../priest-warlock-kit.ts';

/** Life Tap mana energize custom spell. Cite: Warlock.cpp:102 CastCustomSpell(nullptr, 31818, &mana, …). */
export const LIFE_TAP_MANA_SPELL_ID = 31818;

// Plagueheart Raiment dummy — reduces/scales hp cost only, not mana. Cite: Warlock.cpp:75–76, :94–95 case
// 28830.
export const PLAGUEHEART_LIFE_TAP_SPELL_ID = 28830;

/** SPELLFAMILY_WARLOCK. Cite: DBCEnums.h SPELLFAMILY_WARLOCK = 5. */
export const SPELLFAMILY_WARLOCK = 5;

// Life Tap family flag bit (0x40000). Shared by all classic ranks. Cite: spell_template SpellFamilyFlags
// for 1454/1455/…/11689.
export const LIFE_TAP_FAMILY_FLAGS = 0x0004_0000;

// The Life Tap handler: the script value is the mana, scaled by the Improved Life Tap dummy auras,
// and the health is paid as a power cost. Cite: Warlock.cpp:52-103.
const handleLifeTap: RegistryHandler = (state, raw, _slot) => {
  // The rank table is flat per rank, matching the tooltip. The DBC per-level term is NOT applied to
  // player Life Tap ranks — with it, level 20 read 34 instead of 20.
  const rankBase = LIFE_TAP_BASE_AMOUNT[state.spell.id | 0];
  let cost = rankBase != null
    ? rankBase
    : effectBaseAmount(raw, { ...state.ctx, casterLevel: undefined, spellLevel: undefined });

  // ApplySpellMod SPELLMOD_COST when ctx supplies. Cite: Warlock.cpp:58–60.
  if (state.ctx.spellModCost != null) {
    cost += state.ctx.spellModCost;
  }

  // SpellDamageBonusDone/Taken on self — flat hook when provided. Cite: Warlock.cpp:62–64.
  let scriptValue = truncTowardZero(cost > 0 ? cost : 0);
  if (state.ctx.lifeTapSpellDamageBonus != null) {
    scriptValue = truncTowardZero(scriptValue + state.ctx.lifeTapSpellDamageBonus);
  }
  if (scriptValue < 0) scriptValue = 0;

  // OnCheckCast fizzle: script value > current health → SPELL_FAILED_FIZZLE. Compared against
  // pre-Plagueheart script value (GetScriptValue), not power cost. Cite: Warlock.cpp:69–70.
  const fizzled =
    state.ctx.casterHealth != null && scriptValue > (state.ctx.casterHealth | 0);

  // Health cost = script value; Plagueheart adds dmg * amount/100 to power cost only.
  // Cite: Warlock.cpp:74–77 OnCheckCast (!strict) SetPowerCost.
  let healthCost = scriptValue;
  let mana = scriptValue;

  const dummies = state.ctx.lifeTapDummyAuras ?? [];
  for (const aura of dummies) {
    if (aura.spellId === PLAGUEHEART_LIFE_TAP_SPELL_ID) {
      // Plagueheart: hp cost only. Cite: Warlock.cpp:75–76, :94–95 break.
      healthCost = truncTowardZero(healthCost + (healthCost * aura.amount) / 100);
      continue;
    }
    // Improved Life Tap (and any other isAffected dummy): scale mana.
    // Cite: Warlock.cpp:97 mana = (amount+100)*mana/100; C++ int32 arithmetic.
    mana = truncTowardZero(((aura.amount + 100) * mana) / 100);
  }

  // Intent for SI5; bake effects [] so LOCK 9a oracle matches empty.
  // Cite: Warlock.cpp OnEffectExecute + power cost path.
  const lifeTapIntent: {
    kind: 'life_tap';
    healthCost: number;
    manaGain: number;
    manaSpellId: number;
    fizzled?: boolean;
  } = {
    kind: 'life_tap',
    healthCost,
    manaGain: fizzled ? 0 : mana,
    manaSpellId: LIFE_TAP_MANA_SPELL_ID,
  };
  if (fizzled) lifeTapIntent.fizzled = true;
  state.intents.push(lifeTapIntent);

  // OnEffectExecute only runs when cast succeeds — no CastCustomSpell on fizzle.
  // Cite: Warlock.cpp:82–102; OnCheckCast :69–70.
  if (!fizzled) {
    state.intents.push({
      kind: 'cast_custom_spell',
      spellId: LIFE_TAP_MANA_SPELL_ID,
      bp0: mana,
    });
  }

  return true;
};

export const lifeTapPack: RegistryPack = {
  id: 'life-tap',
  // Rank-generic: all Life Tap ranks share family 5 + 0x40000.
  // Cite: spell_template ranks 1454–11689; Warlock.cpp LifeTap (no per-id switch body).
  dummyMatchers: [
    {
      spellFamilyName: SPELLFAMILY_WARLOCK,
      spellFamilyFlags: LIFE_TAP_FAMILY_FLAGS,
      handler: handleLifeTap,
    },
  ],
};
