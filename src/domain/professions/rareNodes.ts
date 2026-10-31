// Black Lotus: 94 spawn points and a 3,600 s respawn against 300 s for a common herb
// (src_gameobject.spawntimesecs, id 176589). A zone list holds neither, so rarity is a rotation.

/** Gather nodes that bloom on a zone rotation instead of a plain respawn. */
const ROTATION_NODES = new Set<number>([176589]); // Black Lotus

export const ROTATION_WINDOW_MS = 30 * 60_000;
/** One window in this many carries a bloom, per zone. */
export const ROTATION_ODDS = 3;
/** Windows scanned ahead for the next bloom; (2/3)^48 says the fallback never runs. */
const LOOKAHEAD_WINDOWS = 48;

export function isRotationNode(nodeId: number): boolean {
  return ROTATION_NODES.has(nodeId);
}

/** FNV-1a over zone:node:window. The roll IS the clock, so leaving the zone never rerolls it. */
function windowHash(zoneId: string, nodeId: number, slot: number): number {
  const s = `${zoneId}:${nodeId}:${slot}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

const blooms = (zoneId: string, nodeId: number, slot: number): boolean =>
  windowHash(zoneId, nodeId, slot) % ROTATION_ODDS === 0;

const slotOf = (nowMs: number): number => Math.floor(nowMs / ROTATION_WINDOW_MS);

/** Whether this zone holds a bloom in the window containing nowMs. Non-rotation nodes always do. */
export function rotationNodeUp(zoneId: string, nodeId: number, nowMs: number): boolean {
  if (!isRotationNode(nodeId)) return true;
  return blooms(zoneId, nodeId, slotOf(nowMs));
}

/** Start of the next blooming window STRICTLY after the one holding nowMs. */
export function rotationNodeNextUpMs(zoneId: string, nodeId: number, nowMs: number): number {
  const here = slotOf(nowMs);
  for (let i = 1; i <= LOOKAHEAD_WINDOWS; i++) {
    if (blooms(zoneId, nodeId, here + i)) return (here + i) * ROTATION_WINDOW_MS;
  }
  return (here + LOOKAHEAD_WINDOWS) * ROTATION_WINDOW_MS;
}
