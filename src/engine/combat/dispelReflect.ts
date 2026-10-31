// Peeled from combat.ts createSession (Wave 4) — pattern (D) ctx bag.
// Installs methods onto CombatContext; call after core session locals exist on ctx.

import type { CombatContext } from './context.ts';
import { clearCombustion } from './combustion.ts';
import { COMBUSTION_SPELL_ID, COMBUSTION_STACK_SPELL_ID } from '../spells/cmangos-special-cases-combustion.ts';
import type { ActiveEffect, Fighter } from './types.ts';
import type { School, SpellDef } from '../../data/schema.ts';
import {
  DISPEL_TYPE, getDispelMask, isDispellableByMask,
} from '../../domain/spells/dispel.ts';
import { collectMechanicHolders } from '../../domain/spells/dispelMechanic.ts';
import { getReflectChance } from '../../domain/spells/spellReflect.ts';
import { reverseBuffMod, applyResistMod, reverseMechanicResist } from './fighterFactory.ts';
import { removeImmunityAura } from '../spells/immunity.ts';
import { isEnemySide, isTotemSide, type TotemSide } from '../core/events.ts';
import { applySpellMagnetToParty } from './totemAuras.ts';
import { TAUNT_STATE } from './threat.ts';
import { isWithinRadiusYd } from './combatGeometry.ts';
import { isHostileSpeedEffect, markSpeedDirty } from './speedAura.ts';
import { isPossessInvSpell } from '../../domain/scriptdev/index.ts';
import { hasAttr, SPELL_ATTR } from '../spells/spellAttributes.ts';
import { isHealingWayTalentSpellId } from '../spells/interpreter/class-scripts-kit.ts';

