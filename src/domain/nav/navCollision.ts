// Sight against the client's own collision geometry — the surface the navmesh cannot be, since a
// wall is not a walkable polygon. A function-for-function port of VMapManager2 / BIH / WorldModel.

import { detCos, detHypot3, detSin } from '../../engine/core/detMath.ts';
import { NAV_MID } from './navTypes.ts';

/** ModelSpawn flag, ModelInstance.h:37. */
export const MOD_M2 = 1;

// Eye offset for a sight query: IsWithinLOS adds GetCollisionHeight to BOTH endpoints, so a
// floor-to-floor query would graze the floor. Per-model heights are not baked, so all use this.
export const COLLISION_HEIGHT_YD = 2.03128;

/** BIH.h:31. A deeper tree than this would already be malformed. */
const MAX_STACK_SIZE = 64;

/** g3dmath.h:111 fuzzyEpsilon — the guard BIH::intersectRay puts on a zero direction axis. */
const FUZZY_EPS = 1e-5;

/** MapTree.cpp:161 — below this the two points are the same place and sight is trivially clear. */
const MIN_RAY_YD = 1e-10;

const PCOL_VERSION = 1;
const HEADER_BYTES = 96;
const SLOT_BYTES = 64;
const MODEL_BYTES = 8;
const EMPTY_SLOT = 0xffffffff;

export type CollisionPos = { x: number; y: number; z?: number };

/** One WMO/M2 group: its triangles and the BIH over them (`.vmo` MBIH chunk). */
type ColGroup = {
  verts: Float32Array;
  tris: Uint32Array;
  bihTree: Uint32Array;
  bihObj: Uint32Array;
  bihLo: Float32Array;
  bihHi: Float32Array;
};

/** One `.vmo`: its groups and the BIH over them (`GBIH` chunk). */
type ColModel = {
  groups: ColGroup[];
  groupTree: Uint32Array | null;
  groupObj: Uint32Array | null;
  groupLo: Float32Array | null;
  groupHi: Float32Array | null;
};

// A map's collision. Slots are struct-of-arrays: naxxramas has 7,917 of them and one object each would be
// 7,917 allocations on the load path.
export type CollisionMap = {
  mapId: number;
  models: ColModel[];
  /** -1 = the extractor never wrote that `.vmo`, which is `iModel == nullptr` (MapTree.cpp:399). */
  slotModel: Int32Array;
  slotFlags: Uint32Array;
  slotPos: Float32Array;
  /** Row-major 3x3 per slot — `iInvRot`, ModelInstance.cpp:31. */
  slotInvRot: Float32Array;
  slotInvScale: Float32Array;
  /** World AABox per slot, from the spawn record (TileAssembler.cpp:285 writes it for all). */
  slotBound: Float32Array;
  topTree: Uint32Array;
  topObj: Uint32Array;
  topLo: Float32Array;
  topHi: Float32Array;
  /** Instanced triangle total, straight from the header — for the gate, not the query. */
  triCount: number;
};

// Bit reinterpretation — BIH stores interior clip planes as raw float bits

const BITS = new ArrayBuffer(4);
const BITS_U32 = new Uint32Array(BITS);
const BITS_F32 = new Float32Array(BITS);

/** BIH.h:48 intBitsToFloat. */
function intBitsToFloat(i: number): number {
  BITS_U32[0] = i;
  return BITS_F32[0]!;
}

/** BIH.h:37 floatToRawIntBits, sign bit only — what BIH.h:162 actually uses. */
function floatSignBit(f: number): number {
  BITS_F32[0] = f;
  return BITS_U32[0]! >>> 31;
}

// Decode

