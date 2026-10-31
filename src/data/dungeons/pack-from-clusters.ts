// DP1 — trash packs from CFH/Detection clusters (pack-clusters.json). Never invent entries or
// counts. JSON is imported rather than read with node:fs so this loads in the browser bundle.

import dungeonPacksJson from '../tables/dungeonPacks.json' with { type: 'json' };
import dungeonSurveyJson from '../tables/dungeonSurvey.json' with { type: 'json' };
import areatriggerTeleportsJson from '../tables/areatriggerTeleports.json' with { type: 'json' };
import nonCombatTrashJson from '../tables/nonCombatTrash.json' with { type: 'json' };
import dungeonRoomsJson from './dungeon-rooms.json' with { type: 'json' };
import { TECHNICAL_TRIGGER_ENTRIES } from '../../domain/creature/creatureTrigger.ts';
import type { EncounterDef, EncounterEvent, EncounterPackMember } from '../schema.ts';

// ---- Friendly / non-combat trash strip (faction-driven) ----
// A class rule, not id lists: a creature friendly to every standard player template is never trash.

let _nonCombatTrashEntries: ReadonlySet<number> | null = null;

// Creature entries no standard player may attack without declaring war — non-combat presence, not
// kill population. Baked from creatures.factionId × factionTemplates into nonCombatTrash.json.
export function nonCombatTrashEntries(): ReadonlySet<number> {
  if (_nonCombatTrashEntries) return _nonCombatTrashEntries;
  const raw = nonCombatTrashJson as { entries?: number[] };
  _nonCombatTrashEntries = new Set(raw.entries ?? []);
  return _nonCombatTrashEntries;
}

/** True when entry may appear as trash kill supply (or is unknown / fail-open). */
export function isCombatTrashEntry(entry: number): boolean {
  return !nonCombatTrashEntries().has(entry);
}

// ---- Types (pack-clusters.json) ---------------------------------------------

export type ClusterMember = {
  guid: number;
  entry: number;
  x: number;
  y: number;
  /** World z from creature.position_z (dmapfid W2). Planar combat seed ignores z. */
  z?: number;
};

export type ClusterPack = {
  map: number;
  packId: string;
  guids: number[];
  members: ClusterMember[];
  centroid: { x: number; y: number; z?: number };
  size: number;
};

/** One storey of Blackrock Spire is ~14 yd; 8 clears a ramp but not a floor. */
const PACK_FLOOR_DZ = 8;

// Where the pull actually happens: the centroid of the pack's LARGEST z-cluster. 336 of 1843 packs
// span storeys, and a between-floors mean sends the party to an empty floor (worst 78.5 yd).
export function modalFloorCentroid(
  members: readonly ClusterMember[],
  fallback: { x: number; y: number; z?: number },
): { x: number; y: number; z?: number } {
  const withZ = members.filter((m) => Number.isFinite(m.z));
  if (withZ.length < 2) return { ...fallback };
  const sorted = [...withZ].sort((a, b) => (a.z as number) - (b.z as number));
  const groups: ClusterMember[][] = [[sorted[0]!]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.z as number;
    const cur = sorted[i]!.z as number;
    if (cur - prev <= PACK_FLOOR_DZ) groups[groups.length - 1]!.push(sorted[i]!);
    else groups.push([sorted[i]!]);
  }
  // Not `fallback` on a single floor: that is the pack's UNFILTERED centroid, and the caller may
  // have dropped a whole wing's members. The origin is the centroid of the members carried here.
  let best = groups[0]!;
  for (const g of groups) {
    if (g.length > best.length) best = g;
    else if (g.length === best.length) {
      const dg = Math.hypot(
        g.reduce((a, m) => a + m.x, 0) / g.length - fallback.x,
        g.reduce((a, m) => a + m.y, 0) / g.length - fallback.y,
      );
      const db = Math.hypot(
        best.reduce((a, m) => a + m.x, 0) / best.length - fallback.x,
        best.reduce((a, m) => a + m.y, 0) / best.length - fallback.y,
      );
      if (dg < db) best = g;
    }
  }
  const n = best.length;
  return {
    x: best.reduce((a, m) => a + m.x, 0) / n,
    y: best.reduce((a, m) => a + m.y, 0) / n,
    z: best.reduce((a, m) => a + (m.z as number), 0) / n,
  };
}

// `packs` is the only field any caller reads; the survey's per-map name/slug/counters were
// measured unread and are not in the baked table.
export type ClusterMapData = {
  packs: ClusterPack[];
};

/** [guid, entry, x, y, z] — dungeonPacks.json memberFields. */
type PackedMember = [number, number, number, number, number | null];
/** [packId, cx, cy, cz, members]. `size` and `guids` are derived; the baker asserts they can be. */
type PackedPack = [string, number | null, number | null, number | null, PackedMember[]];

type PackClustersFile = {
  maps: Record<string, PackedPack[]>;
};

type SurveyDungeon = {
  map: number;
  census: Array<{
    entry: number;
    name?: string;
    pool?: boolean;
    poolCandidates?: number[];
    poolGuids?: number[];
  }>;
  bosses?: Array<{ entry: number; name?: string; pos?: (number | null)[] }>;
};

type SurveyFile = { maps: Record<string, SurveyDungeon> };

// ---- Loaders (baked tables — browser + node) --------------------------------
// bake-dungeon-packs.mjs projects docs/dungeons/survey/{pack-clusters,survey}.json down to the
// fields read here. Importing those raw made the browser parse 2.33 MB (minified) for eight
// mapId lookups; the tables are 0.60 MB, and packs decode one map at a time.

const packsFile = dungeonPacksJson as unknown as PackClustersFile;
const surveyFile = dungeonSurveyJson as unknown as SurveyFile;

/** mapId → rehydrated packs. Entering Deadmines decodes Deadmines, not the other 25 maps. */
const clusterMapCache = new Map<number, ClusterMapData>();

