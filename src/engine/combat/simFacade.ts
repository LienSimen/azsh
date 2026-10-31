// The read side of the tick seam (PERF-RUNSHEET S6). One `CombatSession`-shaped object in front of the
// real one, so `src/ui` keeps its 427 `session.*` call sites while each MEMBER moves to the snapshot,
// to a posted command or to a main-thread mirror, one at a time.

import type { CombatSession } from './session-types.ts';
import type { CombatPosYd } from './combatGeometry.ts';
import type { CombatantView } from './types.ts';
import type { CombatEvent, Side } from '../core/events.ts';
import { EVENT_TRIM_CHUNK, MAX_SESSION_EVENTS } from './sessionStepWrap.ts';
import {
  createPoseFiller, poseReader,
  type DiscreteSnapshot, type DiscreteWant, type PoseFiller, type SimPoseFrame,
} from './simSnapshot.ts';
import type { SimCommand } from './simPump.ts';
import { snapPosToMesh } from './snapToFloor.ts';
import type { PullGeometryAnchor } from './combatGeometry.ts';

// Pure reads memoized for one tick, no arguments. The rule the session already runs for the views:
// `enemiesView()` was asked 125x/s against 10 ticks, 8.9% of JS self time (sessionView.ts:305).
export const MEMO_READS_0: readonly string[] = [
  'abilities',
  'items',
  'companionPets',
  'totemsView',
  'trapsView',
  'missilesInFlight',
  'playerTargetId',
  'petBarState',
  'groundPools',
  'totemOwners',
  'hasFightListEnemy',
  'hasEngagedEnemy',
  'geometryAnchor',
  'navDiag',
  'slowDiag',
  'motionExplainAll',
  'motionClaimStats',
  'result',
];

/** The same, keyed on ONE argument — a side, a spell id, an owner. */
export const MEMO_READS_1: readonly string[] = [
  'allyAbilities',
  // `rotationSnapshot(side, foeSide?)`: the one-argument form memoizes, the pinned-foe form falls
  // through. Measured crossing on a live 40-man floor before this row existed.
  'rotationSnapshot',
  'unitItems',
  'targetOf',
  'allyTargetOf',
  'unitStanceOf',
  'unitCastOrderOf',
  'moveOrderOf',
  'moveIntentOf',
  'holdCourseOf',
  'manualMotionOf',
  'motionOwnerOf',
  'stepBackActive',
  'standShortYd',
  'unitRunSpeedYd',
  'unitBaseRunSpeedYd',
  'unitMounted',
  'unitLevelOf',
  'guidOfSide',
  'sideOfGuid',
  'queuedActionOf',
  'enemyThreatList',
  'enemyThreatVictim',
  'pullSpentSpellsFor',
  'pullSpentItemsFor',
  'auraCancelState',
  'cooldownRemainingMs',
  'categoryCooldownRemainingMs',
  'motionExplain',
];

// Answered from the tick snapshot. EXACT under `sameThreadPump` (invalidated by a tick and by every
// write); behind a Worker the same rule makes them one tick late, the policy decided 2026-09-01.
export const SNAPSHOT_READS: readonly string[] = [
  // The pose channel: a flat typed array, refilled per tick (simSnapshot.ts).
  'unitPosYd',
  'unitHpPct',
  't',
  'ended',
  'winner',
  // The DISCRETE channel: `CombatantView` objects, one build per tick. 92 of the 427 read sites in
  // src/ui ask for these, so the worker carries them rather than let the renderer rebuild them.
  'playerView',
  'enemyView',
  'petView',
  'alliesView',
  'enemiesView',
  'livingEnemiesView',
  'viewOfSide',
  // The ring. The batches already cross the seam, so the facade keeps its own copy rather than reach
  // for the session's array.
  'events',
  'eventsDropped',
  ...MEMO_READS_0,
  ...MEMO_READS_1,
];

// The runsheet's category 3: a SYNCHRONOUS answer inside a gesture, answered on THIS thread off data
// the renderer already holds. A drag that awaits a worker roundtrip is a different drag.
export const MIRRORED: readonly string[] = ['snapMoveDest'];