// BIH::readFromFile (BIH.cpp:269-284) from a byte offset, returning the word arrays as COPIES —
// a fetch's byteOffset is not guaranteed 4-aligned, the same reason decodeNavMesh copies.
function readBih(
  bytes: Uint8Array,
  at: number,
): { lo: Float32Array; hi: Float32Array; tree: Uint32Array; objects: Uint32Array; end: number } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = at;
  const lo = new Float32Array(3);
  const hi = new Float32Array(3);
  for (let i = 0; i < 3; i++) { lo[i] = dv.getFloat32(o, true); o += 4; }
  for (let i = 0; i < 3; i++) { hi[i] = dv.getFloat32(o, true); o += 4; }
  const treeN = dv.getUint32(o, true); o += 4;
  const tree = new Uint32Array(treeN);
  for (let i = 0; i < treeN; i++) { tree[i] = dv.getUint32(o, true); o += 4; }
  const objN = dv.getUint32(o, true); o += 4;
  const objects = new Uint32Array(objN);
  for (let i = 0; i < objN; i++) { objects[i] = dv.getUint32(o, true); o += 4; }
  return { lo, hi, tree, objects, end: o };
}

function tagAt(bytes: Uint8Array, o: number, tag: string): boolean {
  for (let i = 0; i < tag.length; i++) if (bytes[o + i] !== tag.charCodeAt(i)) return false;
  return true;
}

// A group the writer emitted with zero verts. Never hit, but it still holds its index.
const EMPTY_GROUP: ColGroup = {
  verts: new Float32Array(0),
  tris: new Uint32Array(0),
  bihTree: new Uint32Array(0),
  bihObj: new Uint32Array(0),
  bihLo: new Float32Array(3),
  bihHi: new Float32Array(3),
};

function decodeModel(bytes: Uint8Array, at: number, len: number): ColModel {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = at + len;
  let o = at;
  const empty: ColModel = { groups: [], groupTree: null, groupObj: null, groupLo: null, groupHi: null };
  if (!tagAt(bytes, o, 'VMAP_7.0')) return empty;
  o += 8;
  if (!tagAt(bytes, o, 'WMOD')) return empty;
  o += 4;
  o += 4; // chunk size
  o += 4; // RootWMOID
  if (o + 4 > end || !tagAt(bytes, o, 'GMOD')) return empty;
  o += 4;
  const ngroups = dv.getUint32(o, true); o += 4;
  const groups: ColGroup[] = [];
  for (let g = 0; g < ngroups; g++) {
    o += 24; // iBound AABox, model space — the group tree already carries it
    o += 4; // mogpFlags
    o += 4; // iGroupWMOID
    if (!tagAt(bytes, o, 'VERT')) return { ...empty, groups };
    o += 4;
    o += 4; // chunk size
    const nv = dv.getUint32(o, true); o += 4;
    if (nv === 0) {
      // GroupModel::writeToFile ends the group after the count when there are no verts, but the
      // group still OCCUPIES ITS INDEX — dropping it here shifted every later group by one.
      groups.push(EMPTY_GROUP);
      continue;
    }
    const verts = new Float32Array(nv * 3);
    for (let i = 0; i < nv * 3; i++) { verts[i] = dv.getFloat32(o, true); o += 4; }
    if (!tagAt(bytes, o, 'TRIM')) return { ...empty, groups };
    o += 4;
    o += 4; // chunk size
    const nt = dv.getUint32(o, true); o += 4;
    const tris = new Uint32Array(nt * 3);
    for (let i = 0; i < nt * 3; i++) { tris[i] = dv.getUint32(o, true); o += 4; }
    if (!tagAt(bytes, o, 'MBIH')) return { ...empty, groups };
    o += 4;
    const mb = readBih(bytes, o);
    o = mb.end;
    if (!tagAt(bytes, o, 'LIQU')) return { ...empty, groups };
    o += 4;
    const sz = dv.getUint32(o, true); o += 4;
    if (sz) {
      const tx = dv.getUint32(o, true); o += 4;
      const ty = dv.getUint32(o, true); o += 4;
      o += 12; // iCorner
      o += 4; // iType — on disk, absent from the declared size
      o += 4 * (tx + 1) * (ty + 1); // iHeight
      o += tx * ty; // iFlags
    }
    groups.push({ verts, tris, bihTree: mb.tree, bihObj: mb.objects, bihLo: mb.lo, bihHi: mb.hi });
  }
  if (o + 4 <= end && tagAt(bytes, o, 'GBIH')) {
    const gb = readBih(bytes, o + 4);
    return {
      groups, groupTree: gb.tree, groupObj: gb.objects, groupLo: gb.lo, groupHi: gb.hi,
    };
  }
  return { ...empty, groups };
}

