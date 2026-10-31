// Spell role helpers (Wave 4 S26) — extracted from engine/combat.ts.
// Rotation layer may import from here instead of the combat.ts god-file.

import type { SpellDef, SpellRole } from '../../data/schema.ts';
import type { PendingSpellMod } from './types.ts';
import { isHostileSpeedEffect } from './speedAura.ts';
import { INSTANT_CAST_GUARD_MS } from '../spells/spellMods.ts';
import type { OwnedSpellMod } from '../spells/spellModIntents.ts';
import {
  chargedSpellModsFromSpell,
  isSpellAffectedByMod,
  spellModCharges,
  SPELLMOD_ALL_EFFECTS,
  SPELLMOD_CASTING_TIME,
  SPELLMOD_COOLDOWN,
  SPELLMOD_COST,
  SPELLMOD_CRITICAL_CHANCE,
} from '../spells/spellModIntents.ts';

/** SpellEntry.Dispel = DISPEL_CURSE. Cite: SharedDefines.h DispelType. */
const DISPEL_CURSE = 2;
/** SpellFamilyName for the warlock. Cite: SharedDefines.h SPELLFAMILY_WARLOCK = 5. */
const SPELLFAMILY_WARLOCK = 5;

// Every raw effect is TARGET_UNIT_CASTER (1) — self-only DBC targeting. Cite: SpellTargetDefines.h
// TARGET_UNIT_CASTER=1; boss_jandice_barov Spread 17772/17774.
export function isSelfTargetedSpell(s: SpellDef): boolean {
  const rows = s.rawEffects;
  if (!rows || rows.length === 0) return false;
  return rows.every((r) => (r.targetA | 0) === 1);
}

