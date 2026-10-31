// The BG world layer — map, positions, orders, objectives and the engagement shards combat runs
// inside. Strategy ~1 Hz, order 2–5 Hz, rotation 10 Hz. Deterministic: no Date, no Math.random.

import { detHypot } from '../../engine/core/detMath.ts';
import { HONORLESS_TARGET_DURATION_MS, victimGrantsPvpCredit } from '../run/honor.ts';
import {
  findPathForMap, floorZForMap, isWalkablePointForMap, nearestWalkablePointForMap,
} from '../nav/navRegistry.ts';
import {
  type BgObjective,
  type BgOrder,
  type BgPos,
  type BgTeam,
  type BgUnit,
  type BgUnitId,
  type BgUnitView,
  type BgView,
  type ScoreType,
  type BgScoreboardEntry,
  type BgVisionConfig,
  emptyBgScore,
  FAIR_VISION,
  OTHER_TEAM,
} from './types.ts';

/** Cite: BattleGround.h:90 CHECK_PLAYER_POSITION_INVERVAL. */
const START_POS_CHECK_MS = 1000;

/** Repath floor. Cite: TargetedMovementGenerator.cpp:242 i_recheckDistance.Reset(250). */
const ROUTE_RECHECK_MS = 250;
/** Backoff after a refused step or a failed search. Cite: TargetedMovementGenerator.cpp:202 AddDelay. */
const ROUTE_BLOCKED_MS = 1000;
/** A route is stale once its destination strayed this far — a chase target inside it keeps the corridor. */
const ROUTE_STALE_YD = 8;
/** Shared-solve cells. At 16/8 yd a 40-body march bought one 142k-poly A* per body — 47% of all
 *  CPU (profile 2026-08-30); coarse cells make it ONE corridor, joined via nearestLegIndex. */
const SOLVE_FROM_CELL_YD = 64;
const SOLVE_TO_CELL_YD = 48;
const SOLVE_TTL_MS = 20_000;
const SOLVE_CAP = 512;
/**
 * findPath calls ONE tick may spend. Over budget a unit keeps its straight aim and searches on a
 * later tick — the degradation a failed search already had.
 *
 * 2 starved the field without ever saving a search. The asks arrive in BURSTS, so a cap of 2 spent
 * 12% of what it allows over 600 ticks and still turned two thirds of the asks away, and each
 * refusal put a body on a straight line into rock. Swept on src/dev/capabilities/bgMarch.mjs, same
 * tree, only this constant moving:
 *
 *   budget   2 -> 149 searches, 315 refused, 40/80 advanced
 *   budget   4 -> 138 searches, 126 refused, 48/80
 *   budget   8 -> 145 searches,  40 refused, 43/80
 *   budget  16 -> 139 searches,   0 refused, 44/80
 *   budget  32 -> 139 searches,   0 refused, 44/80   (saturated at 16)
 *
 * The search COUNT is flat, so this buys the corridors back for free: 1317 ms median at 2 against
 * 1335 ms at 16 over 5 runs each, inside the run-to-run spread. It removes a starvation, it does
 * not add work — a body that gets its corridor first ask stops re-asking.
 */
const SEARCH_BUDGET_PER_TICK = 16;
/** Polygons ONE search may visit. Dun Baldar -> Frostwolf needs 22,657; a shallower cap failed the
 *  cross-valley march and read as units clipping through rock. Sharing pays it down, not depth. */
const SEARCH_MAX_VISITED = 40_000;

/** Deterministic per-unit stagger, so a crowd's backoffs do not all expire on one tick. */
function unitJitterMs(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h >>> 0) % ROUTE_BLOCKED_MS;
}

/** Entry leg for a corridor adopted mid-path — the leg nearest the unit, so a shared solve whose
 *  start cell sits behind it costs at most one cell of backtrack. */
