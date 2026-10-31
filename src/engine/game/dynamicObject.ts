// DynamicObject / ground-pool model for SPELL_EFFECT_PERSISTENT_AREA_AURA. Combat still pulses the
// snapshot damage; this module owns membership and lifetime. Cite: SpellEffects.cpp EffectPersistentAA.

import type { School, SpellDef, SpellEffect } from '../../data/schema.ts';
import type { Side } from '../core/events.ts';
import {
  SPELL_EFFECT_ADD_FARSIGHT,
  SPELL_EFFECT_PERSISTENT_AREA_AURA,
} from '../spells/interpreter/opcodes.ts';

/** Planar yards snapshot for a fixed DynamicObject origin (cast-time position). */
export interface GroundPoolOrigin {
  x: number;
  y: number;
  z?: number;
}

/** Session-owned lingering ground effect (DynamicObject area spell). */
export interface GroundPool {
  /** Session-local id (monotonic); not a world GUID. */
  id: number;
  spellId: number;
  name: string;
  source: Side;
  school: School;
  /** Snapshot damage range per pulse (post SP/talent at cast). */
  min: number;
  max: number;
  // Yards from SpellRadius.dbc / effect.radius when known. combat.ts filters pulse targets by this when
  // unit positions exist.
  radius?: number;
  // Fixed cast-time origin in yards: a ground target for Blizzard, the caster's feet for a PBAoE.
  // Absent, combat falls back to the live caster position. Cite: SpellEffects.cpp EffectPersistentAA.
  origin?: GroundPoolOrigin;
  tickMs: number;
  nextTickAt: number;
  expiresAt: number;
  /** SpellMgr IsBinarySpell snapshot for partial resist on pulses. */
  binary?: boolean;
  /** GuidSet m_affected — sides that currently hold this dynobj's aura. */
  affected: Side[];
  /** Creating effect index. Cite: DynamicObject.h m_effIndex. */
  effIndex: number;
  // True when a later effect slot is PAA or ADD_FARSIGHT. Delay only calls DelaySpellAuraHolder on those
  // holders (avoids double-delay on multi-PAA). Cite: DynamicObject.cpp:174–188.
  laterPersistentEffect: boolean;
  // ONLY_ON_PLAYER on the pool's own spell: the dynamic object visits a pet, totem or guardian and
  // applies nothing. Snapshot at cast, because the pulse loop has no spell lookup.
  onlyOnPlayer?: boolean;
}

export interface CreateGroundPoolInput {
  id: number;
  spellId: number;
  name: string;
  source: Side;
  school: School;
  min: number;
  max: number;
  durationMs: number;
  tickMs: number;
  /** Session clock at cast finish. */
  nowMs: number;
  radius?: number;
  /** Cast-time planar origin; see GroundPool.origin. */
  origin?: GroundPoolOrigin;
  binary?: boolean;
  /** Creating effect index (default 0). */
  effIndex?: number;
  /** Precomputed Delay later-PAA/farsight flag. */
  laterPersistentEffect?: boolean;
  /** SPELL_ATTR_EX3_ONLY_ON_PLAYER — see GroundPool.onlyOnPlayer. */
  onlyOnPlayer?: boolean;
}

/** Payload extracted from a spell that should become a ground pool. */
export interface PersistentAreaPayload {
  school: School;
  min: number;
  max: number;
  durationMs: number;
  tickMs: number;
  radius?: number;
  pointsPerComboPoint?: number;
}

// Create a ground pool. First pulse is after `tickMs` (matches unit DoT nextTickAt = t + tickMs), not on
// the cast tick.
export function createGroundPool(input: CreateGroundPoolInput): GroundPool {
  const tickMs = Math.max(1, Math.trunc(input.tickMs));
  const durationMs = Math.max(0, Math.trunc(input.durationMs));
  const nowMs = Math.trunc(input.nowMs);
  const origin =
    input.origin != null
    && Number.isFinite(input.origin.x)
    && Number.isFinite(input.origin.y)
      ? {
        x: input.origin.x,
        y: input.origin.y,
        ...(input.origin.z != null && Number.isFinite(input.origin.z) ? { z: input.origin.z } : {}),
      }
      : undefined;
  return {
    id: input.id | 0,
    spellId: input.spellId | 0,
    name: input.name,
    source: input.source,
    school: input.school,
    min: input.min,
    max: input.max,
    radius: input.radius != null && input.radius > 0 ? input.radius : undefined,
    ...(origin ? { origin } : {}),
    tickMs,
    nextTickAt: nowMs + tickMs,
    expiresAt: nowMs + durationMs,
    binary: input.binary,
    affected: [],
    effIndex: input.effIndex != null ? input.effIndex | 0 : 0,
    laterPersistentEffect: input.laterPersistentEffect === true,
    ...(input.onlyOnPlayer === true ? { onlyOnPlayer: true } : {}),
  };
}

