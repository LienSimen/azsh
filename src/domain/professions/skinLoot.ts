// Skinning yield from a corpse's baked skinning_loot_template.
// Profession skill-up / knife stay on the gather path; this is the hide table only.

import type { DataStore } from '../../data/dataStore.ts';
import type { Rng } from '../../engine/core/rng.ts';
import type { LootDrop, LootRollContext } from '../items/loot.ts';
import { rollLoot } from '../items/loot.ts';
import { rollGather } from './professions.ts';

/** One roll of this creature's skinning table. Empty when the corpse is not skinnable. */
export function rollCreatureSkinLoot(
  ds: DataStore,
  creatureEntry: number,
  rng: Rng,
  lootCtx?: LootRollContext,
): LootDrop[] {
  const nodeId = ds.skinNode(creatureEntry);
  if (nodeId == null) return [];
  const node = ds.gatherNode(nodeId);
  if (!node || node.skill !== 'skinning') return [];
  const key = node.source === 'skinning' && node.sourceId != null
    ? `skinning:${node.sourceId}`
    : null;
  const table = key != null ? ds.lootTable(key) : [];
  if (table.length) return rollLoot(table, rng, lootCtx);
  return rollGather(node, rng);
}