/** How the combat AI should use a spell, inferred from its DB effects (data-driven). */
export function inferRole(s: SpellDef): SpellRole {
  if (s.rageGenerated && s.cost === 0) return 'charge';
  if (s.strikeBonus) return 'strike';
  // Combo-point builders that are pure strikes (SS) keep role 'strike'; finishers that only deal
  // damage look like instant nukes so the energy AI can prefer them at high CP.
  if (s.requiresComboPoints && s.effects.some((e) => e.kind === 'direct_damage')) return 'instant_nuke';
  if (s.requiresComboPoints && s.effects.some((e) => e.kind === 'buff' && e.mod === 'haste')) return 'buff';
  const has = (k: SpellDef['effects'][number]['kind']): boolean => s.effects.some((e) => e.kind === k);
  // Divine Intervention is self and party sacrifice immunity, not a gap-closer — its long cooldown,
  // range and trigger would otherwise match the Charge heuristic below. A local id check avoids a cycle.
  const sid = s.id | 0;
  if (sid === 19752 || sid === 19753 || sid === 19754 || /^divine intervention$/i.test(s.name ?? '')) {
    return 'buff';
  }
  // Self-only MOD_CONFUSE kits (Spread 17772/17774) are not rotation CC.
  // Cite: boss_jandice_barov.cpp:52-55,91; SpellTargetDefines.h TARGET_UNIT_CASTER.
  if (isSelfTargetedSpell(s) && (has('cc') || has('root'))) return 'utility';
  // Gap-closers whose only resolved effects are a trigger, plus perhaps a charge energize. Resolve drops
  // the baked role, and a bare trigger would fall to utility, so the parent gets dropped from the kit.
  if (
    has('trigger_spell')
    && (s.rangeMax ?? 0) >= 8
    && (s.cooldownMs ?? 0) >= 10_000
    && !has('root') && !has('cc') && !has('interrupt_cast') && !has('dot')
    && !has('direct_damage') && !has('buff') && !has('heal')
  ) {
    return 'charge';
  }
  // Vanish: rogue family flag, only a trigger after resolve. The baked stealth role is dropped when the
  // effects re-materialize, so without this the parent becomes utility and leaves the combat kit.
  if (
    has('trigger_spell')
    && s.spellFamilyName === 8
    && ((s.spellFamilyFlags ?? 0) & 0x800) !== 0
  ) {
    return 'stealth';
  }
  // Pet management — Call Pet and Revive Pet. Deriving the role here means the kit survives a bake row
  // with no stamp. Dismiss Pet keeps no ACTIVE role: it is a pet-frame action, not a rotation pick.
  if (has('summon_pet') || has('revive_pet')) return 'pet_summon';
  if (has('shapeshift') && !has('stealth')) return 'form';
  if (has('stealth') || s.role === 'stealth') return 'stealth';
  if (has('summon_totem')) return 'totem_summon';
  if (has('seal')) return 'seal';
  if (has('judgement')) return 'judgement';
  if (has('root') || has('cc') || has('interrupt_cast')) return 'control';
  // The dispel effects — Purge, Dispel Magic, Remove Curse, Cleanse. ACTIVE so the combat kit keeps
  // them, since utility would drop them and a tick by id is a silent no-op. Never 'buff': a strip is
  if (has('dispel') || has('cleanse') || has('dispel_mechanic')) return 'control';
  // Taunt and mod-taunt — Taunt, Growl, Mocking Blow, Challenging Shout. Must be ACTIVE so the fight kit
  // keeps them; utility would drop them and a tick by id is a silent no-op.
  if (has('taunt') || has('mod_taunt')) return 'control';
  // SPELL_EFFECT_THREAT (63) / MODIFY_THREAT_PERCENT (125) — Distracting Shot, Growl, Torment,
  // Feint, Cower, Disengage. Same ACTIVE-role requirement as taunt (KI-102).
  if (has('threat') || has('modify_threat_pct')) return 'control';
  // SPELL_AURA_MOD_TOTAL_THREAT (103) — Fade: self buff that drops reverse-hate temporarily. ACTIVE buff so
  // knownCombatSpells keeps it in the fight kit (not utility drop). Cite: SpellAuras.cpp:2841–2858; KI-774.
  if (has('threat_temporary')) return 'buff';
  // The power burn, drain and leech effects, already wired in applySpell, must not fall through to
  // utility. A happiness drain is pet mood bookkeeping, not an enemy mana drain.
  const hostilePowerDrain = s.effects.some(
    (e) => e.kind === 'power_drain' && (e.powerType | 0) !== 4,
  );
  if (has('power_burn') || has('health_leech') || hostilePowerDrain) {
    return s.castTimeMs > 0 ? 'nuke' : 'instant_nuke';
  }
  if (has('direct_damage')) return s.castTimeMs > 0 ? 'nuke' : 'instant_nuke';
  // Holy Shock resolves to its own kind: an instant hostile holy hit or a friendly heal. ACTIVE so the
  // fight kit keeps every rank, since utility would drop them and a tick by id does nothing.
  if (has('holy_shock')) return s.castTimeMs > 0 ? 'nuke' : 'instant_nuke';
  if (has('dot')) return 'dot';
  // PERIODIC_MANA_LEECH (aura 64) bakes as restore_power with negative amountPerTick
  // (Viper Sting, Drain Mana). Hostile mana-drain DoT — ACTIVE (dot) for the combat kit (KI-101).
  if (s.effects.some((e) => e.kind === 'restore_power' && e.amountPerTick < 0)) return 'dot';
  // A pure hostile snare. Damage-and-snare spells already returned above, but a pure one must not fall
  // to utility or the kit drops it. An explicit hostile:false self-slow is not control.
  if (s.effects.some((e) => e.kind === 'speed' && isHostileSpeedEffect(e))) {
    return 'control';
  }
  // Direct heals and HoTs, which the bake spells as a health restore. A full-heal emergency takes the
  // same ACTIVE buff path. Cite: SpellEffects.cpp EffectHealMaxHealth.
  if (has('heal') || has('restore_health') || has('heal_max_health')) return 'buff';
  // Positive restore_power (self mana channel / drink-style) — keep-up buff when used in combat.
  if (has('restore_power')) return 'buff';
  // Damage shields and weapon imbues are self-setup buffs kept up out of combat and refreshed in it. A
  // ranged proc holder is a combat nuke — treating one as a self-buff was permanent mana thrash.
  if (has('damage_shield') || has('weapon_imbue') || has('buff')) return 'buff';
  // Resistance auras and buffs — the three schools, Shadow Protection, Aspect of the Wild. ACTIVE, so
  // auto-setup and the action bars list them.
  if (has('resist')) return 'buff';
  // Blessing of Sacrifice / Soul Link style split damage — party-support buffs.
  // Cite: SpellAuras.cpp split damage; schema split_damage / split_damage_flat.
  if (has('split_damage') || has('split_damage_flat')) return 'buff';
  // Blessing of Light (SESSION 11 kit) — typed buff, not generic `buff` kind.
  if (has('blessing_of_light')) return 'buff';
  // Inferno / similar warlock summons — pet kit (same as summon_pet).
  // Cite: SpellEffects.cpp EffectSummonDemon; schema summon_demon.
  if (has('summon_demon')) return 'pet_summon';
  // Resurrect / Rebirth / Redemption — castable utility kept on bars + auto-setup pool
  // (battle rez is a real combat decision). Cite: schema resurrect.
  if (has('resurrect')) return 'buff';
  if (has('proc_trigger_spell')) {
    if ((s.rangeMax ?? 0) > 0 && !has('damage_shield') && !has('buff')) {
      return s.castTimeMs > 0 ? 'nuke' : 'instant_nuke';
    }
    return 'buff';
  }
  // School/damage immunity + pacify (Divine Protection / BoP) are self/friendly buffs, not CC.
  if (has('school_immunity') || has('damage_immunity') || has('mechanic_immunity') || has('pacify')) return 'buff';
  // MOD_UNATTACKABLE — the imp's Phase Shift. An ACTIVE buff so pet keep-up and the combat kit hold it;
  // dropping it to utility meant it was never autocast.
  if (has('mod_unattackable')) return 'buff';
  // Talent actives: the one-shot next-cast arms and the cooldown resets. ACTIVE so the fight kit keeps
  // them — as utility, a companion granted one never cast it and autofill missed it too.
  if (has('next_cast_mod') || has('reset_cooldowns')) return 'buff';
  // Typed talent and absorb actives that resolve without a generic buff or damage kind. Without these
  // branches they fall to utility and drop out of the setup picker and the action bars.
  if (has('school_absorb') || has('mana_shield')) return 'buff';
  if (
    has('sweeping_strikes')
    || has('combustion')
    || has('vampiric_embrace')
    || has('demonic_sacrifice')
    || has('eye_for_an_eye')
    || has('oracle_healing_bonus')
    || has('obsidian_armor')
    || has('adaptive_warding')
    || has('class_power_set')
    || has('vestments_greater_heal')
    || has('dreamwalker_healing_touch')
    || has('idol_healing_touch_refund')
    || has('totem_lesser_healing_wave')
    || has('cheat_death')
    || has('master_of_elements')
    || has('magic_absorption')
    || has('ignite')
    || has('deep_wounds')
    || has('improved_sprint')
    || has('healing_way_talent')
    || has('healing_way')
    || has('add_target_trigger')
  ) return 'buff';
  // Premeditation: pure combo_points grant (no damage). Builders with damage already returned
  // strike/instant_nuke above. Cite: SpellEffects.cpp EffectAddComboPoints; Premeditation 14183.
  if (has('combo_points')) return 'buff';
  // Combustion: a self-only long-cooldown parent that materializes only the trigger of its stacking
  // payload. Mid-range gap-closers already returned above, so zero range plus a long recovery is enough.
  if (
    has('trigger_spell')
    && (s.rangeMax ?? 0) === 0
    && (s.cooldownMs ?? 0) >= 30_000
    && !has('root') && !has('cc') && !has('interrupt_cast') && !has('dot')
    && !has('direct_damage') && !has('buff') && !has('heal')
  ) {
    return 'buff';
  }
  // Warlock Life Tap, a core mid-fight rotation spell. Must be ACTIVE so every rank stays in the kit;
  // utility drops it and turns both the tick and the rotation rule into silent no-ops.
  if (has('life_tap')) return 'buff';
  // Priest Lightwell — reactive party heal well (charges). Same ACTIVE kit requirement.
  // Cite: SpellEffects.cpp EffectTransmitted :5271; applySpellLate lightwell; schema lightwell.
  if (has('lightwell')) return 'buff';
  // Self run-speed combat buffs — Sprint, Dash, Dive — are ACTIVE so the combat kit keeps them
  // mid-fight. A world mount's speed and a swim-only aura stay utility: travel, not fight kit.
  if (s.effects.some(
    (e) => e.kind === 'speed' && !e.hostile && (e.pct ?? 0) > 0 && e.aura === 31,
  )) {
    return 'buff';
  }
  // Utility detection / soothe / vision auras — ACTIVE so combat kit lists them (not pure
  // resource tax). Cite: SPELL_AURA_AURAS_VISIBLE / MOD_DETECT_RANGE / BIND_SIGHT; KI-124/186/187.
  if (has('auras_visible') || has('mod_detect_range') || has('bind_sight')) return 'control';
  // Flare (and similar) — strip stealth / anti-invis combat tools. Cite: schema dispel_immunity.
  if (has('dispel_immunity')) return 'control';
  // Distract / Pick Pocket — world utility stubs stay utility (OOC primary). Cite: KI-112/159.
  if (has('conjure')) return 'conjure';
  return 'utility';
}
// inferRole walks about 40 scans over the effects and is a pure function of a frozen bake object, yet
// it ran per unit per tick — 8.7% of an 80-unit profile. A spell def is interned, so the map evicts.
const roleCache = new WeakMap<SpellDef, SpellRole>();

