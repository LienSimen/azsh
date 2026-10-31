// Channelled-cast state machine, reading the baked channel duration and interrupt flags. Damage
// either pushes the channel back or interrupts it; a DoT never delays one, and self-damage cannot.

import type { Fighter } from './types.ts';
import type { CombatEvent, Side } from '../core/events.ts';
import { isPlayerCharacterSide, isTotemSide } from '../core/events.ts';
import type { PowerType, SpellDef } from '../../data/schema.ts';
import { nextPushbackDelayMs, resistsPushback } from '../../domain/spells/spellPushback.ts';
import {
  manaPerSecondOf,
  noTargetPerSecondCostsOf,
  perSecondCostPowerType,
} from '../spells/auraPerSecondCost.ts';
import { SPELL_EFFECT_APPLY_AURA } from '../spells/interpreter/opcodes.ts';
import { HOSTILE_IMPLICIT } from '../spells/interpreter/targeting.ts';
import { SPELL_ATTR_EX, hasAttrEx } from '../spells/spellAttributes.ts';

/** Same bit values as AURA_INTERRUPT — ChannelInterruptFlags reuses the enum. */
export const CHANNEL_INTERRUPT = Object.freeze({
  HOSTILE_ACTION: 0x00000001,
  DAMAGE: 0x00000002,
  ACTION: 0x00000004,
  MOVING: 0x00000008,
  ATTACKING: 0x00001000,
  DAMAGE_CHANNEL_DURATION: 0x00004000,
});

export interface ChannelState {
  spellId: number;
  name: string;
  /** The row being channelled — the bar reads school / heal-vs-damage off it, as a hardcast does. */
  spell: SpellDef;
  /** Arm time — the channel bar's left edge (SendChannelStart duration runs from here). */
  startedAt: number;
  endsAt: number;
  interruptFlags: number;
  pushbacks: number;
  // SPELLMOD_NOT_LOSE_CASTING_TIME PCT points for this channel spell at arm time (Improved Arcane Missiles,
  // Fel Concentration, …). Cite: SpellDefines.h op 9.
  notLoseCastingTimePct: number;
  /** Units that received auras from this channel (caster + primary target). */
  targetSides: Side[];
  // SpellAuraHolder ManaPerSecond. First tick at startedAt+1000, last at endsAt. Cite: SpellAuras.cpp:5155
  // m_timeCla=1000; :5680–5707.
  manaPerSecond?: number;
  powerCostType?: PowerType;
  nextPowerCostAt?: number;
  noTargetPerSecondCosts?: boolean;
}

// TYPEID_PLAYER, the gate both pushback sites share: a creature, totem, guardian or pet never loses
// casting time, and a companion or duel opponent does. Cite: Spell.cpp:6806, :6845; the flag is
// stamped for whatever seat a character takes (buildCombatant.ts:688).
export function isPushbackSubject(f: Pick<Fighter, 'side' | 'spec'>): boolean {
  if (f.side === 'pet' || isTotemSide(f.side)) return false;
  if (f.spec.petFullKit != null || f.spec.summonOwnerSide != null) return false;
  return f.spec.isPlayerOrPet ?? isPlayerCharacterSide(f.side);
}

/** INT32_MAX sentinel stamped for SpellDuration Duration=-1 (until-cancelled). */
const UNTIL_CANCELLED_MS = 0x7fffffff;

/** Read stamped channel duration. Bracket access so the census scanner sees the field name. */
export function channelMsOf(spell: SpellDef): number {
  if ((spell as { channelUntilCancelled?: boolean }).channelUntilCancelled) {
    return UNTIL_CANCELLED_MS;
  }
  return Number(spell['channelMs'] ?? 0) | 0;
}

/** Read stamped ChannelInterruptFlags. */
export function channelInterruptFlagsOf(spell: SpellDef): number {
  return Number(spell['channelInterruptFlags'] ?? 0) | 0;
}

/** True when the bake marks this spell as a channelled cast with usable surface. */
export function isChannelSpell(spell: SpellDef): boolean {
  // SpellMgr.h:1373-1376 IsChanneledSpell is the two bits, nothing else. 33 of the 319 carriers
  // have neither a baked channelMs nor interrupt flags, mostly dungeon event channels.
  return channelMsOf(spell) > 0
    || channelInterruptFlagsOf(spell) !== 0
    || hasAttrEx(spell, SPELL_ATTR_EX.IS_CHANNELED)
    || hasAttrEx(spell, SPELL_ATTR_EX.IS_SELF_CHANNELED);
}

