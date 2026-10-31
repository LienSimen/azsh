// EffectDummy SPELLFAMILY_GENERIC (c: 24721–27749). Cite: SpellEffects.cpp cases below.

import type { RegistryHandler, RegistryPack, RegistryState } from '../types.ts';
import {
  DREAM_FOG_SPELL_ID,
  DESPAWN_SHADES_OF_TAERAR_SPELL_ID,
  SHADE_OF_TAERAR_ENTRY,
} from '../../../cmangos-special-cases-s18.ts';
import {
  HOLIDAY_CHEER_SPELL_ID,
  GIVE_FRIENDSHIP_BRACELET_SPELL_ID,
  HEARTBROKEN_AURA_SPELL_ID,
  CANCEL_HEARTBROKEN_CREATE_BRACELET_SPELL_ID,
} from '../../../cmangos-special-cases-s19.ts';
import {
  INITIALIZE_TANK_SPELL_ID,
  RC_TANK_CONTROL_SPELL_ID,
  STEAM_TANK_PASSIVE_SPELL_ID,
} from '../../../cmangos-special-cases-s20.ts';

function handledNoop(state: RegistryState): void {
  if (!(state.effects?.length) && !(state.intents?.length)) {
    state.effects.push({
      kind: 'script_handled_noop',
      spellId: state.spell.id | 0,
    } as never);
  }
}

function pushTriggered(state: RegistryState, spellId: number): void {
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
}

