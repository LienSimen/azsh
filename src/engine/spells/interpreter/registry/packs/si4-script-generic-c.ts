// EffectScriptEffect SPELLFAMILY_GENERIC ids 26524–30918. Cite: SpellEffects.cpp:3992–4147.

import type { RegistryHandler, RegistryPack, RegistryState } from '../types.ts';
import {
  CREATE_HEART_CANDY_SPELL_ID,
  HEART_CANDY_OUTCOME_SPELL_IDS,
  HEARTBROKEN_AURA_SPELL_ID,
  SUMMON_REINDEER_SPELL_ID,
} from '../../../cmangos-special-cases-s19.ts';
import { IMPROVED_SPRINT_TRIGGER_SPELL_ID } from '../../../cmangos-special-cases-s21.ts';
import { IMMUNE_TO_ROOT_AND_SNARE_MASK } from '../../../immunity.ts';

/** Sand Trap parent (Kurinnaxx). Cite: SpellEffects.cpp:3992–3996. */
export const SAND_TRAP_SCRIPT_SPELL_ID = 26524;
/** Sand Trap payload cast on unitTarget. Cite: SpellEffects.cpp:3995 CastSpell(…, 25648). */
export const SAND_TRAP_TRIGGER_SPELL_ID = 25648;

/** Summon Reindeer SCRIPT parent. Cite: SpellEffects.cpp:3998–4002. */
export const SUMMON_REINDEER_SCRIPT_SPELL_ID = 26528;

/** Valentine guard scripts. Cite: SpellEffects.cpp:4004–4009. */
export const VALENTINE_GUARD_SPELL_IDS: readonly number[] = [
  26663, 26923, 26924, 27541, 27547, 27548,
];

/** Valentine civilian scripts. Cite: SpellEffects.cpp:4063–4064. */
export const VALENTINE_CIVILIAN_SPELL_IDS: readonly number[] = [27549, 27550];

/** Adored aura gated before Pledge/Gift of Adoration. Cite: SpellEffects.cpp:4030–4033. */
export const ADORED_AURA_SPELL_ID = 26680;
/** Love is in the Air aura removed from the NPC caster. Cite: SpellEffects.cpp:4039. */
export const LOVE_IS_IN_THE_AIR_AURA_SPELL_ID = 27741;

/** Love is in the Air Test. Cite: SpellEffects.cpp:4100–4108. */
export const LOVE_IS_IN_THE_AIR_TEST_SPELL_ID = 27654;
/** Amorous cast when target is not an innkeeper. Cite: SpellEffects.cpp:4106. */
export const AMOROUS_SPELL_ID = 26869;
/** UNIT_NPC_FLAG_INNKEEPER. Cite: Unit.h:517. */
export const UNIT_NPC_FLAG_INNKEEPER = 0x00000080;

/** Breath of Sargeras. Cite: SpellEffects.cpp:4132–4138. */
export const BREATH_OF_SARGERAS_SPELL_ID = 28352;
/** Breath of Sargeras payload. Cite: SpellEffects.cpp:4137 CastSpell(…, 28342). */
export const BREATH_OF_SARGERAS_TRIGGER_SPELL_ID = 28342;

// Guard map [Pledge of Friendship, Pledge of Adoration] by caster faction. Cite: SpellEffects.cpp:4016–4024.
const VALENTINE_GUARD_BY_FACTION: Readonly<Record<number, readonly [number, number]>> = {
  11: [27242, 27510],
  85: [27247, 27507],
  57: [27244, 27506],
  68: [27246, 27515],
  71: [27246, 27515],
  79: [27245, 27504],
  105: [27248, 27513],
};

// Civilian map [Gift of Friendship, Gift of Adoration] by caster faction. Cite: SpellEffects.cpp:4071–4079.
const VALENTINE_CIVILIAN_BY_FACTION: Readonly<Record<number, readonly [number, number]>> = {
  12: [27525, 27509],
  29: [27523, 27505],
  55: [27520, 27503],
  68: [27529, 27512],
  80: [27519, 26901],
  104: [27524, 27511],
  126: [27523, 27505],
  875: [27520, 27503],
};