/** PCOL1 → queryable map, or null if the bytes are not one. */
export function decodeCollision(bytes: Uint8Array): CollisionMap | null {
  if (bytes.byteLength < HEADER_BYTES) return null;
  if (!tagAt(bytes, 0, 'PCOL1')) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(8, true) !== PCOL_VERSION) return null;
  const mapId = dv.getUint32(12, true);
  const modelCount = dv.getUint32(16, true);
  const slotCount = dv.getUint32(20, true);
  const topTreeLen = dv.getUint32(24, true);
  const topObjLen = dv.getUint32(28, true);
  const topLo = new Float32Array(3);
  const topHi = new Float32Array(3);
  for (let i = 0; i < 3; i++) topLo[i] = dv.getFloat32(32 + i * 4, true);
  for (let i = 0; i < 3; i++) topHi[i] = dv.getFloat32(44 + i * 4, true);
  const offModels = dv.getUint32(56, true);
  const offSlots = dv.getUint32(64, true);
  const offTopTree = dv.getUint32(68, true);
  const offTopObj = dv.getUint32(72, true);
  const triCount = dv.getUint32(80, true);

  const models: ColModel[] = [];
  for (let i = 0; i < modelCount; i++) {
    const blobOff = dv.getUint32(offModels + i * MODEL_BYTES, true);
    const blobLen = dv.getUint32(offModels + i * MODEL_BYTES + 4, true);
    models.push(decodeModel(bytes, blobOff, blobLen));
  }

  const slotModel = new Int32Array(slotCount);
  const slotFlags = new Uint32Array(slotCount);
  const slotPos = new Float32Array(slotCount * 3);
  const slotInvRot = new Float32Array(slotCount * 9);
  const slotInvScale = new Float32Array(slotCount);
  const slotBound = new Float32Array(slotCount * 6);
  for (let s = 0; s < slotCount; s++) {
    let o = offSlots + s * SLOT_BYTES;
    const mi = dv.getUint32(o, true); o += 4;
    if (mi === EMPTY_SLOT) {
      slotModel[s] = -1;
      continue;
    }
    slotModel[s] = mi;
    slotFlags[s] = dv.getUint32(o, true); o += 4;
    for (let k = 0; k < 3; k++) { slotPos[s * 3 + k] = dv.getFloat32(o, true); o += 4; }
    const ry = (dv.getFloat32(o + 4, true) * Math.PI) / 180;
    const rx = (dv.getFloat32(o, true) * Math.PI) / 180;
    const rz = (dv.getFloat32(o + 8, true) * Math.PI) / 180;
    o += 12;
    const scale = dv.getFloat32(o, true); o += 4;
    slotInvScale[s] = 1 / scale;
    // fromEulerAnglesZYX(...).inverse() — ModelInstance.cpp:31. A rotation matrix's inverse is its
    // transpose, so this writes the transpose of the ETL reader's eulerZyx directly.
    const ca = detCos(ry); const sa = detSin(ry);
    const cb = detCos(rx); const sb = detSin(rx);
    const cc = detCos(rz); const sc = detSin(rz);
    const b = s * 9;
    slotInvRot[b + 0] = ca * cb;
    slotInvRot[b + 1] = sa * cb;
    slotInvRot[b + 2] = -sb;
    slotInvRot[b + 3] = ca * sb * sc - sa * cc;
    slotInvRot[b + 4] = sa * sb * sc + ca * cc;
    slotInvRot[b + 5] = cb * sc;
    slotInvRot[b + 6] = ca * sb * cc + sa * sc;
    slotInvRot[b + 7] = sa * sb * cc - ca * sc;
    slotInvRot[b + 8] = cb * cc;
    for (let k = 0; k < 6; k++) { slotBound[s * 6 + k] = dv.getFloat32(o, true); o += 4; }
  }

  const topTree = new Uint32Array(topTreeLen);
  for (let i = 0; i < topTreeLen; i++) topTree[i] = dv.getUint32(offTopTree + i * 4, true);
  const topObj = new Uint32Array(topObjLen);
  for (let i = 0; i < topObjLen; i++) topObj[i] = dv.getUint32(offTopObj + i * 4, true);

  return {
    mapId, models, slotModel, slotFlags, slotPos, slotInvRot, slotInvScale, slotBound,
    topTree, topObj, topLo, topHi, triCount,
  };
}