function pushUnitTargetCast(state: RegistryState, spellId: number): void {
  state.intents.push({ kind: 'trigger_spell_as_unit_target', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
}

/** SharedDefines.h POWER_MANA. Cite: SpellEffects.cpp:1216 GetPowerType() == POWER_MANA. */
const POWER_MANA = 0;

// ── Constants from C++ bodies ───────────────────────────────────────────────

/** SpellEffects.cpp:1142–1151 case 24721 Buru Transform. */
export const BURU_TRANSFORM_SPELL_ID = 24721;
/** Buru Egg entry. Cite: SpellEffects.cpp:1145 GetEntry() == 15514. */
export const BURU_EGG_ENTRY = 15514;
/** Hatchling summon. Cite: SpellEffects.cpp:1147 CastSpell(…, 1881). */
export const BURU_EGG_HATCHLING_SPELL_ID = 1881;

export { DREAM_FOG_SPELL_ID };

export { DESPAWN_SHADES_OF_TAERAR_SPELL_ID, SHADE_OF_TAERAR_ENTRY };

export { HOLIDAY_CHEER_SPELL_ID };

/** SpellEffects.cpp:1214–1219 case 26626 Mana Burn Area. */
export const MANA_BURN_AREA_SPELL_ID = 26626;
/** Mana burn payload. Cite: SpellEffects.cpp:1217 CastSpell(…, 25779). */
export const MANA_BURN_AREA_TRIGGER_SPELL_ID = 25779;

export {
  GIVE_FRIENDSHIP_BRACELET_SPELL_ID,
  HEARTBROKEN_AURA_SPELL_ID,
  CANCEL_HEARTBROKEN_CREATE_BRACELET_SPELL_ID,
};

export { INITIALIZE_TANK_SPELL_ID, RC_TANK_CONTROL_SPELL_ID, STEAM_TANK_PASSIVE_SPELL_ID };

// ── Handlers ────────────────────────────────────────────────────────────────

// Buru Transform — egg 15514 casts 1881 then ForcedDespawn. Cite: SpellEffects.cpp:1142–1151.
const handleBuruTransform: RegistryHandler = (state) => {
  const entry = (state.ctx as { unitTargetCreatureEntry?: number }).unitTargetCreatureEntry;
  if (entry != null && (entry | 0) !== BURU_EGG_ENTRY) {
    handledNoop(state);
    return true;
  }
  // ForcedDespawn is world-side (Despawn Brood / Polly pattern); cast is the combat payload.
  pushUnitTargetCast(state, BURU_EGG_HATCHLING_SPELL_ID);
  return true;
};

// Dream Fog — DeleteThreatList + AttackStart(unitTarget). Cite: SpellEffects.cpp:1153–1163.
const handleDreamFog: RegistryHandler = (state) => {
  // AttackStart is AI retarget; threat clear is the combat-consumed half.
  state.effects.push({ kind: 'reset_own_threat' });
  return true;
};

// Despawn Taerar Shades — ForcedDespawn entry 15302. Cite: SpellEffects.cpp:1166–1173.
const handleDespawnTaerarShades: RegistryHandler = (state) => {
  const entry = (state.ctx as { unitTargetCreatureEntry?: number }).unitTargetCreatureEntry;
  if (entry != null && (entry | 0) !== SHADE_OF_TAERAR_ENTRY) {
    handledNoop(state);
    return true;
  }
  handledNoop(state);
  return true;
};

// Holiday Cheer — client-side only. Cite: SpellEffects.cpp:1196–1199.
const handleHolidayCheer: RegistryHandler = (state) => {
  handledNoop(state);
  return true;
};

// Mana Burn Area — creature + POWER_MANA → CastSpell(25779). Cite: SpellEffects.cpp:1214–1219.
const handleManaBurnArea: RegistryHandler = (state) => {
  if (state.ctx.unitTargetIsCreature === false) {
    handledNoop(state);
    return true;
  }
  if (state.ctx.targetPowerType != null && (state.ctx.targetPowerType | 0) !== POWER_MANA) {
    handledNoop(state);
    return true;
  }
  pushTriggered(state, MANA_BURN_AREA_TRIGGER_SPELL_ID);
  return true;
};

// Give Friendship Bracers — player + Heartbroken 26898 → remove + 26921. Cite: SpellEffects.cpp:1221–1228.
const handleGiveFriendshipBracers: RegistryHandler = (state) => {
  // C++: TYPEID_UNIT (creature) early-out, or missing Heartbroken. Cite: :1223.
  if (state.ctx.unitTargetIsPlayer === false || state.ctx.unitTargetIsCreature === true) {
    handledNoop(state);
    return true;
  }
  const auras = state.ctx.targetAuras ?? [];
  if (!auras.some((a) => (a.spellId | 0) === HEARTBROKEN_AURA_SPELL_ID)) {
    handledNoop(state);
    return true;
  }
  state.intents.push({
    kind: 'consume_aura',
    spellId: HEARTBROKEN_AURA_SPELL_ID,
    spellFamilyName: 0,
    spellFamilyFlags: 0,
    auraType: 0,
  });
  state.effects.push({
    kind: 'consume_aura',
    spellId: HEARTBROKEN_AURA_SPELL_ID,
    spellFamilyName: 0,
    spellFamilyFlags: 0,
    auraType: 0,
  });
  pushUnitTargetCast(state, CANCEL_HEARTBROKEN_CREATE_BRACELET_SPELL_ID);
  return true;
};

// Initialize Tank — unitTarget casts 24936 + 27747. Cite: SpellEffects.cpp:1240–1247.
const handleInitializeTank: RegistryHandler = (state) => {
  for (const spellId of [RC_TANK_CONTROL_SPELL_ID, STEAM_TANK_PASSIVE_SPELL_ID] as const) {
    pushUnitTargetCast(state, spellId);
  }
  return true;
};

export const si4DummyGenericCPack: RegistryPack = {
  id: 'si4-dummy-generic-c',
  dummy: {
    [BURU_TRANSFORM_SPELL_ID]: handleBuruTransform,
    [DREAM_FOG_SPELL_ID]: handleDreamFog,
    [DESPAWN_SHADES_OF_TAERAR_SPELL_ID]: handleDespawnTaerarShades,
    [HOLIDAY_CHEER_SPELL_ID]: handleHolidayCheer,
    [MANA_BURN_AREA_SPELL_ID]: handleManaBurnArea,
    [GIVE_FRIENDSHIP_BRACELET_SPELL_ID]: handleGiveFriendshipBracers,
    [INITIALIZE_TANK_SPELL_ID]: handleInitializeTank,
  },
};
