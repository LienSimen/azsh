// Recoil SlowUpdate cursor (docs/perf/recoil-scale.md C2). Idle/ooc/leashed think every IDLE_RATE ticks;
// engaged every ENGAGED_RATE. GCD/swing landing this tick, or a live cast, always thinks.

import type { Fighter } from './types.ts';
import type { SpellDef } from '../../data/schema.ts';
import { isEnemySide } from '../core/events.ts';
import { fighterIsInCombat } from './combatFlag.ts';

/** 2 Hz at 10 Hz sim. Kept at 4× so the slice does not get denser with speed. */
export const SLOW_IDLE_RATE = 5;
/** 5 Hz at 10 Hz sim. */
export const SLOW_ENGAGED_RATE = 2;
// The pickAction backstop only, never the EventAI poll or the area-aura slice. It was 63% of every
// think in a 40-man fight; 8 is faster still and refused — it blinds a melee for 800 ms, visibly.
export const SLOW_DECIDE_RATE = 2;

export type SlowDiag = {
  pickThink: number;
  pickSkip: number;
  eventAiThink: number;
  eventAiSkip: number;
  areaAuraRadius: number;
  areaAuraSkip: number;
};

export function emptySlowDiag(): SlowDiag {
  return {
    pickThink: 0,
    pickSkip: 0,
    eventAiThink: 0,
    eventAiSkip: 0,
    areaAuraRadius: 0,
    areaAuraSkip: 0,
  };
}