/** Hostile-target channel (Drain Soul / AM). Cite: targeting.ts:18 HOSTILE_IMPLICIT. */
export function isHostileTargetChannel(spell: SpellDef | null | undefined): boolean {
  if (!spell || !isChannelSpell(spell)) return false;
  for (const re of spell.rawEffects ?? []) {
    if (HOSTILE_IMPLICIT.has((re.targetA ?? 0) | 0)) return true;
    if (HOSTILE_IMPLICIT.has((re.targetB ?? 0) | 0)) return true;
  }
  return false;
}

// Resolve the channel duration for a live land: the stamped value, else the longest effect duration.
// Until-cancelled means no finite expiry, so it ends only on an interrupt.
export function resolveChannelDurationMs(spell: SpellDef): number {
  if ((spell as { channelUntilCancelled?: boolean }).channelUntilCancelled) {
    return Number.POSITIVE_INFINITY;
  }
  const stamped = channelMsOf(spell);
  if (stamped >= UNTIL_CANCELLED_MS) return Number.POSITIVE_INFINITY;
  if (stamped > 0) return stamped;
  let best = 0;
  for (const e of spell.effects ?? []) {
    const d = Number((e as { durationMs?: number }).durationMs ?? 0) | 0;
    if (d > best) best = d;
  }
  return best;
}

// Arm channel state on the caster after a channelled spell's auras land. No-op when the spell has no
// channel surface.
export function beginChannel(
  caster: Fighter,
  spell: SpellDef,
  t: number,
  primaryTargetSide: Side,
): void {
  if (!isChannelSpell(spell)) return;
  const dur = resolveChannelDurationMs(spell);
  if (dur <= 0) return;
  const sides = new Set<Side>([caster.side, primaryTargetSide]);
  const manaPerSecond = manaPerSecondOf(spell, caster.spec.level);
  caster.channeling = {
    spellId: spell.id,
    name: spell.name,
    spell,
    startedAt: t,
    endsAt: t + dur,
    interruptFlags: channelInterruptFlagsOf(spell),
    pushbacks: 0,
    notLoseCastingTimePct: Number((spell as { notLoseCastingTimePct?: number }).notLoseCastingTimePct ?? 0) | 0,
    targetSides: [...sides],
    ...(manaPerSecond > 0
      ? {
        manaPerSecond,
        powerCostType: perSecondCostPowerType(spell),
        nextPowerCostAt: t + 1000,
        noTargetPerSecondCosts: noTargetPerSecondCostsOf(spell),
      }
      : {}),
  };
}

export function clearChannel(caster: Fighter): void {
  caster.channeling = null;
}

function perSecondCostPayer(
  owner: Fighter,
  ch: ChannelState,
  bySide: (side: Side) => Fighter | undefined,
): Fighter {
  if (ch.noTargetPerSecondCosts) return owner;
  for (const side of ch.targetSides) {
    if (side === owner.side) continue;
    const u = bySide(side);
    if (u) return u;
  }
  return owner;
}

// SpellAuraHolder ManaPerSecond while the channel is live. POWER_HEALTH: ModifyHealth; cancel the channel
// if HP ≤ cost (do not kill). Cite: SpellAuras.cpp:5686–5707.
export function tickChannelPerSecondCost(
  owner: Fighter,
  ctx: Pick<ChannelDamageCtx, 't' | 'removeAurasDueToSpell' | 'bySide'> & {
    push: (ev: CombatEvent) => void;
  },
): void {
  const ch = owner.channeling;
  if (!ch || !ch.manaPerSecond || ch.nextPowerCostAt == null) return;
  const payer = perSecondCostPayer(owner, ch, ctx.bySide);
  const amt = ch.manaPerSecond;
  while (ch.nextPowerCostAt <= ctx.t && ch.nextPowerCostAt <= ch.endsAt) {
    if ((ch.powerCostType ?? 'mana') === 'health') {
      if (payer.hp <= amt) {
        interruptChannel(owner, ctx, { quiet: true });
        return;
      }
      const before = payer.hp;
      payer.hp -= amt;
      ctx.push({
        t: ctx.t, kind: 'resource', actor: payer.side, power: 'health',
        value: Math.round(payer.hp), delta: payer.hp - before, spellId: ch.spellId,
      });
    } else {
      const power = ch.powerCostType ?? 'mana';
      const before = payer.power;
      payer.power = Math.max(0, payer.power - amt);
      if (payer.power !== before) {
        ctx.push({
          t: ctx.t, kind: 'resource', actor: payer.side, power,
          value: Math.round(payer.power), delta: payer.power - before, spellId: ch.spellId,
        });
      }
    }
    ch.nextPowerCostAt += 1000;
  }
}

