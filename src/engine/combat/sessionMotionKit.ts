// Kit shortlists and live speed for the motion phase, peeled from sessionMotion. Caches are keyed on the
// kit array a fighter carries, since specs share arrays. Extracted modules must not import combat.ts.

import type { SpellDef } from '../../data/schema.ts';
import { isEnemySide, isPlayerCharacterSide } from '../core/events.ts';
import { BASE_RUN_SPEED, MELEE_REACH_YD, kitWantsMeleeBand } from './combatGeometry.ts';
import { AURA_INCREASE_MOUNTED_SPEED } from '../../domain/nav/speed.ts';
import { castableKitIds } from './castableKit.ts';
import { effectiveSpeeds, type SpeedEffect } from '../../domain/nav/speed.ts';
import { MIN_AGGRO_DISTANCE } from '../../domain/creature/creatureAi.ts';
import { woundedSlowdownFactor } from '../../domain/creature/creatureAiConstants.ts';
import { roleOf } from './roles.ts';
import { focusImmunityBlocksSpell } from './predicates.ts';
import { triggeredIdsOf } from './triggeredCompanion.ts';
import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';

/** Closures the kit/speed helpers need from installSessionMotion. */
export interface MotionKitDeps {
  ctx: CombatContext;
  onCooldown: (f: Fighter, spell: SpellDef) => boolean;
  canAfford: (f: Fighter, spell: SpellDef) => boolean;
  isChargeRole: (spell: SpellDef) => boolean;
}

export interface MotionKit {
  /** Kit intent for bow/wand primary — not transient mode (dead-zone weave flips mode to melee). */
  kitRangedAuto: (f: Fighter) => boolean;
  isThreatVictimOf: (enemy: Fighter, f: Fighter) => boolean;
  pbaoeRadiusYd: (f: Fighter) => number;
  longestOffenseRangeYd: (f: Fighter) => number;
  shortOffenseList: (f: Fighter) => SpellDef[];
  wantsMeleeBand: (f: Fighter) => boolean;
  runSpeedYdPerSec: (f: Fighter) => number;
  enemyIsFleeing: (f: Fighter) => boolean;
}

