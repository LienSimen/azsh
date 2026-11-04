// PURE: no DOM/RNG/Date. Per-class rotation hook contract.

import type { DataStore } from '../../../data/dataStore.ts';
import type { SpellDef } from '../../../data/schema.ts';
import type { Character } from '../../character/character.ts';
import type { Inventory } from '../../items/inventory.ts';
import type { SpellBook } from '../../character/spellbook.ts';
import type { SuggestionClassKey } from '../rotationSuggestions.ts';
import type { RotationPhase, RotationRule } from '../types.ts';

/** Mutable build state passed to class post-passes. */
export interface FinalizeContext {
  char: Character;
  ds: DataStore;
  sb: SpellBook;
  inventory?: Inventory;
  /** primarySpec result for this build. */
  spec: string;
  classKey: SuggestionClassKey;
  known: readonly SpellDef[];
  knownById: Map<number, SpellDef>;
  phases: Record<RotationPhase, RotationRule[]>;
  usedSpellsByPhase: Record<RotationPhase, Set<number>>;
  usedItemsByPhase: Record<RotationPhase, Set<number>>;
  /** Next fallback rule id (`f0`, `f1`, …). */
  nextFallbackId: () => string;
  /** Which fight this list is for. A post-pass that injects PvE utility must not fire on `pvp`. */
  mode?: 'pvp';
}

// Optional per-class hooks. Shared pipeline calls these; missing methods are no-ops / allow-all.
// Class-scoped rotation fixes should land in `classes/<class>.ts`, not build.ts.
export interface ClassRotationHooks {
  // Role-bucket FALLBACK filter for damage-role spells (cross-kit guard). Called only after shared utility
  // allow-list (interrupts, heals, …) passes. Default: allow.
  allowFallbackSpell?(spell: SpellDef, spec: string): boolean;

  // Whether a `role === 'form'` spell may appear in the fallback for this spec. Default: allow (warriors
  // any stance tree). Druid: Feral only.
  allowFormFallback?(spec: string): boolean;

  // After authored suggestion rows materialize, before role-bucket tail. Paladin: seal collapse + Judgement
  // gate (first pass).
  afterSuggestion?(ctx: FinalizeContext): void;

  // A known spell another known spell replaces, so the shared injects must not add it back.
  // Paladin: Divine Protection once Divine Shield is trained (shared Forbearance). Default: none.
  supersededSpell?(spell: SpellDef, ctx: FinalizeContext): boolean;

  // After role-bucket tail + shared interrupt hoist. Hunter Auto Shot primary, mage PoM, paladin
  // re-finalize, etc.
  afterFallback?(ctx: FinalizeContext): void;
}

/** Rebuild used-id sets for one phase after a finalizer drops/rewrites rules. */
export function rebuildPhaseUsed(ctx: FinalizeContext, phase: RotationPhase): void {
  ctx.usedSpellsByPhase[phase].clear();
  ctx.usedItemsByPhase[phase].clear();
  for (const r of ctx.phases[phase]) {
    if (r.action.kind === 'spell') ctx.usedSpellsByPhase[phase].add(r.action.spellId);
    else if (r.action.kind === 'item') ctx.usedItemsByPhase[phase].add(r.action.itemEntry);
  }
}
