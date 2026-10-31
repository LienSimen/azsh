// KI-108: classic-db near-zero starter loot chances → peer median of the same quest mat. attachLoot
// applies it in place, never `{...compact}` (39 MB clone). Cite: creature_loot_template 708/769.

import type { CompactLoot, QuestDef } from './schema.ts';
import {
  sanitizeCompactLoot,
  questObjectiveItemIds,
} from '../dev/etl/lib/loot-chance-sanity.mjs';

/** Peer-median repair on compact loot before decode. Idempotent if already sane. */
export function applyLootChanceSanity(
  compact: CompactLoot,
  quests: Iterable<QuestDef>,
): CompactLoot {
  const list = [...quests];
  const allowed = list.length > 0 ? questObjectiveItemIds(list) : null;
  const { next } = sanitizeCompactLoot(compact as Record<string, unknown[]>, {
    allowedItems: allowed && allowed.size ? allowed : null,
  });
  return next as CompactLoot;
}
