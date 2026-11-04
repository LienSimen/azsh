// Peeled from createSession (Wave 4 S30) — CC + DR + charm/root break cluster.
// Pattern (D): install methods onto CombatContext; no import of combat.ts.

import type { CombatContext } from './context.ts';
import type { ActiveEffect, Fighter } from './types.ts';
import type {
  BuffMod,
  ControlKind,
  Mechanic,
  School,
  SpellDef,
  SpellEffect,
} from '../../data/schema.ts';
import { CREATURE_TYPE } from '../../data/schema.ts';
import { isCreatureImmuneToSpell, isMechanicImmune } from '../../domain/creature/creatureAi.ts';
import {
  diminishingGroupForMechanic,
  isDiminishingReturnsGroupDurationDiminished,
  isSubjectToDiminishingLevels,
} from '../../domain/spells/diminishing.ts';
import { SPELL_ATTR_EX3, hasAttrEx3 } from '../spells/spellAttributes.ts';
import { consumeProcCharge } from '../spells/auraStacking.ts';
import { isSingleTargetSpell, isSingleTargetSpellPair } from '../spells/singleTargetAura.ts';
import { isAllySide, isEnemySide, type EnemySide, type Side } from '../core/events.ts';
import {
  applyImmunityAura,
  removeImmunityAura,
  AURA_TYPE,
  MECHANIC,
  SPELL_SCHOOL_MASK_ALL,
  mechanicBit,
  mechanicIdFromName,
  type ImmunityAura,
} from '../spells/immunity.ts';
import { schoolMaskFromSchool } from '../spells/procs.ts';
// The Wave 4 peel left these three unbound — every reference below threw ReferenceError.
import { TUNING, ccDamageBreakChance, drFactor } from './formulas.ts';
import { applyBuffMod } from './fighterFactory.ts';
import { isHostileSpeedEffect } from './speedAura.ts';
import { tickHeartbeatResist, type HeartbeatHolder } from './heartbeatResist.ts';
import {
  getAuraScript,
  isPossessInvSpell,
  notePossessLanded,
  possessInvSpellIds,
} from '../../domain/scriptdev/index.ts';
import { AURA_INTERRUPT } from '../../domain/spells/stealth.ts';
import { stealthProcAllowedForSpell } from '../spells/interpreter/class-scripts-kit.ts';
import {
  SPELL_INTERRUPT_FLAG_DAMAGE_PUSHBACK,
  SPELL_INTERRUPT_FLAG_DAMAGE_CANCELS,
  SPELL_PREVENTION_TYPE,
} from '../spells/interrupt.ts';
import { nextPushbackDelayMs, resistsPushback } from '../../domain/spells/spellPushback.ts';
import {
  channelInterruptCtx,
  expireChannelIfDone,
  interruptChannel,
  isPushbackSubject,
  onChannelOwnerDamaged,
} from './channel.ts';
import { delayGroundPoolsForSpell } from '../game/dynamicObject.ts';
import {
  SPELL_AURA_AOE_CHARM,
  SPELL_AURA_MOD_POSSESS,
} from '../spells/interpreter/opcodes.ts';

// Outgoing-charm uniqueness. Same TakeCharmOf path; the C++ advertised flag + caster type. Cite:
// SpellAuras.cpp HandleModCharm :2301–2307; HandleAoECharm :2346–2348 (de8f729).
function charmOutgoingPolicy(opts: {
  playerCaster: boolean;
  aoeCharm: boolean;
  possessUnique: boolean;
}): 'break_outgoing' | 'offload' | 'refuse' | 'coexist' {
  // AoE charm: non-advertised — co-exists with other charms.
  // Cite: SpellAuras.cpp:2346–2348 TakeCharmOf(target, GetId(), false).
  if (opts.aoeCharm) return 'coexist';
  // Player advertised charm is unique: BreakCharmOutgoing(true) then TakeCharmOf.
  // Cite: SpellAuras.cpp:2304–2305.
  if (opts.playerCaster) return 'break_outgoing';
  // Possess / Anastari single guid: refuse a second land.
  // Cite: SpellAuras.cpp:2219–2222; boss_baroness_anastari.cpp:64.
  if (opts.possessUnique) return 'refuse';
  // NPC MOD_CHARM: overwrite advertised by offloading the existing one (Chromatic Mutation).
  // Cite: SpellAuras.cpp:2301–2303; Unit.cpp:11345–11348.
  return 'offload';
}

export type CcEffect = Extract<SpellEffect, { kind: 'cc' }>;

// The key a mechanic's CC-IMMUNITY window is stored under — NOT its diminishing-returns group. This
// table used to double as that one, which made polymorph, sleep and sap diminish each other.
export const CC_IMMUNE_KEY: Record<Mechanic, string> = {
  none: 'none',
  charm: 'charm',
  disoriented: 'incapacitate',
  disarm: 'disarm',
  distract: 'none',
  fear: 'fear',
  fumble: 'none',
  root: 'root',
  pacify: 'none',
  silence: 'silence',
  sleep: 'incapacitate',
  snare: 'root',
  stun: 'stun',
  freeze: 'stun',
  knockout: 'stun',
  bleed: 'none',
  bandage: 'none',
  polymorph: 'incapacitate',
  banish: 'banish',
  shield: 'none',
  shackle: 'incapacitate',
  mount: 'none',
  persuade: 'none',
  turn: 'fear',
  horror: 'fear',
  invulnerability: 'none',
  interrupt: 'silence',
  daze: 'root',
  discovery: 'none',
  immune_shield: 'none',
  sap: 'incapacitate',
};

// The diminishing-returns group for a mechanic. Apply uniqueness skips snare, daze and disoriented:
// the C++ leaves them ungrouped and then skips the unique set.
export const drGroupOf = (mechanic: Mechanic): string => diminishingGroupForMechanic(mechanic);

// The diminishing step already taken on this unit's group, or 0 once the window lapsed. Read BEFORE
// applyDr advances it — heartbeat resist scales by the level the aura lands at.
export function drStepOf(tgt: Fighter, mechanic: Mechanic, now: number): number {
  const rec = tgt.dr.get(drGroupOf(mechanic));
  return rec && rec.resetAt > now ? rec.step : 0;
}

export const CASTER_LOCK: ControlKind[] = ['stun', 'fear', 'incapacitate', 'silence'];

// The Fighter timer each control kind locks out. Charm and snare own no lockout timer of their own.
const CONTROL_TIMER = {
  stun: 'stunnedUntil',
  fear: 'fearedUntil',
  incapacitate: 'incapUntil',
  silence: 'silencedUntil',
  disarm: 'disarmedUntil',
  root: 'rootedUntil',
} as const;

/** The control a live aura row locks out, or undefined when it locks none. */
const controlOfLiveEffect = (e: ActiveEffect): ControlKind | undefined =>
  e.kind === 'cc' ? e.control : e.kind === 'root' ? 'root' : undefined;

// Spell 12939 "Polymorph Heal Effect" — why a sheep comes back at full health. Every polymorph holder
// pushes it, healing a tenth of max health a second, and it is also the whole of IsPolymorphed.
const POLYMORPH_HEAL_SPELL_ID = 12939;
const POLYMORPH_HEAL_NAME = 'Polymorph Heal Effect';
const POLYMORPH_HEAL_PCT_OF_MAX = 10;
const POLYMORPH_HEAL_TICK_MS = 1000;

// The mechanic bitmask a LIVE aura counts as, for the immunity purge. ActiveEffect.mechanic is cc-only,
// so a root and a hostile snare must be derived from the KIND or the purge side is dead.
export function mechanicMaskOfLiveEffect(e: ActiveEffect): number {
  if (e.kind === 'cc') return mechanicBit(mechanicIdFromName(e.mechanic));
  // Prefer stamped mechanic on the live row; fall back to kind defaults.
  if (e.kind === 'root') {
    return mechanicBit(mechanicIdFromName(e.mechanic) || MECHANIC.ROOT);
  }
  // Beneficial / self speed (Aspect/Sprint/Stealth cost) are not snares — hostile only.
  // Cite: speedAura.ts isHostileSpeedEffect; SpellAuras.cpp:2907–2917 MOD_DECREASE_SPEED.
  if (e.kind === 'speed' && isHostileSpeedEffect(e)) {
    return mechanicBit(mechanicIdFromName(e.mechanic) || MECHANIC.SNARE);
  }
  return 0;
}

