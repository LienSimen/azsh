// A companion's action provider as PLAIN DATA (PERF-RUNSHEET S6b). `companionActionProvider` closes
// over a live `Companion` and two ds lookups; none of that survives a `postMessage`, and the worker
// has to build the same brain from something it can be handed.

import type { Rotation } from '../rotation/types.ts';
import type { AllyActionProvider } from '../../engine/combat/types.ts';
import type { SpellDef } from '../../data/schema.ts';
import { companionActionProvider } from './companionRotation.ts';
import { isMultiTargetCombatSpell } from '../rotation/classify.ts';
import { isCompanionKeepUpSpell } from './companionRotation.ts';

/** Everything `buildActionProvider` needs, all of it structured-cloneable. */
export type ActionProviderSpec = {
  rotation: Rotation;
  /** Boss entry the encounter rows are looked up for, when there is one. */
  targetEntry?: number;
  // The PLAYER's two knobs, fixed for the fight (combatSession.ts autoCfgForPlayer). A companion's
  // arrive per tick instead and are never here.
  aoeMode?: 'aoe' | 'single' | 'auto';
  offHealAllowed?: boolean;
};

/** The one ds-shaped dependency: a spell by id. A worker supplies its own. */
export type ProviderSpells = { spell: (id: number) => SpellDef | undefined };

// Build the brain from the spec plus a spell store. The AoE and off-heal knobs are NOT here: they
// change mid-fight, so they arrive per tick as `SimTickInputs.companionKnobs` and the engine stamps them.
export function buildActionProvider(
  spec: ActionProviderSpec,
  ds: ProviderSpells,
): AllyActionProvider {
  return companionActionProvider(spec.rotation, spec.targetEntry, {
    ...(spec.aoeMode != null ? { aoeMode: spec.aoeMode } : {}),
    ...(spec.offHealAllowed != null ? { offHealAllowed: spec.offHealAllowed } : {}),
    isMultiSpell: (id) => isMultiTargetCombatSpell(ds.spell(id)),
    isOocKeepUp: (id) => isCompanionKeepUpSpell(ds.spell(id)),
  });
}
