// ---- Instances / dungeons (Phase 5) ---------------------------------------

export type EncounterKind = 'trash' | 'boss' | 'object' | 'rare' | 'entrance' | 'exit';

// One stop inside a dungeon, trash or boss. `pack` makes it a real multi-enemy pull through the
// engine's N-enemy path, and `events` is the DSL for death-summons, waves, gates and flags.
export interface EncounterDef {
  id: string;                // unique within its instance
  name: string;              // display name of the pull ("Rhahk'zor")
  kind: EncounterKind;
  creatureEntry: number;     // the primary CreatureDef fought
  bossSpells?: number[];     // ability spell ids the boss can cast (boss mechanics)
  intro?: string;            // optional flavor shown before engaging
  // Which wing of its instance this encounter is in. Naxxramas ships ten ZoneMusic sets while
  // DUNGEON_MUSIC is keyed by instance, so nine had no route. Not InstanceDef.wing, which splits maps.
  wing?: string;
  // Additional creatures pulled alongside the primary as one fight, crediting individually but
  // clearing only when the whole pull is dead. CSE slots use `poolCandidates` with count 1.
  pack?: EncounterPackMember[];
  // When the primary is itself a CSE spawn slot (entry 0 in creature table), candidates from survey/DB.
  // Placeholder `creatureEntry` is candidates[0].
  poolCandidates?: number[];
  // Cluster centroid or world point from pack-clusters.json. Combat seeds multi-enemy positions
  // from origin plus per-guid member coords; `z` is carried for floorplan stacking only.
  origin?: { x: number; y: number; z?: number };
  // Named WMO room this pack's centroid falls in: `roomId` is `${mapId}/${slug}` and `roomName` is
  // the WMOAreaTable name verbatim. Absent when it sits in no named room — never nearest-snapped.
  roomId?: string | null;
  roomName?: string | null;
  // True when this pull sits under open sky, gating SPELL_ATTR_ONLY_OUTDOORS. Absent ⇒ outdoors,
  // which is the core's own default when a point has no WMO. Cite: GridMap.cpp:886-903.
  outdoors?: boolean;
  // Optional patrol / scripted path (creature_movement waypoints). W5 populates the 22 patrol encounters;
  // planar consumers ignore z.
  path?: { x: number; y: number; z?: number }[];
  // Source spawn guids for this pull after boss/rare strip. Used with origin to place enemies at real
  // relative cluster coords (static seed); missing → synthetic slots.
  spawnGuids?: number[];
  // Optional encounter-event DSL (Wave-1 D-4 primitives). See `EncounterEvent`. Evaluated by pure helpers
  // in `world/instances.ts`; wired in `engine/game.ts`.
  events?: EncounterEvent[];
  // Quest whose accept/active-log state starts this encounter (dbscripts_on_quest_start). The autopilot
  // must not target it unless that quest is open in the party's log.
  startQuestId?: number;
  // Tribute / optional bosses: an uncleared optional prefix does not block later encounters, and
  // isComplete ignores them. Cite: instance_dire_maul.cpp:507-515 counts the guards ALIVE.
  optional?: boolean;
}

// One authored pack row, the same shape as EncounterDef.pack members, used by waves and
// HP-threshold spawns. `poolCandidates` is CSE one-slot-per-guid and count must be 1.
export type EncounterPackMember = {
  creatureEntry: number;
  count: number;
  poolCandidates?: number[];
};

// The encounter event DSL: `onDeathSummon` chains a follow-up phase, `waves` are player-paced
// staged pulls, `hpThreshold` fires at an HP percent, and requiresFlag/setsFlag/objectGate gate.
export type EncounterEvent =
  | { kind: 'onDeathSummon'; creatureEntry: number; bossSpells?: number[] }
  | { kind: 'waves'; waves: { pack: EncounterPackMember[] }[] }
  | {
      kind: 'hpThreshold';
      /** Fire when primary HP% is ≤ this value (0–100). */
      pct: number;
      /** Default true — fire at most once per run/encounter. */
      once?: boolean;
      /** Adds to spawn when the threshold fires (Wave-1: phase-chain after primary). */
      spawn?: EncounterPackMember[];
      /** Optional phase id recorded on the run as flag `phase:<phase>` when fired. */
      phase?: number;
    }
  | { kind: 'requiresFlag'; flag: string }
  | { kind: 'setsFlag'; flag: string }
  | {
      kind: 'objectGate';
      /** Primary / representative GO entry (always pin + match). */
      goEntry: number;
      // All GO entries that count toward this gate (BRD vault doors, ST statues). Absent ⇒ only `goEntry`.
      // Multi-entry: each entry counts at most once.
      goEntries?: number[];
      // Uses required before `setsFlag` is set. Default 1 (single-use gates unchanged). May be ≤
      // `goEntries.length` (e.g. Strat 3-of-6 postboxes).
      needUses?: number;
      /** Item entry required in inventory; consumed per successful use when spellcharges_1 < 0, kept at 0. Cite: Spell.cpp:4209 TakeCastItem. */
      requiredItem?: number;
      setsFlag: string;
      /** Default true — second use is a no-op once `setsFlag` is present. */
      once?: boolean;
    };

