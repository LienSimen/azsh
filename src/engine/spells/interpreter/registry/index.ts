// The scripted-spell registry: merge the packs and dispatch the dummy and script effects. Lookup is by
// exact id, then family and icon matchers, so a rank table cannot leave later ranks dead.

import type { RawSpellEffect, SpellDef } from '../../../../data/schema.ts';
import type {
  RegistryHandler,
  RegistryMatcher,
  RegistryPack,
  RegistryState,
} from './types.ts';
import { lifeTapPack } from './packs/life-tap.ts';
import { paladinPack } from './packs/paladin.ts';
import { classAbilitiesPack } from './packs/class-abilities.ts';
import { shamanPack } from './packs/shaman.ts';
import { exWaveMPack } from './packs/ex-wave-m.ts';
import { dummyScriptTailPack } from './packs/dummy-script-tail.ts';
import { direMaulPack } from './packs/dire-maul.ts';
import { raidScriptSummonsPack } from './packs/raid-script-summons.ts';
import { raidThreatWipePack } from './packs/raid-threat-wipe.ts';
import { si4DummyGenericAPack } from './packs/si4-dummy-generic-a.ts';
import { si4DummyGenericBPack } from './packs/si4-dummy-generic-b.ts';
import { si4DummyGenericCPack } from './packs/si4-dummy-generic-c.ts';
import { si4DummyWarriorPack } from './packs/si4-dummy-warrior.ts';
import { si4DummyHunterPack } from './packs/si4-dummy-hunter.ts';
import { si4ScriptGenericAPack } from './packs/si4-script-generic-a.ts';
import { si4ScriptGenericBPack } from './packs/si4-script-generic-b.ts';
import { si4ScriptGenericCPack } from './packs/si4-script-generic-c.ts';

export type {
  RegistryHandler,
  RegistryMatcher,
  RegistryPack,
  RegistryState,
} from './types.ts';
export { effectBaseAmount, truncTowardZero } from './helpers.ts';
export { LIFE_TAP_MANA_SPELL_ID, PLAGUEHEART_LIFE_TAP_SPELL_ID } from './packs/life-tap.ts';
export { JUDGEMENT_SPELL_ID } from './packs/paladin.ts';
export {
  ICE_LOCK_TRAP_SPELL_ID,
  ICE_LOCK_STUN_SPELL_ID,
  NPC_GUARD_SLIPKIK,
  FACTION_OGRE,
} from './packs/dire-maul.ts';
export { LAST_STAND_SPELL_ID, LAST_STAND_BUFF_SPELL_ID } from './packs/class-abilities.ts';
export {
  CREATE_HEALTHSTONE_SPELL_IDS,
  SOUL_LINK_SPELL_ID,
  SOUL_LINK_PET_AURA_SPELL_ID,
  TAME_BEAST_DUMMY_SPELL_ID,
  TAME_BEAST_FINAL_SPELL_ID,
  healthstoneItemType,
  improvedHealthstoneRankFromTalents,
  IMPROVED_HEALTHSTONE_RANK1_SPELL_ID,
  IMPROVED_HEALTHSTONE_RANK2_SPELL_ID,
} from './packs/dummy-script-tail.ts';

// Packs pre-imported so later work only edits pack files and tests. A later pack overrides an earlier
// one on the same id, and matchers are tried in reverse pack order so overrides win.
const PACKS: readonly RegistryPack[] = [
  lifeTapPack,
  paladinPack,
  classAbilitiesPack,
  shamanPack,
  exWaveMPack,
  dummyScriptTailPack,
  direMaulPack,
  raidScriptSummonsPack,
  raidThreatWipePack,
  si4DummyGenericAPack,
  si4DummyGenericBPack,
  si4DummyGenericCPack,
  si4DummyWarriorPack,
  si4DummyHunterPack,
  si4ScriptGenericAPack,
  si4ScriptGenericBPack,
  si4ScriptGenericCPack,
];

function mergeHandlers(
  pick: (p: RegistryPack) => Readonly<Record<number, RegistryHandler>> | undefined,
): Map<number, RegistryHandler> {
  const map = new Map<number, RegistryHandler>();
  for (const pack of PACKS) {
    const handlers = pick(pack);
    if (!handlers) continue;
    for (const [idStr, handler] of Object.entries(handlers)) {
      map.set(Number(idStr), handler);
    }
  }
  return map;
}

function mergeMatchers(
  pick: (p: RegistryPack) => readonly RegistryMatcher[] | undefined,
): RegistryMatcher[] {
  // Reverse so later packs win on first match.
  const out: RegistryMatcher[] = [];
  for (let i = PACKS.length - 1; i >= 0; i--) {
    const list = pick(PACKS[i]!);
    if (list?.length) out.push(...list);
  }
  return out;
}