export interface ChannelDamageCtx {
  t: number;
  /** True when the damage source is the channeling unit itself. */
  selfDamage: boolean;
  damageType?: string;
  // HP leftover after absorb. Omit = a real hit (legacy callers). 0 = absorb-only: InterruptOrDelaySpell is
  // past `if (!damage) return`, so no DelayedChannel. Cite: Unit.cpp:953–960 then :1246.
  hpDamage?: number;
  /** School/mana absorb on this packet. Cite: Unit.cpp:1853 takenOrAbsorbedDamage. */
  absorbed?: number;
  // SPELL_DAMAGE_SHIELD / SPLIT_DAMAGE — InterruptOrDelaySpell returns before delay/cancel. Early
  // DealDamage site still cancels DAMAGE-flagged channels. Cite: Unit.cpp:1269–1270, 948–950.
  skipChannelDelay?: boolean;
  treatAsPeriodic?: boolean;
  /** 0..1 chance roll (session rng). Required for DelayedChannel resist. */
  chance01: (p: number) => boolean;
  // SPELLMOD_NOT_LOSE_CASTING_TIME PCT points for the active channel spell (Improved Arcane Missiles / Fel
  // Concentration / …). 0 when none.
  notLoseCastingTimePct?: number;
  push: (ev: { t: number; kind: 'flavor'; text: string }) => void;
  /** Remove every live aura row of spellId on unit. */
  removeAurasDueToSpell: (unit: Fighter, spellId: number) => number;
  /** Resolve a side to its fighter (may be undefined for despawned). */
  bySide: (side: Side) => Fighter | undefined;
  /** Shorten live effect expiresAt for this spell on unit by delayMs (pushback). */
  delaySpellAuras: (unit: Fighter, spellId: number, delayMs: number) => void;
  // DynamicObject::Delay for each dynobj of this channel spell. Cite: Spell.cpp:6875–6879 DelayedChannel.
  delayDynamicObjects?: (spellId: number, delayMs: number) => void;
}

