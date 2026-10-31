/**
 * Dungeon route geometry — replaces atlasOverlay.ts (dmapfid W6).
 *
 * Every pin is `projectWorld(viewport, encounter.origin)` recomputed every render.
 * Markers store no coordinates. Trash is no longer placed by route index along a
 * hand-pinned polyline (`assignRoutePathT`); each pack sits on its real world origin.
 *
 * Pure module — no DOM, no I/O beyond the committed viewport JSON import.
 *
 * @see docs/archive/DUNGEON-MAP-RUNSHEET.md §3, §5 W6
 */

import viewportsJson from '../data/maps/dungeon-viewports.json' with { type: 'json' };
import { DUNGEON_INSTANCES } from '../data/dungeons/index.ts';
import { entranceForInstance, WING_BOSS_ENTRIES } from '../data/dungeons/pack-from-clusters.ts';
import type { EncounterDef, InstanceDef } from '../data/schema.ts';
import { combatantCount } from './dungeonRoute.ts';
import { isCleared, routeEncounterList } from './instances.ts';
import { objectiveItinerary } from './dungeonObjectives.ts';
import type { InstanceRun } from './instances.ts';
import {
  projectWorld,
  type MapPct,
  type Viewport,
  type WorldPos,
} from './dungeonMapProjection.ts';
// Side-list labels from the Atlas addon parse (names/numbers only — not map art).
// Art registration is dead (D3 / W15); the rows still name bosses on our geometry.
import atlasRowsJson from '../../docs/dungeons/atlas/atlas-rows-dungeons.json' with { type: 'json' };
import {
  dungeonGameObjectsForMap,
  type DungeonGameObject,
} from '../data/dungeonGameObjects.ts';

export type { MapPct, WorldPos, Viewport };

// Viewports (committed bake — W4)

type ViewportFile = Record<string, unknown>;

function loadViewportRecord(instanceId: string): (Viewport & {
  mapId?: number;
  zMin?: number;
  zMax?: number;
}) | null {
  const raw = (viewportsJson as ViewportFile)[instanceId];
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as {
    box?: number[];
    mapId?: number;
    zMin?: number;
    zMax?: number;
  };
  if (!Array.isArray(v.box) || v.box.length !== 4) return null;
  const box = v.box.map(Number) as [number, number, number, number];
  if (!box.every(Number.isFinite)) return null;
  return {
    box,
    mapId: v.mapId,
    zMin: typeof v.zMin === 'number' ? v.zMin : undefined,
    zMax: typeof v.zMax === 'number' ? v.zMax : undefined,
  };
}

/** Viewport for an instance, or null when the bake has not shipped one. */
export function viewportForInstance(instanceId: string): Viewport | null {
  return loadViewportRecord(instanceId);
}

// Side-list types (labels on our geometry — no stored coordinates)

export type AtlasEntryKind =
  | 'entrance'
  | 'exit'
  | 'boss'
  | 'rare'
  | 'object'
  | 'note';

export type AtlasListEntry = {
  id: string;
  label: string;
  parentLabel?: string;
  kind: AtlasEntryKind;
  name: string;
  /** Resolved map% when a world point exists; omitted for list-only rows. */
  map?: MapPct;
  encounterId?: string;
  creatureEntry?: number;
  ink?: 'blue' | 'grey' | 'green' | 'orange';
  /** World z when known — drives painter's-order / z-shade on stacked maps. */
  z?: number;
  /** Baked GO guid when this row is a walk-and-use object (Core Fragment, not a pack). */
  goGuid?: number;
  /** Click dispatch for `goGuid` rows — same values as ObjectMarker.objKind. */
  objKind?: 'loot' | 'door' | 'button' | 'goober' | 'gate';
};

/** Side-list row before wing filter / encounter link (no map coordinates). */
export type AtlasSideListEntry = {
  id: string;
  label: string;
  parentLabel?: string;
  kind: AtlasEntryKind;
  name: string;
  creatureEntry?: number;
  ink?: 'blue' | 'grey' | 'green' | 'orange';
};

