// The one "go here" issuer — floor click, kill-target, and setMoveOrder all land here.

import type { CombatContext } from './context.ts';
import type { MotionOwner } from './motionClaim.ts';
import type { Fighter } from './types.ts';
import type { Side } from '../core/events.ts';
import { isEnemySide, isTotemSide } from '../core/events.ts';
import {
  MELEE_PARK_SLACK_YD,
  MELEE_REACH_YD,
  STOREY_DZ_YD,
  type CombatPosYd,
  type PullGeometryAnchor,
} from './combatGeometry.ts';
import { channelInterruptCtx, maybeCancelChannelOnMove } from './channel.ts';
import { detHypot } from '../core/detMath.ts';
import {
  findPathForMap,
  WALK_MAX_VISITED,
  type FindPathDiag,
  type NavPos,
} from '../../domain/nav/nav.ts';
import { navMeshForMap, walkLosClearNavMesh } from '../../domain/nav/navmesh.ts';

export type PathToOpts = {
  queue?: boolean;
  keepFocus?: boolean;
  worldPts?: Array<{ x: number; y: number; z?: number }>;
  viaMesh?: boolean;
  /** Park this far short of dest, walking the corridor backward — never a straight-line cut. */
  standShortYd?: number;
  // Player "go here": keep walking, do not stop to pre-cast. Floor click / Move. Omitted: inferred (no
  // keepFocus + no standShort = hold; standShort = engage).
  holdCourse?: boolean;
  // Own slot: do not follow the player's corridor or share A*. Split-now dests. Mesh-slides when the dest
  // is in mesh LOS; otherwise A* around the wall.
  direct?: boolean;
  // Who is asking. Omitted means a person clicked: it wins its band and skips the dead band. A policy
  // producer must say `route`, which is what stops it stamping over a walk in flight every 500 ms.
  owner?: MotionOwner;
  /** The caller is a motion arm that already holds the claim for this tick. */
  claimed?: boolean;
}

/** Stamp or clear the player-command latch after a dest is accepted. */
export function applyHoldCourse(
  ctx: CombatContext,
  side: string,
  opts?: PathToOpts,
): void {
  const set = ctx.unitHoldCourse;
  if (!set) return;
  if (opts?.holdCourse === true) { set.add(side); return; }
  if (opts?.queue) {
    // Shift-append of a go-here dest still holds; do not clear an existing latch.
    if (opts.holdCourse !== false && !opts.keepFocus && opts.standShortYd == null) set.add(side);
    return;
  }
  if (opts?.holdCourse === false) { set.delete(side); return; }
  // Engage park (click-mob / gap-close). keepFocus reissue without standShort preserves.
  if (opts?.standShortYd != null) { set.delete(side); return; }
  if (!opts?.keepFocus) set.add(side);
}

/** Stamp or clear the own-slot latch after a dest is accepted. */
export function applyDirectMove(
  ctx: CombatContext,
  side: string,
  opts?: PathToOpts,
): void {
  const set = ctx.unitDirectMove;
  if (!set) return;
  if (opts?.direct === true) { set.add(side); return; }
  if (opts?.queue) return;
  set.delete(side);
}

/** Two cells back from the mob so the last waypoint is not their wall cell. */
export const CORRIDOR_STAND_SHORT_YD = 2;

/** Ranged/healer stand; melee parks two cells short of the mob. */
export function standShortYdFor(standYards: number | undefined): number {
  if (standYards != null && standYards > MELEE_REACH_YD + 1) return standYards;
  return CORRIDOR_STAND_SHORT_YD;
}

export type UnitNavPath = {
  goalKey: string;
  pts: NavPos[];
  stuck: number;
  wp: NavPos | null;
  wpD: number;
  noGain: number;
  skipped: number;
  viaMesh: boolean;
};

export type SharedPath = {
  fromX: number; fromY: number; fromZ?: number; pts: NavPos[]; viaMesh: boolean;
  /** Party corridors stay party; pack chase stays pack. */
  team: 'friend' | 'enemy';
};

/** Authored pack-join radius — five ogres share one corridor, not one start cell. */
export const PACK_SHARE_START_YD = 40;

/** A re-aim under this is the same walk restated. Cite: sessionMotion.ts STUCK_GOAL_EPS_YD. */
const SAME_DEST_YD = 2;

