// Geometry motion phase for a live combat tick, peeled from stepSession. Owns charge travel, gap-close
// into melee or cast range, and the area-aura pass. Extracted modules must not import combat.ts.

import type { SpellDef } from '../../data/schema.ts';
import { isEnemySide, isTotemSide, type Side } from '../core/events.ts';
import {
  moveStepYd, stepToward, MELEE_REACH_YD, MELEE_PARK_SLACK_YD,
  MELEE_CONTACT_YD, PARTY_FOLLOW_YD,
  combatDistanceYd, STOREY_DZ_YD,
  planarRangeHonestYd,
  type CombatPosYd,
  type PullGeometryAnchor,
} from './combatGeometry.ts';
import { combatToWorld, worldToCombat } from './worldFrame.ts';
import {
  walkLineClearOnSurface,
  motionSurfacesForMap,
  stepOnSurface,
} from './walkSurface.ts';
import { type NavPos } from '../../domain/nav/nav.ts';
import {
  JUMP_REACH_MAX_YD,
  WALKABLE_CLIMB_YD,
  findNearestPoly,
  followPathNavMesh,
  isWalkableNavMesh,
  navMeshForMap,
  sidestepNavMesh,
  snapOntoNavMesh,
  stepWalkableNavMesh,
} from '../../domain/nav/navmesh.ts';
import { createMotionKit } from './sessionMotionKit.ts';
import { createMechanicMove } from './sessionMechanicMove.ts';
import { createChargeArm } from './sessionCharge.ts';
import { createFollowArms } from './sessionFollow.ts';
import { createChaseArm } from './sessionChase.ts';
import { createHomeArm } from './sessionHome.ts';
import { createMoveOrderArm } from './sessionMoveOrder.ts';
import { createStepBackArm } from './sessionStepBack.ts';
import { createMoveIntentArm } from './sessionMoveIntent.ts';
import { detHypot, detHypot3 } from '../core/detMath.ts';
import { createFearFlee } from './fearFlee.ts';
import {
  clampDisplacementToFloor,
  displaceFloorOf,
  stepDisplacement,
} from './displaceFloor.ts';
import { channelHoldsStill, channelInterruptCtx, interruptChannel } from './channel.ts';
import { runAreaAuraMaintain } from './areaAura.ts';
import { runEvadeLifecycle } from './evadeLifecycle.ts';
import { createMotionClaims, type MotionOwner } from './motionClaim.ts';
import {
  createMotionGates,
  type MotionGateInfo,
  type MotionGateName,
} from './motionGate.ts';
import { emptySlowDiag } from './slowUpdate.ts';
import type { CombatContext } from './context.ts';
import type { ActiveEffect, Fighter } from './types.ts';
import {
  bindPathTo,
  drainNavSearchQueue,
  dropNavSearch,
  dropStaleCorridor as dropStaleCorridorAt,
  followLeadCorridor,
  tryAdoptSharedPath,
  upsertNavSearch,
  type NavSearchReq,
  type PathToOpts,
  type SharedPath,
  type UnitNavPath,
} from './sessionPathTo.ts';
import { BODY_SEP_YD, applyLocalSteer, bodyInWay } from './sessionSteer.ts';
import { navSightClear } from './navSight.ts';


/** Closures the motion phase needs from installStepSession / the session bag. */
export interface SessionMotionDeps {
  ctx: CombatContext;
  dead: (f: Fighter) => boolean;
  /** Threat-id → fighter (charge retarget). */
  fighterByThreatId: (id: string) => Fighter | null;
  hostileTargetOf: (f: Fighter) => Fighter | null;
  foeOf: (f: Fighter) => Fighter | null;
  isChargeRole: (spell: SpellDef) => boolean;
  onCooldown: (f: Fighter, spell: SpellDef) => boolean;
  canAfford: (f: Fighter, spell: SpellDef) => boolean;
  weaponStrike: (f: Fighter, tgt: Fighter, spell: SpellDef) => unknown;
  castOnTargets: (f: Fighter, tgt: Fighter, spell: SpellDef) => void;
  posOf: (side: Side | string) => CombatPosYd | undefined;
  setPos: (side: Side | string, p: CombatPosYd) => void;
  fightersOrder: () => Fighter[];
  bySide: (s: Side) => Fighter;
  effects: ActiveEffect[];
  tickMs: number;
}

export interface SessionMotionApi {
  finishChargeArrival: (f: Fighter, tgt: Fighter, spell: SpellDef) => void;
  advanceChargeMove: (f: Fighter) => void;
  /** Non-empty threat list for enemies (also gates white-swing engagement in step). */
  enemyEngaged: (f: Fighter) => boolean;
  runMotionPhase: () => void;
  areaAuraMaintainPhase: () => void;
  pathTo: (side: string, dest: CombatPosYd, opts?: PathToOpts) => boolean;
}