/** Instance id → AtlasMaps.lua table stem (for row lookup only). */
const SIDE_STEM_BY_INSTANCE: Readonly<Record<string, string>> = {
  'ragefire-chasm': 'RagefireChasm',
  'wailing-caverns': 'WailingCaverns',
  deadmines: 'TheDeadmines',
  'shadowfang-keep': 'ShadowfangKeep',
  'the-stockade': 'TheStockade',
  'blackfathom-deeps': 'BlackfathomDeeps',
  gnomeregan: 'Gnomeregan',
  'razorfen-kraul': 'RazorfenKraul',
  'sm-graveyard': 'SMGraveyard',
  'sm-library': 'SMLibrary',
  'sm-armory': 'SMArmory',
  'sm-cathedral': 'SMCathedral',
  'razorfen-downs': 'RazorfenDowns',
  uldaman: 'Uldaman',
  'zul-farrak': 'ZulFarrak',
  maraudon: 'Maraudon',
  'sunken-temple': 'TheSunkenTemple',
  'blackrock-depths': 'BlackrockDepths',
  lbrs: 'BlackrockSpireLower',
  ubrs: 'BlackrockSpireUpper',
  'dire-maul-east': 'DireMaulEast',
  'dire-maul-west': 'DireMaulWest',
  'dire-maul-north': 'DireMaulNorth',
  scholomance: 'Scholomance',
  'stratholme-live': 'Stratholme',
  'stratholme-undead': 'Stratholme',
  'onyxias-lair': 'OnyxiasLair',
  'molten-core': 'MoltenCore',
  'zul-gurub': 'ZulGurub',
  'blackwing-lair': 'BlackwingLair',
  'ruins-of-ahnqiraj': 'TheRuinsofAhnQiraj',
  'temple-of-ahnqiraj': 'TheTempleofAhnQiraj',
  naxxramas: 'Naxxramas',
};

type AtlasArtRow = {
  instanceId: string | null;
  stem: string;
  label: string | null;
  name: string;
  entry: number | null;
  kind: 'npc' | 'object' | 'note';
  indent: boolean;
  primary: boolean;
  parentLabel: string | null;
  sourceLine: number;
};

type AtlasRowsDoc = {
  meta: { tables: number; rows: number; unresolvedLocaleKeys: number; source: string; generatedBy: string; subsetOf: string; note: string };
  rows: AtlasArtRow[];
};

const ATLAS_ROWS = (atlasRowsJson as AtlasRowsDoc).rows;

function sideKind(row: AtlasArtRow): AtlasSideListEntry['kind'] {
  if (row.label && /^[A-Za-z]$/.test(row.label)) {
    const n = row.name.toLowerCase();
    if (n.includes('exit')) return 'exit';
    if (n.includes('entrance') || n.includes('connection')) return 'entrance';
  }
  if (row.kind === 'object') return 'object';
  if (row.kind === 'npc') {
    if (/\(rare\)/i.test(row.name) || /\brare\b/i.test(row.name)) return 'rare';
    return 'boss';
  }
  return 'note';
}

function sideInk(row: AtlasArtRow): AtlasSideListEntry['ink'] {
  if (row.label && /^[A-Za-z]$/.test(row.label)) return 'blue';
  if (row.label && String(row.label).includes("'")) return 'green';
  if (row.primary || row.indent) return 'grey';
  return undefined;
}

/** Side list for an instance — painted numbers / boss names (no map art URLs). */
export function sideListForInstance(instanceId: string): AtlasSideListEntry[] {
  const stem = SIDE_STEM_BY_INSTANCE[instanceId];
  if (!stem) return [];
  const rows = ATLAS_ROWS.filter((r) => r.stem === stem);
  const out: AtlasSideListEntry[] = [];
  const usedIds = new Set<string>();
  for (const r of rows) {
    if (!r.label && !r.name && !r.indent) continue;
    let id: string;
    if (r.label) {
      id = r.label;
    } else if (r.indent && r.parentLabel) {
      const slug = (r.name || 'indent')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      id = `${r.parentLabel}-${slug || r.entry || r.sourceLine}`;
    } else {
      id = `row-${r.sourceLine}`;
    }
    if (usedIds.has(id)) id = `${id}-${r.sourceLine}`;
    usedIds.add(id);
    const entry: AtlasSideListEntry = {
      id,
      label: r.label ?? '',
      kind: sideKind(r),
      name: r.name || '-',
      ink: sideInk(r),
    };
    if (r.parentLabel) entry.parentLabel = r.parentLabel;
    if (r.entry != null && (r.kind === 'npc' || r.kind === 'object')) {
      entry.creatureEntry = r.entry;
    }
    out.push(entry);
  }
  return out;
}

