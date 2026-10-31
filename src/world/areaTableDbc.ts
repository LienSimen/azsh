// AreaTable.dbc ID → MapID. Cite: DBCStructure.h AreaTableEntry mapid @1; emit-view.mjs:453.
// Pin de8f72993b9e1faa1bf92dd5505f3daec5cea3ce. Field 0 = ID, field 1 = m_ContinentID.

import { AREA_TABLE_MAP_ID_PAIRS } from './areaTableMapIdPairs.ts';

const WDBC_MAGIC = 0x43424457; // 'WDBC' little-endian

/** Parse AreaTable.dbc records into areaId → mapid. Throws if the buffer is not WDBC. */
export function parseAreaTableMapIds(buf: Uint8Array): Map<number, number> {
  if (buf.byteLength < 20) throw new Error('AreaTable.dbc: truncated header');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint32(0, true) !== WDBC_MAGIC) throw new Error('AreaTable.dbc: not WDBC');
  const nRec = view.getUint32(4, true);
  const nField = view.getUint32(8, true);
  const recSize = view.getUint32(12, true);
  if (nField < 2 || recSize < 8) throw new Error(`AreaTable.dbc: fields=${nField} recSize=${recSize}`);
  const need = 20 + nRec * recSize;
  if (buf.byteLength < need) throw new Error('AreaTable.dbc: truncated records');
  const out = new Map<number, number>();
  for (let i = 0; i < nRec; i++) {
    const o = 20 + i * recSize;
    out.set(view.getUint32(o, true), view.getUint32(o + 4, true));
  }
  return out;
}

/** Build areaId → mapid from packed [id, mapid, …] pairs sourced from AreaTable.dbc. */
export function areaTableMapIdsFromPairs(pairs: readonly number[]): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 0; i + 1 < pairs.length; i += 2) out.set(pairs[i]!, pairs[i + 1]!);
  return out;
}

let cached: Map<number, number> | undefined;

/** Browser-safe AreaTable mapid lookup. Smoke asserts this equals parseAreaTableMapIds(live DBC). */
export function areaTableMapIds(): Map<number, number> {
  return cached ??= areaTableMapIdsFromPairs(AREA_TABLE_MAP_ID_PAIRS);
}
