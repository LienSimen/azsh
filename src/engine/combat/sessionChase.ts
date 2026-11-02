// Gap-close and the ranged stand band, peeled from sessionMotion. A pure move: the same bodies, order
// and gate names as the tail of the chain. Extracted modules must not import combat.ts.
import { castableKitIds } from './castableKit.ts';

import { isEnemySide, isTotemSide } from '../core/events.ts';
import {
  moveStepYd, MELEE_REACH_YD, MELEE_PARK_SLACK_YD, meleeParkYd, meleeContactYd,
  combatReachSumYd,
  combatDistanceYd, STOREY_DZ_YD,
  planarRangeHonestYd,
  coneArcsOfKit, coneArcOf, coneClearBandRad, coneCovers,
  meleeSlotBandRad, meleeSlotOffsetRad, meleeSlotIsExposed,
  MELEE_CONTACT_EPS_YD,
  type ConeArc,
  type CombatPosYd,
} from './combatGeometry.ts';
import { navSightClear } from './navSight.ts';
import { holdAnchorOf } from './sessionHome.ts';
import { DEFAULT_DETECTION_RANGE } from '../../domain/creature/creatureAi.ts';
import { getCreatureAttackDistance } from '../../domain/creature/creatureAggro.ts';
import { COMBAT_DROP_YD } from './creatureLeash.ts';
import { detAtan2, detCos, detHypot, detHypot3, detSin } from '../core/detMath.ts';
import {
  chaseBackpedalDest,
  chaseBackpedalReachYd,
  chaseFanDest,
  chaseFanEnabled,
  CHASE_CLOSENESS_TIMER_MS,
  CHASE_FANNING_RADIUS_YD,
  fanDirectionSign,
  frandFanAngle,
  isChaseInsideModel,
  type ChaseClosenessState,
} from './chaseCloseness.ts';
import { focusImmunityBlocksSpell, rangedAutoMinYards, spellTargetTypeAllowed } from './predicates.ts';
import { CREATURE_FAMILY_ASSISTANCE_RADIUS } from '../../domain/creature/creatureAiConstants.ts';
import type { MotionOwner } from './motionClaim.ts';
import type { MotionGenerator } from './motionGenerator.ts';
import type { MotionGateInfo, MotionGateName } from './motionGate.ts';
import type { CombatContext } from './context.ts';
import { ALLY_HEAL_THRESHOLD } from './types.ts';
import type { Fighter } from './types.ts';
import type { SpellDef } from '../../data/schema.ts';
import type { UnitNavPath, PathToOpts } from './sessionPathTo.ts';

/** ObjectDefines.h CONTACT_DISTANCE 1.f — stand 2 contact radii past rangeMin so the min gate does not thrash. */
const RANGED_MIN_CLEARANCE_YD = 2;
/** Stay this far inside an unpulled mob's detection so the step does not graze aggro. */
const UNPULLED_AGGRO_MARGIN_YD = 1.5;
/** Park this far inside a cast's rangeMax, past the walk order's 0.25 yd arrival slack. */
const CAST_REACH_SLACK_YD = 0.5;
// How far inside the bad arc a melee DPS must be before it starts a flank slide (~20 deg). A dead band, not
// a tolerance: the arc's own edge is what moves under it every tick.
const MELEE_SLOT_ENTRY_MARGIN_RAD = 0.35;
/** Shared empty arc list, so the no-cone tick allocates nothing. */
const EMPTY_ARCS: readonly ConeArc[] = [];
/** One cone spell's wedge. */
const arcOfConeSpell = (sp: SpellDef): ConeArc =>
  ({ ...coneArcOf(sp.coneDeg), radiusYd: sp.radiusYd ?? Number.POSITIVE_INFINITY });
// Unreachable victim => EnterEvadeMode rather than holding the party in combat forever. Cite:
// Unit::SelectHostileTarget; CombatManager evade timer.
const UNREACHABLE_EVADE_MS = 5_000;
// A ceiling on walking a corridor that never closes. Corridor progress resets the shorter timer, which
// is right for rounding a wall, but a corridor can simply be wrong — one mob walked 86.8 yd away.
const UNREACHABLE_ROUTE_MS = 25_000;
/** Tolerance on the evade ring — smaller than any real gap, larger than any float drift. */
const EVADE_REACH_EPS_YD = MELEE_CONTACT_EPS_YD;

/** Closures the chase arm needs from installSessionMotion. */
export interface ChaseDeps {
  ctx: CombatContext;
  tickMs: number;
  posOf: (side: string) => CombatPosYd | undefined;
  setPos: (side: string, p: CombatPosYd) => void;
  dead: (f: Fighter) => boolean;
  foeOf: (f: Fighter) => Fighter | null;
  hostileTargetOf: (f: Fighter) => Fighter | null;
  enemyEngaged: (f: Fighter) => boolean;
  fightersOrder: () => Fighter[];
  gate: (side: string, name: MotionGateName, info?: MotionGateInfo) => void;
  diag: (side: string, name: string) => void;
  claimOwnerOf: (side: string) => MotionOwner | null;
  takeMotion: (side: string, owner: MotionOwner, goal: CombatPosYd | null) => CombatPosYd | null;
  navStepToward: (
    side: string, from: CombatPosYd, to: CombatPosYd,
    step: number, stopAtDist: number, searchCorridor?: boolean,
  ) => CombatPosYd;
  pathTo: (side: string, dest: CombatPosYd, opts?: PathToOpts) => boolean;
  /** Walk the corridor this arm just issued — the claim is already held. */
  advanceHeldOrder: (f: Fighter) => boolean;
  dropStaleCorridor: (side: string) => void;
  unitNavPaths: Map<string, UnitNavPath>;
  /** The move-order stuck ladder's per-side row — this arm only ever clears it. */
  stuckState: { delete: (side: string) => boolean };
  noProgressStuck: (f: Fighter, aim: CombatPosYd) => boolean;
  watchPartyStuck: (f: Fighter, from: CombatPosYd, to: CombatPosYd, aim: CombatPosYd) => void;
  evadeUnreachable: (f: Fighter) => void;
  runSpeedYdPerSec: (f: Fighter) => number;
  longestOffenseRangeYd: (f: Fighter) => number;
  shortOffenseList: (f: Fighter) => readonly SpellDef[];
  onCooldown: (f: Fighter, s: SpellDef) => boolean;
  canAfford: (f: Fighter, s: SpellDef) => boolean;
  kitRangedAuto: (f: Fighter) => boolean;
  wantsMeleeBand: (f: Fighter) => boolean;
  pbaoeRadiusYd: (f: Fighter) => number;
  isThreatVictimOf: (tgt: Fighter, f: Fighter) => boolean;
  /** Melee flank slot latch — the slide that must finish rather than stop on the boundary. */
  heldSlideDest: (
    side: string, focus: string, focusAt: CombatPosYd, from: CombatPosYd, slackYd: number,
  ) => CombatPosYd | null;
  holdSlide: (side: string, focus: string, focusAt: CombatPosYd, dest: CombatPosYd) => void;
  posSlideSettled: Map<string, number>;
  focusIsStill: (side: string, at: CombatPosYd) => boolean;
  meleePeersOf: (focus: string) => readonly string[];
}

