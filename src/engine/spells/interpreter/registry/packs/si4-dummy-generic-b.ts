// EffectDummy SPELLFAMILY_GENERIC (b: 21908–25792). Cite: SpellEffects.cpp cases below.

import type { RegistryHandler, RegistryPack, RegistryState } from '../types.ts';
import {
  CRYSTAL_PRISON_CONJURE_SPELL_ID,
  CRYSTAL_PRISON_DUMMY_SPELL_ID,
  SPAWN_DRAKONID_BY_ENTRY,
  SPAWN_DRAKONID_SPELL_ID,
} from '../../../cmangos-special-cases.ts';
import {
  SUMMON_DEMENTED_DRUID_SPIRIT_PARENT_SPELL_ID,
  SUMMON_DEMENTED_DRUID_SPIRIT_SPELL_ID,
} from '../../../cmangos-special-cases-s18.ts';

function roll01(state: RegistryState): number {
  const r = state.ctx.rng;
  if (typeof r === 'function') return r();
  return 0;
}

function handledNoop(state: RegistryState): void {
  if (!(state.effects?.length) && !(state.intents?.length)) {
    state.effects.push({
      kind: 'script_handled_noop',
      spellId: state.spell.id | 0,
    } as never);
  }
}

function pickIndex(roll01v: number, n: number): number {
  let i = Math.floor(roll01v * n);
  if (i < 0) i = 0;
  if (i >= n) i = n - 1;
  return i;
}

function pushTriggered(state: RegistryState, spellId: number): void {
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
}