export function installCrowdControl(ctx: CombatContext): void {
  const touchEffect = (e: ActiveEffect): void => { ctx.touchEffect(e); };
  // The fighter holding `side`, or undefined once it has left the session. This walked the enemy
  // array then the ally array then the pet, which is the store's own answer spelled four ways.
  const fighterBySide = (side: Side): Fighter | undefined => ctx.sideFighter?.(side);
  const fadeEffectNow = (e: ActiveEffect): void => {
    e.broken = true;
    e.expiresAt = Math.min(e.expiresAt, ctx.t);
    touchEffect(e);
  };
  // Charm is NOT hard control — possessed units still act (against former allies).
  // Cite: charm-possess.md TakeCharmOf (PetAI / side-switch, not stun).
  ctx.isControlledHard = (f: Fighter): boolean =>
    f.stunnedUntil > ctx.t || f.fearedUntil > ctx.t || f.incapUntil > ctx.t;
  // Holding CC our own damage would destroy — Polymorph, Sap, Gouge, Shackle, Blind. A STUN is
  // deliberately not counted, and neither is fear: this is only "do not auto-target the sheep".
  ctx.ccProtected = (f: Fighter): boolean => {
    const t = ctx.t;
    if (!(f.incapUntil > t || f.stunnedUntil > t)) return false;
    return ctx.effectsOn(f.side).some(
      (e) => e.kind === 'cc' && !e.broken && e.expiresAt > t && e.breakOnDamage === true,
    );
  };
  // Can `spell` be cast despite the hard control on the caster? CheckCasterAuras lets one through when
  // its own immunity matches the blocking mechanic — that is how a feared player pops the insignia.
  ctx.spellCancelsOwnControl = (f: Fighter, spell: SpellDef): boolean => {
    let immuneMask = 0;
    for (const e of spell.effects) {
      if (e.kind === 'mechanic_immunity') immuneMask |= mechanicBit(e.mechanic | 0);
    }
    if (immuneMask === 0) return false;
    // Every live hard-control row on this unit must be one the spell purges — a second,
    // unmatched control still prevents the cast (foundNotMechanic in the C++ loop).
    let sawControl = false;
    for (const e of ctx.effectsOn(f.side)) {
      if (e.expiresAt <= ctx.t || e.broken) continue;
      const m = mechanicMaskOfLiveEffect(e);
      if (m === 0) continue;
      // Only the states that actually block acting; a snare never stopped a cast.
      if (e.kind !== 'cc') continue;
      sawControl = true;
      if ((m & immuneMask) === 0) return false;
    }
    return sawControl;
  };
  ctx.isControlled = (f: Fighter): boolean => {
    const t = ctx.t;
    return (ctx.isControlledHard as (f: Fighter) => boolean)(f)
      || f.rootedUntil > t || f.silencedUntil > t || f.disarmedUntil > t
      || f.pacifiedUntil > t || ctx.isCharmed(f);
  };
  ctx.controlActive = (f: Fighter, c: ControlKind): boolean => {
    const t = ctx.t;
    return c === 'stun' ? f.stunnedUntil > t : c === 'fear' ? f.fearedUntil > t
      : c === 'incapacitate' ? f.incapUntil > t : c === 'silence' ? f.silencedUntil > t
        : c === 'disarm' ? f.disarmedUntil > t : c === 'charm' ? ctx.isCharmed(f)
          : c === 'root' ? f.rootedUntil > t
            // Snare = hostile speed aura (MECHANIC_SNARE). Cite: mechanicMaskOfLiveEffect;
            //   speedAura.ts isHostileSpeedEffect (hostile:false self-slows are not snares).
            : c === 'snare' ? ctx.effectsOn(f.side).some(
              (e) => e.kind === 'speed' && e.expiresAt > t && !e.broken
                && isHostileSpeedEffect(e),
            )
              : false;
  };
  // The most-severe active control for the UI badge / "can't act" banner (root is surfaced by the
  // separate `rooted` flag, so it's not repeated here). Charm shows as Possessed (acts, flipped).
  ctx.activeControl = (f: Fighter): { control: ControlKind; until: number } | null =>
    f.stunnedUntil > ctx.t ? { control: 'stun', until: f.stunnedUntil }
      : f.fearedUntil > ctx.t ? { control: 'fear', until: f.fearedUntil }
        : f.incapUntil > ctx.t ? { control: 'incapacitate', until: f.incapUntil }
          : ctx.isCharmed(f) ? { control: 'charm', until: f.charmedUntil }
            : f.silencedUntil > ctx.t ? { control: 'silence', until: f.silencedUntil }
              : f.disarmedUntil > ctx.t ? { control: 'disarm', until: f.disarmedUntil }
                : null;

  // Refused because the main hand is unusable — the DISARM gate. The rule is the spell's own
  // requires-main-hand bit, not what it looks like: ranged and off-hand are exempt, on-next-swing is not.
  ctx.isWeaponAction = (s: SpellDef): boolean => !!s.requiresMainHandWeapon;
  // A control-breaker usable under the control on this unit, by two paths: a cleanse with no hostile
  // cc, or a mechanic immunity that purges the active CC. Will of the Forsaken under a stun is false.
  const breakerShape = new WeakMap<SpellDef, { cc: boolean; cleanse: boolean; mechImm: boolean }>();
  const breakerShapeOf = (s: SpellDef): { cc: boolean; cleanse: boolean; mechImm: boolean } => {
    let hit = breakerShape.get(s);
    if (hit) return hit;
    hit = {
      cc: s.effects.some((e) => e.kind === 'cc'),
      cleanse: s.effects.some((e) => e.kind === 'cleanse'),
      mechImm: s.effects.some((e) => e.kind === 'mechanic_immunity'),
    };
    breakerShape.set(s, hit);
    return hit;
  };
  ctx.isBreaker = (s: SpellDef, f?: Fighter): boolean => {
    const shape = breakerShapeOf(s);
    if (shape.cc) return false;
    const hasCleanse = shape.cleanse;
    const hasMechImm = shape.mechImm;
    if (!hasCleanse && !hasMechImm) return false;

    // Type-only: cleanse always; mechanic_immunity only when it covers a hard-CC mechanic
    // (stun/fear/sleep/charm/knockout/freeze/sap — not root/snare alone like Free Action).
    if (!f) {
      if (hasCleanse) return true;
      return s.effects.some((e) => {
        if (e.kind !== 'mechanic_immunity') return false;
        const m = e.mechanic | 0;
        return m === MECHANIC.STUN || m === MECHANIC.FEAR || m === MECHANIC.SLEEP
          || m === MECHANIC.CHARM || m === MECHANIC.KNOCKOUT || m === MECHANIC.FREEZE
          || m === MECHANIC.SAPPED || m === MECHANIC.HORROR || m === MECHANIC.BANISH
          || m === MECHANIC.SHACKLE || m === MECHANIC.POLYMORPH || m === MECHANIC.DISORIENTED;
      });
    }

    // Path 2 first: mechanic_immunity that cancels every live hard-control row.
    // spellCancelsOwnControl already encodes foundNotMechanic (stun+fear vs Blink → false).
    if (
      hasMechImm
      && (ctx.spellCancelsOwnControl as (unit: Fighter, spell: SpellDef) => boolean)(f, s)
    ) {
      return true;
    }

    // Path 1: cleanse strip list (WotF fear-only under stun → false).
    if (!hasCleanse) return false;
    const strip = new Set<ControlKind>();
    for (const e of s.effects) {
      if (e.kind === 'cleanse') {
        for (const c of e.controls ?? []) strip.add(c);
      }
    }
    const hard = (ctx.isControlledHard as (x: Fighter) => boolean)(f);
    if (hard) {
      if (f.stunnedUntil > ctx.t && !strip.has('stun')) return false;
      if (f.fearedUntil > ctx.t && !strip.has('fear')) return false;
      if (f.incapUntil > ctx.t && !strip.has('incapacitate')) return false;
      return true;
    }
    if (ctx.isCharmed(f)) return strip.has('charm');
    return false;
  };

  // Immunity: an active category immunity, the only-types gating, and undead MOBS immune to ordinary
  // fear. The polymorph creature-type gate is whole-spell off the baked mask, not a hard type list.
  ctx.ccImmune = (tgt: Fighter, mechanic: Mechanic, onlyTypes?: number[]): boolean => {
    const cat = CC_IMMUNE_KEY[mechanic] ?? 'none';
    if ((tgt.ccImmuneUntil.get(cat) ?? 0) > ctx.t) return true;
    if (onlyTypes && !onlyTypes.includes(tgt.creatureType)) return true;
    if (mechanic === 'fear' && !onlyTypes && tgt.creatureType === CREATURE_TYPE.UNDEAD && tgt.side !== 'player') return true;
    // Template MechanicImmuneMask (Creature::IsImmuneToSpell / IsImmuneToSpellEffect).
    if (isMechanicImmune(tgt.spec.mechanicImmuneMask, mechanic)) return true;
    return false;
  };

  /** SchoolImmuneMask / MechanicImmuneMask / creature_immunities dispel set vs the spell. */
  ctx.spellTemplateImmune = (tgt: Fighter, spell: SpellDef): boolean =>
    isCreatureImmuneToSpell(
      {
        schoolImmuneMask: tgt.spec.schoolImmuneMask,
        mechanicImmuneMask: tgt.spec.mechanicImmuneMask,
        immunities: tgt.spec.immunities,
      },
      spell,
    );

  // Diminishing returns: each repeat within a category is halved, then quartered, then immune, with
  // the window resetting after the last wears off. Two gates — do LEVELS apply, and is duration scaled.
  ctx.applyDr = (src: Fighter, tgt: Fighter, mechanic: Mechanic, baseMs: number): number => {
    const key = drGroupOf(mechanic);
    const rec = tgt.dr.get(key);
    const step = rec && rec.resetAt > ctx.t ? rec.step : 0;
    // Unit.cpp ApplyDiminishingToDuration: pvp = both UNIT_FLAG_PLAYER_CONTROLLED.
    const isPvp =
      (src.spec.isPlayerOrPet ?? (src.side === 'player' || src.side === 'pet' || isAllySide(src.side))) &&
      (tgt.spec.isPlayerOrPet ?? (tgt.side === 'player' || tgt.side === 'pet' || isAllySide(tgt.side)));

    // DRTYPE_PLAYER vs creatures: full duration forever; never track/advance steps.
    // Cite: Spell.cpp ~1440 — IncrDiminishing gated on IsSubjectToDiminishingLevels.
    if (!isSubjectToDiminishingLevels(key, isPvp)) {
      return baseMs;
    }

    const durationDim = isDiminishingReturnsGroupDurationDiminished(key, isPvp);
    const factor = durationDim ? drFactor(step) : 1;
    const durMs = Math.round(baseMs * factor);
    // When duration is not diminished, keep the full base for the reset clock. Levels still advance,
    // so the step clock keeps progressing for groups that ARE subject to them.
    const clockMs = durationDim ? durMs : baseMs;
    tgt.dr.set(key, { step: step + 1, resetAt: ctx.t + clockMs + TUNING.drResetMs });
    return durMs;
  };

  // Apply an immunity aura: purge the matching live effects, fold the state, mirror the effect row.
  // Peeled with the CC cluster because the ScriptDev charm helpers need it; applySpell uses it too.
  ctx.grantImmunityAura = (
    owner: Fighter,
    aura: ImmunityAura,
    expiresAt: number,
    name: string,
    source: Side,
  ): void => {
    // Include the CC mechanic bits so a mechanic immunity can purge matching live CC through the
    // apply-time removal. Cite: SpellAuras.cpp HandleModMechanicImmunity.
    const now = ctx.t;
    const removable = ctx.effectsOn(owner.side)
      .filter((e) => e.expiresAt > now)
      .map((e) => ({
        spellId: e.spellId,
        schoolMask: e.school ? schoolMaskFromSchool(e.school) : 0,
        mechanicMask: mechanicMaskOfLiveEffect(e),
        // The aura's own spell Dispel column — the dispel-immunity branch matches on it. Resolved
        // through the same helper the dispel effect uses, so immunity and Cleanse cannot disagree.
        dispelType: ctx.dispelTypeOfSpell!(e.spellId),
        positive: e.kind === 'buff' || e.kind === 'school_absorb' || e.kind === 'mana_shield',
      }));
    const res = applyImmunityAura(owner.immunity, aura, removable);
    owner.immunity = res.state;
    // Drop purged spell instances through the canonical holder-remove, the C++ call the purge is
    // specified in terms of. A hand-rolled splice left a purged root's timer set with no aura.
    for (const spellId of res.removedSpellIds) {
      ctx.removeAurasDueToSpell!(owner, spellId);
    }
    if (
      aura.positive &&
      (aura.auraType === AURA_TYPE.EFFECT_IMMUNITY ||
        (aura.auraType === AURA_TYPE.SCHOOL_IMMUNITY && aura.immunityPurgesEffect))
    ) {
      ctx.removeAurasWithInterruptFlags?.(owner, AURA_INTERRUPT.INVULNERABILITY_BUFF_CANCELS, 'invulnerability');
    }

    // Refresh immunity mirror effect.
    const live = ctx.effectsOn(owner.side).find(
      (e) => e.kind === 'immunity' && e.spellId === aura.spellId,
    );
    const charges = (aura.charges != null && aura.charges > 0) ? aura.charges : undefined;
    const immunityMechanics = aura.mechanic != null && aura.mechanic > 0
      ? [aura.mechanic]
      : undefined;
    if (live) {
      live.expiresAt = expiresAt;
      if (charges != null) live.charges = charges;
      if (immunityMechanics) live.immunityMechanics = immunityMechanics;
      touchEffect(live);
    } else {
      ctx.effects.push({
        kind: 'immunity',
        source,
        target: owner.side,
        spellId: aura.spellId,
        name,
        expiresAt,
        ...(charges != null ? { charges } : {}),
        ...(immunityMechanics ? { immunityMechanics } : {}),
      });
    }
    owner.buffActive.add(aura.spellId);
  };

  ctx.consumeChargedImmunityOnMechanicBlock = (
    owner: Fighter,
    mechanic: Mechanic | string,
  ): void => {
    const want = mechanicIdFromName(mechanic);
    if (want <= 0) return;
    const t = ctx.t;
    const mine = ctx.effectsOn(owner.side);
    for (let i = mine.length - 1; i >= 0; i--) {
      const e = mine[i]!;
      if (e.kind !== 'immunity') continue;
      if (e.charges == null || e.charges <= 0) continue;
      if (e.expiresAt <= t) continue;
      const mechs = e.immunityMechanics ?? [];
      if (!mechs.includes(want)) continue;
      const { remaining, remove } = consumeProcCharge(e.charges);
      if (remove) {
        ctx.removeAurasDueToSpell?.(owner, e.spellId);
      } else {
        e.charges = remaining;
      }
      return;
    }
  };

  // ScriptDev aura-driven charm helpers, the Anastari Possess pattern. The side-switch stays and the
  // hardcoded spell ids are retired — the IR owns the helpers now.
  const resolveAuraUnit = (
    on: 'aura_target' | 'caster',
    caster: Fighter,
    target: Fighter,
  ): Fighter => (on === 'caster' ? caster : target);

  const applyHelperSpellEffects = (
    src: Fighter,
    tgt: Fighter,
    helper: SpellDef,
    until: number,
  ): void => {
    // Apply resolvable combat effects from helper SpellDef (triggered).
    // Cite: AnastariPossess OnApply CastSpell TRIGGERED_OLD_TRIGGERED.
    if (tgt.buffActive.has(helper.id)) return;
    for (const he of helper.effects ?? []) {
      if (he.kind === 'buff' && he.mod) {
        applyBuffMod(tgt, he.mod as BuffMod, he.amount ?? 0, he.school);
        ctx.effects.push({
          kind: 'buff',
          source: src.side,
          target: tgt.side,
          spellId: helper.id,
          name: helper.name,
          mod: he.mod,
          amount: he.amount ?? 0,
          expiresAt: until,
        });
        ctx.push({ t: ctx.t, kind: 'aura', actor: tgt.side, name: helper.name, applied: true });
      } else if (he.kind === 'heal_max_health') {
        tgt.hp = tgt.spec.maxHealth;
      } else if (he.kind === 'school_immunity') {
        (ctx.grantImmunityAura as Function)(tgt, {
          spellId: helper.id,
          auraType: AURA_TYPE.SCHOOL_IMMUNITY,
          schoolMask: he.schoolMask ?? SPELL_SCHOOL_MASK_ALL,
          positive: he.positive !== false,
          durationMs: Math.max(0, until - ctx.t),
        }, until, helper.name, src.side);
        ctx.push({ t: ctx.t, kind: 'aura', actor: tgt.side, name: helper.name, applied: true });
      } else if (he.kind === 'cc' && he.control === 'stun') {
        tgt.stunnedUntil = Math.max(tgt.stunnedUntil, until);
        ctx.effects.push({
          kind: 'cc',
          source: src.side,
          target: tgt.side,
          spellId: helper.id,
          name: helper.name,
          school: he.school ?? 'shadow',
          control: 'stun',
          mechanic: he.mechanic ?? 'stun',
          expiresAt: until,
        });
        ctx.push({ t: ctx.t, kind: 'aura', actor: tgt.side, name: helper.name, applied: true });
      }
    }
    tgt.buffActive.add(helper.id);
  };

  const runAuraScriptActions = (
    actions: readonly import('../../domain/scriptdev/types.ts').ScriptDevAuraAction[] | undefined,
    caster: Fighter,
    target: Fighter,
    until: number,
  ): void => {
    if (!actions) return;
    for (const act of actions) {
      if (act.kind === 'cast_helper') {
        const unit = resolveAuraUnit(act.on, caster, target);
        let helper =
          caster.spec.spells.find((s) => s.id === act.spellId)
          ?? target.spec.spells.find((s) => s.id === act.spellId)
          ?? ctx.spellOf?.(act.spellId);
        if (!helper) continue;

        if (act.basepoints !== undefined) {
          helper = {
            ...helper,
            effects: helper.effects?.map((e, i) => i === 0 ? { ...e, min: act.basepoints!, max: act.basepoints!, amount: act.basepoints! } : e),
            rawEffects: helper.rawEffects?.map((e, i) => i === 0 ? { ...e, basePoints: act.basepoints! - 1 } : e),
          };
        }

        // CMaNGOS CastSpell(TRIGGERED_OLD_TRIGGERED) — land the real holder (17250 school immune + invis +
        // stun), not a bake-stun stub. Cite: boss_baroness_anastari.cpp:188-189.
        if (ctx.applySpell) ctx.applySpell(caster, unit, helper);
        else applyHelperSpellEffects(caster, unit, helper, until);
      } else if (act.kind === 'remove_auras') {
        const unit = resolveAuraUnit(act.on, caster, target);
        ctx.removeAurasDueToSpell!(unit, act.spellId);
      } else if (act.kind === 'heal_full') {
        const unit = resolveAuraUnit(act.on, caster, target);
        unit.hp = unit.spec.maxHealth;
      } else if (act.kind === 'set_unattackable') {
        const unit = resolveAuraUnit(act.on, caster, target);
        unit.unattackableUntil = Math.max(unit.unattackableUntil, until);
        unit.stunnedUntil = Math.max(unit.stunnedUntil, until);
      } else if (act.kind === 'clear_unattackable') {
        const unit = resolveAuraUnit(act.on, caster, target);
        unit.unattackableUntil = 0;
        if (unit.stunnedUntil > ctx.t) unit.stunnedUntil = ctx.t;
      } else if (act.kind === 'break_charm_if_hp_below') {
        if (ctx.isCharmed(target) && target.hp <= target.spec.maxHealth * act.frac) {
          ctx.breakCharm!(target);
        }
      } else if (act.kind === 'flavor') {
        const who = act.text.includes('vanishes') ? caster : target;
        ctx.push({ t: ctx.t, kind: 'flavor', text: `${who.spec.name} ${act.text}` });
      }
    }
  };

  const stripPossessInv = (unit: Fighter, invId: number): void => {
    if (!invId) return;
    ctx.removeAurasDueToSpell!(unit, invId);
    unit.immunity = removeImmunityAura(unit.immunity, invId);
    unit.buffActive.delete(invId);
    unit.unattackableUntil = 0;
    if (unit.stunnedUntil > ctx.t) unit.stunnedUntil = ctx.t;
    // Splice leftover 17250 stun rows — view treats every kind:cc as a debuff chip.
    // Cite: boss_baroness_anastari.cpp:196 RemoveAurasDueToSpell(SPELL_POSSESS_INV).
    for (let i = ctx.effects.length - 1; i >= 0; i--) {
      const e = ctx.effects[i]!;
      if (e.spellId === invId && e.target === unit.side) ctx.effects.splice(i, 1);
    }
  };

  const fighterOnSide = (side: Fighter['side'] | null | undefined): Fighter | null => {
    if (side == null) return null;
    return ctx.sideFighter?.(side) ?? null;
  };

  const stripOrphanPossessInv = (): void => {
    const invIds = possessInvSpellIds();
    if (invIds.length === 0) return;
    const order = ctx.fightersOrder();
    const heldBy = new Map<Fighter, number[]>();
    const add = (unit: Fighter, id: number): void => {
      const arr = heldBy.get(unit);
      if (arr) {
        if (!arr.includes(id)) arr.push(id);
      } else {
        heldBy.set(unit, [id]);
      }
    };
    let anyCharm = false;
    for (const unit of order) {
      if (ctx.isCharmed(unit)) anyCharm = true;
      for (const id of invIds) if (unit.buffActive.has(id)) add(unit, id);
    }
    // Idle 40-man: no Anastari, no inv chip. Skip the per-seat effect walk.
    if (heldBy.size === 0 && !anyCharm) return;
    for (const unit of order) {
      for (const e of ctx.effectsOn(unit.side)) {
        if (e.spellId == null || !isPossessInvSpell(e.spellId)) continue;
        add(unit, e.spellId);
      }
    }
    if (heldBy.size === 0) return;
    for (const [unit, held] of heldBy) {
      const ownedLive = order.some(
        (u) => u !== unit && u.hp > 0 && ctx.isCharmed(u) && u.charmedBy === unit.side,
      );
      if (ownedLive) continue;
      for (const id of held) stripPossessInv(unit, id);
    }
  };

  ctx.dropIdlePossessInv = (): void => {
    const order = ctx.fightersOrder();
    for (const u of order) {
      if (!ctx.isCharmed(u) || u.charmPeriodicAt <= 0 || ctx.t < u.charmPeriodicAt) continue;
      const as = getAuraScript(u.charmSpellId);
      if (!as?.periodMs || !as.onPeriodic) {
        u.charmPeriodicAt = 0;
        continue;
      }
      u.charmPeriodicAt = ctx.t + as.periodMs;
      const owner = fighterOnSide(u.charmedBy);
      if (owner) runAuraScriptActions(as.onPeriodic, owner, u, u.charmedUntil);
    }
    stripOrphanPossessInv();
  };

  ctx.breakCharm = (f: Fighter): void => {
    const spellId = f.charmSpellId;
    const charmerSide = f.charmedBy;
    const hadCharm = ctx.isCharmed(f) || f.charmedBy != null || f.charmedUntil > 0 || spellId !== 0;
    const auraScript = spellId ? getAuraScript(spellId) : undefined;
    const charmer = fighterOnSide(charmerSide);

    if (!hadCharm) {
      stripOrphanPossessInv();
      return;
    }

    // Clear charm flags first so removeAurasDueToSpell does not re-enter breakCharm.
    f.charmedUntil = 0;
    f.charmedBy = null;
    f.charmSpellId = 0;
    f.charmBreakHpFrac = 0;
    f.charmPeriodicAt = 0;
    ctx.bumpPool?.(); // faction flip undoes — friendly/hostile pools

    // ScriptDev onRemove (strip Possessed / Possess Inv). Cite: AnastariPossess apply=false.
    if (auraScript && charmer) {
      runAuraScriptActions(auraScript.onRemove, charmer, f, ctx.t);
    }

    // set_unattackable is not an ActiveEffect — RemoveAurasDueToSpell(17250) must
    // still drop the vanish window. Cite: boss_baroness_anastari.cpp:102,110,196.
    const invId = auraScript?.possessInvSpellId ?? 0;
    if (charmer && invId) stripPossessInv(charmer, invId);
    else stripOrphanPossessInv();

    if (charmer && isEnemySide(charmer.side) && !ctx.isUnattackable(charmer)) {
      if (ctx.playerFocusFighter === f || ctx.isUnattackable(ctx.playerFocusFighter)) {
        ctx.playerFocusFighter = charmer;
      }
      if (ctx.explicitEnemyFocus == null || ctx.explicitEnemyFocus === charmer.side) {
        ctx.explicitEnemyFocus = charmer.side;
      }
    }

    for (const e of ctx.effectsOn(f.side)) {
      if (e.kind === 'cc' && e.control === 'charm' && !e.broken) {
        fadeEffectNow(e);
      }
      // Wider than the row above on purpose: Seduction is control:'stun' with mechanic charm, and
      // breaking the charm must fade it too.
      if (
        e.kind === 'cc' && e.mechanic === 'charm' && !e.broken
        && (e.spellId === spellId || spellId === 0)
      ) {
        fadeEffectNow(e);
      }
    }
    ctx.push({ t: ctx.t, kind: 'control', target: f.side, control: 'charm', applied: false });

    // Strip remaining holder-spell residues (e.g. 17244 max_health +2000).
    // Cite: RemoveAurasDueToSpell(SPELL_POSSESS); GAPS C.4 +HP strip on break.
    if (spellId) {
      ctx.removeAurasDueToSpell!(f, spellId);
    }
  };

  // TakeCharmOf side-switch, not an incapacitate, in both directions: enemy to player, and player to
  // enemy for Enslave Demon or a Mind Control thrall. Cite: Unit.cpp:11328; SpellAuras.cpp:2282.
  const applyCharm = (src: Fighter, tgt: Fighter, spell: SpellDef, eff: CcEffect, durMs: number, heartbeat?: HeartbeatHolder | null): void => {
    // Not charm / possess yourself — HandleModCharm and HandleModPossess both return.
    // Cite: SpellAuras.cpp:2289–2291, :2195–2197; charm-possess.md.
    if (src === tgt || src.side === tgt.side) return;
    const playerCaster = !isEnemySide(src.side);
    const rawAuras = (spell.rawEffects ?? []).map((r) => (r.auraName | 0));
    const outgoing = charmOutgoingPolicy({
      playerCaster,
      aoeCharm: rawAuras.includes(SPELL_AURA_AOE_CHARM),
      possessUnique: rawAuras.includes(SPELL_AURA_MOD_POSSESS)
        || Boolean(getAuraScript(spell.id)?.possessInvSpellId),
    });
    for (const u of ctx.fightersOrder()) {
      if (u === tgt) continue;
      if (ctx.isCharmed(u) && u.charmedBy === src.side) {
        if (outgoing === 'break_outgoing') ctx.breakCharm!(u);
        else if (outgoing === 'refuse') return;
        // coexist / offload: keep the existing charm (private set / advertised offload).
        // Cite: Unit.cpp:11345–11351 TakeCharmOf advertised offload vs m_charmedUnitsPrivate.
      }
    }
    if (ctx.isCharmed(tgt)) ctx.breakCharm!(tgt);
    // Clear residual hard-CC timers — charm is PetAI thrall, not stun/incap.
    tgt.incapUntil = Math.min(tgt.incapUntil, ctx.t);
    tgt.stunnedUntil = Math.min(tgt.stunnedUntil, ctx.t);
    const until = ctx.t + durMs;
    tgt.charmedBy = src.side;
    tgt.charmedUntil = until;
    tgt.charmSpellId = spell.id;
    tgt.charmBreakHpFrac = 0;
    tgt.charmPeriodicAt = 0;
    tgt.castingSpell = null; // interrupt current cast on possess (cancel() takes no power)
    tgt.castCost = 0;
    tgt.castCostPower = undefined;
    ctx.bumpPool?.(); // TakeCharmOf faction flip — friendly/hostile pools

    // ScriptDev AuraScript extras (possess chain, HP break frac, unattackable).
    // Cite: boss_baroness_anastari.cpp AnastariPossess; registry auraScripts.
    const auraScript = getAuraScript(spell.id);
    if (auraScript) {
      if (auraScript.charmBreakHpFrac != null && auraScript.charmBreakHpFrac > 0) {
        tgt.charmBreakHpFrac = auraScript.charmBreakHpFrac;
      }
      if (auraScript.periodMs != null && auraScript.periodMs > 0) {
        tgt.charmPeriodicAt = ctx.t + auraScript.periodMs;
      }
      runAuraScriptActions(auraScript.onApply, src, tgt, until);
      // Arm possess-end timer on ScriptDev runtime when inv helper is present.
      const cs = isEnemySide(src.side)
        ? ctx.enemyCastBySide.get(src.side as EnemySide)
        : undefined;
      if (cs?.scriptDev && auraScript.possessInvSpellId) {
        notePossessLanded(cs.scriptDev, tgt.side);
        // Vanish makes the boss unattackable, so pin the focus on the possessed body — the party
        // burns it down instead of standing on the invisible caster.
        ctx.playerFocusFighter = tgt;
        if (ctx.explicitEnemyFocus === src.side) ctx.explicitEnemyFocus = null;
      }
    }

    ctx.effects.push({
      kind: 'cc', source: src.side, target: tgt.side, spellId: spell.id, name: spell.name,
      school: eff.school, control: 'charm', mechanic: 'charm', breakOnDamage: eff.breakOnDamage,
      expiresAt: until,
      ...(heartbeat ? { heartbeat } : {}),
    });
    ctx.push({ t: ctx.t, kind: 'control', target: tgt.side, control: 'charm', applied: true, name: spell.name });

    // Enemy-to-player solo softlock: possess with no hostiles left breaks the charm, the Anastari
    // leash. A player thrall stays, since a 1v1 thrall is a valid pet state.
    if (!playerCaster && ctx.livingHostilesFor(tgt).length === 0) {
      ctx.breakCharm!(tgt);
    }
  };

  /** Attach / extend the 12939 boost holder. Cite: HandleSpellSpecificBoosts(apply=true). */
  const applyPolymorphHeal = (src: Fighter, tgt: Fighter, until: number): void => {
    const live = ctx.effectsOn(tgt.side).find(
      (e) => e.kind === 'restore_health' && e.spellId === POLYMORPH_HEAL_SPELL_ID
        && !e.broken,
    );
    if (live) {
      live.expiresAt = Math.max(live.expiresAt, until);
      live.broken = false;
      ctx.bumpEffectsVersion();
      touchEffect(live);
      return;
    }
    ctx.effects.push({
      kind: 'restore_health',
      source: src.side,
      target: tgt.side,
      spellId: POLYMORPH_HEAL_SPELL_ID,
      name: POLYMORPH_HEAL_NAME,
      // pctOfMax drives floor(maxHealth × 10 / 100) per tick in the stepSession restore pass.
      pctOfMax: POLYMORPH_HEAL_PCT_OF_MAX,
      tickMs: POLYMORPH_HEAL_TICK_MS,
      nextTickAt: ctx.t + POLYMORPH_HEAL_TICK_MS,
      expiresAt: until,
    });
    // Deliberately NOT in buffActive: 12939 is hiddenClientside, so it ticks without a chip.
  };

  // Drop the polymorph heal holder once no polymorph aura is left: the boost is removed with the aura
  // that pushed it, so a sheep broken at 3 s stops healing at 3 s.
  const dropPolymorphHealIfFree = (f: Fighter): void => {
    const t = ctx.t;
    const stillPoly = ctx.effectsOn(f.side).some(
      (e) => e.kind === 'cc' && !e.broken && e.expiresAt > t && e.mechanic === 'polymorph',
    );
    if (stillPoly) return;
    for (const e of ctx.effectsOn(f.side)) {
      if (
        e.kind !== 'restore_health' || e.spellId !== POLYMORPH_HEAL_SPELL_ID
        || e.broken
      ) continue;
      fadeEffectNow(e);
    }
  };

  // Drop ONE spell's holder off a unit, the way the tracked-aura map does it — unlike breakControl,
  // which drops every caster's row of that control. Cite: Unit.cpp:4801 RemoveAurasDueToSpell(itr).
  const removeTrackedHolder = (f: Fighter, spellId: number): boolean => {
    // The lockout each control slot of THIS holder was carrying, read before the rows go.
    let held: Map<ControlKind, number> | null = null;
    for (const e of ctx.effectsOn(f.side)) {
      if (e.spellId !== spellId || e.broken) continue;
      const c = controlOfLiveEffect(e);
      if (c) (held ??= new Map()).set(c, Math.max(held.get(c) ?? 0, e.expiresAt));
    }
    if (!(ctx.removeAurasDueToSpell?.(f, spellId) ?? 0)) return false;
    for (const [c, until] of held ?? []) {
      const key = CONTROL_TIMER[c as keyof typeof CONTROL_TIMER];
      if (key) {
        let rest = 0;
        for (const e of ctx.effectsOn(f.side)) {
          if (e.broken || controlOfLiveEffect(e) !== c) continue;
          rest = Math.max(rest, e.expiresAt);
        }
        // Only the lockout this holder was carrying comes down: an AI immobilize that set the timer
        // with no aura row behind it keeps its own. Cite: crowdControl breakRootOnDamage sawRootAura.
        if (f[key] <= until) f[key] = rest;
      }
      if (c === 'root') ctx.push({ t: ctx.t, kind: 'root', target: f.side, applied: false });
      else ctx.push({ t: ctx.t, kind: 'control', target: f.side, control: c, applied: false });
    }
    dropPolymorphHealIfFree(f);
    return true;
  };

  // A tracked aura sits on ONE target per caster, so landing it elsewhere drops the seat it held —
  // 71 baked rows, Fear to Hunter's Mark. Cite: Unit.cpp:4774-4830; SpellMgr.h:2230, :2261.
  ctx.trackedAuraSeats = (src: Fighter, spell: SpellDef): { side: Side; spellId: number }[] => {
    if (!isSingleTargetSpell(spell)) return [];
    const seats: { side: Side; spellId: number }[] = [];
    const seen = new Set<string>();
    for (const e of ctx.effectsFrom(src.side)) {
      if (e.broken || e.expiresAt <= ctx.t) continue;
      if (seen.has(`${e.target}/${e.spellId}`)) continue;
      // The caster's own kit first, then the global store — `spellOf` is absent in fixtures.
      // Cite: dispelReflect.ts:330 the same two-step lookup.
      const other = e.spellId === spell.id
        ? spell
        : src.spec.spells.find((s) => s.id === e.spellId) ?? ctx.spellOf?.(e.spellId);
      if (!other) continue;
      const chain = ctx.spellChainOf;
      const first = chain?.(other.id)?.first;
      const sameChain = first != null && first === chain?.(spell.id)?.first;
      if (!isSingleTargetSpellPair(other, spell, sameChain)) continue;
      // A seat on a body that has died is free: the holder's rows go with it.
      const holder = fighterBySide(e.target);
      if (!holder || !(holder.hp > 0)) continue;
      seen.add(`${e.target}/${e.spellId}`);
      seats.push({ side: e.target, spellId: e.spellId });
    }
    return seats;
  };

  ctx.purgeTrackedAuraTargets = (src: Fighter, tgt: Fighter, spell: SpellDef): number => {
    let purged = 0;
    for (const seat of ctx.trackedAuraSeats!(src, spell)) {
      if (seat.side === tgt.side) continue;
      const holder = fighterBySide(seat.side);
      if (holder && removeTrackedHolder(holder, seat.spellId)) purged++;
    }
    return purged;
  };

  // Land a control: set its lockout timer, cut short an in-progress cast if it locks casting, and
  // push both the ActiveEffect mirror (drives expiry + view.debuffs) and the applied event.
  ctx.applyControl = (src: Fighter, tgt: Fighter, spell: SpellDef, eff: { control: ControlKind; mechanic: Mechanic; school?: School; breakOnDamage?: boolean }, durMs: number, heartbeat?: HeartbeatHolder | null): void => {
    const ccEff = eff as CcEffect;
    // The charm family takes the side-switch in both directions. Seduction is a stun with a charm
    // mechanic and must stay one, so this reads `control`, never the mechanic alone.
    if (eff.control === 'charm') {
      applyCharm(src, tgt, spell, ccEff, durMs, heartbeat);
      return;
    }

    const until = ctx.t + durMs;
    const control = eff.control;
    if (control === 'stun') tgt.stunnedUntil = Math.max(tgt.stunnedUntil, until);
    else if (control === 'fear') tgt.fearedUntil = Math.max(tgt.fearedUntil, until);
    else if (control === 'incapacitate') tgt.incapUntil = Math.max(tgt.incapUntil, until);
    else if (control === 'silence') tgt.silencedUntil = Math.max(tgt.silencedUntil, until);
    else if (control === 'disarm') tgt.disarmedUntil = Math.max(tgt.disarmedUntil, until);
    else if (control === 'root') tgt.rootedUntil = Math.max(tgt.rootedUntil, until);
    // Silence only cancels silence-prevention casts (SpellAuras HandleAuraModSilence).
    // Stun/fear/incap always cut the cast (CASTER_LOCK).
    if (tgt.castingSpell && CASTER_LOCK.includes(control)) {
      if (control === 'silence') {
        const prev = (tgt.castingSpell.preventionType ?? 0) | 0;
        // Prefer baked field: only cancel when PreventionType == SILENCE.
        // Absent preventionType: cancel (legacy bakes / tests without the field).
        if (prev === SPELL_PREVENTION_TYPE.SILENCE || tgt.castingSpell.preventionType == null) {
          tgt.castingSpell = null;
        }
      } else {
        tgt.castingSpell = null;
      }
      // Cancelled cast → Spell::cancel(), which never takes power. Drop the held cost.
      if (!tgt.castingSpell) { tgt.castCost = 0; tgt.castCostPower = undefined; }
    }
    // The same lock takes the CHANNEL down, and only the damage branch existed for that — a stunned
    // caster kept channelling Mind Flay for its full duration. Cite: Unit.cpp:10010 SetStunned.
    if (tgt.channeling && CASTER_LOCK.includes(control)) {
      const prev = (tgt.channeling.spell.preventionType ?? 0) | 0;
      const silenceStops = prev === SPELL_PREVENTION_TYPE.SILENCE
        || tgt.channeling.spell.preventionType == null;
      if (control !== 'silence' || silenceStops) interruptChannel(tgt, channelInterruptCtx(ctx));
    }
    // The same diminishing group is mutual exclusion on apply: a second root replaces the first
    // rather than running beside it. Scoped to a DIFFERENT spell id, or one cast would purge its rider.
    {
      const group = drGroupOf(eff.mechanic);
      // SpellMgr.cpp:2684-2709 does not list snare / daze / disoriented, so they are
      // DIMINISHING_NONE; Unit.cpp:4980 then skips uniqueness (`if (drGroup && …)`).
      if (group !== 'none' && eff.mechanic !== 'snare' && eff.mechanic !== 'daze'
        && eff.mechanic !== 'disoriented') {
        let purge: Set<ControlKind> | null = null;
        for (const e of ctx.effectsOn(tgt.side)) {
          if (e.kind !== 'cc' || e.broken) continue;
          if (e.spellId === spell.id || e.expiresAt <= ctx.t) continue;
          if (!e.mechanic || !e.control) continue;
          if (e.mechanic === 'snare' || e.mechanic === 'daze' || e.mechanic === 'disoriented') {
            continue;
          }
          if (drGroupOf(e.mechanic) !== group) continue;
          (purge ??= new Set()).add(e.control);
        }
        if (purge) for (const c of purge) ctx.breakControl!(tgt, c);
      }
    }
    // The caster's own seat for this aura moves here: the sheep on the last mob drops.
    ctx.purgeTrackedAuraTargets!(src, tgt, spell);
    ctx.effects.push({
      kind: 'cc', source: src.side, target: tgt.side, spellId: spell.id, name: spell.name,
      // Fall back to the spell's school: cc effects often bake without one, and the frozen state plus the
      // school-immunity purge both read GetSpellSchoolMask(proto). Cite: SpellAuras.cpp:2463-2464; :3013.
      school: eff.school ?? spell.school, control, mechanic: eff.mechanic, breakOnDamage: eff.breakOnDamage,
      expiresAt: until,
      ...(heartbeat ? { heartbeat } : {}),
    });
    // The sheep regenerates. Keyed on the SPELL's Mechanic, exactly as the C++ boost is. The bake labels
    // every MOD_CONFUSE 'polymorph', so a baked spell only counts with a real EffectMechanic 17: Jandice's
    // Spread 17774 (mechanic 0) healed her to full on every hide. Hand-built fixtures keep the label.
    const polyMechanic = spell.rawEffects
      ? spell.rawEffects.some((r) => (r.mechanic ?? 0) === MECHANIC.POLYMORPH)
      : eff.mechanic === 'polymorph';
    if (spell.mechanic === 'polymorph' || polyMechanic) {
      applyPolymorphHeal(src, tgt, until);
    }
    ctx.push({ t: ctx.t, kind: 'control', target: tgt.side, control, applied: true, name: spell.name });
  };

  // One heartbeat-resist pass over every armed holder. Safe inside the effect sweep, since a break
  // flags the mirror instead of splicing. A fight with no heartbeat spell takes no extra draw.
  let heartbeatScanAt = -1;
  let anyHeartbeat = false;
  ctx.tickHeartbeatResists = (): void => {
    const ver = ctx.effectsVersion();
    if (ver === heartbeatScanAt && !anyHeartbeat) return;
    anyHeartbeat = false;
    for (const e of ctx.effects) {
      if (!e.heartbeat || e.broken) continue;
      anyHeartbeat = true;
      if (e.expiresAt <= ctx.t) continue;
      if (!tickHeartbeatResist(e.heartbeat, ctx.t, ctx.rng)) continue;
      const holder = fighterBySide(e.target);
      if (!holder) continue;
      // RemoveSpellAuraHolder — reuse breakControl so timers, siblings and the faded event stay one path.
      // Cite: SpellAuras.cpp:6021-6026.
      if (e.kind === 'root') ctx.breakControl!(holder, 'root');
      else if (e.kind === 'speed') ctx.breakControl!(holder, 'snare');
      else if (e.kind === 'cc' && e.control) ctx.breakControl!(holder, e.control);
    }
    heartbeatScanAt = ver;
  };
  ctx.breakControl = (f: Fighter, control: ControlKind): void => {
    if (control === 'charm') {
      ctx.breakCharm!(f);
      return;
    }
    if (control === 'stun') f.stunnedUntil = 0;
    else if (control === 'fear') f.fearedUntil = 0;
    else if (control === 'incapacitate') f.incapUntil = 0;
    else if (control === 'silence') f.silencedUntil = 0;
    else if (control === 'disarm') f.disarmedUntil = 0;
    else if (control === 'root') f.rootedUntil = 0;
    let faded = false;
    let rootFaded = false;
    let snareFaded = false;
    // Holders whose cc slot just went — their remaining slots go with it (below).
    let holders: Set<number> | null = null;
    for (const e of ctx.effectsOn(f.side)) {
      if (e.kind === 'cc' && e.control === control && !e.broken) {
        fadeEffectNow(e); faded = true;
        (holders ??= new Set()).add(e.spellId);
      }
      // Root effects land as kind:'root' (mapAura MOD_ROOT), not kind:'cc' control:root.
      if (control === 'root' && e.kind === 'root' && !e.broken) {
        fadeEffectNow(e); rootFaded = true;
      }
      // Snares land as a hostile speed aura, not as cc. Cite: SharedDefines MECHANIC_SNARE=11;
      // SpellEffects.cpp EffectDispelMechanic (Escape Artist slot 2).
      if (
        control === 'snare'
        && e.kind === 'speed'
        && !e.broken
        && isHostileSpeedEffect(e)
      ) {
        fadeEffectNow(e);
        snareFaded = true;
      }
    }
    // A break removes the HOLDER, not one slot. Fear lands its cc and a +25% run aura under one spell
    // id, so fading only the cc row left the icon up and the victim faster while free to swing.
    if (holders) {
      for (const e of ctx.effectsOn(f.side)) {
        if (e.broken || !holders.has(e.spellId)) continue;
        if (e.kind === 'cc' || e.kind === 'root') continue;
        fadeEffectNow(e);
      }
    }
    dropPolymorphHealIfFree(f);
    if (faded) ctx.push({ t: ctx.t, kind: 'control', target: f.side, control, applied: false });
    if (rootFaded) ctx.push({ t: ctx.t, kind: 'root', target: f.side, applied: false });
    if (snareFaded) ctx.push({ t: ctx.t, kind: 'control', target: f.side, control: 'snare', applied: false });
  };

  // A damaging hit ROLLS against each live root; it does not shatter it. The aura-26 proc is the same
  // handler fear uses — a 200-damage swing on a level-60 mob is about 15%, not 100%.
  const breakRootOnDamage = (f: Fighter, fromSpellId?: number, amount = 0): void => {
    if (f.rootedUntil <= ctx.t) return;
    let broke = false;
    let keepUntil = 0;
    let sawRootAura = false;
    const breakChance = ccDamageBreakChance(f.spec.level, amount);
    for (const e of ctx.effectsOn(f.side)) {
      if (e.broken) continue;
      const isRoot = e.kind === 'root' || (e.kind === 'cc' && e.control === 'root');
      if (!isRoot) continue;
      sawRootAura = true;
      // Same spell that applied the root does not break it (Frost Nova's own damage + root).
      if (fromSpellId != null && e.spellId === fromSpellId) {
        if (e.expiresAt > ctx.t) keepUntil = Math.max(keepUntil, e.expiresAt);
        continue;
      }
      // White swing the same 100 ms tick as apply is not a later AttackerStateUpdate.
      // Cite: Spell.cpp DoAllEffectOnTarget then melee timer; KI-1062.
      if (e.appliedAt != null && e.appliedAt === ctx.t) {
        if (e.expiresAt > ctx.t) keepUntil = Math.max(keepUntil, e.expiresAt);
        continue;
      }
      if (!ctx.rng.chance(breakChance)) {
        if (e.expiresAt > ctx.t) keepUntil = Math.max(keepUntil, e.expiresAt);
        continue;
      }
      fadeEffectNow(e);
      broke = true;
    }
    // Only rewrite the root timer when spell-root auras were present: an AI immobilize sets it with
    // no root effect and must survive white swings.
    if (sawRootAura) {
      f.rootedUntil = keepUntil;
      if (broke) ctx.push({ t: ctx.t, kind: 'root', target: f.side, applied: false });
    }
  };

  // Called from every damage site. CC flagged break-on-damage shatters, a charm without the flag
  // survives, fear rolls, and roots roll above. Same-spell damage never drops its own CC.
  const breakBreakableCcOnDamage = (f: Fighter, fromSpellId?: number, attacker?: Fighter): void => {
    /** Shatter one control timer when its mirrors carry breakOnDamage. */
    const shatter = (
      control: ControlKind,
      timerKey: 'incapUntil' | 'stunnedUntil' | 'silencedUntil' | 'disarmedUntil',
    ): void => {
      if (f[timerKey] <= ctx.t) return;
      let broke = false;
      let keepUntil = 0;
      let sawAura = false;
      for (const e of ctx.effectsOn(f.side)) {
        if (e.kind !== 'cc' || e.control !== control || e.broken) continue;
        sawAura = true;
        // Own package damage does not cancel the aura (Iron Grenade etc.).
        if (fromSpellId != null && e.spellId === fromSpellId) {
          if (e.expiresAt > ctx.t) keepUntil = Math.max(keepUntil, e.expiresAt);
          continue;
        }
        // Only shatter when the flag is explicitly true — absent/false (charm, HoJ) holds.
        if (e.breakOnDamage === true) {
          fadeEffectNow(e);
          broke = true;
          // Our own damage took the CC off, so remember the caster and its rule stops re-applying it.
          // Only when the hit came from the other faction — a boss AoE is not the party's choice.
          if (!attacker || ctx.factionOf(attacker.side) !== ctx.factionOf(f.side)) {
            (f.ccDamageBrokenBy ??= new Set<Side>()).add(e.source);
          }
        } else if (e.expiresAt > ctx.t) {
          keepUntil = Math.max(keepUntil, e.expiresAt);
        }
      }
      // Only rewrite the timer when mirrors were present. set_unattackable stuns with no cc
      // effect (:624) and damage must not clear it. Cite: boss_baroness_anastari.cpp:188-189.
      if (!sawAura) return;
      f[timerKey] = keepUntil;
      if (broke) ctx.push({ t: ctx.t, kind: 'control', target: f.side, control, applied: false });
    };
    shatter('incapacitate', 'incapUntil');
    shatter('stun', 'stunnedUntil');
    shatter('silence', 'silencedUntil');
    shatter('disarm', 'disarmedUntil');
    dropPolymorphHealIfFree(f);
  };

  ctx.onDamaged = (
    f: Fighter,
    amount: number,
    damageType?: string,
    fromSpellId?: number,
    info?: { absorbed?: number; attacker?: Fighter; skipChannelDelay?: boolean },
  ): void => {
    const absorbed = info?.absorbed ?? 0;
    // Unit.cpp:915–917 — interrupt when takenOrAbsorbedDamage, not only leftover HP.
    if (amount <= 0 && absorbed <= 0) return;
    const treatAsPeriodic = fromSpellId != null && hasAttrEx3(ctx.spellOf?.(fromSpellId), SPELL_ATTR_EX3.TREAT_AS_PERIODIC);
    const stripAuras = ctx.removeAurasWithInterruptFlags;
    // Earthbind 3600 does not break Stealth. Cite: Rogue.cpp:47-52 OnCheckProc false.
    if (stripAuras && stealthProcAllowedForSpell(fromSpellId ?? 0)) {
      let actionInterruptFlags = AURA_INTERRUPT.DAMAGE;
      if (damageType !== 'dot') {
        actionInterruptFlags |= AURA_INTERRUPT.NON_PERIODIC_DAMAGE;
      }
      stripAuras(f, actionInterruptFlags, 'damage');
    }
    if (f.incapUntil > ctx.t || f.stunnedUntil > ctx.t || f.silencedUntil > ctx.t || f.disarmedUntil > ctx.t) {
      breakBreakableCcOnDamage(f, fromSpellId, info?.attacker);
    }
    // Independent of the shatter above: fear is its own holder with its own roll, so a unit that is
    // stunned AND feared must still roll it. As an else-if, any stun made the fear damage-immune.
    if (
      amount > 0
      && f.fearedUntil > ctx.t
      && ctx.rng.chance(ccDamageBreakChance(f.spec.level, amount))
    ) ctx.breakControl!(f, 'fear');
    // Independent of incap/fear: each root rolls its own damage-break (not the applying spell).
    if (amount > 0) breakRootOnDamage(f, fromSpellId, amount);
    // Channel cancel / pushback on damage (Unit.cpp:1285–1302; Spell.cpp DelayedChannel).
    if (f.channeling) {
      expireChannelIfDone(f, ctx.t);
      if (f.channeling) {
        onChannelOwnerDamaged(f, {
          t: ctx.t,
          selfDamage: info?.attacker === f,
          hpDamage: amount,
          absorbed,
          skipChannelDelay: info?.skipChannelDelay,
          treatAsPeriodic,
          damageType,
          chance01: (p) => ctx.rng.chance(p),
          notLoseCastingTimePct: f.channeling.notLoseCastingTimePct | 0,
          push: (ev) => ctx.push(ev),
          removeAurasDueToSpell: (u, id) => (ctx.removeAurasDueToSpell?.(u, id) ?? 0),
          bySide: fighterBySide,
          delaySpellAuras: (u, spellId, delayMs) => {
            for (const e of ctx.effectsOn(u.side)) {
              if (e.spellId !== spellId || e.broken) continue;
              e.expiresAt = Math.max(ctx.t, e.expiresAt - delayMs);
              touchEffect(e);
            }
          },
          delayDynamicObjects: (spellId, delayMs) => {
            const hits = delayGroundPoolsForSpell(
              ctx.groundPools,
              f.side,
              spellId,
              delayMs,
              (side) => ctx.effectsOn(side).some(
                (e) => e.spellId === spellId && e.source === f.side && !e.broken,
              ),
            );
            for (const { pool, delayAuras } of hits) {
              ctx.touchGroundPool(pool);
              for (const side of delayAuras) {
                for (const e of ctx.effectsOn(side)) {
                  if (e.spellId !== spellId || e.broken) continue;
                  e.expiresAt = Math.max(ctx.t, e.expiresAt - delayMs);
                  touchEffect(e);
                }
              }
            }
          },
        });
      }
    }
    // Cast pushback / cancel — InterruptOrDelaySpell only after leftover HP > 0.
    // Cite: Unit.cpp:953–960 then :1246; :1268–1284 (no DoT / shield / split delay).
    const casting = f.castingSpell;
    if (
      amount > 0
      && !info?.skipChannelDelay
      // Spell::Delayed is TYPEID_PLAYER only, and every character seat counts (Spell.cpp:6806).
      && isPushbackSubject(f)
      && casting
      && damageType !== 'dot'
      && !treatAsPeriodic
      && damageType !== 'shield'
    ) {
      const flags = casting.interruptFlags ?? 0;
      if ((flags & SPELL_INTERRUPT_FLAG_DAMAGE_CANCELS) !== 0) {
        ctx.push({ t: ctx.t, kind: 'flavor', text: `${casting.name} interrupted!` });
        f.castingSpell = null;
        f.castStartedAt = 0;
        f.castFinishAt = 0;
        // Damage-cancelled before Spell::cast() — no TakePower, so the cast was free.
        f.castCost = 0;
        f.castCostPower = undefined;
      } else if ((flags & SPELL_INTERRUPT_FLAG_DAMAGE_PUSHBACK) !== 0) {
        // Resist stack: SPELLMOD_NOT_LOSE_CASTING_TIME + SPELL_AURA_RESIST_PUSHBACK (149).
        // Cite: Spell.cpp:6817–6821 Delayed (same formula as DelayedChannel).
        const notLose = Number((casting as { notLoseCastingTimePct?: number }).notLoseCastingTimePct ?? 0) | 0;
        if (resistsPushback(f.pushbackResistChance | 0, notLose, (p) => ctx.rng.chance(p))) {
          // Full resist — no delay, ladder index unchanged.
        } else {
          // Ladder 1000/800/600/400/200ms; remaining time capped at the full
          // (haste-modified) cast time — Spell.cpp:6825–6828.
          const remaining = Math.max(0, f.castFinishAt - ctx.t);
          const delay = Math.min(nextPushbackDelayMs(f.castPushbacks), Math.max(0, f.castBaseMs - remaining));
          if (delay > 0) f.castFinishAt += delay;
          f.castPushbacks++;
        }
      }
    }
  };
}