function roll01(state: RegistryState): number {
  const r = state.ctx.rng;
  if (typeof r === 'function') return r();
  return 0;
}

function casterFactionOf(state: RegistryState): number | undefined {
  if (!('casterFaction' in state.ctx)) return undefined;
  const v = (state.ctx as { casterFaction?: unknown }).casterFaction;
  return typeof v === 'number' ? v : undefined;
}

function unitTargetNpcFlagsOf(state: RegistryState): number | undefined {
  if (!('unitTargetNpcFlags' in state.ctx)) return undefined;
  const v = (state.ctx as { unitTargetNpcFlags?: unknown }).unitTargetNpcFlags;
  return typeof v === 'number' ? v : undefined;
}

function pushUnitTargetCast(state: RegistryState, spellId: number): void {
  state.intents.push({ kind: 'trigger_spell_as_unit_target', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
}

function pushCasterCast(state: RegistryState, spellId: number): void {
  state.intents.push({ kind: 'cast_triggered_spell', spellId });
  state.effects.push({ kind: 'trigger_spell', spellId });
}

function pushConsumeAura(state: RegistryState, spellId: number): void {
  state.intents.push({
    kind: 'consume_aura',
    spellId,
    spellFamilyName: 0,
    spellFamilyFlags: 0,
    auraType: 0,
  });
  state.effects.push({
    kind: 'consume_aura',
    spellId,
    spellFamilyName: 0,
    spellFamilyFlags: 0,
    auraType: 0,
  });
}

function targetHasAura(state: RegistryState, spellId: number): boolean {
  const auras = state.ctx.targetAuras ?? [];
  return auras.some((a) => (a.spellId | 0) === (spellId | 0));
}

// Sand Trap — unitTarget casts 25648. Cite: SpellEffects.cpp:3992–3996.
const handleSandTrap: RegistryHandler = (state, _raw, _slot) => {
  pushUnitTargetCast(state, SAND_TRAP_TRIGGER_SPELL_ID);
  return true;
};

// Summon Reindeer — unitTarget casts 26529. Cite: SpellEffects.cpp:3998–4002.
const handleSummonReindeer: RegistryHandler = (state, _raw, _slot) => {
  pushUnitTargetCast(state, SUMMON_REINDEER_SPELL_ID);
  return true;
};

// Valentine guard/civilian — faction table, 1/6 Heartbroken, else Adored/Friendship. Cite: :4004–4098.
function handleValentine(
  state: RegistryState,
  byFaction: Readonly<Record<number, readonly [number, number]>>,
): boolean {
  if (state.ctx.unitTargetIsPlayer === false) return true;
  const faction = casterFactionOf(state);
  if (faction == null) {
    state.effects.push({ kind: 'script_handled_noop', spellId: state.spell.id | 0 } as never);
    return true;
  }
  const pair = byFaction[faction | 0];
  if (!pair) {
    state.effects.push({ kind: 'script_handled_noop', spellId: state.spell.id | 0 } as never);
    return true;
  }
  // !urand(0, 5) → 1 in 6 Heartbroken. Cite: SpellEffects.cpp:4028–4029 / :4084–4085.
  const roll = state.ctx.rng ? Math.floor(roll01(state) * 6) : 0;
  let pledgeOrBroken: number;
  if (roll === 0) {
    pledgeOrBroken = HEARTBROKEN_AURA_SPELL_ID;
  } else if (!targetHasAura(state, ADORED_AURA_SPELL_ID)) {
    pledgeOrBroken = pair[1]!;
    pushUnitTargetCast(state, ADORED_AURA_SPELL_ID);
  } else {
    pledgeOrBroken = pair[0]!;
  }
  pushUnitTargetCast(state, pledgeOrBroken);
  // Remove Love is in the Air from the NPC caster. Cite: SpellEffects.cpp:4039 / :4095.
  pushConsumeAura(state, LOVE_IS_IN_THE_AIR_AURA_SPELL_ID);
  return true;
}

const handleValentineGuard: RegistryHandler = (state, _raw, _slot) =>
  handleValentine(state, VALENTINE_GUARD_BY_FACTION);

const handleValentineCivilian: RegistryHandler = (state, _raw, _slot) =>
  handleValentine(state, VALENTINE_CIVILIAN_BY_FACTION);

// Create Heart Candy — urand(0,7) → create-item scripts. Cite: SpellEffects.cpp:4044–4060.
const handleCreateHeartCandy: RegistryHandler = (state, _raw, _slot) => {
  const idx = state.ctx.rng ? Math.floor(roll01(state) * 8) % 8 : 0;
  const spellId = HEART_CANDY_OUTCOME_SPELL_IDS[idx]!;
  pushCasterCast(state, spellId);
  return true;
};

// Love is in the Air Test — gossip flag + Amorous when not innkeeper. Cite: SpellEffects.cpp:4100–4108.
const handleLoveIsInTheAirTest: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.unitTargetIsPlayer !== false) {
    state.effects.push({
      kind: 'script_handled_noop',
      spellId: LOVE_IS_IN_THE_AIR_TEST_SPELL_ID,
    } as never);
    return true;
  }
  const flags = unitTargetNpcFlagsOf(state);
  const isInnkeeper = flags != null && (flags & UNIT_NPC_FLAG_INNKEEPER) !== 0;
  if (!isInnkeeper) {
    // unitTarget casts Amorous on m_caster. Cite: SpellEffects.cpp:4106.
    pushUnitTargetCast(state, AMOROUS_SPELL_ID);
  } else {
    // SetFlag(GOSSIP) only — no spell-intent kind. Cite: SpellEffects.cpp:4104.
    state.effects.push({
      kind: 'script_handled_noop',
      spellId: LOVE_IS_IN_THE_AIR_TEST_SPELL_ID,
    } as never);
  }
  return true;
};

