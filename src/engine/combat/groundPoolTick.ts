// DynamicObject::Update plus persistent-area membership for session ground pools. The pulse damage
// stays on the shared pool clock; this pass applies, refreshes and strips the per-unit auras.

import type { CombatContext } from './context.ts';
import type { ActiveEffect, Fighter } from './types.ts';
import type { Side } from '../core/events.ts';
import { rollBetween } from './formulas.ts';
import { isWithinRadiusYd } from './combatGeometry.ts';
import { navSightClear } from './navSight.ts';
import {
  advanceGroundPool,
  expireGroundPools,
  isEnemyCasterSide,
  isGroundPoolExpired,
  shouldRefreshAffectedAuraDuration,
  syncGroundPoolAffected,
  type GroundPool,
} from '../game/dynamicObject.ts';
import {
  BLIZZARD_SPELL_IDS,
  improvedBlizzardChillSpellId,
} from '../spells/interpreter/class-scripts-kit.ts';
import { unitHasOverrideScript } from '../spells/overrideClassScripts.ts';
import { isPlayerCharacterTarget } from './castTargetGates.ts';

function findDynObjAura(
  effects: readonly ActiveEffect[],
  pool: GroundPool,
  target: Side,
): ActiveEffect | undefined {
  return effects.find(
    (e) =>
      e.fromDynamicObject === pool.id
      && e.spellId === pool.spellId
      && e.source === pool.source
      && e.target === target,
  );
}

function applyOrRefreshDynObjAura(
  ctx: CombatContext,
  pool: GroundPool,
  target: Fighter,
  mode: 'enter' | 'refresh',
): void {
  const live = findDynObjAura(ctx.effectsOn(target.side), pool, target.side);
  if (live) {
    live.fromDynamicObject = pool.id;
    if (shouldRefreshAffectedAuraDuration(live.expiresAt, pool.expiresAt)) {
      live.expiresAt = pool.expiresAt;
      ctx.touchEffect(live);
    }
    return;
  }
  if (mode === 'refresh') return;
  ctx.effects.push({
    kind: 'dot',
    source: pool.source,
    target: target.side,
    spellId: pool.spellId,
    name: pool.name,
    school: pool.school,
    min: pool.min,
    max: pool.max,
    tickMs: pool.tickMs,
    nextTickAt: ctx.t + pool.tickMs,
    expiresAt: pool.expiresAt,
    binary: pool.binary,
    fromDynamicObject: pool.id,
  });
  ctx.push({ t: ctx.t, kind: 'aura', actor: target.side, name: pool.name, applied: true });
}

function stripDynObjAura(ctx: CombatContext, pool: GroundPool, targetSide: Side): void {
  for (let i = ctx.effects.length - 1; i >= 0; i--) {
    const e = ctx.effects[i]!;
    if (e.fromDynamicObject !== pool.id || e.target !== targetSide) continue;
    ctx.effects.splice(i, 1);
    ctx.push({ t: ctx.t, kind: 'aura', actor: targetSide, name: pool.name, applied: false });
  }
}

function stripAllDynObjAuras(ctx: CombatContext, pool: GroundPool): void {
  const seen = new Set<Side>();
  for (const side of pool.affected) {
    if (seen.has(side)) continue;
    seen.add(side);
    stripDynObjAura(ctx, pool, side);
  }
  for (let i = ctx.effects.length - 1; i >= 0; i--) {
    const e = ctx.effects[i]!;
    if (e.fromDynamicObject !== pool.id) continue;
    if (seen.has(e.target)) continue;
    ctx.effects.splice(i, 1);
    ctx.push({ t: ctx.t, kind: 'aura', actor: e.target, name: pool.name, applied: false });
  }
  pool.affected.length = 0;
}