// The floor of the claim order: gap-close into range, the melee flank slot, the ranged stand band and
// the hold-ground return that clamps them. It still takes its own home and flank claims for now.
export function createChaseArm(deps: ChaseDeps): {
  chase: MotionGenerator;
  clearChaseParkTimer: (side: string) => void;
  markNoPath: (side: string) => void;
  standsInLiveCone: (f: Fighter) => boolean;
} {
  const {
    ctx, tickMs, posOf, setPos, dead, foeOf, hostileTargetOf, enemyEngaged, fightersOrder,
    gate, diag, claimOwnerOf, takeMotion, navStepToward, pathTo, advanceHeldOrder,
    dropStaleCorridor, unitNavPaths, stuckState, noProgressStuck, watchPartyStuck,
    evadeUnreachable, runSpeedYdPerSec, longestOffenseRangeYd,
    shortOffenseList, onCooldown, canAfford, kitRangedAuto, wantsMeleeBand, pbaoeRadiusYd,
    isThreatVictimOf, heldSlideDest, holdSlide, posSlideSettled, focusIsStill,
    meleePeersOf,
  } = deps;

  // The cone a live aura FIRES on a timer: Frenzy 19451 triggers Lava Breath 19272 (cone 35 yd) with
  // no cast bar, so a cast-bar read left the raid in it. Cite: boss_magmadar.cpp:34,56.
  const auraTriggerId = new Map<number, number>();
  // The kit is the second place to look — a creature spec carries both rows without a wired spellOf.
  const spellFrom = (caster: Fighter, id: number): SpellDef | undefined => {
    if (!id) return undefined;
    return ctx.spellOf?.(id) ?? (caster.spec.spells ?? []).find((s) => (s.id | 0) === id);
  };
  const coneFiredByAura = (caster: Fighter, auraSpellId: number): SpellDef | null => {
    let trig = auraTriggerId.get(auraSpellId);
    if (trig === undefined) {
      const holder = spellFrom(caster, auraSpellId);
      if (!holder) return null;
      trig = 0;
      for (const e of holder.effects ?? []) {
        const t = (e as { triggerSpellId?: number }).triggerSpellId | 0;
        if (t) { trig = t; break; }
      }
      auraTriggerId.set(auraSpellId, trig);
    }
    const sp = spellFrom(caster, trig);
    return sp?.aoeShape === 'cone' ? sp : null;
  };

  // Every wedge live on this unit: the one it is CASTING plus the ones its auras fire. A cone in the
  // KIT is still not a hazard — that read repositioned the raid for a Cleave nobody cast.
  const castConeArcs = (caster: Fighter): readonly ConeArc[] => {
    const arcs: ConeArc[] = [];
    const sp = caster.castingSpell;
    if (sp?.aoeShape === 'cone') arcs.push(arcOfConeSpell(sp));
    for (const e of ctx.effectsOn(caster.side)) {
      if (e.broken || e.source !== caster.side || e.expiresAt <= ctx.t) continue;
      const fired = coneFiredByAura(caster, e.spellId | 0);
      if (fired) arcs.push(arcOfConeSpell(fired));
    }
    return arcs.length ? arcs : EMPTY_ARCS;
  };

  // State this generator OWNS rather than borrows. A movement generator keeps its own fields, which is
  // the whole difference from one chain re-deriving per tick; these were lent from the session bag.
  const chaseCloseness = new Map<string, ChaseClosenessState>();
  const unreachableFrom = new Map<string, {
    minDist: number; victimX: number; victimY: number; victimZ?: number; ms: number;
    /** Corridor progress: waypoints left last tick, and how long this route has run. */
    wpLeft?: number; routeMs?: number;
  }>();

  // Sides whose last corridor search came back with no path — both ends on the mesh and no walk between
  // them. The core does not wait out a timer for that; the proxy exists because enemies rarely search.
  const noPathSides = new Set<string>();

  const isReachable = (f: Fighter): boolean =>
    !noPathSides.has(f.side) && (unreachableFrom.get(f.side)?.ms ?? 0) < UNREACHABLE_EVADE_MS;

  const advanceChase = (f: Fighter): void => {

    // The bubble a friendly may fight inside. Walking home when it is outside one is the arm above this
    // in the chain; what is left here is the clamp, so a step cannot carry it out of a bubble.
    const hold = holdAnchorOf(ctx, f.side, posOf);

    const tgt = isEnemySide(f.side) ? hostileTargetOf(f) : foeOf(f);
    // The self-sentinel means no living hostiles, not a target. The cast path guards it and motion did
    // not, so out of combat every friendly measured zero distance to ITSELF and kept walking.
    if (!tgt || tgt === f || dead(tgt)) {
      gate(f.side, tgt === f ? 'targetIsSelf' : 'noTarget');
      return;
    }
    const from = posOf(f.side);
    const to = posOf(tgt.side);
    // Where this pair PARKS, and the ring it swings from. Two player-sized bodies park at 2.5 and swing
    // to 5.55, while a boss pushes both out — which is why the C++ makes them functions of the pair.
    const pairPark = meleeParkYd(f.spec.combatReachYd, tgt.spec.combatReachYd);
    const pairContact = meleeContactYd(false, f.spec.combatReachYd, tgt.spec.combatReachYd);
    if (!from || !to) { gate(f.side, 'noPose'); return; }
    const dist = combatDistanceYd(from, to);
    if (dist == null) { gate(f.side, 'noPose'); return; }
    // Local acquisition is the radius a unit fights inside, and a target outside it is not one to walk
    // to. An ENGAGED enemy is exempt: nothing caps pursuit, so a pulled mob must keep closing.
    if (ctx.cfg.acquireRangeYd != null && dist > ctx.cfg.acquireRangeYd) {
      if (!isEnemySide(f.side)) {
        // A dz past one storey folds combat distance out of range (combatGeometry.ts:207), so
        // "too far" and "wrong floor" reach this gate as the same number. Name them apart.
        const dz = Number.isFinite(from.z) && Number.isFinite(to.z)
          ? Math.abs((from.z as number) - (to.z as number))
          : 0;
        if (dz > STOREY_DZ_YD) {
          gate(f.side, 'storeyMismatch', { dz, dist, acquire: ctx.cfg.acquireRangeYd });
        } else {
          gate(f.side, 'pastAcquire', { dist, acquire: ctx.cfg.acquireRangeYd });
        }
        return;
      }
      // Past 90 yd the leak drops even outside acquire range. Cite: CombatManager.cpp:41.
      if (dist > COMBAT_DROP_YD) {
        evadeUnreachable(f);
        gate(f.side, 'combatDrop', { dist, acquire: COMBAT_DROP_YD });
        return;
      }
    }

    // Combat movement off: stand and fight, never close. Below the leash on purpose, since the flag
    // stops the step and not the drop, and above the unreachable proxy, which would evade a stander.
    if (isEnemySide(f.side) && ctx.enemyCastBySide.get(f.side)?.eventAi.combatMovement === false) {
      gate(f.side, 'noCombatMovement');
      return;
    }

    const speed = runSpeedYdPerSec(f);
    // 100% snare / immobilised by aura stack — no motion
    if (!(speed > 0)) { gate(f.side, 'speedZero'); return; }

    // An enemy that cannot touch its victim and is not closing evades rather than holding the party in
    // combat forever. Mob displacement is not progress, or a wall slide resets the timer forever.
    if (isEnemySide(f.side)) {
      // The GRADE is the full contact ring while the PARK is half of it, which is the split the C++
      // makes — and it retires the knife edge where one ULP of step error triggered a full-HP evade.
      let reach = Math.max(pairContact, longestOffenseRangeYd(f) + EVADE_REACH_EPS_YD);
      // With no ranged kit the park below stops at the short offense, so grade against it too. A
      // Razormane Scout's Shoot 6660 infers instant_nuke: it parked at 24 yd, shot, and reset every 5 s.
      // Scheduled spells only, so a kit row the mob never casts still lets it evade.
      if (dist > reach) {
        const castable = castableKitIds(f, ctx.spellOf);
        for (const s of shortOffenseList(f)) {
          if (castable && !castable.has(s.id | 0)) continue;
          if (!spellTargetTypeAllowed(s, tgt.creatureType ?? 0) || focusImmunityBlocksSpell(s, tgt, 1)) continue;
          reach = Math.max(reach, (s.rangeMax ?? 0) + EVADE_REACH_EPS_YD);
        }
      }
      const prev = unreachableFrom.get(f.side);
      const victimMoved = !!prev && (
        to.z != null && prev.victimZ != null
          ? detHypot3(to.x - prev.victimX, to.y - prev.victimY, to.z - prev.victimZ) > 0.05
          : detHypot(to.x - prev.victimX, to.y - prev.victimY) > 0.05
      );
      const closed = !!prev && dist < prev.minDist - 0.5;
      // Walking a corridor IS reaching, even while the straight line grows. A route rounding a wall
      // increases that distance for its first half. Waypoints, not yards: a count needs no anchor.
      const liveCorridor = unitNavPaths.get(f.side);
      const wpLeft = liveCorridor && liveCorridor.pts.length > 0
        ? liveCorridor.pts.length
        : undefined;
      const routeMs = wpLeft != null ? (prev?.routeMs ?? 0) + tickMs : 0;
      const onCorridor = wpLeft != null && prev?.wpLeft != null && wpLeft < prev.wpLeft
        && routeMs < UNREACHABLE_ROUTE_MS;
      if (dist <= reach || !prev || victimMoved || closed || onCorridor) {
        unreachableFrom.set(f.side, {
          minDist: dist,
          victimX: to.x,
          victimY: to.y,
          ...(to.z != null ? { victimZ: to.z } : {}),
          ms: 0,
          ...(wpLeft != null ? { wpLeft } : {}),
          // A route that actually closed starts its leash over; one that never does keeps
          // accumulating, so a wrong corridor still ends.
          routeMs: closed || dist <= reach || victimMoved ? 0 : routeMs,
        });
        f.targetUnreachableMs = 0;
        // Reaching, closing or on a corridor: whatever the last search said is stale.
        // Cite: `:291` m_reachable = true when the target has not moved and we are reachable.
        noPathSides.delete(f.side);
      } else {
        prev.wpLeft = wpLeft;
        prev.routeMs = routeMs;
        prev.ms += tickMs;
        // EVENT_T_TARGET_NOT_REACHABLE reads this at 1 s, so a script fires long before the
        // 5 s evade this counter is really for. Cite: CreatureEventAI.cpp:545-547.
        f.targetUnreachableMs = prev.ms;
        // The generator answers; the AI decides. Same threshold, one owner for it.
        if (!isReachable(f)) {
          evadeUnreachable(f);
          gate(f.side, 'unreachable', { ms: prev.ms, dist });
          return;
        }
      }
    }

    // EVERY unit searches. Denying the enemy side was the "the boss will not follow us down" report,
    // and the cost was measured: free to 24 chasing bodies, about +0.89 ms a tick at 40.
    const searchCorridor = true;

    // Step, unless hold-ground or the party leash would carry the unit out of position. Every step in
    // this function goes through here, so the claim is taken in ONE place.
    const stepTo = (aim: CombatPosYd, stopAt: number, owner: MotionOwner = 'chase'): void => {
      const aimTo = takeMotion(f.side, owner, aim);
      if (!aimTo) {
        gate(f.side, 'claimHeldBy', {
          dist,
          owner: claimOwnerOf(f.side) ?? '',
        });
        return;
      }
      // Friendlies issue one dest and walk it. navStepToward at the live mob every
      // tick is a second goal (goalKey churn + hop vs corridor) and is the swirl.
      if (!isEnemySide(f.side)) {
        const otherFloor = aimTo.z != null && from.z != null && Math.abs(aimTo.z - from.z) > 3;
        if (!otherFloor && pathTo(f.side, aimTo, {
          keepFocus: true,
          claimed: true,
          ...(stopAt > 0 ? { standShortYd: stopAt } : {}),
        })) {
          advanceHeldOrder(f);
          gate(f.side, 'stepped', { dist });
          return;
        }
      }
      // dest-close is not a stall while a corridor is live — a corner walk grows
      // Euclidean dest distance. The follower already skips dead waypoints.
      const live = unitNavPaths.get(f.side);
      if (!(live && live.pts.length > 0) && noProgressStuck(f, aimTo)) {
        dropStaleCorridor(f.side);
        stuckState.delete(f.side);
        diag(f.side, 'stuckRepath');
      }
      const next = navStepToward(f.side, from, aimTo, moveStepYd(speed, tickMs), stopAt, searchCorridor);
      if (hold) {
        const dA = combatDistanceYd(next, hold.anchor);
        // the player moves this piece
        if (dA != null && dA > hold.holdYd) { gate(f.side, 'holdGround', { dist: dA }); return; }
      }
      setPos(f.side, next);
      gate(f.side, 'stepped', { dist });
      if (!isEnemySide(f.side)) {
        watchPartyStuck(f, from, posOf(f.side) ?? next, aimTo);
      }
    };

    // 'auto' closes to the stand yards and holds, since a perpetual walk back to the band is a kite
    // whose heading flips with the mob. 'hold' never auto-moves, 'melee' always closes, enemies chase.
    const policy = f.spec.movement ?? 'auto';
    /** Gap-close reached its stand decision and did not step: which of the three reasons. */
    const standGate = (): void => {
      gate(f.side, policy === 'hold' ? 'policyHold'
        : (f.spec.weapon?.dmgMax ?? 0) > 1 ? 'inRange' : 'noWeapon', { dist });
    };

    /** Floor passives sit with empty threat. Walking into GetAttackDistance chain-pulls. */
    const fightersForPullCheck = fightersOrder();
    const stepPullsUnpulled = (at: CombatPosYd): boolean => {
      const myLevel = f.spec.level | 0;
      for (const h of fightersForPullCheck) {
        if (!isEnemySide(h.side) || dead(h) || enemyEngaged(h)) continue;
        if (h.side === tgt.side) continue;
        const hp = posOf(h.side);
        if (!hp) continue;
        // Inside CallAssistance of the target: same pack, CFH will join. A second pack is farther.
        const fromTgt = combatDistanceYd(hp, to);
        if (fromTgt != null && fromTgt <= CREATURE_FAMILY_ASSISTANCE_RADIUS) continue;
        const d = combatDistanceYd(at, hp);
        if (d == null) continue;
        const det = getCreatureAttackDistance(h.spec.level | 0, myLevel, {
          detectionRange: DEFAULT_DETECTION_RANGE,
          detectRangeMod: h.detectRangeMod ?? 0,
        });
        if (d <= det + UNPULLED_AGGRO_MARGIN_YD) return true;
      }
      return false;
    };

    const holdExtra = (f.stepBackHoldUntil ?? 0) > ctx.t ? (f.stepBackHoldYd ?? 0) : 0;
    const sightOk = !ctx.cfg.navLos || navSightClear(ctx.cfg, from, to);

    // A healer needs sight of the BODY IT HEALS, not only of the mob. Cite: Spell.cpp:4742 CheckCast
    // has no friendly exemption; TargetedMovementGenerator.cpp:625 repositions on lost sight.
    const blockedHealAlly = (): CombatPosYd | null => {
      if (isEnemySide(f.side) || f.spec.groupRole !== 'healer' || !ctx.cfg.navLos) return null;
      // A held unit never auto-moves, sight or no sight — the same bar the branch below keeps.
      if (policy === 'hold') return null;
      let worst: Fighter | null = null;
      let worstPct = ALLY_HEAL_THRESHOLD;
      for (const u of ctx.friendlyPoolOf(f)) {
        if (u === f || dead(u) || isTotemSide(u.side)) continue;
        const pct = u.hp / Math.max(1, u.spec.maxHealth);
        if (pct >= worstPct) continue;
        worstPct = pct;
        worst = u;
      }
      if (!worst) return null;
      const at = posOf(worst.side);
      // Same floor only: a storey away is the climbAim branch's job, not a sight walk.
      if (!at || !planarRangeHonestYd(from, at)) return null;
      return navSightClear(ctx.cfg, from, at) ? null : at;
    };

    // Where a melee DPS parks: out of the focus's front half and out of any wedge its kit sweeps, one
    // slot per unit. Standing in front hands the focus parry and block, and each parry shortens its swing.
    const meleeFlankSlot = (): CombatPosYd | null => {
      if (isEnemySide(f.side)) return null;
      // Only slide once in, or one step from, contact. Solving the slot from 30 yd out would path the
      // whole walk-in around the mob and park the unit at range whenever the arc grazed a second pack.
      if (dist > MELEE_REACH_YD + MELEE_PARK_SLACK_YD + MELEE_REACH_YD) return null;
      // Same anchor `facingOf` uses, so the arc we dodge is the arc the attack table rolls.
      const victim = foeOf(tgt);
      if (!victim || victim === f || victim === tgt) return null;
      const at = posOf(victim.side);
      if (!at) return null;
      // A slide already in flight owns the walk: finish it. Stopping at the boundary is the
      // oscillation this latch exists for (see posSlideHold).
      const held = heldSlideDest(f.side, tgt.side, to, from, MELEE_PARK_SLACK_YD);
      if (held) { diag(f.side, 'flankHold'); return held; }
      if ((posSlideSettled.get(f.side) ?? 0) > ctx.t) return null;
      if (!focusIsStill(tgt.side, to)) return null;
      const arcs = coneArcsOfKit(tgt.spec.spells, castableKitIds(tgt, ctx.spellOf));
      // ENTRY, with a dead band: only a unit well inside the bad arc starts walking. Asking the bare
      // boundary made every unit parked just outside slide again on the next facing change.
      if (!meleeSlotIsExposed(to, at, from, arcs, MELEE_SLOT_ENTRY_MARGIN_RAD)) return null;
      // Facing bearing, mob → its victim. Degenerate (victim standing on it): no bearing exists.
      const fx = at.x - to.x;
      const fy = at.y - to.y;
      const fLen = detHypot(fx, fy);
      if (fLen < 1e-6) return null;
      const ux = fx / fLen;
      const uy = fy / fLen;
      // Rotate that bearing by the solved offset, toward whichever side we already stand on —
      // the cross product's sign IS that side, so nobody crosses through the mob to flank.
      const side = (ux * (from.y - to.y) - uy * (from.x - to.x)) < 0 ? -1 : 1;
      // One slot per unit inside the clear band. Everyone solving the band's deepest point stacks the
      // melee group on it, body separation pushes them off, and they walk it back forever.
      const band = meleeSlotBandRad(arcs);
      let theta = meleeSlotOffsetRad(arcs);
      if (band && band.hi > band.lo) {
        const peers = meleePeersOf(tgt.side);
        let rank = 0;
        let count = 0;
        for (const s2 of peers) {
          if (s2 === victim.side) continue;
          const p2 = posOf(s2);
          // Same cross-product test: a unit on the far side is packing the far arc, not ours.
          if (p2 && ((ux * (p2.y - to.y) - uy * (p2.x - to.x)) < 0 ? -1 : 1) !== side) continue;
          if (s2 === f.side) rank = count;
          count += 1;
        }
        // Deepest slot first — the back of the arc is the best spot, so rank 0 takes it.
        if (count > 1) theta = band.hi - ((band.hi - band.lo) * rank) / (count - 1);
      }
      const c = detCos(theta);
      const sn = detSin(theta) * side;
      const rx = ux * c - uy * sn;
      const ry = ux * sn + uy * c;
      // THE CHASE'S OWN DEST, FLOORED AT THE PACKING RADIUS. A slot is the chase point at a different
      // bearing, but the bare park is too tight for N melee — and a flat floor clamped every big body.
      const slotRadius = Math.max(MELEE_REACH_YD, pairPark);
      const slot: CombatPosYd = {
        x: to.x + rx * slotRadius,
        y: to.y + ry * slotRadius,
        ...(to.z != null ? { z: to.z } : {}),
      };
      holdSlide(f.side, tgt.side, to, slot);
      diag(f.side, 'flankSolve');
      return slot;
    };

    if (policy === 'melee' || wantsMeleeBand(f)) {
      // Hold once in white range, otherwise close. Do not park outside a ranged kit's dead zone, which
      // stranded packs. ARRIVAL is the full contact ring while the AIM is half of it.
      const parkReach = Math.max(pairContact, holdExtra);

      // Enemy vs friendly: closeness timer → backpedal inside model / fan when packed.
      // Cite: TargetedMovementGenerator.cpp HandleFinalizedMovement + Backpedal + FanOut.
      if (isEnemySide(f.side) && !isEnemySide(tgt.side)) {
        let st = chaseCloseness.get(f.side);
        if (st?.dest) {
          const dDest = combatDistanceYd(from, st.dest);
          if (dDest != null && dDest > 0.3) {
            stepTo(st.dest, 0);
            return;
          }
          st.dest = null;
          st.remainingMs = CHASE_CLOSENESS_TIMER_MS;
          st.expired = false;
        }
        if (dist <= parkReach && planarRangeHonestYd(from, to)) {
          if (!st) {
            st = { remainingMs: CHASE_CLOSENESS_TIMER_MS, expired: false, dest: null };
            chaseCloseness.set(f.side, st);
          } else if (!st.expired && st.remainingMs > 0) {
            st.remainingMs -= tickMs;
            if (st.remainingMs <= 0) {
              st.remainingMs = 0;
              st.expired = true;
            }
          }
          if (st.expired) {
            // Backpedal(): reset flags; inside model → step back, else FanOut.
            st.expired = false;
            st.remainingMs = CHASE_CLOSENESS_TIMER_MS;
            // The NON-melee combined reach, so 3.0 for two player-sized bodies and the cap for a big
            // one. It was a flat 5, which capped for everything. Cite: TargetedMovementGenerator.cpp:404.
            const reach = chaseBackpedalReachYd(
              combatReachSumYd(f.spec.combatReachYd, tgt.spec.combatReachYd),
            );
            const distSq = dist * dist;
            if (isChaseInsideModel(distSq, reach)) {
              const dest = chaseBackpedalDest(from, to, reach);
              st.dest = dest;
              st.remainingMs = 0;
              stepTo(dest, 0);
              return;
            }
            if (chaseFanEnabled(f.spec.staticFlags)) {
              const fanR2 = CHASE_FANNING_RADIUS_YD * CHASE_FANNING_RADIUS_YD;
              let collider = false;
              for (const o of fightersOrder()) {
                if (o.side === f.side || !isEnemySide(o.side) || dead(o)) continue;
                if (!enemyEngaged(o)) continue;
                const ov = hostileTargetOf(o);
                if (!ov || ov.side !== tgt.side) continue;
                const op = posOf(o.side);
                if (!op) continue;
                const odx = op.x - from.x;
                const ody = op.y - from.y;
                if (odx * odx + ody * ody > fanR2) continue;
                if (chaseCloseness.get(o.side)?.dest) continue;
                collider = true;
                break;
              }
              if (collider) {
                const sign = fanDirectionSign(ctx.rng);
                const ang = frandFanAngle(ctx.rng);
                // GetNearPoint at own + victim reach, same non-melee form as the backpedal.
                // Cite: TargetedMovementGenerator.cpp:451,463.
                const fanDist = combatReachSumYd(f.spec.combatReachYd, tgt.spec.combatReachYd);
                let dest = chaseFanDest(from, to, fanDist, ang * sign);
                st.dest = dest;
                st.remainingMs = 0;
                stepTo(dest, 0);
                // Cite: TargetedMovementGenerator.cpp:461–470 second fan direction on fail.
                const after = posOf(f.side) ?? from;
                if (detHypot(after.x - from.x, after.y - from.y) <= 1e-6) {
                  dest = chaseFanDest(from, to, fanDist, ang * -sign);
                  st.dest = dest;
                  stepTo(dest, 0);
                }
                return;
              }
            }
          }
          standGate();
          return;
        }
        chaseCloseness.delete(f.side);
      }

      // Flank slot first: in reach but standing in the front half (or a cone wedge) is not
      // parked, and out of reach the walk-in goes round the arc rather than through it.
      const slot = policy === 'hold' ? null : meleeFlankSlot();
      const goal = slot ?? to;
      const goalStop = slot ? 0 : Math.min(pairPark, parkReach);
      const goalDist = slot ? combatDistanceYd(from, slot) : dist;
      if (goalDist == null) { gate(f.side, 'noPose'); return; }
      if (goalDist <= (slot ? MELEE_PARK_SLACK_YD : parkReach) && planarRangeHonestYd(from, to)) {
        dropStaleCorridor(f.side);
        gate(f.side, 'inRange', { dist: goalDist });
        return;
      }
      // hold ground: never chase
      if (policy === 'hold') { gate(f.side, 'policyHold', { dist: goalDist }); return; }
      // Only on the WALK-IN: once the focus has a threat list the fight is open, and refusing every
      // step that grazes a passive's GetAttackDistance strands the unit instead of saving a pull.
      if (!isEnemySide(f.side) && goalDist > 1e-6 && !enemyEngaged(tgt)) {
        const step = Math.min(moveStepYd(speed, tickMs), Math.max(0, goalDist - goalStop));
        const aim: CombatPosYd = {
          x: from.x + ((goal.x - from.x) / goalDist) * step,
          y: from.y + ((goal.y - from.y) / goalDist) * step,
          ...(from.z != null ? { z: from.z } : {}),
        };
        if (stepPullsUnpulled(aim)) { gate(f.side, 'wouldPull', { dist: goalDist }); return; }
      }
      if (slot) {
        diag(f.side, 'flankStep');
        // A slide is OPTIONAL motion: no corridor to the slot means stand and fight. The step fallback
        // drops the corridor and repaths, which walks the unit off the boss for a 5 yd sidestep.
        
        const tookSlot = takeMotion(f.side, 'flank', slot) != null;
        if (tookSlot && pathTo(f.side, slot, { keepFocus: true, claimed: true })) {
          advanceHeldOrder(f);
          gate(f.side, 'stepped', { dist: goalDist });
        } else {
          gate(f.side, tookSlot ? 'noRoute' : 'claimHeldBy', {
            dist: goalDist,
            owner: claimOwnerOf(f.side) ?? '',
          });
        }
        return;
      }
      diag(f.side, 'meleeChase');
      stepTo(goal, goalStop);
      return;
    }

    // Ranged standing in a breath — the breath being CAST, not one the kit merely owns. Treating the
    // kit as a wedge was 1,257 of 1,819 added steps and moved nobody out of any damage actually dealt.
    if (!isEnemySide(f.side) && policy !== 'hold') {
      const arcs = castConeArcs(tgt);
      if (arcs.length > 0) {
        const victim = foeOf(tgt);
        const at = victim && victim !== f && victim !== tgt ? posOf(victim.side) : undefined;
        // Same latch as the melee slot: a rotation already in flight finishes, so the caster
        // does not park on the wedge's edge and get swept back in by the next facing change.
        const heldArc = at ? heldSlideDest(f.side, tgt.side, to, from, 1) : null;
        if (heldArc && !stepPullsUnpulled(heldArc)) {
          diag(f.side, 'coneHold');
          stepTo(heldArc, 0, 'flank');
          return;
        }
        if (at && (posSlideSettled.get(f.side) ?? 0) <= ctx.t
          && arcs.some((a) => coneCovers(to, at, from, a))) {
          const band = coneClearBandRad(arcs, dist);
          // Null band: every bearing at this radius is swept, so stepping sideways buys nothing.
          if (band) {
            const fx = at.x - to.x;
            const fy = at.y - to.y;
            const fLen = detHypot(fx, fy);
            if (fLen > 1e-6 && dist > 1e-6) {
              const ux = fx / fLen;
              const uy = fy / fLen;
              // detAtan2, not Math.acos: every angle in this engine comes off the det table.
              let delta = detAtan2(from.y - to.y, from.x - to.x) - detAtan2(fy, fx);
              while (delta > Math.PI) delta -= Math.PI * 2;
              while (delta <= -Math.PI) delta += Math.PI * 2;
              const now = delta < 0 ? -delta : delta;
              const theta = now < band.lo ? band.lo : band.hi;
              const side = (ux * (from.y - to.y) - uy * (from.x - to.x)) < 0 ? -1 : 1;
              const c = detCos(theta);
              const sn = detSin(theta) * side;
              const dest = {
                x: to.x + (ux * c - uy * sn) * dist,
                y: to.y + (ux * sn + uy * c) * dist,
                ...(to.z != null ? { z: to.z } : {}),
              };
              if (!stepPullsUnpulled(dest)) {
                diag(f.side, 'coneSolve');
                holdSlide(f.side, tgt.side, to, dest);
                stepTo(dest, 0, 'flank');
                return;
              }
            }
          }
        }
      }
    }

    const maxR = longestOffenseRangeYd(f);

    // A stamped ranged stand IS the plan to fight from range, so it outranks pack-close. Walking a
    // caster inside its own PBAoE radius also walks it into every melee swing on the pack.
    const rangedStandPlan = (f.spec.standYards ?? 0) > MELEE_REACH_YD + 1;

    // Pack-close is keyed on pack count, never inBlast (that oscillated on the blast edge).
    const packCloseArmed = !isEnemySide(f.side)
      && policy === 'auto'
      && f.spec.packClose !== false
      && !rangedStandPlan
      && pbaoeRadiusYd(f) > 0
      && (() => {
        let n = 0;
        for (const h of ctx.livingHostilesFor(f)) {
          if (dead(h)) continue;
          if (++n >= 2) return true;
        }
        return false;
      })();

    // The ranged dead zone: packed inside the minimum range, commit to white reach with a real main
    // hand. The whole thrash band commits, not only under the minimum. With no weapon, stand.
    const minR = rangedAutoMinYards(f);
    const holdAt = minR > 0
      ? Math.min(
        minR + RANGED_MIN_CLEARANCE_YD,
        maxR > minR ? maxR : minR + RANGED_MIN_CLEARANCE_YD,
      )
      : 0;
    if (minR > 0) {
      if (dist < holdAt) {
        // Not the victim: walk OUT of the dead zone instead of committing to white reach. The commit is
        // right for the unit the boss is chewing on and wrong for everyone else — it trades the kit.
        const backOutTo = holdAt + RANGED_MIN_CLEARANCE_YD;
        if (
          !isEnemySide(f.side)
          && policy === 'auto'
          && kitRangedAuto(f)
          && maxR >= backOutTo
          && dist > 1e-6
          && !isThreatVictimOf(tgt, f)
        ) {
          const aim = {
            x: to.x + ((from.x - to.x) / dist) * backOutTo,
            y: to.y + ((from.y - to.y) / dist) * backOutTo,
            ...(to.z != null ? { z: to.z } : {}),
          };
          if (!stepPullsUnpulled(aim)) {
            f.mode = 'ranged';
            diag(f.side, 'deadZoneBackOut');
            stepTo(aim, 0);
            return;
          }
        }
        if (!((f.spec.weapon?.dmgMax ?? 0) > 1)) { standGate(); return; }
        f.mode = 'melee';
        if (policy !== 'hold' && dist > pairContact) {
          stepTo(to, pairPark);
        } else {
          standGate();
        }
        return;
      }
    }
    // Outside hold band: re-arm bow/wand auto if the kit is ranged-auto (mode may have
    // flipped to melee while packed inside rangeMin).
    if (kitRangedAuto(f) && f.mode === 'melee') f.mode = 'ranged';

    // A ranged kit holds at its stand yards for single-target bolts, unless a multi pack sits outside
    // the PBAoE radius. A ground rain keeps the long stop, since its density is at the focus.
    const standYd = f.spec.standYards;
    let stopAt = standYd != null && standYd > 0 ? standYd : maxR;
    // The creature's own ranged-mode park distance, where this derived one from kit reach. A minimum,
    // not an assignment: the main-spell prevention is unported, so parking past reach buys silence.
    if (stopAt > 0 && isEnemySide(f.side)) {
      const ea = ctx.enemyCastBySide.get(f.side)?.eventAi;
      if (ea?.rangedMode && ea.rangedChaseDistance > 0) stopAt = Math.min(stopAt, ea.rangedChaseDistance);
    }
    if (holdExtra > stopAt) stopAt = holdExtra;
    if (packCloseArmed && maxR > 0) {
      const pbaoeR = pbaoeRadiusYd(f);
      let inBlast = 0;
      for (const h of ctx.livingHostilesFor(f)) {
        if (dead(h)) continue;
        const hd = combatDistanceYd(from, posOf(h.side));
        if (hd != null && hd <= pbaoeR && ++inBlast >= 2) break;
      }
      if (inBlast < 2) {
        let closeTo = Math.min(maxR, Math.max(MELEE_REACH_YD, pbaoeR * 0.85));
        // The ranged-auto dead zone: walking in below the back-out point thrashes against the back-out
        // itself. Cite: PlayerbotHunterAI.cpp:252-274 — keep distance, do not commit to melee.
        if (kitRangedAuto(f) && holdAt > 0) {
          const floor = holdAt + RANGED_MIN_CLEARANCE_YD;
          if (closeTo < floor) closeTo = Math.min(maxR, floor);
        }
        const aim = dist > 1e-6
          ? {
            x: to.x + ((from.x - to.x) / dist) * closeTo,
            y: to.y + ((from.y - to.y) / dist) * closeTo,
            ...(to.z != null ? { z: to.z } : {}),
          }
          : from;
        if (!stepPullsUnpulled(aim)) stopAt = closeTo;
      }
    }
    // No fireable ranged stop: close to Judgement/Holy Shock range, else melee with MH
    // (KI-884 / KI-1046). Cite: Spell.cpp CheckTargetCreatureType.
    if (!(maxR > 0)) {
      let fireR = 0;
      for (const s of shortOffenseList(f)) {
        if (onCooldown(f, s) || !canAfford(f, s)) continue;
        if (!spellTargetTypeAllowed(s, tgt.creatureType ?? 0)) continue;
        if (focusImmunityBlocksSpell(s, tgt, 1)) continue;
        const r = s.rangeMax ?? 0;
        if (r > fireR) fireR = r;
      }
      if (fireR > 0) {
        // Inside the reach, not on it: a walk order arrives within ARRIVE_YD (0.25) of its dest, and
        // a shaman parked at 20.2 yd never got the 20 yd Flame Shock off.
        fireR -= CAST_REACH_SLACK_YD;
        stopAt = stopAt > 0 ? Math.min(stopAt, fireR) : fireR;
      } else {
        // Healer off-aggro may keep a stamped stand for heals; solo MH must not freeze.
        let healerHold = false;
        if (!isEnemySide(f.side) && f.spec.groupRole === 'healer' && stopAt > MELEE_REACH_YD + 1) {
          try {
            // No threat manager reads as "hold", same as the throw this used to take.
            const mgr = ctx.threatOf(tgt);
            const v = mgr ? mgr.getCurrentVictimId() : null;
            healerHold = mgr ? v != null && v !== f.side : true;
          } catch { healerHold = true; }
        }
        if (!healerHold) {
          if (policy !== 'hold' && (f.spec.weapon?.dmgMax ?? 0) > 1
            && dist > pairContact) {
            stepTo(to, pairPark);
          } else {
            standGate();
          }
          return;
        }
      }
    }
    if (dist <= stopAt && planarRangeHonestYd(from, to) && sightOk) {
      // In range of the mob is not in sight of the wounded. Walk at the ally; the next tick's
      // sight test ends the walk the moment the corner is rounded, as the mob branch below does.
      const ally = blockedHealAlly();
      if (ally) { stepTo(ally, 0); return; }
      dropStaleCorridor(f.side);
      gate(f.side, 'inRange', { dist });
      return;
    }
    // hold ground: enemies come to you
    if (policy === 'hold') { gate(f.side, 'policyHold', { dist }); return; }
    if (planarRangeHonestYd(from, to)) {
      // Same floor, no LOS (dungeon corner): walk at the body; the parked-dest cleanup
      // above ends the walk at the first sighted in-range spot.
      stepTo(to, sightOk ? stopAt : 0);
      return;
    }
    // Other floor: walk to the firing position (stopAt short of the focus ON ITS floor).
    // Aiming the body with stop 0 climbed the whole back line into the boss (ZG Venoxis).
    const nearR = Math.min(stopAt, dist);
    const climbAim: CombatPosYd = dist > 1e-6 && nearR > MELEE_REACH_YD + MELEE_PARK_SLACK_YD
      ? {
        x: to.x + ((from.x - to.x) / dist) * nearR,
        y: to.y + ((from.y - to.y) / dist) * nearR,
        ...(to.z != null ? { z: to.z } : {}),
      }
      : to;
    stepTo(climbAim, 0);
  };

  // Chase is the last arm in the chain and the floor of the claim order, so it always handles the unit — a
  // stand is its answer, not a fall-through. The boolean is the interface's.
  return {
    chase: {
      owner: 'chase',
      update: (f) => { advanceChase(f); return true; },
      isReachable,
      /** Finalize (`:39`) — off the stack for good, so nothing about this unit survives. */
      finalize: (f) => {
        unreachableFrom.delete(f.side);
        chaseCloseness.delete(f.side);
        noPathSides.delete(f.side);
      },
    },
    // The search queue reporting an honest no-path for this side. Enemies only: a party member with no
    // route walks the lead's corridor or stands, it does not leave combat.
    markNoPath: (side: string) => { if (isEnemySide(side)) noPathSides.add(side); },
    // A displacement moved the body, so the melee-park closeness timer is measuring from somewhere the
    // unit no longer is. Side-keyed, because the displacement handlers have a side and not a Fighter.
    clearChaseParkTimer: (side: string) => { chaseCloseness.delete(side); },
    // Standing in a wedge that is live RIGHT NOW — the cone slide's own test, asked by the motion
    // gate before it parks a caster in a breath, so the fact stays in one place.
    standsInLiveCone: (f: Fighter): boolean => {
      if (isEnemySide(f.side) || dead(f)) return false;
      const tgt = foeOf(f);
      if (!tgt || tgt === f || dead(tgt)) return false;
      const arcs = castConeArcs(tgt);
      if (arcs.length === 0) return false;
      const from = posOf(f.side);
      const to = posOf(tgt.side);
      const victim = foeOf(tgt);
      const at = victim && victim !== f && victim !== tgt ? posOf(victim.side) : undefined;
      if (!from || !to || !at) return false;
      return arcs.some((a) => coneCovers(to, at, from, a));
    },
  };
}