export function roleOf(s: SpellDef): SpellRole {
  if (s.role != null) return s.role;
  const hit = roleCache.get(s);
  if (hit !== undefined) return hit;
  const role = inferRole(s);
  roleCache.set(s, role);
  return role;
}

/** A spell that restores health (heal / Lay on Hands / HoT / Holy Shock) — gates `next_cast_mod` for heals. */
const healsCache = new WeakMap<SpellDef, boolean>();
export function spellHeals(s: SpellDef): boolean {
  const hit = healsCache.get(s);
  if (hit !== undefined) return hit;
  // holy_shock branches to heal on CanAssist targets. Cite: SpellEffects.cpp:1449–1450.
  const v = s.effects.some(
    (e) =>
      e.kind === 'heal'
      || e.kind === 'heal_max_health'
      || e.kind === 'restore_health'
      || e.kind === 'holy_shock',
  );
  healsCache.set(s, v);
  return v;
}

// Whether a +crit next-cast charge is worth consuming on this spell — deliberately broader than the
// sourced crit gate, because a mod landing on a DoT still counts as spent. Do not merge the two.
function spellConsumesCritMod(spell: SpellDef): boolean {
  if (roleOf(spell) === 'strike') return true;
  return spell.effects.some(
    (e) =>
      e.kind === 'direct_damage'
      || e.kind === 'dot'
      || e.kind === 'heal'
      || e.kind === 'heal_max_health'
      || e.kind === 'holy_shock'
      || e.kind === 'weapon_percent_damage',
  );
}