// Breath of Sargeras — player unitTarget casts 28342. Cite: SpellEffects.cpp:4132–4138.
const handleBreathOfSargeras: RegistryHandler = (state, _raw, _slot) => {
  if (state.ctx.unitTargetIsPlayer === false) return true;
  pushUnitTargetCast(state, BREATH_OF_SARGERAS_TRIGGER_SPELL_ID);
  return true;
};

// Improved Sprint — purge root+snare. Cite: SpellEffects.cpp:4140–4147; SharedDefines.h:389–390.
const handleImprovedSprint: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({
    kind: 'mechanic_immunity_purge',
    mechanic: 0,
    mechanicMask: IMMUNE_TO_ROOT_AND_SNARE_MASK,
  });
  return true;
};

const script: Record<number, RegistryHandler> = {
  [SAND_TRAP_SCRIPT_SPELL_ID]: handleSandTrap,
  [SUMMON_REINDEER_SCRIPT_SPELL_ID]: handleSummonReindeer,
  [CREATE_HEART_CANDY_SPELL_ID]: handleCreateHeartCandy,
  [LOVE_IS_IN_THE_AIR_TEST_SPELL_ID]: handleLoveIsInTheAirTest,
  [BREATH_OF_SARGERAS_SPELL_ID]: handleBreathOfSargeras,
  [IMPROVED_SPRINT_TRIGGER_SPELL_ID]: handleImprovedSprint,
};
for (const id of VALENTINE_GUARD_SPELL_IDS) script[id] = handleValentineGuard;
for (const id of VALENTINE_CIVILIAN_SPELL_IDS) script[id] = handleValentineCivilian;

export const si4ScriptGenericCPack: RegistryPack = {
  id: 'si4-script-generic-c',
  script,
};
