// A periodic-trigger payload, scaled to the caster's level the way an ordinary cast is.
//
// `applySpell` resolves EVERY spell it is handed with `casterLevel` plus the spell's own level band
// (applySpell.ts:469, :496-497), so a rank-1 nuke stops scaling at its maxLevel. The periodic-trigger
// tick pays direct damage inline instead of routing through applySpell, so its payload came off the
// bake row unscaled: Hellfire Effect 5857 paid 83 at level 60 where CalculateSpellEffectValue pays 87.
// 24 payloads carry EffectRealPointsPerLevel, every rank of Arcane Missiles among them.
// Cite: Object.cpp:2926-2936 CalculateSpellEffectValue level clamp; Unit.cpp:11855 GetSpellRank.

import type { SpellDef } from '../../data/schema.ts';
import { resolveCombatSpell } from '../spells/interpreter/index.ts';

// Keyed by def identity then caster level: resolving is pure in both, and a tick must not pay for it
// once a second per aura.
const CACHE = new WeakMap<SpellDef, Map<number, SpellDef>>();

/** The payload as the caster would cast it. Returns the input unchanged when there is nothing to scale. */
export function payloadAtCasterLevel(
  trig: SpellDef,
  casterLevel: number,
  casterIsPlayer: boolean,
): SpellDef {
  const level = casterLevel | 0;
  if (!(level > 0)) return trig;
  if (!trig.rawEffects?.some((r) => Number(r.perLevel) !== 0)) return trig;
  let byLevel = CACHE.get(trig);
  if (!byLevel) {
    byLevel = new Map();
    CACHE.set(trig, byLevel);
  }
  const key = casterIsPlayer ? level : -level;
  const hit = byLevel.get(key);
  if (hit) return hit;
  const out = resolveCombatSpell(trig, {
    casterLevel: level,
    casterIsPlayer,
    ...(trig.baseLevel != null ? { spellBaseLevel: trig.baseLevel } : {}),
    ...(trig.maxLevel != null ? { spellMaxLevel: trig.maxLevel } : {}),
  });
  byLevel.set(key, out);
  return out;
}
