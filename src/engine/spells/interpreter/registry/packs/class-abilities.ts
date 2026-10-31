// Class-ability dummy and script specials: Last Stand, Enrage, the cooldown resets and the racial
// dummies. Rank-generic by icon where the C++ switches on one, per-id only where it uses a case.

import type { RegistryHandler, RegistryPack } from '../types.ts';
import { effectBaseAmount, truncTowardZero } from '../helpers.ts';
import { IMPROVED_SPRINT_TRIGGER_SPELL_ID } from '../../../cmangos-special-cases-s21.ts';
import { IMMUNE_TO_ROOT_AND_SNARE_MASK } from '../../../immunity.ts';

// ── Spell ids (CMaNGOS per-id cases) ─────────────────────────────────────────

/** Last Stand. Cite: SpellEffects.cpp:440 case 12975. */
export const LAST_STAND_SPELL_ID = 12975;
// Last Stand custom buff spell (MOD_INCREASE_HEALTH). Cite: SpellEffects.cpp:443 CastCustomSpell(m_caster,
// 12976, &healthModSpellBasePoints0, …).
export const LAST_STAND_BUFF_SPELL_ID = 12976;

/** Druid Enrage. Cite: SpellEffects.cpp:1370 case 5229. */
export const ENRAGE_SPELL_ID = 5229;
// Enrage armor-reduction custom spell. Cite: SpellEffects.cpp:1375 CastCustomSpell(nullptr, 25503,
// &reductionMod, …).
export const ENRAGE_ARMOR_SPELL_ID = 25503;
/** Dire Bear Form aura id for Enrage −16% branch. Cite: SpellEffects.cpp:1373 HasAura(9634). */
export const DIRE_BEAR_FORM_SPELL_ID = 9634;
// Default armor reduction (not Dire Bear). Cite: SpellEffects.cpp:1372 reductionMod = -27. spell_template
// 25503 EffectBasePoints2 = -27 (CastCustomSpell overrides).
export const ENRAGE_ARMOR_PCT_DEFAULT = -27;
/** Dire Bear armor reduction. Cite: SpellEffects.cpp:1373–1374 HasAura(9634) → -16. */
export const ENRAGE_ARMOR_PCT_DIRE_BEAR = -16;
// Enrage armor-reduction duration (ms). spell_template 5229 / 25503 DurationIndex 1 → 10s. Cite:
// SpellEffects.cpp:1375 CastCustomSpell(25503); duration.ts DurationIndex 1.
export const ENRAGE_ARMOR_DURATION_MS = 10_000;

/** Cold Snap. Cite: SpellEffects.cpp:1294 case 12472. */
export const COLD_SNAP_SPELL_ID = 12472;
/** Preparation. Cite: Rogue.cpp Preparation ~21–32; spell_template Id 14185. */
export const PREPARATION_SPELL_ID = 14185;
/** Readiness. Cite: SpellEffects.cpp:1412 case 23989. */
export const READINESS_SPELL_ID = 23989;

/** Blood Fury (orc racial). Cite: SpellEffects.cpp:760 case 20572. */
export const BLOOD_FURY_SPELL_ID = 20572;
/** Blood Fury healing reduction / side buff. Cite: SpellEffects.cpp:764 CastSpell(23230). */
export const BLOOD_FURY_HEALING_SPELL_ID = 23230;
/** Blood Fury AP custom buff. Cite: SpellEffects.cpp:767 CastCustomSpell(23234). */
export const BLOOD_FURY_AP_SPELL_ID = 23234;

/** Cannibalize. Cite: SpellEffects.cpp:786 case 20577. */
export const CANNIBALIZE_SPELL_ID = 20577;
/** Cannibalize channel heal. Cite: SpellEffects.cpp:788 CastSpell(20578). */
export const CANNIBALIZE_HEAL_SPELL_ID = 20578;

// Berserking SpellIconID — C++ switches on icon, not a rank id list. Cite: SpellEffects.cpp:1267–1285 case
// 1661.
export const BERSERKING_ICON_ID = 1661;

/** Berserking haste custom. Cite: SpellEffects.cpp:1284 CastCustomSpell(26635, …). */
export const BERSERKING_HASTE_SPELL_ID = 26635;