export function installDispelReflect(ctx: CombatContext): void {
// The Dispel column of the aura a spell applies, scanned across every combatant's kit so an aura from
// any side resolves. Memoized: only a MISS can go stale, so roster growth drops the zeros.
const dispelTypeCache = new Map<number, number>();
let dispelCacheRosterLen = -1;
const dispelTypeOfSpell = (spellId: number): number => {
  // No spell store on this session (duel.ts, arenaLab, battleground pass none): the kits still
  // carry the Dispel column, and only a MISS can go stale, so roster growth drops the zeros.
  if (!ctx.spellOf) {
    const order = ctx.fightersOrder();
    if (order.length !== dispelCacheRosterLen) {
      for (const [k, v] of dispelTypeCache) if (v === 0) dispelTypeCache.delete(k);
      dispelCacheRosterLen = order.length;
    }
  }
  const hit = dispelTypeCache.get(spellId);
  if (hit !== undefined) return hit;
  const sp = ctx.spellOf?.(spellId);
  let dt = typeof sp?.dispel === 'number' ? sp.dispel : 0;
  if (dt === 0 && !ctx.spellOf) {
    for (const f of ctx.fightersOrder()) {
      const k = f.spec.spells.find((sk) => sk.id === spellId);
      if (k && typeof k.dispel === 'number') { dt = k.dispel; break; }
    }
  }
  dispelTypeCache.set(spellId, dt);
  return dt;
};
ctx.dispelTypeOfSpell = dispelTypeOfSpell;
/** True when some live effect carries a non-zero Dispel — the whole dispel pass's guard. */
let anyDispellableAt = -1;
let anyDispellable = false;
ctx.anyDispellableEffect = (): boolean => {
  const ver = ctx.effectsVersion();
  if (ver === anyDispellableAt) return anyDispellable;
  anyDispellable = false;
  for (const e of ctx.effects) {
    if (dispelTypeOfSpell(e.spellId) !== 0) {
      anyDispellable = true;
      break;
    }
  }
  anyDispellableAt = ver;
  return anyDispellable;
};
// A unit's active auras a dispel of this mask may strip. Friendly dispels remove negative magic and
// hostile ones remove positive; every non-magic category is unconditional.
const dispellableAurasOn = (unit: Fighter, mask: number, friendlyDispel: boolean): ActiveEffect[] => {
  const out: ActiveEffect[] = [];
  for (const e of ctx.effectsOn(unit.side)) {
    const dt = dispelTypeOfSpell(e.spellId);
    if (dt === 0) continue;
    if (ctx.keepAuraSpellIds?.has(e.spellId)) continue;
    if (!isDispellableByMask({ spellId: e.spellId, dispelType: dt, stacks: e.stacks ?? 1 }, mask)) continue;
    if (dt === DISPEL_TYPE.MAGIC) {
      const positive = ctx.factionOf(e.source) === ctx.factionOf(e.target); // self/ally-cast buff
      if (friendlyDispel ? positive : !positive) continue;
    }
    out.push(e);
  }
  return out;
};
ctx.dispellableAurasOn = dispellableAurasOn;
// A unit's reflect chance for `school`: all-school (aura 28) + matching-school (aura 74).
// Cite: Unit.cpp GetReflectChance ~3425.
ctx.reflectChanceFor = (unit: Fighter, school: School): number => {
  let all = 0;
  let sch = 0;
  for (const e of ctx.effectsOn(unit.side)) {
    if (e.kind !== 'reflect') continue;
    const pct = e.pct ?? 0;
    if (e.school == null) all += pct;
    else if (e.school === school) sch += pct;
  }
  return getReflectChance(all, sch);
};
// Reverse one effect mirror and its live combat side-effects, without splicing. Shared by the dispel
// peel and RemoveAurasDueToSpell. The break helpers install later, hence the optional calls.
const reverseActiveEffect = (unit: Fighter, e: ActiveEffect): void => {
  if (e.kind === 'buff') {
    reverseBuffMod(unit, e.mod, e.amount ?? 0, e.school, {
      creatureTypeMask: e.creatureTypeMask,
      schoolMask: e.schoolMask,
    });
    // SPELL_AURA_MOD_TOTAL_THREAT Fade — restore reverse-hate offsets.
    // Cite: HostileReference::resetFadeoutThreatReduction; KI-774.
    if (e.threatFadeDeltas && e.threatFadeDeltas.length > 0 && ctx.threatOf && ctx.bySide) {
      for (const { id, delta } of e.threatFadeDeltas) {
        if (!delta) continue;
        const host = ctx.bySide(id);
        if (!host || host.hp <= 0) continue;
        const tm = ctx.threatOf(host);
        if (tm) tm.addThreatDirectly(e.target, -delta, false);
      }
    }
    if (unit.activeSeal && unit.activeSeal.spellId === e.spellId) unit.activeSeal = null;
    if (unit.pendingSpellMod && unit.pendingSpellMod.spellId === e.spellId) unit.pendingSpellMod = null;
    if (unit.splitDamage && unit.splitDamage.id === e.spellId) unit.splitDamage = null;
    if (unit.splitDamageFlat && unit.splitDamageFlat.id === e.spellId) unit.splitDamageFlat = null;
    if (unit.blessingOfLight && unit.blessingOfLight.spellId === e.spellId) unit.blessingOfLight = null;
    if (unit.healingWay && unit.healingWay.spellId === e.spellId) unit.healingWay = null;
    if (unit.healingWayChancePct > 0 && isHealingWayTalentSpellId(e.spellId)) {
      unit.healingWayChancePct = 0;
    }
    // Sweeping Strikes holder removed → clear remaining charges.
    // Cite: UnitAuraProcHandler.cpp:810–841 cases 12292/18765.
    if (e.spellId === 12292 || e.spellId === 18765) unit.sweepingStrikesCharges = 0;
    if (e.spellId === COMBUSTION_SPELL_ID || e.spellId === COMBUSTION_STACK_SPELL_ID) {
      // Both holders go together. Cite: Unit.cpp:5372-5375.
      clearCombustion(unit, COMBUSTION_STACK_SPELL_ID);
    }
    if (e.mod == null && (e.amount ?? 0) > 0 && !e.mechanicResist) {
      unit.pushbackResistChance = Math.max(0, unit.pushbackResistChance - (e.amount ?? 0));
    }
    reverseMechanicResist(unit, e);
    // SPELL_AURA_MOD_DETECT_RANGE (91). Cite: Unit.cpp:11772; KI-796.
    if (e.detectRangeAmount != null) {
      unit.detectRangeMod = (unit.detectRangeMod ?? 0) - e.detectRangeAmount;
    }
    unit.buffActive.delete(e.spellId);
    ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: e.name, applied: false });
  } else if (e.kind === 'resist') {
    // MOD_RESISTANCE (143) — hand the school resistance back, same as the expiry sweep.
    applyResistMod(unit, e.school, -(e.amount ?? 0));
    unit.buffActive.delete(e.spellId);
    ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: e.name, applied: false });
  } else if (e.kind === 'immunity') {
    unit.immunity = removeImmunityAura(unit.immunity, e.spellId);
    unit.buffActive.delete(e.spellId);
    ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: e.name, applied: false });
  } else if (e.kind === 'school_absorb') {
    unit.schoolAbsorbs = unit.schoolAbsorbs.filter((a) => a.id !== e.spellId);
    unit.buffActive.delete(e.spellId);
    ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: e.name, applied: false });
  } else if (e.kind === 'mana_shield') {
    unit.manaShields = unit.manaShields.filter((a) => a.id !== e.spellId);
    unit.buffActive.delete(e.spellId);
    ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: e.name, applied: false });
  } else if (e.kind === 'damage_shield' || e.kind === 'proc_trigger_spell') {
    unit.buffActive.delete(e.spellId);
    ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: e.name, applied: false });
  } else if (e.kind === 'restore_health' || e.kind === 'restore_power') {
    unit.buffActive.delete(e.spellId);
    ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: e.name, applied: false });
  } else if (e.kind === 'dot') {
    // DoT ticks stop; no flat stat reverse. Cite: RemoveSpellAuraHolder → periodic off.
    ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: e.name, applied: false });
  } else if (e.kind === 'speed') {
    // Beneficial speed (Sprint/Cheetah) is on buffActive; snares are not. Always clear.
    markSpeedDirty(unit);
    unit.buffActive.delete(e.spellId);
    ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: e.name, applied: false });
  } else if (e.kind === 'reflect') {
    unit.buffActive.delete(e.spellId);
    ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: e.name, applied: false });
  } else if (e.kind === 'spell_magnet') {
    unit.buffActive.delete(e.spellId);
    ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: e.name, applied: false });
  } else if (e.kind === 'root') {
    if (!e.broken) ctx.breakControl?.(unit, 'root');
  } else if (e.kind === 'cc') {
    // Charm uses ctx.breakCharm (full side-switch teardown); other CC use ctx.breakControl.
    // Cite: SpellAuras.cpp HandleModCharm apply=false → Uncharm.
    if (!e.broken && (e.control === 'charm' || e.mechanic === 'charm')) {
      if (ctx.isCharmed(unit) && (unit.charmSpellId === e.spellId || unit.charmSpellId === 0)) {
        ctx.breakCharm?.(unit);
      } else if (e.control && e.control !== 'charm') {
        ctx.breakControl?.(unit, e.control);
      }
    } else if (!e.broken && e.control) {
      ctx.breakControl?.(unit, e.control);
    }
    if (e.mechanic === 'banish') {
      unit.immunity = removeImmunityAura(unit.immunity, e.spellId);
    }
  } else if (e.kind === 'mod_taunt') {
    // SPELL_AURA_MOD_TAUNT strip → TauntUpdate clears STATE_TAUNTED for this caster.
    // Cite: SpellAuras.cpp:2860–2875; ThreatManager.cpp:557–575.
    if (isEnemySide(unit.side) && ctx.threatOf) {
      const stillHeld = ctx.effectsOn(e.target).some(
        (o) => o !== e
          && o.kind === 'mod_taunt'
          && o.source === e.source
          && o.expiresAt > ctx.t,
      );
      if (!stillHeld) {
        const tm = ctx.threatOf(unit);
        if (tm) tm.setTauntState(e.source, TAUNT_STATE.NONE);
      }
    }
    ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: e.name, applied: false });
  }
};
ctx.reverseActiveEffect = reverseActiveEffect;

