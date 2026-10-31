// A clicked combat GO activates a trap, and the trap is the thing that hurts. The payload is in NO
// creature kit, so the game layer resolves the chain off the bake and this lays the ground pool.

import type { SpellEffect } from '../../data/schema.ts';
import { createGroundPool, upsertGroundPool } from '../game/dynamicObject.ts';
import { resolveSpellBinary } from './mitigation.ts';
import type { CombatContext } from './context.ts';
import type { Side } from '../core/events.ts';
import type { CombatConfig, CombatObjectTrap, SpellTrapSite } from './types.ts';

/** The trap a clicked entry activates, or undefined when the click carries no DB script. */
export function combatObjectTrapFor(
  cfg: CombatConfig,
  goEntry: number,
): CombatObjectTrap | undefined {
  const want = goEntry | 0;
  return cfg.combatObjectTraps?.find((t) => (t.goEntry | 0) === want);
}

// Lay the activated trap's pool and name the payload that landed. `source` is the CLICKER, so a
// cannon a raider fires hurts the riflemen and not the raid.
export function layCombatObjectTrap(
  ctx: CombatContext,
  cfg: CombatConfig,
  goEntry: number,
  side: Side,
): string | null {
  const trap = combatObjectTrapFor(cfg, goEntry);
  if (!trap) return null;
  // Damage, school and radius come off the payload's own bake - never off this table.
  const hit = trap.spell.effects.find(
    (e): e is Extract<SpellEffect, { kind: 'dot' | 'direct_damage' }> =>
      e.kind === 'dot' || e.kind === 'direct_damage',
  );
  const radius = trap.spell.radiusYd != null && trap.spell.radiusYd > 0
    ? trap.spell.radiusYd
    : undefined;
  if (!hit || radius == null) return null;
  const origin = trap.origin ?? ctx.posOf?.(side);
  const pool = createGroundPool({
    // applySpell.ts:324 casts the same way - the counter lives in createSession.
    id: (ctx.nextGroundPoolId as () => number)(),
    spellId: trap.spell.id,
    name: trap.spell.name,
    source: side,
    school: hit.school,
    min: hit.min,
    max: hit.max,
    durationMs: trap.durationMs,
    // A dot payload ticks on its own amplitude; a one-shot on the trap re-arm.
    tickMs: hit.kind === 'dot' && hit.tickMs > 0 ? hit.tickMs : trap.cooldownMs,
    nowMs: ctx.t,
    radius,
    ...(origin != null && Number.isFinite(origin.x) && Number.isFinite(origin.y)
      ? {
        origin: {
          x: origin.x,
          y: origin.y,
          ...(origin.z != null && Number.isFinite(origin.z) ? { z: origin.z } : {}),
        },
      }
      : {}),
    binary: resolveSpellBinary(trap.spell),
    effIndex: 0,
    laterPersistentEffect: false,
  });
  // A trap casts on Use, not after its first re-arm, so the first pulse is already due.
  // Cite: GameObject.cpp:1513-1532 Use TRAP casts then sets m_cooldownTime.
  pool.nextTickAt = ctx.t;
  upsertGroundPool(ctx.groundPools, pool);
  ctx.touchGroundPool(pool);
  return trap.spell.name;
}

// Lay the pools an ACTIVATE_OBJECT slot lights, deduped on (source, payload, origin): 38 fissures are
// 38 gameobjects, and the coarser key would collapse the whole floor into one disc.
export function laySpellTrapSites(
  ctx: CombatContext,
  cfg: CombatConfig,
  spellId: number,
  effectSlot: number,
  side: Side,
): number {
  const sites = cfg.spellTrapSites;
  if (!sites?.length) return 0;
  let laid = 0;
  for (const site of sites) {
    if ((site.spellId | 0) !== (spellId | 0)) continue;
    if (((site.inverseEffectMask | 0) & (1 << (effectSlot | 0))) !== 0) continue;
    if (layTrapSite(ctx, site, side)) laid++;
  }
  return laid;
}

/** One site. Damage, school and radius come off the payload's own bake. */
function layTrapSite(ctx: CombatContext, site: SpellTrapSite, side: Side): boolean {
  const hit = site.spell.effects.find(
    (e): e is Extract<SpellEffect, { kind: 'dot' | 'direct_damage' }> =>
      e.kind === 'dot' || e.kind === 'direct_damage',
  );
  const radius = site.spell.radiusYd != null && site.spell.radiusYd > 0
    ? site.spell.radiusYd
    : undefined;
  if (!hit || radius == null) return false;
  const at = site.origin;
  const same = ctx.groundPools.find((p) => (
    p.source === side
    && p.spellId === site.spell.id
    && p.origin != null
    && Math.abs(p.origin.x - at.x) < 0.01
    && Math.abs(p.origin.y - at.y) < 0.01
  ));
  const pool = createGroundPool({
    id: same?.id ?? (ctx.nextGroundPoolId as () => number)(),
    spellId: site.spell.id,
    name: site.spell.name,
    source: side,
    school: hit.school,
    min: hit.min,
    max: hit.max,
    durationMs: site.durationMs,
    tickMs: hit.kind === 'dot' && hit.tickMs > 0 ? hit.tickMs : site.cooldownMs,
    nowMs: ctx.t,
    radius,
    origin: { x: at.x, y: at.y, ...(at.z != null && Number.isFinite(at.z) ? { z: at.z } : {}) },
    binary: resolveSpellBinary(site.spell),
    effIndex: 0,
    laterPersistentEffect: false,
  });
  // A trap casts on Use, not after its first re-arm. Cite: GameObject.cpp:1513-1532.
  pool.nextTickAt = ctx.t;
  if (same) {
    pool.affected = same.affected;
    ctx.groundPools[ctx.groundPools.indexOf(same)] = pool;
  } else {
    ctx.groundPools.push(pool);
  }
  ctx.touchGroundPool(pool);
  return true;
}
