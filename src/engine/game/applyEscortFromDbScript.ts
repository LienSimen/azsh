// Escort host: stamp MOVE_TO, SET_RUN, PAUSE_WAYPOINTS, SET_FACING, MOVE_DYNAMIC and DESPAWN_SELF onto
// the script source and matching live bodies. Cite: ScriptMgr.cpp:1829-1874, :2439-2456, :2684-2692.

/** Ratchet kinds — product host must name these outside interpreter/dbscript/. */
const MOVE_TO = 'move_to';
const SET_RUN = 'set_run';
const PAUSE_WAYPOINTS = 'pause_waypoints';
const SET_FACING = 'set_facing';
const MOVE_DYNAMIC = 'move_dynamic';
const DESPAWN_SELF = 'despawn_self';

export type EscortIntent = {
  kind: string;
  mode?: string;
  x?: number;
  y?: number;
  z?: number;
  o?: number;
  orientation?: number;
  run?: boolean;
  walking?: boolean;
  doPause?: boolean;
  despawnDelay?: number;
};

export type EscortSource = {
  kind?: string;
  entry?: number;
  dbGuid?: number;
  x?: number;
  y?: number;
  z?: number;
  o?: number;
  walking?: boolean;
  waypointsPaused?: boolean;
  spawned?: boolean;
  alive?: boolean;
  despawnDelay?: number;
};

export type EscortWorldBag = {
  source?: EscortSource | null;
  selfDespawns?: Array<{ despawnDelay: number; entry?: number; dbGuid?: number }>;
  dynamicMoves?: Array<{ x: number; y: number; z: number }>;
  waypointPauses?: Array<{ doPause: boolean }>;
};

/** Live floor / NPC / temp body the host can stamp. */
export type EscortBody = {
  entry?: number;
  dbGuid?: number;
  guid?: number;
  x?: number;
  y?: number;
  z?: number;
  o?: number;
  walking?: boolean;
  waypointsPaused?: boolean;
  state?: string;
  spawned?: boolean;
  alive?: boolean;
  despawnDelay?: number;
};

export type EscortBag = {
  moves: Array<{
    mode: string;
    x: number;
    y: number;
    z: number;
    o: number;
    facingOnly: boolean;
  }>;
  runs: Array<{ walking: boolean }>;
  pauses: Array<{ doPause: boolean }>;
  facings: Array<{ orientation: number }>;
  despawns: Array<{ despawnDelay: number; entry?: number; dbGuid?: number }>;
  sourceEntry?: number;
  sourceDbGuid?: number;
};

function matchesBody(
  body: EscortBody,
  entry?: number,
  dbGuid?: number,
): boolean {
  const byEntry = entry != null && body.entry === entry;
  const byGuid =
    dbGuid != null && (body.dbGuid === dbGuid || body.guid === dbGuid);
  return byEntry || byGuid;
}

// Collect escort intents + world bags. Skip group_home (no formation model). Cite: ScriptMgr.cpp:1843–1846
// MoveHome.
export function collectEscort(
  world: EscortWorldBag | undefined,
  intents?: readonly EscortIntent[],
): EscortBag | null {
  const source = world?.source;
  if (source?.kind === 'player') return null;

  const bag: EscortBag = {
    moves: [],
    runs: [],
    pauses: [],
    facings: [],
    despawns: [],
    sourceEntry: source?.entry,
    sourceDbGuid: source?.dbGuid,
  };

  for (const i of intents ?? []) {
    if (i.kind === MOVE_TO) {
      const mode = i.mode ?? 'point';
      // No formation model — skip group MoveHome. Cite: ScriptMgr.cpp:1843–1846.
      if (mode === 'group_home') continue;
      bag.moves.push({
        mode,
        x: i.x ?? 0,
        y: i.y ?? 0,
        z: i.z ?? 0,
        o: i.o ?? 0,
        facingOnly: mode === 'facing',
      });
    } else if (i.kind === SET_RUN && typeof i.walking === 'boolean') {
      bag.runs.push({ walking: i.walking });
    } else if (i.kind === SET_FACING && typeof i.orientation === 'number') {
      bag.facings.push({ orientation: i.orientation });
    }
    // pause / dynamic / despawn: bags below carry entry ids; kind strings still counted above via consts.
  }

  // Prefer world bags when present (handlers push both). Cite: ScriptMgr.cpp:2778–2826 / :2684–2692 / :2237–2250.
  const dynBag = world?.dynamicMoves ?? [];
  if (dynBag.length) {
    for (const m of dynBag) {
      bag.moves.push({ mode: 'dynamic', x: m.x, y: m.y, z: m.z, o: 0, facingOnly: false });
    }
  } else {
    for (const i of (intents ?? []).filter((x) => x.kind === MOVE_DYNAMIC)) {
      bag.moves.push({
        mode: 'dynamic',
        x: i.x ?? 0,
        y: i.y ?? 0,
        z: i.z ?? 0,
        o: i.o ?? 0,
        facingOnly: false,
      });
    }
  }

  const pauseBag = world?.waypointPauses ?? [];
  if (pauseBag.length) {
    for (const p of pauseBag) bag.pauses.push({ doPause: p.doPause });
  } else {
    for (const i of (intents ?? []).filter((x) => x.kind === PAUSE_WAYPOINTS)) {
      if (typeof i.doPause === 'boolean') bag.pauses.push({ doPause: i.doPause });
    }
  }

  const selfBag = world?.selfDespawns ?? [];
  if (selfBag.length) {
    for (const d of selfBag) {
      bag.despawns.push({
        despawnDelay: d.despawnDelay | 0,
        entry: d.entry ?? source?.entry,
        dbGuid: d.dbGuid ?? source?.dbGuid,
      });
    }
  } else {
    for (const i of (intents ?? []).filter((x) => x.kind === DESPAWN_SELF)) {
      bag.despawns.push({
        despawnDelay: (i.despawnDelay ?? 0) | 0,
        entry: source?.entry,
        dbGuid: source?.dbGuid,
      });
    }
  }

  const empty =
    bag.moves.length === 0
    && bag.runs.length === 0
    && bag.pauses.length === 0
    && bag.facings.length === 0
    && bag.despawns.length === 0;
  return empty ? null : bag;
}