// Run an aura's removal bodies — the half of the script that fires when it goes AWAY. A body gated on
// expiry does not fire on a dispel. Bodies are consumed, so a payload cannot re-enter for that row.
ctx.fireAuraRemoveBodies = (
  e: ActiveEffect,
  mode: 'expire' | 'death' | 'dispel' | 'cancel',
): void => {
  const bodies = e.onRemove;
  if (!bodies || bodies.length === 0) return;
  e.onRemove = undefined;
  const at = (side: ActiveEffect['target']): Fighter | undefined => {
    return ctx.bySide(side);
  };
  const holder = at(e.target);
  if (!holder) return;
  const caster = at(e.source);
  for (const b of bodies) {
    if (b.mode !== 'any' && b.mode !== mode) continue;
    const from = (b.from === 'holder' ? holder : caster) ?? holder;
    const to = (b.to === 'caster' ? caster : holder) ?? holder;
    if (b.action === 'heal_full') {
      to.hp = to.spec.maxHealth;
      continue;
    }
    if (b.action === 'remove_aura') {
      ctx.removeAurasDueToSpell?.(to, b.spellId ?? 0);
      continue;
    }
    const id = b.spellId ?? 0;
    if (!id) continue;
    // Three kits then the global store (E6.0): a removal body's payload is scripted, so it is
    // in no one's cast bar by design. Cite: Unit.cpp:1447-1449 sSpellTemplate.LookupEntry.
    const def =
      from.spec.spells.find((s) => s.id === id)
      ?? holder.spec.spells.find((s) => s.id === id)
      ?? caster?.spec.spells.find((s) => s.id === id)
      ?? ctx.spellOf?.(id);
    if (!def) continue;
    // CastCustomSpell passes the damage in, because the row's own base points are a dummy. rawEffects
    // goes with it, or applySpell re-resolves from raw and throws the override away.
    let payload: SpellDef = def;
    if (b.amount != null) {
      const amount = b.amount;
      const { rawEffects: _raw, ...rest } = def;
      payload = {
        ...rest,
        effects: def.effects.map((fx) =>
          fx.kind === 'direct_damage' ? { ...fx, min: amount, max: amount } : fx),
      };
    }
    ctx.applySpell?.(from, to, payload);
  }
};

