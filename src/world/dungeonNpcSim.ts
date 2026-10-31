/**
 * L09 — instance NPC live state for lockstep sim (not a view model).
 *
 * Door/chest GO state lives with GOs; NPC open world peers must share the same
 * npcFlags and position from the same orders. Seed from dungeonSpawns bake;
 * mutate only via pure helpers (no Date/random/Map-iteration decisions).
 *
 * Cite: Unit.h UNIT_NPC_FLAG_*; ScriptMgr.cpp MODIFY_NPC_FLAGS; dlive L09.
 */

import {
  dungeonNpcsForMap,
  type DungeonSpawn,
} from '../data/dungeonSpawns.ts';

/** Cite: ScriptMgr.cpp:2514–2536 change_flag modes. */
export const NPC_FLAG_CHANGE_REMOVE = 0;
export const NPC_FLAG_CHANGE_ADD = 1;
export const NPC_FLAG_CHANGE_TOGGLE = 2;

export type DungeonNpcLive = {
  guid: number;
  entry: number;
  map: number;
  x: number;
  y: number;
  z: number;
  o: number;
  npcFlags: number;
  name?: string;
};

/** Seed sim NPC rows for a map — sorted by guid (stable lockstep order). */
export function seedDungeonNpcState(mapId: number): DungeonNpcLive[] {
  const npcs = dungeonNpcsForMap(mapId);
  const out: DungeonNpcLive[] = new Array(npcs.length);
  for (let i = 0; i < npcs.length; i++) {
    const s = npcs[i]!;
    out[i] = liveFromSpawn(s);
  }
  return out;
}

export function liveFromSpawn(s: DungeonSpawn): DungeonNpcLive {
  return {
    guid: s.guid,
    entry: s.entry,
    map: s.map,
    x: s.x,
    y: s.y,
    z: s.z,
    o: s.o,
    npcFlags: s.npcFlags ?? 0,
    ...(s.name ? { name: s.name } : {}),
  };
}

/** Binary search by guid on a guid-sorted array. */
export function findNpcIndex(state: readonly DungeonNpcLive[], guid: number): number {
  let lo = 0;
  let hi = state.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const g = state[mid]!.guid;
    if (g === guid) return mid;
    if (g < guid) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export function getNpcLive(
  state: readonly DungeonNpcLive[],
  guid: number,
): DungeonNpcLive | undefined {
  const i = findNpcIndex(state, guid);
  return i >= 0 ? state[i] : undefined;
}

// MODIFY_NPC_FLAGS — pure. Returns a new array when the guid is present. changeFlag: 0 remove, 1 add, 2
// toggle. Cite: ScriptMgr.cpp:2514–2536.
export function applyNpcFlagChange(
  state: readonly DungeonNpcLive[],
  guid: number,
  flag: number,
  changeFlag: number,
): DungeonNpcLive[] {
  const i = findNpcIndex(state, guid);
  if (i < 0) return state as DungeonNpcLive[];
  const cur = state[i]!;
  let flags = cur.npcFlags | 0;
  const f = flag | 0;
  if (changeFlag === NPC_FLAG_CHANGE_REMOVE) flags = flags & ~f;
  else if (changeFlag === NPC_FLAG_CHANGE_ADD) flags = flags | f;
  else if (changeFlag === NPC_FLAG_CHANGE_TOGGLE) {
    if ((flags & f) !== 0) flags = flags & ~f;
    else flags = flags | f;
  } else {
    return state as DungeonNpcLive[];
  }
  if (flags === cur.npcFlags) return state as DungeonNpcLive[];
  const next = state.slice();
  next[i] = { ...cur, npcFlags: flags };
  return next;
}

/** Relocate an NPC (scripted move / escort). Pure; no pathing here. */
export function placeNpcAt(
  state: readonly DungeonNpcLive[],
  guid: number,
  x: number,
  y: number,
  z?: number,
  o?: number,
): DungeonNpcLive[] {
  const i = findNpcIndex(state, guid);
  if (i < 0) return state as DungeonNpcLive[];
  const cur = state[i]!;
  const next = state.slice();
  next[i] = {
    ...cur,
    x,
    y,
    z: z ?? cur.z,
    o: o ?? cur.o,
  };
  return next;
}

/** World positions for map pins — same order as state (guid-sorted). */
export function npcWorldPositions(
  state: readonly DungeonNpcLive[],
): { guid: number; entry: number; x: number; y: number; z: number; npcFlags: number }[] {
  const out = new Array(state.length);
  for (let i = 0; i < state.length; i++) {
    const n = state[i]!;
    out[i] = {
      guid: n.guid,
      entry: n.entry,
      x: n.x,
      y: n.y,
      z: n.z,
      npcFlags: n.npcFlags,
    };
  }
  return out;
}