export function getClusterMap(mapId: number): ClusterMapData | undefined {
  const hit = clusterMapCache.get(mapId);
  if (hit) return hit;
  const rows = packsFile.maps?.[String(mapId)];
  if (!rows) return undefined;
  const packs: ClusterPack[] = rows.map(([packId, cx, cy, cz, packed]) => {
    const members: ClusterMember[] = packed.map(([guid, entry, x, y, z]) =>
      (z == null ? { guid, entry, x, y } : { guid, entry, x, y, z }));
    const centroid = cz == null
      ? { x: cx ?? 0, y: cy ?? 0 }
      : { x: cx ?? 0, y: cy ?? 0, z: cz };
    return {
      map: mapId,
      packId,
      guids: members.map((m) => m.guid),
      members,
      centroid,
      size: members.length,
    };
  });
  const out: ClusterMapData = { packs };
  clusterMapCache.set(mapId, out);
  return out;
}

export function getSurveyDungeon(mapId: number): SurveyDungeon | undefined {
  // Raids used to live in their own survey block with the same row shape; the bake merges both
  // into one map-keyed lookup, so surveyBossPos and friends still work on either unchanged.
  return surveyFile.maps?.[String(mapId)];
}

// ---- Named rooms (WMOAreaTable × VMAP groups) ----
// Committed bake dungeon-rooms.json. A pack belongs to the room its centroid falls in; no snap.

export type DungeonRoom = {
  id: string;
  name: string;
  areaId: number;
  rootWmoId: number;
  groupWmoIds: number[];
  model: string;
  /** XYZ min/max. `number[]`, not a 3-tuple: JSON imports infer arrays, and a tuple
   *  declaration made the whole dungeon-rooms.json cast incomparable. Read via `[x, y] =`. */
  bbox: { min: number[]; max: number[] };
};

// Mirrors dungeon-rooms.json's real top level; without these four keys the cast had no
// overlap with the imported literal type and tsc rejected it.
type DungeonRoomsFile = {
  generated: string;
  generator: string;
  sources: string[];
  notes: string[];
  maps: Record<
    string,
    { name: string; slug: string; models: string[]; rooms: DungeonRoom[] }
  >;
  unassigned: Record<string, { count: number; packIds: string[] }>;
  instances?: Record<
    string,
    { mapId: number; roomCount: number; unassignedPackCount: number; terrainOnly: boolean }
  >;
};

function loadRoomsFile(): DungeonRoomsFile {
  return dungeonRoomsJson as DungeonRoomsFile;
}

/** Named rooms for a classic dungeon map (empty when terrain-only / no WMO names). */
export function roomsForMap(mapId: number): readonly DungeonRoom[] {
  return loadRoomsFile().maps[String(mapId)]?.rooms ?? [];
}

/** Committed unassigned pack list for a map (centroid in no room). */
export function unassignedPacksForMap(mapId: number): { count: number; packIds: readonly string[] } {
  const u = loadRoomsFile().unassigned[String(mapId)];
  return u ? { count: u.count, packIds: u.packIds } : { count: 0, packIds: [] };
}

// Room whose plan-XY bbox contains `pos`, smallest area winning on overlap; a known z beats a
// stacked floor that only matches in plan. Undefined when the point is in no room — never snaps.
export function roomAtPosition(
  mapId: number,
  pos: { x: number; y: number; z?: number },
): DungeonRoom | undefined {
  const rooms = roomsForMap(mapId);
  if (!rooms.length) return undefined;
  const xyHits: DungeonRoom[] = [];
  for (const r of rooms) {
    const [x0, y0] = r.bbox.min;
    const [x1, y1] = r.bbox.max;
    if (pos.x < x0 || pos.x > x1 || pos.y < y0 || pos.y > y1) continue;
    xyHits.push(r);
  }
  if (!xyHits.length) return undefined;
  const z = pos.z;
  const zHits =
    z != null && Number.isFinite(z)
      ? xyHits.filter((r) => {
          const z0 = r.bbox.min[2];
          const z1 = r.bbox.max[2];
          return z0 != null && z1 != null && Number.isFinite(z0) && Number.isFinite(z1)
            && z >= z0 && z <= z1;
        })
      : [];
  const pool = zHits.length ? zHits : xyHits;
  let best: DungeonRoom | undefined;
  let bestArea = Infinity;
  for (const r of pool) {
    const [x0, y0] = r.bbox.min;
    const [x1, y1] = r.bbox.max;
    const area = (x1 - x0) * (y1 - y0);
    if (area < bestArea) {
      bestArea = area;
      best = r;
    }
  }
  return best;
}

// Resolve the named room for a pack centroid (or any world point), reusing the same spatial claim as
// packIdAtPosition / clusterSpatialCandidates.
export function roomForPack(
  mapId: number,
  pack: { centroid: { x: number; y: number; z?: number }; packId?: string },
): DungeonRoom | undefined {
  return roomAtPosition(mapId, pack.centroid);
}

// Guid → packId for a map's CFH/Detection clusters. Used so spatial pulls join by authored pack, not by raw
// radius overlap across neighbouring packs.
export function packIdByGuid(mapId: number): Map<number, string> {
  const out = new Map<number, string>();
  const map = getClusterMap(mapId);
  if (!map) return out;
  for (const pack of map.packs) {
    for (const g of pack.guids) out.set(g, pack.packId);
    for (const m of pack.members) out.set(m.guid, pack.packId);
  }
  return out;
}

// Resolve packId for a world point: nearest cluster member within `maxDistYd` (default 2 yards, so
// the same spawn), else nearest pack centroid within 5 yards. Undefined when unclaimed.
export function packIdAtPosition(
  mapId: number,
  pos: { x: number; y: number },
  maxDistYd = 2,
): string | undefined {
  const map = getClusterMap(mapId);
  if (!map?.packs.length) return undefined;
  let bestId: string | undefined;
  let bestD = maxDistYd;
  for (const pack of map.packs) {
    for (const m of pack.members) {
      const d = dist2d(pos, m);
      if (d <= bestD) {
        bestD = d;
        bestId = pack.packId;
      }
    }
  }
  if (bestId) return bestId;
  // Centroid fallback for encounter origins (centroid may sit slightly off members).
  let cBest: string | undefined;
  let cD = 5;
  for (const pack of map.packs) {
    const d = dist2d(pos, pack.centroid);
    if (d <= cD) {
      cD = d;
      cBest = pack.packId;
    }
  }
  return cBest;
}

