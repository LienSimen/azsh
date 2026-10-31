// Environmental hazards — breath, fatigue and lava as pure MirrorTimer-style timers, ported from
// Player MirrorTimer and EnvironmentalDamage. Zone wet and lava flags are authoring, never invented.

// Sourced constants (World.cpp defaults — must match exactly)

/** MirrorTimer.Breath.Max — bar duration (seconds → ms). */
export const BREATH_MAX_MS = 60 * 1000;

/** MirrorTimer.Fatigue.Max — bar duration (seconds → ms). */
export const FATIGUE_MAX_MS = 60 * 1000;

// MirrorTimer.Environmental.Max — grace before first lava pulse (seconds → ms). Cite: World.cpp
// CONFIG_UINT32_MIRRORTIMER_ENVIRONMENTAL_MAX = 1.
export const ENVIRONMENTAL_MAX_MS = 1 * 1000;

/** Post-expiry damage cadence. Cite: MirrorTimer::Start pulse interval = 2 * IN_MILLISECONDS. */
export const PULSE_INTERVAL_MS = 2 * 1000;

/** Drain rate while inside hazard. Cite: SetEnvironmentFlags scale −1. */
export const DRAIN_SCALE = -1;

// Regen rate when leaving hazard (10× real time). Cite: SetEnvironmentFlags leave → scale +10; 60s bar
// refills in 6s.
export const REGEN_SCALE = 10;

/** EnvironmentalDamage.Min — lava pulse band low. Cite: World.cpp 605. */
export const LAVA_DAMAGE_MIN = 605;

/** EnvironmentalDamage.Max — lava pulse band high. Cite: World.cpp 610. */
export const LAVA_DAMAGE_MAX = 610;

// Types

/** Hazard liquid / terrain flags (authoring substitute for 3D liquid status). */
export interface HazardFlags {
  /** Fully submerged → breath timer. Cite: ENVIRONMENT_FLAG_UNDERWATER. */
  underwater?: boolean;
  /** Standing in magma → environmental (lava) timer. Cite: ENVIRONMENT_FLAG_IN_MAGMA. */
  magma?: boolean;
  /** Deep-sea / open ocean → fatigue timer. Cite: ENVIRONMENT_FLAG_HIGH_SEA / IsInHighSea(). */
  highSea?: boolean;
  // GAP: slime (ENVIRONMENT_FLAG_IN_SLIME) exists in CMaNGOS but damage is commented out pending Undercity
  // exclusion — do not enable here.
}

export type HazardDamageKind = 'drowning' | 'exhausted' | 'lava';

export interface HazardDamageEvent {
  kind: HazardDamageKind;
  /** Final damage after optional fire mitigation (lava). Unmitigated for drown/fatigue. */
  amount: number;
  /** Pre-mitigation roll for lava; omitted for drown/fatigue. */
  rawAmount?: number;
}

// One MirrorTimer channel (breath | fatigue | environmental). remainingMs counts down under drain and up
// under regen.
export interface MirrorTimerState {
  /** Remaining bar ms; 0 means empty / in post-expiry pulse mode. */
  remainingMs: number;
  /** Max bar duration for this arming (breath may be scaled by water-breathing). */
  maxMs: number;
  /** −1 = draining, +10 = regenerating, 0 = idle/frozen. Cite: MirrorTimer m_scale; SetScale(0) freezes. */
  scale: number;
  // True after the bar first empties while draining — enables pulse cadence. Cleared when regenerating or
  // disarmed.
  expired: boolean;
  // Accumulator toward next post-expiry pulse (ms). First pulse is immediate on expire; subsequent wait
  // PULSE_INTERVAL_MS.
  pulseAccumMs: number;
  /** Whether this timer is armed (activation predicate true or still regenerating). */
  active: boolean;
}

export interface HazardState {
  breath: MirrorTimerState;
  fatigue: MirrorTimerState;
  environmental: MirrorTimerState;
  flags: HazardFlags;
  // Water-breathing interval multiplier: 0 is unlimited, so breath never arms, and above 0 it scales
  // the max duration. Cite: GetWaterBreathingInterval = Breath.Max * 1000 * multiplier.
  breathingMultiplier: number;
}