export function createMotionKit(deps: MotionKitDeps): MotionKit {
  const { ctx, onCooldown, canAfford, isChargeRole } = deps;

  // Kit intent for a bow or wand primary, not the transient mode a dead-zone weave flips. Role-gated:
  // a melee unit that merely knows Throw or Shoot must not stop its gap-close at 30 yd and whiff.
  const kitRangedAuto = (f: Fighter): boolean => !!(f.spec.rangedAuto && f.spec.ranged);
  // Is this unit's PLAN ranged? The kit answers for a bow or wand primary; the DB answers for the 704
  // templates whose EventAI runs SET_RANGED_MODE. Cite: UnitAI.cpp:979-994 SetRangedMode.
  const rangedPlan = (f: Fighter): boolean => kitRangedAuto(f)
    || (isEnemySide(f.side) && ctx.enemyCastBySide.get(f.side)?.eventAi.rangedMode === true);

  // `enemy`'s threat manager currently names `f` as its victim. No manager, or a throw, reads as "not the
  // victim" — a unit with no threat table is not chasing anybody.
  const isThreatVictimOf = (enemy: Fighter, f: Fighter): boolean => {
    try {
      const mgr = ctx.threatOf(enemy);
      return !!mgr && mgr.getCurrentVictimId() === f.side;
    } catch { return false; }
  };

  // Bake-constant kit shortlists keyed on the kit array. Walking a 60-150 spell kit per unit per tick
  // from three motion predicates cost 3.5% + 4.6% of tick self time; `len` guards an in-place learn.
  const KIT_NONE: SpellDef[] = [];
  type RangedOffenseKit = { len: number; list: SpellDef[]; maxRangeYd: number };
  const rangedOffenseCache = new WeakMap<SpellDef[], Map<string, RangedOffenseKit>>();
  const rangedOffenseKit = (f: Fighter, hasRealMelee: boolean, rangedAuto: boolean): RangedOffenseKit => {
    const spells = f.spec.spells ?? KIT_NONE;
    let byShape = rangedOffenseCache.get(spells);
    if (byShape === undefined) {
      byShape = new Map();
      rangedOffenseCache.set(spells, byShape);
    }
    const shape = hasRealMelee ? (rangedAuto ? 'ma' : 'm') : (rangedAuto ? 'a' : '');
    const hit = byShape.get(shape);
    if (hit !== undefined && hit.len === spells.length) return hit;
    const list: SpellDef[] = [];
    let maxRangeYd = 0;
    // A TRIGGERED PAYLOAD IS NOT AN OFFENSE THIS UNIT CAN USE: its rangeMax is what the payload reaches
    // (Mark of Detonation 22439 is 50000), and growing the enemy kit moved this max on 92 creatures.
    const triggered = triggeredIdsOf(spells);
    // A spell the unit cannot reach is not an offense either - same argument as the triggered
    // ids, one population over. Cite: castableKit.ts.
    const castableR = castableKitIds(f, ctx.spellOf);
    for (const s of spells) {
      if (triggered.has(s.id)) continue;
      if (castableR && !castableR.has(s.id | 0)) continue;
      const role = roleOf(s);
      const rangedOffense = role === 'nuke' || role === 'dot'
        || (role === 'shoot' && (!hasRealMelee || rangedAuto));
      if (!rangedOffense) continue;
      const r = s.rangeMax ?? 0;
      if (r > maxRangeYd) maxRangeYd = r;
      if (r > MIN_AGGRO_DISTANCE) list.push(s);
    }
    const built = { len: spells.length, list, maxRangeYd };
    byShape.set(shape, built);
    return built;
  };
  const kitHasChargeCache = new WeakMap<SpellDef[], { len: number; v: boolean }>();
  const kitHasCharge = (f: Fighter): boolean => {
    const spells = f.spec.spells ?? KIT_NONE;
    const hit = kitHasChargeCache.get(spells);
    if (hit !== undefined && hit.len === spells.length) return hit.v;
    const v = spells.some((s) => isChargeRole(s));
    kitHasChargeCache.set(spells, { len: spells.length, v });
    return v;
  };

  // Largest PBAoE radius in the kit, 0 for none; ground rains are excluded because their density is at
  // the target. Cached per kit array for the same reason as the ranged shortlist.
  const pbaoeRadiusCache = new WeakMap<SpellDef[], { len: number; r: number }>();
  const pbaoeRadiusYd = (f: Fighter): number => {
    const spells = f.spec.spells ?? KIT_NONE;
    const hit = pbaoeRadiusCache.get(spells);
    if (hit !== undefined && hit.len === spells.length) return hit.r;
    let r = 0;
    // Same rule as the ranged shortlist: a payload's disc is not this unit's own reach. 13 creatures
    // moved on the kit growth (Walking Bomb 7915 from 0 to 10); the only consumer today is party-side.
    const triggered = triggeredIdsOf(spells);
    // A spell the unit cannot reach is not an offense either - same argument as the triggered
    // ids, one population over. Cite: castableKit.ts.
    const castableR = castableKitIds(f, ctx.spellOf);
    for (const s of spells) {
      if (triggered.has(s.id)) continue;
      if (castableR && !castableR.has(s.id | 0)) continue;
      if (!s.aoe || s.aoeShape === 'ground') continue;
      // Name fallback when the bake omits aoeShape on a ground rain.
      const nm = (s.name ?? '').toLowerCase();
      if (nm === 'blizzard' || nm === 'rain of fire' || nm === 'flamestrike' || nm === 'hurricane') {
        continue;
      }
      const rr = s.radiusYd ?? 0;
      if (rr > r) r = rr;
    }
    pbaoeRadiusCache.set(spells, { len: spells.length, r });
    return r;
  };

  // The focus when it can refuse a school, else null. Almost nothing can, so the kit walks below
  // only run against an elemental or a bubble, and every other tick pays one mask read.
  const schoolImmuneFoeOf = (f: Fighter): Fighter | null => {
    const foe = ctx.foeOf?.(f);
    if (!foe || foe === f) return null;
    const masks = (foe.immunity?.schoolImmuneMask ?? 0) | (foe.immunity?.damageImmuneMask ?? 0)
      | (foe.spec.schoolImmuneMask ?? 0);
    return masks !== 0 ? foe : null;
  };

  // A focus that refuses the WHOLE offense kit (Vek'nilash to a frost mage) changes nothing: the
  // caster holds where it stood, which is what a raid wants. Only a partial wall re-aims motion at
  // what still lands. Cite: twinUppercut capability (casters at 30 yd take no Uppercut).
  const immuneFoeWithAnOpening = (f: Fighter): Fighter | null => {
    const foe = schoolImmuneFoeOf(f);
    if (!foe) return null;
    for (const s of rangedOffenseKit(f, (f.spec.weapon?.dmgMax ?? 0) > 0, rangedPlan(f)).list) {
      if (!focusImmunityBlocksSpell(s, foe, 1)) return foe;
    }
    for (const s of shortOffenseList(f)) if (!focusImmunityBlocksSpell(s, foe, 1)) return foe;
    return null;
  };

  // Reach of what can actually land: a shaman parked at Lightning Bolt's 40 yd from a Rock Elemental
  // never came inside Flame Shock's 20.
  const longestOffenseRangeYd = (f: Fighter): number => {
    const kit = rangedOffenseKit(f, (f.spec.weapon?.dmgMax ?? 0) > 0, rangedPlan(f));
    const foe = immuneFoeWithAnOpening(f);
    if (!foe) return kit.maxRangeYd;
    let r = 0;
    for (const s of kit.list) {
      if (focusImmunityBlocksSpell(s, foe, 1)) continue;
      if ((s.rangeMax ?? 0) > r) r = s.rangeMax ?? 0;
    }
    return r;
  };

  /** Judgement / Holy Shock — foe offense not in rangedOffenseKit (nuke/dot/shoot only). */
  type ShortOffenseKit = { len: number; list: SpellDef[] };
  const shortOffenseCache = new WeakMap<SpellDef[], ShortOffenseKit>();
  const shortOffenseList = (f: Fighter): SpellDef[] => {
    const spells = f.spec.spells ?? KIT_NONE;
    const hit = shortOffenseCache.get(spells);
    if (hit !== undefined && hit.len === spells.length) return hit.list;
    const list: SpellDef[] = [];
    for (const s of spells) {
      const role = roleOf(s);
      if (role !== 'judgement' && role !== 'instant_nuke') continue;
      if ((s.rangeMax ?? 0) > MELEE_REACH_YD + 1) list.push(s);
    }
    shortOffenseCache.set(spells, { len: spells.length, list });
    return list;
  };

  // True when the fighter has a ranged nuke or dot off CD and affordable now, range ignored — this
  // answers "is the ranged plan still available?". Hybrid trash with a bolt on CD gap-closes.
  const hasCastableRangedOffense = (f: Fighter): boolean => {
    const hasRealMelee = (f.spec.weapon?.dmgMax ?? 0) > 0;
    const rangedAuto = rangedPlan(f);
    // Only cooldown/cost are live here; which spells even COUNT as ranged offense is a bake
    // constant, and re-deriving it walked the whole kit through roleOf per unit per tick.
    // Immunity is live too: a Fireball the focus shrugs off held a fire mage at range forever.
    const foe = immuneFoeWithAnOpening(f);
    for (const s of rangedOffenseKit(f, hasRealMelee, rangedAuto).list) {
      if (onCooldown(f, s)) continue;
      if (!canAfford(f, s)) continue;
      if (foe && focusImmunityBlocksSpell(s, foe, 1)) continue;
      return true;
    }
    return false;
  };

  // Melee-oriented when weapon auto is the main plan. "Any ranged nuke means stay at rangeMax" stranded
  // enhancement shamans at 30 yd forever. Shared with seed classification so both agree.
  const wantsMeleeBand = (f: Fighter): boolean => {
    return kitWantsMeleeBand({
      // Kit flag, not live mode — dead-zone weave sets mode='melee' but motion must still retreat.
      rangedAuto: rangedPlan(f),
      groupRole: f.spec.groupRole,
      classId: f.spec.classId,
      weaponDmgMax: f.spec.weapon?.dmgMax,
      spells: f.spec.spells,
      castable: castableKitIds(f, ctx.spellOf),
      hasCharge: kitHasCharge(f),
      hasCastableRangedOffense: hasCastableRangedOffense(f),
      standYards: f.spec.standYards,
    });
  };

  // Live move-speed auras bucketed for UpdateSpeed — only the real move aura families, since an
  // attack-speed slow must not slow the walk-in. The empty list is shared and only ever read.
  const NO_SPEED_EFFECTS: SpeedEffect[] = Object.freeze([]) as unknown as SpeedEffect[];
  const fighterSpeedEffects = (f: Fighter): SpeedEffect[] => {
    // Allocated an array (and a row per aura) for every unit every tick to answer "no speed aura" in almost
    // every fight. The scan is over this unit's bucket now, so bail before allocating anything.
    let out: SpeedEffect[] | null = null;
    // Enchant and talent speed are permanent, so they join their own bucket every time and get
    // MAXed against Sprint / Rocket Boots / a powerup rather than adding to them.
    for (const p of f.spec.permanentSpeedAuras ?? []) {
      (out ??= []).push({ aura: p.aura, pct: p.pct });
    }
    if (f.spec.mount) (out ??= []).push({ aura: AURA_INCREASE_MOUNTED_SPEED, pct: f.spec.mount.speedPct });
    for (const e of ctx.effectsOn(f.side)) {
      if (e.kind !== 'speed') continue;
      if (e.aura == null) continue;
      (out ??= []).push({ aura: e.aura, pct: e.pct ?? 0 });
    }
    return out ?? NO_SPEED_EFFECTS;
  };

  // Gap-close speed is the fighter's LIVE speed auras, not a bare constant: a -50% snare doubles the
  // walk-in, which is the whole value of a snare before the first white swing. Cite: Unit.cpp:8325.
  const runSpeedYdPerSec = (f: Fighter): number => {
    if (f.speedDirty) {
      const live = fighterSpeedEffects(f);
      const speed = live.length === 0
        ? BASE_RUN_SPEED
        : effectiveSpeeds({ effects: live, mounted: f.spec.mount != null }).run;
      f.speedCache = speed;
      f.speedDirty = false;
    }
    return f.speedCache * woundedSlowdown(f);
  };

  // Wounded slowdown: a creature under 30% health chases down to 0.50x at 0 hp, and only 369 of 10,384
  // templates opt out. Below: EventAI / critter flee, which drives the same generator fear does.
  const enemyIsFleeing = (f: Fighter): boolean => {
    if (!isEnemySide(f.side)) return false;
    const cs = ctx.enemyCastBySide.get(f.side as import('../core/events.ts').EnemySide);
    return !!cs?.eventAi.fleeing;
  };

  const woundedSlowdown = (f: Fighter): number => {
    if (isPlayerCharacterSide(f.side)) return 1;
    const max = f.spec.maxHealth;
    if (!(max > 0)) return 1;
    return woundedSlowdownFactor((f.hp / max) * 100, f.spec.staticFlags2 ?? 0);
  };

  return {
    kitRangedAuto,
    isThreatVictimOf,
    pbaoeRadiusYd,
    longestOffenseRangeYd,
    shortOffenseList,
    wantsMeleeBand,
    runSpeedYdPerSec,
    enemyIsFleeing,
  };
}