// Remove up to `count` stacks of a dispelled aura, reversing its combat side-effects — the same
// cleanup the expiry sweep does. Emits the aura-off event.
ctx.stripAuraOnDispel = (unit: Fighter, spellId: number, count: number): void => {
  // Removal bodies run after the walk: a `remove_aura` body splices rows below `i`.
  const fired: ActiveEffect[] = [];
  for (let i = ctx.effects.length - 1; i >= 0; i--) {
    const e = ctx.effects[i]!;
    if (e.target !== unit.side || e.spellId !== spellId) continue;
    // multi-stack: peel `count` applications; keep the aura if any remain.
    if (e.stacks != null && e.stacks > count) { e.stacks -= count; break; }
    if (e.kind === 'buff') {
      reverseBuffMod(unit, e.mod, e.amount ?? 0, e.school, {
        creatureTypeMask: e.creatureTypeMask,
        schoolMask: e.schoolMask,
      });
      // Fade reverse-hate restore on dispel. Cite: resetFadeoutThreatReduction; KI-774.
      if (e.threatFadeDeltas && e.threatFadeDeltas.length > 0 && ctx.threatOf && ctx.bySide) {
        for (const { id, delta } of e.threatFadeDeltas) {
          if (!delta) continue;
          const host = ctx.bySide(id);
          if (!host || host.hp <= 0) continue;
          const tm = ctx.threatOf(host);
          if (tm) tm.addThreatDirectly(e.target, -delta, false);
        }
      }
      if (unit.activeSeal && unit.activeSeal.spellId === e.spellId) unit.activeSeal = null;
      if (unit.pendingSpellMod && unit.pendingSpellMod.spellId === e.spellId) unit.pendingSpellMod = null;
      if (unit.splitDamage && unit.splitDamage.id === e.spellId) unit.splitDamage = null;
      if (unit.splitDamageFlat && unit.splitDamageFlat.id === e.spellId) unit.splitDamageFlat = null;
      if (unit.blessingOfLight && unit.blessingOfLight.spellId === e.spellId) unit.blessingOfLight = null;
    if (unit.healingWay && unit.healingWay.spellId === e.spellId) unit.healingWay = null;
    if (unit.healingWayChancePct > 0 && isHealingWayTalentSpellId(e.spellId)) {
      unit.healingWayChancePct = 0;
    }
      if (e.spellId === 12292 || e.spellId === 18765) unit.sweepingStrikesCharges = 0;
      if (e.spellId === COMBUSTION_SPELL_ID || e.spellId === COMBUSTION_STACK_SPELL_ID) {
        clearCombustion(unit, COMBUSTION_STACK_SPELL_ID);
      }
      if (e.mod == null && (e.amount ?? 0) > 0 && !e.mechanicResist) {
        unit.pushbackResistChance = Math.max(0, unit.pushbackResistChance - (e.amount ?? 0));
      }
      reverseMechanicResist(unit, e);
    } else if (e.kind === 'resist') {
      applyResistMod(unit, e.school, -(e.amount ?? 0));
    } else if (e.kind === 'immunity') {
      unit.immunity = removeImmunityAura(unit.immunity, e.spellId);
    } else if (e.kind === 'school_absorb') {
      unit.schoolAbsorbs = unit.schoolAbsorbs.filter((a) => a.id !== e.spellId);
    } else if (e.kind === 'mana_shield') {
      unit.manaShields = unit.manaShields.filter((a) => a.id !== e.spellId);
    } else if (e.kind === 'cc') {
      // breakControl clears the control timer + emits the faded event; the sweep splices the mirror.
      if (e.control) { ctx.breakControl?.(unit, e.control); continue; }
    } else if (e.kind === 'root') {
      ctx.breakControl?.(unit, 'root');
      continue;
    }
    unit.buffActive.delete(e.spellId);
    ctx.effects.splice(i, 1);
    ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: e.name, applied: false });
    if (e.onRemove) fired.push(e);
  }
  for (const e of fired) ctx.fireAuraRemoveBodies?.(e, 'dispel');
};

