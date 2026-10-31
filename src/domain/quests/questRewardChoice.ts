// Quest pick-one rewards (RewChoiceItemId1..6). Auto Quest may stop for a manual pick or
// auto-select: the best equipment-helper upgrade, else the highest vendor value.

import type { DataStore } from '../../data/dataStore.ts';
import type { QuestDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import type { Inventory } from '../items/inventory.ts';
import type { EquipOpts } from '../items/equipment.ts';
import { findUpgrades } from '../items/equipmentHelper.ts';

/** How Auto Quest resolves multi-choice quest rewards. */
export type QuestRewardChoiceMode = 'wait' | 'auto';

/** Active pick-one rows (item id > 0). Empty = no choice UI / any index is fine. */
export function questRewardChoices(
  quest: QuestDef,
): ReadonlyArray<{ item: number; count: number }> {
  return (quest.rewChoiceItems ?? []).filter((c) => c.item > 0);
}

/** True when the player must pick among 2+ reward items. */
export function needsQuestRewardPick(quest: QuestDef): boolean {
  return questRewardChoices(quest).length > 1;
}

// Best 0-based index into `quest.rewChoiceItems` for auto-pick. Prefers the choice that findUpgrades scores
// as the strongest upgrade; if none is an upgrade, highest sellPrice × count. Ties keep the lower index.
export function pickQuestRewardIndex(
  quest: QuestDef,
  char: Character,
  inventory: Inventory,
  ds: DataStore,
  opts?: EquipOpts,
): number {
  const choices = quest.rewChoiceItems ?? [];
  if (choices.length === 0) return 0;

  let bestUpIdx = -1;
  let bestDelta = -Infinity;
  for (let i = 0; i < choices.length; i++) {
    const row = choices[i]!;
    if (!(row.item > 0)) continue;
    // Probe bag only — findUpgrades scores candidates already in inventory stacks.
    const probe: Inventory = {
      stacks: [...inventory.stacks, { item: row.item, count: Math.max(1, row.count | 0) }],
    };
    const hit = findUpgrades(char, probe, ds, opts).find((u) => u.entry === row.item);
    if (hit && hit.valueDelta > bestDelta) {
      bestDelta = hit.valueDelta;
      bestUpIdx = i;
    }
  }
  if (bestUpIdx >= 0) return bestUpIdx;

  let bestVendorIdx = 0;
  let bestVendor = -1;
  for (let i = 0; i < choices.length; i++) {
    const row = choices[i]!;
    if (!(row.item > 0)) continue;
    const sell = (ds.item(row.item)?.sellPrice ?? 0) * Math.max(1, row.count | 0);
    if (sell > bestVendor) {
      bestVendor = sell;
      bestVendorIdx = i;
    }
  }
  return bestVendorIdx;
}

// Auto Quest turn-in decision for a quest with pick-one rewards: one or fewer choices always take
// index 0, wait mode pauses for an in-HUD pick, and auto takes the upgrade or the vendor value.
export function resolveAutopilotRewardChoice(
  quest: QuestDef,
  mode: QuestRewardChoiceMode,
  char: Character,
  inventory: Inventory,
  ds: DataStore,
  opts?: EquipOpts,
): { kind: 'pick'; index: number } | { kind: 'wait' } {
  if (!needsQuestRewardPick(quest)) return { kind: 'pick', index: 0 };
  if (mode === 'wait') return { kind: 'wait' };
  return {
    kind: 'pick',
    index: pickQuestRewardIndex(quest, char, inventory, ds, opts),
  };
}