/** True when ApplySpellMod would apply this finite mod to `spell` (and therefore consume a charge). */
function nextCastModifierApplies(mod: PendingSpellMod, spell: SpellDef): boolean {
  const castMs = spell.castTimeMs ?? 0;
  // Player.h:2595–2596 — −100% CASTING_TIME skips base ≥ 10 s.
  if (mod.instant && castMs > 0 && castMs < INSTANT_CAST_GUARD_MS) return true;
  if (mod.castTimeFlat && castMs > 0) return true;
  if ((mod.freeCost || (mod.costModPct != null && mod.costModPct !== 0)) && (spell.cost ?? 0) > 0) {
    return true;
  }
  if (mod.effectPct) return true;
  if (mod.critAdd && spellConsumesCritMod(spell)) return true;
  return false;
}

// Would the cast pipeline query this op? The charge drops inside ApplySpellMod, so applying and
// spending are one question. Cite: Player.h:2575-2620; SpellDefines.h:396-424 SpellModOp.
function spellModOpApplies(row: OwnedSpellMod, spell: SpellDef): boolean {
  switch (row.op) {
    case SPELLMOD_CASTING_TIME: {
      const castMs = spell.castTimeMs ?? 0;
      if (castMs <= 0) return false;
      // Player.h:2595–2596 — a −100% PCT is skipped on a base cast of 10 s or more.
      if (row.type === 'pct' && row.value <= -100 && castMs >= INSTANT_CAST_GUARD_MS) return false;
      return true;
    }
    case SPELLMOD_COST: return (spell.cost ?? 0) > 0;
    case SPELLMOD_CRITICAL_CHANCE: return spellConsumesCritMod(spell);
    case SPELLMOD_COOLDOWN: return (spell.cooldownMs ?? 0) > 0;
    default: return true;
  }
}

