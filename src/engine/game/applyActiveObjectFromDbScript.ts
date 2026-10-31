// SET_ACTIVEOBJECT host — persist active on the script actor + matching live bodies. Cite:
// ScriptMgr.cpp:2367–2376; Object.cpp:2563–2578 SetActiveObjectState.

/** Ratchet kind — product host must name it outside interpreter/dbscript/. */
const SET_ACTIVE_OBJECT = 'set_active_object';

export type ActiveObjectIntent = {
  kind: string;
  active?: boolean;
};

export type ActiveObjectSource = {
  kind?: string;
  active?: boolean;
  entry?: number;
  dbGuid?: number;
};

export type ActiveObjectWorldBag = {
  source?: ActiveObjectSource | null;
};

export type ActiveObjectBag = {
  active: boolean;
  entry?: number;
  dbGuid?: number;
};

/** Live floor / temp body the host can stamp. */
export type ActiveObjectBody = {
  entry?: number;
  dbGuid?: number;
  guid?: number;
  active?: boolean;
};

// Collect SET_ACTIVEOBJECT. Player sources skipped (C++ logs and breaks). Cite: ScriptMgr.cpp:2367–2376.
export function collectActiveObject(
  world: ActiveObjectWorldBag | undefined,
  intents?: readonly ActiveObjectIntent[],
): ActiveObjectBag | null {
  const source = world?.source;
  if (source?.kind === 'player') return null;

  let active: boolean | undefined;
  // Filter so the kind string literal stays in this product host file (unhosted ratchet).
  for (const i of (intents ?? []).filter((x) => x.kind === SET_ACTIVE_OBJECT)) {
    if (typeof i.active === 'boolean') active = i.active;
  }
  if (active === undefined && typeof source?.active === 'boolean') {
    active = source.active;
  }
  if (active === undefined) return null;
  return {
    active,
    entry: source?.entry,
    dbGuid: source?.dbGuid,
  };
}

/** Stamp source + matching live bodies (entry / dbGuid). */
export function applyActiveObject(
  bag: ActiveObjectBag | null,
  opts?: {
    source?: ActiveObjectSource | null;
    bodies?: Array<ActiveObjectBody | null | undefined> | null;
  },
): void {
  if (!bag) return;
  if (opts?.source && opts.source.kind !== 'player') {
    opts.source.active = bag.active;
  }
  for (const body of opts?.bodies ?? []) {
    if (!body) continue;
    const byEntry = bag.entry != null && body.entry === bag.entry;
    const byGuid =
      bag.dbGuid != null
      && (body.dbGuid === bag.dbGuid || body.guid === bag.dbGuid);
    if (byEntry || byGuid) body.active = bag.active;
  }
}

/** Collect + apply in one call (quest / gossip hosts). */
export function applyActiveObjectFromDbScript(
  world: ActiveObjectWorldBag | undefined,
  intents?: readonly ActiveObjectIntent[],
  opts?: {
    source?: ActiveObjectSource | null;
    bodies?: Array<ActiveObjectBody | null | undefined> | null;
  },
): ActiveObjectBag | null {
  const bag = collectActiveObject(world, intents);
  applyActiveObject(bag, {
    source: opts?.source ?? world?.source ?? null,
    bodies: opts?.bodies,
  });
  return bag;
}