export interface HazardTickCtx {
  maxHp: number;
  level: number;
  /** Injected RNG — uses int(min, max) inclusive like urand. */
  rng: { int(minIncl: number, maxIncl: number): number };
  // Optional fire-school mitigation for lava. The domain stays free of the full combat graph, so
  // game.ts wires mitigation in. Cite: EnvironmentalDamage DAMAGE_LAVA.
  mitigateFire?: (rawDamage: number) => number;
}

export interface HazardTickResult {
  state: HazardState;
  damageEvents: HazardDamageEvent[];
}

// Factories

function makeTimer(maxMs: number): MirrorTimerState {
  return {
    remainingMs: maxMs,
    maxMs,
    scale: 0,
    expired: false,
    pulseAccumMs: 0,
    active: false,
  };
}

/** Fresh hazard state — all timers idle, no flags, normal breath (mult 1). */
export function createHazardState(): HazardState {
  return {
    breath: makeTimer(BREATH_MAX_MS),
    fatigue: makeTimer(FATIGUE_MAX_MS),
    environmental: makeTimer(ENVIRONMENTAL_MAX_MS),
    flags: {},
    breathingMultiplier: 1,
  };
}

// Effective breath max duration from water-breathing multiplier. Cite: GetWaterBreathingInterval =
// Breath.Max * 1000 * m_environmentBreathingMultiplier. Multiplier 0 → 0 (unlimited / never arm).
export function breathMaxMs(breathingMultiplier: number): number {
  if (breathingMultiplier <= 0) return 0;
  return Math.floor(BREATH_MAX_MS * breathingMultiplier);
}

// Environment / water-breathing

// Apply environment flags and re-sync timer scales. Enter hazard → scale −1 (drain); leave → scale +10
// (regen) if bar not full; water-breathing mult 0 disarms breath entirely.
export function setEnvironment(state: HazardState, flags: HazardFlags): HazardState {
  return syncTimers({ ...state, flags: { ...flags } });
}

// Set water-breathing multiplier (0 = unlimited suppress). Re-scales a live breath bar max when mult > 0;
// disarms when mult === 0.
export function setBreathingMultiplier(
  state: HazardState,
  breathingMultiplier: number,
): HazardState {
  const mult = breathingMultiplier < 0 ? 0 : breathingMultiplier;
  return syncTimers({ ...state, breathingMultiplier: mult });
}

function syncTimers(state: HazardState): HazardState {
  return {
    ...state,
    breath: syncBreath(state.breath, state.flags, state.breathingMultiplier),
    fatigue: syncFatigue(state.fatigue, state.flags),
    environmental: syncEnvironmental(state.environmental, state.flags),
  };
}

function syncBreath(
  t: MirrorTimerState,
  flags: HazardFlags,
  breathingMultiplier: number,
): MirrorTimerState {
  // Unlimited water breathing: never arm / stop breath.
  // Cite: CheckMirrorTimerActivation BREATH requires GetWaterBreathingInterval() ≠ 0.
  if (breathingMultiplier <= 0) {
    return {
      ...makeTimer(BREATH_MAX_MS),
      remainingMs: BREATH_MAX_MS,
      maxMs: BREATH_MAX_MS,
      active: false,
      scale: 0,
      expired: false,
      pulseAccumMs: 0,
    };
  }

  const maxMs = breathMaxMs(breathingMultiplier);
  const underwater = !!flags.underwater;

  if (underwater) {
    // Arm or re-arm drain. If already draining with same max, keep progress.
    const keepProgress = t.active && t.scale < 0 && t.maxMs === maxMs;
    return {
      remainingMs: keepProgress ? t.remainingMs : (t.active && t.maxMs === maxMs ? t.remainingMs : maxMs),
      maxMs,
      scale: DRAIN_SCALE,
      expired: keepProgress ? t.expired : false,
      pulseAccumMs: keepProgress ? t.pulseAccumMs : 0,
      active: true,
    };
  }

  // Surface: regenerate at ×10 if not already full; else idle.
  if (t.active && t.remainingMs < maxMs) {
    return {
      ...t,
      maxMs,
      scale: REGEN_SCALE,
      expired: false,
      pulseAccumMs: 0,
      active: true,
    };
  }

  // Full or never armed.
  return {
    remainingMs: maxMs,
    maxMs,
    scale: 0,
    expired: false,
    pulseAccumMs: 0,
    active: false,
  };
}