// All static pack members on a map as spatial-pull candidates (with packId + z). Caller supplies level /
// detection / flags from the creature template.
export function clusterSpatialCandidates(
  mapId: number,
  creatureOf: (entry: number) =>
    | { level: number; detectionRange?: number; extraFlags?: number }
    | undefined,
): Array<{
  entry: number;
  x: number;
  y: number;
  z?: number;
  map: number;
  level: number;
  detectionRange?: number;
  extraFlags?: number;
  packId: string;
  guid: number;
}> {
  const map = getClusterMap(mapId);
  if (!map) return [];
  const out: Array<{
    entry: number;
    x: number;
    y: number;
    z?: number;
    map: number;
    level: number;
    detectionRange?: number;
    extraFlags?: number;
    packId: string;
    guid: number;
  }> = [];
  for (const pack of map.packs) {
    for (const m of pack.members) {
      if (!m.entry) continue;
      const cdef = creatureOf(m.entry);
      if (!cdef) continue;
      out.push({
        entry: m.entry,
        x: m.x,
        y: m.y,
        z: m.z,
        map: mapId,
        level: cdef.level,
        detectionRange: cdef.detectionRange,
        extraFlags: cdef.extraFlags,
        packId: pack.packId,
        guid: m.guid,
      });
    }
  }
  return out;
}

/** Largest authored cluster pack size on a map (0 when unknown). */
export function maxClusterPackSize(mapId: number): number {
  const map = getClusterMap(mapId);
  if (!map?.packs.length) return 0;
  let max = 0;
  for (const p of map.packs) if (p.size > max) max = p.size;
  return max;
}

/** guid → uniform CSE candidate list (survey census poolGuids / poolCandidates). */
export function loadPoolGuidCandidates(mapId: number): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const dung = getSurveyDungeon(mapId);
  if (!dung) return out;
  for (const row of dung.census ?? []) {
    if (!row.pool || !row.poolCandidates?.length || !row.poolGuids?.length) continue;
    const cands = [...row.poolCandidates];
    for (const g of row.poolGuids) {
      if (!out.has(g)) out.set(g, cands);
    }
  }
  return out;
}

/** entry → display name from survey census. */
export function loadEntryNames(mapId: number): Map<number, string> {
  const out = new Map<number, string>();
  const dung = getSurveyDungeon(mapId);
  if (!dung) return out;
  for (const row of dung.census ?? []) {
    if (row.name) out.set(row.entry, row.name);
  }
  for (const b of dung.bosses ?? []) {
    if (b.name) out.set(b.entry, b.name);
  }
  return out;
}

