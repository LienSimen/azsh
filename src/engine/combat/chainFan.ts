// Chain-target fan — Chain Lightning, Chain Heal, Multi-Shot, Swipe. NOT the AoE unit fan: a chain
// jumps between nearby units rather than splashing a radius, and none of these spells is aoe.

import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import { aoeTotalTargetCap, sideIdSortKey } from './predicates.ts';
import { SPELL_ATTR_EX2, hasAttrEx2 } from '../spells/spellAttributes.ts';

/** Classic chain jump radius (yards). Cite: SharedDefines.h CHAIN_SPELL_JUMP_RADIUS. */
export const CHAIN_SPELL_JUMP_RADIUS_YD = 10;

/** TARGET_UNIT_FRIEND_CHAIN_HEAL — lowest-HP chain, not closest. */
export const TARGET_UNIT_FRIEND_CHAIN_HEAL = 45;

// True when any live slot declares EffectChainTarget > 1 (and the spell is not an on-next-swing cleave —
// those use nextSwingFanCap).
export function wantsChainFan(spell: SpellDef): boolean {
  if (spell.onNextSwing) return false;
  const cap = aoeTotalTargetCap(spell);
  return cap != null && cap > 1;
}

/** Friendly chain (Chain Heal family) vs hostile chain (Chain Lightning / Swipe / Multi-Shot). */
export function isFriendlyChainSpell(spell: SpellDef): boolean {
  for (const re of spell.rawEffects ?? []) {
    if ((re.effect | 0) === 0) continue;
    if ((re.targetA | 0) === TARGET_UNIT_FRIEND_CHAIN_HEAL) return true;
    if ((re.targetB | 0) === TARGET_UNIT_FRIEND_CHAIN_HEAL) return true;
  }
  return false;
}

// The per-jump falloff multiplier from the DBC, first chain slot. Null when the bake has no value —
// callers must not invent one. Cite: Spell.cpp:4459–4465; spell_template.DmgMultiplier1.
export function chainJumpMultiplier(spell: SpellDef): number | null {
  for (const re of spell.rawEffects ?? []) {
    if ((re.chainTargets | 0) > 1) {
      const m = (re as { dmgMultiplier?: number }).dmgMultiplier;
      if (m != null && Number.isFinite(m) && m > 0) return m;
    }
  }
  // Top-level optional field (tests / future bake).
  const top = (spell as { dmgMultiplier?: number }).dmgMultiplier;
  if (top != null && Number.isFinite(top) && top > 0) return top;
  return null;
}

/** Effects replayed on each chain jump (same set as the hostile aoe fan, plus heal). */
export function isChainFannedEffect(e: SpellEffect): boolean {
  return (
    e.kind === 'direct_damage'
    || e.kind === 'dot'
    || e.kind === 'cc'
    || e.kind === 'root'
    || e.kind === 'weapon_percent_damage'
    || e.kind === 'heal'
    || e.kind === 'power_burn'
    || (e.kind === 'buff' && (e as { hostile?: boolean }).hostile === true)
  );
}

type DistFn<F> = (a: F, b: F) => number | undefined;

// Hostile chain: primary first, then nearest-within-jump-radius from previous, up to cap. Cite: Spell.cpp
// SCHEME_CLOSEST_CHAIN.
export function selectHostileChainTargets<F>(
  primary: F,
  pool: F[],
  totalCap: number,
  distanceBetween: DistFn<F>,
  jumpRadiusYd: number = CHAIN_SPELL_JUMP_RADIUS_YD,
  sideKey: (f: F) => string = () => '',
  center?: F,
): F[] {
  if (totalCap <= 1) return [primary];
  const remaining = pool.filter((u) => u !== primary);
  const out: F[] = [primary];
  let prev = center ?? primary;
  let need = totalCap - 1;
  while (need > 0 && remaining.length) {
    remaining.sort((a, b) => {
      const da = distanceBetween(prev, a) ?? 0;
      const db = distanceBetween(prev, b) ?? 0;
      if (da !== db) return da - db;
      const ka = sideKey(a);
      const kb = sideKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    let picked = -1;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i]!;
      const d = distanceBetween(prev, cand);
      // Missing geometry → allow (legacy whole-pack tests); present → jump radius gate.
      if (d != null && d > jumpRadiusYd) continue;
      picked = i;
      break;
    }
    if (picked < 0) break;
    const next = remaining.splice(picked, 1)[0]!;
    out.push(next);
    prev = next;
    need--;
  }
  return out;
}