function syncFatigue(t: MirrorTimerState, flags: HazardFlags): MirrorTimerState {
  const highSea = !!flags.highSea;

  if (highSea) {
    const keepProgress = t.active && t.scale < 0;
    return {
      remainingMs: keepProgress ? t.remainingMs : FATIGUE_MAX_MS,
      maxMs: FATIGUE_MAX_MS,
      scale: DRAIN_SCALE,
      expired: keepProgress ? t.expired : false,
      pulseAccumMs: keepProgress ? t.pulseAccumMs : 0,
      active: true,
    };
  }

  if (t.active && t.remainingMs < FATIGUE_MAX_MS) {
    return {
      ...t,
      maxMs: FATIGUE_MAX_MS,
      scale: REGEN_SCALE,
      expired: false,
      pulseAccumMs: 0,
      active: true,
    };
  }

  return {
    remainingMs: FATIGUE_MAX_MS,
    maxMs: FATIGUE_MAX_MS,
    scale: 0,
    expired: false,
    pulseAccumMs: 0,
    active: false,
  };
}

function syncEnvironmental(t: MirrorTimerState, flags: HazardFlags): MirrorTimerState {
  const magma = !!flags.magma;

  if (magma) {
    const keepProgress = t.active && t.scale < 0;
    return {
      remainingMs: keepProgress ? t.remainingMs : ENVIRONMENTAL_MAX_MS,
      maxMs: ENVIRONMENTAL_MAX_MS,
      scale: DRAIN_SCALE,
      expired: keepProgress ? t.expired : false,
      pulseAccumMs: keepProgress ? t.pulseAccumMs : 0,
      active: true,
    };
  }

  // Leave magma: stop (no client bar; no regen UX for 1s grace timer).
  return {
    remainingMs: ENVIRONMENTAL_MAX_MS,
    maxMs: ENVIRONMENTAL_MAX_MS,
    scale: 0,
    expired: false,
    pulseAccumMs: 0,
    active: false,
  };
}

// Damage formulas (sourced)

// Drown or fatigue pulse damage: max health / 5 plus urand(0, level - 1). Unmitigated, since
// EnvironmentalDamage skips school resistance for drowning and exhaustion.
export function drownOrFatigueDamage(
  maxHp: number,
  level: number,
  rng: { int(minIncl: number, maxIncl: number): number },
): number {
  const base = Math.floor(maxHp / 5);
  const levelHi = Math.max(0, Math.floor(level) - 1);
  const roll = levelHi <= 0 ? rng.int(0, 0) : rng.int(0, levelHi);
  return base + roll;
}

// Lava pulse: urand(605, 610), optionally fire-school mitigated. Cite: OnMirrorTimerExpirationPulse
// IsInMagma; EnvironmentalDamage applies the fire absorb and resist.
export function lavaDamage(
  rng: { int(minIncl: number, maxIncl: number): number },
  mitigateFire?: (raw: number) => number,
): { amount: number; rawAmount: number } {
  const rawAmount = rng.int(LAVA_DAMAGE_MIN, LAVA_DAMAGE_MAX);
  const amount = mitigateFire ? mitigateFire(rawAmount) : rawAmount;
  return { amount, rawAmount };
}

// Tick