function stampMove(body: EscortBody, move: EscortBag['moves'][number]): void {
  if (move.facingOnly) {
    body.o = move.o;
    return;
  }
  body.x = move.x;
  body.y = move.y;
  body.z = move.z;
  if (move.o) body.o = move.o;
}

function stampDespawn(body: EscortBody, delay: number): void {
  if (delay === 0) {
    // ForcedDespawn(0) — remove from floor / mark dead. Cite: ScriptMgr.cpp:2248.
    if ('state' in body) body.state = 'dead';
    body.spawned = false;
    body.alive = false;
  } else {
    body.despawnDelay = delay;
  }
}

/** Stamp source + matching live bodies (entry / dbGuid / guid). */
export function applyEscort(
  bag: EscortBag | null,
  opts?: {
    source?: EscortSource | null;
    bodies?: Array<EscortBody | null | undefined> | null;
  },
): void {
  if (!bag) return;
  const source = opts?.source;
  const sourceOk = source && source.kind !== 'player';

  for (const move of bag.moves) {
    if (sourceOk) stampMove(source, move);
    for (const body of opts?.bodies ?? []) {
      if (!body) continue;
      if (!matchesBody(body, bag.sourceEntry, bag.sourceDbGuid)) continue;
      stampMove(body, move);
    }
  }

  for (const face of bag.facings) {
    if (sourceOk) source.o = face.orientation;
    for (const body of opts?.bodies ?? []) {
      if (!body) continue;
      if (!matchesBody(body, bag.sourceEntry, bag.sourceDbGuid)) continue;
      body.o = face.orientation;
    }
  }

  for (const run of bag.runs) {
    if (sourceOk) source.walking = run.walking;
    for (const body of opts?.bodies ?? []) {
      if (!body) continue;
      if (!matchesBody(body, bag.sourceEntry, bag.sourceDbGuid)) continue;
      body.walking = run.walking;
    }
  }

  for (const pause of bag.pauses) {
    if (sourceOk) source.waypointsPaused = pause.doPause;
    for (const body of opts?.bodies ?? []) {
      if (!body) continue;
      if (!matchesBody(body, bag.sourceEntry, bag.sourceDbGuid)) continue;
      body.waypointsPaused = pause.doPause;
    }
  }

  for (const despawn of bag.despawns) {
    if (
      sourceOk
      && (despawn.entry == null || source.entry === despawn.entry
        || (despawn.dbGuid != null && source.dbGuid === despawn.dbGuid))
    ) {
      stampDespawn(source, despawn.despawnDelay);
    }
    for (const body of opts?.bodies ?? []) {
      if (!body) continue;
      if (!matchesBody(body, despawn.entry, despawn.dbGuid)) continue;
      stampDespawn(body, despawn.despawnDelay);
    }
  }
}

/** Collect + apply in one call (quest / gossip hosts). */
export function applyEscortFromDbScript(
  world: EscortWorldBag | undefined,
  intents?: readonly EscortIntent[],
  opts?: {
    source?: EscortSource | null;
    bodies?: Array<EscortBody | null | undefined> | null;
  },
): EscortBag | null {
  const bag = collectEscort(world, intents);
  applyEscort(bag, {
    source: opts?.source ?? world?.source ?? null,
    bodies: opts?.bodies,
  });
  return bag;
}
