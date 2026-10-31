// Peeled from createSession (createSession.md P7) — pattern (D).
// AOE_FANNED / aoeUnitInRadius / selectAoeSecondaries / castOnTargets.

import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import {
  spellAoeFromCaster,
  isWithinRadiusYd,
  isWithinConeYd,
  coneArcOf,
} from './combatGeometry.ts';
import { SPELL_ATTR_EX, hasAttrEx } from '../spells/spellAttributes.ts';
import { isPersistentAreaEffect } from '../game/dynamicObject.ts';
import {
  isSelfTargetedDot,
  isSelfCenteredAoe,
  isHostileSpellDef,
  isIgnoreLosSpellCast,
  aoeTotalTargetCap,
  sideIdSortKey,
} from './predicates.ts';
import { applyChainFan, wantsChainFan } from './chainFan.ts';
import { onlyOnPlayerRefusesTarget } from './castTargetGates.ts';
import { navSightClear } from './navSight.ts';
import { isEnemySide } from '../core/events.ts';
import {
  planNonCharmAuraOnApply,
} from '../../domain/scriptdev/index.ts';
import { durMs } from '../spells/interpreter/index.ts';
import { planCastSummons, runCastSummons } from './summonCast.ts';
import { INTIMIDATING_SHOUT_SPELL_ID } from '../spells/interpreter/class-scripts-kit.ts';

