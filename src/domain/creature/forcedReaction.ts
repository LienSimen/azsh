// SPELL_AURA_FORCE_REACTION (139) player state — the map every reaction check consults. Not a
// faction swap: it stores Faction.dbc id → rank, so one entry covers every matching template.

import type { DataStore } from '../../data/dataStore.ts';
import type { ForcedReactions } from './faction.ts';
import type { ReputationRank } from './reputation.ts';

/** Serialized form on the run (`faction id -> rank`), so it survives a save. */
export type ForcedReactionMap = Record<number, number>;

/** The `force_reaction` effects a spell carries, if any. */
export function forceReactionsOfSpell(
  ds: DataStore,
  spellId: number,
): { factionId: number; rank: ReputationRank }[] {
  const out: { factionId: number; rank: ReputationRank }[] = [];
  for (const eff of ds.spell(spellId)?.effects ?? []) {
    if (eff.kind !== 'force_reaction') continue;
    const factionId = (eff as { factionId?: number }).factionId ?? 0;
    if (!factionId) continue;
    const rank = ((eff as { reputationRank?: number }).reputationRank ?? 0) as ReputationRank;
    out.push({ factionId, rank });
  }
  return out;
}

// Build the forced map from the aura spells on the player. Highest rank wins when two auras name
// the same faction, since the C++ overwrite depends on an apply order a rebuilt set lacks.
export function forcedReactionsFrom(
  ds: DataStore,
  activeSpellIds: Iterable<number>,
): ForcedReactionMap {
  const map: ForcedReactionMap = {};
  for (const id of activeSpellIds) {
    for (const { factionId, rank } of forceReactionsOfSpell(ds, id)) {
      if (map[factionId] == null || rank > map[factionId]!) map[factionId] = rank;
    }
  }
  return map;
}

/** Read a persisted map back as the `ForcedReactions` the faction API takes. Empty → undefined. */
export function forcedReactionsOf(map: ForcedReactionMap | undefined): ForcedReactions | undefined {
  if (!map) return undefined;
  const out = new Map<number, ReputationRank>();
  for (const [k, v] of Object.entries(map)) out.set(Number(k), v as ReputationRank);
  return out.size ? out : undefined;
}