export function dist2d(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// ---- Survey boss positions + areatrigger entrances (no hand-typed coords) ----

export type WorldPoint = { x: number; y: number; z?: number };

// Survey boss avg position for (mapId, creature entry). Source: survey.json bosses[].pos (creature static
// avg on that map). Returns undefined when pos is null/missing.
export function surveyBossPos(mapId: number, entry: number): WorldPoint | undefined {
  const dung = getSurveyDungeon(mapId);
  if (!dung?.bosses) return undefined;
  for (const b of dung.bosses) {
    if (b.entry !== entry) continue;
    const pos = b.pos;
    if (!pos || pos[0] == null || pos[1] == null) return undefined;
    const pt: WorldPoint = { x: Number(pos[0]), y: Number(pos[1]) };
    if (pos[2] != null && Number.isFinite(Number(pos[2]))) pt.z = Number(pos[2]);
    return pt;
  }
  return undefined;
}

type AreatriggerTeleportRow = {
  id: number;
  name?: string;
  targetMap: number;
  targetX: number;
  targetY: number;
  targetZ?: number;
};

// Per-instance areatrigger teleport id for the real dungeon entrance, from areatriggerTeleports.json.
// Multi-wing maps pick the wing-specific trigger; LBRS and UBRS share Blackrock Spire's.
export const INSTANCE_ENTRANCE_TRIGGER: Readonly<Record<string, number>> = {
  'ragefire-chasm': 2230,
  'wailing-caverns': 228,
  deadmines: 78,
  'shadowfang-keep': 145,
  'blackfathom-deeps': 257,
  'the-stockade': 101,
  gnomeregan: 324, // main Gnomeregan entrance (train depot is 523)
  'razorfen-kraul': 244,
  'sm-graveyard': 45,
  'sm-library': 614,
  'sm-armory': 612,
  'sm-cathedral': 610,
  'razorfen-downs': 442,
  uldaman: 286,
  'zul-farrak': 924,
  maraudon: 3134, // Purple entrance (single InstanceDef covers both sides)
  'sunken-temple': 446,
  'blackrock-depths': 1466,
  lbrs: 1468,
  ubrs: 1468, // same physical BRS portal; seal is a separate gate
  'dire-maul-east': 3183,
  'dire-maul-west': 3186,
  'dire-maul-north': 3189,
  scholomance: 2567,
  'stratholme-live': 2216, // left front (scarlet/live)
  'stratholme-undead': 2214, // service/back door
  // Raids (docs/archive/raids/PLAN.md §1). MC uses the searinggorge window 3528, not the
  // ungated BRD bridge 2886 — the bridge is the walk-in residual, not the product entry.
  'onyxias-lair': 2848,
  'molten-core': 3528,
  'zul-gurub': 3928,
  'blackwing-lair': 3726,
  'ruins-of-ahnqiraj': 4008,
  'temple-of-ahnqiraj': 4010,
  // 4055, not 4156: 4156's own AreaTrigger.dbc map is 533 (the in-instance Frostwyrm Lair
  // teleporter). It is the only trigger of the 33 whose map equals its targetMap.
  naxxramas: 4055,
};

// Extra world doors on the same InstanceDef. dungeon-done B2 scans `areatriggerId`.
// Cite: areatrigger_teleport; worldView extra Enter buttons; enterInstance opts.entranceTriggerId.
export const EXTRA_ENTRANCE_TRIGGERS: readonly { instanceId: string; areatriggerId: number }[] = [
  { instanceId: 'maraudon', areatriggerId: 3133 }, // Maraudon Orange - Entering
  { instanceId: 'gnomeregan', areatriggerId: 523 }, // Train Depot
  { instanceId: 'uldaman', areatriggerId: 902 }, // Badlands back door
  { instanceId: 'stratholme-live', areatriggerId: 2217 }, // Right Front
  { instanceId: 'dire-maul-east', areatriggerId: 3184 }, // unnamed Dire Maul door
  { instanceId: 'dire-maul-east', areatriggerId: 3185 }, // East back door
];

function loadAreatriggerRows(): AreatriggerTeleportRow[] {
  return areatriggerTeleportsJson as AreatriggerTeleportRow[];
}

function triggerRow(id: number): AreatriggerTeleportRow | undefined {
  return loadAreatriggerRows().find((r) => r.id === id);
}

function pointFromTrigger(row: AreatriggerTeleportRow): WorldPoint {
  const pt: WorldPoint = { x: Number(row.targetX), y: Number(row.targetY) };
  if (row.targetZ != null && Number.isFinite(Number(row.targetZ))) {
    pt.z = Number(row.targetZ);
  }
  return pt;
}

// Real entrance world point for an InstanceDef id, from areatriggerTeleports. Replaces hand-typed ENTRANCE
// tables and the fabricated "first trash with origin" spine start.
export function entranceForInstance(instanceId: string, triggerId?: number): WorldPoint | undefined {
  const extra = triggerId != null
    && EXTRA_ENTRANCE_TRIGGERS.some((e) => e.instanceId === instanceId && e.areatriggerId === triggerId);
  const tid = extra ? triggerId : INSTANCE_ENTRANCE_TRIGGER[instanceId];
  if (tid == null) return undefined;
  const row = triggerRow(tid);
  return row ? pointFromTrigger(row) : undefined;
}

export function extraEntrancesForInstance(instanceId: string): AreatriggerTeleportRow[] {
  const ids = EXTRA_ENTRANCE_TRIGGERS.filter((e) => e.instanceId === instanceId).map((e) => e.areatriggerId);
  return ids.map(triggerRow).filter((r): r is AreatriggerTeleportRow => r != null);
}

// Shared-map wing → boss creature entries used as spatial anchors. Positions come from surveyBossPos (DB
// avg), never hand-typed tables. Cite: survey.json bosses; dmapfid O5 wing partition.
export const WING_BOSS_ENTRIES: Readonly<
  Record<number, Readonly<Record<string, readonly number[]>>>
> = {
  // Scarlet Monastery
  189: {
    gy: [3983, 4543, 6489, 6490, 6488], // Vishas, Thalnos, rare pool
    lib: [3974, 6487], // Loksey, Doan
    arm: [3975], // Herod
    cat: [4542, 3976, 3977], // Fairbanks, Mograine, Whitemane
  },
  // Blackrock Spire
  229: {
    lbrs: [9196, 9236, 9237, 10596, 10584, 9736, 10268, 10220, 9568],
    ubrs: [9816, 10264, 10509, 10899, 10339, 10429, 10430, 10363],
  },
  // Stratholme
  329: {
    live: [10516, 10808, 10997, 10811, 10812, 11143],
    undead: [10436, 10437, 10438, 10435, 10439, 10440],
  },
  // Dire Maul
  429: {
    east: [14354, 11490, 13280, 14327, 11492],
    west: [11489, 11488, 11487, 11467, 11496, 11486],
    north: [14326, 14322, 14321, 14323, 14325, 14324, 11501],
  },
};

// Signature trash entries that identify a wing when spatial nearest-boss is ambiguous, sourced from
// the other wing's historical strip lists. Boss entries are already hard votes.
export const WING_SIGNATURE_ENTRIES: Readonly<
  Record<number, Readonly<Record<string, readonly number[]>>>
> = {
  229: {
    // UBRS trash families (from lbrs.ts LBRS_EXCLUDED UBRS block)
    ubrs: [
      9096, 10083, 10366, 10372, 10371, 9817, 9818, 9819, 10318, 10317, 10319,
      10762, 10316, 10814, 10442, 10447, 10742, 10683, 10258, 10161,
    ],
    // LBRS trash families (from ubrs.ts UBRS_EXCLUDED LBRS block — keep in sync)
    lbrs: [
      9197, 9198, 9199, 9200, 9201, 9216, 9217, 9218, 9219, 9239, 9240, 9241,
      9257, 9258, 9259, 9260, 9261, 9262, 9263, 9264, 9265, 9266, 9267, 9268,
      9269, 9583, 9692, 9693, 9716, 9717, 9736, 10221, 10374, 10375, 10376,
      10463, 10464, 10584,
    ],
  },
};

// ---- Cluster → trash EncounterDef -------------------------------------------

export type TrashFromClustersOpts = {
  mapId: number;
  /** Boss / rare / other-wing entries stripped from trash (kept as hand boss rows). */
  stripEntries: ReadonlySet<number> | readonly number[];
  /** Multi-wing: keep only packs that pass this filter. */
  includePack?: (pack: ClusterPack) => boolean;
  /** Guids claimed by hand event packs (avoid double-count). Usually empty — clusters already drop event-gated. */
  excludeGuids?: ReadonlySet<number>;
  /** Optional name overrides. */
  entryName?: (entry: number) => string | undefined;
  idPrefix?: string;
};

type Slot = {
  entry: number;
  poolCandidates?: number[];
  guid: number;
};

// Convert one CFH/Detection cluster into a trash EncounterDef. CSE (entry===0): one pack slot per guid with
// survey poolCandidates. Returns null when empty after boss strip / filters.
export function clusterPackToTrash(
  pack: ClusterPack,
  strip: ReadonlySet<number>,
  poolByGuid: Map<number, number[]>,
  names: Map<number, string>,
  opts?: {
    excludeGuids?: ReadonlySet<number>;
    entryName?: (e: number) => string | undefined;
    idPrefix?: string;
    /** When set, stamp roomId/roomName from the pack centroid. */
    mapId?: number;
  },
): EncounterDef | null {
  const exclude = opts?.excludeGuids;
  const nonCombat = nonCombatTrashEntries();
  // Never a pack slot: friendly-to-all, plus script triggers. A trigger's guid lands in spawnGuids
  // with no floor body, so route credit waits forever on a corpse that cannot exist.
  const notASlot = (entry: number) => nonCombat.has(entry) || TECHNICAL_TRIGGER_ENTRIES.has(entry);
  const slots: Slot[] = [];
  for (const m of pack.members) {
    if (strip.has(m.entry)) continue;
    if (exclude?.has(m.guid)) continue;
    if (m.entry === 0) {
      const cands = (poolByGuid.get(m.guid) ?? []).filter((e) => !strip.has(e) && !notASlot(e));
      if (cands.length === 0) {
        // No survey candidates — skip (never invent). Static CSE without table row is a data gap.
        continue;
      }
      // Placeholder entry = first candidate (CMaNGOS-style until ResetEntry roll).
      slots.push({ entry: cands[0]!, poolCandidates: [...cands], guid: m.guid });
    } else {
      if (notASlot(m.entry)) continue;
      slots.push({ entry: m.entry, guid: m.guid });
    }
  }
  if (slots.length === 0) return null;

  // Primary = first non-pool member in stable guid/member order; else first slot.
  let primaryIdx = slots.findIndex((s) => !s.poolCandidates);
  if (primaryIdx < 0) primaryIdx = 0;
  const primary = slots[primaryIdx]!;

  // Aggregate remaining fixed entries; CSE stay one-slot-per-guid (count 1).
  const fixedCounts = new Map<number, number>();
  const cseRows: EncounterPackMember[] = [];
  for (let i = 0; i < slots.length; i++) {
    if (i === primaryIdx) continue;
    const s = slots[i]!;
    if (s.poolCandidates) {
      cseRows.push({
        creatureEntry: s.entry,
        count: 1,
        poolCandidates: s.poolCandidates,
      });
    } else {
      fixedCounts.set(s.entry, (fixedCounts.get(s.entry) ?? 0) + 1);
    }
  }

  const packRows: EncounterPackMember[] = [];
  const primaryExtra = fixedCounts.get(primary.entry) ?? 0;
  if (primaryExtra > 0) {
    packRows.push({ creatureEntry: primary.entry, count: primaryExtra });
    fixedCounts.delete(primary.entry);
  }
  for (const [entry, count] of fixedCounts) {
    packRows.push({ creatureEntry: entry, count });
  }
  packRows.push(...cseRows);

  const nameOf = (e: number) =>
    opts?.entryName?.(e) ?? names.get(e) ?? `Creature ${e}`;
  const primaryName = nameOf(primary.entry);
  const mixed = new Set(slots.map((s) => s.entry)).size > 1 || cseRows.length > 0;
  const display =
    slots.length === 1
      ? primaryName
      : mixed
        ? `${primaryName} pack`
        : `${primaryName}s`;

  // Over the SLOTS, not pack.members: strip/exclude/non-combat filters already ran, and a
  // centroid over members this encounter does not carry points at nobody.
  const inSlots = new Set(slots.map((s) => s.guid));
  const seed = modalFloorCentroid(
    pack.members.filter((m) => inSlots.has(m.guid)),
    pack.centroid,
  );
  const origin: { x: number; y: number; z?: number } = { x: seed.x, y: seed.y };
  if (seed.z != null && Number.isFinite(seed.z)) origin.z = seed.z;
  const enc: EncounterDef = {
    id: opts?.idPrefix ? `${opts.idPrefix}-${pack.packId}` : pack.packId,
    name: display,
    kind: 'trash',
    creatureEntry: primary.entry,
    origin,
    spawnGuids: slots.map((s) => s.guid),
  };
  if (primary.poolCandidates) enc.poolCandidates = primary.poolCandidates;
  if (packRows.length) enc.pack = packRows;
  // Room membership from centroid — null when outside every named room (reported
  // in dungeon-rooms.json unassigned; never nearest-snapped).
  if (opts?.mapId != null) {
    const room = roomForPack(opts.mapId, pack);
    if (room) {
      enc.roomId = room.id;
      enc.roomName = room.name;
    } else {
      enc.roomId = null;
      enc.roomName = null;
    }
  }
  return enc;
}

// All cluster-derived trash for a map (bosses stripped, optional wing filter). Sorted by distance from
// `entrance` when provided, else cluster packId order.
export function trashFromClusters(opts: TrashFromClustersOpts & {
  entrance?: { x: number; y: number };
}): EncounterDef[] {
  const map = getClusterMap(opts.mapId);
  if (!map) return [];
  // Always strip non-combat (friendly-to-all) creatures — class gate, not id lists.
  const strip = new Set<number>(
    opts.stripEntries instanceof Set ? opts.stripEntries : opts.stripEntries,
  );
  for (const e of nonCombatTrashEntries()) strip.add(e);
  const poolByGuid = loadPoolGuidCandidates(opts.mapId);
  const names = loadEntryNames(opts.mapId);
  const out: EncounterDef[] = [];
  for (const pack of map.packs) {
    if (opts.includePack && !opts.includePack(pack)) continue;
    const enc = clusterPackToTrash(pack, strip, poolByGuid, names, {
      excludeGuids: opts.excludeGuids,
      entryName: opts.entryName,
      idPrefix: opts.idPrefix,
      mapId: opts.mapId,
    });
    if (enc) out.push(enc);
  }
  if (opts.entrance) {
    const ent = opts.entrance;
    out.sort((a, b) => {
      const da = a.origin ? dist2d(a.origin, ent) : 0;
      const db = b.origin ? dist2d(b.origin, ent) : 0;
      if (da !== db) return da - db;
      return a.id.localeCompare(b.id);
    });
  }
  return out;
}

// ---- Route assembly ---------------------------------------------------------

export type BossAnchor = {
  encounter: EncounterDef;
  /** Survey boss avg pos; used to place trash before this boss + stamp origin. */
  pos: { x: number; y: number; z?: number };
};

// Interleave spatially-sorted trash with bosses: `distance` assigns each pack to the segment before
// the nearest boss, `equal-bands` splits into bosses.length+1 bands when boss coords are missing.
export function interleaveTrashAndBosses(
  trash: EncounterDef[],
  bosses: BossAnchor[],
  entrance: { x: number; y: number },
  afterBoss?: Record<string, EncounterDef[]>,
  mode: 'distance' | 'equal-bands' = 'distance',
): EncounterDef[] {
  if (bosses.length === 0) return [...trash];

  if (mode === 'equal-bands') {
    const out: EncounterDef[] = [];
    const bands = bosses.length + 1;
    const n = trash.length;
    let ti = 0;
    for (let bi = 0; bi < bosses.length; bi++) {
      const end = Math.round(((bi + 1) * n) / bands);
      while (ti < end) out.push(trash[ti++]!);
      out.push(stampBossOrigin(bosses[bi]!));
      const inserts = afterBoss?.[bosses[bi]!.encounter.id];
      if (inserts) out.push(...inserts);
    }
    while (ti < n) out.push(trash[ti++]!);
    return out;
  }

  const bossDists = bosses.map((b) => dist2d(b.pos, entrance));
  const used = new Set<number>();
  const out: EncounterDef[] = [];

  for (let bi = 0; bi < bosses.length; bi++) {
    const bDist = bossDists[bi]!;
    const nextDist = bi + 1 < bossDists.length ? bossDists[bi + 1]! : Infinity;
    const cutoff =
      bi + 1 < bosses.length
        ? (bDist + nextDist) / 2
        : Infinity;

    for (let ti = 0; ti < trash.length; ti++) {
      if (used.has(ti)) continue;
      const t = trash[ti]!;
      const td = t.origin ? dist2d(t.origin, entrance) : bDist;
      const prevCutoff = bi === 0 ? -Infinity : (bossDists[bi - 1]! + bDist) / 2;
      if (td >= prevCutoff && td < cutoff) {
        out.push(t);
        used.add(ti);
      }
    }
    out.push(stampBossOrigin(bosses[bi]!));
    const inserts = afterBoss?.[bosses[bi]!.encounter.id];
    if (inserts) out.push(...inserts);
  }

  for (let ti = 0; ti < trash.length; ti++) {
    if (!used.has(ti)) out.push(trash[ti]!);
  }
  return out;
}

/** Survey/interleave pos becomes encounter.origin when the boss row lacks one. */
function stampBossOrigin(b: BossAnchor): EncounterDef {
  const enc = b.encounter;
  const has =
    enc.origin && Number.isFinite(enc.origin.x) && Number.isFinite(enc.origin.y);
  if (has) return enc;
  const origin: { x: number; y: number; z?: number } = { x: b.pos.x, y: b.pos.y };
  if (b.pos.z != null && Number.isFinite(b.pos.z)) origin.z = b.pos.z;
  return { ...enc, origin };
}

/** guid → cluster member (entry + world position) for a map's packs. */
export function clusterMemberByGuid(mapId: number): Map<number, ClusterMember> {
  const out = new Map<number, ClusterMember>();
  for (const pack of getClusterMap(mapId)?.packs ?? []) {
    for (const m of pack.members) out.set(m.guid, m);
  }
  return out;
}

/** Every mapped guid, for the callers that hold guids and no mapId (InstanceDef carries none).
 *  Decodes all 26 maps, so it is built on first ask and only that path pays for it. */
let allMapMembers: Map<number, ClusterMember> | null = null;
export function clusterMemberByGuidAllMaps(): Map<number, ClusterMember> {
  if (allMapMembers) return allMapMembers;
  const out = new Map<number, ClusterMember>();
  for (const mapId of Object.keys(packsFile.maps ?? {})) {
    for (const pack of getClusterMap(Number(mapId))?.packs ?? []) {
      for (const m of pack.members) if (!out.has(m.guid)) out.set(m.guid, m);
    }
  }
  allMapMembers = out;
  return out;
}

// Rebuild a trash pull from a guid subset: origin centroid, primary and pack counts. Pass `pools`
// whenever the subset can contain CSE spawns, or a slot ships as `creatureEntry: 0`.
export function repackFromGuids(
  base: EncounterDef,
  guids: readonly number[],
  members: Map<number, { entry: number; x: number; y: number; z?: number }>,
  opts?: {
    id?: string; name?: string; events?: EncounterEvent[]; pools?: Map<number, number[]>;
  },
): EncounterDef {
  type Slot = { entry: number; guid: number; poolCandidates?: number[] };
  const rows: { x: number; y: number; z?: number }[] = [];
  const slots: Slot[] = [];
  for (const g of guids) {
    const m = members.get(g);
    if (!m) continue;
    rows.push(m);
    const cands = m.entry === 0 ? (opts?.pools?.get(g) ?? []) : [];
    if (cands.length) slots.push({ entry: cands[0]!, guid: g, poolCandidates: [...cands] });
    else slots.push({ entry: m.entry, guid: g });
  }
  // Primary is a FIXED slot: keep the base's when it survives the split, else the most
  // numerous. A pool slot only wins when the subset is nothing but pool slots.
  const fixedCounts = new Map<number, number>();
  for (const s of slots) {
    if (!s.poolCandidates) fixedCounts.set(s.entry, (fixedCounts.get(s.entry) ?? 0) + 1);
  }
  let primaryIdx = slots.findIndex(
    (s) => !s.poolCandidates && s.entry === base.creatureEntry,
  );
  if (primaryIdx < 0) {
    const top = [...fixedCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    primaryIdx = top ? slots.findIndex((s) => !s.poolCandidates && s.entry === top[0]) : 0;
  }
  const primary = slots[primaryIdx];
  const extra = new Map<number, number>();
  const cseRows: EncounterPackMember[] = [];
  for (let i = 0; i < slots.length; i++) {
    if (i === primaryIdx) continue;
    const s = slots[i]!;
    if (s.poolCandidates) {
      cseRows.push({ creatureEntry: s.entry, count: 1, poolCandidates: [...s.poolCandidates] });
    } else {
      extra.set(s.entry, (extra.get(s.entry) ?? 0) + 1);
    }
  }
  const pack: EncounterPackMember[] = [];
  for (const [entry, count] of extra) if (count > 0) pack.push({ creatureEntry: entry, count });
  pack.push(...cseRows);
  // Origin on the members' MODAL FLOOR, not their mean — the same seed trashFromClusters uses. A
  // raw mean over a two-storey remainder lands between them, in the void, and the router noPaths.
  const mean = {
    x: rows.reduce((s, m) => s + m.x, 0) / rows.length,
    y: rows.reduce((s, m) => s + m.y, 0) / rows.length,
    z: rows.reduce((s, m) => s + (m.z ?? 0), 0) / rows.length,
  };
  const enc: EncounterDef = {
    ...base,
    id: opts?.id ?? base.id,
    name: opts?.name ?? base.name,
    creatureEntry: primary?.entry ?? base.creatureEntry,
    origin: modalFloorCentroid(
      rows.map((m, i) => ({ guid: slots[i]?.guid ?? 0, entry: 0, x: m.x, y: m.y, z: m.z })),
      mean,
    ),
    spawnGuids: [...guids],
  };
  if (primary?.poolCandidates) enc.poolCandidates = [...primary.poolCandidates];
  else delete enc.poolCandidates;
  if (pack.length) enc.pack = pack;
  else delete enc.pack;
  if (opts?.events?.length) enc.events = opts.events;
  else delete enc.events;
  return enc;
}

// Land a `setsFlag` on the last cluster pack before `beforeId` holding a member `match` accepts,
// else the last trash pull. `trashFromCensus` returns [] now, so a census band dropped the flag.
export function setsFlagOnPackBefore(
  encs: EncounterDef[],
  opts: { mapId: number; flag: string; beforeId: string; match: (m: ClusterMember) => boolean },
): EncounterDef[] {
  const gate = encs.findIndex((e) => e.id === opts.beforeId);
  if (gate < 0) return encs;
  const members = clusterMemberByGuid(opts.mapId);
  let pick = -1;
  let last = -1;
  for (let i = 0; i < gate; i++) {
    const e = encs[i]!;
    if (e.kind !== 'trash') continue;
    last = i;
    const hit = (e.spawnGuids ?? []).some((g) => {
      const m = members.get(g);
      return !!m && opts.match(m);
    });
    if (hit) pick = i;
  }
  const at = pick >= 0 ? pick : last;
  if (at < 0) return encs;
  const out = encs.slice();
  const e = out[at]!;
  out[at] = { ...e, events: [...(e.events ?? []), { kind: 'setsFlag', flag: opts.flag }] };
  return out;
}

/** Apply the same events array onto every encounter (e.g. ship requiresFlag). */
export function withEvents(
  encs: EncounterDef[],
  events: EncounterEvent[],
): EncounterDef[] {
  return encs.map((e) => ({
    ...e,
    events: [...(e.events ?? []), ...events],
  }));
}

// Interleave cluster trash evenly through a hand-authored spine (bosses + event patrols/gates already in
// story order). Spine order is preserved; trash is split into spine.length+1 bands.
export function interleaveSpineWithTrash(
  trash: EncounterDef[],
  spine: EncounterDef[],
): EncounterDef[] {
  if (spine.length === 0) return [...trash];
  if (trash.length === 0) return [...spine];
  const out: EncounterDef[] = [];
  const bands = spine.length + 1;
  const n = trash.length;
  let ti = 0;
  for (let si = 0; si < spine.length; si++) {
    const end = Math.round(((si + 1) * n) / bands);
    while (ti < end) out.push(trash[ti++]!);
    out.push(spine[si]!);
  }
  while (ti < n) out.push(trash[ti++]!);
  return out;
}

// Full cutover helper: cluster trash + hand spine (bosses/events). Strip entries = all creatureEntry on
// spine bosses (and optional extras).
export function buildClusterEncounters(opts: {
  mapId: number;
  spine: EncounterDef[];
  entrance?: { x: number; y: number };
  // Extra strip beyond spine boss entries — only entries that DO have a static cluster spawn here.
  // Never summon-only: those have zero cluster members, so there is nothing to strip.
  extraStrip?: readonly number[];
  includePack?: (pack: ClusterPack) => boolean;
  excludeGuids?: ReadonlySet<number>;
}): EncounterDef[] {
  const strip = new Set<number>(opts.extraStrip ?? []);
  for (const e of opts.spine) {
    if (e.kind === 'boss') {
      strip.add(e.creatureEntry);
      for (const ev of e.events ?? []) {
        if (ev.kind === 'onDeathSummon') strip.add(ev.creatureEntry);
      }
    }
  }
  const trash = trashFromClusters({
    mapId: opts.mapId,
    stripEntries: strip,
    entrance: opts.entrance,
    includePack: opts.includePack,
    excludeGuids: opts.excludeGuids,
  });
  // Boss rows on the spine gain origin and spawnGuids from the cluster pack that still holds that
  // boss entry. Wing-filtered so dual-listed rares on shared maps do not double-claim guids.
  const spine = attachBossClusterGeometry(opts.spine, opts.mapId, opts.includePack);
  return interleaveSpineWithTrash(trash, spine);
}

/** Pack size (primary + pack counts), ignoring CSE expansion. */
export function encounterPackSize(enc: EncounterDef): number {
  let n = 1;
  for (const p of enc.pack ?? []) n += p.count;
  return n;
}

/** True when primary+pack has ≥2 distinct creatureEntry values (CSE placeholder counts). */
export function isMixedTrashPack(enc: EncounterDef): boolean {
  if (enc.kind !== 'trash') return false;
  const entries = new Set<number>([enc.creatureEntry]);
  for (const p of enc.pack ?? []) entries.add(p.creatureEntry);
  if (enc.poolCandidates || (enc.pack ?? []).some((p) => p.poolCandidates)) {
    // CSE + fixed of different types, or multiple distinct fixed
    return entries.size > 1 || (enc.pack?.length ?? 0) > 0;
  }
  return entries.size > 1;
}

// Count kill supply with the CSE max-coverage model: a concrete row adds count for its entry, a CSE
// slot adds count for EACH candidate. The physical slot count is still the sum of counts.
export function killSupplyFromEncounter(enc: EncounterDef): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);

  const addRow = (entry: number, count: number, pool?: number[]) => {
    if (pool && pool.length > 0) {
      for (const c of pool) add(c, count);
    } else {
      add(entry, count);
    }
  };

  addRow(enc.creatureEntry, 1, enc.poolCandidates);
  for (const p of enc.pack ?? []) {
    addRow(p.creatureEntry, p.count, p.poolCandidates);
  }
  for (const ev of enc.events ?? []) {
    if (ev.kind === 'onDeathSummon') add(ev.creatureEntry, 1);
    if (ev.kind === 'waves') {
      for (const w of ev.waves) {
        for (const row of w.pack) addRow(row.creatureEntry, row.count, row.poolCandidates);
      }
    }
    if (ev.kind === 'hpThreshold' && ev.spawn) {
      for (const row of ev.spawn) addRow(row.creatureEntry, row.count, row.poolCandidates);
    }
  }
  return map;
}

