// EffectScriptEffect SPELLFAMILY_GENERIC ids 24714–26264. Cite: SpellEffects.cpp:3812–3987.

import type { RegistryHandler, RegistryPack } from '../types.ts';
import {
  GHOST_COSTUME_FEMALE_SPELL_ID,
  GHOST_COSTUME_MALE_SPELL_ID,
  GHOST_COSTUME_SPELL_ID,
  HALLOWS_END_TRICK_SPELL_ID,
  LEPER_GNOME_COSTUME_FEMALE_SPELL_ID,
  LEPER_GNOME_COSTUME_MALE_SPELL_ID,
  LEPER_GNOME_COSTUME_SPELL_ID,
  NINJA_COSTUME_FEMALE_SPELL_ID,
  NINJA_COSTUME_MALE_SPELL_ID,
  NINJA_COSTUME_SPELL_ID,
  PIRATE_COSTUME_FEMALE_SPELL_ID,
  PIRATE_COSTUME_MALE_SPELL_ID,
  PIRATE_COSTUME_SPELL_ID,
  pickHallowsEndTrickOutcome,
  RANDOM_COSTUME_SPELL_ID,
  SUMMON_RC_TANK_SPELL_ID,
  SUMMON_RC_TANK_SUMMON_SPELL_ID,
} from '../../../cmangos-special-cases-s18.ts';
import {
  DRAIN_MANA_ERADICATOR_TRIGGER_SPELL_ID,
  DRAIN_MANA_NULLIFIER_TRIGGER_SPELL_ID,
  MISTLETOE_CHEER_SPELL_ID,
  MISTLETOE_RANDOM_OUTCOMES,
  MISTLETOE_RANDOM_SPELL_ID,
} from '../../../cmangos-special-cases-s19.ts';

/** Cannon Fire SCRIPT → unitTarget casts Magic Wings. Cite: SpellEffects.cpp:3900–3906. */
export const CANNON_FIRE_SPELL_ID = 24731;
/** Magic Wings — strip Darkmoon cannon root. Cite: SpellEffects.cpp:3917–3923. */
export const MAGIC_WINGS_SPELL_ID = 24742;
/** Darkmoon Faire Cannon root aura. Cite: SpellEffects.cpp:3921. */
export const DARKMOON_CANNON_ROOT_AURA_SPELL_ID = 24754;
/** Trick or Treat. Cite: SpellEffects.cpp:3925–3935. */
export const TRICK_OR_TREAT_SPELL_ID = 24751;
/** Tricked or Treated mark. Cite: SpellEffects.cpp:3931. */
export const TRICKED_OR_TREATED_SPELL_ID = 24755;
/** Treat branch of Trick or Treat. Cite: SpellEffects.cpp:3934. */
export const TREAT_SPELL_ID = 24715;
/** Drain Mana SCRIPT siblings that cast 26639. Cite: SpellEffects.cpp:3945–3949. */
export const DRAIN_MANA_FEEDBACK_SPELL_ID = 26639;
/** Obsidian Destroyer Drain Mana parent. Cite: SpellEffects.cpp:3957–3961. */
export const OBSIDIAN_DESTROYER_DRAIN_MANA_SPELL_ID = 25754;
/** Despawn SCRIPT — ForcedDespawn creature target. Cite: SpellEffects.cpp:3981–3987. */
export const DESPAWN_SCRIPT_SPELL_ID = 26264;

/** Skeleton / bat / wisp Random Costume outcomes. Cite: SpellEffects.cpp:3884–3893. */
const SKELETON_COSTUME_SPELL_ID = 24723;
const BAT_COSTUME_SPELL_ID = 24732;
const WISP_COSTUME_SPELL_ID = 24740;

function roll01(state: { ctx: { rng?: () => number } }): number {
  return state.ctx.rng ? state.ctx.rng() : 0;
}