// Ray primitives

// Does the ray meet the box at any t >= 0? An origin inside counts, which is what G3D's
// intersectionTime returns 0 for. Not clamped to maxDist — the tree prunes on distance instead.
function rayHitsBox(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  lo0: number, lo1: number, lo2: number,
  hi0: number, hi1: number, hi2: number,
): boolean {
  let tmin = 0;
  let tmax = Infinity;
  // Per axis, with the zero-direction case separated: 0 * Infinity is NaN, so a ray
  // exactly parallel to a slab has to be tested by containment instead of by slab time.
  if (dx > FUZZY_EPS || dx < -FUZZY_EPS) {
    const inv = 1 / dx;
    let t0 = (lo0 - ox) * inv;
    let t1 = (hi0 - ox) * inv;
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
  } else if (ox < lo0 || ox > hi0) return false;
  if (dy > FUZZY_EPS || dy < -FUZZY_EPS) {
    const inv = 1 / dy;
    let t0 = (lo1 - oy) * inv;
    let t1 = (hi1 - oy) * inv;
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
  } else if (oy < lo1 || oy > hi1) return false;
  if (dz > FUZZY_EPS || dz < -FUZZY_EPS) {
    const inv = 1 / dz;
    let t0 = (lo2 - oz) * inv;
    let t1 = (hi2 - oz) * inv;
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
  } else if (oz < lo2 || oz > hi2) return false;
  return tmax >= tmin;
}

// IntersectTriangle (WorldModel.cpp), RTR2 ch. 13.7. `distance` is a budget, not an output: this is the
// stop-at-first-hit path, so a hit is reported and never narrowed.
function intersectTriangle(
  verts: Float32Array, i0: number, i1: number, i2: number,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  distance: number,
): boolean {
  const EPS = 1e-5;
  const ax = verts[i0 * 3]!; const ay = verts[i0 * 3 + 1]!; const az = verts[i0 * 3 + 2]!;
  const e1x = verts[i1 * 3]! - ax;
  const e1y = verts[i1 * 3 + 1]! - ay;
  const e1z = verts[i1 * 3 + 2]! - az;
  const e2x = verts[i2 * 3]! - ax;
  const e2y = verts[i2 * 3 + 1]! - ay;
  const e2z = verts[i2 * 3 + 2]! - az;
  // p = dir x e2
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const a = e1x * px + e1y * py + e1z * pz;
  if (a < EPS && a > -EPS) return false;
  const f = 1 / a;
  const sx = ox - ax;
  const sy = oy - ay;
  const sz = oz - az;
  const u = f * (sx * px + sy * py + sz * pz);
  if (u < 0 || u > 1) return false;
  // q = s x e1
  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  const v = f * (dx * qx + dy * qy + dz * qz);
  if (v < 0 || u + v > 1) return false;
  const t = f * (e2x * qx + e2y * qy + e2z * qz);
  return t > 0 && t < distance;
}