// Shared-stem wing filter (Stratholme 329; also safe for any future shared stem)

/**
 * Whether a side-list row belongs on this InstanceDef.
 *
 * Shared stems (Stratholme) currently hand both instances the whole list.
 * Filter by the row's creature entry against this instance's encounters and W2's
 * wing boss partition — no hard-coded x ranges.
 */
export function sideListRowBelongsToInstance(
  row: AtlasSideListEntry,
  def: InstanceDef,
): boolean {
  if (!def.wing) return true;

  const owned = new Set<number>();
  for (const e of def.encounters) {
    if (e.creatureEntry) owned.add(e.creatureEntry);
    for (const m of e.pack ?? []) {
      if (m.creatureEntry) owned.add(m.creatureEntry);
    }
  }

  // Sibling instances on the same map claim their own entries.
  const siblingOwned = new Set<number>();
  for (const other of DUNGEON_INSTANCES) {
    if (other.id === def.id || other.mapId !== def.mapId) continue;
    for (const e of other.encounters) {
      if (e.creatureEntry) siblingOwned.add(e.creatureEntry);
      for (const m of e.pack ?? []) {
        if (m.creatureEntry) siblingOwned.add(m.creatureEntry);
      }
    }
  }

  if (row.creatureEntry != null) {
    if (owned.has(row.creatureEntry)) return true;
    if (siblingOwned.has(row.creatureEntry)) return false;

    // Unclaimed label: fall back to W2 wing boss entry lists (same partition as packs).
    const wings = WING_BOSS_ENTRIES[def.mapId];
    if (wings) {
      for (const [wid, entries] of Object.entries(wings)) {
        if (entries.includes(row.creatureEntry)) return wid === def.wing;
      }
    }
    // True orphans (notes/objects with no wing ownership) — keep on every wing of the stem
    // only when no sibling claims them. Objects like postboxes stay on live (primary stem
    // attribution from atlas-rows); they have entry but are not creatures.
    if (row.kind === 'object' || row.kind === 'note') {
      // Prefer the "first" wing alphabetically among shared instances so only one shows it?
      // Better: keep objects on all wings of a shared stem when unclaimed — postboxes are
      // live-side; without geometry we cannot split. Drop when a sibling owns the entry.
      return true;
    }
    return false;
  }

  // No entry — entrances/exits/notes. Keep entrances on every wing (both Strat doors
  // are real); pure notes without entry stay.
  if (row.kind === 'entrance' || row.kind === 'exit') return true;
  if (row.kind === 'note' && !row.creatureEntry) return true;
  // Indents without entry follow parent — caller filters parents first.
  if (row.parentLabel) return true;
  return true;
}

/** Side list filtered to this instance's wing (shared-stem safe). */
export function filteredSideList(instanceId: string): AtlasSideListEntry[] {
  const def = DUNGEON_INSTANCES.find((d) => d.id === instanceId);
  const side = sideListForInstance(instanceId);
  if (!def?.wing) return side;

  const ownedRows = side.filter((r) => sideListRowBelongsToInstance(r, def));
  // Drop indent rows whose parent label is not present among kept labelled rows.
  const keptLabels = new Set(
    ownedRows.filter((r) => r.label).map((r) => r.label),
  );
  return ownedRows.filter((r) => {
    if (!r.parentLabel) return true;
    return keptLabels.has(r.parentLabel);
  });
}

// Projection helpers