/** Physical spawn slots (CSE = 1 each, no candidate expansion). */
export function physicalSlotCount(enc: EncounterDef): number {
  return encounterPackSize(enc);
}

// Majority-entry wing filter: keep pack if ≥ half of non-CSE members are in `allowed`. Packs that are pure
// CSE with any candidate in allowed are kept when any candidate matches.
export function wingFilterByEntries(
  allowed: ReadonlySet<number>,
): (pack: ClusterPack) => boolean {
  return (pack) => {
    const fixed = pack.members.filter((m) => m.entry !== 0);
    if (fixed.length === 0) {
      // Pure CSE — include if we cannot tell (caller should prefer spatial filter)
      return true;
    }
    const hit = fixed.filter((m) => allowed.has(m.entry)).length;
    return hit * 2 >= fixed.length;
  };
}

// Nearest-boss-wing filter: partitions packs on a shared map by nearest SURVEY boss position for
// each wing's boss list, with no hand-typed anchors. Plan-view wing overlap is ~0–5%.
export function wingFilterByNearestBoss(
  mapIdOrWingId: number | string,
  wingIdOrWings?: string | Record<string, { x: number; y: number }[]>,
  maybeWings?: Record<string, { x: number; y: number }[]>,
): (pack: ClusterPack) => boolean {
  // Legacy: wingFilterByNearestBoss(wingId, wingsRecord)
  if (typeof mapIdOrWingId === 'string' && wingIdOrWings && typeof wingIdOrWings === 'object') {
    const wingId = mapIdOrWingId;
    const wings = wingIdOrWings as Record<string, { x: number; y: number }[]>;
    const entries = Object.entries(wings);
    return (pack) => {
      let bestId = '';
      let bestD = Infinity;
      for (const [id, anchors] of entries) {
        for (const a of anchors) {
          const d = dist2d(pack.centroid, a);
          if (d < bestD) {
            bestD = d;
            bestId = id;
          }
        }
      }
      return bestId === wingId;
    };
  }

  // W2: wingFilterByNearestBoss(mapId, wingId)
  const mapId = Number(mapIdOrWingId);
  const wingId = String(wingIdOrWings ?? '');
  const wingEntries = WING_BOSS_ENTRIES[mapId];
  if (!wingEntries || !wingId) {
    return () => true;
  }

  /** wingId → survey anchors (skip bosses with null pos). */
  const anchorsByWing = new Map<string, WorldPoint[]>();
  for (const [wid, entries] of Object.entries(wingEntries)) {
    const pts: WorldPoint[] = [];
    for (const entry of entries) {
      const p = surveyBossPos(mapId, entry);
      if (p) pts.push(p);
    }
    if (pts.length) anchorsByWing.set(wid, pts);
  }

  /** wingId → signature entry set (boss + characteristic trash). */
  const sigByWing = new Map<string, Set<number>>();
  for (const [wid, entries] of Object.entries(wingEntries)) {
    const set = new Set<number>(entries);
    for (const e of WING_SIGNATURE_ENTRIES[mapId]?.[wid] ?? []) set.add(e);
    sigByWing.set(wid, set);
  }

  return (pack) => {
    // 1) Signature-entry majority: fixes packs of wing-A trash near wing-B bosses
    //    (the LBRS↔UBRS strip interaction that ate pack 229-51's neighbours).
    const sigVotes = new Map<string, number>();
    let sigTotal = 0;
    for (const m of pack.members) {
      if (m.entry === 0) continue;
      for (const [wid, set] of sigByWing) {
        if (set.has(m.entry)) {
          sigVotes.set(wid, (sigVotes.get(wid) ?? 0) + 1);
          sigTotal++;
          break; // first matching wing only (sets should be disjoint)
        }
      }
    }
    if (sigTotal > 0) {
      let bestSig = '';
      let bestN = -1;
      let tie = false;
      for (const [wid, n] of sigVotes) {
        if (n > bestN) {
          bestN = n;
          bestSig = wid;
          tie = false;
        } else if (n === bestN) {
          tie = true;
        }
      }
      if (!tie && bestSig) return bestSig === wingId;
    }

    // 2) Nearest survey boss anchor (plan-view; 0–5% pairwise wing overlap).
    let bestId = '';
    let bestD = Infinity;
    for (const [id, anchors] of anchorsByWing) {
      for (const a of anchors) {
        const d = dist2d(pack.centroid, a);
        if (d < bestD) {
          bestD = d;
          bestId = id;
        }
      }
    }
    return bestId === wingId;
  };
}