// Classic Berserking rank ids (diagnostics / fixtures only — dispatch is icon-generic). Cite: spell ids
// 20554 / 26296 / 26297 in classic DB.
export const BERSERKING_SPELL_IDS = [20554, 26296, 26297] as const;

// Wisp Spirit is a dummy with no handler body in the C++, a passive placeholder. An explicit no-op,
// so the bake inventory is owned. Cite: game-data 20585; no case in SpellEffects.cpp.
export const WISP_SPIRIT_SPELL_ID = 20585;

// ── Bake surface constants (seed / enricher; not invented formulas) ─────────

// Bake surface duration for Last Stand buff (20s). Cite: combat.scripted-talents.test.ts; classic spell
// duration for 12976.
const LAST_STAND_DURATION_MS = 20_000;

// Blood Fury AP buff duration (ms). Companion 23234 MOD_ATTACK_POWER. Cite: SpellEffects.cpp:767
// CastCustomSpell(23234); live spell 23234 durationMs 15000.
const BLOOD_FURY_AP_DURATION_MS = 15_000;
// Blood Fury healing reduction duration (ms). Companion 23230 MOD_HEALING_PCT. Cite: SpellEffects.cpp:764
// CastSpell(23230); live spell 23230 durationMs 25000.
const BLOOD_FURY_HEAL_DURATION_MS = 25_000;
// Blood Fury healing taken % (spell 23230 aura 118). Bp=-51 Bd=1 → amount -50. Cite: effectAmountRange;
// live spell 23230 rawEffects; handleModHealingPct.
const BLOOD_FURY_HEALING_TAKEN_PCT = -50;

// seed-racials Berserking combat surface — haste % at full health (bake-thin). Cite: SpellEffects.cpp:1271
// haste_mod = 10 at full health; seed-racials.mjs 20554.
const BERSERKING_BAKE_HASTE = 10;
const BERSERKING_BAKE_DURATION_MS = 10_000;

// The Cannibalize channel heals 7% of max health every two seconds for ten.
// Cite: Spell_1.12.1_5875.csv 20578; SpellAuras.cpp PeriodicTick percent-of-max path.
const CANNIBALIZE_PCT_OF_MAX = 7;
const CANNIBALIZE_TICK_MS = 2000;
const CANNIBALIZE_DURATION_MS = 10_000;

// ── Handlers ────────────────────────────────────────────────────────────────

// Last Stand casts a custom spell for 30% of max health. With a caster maximum supplied that is the
// custom cast; on a thin bake it is the percent buff the enricher and combat kit already use.
const handleLastStand: RegistryHandler = (state, _raw, _slot) => {
  const maxHealth = state.ctx.casterMaxHealth;

  if (maxHealth != null && maxHealth > 0) {
    // Cite: SpellEffects.cpp:442–443 int32(GetMaxHealth() * 0.3).
    const bp0 = truncTowardZero(maxHealth * 0.3);
    state.intents.push({
      kind: 'cast_custom_spell',
      spellId: LAST_STAND_BUFF_SPELL_ID,
      bp0,
    });
  }

  // Bake / combat surface (percent). Always emit so bake-thin oracle + SI5 have a shape.
  // Cite: game-data Last Stand effects; combat.scripted-talents.test.ts.
  state.effects.push({
    kind: 'buff',
    mod: 'max_health_pct',
    amount: 30,
    durationMs: LAST_STAND_DURATION_MS,
  });

  return true;
};

// Enrage's dummy is the armor reduction only, since the rage regen is its own aura slots. The combat
// surface also emits an armor percent so the reduction actually applies at the play surface.
const handleEnrage: RegistryHandler = (state, _raw, _slot) => {
  // Cite: SpellEffects.cpp:1372–1374.
  const reductionMod = state.ctx.hasDireBearForm
    ? ENRAGE_ARMOR_PCT_DIRE_BEAR
    : ENRAGE_ARMOR_PCT_DEFAULT;
  state.intents.push({
    kind: 'cast_custom_spell',
    spellId: ENRAGE_ARMOR_SPELL_ID,
    bp0: reductionMod,
  });
  // The live armor surface, with the same numbers as the custom cast. It must be marked non-hostile:
  // the amount is negative but self-targeted. Unshifted, or the later regen row skips the combat mod.
  state.effects.unshift({
    kind: 'buff',
    mod: 'armor_pct',
    amount: reductionMod,
    durationMs: ENRAGE_ARMOR_DURATION_MS,
    hostile: false,
  });
  return true;
};

