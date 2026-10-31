// Local body steer for clamp chase: someone in the way is never a RequestPath. Cite: recoil-scale.md
// C4; ObjectDefines.h CONTACT_DISTANCE 1.f. Rate and last-dir mix from Recoil GroundMoveType.

import { CONTACT_DISTANCE_YD, type CombatPosYd } from './combatGeometry.ts';
import { detHypot } from '../core/detMath.ts';
import type { Fighter } from './types.ts';
import { sideBucket } from './slowUpdate.ts';

/** Recoil ModInfo default: recompute avoidance 1 tick of 3. */
export const STEER_RATE = 3;
/** Recoil mix(dir, lastAvoidanceDir, 0.7). */
export const LAST_DIR_MIX = 0.7;

export type AvoidDir = { x: number; y: number };

/** Two contact radii — formation stack is 1 yd; this is "occupying the doorway". */
export const BODY_SEP_YD = CONTACT_DISTANCE_YD * 2;

export function bodyInWay(
  self: string,
  from: CombatPosYd,
  to: CombatPosYd,
  others: readonly { side: string }[],
  posOf: (side: string) => CombatPosYd | undefined,
  skip?: (side: string) => boolean,
): CombatPosYd | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = detHypot(dx, dy);
  if (!(d > 1e-6)) return null;
  let best: CombatPosYd | null = null;
  let bestSep = Infinity;
  for (const o of others) {
    if (o.side === self || skip?.(o.side)) continue;
    const p = posOf(o.side);
    if (!p) continue;
    if (from.z != null && p.z != null && Math.abs(from.z - p.z) > 3) continue;
    const sep = detHypot(p.x - from.x, p.y - from.y);
    if (sep > BODY_SEP_YD) continue;
    const along = ((p.x - from.x) * dx + (p.y - from.y) * dy) / d;
    if (along < -0.2) continue;
    if (sep < bestSep) {
      bestSep = sep;
      best = p;
    }
  }
  return best;
}

/** One step toward dest plus a contact-radius sidestep away from the body. */
export function steerAim(
  from: CombatPosYd,
  to: CombatPosYd,
  body: CombatPosYd,
  hopYd: number,
  selfSide = '',
): CombatPosYd {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = detHypot(dx, dy);
  if (!(d > 1e-6)) return to;
  const px = -dy / d;
  const py = dx / d;
  const lat = (body.x - from.x) * px + (body.y - from.y) * py;
  let sign = lat >= 0 ? -1 : 1;
  // Stacked on one point: both would pick the same way. Split on the side id.
  if (Math.abs(lat) < 1e-3 && selfSide) {
    let h = 0;
    for (let i = 0; i < selfSide.length; i++) h = (h + selfSide.charCodeAt(i) * (i + 1)) | 0;
    sign = (h & 1) === 0 ? 1 : -1;
  }
  const hop = hopYd > 0 ? hopYd : CONTACT_DISTANCE_YD;
  return {
    x: from.x + (dx / d) * hop + px * sign * CONTACT_DISTANCE_YD,
    y: from.y + (dy / d) * hop + py * sign * CONTACT_DISTANCE_YD,
    ...(from.z != null ? { z: from.z } : {}),
  };
}

function hopAlong(from: CombatPosYd, dir: AvoidDir, hop: number): CombatPosYd {
  return {
    x: from.x + dir.x * hop,
    y: from.y + dir.y * hop,
    ...(from.z != null ? { z: from.z } : {}),
  };
}

function mixDir(a: AvoidDir, b: AvoidDir, w: number): AvoidDir {
  const x = a.x * (1 - w) + b.x * w;
  const y = a.y * (1 - w) + b.y * w;
  const d = detHypot(x, y);
  return d > 1e-6 ? { x: x / d, y: y / d } : a;
}

// Rate-limited sidestep. Off-ticks reuse lastAvoidanceDir only while that heading still points at dest.
// Hard CC does not steer. Cite: Recoil GroundMoveType GetObstacleAvoidanceDir; UNIT_STAT_NOT_MOVE.
export function applyLocalSteer(opts: {
  side: string;
  from: CombatPosYd;
  to: CombatPosYd;
  hopYd: number;
  others: readonly { side: string }[];
  posOf: (side: string) => CombatPosYd | undefined;
  skip?: (side: string) => boolean;
  tickIndex: number;
  unit?: Fighter;
  hardCC: boolean;
}): { aim: CombatPosYd; steered: boolean } | null {
  const { from, to, side, unit } = opts;
  const hop = opts.hopYd > 0 ? opts.hopYd : CONTACT_DISTANCE_YD;
  const ddx = to.x - from.x;
  const ddy = to.y - from.y;
  const dd = detHypot(ddx, ddy);
  if (!(dd > 1e-6)) return null;
  const desired: AvoidDir = { x: ddx / dd, y: ddy / dd };
  if (opts.hardCC) {
    if (unit) unit.lastAvoidanceDir = null;
    return null;
  }
  const last = unit?.lastAvoidanceDir ?? null;
  const due = (opts.tickIndex + sideBucket(side)) % STEER_RATE === 0;
  // `last` is ONLY a sidestep. Storing the dest heading here made off-ticks walk the old bearing and
  // locked a melee pile into an orbit — a tank walked 287 yd at 64% reversals while standing still.
  if (!due && last) {
    if (last.x * desired.x + last.y * desired.y > 0) {
      return { aim: hopAlong(from, last, hop), steered: true };
    }
    if (unit) unit.lastAvoidanceDir = null;
    return null;
  }
  const body = bodyInWay(side, from, to, opts.others, opts.posOf, opts.skip);
  if (!body) {
    if (unit) unit.lastAvoidanceDir = null;
    return null;
  }
  const raw = steerAim(from, to, body, hop, side);
  const rdx = raw.x - from.x;
  const rdy = raw.y - from.y;
  const rd = detHypot(rdx, rdy);
  let dir: AvoidDir = rd > 1e-6 ? { x: rdx / rd, y: rdy / rd } : desired;
  if (last) dir = mixDir(dir, last, LAST_DIR_MIX);
  if (unit) unit.lastAvoidanceDir = dir;
  return { aim: hopAlong(from, dir, hop), steered: true };
}