// Attach survey/cluster origin and spawnGuids onto boss encounters from packs that still contain
// that boss entry. `includePack` prevents a dual claim when two InstanceDefs share a map.
export function attachBossClusterGeometry(
  encounters: EncounterDef[],
  mapId: number,
  includePack?: (pack: ClusterPack) => boolean,
): EncounterDef[] {
  const map = getClusterMap(mapId);
  if (!map) return encounters;
  /** entry → packs containing it (wing-filtered) */
  const packsByBoss = new Map<number, ClusterPack[]>();
  for (const pack of map.packs) {
    if (includePack && !includePack(pack)) continue;
    for (const m of pack.members) {
      if (m.entry <= 0) continue;
      if (!packsByBoss.has(m.entry)) packsByBoss.set(m.entry, []);
      packsByBoss.get(m.entry)!.push(pack);
    }
  }
  return encounters.map((enc) => {
    if (enc.kind !== 'boss') return enc;
    if (enc.origin && enc.spawnGuids?.length) return enc;
    const candidates = packsByBoss.get(enc.creatureEntry) ?? [];
    const pack = candidates[0];
    if (!pack) {
      // Fall back to survey boss avg pos when no static pack (script-summoned).
      const sp = surveyBossPos(mapId, enc.creatureEntry);
      if (sp && !enc.origin) return { ...enc, origin: sp };
      return enc;
    }
    const bossMembers = pack.members.filter((m) => m.entry === enc.creatureEntry);
    const seed = modalFloorCentroid(pack.members, pack.centroid);
    const origin: { x: number; y: number; z?: number } = { x: seed.x, y: seed.y };
    if (seed.z != null) origin.z = seed.z;
    // Prefer boss member position when present.
    if (bossMembers.length === 1) {
      const m = bossMembers[0]!;
      origin.x = m.x;
      origin.y = m.y;
      if (m.z != null) origin.z = m.z;
    }
    return {
      ...enc,
      origin: enc.origin ?? origin,
      spawnGuids: enc.spawnGuids ?? bossMembers.map((m) => m.guid),
    };
  });
}

/** @deprecated Prefer wingFilterByNearestBoss(mapId, wingId). Kept name alias. */
export function wingFilterByMapWing(
  mapId: number,
  wingId: string,
): (pack: ClusterPack) => boolean {
  return wingFilterByNearestBoss(mapId, wingId);
}