// Install charge / gap-close / area-aura maintain on the session bag and return the same functions for
// startOrCast / step closures.
export function installSessionMotion(deps: SessionMotionDeps): SessionMotionApi {
  const {
    ctx, dead, fighterByThreatId, hostileTargetOf, foeOf, isChargeRole,
    onCooldown, canAfford, weaponStrike, castOnTargets,
    posOf, setPos: setPosRaw, fightersOrder, bySide, effects, tickMs,
  } = deps;
  const lastMoveFrom = new Map<string, CombatPosYd>();
  // One motion owner per unit. Every arm asks for the unit before it steps, and a producer outside the
  // engine asks through `pathTo`. See motionClaim.ts for why the early-return order is not enough.
  const claims = ctx.motionClaims ?? createMotionClaims(tickMs);
  ctx.motionClaims = claims;
  // Which of `advanceGapClose`'s early returns resolved each unit, so "the boss just stands there" has one
  // name and its inputs. Same diagnosis contract as `navDiag` below.
  const motionGates = ctx.motionGates ?? createMotionGates();
  ctx.motionGates = motionGates;
  const gate = (side: string, name: MotionGateName, info?: MotionGateInfo): void => {
    motionGates.mark(side, name, ctx.t, info);
  };
  // The goal this arm may walk this tick, or null when someone with priority owns the unit. A
  // same-owner refusal is the dead band and hands back the LIVE goal: half a yard is not a new dest.
  const takeMotion = (
    side: string,
    owner: MotionOwner,
    goal: CombatPosYd | null,
    opts?: { force?: boolean; holdMs?: number },
  ): CombatPosYd | null => {
    if (claims.take(side, owner, goal, ctx.t, opts)) return goal;
    if (claims.ownerOf(side, ctx.t) === owner) return claims.goalOf(side, ctx.t) ?? goal;
    return null;
  };
  // Who owns a stored dest: whoever issued it, so a re-plan keeps its hold window and a floor click
  // keeps its precedence. Nothing holding it means the queue outlived its issuer — treat it as a click.
  const orderOwnerOf = (side: string): MotionOwner =>
    claims.ownerOf(side, ctx.t)
    ?? ((ctx as { unitHoldCourse?: Set<string> }).unitHoldCourse?.has(side) ? 'course' : 'click');
  const setPos = (side: string, p: CombatPosYd): void => {
    const prev = posOf(side);
    setPosRaw(side, p);
    if (prev && detHypot(p.x - prev.x, p.y - prev.y) > 0.05) {
      lastMoveFrom.set(side, { x: prev.x, y: prev.y });
    }
  };

  // Geometry motion — Euclidean stepToward without a mesh, corridor-following with one, mask-clamped
  // greedy slide when clamp-only. Speeds: run 7.0 (Unit.cpp:66), charge 27 (Unit.h).
  const anchorOf = (): PullGeometryAnchor | undefined => ctx.cfg.geometryAnchor;
  const floorOf = () => displaceFloorOf({
    mapId: anchorOf()?.mapId,
    origin: anchorOf()?.frame === 'world-translated' ? anchorOf()?.origin : undefined,
  });
  // Per-side cached path, recomputed when the goal cell changes and when the unit stops closing on its
  // own next waypoint: a stale path aims through a wall, and the graze along it read as progress.
  const unitNavPaths = new Map<string, UnitNavPath>();
  // A blocked WAYPOINT is not a wrong CORRIDOR: drop that waypoint and aim at the next one. Deleting
  // the whole path re-drew a route up to three times a second on a formation move.
  const WP_SKIP_MAX = 4;
  /** Per-side floor on full search. Allies follow the player; they do not A* a second route. */
  const REPATH_COOLDOWN_MS = 1_500;
  /** Re-aim the last waypoint when the live goal is still this close to the tail. */
  const TAIL_REAIM_YD = 10;
  const lastSearchAt = new Map<string, number>();
  const orderStall = new Map<string, { ms: number; hops: number; best: number }>();
  // side -> goalKey the unit walks on the layer-aware stack, armed only after the overview corridor
  // wedges. Keyed by goalKey so a new goal reverts to overview-primary.
  const stackRecover = new Map<string, string>();
  // Shared corridor for a goal key — a group move order pathfinds once, not per ally. Without it the
  // player, four allies and a pet each burned an A*, so half slid a tick under the search budget.
  const sharedPathByGoal = new Map<string, SharedPath>();
  const SHARE_START_YD = 10;
  const dropStaleCorridor = (side: string): void =>
    dropStaleCorridorAt(side, unitNavPaths, sharedPathByGoal);
  // How far apart two goals may be and still be "the same order". A formation gives every member its
  // own slot, so the exact-key lookup this replaces was settled by a rounding boundary.
  const SHARE_GOAL_YD = 8;
  // Allies that wedged on a follow-the-lead line toward this goal key. Their next corridor to the same
  // goal is their own search: re-adopting the line that failed is what pinned a unit behind a wall.
  const followLeadFailed = new Map<string, string>();
  /** Ticks of wall-graze before a stale path is thrown away and re-drawn from here. */
  const REPATH_NO_GAIN_TICKS = 3;
  // Enemy chase is clamp-only, escalating only when geometry blocks on the surface the mob steps on.
  // Another body in the way is a push, not an A*.
  const navEscalateUntil = new Map<string, number>();
  const clampProgress = new Map<string, { d: number; miss: number }>();
  const CLAMP_MISS_TICKS = 5;
  const NAV_ESCALATE_MS = 4_000;
  // Goal quantisation for the path cache key. Keying on the goal CELL threw the corridor away every
  // tick a target moved: 36 main-thread stalls over 25 ms in 68 s of auto-running Deadmines.
  const GOAL_REGRID_YD = 4;
  // Full searches allowed in one sim tick. One, not three: three searches a tick was the 25-46 ms
  // combat bill on Dire Maul North. Denied units keep the last corridor or clamp-slide.
  const NAV_SEARCH_BUDGET = 1;
  let navSearchTick = -1;
  let navSearchesThisTick = 0;
  const navSearchQueue: NavSearchReq[] = [];

  // Per-side tally of how each motion tick resolved. A unit walking back at 3% of run speed looks the
  // same from outside whether it is starved of A*, off-mesh, or pathing into a wall.
  const navDiag = new Map<string, Record<string, number>>();
  const diag = (side: string, k: string): void => {
    let m = navDiag.get(side);
    if (!m) { m = {}; navDiag.set(side, m); }
    m[k] = (m[k] ?? 0) + 1;
  };
  ctx.navDiag = navDiag;

  const skipSteerBody = (s: string): boolean => {
    if (isTotemSide(s)) return true;
    const f = bySide(s as Side); return !f || dead(f);
  };
  const localSteerAim = (side: string, from: CombatPosYd, to: CombatPosYd, step: number) => {
    const unit = bySide(side as Side).side === side ? bySide(side as Side) : undefined;
    const r = applyLocalSteer({
      side, from, to, hopYd: Math.max(step, BODY_SEP_YD), others: fightersOrder(),
      posOf, skip: skipSteerBody, tickIndex: Math.floor(ctx.t / Math.max(1, tickMs)), unit,
      hardCC: !!(unit && (
        (ctx.isControlledHard as ((u: Fighter) => boolean) | undefined)?.(unit)
        || unit.rootedUntil > ctx.t
      )),
    });
    if (r?.steered) diag(side, 'steerBody');
    return r?.aim ?? null;
  };

  const navStepToward = (
    side: string,
    from: CombatPosYd,
    to: CombatPosYd,
    step: number,
    stopAtDist: number,
    // May this unit pay for a corridor SEARCH this tick: true is a full A*, false is steer and clamp
    // only, omitted takes the session switch. It does NOT pick the surface — the map answers that.
    searchCorridor?: boolean,
  ): CombatPosYd => {
    const anchor = anchorOf();
    // No mesh, no geometry: walk the straight line. This gate used to read `if (!nav)` and then
    // `mesh or raster` (E4.6 finding 1); with the raster gone the mesh is the whole question.
    if (anchor?.mapId == null || !navMeshForMap(anchor.mapId)) {
      return stepToward(from, to, step, stopAtDist);
    }
    const fw = combatToWorld(from, anchor);
    // An aim built without a z means "over there on MY floor", never "whichever floor is nearest in
    // plan": handing the mesh a z-less dest snaps it to an arbitrary storey of the same column.
    const destHasZ = to.z != null && Number.isFinite(to.z);
    const tw = combatToWorld(!destHasZ && from.z != null ? { ...to, z: from.z } : to, anchor);
    let slideTw = tw;
    const stay = (): CombatPosYd => (from.z != null ? { x: from.x, y: from.y, z: from.z } : { x: from.x, y: from.y });
    const dist = detHypot(tw.x - fw.x, tw.y - fw.y);
    if (stopAtDist > 0 && dist <= stopAtDist) return stay();

    // Surface, not search — the map answers it for every unit, party and mob alike. Resolved before
    // every stepper: the overview raster calls half a real mesh corridor solid rock.
    const { mesh } = motionSurfacesForMap(anchor?.mapId);

    // Manual walk / party approach needs corridors. Enemy AI chase uses clamp economics.
    // Do NOT gate the whole session on living hostiles — that froze floor travel mid-run.
    let clampOnly = searchCorridor === true ? false
      : searchCorridor === false ? true
        : ctx.cfg.navClampOnly === true;
    if (clampOnly) {
      if ((navEscalateUntil.get(side) ?? 0) > ctx.t) {
        clampOnly = false;
      } else {
        const aim = localSteerAim(side, from, to, step);
        if (aim) slideTw = combatToWorld(aim, anchor);
        const prev = clampProgress.get(side);
        if (prev && dist > prev.d - 0.05) {
          prev.d = dist;
          prev.miss += 1;
          // Geometry only. A body in the door is a push; if it also stalls for the miss count the wall
          // is real and this side escalates. On the SAME surface the mob steps on, at the same width.
          if (!walkLineClearOnSurface(mesh, fw, tw, 0.55)
            && (prev.miss >= CLAMP_MISS_TICKS
              || !bodyInWay(side, from, to, fightersOrder(), posOf, skipSteerBody))) {
            navEscalateUntil.set(side, ctx.t + NAV_ESCALATE_MS);
            clampProgress.delete(side);
            clampOnly = false;
            // The one place clamp becomes A*. Without a counter here, "enemies do not path"
            // and "enemies path and it does not help" read the same in every run output.
            diag(side, 'clampEscalate');
          }
        } else {
          clampProgress.set(side, { d: dist, miss: 0 });
        }
      }
    }

    const ownDest = (ctx as { unitDirectMove?: Set<string> }).unitDirectMove?.has(side) === true;
    // One greedy step toward the goal on the SERVER mesh, or null. A raster step is a 2-D collapse
    // whose soft height physics legalises the void; the mesh stepper cannot cross a storey.
    const slideOnMesh = (toward: NavPos = tw): NavPos | null => {
      if (!mesh) return null;
      const s = stepWalkableNavMesh(mesh, fw, toward, step);
      return detHypot(s.x - fw.x, s.y - fw.y) > 1e-6 ? s : null;
    };

    // Floor is part of the goal — two stacked dests must not share one corridor.
    // Pack chase still sees a sibling's corridor while clamp-only (C0).
    const shareTeam = isEnemySide(side) ? 'enemy' : 'friend';
    const packMayShare = clampOnly && shareTeam === 'enemy';
    const goalKey = clampOnly && !packMayShare
      ? ''
      : `${Math.round(tw.x / GOAL_REGRID_YD)},${Math.round(tw.y / GOAL_REGRID_YD)}`
        + (destHasZ ? `,${Math.round(to.z! / STOREY_DZ_YD)}` : '');
    let entry = (clampOnly && !packMayShare) ? undefined : unitNavPaths.get(side);
    const livePath = !!(entry && entry.pts.length > 0);
    const haveCorridor = !!(livePath && entry!.goalKey === goalKey);
    // Hop is a first-mile shortcut only. A live corridor already went around the last wall, and mesh
    // LOS at 1.6 yd leaks through door lips — it stole that route whenever dest came inside 12 yd.
    // The mesh LOS walk is 5% of live JS and all three readers below sit behind other gates,
    // so it is paid only once, and only when one of them actually asks.
    let hopClearMemo: boolean | undefined;
    const hopClear = (): boolean => (hopClearMemo ??= walkLineClearOnSurface(mesh, fw, tw, 0.55));
    const hopOtherFloor = tw.z != null && fw.z != null && Math.abs(tw.z - fw.z) > 3;
    // C4: no corridor + open floor + a body → push. Do not A* a teammate.
    // A live corridor still follows; stacked formation must not sidestep forever.
    if (!clampOnly && !livePath && !hopOtherFloor && hopClear()) {
      const aim = localSteerAim(side, from, to, step);
      if (aim) {
        const aimW = combatToWorld(aim, anchor);
        // Was `slideOnMesh(aimW) ?? stepWalkable(...)`: a raster second opinion after the mesh
        // had refused, ten lines above the same hop taken mesh-exclusively. One policy now.
        const nextW = stepOnSurface(mesh, fw, aimW, step);
        if (nextW && detHypot(nextW.x - fw.x, nextW.y - fw.y) > 1e-6) {
          return worldToCombat(nextW, anchor, from.z);
        }
      }
    }
    // After A* has run, dest needs the corridor — hop is only the no-search shortcut.
    if (!clampOnly && !livePath && lastSearchAt.get(side) == null
      && dist <= 12 && !hopOtherFloor && hopClear()) {
      const nextW = stepOnSurface(mesh, fw, tw, step);
      if (nextW && detHypot(nextW.x - fw.x, nextW.y - fw.y) > 1e-6) {
        const closer = detHypot(tw.x - nextW.x, tw.y - nextW.y);
        const mx = nextW.x - fw.x;
        const my = nextW.y - fw.y;
        const md = detHypot(mx, my);
        const along = md > 1e-6 ? (mx * (tw.x - fw.x) + my * (tw.y - fw.y)) / (md * dist) : 0;
        if (closer < dist - 1e-3 && along >= 0.85) {
          diag(side, 'hop');
          return worldToCombat(nextW, anchor, from.z);
        }
      }
    }
    const takeShared = (shared: { pts: NavPos[]; viaMesh: boolean } | null): boolean => {
      if (!shared || shared.pts.length === 0) return false;
      entry = {
        goalKey, pts: shared.pts, stuck: 0, wp: null, wpD: Infinity,
        noGain: 0, skipped: 0, viaMesh: shared.viaMesh,
      };
      unitNavPaths.set(side, entry);
      lastSearchAt.set(side, ctx.t);
      dropNavSearch(navSearchQueue, side);
      diag(side, 'sharedAdopt');
      return true;
    };
    // Clamp chase: take a sibling's corridor. Search stays behind escalate (C0).
    if (packMayShare && goalKey && (!entry || entry.goalKey !== goalKey)
      && lastSearchAt.get(side) == null) {
      if (!takeShared(tryAdoptSharedPath(sharedPathByGoal, fw, tw, {
        team: 'enemy',
        shareStartYd: SHARE_START_YD,
        shareGoalYd: SHARE_GOAL_YD,
      }))) diag(side, 'shareMiss');
    }
    if (!clampOnly && (!entry || entry.goalKey !== goalKey)) {
      // Party group-move and pack chase reuse a corridor a nearby unit already paid for, matched by
      // PROXIMITY of the two goals rather than an exact key. Split-now slots keep their own dest.
      const shared = !ownDest && goalKey ? tryAdoptSharedPath(sharedPathByGoal, fw, tw, {
        team: shareTeam,
        shareStartYd: SHARE_START_YD,
        shareGoalYd: SHARE_GOAL_YD,
      }) : null;
      // A unit that already searched this walk must not re-adopt the start corridor
      // — after 11 yd they are still inside SHARE_START and loop the failed path.
      if (shared && lastSearchAt.get(side) == null && takeShared(shared)) {
        // adopted
      } else {
        const since = ctx.t - (lastSearchAt.get(side) ?? -Infinity);
        let holdCorridor = false;
        const wp0 = entry?.pts[0];
        const storeyOff = (a?: number, b?: number) => a != null && b != null && Math.abs(a - b) > 3;
        // Other-floor dest, or first wp already a storey jump: the old corridor is the ledge.
        if (entry && entry.pts.length > 0 && since < REPATH_COOLDOWN_MS
          && !storeyOff(fw.z, tw.z) && !storeyOff(fw.z, wp0?.z)) {
          const tail = entry.pts[entry.pts.length - 1]!;
          const tailOff = detHypot(tw.x - tail.x, tw.y - tail.y);
          if (tailOff <= GOAL_REGRID_YD) {
            holdCorridor = true;
            diag(side, 'searchCooldown');
          } else if (tailOff <= TAIL_REAIM_YD) {
            // New object on purpose: the walker tracks its waypoint by identity, so this
            // resets the no-gain counter when the tail IS the waypoint being closed on.
            entry.pts[entry.pts.length - 1] = tw.z != null
              ? { x: tw.x, y: tw.y, z: tw.z }
              : { x: tw.x, y: tw.y };
            holdCorridor = true;
            diag(side, 'tailReaim');
          }
        }
        if (holdCorridor) {
          entry!.goalKey = goalKey;
          dropNavSearch(navSearchQueue, side);
        } else if (ownDest || !takeShared(tryAdoptSharedPath(sharedPathByGoal, fw, tw, {
          team: shareTeam,
          shareStartYd: SHARE_START_YD,
          shareGoalYd: SHARE_GOAL_YD,
        }))) {
          // Friends follow the player; they do not draw a second corridor.
          // Own-slot dests (Move now) walk theirs — following the player is the centre pile-in.
          let queued = true;
          if (!ownDest && !isEnemySide(side) && side !== 'player'
            && followLeadFailed.get(side) !== goalKey) {
            const lead = unitNavPaths.get('player');
            const leadP = posOf('player');
            const leadW = leadP ? combatToWorld(leadP, anchor) : null;
            const tail = lead && lead.pts.length > 0 ? lead.pts[lead.pts.length - 1] : undefined;
            const sameDest = !tail || detHypot(tail.x - tw.x, tail.y - tw.y) <= SHARE_GOAL_YD;
            if (lead && lead.pts.length > 0 && leadW && sameDest) {
              queued = !takeShared({
                pts: followLeadCorridor(lead.pts, leadW, fw, tw),
                viaMesh: lead.viaMesh,
              });
              if (!queued) diag(side, 'followLead');
            } else if (leadW && detHypot(fw.x - leadW.x, fw.y - leadW.y) > SHARE_START_YD) {
              queued = !takeShared({
                pts: followLeadCorridor([], leadW, fw, tw),
                viaMesh: false,
              });
              if (!queued) diag(side, 'followLead');
            }
          } else if (!ownDest && !isEnemySide(side) && side !== 'player') {
            diag(side, 'followLeadRefused');
          }
          if (queued && (!ownDest || !hopClear())) {
            upsertNavSearch(navSearchQueue, { side, from: fw, to: tw, goalKey, team: shareTeam });
            diag(side, 'searchQueued');
          }
        }
      }
    }
    // Player already stands on this dest: a leftover ally corridor is the scenic A* (230 yd for a
    // 34 yd pin). Follow the player. Split-now dests stay on their own slot even so.
    if (!clampOnly && !isEnemySide(side) && side !== 'player' && entry && entry.pts.length > 0
      && !ownDest && followLeadFailed.get(side) !== goalKey) {
      const leadP = posOf('player');
      const leadBusy = (unitNavPaths.get('player')?.pts.length ?? 0) > 0;
      if (!leadBusy && leadP) {
        const dPlayer = combatDistanceYd(leadP, to);
        const dSelf = combatDistanceYd(from, to);
        if (dPlayer != null && dPlayer <= 1.5 && (dSelf ?? 0) > 8) {
          dropStaleCorridor(side);
          const leadW = combatToWorld(leadP, anchor);
          takeShared({
            pts: followLeadCorridor([], leadW, fw, tw),
            viaMesh: !!mesh,
          });
          diag(side, 'followLead');
        }
      }
    }
    const doFollow = (pts: NavPos[]): NavPos => {
      // Match the stepper to the router that drew THIS corridor. Walking a raster corridor with the
      // mesh stepper wedges on the first cell the mesh has no polygon for.
      if (mesh && entry?.viaMesh) return followPathNavMesh(mesh, fw, pts, step);

      // A raster corridor cannot exist without a raster: every solver is mesh-only when one is absent.
      // Reachable only for injected waypoints marked otherwise, and the mesh stepper walks those.
      return mesh ? followPathNavMesh(mesh, fw, pts, step) : fw;
    };
    // Greedy step, mesh first, with the raster lane as the fallback it was built to be. Aim at the
    // WAYPOINT: a slide aimed at the goal walks away from the route, and a graze reads as progress.
    const doSlide = (toward: NavPos = slideTw): NavPos => {
      const meshStep = slideOnMesh(toward);
      if (meshStep) return meshStep;
      // Raster stepWalkable legalises the void (navmesh.ts:4-9). Own-slot dests stay
      // on the mesh rather than walking off a wall toward a split ring in the pit.
      if (ownDest && mesh) return fw;

      // Mesh refused and there is no raster to ask instead: the refusal stands and the unit
      // holds, which is `stepOnSurface`'s stated policy rather than a new one.
      return stepOnSurface(mesh, fw, toward, step) ?? fw;
    };
    if (entry && entry.pts.length > 0) {
      // Progress is measured against the CURRENT waypoint, not the goal: a corridor turn walks away
      // from the goal in straight-line terms but always closes on its own next waypoint.
      const wp = entry.pts[0]!;
      const storeyWp = !!(entry.viaMesh && wp.z != null && fw.z != null
        && Math.abs(wp.z - fw.z) > 3);
      const d0 = storeyWp
        ? detHypot3(wp.x - fw.x, wp.y - fw.y, wp.z! - fw.z!)
        : detHypot(wp.x - fw.x, wp.y - fw.y);
      if (entry.wp !== wp) {
        entry.wp = wp;
        entry.wpD = d0;
        entry.noGain = 0;
      } else if (d0 > entry.wpD - 0.05) {
        entry.noGain += 1;
        entry.wpD = Math.min(entry.wpD, d0);
        if (entry.noGain >= REPATH_NO_GAIN_TICKS) {
          const planWp = detHypot(wp.x - fw.x, wp.y - fw.y);
          // At a ramp wp in plan: follow climbs. Mesh corners ARE the corridor —
          // skipping them is the chord through the wall (Stockade 10 yd pair).
          if (storeyWp && planWp <= 1) {
            entry.noGain = 0;
          } else if (entry.viaMesh) {
            // Do not skip mesh waypoints (that is the wall chord). Allies still
            // drop and follow the player instead of hugging the same cell forever.
            if (!isEnemySide(side) && side !== 'player' && entry.noGain >= 12) {
              followLeadFailed.set(side, entry.goalKey);
              dropStaleCorridor(side);
              diag(side, 'dropNoGainFollow');
              entry = undefined;
            }
          } else if (entry.pts.length > 1 && entry.skipped < WP_SKIP_MAX) {
            entry.pts.shift();
            entry.skipped += 1;
            entry.wp = null;
            entry.wpD = Infinity;
            entry.noGain = 0;
            diag(side, storeyWp ? 'wpSkipStorey' : 'wpSkip');
          } else {
            dropStaleCorridor(side);
            diag(side, 'dropNoGain');
            entry = undefined;
          }
        }
      } else {
        entry.wpD = d0;
        entry.noGain = 0;
      }
    }
    if (!entry || entry.pts.length === 0) {
      const otherFloor = tw.z != null && fw.z != null && Math.abs(tw.z - fw.z) > 3;
      if (otherFloor && mesh) {
        const sideHop = sidestepNavMesh(mesh, fw, tw, Math.max(step, 2));
        if (sideHop) {
          diag(side, 'unstickSidestep');
          return worldToCombat(sideHop, anchor, from.z);
        }
      }
      // Refuse only a stacked-column dest-slide (ledge). A slope dest 10 yd
      // away still needs a mesh step toward the ramp.
      if (!(otherFloor && dist <= 2)) {
        const nextW = doSlide();
        const slid = detHypot(nextW.x - fw.x, nextW.y - fw.y);
        if (slid > 1e-6) { diag(side, 'slideNoCorridor'); return worldToCombat(nextW, anchor, from.z); }
      }
      diag(side, 'frozenNoSlide');
      return stay();
    }
    const nextW = doFollow(entry.pts);
    const wpNow = entry.pts[0];
    // An in-place ramp climb is progress only when it CLOSES on the waypoint's z — an absolute delta
    // would count falls and the filmed half-yard rubber-band as progress.
    const zGain = wpNow?.z != null && fw.z != null && nextW.z != null
      ? Math.max(0, Math.abs(wpNow.z - fw.z) - Math.abs(wpNow.z - nextW.z))
      : 0;
    const moved = Math.max(detHypot(nextW.x - fw.x, nextW.y - fw.y), zGain);
    const wpPlan = wpNow ? detHypot(wpNow.x - fw.x, wpNow.y - fw.y) : 0;
    // Tiny wall-graze still counts as followOk and reset stuck — crawl forever.
    const stillFar = wpPlan > 1;
    const closed = wpNow != null
      && detHypot(wpNow.x - nextW.x, wpNow.y - nextW.y) < wpPlan - 0.05;
    const crawled = moved < 0.2 && stillFar && !closed;
    diag(side, moved > 1e-6 && !crawled ? 'followOk' : 'followWedged');
    if (moved <= 1e-6 || crawled) {
      entry.stuck += 1;
      // Toward the WAYPOINT, not the goal — the corridor is the plan, and a wedged unit needs to
      // rejoin it rather than push at whatever the corridor was avoiding. See doSlide.
      const slide = doSlide(entry.pts[0] ?? tw);
      if (detHypot(slide.x - fw.x, slide.y - fw.y) > 1e-6) {
        // Sliding IS progress, so the route is fine — it is this waypoint the unit cannot
        // reach from here. Skip it rather than paying for a fresh search (WP_SKIP_MAX).
        if (entry.stuck >= 4 && !entry.viaMesh) {
          const swp = entry.pts[0];
          const planWp = swp ? detHypot(swp.x - fw.x, swp.y - fw.y) : Infinity;
          if (entry.pts.length > 1 && entry.skipped < WP_SKIP_MAX && planWp > 1) {
            entry.pts.shift();
            entry.skipped += 1;
            entry.wp = null;
            entry.wpD = Infinity;
            entry.noGain = 0;
            entry.stuck = 0;
            diag(side, 'wpSkipStuck');
          } else {
            dropStaleCorridor(side);
          }
        }
        return worldToCombat(slide, anchor, from.z);
      }
      if (entry.stuck >= 4) {
        let swp = entry.pts[0];
        if (mesh && swp) {
          const sideHop = sidestepNavMesh(mesh, fw, swp, Math.max(step, 2));
          if (sideHop) {
            entry.stuck = 0;
            diag(side, 'unstickSidestep');
            return worldToCombat(sideHop, anchor, from.z);
          }
        }
        if (!entry.viaMesh && entry.pts.length > 1 && entry.skipped < WP_SKIP_MAX) {
          entry.pts.shift();
          entry.skipped += 1;
          entry.wp = null;
          entry.wpD = Infinity;
          entry.noGain = 0;
          entry.stuck = 0;
          diag(side, 'wpSkipStuck');
        } else if (!entry.viaMesh || entry.stuck >= 12) {
          dropStaleCorridor(side);
        }
        // Seam-gap hop: coarse A* legally bridges a fine void run of one coarse cell, so cross it along
        // the corridor ray and land on the first walkable sample. Without it the walker wedged.
        swp = entry.pts[0];
        // Wedged with nothing to slide to. The overview seam-gap hop and the storey-stack recover arm
        // both read raster cell geometry and went with it in E7.6; the mesh's own push is the ladder.
        const pushAt = swp ?? tw;
        if (mesh) {
          const push = stepWalkableNavMesh(mesh, fw, pushAt, 3);
          if (detHypot(push.x - fw.x, push.y - fw.y) > 0.3) {
            diag(side, 'unstickPush');
            return worldToCombat(push, anchor, from.z);
          }
        }
      }
      return stay();
    }
    entry.stuck = 0;
    entry.skipped = 0;
    if (entry.pts.length === 0) unitNavPaths.delete(side);
    return worldToCombat(nextW, anchor, from.z);
  };

  const pathTo = bindPathTo({
    ctx, dead, bySide, posOf, anchorOf, combatToWorld,
    unitNavPaths, sharedPathByGoal, lastSearchAt, orderStall, navSearchQueue, diag,
    goalRegridYd: GOAL_REGRID_YD,
    shareStartYd: SHARE_START_YD,
    shareGoalYd: SHARE_GOAL_YD,
  });
  ctx.pathTo = pathTo;

  /** Off every walkable layer — void, roofed black, inside a wall column. */
  const offMesh = (w: NavPos): boolean => {
    const mapId = anchorOf()?.mapId;
    // Loaded mesh is the floor. Raster fallback legalises a pit whose 2-D column is walkable on
    // another storey. Door-lip erosion is the 1.6 yd poly tolerance, not a raster vote.
    const mesh = mapId != null ? navMeshForMap(mapId) : null;
    if (mesh) {
      const hit = findNearestPoly(mesh, w.x, w.y, w.z, 2);
      return !(hit && hit.dist <= 1.6);
    }
    return true;
  };

  /** Void / wrong-storey rescue — nearest floor, or the player's stand. */
  const NUDGE_SEARCH_YD = 20;
  /** Crumb = last stand reached under own power on a real floor; recall target of last resort. */
  const CRUMB_STEP_YD = 5;
  const CRUMB_MAX_DZ_YD = 4;
  const lastGoodStand = new Map<string, CombatPosYd>();
  /** Whole ladder found nothing for this long ⇒ hard recall to the crumb. */
  const NUDGE_RECALL_MS = 2_000;
  const nudgeFail = new Map<string, { t: number; ms: number }>();
  const dropCrumb = (f: Fighter, at: CombatPosYd): void => {
    if (isEnemySide(f.side)) return;
    // Inside any stuck window the spot is suspect — a trap must not stamp itself good.
    const stall = orderStall.get(f.side);
    if ((stall != null && (stall.ms > 0 || stall.hops > 0))
      || (stuckState.get(f.side)?.ms ?? 0) > 0
      || (partyStuckWatch.get(f.side)?.ms ?? 0) > 0) return;
    const prev = lastGoodStand.get(f.side);
    if (!prev) { lastGoodStand.set(f.side, { ...at }); return; }
    if (detHypot(at.x - prev.x, at.y - prev.y) < CRUMB_STEP_YD) return;
    // A storey-sized z jump counts only off a live corridor: stairs walk corridors, falls don't.
    const dz = at.z != null && prev.z != null ? Math.abs(at.z - prev.z) : 0;
    const live = unitNavPaths.get(f.side);
    if (dz > CRUMB_MAX_DZ_YD && !(live && live.pts.length > 0)) return;
    lastGoodStand.set(f.side, { ...at });
  };
  const nudgeOntoMesh = (f: Fighter): boolean => {
    if (f.rootedUntil > ctx.t || f.stunnedUntil > ctx.t || f.incapUntil > ctx.t) return false;
    const at = posOf(f.side);
    const anchor = anchorOf();
    // Every rung below is mesh-exclusive wherever a mesh is loaded. A raster-only gate kept the whole
    // void rescue shut for a unit the mesh could have recovered. E4.6 finding 1.
    if (!at || anchor?.mapId == null || !navMeshForMap(anchor.mapId)) return false;
    const w = combatToWorld(at, anchor);
    const lead = !isEnemySide(f.side) ? posOf('player') : undefined;
    const live = unitNavPaths.get(f.side);
    const climbing = !!(live && live.pts.length > 0);
    const otherStorey = !!(lead?.z != null && at.z != null && Math.abs(at.z - lead.z) > 6);
    // Airborne on a bake jump link: the corridor's next waypoint is a lower floor inside a running
    // jump's reach, so the fall IS the route (MoveFall); the snap below would yank it back onto the lip.
    if (climbing && live!.viaMesh && w.z != null) {
      const wp = live!.pts[0]!;
      if (wp.z != null && wp.z < w.z - WALKABLE_CLIMB_YD
        && detHypot(wp.x - w.x, wp.y - w.y) <= JUMP_REACH_MAX_YD + 1.6) {
        const land = findNearestPoly(navMeshForMap(anchor.mapId)!, wp.x, wp.y, wp.z, 2);
        if (land && land.dist <= 1.6 && offMesh(w)) return false;
      }
    }
    if (!offMesh(w)) {
      nudgeFail.delete(f.side);
      dropCrumb(f, at);
      if (!(otherStorey && !climbing && f.side !== 'player')) return false;
    }
    const mapId = anchor?.mapId;
    const mesh = mapId != null ? navMeshForMap(mapId) : null;
    let s: NavPos | null = null;
    if (mesh) {
      // Mesh exclusive: raster nearestWalkableNearZ collapses stacked floors into one
      // height byte and will "recover" a void pit onto the storey below.
      s = snapOntoNavMesh(mesh, w.x, w.y, at.z, NUDGE_SEARCH_YD, 4);
      if (!s && at.z != null) {
        s = snapOntoNavMesh(mesh, w.x, w.y, at.z, NUDGE_SEARCH_YD, STOREY_DZ_YD);
      }
      if (!s && lead?.z != null && f.side !== 'player') {
        const lw = combatToWorld(lead, anchor);
        s = snapOntoNavMesh(mesh, lw.x, lw.y, lead.z, 8, 4)
          ?? { x: lw.x, y: lw.y, z: lead.z };
      }
    }
    if (!s) {
      // No floor found anywhere near HERE (the frozen-player shape, ZG bridge underside).
      const nf = nudgeFail.get(f.side);
      const acc = !nf ? tickMs : (nf.t === ctx.t ? nf.ms : nf.ms + tickMs);
      nudgeFail.set(f.side, { t: ctx.t, ms: acc });
      if (acc >= NUDGE_RECALL_MS && recallToLastGood(f)) {
        nudgeFail.delete(f.side);
        return true;
      }
      return false;
    }
    nudgeFail.delete(f.side);
    unstuckFails.delete(f.side);
    setPos(f.side, worldToCombat(s, anchor, s.z ?? at.z));
    unitNavPaths.delete(f.side);
    stackRecover.delete(f.side);
    stuckState.delete(f.side);
    return true;
  };

  // Charge travel — peeled to sessionCharge.ts (filesize ratchet).
  const { finishChargeArrival, advanceChargeMove, charge } = createChargeArm({
    ctx, claims, tickMs, posOf, setPos, dead,
    fighterByThreatId, hostileTargetOf, foeOf,
    weaponStrike, castOnTargets, dropStaleCorridor, floorOf,
  });

  // Kit shortlists + live speed — peeled to sessionMotionKit.ts (filesize ratchet).
  const {
    kitRangedAuto, isThreatVictimOf, pbaoeRadiusYd, longestOffenseRangeYd,
    shortOffenseList, wantsMeleeBand, runSpeedYdPerSec, enemyIsFleeing,
  } = createMotionKit({ ctx, onCooldown, canAfford, isChargeRole });

  // Enemy combat engagement is a non-empty threat list. Until then no gap-close and no white, so a
  // Frostbolt open stands still while the missile is in flight.
  const enemyEngaged = (f: Fighter): boolean => {
    if (!isEnemySide(f.side)) return true;
    const tm = ctx.threatOf(f);
    return !!tm && !tm.isEmpty();
  };

  /** Within this many yards of a dest the walk has arrived: move orders, charge, follow. */
  const ARRIVE_YD = 0.25;

  /** True while the player (or a companion) owns this unit's motion — no AI gap-close. */
  const manualMotion = (side: string): boolean =>
    (ctx as { unitManualMotion?: Set<string> }).unitManualMotion?.has(side) === true;

  // ChaseMovementGenerator distance recheck: four times a second the core re-asks whether the dest is
  // still a melee spot on this body, and re-splines when not. Cite: TargetedMovementGenerator.cpp:242.
  const CHASE_RECHECK_MS = 250;
  /** side -> earliest t this unit may re-aim its chase dest. */
  const chaseRecheckAt = new Map<string, number>();
  // A positional slide in progress, as an offset from the focus so it translates but does not rotate,
  // held until the unit STANDS there. Un-latched it walked 26-43 yd for 9-12 net, 3-6% less damage.
  const posSlideHold = new Map<string, { dx: number; dy: number; tgt: string }>();
  /** Arrived: no new slide for this long, so a still-exposed spot cannot re-solve every tick. */
  const POS_SLIDE_SETTLE_MS = 1_500;
  const posSlideSettled = new Map<string, number>();
  // Live destination of a held slide, or null when nothing is held for this focus. Arrival (and a focus
  // change) drops the hold and starts the settle window.
  const heldSlideDest = (
    side: string,
    tgtSide: string,
    focusAt: CombatPosYd,
    from: CombatPosYd,
    arriveYd: number,
  ): CombatPosYd | null => {
    const held = posSlideHold.get(side);
    if (!held) return null;
    if (held.tgt !== tgtSide) {
      posSlideHold.delete(side);
      return null;
    }
    const at: CombatPosYd = {
      x: focusAt.x + held.dx,
      y: focusAt.y + held.dy,
      ...(from.z != null ? { z: from.z } : {}),
    };
    const d = combatDistanceYd(from, at);
    if (d != null && d > arriveYd) return at;
    posSlideHold.delete(side);
    posSlideSettled.set(side, ctx.t + POS_SLIDE_SETTLE_MS);
    claims.release(side, 'flank', ctx.t);
    return null;
  };
  const holdSlide = (side: string, tgtSide: string, focusAt: CombatPosYd, dest: CombatPosYd): void => {
    posSlideHold.set(side, { dx: dest.x - focusAt.x, dy: dest.y - focusAt.y, tgt: tgtSide });
  };
  // Friendly melee sharing one focus, in session unit order so a rank does not reshuffle into a new
  // destination each tick, and when each focus last MOVED — you cannot flank a body that is turning.
  const focusStillSince = new Map<string, { x: number; y: number; since: number }>();
  // How long a focus must hold its spot before anyone flanks it. Three ticks: a chasing boss never
  // qualifies, and at 1 s the behind-gate fixture ran out of its 20 ticks before the rogue arrived.
  const FOCUS_STILL_MS = 300;
  /** Yards of drift that count as the focus moving (below this is float noise). */
  const FOCUS_STILL_EPS_YD = 0.35;
  const focusIsStill = (side: string, at: CombatPosYd): boolean => {
    const prev = focusStillSince.get(side);
    if (!prev) {
      focusStillSince.set(side, { x: at.x, y: at.y, since: ctx.t });
      return false;
    }
    if (detHypot(at.x - prev.x, at.y - prev.y) > FOCUS_STILL_EPS_YD) {
      prev.x = at.x;
      prev.y = at.y;
      prev.since = ctx.t;
      return false;
    }
    return ctx.t - prev.since >= FOCUS_STILL_MS;
  };
  let meleePeerAt = -1;
  const meleePeers = new Map<string, string[]>();
  const meleePeersOf = (tgtSide: string): string[] => {
    if (meleePeerAt !== ctx.t) {
      meleePeerAt = ctx.t;
      meleePeers.clear();
      for (const u of fightersOrder()) {
        if (isEnemySide(u.side) || dead(u) || isTotemSide(u.side)) continue;
        if (!(u.mode === 'melee' || wantsMeleeBand(u))) continue;
        const focus = foeOf(u);
        if (!focus || dead(focus)) continue;
        const list = meleePeers.get(focus.side);
        if (list) list.push(u.side);
        else meleePeers.set(focus.side, [u.side]);
      }
    }
    return meleePeers.get(tgtSide) ?? [];
  };
  // Evade an enemy that cannot reach its victim: empty threat, full vitals, passive on the floor. One
  // unreachable Defias Miner held the party in combat from 42.9 yd for 60 s and blocked auto-run.
  const evadeUnreachable = (f: Fighter): void => {
    const tm = ctx.threatOf(f);
    if (tm) tm.clear();
    f.hp = Math.max(1, f.spec.maxHealth);
    f.power = f.spec.powerType === 'rage' ? 0 : f.spec.maxPower;
    f.castingSpell = null;
    if (f.channeling) interruptChannel(f, channelInterruptCtx(ctx), { quiet: true });
    f.pendingCharge = null;
    claims.breakAll(f.side);
    unitNavPaths.delete(f.side);
    stuckState.delete(f.side);
    // Finalize the chase generator: its watchdog and park timer are the only things that
    // know this unit was chasing at all (MovementGenerator.h:39).
    chase.finalize?.(f);
    navEscalateUntil.delete(f.side);
    clampProgress.delete(f.side);
    // Named in navDiag because a mob that resets mid-chase and one that never chased look
    // identical from outside, and this counter is what tells a wall apart from a bad corridor.
    diag(f.side, 'evadeUnreachable');
    ctx.push({ t: ctx.t, kind: 'flavor', text: `${f.spec.name} cannot reach you and resets.` });
    // Same scripted half as releaseEnemyToPassive: the instance OnCreatureEvade hook, then the
    // script's own EnterEvadeMode and Reset. Cite: Unit.cpp:578-592; CreatureAI.cpp:66-71.
    runEvadeLifecycle(ctx, f);
  };

  // Gap-close at effective run speed when out of band, with a stuck guard on NET close to the goal:
  // displacement alone never latched, because wall-graze thrash zigzags in place at moved > eps.
  const stuckState = new Map<string, {
    gx: number; gy: number;
    /** Distance-to-goal when this window opened. */
    startD: number;
    /** Best (shortest) distance-to-goal seen in the window. */
    bestD: number;
    ms: number;
  }>();
  const STUCK_GIVE_UP_MS = 1000;
  /** Need this much net close on the goal to clear the window (zigzag nets ~0). */
  const STUCK_PROGRESS_YD = 1.5;
  /** A re-aim this far is a fresh attempt, not the same blocked one. */
  const STUCK_GOAL_EPS_YD = 2;
  const distToGoal = (a: CombatPosYd, b: CombatPosYd): number =>
    a.z != null && b.z != null
      ? detHypot3(a.x - b.x, a.y - b.y, a.z - b.z)
      : detHypot(a.x - b.x, a.y - b.y);
  const noProgressStuck = (f: Fighter, goal: CombatPosYd): boolean => {
    const p = posOf(f.side);
    if (!p) return false;
    const goalD = distToGoal(p, goal);
    const prev = stuckState.get(f.side);
    if (!prev
      || distToGoal({ x: goal.x, y: goal.y }, { x: prev.gx, y: prev.gy }) > STUCK_GOAL_EPS_YD
      || goalD <= prev.startD - STUCK_PROGRESS_YD) {
      stuckState.set(f.side, {
        gx: goal.x, gy: goal.y, startD: goalD, bestD: goalD, ms: 0,
      });
      return false;
    }
    if (goalD < prev.bestD) prev.bestD = goalD;
    // Real progress mid-window: restart from the new best (steady walk clears forever).
    if (prev.bestD <= prev.startD - STUCK_PROGRESS_YD) {
      stuckState.set(f.side, {
        gx: goal.x, gy: goal.y, startD: prev.bestD, bestD: prev.bestD, ms: 0,
      });
      return false;
    }
    prev.ms += tickMs;
    return prev.ms >= STUCK_GIVE_UP_MS;
  };

  // Mild rescue, never the player's own click: thrashing in place with no net close gets a small
  // walkable hop, never a snap to the destination — that read as a teleport to the click.
  const PARTY_STUCK_MS = 2_500;
  /** Net close on goal required to clear; thrash nets ~0. */
  const PARTY_STUCK_PROGRESS_YD = 1.5;
  const PARTY_STUCK_GOAL_EPS_YD = 2;
  /** Must still be within this of the window origin — left it ⇒ walking, not stuck. */
  const PARTY_STUCK_CLUSTER_YD = 4;
  /** Small hop only; repeated rescues can close a gap without one-shot teleports. */
  const PARTY_UNSTUCK_HOP_YD = 5;
  const partyStuckWatch = new Map<string, {
    ax: number; ay: number; az?: number;
    gx: number; gy: number;
    startD: number;
    bestD: number;
    ms: number;
  }>();

  /** Clear path caches after a rescue hop so the next tick re-routes from the new cell. */
  const clearMotionCaches = (side: string): void => {
    claims.breakAll(side);
    unitNavPaths.delete(side);
    stackRecover.delete(side);
    stuckState.delete(side);
    partyStuckWatch.delete(side);
    clearChaseParkTimer(side);
    posSlideHold.delete(side);
    posSlideSettled.delete(side);
    followLeadFailed.delete(side);
  };

  /** Consecutive soft-rescue failures per side; any successful reposition resets it. */
  const unstuckFails = new Map<string, number>();
  const UNSTUCK_FAILS_RECALL = 3;
  // Terminal rung: every hop, sidestep and snap failed repeatedly — put the unit back on the last ground it
  // walked itself. Party only; a wedged enemy evades instead.
  const recallToLastGood = (f: Fighter): boolean => {
    if (isEnemySide(f.side)) return false;
    const crumb = lastGoodStand.get(f.side);
    const at = posOf(f.side);
    if (!crumb || !at) return false;
    if (detHypot(crumb.x - at.x, crumb.y - at.y) < 1
      && (crumb.z == null || at.z == null || Math.abs(crumb.z - at.z) < 2)) return false;
    setPos(f.side, { ...crumb });
    (ctx as { unitMoveOrders?: Map<string, CombatPosYd[]> }).unitMoveOrders?.delete(f.side);
    orderStall.delete(f.side);
    unstuckFails.delete(f.side);
    clearMotionCaches(f.side);
    f.decideDirty = true;
    diag(f.side, 'stuckRecall');
    return true;
  };

  // Small walkable hop toward `goal` — never goal-snap, never long-range hard teleport. If nothing walkable
  // along a short ray: clear path cache only (repath next tick).
  const softUnstuckToward = (f: Fighter, from: CombatPosYd, goal: CombatPosYd): boolean => {
    const moved = softUnstuckHop(f, from, goal);
    if (moved) unstuckFails.delete(f.side);
    else if (!isEnemySide(f.side)) unstuckFails.set(f.side, (unstuckFails.get(f.side) ?? 0) + 1);
    return moved;
  };
  const softUnstuckHop = (f: Fighter, from: CombatPosYd, goal: CombatPosYd): boolean => {
    if (isEnemySide(f.side)) return false;
    unitNavPaths.delete(f.side);
    stackRecover.delete(f.side);
    stuckState.delete(f.side);
    partyStuckWatch.delete(f.side);
    const dx = goal.x - from.x;
    const dy = goal.y - from.y;
    const d = detHypot(dx, dy);
    const anchor = anchorOf();
    if (!(d > 0.5)) {
      const moved = nudgeOntoMesh(f);
      if (moved) diag(f.side, 'stuckUnstuck');
      return moved;
    }
    const ux = dx / d;
    const uy = dy / d;
    const hop = Math.min(PARTY_UNSTUCK_HOP_YD, d);
    const mapId = anchor?.mapId;
    const mesh = mapId != null ? navMeshForMap(mapId) : null;
    if (mesh) {
      const fw = combatToWorld(from, anchor);
      const tw = combatToWorld(
        goal.z == null && from.z != null ? { ...goal, z: from.z } : goal,
        anchor,
      );
      const sideHop = sidestepNavMesh(mesh, fw, tw, hop);
      if (sideHop) {
        setPos(f.side, worldToCombat(sideHop, anchor, from.z));
        diag(f.side, 'unstickSidestep');
        return true;
      }
      const s = stepWalkableNavMesh(mesh, fw, tw, hop);
      const other = goal.z != null && from.z != null && Math.abs(goal.z - from.z) > 3;
      const zGain = other && s.z != null && Math.abs(s.z - goal.z!) < Math.abs(from.z! - goal.z!) - 0.2;
      if (zGain || (!other && detHypot(s.x - fw.x, s.y - fw.y) > 0.4)) {
        setPos(f.side, worldToCombat(s, anchor, from.z));
        diag(f.side, 'stuckUnstuck');
        return true;
      }
      if (other) {
        // In place, a storey change is a fall (MotionMaster.cpp:575 MoveFall), never a climb.
        const hit = findNearestPoly(mesh, fw.x, fw.y, goal.z, hop);
        if (hit && hit.dist <= 1 && Math.abs(hit.z - goal.z!) <= 3 && fw.z != null && hit.z < fw.z) {
          setPos(f.side, worldToCombat({ x: fw.x, y: fw.y, z: hit.z }, anchor, goal.z));
          diag(f.side, 'stuckUnstuck');
          return true;
        }
        diag(f.side, 'stuckRepathOnly');
        return false;
      }
      // Same storey and the mesh had nothing. Falls through to the raster arm, which nudgeOntoMesh:866
      // refuses BY NAME. Counted before it is cut: cutting it changes motion on all 26 mesh maps.
      diag(f.side, 'stuckRasterFallthrough');
    }
    if (mesh) {
      // The mesh is the authority over every spot this arm proposes: up is walkableClimb
      // (MapBuilder.cpp:358), down is a fall (MoveFall) — the symmetric 4 let a hop mount a wall.
      const meshAccepts = (w: NavPos, z: number | null | undefined): boolean => {
        if (!mesh) return true;
        if (z == null || !Number.isFinite(z)) return isWalkableNavMesh(mesh, w.x, w.y);
        const hit = findNearestPoly(mesh, w.x, w.y, z, 2);
        return !!hit && hit.dist <= 0.75 && hit.z - z <= WALKABLE_CLIMB_YD && z - hit.z <= 4;
      };
      for (const frac of [1, 0.7, 0.4]) {
        const dist = hop * frac;
        if (dist < 0.75) continue;
        const cand: CombatPosYd = {
          x: from.x + ux * dist,
          y: from.y + uy * dist,
          ...(from.z != null ? { z: from.z } : {}),
        };
        const w = combatToWorld(cand, anchor);
        if (meshAccepts(w, from.z)) {
          setPos(f.side, worldToCombat(w, anchor, from.z));
          nudgeOntoMesh(f);
          diag(f.side, 'stuckUnstuck');
          return true;
        }
        // The raster proposed these and the mesh vetoed them (E4.9). With the raster gone the
        // mesh proposes its own, which is the same accepted set without the round trip.
        const s = from.z != null
          ? snapOntoNavMesh(mesh, w.x, w.y, from.z, 3, STOREY_DZ_YD)
          : snapOntoNavMesh(mesh, w.x, w.y, undefined, 3);
        if (s) {
          const placed = worldToCombat(s, anchor, from.z);
          // Reject snaps that would jump farther than the intended hop.
          if (detHypot(placed.x - from.x, placed.y - from.y) <= hop + 1) {
            // Judged from the unit's own z: at the snap's z this was always true, a 10 yd lift.
            if (!meshAccepts(s, from.z)) {
              diag(f.side, 'unstickMeshRejected');
            } else {
              setPos(f.side, placed);
              nudgeOntoMesh(f);
              diag(f.side, 'stuckUnstuck');
              return true;
            }
          }
        }
      }
      const fw = combatToWorld(from, anchor);
      const tw = combatToWorld(
        goal.z == null && from.z != null ? { ...goal, z: from.z } : goal,
        anchor,
      );
      const hopW = sidestepNavMesh(mesh, fw, tw, Math.min(hop, 2));
      if (hopW && meshAccepts(hopW, hopW.z ?? from.z)) {
        setPos(f.side, worldToCombat(hopW, anchor, from.z));
        diag(f.side, 'stuckUnstuck');
        return true;
      }
      if (hopW) diag(f.side, 'unstickMeshRejected');
    }
    diag(f.side, 'stuckRepathOnly');
    return false;
  };

  // AI thrash rescue: only while the unit stays in a small cluster with no net goal close. An ALLY under
  // a move order calls it too (sessionMoveOrder.ts); the player's own click never does — that hop read as
  // a teleport to the click. Snared/rooted callers must not invoke this.
  const watchPartyStuck = (
    f: Fighter,
    _before: CombatPosYd,
    after: CombatPosYd,
    goal: CombatPosYd,
  ): boolean => {
    if (isEnemySide(f.side)) return false;
    if (f.rootedUntil > ctx.t || f.stunnedUntil > ctx.t || f.incapUntil > ctx.t) {
      partyStuckWatch.delete(f.side);
      return false;
    }
    const goalD = distToGoal(after, goal);
    const prev = partyStuckWatch.get(f.side);
    const goalMoved = prev != null
      && distToGoal({ x: goal.x, y: goal.y }, { x: prev.gx, y: prev.gy }) > PARTY_STUCK_GOAL_EPS_YD;
    if (!prev || goalMoved) {
      partyStuckWatch.set(f.side, {
        ax: after.x, ay: after.y, az: after.z,
        gx: goal.x, gy: goal.y,
        startD: goalD, bestD: goalD, ms: 0,
      });
      return false;
    }
    if (goalD < prev.bestD) prev.bestD = goalD;
    // Steady walk: net close clears.
    if (prev.bestD <= prev.startD - PARTY_STUCK_PROGRESS_YD) {
      partyStuckWatch.set(f.side, {
        ax: after.x, ay: after.y, az: after.z,
        gx: goal.x, gy: goal.y,
        startD: prev.bestD, bestD: prev.bestD, ms: 0,
      });
      return false;
    }
    // Left the thrash spot ⇒ a real walk (detour), not stuck. Full rebaseline.
    const fromOrigin = distToGoal(after, { x: prev.ax, y: prev.ay, z: prev.az });
    if (fromOrigin > PARTY_STUCK_CLUSTER_YD) {
      partyStuckWatch.set(f.side, {
        ax: after.x, ay: after.y, az: after.z,
        gx: goal.x, gy: goal.y,
        startD: goalD, bestD: goalD, ms: 0,
      });
      return false;
    }
    prev.ms += tickMs;
    if (prev.ms < PARTY_STUCK_MS) return false;
    if (softUnstuckToward(f, after, goal)) return true;
    // Pinned through 3 whole rescue windows (~7.5 s): hard recall to the last good stand.
    if ((unstuckFails.get(f.side) ?? 0) >= UNSTUCK_FAILS_RECALL) return recallToLastGood(f);
    return false;
  };

  // A companion that HAS A DESTINATION, never gets nearer it, and is nowhere near the party is stuck —
  // however much it moves. The rungs above measure a standstill or a 4 yd cluster, and a wedged walker
  // swinging 6 yd defeats both (liveDungeonController's filmed ping-pong).
  //
  // Progress is measured against the unit's OWN goal, never against the player. Measured: judging it on
  // distance-to-player teleported a melee that was legitimately fighting a boss on the far side of the
  // room, because it never closes on the player while doing so (`twinUppercut.uppercutsOnMelee` 12 -> 7).
  const GROUP_RECALL_MS = 8_000;
  /** Leaving this disc around where the window opened is a walk, not a swing. */
  const GROUP_RECALL_ROAM_YD = 12;
  const groupWatch = new Map<string, {
    ox: number; oy: number; oz?: number;
    gx: number; gy: number;
    /** Distance to its own goal when this window opened, and the best since. */
    startD: number; bestD: number; since: number;
  }>();
  // Queued dest, else corridor tail, else the leader on `partyFollow`. A stand gate (inRange / hold)
  // is the job, not a walk: the corridor often still points at the body the melee parked 5 yd short of.
  const liveGoalOf = (side: string, lead: CombatPosYd): CombatPosYd | null => {
    const g = motionGates.read(side)?.gate;
    if (g === 'inRange' || g === 'policyHold' || g === 'stance' || g === 'holdGround') return null;
    const order = ctx.unitMoveOrders?.get(side)?.[0];
    if (order) return order;
    const pts = unitNavPaths.get(side)?.pts;
    const tail = pts && pts.length > 0 ? pts[pts.length - 1] : undefined;
    if (tail) return worldToCombat(tail, anchorOf(), posOf(side)?.z);
    return g === 'partyFollow' ? lead : null;
  };
  // The last rung: put the unit on the player's cell. Same snap `nudgeOntoMesh` takes for a body the
  // mesh lost; the wipe path places the party by fiat the same way (worldPose.setPartyWorldPos).
  const recallToGroup = (f: Fighter, lead: CombatPosYd): void => {
    const anchor = anchorOf();
    const mesh = anchor?.mapId != null ? navMeshForMap(anchor.mapId) : null;
    let dest: CombatPosYd = lead.z != null ? { x: lead.x, y: lead.y, z: lead.z } : { x: lead.x, y: lead.y };
    if (mesh) {
      const lw = combatToWorld(lead, anchor);
      const s = snapOntoNavMesh(mesh, lw.x, lw.y, lead.z, 8, 4);
      if (s) dest = worldToCombat(s, anchor, lead.z);
    }
    setPos(f.side, dest);
    (ctx as { unitMoveOrders?: Map<string, CombatPosYd[]> }).unitMoveOrders?.delete(f.side);
    orderStall.delete(f.side);
    unstuckFails.delete(f.side);
    clearMotionCaches(f.side);
    groupWatch.delete(f.side);
    f.decideDirty = true;
    diag(f.side, 'stuckRecallGroup');
    ctx.push({ t: ctx.t, kind: 'flavor', text: `${f.spec.name} rejoins the party.` });
  };
  const watchGroupRecall = (f: Fighter): void => {
    if (f.side === 'player') return;
    // The BG / RTS bubble spreads the party on purpose, so the player's spot is not "the group" there.
    if (ctx.cfg.friendlyHoldYd != null) { groupWatch.delete(f.side); return; }
    const stance = (ctx as { unitStance?: Map<string, string> }).unitStance?.get(f.side);
    const parked = stance === 'hold' || stance === 'passive'
      || (f.side === 'pet' && ctx.petCommand === 'stay')
      || manualMotion(f.side)
      || f.rootedUntil > ctx.t || f.stunnedUntil > ctx.t || f.incapUntil > ctx.t || f.fearedUntil > ctx.t;
    const at = posOf(f.side);
    const lead = posOf('player');
    if (parked || !at || !lead || dead(bySide('player'))) { groupWatch.delete(f.side); return; }
    // Standing in the party bubble: no recall, and no foeOf. Idle 40-man is this case every tick.
    if (distToGoal(at, lead) <= (ctx.cfg.partyFollowYd ?? PARTY_FOLLOW_YD)) {
      groupWatch.delete(f.side);
      return;
    }
    const focus = foeOf(f);
    if (focus && focus !== f && !dead(focus)) {
      const there = posOf(focus.side);
      const gap = there ? combatDistanceYd(at, there) : null;
      const reach = wantsMeleeBand(f)
        ? MELEE_CONTACT_YD
        : Math.max(MELEE_CONTACT_YD, longestOffenseRangeYd(f));
      if (gap != null && gap <= reach && planarRangeHonestYd(at, there)) {
        groupWatch.delete(f.side);
        return;
      }
    }
    // Far from the party AND holding a goal it is not reaching. Near the party it is in the fight, and
    // with no goal it is standing on purpose — neither is this rung's business.
    const goal = distToGoal(at, lead) > (ctx.cfg.partyFollowYd ?? PARTY_FOLLOW_YD)
      ? liveGoalOf(f.side, lead)
      : null;
    if (!goal) { groupWatch.delete(f.side); return; }
    const d = distToGoal(at, goal);
    const w = groupWatch.get(f.side);
    // A new goal, or a real walk out of the swing disc, is a fresh window rather than a stuck one.
    if (!w
      || distToGoal(at, { x: w.ox, y: w.oy, ...(w.oz != null ? { z: w.oz } : {}) }) > GROUP_RECALL_ROAM_YD
      || distToGoal({ x: goal.x, y: goal.y }, { x: w.gx, y: w.gy }) > PARTY_STUCK_GOAL_EPS_YD) {
      groupWatch.set(f.side, {
        ox: at.x, oy: at.y, ...(at.z != null ? { oz: at.z } : {}),
        gx: goal.x, gy: goal.y, startD: d, bestD: d, since: ctx.t,
      });
      return;
    }
    if (d < w.bestD) w.bestD = d;
    // Only monotone improvement counts, the rule the autopilot stall watchdog already applies.
    if (w.bestD <= w.startD - PARTY_STUCK_PROGRESS_YD) {
      w.startD = w.bestD;
      w.since = ctx.t;
      return;
    }
    if (ctx.t - w.since >= GROUP_RECALL_MS) recallToGroup(f, lead);
  };

  // Fear source position for forced flee: the live fear aura's caster, else current threat or foe.
  // Cite: Unit.cpp SetFleeing → MoveFleeing(source).
  const fearSourcePos = (f: Fighter): CombatPosYd | null => {
    let bestUntil = 0;
    let srcSide: string | null = null;
    for (const e of ctx.effectsOn(f.side)) {
      if (e.kind !== 'cc' || e.control !== 'fear' || e.broken) continue;
      if (e.expiresAt <= ctx.t) continue;
      if (e.expiresAt >= bestUntil) {
        bestUntil = e.expiresAt;
        srcSide = e.source;
      }
    }
    if (srcSide) {
      const p = posOf(srcSide);
      if (p) return p;
    }
    const threat = isEnemySide(f.side) ? hostileTargetOf(f) : foeOf(f);
    if (threat && threat !== f && !dead(threat)) {
      const p = posOf(threat.side);
      if (p) return p;
    }
    return null;
  };

  // Forced flee lives in fearFlee.ts. The dest is GetHitPosition on the loaded floor, so a random
  // quiet-band point through a wall is not a void run. A 100% snare still freezes the unit.
  const fearFlee = createFearFlee({
    claims,
    rng: ctx.rng,
    now: () => ctx.t,
    posOf: (f) => posOf(f.side),
    setPos: (f, p) => setPos(f.side, p),
    sourcePos: fearSourcePos,
    clampDest: (from, dest) => clampDisplacementToFloor(from, dest, floorOf()),
    step: (f, from, to) => {
      // SetCombatSlowed is ONE multiply and the speed helper already carries it. A second copy here
      // squared it to 0.25x at 0 hp and ignored the opt-out flag 369 templates carry.
      const speed = runSpeedYdPerSec(f);
      if (!(speed > 0)) return from;
      return stepDisplacement(from, to, moveStepYd(speed, tickMs), floorOf());
    },
    arriveYd: ARRIVE_YD,
  });

  // Held key / virtual stick — peeled to sessionMoveIntent.ts (E4.2 arm 5).
  const { moveIntent } = createMoveIntentArm({
    ctx, tickMs, posOf, setPos, takeMotion, navStepToward, runSpeedYdPerSec,
  });

  // After-cast retreat (`after.stepBackYd`) — peeled to sessionStepBack.ts (E4.2 arm 4).
  const { stepBack } = createStepBackArm({
    ctx, tickMs, posOf, setPos, dead, foeOf, takeMotion, dropStaleCorridor,
    runSpeedYdPerSec, lastMoveFrom,
    clampDest: (from, dest) => clampDisplacementToFloor(from, dest, floorOf()),
  });

  // Manual move orders (click-to-move / RTS group order) — peeled to sessionMoveOrder.ts
  // (E4.2 arm 3). Built here rather than earlier because its unstuck ladder is declared above.
  const { moveOrder, advanceHeld: advanceHeldOrder } = createMoveOrderArm({
    ctx, tickMs, claims, arriveYd: ARRIVE_YD, unstuckFailsRecall: UNSTUCK_FAILS_RECALL,
    posOf, setPos, diag, takeMotion, orderOwnerOf, navStepToward, dropStaleCorridor,
    unitNavPaths, orderStall, nudgeOntoMesh, softUnstuckToward, watchPartyStuck, recallToLastGood,
    unstuckFails, runSpeedYdPerSec,
  });

  // Pet / guardian / Flamelash follows — peeled to sessionFollow.ts (filesize ratchet).
  const { petCommand, guardianFollow, spiritFollow, partyFollow } =
    createFollowArms({
      ctx, tickMs, posOf, setPos, dead, foeOf, bySide, enemyEngaged,
      takeMotion, navStepToward, runSpeedYdPerSec,
    });

  // Mechanic moves (rotation `kind:'move'` rows) — peeled to sessionMechanicMove.ts.
  const { mechanicMove } = createMechanicMove({
    ctx, claims, tickMs, posOf, setPos, fightersOrder, dead, foeOf,
    navStepToward, runSpeedYdPerSec, longestOffenseRangeYd, dropStaleCorridor,
    pathTo, advanceHeldOrder,
  });

  // Hold-ground return — peeled to sessionHome.ts (E4.2 arm 2).
  const { home } = createHomeArm({
    ctx, tickMs, posOf, setPos, gate, takeMotion, navStepToward, watchPartyStuck,
    runSpeedYdPerSec,
  });

  // Gap-close, the melee flank slot and the ranged stand band — peeled to sessionChase.ts
  // (E4.2). It is the floor of the claim order and the last arm in this chain.
  const { chase, clearChaseParkTimer, markNoPath, standsInLiveCone } = createChaseArm({
    ctx, tickMs, posOf, setPos, dead, foeOf, hostileTargetOf, enemyEngaged, fightersOrder,
    gate, diag, claimOwnerOf: (side) => claims.ownerOf(side, ctx.t),
    takeMotion, navStepToward, pathTo, advanceHeldOrder, dropStaleCorridor,
    unitNavPaths, stuckState, noProgressStuck, watchPartyStuck, evadeUnreachable,
    runSpeedYdPerSec, longestOffenseRangeYd, shortOffenseList, onCooldown, canAfford,
    kitRangedAuto, wantsMeleeBand, pbaoeRadiusYd, isThreatVictimOf,
    heldSlideDest, holdSlide, posSlideSettled, focusIsStill, meleePeersOf,
  });

  const advanceGapClose = (f: Fighter): void => {
    if (!ctx.unitPositionsMutable) { gate(f.side, 'noPositions'); return; }
    // A cast bar parks a unit, except one standing in a live wedge: a player moves and eats the lost
    // cast (the order cancels it, sessionPathTo.ts:481) rather than finishing the bar in a breath.
    const coneOverride = f.castingSpell != null && !dead(f) && standsInLiveCone(f);
    if (dead(f) || (f.castingSpell && !coneOverride) || f.pendingCharge) {
      gate(f.side, dead(f) ? 'dead' : f.castingSpell ? 'casting' : 'charging');
      return;
    }
    // A channel stands its caster still for the whole duration, like a cast bar. Only the cast was
    // checked here, so the player channelled and ran. A deliberate walk cancels the channel first.
    if (channelHoldsStill(f, ctx.t)) { gate(f.side, 'channeling'); return; }
    // Root, stun, incapacitate and SESSILE mean no voluntary motion; the last clause is EventAI's own
    // root, whose flag nothing read. NOT ported: the action's combatOnly param, so it persists here.
    if (
      f.rootedUntil > ctx.t || f.stunnedUntil > ctx.t || f.incapUntil > ctx.t
      || (((f.spec.staticFlags ?? 0) & 0x0100) !== 0)
      || (isEnemySide(f.side) && ctx.enemyCastBySide.get(f.side)?.eventAi.immobilized === true)
    ) { gate(f.side, 'immobile'); return; }
    // Fear is forced flee, not a freeze, and DoFlee takes the same generator, so a flee-for-assist row
    // and a no-melee critter both run here. Reading the flag only in the swing left them standing.
    if (f.fearedUntil > ctx.t || enemyIsFleeing(f)) {
      // Forced flight outranks every decision below it; only a knockback displaces it.
      fearFlee.generator.update(f, tickMs);
      gate(f.side, 'fleeing');
      return;
    }
    // Not fleeing: Finalize() drops the claim and the pinned source, so a later fear pins
    // its own. Cite: MovementGenerator.h:39.
    fearFlee.generator.finalize?.(f);
    if (isTotemSide(f.side)) { gate(f.side, 'totem'); return; }
    // PLAN §7.5: mechanic move BEFORE held-key / step-back / engage / leash.
    if (mechanicMove.update(f, tickMs)) { gate(f.side, 'mechanicMove'); return; }
    // Held key / stick outranks the click route it interrupted.
    if (moveIntent.update(f, tickMs)) { gate(f.side, 'moveIntent'); return; }
    // After-cast retreat: before stance / engage / leftover walk-in. Cast-time waits
    // (stepSession + combatView) so this actually covers the authored yards.
    if (stepBack.update(f, tickMs)) { gate(f.side, 'stepBack'); return; }
    // A ranged dest is "stand short of where the mob was", so once the mob walks in the move-order arm
    // walks you onto it. A player "go here" dest is not that park and is kept.
    if (!isEnemySide(f.side)
      && !(ctx as { unitHoldCourse?: Set<string> }).unitHoldCourse?.has(f.side)
      && (((ctx as { unitMoveOrders?: Map<string, unknown> }).unitMoveOrders?.has(f.side) ?? false)
        || unitNavPaths.has(f.side))) {
      const focus = foeOf(f);
      if (focus && focus !== f && !dead(focus)) {
        // A POLICY travel order does not survive the pull it walked into; a person's click does.
        // Cite: PlayerbotAI.cpp:2394 DoCombatMovement — MotionMaster::Clear(false) + MoveChase.
        if (orderOwnerOf(f.side) === 'route' && enemyEngaged(focus)) {
          (ctx as { unitMoveOrders?: Map<string, unknown> }).unitMoveOrders?.delete(f.side);
          dropStaleCorridor(f.side);
          claims.release(f.side, 'route', ctx.t);
        }
        const here = posOf(f.side);
        const there = posOf(focus.side);
        const gap = here && there ? combatDistanceYd(here, there) : null;
        const stand = f.spec.standYards ?? 0;
        let park = stand > MELEE_REACH_YD + 1
          ? stand
          : (f.side === 'pet' ? MELEE_REACH_YD + MELEE_PARK_SLACK_YD : 0);
        // A ranged kit with no stamped stand parks at cast range: the storey/LOS fallback
        // (tail of advanceGapClose) queues the BODY, and an order is walked to its end.
        if (park <= 0 && !wantsMeleeBand(f)) {
          const r = longestOffenseRangeYd(f);
          if (r > MELEE_REACH_YD + 1) park = r;
        }
        // Sight is part of parked — the tail hold needs range + storey + LOS at once.
        if (park > 0 && gap != null && gap <= park && planarRangeHonestYd(here, there)
          && (!ctx.cfg.navLos || navSightClear(ctx.cfg, here, there))) {
          ctx.unitMoveOrders?.delete(f.side);
          dropStaleCorridor(f.side);
        }
        // A chase dest is aimed at a BODY, and a queued dest is walked to its END, so melee trailed a
        // leg behind a runner. Re-spline instead, on a 250 ms recheck, once the dest stops fitting.
        if (gap != null && gap > MELEE_CONTACT_YD
          && ctx.t >= (chaseRecheckAt.get(f.side) ?? 0)
          && claims.ownerOf(f.side, ctx.t) === 'chase'
          && (f.mode === 'melee' || wantsMeleeBand(f))) {
          chaseRecheckAt.set(f.side, ctx.t + CHASE_RECHECK_MS);
          const dest = (ctx as { unitMoveOrders?: Map<string, CombatPosYd[]> })
            .unitMoveOrders?.get(f.side)?.[0];
          const off = dest && there ? combatDistanceYd(there, dest) : null;
          if (off != null && off > MELEE_CONTACT_YD) {
            (ctx as { unitMoveOrders?: Map<string, unknown> }).unitMoveOrders?.delete(f.side);
          }
        }
      }
    }
    // Manual move order wins over AI gap-close (party click-to-move / multi-select).
    if (moveOrder.update(f, tickMs)) { gate(f.side, 'moveOrder'); return; }
    // Motion is the player's while the latch is held: no key down and no order left means STAND.
    // Letting gap-close take over here is what makes kiting impossible.
    if (manualMotion(f.side)) { gate(f.side, 'manualMotion'); return; }
    // Stay parks the pet; Follow heels the owner at PET_FOLLOW_DIST. Guardians use 1.5.
    if (petCommand.update(f, tickMs)) { gate(f.side, 'petCommand'); return; }
    // Flamelash Burning Spirit MoveFollow runs while the encounter is live.
    if (spiritFollow.update(f, tickMs)) { gate(f.side, 'spiritFollow'); return; }
    if (guardianFollow.update(f, tickMs)) { gate(f.side, 'guardianFollow'); return; }
    // RTS stance: hold / passive stand after the walk; patrol is handled by the move order.
    const stance = (ctx as { unitStance?: Map<string, string> }).unitStance?.get(f.side);
    if (stance === 'hold' || stance === 'passive') { gate(f.side, 'stance'); return; }
    // Not engaged yet — stand until first threat (missile land) or AttackStart seed.
    // threat 0 is the gate's own condition — carried so a report reads as a measurement.
    if (!enemyEngaged(f)) { gate(f.side, 'notEngaged', { threat: 0 }); return; }
    // Outside its hold-ground bubble a friendly walks home rather than picking a target at all.
    // The arm stamps `holdGround` itself — it is the only caller that knows the distance.
    if (home.update(f, tickMs)) return;
    // Nothing inside acquire range: walk back to the party instead of standing where the fight
    // left us. Below `home` because the RTS bubble is the same question with its own anchor.
    if (partyFollow.update(f, tickMs)) { gate(f.side, 'partyFollow'); return; }
    chase.update(f, tickMs);
  };

  // Per-tick motion for every living unit once geometry is seeded, each checked against the mesh first:
  // a knockback or an off-mesh spawn leaves a unit with no floor to slide on and no cell to path from.
  const drainNavSearches = (): void => {
    if (navSearchTick !== ctx.t) {
      navSearchTick = ctx.t;
      navSearchesThisTick = 0;
    }
    const left = NAV_SEARCH_BUDGET - navSearchesThisTick;
    if (left <= 0 || navSearchQueue.length === 0) return;
    const anchor = anchorOf();
    navSearchesThisTick += drainNavSearchQueue({
      queue: navSearchQueue,
      budget: left,
      mapId: anchor?.mapId,
      unitNavPaths,
      sharedPathByGoal,
      lastSearchAt,
      now: ctx.t,
      diag,
      liveFrom: (s) => {
        const p = posOf(s);
        return p ? combatToWorld(p, anchor) : undefined;
      },
      onNoPath: markNoPath,
      skip: (s) => {
        const f = bySide(s as Side); return !f || dead(f);
      },
    });
  };

  const runMotionPhase = (): void => {
    if (!ctx.unitPositionsMutable) return;
    drainNavSearches();
    const endless = ctx.cfg.endless === true;
    for (const f of fightersOrder()) {
      if (dead(f)) continue;
      if (isTotemSide(f.side)) continue; // totems are placed, never walk
      // Stream passives never path — skip mesh nudge + gap-close (BRD 60+ injects/tick).
      // Detection/aggro is floor-side; once threat seeds they join this loop.
      if (endless && isEnemySide(f.side) && !enemyEngaged(f)) continue;
      nudgeOntoMesh(f);
      if (f.pendingCharge) charge.update(f, tickMs);
      else advanceGapClose(f);
      if (!isEnemySide(f.side)) watchGroupRecall(f);
    }
  };

  /** AreaAura::Update after motion. Radius is C2; death/unsummon is not. */
  const areaAuraMaintainPhase = (): void => {
    runAreaAuraMaintain({
      sources: ctx.areaAuraSources,
      posOf,
      bySide: (side) => bySide(side as Side),
      dead,
      hasGeometry: () => ctx.unitPositionsMutable != null,
      t: ctx.t,
      tickMs,
      diag: (ctx.slowDiag ??= emptySlowDiag()),
    });
  };

  ctx.clearMotionCaches = clearMotionCaches;

  return {
    finishChargeArrival,
    advanceChargeMove,
    enemyEngaged,
    runMotionPhase,
    areaAuraMaintainPhase,
    pathTo,
  };
}
