// Apply OPEN_DOOR / CLOSE_DOOR + GO spawn/despawn/lock/reset onto goRuntime. Cite: ScriptMgr.cpp:2055–2094;
// :1980–2025; :2864–2871; :2478–2503; :2907–2923.

import type { DbScriptRow, GameObjectDef } from '../../data/schema.ts';
import {
  firstDungeonGameObjectForEntry,
  getDungeonGameObject,
} from '../../data/dungeonGameObjects.ts';
import { executeDbScripts } from '../../domain/quests/interpreter/dbscript/vm.ts';
import {
  createEmptyWorld,
  type DbScriptIntent,
  type ScriptActor,
  type ScriptWorldState,
} from '../../domain/quests/interpreter/dbscript/types.ts';
import {
  GO_FLAG_LOCKED,
  GO_FLAG_NO_INTERACT,
  GO_STATE_ACTIVE,
  GO_STATE_READY,
} from '../../domain/quests/interpreter/dbscript/opcodes.ts';
import {
  collectExploreQuestIds,
  collectFailedQuestIds,
  collectKillCreditEntries,
  fireGoEventScripts,
  type FireGoEventResult,
} from '../../domain/world/goEventFire.ts';
import type { GoRuntimeState } from '../../domain/world/gameObjects.ts';
import type { DbScriptContext } from '../../domain/quests/interpreter/dbscript/types.ts';

/** Ratchet kinds — product host must name these outside interpreter/dbscript/. */
const RESPAWN_GAMEOBJECT = 'respawn_gameobject';
const DESPAWN_GO = 'despawn_go';
const GO_LOCK_STATE = 'go_lock_state';
const RESET_GO = 'reset_go';

/** DataStore rows for both go-use streams: guid-keyed dbscripts_on_go_use + template-keyed. */
export type GoUseScriptSource = {
  goGuidScripts?: (goGuid: number) => readonly DbScriptRow[];
  goTemplateScripts?: (goEntry: number) => readonly DbScriptRow[];
};

export type DoorRecord = {
  goGuid: number;
  opened: boolean;
  closed: boolean;
};

export type GoScriptBagIntent = {
  kind: string;
  goFlags?: number;
  reset?: boolean;
  goType?: number;
};

function patchGoRuntime(
  goRuntime: Record<string, GoRuntimeState> | undefined,
  key: string,
  patch: Partial<GoRuntimeState>,
): Record<string, GoRuntimeState> {
  return { ...(goRuntime ?? {}), [key]: { ...(goRuntime?.[key] ?? {}), ...patch } };
}

function entryFromGoGuid(goGuid: number): number {
  return getDungeonGameObject(goGuid)?.entry ?? 0;
}

export function lookupDungeonGoActor(
  goGuid: number,
  opts: {
    goRuntime?: Record<string, GoRuntimeState>;
    goRuntimeKey: (entry: number) => string;
    gameObject?: (entry: number) => GameObjectDef | undefined;
  },
): ScriptActor | null {
  const spawn = getDungeonGameObject(goGuid);
  if (!spawn) return null;
  const def = opts.gameObject?.(spawn.entry);
  const rt = opts.goRuntime?.[opts.goRuntimeKey(spawn.entry)];
  // Honor prior DESPAWN_GO so RESPAWN in a later stream sees spawned:false.
  const spawned = rt?.spawned !== false;
  let goState: number;
  if (rt?.open === true) goState = GO_STATE_ACTIVE;
  else if (rt?.open === false) goState = GO_STATE_READY;
  else goState = def?.door?.startOpen || def?.button?.startOpen ? GO_STATE_ACTIVE : GO_STATE_READY;
  let goFlags = 0;
  if (rt?.locked) goFlags |= GO_FLAG_LOCKED;
  if (rt?.noInteract) goFlags |= GO_FLAG_NO_INTERACT;
  return {
    kind: 'gameobject',
    entry: spawn.entry,
    dbGuid: goGuid,
    goType: spawn.type,
    goState,
    goFlags: goFlags || undefined,
    spawned,
    alive: true,
  };
}