// Stable bucket so the slice test is deterministic, memoized because the body allocates and a side's
// bucket never changes. Asked per engaged enemy, per area-aura holder and per steering unit, per tick.
const sideBucketCache = new Map<string, number>();
export function sideBucket(side: string): number {
  const hit = sideBucketCache.get(side);
  if (hit !== undefined) return hit;
  const v = computeSideBucket(side);
  if (sideBucketCache.size > 4096) sideBucketCache.clear();
  sideBucketCache.set(side, v);
  return v;
}
function computeSideBucket(side: string): number {
  if (side === 'player') return 0;
  if (side === 'pet') return 1;
  if (side === 'enemy') return 2;
  if (side.startsWith('ally_')) return 16 + ((Number(side.slice(5)) || 0) | 0);
  if (side.startsWith('enemy_')) return 64 + ((Number(side.slice(6)) || 0) | 0);
  let h = 0;
  for (let i = 0; i < side.length; i++) h = (Math.imul(h, 31) + side.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function timerLands(readyAt: number, t: number, tickMs: number): boolean {
  return t >= readyAt && t - tickMs < readyAt;
}

export type SlowThinkOpts = {
  side: string;
  t: number;
  tickMs: number;
  engaged: boolean;
  gcdUntil: number;
  swingReadyAt: number;
  ohSwingReadyAt: number;
  casting: boolean;
};

export function slowSliceDue(side: string, t: number, tickMs: number, rate: number): boolean {
  const step = Math.max(1, tickMs | 0);
  const tickIndex = Math.floor(t / step);
  const r = Math.max(1, rate | 0);
  return tickIndex % r === sideBucket(side) % r;
}

function lands(opts: SlowThinkOpts): boolean {
  if (opts.casting) return true;
  const { t, tickMs } = opts;
  return timerLands(opts.gcdUntil, t, tickMs)
    || timerLands(opts.swingReadyAt, t, tickMs)
    || timerLands(opts.ohSwingReadyAt, t, tickMs);
}

/** EventAI poll: land or this unit's slice. Timers are `t`-keyed, so a skip does not stall them. */
export function slowThinkDue(opts: SlowThinkOpts): boolean {
  if (lands(opts)) return true;
  return slowSliceDue(
    opts.side,
    opts.t,
    opts.tickMs,
    opts.engaged ? SLOW_ENGAGED_RATE : SLOW_IDLE_RATE,
  );
}

// Longest a decision may sleep past the backstop, in ticks: the precise bound covers timers a unit
// OWNS, this is insurance. 4, because at 8 the mage fixture kills 2 s faster on 9.8% less damage.
const DECIDE_SLEEP_CAP_TICKS = 4;

// Earliest instant a timer this unit OWNS can change what it may do: swings, cooldowns, next power
// quantum. Everything else has a dirty mark. Rage has no term — a hit landing or taken is covered.
function ownTimerWakeAt(f: Fighter, t: number, tickMs: number): number {
  let b = Number.POSITIVE_INFINITY;
  if (f.swingReadyAt > t && f.swingReadyAt < b) b = f.swingReadyAt;
  if (f.ohSwingReadyAt > t && f.ohSwingReadyAt < b) b = f.ohSwingReadyAt;
  for (const at of f.cooldowns.values()) if (at > t && at < b) b = at;
  for (const at of f.categoryCooldowns.values()) if (at > t && at < b) b = at;
  const pt = f.spec.powerType;
  if (f.power < f.spec.maxPower) {
    if (pt === 'energy') { const nx = t + 100; if (nx < b) b = nx; }
    else if (pt !== 'rage') { const nx = t + 1000; if (nx < b) b = nx; }
  }
  // Druid parallel mana pool: shifting out to heal is a decision this pool gates.
  if (f.maxMana > 0 && f.mana < f.maxMana) { const nx = t + 1000; if (nx < b) b = nx; }
  if (!Number.isFinite(b)) return b;
  const capAt = t + DECIDE_SLEEP_CAP_TICKS * Math.max(1, tickMs | 0);
  return b < capAt ? b : capAt;
}
export function nextDecideWakeAt(
  f: Fighter,
  t: number,
  tickMs: number,
  engaged: boolean,
): number {
  let w = f.gcdUntil;
  if (f.castingSpell && f.castFinishAt > 0 && f.castFinishAt < w) w = f.castFinishAt;
  if (f.channeling && f.channeling.endsAt < w) w = f.channeling.endsAt;
  if (w > t) return w;
  // A RELOCATING unit thinks again next tick: a move pick spends no GCD and starts no cast, so
  // nothing else wakes it. A fixture caster with a live run-out row was asked once in 120 ticks.
  if (f.pendingMechanicMove) return t + Math.max(1, tickMs | 0);
  if (!engaged) return Number.POSITIVE_INFINITY;
  const pollAt = t + SLOW_DECIDE_RATE * Math.max(1, tickMs | 0);
  // A live halt ends on an OUTSIDE fact, and `ownTimerWakeAt` knows only this unit's own cooldowns:
  // a raider with no kit returned Infinity and the halt had no clock at all. Poll while one is armed.
  if (f.haltDpsSchool !== undefined) return pollAt;
  // 63% of every think in a sustained 40-man fight was this poll firing on a unit whose own timers
  // said nothing could change yet: 42,156 polls, 63.6% of them able to sleep past 2 ticks.
  const own = ownTimerWakeAt(f, t, tickMs);
  return own > pollAt ? own : pollAt;
}

/** S2: think on the next tick. AttackStart / party combat-enter / CallAssistance. */
export function wakeForDecision(f: Fighter): void {
  f.decideDirty = true;
  f.nextWakeAt = 0;
}

// Hard CC does not force pick. CMaNGOS CanExecuteCombatAction is false (UnitAI.cpp:784; CanReactInCombat).
// Exception: auto-rescue items / a ready breaker.
export function hardCcMustDecide(
  f: Fighter,
  rescueItems: boolean,
  isBreaker: (s: SpellDef, u: Fighter) => boolean,
  onCooldown: (u: Fighter, s: SpellDef) => boolean,
  canAfford: (u: Fighter, s: SpellDef) => boolean,
): boolean {
  if (rescueItems) return true;
  for (const s of f.spec.spells) {
    if (isBreaker(s, f) && !onCooldown(f, s) && canAfford(f, s)) return true;
  }
  return false;
}

export function slowEngaged(
  f: Fighter,
  t: number,
  threatOf: (owner: Fighter) => { isEmpty(): boolean } | undefined,
): boolean {
  if (fighterIsInCombat(f, t)) return true;
  if (!isEnemySide(f.side)) return false;
  const tm = threatOf(f);
  return !!tm && !tm.isEmpty();
}
