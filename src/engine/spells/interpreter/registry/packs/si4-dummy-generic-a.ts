// EffectDummy SPELLFAMILY_GENERIC ids 8606–21147. Cite: SpellEffects.cpp per-id cases.

import type { RegistryHandler, RegistryPack } from '../types.ts';
import type { InterpretContext } from '../../types.ts';
import { effectBaseAmount } from '../helpers.ts';
import {
  ATTRACT_RIFT_SPAWN_SPELL_ID,
  CAPTURE_WORG_PUP_SPELL_ID,
  CREATE_FILLED_CONTAINMENT_COFFER_SPELL_ID,
  DUMMY_TRIGGER_SPELL_ID,
  PERSISTENT_SHIELD_ABSORB_SPELL_ID,
  PERSISTENT_SHIELD_HOLDER_SPELL_ID,
  RIFT_SPAWN_STUN_AURA_SPELL_ID,
  TEMPERATURE_READING_SPELL_ID,
} from '../../../cmangos-special-cases.ts';

/** Cyclonian creature entry. Cite: SpellEffects.cpp:407 SummonCreature(6239, …). */
export const CYCLONIAN_CREATURE_ENTRY = 6239;
/** TEMPSPAWN_TIMED_OOC_DESPAWN 30 * IN_MILLISECONDS. Cite: SpellEffects.cpp:407. */
export const CYCLONIAN_DESPAWN_MS = 30_000;
export const SUMMON_CYCLONIAN_SPELL_ID = 8606;

export const STONE_DWARF_AWAKEN_VISUAL_SPELL_ID = 10254;
export const EMBERSEER_GROWING_SPELL_ID = 16049;
export const SPIRIT_HEALER_RES_SPELL_ID = 17251;
export const DESPAWN_SPECTRAL_COMBATANTS_SPELL_ID = 17678;

/** Inferno dummy triggered by 19695. Cite: SpellEffects.cpp:721–728 case 18947. */
export const INFERNO_DUMMY_SPELL_ID = 18947;
/** Inferno damage payload. Cite: SpellEffects.cpp:727 CastCustomSpell(…, 19698, …). */
export const INFERNO_DAMAGE_SPELL_ID = 19698;
// Per-tick custom bp0 (GetAuraTicks 1-based). Cite: SpellEffects.cpp:726–727.
export const INFERNO_DAMAGE_FOR_TICK = [500, 500, 1000, 1000, 2000, 2000, 3000, 5000] as const;

export function infernoDamageForTick(auraTicks: number): number | undefined {
  const i = (auraTicks | 0) - 1;
  if (i < 0 || i >= INFERNO_DAMAGE_FOR_TICK.length) return undefined;
  return INFERNO_DAMAGE_FOR_TICK[i];
}

export const GORDUNNI_TRAP_SPELL_ID = 19395;
/** Gordunni chest outcomes. Cite: SpellEffects.cpp:733 urand → 19394 : 11756. */
export const GORDUNNI_TRAP_JUNK_CHEST_SPELL_ID = 19394;
export const GORDUNNI_TRAP_COBALT_CHEST_SPELL_ID = 11756;

export const MAJORDOMO_TELEPORT_VISUAL_SPELL_ID = 19484;
/** Majordomo Teleport. Cite: SpellEffects.cpp:749 CastSpell(…, 19527, …). */
export const MAJORDOMO_TELEPORT_SPELL_ID = 19527;

export const DRAGON_ORB_SPELL_ID = 19869;
/** Mind Exhaustion gate. Cite: SpellEffects.cpp:774 !HasAura(23958). */
export const MIND_EXHAUSTION_SPELL_ID = 23958;
/** Possess from Dragon Orb. Cite: SpellEffects.cpp:775 CastSpell(…, 19832, …). */
export const DRAGON_ORB_POSSESS_SPELL_ID = 19832;

export const EXPLODE_ORB_EFFECT_SPELL_ID = 20037;
/** Explosion. Cite: SpellEffects.cpp:782 CastSpell(…, 20038, …). */
export const EXPLODE_ORB_EXPLOSION_SPELL_ID = 20038;

export const SUMMON_SONS_OF_FLAME_SPELL_ID = 21108;
// Eight summon spells. Cite: SpellEffects.cpp:794–795.
export const SONS_OF_FLAME_SUMMON_SPELL_IDS = [
  21110, 21111, 21112, 21113, 21114, 21115, 21116, 21117,
] as const;

export const ARCANE_VACUUM_SPELL_ID = 21147;
/** Summon Player teleport. Cite: SpellEffects.cpp:808 CastSpell(…, 21150, …). */
export const ARCANE_VACUUM_SUMMON_PLAYER_SPELL_ID = 21150;

function handledNoop(state: { effects: unknown[]; intents?: unknown[] }, spellId: number): true {
  if (!(state.effects?.length) && !(state.intents?.length)) {
    state.effects.push({ kind: 'script_handled_noop', spellId } as never);
  }
  return true;
}

function ctxAuraTicks(ctx: InterpretContext): number | undefined {
  const v = (ctx as InterpretContext & { auraTicks?: number }).auraTicks;
  return typeof v === 'number' && v > 0 ? v : undefined;
}