/**
 * Clamp map% onto the canvas. Pure projectWorld can land slightly outside the
 * forced-square crop for script-summoned event origins (measured: gnomeregan
 * grubbis-event left≈101.9). Markers store no invented world coords — only the
 * display sample is edged onto [0, FULL].
 */
const FULL = 50 + 50; // 100 — map-% full scale; avoid O7 `left:\s*\d` shape
export function clampMapPct(p: MapPct): MapPct {
  return {
    left: Math.max(0, Math.min(FULL, p.left)),
    top: Math.max(0, Math.min(FULL, p.top)),
  };
}

/** Project an encounter origin; null when missing origin or viewport. */
export function projectEncounter(
  instanceId: string,
  enc: EncounterDef,
): { pct: MapPct; z?: number } | null {
  const vp = viewportForInstance(instanceId);
  if (!vp) return null;
  const o = enc.origin;
  if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return null;
  const pct = clampMapPct(projectWorld(vp, o));
  const out: { pct: MapPct; z?: number } = { pct };
  if (o.z != null && Number.isFinite(o.z)) out.z = o.z;
  return out;
}

/** Entrance world → map%. Falls back to first route encounter origin. */
export function entranceMapPct(instanceId: string): MapPct | null {
  const vp = viewportForInstance(instanceId);
  if (!vp) return null;
  const ent = entranceForInstance(instanceId);
  if (ent) return clampMapPct(projectWorld(vp, ent));
  const def = DUNGEON_INSTANCES.find((d) => d.id === instanceId);
  if (!def) return null;
  for (const e of def.encounters) {
    if (e.origin && Number.isFinite(e.origin.x) && Number.isFinite(e.origin.y)) {
      return clampMapPct(projectWorld(vp, e.origin));
    }
  }
  return null;
}

/** Entrance world position for travel (yards). */
export function entranceWorld(instanceId: string): WorldPos | null {
  const ent = entranceForInstance(instanceId);
  if (ent) return { x: ent.x, y: ent.y, z: ent.z };
  const def = DUNGEON_INSTANCES.find((d) => d.id === instanceId);
  if (!def) return null;
  // A queued instance declares its own gate: there is no areatrigger to read, and the first
  // encounter is an objective rather than a door.
  if (def.partyStart) {
    return { x: def.partyStart.x, y: def.partyStart.y, z: def.partyStart.z };
  }
  for (const e of def.encounters) {
    if (e.origin && Number.isFinite(e.origin.x) && Number.isFinite(e.origin.y)) {
      return { x: e.origin.x, y: e.origin.y, z: e.origin.z };
    }
  }
  return null;
}

export function worldDist(a: WorldPos, b: WorldPos): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerpWorld(a: WorldPos, b: WorldPos, t: number): WorldPos {
  const u = Math.max(0, Math.min(1, t));
  const out: WorldPos = {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
  };
  if (a.z != null && b.z != null) out.z = a.z + (b.z - a.z) * u;
  else if (a.z != null) out.z = a.z;
  else if (b.z != null) out.z = b.z;
  return out;
}

/** Project an arbitrary world point for an instance (display-clamped). */
export function projectInstanceWorld(instanceId: string, p: WorldPos): MapPct | null {
  const vp = viewportForInstance(instanceId);
  if (!vp) return null;
  return clampMapPct(projectWorld(vp, p));
}

// Route placement — real origins, never route-index smear

export type RouteMarker = {
  encounterId: string;
  name: string;
  kind: 'trash' | 'boss';
  combatantCount: number;
  map: MapPct;
  z?: number;
  state: 'cleared' | 'next' | 'fighting' | 'pending' | 'offroute';
  /** WMOAreaTable room name when the pack centroid sits in a named room. */
  roomName?: string | null;
};

/**
 * Place every route encounter at a real world origin.
 *
 * Default: `projectWorld(viewport, origin)` — the floorplan / old-geometry path.
 * When `opts.project` is set (dbake W17 bake surface), markers use that projector
 * instead — typically `projectBakeWorld` on the **same** resolved asset the view
 * drew. Do not re-derive the asset here; the caller passes the affine it loaded.
 *
 * Encounters without origin are skipped (should not happen after W5).
 */