// Apply damage to a unit that may be channeling. Returns true when the channel was cancelled (caller may
// skip further cast pushback).
export function onChannelOwnerDamaged(owner: Fighter, ctx: ChannelDamageCtx): boolean {
  const ch = owner.channeling;
  if (!ch) return false;
  if (ch.endsAt <= ctx.t) {
    clearChannel(owner);
    return false;
  }

  const flags = ch.interruptFlags | 0;
  // DoT / shield: InterruptOrDelaySpell either sees damagetype DOT or returns on
  // SPELL_DAMAGE_SHIELD. Cite: Unit.cpp:1268–1270.
  const skipDelayType = ctx.damageType === 'dot' || ctx.damageType === 'shield' || ctx.skipChannelDelay || ctx.treatAsPeriodic;
  const hpDamage = ctx.hpDamage ?? 1;
  const absorbed = ctx.absorbed ?? 0;

  // Unit.cpp:1293–1296 — DoTs never delay; DAMAGE_CHANNEL_DURATION shortens the channel.
  // Spell.cpp DelayedChannel: only players; resist via SPELLMOD_NOT_LOSE_CASTING_TIME + aura 149.
  if (!skipDelayType && (flags & CHANNEL_INTERRUPT.DAMAGE_CHANNEL_DURATION) !== 0) {
    // Self-hit and absorb-only: first `if` is true so else-if DAMAGE cancel does not run.
    // Cite: Unit.cpp:1295 (pVictim != this); :953–960 (no InterruptOrDelaySpell when !damage).
    if (ctx.selfDamage || hpDamage <= 0) return false;
    // DelayedChannel returns early when !IsPlayer — NPCs do not get duration pushback. The seat is
    // not the test: a companion is a character too. Cite: Spell.cpp:6845–6846.
    if (!isPushbackSubject(owner)) return false;
    // Full resist: no delay, do not advance the ladder index.
    // Cite: Spell.cpp:6848–6853 (same stack as hardcast Delayed).
    const notLose = (ctx.notLoseCastingTimePct ?? ch.notLoseCastingTimePct) | 0;
    if (resistsPushback(owner.pushbackResistChance | 0, notLose, ctx.chance01)) {
      return false;
    }
    const delay = nextPushbackDelayMs(ch.pushbacks);
    ch.pushbacks++;
    if (delay <= 0) return false;
    const remaining = Math.max(0, ch.endsAt - ctx.t);
    const applied = Math.min(delay, remaining);
    ch.endsAt = Math.max(ctx.t, ch.endsAt - applied);
    for (const side of ch.targetSides) {
      const u = ctx.bySide(side);
      if (u) ctx.delaySpellAuras(u, ch.spellId, applied);
    }
    ctx.delayDynamicObjects?.(ch.spellId, applied);
    if (ch.endsAt <= ctx.t) {
      // Pushback that eats the last of the timer is a FINISH, not a cancel: Spell::update runs
      // `m_timer == 0` into finish(), and cancel() is never reached. Cite: Spell.cpp:3570, :3561.
      interruptChannel(owner, ctx, { quiet: true });
      return true;
    }
    return false;
  }

  // Unit.cpp:948–950 early site + :1300–1303 — AURA_INTERRUPT_FLAG_DAMAGE cancels.
  // Early site runs on takenOrAbsorbedDamage (absorb-only still cancels First Aid).
  if ((flags & CHANNEL_INTERRUPT.DAMAGE) !== 0 && (hpDamage > 0 || absorbed > 0)) {
    interruptChannel(owner, ctx);
    return true;
  }

  return false;
}

// Tear down a live channel — a damage cancel, an action interrupt or a natural end. `quiet` suppresses
// the flavour line for a caller that logs its own, like a kick naming the school lockout.
export function interruptChannel(
  owner: Fighter,
  ctx: Pick<ChannelDamageCtx, 't' | 'push' | 'removeAurasDueToSpell' | 'bySide'>,
  opts?: { quiet?: boolean },
): void {
  const ch = owner.channeling;
  if (!ch) return;
  for (const side of ch.targetSides) {
    const u = ctx.bySide(side);
    if (u) ctx.removeAurasDueToSpell(u, ch.spellId);
  }
  if (!opts?.quiet) ctx.push({ t: ctx.t, kind: 'flavor', text: `${ch.name} interrupted!` });
  clearChannel(owner);
}

// If the unit starts a non-channel action/cast while channeling with ACTION flag, cancel. Cite:
// Unit::InterruptSpellsWithChannelFlags; AURA_INTERRUPT_FLAG_ACTION.
export function maybeCancelChannelOnAction(owner: Fighter, ctx: Pick<ChannelDamageCtx, 't' | 'push' | 'removeAurasDueToSpell' | 'bySide'>): void {
  const ch = owner.channeling;
  if (!ch) return;
  if ((ch.interruptFlags & CHANNEL_INTERRUPT.ACTION) === 0) return;
  interruptChannel(owner, ctx);
}

// The finite bar end for the outward view. An until-cancelled channel has no expiry, and Infinity
// round-trips through JSON as null, so report the sentinel the bake itself stamps.
export function channelBarEndsAt(ch: ChannelState): number {
  return Number.isFinite(ch.endsAt) ? ch.endsAt : ch.startedAt + UNTIL_CANCELLED_MS;
}

// A moved caster loses a MOVING-flagged channel, and 284 of the 309 channel rows carry the bit —
// which is what makes one a cast bar rather than an aura you walk away with.
export function maybeCancelChannelOnMove(
  owner: Fighter,
  ctx: Pick<ChannelDamageCtx, 't' | 'push' | 'removeAurasDueToSpell' | 'bySide'>,
): void {
  const ch = owner.channeling;
  if (!ch) return;
  if ((ch.interruptFlags & CHANNEL_INTERRUPT.MOVING) === 0) return;
  interruptChannel(owner, ctx);
}