export function isGroundPoolExpired(pool: GroundPool, nowMs: number): boolean {
  return nowMs >= pool.expiresAt;
}

// Advance pool clock to `nowMs`. Returns how many pulse moments fired. Mutates `nextTickAt`. Pulses only
// while nextTickAt < expiresAt + 1 (same fence as combat unit-DoT ticks).
export function advanceGroundPool(pool: GroundPool, nowMs: number): number {
  if (pool.tickMs <= 0) return 0;
  let pulses = 0;
  while (pool.nextTickAt <= nowMs && pool.nextTickAt < pool.expiresAt + 1) {
    pulses++;
    pool.nextTickAt += pool.tickMs;
  }
  return pulses;
}

// Find existing pool for (source, spellId) — recast refreshes rather than stacking multiple ground objects
// of the same spell from one caster.
function findGroundPool(
  pools: readonly GroundPool[],
  source: Side,
  spellId: number,
): GroundPool | undefined {
  return pools.find((p) => p.source === source && p.spellId === spellId);
}

// Upsert: refresh an existing (source, spellId) pool or append a new one. A refresh keeps the earlier
// next tick, or Rain of Fire spam resets it forever on a GCD shorter than the tick and deals nothing.
export function upsertGroundPool(pools: GroundPool[], created: GroundPool): GroundPool {
  const idx = pools.findIndex((p) => p.source === created.source && p.spellId === created.spellId);
  if (idx >= 0) {
    const prev = pools[idx]!;
    if (prev.nextTickAt < created.nextTickAt) {
      created.nextTickAt = prev.nextTickAt;
    }
    created.id = prev.id;
    created.affected = prev.affected;
    pools[idx] = created;
    return pools[idx]!;
  }
  pools.push(created);
  return created;
}

/** Remove expired pools; returns removed entries (for fade events). */
export function expireGroundPools(pools: GroundPool[], nowMs: number): GroundPool[] {
  const removed: GroundPool[] = [];
  for (let i = pools.length - 1; i >= 0; i--) {
    const p = pools[i]!;
    if (isGroundPoolExpired(p, nowMs)) {
      removed.push(p);
      pools.splice(i, 1);
    }
  }
  return removed;
}

// True when this effect is absorbed into a session ground pool, so the unit DoT is skipped: an explicit
// persistent-area kind, or the equivalent baked shape of an aoe spell with a dot effect.
export function isPersistentAreaEffect(spell: Pick<SpellDef, 'aoe' | 'effects'>, eff: SpellEffect): boolean {
  if (eff.kind === 'persistent_area') return true;
  if (eff.kind === 'dot' && spell.aoe === true) return true;
  return false;
}

// Extract the first persistent-area payload from a spell, or null. Prefers the explicit kind and falls
// back to the aoe-plus-dot bake shape; the radius is the effect's, else the spell's.
export function persistentAreaFromSpell(
  spell: Pick<SpellDef, 'aoe' | 'effects' | 'radiusYd'>,
): PersistentAreaPayload | null {
  const spellRadius =
    spell.radiusYd != null && spell.radiusYd > 0 ? spell.radiusYd : undefined;
  for (const e of spell.effects) {
    if (e.kind === 'persistent_area') {
      const r = e.radius != null && e.radius > 0 ? e.radius : spellRadius;
      return {
        school: e.school,
        min: e.min,
        max: e.max,
        durationMs: e.durationMs,
        tickMs: e.tickMs,
        radius: r,
        pointsPerComboPoint: e.pointsPerComboPoint,
      };
    }
  }
  if (spell.aoe === true) {
    for (const e of spell.effects) {
      if (e.kind === 'dot') {
        return {
          school: e.school,
          min: e.min,
          max: e.max,
          durationMs: e.durationMs,
          tickMs: e.tickMs,
          radius: spellRadius,
          pointsPerComboPoint: e.pointsPerComboPoint,
        };
      }
    }
  }
  return null;
}

/** Whether a caster side is on the enemy pack (for pulse target selection). */
export function isEnemyCasterSide(side: Side): boolean {
  if (side === 'enemy') return true;
  return typeof side === 'string' && /^enemy_\d+$/.test(side);
}