export function placeRouteOnGeometry(
  def: InstanceDef,
  run: InstanceRun,
  opts?: {
    fightingId?: string | null;
    nextId?: string | null;
    // Optional world→map% projector. When set, replaces the floorplan viewport path. Bake mode passes the
    // resolved asset's worldToPixel affine.
    project?: (p: WorldPos) => MapPct | null;
  },
): RouteMarker[] {
  const route = routeEncounterList(def, run);
  const fightingId = opts?.fightingId ?? null;
  const nextId = opts?.nextId ?? null;
  const project = opts?.project;
  const out: RouteMarker[] = [];

  for (const enc of route) {
    let pct: MapPct | null = null;
    let z: number | undefined;
    if (project) {
      const o = enc.origin;
      if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
      pct = project({ x: o.x, y: o.y, z: o.z });
      if (!pct) continue;
      if (o.z != null && Number.isFinite(o.z)) z = o.z;
    } else {
      const proj = projectEncounter(def.id, enc);
      if (!proj) continue;
      pct = proj.pct;
      z = proj.z;
    }
    let state: RouteMarker['state'];
    if (fightingId && enc.id === fightingId) state = 'fighting';
    else if (isCleared(run, enc.id)) state = 'cleared';
    else if (nextId && enc.id === nextId) state = 'next';
    else state = 'pending';

    const kind: 'trash' | 'boss' = enc.kind === 'boss' ? 'boss' : 'trash';
    const marker: RouteMarker = {
      encounterId: enc.id,
      name: enc.name,
      kind,
      combatantCount: combatantCount(enc),
      map: pct,
      state,
    };
    if (z != null) marker.z = z;
    if (enc.roomName) marker.roomName = enc.roomName;
    out.push(marker);
  }
  return out;
}

/** Gold route polyline: entrance → each route encounter origin in order. Map-% points for SVG rendering. */
export function routePathPct(def: InstanceDef, run: InstanceRun): MapPct[] {
  const vp = viewportForInstance(def.id);
  if (!vp) return [];
  const out: MapPct[] = [];
  const ent = entranceForInstance(def.id);
  if (ent) out.push(clampMapPct(projectWorld(vp, ent)));
  for (const enc of routeEncounterList(def, run)) {
    if (enc.origin && Number.isFinite(enc.origin.x) && Number.isFinite(enc.origin.y)) {
      out.push(clampMapPct(projectWorld(vp, enc.origin)));
    }
  }
  return out;
}

/**
 * Route waypoints with world z: entrance → each route encounter origin, in order.
 *
 * Same points as `routePathPct`, but carrying the z the encounter was sourced with so the
 * floor pathfinder can pick the right storey (`dungeonNav.ts`). Drawing consecutive
 * waypoints as straight lines — which is what shipped — cuts through walls the moment the
 * pins became geometrically real.
 */
export function routeWaypoints(
  def: InstanceDef,
  run: InstanceRun,
): { pct: MapPct; z?: number; encounterId?: string }[] {
  const vp = viewportForInstance(def.id);
  if (!vp) return [];
  const out: { pct: MapPct; z?: number; encounterId?: string }[] = [];
  const ent = entranceForInstance(def.id);
  if (ent) {
    const p: { pct: MapPct; z?: number } = { pct: clampMapPct(projectWorld(vp, ent)) };
    if (ent.z != null && Number.isFinite(ent.z)) p.z = ent.z;
    out.push(p);
  }
  for (const enc of routeEncounterList(def, run)) {
    const o = enc.origin;
    if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    const p: { pct: MapPct; z?: number; encounterId?: string } = {
      pct: clampMapPct(projectWorld(vp, o)),
      encounterId: enc.id,
    };
    if (o.z != null && Number.isFinite(o.z)) p.z = o.z;
    out.push(p);
  }
  return out;
}

