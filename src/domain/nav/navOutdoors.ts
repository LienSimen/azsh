// Per-polygon indoors/outdoors for a baked map. The client ships no WMO geometry, so the answer
// TerrainInfo::IsOutdoors reads off the vmaps is baked instead. Cite: GridMap.cpp:892-903.

import { findNearestPoly, type NavMesh } from './navmesh.ts';

const MAGIC = 0x444f4350; // 'PCOD' little-endian
const VERSION = 1;
const HEADER_BYTES = 24;

/** One map's outdoors bitset, indexed by the polygon ids of its `<slug>.navmesh.bin`. */
export type OutdoorsMap = {
  mapId: number;
  polyCount: number;
  outdoorCount: number;
  /** Bit p set means poly p is under open sky (IsOutdoorWMO, or no WMO at all). */
  bits: Uint8Array;
};

export function encodeOutdoors(mapId: number, polyCount: number, bits: Uint8Array): Uint8Array {
  const need = (polyCount + 7) >> 3;
  if (bits.length !== need) throw new Error(`outdoors: bitset is ${bits.length} bytes, want ${need}`);
  let outdoorCount = 0;
  for (let p = 0; p < polyCount; p++) if (bits[p >> 3]! & (1 << (p & 7))) outdoorCount++;
  const u8 = new Uint8Array(HEADER_BYTES + need);
  const dv = new DataView(u8.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setInt32(8, mapId, true);
  dv.setUint32(12, polyCount, true);
  dv.setUint32(16, outdoorCount, true);
  dv.setUint32(20, 0, true);
  u8.set(bits, HEADER_BYTES);
  return u8;
}

export function decodeOutdoors(bytes: Uint8Array): OutdoorsMap {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('outdoors: bad magic');
  if (dv.getUint32(4, true) !== VERSION) throw new Error('outdoors: bad version');
  const mapId = dv.getInt32(8, true);
  const polyCount = dv.getUint32(12, true);
  const outdoorCount = dv.getUint32(16, true);
  const need = (polyCount + 7) >> 3;
  if (bytes.length < HEADER_BYTES + need) throw new Error('outdoors: truncated bitset');
  return { mapId, polyCount, outdoorCount, bits: bytes.slice(HEADER_BYTES, HEADER_BYTES + need) };
}

// A poly the bitset does not cover takes the core's no-WMO default rather than reading as a
// ceiling: an absent bit has never meant "indoors" (GridMap.cpp:897).
export function polyIsOutdoors(o: OutdoorsMap, poly: number): boolean {
  if (poly < 0 || poly >= o.polyCount) return true;
  return (o.bits[poly >> 3]! & (1 << (poly & 7))) !== 0;
}

// Under open sky? `null` means no bitset is registered, so the caller decides — sightClearForMap's
// contract. The POLY carries the answer, so a balcony over a hall reads its own storey.
export function outdoorsAtNavMesh(
  o: OutdoorsMap,
  m: NavMesh,
  x: number,
  y: number,
  zHint?: number,
): boolean | null {
  if (o.polyCount !== m.polyCount) return null;
  const hit = findNearestPoly(m, x, y, zHint, 4);
  return hit ? polyIsOutdoors(o, hit.poly) : null;
}

// Registry — mirrors navCollision.ts:586-599

const outdoorsByMapId = new Map<number, OutdoorsMap>();
const outdoorsUrlByMapId = new Map<number, string>();

export function registerOutdoorsForMap(mapId: number, o: OutdoorsMap, sourceUrl?: string): void {
  outdoorsByMapId.set(mapId | 0, o);
  if (sourceUrl) outdoorsUrlByMapId.set(mapId | 0, sourceUrl);
}

/** The URL the map's outdoors bitset came from, or null. */
export function outdoorsSourceUrl(mapId: number): string | null {
  return outdoorsUrlByMapId.get(mapId | 0) ?? null;
}

export function outdoorsForMap(mapId: number): OutdoorsMap | null {
  return outdoorsByMapId.get(mapId | 0) ?? null;
}

export function clearOutdoorsRegistry(mapId?: number): void {
  if (mapId == null) outdoorsByMapId.clear();
  else outdoorsByMapId.delete(mapId | 0);
}