// Random Costume urand(0,6). Cite: SpellEffects.cpp:3872–3894.
function pickRandomCostumeSpellId(roll0to6: number, isMale: boolean): number {
  switch (roll0to6 | 0) {
    case 0:
      return isMale ? PIRATE_COSTUME_MALE_SPELL_ID : PIRATE_COSTUME_FEMALE_SPELL_ID;
    case 1:
      return isMale ? NINJA_COSTUME_MALE_SPELL_ID : NINJA_COSTUME_FEMALE_SPELL_ID;
    case 2:
      return isMale ? LEPER_GNOME_COSTUME_MALE_SPELL_ID : LEPER_GNOME_COSTUME_FEMALE_SPELL_ID;
    case 3:
      return SKELETON_COSTUME_SPELL_ID;
    case 4:
      return BAT_COSTUME_SPELL_ID;
    case 5:
      return isMale ? GHOST_COSTUME_MALE_SPELL_ID : GHOST_COSTUME_FEMALE_SPELL_ID;
    case 6:
      return WISP_COSTUME_SPELL_ID;
    default:
      return SKELETON_COSTUME_SPELL_ID;
  }
}

// Trick — player caster urand of 13 morphs. Cite: SpellEffects.cpp:3812–3836.
const handleHallowsEndTrick: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.casterIsPlayer === false) return true;
  const spellId = pickHallowsEndTrickOutcome(roll01(state));
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

// Pirate Costume — gender → 24708/24709. Cite: SpellEffects.cpp:3838–3845.
const handlePirateCostume: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.unitTargetIsPlayer === false) return true;
  const male = state.ctx.unitTargetGender !== 1;
  const spellId = male ? PIRATE_COSTUME_MALE_SPELL_ID : PIRATE_COSTUME_FEMALE_SPELL_ID;
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

// Ninja Costume — gender → 24711/24710. Cite: SpellEffects.cpp:3847–3854.
const handleNinjaCostume: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.unitTargetIsPlayer === false) return true;
  const male = state.ctx.unitTargetGender !== 1;
  const spellId = male ? NINJA_COSTUME_MALE_SPELL_ID : NINJA_COSTUME_FEMALE_SPELL_ID;
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

// Leper Gnome Costume — gender → 24712/24713. Cite: SpellEffects.cpp:3856–3863.
const handleLeperGnomeCostume: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.unitTargetIsPlayer === false) return true;
  const male = state.ctx.unitTargetGender !== 1;
  const spellId = male ? LEPER_GNOME_COSTUME_MALE_SPELL_ID : LEPER_GNOME_COSTUME_FEMALE_SPELL_ID;
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

// Random Costume — urand(0,6) table. Cite: SpellEffects.cpp:3865–3898.
const handleRandomCostume: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.unitTargetIsPlayer === false) return true;
  const roll = state.ctx.rng ? Math.floor(state.ctx.rng() * 7) : 0;
  const male = state.ctx.unitTargetGender !== 1;
  const spellId = pickRandomCostumeSpellId(roll, male);
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

// Cannon Fire — unitTarget casts 24742 on caster. Cite: SpellEffects.cpp:3900–3906.
const handleCannonFire: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.casterIsPlayer === false) return true;
  state.intents.push({ kind: 'trigger_spell_as_unit_target', spellId: MAGIC_WINGS_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: MAGIC_WINGS_SPELL_ID });
  return true;
};

// Ghost Costume — gender → 24735/24736. Cite: SpellEffects.cpp:3908–3915.
const handleGhostCostume: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.unitTargetIsPlayer === false) return true;
  const male = state.ctx.unitTargetGender !== 1;
  const spellId = male ? GHOST_COSTUME_MALE_SPELL_ID : GHOST_COSTUME_FEMALE_SPELL_ID;
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

// Magic Wings — RemoveAurasDueToSpell(24754). Cite: SpellEffects.cpp:3917–3923.
const handleMagicWings: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({
    kind: 'consume_aura',
    spellId: DARKMOON_CANNON_ROOT_AURA_SPELL_ID,
    spellFamilyName: 0,
    spellFamilyFlags: 0,
    auraType: 0,
  });
  return true;
};

