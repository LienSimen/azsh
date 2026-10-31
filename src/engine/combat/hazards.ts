// WHERE the floor is dangerous, asked once. Two kinds are carried: a live POOL, and a BODY whose own
// schedule has a ground-shaped damaging spell landing on itself and making no pool. Nothing moves alone.

import { isEnemySide, type Side } from '../core/events.ts';
import { castableKitIds } from './castableKit.ts';
import { persistentAreaFromSpell } from '../game/dynamicObject.ts';
import { spellAoeFromCaster, type CombatPosYd } from './combatGeometry.ts';
import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import type { SpellDef } from '../../data/schema.ts';

export type HazardKind = 'pool' | 'body';

export interface Hazard {
  kind: HazardKind;
  /** Session-local id — a pool's `id`, or the body's side. */
  id: string;
  /** Spell that makes the ground dangerous: the pool's own spell, or the body's ground AoE. */
  spellId: number;
  /** Pool name, or the creature's name. A row may match on any of id / spellId / name. */
  name: string;
  /** Who put it there. A row avoids what an enemy made, never its own party's. */
  source: Side;
  /** Live centre in combat yards. */
  at: CombatPosYd;
  radiusYd: number;
}

// The one ground-shaped damaging spell a creature's SCHEDULE carries, or null. A cone or a pbaoe
// follows the body and is a facing problem. The spell must land AT the creature, or the site is wrong.
function groundAoeOf(f: Fighter, spellOf: ((id: number) => SpellDef | undefined) | undefined): SpellDef | null {
  // REACHABLE, asked once for the whole engine. A charm-bar slot never self-casts and a death cast is
  // no hazard while the caster lives, so the spell must be scheduled or a payload of one.
  const spec = f.spec;
  const reach = castableKitIds(f, spellOf);
  for (const s of spec.spells ?? []) {
    if (reach && !reach.has(s.id | 0)) continue;
    if (s.aoeShape !== 'ground') continue;
    const r = s.radiusYd;
    if (!(typeof r === 'number' && r > 0)) continue;
    if (!(s.effects ?? []).some((e) => e.kind === 'direct_damage' || e.kind === 'dot')) continue;
    // A spell that makes a persistent area already publishes a POOL at the origin its own pulse uses.
    // A body would be a second and PERMANENT answer — 19 of 29 publishers were this shape.
    if (persistentAreaFromSpell(s)) continue;
    if (!spellAoeFromCaster(s)) continue;
    return s;
  }
  return null;
}

// Every live hazard, pools and bodies alike. A pool's centre is the same resolution its damage pulse
// uses, since reading it any other way would be a second answer to where the damage is.
export function listHazards(
  ctx: CombatContext,
  dead: (f: Fighter) => boolean,
): Hazard[] {
  const out: Hazard[] = [];
  const posOf = ctx.posOf;
  for (const pool of ctx.groundPools) {
    if (pool.expiresAt <= ctx.t) continue;
    const at = pool.origin ?? posOf?.(pool.source);
    if (!at) continue;
    out.push({
      kind: 'pool',
      id: String(pool.id),
      spellId: pool.spellId,
      name: pool.name,
      source: pool.source,
      at,
      radiusYd: pool.radius ?? 0,
    });
  }
  for (const f of ctx.livingEnemies()) {
    const spell = groundAoeOf(f, ctx.spellOf);
    if (!spell) continue;
    const at = posOf?.(f.side);
    if (!at) continue;
    out.push({
      kind: 'body',
      id: f.side,
      spellId: spell.id,
      name: f.spec.name,
      source: f.side,
      at,
      radiusYd: spell.radiusYd ?? 0,
    });
  }
  return out;
}

/** A row's `id` names a hazard by session id, by spell id, or by name. Empty matches every one. */
export function hazardMatches(h: Hazard, id: string): boolean {
  if (id === '') return true;
  return id === h.id || id === String(h.spellId) || id === h.name;
}

/** Hazards a friendly unit should be off: an enemy made it. */
export function hostileHazards(ctx: CombatContext, dead: (f: Fighter) => boolean): Hazard[] {
  return listHazards(ctx, dead).filter((h) => isEnemySide(h.source));
}

// The same list, answered once per tick for the whole fight. "Where is the floor dangerous" is a fact
// about the FIGHT, and deriving it per caller is how the move and the condition came to disagree.
export function hostileHazardsThisTick(
  ctx: CombatContext,
  dead: (f: Fighter) => boolean,
): readonly Hazard[] {
  const bag = ctx as { hazardCache?: { t: number; list: readonly Hazard[] } };
  const hit = bag.hazardCache;
  if (hit && hit.t === ctx.t) return hit.list;
  const list = hostileHazards(ctx, dead);
  bag.hazardCache = { t: ctx.t, list };
  return list;
}