/** Friends match start+goal; enemies join if the remaining waypoints pass nearby. */
export function tryAdoptSharedPath(
  sharedPathByGoal: Map<string, SharedPath>,
  fw: NavPos,
  tw: NavPos,
  opts: {
    team: 'friend' | 'enemy';
    shareStartYd: number;
    shareGoalYd: number;
    packShareStartYd?: number;
  },
): { pts: NavPos[]; viaMesh: boolean } | null {
  const packStart = opts.packShareStartYd ?? PACK_SHARE_START_YD;
  for (const s of sharedPathByGoal.values()) {
    if (s.pts.length === 0) continue;
    if ((s.team ?? 'friend') !== opts.team) continue;
    const tail = s.pts[s.pts.length - 1]!;
    if (detHypot(tw.x - tail.x, tw.y - tail.y) > opts.shareGoalYd) continue;
    if (tw.z != null && tail.z != null && Math.abs(tw.z - tail.z) > 3) continue;
    if (fw.z != null && s.fromZ != null && Math.abs(fw.z - s.fromZ) > STOREY_DZ_YD) continue;
    if (opts.team === 'friend') {
      if (detHypot(fw.x - s.fromX, fw.y - s.fromY) > opts.shareStartYd) continue;
    }
    const leadFrom: NavPos = s.fromZ != null
      ? { x: s.fromX, y: s.fromY, z: s.fromZ }
      : { x: s.fromX, y: s.fromY };
    const pts = opts.team === 'friend'
      ? followLeadCorridor(s.pts, leadFrom, fw, tw)
      : adoptPathTail(s.pts, fw, tw);
    if (pts.length === 0) continue;
    if (opts.team === 'enemy') {
      const join = pts[0]!;
      if (detHypot(fw.x - join.x, fw.y - join.y) > packStart) continue;
    }
    pts[pts.length - 1] = tw.z != null ? { x: tw.x, y: tw.y, z: tw.z } : { x: tw.x, y: tw.y };
    return { pts, viaMesh: s.viaMesh };
  }
  return null;
}

/** Stand this far short of the mob so the corridor does not end in their wall cell. */
function attackMoveDest(from: CombatPosYd, to: CombatPosYd): CombatPosYd | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = detHypot(dx, dy);
  if (!(len > MELEE_REACH_YD + MELEE_PARK_SLACK_YD)) return null;
  return {
    x: to.x - (dx / len) * MELEE_REACH_YD,
    y: to.y - (dy / len) * MELEE_REACH_YD,
    ...(to.z != null ? { z: to.z } : from.z != null ? { z: from.z } : {}),
  };
}

/** Park `yards` short of dest on the from→dest chord. No corridor (outdoor Auto). */
export function standShortAlongChord(
  from: { x: number; y: number; z?: number },
  dest: { x: number; y: number; z?: number },
  yards: number,
): { x: number; y: number; z?: number } {
  if (!(yards > 0)) return dest;
  const dx = dest.x - from.x;
  const dy = dest.y - from.y;
  const d = detHypot(dx, dy);
  if (!(d > 1e-6) || d <= yards) {
    return from.z != null ? { x: from.x, y: from.y, z: from.z } : { x: from.x, y: from.y };
  }
  const k = (d - yards) / d;
  const z = dest.z ?? from.z;
  return z != null
    ? { x: from.x + dx * k, y: from.y + dy * k, z }
    : { x: from.x + dx * k, y: from.y + dy * k };
}

/** Last corridor point `yards` short of `dest`, walking the path backward. */
export function standBackAlongPath(
  pts: NavPos[],
  dest: NavPos,
  yards: number,
): { stand: NavPos; pts: NavPos[] } {
  if (!(yards > 0) || pts.length === 0) return { stand: dest, pts };
  const out = pts.slice();
  let x = dest.x;
  let y = dest.y;
  let z = dest.z;
  let left = yards;
  while (out.length > 0 && left > 0) {
    const p = out[out.length - 1]!;
    const d = detHypot(x - p.x, y - p.y);
    if (d >= left && d > 1e-6) {
      const t = left / d;
      const stand: NavPos = {
        x: x + (p.x - x) * t,
        y: y + (p.y - y) * t,
        ...(z != null ? { z } : p.z != null ? { z: p.z } : {}),
      };
      out[out.length - 1] = stand;
      return { stand, pts: out };
    }
    left -= d;
    x = p.x;
    y = p.y;
    if (p.z != null) z = p.z;
    out.pop();
  }
  const stand: NavPos = z != null ? { x, y, z } : { x, y };
  if (out.length === 0) out.push(stand);
  else out[out.length - 1] = stand;
  return { stand, pts: out };
}