// Trick or Treat — 24755 + 50% 24714/24715 from unitTarget. Cite: SpellEffects.cpp:3925–3935.
const handleTrickOrTreat: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.unitTargetIsPlayer === false) return true;
  state.intents.push({ kind: 'trigger_spell_as_unit_target', spellId: TRICKED_OR_TREATED_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: TRICKED_OR_TREATED_SPELL_ID });
  // roll_chance_i(50) → rng [0,1) < 0.5. Cite: SpellEffects.cpp:3934.
  const spellId = roll01(state) < 0.5 ? HALLOWS_END_TRICK_SPELL_ID : TREAT_SPELL_ID;
  state.intents.push({ kind: 'trigger_spell_as_unit_target', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

// Summon RC Tank — CastSpell(24934). Cite: SpellEffects.cpp:3937–3943.
const handleSummonRcTank: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.casterIsPlayer === false) return true;
  state.intents.push({ kind: 'cast_triggered_spell', spellId: SUMMON_RC_TANK_SUMMON_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: SUMMON_RC_TANK_SUMMON_SPELL_ID });
  return true;
};

// Drain Mana 25671/25755 — unitTarget casts 26639 on caster. Cite: SpellEffects.cpp:3945–3949.
const handleDrainManaFeedback: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'trigger_spell_as_unit_target', spellId: DRAIN_MANA_FEEDBACK_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: DRAIN_MANA_FEEDBACK_SPELL_ID });
  return true;
};

// Obsidian Destroyer Drain Mana — CastSpell(25755). Cite: SpellEffects.cpp:3957–3961.
const handleObsidianDestroyerDrainMana: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({
    kind: 'cast_triggered_spell',
    spellId: DRAIN_MANA_ERADICATOR_TRIGGER_SPELL_ID,
  });
  state.effects.push({ kind: 'trigger_spell', spellId: DRAIN_MANA_ERADICATOR_TRIGGER_SPELL_ID });
  return true;
};

// Mistletoe cheer — HandleEmote(EMOTE_ONESHOT_CHEER) only. Cite: SpellEffects.cpp:3963–3969.
const handleMistletoeCheer: RegistryHandler = (state, _raw, _slot) => {
  state.effects.push({
    kind: 'script_handled_noop',
    spellId: MISTLETOE_CHEER_SPELL_ID,
  } as never);
  return true;
};

// Mistletoe gift — urand 26206/26207 on player. Cite: SpellEffects.cpp:3971–3979.
const handleMistletoeRandom: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.unitTargetIsPlayer === false) return true;
  const spellId =
    roll01(state) < 0.5 ? MISTLETOE_RANDOM_OUTCOMES[0]! : MISTLETOE_RANDOM_OUTCOMES[1]!;
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

// Despawn — ForcedDespawn on creature unitTarget. Cite: SpellEffects.cpp:3981–3987.
const handleDespawn: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.unitTargetIsPlayer === true) return true;
  state.effects.push({
    kind: 'script_handled_noop',
    spellId: DESPAWN_SCRIPT_SPELL_ID,
  } as never);
  return true;
};

const script: Record<number, RegistryHandler> = {
  [HALLOWS_END_TRICK_SPELL_ID]: handleHallowsEndTrick,
  [PIRATE_COSTUME_SPELL_ID]: handlePirateCostume,
  [NINJA_COSTUME_SPELL_ID]: handleNinjaCostume,
  [LEPER_GNOME_COSTUME_SPELL_ID]: handleLeperGnomeCostume,
  [RANDOM_COSTUME_SPELL_ID]: handleRandomCostume,
  [CANNON_FIRE_SPELL_ID]: handleCannonFire,
  [GHOST_COSTUME_SPELL_ID]: handleGhostCostume,
  [MAGIC_WINGS_SPELL_ID]: handleMagicWings,
  [TRICK_OR_TREAT_SPELL_ID]: handleTrickOrTreat,
  [SUMMON_RC_TANK_SPELL_ID]: handleSummonRcTank,
  [DRAIN_MANA_NULLIFIER_TRIGGER_SPELL_ID]: handleDrainManaFeedback,
  [DRAIN_MANA_ERADICATOR_TRIGGER_SPELL_ID]: handleDrainManaFeedback,
  [OBSIDIAN_DESTROYER_DRAIN_MANA_SPELL_ID]: handleObsidianDestroyerDrainMana,
  [MISTLETOE_CHEER_SPELL_ID]: handleMistletoeCheer,
  [MISTLETOE_RANDOM_SPELL_ID]: handleMistletoeRandom,
  [DESPAWN_SCRIPT_SPELL_ID]: handleDespawn,
};

export const si4ScriptGenericBPack: RegistryPack = {
  id: 'si4-script-generic-b',
  script,
};
