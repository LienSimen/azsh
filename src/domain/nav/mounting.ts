// Where a mount may be summoned. Port of Spell::CheckCast for SPELL_AURA_MOUNTED
// (Spell.cpp:5743-5795) plus the outdoors gate every mount spell carries (Spell.cpp:4604-4612).
// `mounts.ts` owns WHETHER the rider may use the item; this owns whether the ground allows it.

import instanceMapsJson from '../../data/tables/instanceMaps.json' with { type: 'json' };
import type { Character } from '../character/character.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { Check } from '../items/mounts.ts';
import { pickBestUsableMount } from './speed.ts';

interface InstanceMapRow {
  map: number;
  instanceType: number;
  mountAllowed: boolean;
}

const MOUNT_ALLOWED = new Map<number, boolean>();
for (const r of instanceMapsJson as readonly InstanceMapRow[]) {
  MOUNT_ALLOWED.set(r.map | 0, r.mountAllowed !== false);
}

// Map::IsMountAllowed (Map.cpp:2951-2959). An unknown map is permitted, as the core permits
// anything that is not a dungeon — the battlegrounds included.
export function mountAllowedOnMap(mapId: number): boolean {
  return MOUNT_ALLOWED.get(mapId | 0) ?? true;
}

export interface MountLocation {
  mapId: number;
  /** `isOutdoorsForMap`; null when the map ships no bitset, taking the core's no-WMO default. */
  outdoors: boolean | null;
  inCombat?: boolean;
  /** Unit::IsInWater — Spell.cpp:5745 refuses a mount in deep liquid. */
  inWater?: boolean;
}

/** The location half alone, for a caller that has no rider yet (a HUD button's enabled state). */
export function mountAllowedAt(loc: MountLocation): Check {
  if (loc.inWater) return { ok: false, reason: 'You cannot mount above water here' };
  if (!mountAllowedOnMap(loc.mapId)) return { ok: false, reason: "You can't mount here" };
  // Spell.cpp:4605-4607 — the attribute is on every mount spell, and an unbaked map answers null,
  // which GridMap.cpp:897 treats as open sky.
  if (loc.outdoors === false) return { ok: false, reason: 'You can only use that outdoors' };
  return { ok: true };
}

/** One body a surface may put on a mount — a battleground seat or a party member on the floor. */
export interface MountBody {
  side: string;
  pos: { x: number; y: number };
  z: number;
  alive: boolean;
  /** In contact with something hostile — a mount drops on entering combat and goes back up after. */
  inCombat: boolean;
}

export interface MountFieldDeps {
  mapId: number;
  /** The player's own best usable mount percent, or null when they own none they may ride. */
  mountPct: number | null;
  /** `isOutdoorsForMap`; null where the map ships no bitset. */
  outdoorsAt: (x: number, y: number, z: number) => boolean | null;
}

/** The mount this body may ride where it stands, or null for every reason it may not. */
export function mountForBody(
  body: MountBody,
  deps: MountFieldDeps,
): { speedPct: number } | null {
  if (!body.alive || body.inCombat) return null;
  if (deps.mountPct == null || !(deps.mountPct > 0)) return null;
  const ok = mountAllowedAt({
    mapId: deps.mapId,
    outdoors: deps.outdoorsAt(body.pos.x, body.pos.y, body.z),
    inCombat: false,
  }).ok;
  return ok ? { speedPct: deps.mountPct } : null;
}

// The best mount percent this rider owns and may use, off the same bags the travel screen reads
// (travel.ts:246), so what a player rides on the floor is what shortens their zone hop.
export function bestMountPctFor(
  char: Character,
  stacks: readonly { item: number; count: number }[],
  itemOf: (entry: number) => ItemDef | null | undefined,
): number | null {
  const owned: ItemDef[] = [];
  const seen = new Set<number>();
  for (const st of stacks) {
    if (st.count <= 0 || seen.has(st.item)) continue;
    const it = itemOf(st.item);
    if (!it || (it.mountSpeedPct == null && it.mountSpell == null)) continue;
    seen.add(st.item);
    owned.push(it);
  }
  // Out of combat by construction — a body that IS in combat is refused by mountForBody first.
  return pickBestUsableMount(char, owned, false)?.mountSpeedPct ?? null;
}

/** Ride or step off every body a surface owns, and return how many are riding after. */
export function syncMountedBodies(
  bodies: Iterable<MountBody>,
  deps: MountFieldDeps,
  setMounted: (side: string, mount: { speedPct: number } | null) => void,
): number {
  let riding = 0;
  for (const body of bodies) {
    const mount = mountForBody(body, deps);
    setMounted(body.side, mount);
    if (mount) riding++;
  }
  return riding;
}