// Cold Snap: RemoveSomeCooldown on mage frost spells with recovery time. Bake: `{ kind: 'reset_cooldowns',
// scope: 'frost' }`. Cite: SpellEffects.cpp:1294–1308; enrich-talent-actives.mjs SCRIPTED 12472.
const handleColdSnap: RegistryHandler = (state, _raw, _slot) => {
  state.effects.push({ kind: 'reset_cooldowns', scope: 'frost' });
  return true;
};

// Preparation: RemoveSomeCooldown on SPELLFAMILY_ROGUE except self. Bake: `{ kind: 'reset_cooldowns',
// scope: 'rogue' }`. Cite: Rogue.cpp:21–32 Preparation; enrich-talent-actives.mjs SCRIPTED 14185.
const handlePreparation: RegistryHandler = (state, _raw, _slot) => {
  state.effects.push({ kind: 'reset_cooldowns', scope: 'rogue' });
  return true;
};

// Improved Sprint: target dummy 30918 purges root and snare from unitTarget.
// Cite: SpellEffects.cpp:4140-4147 EffectDummy case 30918; SharedDefines.h IMMUNE_TO_ROOT_AND_SNARE_MASK.
const handleImprovedSprint: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({
    kind: 'mechanic_immunity_purge',
    mechanic: 0,
    mechanicMask: IMMUNE_TO_ROOT_AND_SNARE_MASK,
  });
  return true;
};

// Readiness: RemoveSomeCooldown on SPELLFAMILY_HUNTER with recovery, except self. Bake inventory empty for
// 23989 — emit hunter scope for SI5 / combat. Cite: SpellEffects.cpp:1412–1419.
const handleReadiness: RegistryHandler = (state, _raw, _slot) => {
  state.effects.push({ kind: 'reset_cooldowns', scope: 'hunter' });
  return true;
};

// Berserking's haste scales with missing health, from 10% at full up to 30% at or under 40%. With no
// health in the context the full-health 10% stands. Cite: SpellEffects.cpp:1267-1285.
const handleBerserking: RegistryHandler = (state, _raw, _slot) => {
  const healthPerc = state.ctx.casterHealthPercent;
  // Cite: SpellEffects.cpp:1271–1275.
  let hasteMod = BERSERKING_BAKE_HASTE;
  if (healthPerc != null) {
    // Clamp to int percent like C++ uint32 cast of the float multiply. Cite: :1270.
    const hp = truncTowardZero(healthPerc);
    hasteMod = 10;
    if (hp <= 40) hasteMod = 30;
    if (hp < 100 && hp > 40) hasteMod = 10 + truncTowardZero((100 - hp) / 3);

    // Cite: SpellEffects.cpp:1278–1284 — same bp for melee/range/cast haste.
    state.intents.push({
      kind: 'cast_custom_spell',
      spellId: BERSERKING_HASTE_SPELL_ID,
      bp0: hasteMod,
      bp1: hasteMod,
      bp2: hasteMod,
    });
  }

  // Live combat + seed-racials surface: haste, not flat AP. Cite: seed-racials 20554; KI-125.
  state.effects.push({
    kind: 'buff',
    mod: 'haste',
    amount: hasteMod,
    durationMs: BERSERKING_BAKE_DURATION_MS,
  });
  return true;
};