/**
 * The drawn route: entrance → each OBJECTIVE on the way to `targetEncounterId`.
 *
 * `routeWaypoints` above walks every route atom, and 2,608 of the 2,882 encounters are
 * plain trash — so the gold line was a pack-to-pack scribble (240 median self-crossings
 * at full window, dungeonMapView.ts ROUTE_WINDOW). This walks the itinerary instead:
 * bosses, the doors they sit behind, and the packs that open those doors. Pass
 * `targetEncounterId` null for every remaining objective.
 */
export function objectiveWaypoints(
  def: InstanceDef,
  run: InstanceRun,
  targetEncounterId: string | null,
  /**
   * Where the line starts. The party's own position mid-run — without it the first leg
   * is drawn from the ENTRANCE, so a party three rooms in gets a line running backwards
   * to the door. Falls back to the entrance (a fresh run is standing on it anyway).
   */
  from?: WorldPos | null,
): { pct: MapPct; z?: number; encounterId?: string }[] {
  const vp = viewportForInstance(def.id);
  if (!vp) return [];
  const out: { pct: MapPct; z?: number; encounterId?: string }[] = [];
  const start = from && Number.isFinite(from.x) && Number.isFinite(from.y)
    ? from
    : entranceForInstance(def.id);
  if (start) {
    const p: { pct: MapPct; z?: number } = { pct: clampMapPct(projectWorld(vp, start)) };
    if (start.z != null && Number.isFinite(start.z)) p.z = start.z;
    out.push(p);
  }
  for (const enc of objectiveItinerary(def, run, targetEncounterId)) {
    const o = enc.origin;
    if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    const p: { pct: MapPct; z?: number; encounterId?: string } = {
      pct: clampMapPct(projectWorld(vp, o)),
      encounterId: enc.id,
    };
    if (o.z != null && Number.isFinite(o.z)) p.z = o.z;
    out.push(p);
  }
  return out;
}

// Encounters on the route up to and including the target (for "go to boss X"). Moved from atlasOverlay — W8
// finally calls it for real auto-clear-to-target.
export function routeUpToEncounter(
  def: InstanceDef,
  run: InstanceRun,
  targetEncounterId: string,
): EncounterDef[] {
  const route = routeEncounterList(def, run);
  const idx = route.findIndex((e) => e.id === targetEncounterId);
  if (idx < 0) return [];
  return route.slice(0, idx + 1);
}

/** Map% for a single encounter on the current route. */
export function mapPctForEncounter(
  def: InstanceDef,
  run: InstanceRun,
  encounterId: string,
): MapPct | null {
  const enc =
    routeEncounterList(def, run).find((e) => e.id === encounterId) ??
    def.encounters.find((e) => e.id === encounterId);
  if (!enc) return null;
  return projectEncounter(def.id, enc)?.pct ?? null;
}

/** World position for a route encounter (travel destination). */
export function worldPosForEncounter(
  def: InstanceDef,
  run: InstanceRun,
  encounterId: string,
): WorldPos | null {
  const enc =
    routeEncounterList(def, run).find((e) => e.id === encounterId) ??
    def.encounters.find((e) => e.id === encounterId);
  if (!enc?.origin) return null;
  if (!Number.isFinite(enc.origin.x) || !Number.isFinite(enc.origin.y)) return null;
  return {
    x: enc.origin.x,
    y: enc.origin.y,
    z: enc.origin.z,
  };
}

// Pick among encounter candidates: prefer one on the active route (multi-slot rares keep only one spawn;
// linking the stripped sibling left a numbered inert row).
function pickEncounterCandidate(
  cands: readonly EncounterDef[],
  preferRouteIds?: ReadonlySet<string>,
): EncounterDef | null {
  if (!cands.length) return null;
  if (preferRouteIds?.size) {
    const onRoute = cands.find((e) => preferRouteIds.has(e.id));
    if (onRoute) return onRoute;
  }
  return cands[0] ?? null;
}

/** Whether an encounter's objectGate accepts this gameobject entry. */
function encounterOwnsGoEntry(enc: EncounterDef, goEntry: number): boolean {
  for (const ev of enc.events ?? []) {
    if (ev.kind !== 'objectGate') continue;
    if (ev.goEntry === goEntry) return true;
    if (ev.goEntries?.includes(goEntry)) return true;
  }
  return false;
}