/** Still owed one. S6 is not done while this list is non-empty. */
export const NEEDS_MIRROR: readonly string[] = [
  // A WRITE whose boolean the caller branches on (`liveCockpitWalk.ts:823`), and the branch is exactly
  // one: `issued === 0 && owner === 'route'` at :851. That is "the claim went to someone else", which
  // `motionOwnerOf` already carries in the snapshot, so this needs a posted write plus that read.
  'pathTo',
  // The TWO-argument form only (`tacticalMobMenu.ts:103`): every ally's kit against an arbitrary mob is
  // combinatorial, so it cannot ride the snapshot. It opens a popup, so it can become async.
  'allyAbilities',
];

// Four of the runsheet's six category-3 members needed no mirror: `geometryAnchor`, `abilities`,
// `moveOrderOf` and 1-arg `allyAbilities` change only in a tick or a write, so the memo is exact.

export interface SimFacade {
  /** The object `src/ui` holds. Shaped like `CombatSession`, backed by the snapshot where it can be. */
  readonly session: CombatSession;
  // One drained batch: append it to the ring and mark the snapshot stale. Called by the step loop per
  // batch, in drain order, never per read.
  noteTick(batch: readonly CombatEvent[]): void;
  // Take a pose frame the SIM produced elsewhere: off-thread nothing here ticks, so the frame rides with
  // the batch. `seq` is the post it answers; a roster write made after it keeps the local copy in charge.
  adoptPoses(frame: SimPoseFrame, seq?: number): void;
  // Record that the writes made so far rode out on post `seq`. A reply to an earlier post cannot
  // reflect them, so the local copy answers until one that does arrives (read-after-write).
  notePosted(seq: number): void;
  // Tee every write to a sink as well as applying it here. Off-thread the sim is elsewhere, so an
  // order that only lands on this side reaches nothing — a controller's `injectEnemy` and
  // `seedEnemyThreat` went into a session nobody was ticking and the raid stood still.
  //
  // It still applies LOCALLY: the return value is the caller's contract (`setPlayerTarget` is
  // branched on, `injectAlly` hands back a seat), and this side keeps answering those. The worker's
  // copy is the authority for what the fight DOES. Arguments are cloned at the tee, so a caller that
  // reuses its position object cannot change an order after giving it.
  setCommandSink(sink: ((cmd: SimCommand) => void) | null): void;
  // The memo keys read since the last call, for the far side to answer next time; null when nothing
  // beyond the fixed tables was asked. Keys linger ~2 s so a once-a-second reader stays covered.
  takeWanted(): DiscreteWant | null;
  // Take the discrete half the SIM produced elsewhere. Held until the next one arrives, so the reads
  // it covers stop reaching for a live session that is not ticking on this side.
  adoptViews(snapshot: DiscreteSnapshot, seq?: number): void;
  // Take the clock and the outcome: off-thread the local session never advances and never ends, so
  // every cooldown, GCD and aura would read t=0 forever and the end card would never paint.
  adoptTime(now: number, ended?: boolean, winner?: Side | 'timeout' | null): void;
  // Distinct members that still reach the live session, with a call count each. Behind a Worker every
  // row here is either a mirror to write or a member to move into the payload.
  passthrough(): Record<string, number>;
  /** How many distinct members have crossed. Allocation-free, for a per-sync counter. */
  crossings(): number;
  // Distinct members whose per-tick memo was filled FROM the live session. Off-thread each is a field
  // the reply must carry, so this is the discrete channel's real size on a given floor.
  discreteReads(): string[];
  /** Re-point at the next fight (swapSession). */
  rebind(raw: CombatSession): void;
  // The sim came back to THIS thread mid-fight (the worker threw): drop everything adopted, the local
  // copy that mirrored every pose and hp is the fight again. Measured frozen at t=48800 without it.
  dropAdopted(): void;
  /** The live session underneath. A holder handed `session` needs it to rebind or to boot a pump. */
  raw(): CombatSession;
  // Run after every batch, on BOTH sides of the seam. A per-tick side effect written as a `tick`
  // wrapper only runs where the tick does, and off-thread that is not here.
  onBatch(fn: () => void): void;
}

