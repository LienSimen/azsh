// Mechanic moves for the motion phase, peeled from sessionMotion. A rotation move row is walked by one
// arm that MUST sit above held-key, step-back, engage and leash. Extracted modules must not import combat.
import { castableKitIds } from './castableKit.ts';

import { isEnemySide, isTotemSide } from '../core/events.ts';
import {
  moveStepYd, MELEE_REACH_YD, MELEE_PARK_SLACK_YD, combatDistanceYd, meleeContactYd,
  coneArcsOfKit, coneClearBandRad, coneCovers,
  type CombatPosYd,
} from './combatGeometry.ts';
import { detAtan2, detCos, detHypot, detSin } from '../core/detMath.ts';
import type { RuleMove } from '../../domain/rotation/rotation.ts';
import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import type { MotionGenerator } from './motionGenerator.ts';
import type { MotionClaims } from './motionClaim.ts';
import type { PathToOpts } from './sessionPathTo.ts';
import { hazardMatches, hostileHazardsThisTick } from './hazards.ts';
import { hasInArc } from './facing.ts';

/** Park a mechanic run-out this far inside the mover's own cast range, not on the line of it. */
const RANGE_KEEP_SLACK_YD = 2;

/** Closures the mechanic-move arm needs from installSessionMotion. */
export interface MechanicMoveDeps {
  ctx: CombatContext;
  claims: MotionClaims;
  tickMs: number;
  posOf: (side: string) => CombatPosYd | undefined;
  setPos: (side: string, p: CombatPosYd) => void;
  fightersOrder: () => Fighter[];
  dead: (f: Fighter) => boolean;
  foeOf: (f: Fighter) => Fighter | null;
  navStepToward: (
    side: string, from: CombatPosYd, to: CombatPosYd,
    step: number, stopAtDist: number, pathfind?: boolean,
  ) => CombatPosYd;
  runSpeedYdPerSec: (f: Fighter) => number;
  longestOffenseRangeYd: (f: Fighter) => number;
  dropStaleCorridor: (side: string) => void;
  pathTo: (side: string, dest: CombatPosYd, opts?: PathToOpts) => boolean;
  /** Walk the corridor this arm just issued — the claim is already held. */
  advanceHeldOrder: (f: Fighter) => void;
}