// Advance all mirror timers by dtMs under current flags / scales. Emits damage events only while the
// corresponding hazard flag is still active (never when no flags — "no surprise deaths").
export function tick(
  state: HazardState,
  dtMs: number,
  ctx: HazardTickCtx,
): HazardTickResult {
  // Ensure scales match flags (idempotent if setEnvironment was already called).
  let s = syncTimers(state);
  const damageEvents: HazardDamageEvent[] = [];

  if (dtMs <= 0) {
    return { state: s, damageEvents };
  }

  const breathResult = advanceTimer(s.breath, dtMs, !!s.flags.underwater && s.breathingMultiplier > 0);
  s = { ...s, breath: breathResult.timer };
  for (let i = 0; i < breathResult.pulses; i++) {
    damageEvents.push({
      kind: 'drowning',
      amount: drownOrFatigueDamage(ctx.maxHp, ctx.level, ctx.rng),
    });
  }

  const fatigueResult = advanceTimer(s.fatigue, dtMs, !!s.flags.highSea);
  s = { ...s, fatigue: fatigueResult.timer };
  for (let i = 0; i < fatigueResult.pulses; i++) {
    damageEvents.push({
      kind: 'exhausted',
      amount: drownOrFatigueDamage(ctx.maxHp, ctx.level, ctx.rng),
    });
  }

  const envResult = advanceTimer(s.environmental, dtMs, !!s.flags.magma);
  s = { ...s, environmental: envResult.timer };
  for (let i = 0; i < envResult.pulses; i++) {
    const { amount, rawAmount } = lavaDamage(ctx.rng, ctx.mitigateFire);
    damageEvents.push({ kind: 'lava', amount, rawAmount });
  }

  // Idle fully-regenerated timers.
  s = syncTimers(s);

  return { state: s, damageEvents };
}

// Advance one timer. `canPulse` is true only while the activation flag is on (and water-breathing allows
// breath). Regen path never pulses.
function advanceTimer(
  timer: MirrorTimerState,
  dtMs: number,
  canPulse: boolean,
): { timer: MirrorTimerState; pulses: number } {
  if (!timer.active || timer.scale === 0 || dtMs <= 0) {
    return { timer, pulses: 0 };
  }

  let remainingMs = timer.remainingMs;
  let expired = timer.expired;
  let pulseAccumMs = timer.pulseAccumMs;
  let scale = timer.scale;
  // Explicit boolean: after `if (!timer.active) return`, TS narrows active to true.
  let active: boolean = timer.active;
  let pulses = 0;
  let left = dtMs;

  const absScale = Math.abs(scale);

  if (scale > 0) {
    // Regenerating: remaining increases at scale × real time; no damage.
    const gain = left * absScale;
    remainingMs = Math.min(timer.maxMs, remainingMs + gain);
    expired = false;
    pulseAccumMs = 0;
    if (remainingMs >= timer.maxMs) {
      remainingMs = timer.maxMs;
      scale = 0;
      active = false;
    }
    return {
      timer: {
        ...timer,
        remainingMs,
        scale,
        expired,
        pulseAccumMs,
        active,
      },
      pulses: 0,
    };
  }

  // Draining (scale < 0). Cite: Update(diff) multiplies diff by abs(m_scale).
  // With |scale|=1 this is 1:1 real time.
  while (left > 0 && active && scale < 0) {
    if (!expired && remainingMs > 0) {
      const drain = left * absScale;
      if (drain < remainingMs) {
        remainingMs -= drain;
        left = 0;
        break;
      }
      // Bar empties: consume time proportional to remaining.
      const timeToEmpty = remainingMs / absScale;
      left -= timeToEmpty;
      remainingMs = 0;
      expired = true;
      pulseAccumMs = 0;
      // Instant pulse on expiration (MirrorTimer::Update returns false immediately).
      if (canPulse) pulses += 1;
      // Subsequent pulses gated by 2s pulse timer — continue loop with leftover dt.
      continue;
    }

    // Expired: pulse every PULSE_INTERVAL_MS while still in hazard.
    if (expired) {
      if (!canPulse) {
        // Flag cleared mid-tick — stop pulsing (setEnvironment handles regen).
        break;
      }
      const need = PULSE_INTERVAL_MS - pulseAccumMs;
      if (left < need) {
        pulseAccumMs += left;
        left = 0;
        break;
      }
      left -= need;
      pulseAccumMs = 0;
      pulses += 1;
      continue;
    }

    break;
  }

  return {
    timer: {
      ...timer,
      remainingMs,
      scale,
      expired,
      pulseAccumMs,
      active,
    },
    pulses,
  };
}

// Helpers for callers / tests

/** True when any hazard flag is set. */
export function hasAnyHazardFlag(flags: HazardFlags): boolean {
  return !!(flags.underwater || flags.magma || flags.highSea);
}