/** Pooled BIH traversal state: map tree, group tree, mesh tree can all be live at once. */
const BIH_POOL = 4;
const bihInvDir: Float32Array[] = [];
const bihOffFront: Int32Array[] = [];
const bihOffBack: Int32Array[] = [];
const bihOffFront3: Int32Array[] = [];
const bihOffBack3: Int32Array[] = [];
const bihStNode: Int32Array[] = [];
const bihStNear: Float64Array[] = [];
const bihStFar: Float64Array[] = [];
for (let i = 0; i < BIH_POOL; i++) {
  bihInvDir.push(new Float32Array(3));
  bihOffFront.push(new Int32Array(3));
  bihOffBack.push(new Int32Array(3));
  bihOffFront3.push(new Int32Array(3));
  bihOffBack3.push(new Int32Array(3));
  bihStNode.push(new Int32Array(MAX_STACK_SIZE));
  bihStNear.push(new Float64Array(MAX_STACK_SIZE));
  bihStFar.push(new Float64Array(MAX_STACK_SIZE));
}
let bihDepth = 0;

// BIH::intersectRay (BIH.h:155-247) specialised to pStopAtFirstHit. That is why maxDist never
// narrows here: every callback returns straight up on a hit, so the C++ pMaxDist write is dead.
function bihAnyHit(
  tree: Uint32Array,
  objects: Uint32Array,
  lo: Float32Array,
  hi: Float32Array,
  org: Float32Array,
  dir: Float32Array,
  maxDist: number,
  visit: (entry: number) => boolean,
): boolean {
  if (tree.length === 0 || objects.length === 0) return false;
  // Three levels can be live at once — map tree, group tree, mesh tree — and this runs per
  // mob per tick, so the traversal state is pooled rather than allocated.
  const depth = bihDepth++;
  if (depth >= BIH_POOL) { bihDepth--; return false; }
  const invDir = bihInvDir[depth]!;
  const offFront = bihOffFront[depth]!;
  const offBack = bihOffBack[depth]!;
  const offFront3 = bihOffFront3[depth]!;
  const offBack3 = bihOffBack3[depth]!;
  const stNode = bihStNode[depth]!;
  const stNear = bihStNear[depth]!;
  const stFar = bihStFar[depth]!;
  const done = (v: boolean): boolean => { bihDepth--; return v; };
  let intervalMin = -1;
  let intervalMax = -1;
  for (let i = 0; i < 3; i++) {
    const d = dir[i]!;
    invDir[i] = 1 / d;
    if (d > FUZZY_EPS || d < -FUZZY_EPS) {
      let t1 = (lo[i]! - org[i]!) * invDir[i]!;
      let t2 = (hi[i]! - org[i]!) * invDir[i]!;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > intervalMin) intervalMin = t1;
      if (t2 < intervalMax || intervalMax < 0) intervalMax = t2;
      if (intervalMax <= 0 || intervalMin >= maxDist) return done(false);
    }
  }
  if (intervalMin > intervalMax) return done(false);
  if (intervalMin < 0) intervalMin = 0;
  if (intervalMax > maxDist) intervalMax = maxDist;

  // BIH.h:158-168 — child order and clip-plane slot both come off the direction sign bit.
  for (let i = 0; i < 3; i++) {
    const f = floatSignBit(dir[i]!);
    offFront3[i] = f * 3;
    offBack3[i] = (f ^ 1) * 3;
    offFront[i] = f + 1;
    offBack[i] = (f ^ 1) + 1;
  }

  let stackPos = 0;
  let node = 0;

  for (;;) {
    for (;;) {
      const tn = tree[node]!;
      const axis = (tn & (3 << 30)) >>> 30;
      const bvh2 = (tn & (1 << 29)) !== 0;
      let offset = tn & ~(7 << 29);
      if (!bvh2) {
        if (axis < 3) {
          const tf = (intBitsToFloat(tree[node + offFront[axis]!]!) - org[axis]!) * invDir[axis]!;
          const tb = (intBitsToFloat(tree[node + offBack[axis]!]!) - org[axis]!) * invDir[axis]!;
          if (tf < intervalMin && tb > intervalMax) break;
          const back = offset + offBack3[axis]!;
          node = back;
          if (tf < intervalMin) {
            if (tb >= intervalMin) intervalMin = tb;
            continue;
          }
          node = offset + offFront3[axis]!;
          if (tb > intervalMax) {
            if (tf <= intervalMax) intervalMax = tf;
            continue;
          }
          if (stackPos >= MAX_STACK_SIZE) break;
          stNode[stackPos] = back;
          stNear[stackPos] = tb >= intervalMin ? tb : intervalMin;
          stFar[stackPos] = intervalMax;
          stackPos++;
          if (tf <= intervalMax) intervalMax = tf;
        } else {
          // leaf
          let n = tree[node + 1]!;
          while (n > 0) {
            if (visit(objects[offset]!)) return done(true);
            n--;
            offset++;
          }
          break;
        }
      } else {
        if (axis > 2) return done(false); // BIH.h:234 — should not happen
        const tf = (intBitsToFloat(tree[node + offFront[axis]!]!) - org[axis]!) * invDir[axis]!;
        const tb = (intBitsToFloat(tree[node + offBack[axis]!]!) - org[axis]!) * invDir[axis]!;
        node = offset;
        if (tf >= intervalMin) intervalMin = tf;
        if (tb <= intervalMax) intervalMax = tb;
        if (intervalMin > intervalMax) break;
      }
    }
    for (;;) {
      if (stackPos === 0) return done(false);
      stackPos--;
      intervalMin = stNear[stackPos]!;
      if (maxDist < intervalMin) continue;
      node = stNode[stackPos]!;
      intervalMax = stFar[stackPos]!;
      break;
    }
  }
}

