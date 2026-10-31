// The fixed room point a script-targeted effect resolves to instead of the caster's feet: the C++
// picks the NEAREST listed spawn and sets it as the destination. Scoped to living-creature rows.

import { dungeonSpawnsForMap } from '../../data/dungeonSpawns.ts';
import { detHypot } from '../core/detMath.ts';
import { scriptTargetRowsFor, SPELL_TARGET_TYPE_CREATURE } from './scriptTargets.ts';
import { SPELL_RADIUS_SENTINEL_YD, spellRadiusYd } from './spellRadius.ts';

/** Cite: SpellTargetDefines.h:70. */
export const TARGET_LOCATION_SCRIPT_NEAR_CASTER = 46;

/** Cite: ObjectDefines.h:39 DEFAULT_VISIBILITY_INSTANCE = 170.0f. */
const DEFAULT_VISIBILITY_INSTANCE_YD = 170;

/** Cite: Spell.cpp:2650-2651 — the 50000 sentinel is trimmed to 200 for an entry search. */
const SCRIPT_TARGET_RADIUS_CAP_YD = 200;

export type ScriptTargetDest = {
  x: number;
  y: number;
  z?: number;
  // The effect's OWN radius, which is what EffectSummonWild scatters the extra bodies over — not the
  // (possibly rewritten) search radius. Cite: SpellEffects.cpp:2764.
  scatterYd: number;
  /** Spawn guid the dest came from — the evidence line for a probe or a log. */
  guid: number;
};

/** True when this rawEffect resolves its destination through CheckScriptTargeting. */
export function effectUsesScriptDest(raw: { targetA?: number; targetB?: number }): boolean {
  return (raw.targetA ?? 0) === TARGET_LOCATION_SCRIPT_NEAR_CASTER
    || (raw.targetB ?? 0) === TARGET_LOCATION_SCRIPT_NEAR_CASTER;
}

// The search bound for the entry lookup: the 50000 sentinel becomes 200 and a zero radius the map's
// visibility distance. Both exceed any room. Cite: Spell.cpp:2650-2654.
export function scriptTargetSearchRadiusYd(effectRadiusYd: number): number {
  if (effectRadiusYd === SPELL_RADIUS_SENTINEL_YD) return SCRIPT_TARGET_RADIUS_CAP_YD;
  if (!(effectRadiusYd > 0)) return DEFAULT_VISIBILITY_INSTANCE_YD;
  return effectRadiusYd;
}

// The nearest listed script-target spawn to a point, as a world position. Null on any of the C++'s own
// failure paths, and `near` is required because "nearest" IS the rule — ZG has six such spawns.
export function scriptTargetDestFor(opts: {
  spellId: number;
  radiusIndex: number;
  mapId?: number;
  near: { x: number; y: number };
}): ScriptTargetDest | null {
  const entries = new Set<number>();
  for (const row of scriptTargetRowsFor(opts.spellId)) {
    if (row.t === SPELL_TARGET_TYPE_CREATURE) entries.add(row.e | 0);
  }
  if (entries.size === 0) return null;
  if (opts.mapId == null) return null;

  const scatterYd = spellRadiusYd(opts.radiusIndex);
  const searchYd = scriptTargetSearchRadiusYd(scatterYd);
  const near = opts.near;

  let best: { x: number; y: number; z?: number; guid: number } | null = null;
  let bestDist = Infinity;
  for (const s of dungeonSpawnsForMap(opts.mapId)) {
    if (!entries.has(s.entry | 0)) continue;
    const d = detHypot(s.x - near.x, s.y - near.y);
    if (d > searchYd) continue;
    // Guid breaks an exact tie so two peers pick the same spawn.
    if (d < bestDist || (d === bestDist && best != null && s.guid < best.guid)) {
      best = { x: s.x, y: s.y, z: s.z, guid: s.guid };
      bestDist = d;
    }
  }
  if (!best) return null;
  return { ...best, scatterYd };
}