/** Remaining corridor from here — never the already-walked prefix (that loops back). */
export function adoptPathTail(pts: NavPos[], here: NavPos, dest: NavPos): NavPos[] {
  if (pts.length <= 1) return pts.slice();
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = detHypot(pts[i]!.x - here.x, pts[i]!.y - here.y);
    if (d < bestD) { bestD = d; best = i; }
  }
  const hereDest = detHypot(dest.x - here.x, dest.y - here.y);
  while (best < pts.length - 1) {
    const p = pts[best]!;
    const pDest = detHypot(dest.x - p.x, dest.y - p.y);
    if (pDest <= hereDest + 0.5) break;
    best++;
  }
  return pts.slice(best);
}

// Companion catch-up onto the player's live corridor, adopting the LEAD's remaining tail. Otherwise each
// follower snaps to a different nearby corner and walks its own chord, through walls and unpulled packs.
export const FOLLOW_JOIN_YD = 10;

export function followLeadCorridor(
  leadPts: NavPos[],
  leadPos: NavPos,
  here: NavPos,
  dest: NavPos,
): NavPos[] {
  const tail = leadPts.length > 0 ? adoptPathTail(leadPts, leadPos, dest) : [];
  const first = tail[0];
  const join = first ?? dest;
  const off = detHypot(join.x - here.x, join.y - here.y);
  const storeyOff = join.z != null && here.z != null && Math.abs(join.z - here.z) > 3;
  const pinDest = (pts: NavPos[]): NavPos[] => {
    const last = pts[pts.length - 1];
    if (last && detHypot(last.x - dest.x, last.y - dest.y) <= 0.5) return pts;
    const end: NavPos = dest.z != null ? { x: dest.x, y: dest.y, z: dest.z } : { x: dest.x, y: dest.y };
    return pts.concat([end]);
  };
  if (first && off <= FOLLOW_JOIN_YD && !storeyOff) return pinDest(tail);
  const hereDest = detHypot(dest.x - here.x, dest.y - here.y);
  const hereLead = detHypot(leadPos.x - here.x, leadPos.y - here.y);
  // Already closer to dest than to the lead / join: do not detour through the player.
  if (hereDest + 1 < hereLead && (first == null || hereDest + 1 < off)) return pinDest([]);
  const out: NavPos[] = [];
  if (hereLead > 1) out.push(leadPos);
  for (const p of tail) {
    const last = out[out.length - 1];
    if (!last || detHypot(p.x - last.x, p.y - last.y) > 0.5) out.push(p);
  }
  if (out.length === 0) out.push(dest.z != null ? dest : leadPos);
  return pinDest(out);
}

/** One A* request. The stepper enqueues; the tick drains at most NAV_SEARCH_BUDGET. */
export type NavSearchReq = {
  side: string;
  from: NavPos;
  to: NavPos;
  goalKey: string;
  team: 'friend' | 'enemy';
  /** Park this far short of `to` on the solved corridor (casters). Omitted: full path. */
  standShortYd?: number;
};

const SEARCH_QUEUE_MAX = 32;

export function upsertNavSearch(queue: NavSearchReq[], req: NavSearchReq): void {
  const i = queue.findIndex((r) => r.side === req.side);
  if (i >= 0) {
    queue[i] = req;
    return;
  }
  if (queue.length >= SEARCH_QUEUE_MAX) queue.shift();
  queue.push(req);
}

export function dropNavSearch(queue: NavSearchReq[], side: string): void {
  const i = queue.findIndex((r) => r.side === side);
  if (i >= 0) queue.splice(i, 1);
}

export function publishNavCorridor(
  side: string,
  goalKey: string,
  fw: NavPos,
  pts: NavPos[],
  viaMesh: boolean,
  team: 'friend' | 'enemy',
  unitNavPaths: Map<string, UnitNavPath>,
  sharedPathByGoal: Map<string, SharedPath>,
  lastSearchAt: Map<string, number>,
  now: number,
): void {
  unitNavPaths.set(side, {
    goalKey, pts, stuck: 0, wp: null, wpD: Infinity, noGain: 0, skipped: 0, viaMesh,
  });
  lastSearchAt.set(side, now);
  if (goalKey && pts.length > 0) {
    sharedPathByGoal.set(goalKey, {
      fromX: fw.x, fromY: fw.y, fromZ: fw.z, pts: pts.slice(), viaMesh, team,
    });
    if (sharedPathByGoal.size > 16) {
      const first = sharedPathByGoal.keys().next().value;
      if (first != null) sharedPathByGoal.delete(first);
    }
  }
}