// A lootable instance GO (chest / quest object) surfaced as a walk-and-use pin. Position, name and
// lootId come from the baked GO rows; looted-once state is the run flag `go-looted:<guid>`.
export type LootObjectDef = {
  goEntry: number;
  /** Hidden until this run flag is set (Chest of The Seven after the tomb event). */
  revealedByFlag?: string;
  /** Item entry that must be in inventory to open (key). */
  requiredItem?: number;
};

// An instanced dungeon whose entrance portal lives in `portalZone`. Encounters clear in listed
// order, and `lockoutMs` is 0 for the freely-resettable 5-man loop.
export interface InstanceDef {
  id: string;
  name: string;
  // Classic map id (Map.dbc / creature.map). Required for dungeon-map projection and shared-map wing
  // partition. 26 InstanceDefs → 19 distinct mapIds. Cite: cluster-dungeon-packs.mjs DUNGEONS; dmapfid W2.
  mapId: number;
  // Shared-map wing key when multiple InstanceDefs share one mapId (SM gy/lib/arm/cat, BRS lbrs/ubrs, Strat
  // live/undead, Dire Maul east/west/north). Absent on single-instance maps.
  wing?: string;
  portalZone: string;        // world zone id where the entrance is found
  // areatrigger_teleport id of the entrance when the zone match cannot find it: BWL (3726) and MC's
  // bridge (2886) sit INSIDE another instance map. Naxx is 4055; 4156 is the in-instance lair pad.
  entranceTriggerId?: number;
  minLevel: number;          // level required to enter
  // instance_template.maxPlayers — the sourced group size. Absent means 5. Drives how many companions walk
  // the run (squad.ts maxCompanionsFor). Cite: cmangos-classic/sql/base/mangos.sql:2545-2577.
  maxPlayers?: number;
  levelRange: [number, number];
  /** Optional. No invented brochure text - omit or leave empty (AI.md §1b). */
  description?: string;
  lockoutMs: number;         // 0 = freely resettable; >0 = timed lockout
  encounters: EncounterDef[];
  quests?: number[];         // dungeon quest entries offered at the entrance
  /** Lootable chests / quest objects the floor should surface (baked GO rows by entry). */
  lootObjects?: readonly LootObjectDef[];
  /**
   * Where the party stands on entry, for an instance that is QUEUED rather than walked into and so
   * has no areatrigger to read. Alterac Valley's two wings are the case: BattleGroundAV seats each
   * side at its own gate, and without this `entranceWorld` falls through to the first encounter's
   * origin — which is the enemy captain, on the far side of the valley.
   */
  partyStart?: { x: number; y: number; z?: number };
  // In-instance teleporters (Naxx wing returns / Frostwyrm pad). Dest always from areatrigger_teleport via
  // `areatriggerId` — never hand-typed arrivals.
  teleporters?: readonly InstanceTeleporterDef[];
}

// Clickable in-instance teleporter. Arrival is `areatriggerTeleports` row `areatriggerId`. GO portals
// supply `goEntry`; areatrigger-only pads supply `src` (AreaTrigger.dbc stand).
export type InstanceTeleporterDef = {
  /** Baked gameobject entry to click. Omit for areatrigger-only pads. */
  goEntry?: number;
  /** areatrigger_teleport id — targetX/Y/Z is the arrival. */
  areatriggerId: number;
  /** Pin stand when there is no GO. Cite AreaTrigger.dbc for the trigger's own x/y/z. */
  src?: { x: number; y: number; z?: number };
  /** Encounter ids that must be cleared before the portal accepts a click. */
  requiresCleared?: readonly string[];
  /** Display name override; GO bake name wins when goEntry is set. */
  name?: string;
};