export function createMechanicMove(deps: MechanicMoveDeps): { mechanicMove: MotionGenerator } {
  const {
    ctx, claims, tickMs, posOf, setPos, fightersOrder, dead, foeOf,
    navStepToward, runSpeedYdPerSec, longestOffenseRangeYd, dropStaleCorridor,
    pathTo, advanceHeldOrder,
  } = deps;

  // Raid centroid of living friendlies (excl. self). Used by flee_raid / spread. Empty party → null (solo:
  // flee away from focus instead).
  const raidCentroid = (f: Fighter): CombatPosYd | null => {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const u of fightersOrder()) {
      if (dead(u) || u === f || isEnemySide(u.side) || isTotemSide(u.side)) continue;
      const p = posOf(u.side);
      if (!p) continue;
      sx += p.x;
      sy += p.y;
      n++;
    }
    if (n === 0) return null;
    return { x: sx / n, y: sy / n };
  };

  /** Yards to the nearest living friendly (excl. self / totems). Null when nobody is placed. */
  /** Nearest living friendly (excl. self / totems) to an arbitrary point. */
  const nearestFriendlyYdAt = (f: Fighter, from: CombatPosYd | null): number | null => {
    if (!from) return null;
    let best: number | null = null;
    for (const u of fightersOrder()) {
      if (dead(u) || u === f || isEnemySide(u.side) || isTotemSide(u.side)) continue;
      const p = posOf(u.side);
      if (!p) continue;
      const d = combatDistanceYd(from, p);
      if (d != null && (best == null || d < best)) best = d;
    }
    return best;
  };

  const nearestFriendlyYd = (f: Fighter): number | null => nearestFriendlyYdAt(f, posOf(f.side) ?? null);

  /** The point one hop directly away from `awayFrom`. Mutable — callers may clamp it. */
  const stepAwayAim = (from: CombatPosYd, awayFrom: CombatPosYd, hop: number): CombatPosYd => {
    const dx = from.x - awayFrom.x;
    const dy = from.y - awayFrom.y;
    const len = detHypot(dx, dy);
    return len > 1e-6
      ? { x: from.x + (dx / len) * Math.max(hop, 1), y: from.y + (dy / len) * Math.max(hop, 1), ...(from.z != null ? { z: from.z } : {}) }
      : { x: from.x + Math.max(hop, 1), y: from.y, ...(from.z != null ? { z: from.z } : {}) };
  };

  // Never past the mover's OWN cast range to its focus: crossing that line is what makes the range rule
  // and this row disagree. A mover ALREADY outside the cap keeps the ring it stands on.
  const clampAimToOwnReach = (
    f: Fighter,
    aim: CombatPosYd,
    focusAt: CombatPosYd | null,
    from: CombatPosYd,
    focus?: Fighter | null,
  ): void => {
    const cap = focusAt ? longestOffenseRangeYd(f) : 0;
    if (!focusAt || !(cap > 0)) return;
    const cur = combatDistanceYd(from, focusAt) ?? 0;
    // The floor is the PAIR's contact ring, not a flat five. Melee reach became a function of both
    // bodies, so a melee swinging from 10 yd was clamped back inside the fan the row was leaving.
    const floor = meleeContactYd(false, f.spec.combatReachYd, focus?.spec.combatReachYd);
    const keep = cur > cap
      ? Math.max(floor, cur)
      : Math.max(floor, cap - RANGE_KEEP_SLACK_YD);
    const ax = aim.x - focusAt.x;
    const ay = aim.y - focusAt.y;
    const ar = detHypot(ax, ay);
    if (ar > keep && ar > 1e-6) {
      aim.x = focusAt.x + (ax / ar) * keep;
      aim.y = focusAt.y + (ay / ar) * keep;
    }
  };

  /** Step away from `awayFrom` up to `hop` yards; returns true while still moving. */
  const stepAwayFrom = (f: Fighter, from: CombatPosYd, awayFrom: CombatPosYd, hop: number): boolean => {
    const dx = from.x - awayFrom.x;
    const dy = from.y - awayFrom.y;
    const len = detHypot(dx, dy);
    const aim = len > 1e-6
      ? { x: from.x + (dx / len) * Math.max(hop, 1), y: from.y + (dy / len) * Math.max(hop, 1), ...(from.z != null ? { z: from.z } : {}) }
      : { x: from.x + hop, y: from.y, ...(from.z != null ? { z: from.z } : {}) };
    (ctx as { unitMoveOrders?: Map<string, unknown> }).unitMoveOrders?.delete(f.side);
    dropStaleCorridor(f.side);
    setPos(f.side, navStepToward(f.side, from, aim, hop, 0, !isEnemySide(f.side)));
    return true;
  };

  // Mechanic move from a rotation `kind:'move'` row. MUST sit above held-key / step-back / engage / leash
  // or the runner is dragged back into the raid (PLAN §7.5 ordering trap).
  const advanceMechanicMoveStep = (f: Fighter): boolean => {
    const move = f.pendingMechanicMove as RuleMove | undefined;
    if (!move) {
      if (claims.ownerOf(f.side, ctx.t) === 'mechanic') claims.release(f.side, 'mechanic', ctx.t);
      return false;
    }
    const from = posOf(f.side);
    if (!from) {
      f.pendingMechanicMove = undefined;
      return false;
    }
    const speed = runSpeedYdPerSec(f);
    if (!(speed > 0)) return true;
    if (claims.take(f.side, 'mechanic', null, ctx.t) === false) return true;
    const hop = moveStepYd(speed, tickMs);

    if (move.kind === 'flee_raid') {
      const center = raidCentroid(f);
      const focus = foeOf(f);
      const focusAt = focus && focus !== f && !dead(focus) ? posOf(focus.side) ?? null : null;
      const away = center ?? focusAt;
      if (!away) {
        f.pendingMechanicMove = undefined;
        return false;
      }
      // Clear means the NEAREST living friendly is outside the blast, not the centroid — 10 yd from the
      // middle of a blob still detonates on half of it. The centroid stays the escape hatch at twice that.
      const d = combatDistanceYd(from, away);
      const clear = nearestFriendlyYd(f);
      const done = clear != null
        ? clear >= move.yd || (d != null && d >= move.yd * 2)
        : d != null && d >= move.yd;
      if (done) {
        f.pendingMechanicMove = undefined;
        return true; // hold the gap this tick; engage must not reclaim motion
      }
      // Run out ALONG the ring, not off it. The bomb's whole payoff is casting at zero cast time, and a
      // radial sprint leaves the boss's range so the range rule pulls the holder straight back.
      if (focusAt) {
        const r = combatDistanceYd(from, focusAt);
        if (r != null && r > 1e-3) {
          // Arc length hop at radius r; cap the sweep so a tight melee radius cannot spin.
          const theta = Math.min(hop / r, Math.PI / 4);
          const ring = (sign: number): CombatPosYd => {
            const ca = detCos(theta * sign);
            const sa = detSin(theta * sign);
            const ox = from.x - focusAt.x;
            const oy = from.y - focusAt.y;
            return {
              x: focusAt.x + ox * ca - oy * sa,
              y: focusAt.y + ox * sa + oy * ca,
              ...(from.z != null ? { z: from.z } : {}),
            };
          };
          const cw = ring(1);
          const ccw = ring(-1);
          const dCw = nearestFriendlyYdAt(f, cw) ?? -1;
          const dCcw = nearestFriendlyYdAt(f, ccw) ?? -1;
          const aim = dCw >= dCcw ? cw : ccw;
          // Only orbit while it is actually buying separation. A holder boxed in on both sides
          // (the whole raid stacked on the ring) still has to leave, so fall through to radial.
          if (Math.max(dCw, dCcw) > (clear ?? 0) + 1e-3) {
            setPos(f.side, navStepToward(f.side, from, aim, hop, 0, !isEnemySide(f.side)));
            return true;
          }
        }
      }
      // Radial fallback, clamped onto our own reach ring (clampAimToOwnReach).
      const aim = stepAwayAim(from, away, hop);
      clampAimToOwnReach(f, aim, focusAt, from, focus);
      setPos(f.side, navStepToward(f.side, from, aim, hop, 0, !isEnemySide(f.side)));
      return true;
    }

    if (move.kind === 'spread') {
      let nearest: CombatPosYd | null = null;
      let nearestD = Infinity;
      for (const u of fightersOrder()) {
        if (dead(u) || u === f || isEnemySide(u.side) || isTotemSide(u.side)) continue;
        const p = posOf(u.side);
        if (!p) continue;
        const d = combatDistanceYd(from, p);
        if (d != null && d < nearestD) {
          nearestD = d;
          nearest = p;
        }
      }
      if (!nearest || nearestD >= move.minYd) {
        f.pendingMechanicMove = undefined;
        return nearest != null && nearestD >= move.minYd;
      }
      // Spacing is not a reason to leave the fight: a 20 yd spread walked a hunter radially off
      // its own 35 yd Auto Shot band and it fired nothing all pull. Same clamp as flee_raid.
      const spreadFocus = foeOf(f);
      const spreadFocusAt = spreadFocus && spreadFocus !== f && !dead(spreadFocus)
        ? posOf(spreadFocus.side) ?? null
        : null;
      const spreadAim = stepAwayAim(from, nearest, hop);
      clampAimToOwnReach(f, spreadAim, spreadFocusAt, from, spreadFocus);
      (ctx as { unitMoveOrders?: Map<string, unknown> }).unitMoveOrders?.delete(f.side);
      dropStaleCorridor(f.side);
      setPos(f.side, navStepToward(f.side, from, spreadAim, hop, 0, !isEnemySide(f.side)));
      return true;
    }

    // Thaddius polarity: the opposite charge is the hazard and the same charge is the buff, so one move
    // does both halves — clear the payload radius of every ally who lacks my aura, then close on the rest.
    if (move.kind === 'split_by_aura') {
      const aura = move.aura | 0;
      const away = move.awayYd > 0 ? move.awayYd : 1;
      let foeNear: CombatPosYd | null = null;
      let foeNearD = Infinity;
      let sameX = 0;
      let sameY = 0;
      let sameN = 0;
      let sameNearD = Infinity;
      for (const u of fightersOrder()) {
        if (dead(u) || u === f || isEnemySide(u.side) || isTotemSide(u.side)) continue;
        const p = posOf(u.side);
        if (!p) continue;
        const d = combatDistanceYd(from, p);
        if (d == null) continue;
        if (u.buffActive.has(aura)) {
          sameX += p.x;
          sameY += p.y;
          sameN++;
          if (d < sameNearD) sameNearD = d;
        } else if (d < foeNearD) {
          foeNearD = d;
          foeNear = p;
        }
      }
      // Survival first: an ally of the other charge inside the payload radius is 2000 nature a tick. The
      // ROW stops at the edge and engage closes the last half yard; pushing past it measured WORSE.
      if (foeNear && foeNearD < away) return stepAwayFrom(f, from, foeNear, hop);
      // Then throughput: one 29659/29660 stack per same-charge ally inside the same radius.
      if (sameN > 0 && sameNearD > away) {
        const dest = { x: sameX / sameN, y: sameY / sameN, ...(from.z != null ? { z: from.z } : {}) };
        (ctx as { unitMoveOrders?: Map<string, unknown> }).unitMoveOrders?.delete(f.side);
        dropStaleCorridor(f.side);
        setPos(f.side, navStepToward(f.side, from, dest, hop, 0, !isEnemySide(f.side)));
        return true;
      }
      // Sorted: HOLD the tick, as spread does. Releasing motion here let engage walk the two camps back
      // into one ball within a few ticks, and the payload ticks every 5 s regardless.
      f.pendingMechanicMove = undefined;
      return true;
    }

    if (move.kind === 'stack_on') {
      let dest: CombatPosYd | null = null;
      if ('unit' in move) {
        dest = posOf(move.unit) ?? null;
      } else {
        for (const u of fightersOrder()) {
          if (dead(u) || u === f || isEnemySide(u.side)) continue;
          if (u.spec.groupRole === move.role) {
            dest = posOf(u.side) ?? null;
            if (dest) break;
          }
        }
      }
      if (!dest) {
        f.pendingMechanicMove = undefined;
        return false;
      }
      const d = combatDistanceYd(from, dest);
      if (d != null && d <= MELEE_PARK_SLACK_YD + 1) {
        f.pendingMechanicMove = undefined;
        return true;
      }
      (ctx as { unitMoveOrders?: Map<string, unknown> }).unitMoveOrders?.delete(f.side);
      if (pathTo(f.side, dest, { keepFocus: true, claimed: true, standShortYd: MELEE_PARK_SLACK_YD })) {
        advanceHeldOrder(f);
        return true;
      }
      setPos(f.side, navStepToward(f.side, from, dest, hop, MELEE_PARK_SLACK_YD, !isEnemySide(f.side)));
      return true;
    }

    if (move.kind === 'behind_target') {
      const focus = foeOf(f);
      if (!focus || focus === f || dead(focus)) {
        f.pendingMechanicMove = undefined;
        return false;
      }
      const to = posOf(focus.side);
      if (!to) {
        f.pendingMechanicMove = undefined;
        return false;
      }
      // BEHIND is measured off what the mob FACES, its victim, not off our own approach: a frontal cone
      // is defined by the caster's orientation, and the old reading walked anyone already behind into it.
      const facing = ctx.foeOf?.(focus);
      const facingAt = facing && facing !== focus ? posOf(facing.side) : undefined;
      const anchor = facingAt ?? from;
      const dx = to.x - anchor.x;
      const dy = to.y - anchor.y;
      const len = detHypot(dx, dy);
      const cur = combatDistanceYd(from, to);
      // At RANGE, "behind" is about clearing the cone rather than parry, so rotate out of the arc at our
      // own radius. The far-side point sent a 30 yd caster on a 60 yd walk the yield then abandoned.
      const ranged = cur != null && cur > MELEE_REACH_YD + MELEE_PARK_SLACK_YD;
      const arcs = ranged ? coneArcsOfKit(focus.spec.spells, castableKitIds(focus, ctx.spellOf)) : [];
      if (ranged && arcs.length > 0 && facingAt && cur != null && len > 1e-6) {
        if (!arcs.some((a) => coneCovers(to, facingAt, from, a))) {
          // Outside every arc the focus can sweep at this radius: the row has arrived.
          f.pendingMechanicMove = undefined;
          return true;
        }
        const band = coneClearBandRad(arcs, cur);
        // Null band means every bearing at this radius is swept, so rotating buys nothing and
        // the far-side walk below is the only answer left.
        if (band) {
          // `dx, dy` runs victim -> focus, so the focus FACES the other way. Same rotation as
          // sessionChase's cone slide, with the facing unit vector in place of its `ux, uy`.
          const fux = -dx / len;
          const fuy = -dy / len;
          let delta = detAtan2(from.y - to.y, from.x - to.x) - detAtan2(fuy, fux);
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta <= -Math.PI) delta += Math.PI * 2;
          const now = delta < 0 ? -delta : delta;
          const theta = now < band.lo ? band.lo : band.hi;
          // Rotate toward whichever side we already stand on: nobody crosses through the focus.
          const side = (fux * (from.y - to.y) - fuy * (from.x - to.x)) < 0 ? -1 : 1;
          const c = detCos(theta);
          const sn = detSin(theta) * side;
          const arcDest = {
            x: to.x + (fux * c - fuy * sn) * cur,
            y: to.y + (fux * sn + fuy * c) * cur,
            ...(to.z != null ? { z: to.z } : {}),
          };
          setPos(f.side, navStepToward(f.side, from, arcDest, hop, 0, !isEnemySide(f.side)));
          return true;
        }
      }
      // Hold our OWN radius, so a caster leaves a 45 yd cone sideways instead of being walked into the
      // melee pile. Floored at the PAIR's contact ring: behind a big body, five yards is inside the model.
      const ownRing = meleeContactYd(false, f.spec.combatReachYd, focus?.spec.combatReachYd);
      const back = Math.max(ownRing, cur ?? ownRing);
      // ARRIVAL is the back arc, not a point: the far-side point sits `cur + back` away, so its own
      // test could never pass in a 1v1 and the row walked through the body forever.
      const heading = ctx.facingOf?.(focus);
      if (heading != null && !hasInArc(to, heading, from)) {
        f.pendingMechanicMove = undefined;
        return true;
      }
      // A unit that can still react re-faces its victim every update, so no walk gets behind it.
      // Give the tick back instead of stalling. Cite: Unit.cpp:8735 SetInFront; Unit.h:1503.
      if (heading != null && facing === f && !ctx.controlActive?.(focus, 'stun')) {
        f.pendingMechanicMove = undefined;
        return false;
      }
      // Walk to the point `back` yards down the focus's OWN heading, which is fixed while it is held.
      const behind = heading != null
        ? { x: to.x - detCos(heading) * back, y: to.y - detSin(heading) * back, ...(to.z != null ? { z: to.z } : {}) }
        : len > 1e-6
          ? { x: to.x + (dx / len) * back, y: to.y + (dy / len) * back, ...(to.z != null ? { z: to.z } : {}) }
          : { x: to.x + back, y: to.y, ...(to.z != null ? { z: to.z } : {}) };
      const d = combatDistanceYd(from, behind);
      if (d != null && d <= MELEE_PARK_SLACK_YD + 0.5) {
        f.pendingMechanicMove = undefined;
        return true;
      }
      setPos(f.side, navStepToward(f.side, from, behind, hop, 0, !isEnemySide(f.side)));
      return true;
    }

    if (move.kind === 'flank_target') {
      const focus = foeOf(f);
      if (!focus || focus === f || dead(focus)) {
        f.pendingMechanicMove = undefined;
        return false;
      }
      const to = posOf(focus.side);
      if (!to) {
        f.pendingMechanicMove = undefined;
        return false;
      }
      // Same anchor as behind_target: the mob's ORIENTATION is its victim, not our approach.
      const facing = ctx.foeOf?.(focus);
      const facingAt = facing && facing !== focus ? posOf(facing.side) : undefined;
      const anchor = facingAt ?? from;
      const dx = to.x - anchor.x;
      const dy = to.y - anchor.y;
      const len = detHypot(dx, dy);
      // Same pair ring as behind_target, for the same reason.
      const flankRing = meleeContactYd(false, f.spec.combatReachYd, focus?.spec.combatReachYd);
      const back = Math.max(flankRing, combatDistanceYd(from, to) ?? flankRing);
      let flank;
      if (len > 1e-6) {
        const ux = dx / len;
        const uy = dy / len;
        // Perpendicular, toward whichever side we already stand on. The cross product's sign IS
        // that side; on the centre line (0) go left, so two units never split on a rounding bit.
        const side = (ux * (from.y - to.y) - uy * (from.x - to.x)) < 0 ? -1 : 1;
        flank = {
          x: to.x + -uy * side * back,
          y: to.y + ux * side * back,
          ...(to.z != null ? { z: to.z } : {}),
        };
      } else {
        flank = { x: to.x, y: to.y + back, ...(to.z != null ? { z: to.z } : {}) };
      }
      const d = combatDistanceYd(from, flank);
      if (d != null && d <= MELEE_PARK_SLACK_YD + 0.5) {
        f.pendingMechanicMove = undefined;
        return true;
      }
      setPos(f.side, navStepToward(f.side, from, flank, hop, 0, !isEnemySide(f.side)));
      return true;
    }

    if (move.kind === 'move_to') {
      const dest: CombatPosYd = { x: move.x, y: move.y, ...(move.z != null ? { z: move.z } : {}) };
      const d = combatDistanceYd(from, dest);
      if (d != null && d <= MELEE_PARK_SLACK_YD + 0.5) {
        f.pendingMechanicMove = undefined;
        return true;
      }
      if (pathTo(f.side, dest, { keepFocus: true, claimed: true })) {
        advanceHeldOrder(f);
        return true;
      }
      setPos(f.side, navStepToward(f.side, from, dest, hop, 0, !isEnemySide(f.side)));
      return true;
    }

    if (move.kind === 'avoid_zone') {
      // Every hazard on the floor, pools AND bodies. A ground-targeted AoE creates no dynamic object, so
      // a body like a Shadow Fissure was invisible here while it pulsed on whoever stood in it.
      let worst: { o: CombatPosYd; edge: number } | null = null;
      /** A matching, live, locatable hazard was seen — so `!worst` means CLEAR OF IT, not absent. */
      let sawPool = false;
      for (const h of hostileHazardsThisTick(ctx, dead)) {
        if (!hazardMatches(h, move.id)) continue;
        const d = combatDistanceYd(from, h.at);
        if (d == null) continue;
        sawPool = true;
        const edge = d - h.radiusYd;
        if (edge >= 0.5) continue; // already clear of this one
        if (!worst || edge < worst.edge) worst = { o: h.at, edge };
      }
      if (!worst) {
        f.pendingMechanicMove = undefined;
        // Standing clear of every matching pool IS this row's arrival, so hold the gap for the tick
        // as the other kinds do. `sawPool` separates that from "no such hazard", which is an abort.
        return sawPool;
      }
      return stepAwayFrom(f, from, worst.o, hop);
    }

    if (move.kind === 'keep_range') {
      const entry = (move.entry ?? 0) | 0;
      let awayUnit: Fighter | null = null;
      if (entry > 0) {
        for (const u of fightersOrder()) {
          if (dead(u) || !isEnemySide(u.side)) continue;
          if (((u.spec.creatureEntry ?? 0) | 0) !== entry) continue;
          if (posOf(u.side)) { awayUnit = u; break; }
        }
      } else {
        const focus = foeOf(f);
        if (focus && focus !== f && !dead(focus)) awayUnit = focus;
      }
      const away: CombatPosYd | null = awayUnit ? posOf(awayUnit.side) ?? null : null;
      if (!away || !awayUnit) {
        f.pendingMechanicMove = undefined;
        return false;
      }
      // Out-walking the chaser that is ON you needs it SNARED or ROOTED — the PvP kite. Asked as an
      // impairing aura, not a speed compare, so a wounded mob (sessionMotionKit.ts:221) is not kited.
      const held = ctx.controlActive as (f: Fighter, c: 'snare' | 'root') => boolean;
      const chaserHeld = held(awayUnit, 'snare') || held(awayUnit, 'root');
      if (!chaserHeld && ctx.threatOf(awayUnit)?.getCurrentVictimId() === f.side) {
        f.pendingMechanicMove = undefined;
        return false;
      }
      const minYd = move.minYd > 0 ? move.minYd : 0;
      const d = combatDistanceYd(from, away);
      // isWithinRadiusYd hits at <= radius, so 20.0 is still inside Sonic Burst.
      if (d != null && d >= minYd + 0.5) {
        f.pendingMechanicMove = undefined;
        return true;
      }
      return stepAwayFrom(f, from, away, hop);
    }

    f.pendingMechanicMove = undefined;
    return false;
  };

  // Counts the row that REACHED its goal, in one place instead of at the 17 sites that clear the
  // pending row. An arrival clears it and returns true; every abort clears it and returns false.
  const advanceMechanicMove = (f: Fighter): boolean => {
    const had = f.pendingMechanicMove;
    const held = advanceMechanicMoveStep(f);
    if (!had) return held;
    if (f.pendingMechanicMove) {
      // Still walking: the row owns the next decision too (pickAction reads this flag).
      f.mechanicMoveDone = false;
      return held;
    }
    // Arrived or aborted: either way there is no step left this tick, so the unit must be allowed to
    // act. Handing a satisfied row the whole GCD took a companion mage from 26 casts to 0 over 40 s.
    if (!f.mechanicMoveDone) {
      f.mechanicMoveDone = true;
      // The counter is arrivals only; an abort belongs in `fired - reached`.
      if (held) ctx.push({ t: ctx.t, kind: 'mechanic_move_done', actor: f.side, move: had.kind });
    }
    return held;
  };

  return { mechanicMove: { owner: 'mechanic', update: (f) => advanceMechanicMove(f) } };
}