// Whether this cast consumes the modifier. `rows` is the holder's own 107/108 list, so the DBC
// EffectItemType mask decides. Cite: Player.cpp:350–357 SpellModifier::isAffectedOnSpell.
export function nextCastModApplies(mod: PendingSpellMod, spell: SpellDef): boolean {
  if (spell.id === mod.spellId) return false;
  const role = roleOf(spell);
  // Pure Auto Shot / Shoot toggle is not a cast that consumes next-cast mods.
  // Multi-Shot / Aimed Shot (role shoot + cost/GCD) may consume them.
  if (role === 'attack') return false;
  if (
    role === 'shoot'
    && (spell.cost ?? 0) <= 0
    && (spell.castTimeMs ?? 0) <= 0
    && (spell.gcdMs ?? 0) <= 0
  ) {
    return false;
  }
  if (mod.rows?.length) {
    for (const r of mod.rows) {
      if (!isSpellAffectedByMod(r, spell)) continue;
      if (spellModOpApplies(r, spell)) return true;
    }
    return false;
  }
  // No DBC rows (a scripted holder): the appliesTo shorthand stands in for the mask.
  if (mod.appliesTo === 'nature' && spell.school !== 'nature') return false;
  if (mod.appliesTo === 'heal' && !spellHeals(spell)) return false;
  if (mod.appliesTo === 'summon') return spell.effects.some((e) => e.kind === 'summon_pet');
  // A warlock curse is SpellFamilyName 5 with Dispel 2 CURSE. Cite: SpellAuras.cpp IsDispellableByMask.
  if (mod.appliesTo === 'curse') {
    return (spell.spellFamilyName ?? 0) === SPELLFAMILY_WARLOCK && (spell.dispel ?? 0) === DISPEL_CURSE;
  }
  // Same SpellFamilyName + EffectItemType mask. Family 0 (racials / items) is
  // name-only. Cite: Player.cpp:350–357 SpellModifier::isAffectedOnSpell.
  if (!isSpellAffectedByMod(mod, spell)) return false;
  return nextCastModifierApplies(mod, spell);
}

// The shorthand the cast sites read, folded out of the holder's own SpellModOp rows.
function payloadFromRows(rows: readonly OwnedSpellMod[]): Partial<PendingSpellMod> {
  const out: Partial<PendingSpellMod> = {};
  for (const r of rows) {
    switch (r.op) {
      case SPELLMOD_CASTING_TIME:
        if (r.type === 'pct') { if (r.value <= -100) out.instant = true; }
        else out.castTimeFlat = (out.castTimeFlat ?? 0) + r.value;
        break;
      case SPELLMOD_COST:
        if (r.type !== 'pct') out.costFlat = (out.costFlat ?? 0) + r.value;
        else if (r.value <= -100) out.freeCost = true;
        else out.costModPct = (out.costModPct ?? 0) + r.value;
        break;
      // A FLAT crit mod is whole percent in the DBC; castCritAdd is a 0..1 fraction.
      case SPELLMOD_CRITICAL_CHANCE:
        out.critAdd = (out.critAdd ?? 0) + r.value / 100;
        break;
      case SPELLMOD_ALL_EFFECTS:
        if (r.type === 'pct') out.effectPct = (out.effectPct ?? 0) + r.value;
        break;
      default: break;
    }
  }
  return out;
}

// The armed modifier for a charged 107/108 holder. DBC rows win; the scripted `next_cast_mod`
// effect is the fallback for holders that carry no raw rows.
export function pendingSpellModFromResolved(spell: SpellDef): PendingSpellMod | null {
  const rows = chargedSpellModsFromSpell(spell);
  const me = spell.effects.find((e) => e.kind === 'next_cast_mod');
  const scripted = me && me.kind === 'next_cast_mod' ? me : null;
  if (!rows.length && !scripted) return null;
  const base: PendingSpellMod = {
    spellId: spell.id,
    name: spell.name,
    appliesTo: scripted?.appliesTo ?? 'any',
    spellFamilyName: spell.spellFamilyName,
  };
  if (rows.length) return { ...base, ...payloadFromRows(rows), rows };
  return {
    ...base,
    critAdd: scripted!.critAdd,
    instant: !!scripted!.instant,
    freeCost: !!scripted!.freeCost,
    costModPct: scripted!.costModPct ?? scripted!.costPct,
    effectPct: scripted!.effectPct,
    castTimeFlat: scripted!.castTimeFlat,
    familyFlags: scripted!.familyFlags,
  };
}

// An aura that lasts until the next matching cast — a charged add-modifier. Shadow Trance and
// Netherwind Focus carry one charge in the C++ though the DBC says zero.
export function isUntilNextCastAuraSpell(spell: SpellDef | undefined | null): boolean {
  if (!spell) return false;
  if (spell.effects.some((e) => e.kind === 'next_cast_mod')) return true;
  if (spellModCharges(spell) <= 0) return false;
  return (spell.rawEffects ?? []).some((r) => {
    const aura = (r.auraName ?? 0) | 0;
    return aura === 107 || aura === 108;
  });
}