// Friendly chain heal: the primary first, then the lowest-HP ally within jump range of the previous
// one. Full-health allies are deprioritised. Cite: Spell.cpp:1720–1745 ChainHealingOrder.
export function selectFriendlyChainTargets<F extends { hp: number; spec: { maxHealth: number } }>(
  primary: F,
  pool: F[],
  totalCap: number,
  distanceBetween: DistFn<F>,
  jumpRadiusYd: number = CHAIN_SPELL_JUMP_RADIUS_YD,
  sideKey: (f: F) => string = () => '',
  center?: F,
): F[] {
  if (totalCap <= 1) return [primary];
  const remaining = pool.filter((u) => u !== primary);
  const out: F[] = [primary];
  let prev = center ?? primary;
  let need = totalCap - 1;
  const injuryKey = (u: F): number => {
    const max = Math.max(1, u.spec.maxHealth);
    if (u.hp >= max) return 1e9; // full HP last
    return u.hp / max;
  };
  while (need > 0 && remaining.length) {
    remaining.sort((a, b) => {
      const ia = injuryKey(a);
      const ib = injuryKey(b);
      if (ia !== ib) return ia - ib;
      const da = distanceBetween(prev, a) ?? 0;
      const db = distanceBetween(prev, b) ?? 0;
      if (da !== db) return da - db;
      const ka = sideKey(a);
      const kb = sideKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    let picked = -1;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i]!;
      const d = distanceBetween(prev, cand);
      if (d != null && d > jumpRadiusYd) continue;
      picked = i;
      break;
    }
    if (picked < 0) break;
    const next = remaining.splice(picked, 1)[0]!;
    out.push(next);
    prev = next;
    need--;
  }
  return out;
}

// Scale heal / damage effect amounts by `mult` (per-jump falloff product). Cite: Spell.cpp HandleEffect
// DamageMultiplier.
export function scaleSpellEffects(spell: SpellDef, mult: number): SpellDef {
  if (mult === 1) return spell;
  const effects = spell.effects.map((e) => {
    if (e.kind === 'direct_damage' || e.kind === 'dot' || e.kind === 'heal') {
      const min = Math.max(1, Math.round(e.min * mult));
      const max = Math.max(min, Math.round(e.max * mult));
      return { ...e, min, max };
    }
    if (e.kind === 'weapon_percent_damage') {
      return { ...e, pct: Math.max(1, Math.round(e.pct * mult)) };
    }
    return e;
  });
  return { ...spell, effects };
}

// Apply chain jumps after the primary cast resolved, returning how many extra units were hit. Jump i
// scales by mult^(i+1); with no baked multiplier the secondaries still fan at full amount.
export function applyChainFan<F extends { hp: number; spec: { maxHealth: number }; side: string }>(
  src: F,
  primary: F,
  spell: SpellDef,
  pool: F[],
  distanceBetween: DistFn<F>,
  apply: (src: F, tgt: F, spell: SpellDef) => void,
  opts?: { dead?: (f: F) => boolean },
): number {
  if (!wantsChainFan(spell)) return 0;
  const fanned = spell.effects.filter(isChainFannedEffect);
  if (!fanned.length) return 0;
  const cap = aoeTotalTargetCap(spell) ?? 1;
  const livePool = opts?.dead ? pool.filter((u) => !opts.dead!(u)) : pool;
  const startCenter = hasAttrEx2(spell, SPELL_ATTR_EX2.CHAIN_FROM_CASTER) ? src : primary;
  const chain = isFriendlyChainSpell(spell)
    ? selectFriendlyChainTargets(primary, livePool, cap, distanceBetween, CHAIN_SPELL_JUMP_RADIUS_YD, (f) => sideIdSortKey(f.side as never), startCenter)
    : selectHostileChainTargets(primary, livePool, cap, distanceBetween, CHAIN_SPELL_JUMP_RADIUS_YD, (f) => sideIdSortKey(f.side as never), startCenter);
  const mult = chainJumpMultiplier(spell);
  let n = 0;
  let product = 1;
  for (let i = 1; i < chain.length; i++) {
    const other = chain[i]!;
    if (mult != null) product *= mult;
    // Drop rawEffects so resolve cannot re-bake basePoints over our scaled min and max, and zero the
    // chain so a recursive fan cannot re-enter.
    const scaled: SpellDef = {
      ...scaleSpellEffects({ ...spell, effects: fanned }, product),
      rawEffects: undefined,
    };
    apply(src, other, scaled);
    n++;
  }
  return n;
}