/** Summon Cyclonian at dest. Cite: SpellEffects.cpp:400–409. */
const handleSummonCyclonian: RegistryHandler = (state) => {
  state.effects.push({
    kind: 'summon_wild',
    creature: CYCLONIAN_CREATURE_ENTRY,
    count: 1,
    durationMs: CYCLONIAN_DESPAWN_MS,
  });
  state.intents.push({
    kind: 'summon_wild',
    creature: CYCLONIAN_CREATURE_ENTRY,
    count: 1,
    durationMs: CYCLONIAN_DESPAWN_MS,
    radiusIndex: 0,
  });
  return true;
};

/** Attract Rift Spawn → 9010 when target has 9032. Cite: SpellEffects.cpp:411–417. */
const handleAttractRiftSpawn: RegistryHandler = (state) => {
  const auras = state.ctx.targetAuras ?? [];
  if (!auras.some((a) => (a.spellId | 0) === RIFT_SPAWN_STUN_AURA_SPELL_ID)) {
    return handledNoop(state, ATTRACT_RIFT_SPAWN_SPELL_ID);
  }
  state.intents.push({
    kind: 'cast_triggered_spell',
    spellId: CREATE_FILLED_CONTAINMENT_COFFER_SPELL_ID,
  });
  state.effects.push({
    kind: 'trigger_spell',
    spellId: CREATE_FILLED_CONTAINMENT_COFFER_SPELL_ID,
  });
  return true;
};

// Stone Dwarf Awaken Visual — clear ROOT + immune/uninteractible flags on creature caster.
// Cite: SpellEffects.cpp:430–438. World unit-flag path; no combat payload.
const handleStoneDwarfAwakenVisual: RegistryHandler = (state) =>
  handledNoop(state, STONE_DWARF_AWAKEN_VISUAL_SPELL_ID);

/** Dummy Trigger 13567 → Persistent Shield absorb when by 26467. Cite: SpellEffects.cpp:504–520. */
const handleDummyTrigger13567: RegistryHandler = (state, raw) => {
  if (state.ctx.triggeredByAuraSpellId === PERSISTENT_SHIELD_HOLDER_SPELL_ID) {
    const bp0 = effectBaseAmount(raw, state.ctx);
    state.intents.push({
      kind: 'cast_custom_spell',
      spellId: PERSISTENT_SHIELD_ABSORB_SPELL_ID,
      bp0,
    });
    state.effects.push({ kind: 'trigger_spell', spellId: PERSISTENT_SHIELD_ABSORB_SPELL_ID });
    return true;
  }
  return handledNoop(state, DUMMY_TRIGGER_SPELL_ID);
};

// Capture Worg Pup — ForcedDespawn on creature; CREATE_ITEM is the co-slot. Cite: SpellEffects.cpp:545–550.
const handleCaptureWorgPup: RegistryHandler = (state) =>
  handledNoop(state, CAPTURE_WORG_PUP_SPELL_ID);

// Emberseer Growing — AI_EVENT_CUSTOM_A to self. Cite: SpellEffects.cpp:552–556.
const handleEmberseerGrowing: RegistryHandler = (state) =>
  handledNoop(state, EMBERSEER_GROWING_SPELL_ID);

// Temperature Reading — DoScriptText + quest credit by GO guid. Cite: SpellEffects.cpp:558–604.
const handleTemperatureReading: RegistryHandler = (state) =>
  handledNoop(state, TEMPERATURE_READING_SPELL_ID);

// Spirit Healer Res — SMSG_SPIRIT_HEALER_CONFIRM packet only. Cite: SpellEffects.cpp:627–640.
const handleSpiritHealerRes: RegistryHandler = (state) =>
  handledNoop(state, SPIRIT_HEALER_RES_SPELL_ID);

// Despawn Spectral Combatants — ForcedDespawn(3000). Cite: SpellEffects.cpp:650–659.
const handleDespawnSpectralCombatants: RegistryHandler = (state) =>
  handledNoop(state, DESPAWN_SPECTRAL_COMBATANTS_SPELL_ID);

/** Baron Geddon Inferno tick → CastCustomSpell 19698. Cite: SpellEffects.cpp:721–728. */
const handleInfernoDummy: RegistryHandler = (state) => {
  if (!state.ctx.triggeredByAuraSpellId) {
    return handledNoop(state, INFERNO_DUMMY_SPELL_ID);
  }
  const bp0 = infernoDamageForTick(ctxAuraTicks(state.ctx) ?? 0);
  if (bp0 == null) return handledNoop(state, INFERNO_DUMMY_SPELL_ID);
  state.intents.push({
    kind: 'cast_custom_spell',
    spellId: INFERNO_DAMAGE_SPELL_ID,
    bp0,
  });
  state.effects.push({
    kind: 'direct_damage',
    school: 'fire',
    min: bp0,
    max: bp0,
  });
  return true;
};