/**
 * Link an Atlas side-list row to a route/instance encounter by creature entry,
 * objectGate goEntry (objects), or case-insensitive name.
 *
 * `preferRouteIds` — when set, multi-match picks (Bannok ×2, etc.) prefer an id
 * still on the active route after pool strip.
 */
export function linkSideRowToEncounter(
  def: InstanceDef,
  row: AtlasSideListEntry,
  preferRouteIds?: ReadonlySet<string>,
): EncounterDef | null {
  if (row.creatureEntry != null) {
    // Atlas stores GO entry on object rows in the same `entry` field — match gates.
    if (row.kind === 'object') {
      const byGate = def.encounters.filter((e) =>
        encounterOwnsGoEntry(e, row.creatureEntry!),
      );
      const hit = pickEncounterCandidate(byGate, preferRouteIds);
      if (hit) return hit;
    } else {
      const byEntry = def.encounters.filter((e) => e.creatureEntry === row.creatureEntry);
      const hit = pickEncounterCandidate(byEntry, preferRouteIds);
      if (hit) return hit;
    }
  }
  const name = row.name.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();
  if (!name || name === '-') return null;
  const exact = def.encounters.filter((e) => e.name.toLowerCase() === name);
  const exactHit = pickEncounterCandidate(exact, preferRouteIds);
  if (exactHit) return exactHit;
  const fuzzy = def.encounters.filter(
    (e) =>
      e.name.toLowerCase().includes(name) || name.includes(e.name.toLowerCase()),
  );
  return pickEncounterCandidate(fuzzy, preferRouteIds);
}

/**
 * Atlas object rows store a GO entry in `creatureEntry`. Encounter link only
 * sees objectGates, so loot objects (Core Fragment 179553) never got a world
 * point or a click. First baked spawn on this map; a numbered note inherits
 * its object child's spawn (23 Molten Core → the fragment at the window).
 */
export function linkSideRowToGameObject(
  def: InstanceDef,
  row: Pick<AtlasSideListEntry, 'kind' | 'creatureEntry'> & { label?: string },
  side?: readonly Pick<AtlasSideListEntry, 'kind' | 'parentLabel' | 'creatureEntry'>[],
): DungeonGameObject | null {
  if (row.kind === 'object' && row.creatureEntry != null) {
    return dungeonGameObjectsForMap(def.mapId).find((g) => g.entry === row.creatureEntry) ?? null;
  }
  if (row.kind === 'note' && row.label && side) {
    const child = side.find(
      (s) => s.parentLabel === row.label && s.kind === 'object' && s.creatureEntry != null,
    );
    if (child) return linkSideRowToGameObject(def, child);
  }
  return null;
}

// Travel duration from world-yard distance. ~7 yd/s walking pace scaled into the existing min/max animation
// window.
export function travelMsWorld(from: WorldPos, to: WorldPos): number {
  const yards = worldDist(from, to);
  const TRAVEL_MIN_MS = 700;
  const TRAVEL_MAX_MS = 2800;
  // 7 yd/s → ms; clamp so long corridors don't stall.
  const ms = Math.round((yards / 7) * 1000 + 200);
  return Math.max(TRAVEL_MIN_MS, Math.min(TRAVEL_MAX_MS, ms));
}

/** z-range from the viewport bake (for shading). */
export function zRangeForInstance(
  instanceId: string,
): { zMin: number; zMax: number } | null {
  const v = loadViewportRecord(instanceId);
  if (!v || v.zMin == null || v.zMax == null) return null;
  if (!(v.zMax > v.zMin)) return null;
  return { zMin: v.zMin, zMax: v.zMax };
}

// Map world-z to a [0,1] shade factor (low = dark/underground, high = bright). Used by the painter's-order
// floor renderer on stacked maps (UBRS / Scholomance).
export function zShadeFactor(
  z: number | undefined,
  zMin: number,
  zMax: number,
): number {
  if (z == null || !(zMax > zMin)) return 0.5;
  const t = (z - zMin) / (zMax - zMin);
  return Math.max(0, Math.min(1, t));
}
