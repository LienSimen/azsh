// EffectScriptEffect SPELLFAMILY_GENERIC ids 17512–24195. Cite: SpellEffects.cpp:3729–3801.

import type { RegistryHandler, RegistryPack } from '../types.ts';
import {
  JUBLING_COOLDOWN_SPELL_ID,
  JUBLING_COOLDOWN_TRIGGER_SPELL_ID,
  ONYXIA_SCALE_CLOAK_SPELL_ID,
  PICCOLO_OF_THE_FLAMING_FIRE_SPELL_ID,
  SHADOW_FLAME_DOT_AMOUNT,
  SHADOW_FLAME_DOT_DURATION_MS,
  SHADOW_FLAME_DOT_SPELL_ID,
  SHADOW_FLAME_DOT_TICK_MS,
  shadowFlameAppliesDot,
} from '../../../cmangos-special-cases.ts';
import {
  GROMS_TRIBUTE_BY_RACE,
  GROMS_TRIBUTE_SPELL_ID,
  UTHERS_TRIBUTE_BY_RACE,
  UTHERS_TRIBUTE_SPELL_ID,
} from '../../../cmangos-special-cases-s18.ts';
import {
  BANISH_EXILE_BURNING_SPELL_ID,
  BANISH_EXILE_CRESTING_SPELL_ID,
  BANISH_EXILE_THUNDERING_SPELL_ID,
} from '../../../cmangos-special-cases.ts';
import { CONTROL_CONSOLE_REMOVE_TARGET_SPELL } from '../../handlers/shared.ts';

/** Onyxia Shadow Flame SCRIPT siblings sharing the 22682 cast. Cite: SpellEffects.cpp:3738–3761. */
export const SHADOW_FLAME_SCRIPT_SPELL_IDS: readonly number[] = [
  22972, 22975, 22976, 22977, 22978, 22979, 22980, 22981, 22982, 22983, 22984, 22985,
];

// Banish Exile — unitTarget casts 3617 to trigger dispel. Cite: item_scripts.cpp:136-139.
const handleBanishExile: RegistryHandler = (state) => {
  // DoScriptText(-1010004) flavor emitted as no-op until text surfaces exist.
  state.intents.push({
    kind: 'trigger_spell_as_unit_target',
    spellId: CONTROL_CONSOLE_REMOVE_TARGET_SPELL,
  });
  state.effects.push({ kind: 'trigger_spell', spellId: CONTROL_CONSOLE_REMOVE_TARGET_SPELL });
  return true;
};

// Piccolo of the Flaming Fire — HandleEmoteCommand(EMOTE_STATE_DANCE) on player. Cite:
// SpellEffects.cpp:3729–3736.
const handlePiccoloOfTheFlamingFire: RegistryHandler = (state, _raw, _slot) => {
  state.effects.push({
    kind: 'script_handled_noop',
    spellId: PICCOLO_OF_THE_FLAMING_FIRE_SPELL_ID,
  } as never);
  return true;
};

// Shadow Flame SCRIPT_EFFECT — CastSpell(22682) unless Onyxia Scale Cloak 22683. Cite:
// SpellEffects.cpp:3738–3761 (same body as 22539).
const handleShadowFlameScript: RegistryHandler = (state, _raw, _slot) => {
  const auras = state.ctx.targetAuras ?? [];
  const hasCloak = auras.some((a) => (a.spellId | 0) === ONYXIA_SCALE_CLOAK_SPELL_ID);
  if (!shadowFlameAppliesDot(hasCloak)) return true;
  state.intents.push({ kind: 'cast_triggered_spell', spellId: SHADOW_FLAME_DOT_SPELL_ID });
  state.effects.push({
    kind: 'dot',
    school: 'shadow',
    min: SHADOW_FLAME_DOT_AMOUNT,
    max: SHADOW_FLAME_DOT_AMOUNT,
    tickMs: SHADOW_FLAME_DOT_TICK_MS,
    durationMs: SHADOW_FLAME_DOT_DURATION_MS,
  });
  return true;
};

// Jubling Cooldown — CastSpell(23852). Cite: SpellEffects.cpp:3763–3766.
const handleJublingCooldown: RegistryHandler = (state, _raw, _slot) => {
  state.intents.push({ kind: 'cast_triggered_spell', spellId: JUBLING_COOLDOWN_TRIGGER_SPELL_ID });
  state.effects.push({ kind: 'trigger_spell', spellId: JUBLING_COOLDOWN_TRIGGER_SPELL_ID });
  return true;
};

// Uther's / Grom's Tribute — race → holiday buff. Cite: SpellEffects.cpp:3768–3801.
const handleTribute: RegistryHandler = (state, _raw, _slot) => {
  const race = (state.ctx as { casterRace?: number }).casterRace ?? 0;
  const id = state.spell.id | 0;
  const spellId =
    id === UTHERS_TRIBUTE_SPELL_ID
      ? (UTHERS_TRIBUTE_BY_RACE[race] ?? 0)
      : id === GROMS_TRIBUTE_SPELL_ID
        ? (GROMS_TRIBUTE_BY_RACE[race] ?? 0)
        : 0;
  if (spellId) {
    state.intents.push({ kind: 'cast_triggered_spell', spellId });
    state.effects.push({ kind: 'trigger_spell', spellId });
  } else {
    state.effects.push({ kind: 'script_handled_noop', spellId: id } as never);
  }
  return true;
};

const script: Record<number, RegistryHandler> = {
  [BANISH_EXILE_BURNING_SPELL_ID]: handleBanishExile,
  [BANISH_EXILE_CRESTING_SPELL_ID]: handleBanishExile,
  [BANISH_EXILE_THUNDERING_SPELL_ID]: handleBanishExile,
  [PICCOLO_OF_THE_FLAMING_FIRE_SPELL_ID]: handlePiccoloOfTheFlamingFire,
  [JUBLING_COOLDOWN_SPELL_ID]: handleJublingCooldown,
  [UTHERS_TRIBUTE_SPELL_ID]: handleTribute,
  [GROMS_TRIBUTE_SPELL_ID]: handleTribute,
};
for (const id of SHADOW_FLAME_SCRIPT_SPELL_IDS) {
  script[id] = handleShadowFlameScript;
}

export const si4ScriptGenericAPack: RegistryPack = {
  id: 'si4-script-generic-a',
  script,
};