export function applyDoorRecords(
  records: readonly DoorRecord[],
  goRuntime: Record<string, GoRuntimeState> | undefined,
  goRuntimeKey: (entry: number) => string,
  log?: (msg: string) => void,
): Record<string, GoRuntimeState> | undefined {
  let next = goRuntime;
  for (const rec of records) {
    const spawn = getDungeonGameObject(rec.goGuid);
    const entry = spawn?.entry ?? 0;
    if (!entry || (!rec.closed && !rec.opened)) continue;
    const key = goRuntimeKey(entry);
    const open = !rec.closed;
    next = { ...(next ?? {}), [key]: { ...(next?.[key] ?? {}), open } };
    log?.(rec.closed ? `Door ${entry} closes.` : `Door ${entry} opens.`);
  }
  return next;
}

// RESPAWN / DESPAWN_GO / GO_LOCK_STATE / RESET_GO → goRuntime. Rejected respawn modes change nothing. Cite:
// ScriptMgr.cpp:1980–2025, :2864–2871, :2478–2503, :2907–2923.
export function applyGoScriptBags(
  world: {
    goRespawns?: ReadonlyArray<{ goGuid: number; despawnDelay: number; mode: string }>;
    goDespawns?: ReadonlyArray<{ despawnDelay: number; dbGuid?: number; entry?: number }>;
    goResets?: ReadonlyArray<{ goType: number; reset: boolean }>;
    source?: ScriptActor | null;
    target?: ScriptActor | null;
  } | undefined,
  intents: readonly GoScriptBagIntent[] | undefined,
  goRuntime: Record<string, GoRuntimeState> | undefined,
  goRuntimeKey: (entry: number) => string,
  log?: (msg: string) => void,
): Record<string, GoRuntimeState> | undefined {
  let next = goRuntime;
  // Keep kind string literals in this product host file (unhosted ratchet).
  const bagIntents = (intents ?? []).filter(
    (i) =>
      i.kind === RESPAWN_GAMEOBJECT
      || i.kind === DESPAWN_GO
      || i.kind === GO_LOCK_STATE
      || i.kind === RESET_GO,
  );

  for (const rec of world?.goRespawns ?? []) {
    if (rec.mode !== 'respawn' && rec.mode !== 'refresh') continue;
    // goGuid 0 → source GO (ScriptMgr.cpp:1993–1998).
    const entry =
      entryFromGoGuid(rec.goGuid | 0)
      || (world?.source?.kind === 'gameobject' ? ((world.source.entry ?? 0) | 0) : 0);
    if (!entry) continue;
    next = patchGoRuntime(next, goRuntimeKey(entry), { spawned: true });
    log?.(`GO ${entry} respawns (${rec.mode}).`);
  }

  for (const rec of world?.goDespawns ?? []) {
    const entry =
      ((rec.entry ?? 0) | 0)
      || (rec.dbGuid ? entryFromGoGuid(rec.dbGuid | 0) : 0);
    if (!entry) continue;
    const delay = rec.despawnDelay | 0;
    if (delay === 0) {
      next = patchGoRuntime(next, goRuntimeKey(entry), { spawned: false, despawnDelay: undefined });
      log?.(`GO ${entry} despawns.`);
    } else {
      // Persist delay only — no invented ticker. Cite: ScriptMgr.cpp:2864–2871.
      next = patchGoRuntime(next, goRuntimeKey(entry), { despawnDelay: delay });
    }
  }

  for (const i of bagIntents) {
    if (i.kind !== GO_LOCK_STATE) continue;
    const entry = world?.source?.kind === 'gameobject' ? ((world.source.entry ?? 0) | 0) : 0;
    if (!entry) continue;
    const goFlags = (i.goFlags ?? world?.source?.goFlags ?? 0) | 0;
    next = patchGoRuntime(next, goRuntimeKey(entry), {
      locked: (goFlags & GO_FLAG_LOCKED) !== 0,
      noInteract: (goFlags & GO_FLAG_NO_INTERACT) !== 0,
    });
  }
  // source.goFlags bag when intent omitted flags but handler stamped the actor.
  if (world?.source?.kind === 'gameobject' && world.source.goFlags != null) {
    const entry = ((world.source.entry ?? 0) | 0);
    if (entry) {
      const goFlags = world.source.goFlags | 0;
      next = patchGoRuntime(next, goRuntimeKey(entry), {
        locked: (goFlags & GO_FLAG_LOCKED) !== 0,
        noInteract: (goFlags & GO_FLAG_NO_INTERACT) !== 0,
      });
    }
  }

  for (const rec of world?.goResets ?? []) {
    if (!rec.reset) continue;
    const t = world?.target?.kind === 'gameobject' ? world.target : null;
    const s = world?.source?.kind === 'gameobject' ? world.source : null;
    const entry = ((t?.entry ?? 0) | 0) || ((s?.entry ?? 0) | 0);
    if (!entry) continue;
    // ResetDoorOrButton → closed/ready. Cite: ScriptMgr.cpp:2917.
    next = patchGoRuntime(next, goRuntimeKey(entry), { open: false });
    log?.(`GO ${entry} resets (closed).`);
  }

  return next;
}