export function installAoeCast(ctx: CombatContext): void {
  const dead = (f: Fighter): boolean =>
    ((ctx as { dead?: (f: Fighter) => boolean }).dead?.(f) ?? !(f.hp > 0));

  const AOE_FANNED = (e: SpellEffect, spell: SpellDef): boolean => {
    // Ground-pool effects spawn once on the primary cast — do not unit-fan them.
    if (isPersistentAreaEffect(spell, e)) return false;
    // Self-cost DoTs (Hellfire) stay on the caster — never fan to every hostile.
    // Cite: isSelfTargetedDot; SpellTargetDefines TARGET_UNIT_CASTER; KI-878.
    if (e.kind === 'dot' && isSelfTargetedDot(spell, e)) return false;
    // Taunt and threat fan too: Challenging Shout and Roar are pbaoe taunts that used to land on the
    // primary only, which is why the AoE peel never peeled the pack.
    return e.kind === 'direct_damage' || e.kind === 'dot' || e.kind === 'cc' || e.kind === 'root'
      || (e.kind === 'script_handled_noop' && (spell.id | 0) === 28089) // boss_thaddius.cpp:363-400 PBAE Polar Shift
      || e.kind === 'weapon_percent_damage'
      || e.kind === 'taunt' || e.kind === 'mod_taunt' || e.kind === 'threat'
      || (e.kind === 'buff' && e.hostile === true)
      || (e.kind === 'speed' && e.hostile === true)
      || ((e.kind === 'aura_dummy_holder' || e.kind === 'aura_dummy') && e.hostile === true);
  };

  // True when `other` is in AoE radius of the shape origin: the caster for a pbaoe or cone, the
  // primary's position for a ground drop. Sight is tested FROM THE ORIGIN, which is what Classic does.
  const aoeUnitInRadius = (
    src: Fighter,
    primaryTgt: Fighter,
    other: Fighter,
    spell: SpellDef,
  ): boolean => {
    // CheckTarget runs on every AoE member too: ONLY_ON_PLAYER drops the pet, totem or
    // guardian out of Locust Swarm 28786 / Poison Bolt Volley 28796. Cite: Spell.cpp:7074.
    if (onlyOnPlayerRefusesTarget(spell, other)) return false;
    const dest = src.castDest;
    const origin = dest
      ?? (spellAoeFromCaster(spell) ? ctx.posOf(src.side) : ctx.posOf(primaryTgt.side));
    const at = ctx.posOf(other.side);
    // Endless floor always has unit yards; missing coords used to fail OPEN and Cleave /
    // Whirlwind / Magma tagged the whole 48 yd passive stream (Flametongue rode those hits).
    if (ctx.cfg.endless && (origin == null || at == null)) return false;
    if (!isWithinRadiusYd(origin, at, spell.radiusYd)) return false;
    // A cone is an ARC, not a circle: ±30° off facing. Facing: combat target when present; else held move
    // intent while manual (WASD). Cite: Spell.cpp:7585-7591 GetCone default M_PI/3.
    if (spell.aoeShape === 'cone') {
      const casterPos = ctx.posOf(src.side);
      let facingAt = ctx.posOf(primaryTgt.side);
      // A self-cast cone has the caster as its own primary, and a zero-length bearing fails open to a
      // full disc — the arc is the caster's ORIENTATION, which is its victim.
      const sameAsSelf = !facingAt
        || primaryTgt.side === src.side
        || (casterPos != null
          && Math.abs(facingAt.x - casterPos.x) < 1e-6
          && Math.abs(facingAt.y - casterPos.y) < 1e-6);
      if (sameAsSelf && casterPos) {
        const intent = ctx.unitMoveIntents?.get(src.side);
        if (intent && ctx.unitManualMotion?.has(src.side)) {
          // Steering yourself (WASD / click-move): the run direction IS the facing.
          facingAt = { x: casterPos.x + intent.x, y: casterPos.y + intent.y };
        } else {
          const victim = ctx.foeOf?.(src);
          const vp = victim && victim !== src ? ctx.posOf(victim.side) : undefined;
          if (vp) facingAt = vp;
        }
      }
      // Per-spell arc, not the 60° default: 121 of the 129 cone spells disagree with it, and
      // the 3 tail sweeps are REAR cones the default aimed forwards.
      const arc = coneArcOf(spell.coneDeg);
      if (!isWithinConeYd(casterPos, facingAt, at, arc.halfAngleRad, arc.rear)) return false;
    }
    // Self-centered disc: the radius is the gate. Testing LOS on secondaries against the frostbolt
    // focus made a distant target skip the circle, and one false fail froze nobody.
    if (
      ctx.cfg.navLos
      && !isIgnoreLosSpellCast(spell)
      && other !== primaryTgt
      && !isSelfCenteredAoe(spell)
      && !navSightClear(ctx.cfg, origin, at)
    ) return false;
    return true;
  };

  // Eligible AoE secondaries, nearest-first from the fan origin with a deterministic tie-break. The
  // cap counts the primary when it is in radius; an out-of-range primary consumes no slot.
  const selectAoeSecondaries = (
    src: Fighter,
    primaryTgt: Fighter,
    spell: SpellDef,
    pool: Fighter[],
    totalCap: number | null,
  ): Fighter[] => {
    const eligible: Fighter[] = [];
    for (const other of pool) {
      if (other === primaryTgt || dead(other)) continue;
      if (other === src && hasAttrEx(spell, SPELL_ATTR_EX.EXCLUDE_CASTER)) continue; // Spell.cpp:2595
      if (!aoeUnitInRadius(src, primaryTgt, other, spell)) continue;
      eligible.push(other);
    }
    // Primary only reserves a MaxAffectedTargets slot when it is actually in radius.
    const primarySlot = aoeUnitInRadius(src, primaryTgt, primaryTgt, spell) ? 1 : 0;
    const secondaryCap = totalCap == null ? null : Math.max(0, totalCap - primarySlot);
    if (eligible.length <= 1) {
      // 0–1 secondary: order irrelevant; single-enemy / tiny packs keep prior path shape.
      return secondaryCap == null ? eligible : eligible.slice(0, secondaryCap);
    }
    // Distance from fan origin; if missing, fall back; equal → side-id.
    const distKey = (other: Fighter): number => {
      if (spellAoeFromCaster(spell)) {
        const fromCaster = ctx.distanceBetween(src, other);
        if (fromCaster != null) return fromCaster;
      } else {
        const fromPrimary = ctx.distanceBetween(primaryTgt, other);
        if (fromPrimary != null) return fromPrimary;
      }
      const fromCaster = ctx.distanceBetween(src, other);
      if (fromCaster != null) return fromCaster;
      const fromPrimary = ctx.distanceBetween(primaryTgt, other);
      if (fromPrimary != null) return fromPrimary;
      return 0;
    };
    eligible.sort((a, b) => {
      const da = distKey(a);
      const db = distKey(b);
      if (da !== db) return da - db;
      const ka = sideIdSortKey(a.side);
      const kb = sideIdSortKey(b.side);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    if (secondaryCap == null) return eligible;
    return eligible.slice(0, secondaryCap);
  };

  const runAuraOnApplyHelpers = (src: Fighter, primaryTgt: Fighter, spell: SpellDef): void => {
    const applySpell = ctx.applySpell as (a: Fighter, b: Fighter, s: SpellDef, r?: boolean, h?: number) => void;
    const helpers = [...src.spec.spells, ...primaryTgt.spec.spells];
    // The plan re-reads the cast spell's own raw 41/42; applySpell already spawned those
    // through runCastSummons. Skip them here or an effect-42 cast lands its guardians twice.
    const ownSummons = new Set(planCastSummons(src, spell).map((o) => o.creature));
    runCastSummons(ctx, src, spell);
    for (const step of planNonCharmAuraOnApply(spell.id, spell.name, ctx.t, helpers)) {
      if (step.kind === 'summon' && ownSummons.has(step.creatureEntry)) continue;
      if (step.kind === 'set_unattackable') {
        src.unattackableUntil = Math.max(src.unattackableUntil, step.untilMs);
        src.buffActive.add(step.spellId);
        ctx.push({ t: ctx.t, kind: 'aura', actor: src.side, name: step.spellName, applied: true, spellId: step.spellId });
      } else if (step.kind === 'summon') {
        const life = durMs(spell.durationIndex) ?? 0;
        for (let i = 0; i < step.count; i++) {
          const add = ctx.injectSummonForCaster!(src, step.creatureEntry, life);
          if (add && step.isGuardian) {
            add.spec.isGuardian = true;
            if (step.createdBySpell) add.spec.createdBySpell = step.createdBySpell;
          }
        }
      } else if (step.kind === 'cast_helper_spell') {
        const h = helpers.find((s) => s.id === step.spellId);
        if (h) applySpell(src, src, h);
      } else if (step.kind === 'flavor') {
        ctx.push({ t: ctx.t, kind: 'flavor', text: `${src.spec.name} ${step.text}` });
      }
    }
  };

  const castOnTargets = (src: Fighter, primaryTgt: Fighter, spell: SpellDef): void => {
    const applySpell = ctx.applySpell as (a: Fighter, b: Fighter, s: SpellDef, r?: boolean, h?: number) => void;
    // Hostile self-AoE is a disc around the caster. Do not use the same-storey acquire list or the
    // frostbolt focus — both skipped the mobs standing on the mage on the endless floor.
    const hostileOnlySelfAoe = isSelfCenteredAoe(spell)
      && isHostileSpellDef(spell)
      && spell.aoeShape !== 'cone'
      && !spell.effects.some((e) => e.kind === 'heal' || e.kind === 'restore_health');
    if (hostileOnlySelfAoe) {
      const origin = ctx.posOf(src.side);
      const srcEnemy = isEnemySide(src.side);
      const hits: Fighter[] = [];
      for (const other of ctx.fightersOrder()) {
        if (dead(other) || other === src) continue;
        if (isEnemySide(other.side) === srcEnemy) continue;
        if (onlyOnPlayerRefusesTarget(spell, other)) continue;
        if (!isWithinRadiusYd(origin, ctx.posOf(other.side), spell.radiusYd)) continue;
        hits.push(other);
      }
      hits.sort((a, b) => {
        const da = ctx.distanceBetween(src, a) ?? 0;
        const db = ctx.distanceBetween(src, b) ?? 0;
        if (da !== db) return da - db;
        const ka = sideIdSortKey(a.side);
        const kb = sideIdSortKey(b.side);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      const cap = aoeTotalTargetCap(spell);
      const chosen = cap == null ? hits : hits.slice(0, cap);
      for (const tgt of chosen) applySpell(src, tgt, spell, false, chosen.length);
      runAuraOnApplyHelpers(src, chosen[0] ?? primaryTgt, spell);
      return;
    }
    // A self-centered AoE's primary is not exempt from SpellRadius: rangeMax 0 skips the range gate,
    // so without this Frost Nova rooted the focus at any distance. No radius or geometry applies.
    const primaryInRadius = !spell.aoe || aoeUnitInRadius(src, primaryTgt, primaryTgt, spell);
    // Dest-only rain on empty ground: foeOf is the caster. Still apply so the pool
    // spawns; applySpell skips self-harm when dest is set.
    const destOnSelf = src.castDest != null && primaryTgt === src;

    // Endless floor AoE pool: a positive radius takes all hostiles, since the radius gate pulls the
    // nearby passives as Classic does. A missing radius stays free-fire only, never the stream.
    const hostileFanPool = (): Fighter[] => {
      const all = ctx.livingHostilesFor(src);
      if (!ctx.cfg.endless) return all;
      if (spell.radiusYd != null && spell.radiusYd > 0) return all;
      return ctx.freeFireHostilesFor!(src);
    };

    let hitCount = primaryInRadius || destOnSelf ? 1 : 0;
    let secondaries: Fighter[] = [];
    const fanned = spell.effects.filter((e) => AOE_FANNED(e, spell));

    if (spell.aoe && fanned.length) {
      secondaries = selectAoeSecondaries(src, primaryTgt, spell, hostileFanPool(), aoeTotalTargetCap(spell));
      hitCount += secondaries.length;
    }

    if (primaryInRadius || destOnSelf) {
      // Intimidating Shout 5246: the focused target gets the trigger only, so the AoE fear and speed
      // are area-only and skip the primary. Cite: Spell.cpp:7981–7984.
      const primarySpell =
        spell.id === INTIMIDATING_SHOUT_SPELL_ID && fanned.length
          ? {
            ...spell,
            effects: spell.effects.filter((e) => !AOE_FANNED(e, spell)),
          }
          : spell;
      applySpell(src, primaryTgt, primarySpell, false, hitCount);
      if (!destOnSelf) runAuraOnApplyHelpers(src, primaryTgt, spell);
    }

    // Chain jumps (non-aoe). Friendly chain heal is inside applySpellLate. Cite: chainFan.ts.
    if (wantsChainFan(spell) && !spell.aoe) {
      applyChainFan(
        src,
        primaryTgt,
        spell,
        hostileFanPool(),
        ctx.distanceBetween,
        (a, b, sp) => applySpell(a, b, sp), // chain spells resolve targets one by one, hitting the next based on the previous
        { dead },
      );
    }
    if (!spell.aoe || !fanned.length) return;
    const secondary: SpellDef = { ...spell, effects: fanned };
    for (const other of secondaries) {
      applySpell(src, other, secondary, false, hitCount);
    }
  };

  ctx.aoeUnitInRadius = aoeUnitInRadius;
  ctx.selectAoeSecondaries = selectAoeSecondaries;
  ctx.castOnTargets = castOnTargets;
}