// Later-slot PAA / ADD_FARSIGHT — the Delay() foundAura walk. Prefers raw EffectN opcodes; mapped kinds
// when rawEffects is absent. Cite: DynamicObject.cpp:174–181; SpellEffectDefines.h 27 / 72.
export function hasLaterPersistentAreaOrFarsight(
  spell: Pick<SpellDef, 'effects' | 'rawEffects'>,
  effIndex: number,
): boolean {
  const raw = spell.rawEffects;
  if (raw && raw.length > 0) {
    for (let i = (effIndex | 0) + 1; i < raw.length; i++) {
      const code = raw[i]?.effect ?? 0;
      if (code === SPELL_EFFECT_PERSISTENT_AREA_AURA || code === SPELL_EFFECT_ADD_FARSIGHT) {
        return true;
      }
    }
    return false;
  }
  for (const e of spell.effects) {
    const slot = e.effectSlot ?? 0;
    if (slot <= effIndex) continue;
    if (e.kind === 'persistent_area' || e.kind === 'add_farsight') return true;
  }
  return false;
}

/** Cite: DynamicObject.h IsAffecting. */
export function isGroundPoolAffecting(pool: GroundPool, side: Side): boolean {
  return pool.affected.includes(side);
}

/** Cite: DynamicObject.h AddAffected. */
export function addGroundPoolAffected(pool: GroundPool, side: Side): void {
  if (!pool.affected.includes(side)) pool.affected.push(side);
}

/** Cite: DynamicObject.h RemoveAffected. */
export function removeGroundPoolAffected(pool: GroundPool, side: Side): void {
  const i = pool.affected.indexOf(side);
  if (i >= 0) pool.affected.splice(i, 1);
}

// Script hook. C++ returns true when no AuraScript is bound. ScriptDev types.ts is not extended this batch
// — default allow. Cite: DynamicObject.cpp:216–221 OnPersistentAreaAuraCheckTarget.
function onPersistentAreaAuraCheckTarget(
  _pool: GroundPool,
  _target: Side,
): boolean {
  return true;
}

/** Cite: DynamicObject.h GetDuration — max(m_aliveTime - now, 0). */
function groundPoolRemainingMs(pool: GroundPool, nowMs: number): number {
  return Math.max(0, pool.expiresAt - nowMs);
}

// VisitHelper duration refresh: only extend when holder remaining < dynobj remaining. Cite:
// GridNotifiersImpl.h VisitHelper holder->SetAuraDuration(i_dynobject.GetDuration()).
export function shouldRefreshAffectedAuraDuration(
  auraExpiresAt: number,
  poolExpiresAt: number,
): boolean {
  return auraExpiresAt >= 0 && auraExpiresAt < poolExpiresAt;
}

export interface GroundPoolAffectedSync {
  entered: Side[];
  refreshed: Side[];
  left: Side[];
}

// DynamicObject::Update membership against the current in-radius set, which is already filtered for
// hostility, sight and liveness. This still runs the script hook. Cite: DynamicObject.cpp:138-142.
export function syncGroundPoolAffected(
  pool: GroundPool,
  inRadius: readonly Side[],
): GroundPoolAffectedSync {
  const allowed: Side[] = [];
  for (const side of inRadius) {
    if (onPersistentAreaAuraCheckTarget(pool, side)) allowed.push(side);
  }
  const inSet = new Set(allowed);
  const entered: Side[] = [];
  const refreshed: Side[] = [];
  const left: Side[] = [];
  for (const side of pool.affected) {
    if (!inSet.has(side)) left.push(side);
  }
  for (const side of allowed) {
    if (isGroundPoolAffecting(pool, side)) refreshed.push(side);
    else entered.push(side);
  }
  for (const side of left) removeGroundPoolAffected(pool, side);
  for (const side of entered) addGroundPoolAffected(pool, side);
  return { entered, refreshed, left };
}

// Channel pushback shortens the pool's alive time, and delays the holder only when a later persistent
// aura still sits on it. A single-pool spell just gets shorter. Cite: DynamicObject.cpp:159-195.
function delayGroundPool(
  pool: GroundPool,
  delayMs: number,
  hasHolder: (side: Side) => boolean,
): Side[] {
  const delay = Math.trunc(delayMs);
  if (delay <= 0) return [];
  pool.expiresAt -= delay;
  const delayAuras: Side[] = [];
  const keep: Side[] = [];
  for (const side of pool.affected) {
    if (!hasHolder(side)) continue;
    if (!pool.laterPersistentEffect) continue;
    delayAuras.push(side);
    keep.push(side);
  }
  pool.affected = keep;
  return delayAuras;
}

/** DelayedChannel loop: every dynobj of this (caster, spellId). */
export function delayGroundPoolsForSpell(
  pools: readonly GroundPool[],
  source: Side,
  spellId: number,
  delayMs: number,
  hasHolder: (side: Side) => boolean,
): { pool: GroundPool; delayAuras: Side[] }[] {
  const out: { pool: GroundPool; delayAuras: Side[] }[] = [];
  for (const pool of pools) {
    if (pool.source !== source || pool.spellId !== spellId) continue;
    out.push({ pool, delayAuras: delayGroundPool(pool, delayMs, hasHolder) });
  }
  return out;
}