/** Pop queued misses and run at most `budget` searches. Never called from the stepper. */
export function drainNavSearchQueue(opts: {
  queue: NavSearchReq[];
  budget: number;
  mapId: number | undefined;
  unitNavPaths: Map<string, UnitNavPath>;
  sharedPathByGoal: Map<string, SharedPath>;
  lastSearchAt: Map<string, number>;
  now: number;
  diag: (side: string, k: string) => void;
  liveFrom?: (side: string) => NavPos | undefined;
  skip?: (side: string) => boolean;
  // PATHFIND_NOPATH only: both ends snapped and no walk joins them. A budget miss or an unsnappable end
  // is not this — over 1,200 spawn pairs the split is 11 exhausted / 10 disconnected / 8 unsnappable.
  onNoPath?: (side: string) => void;
}): number {
  let used = 0;
  while (used < opts.budget && opts.queue.length > 0) {
    const req = opts.queue.shift()!;
    if (opts.skip?.(req.side)) continue;
    const have = opts.unitNavPaths.get(req.side);
    if (have && have.goalKey === req.goalKey && have.pts.length > 0) continue;
    const fw = opts.liveFrom?.(req.side) ?? req.from;
    const tw = req.to;
    const pathDiag: FindPathDiag = { expanded: 0, hitCap: false, unsnappable: false };
    // Friend walk matches walkOnNav 40k (cf865f0c8). Chase stays at the 8k default.
    const path = opts.mapId != null
      ? findPathForMap(opts.mapId, fw, tw, pathDiag, {
          maxVisited: req.team === 'enemy' ? undefined : WALK_MAX_VISITED,
        })
      : null;
    const pts = path ? path.slice(1) : [];
    used += 1;
    opts.diag(req.side, pts.length > 0 ? 'searchOk' : 'searchNoPath');
    if (pts.length === 0 && !pathDiag.unsnappable && !pathDiag.hitCap) opts.onNoPath?.(req.side);
    if (pts.length > 0) opts.diag(req.side, pathDiag.source === 'navmesh' ? 'seedMesh' : 'seedRaster');
    if (pathDiag.unsnappable) opts.diag(req.side, 'unsnappable');
    if (pathDiag.hitCap) opts.diag(req.side, 'hitCap');
    opts.diag(req.side, 'searchDrain');
    publishNavCorridor(
      req.side, req.goalKey, fw, pts, pathDiag.source === 'navmesh', req.team,
      opts.unitNavPaths, opts.sharedPathByGoal, opts.lastSearchAt, opts.now,
    );
    // Shared path stays the full corridor (sync pathTo does the same). The unit
    // parks short so a delayed search does not walk a caster onto the mob's feet.
    if (pts.length > 0 && req.standShortYd) {
      const pulled = standBackAlongPath(pts, tw, req.standShortYd);
      const entry = opts.unitNavPaths.get(req.side);
      if (entry) entry.pts = pulled.pts;
    }
  }
  return used;
}

export function dropStaleCorridor(
  side: string,
  unitNavPaths: Map<string, UnitNavPath>,
  sharedPathByGoal: Map<string, SharedPath>,
): void {
  const had = unitNavPaths.get(side);
  if (!had) return;
  unitNavPaths.delete(side);
  const goalKey = had.goalKey;
  if (!goalKey) return;
  // Recoil DeletePath: drop the published key only when nobody else still walks it.
  // Wiping every same-team entry made one stall re-search the pack.
  for (const p of unitNavPaths.values()) {
    if (p.goalKey === goalKey) return;
  }
  sharedPathByGoal.delete(goalKey);
}

