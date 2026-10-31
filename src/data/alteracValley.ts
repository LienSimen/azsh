// Alterac Valley's map data, baked from the live world DB by core.battlegroundAv. World yards on
// map 30: the 15 capture nodes, the two mines, the commanders, and every spawn the event slots move.

import avJson from './tables/alteracValley.json' with { type: 'json' };

export type AvTeam = 'alliance' | 'horde';

export interface AvPoint {
  x: number;
  y: number;
  z: number;
}

export interface AvNodeRow {
  /** Slug of the node — stable across bakes, and the objective id BgWorld holds. */
  id: string;
  /** AVNodeIds ordinal. Cite: BattleGroundAV.h:207-226. */
  index: number;
  /** mangos_string 768-782 — the client's own label. */
  name: string;
  kind: 'graveyard' | 'tower';
  /** avNodeDefaults[i].initialOwner; null is Snowfall, the one neutral node. */
  owner: AvTeam | null;
  x: number;
  y: number;
  z: number;
  /** world_safe_locs id, absent on a tower. */
  graveyardId?: number;
  graveyard?: AvPoint;
}

export interface AvBodyRow {
  entry: number;
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface AvSlotRow {
  entry: number;
  name: string;
  count: number;
}

export interface AvMineRow {
  id: string;
  index: number;
  name: string;
  /** The chest players loot for supplies. Cite: BattleGroundAV.h:140-141. */
  supplyGo: number;
  quest: { alliance: number; horde: number };
  /** Killing the live leader hands the mine over. Cite: BattleGroundAV.cpp:104-113. */
  leader: { alliance: AvSlotRow | null; horde: AvSlotRow | null; neutral: AvSlotRow | null };
  /** event1 of the mine's trash slot — BG_AV_MINE_EVENT + mineId. */
  trashEvent: number;
  at?: AvPoint;
}

export interface AvCommanderRow extends Partial<AvBodyRow> {
  node?: string;
}

export interface AvQuestRow {
  id: number;
  /** m_teamQuestStatus slot this turn-in increments. Cite: BattleGroundAV.cpp:161-256. */
  slot: number;
  counter: string;
  team: AvTeam;
  title: string;
  item?: number;
  count?: number;
  killCredit?: number;
  step: number;
  teamRep: number;
}

export interface AvSpawnRow {
  guid: number;
  entry: number;
  name: string;
  x: number;
  y: number;
  z: number;
  o: number;
  event1?: number;
  event2?: number;
  movementType?: number;
  spawndist?: number;
  /** `creature_spawn_entry` roll: this slot can be any of these, and `entry` is the first. */
  candidates?: number[];
}

export interface AvObjectRow {
  guid: number;
  entry: number;
  name: string;
  x: number;
  y: number;
  z: number;
  event1?: number;
  event2?: number;
  /** `gameobject_spawn_entry` roll. `entry` is 0 on these — the pool decides at spawn. */
  candidates?: number[];
}

export interface AlteracValleyData {
  /** Always 'av' — the one row this table ships, and the key `noloss` joins on. */
  id: string;
  map: number;
  teamSize: number;
  minTeamSize: number;
  minLevel: number;
  maxLevel: number;
  startMaxDist: number;
  playerSkinRefLootId: number;
  start: Record<AvTeam, AvPoint | null>;
  nodes: AvNodeRow[];
  mines: AvMineRow[];
  commanders: {
    boss: Record<AvTeam, AvBodyRow | null>;
    captain: Record<AvTeam, AvBodyRow | null>;
    lieutenants: AvCommanderRow[];
    herald: AvBodyRow | null;
  };
  defenderTiers: Record<AvTeam, Array<{ tier: number; entry: number; name: string }>>;
  quests: AvQuestRow[];
  /** creature `LootId` → the AV quest-item rows on that table. */
  creatureLoot: Record<string, AvLootRow[]>;
  /** creature entry → its LootId, for the entries that carry a quest item at all. */
  lootIdOf: Record<string, number>;
  /** reference_loot_template 1 — what an enemy player's corpse carries. */
  playerLoot: AvLootRow[];
  spawns: AvSpawnRow[];
  objects: AvObjectRow[];
}

export interface AvLootRow {
  item: number;
  /** ChanceOrQuestChance — negative is a quest drop; the magnitude is the percent. */
  chance: number;
  min: number;
  max: number;
}

// The rule writes ONE entity ('av') with named fields, so the shipped table is a one-row array.
// Cite: rules/core/battleground-av.mjs writeEntity; table-shape.mjs ships unseen tables as arrays.
export const AV_DATA = (avJson as unknown as AlteracValleyData[])[0]!;

export const AV_NODES: readonly AvNodeRow[] = AV_DATA.nodes;
export const AV_MINES: readonly AvMineRow[] = AV_DATA.mines;
export const AV_QUESTS: readonly AvQuestRow[] = AV_DATA.quests;

/** One node by slug. */
export function avNode(id: string): AvNodeRow | undefined {
  return AV_NODES.find((n) => n.id === id);
}

/** Every spawn whose event slot is `event1`, optionally narrowed to one variant. */
export function avSpawnsForEvent(event1: number, event2?: number): AvSpawnRow[] {
  return AV_DATA.spawns.filter(
    (s) => s.event1 === event1 && (event2 == null || s.event2 === event2),
  );
}

/** The always-on field: wildlife, quest givers, base guards — no event slot owns them. */
export function avStaticSpawns(): AvSpawnRow[] {
  return AV_DATA.spawns.filter((s) => s.event1 == null);
}

/** The AV quest-item loot rows on one creature entry; empty when it carries none. */
export function avLootOf(entry: number): readonly AvLootRow[] {
  const lootId = AV_DATA.lootIdOf[String(entry)];
  if (lootId == null) return [];
  return AV_DATA.creatureLoot[String(lootId)] ?? [];
}