// True while a live channel forbids voluntary motion. A deliberate move order still wins: it routes
// through the cancel first, which ends the channel, and then this reads false.
export function channelHoldsStill(owner: Fighter, t: number): boolean {
  const ch = owner.channeling;
  return !!ch && t < ch.endsAt && (ch.interruptFlags & CHANNEL_INTERRUPT.MOVING) !== 0;
}

/** The interrupt bag every cancel path needs, off the live session context. */
export function channelInterruptCtx(ctx: {
  t: number;
  push: (e: { t: number; kind: 'flavor'; text: string }) => void;
  bySide: (side: Side) => Fighter | undefined;
  removeAurasDueToSpell?: (unit: Fighter, spellId: number) => number;
}): Pick<ChannelDamageCtx, 't' | 'push' | 'removeAurasDueToSpell' | 'bySide'> {
  return {
    t: ctx.t,
    push: (ev) => ctx.push(ev),
    bySide: ctx.bySide,
    removeAurasDueToSpell: (u, id) => ctx.removeAurasDueToSpell?.(u, id) ?? 0,
  };
}

// Effects Spell.cpp counts into m_needAliveTargetMask: APPLY_AURA on an implicit target other than
// the caster. Cite: Spell.cpp:3986; TARGET_UNIT_CASTER = 1 (SpellTargetDefines.h).
export function channelNeedsLivingTarget(spell: SpellDef): boolean {
  for (const re of spell.rawEffects ?? []) {
    if ((((re as { effect?: number }).effect ?? 0) | 0) !== SPELL_EFFECT_APPLY_AURA) continue;
    if ((((re.targetA ?? 0) | 0) > 1) || (((re.targetB ?? 0) | 0) > 1)) return true;
  }
  return false;
}

// A channel whose aura targets are all dead or gone FINISHES — not an interrupt, so no flavour line.
// Without it a 15 s Drain Soul kept draining a corpse and held the warlock still. Cite:
// Spell.cpp:3557-3562 IsAliveUnitPresentInTargetList -> SendChannelUpdate(0), finish().
export function endChannelIfTargetsGone(
  owner: Fighter,
  ctx: Pick<ChannelDamageCtx, 't' | 'push' | 'removeAurasDueToSpell' | 'bySide'>
    & { dead: (u: Fighter) => boolean },
): boolean {
  const ch = owner.channeling;
  if (!ch || !channelNeedsLivingTarget(ch.spell)) return false;
  let hadOther = false;
  for (const side of ch.targetSides) {
    if (side === owner.side) continue;
    hadOther = true;
    const u = ctx.bySide(side);
    if (u && !ctx.dead(u)) return false;
  }
  if (!hadOther) return false;
  interruptChannel(owner, ctx, { quiet: true });
  return true;
}

// The channel target walking out of maxRange * 1.5 cancels. Self-channels (Hellfire) have no
// channel object to measure. Cite: Spell.cpp:3544-3554 IsWithinCombatDistInMap.
export function cancelChannelOutOfRange(
  owner: Fighter,
  ctx: Pick<ChannelDamageCtx, 't' | 'push' | 'removeAurasDueToSpell' | 'bySide'>
    & { distanceBetween: (a: Fighter, b: Fighter) => number | undefined },
): boolean {
  const ch = owner.channeling;
  if (!ch) return false;
  const maxRange = Number((ch.spell as { rangeMax?: number }).rangeMax ?? 0);
  if (!(maxRange > 0)) return false;
  for (const side of ch.targetSides) {
    if (side === owner.side) continue;
    const u = ctx.bySide(side);
    if (!u) continue;
    const d = ctx.distanceBetween(owner, u);
    if (d != null && d > maxRange * 1.5) {
      interruptChannel(owner, ctx);
      return true;
    }
  }
  return false;
}

/** Clear channel state when its auras have all expired (natural end). */
export function expireChannelIfDone(owner: Fighter, t: number): void {
  const ch = owner.channeling;
  if (!ch) return;
  if (ch.endsAt <= t) clearChannel(owner);
}