function nearestLegIndex(legs: readonly BgPos[], pos: BgPos): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < legs.length; i++) {
    const d = detHypot(legs[i]!.x - pos.x, legs[i]!.y - pos.y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export interface BgWorldOpts {
  mapId: number;
  teamSize: number;
  /** Order-layer tick, ms. §6a says 2-5 Hz; 200 ms is the default. */
  tickMs?: number;
  /** Gate countdown before the match starts, ms. Cite: BattleGroundStartTimeIntervals 2m. */
  countdownMs?: number;
  /** StartMaxDist — the starting-gate leash, yards (§6g). WSG/AB 75, AV 100. */
  startMaxDist?: number;
  /** Two units within this distance are in contact and share an engagement shard. */
  engageYd?: number;
  // Match clock cap in ms on the same scale as `t`; 0 or absent means no limit. A PRODUCT RULE,
  // because the combat session under this world caps itself and nothing closed the world loop.
  timeLimitMs?: number;
}

/** Units whose position ANOTHER system writes. The world stops advancing their orders: two
 *  owners on one `pos` draw the body at both, which reads as a chip jiggling in place. */
export type BgPosOwnedElsewhere = (u: BgUnit) => boolean;

/** A cluster of units in contact — what becomes one combat session. */
export interface BgShard {
  id: number;
  units: BgUnitId[];
}

export interface BgTickStats {
  t: number;
  shards: number;
  /** Units inside some shard this tick. */
  engaged: number;
  /** Largest shard, in units — this is what has to stay under the W1 ceiling. */
  largestShard: number;
}

export class BgWorld {
  readonly mapId: number;
  readonly teamSize: number;
  readonly tickMs: number;
  readonly countdownMs: number;
  readonly startMaxDist: number;
  readonly engageYd: number;
  readonly timeLimitMs: number;

  /** Match clock, ms. Negative during the gate countdown; 0 when gates open. */
  t: number;
  readonly units = new Map<BgUnitId, BgUnit>();
  readonly objectives = new Map<string, BgObjective>();
  score: Record<BgTeam, number> = { alliance: 0, horde: 0 };
  readonly scoreboard = new Map<BgUnitId, BgScoreboardEntry>();
  /** Team start points — also the leash anchors before gates open. */
  readonly startPos: Record<BgTeam, BgPos> = { alliance: { x: 0, y: 0 }, horde: { x: 0, y: 0 } };
  ended = false;
  winner: BgTeam | null = null;

  /** Kills credited since the last `takeKillCredit()`. Drained by the honor bookkeeper. */
  private killCredit: Array<{ killer: BgUnitId; victim: BgUnitId; victimLevel: number }> = [];

  private shards: BgShard[] = [];
  /** Uniform bucket grid over the live roster, rebuilt once per tick. See `regrid`. */
  private grid = new Map<number, BgUnitId[]>();
  private gridCell = 30;
  // One routed path per unit; `blockedUntil` is the repath throttle
  // (TargetedMovementGenerator.cpp:242 Reset(250), :202 AddDelay 1000 ms).
  private routes = new Map<BgUnitId, {
    to: BgPos; legs: readonly BgPos[]; leg: number; blockedUntil: number;
  }>();
  // Solves shared by quantized (start cell → dest cell): a marching crowd walks one corridor,
  // and `legs: null` caches "no path" so an unreachable order is one search per cell per TTL.
  private solves = new Map<string, { legs: readonly BgPos[] | null; at: number }>();
  // A wall-refused unit holds its aim until this clock, then re-searches — it outlives the
  // route deletion that armed it, or the very next tick re-ran the full A*.
  private repathHoldUntil = new Map<BgUnitId, number>();
  private visionByTeam: Record<BgTeam, BgVisionConfig> = {
    alliance: FAIR_VISION,
    horde: FAIR_VISION,
  };
  /** Cite: BattleGround.cpp:197 m_validStartPositionTimer = 0. */
  private startPosCheckRemainMs = 0;

  constructor(opts: BgWorldOpts) {
    this.mapId = opts.mapId;
    this.teamSize = opts.teamSize;
    this.tickMs = opts.tickMs ?? 200;
    this.countdownMs = opts.countdownMs ?? 120_000;
    this.startMaxDist = opts.startMaxDist ?? 75;
    this.engageYd = opts.engageYd ?? 30;
    this.timeLimitMs = Math.max(0, opts.timeLimitMs ?? 0);
    this.t = -this.countdownMs;
  }

  /** True once the gates are open and units may leave the tunnel. */
  get gatesOpen(): boolean {
    return this.t >= 0;
  }

  /** Outside StartMaxDist of the team start loc while gates are shut. Cite: BattleGround.cpp:365. */
  beyondStartMax(u: BgUnit, pos: BgPos = u.pos): boolean {
    if (this.gatesOpen || !(this.startMaxDist > 0)) return false;
    // A creature is not in m_Players, so the gate leash never sees it. Cite: BattleGround.cpp:359
    // `for (const auto& itr : GetPlayers())`. Without this every AV body outside StartMaxDist was
    // teleported INTO the keep of the team neutralSideFor handed it, mine troggs included.
    if (u.npc) return false;
    const a = this.startPos[u.team];
    return detHypot(pos.x - a.x, pos.y - a.y) > this.startMaxDist;
  }

  /** Snap back to the team start loc. Cite: BattleGround.cpp:367 TeleportTo. */
  snapToStart(u: BgUnit): void {
    const a = this.startPos[u.team];
    u.pos = { x: a.x, y: a.y };
  }

  /** Cast Honorless Target 2479 on this unit. Cite: MovementHandler.cpp:241–242. */
  applyHonorlessTarget(u: BgUnit): void {
    u.honorlessUntilMs = this.t + HONORLESS_TARGET_DURATION_MS;
  }

  /** Victim still holds aura 2479. Cite: Player.cpp:6626–6627 RewardHonor. */
  isHonorless(u: BgUnit): boolean {
    return !victimGrantsPvpCredit(u.honorlessUntilMs, this.t);
  }

  // Periodic start-gate leash. C++ checks every 1000 ms and teleports anyone outside. Cite:
  // BattleGround.cpp:352–375; BattleGround.h:90.
  private enforceStartMaxDist(dtMs: number): void {
    if (this.gatesOpen || !(this.startMaxDist > 0)) return;
    if (this.startPosCheckRemainMs >= dtMs) {
      this.startPosCheckRemainMs -= dtMs;
      return;
    }
    this.startPosCheckRemainMs = START_POS_CHECK_MS;
    for (const u of this.units.values()) {
      if (!this.alive(u)) continue;
      if (this.beyondStartMax(u)) this.snapToStart(u);
    }
  }

  setVision(team: BgTeam, cfg: BgVisionConfig): void {
    this.visionByTeam[team] = cfg;
  }

  visionOf(team: BgTeam): BgVisionConfig {
    return this.visionByTeam[team];
  }

  addUnit(u: BgUnit): void {
    this.units.set(u.id, u);
    // Seat the body ON the mesh. A seat spread across the tunnel keeps the START row's z, and
    // `isWalkablePointForMap` is z-sensitive: at the bake z, 20 of Alterac's 40 Alliance seats and
    // 10 of its 40 Horde seats read off-mesh, so `stepToward` refused every step out of the keep
    // and armed a repath hold instead. That is 30 bodies of 80 standing in their own base for the
    // whole match — src/dev/capabilities/bgMarch.mjs. Cite: Map.cpp GetHeight on spawn.
    this.settleZ(u);
    this.seatOnFloor(u);
  }

  /** Put one body on the mesh. No mesh registered yet leaves it where it is. */
  private seatOnFloor(u: BgUnit): void {
    const snap = nearestWalkablePointForMap(this.mapId, u.pos.x, u.pos.y, u.z);
    if (!snap) return;
    u.pos = snap;
    this.settleZ(u);
  }

  /**
   * Re-seat every living body on the floor, for a mesh that arrived AFTER the units did.
   *
   * `addUnit` runs at construction and Alterac's mesh is an 11.87 MB fetch, so every one of its
   * bodies was added while `nearestWalkablePointForMap` still answered null — the snap above
   * no-oped for all of them, and an off-mesh body has `stepToward` refuse every step and re-arm the
   * repath hold forever. That is the same "standing in their own base for the whole match" the
   * comment in `addUnit` records, arriving through the load clock instead of through the bake z.
   */
  resettleOnFloor(): number {
    let moved = 0;
    for (const u of this.units.values()) {
      if (!this.alive(u)) continue;
      const before = u.pos;
      this.settleZ(u);
      this.seatOnFloor(u);
      if (u.pos !== before) moved++;
    }
    this.routes.clear();
    this.repathHoldUntil.clear();
    return moved;
  }

  addObjective(o: BgObjective): void {
    this.objectives.set(o.id, o);
  }



  /** Cite: BattleGround.cpp:1383 UpdatePlayerScore. */
  updatePlayerScore(unitId: BgUnitId, type: ScoreType, value: number): void {
    let entry = this.scoreboard.get(unitId);
    if (!entry) {
      entry = emptyBgScore();
      this.scoreboard.set(unitId, entry);
    }
    entry[type] += value;
  }

  unitsOf(team: BgTeam): BgUnit[] {
    const out: BgUnit[] = [];
    for (const u of this.units.values()) if (u.team === team) out.push(u);
    return out;
  }

  livingOf(team: BgTeam): BgUnit[] {
    return this.unitsOf(team).filter((u) => this.alive(u));
  }

  alive(u: BgUnit): boolean {
    return u.hp > 0 && u.deadUntilMs == null;
  }

  // Issue an order — the ONLY way a unit's intent changes, which is what makes it the lockstep wire
  // format. Validity is checked here so a local bug and a hostile peer are rejected the same way.
  issue(unitId: BgUnitId, order: BgOrder, byTeam?: BgTeam): boolean {
    const u = this.units.get(unitId);
    if (!u) return false;
    if (byTeam && u.team !== byTeam) return false;
    if (!this.alive(u)) return false;
    // A raycast hop reads no corridor, so a route left from an earlier order would only rot.
    if (order.kind === 'move' && order.straight) this.routes.delete(unitId);

    // Same-destination re-issues (1 Hz per unit) and `to`-less orders (follow/assist) keep the
    // route: waypointToward's own staleness check tracks a moving target.
    const prev = this.routes.get(unitId);
    const to = 'to' in order ? order.to : null;
    if (prev && to && detHypot(prev.to.x - to.x, prev.to.y - to.y) >= 3) {
      this.routes.delete(unitId);
    }
    u.order = order;
    return true;
  }

  // ---- movement -----------------------------------------------------------

  /**
   * The next waypoint on the routed path to `to`, or `to` itself when this map has no navmesh.
   *
   * A battleground used to walk in a straight line because maps 30/489/529 had vmaps and no
   * mmtiles. All three have both now (bake-navmesh.mjs NAVMESH_SLUG_BY_MAP_ID; 489/529 since 2026-09-02), and a
   * 2,800 yd valley with a mountain down the middle is the one BG where that mattered: a straight
   * line from Dun Baldar to Frostwolf Keep runs through the ridge.
   */
  private waypointToward(u: BgUnit, to: BgPos): BgPos {
    if (isWalkablePointForMap(this.mapId, u.pos.x, u.pos.y, u.z) == null) return to;
    const cached = this.routes.get(u.id);
    if (!cached) {
      const hold = this.repathHoldUntil.get(u.id);
      if (hold != null && this.t < hold) {
        // AddDelay holds the re-SEARCH, never the use of a corridor another body already paid for.
        // Holding both is what pinned 28 of 30 stuck bodies to their keep: the hold handed back the
        // same straight aim that the floor clamp had just refused, the refusal re-armed the hold,
        // and the body could not reach the pathfinder again. Cite:
        // TargetedMovementGenerator.cpp:202 AddDelay.
        const shared = this.peekSolve(u, to);
        if (!shared) return to;
        const sleg = nearestLegIndex(shared, u.pos);
        this.routes.set(u.id, {
          to: { x: to.x, y: to.y }, legs: shared, leg: sleg, blockedUntil: this.t + ROUTE_RECHECK_MS,
        });
        return shared[sleg] ?? to;
      }
    }
    if (cached) {
      // A route within ROUTE_STALE_YD of the asked destination keeps walking; exhausted legs
      // fall through to `to` itself, so a chase still homes on the live target.
      const fresh = detHypot(cached.to.x - to.x, cached.to.y - to.y) < ROUTE_STALE_YD;
      if (fresh || this.t < cached.blockedUntil) {
        // Advance past legs already reached, then aim at the next one.
        while (cached.leg < cached.legs.length
          && detHypot(cached.legs[cached.leg]!.x - u.pos.x, cached.legs[cached.leg]!.y - u.pos.y) < 3) {
          cached.leg++;
        }
        return cached.legs[cached.leg] ?? to;
      }
    }
    const solved = this.solveRoute(u, to);
    // Budget, not geometry: this body has no answer YET. Aim straight for this one tick and ask
    // again on the next, when the per-tick budget is fresh. Caching the straight line here is what
    // stranded a 40v40 in its keeps — the fallback route read `fresh` for ROUTE_BLOCKED_MS, so the
    // body walked at the ridge, was refused by the floor clamp, dropped the route and armed a hold,
    // and the hold sent it back to the same straight aim without ever re-searching. Measured on the
    // shipped code (src/dev/capabilities/bgMarch.mjs): 30 of 80 bots inside 20 yd of spawn after
    // 60 s, with 91 solves refused against only 107 run — the budget was bursty, never exhausted.
    if (solved.deferred) { this.aimWasDeferred.add(u.id); return to; }
    this.aimWasDeferred.delete(u.id);
    // No route is not a licence to walk through the mountain: aim at the destination, let the
    // floor clamp refuse the steps that leave the mesh, and back a miss off with jitter.
    const legs = solved.legs ?? [{ x: to.x, y: to.y }];
    const leg = nearestLegIndex(legs, u.pos);
    this.routes.set(u.id, {
      to: { x: to.x, y: to.y },
      legs,
      leg,
      blockedUntil: this.t + (solved.legs
        ? ROUTE_RECHECK_MS
        : ROUTE_BLOCKED_MS + unitJitterMs(u.id)),
    });
    return legs[leg] ?? to;
  }

  /** Live findPath calls this world has made — the number the bgRoutes capability row bounds.
   *  581 creatures re-searching a 142k-poly mesh at 10 Hz was the 2 fps AV floor (2026-08-30). */
  pathSearches = 0;
  /** Spent against SEARCH_BUDGET_PER_TICK, cleared at the top of every tick. */
  private searchesThisTick = 0;
  /** Searches refused for budget this match — the number that says the budget is too tight. */
  searchesDeferred = 0;
  /**
   * Units whose current aim is the straight line a BUDGET refusal handed back, not a corridor.
   *
   * `stepToward` must not read a wall under that aim as "geometry refused me" — arming the repath
   * hold there costs the body a full second of grinding the wall for a failure that was the
   * budget's, and the hold then hands back the same straight aim. Cite:
   * TargetedMovementGenerator.cpp:202 AddDelay, which delays a re-search after a real failure.
   */
  private aimWasDeferred = new Set<BgUnitId>();

  /** The shared solve key: one findPath per (start cell → dest cell) per TTL. */
  private solveKey(u: BgUnit, to: BgPos): string {
    const q = (v: number, cell: number): number => Math.floor(v / cell);
    return `${q(u.pos.x, SOLVE_FROM_CELL_YD)},${q(u.pos.y, SOLVE_FROM_CELL_YD)},${q(u.z, 20)}`
      + `|${q(to.x, SOLVE_TO_CELL_YD)},${q(to.y, SOLVE_TO_CELL_YD)}`;
  }

  /** A corridor another body already paid for, or null. Spends no budget and runs no search. */
  private peekSolve(u: BgUnit, to: BgPos): readonly BgPos[] | null {
    const hit = this.solves.get(this.solveKey(u, to));
    return hit && this.t - hit.at < SOLVE_TTL_MS ? hit.legs : null;
  }

  /** One findPath per (start cell → dest cell) per TTL — a marching crowd shares its corridor.
   *  `deferred` is "the budget said not this tick", which is NOT the same answer as "no route". */
  private solveRoute(u: BgUnit, to: BgPos): { legs: readonly BgPos[] | null; deferred?: boolean } {
    const key = this.solveKey(u, to);
    const hit = this.solves.get(key);
    if (hit && this.t - hit.at < SOLVE_TTL_MS) return hit;
    // Out of budget: answer "no route" WITHOUT caching it. Caching would poison the shared corridor
    // with a false no-path for the whole TTL; the caller aims straight and re-asks after its backoff.
    if (this.searchesThisTick >= SEARCH_BUDGET_PER_TICK) {
      this.searchesDeferred++;
      return { legs: null, deferred: true };
    }
    this.searchesThisTick++;
    this.pathSearches++;
    // A deep search stays legal; what was not affordable is doing one PER BODY. The solve cells
    // above are what makes a marching crowd share a single corridor.
    const path = findPathForMap(
      this.mapId,
      { x: u.pos.x, y: u.pos.y, z: u.z },
      { x: to.x, y: to.y },
      undefined,
      { maxVisited: SEARCH_MAX_VISITED },
    );
    const entry = { legs: path ? path.map((p) => ({ x: p.x, y: p.y })) : null, at: this.t };
    if (this.solves.size >= SOLVE_CAP) {
      const oldest = this.solves.keys().next().value;
      if (oldest !== undefined) this.solves.delete(oldest);
    }
    this.solves.set(key, entry);
    return entry;
  }

  /** `straight` is ComputePathToRandomPoint's raycast: aim at the point, let the floor clamp cut
   *  the walk short at the first wall. Cite: PathFinder.cpp:1357 + :692 raycast, not findPath. */
  private stepToward(u: BgUnit, to: BgPos, dtMs: number, straight = false): void {
    const stepYd = u.speedYd * (dtMs / 1000);
    if (!(stepYd > 0)) return;
    const aim = straight ? to : this.waypointToward(u, to);
    const dx = aim.x - u.pos.x;
    const dy = aim.y - u.pos.y;
    const dist = detHypot(dx, dy);
    if (dist <= 0.01) return;
    // Before gates open, StartMaxDist leashes you to the tunnel.
    // Cite: BattleGround.cpp:352–368 STATUS_WAIT_JOIN + GetStartMaxDist + TeleportTo.
    const travel = Math.min(stepYd, dist);
    const next: BgPos = { x: u.pos.x + (dx / dist) * travel, y: u.pos.y + (dy / dist) * travel };
    if (this.beyondStartMax(u, next)) return;
    // A loaded mesh that refuses the step wins — CLAUDE.md §5, the same rule displacement follows.
    // `null` is "no geometry registered", which is every BG but Alterac and is a fail-open.
    const z = floorZForMap(this.mapId, next.x, next.y, u.z);
    if (z == null) { u.pos = next; return; }
    if (isWalkablePointForMap(this.mapId, next.x, next.y, u.z) === false) {
      // Wall: drop the route and hold the re-search (TargetedMovementGenerator.cpp:202 AddDelay).
      // Arm only when no hold is live — re-arming per refused tick slides the expiry forever.
      this.routes.delete(u.id);
      // ...but NOT when this aim is the straight line a budget refusal handed back. That wall says
      // nothing about geometry, and the hold then feeds the body the SAME straight aim for a second
      // without ever re-searching. It stays queued instead and asks again next tick.
      if (this.aimWasDeferred.has(u.id)) return;
      const hold = this.repathHoldUntil.get(u.id);
      if (hold == null || hold <= this.t) {
        this.repathHoldUntil.set(u.id, this.t + ROUTE_BLOCKED_MS + unitJitterMs(u.id));
      }
      return;
    }
    u.pos = next;
    u.z = z;
  }

  /** Re-seat floor height after something OTHER than stepUnit moved the body — the session owns
   *  friendly seats, so their `z` was never re-derived and stayed the height they spawned at. */
  settleZ(u: BgUnit): void {
    const z = floorZForMap(this.mapId, u.pos.x, u.pos.y, u.z);
    if (z != null) u.z = z;
  }

  /** Distance between two units, yards. */
  distance(a: BgUnit, b: BgUnit): number {
    return detHypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
  }

  private advanceOrder(u: BgUnit, dtMs: number): void {
    const o = u.order;
    switch (o.kind) {
      case 'move':
        this.stepToward(u, o.to, dtMs, o.straight === true);
        break;
      case 'attack-move':
      case 'retreat':
        this.stepToward(u, o.to, dtMs);
        break;
      case 'patrol': {
        const wp = o.waypoints[o.index % Math.max(1, o.waypoints.length)];
        if (!wp) break;
        this.stepToward(u, wp, dtMs);
        if (detHypot(u.pos.x - wp.x, u.pos.y - wp.y) < 2) {
          u.order = { ...o, index: (o.index + 1) % o.waypoints.length };
        }
        break;
      }
      case 'follow':
      case 'assist': {
        const tgt = this.units.get(o.target);
        if (!tgt) break;
        // Tracking an ENEMY only works while your team can still see them, or the order is a fog
        // leak with extra steps. Losing sight stops the unit and the strategy layer re-decides.
        if (tgt.team !== u.team && !tgt.carryingFlag && !this.canSee(u.team, tgt)) {
          break;
        }
        // Stop a body-length short so a follower does not stand inside its leader.
        const d = detHypot(tgt.pos.x - u.pos.x, tgt.pos.y - u.pos.y);
        if (d > 4) this.stepToward(u, tgt.pos, dtMs);
        break;
      }
      case 'use-object': {
        const obj = this.objectives.get(o.objectId);
        if (obj) this.stepToward(u, obj.pos, dtMs);
        break;
      }
      case 'cast-on':
      case 'hold':
        break;
    }
  }

  // ---- spatial index ------------------------------------------------------

  // One bucket grid over every living unit, rebuilt at the top of each tick. Alterac Valley is why:
  // its field is ~760 creature bodies on top of 80 seats, and both the sight test and the shard
  // walk were pairwise over the whole roster — rebuildShards' same-team merge scanned `live` INSIDE
  // its own double loop, so it was O(n^3) and 836 units is 5.8e8 checks per tick.
  private regrid(): void {
    this.grid.clear();
    this.gridCell = Math.max(1, this.engageYd);
    for (const u of this.units.values()) {
      if (!this.alive(u)) continue;
      const key = this.cellKey(u.pos.x, u.pos.y);
      const bucket = this.grid.get(key);
      if (bucket) bucket.push(u.id);
      else this.grid.set(key, [u.id]);
    }
  }

  private cellKey(x: number, y: number): number {
    // 16 bits of cell index per axis: the widest BG (AV, ~3400 yd) is 114 cells at 30 yd.
    const cx = Math.floor(x / this.gridCell) & 0xffff;
    const cy = Math.floor(y / this.gridCell) & 0xffff;
    return (cx << 16) | cy;
  }

  // Public read of the same index the tick uses. A rules module scanning every unit per objective
  // per tick is 15 x 1,280 x 10 Hz on Alterac Valley; this is the same answer for the cells that
  // can hold it. Exact range is still the caller's to check.
  unitsNear(x: number, y: number, radiusYd: number): BgUnit[] {
    return this.nearby(x, y, radiusYd, []);
  }

  /** Live units within `radiusYd` of a point, from the grid. Never exact — callers re-check range. */
  private nearby(x: number, y: number, radiusYd: number, out: BgUnit[]): BgUnit[] {
    out.length = 0;
    const span = Math.ceil(radiusYd / this.gridCell);
    const cx = Math.floor(x / this.gridCell);
    const cy = Math.floor(y / this.gridCell);
    for (let i = -span; i <= span; i++) {
      for (let j = -span; j <= span; j++) {
        const bucket = this.grid.get((((cx + i) & 0xffff) << 16) | ((cy + j) & 0xffff));
        if (!bucket) continue;
        for (const id of bucket) {
          const u = this.units.get(id);
          if (u) out.push(u);
        }
      }
    }
    return out;
  }

  // ---- visibility (§6g) ---------------------------------------------------

  // Is `target` perceptible to `team` right now, under that team's vision config? Radius only: no BG ships
  // a collision asset, so `cfg.seeThroughWalls` has no reader here.
  canSee(team: BgTeam, target: BgUnit): boolean {
    if (target.team === team) return true;
    const cfg = this.visionByTeam[team];
    const scratch: BgUnit[] = [];
    for (const w of this.nearby(target.pos.x, target.pos.y, cfg.sightYd, scratch)) {
      if (w.team !== team || !this.alive(w)) continue;
      if (detHypot(w.pos.x - target.pos.x, w.pos.y - target.pos.y) > cfg.sightYd) continue;
      return true;
    }
    return false;
  }

  private toUnitView(u: BgUnit, own: boolean): BgUnitView {
    return {
      id: u.id,
      team: u.team,
      name: u.name,
      cls: u.cls,
      level: u.level,
      pos: { x: u.pos.x, y: u.pos.y },
      hpPct: u.maxHp > 0 ? (u.hp / u.maxHp) * 100 : 0,
      alive: this.alive(u),
      role: u.role,
      ...(u.carryingFlag ? { carryingFlag: u.carryingFlag } : {}),
      ...(u.npc ? { post: { x: u.npc.post.x, y: u.npc.post.y }, wanderYd: u.npc.wanderYd ?? 0 } : {}),
      // An enemy's assignment is not visible; own orders are.
      ...(own ? { order: u.order } : {}),
    };
  }

  // Build the per-team view — the ONLY thing a strategy may read. A carried flag is always visible,
  // because the real client shows the carrier on both HUDs.
  viewFor(team: BgTeam): BgView {
    const own: BgUnitView[] = [];
    const mine: BgUnit[] = [];
    for (const u of this.units.values()) if (u.team === team) mine.push(u);
    for (const u of mine) own.push(this.toUnitView(u, true));

    const enemies: BgUnitView[] = [];
    for (const u of this.units.values()) {
      if (u.team === team) continue;
      if (!this.alive(u)) continue;
      if (u.carryingFlag || this.canSee(team, u)) enemies.push(this.toUnitView(u, false));
    }

    return {
      team,
      t: this.t,
      own,
      enemies,
      objectives: [...this.objectives.values()].map((o) => ({ ...o })),
      score: { ...this.score },
      scoreboard: this.scoreboard,
      vision: this.visionByTeam[team],
    };
  }

  // ---- engagement sharding (§6c) ------------------------------------------

  // Cluster units in contact into shards by single-link over `engageYd`, so a chain of fighters is
  // one fight. Only clusters holding BOTH teams count. Neighbours come off the tick's grid, so this
  // is O(n·k) rather than the pairwise walk it replaced.
  rebuildShards(): BgShard[] {
    const live: BgUnit[] = [];
    for (const u of this.units.values()) if (this.alive(u)) live.push(u);
    const parent = new Map<BgUnitId, BgUnitId>();
    const find = (a: BgUnitId): BgUnitId => {
      let r = a;
      while (parent.get(r) !== r) r = parent.get(r)!;
      while (parent.get(a) !== r) {
        const nxt = parent.get(a)!;
        parent.set(a, r);
        a = nxt;
      }
      return r;
    };
    for (const u of live) parent.set(u.id, u.id);

    const scratch: BgUnit[] = [];
    // Pass 1: contact means an ENEMY within reach.
    for (const a of live) {
      for (const b of this.nearby(a.pos.x, a.pos.y, this.engageYd, scratch)) {
        if (b.team === a.team || b.id === a.id) continue;
        if (this.distance(a, b) > this.engageYd) continue;
        const ra = find(a.id);
        const rb = find(b.id);
        if (ra !== rb) parent.set(ra, rb);
      }
    }

    // A component is "engaged" once it holds both teams — the flag the same-team merge below reads.
    // Computing it once beats the `live.some(...)` this loop used to run per pair, which made the
    // whole walk cubic.
    const teamsOf = new Map<BgUnitId, number>();
    const bit = (t: BgTeam): number => (t === 'alliance' ? 1 : 2);
    for (const u of live) {
      const r = find(u.id);
      teamsOf.set(r, (teamsOf.get(r) ?? 0) | bit(u.team));
    }

    // Pass 2: a same-team unit joins the shard of any engaged ally it is standing with.
    for (const a of live) {
      for (const b of this.nearby(a.pos.x, a.pos.y, this.engageYd, scratch)) {
        if (b.team !== a.team || b.id === a.id) continue;
        if (this.distance(a, b) > this.engageYd) continue;
        const ra = find(a.id);
        const rb = find(b.id);
        if (ra === rb) continue;
        const ta = teamsOf.get(ra) ?? 0;
        const tb = teamsOf.get(rb) ?? 0;
        if (ta !== 3 && tb !== 3) continue;
        parent.set(ra, rb);
        teamsOf.set(find(ra), ta | tb);
      }
    }

    const groups = new Map<BgUnitId, BgUnitId[]>();
    for (const u of live) {
      const r = find(u.id);
      const g = groups.get(r);
      if (g) g.push(u.id);
      else groups.set(r, [u.id]);
    }

    const out: BgShard[] = [];
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      const teams = new Set(ids.map((id) => this.units.get(id)!.team));
      if (teams.size < 2) continue; // allies standing together are not a fight
      out.push({ id: out.length, units: ids });
    }
    for (const u of this.units.values()) u.shard = undefined;
    for (const s of out) for (const id of s.units) this.units.get(id)!.shard = s.id;
    this.shards = out;
    return out;
  }

  currentShards(): readonly BgShard[] {
    return this.shards;
  }

  // ---- tick ---------------------------------------------------------------

  /** Rebuild engagement shards each tick. Off with no ShardResolver: the union-find over every body
   *  was 12.5% of AV's CPU feeding a resolver that returns nothing (profile 2026-08-30). */
  trackShards = true;

  /** Set by the surface that also mirrors positions, from its OWN owner test, so the two are
   *  one fact. Null means the world owns every body, which is what a headless match wants. */
  posOwnedElsewhere: ((u: BgUnit) => boolean) | null = null;

  /** Hook the rules module installs: called once per tick after movement. */
  onTick: ((world: BgWorld, dtMs: number) => void) | null = null;
  // Where a revived unit of `team` comes back, set by the rules module. It lives at the one place a
  // revive happens, because inferring it from full-hp guessed wrong and teleported the roster.
  // `unit` is the corpse: AB picks the owned node's yard nearest to where you fell, which is what
  // GraveyardManager::GetClosestGraveYard does. WSG ignores it — one yard per team.
  graveyardOf: ((team: BgTeam, unit?: BgUnit) => BgPos) | null = null;

  // Does the graveyard cycle run at all? WSG and AB leave it on; arena turns it off, because
  // last-team-standing is not a mode you can respawn into.
  respawns = true;

  // Advance the world one order-layer tick. Pure in (state, dt): the same sequence of ticks and orders
  // always gives the same world, which is what the lockstep barrier needs.
  tick(dtMs = this.tickMs): BgTickStats {
    this.t += dtMs;
    this.searchesThisTick = 0;
    this.regrid();
    this.enforceStartMaxDist(dtMs);

    for (const u of this.units.values()) {
      // A finished match resurrects nobody, and a mode with no graveyard cycle never does. Without
      // the first guard the loser stood up on the end card; without the second a partial wipe bought 30 s.
      if (this.respawns && !this.ended && u.deadUntilMs != null && this.t >= u.deadUntilMs) {
        // The graveyard cycle revives at the graveyard the team owns (§13b).
        u.deadUntilMs = undefined;
        u.hp = u.maxHp;
        const gy = this.graveyardOf?.(u.team, u);
        if (gy) u.pos = { x: gy.x, y: gy.y };
        // GY rez teleports into a PvP-enforced map → CastSpell(2479).
        // Cite: MovementHandler.cpp:241–242; Player.cpp:6861 InBattleGround.
        this.applyHonorlessTarget(u);
      }
      if (!this.alive(u)) continue;
      // Another owner writes this body's pos; stepping it here only makes a position that is
      // discarded, after regrid and the shard walk have already read it.
      if (this.posOwnedElsewhere?.(u)) continue;
      this.advanceOrder(u, dtMs);
    }

    this.regrid(); // movement moved everyone — the rules hook and the shard walk want the new cells
    this.onTick?.(this, dtMs);
    this.checkTimeLimit();
    if (!this.trackShards) {
      this.shards = [];
      return { t: this.t, shards: 0, engaged: 0, largestShard: 0 };
    }
    const shards = this.rebuildShards();
    let engaged = 0;
    let largest = 0;
    for (const s of shards) {
      engaged += s.units.length;
      if (s.units.length > largest) largest = s.units.length;
    }
    return { t: this.t, shards: shards.length, engaged, largestShard: largest };
  }

  // End the match on the clock cap, after the rules module had its tick to win it outright. Higher
  // score takes it; equal ends with no winner, the shape GetPrematureWinner uses.
  private checkTimeLimit(): void {
    if (this.ended || this.timeLimitMs <= 0 || this.t < this.timeLimitMs) return;
    this.ended = true;
    const a = this.score.alliance;
    const h = this.score.horde;
    this.winner = a === h ? null : a > h ? 'alliance' : 'horde';
  }

  /** Kill a unit and start its graveyard timer. Cite: 30 s resurrection cycle (§13b). */
  kill(u: BgUnit, respawnMs = 30_000): void {
    u.hp = 0;
    u.deadUntilMs = this.t + respawnMs;
    u.order = { kind: 'hold' };
  }

  // Honorable-kill credit: `killerId` landed the blow on `victimId`. The resolver is the only place
  // that knows, and until it said so nobody but the player banked contribution.
  creditKill(killerId: BgUnitId, victimId: BgUnitId): void {
    const killer = this.units.get(killerId);
    const victim = this.units.get(victimId);
    if (!killer || !victim || killer.team === victim.team) return;
    // RewardHonor pays nothing while the victim holds Honorless Target 2479.
    if (this.isHonorless(victim)) return;
    this.killCredit.push({ killer: killerId, victim: victimId, victimLevel: victim.level });
  }

  /** Drain the credited kills since the last call. */
  takeKillCredit(): Array<{ killer: BgUnitId; victim: BgUnitId; victimLevel: number }> {
    const out = this.killCredit;
    this.killCredit = [];
    return out;
  }

  /** Nearest living enemy to `u` that `u`'s team can actually see. */
  nearestVisibleEnemy(u: BgUnit): BgUnit | null {
    let best: BgUnit | null = null;
    let bestD = Infinity;
    const scratch: BgUnit[] = [];
    for (const o of this.nearby(u.pos.x, u.pos.y, this.visionByTeam[u.team].sightYd, scratch)) {
      if (o.team === u.team || !this.alive(o)) continue;
      if (!o.carryingFlag && !this.canSee(u.team, o)) continue;
      const d = this.distance(u, o);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }
}

export { OTHER_TEAM };