/** Gordunni Trap → 19394 or 11756. Cite: SpellEffects.cpp:730–735. */
const handleGordunniTrap: RegistryHandler = (state) => {
  if (state.ctx.unitTargetIsPlayer === false) {
    return handledNoop(state, GORDUNNI_TRAP_SPELL_ID);
  }
  const spellId =
    (state.ctx.rng ? Math.floor(state.ctx.rng() * 2) : 0) === 0
      ? GORDUNNI_TRAP_JUNK_CHEST_SPELL_ID
      : GORDUNNI_TRAP_COBALT_CHEST_SPELL_ID;
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
  return true;
};

/** Majordomo Teleport Visual → CastSpell(19527). Cite: SpellEffects.cpp:744–751. */
const handleMajordomoTeleportVisual: RegistryHandler = (state) => {
  state.intents.push({
    kind: 'cast_triggered_spell',
    spellId: MAJORDOMO_TELEPORT_SPELL_ID,
  });
  state.effects.push({ kind: 'trigger_spell', spellId: MAJORDOMO_TELEPORT_SPELL_ID });
  return true;
};

/** Dragon Orb → Possess 19832 unless Mind Exhaustion. Cite: SpellEffects.cpp:772–777. */
const handleDragonOrb: RegistryHandler = (state) => {
  if (state.ctx.unitTargetIsPlayer === false) {
    return handledNoop(state, DRAGON_ORB_SPELL_ID);
  }
  const auras = state.ctx.targetAuras ?? [];
  if (auras.some((a) => (a.spellId | 0) === MIND_EXHAUSTION_SPELL_ID)) {
    return handledNoop(state, DRAGON_ORB_SPELL_ID);
  }
  state.intents.push({
    kind: 'cast_triggered_spell',
    spellId: DRAGON_ORB_POSSESS_SPELL_ID,
  });
  state.effects.push({ kind: 'trigger_spell', spellId: DRAGON_ORB_POSSESS_SPELL_ID });
  return true;
};

/** Explode Orb Effect → 20038. Cite: SpellEffects.cpp:779–784. */
const handleExplodeOrbEffect: RegistryHandler = (state) => {
  state.intents.push({
    kind: 'cast_triggered_spell',
    spellId: EXPLODE_ORB_EXPLOSION_SPELL_ID,
  });
  state.effects.push({ kind: 'trigger_spell', spellId: EXPLODE_ORB_EXPLOSION_SPELL_ID });
  return true;
};

/** Summon Sons of Flame — eight summon casts. Cite: SpellEffects.cpp:791–796. */
const handleSummonSonsOfFlame: RegistryHandler = (state) => {
  for (const spellId of SONS_OF_FLAME_SUMMON_SPELL_IDS) {
    state.intents.push({ kind: 'cast_triggered_spell', spellId });
    state.effects.push({ kind: 'trigger_spell', spellId });
  }
  return true;
};

/** Arcane Vacuum — −100% threat then Summon Player. Cite: SpellEffects.cpp:798–811. */
const handleArcaneVacuum: RegistryHandler = (state) => {
  state.effects.push({ kind: 'modify_threat_pct', pct: -100 });
  state.intents.push({
    kind: 'cast_triggered_spell',
    spellId: ARCANE_VACUUM_SUMMON_PLAYER_SPELL_ID,
  });
  state.effects.push({ kind: 'trigger_spell', spellId: ARCANE_VACUUM_SUMMON_PLAYER_SPELL_ID });
  return true;
};

export const si4DummyGenericAPack: RegistryPack = {
  id: 'si4-dummy-generic-a',
  dummy: {
    [SUMMON_CYCLONIAN_SPELL_ID]: handleSummonCyclonian,
    [ATTRACT_RIFT_SPAWN_SPELL_ID]: handleAttractRiftSpawn,
    [STONE_DWARF_AWAKEN_VISUAL_SPELL_ID]: handleStoneDwarfAwakenVisual,
    [DUMMY_TRIGGER_SPELL_ID]: handleDummyTrigger13567,
    [CAPTURE_WORG_PUP_SPELL_ID]: handleCaptureWorgPup,
    [EMBERSEER_GROWING_SPELL_ID]: handleEmberseerGrowing,
    [TEMPERATURE_READING_SPELL_ID]: handleTemperatureReading,
    [SPIRIT_HEALER_RES_SPELL_ID]: handleSpiritHealerRes,
    [DESPAWN_SPECTRAL_COMBATANTS_SPELL_ID]: handleDespawnSpectralCombatants,
    [INFERNO_DUMMY_SPELL_ID]: handleInfernoDummy,
    [GORDUNNI_TRAP_SPELL_ID]: handleGordunniTrap,
    [MAJORDOMO_TELEPORT_VISUAL_SPELL_ID]: handleMajordomoTeleportVisual,
    [DRAGON_ORB_SPELL_ID]: handleDragonOrb,
    [EXPLODE_ORB_EFFECT_SPELL_ID]: handleExplodeOrbEffect,
    [SUMMON_SONS_OF_FLAME_SPELL_ID]: handleSummonSonsOfFlame,
    [ARCANE_VACUUM_SPELL_ID]: handleArcaneVacuum,
  },
};
