// L06 — stamp boss spawnGuids + origin from cluster packs and the dungeonSpawns bake. Clustering
// still decides WHAT fights together; this pass carries WHERE, in world yards.
import type { EncounterDef, InstanceDef } from '../schema.ts';
import { dungeonSpawnsForMap, resolveSpawnMembers } from '../dungeonSpawns.ts';
import {
  attachBossClusterGeometry,
  modalFloorCentroid,
  wingFilterByNearestBoss,
} from './pack-from-clusters.ts';

/** A pack centroid sits a few yards off its boss; a pool's candidate average does not. */
const ORIGIN_SNAP_YD = 8;

// Fill missing boss spawnGuids from dungeonSpawns on this map (entry match). Prefer the spawn nearest an
// existing origin; deterministic guid order as tiebreak.
export function attachBossGuidsFromDungeonSpawns(
  encounters: EncounterDef[],
  mapId: number,
): EncounterDef[] {
  const spawns = dungeonSpawnsForMap(mapId);
  if (!spawns.length) return encounters;
  const byEntry = new Map<number, typeof spawns[number][]>();
  for (const s of spawns) {
    const list = byEntry.get(s.entry);
    if (list) list.push(s);
    else byEntry.set(s.entry, [s]);
  }
  // A pool slot ships entry = lowest candidate; an encounter for any OTHER candidate
  // (ST's gasher..mijan behind zolo's 5712) finds its slots here.
  const byCandidate = new Map<number, typeof spawns[number][]>();
  for (const s of spawns) {
    for (const c of s.poolCandidates ?? []) {
      if (c === s.entry) continue;
      const list = byCandidate.get(c);
      if (list) list.push(s);
      else byCandidate.set(c, [s]);
    }
  }
  const hitsFor = (entry: number) => byEntry.get(entry) ?? byCandidate.get(entry);

  // Multi-location rares are authored as N sibling stops of one entry (Forresten ×4). Deal the
  // entry's real spawn points out one per sibling, and only re-deal a group whose stops COLLIDE.
  const dealt = new Map<string, typeof spawns[number]>();
  {
    const siblings = new Map<number, EncounterDef[]>();
    for (const enc of encounters) {
      if (enc.kind !== 'boss') continue;
      const list = siblings.get(enc.creatureEntry);
      if (list) list.push(enc);
      else siblings.set(enc.creatureEntry, [enc]);
    }
    for (const [entry, group] of siblings) {
      const hits = byEntry.get(entry);
      if (group.length < 2 || !hits || hits.length < 2) continue;
      const keys = new Set(group.map((e) => (e.spawnGuids ?? []).join(',')));
      if (keys.size === group.length && !keys.has('')) continue;
      const points = [...hits].sort((a, b) => a.guid - b.guid);
      const ids = [...group].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (let i = 0; i < ids.length; i++) dealt.set(ids[i]!.id, points[i % points.length]!);
    }
  }

  // A spawn_group pool is N slots one deal fills; several encounters drawing on ONE group must not
  // all stand on its centroid, which is a point pathTo refuses. One real slot each.
  {
    const byPool = new Map<number, { encs: EncounterDef[]; slots: typeof spawns[number][] }>();
    for (const enc of encounters) {
      if (enc.kind !== 'boss' || enc.spawnGuids?.length || dealt.has(enc.id)) continue;
      const hits = hitsFor(enc.creatureEntry);
      if (!hits || hits.length < 2) continue;
      const sg = hits[0]!.spawnGroupId;
      if (sg == null || !hits.every((h) => h.spawnGroupId === sg)) continue;
      const cur = byPool.get(sg);
      if (cur) cur.encs.push(enc);
      else byPool.set(sg, { encs: [enc], slots: hits });
    }
    for (const [, { encs, slots }] of byPool) {
      if (encs.length < 2) continue; // one consumer keeps nearest-slot semantics below
      const points = [...slots].sort((a, b) => a.guid - b.guid);
      const ids = [...encs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (let i = 0; i < ids.length; i++) dealt.set(ids[i]!.id, points[i % points.length]!);
    }
  }

  return encounters.map((enc) => {
    const share = dealt.get(enc.id);
    if (share) {
      const origin: { x: number; y: number; z?: number } = { x: share.x, y: share.y };
      if (share.z != null && Number.isFinite(share.z)) origin.z = share.z;
      return { ...enc, origin, spawnGuids: [share.guid] };
    }
    if (enc.spawnGuids?.length) {
      const members = resolveSpawnMembers(enc.spawnGuids);
      if (!members?.length) return enc;
      // Same modal-floor reduction the cluster pass uses — a plain mean over a pack that
      // straddles storeys lands between them, which is the defect, not the reference.
      const n = members.length;
      const plain: { x: number; y: number; z?: number } = {
        x: members.reduce((a, m) => a + m.x, 0) / n,
        y: members.reduce((a, m) => a + m.y, 0) / n,
      };
      const zN = members.filter((m) => m.z != null && Number.isFinite(m.z));
      if (zN.length) plain.z = zN.reduce((a, m) => a + (m.z as number), 0) / zN.length;
      const origin = modalFloorCentroid(
        members.map((m) => ({ guid: m.guid, entry: m.entry, x: m.x, y: m.y, z: m.z })),
        plain,
      );
      // Bake pose when the origin is missing; also when an authored origin disagrees
      // with the guids this encounter holds (see ORIGIN_SNAP_YD).
      if (enc.origin && Number.isFinite(enc.origin.x) && Number.isFinite(enc.origin.y)) {
        if (Math.hypot(origin.x - enc.origin.x, origin.y - enc.origin.y) <= ORIGIN_SNAP_YD) {
          return enc;
        }
      }
      return { ...enc, origin };
    }
    if (enc.kind !== 'boss') return enc;
    const hits = hitsFor(enc.creatureEntry);
    if (!hits?.length) return enc;
    // Nearest to authored origin when present; else lowest guid (stable).
    let best = hits[0]!;
    if (enc.origin && Number.isFinite(enc.origin.x) && Number.isFinite(enc.origin.y)) {
      let bestD = Infinity;
      for (const h of hits) {
        const dx = h.x - enc.origin.x;
        const dy = h.y - enc.origin.y;
        const d = dx * dx + dy * dy;
        if (d < bestD || (d === bestD && h.guid < best.guid)) {
          bestD = d;
          best = h;
        }
      }
    } else {
      for (const h of hits) {
        if (h.guid < best.guid) best = h;
      }
    }
    // The stop must stand where the bound creature stands: a survey `avg pos` over a pool is a
    // centroid nothing occupies. Keep an authored origin only while it agrees with that guid.
    const origin: { x: number; y: number; z?: number } = enc.origin
      ? { ...enc.origin }
      : { x: best.x, y: best.y };
    const drift = enc.origin
      ? Math.hypot(best.x - enc.origin.x, best.y - enc.origin.y)
      : Infinity;
    if (!enc.origin || drift > ORIGIN_SNAP_YD) {
      origin.x = best.x;
      origin.y = best.y;
      if (best.z != null && Number.isFinite(best.z)) origin.z = best.z;
    }
    return {
      ...enc,
      origin,
      spawnGuids: [best.guid],
    };
  });
}

/** Registry pass: cluster boss geometry (wing-filtered) then bake guid fill. */
export function withSpawnPlacement(def: InstanceDef): InstanceDef {
  const includePack = def.wing
    ? wingFilterByNearestBoss(def.mapId, def.wing)
    : undefined;
  let encounters = attachBossClusterGeometry(
    def.encounters,
    def.mapId,
    includePack,
  );
  encounters = attachBossGuidsFromDungeonSpawns(encounters, def.mapId);
  return { ...def, encounters };
}