const DUMMY_BY_ID = mergeHandlers((p) => p.dummy);
const SCRIPT_BY_ID = mergeHandlers((p) => p.script);
const DUMMY_MATCHERS = mergeMatchers((p) => p.dummyMatchers);
const SCRIPT_MATCHERS = mergeMatchers((p) => p.scriptMatchers);

// 64-bit family-flag mask check. JS `&` is int32 and drops high bits (e.g. Flametongue Totem 0x400000000) —
// use BigInt. Cite: SpellFamilyFlags is uint64 in SpellEntry; SpellEffects.cpp IsFitToFamilyMask.
export function spellFamilyFlagsMatch(flags: number, mask: number): boolean {
  if (!(mask > 0) && mask !== 0) return false;
  return (BigInt(flags || 0) & BigInt(mask)) === BigInt(mask);
}

// True when every specified matcher field matches the spell. At least one of family / flags / icon must be
// set on the matcher.
export function matcherMatchesSpell(spell: SpellDef, m: RegistryMatcher): boolean {
  const hasKey =
    m.spellFamilyName != null || m.spellFamilyFlags != null || m.spellIconId != null;
  if (!hasKey) return false;
  if (m.spellFamilyName != null && ((spell.spellFamilyName ?? 0) | 0) !== (m.spellFamilyName | 0)) {
    return false;
  }
  if (m.spellIconId != null && ((spell.spellIconId ?? 0) | 0) !== (m.spellIconId | 0)) {
    return false;
  }
  if (m.spellFamilyFlags != null) {
    const flags = Number(spell.spellFamilyFlags ?? 0);
    if (!spellFamilyFlagsMatch(flags, Number(m.spellFamilyFlags))) return false;
  }
  return true;
}

function findMatcher(
  spell: SpellDef,
  matchers: readonly RegistryMatcher[],
): RegistryHandler | undefined {
  for (const m of matchers) {
    if (matcherMatchesSpell(spell, m)) return m.handler;
  }
  return undefined;
}

// The default for an unknown dummy or script: handled and empty, which is where the placeholder
// secondary slots on finishers land. Emit a zero-payload surface so the slot is not read as unhandled.
export function ensureHandledSurface(state: RegistryState): void {
  if (!(state.effects?.length) && !(state.intents?.length)) {
    state.effects.push({
      kind: 'script_handled_noop',
      spellId: state.spell.id | 0,
    } as never);
  }
}

function defaultHandledNoop(
  state: RegistryState,
  _raw: RawSpellEffect,
  _slot: number,
): boolean {
  // C++ EffectDummy/ScriptEffect fallthrough returns empty after the per-id switch.
  // Cite: SpellEffects.cpp EffectDummy / EffectScriptEffect empty defaults.
  ensureHandledSurface(state);
  return true;
}

// Dispatch the dummy effect: exact id, then the rank-generic matchers, then a handled no-op. It
// always returns true once the opcode is registered.
export function dispatchDummy(
  state: RegistryState,
  raw: RawSpellEffect,
  slot: number,
): boolean {
  const id = state.spell.id | 0;
  const handler =
    DUMMY_BY_ID.get(id)
    ?? findMatcher(state.spell, DUMMY_MATCHERS)
    ?? defaultHandledNoop;
  return handler(state, raw, slot);
}

// Dispatch the script effect: exact id, then the rank-generic matchers, then a handled no-op. It
// always returns true once the opcode is registered.
export function dispatchScript(
  state: RegistryState,
  raw: RawSpellEffect,
  slot: number,
): boolean {
  const id = state.spell.id | 0;
  const handler =
    SCRIPT_BY_ID.get(id)
    ?? findMatcher(state.spell, SCRIPT_MATCHERS)
    ?? defaultHandledNoop;
  return handler(state, raw, slot);
}

/** Test / diagnostics: registered dummy spell ids (exact-id maps only). */
export function registeredDummySpellIds(): number[] {
  return [...DUMMY_BY_ID.keys()].sort((a, b) => a - b);
}

/** Test / diagnostics: registered script spell ids (exact-id maps only). */
export function registeredScriptSpellIds(): number[] {
  return [...SCRIPT_BY_ID.keys()].sort((a, b) => a - b);
}

/** Test / diagnostics: dummy rank-generic matcher count. */
function registeredDummyMatcherCount(): number {
  return DUMMY_MATCHERS.length;
}

/** Test / diagnostics: script rank-generic matcher count. */
function registeredScriptMatcherCount(): number {
  return SCRIPT_MATCHERS.length;
}
