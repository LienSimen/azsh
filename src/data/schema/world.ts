import type { PrimaryStats } from './primitives.ts';

// ---- Character creation & progression tables ------------------------------

export interface CreateInfoDef {
  race: number;
  cls: number;
  startZone: string; // zone id the character begins in (data-driven, not hardcoded)
  spells: number[];
  items: { item: number; amount: number }[];
  // Starting combat/class skills from playercreateinfo_skills (skill id + step). Expanded for this
  // race/class at bake. Absent on pre-skill bakes → newGameState still grants defense + unarmed defaults.
  skills?: { skill: number; step: number }[];
}
export interface LevelStatRow {
  race: number;
  cls: number;
  level: number;
  stats: PrimaryStats;
}
export interface ClassLevelRow {
  cls: number;
  level: number;
  baseHp: number;
  baseMana: number;
}
export interface XpRow {
  level: number;
  toNext: number;
}

// ---- Races / factions -----------------------------------------------------

/** The two warring factions. A race belongs to exactly one; a zone may be `contested`. */
export type Faction = 'alliance' | 'horde';

// A playable race. `classes` is the race/class restriction matrix from playercreateinfo, and
// `faction` is DERIVED — the character stores only `race`, so no save state duplicates it.
export interface RaceDef {
  id: number;
  name: string;
  faction: Faction;
  startZone: string;         // zone id a new hero of this race begins in
  city: string;              // faction capital (display flavor)
  classes: number[];         // class ids this race may roll (the restriction matrix)
  racials: number[];         // racial-ability spell ids
  /** FactionTemplate.dbc id for this race (ChrRaces.FactionID) — the player's reaction template.
   *  Baked by enrich-faction-template.mjs; absent on pre-faction bundles. Cite: Player.cpp getFactionForRace. */
  factionTemplate?: number;
  // Default-known TaxiNodes.dbc ids (ChrRaces.startingTaxiMask): Night Elf → [26, 27].
  // Cite: Player.cpp:295-301 PlayerTaxi::InitTaxiNodes. Absent on older bundles.
  startingTaxiNodes?: number[];
}

// ---- Zones / world --------------------------------------------------------

/** The two playable continents; backs the interactive world map (one webp backdrop each). */
export type Continent = 'azeroth' | 'kalimdor';

// One outdoor creature placement from the Classic `creature` table, baked onto zones with
// attributed huntable spawns. Absent `spawns` means hunt stays list-only; never invent coordinates.
export interface CreatureSpawnPos {
  entry: number;             // creature_template.Entry
  map: number;               // continent/instance map id
  x: number;                 // yards (position_x)
  y: number;                 // yards (position_y)
}

export interface ZoneDef {
  id: string;
  name: string;
  /** Optional. Never invent brochure blurbs - AreaTable has names only (AI.md §1b). */
  description?: string;
  levelRange: [number, number];
  quests: number[];          // quest entries offered here
  huntable: number[];        // creature entries grindable here
  trainers: { cls: number; entry: number }[]; // class trainer(s) present in the zone
  /** Weapon master NPC trainer entries (TrainerType=2) in this zone. Optional. */
  weaponTrainers?: number[];
  // Hunter Pet Trainer entries (TrainerType=3) spawned in this zone, attributed by WorldMapArea
  // zone rects with city rects decisive. Baked by enrich-pet-training.mjs. Optional.
  petTrainers?: number[];
  vendors?: number[];        // vendor entries present in the zone (optional; absent => none)
  nodes?: number[];          // gather-node ids harvestable here (mining/herb/fishing)
  profTrainers?: number[];   // profession-trainer entries present in the zone
  faction?: Faction | 'contested'; // controlling side (absent => neutral/contested)
  neighbors: string[];       // zone ids reachable by (instant) travel
  music?: string;            // zone music playlist key (baked by seed-zone-music.mjs)
  ambience?: string;         // environmental ambient loop key (birds/wind/water etc). Baked from AreaTable.AmbienceID + SoundAmbience. See seed-zone-ambient.mjs + seed-audio.mjs
  map?: string;              // optional same-origin webp url for the zone's map image (see seed-maps.mjs)
  continent?: Continent;     // which continent this zone sits on (EK vs Kalimdor filter; seed-zone-map.mjs)
  mapPos?: [number, number]; // normalized [x, y] (0..1, top-left) on the HQ combined terrain map (hq-azeroth.webp)
  objects?: number[];        // GameObject entries present/spawned in zone (Wave 3 / Item 4; may be absent until spawn enrichment)
  // SpellFocusObject.dbc ids a crafter can reach in this zone, from the GAMEOBJECT_TYPE_SPELL_FOCUS
  // spawns in it. ZONE granularity: outside a session there is no in-zone position to measure from.
  craftingFocus?: number[];
  // Sourced spawn placements for huntable mobs in this zone. When present, spatial pull uses
  // GetAttackDistance against these points; when absent, attackDistance on hunt is metadata only.
  spawns?: CreatureSpawnPos[];
  // Innkeeper NPCs spawned in this zone (NpcFlags & INNKEEPER, zone-attributed like vendors).
  // Absent = no inn here, or a pre-enrichment bake, and consumers fail open.
  innkeepers?: { entry: number; name: string }[];
  // Riding-trainer NPC entries (TrainerType=1) spawned in this zone, attributed like petTrainers
  // by WorldMapArea rects with city rects decisive. Baked by enrich-mounts.mjs. Optional.
  ridingTrainers?: number[];
  // Primary AreaTable.dbc id for this zone, the quest-slice key. Lets DBC-keyed enrichers join
  // zones without re-copying the slice table. Baked by extract.mjs + enrich-zone-capitals.mjs.
  areaId?: number;
  // AreaTable.dbc area_level for this zone's primary areaId, used for exploration XP scaling.
  // 0 is a real DBC value for many outdoor zones; absent means the CSV was missing.
  areaLevel?: number;
  // True when the zone's AreaTable.dbc flags carry AREA_FLAG_CAPITAL (0x100) — the six capitals.
  // CITY-rate rest keys off this. Cite: DBCEnums.h:69; MiscHandler.cpp:710-717.
  capital?: boolean;
  // AreaTable.dbc flags for this zone's primary areaId (field 4). Cite: DBCStructure.h
  // AreaTableEntry.flags; Conditions.cpp:254 AREA_FLAG.
  flags?: number;
  // Flight-master NPCs spawned in this zone (NpcFlags & UNIT_NPC_FLAG_FLIGHTMASTER 0x8),
  // spawn-attributed exactly like innkeepers. Taxi gossip surfaces hang off these.
  flightMasters?: { entry: number; name: string }[];
  // Base fishing skill required for the zone (skill_fishing_base_level.skill for areaId).
  // Absent means unbaked or no row. Cite: skill_fishing_base_level entry=areaId.
  zoneSkill?: number;
}
