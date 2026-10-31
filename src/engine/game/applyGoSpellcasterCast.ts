// Host consume of GAMEOBJECT_TYPE_SPELLCASTER Use: cast spellcaster.spellId on the user. Cite:
// GameObject.cpp:1847 spellId; :1962–1970 SpellStart on user; TRIGGERED flags 0.

import type { DataStore } from '../../data/dataStore.ts';
import { resolveCombatSpell } from '../spells/interpreter/index.ts';
import { applyOocCastEffects } from './oocCastEffects.ts';
import { mulberry32, hashSeed } from '../core/rng.ts';
import type { GameState } from './types.ts';

export function applyGoSpellcasterCast(
  spellId: number,
  state: GameState,
  ds: DataStore,
  nowMs: number,
): { ok: true; teleportedTo?: string } | { ok: false; reason: string } {
  const raw = ds.spell(spellId);
  if (!raw) return { ok: false, reason: 'Unknown spell' };
  const spell = resolveCombatSpell(raw, { casterLevel: state.char.level });
  if (spell.effects.some((e) => e.kind === 'teleport')) {
    const row = ds.spellTeleports().find((t) => t.spell === spellId);
    if (!row || row.zone === state.char.zoneId) return { ok: true };
    state.instance = null;
    state.char = { ...state.char, zoneId: row.zone, journey: undefined };
    return { ok: true, teleportedTo: row.zone };
  }
  const applied = applyOocCastEffects({
    spellId,
    spell,
    char: state.char,
    inventory: state.inventory,
    ds,
    now: nowMs,
    alreadyStealthed: false,
    log: () => {},
    rng: mulberry32(hashSeed(state.rngSeed, state.fightCounter++)),
  });
  state.char = applied.char;
  state.inventory = applied.inventory;
  return { ok: true };
}
