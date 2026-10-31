// The per-tick payload the sim hands the renderer (PERF-RUNSHEET S6 "Payload contract"). A flat typed
// array, not `CombatantView[]` as JSON: 33 `unitPosYd` and 7 `unitHpPct` call sites in src/ui read this
// every frame, and serializing views at that rate is what decides whether the worker wins at all.

import type { Fighter } from './types.ts';
import type { CombatPosYd } from './combatGeometry.ts';

/** Floats per seat in `buf`: x, y, z, hpPct, facing. */
export const POSE_STRIDE = 5;

export type SimPoseFrame = {
  // Seat order `buf` is indexed by. Re-read only when `gen` moves — the roster changes on a summon or a
  // de-stream, not per tick.
  sides: string[];
  /** Bumps when `sides` changed, so a reader keys its side→index map on it instead of rebuilding. */
  gen: number;
  // POSE_STRIDE floats per seat; NaN where the session carries no such field. Float64 because Float32
  // reads 19.3 back as 19.299999237060547 and the walk feeds these into `pathTo` (CLAUDE.md 0c.4).
  buf: Float64Array;
};

export function emptyPoseFrame(): SimPoseFrame {
  return { sides: [], gen: 0, buf: new Float64Array(0) };
}

// Producer-side state: `frame` is the payload, `seen` is scratch so the fill dedupes the roster
// against the position map without allocating a Set per tick.
export type PoseFiller = { frame: SimPoseFrame; seen: Set<string> };

export function createPoseFiller(): PoseFiller {
  return { frame: emptyPoseFrame(), seen: new Set() };
}

// Refill in place, growing `buf` only when the seat count does. Covers the roster UNION the position
// map's keys: `posOf` reads that map straight (sessionGeometry.ts:18) and answers for a dropped seat.
export function fillPoseFrame(
  filler: PoseFiller,
  seats: readonly Fighter[],
  positions: Readonly<Record<string, unknown>> | undefined | null,
  posOf: (side: string) => CombatPosYd | undefined,
  fighterOf: (side: string) => Fighter | undefined,
): SimPoseFrame {
  const { frame, seen } = filler;
  seen.clear();
  const extra: string[] = [];
  for (const f of seats) seen.add(f.side);
  if (positions) {
    for (const side of Object.keys(positions)) if (!seen.has(side)) extra.push(side);
  }
  const n = seats.length + extra.length;
  if (frame.buf.length < n * POSE_STRIDE) frame.buf = new Float64Array(n * POSE_STRIDE);
  const buf = frame.buf;
  let rosterMoved = frame.sides.length !== n;
  for (let i = 0; i < n; i++) {
    const side = i < seats.length ? seats[i]!.side : extra[i - seats.length]!;
    if (!rosterMoved && frame.sides[i] !== side) rosterMoved = true;
    const p = posOf(side);
    const o = i * POSE_STRIDE;
    buf[o] = p ? p.x : NaN;
    buf[o + 1] = p ? p.y : NaN;
    buf[o + 2] = p && p.z != null ? p.z : NaN;
    const f = i < seats.length ? seats[i]! : fighterOf(side);
    const max = f ? f.spec.maxHealth : 0;
    buf[o + 3] = f && max > 0 ? Math.max(0, Math.min(100, (f.hp / max) * 100)) : NaN;
    buf[o + 4] = f?.facing ?? NaN;
  }
  if (rosterMoved) {
    frame.sides.length = n;
    for (let i = 0; i < n; i++) {
      frame.sides[i] = i < seats.length ? seats[i]!.side : extra[i - seats.length]!;
    }
    frame.gen++;
  }
  return frame;
}

// The DISCRETE half of the payload (PERF-RUNSHEET S6b). Off-thread the reading side never ticks, so
// every member the facade memoizes has to arrive rather than be pulled from a live session.
export type DiscreteSnapshot = {
  /** Zero-argument members, by name. */
  zero: Record<string, unknown>;
  /** One-argument members, by name then by the seat asked about. */
  bySide: Record<string, Record<string, unknown>>;
};

// What the reading side's memo was asked since the last snapshot, so the far side answers exactly that;
// a member outside the two tables below was otherwise filled from a session nobody ticks (S6b).
export type DiscreteWant = {
  zero: string[];
  /** One-argument members, by name, with every argument asked for. */
  one: Record<string, unknown[]>;
};

// What a live 40-man Molten Core pull at 4x actually reads (`sim_discrete`, 2026-09-02), measured on
// the floor rather than taken off the declaration, which lists 54.
export const DISCRETE_ZERO = [
  'abilities', 'items', 'companionPets', 'totemsView', 'trapsView', 'playerTargetId',
  'enemyThreatVictim',
] as const;
export const DISCRETE_BY_SIDE = [
  'targetOf', 'unitCastOrderOf', 'enemyThreatList',
] as const;

// Side to pose off a frame. `pos()` reuses one object per seat, the same aliasing the live session has
// (sessionApi.ts:638 hands back `ctx.posOf`'s own object, which the motion phase mutates under you).
export function poseReader(): {
  adopt(frame: SimPoseFrame): void;
  pos(side: string): CombatPosYd | undefined;
  hpPct(side: string): number | undefined;
  facing(side: string): number | undefined;
  sides(): readonly string[];
} {
  let frame = emptyPoseFrame();
  let indexGen = -1;
  const index = new Map<string, number>();
  const out = new Map<string, { x: number; y: number; z?: number }>();
  const reindex = (): void => {
    if (indexGen === frame.gen) return;
    index.clear();
    for (let i = 0; i < frame.sides.length; i++) index.set(frame.sides[i]!, i);
    indexGen = frame.gen;
  };
  const at = (side: string): number => {
    reindex();
    const i = index.get(side);
    return i === undefined ? -1 : i * POSE_STRIDE;
  };
  return {
    adopt(next: SimPoseFrame): void {
      // `gen` counts per FRAME, so a rebind's fresh frame can carry a gen already indexed here.
      // Comparing across objects kept the previous fight's seats: pull 2 drew one body.
      if (next !== frame) indexGen = -1;
      frame = next;
    },
    pos(side: string): CombatPosYd | undefined {
      const o = at(side);
      if (o < 0) return undefined;
      const x = frame.buf[o]!;
      if (Number.isNaN(x)) return undefined;
      let obj = out.get(side);
      if (!obj) { obj = { x: 0, y: 0 }; out.set(side, obj); }
      obj.x = x;
      obj.y = frame.buf[o + 1]!;
      const z = frame.buf[o + 2]!;
      if (Number.isNaN(z)) delete obj.z;
      else obj.z = z;
      return obj;
    },
    hpPct(side: string): number | undefined {
      const o = at(side);
      if (o < 0) return undefined;
      const v = frame.buf[o + 3]!;
      return Number.isNaN(v) ? undefined : v;
    },
    facing(side: string): number | undefined {
      const o = at(side);
      if (o < 0) return undefined;
      const v = frame.buf[o + 4]!;
      return Number.isNaN(v) ? undefined : v;
    },
    sides(): readonly string[] {
      return frame.sides;
    },
  };
}
