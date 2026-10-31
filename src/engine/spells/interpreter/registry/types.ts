// SI4 scripted-spell registry types. Handlers keyed by spell id (and optional family keys), not by
// unfinished generics. Design: docs/archive/SPELL-INTERPRETER.md §2.3.

import type { RawSpellEffect, SpellDef, SpellEffect } from '../../../../data/schema.ts';
import type { InterpretContext, InterpretIntent, UnhandledSlot } from '../types.ts';

// Mutable interpreter state shared with EFFECT_HANDLERS. Structural subset of handlers.ts HandlerState
// (avoids circular import).
export interface RegistryState {
  spell: SpellDef;
  ctx: InterpretContext;
  effects: SpellEffect[];
  unhandled: UnhandledSlot[];
  intents: InterpretIntent[];
}

// A per-spell dummy or script handler, returning true when the slot is fully handled — an intentional
// no-op included. Cite: SpellEffects.cpp EffectDummy / EffectScriptEffect per-id cases.
export type RegistryHandler = (
  state: RegistryState,
  raw: RawSpellEffect,
  slot: number,
) => boolean;

// A rank-generic matcher, selecting a handler by family, flags or icon instead of a per-rank id table.
// Prefer it, so later ranks cannot die silently when only rank 1 was registered.
export interface RegistryMatcher {
  spellFamilyName?: number;
  spellFamilyFlags?: number;
  spellIconId?: number;
  handler: RegistryHandler;
}

// A pack of handlers for one family or batch. Prefer the rank-generic matchers, and keep id maps only
// where the C++ itself scripts specific ids, with the citation next to the id.
export interface RegistryPack {
  /** Pack id for diagnostics (not used in dispatch). */
  id: string;
  // The dummy effect by exact spell id, only where the C++ uses per-id cases.
  // Deprecated in favour of the rank-generic matchers.
  dummy?: Readonly<Record<number, RegistryHandler>>;
  /** SPELL_EFFECT_SCRIPT_EFFECT (77) by exact spell id — only when CMaNGOS uses per-id. */
  script?: Readonly<Record<number, RegistryHandler>>;
  /** Rank-generic DUMMY dispatch (family / flags / icon). Checked after exact id. */
  dummyMatchers?: readonly RegistryMatcher[];
  /** Rank-generic SCRIPT_EFFECT dispatch. Checked after exact id. */
  scriptMatchers?: readonly RegistryMatcher[];
}