// Blood Fury casts a healing reduction and a flat attack-power bonus scaled off base attack power.
// Intents alone are not applied, so the combat surface carries both. Cite: SpellEffects.cpp:760-768.
const handleBloodFury: RegistryHandler = (state, raw, _slot) => {
  // Cite: SpellEffects.cpp:764 CastSpell(23230).
  state.intents.push({
    kind: 'cast_triggered_spell',
    spellId: BLOOD_FURY_HEALING_SPELL_ID,
  });

  // Cite: SpellEffects.cpp:766–767 damage * AP / 100 (uint32 path → trunc toward zero).
  const pct = effectBaseAmount(raw, state.ctx);
  const ap = state.ctx.attackPower ?? 0;
  const bp0 = truncTowardZero((pct * ap) / 100);
  state.intents.push({
    kind: 'cast_custom_spell',
    spellId: BLOOD_FURY_AP_SPELL_ID,
    bp0,
  });

  // Live AP: % of base melee AP (dummy bp = 25). Cite: SpellEffects.cpp:766; raw 20572 bp24+1.
  state.effects.push({
    kind: 'buff',
    mod: 'attack_power_pct',
    amount: pct,
    durationMs: BLOOD_FURY_AP_DURATION_MS,
    hostile: false,
  });
  // Live heal penalty from 23230. Cite: SpellEffects.cpp:764; spell 23230 aura 118.
  state.effects.push({
    kind: 'buff',
    mod: 'healing_taken_pct',
    amount: BLOOD_FURY_HEALING_TAKEN_PCT,
    durationMs: BLOOD_FURY_HEAL_DURATION_MS,
    hostile: false,
  });
  return true;
};

// Cannibalize: CastSpell(20578) heal channel (OBS_MOD_HEALTH 7% max). Cite: SpellEffects.cpp:786–789;
// Spell_1.12.1_5875.csv 20578; KI-806.
const handleCannibalize: RegistryHandler = (state, _raw, _slot) => {
  // Cite: SpellEffects.cpp:788 CastSpell(nullptr, 20578, TRIGGERED_NONE).
  state.intents.push({
    kind: 'cast_triggered_spell',
    spellId: CANNIBALIZE_HEAL_SPELL_ID,
  });

  // OBS_MOD_HEALTH surface: pctOfMax wins; amountPerTick keeps bare % fallback.
  // Cite: auras-control handleObsModHealth; rest.ts resolvePeriodicPctOfMax.
  state.effects.push({
    kind: 'restore_health',
    amountPerTick: CANNIBALIZE_PCT_OF_MAX,
    tickMs: CANNIBALIZE_TICK_MS,
    durationMs: CANNIBALIZE_DURATION_MS,
    pctOfMax: CANNIBALIZE_PCT_OF_MAX,
  });
  return true;
};

// Wisp Spirit — no EffectDummy case in CMaNGOS Classic. Handled empty. Cite: SpellEffects.cpp (absence of
// case 20585); game-data 20585 passive dummy.
const handleWispSpirit: RegistryHandler = (state, _raw, _slot) => {
  state.effects.push({ kind: 'script_handled_noop', spellId: WISP_SPIRIT_SPELL_ID } as never);
  return true;
};

// ── Pack ────────────────────────────────────────────────────────────────────

export const classAbilitiesPack: RegistryPack = {
  id: 'class-abilities',
  // Per-id: CMaNGOS EffectDummy case <id> bodies.
  // Cite: SpellEffects.cpp cases 12975, 5229, 12472, 23989, 20572, 20577; Rogue.cpp 14185.
  dummy: {
    [LAST_STAND_SPELL_ID]: handleLastStand,
    [ENRAGE_SPELL_ID]: handleEnrage,
    [COLD_SNAP_SPELL_ID]: handleColdSnap,
    [PREPARATION_SPELL_ID]: handlePreparation,
    [READINESS_SPELL_ID]: handleReadiness,
    [BLOOD_FURY_SPELL_ID]: handleBloodFury,
    [IMPROVED_SPRINT_TRIGGER_SPELL_ID]: handleImprovedSprint,
    [CANNIBALIZE_SPELL_ID]: handleCannibalize,
    [WISP_SPIRIT_SPELL_ID]: handleWispSpirit,
  },
  // Rank-generic Berserking: C++ switches on SpellIconID 1661 for all ranks.
  // Cite: SpellEffects.cpp:1267–1285.
  dummyMatchers: [
    {
      spellIconId: BERSERKING_ICON_ID,
      handler: handleBerserking,
    },
  ],
  script: {},
};