/** Door records + GO spawn/despawn/lock/reset bags in one pass. */
export function applyDoorAndGoBags(
  world: ScriptWorldState | undefined,
  intents: readonly GoScriptBagIntent[] | undefined,
  goRuntime: Record<string, GoRuntimeState> | undefined,
  goRuntimeKey: (entry: number) => string,
  log?: (msg: string) => void,
): Record<string, GoRuntimeState> | undefined {
  let next = applyDoorRecords(world?.doorOpens ?? [], goRuntime, goRuntimeKey, log);
  next = applyGoScriptBags(world, intents, next, goRuntimeKey, log);
  return next;
}

function applyDoorsFromEventFire(
  fired: readonly FireGoEventResult[],
  goRuntime: Record<string, GoRuntimeState> | undefined,
  goRuntimeKey: (entry: number) => string,
  log?: (msg: string) => void,
): Record<string, GoRuntimeState> | undefined {
  const recs: DoorRecord[] = [];
  for (const f of fired) recs.push(...(f.vm?.world.doorOpens ?? []));
  return applyDoorRecords(recs, goRuntime, goRuntimeKey, log);
}

function goUseRows(src: GoUseScriptSource, goEntry: number, goGuid: number): DbScriptRow[] {
  const byGuid = goGuid > 0 ? (src.goGuidScripts?.(goGuid) ?? []) : [];
  const byEntry = src.goTemplateScripts?.(goEntry) ?? [];
  return [...byGuid, ...byEntry];
}

export function fireGoUseDoorScripts(opts: GoUseScriptSource & {
  goEntry: number;
  goGuid?: number;
  goRuntime?: Record<string, GoRuntimeState>;
  goRuntimeKey: (entry: number) => string;
  gameObject?: (entry: number) => GameObjectDef | undefined;
  log?: (msg: string) => void;
  evaluateCondition?: DbScriptContext['evaluateCondition'];
}): {
  goRuntime: Record<string, GoRuntimeState> | undefined;
  closed: number[];
  opened: number[];
  exploreQuestIds: number[];
  killCreditEntries: number[];
  failedQuestIds: number[];
  world?: ScriptWorldState;
  intents?: DbScriptIntent[];
} {
  const guid = (opts.goGuid ?? firstDungeonGameObjectForEntry(opts.goEntry)?.guid ?? 0) | 0;
  const rows = goUseRows(opts, opts.goEntry, guid);
  if (!rows.length) {
    return {
      goRuntime: opts.goRuntime,
      closed: [],
      opened: [],
      exploreQuestIds: [],
      killCreditEntries: [],
      failedQuestIds: [],
    };
  }

  const cache = new Map<number, ScriptActor | null>();
  const lookup = (g: number): ScriptActor | null => {
    if (cache.has(g)) return cache.get(g) ?? null;
    const a = lookupDungeonGoActor(g, opts);
    cache.set(g, a);
    return a;
  };

  const rtFallback = opts.goRuntime?.[opts.goRuntimeKey(opts.goEntry)];
  const source: ScriptActor = lookup(guid) ?? {
    kind: 'gameobject',
    entry: opts.goEntry,
    dbGuid: guid || undefined,
    spawned: rtFallback?.spawned !== false,
    alive: true,
  };
  const vm = executeDbScripts(rows, {
    world: createEmptyWorld(source, { kind: 'player' }),
    lookupGameObjectByGuid: lookup,
    table: guid ? 'dbscripts_on_go_use' : 'dbscripts_on_go_template_use',
    phase: 'go_use',
    evaluateCondition: opts.evaluateCondition,
  });

  const next = applyDoorAndGoBags(
    vm.world,
    vm.intents,
    opts.goRuntime,
    opts.goRuntimeKey,
    opts.log,
  );
  const closed: number[] = [];
  const opened: number[] = [];
  for (const rec of vm.world.doorOpens) {
    const entry = getDungeonGameObject(rec.goGuid)?.entry ?? 0;
    if (rec.closed && entry) closed.push(entry);
    else if (rec.opened && entry) opened.push(entry);
  }
  return {
    goRuntime: next,
    closed,
    opened,
    exploreQuestIds: collectExploreQuestIds(vm),
    killCreditEntries: collectKillCreditEntries(vm),
    failedQuestIds: collectFailedQuestIds(vm),
    world: vm.world,
    intents: vm.intents,
  };
}