// The three nested levels

/** Scratch rays, one per nesting level, so a query allocates nothing. */
const rayOrg = [new Float32Array(3), new Float32Array(3)];
const rayDir = [new Float32Array(3), new Float32Array(3)];

/** GroupModel::IntersectRay (WorldModel.cpp:370-377). */
function groupAnyHit(g: ColGroup, org: Float32Array, dir: Float32Array, distance: number): boolean {
  if (g.tris.length === 0) return false;
  const ox = org[0]!; const oy = org[1]!; const oz = org[2]!;
  const dx = dir[0]!; const dy = dir[1]!; const dz = dir[2]!;
  return bihAnyHit(g.bihTree, g.bihObj, g.bihLo, g.bihHi, org, dir, distance, (entry) =>
    intersectTriangle(
      g.verts, g.tris[entry * 3]!, g.tris[entry * 3 + 1]!, g.tris[entry * 3 + 2]!,
      ox, oy, oz, dx, dy, dz, distance,
    ));
}

/** WorldModel::IntersectRay (WorldModel.cpp:428-441), including the one-group shortcut. */
function modelAnyHit(
  m: ColModel, flags: number, org: Float32Array, dir: Float32Array,
  distance: number, ignoreM2: boolean,
): boolean {
  if (ignoreM2 && (flags & MOD_M2) !== 0) return false;
  if (m.groups.length === 0) return false;
  if (m.groups.length === 1) return groupAnyHit(m.groups[0]!, org, dir, distance);
  if (!m.groupTree || !m.groupObj || !m.groupLo || !m.groupHi) return false;
  return bihAnyHit(m.groupTree, m.groupObj, m.groupLo, m.groupHi, org, dir, distance, (entry) => {
    const g = m.groups[entry];
    return g ? groupAnyHit(g, org, dir, distance) : false;
  });
}