// Strip EVERY effect of `spellId` on `unit` and reverse all combat side-effects. A full holder remove,
// not a stack peel, and it returns how many rows went. Cite: Unit.cpp RemoveAurasDueToSpell ~5165.
ctx.removeAllAurasOnDeath = (unit: Fighter): void => {
  const fired: ActiveEffect[] = [];
  for (let i = ctx.effects.length - 1; i >= 0; i--) {
    const e = ctx.effects[i]!;
    if (e.target !== unit.side) continue;

    const def = unit.spec.spells.find((s) => s.id === e.spellId) ?? ctx.spellOf?.(e.spellId);
    if (def && hasAttr(def, SPELL_ATTR.PASSIVE)) continue;

    if (!e.broken) ctx.reverseActiveEffect!(unit, e);
    else unit.buffActive.delete(e.spellId);

    ctx.effects.splice(i, 1);
    if (e.onRemove) fired.push(e);
  }
  for (const e of fired) ctx.fireAuraRemoveBodies?.(e, 'death');
};

ctx.removeAurasDueToSpell = (unit: Fighter, spellId: number): number => {
  if (!spellId) return 0;
  let removed = 0;
  const fired: ActiveEffect[] = [];

  // Non-effect-table state owned by this spell id.
  // Cite: HandleAuraModShapeshift apply=false; HandleModCharm Uncharm; stealth break.
  if (unit.formSpellId === spellId && unit.form) {
    ctx.leaveForm?.(unit);
  }
  if (unit.stealthSpellId === spellId) {
    ctx.breakStealth?.(unit, 'remove');
  }
  if (unit.charmSpellId === spellId && ctx.isCharmed(unit)) {
    ctx.breakCharm?.(unit);
  }
  for (let i = ctx.effects.length - 1; i >= 0; i--) {
    const e = ctx.effects[i]!;
    if (e.target !== unit.side || e.spellId !== spellId) continue;
    // breakCharm / breakControl may already have marked the row broken + early-expired;
    // still splice so no residue remains.
    if (!e.broken) reverseActiveEffect(unit, e);
    else {
      // Already torn down (charm/control path) — ensure buffActive is clear.
      unit.buffActive.delete(e.spellId);
    }
    ctx.effects.splice(i, 1);
    removed++;
    if (e.onRemove) fired.push(e);
  }
  for (const e of fired) ctx.fireAuraRemoveBodies?.(e, 'cancel');
  // Lightwell / pending swing mods keyed by spell id.
  if (unit.lightwell && unit.lightwell.spellId === spellId) {
    unit.lightwell = null;
    unit.buffActive.delete(spellId);
  }
  unit.buffActive.delete(spellId);
  // Possess Inv (17250) also stamps unattackableUntil / stun outside the effect table.
  // Cite: boss_baroness_anastari.cpp RemoveAurasDueToSpell(SPELL_POSSESS_INV).
  if (isPossessInvSpell(spellId)) {
    unit.unattackableUntil = 0;
    if (unit.stunnedUntil > ctx.t) unit.stunnedUntil = ctx.t;
  }
  return removed;
};
// Which unit a dispel acts on — auto-retargeting to one that actually carries a matching aura, as
// heals pick the lowest ally — and whether it is a friendly cleanse. Shared, so the two cannot differ.
ctx.resolveDispelTarget = (
  src: Fighter, requestedTgt: Fighter, dispelType: number,
): { unit: Fighter; friendlyDispel: boolean } | null => {
  const mask = getDispelMask(dispelType);
  const pickFrom = (pool: Fighter[], friendly: boolean, preferred: Fighter | null): Fighter | null => {
    const ok = (u: Fighter): boolean => dispellableAurasOn(u, mask, friendly).length > 0;
    if (preferred && pool.includes(preferred) && ok(preferred)) return preferred;
    return pool.find(ok) ?? null;
  };
  const isCure = dispelType === DISPEL_TYPE.CURSE || dispelType === DISPEL_TYPE.DISEASE || dispelType === DISPEL_TYPE.POISON;
  if (isCure) {
    const unit = pickFrom(ctx.friendlyPoolOf(src), true, requestedTgt);
    return unit ? { unit, friendlyDispel: true } : null;
  }
  if (dispelType === DISPEL_TYPE.MAGIC) {
    // Requested friendly target → cleanse it. Requested foe → strip its buffs; if the foe has none,
    // fall back to cleansing a friendly's magic debuff (companion Dispel Magic aimed at the foe).
    if (ctx.factionOf(requestedTgt.side) === ctx.factionOf(src.side)) {
      const unit = pickFrom(ctx.friendlyPoolOf(src), true, requestedTgt);
      return unit ? { unit, friendlyDispel: true } : null;
    }
    const off = pickFrom(ctx.foePoolOf(src), false, requestedTgt);
    if (off) return { unit: off, friendlyDispel: false };
    const def = pickFrom(ctx.friendlyPoolOf(src), true, null);
    return def ? { unit: def, friendlyDispel: true } : null;
  }
  // stealth / invisibility / enrage / npc-only → strip a foe's buff.
  const unit = pickFrom(ctx.foePoolOf(src), false, requestedTgt);
  return unit ? { unit, friendlyDispel: false } : null;
};