export function bindPathTo(deps: {
  ctx: CombatContext;
  dead: (f: Fighter) => boolean;
  bySide: (s: Side) => Fighter;
  posOf: (side: string) => CombatPosYd | undefined;
  anchorOf: () => PullGeometryAnchor | undefined;
  combatToWorld: (pos: CombatPosYd, anchor: PullGeometryAnchor | undefined) => NavPos;
  unitNavPaths: Map<string, UnitNavPath>;
  sharedPathByGoal: Map<string, SharedPath>;
  lastSearchAt: Map<string, number>;
  orderStall: Map<string, { ms: number; hops: number; best: number }>;
  navSearchQueue: NavSearchReq[];
  diag: (side: string, k: string) => void;
  goalRegridYd: number;
  shareStartYd: number;
  shareGoalYd: number;
}): (side: string, pos: CombatPosYd, opts?: PathToOpts) => boolean {
  const {
    ctx, dead, bySide, posOf, anchorOf, combatToWorld,
    unitNavPaths, sharedPathByGoal, lastSearchAt, orderStall, navSearchQueue, diag,
    goalRegridYd, shareStartYd, shareGoalYd,
  } = deps;

  return (side, pos, opts) => {
    if (!ctx.unitPositionsMutable) return false;
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return false;
    let unit: Fighter | null = null;
    unit = bySide(side as Side);
    if (!unit || dead(unit) || isEnemySide(unit.side) || isTotemSide(unit.side)) return false;
    const queue = opts?.queue === true;
    if (!queue && !opts?.keepFocus) {
      if (side === 'player') ctx.explicitEnemyFocus = null;
      else ctx.allyManualTarget?.delete(side as Side);
    }
    const snap = ctx.snapToMesh;
    const refZ = pos.z ?? posOf(side)?.z ?? null;
    let dest = pos;
    if (snap) {
      const s = snap(pos, 20, refZ) ?? (pos.z == null ? snap(pos, 20) : null);
      // snapToMesh treats a 4 yd drop as the same floor, and matching that is what stops a walk-away
      // dest over a pit keeping its void xy — they walked the ghost off the ledge and could not return.
      if (s && (pos.z == null || s.z == null || Math.abs(s.z - pos.z) <= 4)) dest = s;
      else if (pos.z != null) {
        // The requested z can be FICTION, a dest hovering where no floor exists in that column. A floor
        // within 6 yd plan of it is a REAL ledge and keeps the refusal; none means the z names nothing.
        const nearReq = snap(pos, 6, pos.z);
        if (nearReq && nearReq.z != null && Math.abs(nearReq.z - pos.z) <= 4) return false;
        const sFar = s ?? snap({ x: pos.x, y: pos.y }, 20);
        if (!sFar) return false;
        dest = sFar;
      }
    }
    if (!dest || !Number.isFinite(dest.x) || !Number.isFinite(dest.y)) return false;
    // One motion owner per unit. A person's dest always takes the claim, and is stored even while a fear
    // holds the unit. A policy dest is refused under a higher owner — "keep walking what you have".
    const claims = ctx.motionClaims;
    if (claims && opts?.claimed !== true) {
      const owner: MotionOwner = opts?.owner ?? (opts?.holdCourse === true ? 'course' : 'click');
      const intent = owner === 'click' || owner === 'course' || owner === 'key';
      const took = claims.take(side, owner, dest, ctx.t, intent ? { force: true } : undefined);
      if (!took && !intent) return false;
    }
    const anchor = anchorOf();
    const orders = ctx.unitMoveOrders;
    if (!orders) return false;
    // The dungeon controller repaths a straggler onto the dest it already has every 250 ms. Wiping the
    // stall ladder there is what held `st.ms` under ORDER_NUDGE_MS (1.2 s) forever — no rescue ever ran.
    const prevDest = orders.get(side)?.[0];
    const keepStall = (d: CombatPosYd): void => {
      const same = prevDest
        && detHypot(prevDest.x - d.x, prevDest.y - d.y) <= SAME_DEST_YD
        && (prevDest.z == null || d.z == null || Math.abs(prevDest.z - d.z) <= STOREY_DZ_YD);
      if (!same) orderStall.delete(side);
    };
    if (queue) {
      const q = orders.get(side) ?? [];
      q.push(dest);
      orders.set(side, q);
      if (ctx.cfg.friendlyHoldYd != null) ctx.unitAnchors?.set(side, { x: dest.x, y: dest.y });
      applyHoldCourse(ctx, side, opts);
      applyDirectMove(ctx, side, opts);
      return true;
    }
    if (unit.castingSpell) {
      unit.castingSpell = null;
      unit.castStartedAt = 0;
      unit.castFinishAt = 0;
      unit.castPushbacks = 0;
      unit.castCost = 0;
      unit.castCostPower = undefined;
      unit.castCritAdd = 0;
      unit.castEffectPct = 0;
    }
    // Walk order cancels the channel through the aura teardown, not by dropping the flag —
    // a bare `= null` left the channel's auras ticking on caster and target (createSession.ts).
    if (unit.channeling) maybeCancelChannelOnMove(unit, channelInterruptCtx(ctx));
    unit.pendingCharge = null;
    const from = posOf(side);
    const destHasZ = dest.z != null && Number.isFinite(dest.z);
    const tw = combatToWorld(!destHasZ && from?.z != null ? { ...dest, z: from.z } : dest, anchor);
    const goalKey = `${Math.round(tw.x / goalRegridYd)},${Math.round(tw.y / goalRegridYd)}`
      + (destHasZ ? `,${Math.round(dest.z! / STOREY_DZ_YD)}` : '');
    let direct = opts?.direct === true;
    if (direct && from) {
      // Straight slide through a wall is the void walk. No mesh LOS → A* around it.
      const mapId = ctx.cfg.geometryAnchor?.mapId;
      const mesh = mapId != null ? navMeshForMap(mapId) : null;
      if (mesh) {
        const fw = combatToWorld(from, anchor);
        if (!walkLosClearNavMesh(mesh, fw, tw, 0.55)) direct = false;
      }
    }
    if (direct) {
      // Own slot, dest only. No A* when the slot is in mesh LOS (N searches on Split
      // now is the lag), no shared / follow-lead corridor through the player's seat.
      dropStaleCorridor(side, unitNavPaths, sharedPathByGoal);
      dropNavSearch(navSearchQueue, side);
      lastSearchAt.delete(side);
      orders.set(side, [dest]);
      keepStall(dest);
      if (ctx.cfg.friendlyHoldYd != null) ctx.unitAnchors?.set(side, { x: dest.x, y: dest.y });
      applyHoldCourse(ctx, side, opts);
      applyDirectMove(ctx, side, opts);
      diag(side, 'directDest');
      return true;
    }
    const existing = unitNavPaths.get(side);
    // The caller's plan still holds the waypoint this unit is working on, so it is the SAME corridor
    // restated. Re-seeding it wiped the wedge counters, and a straggler the controller repaths every
    // 250 ms never reached `noGain` 12 — the rung that drops a bad corridor and asks for its own search.
    const restated = !!(existing && opts?.worldPts && opts.worldPts.length > 0
      && existing.pts.length > 0
      && opts.worldPts.some((p) => detHypot(p.x - existing.pts[0]!.x, p.y - existing.pts[0]!.y)
        <= SAME_DEST_YD));
    if (existing && existing.goalKey === goalKey && existing.pts.length > 0
      && (!opts?.worldPts || restated)) {
      // Keep the parked dest from the first issue — dest here is still the mob.
      const cur = orders.get(side)?.[0] ?? dest;
      orders.set(side, [cur]);
      if (ctx.cfg.friendlyHoldYd != null) ctx.unitAnchors?.set(side, { x: cur.x, y: cur.y });
      // Names the re-issue that changed nothing, so "repathed forever, never unstuck" has a row.
      if (restated) diag(side, 'restatedKeep');
      dropNavSearch(navSearchQueue, side);
      applyHoldCourse(ctx, side, opts);
      applyDirectMove(ctx, side, opts);
      return true;
    }
    let pts: NavPos[] = [];
    let viaMesh = false;
    const fw = from ? combatToWorld(from, anchor) : tw;
    const takeLeadCorridor = (): boolean => {
      if (side === 'player') return false;
      const lead = unitNavPaths.get('player');
      const leadP = posOf('player');
      if (!lead || lead.pts.length === 0 || !leadP) return false;
      const tail = lead.pts[lead.pts.length - 1]!;
      if (lead.goalKey && lead.goalKey !== goalKey
        && detHypot(tail.x - tw.x, tail.y - tw.y) > shareGoalYd) {
        return false;
      }
      pts = followLeadCorridor(lead.pts, combatToWorld(leadP, anchor), fw, tw);
      viaMesh = lead.viaMesh;
      if (pts.length > 0) diag(side, 'followLead');
      return pts.length > 0;
    };
    const ownSlot = opts?.direct === true;
    if (opts?.worldPts && opts.worldPts.length > 0) {
      viaMesh = opts.viaMesh === true;
      pts = opts.worldPts.map((p) => (p.z != null ? { x: p.x, y: p.y, z: p.z } : { x: p.x, y: p.y }));
      if (ownSlot || !takeLeadCorridor()) pts = adoptPathTail(pts, fw, tw);
    } else {
      const alreadySearched = lastSearchAt.has(side);
      if (!ownSlot && !alreadySearched && !takeLeadCorridor()) {
        const shared = tryAdoptSharedPath(sharedPathByGoal, fw, tw, {
          team: 'friend', shareStartYd, shareGoalYd,
        });
        if (shared) {
          pts = shared.pts;
          viaMesh = shared.viaMesh;
          diag(side, 'sharedAdopt');
        }
      }
      if (pts.length === 0) {
        // C1: click / catch-up enqueue. Drain pops one per tick; this frame clamp-slides.
        upsertNavSearch(navSearchQueue, {
          side, from: fw, to: tw, goalKey, team: 'friend',
          ...(opts?.standShortYd ? { standShortYd: opts.standShortYd } : {}),
        });
        diag(side, 'searchQueued');
      }
    }
    if (pts.length > 0) {
      const tail = pts[pts.length - 1]!;
      if (detHypot(tail.x - tw.x, tail.y - tw.y) > 0.5) {
        pts = pts.concat([tw.z != null ? { x: tw.x, y: tw.y, z: tw.z } : { x: tw.x, y: tw.y }]);
      }
      if (goalKey) {
        sharedPathByGoal.set(goalKey, {
          fromX: fw.x, fromY: fw.y, fromZ: fw.z, pts: pts.slice(), viaMesh,
          team: 'friend',
        });
        if (sharedPathByGoal.size > 16) {
          const first = sharedPathByGoal.keys().next().value;
          if (first != null) sharedPathByGoal.delete(first);
        }
      }
      // Park on the corridor, not the start→mob chord — that chord sits in the wall.
      if (opts?.standShortYd) {
        const pulled = standBackAlongPath(pts, tw, opts.standShortYd);
        dest = {
          x: dest.x + (pulled.stand.x - tw.x),
          y: dest.y + (pulled.stand.y - tw.y),
          ...(pulled.stand.z != null ? { z: pulled.stand.z }
            : dest.z != null ? { z: dest.z } : {}),
        };
        pts = pulled.pts;
      }
      // Same goal, still starting at the same waypoint: this is the walk RESTATED, not a new plan, so
      // the wedge counters carry. Zeroing them on the controller's 250 ms cadence held `stuck` under
      // the 4 that sidesteps and `noGain` under the 12 that drops a corridor and asks for a search.
      const held = existing && existing.goalKey === goalKey
        && existing.pts.length > 0 && pts.length > 0
        && detHypot(existing.pts[0]!.x - pts[0]!.x, existing.pts[0]!.y - pts[0]!.y) <= SAME_DEST_YD
        ? existing
        : null;
      unitNavPaths.set(side, {
        goalKey,
        pts,
        stuck: held?.stuck ?? 0,
        wp: held ? pts[0]! : null,
        wpD: held?.wpD ?? Infinity,
        noGain: held?.noGain ?? 0,
        skipped: held?.skipped ?? 0,
        viaMesh,
      });
      lastSearchAt.set(side, ctx.t);
      // Click-mob pathTo enqueues dest=mob, then walkOnNav seeds dest=stand. The
      // queued search must not overwrite the corridor that just landed.
      dropNavSearch(navSearchQueue, side);
      diag(side, viaMesh ? 'seedMesh' : 'seedRaster');
      // Names the re-issue that kept its wedge counters, so "repathed forever, never unstuck" has a row.
      if (held) diag(side, 'seedHeld');
    } else {
      dropStaleCorridor(side, unitNavPaths, sharedPathByGoal);
      // No corridor: dest was the mob. Outdoor Auto has no mesh, so standShort never
      // ran and casters walked onto the target (mage 35→1.4 yd). Pull back on the chord.
      if (opts?.standShortYd && from) dest = standShortAlongChord(from, dest, opts.standShortYd);
    }
    orders.set(side, [dest]);
    keepStall(dest);
    if (ctx.cfg.friendlyHoldYd != null) ctx.unitAnchors?.set(side, { x: dest.x, y: dest.y });
    applyHoldCourse(ctx, side, opts);
    applyDirectMove(ctx, side, opts);
    return true;
  };
}