/** ModelInstance::intersectRay (ModelInstance.cpp:35-62). */
function instanceAnyHit(
  col: CollisionMap, slot: number, org: Float32Array, dir: Float32Array,
  maxDist: number, ignoreM2: boolean,
): boolean {
  const mi = col.slotModel[slot];
  if (mi == null || mi < 0) return false;
  const bb = slot * 6;
  if (!rayHitsBox(
    org[0]!, org[1]!, org[2]!, dir[0]!, dir[1]!, dir[2]!,
    col.slotBound[bb]!, col.slotBound[bb + 1]!, col.slotBound[bb + 2]!,
    col.slotBound[bb + 3]!, col.slotBound[bb + 4]!, col.slotBound[bb + 5]!,
  )) return false;
  const model = col.models[mi];
  if (!model) return false;
  const invScale = col.slotInvScale[slot]!;
  const r = col.slotInvRot;
  const b = slot * 9;
  const px = org[0]! - col.slotPos[slot * 3]!;
  const py = org[1]! - col.slotPos[slot * 3 + 1]!;
  const pz = org[2]! - col.slotPos[slot * 3 + 2]!;
  const mo = rayOrg[1]!;
  const md = rayDir[1]!;
  mo[0] = (r[b]! * px + r[b + 1]! * py + r[b + 2]! * pz) * invScale;
  mo[1] = (r[b + 3]! * px + r[b + 4]! * py + r[b + 5]! * pz) * invScale;
  mo[2] = (r[b + 6]! * px + r[b + 7]! * py + r[b + 8]! * pz) * invScale;
  md[0] = r[b]! * dir[0]! + r[b + 1]! * dir[1]! + r[b + 2]! * dir[2]!;
  md[1] = r[b + 3]! * dir[0]! + r[b + 4]! * dir[1]! + r[b + 5]! * dir[2]!;
  md[2] = r[b + 6]! * dir[0]! + r[b + 7]! * dir[1]! + r[b + 8]! * dir[2]!;
  return modelAnyHit(model, col.slotFlags[slot]!, mo, md, maxDist * invScale, ignoreM2);
}

// The query

// Is the segment a→b clear of collision on this map? `a` and `b` are CLIENT WORLD and the vmap
// conversion happens here alone. ignoreM2 defaults TRUE, as every hot caller in the C++ passes.
export function losClearCollision(
  col: CollisionMap,
  a: CollisionPos,
  b: CollisionPos,
  ignoreM2 = true,
): boolean {
  const ax = NAV_MID - a.x;
  const ay = NAV_MID - a.y;
  const az = a.z ?? 0;
  const bx = NAV_MID - b.x;
  const by = NAV_MID - b.y;
  const bz = b.z ?? 0;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const maxDist = detHypot3(dx, dy, dz);
  if (!(maxDist >= MIN_RAY_YD)) return true;
  const org = rayOrg[0]!;
  const dir = rayDir[0]!;
  org[0] = ax; org[1] = ay; org[2] = az;
  dir[0] = dx / maxDist; dir[1] = dy / maxDist; dir[2] = dz / maxDist;
  const hit = bihAnyHit(
    col.topTree, col.topObj, col.topLo, col.topHi, org, dir, maxDist,
    (entry) => instanceAnyHit(col, entry, org, dir, maxDist, ignoreM2),
  );
  return !hit;
}

// Registry — mirrors navmesh.ts:1497-1505

const colByMapId = new Map<number, CollisionMap>();
const colUrlByMapId = new Map<number, string>();

export function registerCollisionForMap(mapId: number, col: CollisionMap, sourceUrl?: string): void {
  colByMapId.set(mapId | 0, col);
  if (sourceUrl) colUrlByMapId.set(mapId | 0, sourceUrl);
}

/** The URL the map's collision came from, or null. */
export function collisionSourceUrl(mapId: number): string | null {
  return colUrlByMapId.get(mapId | 0) ?? null;
}

export function collisionForMap(mapId: number): CollisionMap | null {
  return colByMapId.get(mapId | 0) ?? null;
}

export function clearCollisionRegistry(mapId?: number): void {
  if (mapId == null) { colByMapId.clear(); colUrlByMapId.clear(); }
  else { colByMapId.delete(mapId | 0); colUrlByMapId.delete(mapId | 0); }
}