/** Units currently inside this dynobj (radius + LOS). Same gate as the pulse. */
export function groundPoolUnitsInRadius(
  ctx: CombatContext,
  pool: GroundPool,
  dead: (f: Fighter) => boolean,
): Fighter[] {
  const poolOrigin = pool.origin ?? ctx.posOf(pool.source);
  let candidates = isEnemyCasterSide(pool.source) ? ctx.livingFriendlies() : ctx.livingEnemies();
  if (
    ctx.cfg.endless
    && !isEnemyCasterSide(pool.source)
    && !(pool.radius != null && pool.radius > 0)
  ) {
    candidates =
      typeof ctx.livingCombatEnemies === 'function'
        ? ctx.livingCombatEnemies()
        : candidates.filter((e) => {
          const tm = ctx.threatOf(e); return !!tm && !tm.isEmpty();
        });
  }
  return candidates.filter((tgt) => {
    if (dead(tgt)) return false;
    // SPELL_ATTR_EX3_ONLY_ON_PLAYER: the dynobj visits a pet, totem or guardian and applies
    // nothing — it is TYPEID_UNIT. Cite: GridNotifiersImpl.h:256 DynamicObjectUpdater.
    if (pool.onlyOnPlayer === true && !isPlayerCharacterTarget(tgt)) return false;
    const at = ctx.posOf(tgt.side);
    if (ctx.cfg.endless && pool.radius != null && pool.radius > 0) {
      if (poolOrigin == null || at == null) return false;
      if (!isWithinRadiusYd(poolOrigin, at, pool.radius)) return false;
    } else if (!isWithinRadiusYd(poolOrigin, at, pool.radius)) {
      return false;
    }
    return !ctx.cfg.navLos || navSightClear(ctx.cfg, poolOrigin, at);
  });
}

// VisitAllObjects apply/refresh, then pulse, then expire + strip. Cite: DynamicObject.cpp:122–150 Update
// (visit even when deleteThis is set, then Delete).
export function tickGroundPools(
  ctx: CombatContext,
  dead: (f: Fighter) => boolean,
): void {
  const { groundPools } = ctx;
  const dealDamage = ctx.dealDamage;
  for (const pool of groundPools) {
    if (!isGroundPoolExpired(pool, ctx.t)) {
      const inRadius = groundPoolUnitsInRadius(ctx, pool, dead);
      const present = new Map(inRadius.map((t) => [t.side, t]));
      const sync = syncGroundPoolAffected(pool, inRadius.map((t) => t.side));
      for (const side of sync.left) stripDynObjAura(ctx, pool, side);
      for (const side of sync.entered) {
        const tgt = present.get(side);
        if (tgt && !dead(tgt)) applyOrRefreshDynObjAura(ctx, pool, tgt, 'enter');
      }
      for (const side of sync.refreshed) {
        const tgt = present.get(side);
        if (tgt && !dead(tgt)) applyOrRefreshDynObjAura(ctx, pool, tgt, 'refresh');
      }
    }
    const pulses = advanceGroundPool(pool, ctx.t);
    if (pulses <= 0) continue;
    const src = ctx.bySide(pool.source);
    if (dead(src) || !dealDamage) continue;
    const targets = groundPoolUnitsInRadius(ctx, pool, dead);
    // Improved Blizzard chill on each tick end. Cite: Mage.cpp:111–124 OnPeriodicTickEnd.
    const chillId = BLIZZARD_SPELL_IDS.has(pool.spellId | 0)
      ? improvedBlizzardChillSpellId((scriptId) => unitHasOverrideScript(src, scriptId))
      : 0;
    for (let p = 0; p < pulses; p++) {
      for (const tgt of targets) {
        if (dead(tgt)) continue;
        const amount = dealDamage(
          tgt,
          rollBetween(pool.min, pool.max, ctx.rng.next()),
          pool.school,
          src.spec.level,
          { binary: pool.binary ?? true, damageType: 'dot', attacker: src },
        );
        ctx.push({
          t: ctx.t, kind: 'dot_tick', actor: pool.source, target: tgt.side,
          spellId: pool.spellId, name: pool.name, amount, school: pool.school,
        });
        if (chillId > 0) {
          // Prefer kit row; else stamp speed snare from bake (−30/−50/−65, 1.5s).
          // Cite: spell_template 12484/12485/12486 aura 33.
          const kit = src.spec.spells.find((s) => s.id === chillId);
          if (kit && ctx.applySpell) {
            ctx.applySpell(src, tgt, kit, false, 1);
          } else {
            const pct = chillId === 12486 ? -65 : chillId === 12485 ? -50 : -30;
            tgt.buffActive.add(chillId);
            ctx.effects.push({
              kind: 'buff',
              source: src.side,
              target: tgt.side,
              spellId: chillId,
              name: 'Chilled',
              amount: pct,
              expiresAt: ctx.t + 1500,
            });
            ctx.push({ t: ctx.t, kind: 'aura', actor: tgt.side, name: 'Chilled', applied: true });
          }
        }
      }
    }
  }
  for (const faded of expireGroundPools(groundPools, ctx.t)) {
    stripAllDynObjAuras(ctx, faded);
    ctx.push({ t: ctx.t, kind: 'aura', actor: faded.source, name: faded.name, applied: false });
  }
}
