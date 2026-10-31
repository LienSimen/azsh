// Instanced-dungeon content merged into the committed bundle at boot by `withDungeons()`. Creatures,
// items, loot and quests for real dungeons come from the bake, not from placeholders here.

import type {
  DataBundle, CreatureDef, ItemDef, LootTableDef, QuestDef, SpellDef, InstanceDef,
} from './schema.ts';
import { DUNGEON_INSTANCES } from './dungeons/index.ts';

export interface DungeonContent {
  instances: InstanceDef[];
  /** @deprecated Empty — dungeon creatures are in the bake. Kept for API stability. */
  creatures: CreatureDef[];
  /** @deprecated Empty — dungeon items are in the bake. */
  items: ItemDef[];
  /** @deprecated Empty — dungeon loot is in loot-data.json. */
  loot: LootTableDef[];
  /** @deprecated Empty — dungeon quests are in the bake. */
  quests: QuestDef[];
  /** @deprecated Empty — boss spells are in spell-data / creature.spells. */
  spells: SpellDef[];
}

/** Registry instances only; no synthetic creatures/items/spells/quests. */
export const DUNGEON_CONTENT: DungeonContent = {
  instances: DUNGEON_INSTANCES,
  creatures: [],
  items: [],
  loot: [],
  quests: [],
  spells: [],
};

// Merge authored dungeon instance graphs into a data bundle, called at boot before the DataStore is
// built. Does not re-inject placeholder creatures — real dungeon NPCs already live in the bake.
export function withDungeons(b: DataBundle): DataBundle {
  return {
    ...b,
    instances: [...(b.instances ?? []), ...DUNGEON_INSTANCES],
  };
}

export { DUNGEON_INSTANCES } from './dungeons/index.ts';