// The handle, reachable from the session itself. The fight's CREATOR builds the facade so that every
// holder gets the same object — a controller writing to a raw session it kept its own reference to is
// what read `peak engaged 0` on a live raid (liveAggroStream.ts:1416 seedEnemyThreat).
const FACADE_KEY = Symbol.for('pc.simFacade');

/** The facade behind a session, or null when the caller was handed a bare one. */
export function facadeOf(s: CombatSession | null | undefined): SimFacade | null {
  const hit = (s as unknown as Record<symbol, unknown> | null | undefined)?.[FACADE_KEY];
  return (hit as SimFacade | undefined) ?? null;
}

/** The live session behind a facade, or the argument when it is already one. */
export function rawOf(s: CombatSession): CombatSession {
  return facadeOf(s)?.raw() ?? s;
}

// Reads refresh LAZILY: a tick or a write sets `dirty`, and the first read after that refills the pose
// frame and the scalars. One roster pass per read burst, against 33 `unitPosYd` and 28 `t` sites.
export function createSimFacade(raw0: CombatSession): SimFacade {
  let raw = raw0;
  const poses = poseReader();
  let filler: PoseFiller = createPoseFiller();
  let dirty = true;
  let t = raw.t;
  let ended = raw.ended;
  let winner = raw.winner;
  const seen: Record<string, number> = {};
  let crossed = 0;
  // Members served from a per-tick MEMO still read the live session to fill it. On this thread that is
  // free; off-thread there is nothing to read, so each one is a field the reply has to carry. The
  // crossing counter cannot see them — it counts pass-throughs — so they get their own set.
  const discrete = new Set<string>();
  // The ring, on THIS side of the seam. Off-thread the session's own array is unreachable, so the
  // facade keeps one and applies the same trim (sessionStepWrap.ts:84) to the batches it is handed.
  let events: CombatEvent[] = [...raw.events];
  let eventsDropped = raw.eventsDropped;
  // One wrapper per member, not one per read: a bind on every get is an allocation the 427 read sites
  // cannot afford on the stage whose whole point is CPU.
  const wrapped = new Map<string, (...a: unknown[]) => unknown>();
  const batchHooks: (() => void)[] = [];

  // The discrete channel. `undefined` means "not asked yet this tick"; `null` is a real answer from
  // `petView` / `viewOfSide`, so the two cannot share a sentinel.
  let vPlayer: CombatantView | undefined;
  let vEnemy: CombatantView | undefined;
  let vPet: CombatantView | null | undefined;
  let vAllies: CombatantView[] | undefined;
  let vEnemies: CombatantView[] | undefined;
  let vLiving: CombatantView[] | undefined;
  const vSide = new Map<string, CombatantView | null>();
  // `memo0` is one answer per member, `memo1` one per (member, first arg). `MISS` exists because both
  // `undefined` and `null` are real answers — `unitLevelOf` returns one, `targetOf` the other.
  const MISS = Symbol('miss');
  const memo0 = new Map<string, unknown>();
  const memo1 = new Map<string, Map<unknown, unknown>>();

  // Set once a frame has been handed in from outside; the facade then stops pulling its own.
  let posesAdopted = false;
  /** The sim's clock when it runs elsewhere; null while this side still owns a live session. */
  let adoptedT: number | null = null;
  let adoptedEnded: boolean | null = null;
  let adoptedWinner: Side | 'timeout' | null = null;
  // Read-after-write on the roster: a write that changes WHO fights is applied here now and reaches the
  // far side next post, so until a reply to that post arrives the adopted halves predate it.
  const ROSTER_WRITE = /^(inject|disengage|release|stamp|revive|restore|unsummon|remove|seed)/;
  let rosterGen = 0;
  const postedGen = new Map<number, number>();
  let posesStale = false;
  let viewsStale = false;
  const caughtUp = (seq: number | undefined): boolean => {
    if (seq === undefined) return true;
    const gen = postedGen.get(seq);
    // Strictly older: the poses and the views of one reply both ask about the same seq.
    for (const k of postedGen.keys()) if (k < seq) postedGen.delete(k);
    return gen === rosterGen;
  };
  let commandSink: ((cmd: SimCommand) => void) | null = null;
  // Demand for the discrete channel: key -> the `takeWanted` call it was last read in.
  const want0 = new Map<string, number>();
  const want1 = new Map<string, Map<unknown, number>>();
  let wantGen = 0;
  /** Calls a key survives after its last read: ~2 s at the 10 Hz DOM rate. */
  const WANT_LINGER = 20;
  // One key rule for both fills: the far side answers per-argument under `String(arg)`, so a spell id
  // asked as a number has to find the row a string key seeded.
  const key1 = (a: unknown): unknown => (typeof a === 'string' ? a : String(a));
  /** The last discrete half handed in, or null while this side still owns a live session. */
  let adopted: DiscreteSnapshot | null = null;

  const refresh = (): void => {
    // Every holder reads through this now, and not all of them tick through the pump: `liveFightSession`
    // is stepped directly by outdoor autofight. A moved `t` is a tick nobody announced. Inert
    // off-thread, where the local session never advances and `adoptPoses` owns the invalidation.
    // `ended` too, not only `t`: the tick that ENDS a fight finalizes and returns BEFORE the clock
    // advances (stepSession.ts finalize), so the kill is the one tick `t` cannot see.
    if (!dirty && !posesAdopted && (raw.t !== t || raw.ended !== ended)) dirty = true;
    if (!dirty) return;
    dirty = false;
    // Once a far frame is adopted the far side is the only pose source: reading the local copy in a
    // roster-write window swung every chip between two floors (smoke/farFrameIsTheFloor.mjs).
    if (!posesAdopted && raw.poseFrame) poses.adopt(raw.poseFrame(filler));
    t = adoptedT ?? raw.t;
    ended = adoptedEnded ?? raw.ended;
    // The far side's verdict wins: `raw.winner` alone is null for the whole fight off-thread.
    winner = adoptedWinner ?? raw.winner;
    vPlayer = undefined;
    vEnemy = undefined;
    vPet = undefined;
    vAllies = undefined;
    vEnemies = undefined;
    vLiving = undefined;
    if (vSide.size > 0) vSide.clear();
    if (memo0.size > 0) memo0.clear();
    if (memo1.size > 0) memo1.clear();
    // Same rule for the discrete half: the last far snapshot, never a copy that laid no trap and took
    // no hit since init. `viewsStale` still refuses a pre-write far snapshot in adoptViews.
    if (adopted) seedFromAdopted();
  };

  // The adopted half IS the answer for everything it covers: seed the same memos a live read would
  // have filled, so every reader below is unchanged whether the sim is here or on another thread.
  const seedFromAdopted = (): void => {
    const snap = adopted;
    if (!snap) return;
    const z = snap.zero;
    if ('playerView' in z) vPlayer = z.playerView as CombatantView;
    if ('enemyView' in z) vEnemy = z.enemyView as CombatantView;
    if ('petView' in z) vPet = z.petView as CombatantView | null;
    if ('alliesView' in z) vAllies = z.alliesView as CombatantView[];
    if ('enemiesView' in z) vEnemies = z.enemiesView as CombatantView[];
    if ('livingEnemiesView' in z) vLiving = z.livingEnemiesView as CombatantView[];
    for (const [name, value] of Object.entries(z)) {
      if (MEMO0.has(name)) memo0.set(name, value === undefined ? MISS : value);
    }
    // `result` is the fight's VERDICT, not a per-tick view. `ended` rides on EVERY reply but `views`
    // only on the ones that asked, so the killing tick often carries no snapshot and this re-seeds a
    // pre-kill `result` that still says `timeout` — outranking the winner just mirrored in, which is
    // what `settleFight` reads for xp, loot and kill credit.
    if (adoptedWinner != null) {
      const seeded = memo0.get('result');
      if (seeded !== undefined && seeded !== MISS) {
        const r = seeded as { winner: Side | 'timeout' };
        if (r.winner !== adoptedWinner) memo0.set('result', { ...r, winner: adoptedWinner });
      }
    }
    for (const [name, perSide] of Object.entries(snap.bySide)) {
      if (name === 'viewOfSide') {
        for (const [side, v] of Object.entries(perSide)) {
          vSide.set(side, (v ?? null) as CombatantView | null);
        }
        continue;
      }
      if (!MEMO1.has(name)) continue;
      const per = new Map<unknown, unknown>();
      for (const [side, v] of Object.entries(perSide)) per.set(side, v === undefined ? MISS : v);
      // An arg the far side was asked for and answered `undefined` is still an answer.
      memo1.set(name, per);
    }
  };

  // A member that WRITES: here it only invalidates. Prefix-matched because a list of 30-odd setters
  // goes stale the first time one is added, and a read caught by it costs one extra refresh.
  const WRITE_PREFIX = /^(set|queue|inject|disengage|release|revive|restore|arm|note|consume|remove|seed|stamp|unsummon|apply|use|forfeit|path|run)/;
  const MEMO0 = new Set(MEMO_READS_0);
  const MEMO1 = new Set(MEMO_READS_1);

  const over: Partial<Record<string, unknown>> = {
    unitPosYd: (side: string): CombatPosYd | undefined => { refresh(); return poses.pos(side); },
    // The main-thread mirror. `snapPosToMesh` is the session's own snap (snapToFloor.ts), asked with the
    // anchor off the snapshot, so a floor click answers inside the gesture with no roundtrip.
    snapMoveDest: (
      pos: CombatPosYd,
      radiusYd?: number,
      refZ?: number | null,
    ): CombatPosYd | null => {
      refresh();
      const anchor = raw.geometryAnchor() as PullGeometryAnchor | undefined;
      return snapPosToMesh(anchor, pos, radiusYd ?? 8, refZ);
    },
    unitHpPct: (side: string): number | undefined => { refresh(); return poses.hpPct(side); },
    playerView: (): CombatantView => {
      refresh();
      if (vPlayer === undefined) { discrete.add('playerView'); vPlayer = raw.playerView(); }
      return vPlayer;
    },
    enemyView: (): CombatantView => {
      refresh();
      if (vEnemy === undefined) { discrete.add('enemyView'); vEnemy = raw.enemyView(); }
      return vEnemy;
    },
    petView: (): CombatantView | null => {
      refresh();
      if (vPet === undefined) { discrete.add('petView'); vPet = raw.petView(); }
      return vPet;
    },
    alliesView: (): CombatantView[] => {
      refresh();
      if (vAllies === undefined) { discrete.add('alliesView'); vAllies = raw.alliesView(); }
      return vAllies;
    },
    enemiesView: (): CombatantView[] => {
      refresh();
      if (vEnemies === undefined) { discrete.add('enemiesView'); vEnemies = raw.enemiesView(); }
      return vEnemies;
    },
    livingEnemiesView: (): CombatantView[] => {
      refresh();
      if (vLiving === undefined) { discrete.add('livingEnemiesView'); vLiving = raw.livingEnemiesView(); }
      return vLiving;
    },
    viewOfSide: (side: string): CombatantView | null => {
      refresh();
      let hit = vSide.get(side);
      if (hit === undefined) {
        discrete.add('viewOfSide');
        hit = raw.viewOfSide?.(side) ?? null;
        vSide.set(side, hit);
      }
      return hit;
    },
  };

  const session = new Proxy({} as CombatSession, {
    get(_t, k) {
      if (typeof k !== 'string') {
        if (k === FACADE_KEY) return handle;
        const v = (raw as unknown as Record<string | symbol, unknown>)[k];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(raw) : v;
      }
      if (k === 'events') return events;
      if (k === 'eventsDropped') return eventsDropped;
      if (k === 't') { refresh(); return t; }
      if (k === 'ended') { refresh(); return ended; }
      if (k === 'winner') { refresh(); return winner; }
      const v = (raw as unknown as Record<string, unknown>)[k];
      // An override only stands in for a member the fight HAS: `viewOfSide` is optional and callers
      // guard on `typeof`, so answering for a stub would make it look like a geometry session.
      const hit = over[k];
      if (hit && v !== undefined) return hit;
      if (typeof v !== 'function') {
        // An ABSENT optional member is not a crossing. Counting it read `hasEngagedEnemy` and
        // `hasFightListEnemy` as seam traffic on a live floor when the session simply lacks them.
        if (v !== undefined) {
          if (seen[k] === undefined) crossed++;
          seen[k] = (seen[k] ?? 0) + 1;
        }
        return v;
      }
      const cached = wrapped.get(k);
      if (cached) return cached;
      const fn = v as (...a: unknown[]) => unknown;
      if (MEMO0.has(k)) {
        const memoed = (): unknown => {
          refresh();
          want0.set(k, wantGen);
          let hit = memo0.get(k);
          if (hit === undefined) {
            discrete.add(k);
            hit = fn.call(raw);
            memo0.set(k, hit === undefined ? MISS : hit);
          }
          return hit === MISS ? undefined : hit;
        };
        wrapped.set(k, memoed);
        return memoed;
      }
      if (MEMO1.has(k)) {
        const memoed = (a0?: unknown, ...rest: unknown[]): unknown => {
          refresh();
          // A second argument is outside the key, so only the one-argument form may be memoized.
          if (rest.length > 0) return fn.call(raw, a0, ...rest);
          let w = want1.get(k);
          if (!w) { w = new Map(); want1.set(k, w); }
          w.set(a0, wantGen);
          let per = memo1.get(k);
          if (!per) { per = new Map(); memo1.set(k, per); }
          const kk = key1(a0);
          let hit = per.get(kk);
          if (hit === undefined) {
            discrete.add(k);
            hit = fn.call(raw, a0);
            per.set(kk, hit === undefined ? MISS : hit);
          }
          return hit === MISS ? undefined : hit;
        };
        wrapped.set(k, memoed);
        return memoed;
      }
      const writes = WRITE_PREFIX.test(k);
      const wrap = (...a: unknown[]): unknown => {
        if (seen[k] === undefined) crossed++;
        seen[k] = (seen[k] ?? 0) + 1;
        const out = fn.apply(raw, a);
        // Apply first, tee second: a seat allocation's answer rides with the command so the far side
        // takes the same name. The sink is what reaches the sim when it lives elsewhere.
        if (writes && commandSink) commandSink(commandOf(k, a, out));
        // A write may have moved a body or ended the fight outside a tick (`setUnitPosYd`, `forfeit`).
        if (writes) {
          dirty = true;
          if (posesAdopted && ROSTER_WRITE.test(k)) {
            rosterGen++;
            posesStale = true;
            viewsStale = true;
          }
        }
        return out;
      };
      wrapped.set(k, wrap);
      return wrap;
    },
    has: (_t, k) => k === 't' || k === 'ended' || k === 'winner' || k in over
      || k in (raw as unknown as object),
    set(_t, k, val) {
      (raw as unknown as Record<string | symbol, unknown>)[k] = val;
      dirty = true;
      return true;
    },
  });

  const handle: SimFacade = {
    session,
    adoptPoses(frame: SimPoseFrame, seq?: number): void {
      posesAdopted = true;
      if (caughtUp(seq)) posesStale = false;
      // A frame from before a roster write is not adopted: it would put a corpse back on a unit this
      // side just revived, and the facade would read it back for a tick.
      if (posesStale) return;
      poses.adopt(frame);
      dirty = true;
      // The local copy learns where everyone stands and who is dead, so the answers it gives to
      // `reviveUnit`, `seedEnemyThreat` and `pathTo` are the far side's answers one tick late.
      raw.mirrorPoseFrame?.(frame);
    },
    notePosted(seq: number): void {
      if (seq > 0) postedGen.set(seq, rosterGen);
    },
    dropAdopted(): void {
      posesAdopted = false;
      adoptedT = null;
      adoptedEnded = null;
      adoptedWinner = null;
      adopted = null;
      posesStale = false;
      viewsStale = false;
      postedGen.clear();
      dirty = true;
    },
    setCommandSink(sink: ((cmd: SimCommand) => void) | null): void {
      commandSink = sink;
    },
    takeWanted(): DiscreteWant | null {
      const gen = wantGen++;
      const zero: string[] = [];
      for (const [k, at] of want0) {
        if (gen - at > WANT_LINGER) want0.delete(k);
        else zero.push(k);
      }
      const one: Record<string, unknown[]> = {};
      let any = zero.length > 0;
      for (const [k, per] of want1) {
        const args: unknown[] = [];
        for (const [a, at] of per) {
          if (gen - at > WANT_LINGER) per.delete(a);
          else args.push(a);
        }
        if (per.size === 0) want1.delete(k);
        if (args.length) { one[k] = args; any = true; }
      }
      return any ? { zero, one } : null;
    },
    adoptTime(now: number, isEnded?: boolean, who?: Side | 'timeout' | null): void {
      adoptedT = now;
      if (isEnded !== undefined) adoptedEnded = isEnded;
      if (who != null) adoptedWinner = who;
      dirty = true;
      // Into the local copy too, not only the facade's own getter: `result()` is a plain crossing and
      // `settleFight` reads ITS winner for xp, loot and kill credit.
      // `isEnded` is a boolean on every reply, so testing "defined" fired this per tick. Only an END
      // or a verdict has anything to mirror.
      if (isEnded === true || who != null) raw.mirrorOutcome?.(isEnded === true, who ?? null);
    },
    adoptViews(snapshot: DiscreteSnapshot, seq?: number): void {
      if (caughtUp(seq)) viewsStale = false;
      if (viewsStale) return;
      adopted = snapshot;
      dirty = true;
    },
    onBatch(fn: () => void): void {
      batchHooks.push(fn);
    },
    noteTick(batch: readonly CombatEvent[]): void {
      dirty = true;
      // Before the early return: a tick that produced no events still moved the fight.
      for (const fn of batchHooks) fn();
      if (batch.length === 0) return;
      for (const ev of batch) events.push(ev);
      // Same rule, same constants: trim AFTER the batch is appended, never per push.
      if (events.length > MAX_SESSION_EVENTS) {
        events.splice(0, EVENT_TRIM_CHUNK);
        eventsDropped += EVENT_TRIM_CHUNK;
      }
    },
    passthrough(): Record<string, number> {
      return { ...seen };
    },
    crossings(): number {
      return crossed;
    },
    discreteReads(): string[] {
      return [...discrete].sort();
    },
    raw(): CombatSession {
      return raw;
    },
    rebind(nextRaw: CombatSession): void {
      raw = nextRaw;
      posesAdopted = false;
      adoptedT = null;
      adoptedEnded = null;
      adoptedWinner = null;
      adopted = null;
      posesStale = false;
      viewsStale = false;
      postedGen.clear();
      commandSink = null;
      events = [...raw.events];
      eventsDropped = raw.eventsDropped;
      wrapped.clear();
      filler = createPoseFiller();
      poses.adopt(filler.frame);
      dirty = true;
      for (const k of Object.keys(seen)) delete seen[k];
      crossed = 0;
      discrete.clear();
      want0.clear();
      want1.clear();
    },
  };
  return handle;
}

// A write in the shape it crosses the seam, cloned NOW because the caller may mutate its argument
// before the frame ends. A failed clone rides as an error, so the far side fails loudly, not silently.
function commandOf(m: string, a: unknown[], out: unknown): SimCommand {
  const r = m.startsWith('inject') && typeof out === 'string' ? { r: out } : {};
  try {
    return { m, a: structuredClone(a), ...r };
  } catch (e) {
    return { m, a: [], err: String((e as Error)?.message ?? e).slice(0, 120) };
  }
}
