// Steady Shot EffectDummy: daze bonus under SPELLFAMILY_HUNTER flags 0x100000000.
// Cite: SpellEffects.cpp:1385–1407.

import type { RegistryHandler, RegistryPack } from '../types.ts';
import { effectBaseAmount } from '../helpers.ts';
import { SPELL_AURA_MOD_DECREASE_SPEED } from '../../opcodes.ts';

/** SPELLFAMILY_HUNTER. Cite: DBCEnums.h SPELLFAMILY_HUNTER = 9. */
export const SPELLFAMILY_HUNTER = 9;

/** Steady Shot SpellFamilyFlags. Cite: SpellEffects.cpp:1386. */
export const STEADY_SHOT_FAMILY_FLAGS = 0x100000000;

/** Dazed slow SpellIconID. Cite: SpellEffects.cpp:1396. */
export const DAZED_SLOW_ICON_ID = 15;

// When the target has a non-dispellable icon-15 slow, add this effect's damage to the hit.
// Cite: SpellEffects.cpp:1388–1404.
const handleSteadyShot: RegistryHandler = (state, raw, _slot) => {
  // Cite: SpellEffects.cpp:1388 unitTarget && IsAlive().
  if (state.ctx.unitTargetIsAlive === false) return true;

  const auras = state.ctx.targetAuras;
  if (!auras?.length) return true;

  const lookup = state.ctx.spellLookup;
  let found = false;
  for (const a of auras) {
    if ((a.auraType | 0) !== SPELL_AURA_MOD_DECREASE_SPEED) continue;
    // SpellProto icon + dispel. Cite: SpellEffects.cpp:1396.
    const proto = lookup?.(a.spellId | 0);
    if (!proto) continue;
    if (((proto.spellIconId ?? 0) | 0) === DAZED_SLOW_ICON_ID && ((proto.dispel ?? 0) | 0) === 0) {
      found = true;
      break;
    }
  }
  if (!found) return true;

  // Cite: SpellEffects.cpp:1404 m_damage += damage.
  const damage = effectBaseAmount(raw, state.ctx);
  state.effects.push({
    kind: 'direct_damage',
    school: state.spell.school,
    min: damage,
    max: damage,
  });
  return true;
};

export const si4DummyHunterPack: RegistryPack = {
  id: 'si4-dummy-hunter',
  dummyMatchers: [
    {
      spellFamilyName: SPELLFAMILY_HUNTER,
      spellFamilyFlags: STEADY_SHOT_FAMILY_FLAGS,
      handler: handleSteadyShot,
    },
  ],
};
