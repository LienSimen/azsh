// Reader for interpreter intents combat never sees: convert an intent-only slot to the effect kind the
// host already applies, skipping when that row exists. Outside interpreter/ so the census credits it.

import type { SpellEffect } from '../../data/schema.ts';

export interface IntentLike {
  kind: string;
  amount?: number;
  durationMs?: number;
  spellId?: number;
  mechanic?: number;
  effectId?: number;
  /** MECHANIC bitmask a `mechanic_immunity_purge` intent strips (Improved Sprint 30918). */
  mechanicMask?: number;
  count?: number;
  health?: number;
  mana?: number;
  percent?: number;
  multipleValue?: number;
  schoolMask?: number;
  speedXY?: number;
  speedZ?: number;
  distance?: number;
  creature?: number;
  factionId?: number;
  triggerSpellId?: number;
  languageId?: number;
}

function hasKind(effects: readonly SpellEffect[], kind: string): boolean {
  return effects.some((e) => e.kind === kind);
}

function hasBuffMod(effects: readonly SpellEffect[], mod: string): boolean {
  return effects.some((e) => e.kind === 'buff' && 'mod' in e && (e as { mod: string }).mod === mod);
}

/** Lift unread intents into effects[] the combat/OOC host already reads. */
export function materializeUnreadIntents(
  intents: readonly IntentLike[] | undefined,
  existing: SpellEffect[],
): SpellEffect[] {
  if (!intents?.length) return existing;
  let effects = existing;
  const push = (row: SpellEffect): void => {
    effects = [...effects, row];
  };

  for (const intent of intents) {
    const dur = (intent.durationMs ?? 0) | 0;
    const amt = intent.amount ?? 0;
    switch (intent.kind) {
      case 'teleport_units':
        if (!hasKind(effects, 'teleport') && !hasKind(effects, 'teleport_hearth')) {
          push({ kind: 'teleport' });
        }
        break;
      case 'mod_silence_interrupt':
        if (!effects.some((e) => e.kind === 'cc' && 'control' in e && e.control === 'silence')) {
          push({
            kind: 'interrupt_cast',
            lockoutMs: dur > 0 ? dur : 0,
          });
        }
        break;
      case 'mod_charm':
        if (!effects.some((e) => e.kind === 'cc' && 'control' in e && e.control === 'charm')) {
          push({
            kind: 'cc',
            control: 'charm',
            mechanic: 'charm',
            durationMs: dur,
            school: 'shadow',
          });
        }
        break;
      case 'periodic_leech_heal': {
        const mult = intent.multipleValue != null && intent.multipleValue > 0 ? intent.multipleValue : 1;
        effects = effects.map((e) => {
          if (e.kind !== 'dot') return e;
          if ('leechMultiple' in e && e.leechMultiple != null && e.leechMultiple > 0) return e;
          return { ...e, leechMultiple: mult };
        });
        break;
      }
      case 'mod_shapeshift':
        break;
      case 'summon_class_pet':
      case 'summon_guardian_pet':
        if (!hasKind(effects, 'summon_pet')) {
          push({ kind: 'summon_pet', creature: (intent.creature ?? 0) | 0 });
        }
        break;
      case 'mod_resistance_pct':
        if (!hasBuffMod(effects, 'armor_pct') && (intent.schoolMask ?? 1) & 1) {
          push({ kind: 'buff', mod: 'armor_pct', amount: amt, durationMs: dur });
        }
        break;
      case 'mod_hit_chance':
        if (!hasBuffMod(effects, 'hit')) {
          push({ kind: 'buff', mod: 'hit', amount: amt, durationMs: dur });
        }
        break;
      case 'mod_stun_special':
        if (!hasKind(effects, 'cc')) {
          push({
            kind: 'cc',
            control: 'stun',
            mechanic: 'stun',
            durationMs: dur,
            school: 'physical',
          });
        }
        break;
      case 'mod_crit_percent':
        if (!hasBuffMod(effects, 'crit')) {
          push({ kind: 'buff', mod: 'crit', amount: amt, durationMs: dur });
        }
        break;
      case 'periodic_mana_leech': {
        const mult = intent.multipleValue != null && intent.multipleValue > 0 ? intent.multipleValue : 1;
        effects = effects.map((e) => {
          if (e.kind !== 'restore_power') return e;
          if ('leechMultiple' in e && e.leechMultiple != null && e.leechMultiple > 0) return e;
          return { ...e, leechMultiple: mult };
        });
        break;
      }
      case 'mod_root_special':
        if (!hasKind(effects, 'root')) {
          push({ kind: 'root', durationMs: dur, mechanic: 'root' });
        }
        break;
      case 'resurrect_new':
        if (!hasKind(effects, 'resurrect') && !hasKind(effects, 'resurrect_pct')) {
          push({
            kind: 'resurrect',
            health: (intent.health ?? 0) | 0,
            mana: (intent.mana ?? 0) | 0,
          });
        }
        break;
      case 'mod_disarm_attack_time':
        if (!effects.some((e) => e.kind === 'cc' && 'control' in e && e.control === 'disarm')) {
          push({
            kind: 'cc',
            control: 'disarm',
            mechanic: 'disarm',
            durationMs: dur,
            school: 'physical',
          });
        }
        break;
      case 'mod_block_percent':
        if (!hasBuffMod(effects, 'block')) {
          push({ kind: 'buff', mod: 'block', amount: amt, durationMs: dur });
        }
        break;
      case 'mod_healing_done':
        if (!hasBuffMod(effects, 'healing_done')) {
          push({ kind: 'buff', mod: 'healing_done', amount: amt, durationMs: dur });
        }
        break;
      case 'mod_possess':
        if (!hasKind(effects, 'cc')) {
          push({
            kind: 'cc',
            control: 'charm',
            mechanic: 'charm',
            durationMs: dur,
            school: 'shadow',
          });
        }
        break;
      case 'mod_damage_done_versus':
        if (!hasBuffMod(effects, 'attack_power')) {
          push({ kind: 'buff', mod: 'attack_power', amount: amt, durationMs: dur });
        }
        break;
      case 'mod_damage_done_creature':
        break;
      case 'mod_ranged_damage_taken':
        if (!hasBuffMod(effects, 'ranged_taken')) {
          push({ kind: 'buff', mod: 'ranged_taken', amount: amt, durationMs: dur });
        }
        break;
      case 'pull_towards':
        if (!hasKind(effects, 'pull_towards') && !hasKind(effects, 'knock_back')) {
          push({
            kind: 'pull_towards',
            speedXY: intent.speedXY ?? 0,
            ...(intent.speedZ != null ? { speedZ: intent.speedZ } : {}),
            ...(intent.distance != null ? { distance: intent.distance } : {}),
          });
        }
        break;
      case 'mod_power_regen_percent':
        if (!hasBuffMod(effects, 'mana_regen_pct')) {
          push({ kind: 'buff', mod: 'mana_regen_pct', amount: amt, durationMs: dur });
        }
        break;
      case 'effect_immunity':
        if (!hasKind(effects, 'effect_immunity')) {
          push({
            kind: 'effect_immunity',
            effectId: intent.effectId ?? 0,
            durationMs: dur,
            positive: true,
          });
        }
        break;
      case 'school_immunity_special':
        if (!hasKind(effects, 'school_immunity')) {
          push({
            kind: 'school_immunity',
            schoolMask: (intent.schoolMask ?? 0) | 0,
            durationMs: dur,
            positive: true,
          });
        }
        break;
      case 'mechanic_immunity_purge':
        if (!hasKind(effects, 'mechanic_immunity_purge')) {
          push({
            kind: 'mechanic_immunity_purge',
            mechanic: intent.mechanic ?? 0,
            mechanicMask: intent.mechanicMask ?? 0,
          });
        }
        break;
      case 'mod_increase_health_special':
        if (!hasBuffMod(effects, 'max_health')) {
          push({ kind: 'buff', mod: 'max_health', amount: amt, durationMs: dur });
        }
        break;
      case 'cast_triggered_spell':
      case 'trigger_spell_as_unit_target':
      case 'max_stack_trigger': {
        const sid = (intent.spellId ?? intent.triggerSpellId ?? 0) | 0;
        if (sid && !effects.some((e) => e.kind === 'trigger_spell' && 'spellId' in e && e.spellId === sid)) {
          push({ kind: 'trigger_spell', spellId: sid });
        }
        break;
      }
      case 'mod_melee_attack_power_versus':
        if (!hasBuffMod(effects, 'attack_power')) {
          push({ kind: 'buff', mod: 'attack_power', amount: amt, durationMs: dur });
        }
        break;
      case 'mod_target_resistance':
        if (!hasKind(effects, 'resist')) {
          push({ kind: 'resist', school: 'physical', amount: amt });
        }
        break;
      case 'mod_increase_energy':
        if (!hasBuffMod(effects, 'max_mana')) {
          push({ kind: 'buff', mod: 'max_mana', amount: amt, durationMs: dur });
        }
        break;
      case 'far_sight':
        if (!hasKind(effects, 'bind_sight') && !hasKind(effects, 'add_farsight')) {
          push({ kind: 'bind_sight', durationMs: dur });
        }
        break;
      case 'mod_power_cost_school':
      case 'mod_power_cost_school_pct':
        break;
      case 'power_burn_mana':
        if (!hasKind(effects, 'power_burn') && !hasKind(effects, 'restore_power')) {
          push({
            kind: 'power_burn',
            powerType: 0,
            min: amt,
            max: amt,
            multiplier: intent.multipleValue ?? 1,
            school: 'shadow',
          });
        }
        break;
      case 'mod_spell_hit_chance':
        if (!hasBuffMod(effects, 'spell_hit')) {
          push({ kind: 'buff', mod: 'spell_hit', amount: amt, durationMs: dur });
        }
        break;
      case 'untrackable':
        if (!hasKind(effects, 'stealth') && !hasKind(effects, 'mod_unattackable')) {
          push({ kind: 'mod_unattackable', durationMs: dur, combatStopOnApply: true });
        }
        break;
      case 'portal_unused':
      case 'bind_sight_null':
      case 'attack_unused':
      case 'language_marker':
      case 'dodge_marker':
      case 'empathy':
        break;
      case 'periodic_trigger_remove':
        break;
      case 'periodic_health_funnel':
        effects = effects.map((e) => {
          if (e.kind !== 'dot') return e;
          if ('healthFunnel' in e && e.healthFunnel) return e;
          return { ...e, healthFunnel: true, leechMultiple: intent.multipleValue ?? 1 };
        });
        break;
      case 'no_pvp_credit':
        if (!hasKind(effects, 'no_pvp_credit')) {
          push({ kind: 'no_pvp_credit', durationMs: dur });
        }
        break;
      case 'track_stealthed':
        if (!hasKind(effects, 'stealth_detect') && amt !== 0) {
          push({ kind: 'stealth_detect', amount: amt, durationMs: dur });
        }
        break;
      case 'mod_increase_health_percent_special':
        if (!hasBuffMod(effects, 'max_health_pct')) {
          push({ kind: 'buff', mod: 'max_health_pct', amount: amt, durationMs: dur });
        }
        break;
      case 'mod_attacker_spell_crit_chance':
        if (!hasBuffMod(effects, 'attacker_spell_crit')) {
          push({ kind: 'buff', mod: 'attacker_spell_crit', amount: amt, durationMs: dur });
        }
        break;
      case 'mod_flat_spell_damage_versus':
        if (!hasBuffMod(effects, 'spell_power')) {
          push({ kind: 'buff', mod: 'spell_power', amount: amt, durationMs: dur });
        }
        break;
      case 'threat_percent':
        if (!hasKind(effects, 'modify_threat_pct')) {
          push({ kind: 'modify_threat_pct', pct: amt });
        }
        break;
      case 'mod_shield_blockvalue':
        if (!hasBuffMod(effects, 'block_value')) {
          push({ kind: 'buff', mod: 'block_value', amount: amt, durationMs: dur });
        }
        break;
      case 'mod_shield_blockvalue_pct':
        if (!hasBuffMod(effects, 'block_value_pct')) {
          push({ kind: 'buff', mod: 'block_value_pct', amount: amt, durationMs: dur });
        }
        break;
      default:
        break;
    }
  }
  return effects;
}