/** Event fire + go-use scripts; apply OPEN_DOOR / CLOSE_DOOR onto goRuntime. */
export function applyGoUseAndEventDoors(opts: GoUseScriptSource & {
  goEntry: number;
  firedEventId?: number;
  eventScripts: (eventId: number) => readonly DbScriptRow[];
  goRuntime?: Record<string, GoRuntimeState>;
  goRuntimeKey: (entry: number) => string;
  gameObject?: (entry: number) => GameObjectDef | undefined;
  log?: (msg: string) => void;
  evaluateCondition?: DbScriptContext['evaluateCondition'];
}): {
  goRuntime: Record<string, GoRuntimeState> | undefined;
  exploreQuestIds: number[];
  /** Cite: ScriptMgr.cpp:1947-1978 KILL_CREDIT, from both the event and the go-use run. */
  killCreditEntries: number[];
  /** Cite: ScriptMgr.cpp:2719–2734 TERMINATE_COND failQuest. */
  failedQuestIds: number[];
  fired: FireGoEventResult | null;
  /** Event + go-use worlds for tail/relay host. */
  scriptRuns: Array<{ world: ScriptWorldState; intents: DbScriptIntent[] }>;
} {
  const cache = new Map<number, ScriptActor | null>();
  const lookup = (g: number): ScriptActor | null => {
    if (cache.has(g)) return cache.get(g) ?? null;
    const a = lookupDungeonGoActor(g, opts);
    cache.set(g, a);
    return a;
  };

  let goRuntime = opts.goRuntime;
  const exploreQuestIds: number[] = [];
  const killCreditEntries: number[] = [];
  const failedQuestIds: number[] = [];
  const scriptRuns: Array<{ world: ScriptWorldState; intents: DbScriptIntent[] }> = [];
  let fired: FireGoEventResult | null = null;
  const eventId = (opts.firedEventId ?? 0) | 0;
  if (eventId > 0) {
    fired = fireGoEventScripts(eventId, opts.eventScripts(eventId), {
      goEntry: opts.goEntry,
      lookupGameObjectByGuid: lookup,
      evaluateCondition: opts.evaluateCondition,
    });
    exploreQuestIds.push(...fired.exploreQuestIds);
    killCreditEntries.push(...fired.killCreditEntries);
    for (const q of fired.failedQuestIds) if (!failedQuestIds.includes(q)) failedQuestIds.push(q);
    goRuntime = applyDoorAndGoBags(
      fired.vm?.world,
      fired.vm?.intents,
      goRuntime,
      opts.goRuntimeKey,
      opts.log,
    );
    if (fired.vm) scriptRuns.push({ world: fired.vm.world, intents: fired.vm.intents });
  }

  // Same run as fireGoTemplateUseScripts (GameObject.cpp:1424-1426) — credits included.
  const used = fireGoUseDoorScripts({ ...opts, goRuntime });
  for (const q of used.exploreQuestIds) if (!exploreQuestIds.includes(q)) exploreQuestIds.push(q);
  for (const e of used.killCreditEntries) if (!killCreditEntries.includes(e)) killCreditEntries.push(e);
  for (const q of used.failedQuestIds) if (!failedQuestIds.includes(q)) failedQuestIds.push(q);
  if (used.world) scriptRuns.push({ world: used.world, intents: used.intents ?? [] });
  return {
    goRuntime: used.goRuntime,
    exploreQuestIds,
    killCreditEntries,
    failedQuestIds,
    fired,
    scriptRuns,
  };
}