// One pulse of a totem's periodic-trigger payload. A party payload walks the party radius-gated from
// the totem; an enemy-area one pulses hostiles in radius and needs no living party.
ctx.firePartyTotemPulse = (totem: Fighter, trig: SpellDef): void => {
  // TargetB=33 PARTY_AOE_AT_SRC_LOC: radius-gate from totem origin + trigger radiusYd.
  // Cite: SpellTargetDefines.h:33; Totem.cpp:120 (metronome stays on totem).
  const party: Fighter[] = [];
  const origin = ctx.posOf?.(totem.side);
  const radius = trig.radiusYd != null && trig.radiusYd > 0 ? trig.radiusYd : undefined;
  const inPartyPulse = (fr: Fighter): boolean =>
    fr.hp > 0 && !ctx.isCharmed(fr) && isWithinRadiusYd(origin, ctx.posOf?.(fr.side), radius);
  if (inPartyPulse(ctx.player)) party.push(ctx.player);
  for (const al of ctx.livingAllies()) if (inPartyPulse(al)) party.push(al);

  // Enemy-area first: must run even if the party is empty (owner dead mid-fight).
  for (const te of trig.effects) {
    if (te.kind === 'threat') {
      // Stoneclaw 5729 / Fire Nova 8351 — real list threat on the totem, radius-gated.
      // Cite: SpellEffects EffectThreat; SpellRadius.dbc; KI-926.
      ctx.applyFlatThreat!(totem, te.amount, trig);
      ctx.push({
        t: ctx.t, kind: 'aura', actor: totem.side, name: trig.name, applied: true, spellId: trig.id,
      });
    } else if (te.kind === 'speed' && isHostileSpeedEffect(te)) {
      // Earthbind refreshes its snare on every hostile in radius. The trigger keeps its own 5 s
      // duration and unsummon does not strip it, since the aura is keyed to the trigger spell.
      const origin = ctx.posOf?.(totem.side);
      const radius = trig.radiusYd != null && trig.radiusYd > 0 ? trig.radiusYd : undefined;
      const dur = te.durationMs > 0 ? te.durationMs : 5000;
      const exp = ctx.t + dur;
      for (const en of ctx.livingEnemies()) {
        if (en.hp <= 0) continue;
        if (!isWithinRadiusYd(origin, ctx.posOf?.(en.side), radius)) continue;
        const live = ctx.effectsOn(en.side).find(
          (e) => e.kind === 'speed' && e.spellId === trig.id,
        );
        if (live) {
          live.expiresAt = exp;
          live.pct = te.pct;
          live.hostile = true;
          markSpeedDirty(en);
          ctx.touchEffect(live);
        } else {
          ctx.effects.push({
            kind: 'speed',
            source: totem.side,
            target: en.side,
            spellId: trig.id,
            name: trig.name,
            aura: te.aura,
            pct: te.pct,
            hostile: true,
            expiresAt: exp,
            fromTotem: isTotemSide(totem.side) ? totem.side : undefined,
          });
        }
        ctx.push({
          t: ctx.t, kind: 'aura', actor: en.side, name: trig.name, applied: true, spellId: trig.id,
        });
      }
    }
  }

  if (!party.length) return;

  for (const te of trig.effects) {
    if (te.kind === 'dispel') {
      const mask = getDispelMask(te.dispelType);
      for (const unit of party) {
        const candidates = dispellableAurasOn(unit, mask, true).map((e) => ({
          spellId: e.spellId, dispelType: dispelTypeOfSpell(e.spellId), stacks: e.stacks ?? 1,
        }));
        if (!candidates.length) continue;
        // A totem pulse is a guaranteed cure, not a resisted dispel roll — the trigger has no resist
        // chance against your own party. Take the first `count` outright, so quiet ticks draw no rng.
        const take = Math.max(1, te.count | 0);
        const removed = new Map<number, number>();
        for (const c of candidates.slice(0, take)) {
          removed.set(c.spellId, (removed.get(c.spellId) ?? 0) + 1);
        }
        for (const [spellId, n] of removed) ctx.stripAuraOnDispel?.(unit, spellId, n);
        ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: trig.name, applied: true });
      }
    } else if (te.kind === 'dispel_mechanic') {
      // Tremor / Empower Will: HasMechanic(misc) on the party. Guaranteed, no resist roll.
      // Cite: SpellEffects.cpp EffectDispelMechanic (pin de8f72993b9e1faa1bf92dd5505f3daec5cea3ce); Totem.cpp TOTEM_PASSIVE.
      const take = Math.max(1, te.count | 0);
      const lookup = (id: number): SpellDef | undefined => {
        for (const f of ctx.fightersOrder()) {
          const sp = f.spec.spells.find((s) => s.id === id);
          if (sp) return sp;
        }
        return undefined;
      };
      for (const unit of party) {
        const candidates = collectMechanicHolders(ctx.effectsOn(unit.side), te.mechanic, lookup);
        if (!candidates.length) continue;
        const removed = new Map<number, number>();
        for (const c of candidates.slice(0, take)) {
          removed.set(c.spellId, (removed.get(c.spellId) ?? 0) + 1);
        }
        for (const [spellId, n] of removed) ctx.stripAuraOnDispel?.(unit, spellId, n);
        ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: trig.name, applied: true });
      }
    } else if (te.kind === 'spell_magnet') {
      // 8178 APPLY_AREA_AURA_PARTY refresh. Cite: Unit.cpp SelectMagnetTarget; aura 96.
      const exp = totem.totemExpiresAt != null && totem.totemExpiresAt > ctx.t
        ? totem.totemExpiresAt
        : (te.durationMs > 0 ? ctx.t + te.durationMs : ctx.t);
      applySpellMagnetToParty({
        effects: ctx.effects,
        effectsOn: (side) => ctx.effectsOn(side),
        party,
        source: totem.side as TotemSide,
        spell: { id: trig.id, name: trig.name, procCharges: te.charges },
        expiresAt: exp,
        t: ctx.t,
        push: ctx.push,
        touchEffect: ctx.touchEffect,
      });
    } else if (te.kind === 'cleanse') {
      // Tremor Totem: break charm/fear/incapacitate on the party every 4s while it stands.
      for (const unit of party) {
        for (const control of te.controls) ctx.breakControl!(unit, control);
      }
      ctx.push({ t: ctx.t, kind: 'aura', actor: totem.side, name: trig.name, applied: true });
    } else if (te.kind === 'proc_trigger_spell' && te.triggerSpellId > 0) {
      // The held-item enchant payload sits on the party member's WEAPON with its own 10 s clock, keyed
      // to the trigger spell rather than the totem. Swap the air totem and the proc runs to expiry.
      const dur = te.durationMs > 0 ? te.durationMs : 10_000;
      const chancePct = te.amount ?? 0;
      // Hand the swing-proc payload to every party weapon owner, on a refresh too: a unit that joined
      // after the first pulse must still resolve the enchant when it fires.
      const handProcPayload = (unit: Fighter): void => {
        const procDef = totem.totemTriggerSpells?.find((sp) => sp.id === te.triggerSpellId);
        if (!procDef) return;
        unit.totemTriggerSpells = unit.totemTriggerSpells ?? [];
        if (!unit.totemTriggerSpells.some((sp) => sp.id === procDef.id)) {
          unit.totemTriggerSpells.push(procDef);
        }
      };
      for (const unit of party) {
        handProcPayload(unit);
        const existing = ctx.effectsOn(unit.side).find(
          (x) => x.kind === 'proc_trigger_spell' && x.spellId === trig.id,
        );
        if (existing) {
          existing.expiresAt = ctx.t + dur; // refresh, do not stack
          ctx.touchEffect(existing);
          continue;
        }
        unit.buffActive.add(trig.id);
        ctx.effects.push({
          kind: 'proc_trigger_spell',
          source: unit.side, // the weapon is the party member's — the totem only handed it over
          target: unit.side,
          spellId: trig.id,
          name: trig.name,
          triggerSpellId: te.triggerSpellId,
          expiresAt: ctx.t + dur,
          procChance: chancePct > 0 ? chancePct / 100 : null,
          // DEAL_MELEE_SWING | DEAL_MELEE_ABILITY — a weapon enchant procs off your swings.
          // Cite: SpellMgr.h PROC_FLAG_DEAL_MELEE_SWING (4) / DEAL_MELEE_ABILITY (16).
          procFlags: 4 | 16,
          // It IS a weapon enchant, so a cat/bear druid in the party procs nothing off it
          // (fireDealMeleeAura42 skips this row in form). Cite: Unit.cpp:10877.
          fromWeaponEnchant: true,
          // Deliberately NOT fromTotem: the enchant is not the totem's aura to remove.
        });
        ctx.push({ t: ctx.t, kind: 'aura', actor: unit.side, name: trig.name, applied: true });
      }
    }
  }
};
}