function pushUnitTargetCast(state: RegistryState, spellId: number): void {
  state.intents.push({ kind: 'trigger_spell_as_unit_target', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
}

// ── Constants from C++ bodies ───────────────────────────────────────────────

/** SpellEffects.cpp:813–818 case 21908 Lava Burst Randomizer. */
export const LAVA_BURST_RANDOMIZER_SPELL_ID = 21908;
export const LAVA_BURST_OUTCOME_SPELL_IDS = [
  21886, 21900, 21901, 21902, 21903, 21904, 21905, 21906, 21907,
] as const;

/** SpellEffects.cpp:831–840 case 22282 Brood Power. */
export const BROOD_POWER_DUMMY_SPELL_ID = 22282;
export const BROOD_POWER_PAYLOAD_SPELL_IDS = [22283, 22285, 22286, 22287, 22288] as const;

/** SpellEffects.cpp:858–867 case 22664 Shadowblink — EFFECT_INDEX_1 only. */
export const SHADOWBLINK_SPELL_ID = 22664;
export const SHADOWBLINK_OUTCOME_SPELL_IDS = [
  22668, 22669, 22670, 22671, 22672, 22673, 22674, 22675, 22676,
] as const;

/** SpellEffects.cpp:910–935 case 23138 Gate of Shazzrah → player CastSpell(23139). */
export const GATE_OF_SHAZZRAH_SPELL_ID = 23138;
export const GATE_OF_SHAZZRAH_SIPHON_SOUL_SPELL_ID = 23139;

/** SpellEffects.cpp:937–991 case 23173 Brood Affliction. */
export const BROOD_AFFLICTION_DUMMY_SPELL_ID = 23173;
export const BROOD_AFFLICTION_PAYLOAD_SPELL_IDS = [23153, 23154, 23155, 23170, 23169] as const;
export const CHROMATIC_MUTATION_SPELL_ID = 23174;
export const CHROMATIC_MUTATION_PLAYER_SPELL_ID = 23175;
export const CHROMATIC_MUTATION_PLAYER_2_SPELL_ID = 23177;

/** SpellEffects.cpp:993–1010 case 23195 — marker spells to instance script. */
export const DRAGONDOG_BREATH_SELECTION_SPELL_ID = 23195;
export const DRAGONDOG_LEFT_BREATH_MARKERS = [23317, 23318, 23319, 23320, 23321] as const;
export const DRAGONDOG_RIGHT_BREATH_MARKERS = [23322, 23323, 23324, 23325, 23326] as const;

/** SpellEffects.cpp:1012–1029 case 23343 Nefarian Tunnel Selection. */
export const NEFARIAN_TUNNEL_SELECTION_SPELL_ID = 23343;
export const NEFARIAN_LEFT_TUNNEL_MARKERS = [23344, 23345, 23346, 23347, 23348] as const;
export const NEFARIAN_RIGHT_TUNNEL_MARKERS = [23349, 23350, 23351, 23352, 23353] as const;

/** SpellEffects.cpp:1062–1077 case 23484 Dispel Drakonids ForcedDespawn entries. */
export const DISPEL_DRAKONIDS_SPELL_ID = 23484;
export const DISPEL_DRAKONID_ENTRIES = [14261, 14262, 14263, 14264, 14265, 14302] as const;

/** SpellEffects.cpp:1103–1106 case 25145 Merithra's Wake. */
export const MERITHRAS_WAKE_SPELL_ID = 25145;
export const MERITHRAS_WAKE_TRIGGER_SPELL_ID = 25172;

/** SpellEffects.cpp:1108–1111 case 25149 Arygos's Vengeance. */
export const ARYGOS_VENGEANCE_SPELL_ID = 25149;
export const ARYGOS_VENGEANCE_TRIGGER_SPELL_ID = 25168;

/** SpellEffects.cpp:1113–1117 case 25150 Molten Rain. */
export const MOLTEN_RAIN_SPELL_ID = 25150;
export const MOLTEN_RAIN_TRIGGER_SPELL_IDS = [25169, 25170] as const;

/** SpellEffects.cpp:1119–1124 case 25158 Time Stop. */
export const TIME_STOP_SPELL_ID = 25158;
export const TIME_STOP_TRIGGER_SPELL_ID = 25171;

/** SpellEffects.cpp:1126–1131 case 25792 Despawn Brood entry. */
export const DESPAWN_BROOD_SPELL_ID = 25792;
export const YAUJ_BROOD_ENTRY = 15621;

export function pickLavaBurstSpellId(roll01v: number): number {
  return LAVA_BURST_OUTCOME_SPELL_IDS[pickIndex(roll01v, LAVA_BURST_OUTCOME_SPELL_IDS.length)]!;
}

export function pickBroodPowerSpellId(roll01v: number): number {
  return BROOD_POWER_PAYLOAD_SPELL_IDS[pickIndex(roll01v, BROOD_POWER_PAYLOAD_SPELL_IDS.length)]!;
}

export function pickShadowblinkSpellId(roll01v: number): number {
  return SHADOWBLINK_OUTCOME_SPELL_IDS[pickIndex(roll01v, SHADOWBLINK_OUTCOME_SPELL_IDS.length)]!;
}

export function pickBroodAfflictionSpellId(roll01v: number): number {
  return BROOD_AFFLICTION_PAYLOAD_SPELL_IDS[
    pickIndex(roll01v, BROOD_AFFLICTION_PAYLOAD_SPELL_IDS.length)
  ]!;
}

// right = urand(0,4); left = (right + urand(1,4)) % 5. Cite: SpellEffects.cpp:999–1000 / :1018–1019.
export function pickDistinctPairIndices(
  rightRoll: number,
  offsetRoll: number,
  n: number,
): { left: number; right: number } {
  let right = pickIndex(rightRoll, n);
  let off = 1 + Math.floor(offsetRoll * (n - 1));
  if (off < 1) off = 1;
  if (off > n - 1) off = n - 1;
  return { left: (right + off) % n, right };
}

export function pickDragondogBreathMarkers(
  rightRoll: number,
  offsetRoll: number,
): { left: number; right: number } {
  const { left, right } = pickDistinctPairIndices(
    rightRoll,
    offsetRoll,
    DRAGONDOG_LEFT_BREATH_MARKERS.length,
  );
  return {
    left: DRAGONDOG_LEFT_BREATH_MARKERS[left]!,
    right: DRAGONDOG_RIGHT_BREATH_MARKERS[right]!,
  };
}

export function pickNefarianTunnelMarkers(
  rightRoll: number,
  offsetRoll: number,
): { left: number; right: number } {
  const { left, right } = pickDistinctPairIndices(
    rightRoll,
    offsetRoll,
    NEFARIAN_LEFT_TUNNEL_MARKERS.length,
  );
  return {
    left: NEFARIAN_LEFT_TUNNEL_MARKERS[left]!,
    right: NEFARIAN_RIGHT_TUNNEL_MARKERS[right]!,
  };
}

// ── Handlers ────────────────────────────────────────────────────────────────

// Lava Burst Randomizer — urand of nine lava-burst summons. Cite: SpellEffects.cpp:813–818.
const handleLavaBurstRandomizer: RegistryHandler = (state) => {
  pushTriggered(state, pickLavaBurstSpellId(roll01(state)));
  return true;
};

// Brood Power — strip 22283/85/86/87/88 then cast one. Cite: SpellEffects.cpp:831–840.
const handleBroodPower: RegistryHandler = (state) => {
  const picked = pickBroodPowerSpellId(roll01(state));
  for (const id of BROOD_POWER_PAYLOAD_SPELL_IDS) {
    state.intents.push({
      kind: 'consume_aura',
      spellId: id,
      spellFamilyName: 0,
      spellFamilyFlags: 0,
      auraType: 0,
    });
    state.effects.push({
      kind: 'consume_aura',
      spellId: id,
      spellFamilyName: 0,
      spellFamilyFlags: 0,
      auraType: 0,
    });
  }
  pushTriggered(state, picked);
  return true;
};

// Spawn Drakonid — caster entry → summon spell. Cite: SpellEffects.cpp:842–856.
const handleSpawnDrakonid: RegistryHandler = (state) => {
  const entry = (state.ctx as { casterCreatureEntry?: number }).casterCreatureEntry ?? 0;
  const spellId = SPAWN_DRAKONID_BY_ENTRY[entry | 0] ?? 0;
  if (!spellId) {
    handledNoop(state);
    return true;
  }
  pushTriggered(state, spellId);
  return true;
};

// Shadowblink — EFFECT_INDEX_1 only, urand of nine blinks. Cite: SpellEffects.cpp:858–867.
const handleShadowblink: RegistryHandler = (state, _raw, slot) => {
  if (slot !== 1) return true;
  pushTriggered(state, pickShadowblinkSpellId(roll01(state)));
  return true;
};

// Crystal Prison Dummy — living non-pet creature CastSpell(23022); ForcedDespawn is world. Cite:
// SpellEffects.cpp:868–880.
const handleCrystalPrisonDummy: RegistryHandler = (state) => {
  if (state.ctx.unitTargetIsCreature === false) {
    handledNoop(state);
    return true;
  }
  if (state.ctx.unitTargetIsAlive === false) {
    handledNoop(state);
    return true;
  }
  if (state.ctx.unitTargetIsPet === true) {
    handledNoop(state);
    return true;
  }
  pushUnitTargetCast(state, CRYSTAL_PRISON_CONJURE_SPELL_ID);
  return true;
};

// Gate of Shazzrah — random player CastSpell(caster, 23139); SendAIEvent is ScriptDev. Cite:
// SpellEffects.cpp:910–935.
const handleGateOfShazzrah: RegistryHandler = (state) => {
  if (state.ctx.unitTargetIsPlayer === false) {
    handledNoop(state);
    return true;
  }
  pushUnitTargetCast(state, GATE_OF_SHAZZRAH_SIPHON_SOUL_SPELL_ID);
  return true;
};

// Brood Affliction — pick one of five; threat-list fan-out is combat. Cite: SpellEffects.cpp:937–991.
const handleBroodAffliction: RegistryHandler = (state) => {
  const spellAfflict = pickBroodAfflictionSpellId(roll01(state));
  const auras = state.ctx.targetAuras ?? [];
  const has = (id: number) => auras.some((a) => (a.spellId | 0) === id);
  if (has(CHROMATIC_MUTATION_SPELL_ID)) {
    handledNoop(state);
    return true;
  }
  pushTriggered(state, spellAfflict);
  // After the pick, all five on the target → mutation. Cite: SpellEffects.cpp:978–988.
  const present = new Set(auras.map((a) => a.spellId | 0));
  present.add(spellAfflict);
  if (BROOD_AFFLICTION_PAYLOAD_SPELL_IDS.every((id) => present.has(id))) {
    pushTriggered(state, CHROMATIC_MUTATION_SPELL_ID);
    pushUnitTargetCast(state, CHROMATIC_MUTATION_PLAYER_SPELL_ID);
    pushUnitTargetCast(state, CHROMATIC_MUTATION_PLAYER_2_SPELL_ID);
  }
  return true;
};

// Dragondog Breath Selection — cast left/right marker pair. Cite: SpellEffects.cpp:993–1010.
const handleDragondogBreathSelection: RegistryHandler = (state) => {
  const pair = pickDragondogBreathMarkers(roll01(state), roll01(state));
  pushTriggered(state, pair.left);
  pushTriggered(state, pair.right);
  return true;
};

// Nefarian Tunnel Selection — cast left/right marker pair. Cite: SpellEffects.cpp:1012–1029.
const handleNefarianTunnelSelection: RegistryHandler = (state) => {
  const pair = pickNefarianTunnelMarkers(roll01(state), roll01(state));
  pushTriggered(state, pair.left);
  pushTriggered(state, pair.right);
  return true;
};

// Dispel Drakonids — ForcedDespawn on matching entries (world despawn). Cite: SpellEffects.cpp:1062–1077.
const handleDispelDrakonids: RegistryHandler = (state) => {
  const entry = (state.ctx as { unitTargetCreatureEntry?: number }).unitTargetCreatureEntry;
  if (
    entry != null
    && !(DISPEL_DRAKONID_ENTRIES as readonly number[]).includes(entry | 0)
  ) {
    handledNoop(state);
    return true;
  }
  // ForcedDespawn is world-side (Polly 9976 pattern); no combat payload.
  handledNoop(state);
  return true;
};

// Summon Demented Druid Spirit — player target → 24795. Cite: SpellEffects.cpp:1096–1101.
const handleSummonDementedDruidSpirit: RegistryHandler = (state) => {
  if (state.ctx.unitTargetIsPlayer === false) {
    handledNoop(state);
    return true;
  }
  pushTriggered(state, SUMMON_DEMENTED_DRUID_SPIRIT_SPELL_ID);
  return true;
};

// Merithra's Wake — unitTarget CastSpell(25172). Cite: SpellEffects.cpp:1103–1106.
const handleMerithrasWake: RegistryHandler = (state) => {
  pushUnitTargetCast(state, MERITHRAS_WAKE_TRIGGER_SPELL_ID);
  return true;
};

// Arygos's Vengeance — unitTarget CastSpell(25168). Cite: SpellEffects.cpp:1108–1111.
const handleArygosVengeance: RegistryHandler = (state) => {
  pushUnitTargetCast(state, ARYGOS_VENGEANCE_TRIGGER_SPELL_ID);
  return true;
};

// Molten Rain — unitTarget CastSpell(25169) + CastSpell(25170). Cite: SpellEffects.cpp:1113–1117.
const handleMoltenRain: RegistryHandler = (state) => {
  for (const spellId of MOLTEN_RAIN_TRIGGER_SPELL_IDS) {
    pushUnitTargetCast(state, spellId);
  }
  return true;
};

// Time Stop — SetImmuneToNPC + RemoveAllAuras are unit flags; cast 25171. Cite: SpellEffects.cpp:1119–1124.
const handleTimeStop: RegistryHandler = (state) => {
  pushUnitTargetCast(state, TIME_STOP_TRIGGER_SPELL_ID);
  return true;
};

// Despawn Brood — ForcedDespawn entry 15621 (world despawn). Cite: SpellEffects.cpp:1126–1131.
const handleDespawnBrood: RegistryHandler = (state) => {
  const entry = (state.ctx as { unitTargetCreatureEntry?: number }).unitTargetCreatureEntry;
  if (entry != null && (entry | 0) !== YAUJ_BROOD_ENTRY) {
    handledNoop(state);
    return true;
  }
  handledNoop(state);
  return true;
};

export const si4DummyGenericBPack: RegistryPack = {
  id: 'si4-dummy-generic-b',
  dummy: {
    [LAVA_BURST_RANDOMIZER_SPELL_ID]: handleLavaBurstRandomizer,
    [BROOD_POWER_DUMMY_SPELL_ID]: handleBroodPower,
    [SPAWN_DRAKONID_SPELL_ID]: handleSpawnDrakonid,
    [SHADOWBLINK_SPELL_ID]: handleShadowblink,
    [CRYSTAL_PRISON_DUMMY_SPELL_ID]: handleCrystalPrisonDummy,
    [GATE_OF_SHAZZRAH_SPELL_ID]: handleGateOfShazzrah,
    [BROOD_AFFLICTION_DUMMY_SPELL_ID]: handleBroodAffliction,
    [DRAGONDOG_BREATH_SELECTION_SPELL_ID]: handleDragondogBreathSelection,
    [NEFARIAN_TUNNEL_SELECTION_SPELL_ID]: handleNefarianTunnelSelection,
    [DISPEL_DRAKONIDS_SPELL_ID]: handleDispelDrakonids,
    [SUMMON_DEMENTED_DRUID_SPIRIT_PARENT_SPELL_ID]: handleSummonDementedDruidSpirit,
    [MERITHRAS_WAKE_SPELL_ID]: handleMerithrasWake,
    [ARYGOS_VENGEANCE_SPELL_ID]: handleArygosVengeance,
    [MOLTEN_RAIN_SPELL_ID]: handleMoltenRain,
    [TIME_STOP_SPELL_ID]: handleTimeStop,
    [DESPAWN_BROOD_SPELL_ID]: handleDespawnBrood,
  },
};
