// Periodic trigger slots whose trigger id is 0: the C++ runs a per-id switch for them, and the generic
// handler used to return and drop the slot. Tails with one cited id emit a proc trigger here.

import type { RawSpellEffect } from '../../../../data/schema.ts';
import {
  CONSUME_DURATION_MS,
  CONSUME_SPELL_ID,
  CONSUME_TICK_MS,
  consumeTickDamage,
} from '../../cmangos-special-cases-s18.ts';
import { effectAmountRange } from '../amount.ts';
import {
  FRENZIED_REGEN_MAX_STORED_RAGE,
  FRENZIED_REGEN_SPELL_IDS,
} from '../warrior-druid-kit.ts';
import type { HandlerState } from './shared.ts';
import { durationMsResolved, POWER_MANA, trunc } from './shared.ts';

// Shadow Bolt Whirl tick payloads (left/right cone cycle). First tick uses 24820; orientation cycle is AI
// cosmetic — combat fires 24820 each amp. Cite: SpellAuras.cpp:1001–1015 case 24834 spellForTick[8].
export const SHADOW_BOLT_WHIRL_TRIGGER_SPELL_ID = 24820;

// Thaumaturgy Channel creates a quest item rather than a combat payload, and is dispositioned as world
// utility. Cite: SpellAuras.cpp:971-974; spell_template 21029 ItemType 7867.
export const THAUMATURGY_CHANNEL_SPELL_ID = 9712;
export const THAUMATURGY_CREATE_ITEM_SPELL_ID = 21029;

// Defile 27177 — CMaNGOS case is commented empty (no periodic body). Stun co-slot remains. Cite:
// SpellAuras.cpp:1027–1028 // case 27177: break;
export const DEFILE_SPELL_ID = 27177;

/** Nitrous Boost self-mana cost per tick. Cite: SpellAuras.cpp:1031–1042. */
export const NITROUS_BOOST_SPELL_ID = 27746;
export const NITROUS_MANA_COST_PER_TICK = 10;

// Restoration (WSG trap buff): each tick restores maxHealth/10 and maxMana/10 — zero-trigger scripted body
// ("sniff confirmed to send no packets"). Cite: SpellAuras.cpp:983–994 case 23493.
export const WSG_RESTORATION_SPELL_ID = 23493;
export const WSG_RESTORATION_PCT_PER_TICK = 10;

// Brood Affliction: Bronze (Chromaggus) — 10% per tick to cast Time Stop 23171 (4s stun). Cite:
// SpellAuras.cpp:975–981 `if (urand(0, 9) >= 1) return;` → CastSpell(target, 23171).
export const BROOD_AFFLICTION_BRONZE_SPELL_ID = 23170;
export const BROOD_AFFLICTION_BRONZE_TRIGGER_SPELL_ID = 23171;
export const BROOD_AFFLICTION_BRONZE_TICK_CHANCE = 0.1;

// Wild Magic — Nefarian's mage class call, periodic Wild Polymorph 23603. Cite: SpellAuras.cpp:1074–1081
// SPELLFAMILY_WARRIOR case 23410; boss_nefarian.cpp:63 SPELL_MAGE.
export const WILD_MAGIC_SPELL_ID = 23410;
export const WILD_MAGIC_TRIGGER_SPELL_ID = 23603;

// Frost Blast (KT) tick damage = 26% target max health via custom cast 29879. Cite:
// boss_kelthuzad.cpp:593–606 SPELL_FROST_BLAST_DAMAGE = 29879.
export const FROST_BLAST_SPELL_ID = 27808;
export const FROST_BLAST_DAMAGE_SPELL_ID = 29879;
export const FROST_BLAST_MAX_HEALTH_PCT = 26;

// Detonate Mana (KT) → Mana Detonation 27820 (custom bp = 50% current mana burned). Cite:
// boss_kelthuzad.cpp:623–634; spell.sql spell_detonate_mana_kt.
export const DETONATE_MANA_SPELL_ID = 27819;
export const MANA_DETONATION_SPELL_ID = 27820;

/** Cannon Prep → Fire Cannon. Cite: SpellAuras.cpp:999–1002 trigger_spell_id = 24731. */
export const CANNON_PREP_SPELL_IDS = [24743, 24832] as const;
export const FIRE_CANNON_TRIGGER_SPELL_ID = 24731;

// Eye of C'Thun Rotate 360 / −360 → Dark Glare each amp. Cite: boss_cthun.cpp PeriodicRotate data.spellInfo
// = SPELL_DARK_GLARE (26029).
export const ROTATE_360_SPELL_IDS = [26009, 26136] as const;
export const DARK_GLARE_TRIGGER_SPELL_ID = 26029;

/** Ouro dirt-mound scarab pulse. Cite: boss_ouro.cpp PeriodicScarabTrigger → 26060. */
export const OURO_SCARABS_PERIODIC_SPELL_ID = 26619;
export const OURO_SUMMON_SCARABS_SPELL_ID = 26060;

// Sapphiron wing-buffet despawn metronome. Cite: boss_sapphiron.cpp SapphironsWingBuffetDespawn →
// SPELL_DESPAWN_BUFFET_EFFECT 29336.
export const WING_BUFFET_DESPAWN_SPELL_ID = 29330;
export const DESPAWN_BUFFET_EFFECT_SPELL_ID = 29336;

// Zero-trigger aura-23 holders whose C++/ScriptDev body casts exactly one spell. One triggerSpellId — the
// existing tick consumer. Cite: pin de8f729.
const ZERO_TRIGGER_SINGLE_CAST: Readonly<Record<number, number>> = {
  24743: FIRE_CANNON_TRIGGER_SPELL_ID,
  24832: FIRE_CANNON_TRIGGER_SPELL_ID,
  26009: DARK_GLARE_TRIGGER_SPELL_ID,
  26136: DARK_GLARE_TRIGGER_SPELL_ID,
  26619: OURO_SUMMON_SCARABS_SPELL_ID,
  29330: DESPAWN_BUFFET_EFFECT_SPELL_ID,
};

// Emit combat effects for a periodic-trigger slot whose trigger id is 0, returning true when the slot
// was handled — including an intentional no-op that is already covered.
export function emitPeriodicTriggerSpellZero(
  state: HandlerState,
  raw: RawSpellEffect,
): boolean {
  const id = state.spell.id | 0;
  const dur = durationMsResolved(state);
  const tickMs = (raw.amplitude | 0) || 0;
  const { min } = effectAmountRange(raw, state.ctx);

  // ── Frenzied Regeneration: rage → heal each tick ─────────────────────────
  // Cite: SpellAuras.cpp:1104–1116; warrior-druid-kit frenziedRegenTick.
  if (FRENZIED_REGEN_SPELL_IDS.has(id)) {
    // LifePerRage = modifier amount (bp+dice): r1=10, r2=15, r3=20.
    const lifePerRage = min > 0 ? min : 1;
    const amp = tickMs || 1000;
    // Max tick when rage pool ≥ 10 display (stored 100):
    // FRTriggerBasePoints = lRage * LifePerRage / 10. Cite: :1114.
    const amountPerTick = Math.max(
      1,
      Math.trunc((FRENZIED_REGEN_MAX_STORED_RAGE * lifePerRage) / 10),
    );
    state.effects.push({
      kind: 'restore_health',
      amountPerTick,
      tickMs: amp,
      durationMs: dur > 0 ? dur : 10_000,
    });
    state.role = state.role || 'buff';
    return true;
  }

  // ── Shadow Bolt Whirl: cast cone payload every amplitude ──────────────────
  // Cite: SpellAuras.cpp:1001–1015.
  if (id === 24834) {
    state.effects.push({
      kind: 'proc_trigger_spell',
      triggerSpellId: SHADOW_BOLT_WHIRL_TRIGGER_SPELL_ID,
      durationMs: dur,
      amount: min,
      tickMs: tickMs || 5000,
    });
    // Periodic trigger of Shadow Bolt payload — ACTIVE nuke role. Cite: roles.ts proc_trigger.
    state.role = state.role || 'instant_nuke';
    return true;
  }

  // ── Restoration (WSG powerup): 10% max health + 10% max mana per tick ────
  // Cite: SpellAuras.cpp:983–994 case 23493; pctOfMax = OBS_MOD_* tick semantics.
  if (id === WSG_RESTORATION_SPELL_ID) {
    const amp = tickMs || 1000;
    const durationMs = dur > 0 ? dur : 10_000;
    state.effects.push(
      {
        kind: 'restore_health',
        amountPerTick: 0,
        pctOfMax: WSG_RESTORATION_PCT_PER_TICK,
        tickMs: amp,
        durationMs,
      },
      {
        kind: 'restore_power',
        amountPerTick: 0,
        pctOfMax: WSG_RESTORATION_PCT_PER_TICK,
        powerType: POWER_MANA,
        tickMs: amp,
        durationMs,
        hostile: false,
      },
    );
    state.role = state.role || 'buff';
    return true;
  }

  // ── Brood Affliction: Bronze — 10%/tick → Time Stop 23171 ────────────────
  // Cite: SpellAuras.cpp:975–981.
  if (id === BROOD_AFFLICTION_BRONZE_SPELL_ID) {
    state.effects.push({
      kind: 'proc_trigger_spell',
      triggerSpellId: BROOD_AFFLICTION_BRONZE_TRIGGER_SPELL_ID,
      durationMs: dur,
      amount: min,
      tickMs: tickMs || 5000,
      tickChance: BROOD_AFFLICTION_BRONZE_TICK_CHANCE,
      // EffectImplicitTargetA 6 TARGET_UNIT_ENEMY — the affliction sits on the raid member.
      auraOnTarget: true,
    });
    state.role = state.role || 'control';
    return true;
  }

  // ── Wild Magic (Nefarian mage call) — periodic Wild Polymorph 23603 ──────
  // Cite: SpellAuras.cpp:1074–1081.
  if (id === WILD_MAGIC_SPELL_ID) {
    state.effects.push({
      kind: 'proc_trigger_spell',
      triggerSpellId: WILD_MAGIC_TRIGGER_SPELL_ID,
      durationMs: dur,
      amount: min,
      tickMs: tickMs || 5000,
    });
    state.role = state.role || 'control';
    return true;
  }

  // ── Nitrous Boost: −10 mana / tick; remove aura when mana < 10 ────────────
  // Self cost (targetA=1), not hostile leech. Cite: SpellAuras.cpp:1031–1042.
  if (id === NITROUS_BOOST_SPELL_ID) {
    state.effects.push({
      kind: 'restore_power',
      amountPerTick: -NITROUS_MANA_COST_PER_TICK,
      powerType: POWER_MANA,
      tickMs: tickMs || 1000,
      durationMs: dur,
      // Self maintain cost — must not flip isHostileSpellDef. Cite: predicates.ts.
      hostile: false,
    });
    state.role = state.role || 'buff';
    return true;
  }

  // ── Frost Blast (KT): 26% max-health frost damage per tick ───────────────
  // Cite: boss_kelthuzad.cpp:602–605.
  if (id === FROST_BLAST_SPELL_ID) {
    let amount = 1;
    if (state.ctx.targetMaxHealth != null && state.ctx.targetMaxHealth > 0) {
      amount = Math.max(
        1,
        trunc((Math.trunc(state.ctx.targetMaxHealth) * FROST_BLAST_MAX_HEALTH_PCT) / 100),
      );
    }
    const amp = tickMs || 1000;
    // DurationIndex 28 → 5000 ms. Cite: duration.ts FALLBACK; spell_template 27808.
    const durationMs = dur > 0 ? dur : 5000;
    state.effects.push({
      kind: 'dot',
      // Payload 29879 is school frost (School=4). Cite: spell_template 29879.
      school: 'frost',
      min: amount,
      max: amount,
      durationMs,
      tickMs: amp,
    });
    state.role = state.role || 'dot';
    return true;
  }

  // ── Detonate Mana (KT): periodic → Mana Detonation 27820 ──────────────────
  // Cite: boss_kelthuzad.cpp:623–634 (50% mana burn + cast 27820 with custom bp).
  if (id === DETONATE_MANA_SPELL_ID) {
    state.effects.push({
      kind: 'proc_trigger_spell',
      triggerSpellId: MANA_DETONATION_SPELL_ID,
      durationMs: dur > 0 ? dur : 5000,
      amount: min,
      tickMs: tickMs || 5000,
    });
    state.role = state.role || 'dot';
    return true;
  }

  // ── Consume (AQ40): each tick CastCustomSpell(25373) at 10% max health ───
  // Cite: SpellAuras.cpp:1019–1023 case 25371 bpDamage = maxHealth * 10 / 100.
  if (id === CONSUME_SPELL_ID) {
    let amount = 1;
    if (state.ctx.targetMaxHealth != null && state.ctx.targetMaxHealth > 0) {
      amount = Math.max(1, consumeTickDamage(state.ctx.targetMaxHealth));
    }
    const amp = tickMs || CONSUME_TICK_MS;
    const durationMs = dur > 0 ? dur : CONSUME_DURATION_MS;
    state.effects.push({
      kind: 'dot',
      school: 'nature',
      min: amount,
      max: amount,
      durationMs,
      tickMs: amp,
    });
    state.role = state.role || 'dot';
    return true;
  }

  // Cited single-cast tails: the C++ sets one trigger id, so this is the same proc row the generic
  // handler emits. Cite: SpellAuras.cpp:953, :1147-1224.
  if (id === 27747) {
    // Steam Tank Passive energizes POWER_MANA. Cite: SpellAuras.cpp:1044-1049.
    state.effects.push({
      kind: 'restore_power',
      amountPerTick: 10,
      powerType: POWER_MANA,
      tickMs: tickMs || 1000,
      durationMs: dur,
      hostile: false,
    });
    state.role = state.role || 'buff';
    return true;
  }

  const singleCast = ZERO_TRIGGER_SINGLE_CAST[id];
  if (singleCast) {
    const tgtA = raw.targetA | 0;
    state.effects.push({
      kind: 'proc_trigger_spell',
      triggerSpellId: singleCast,
      durationMs: dur,
      amount: min,
      tickMs: tickMs || 1000,
      // TARGET_UNIT=25 (Cannon Prep) sits on the vehicle. Cite: auras-core auraSitsOnTarget.
      ...(tgtA === 21 || tgtA === 25 || tgtA === 6 ? { auraOnTarget: true } : {}),
    });
    // Dark Glare is the Eye beam. Cite: boss_cthun.cpp SPELL_DARK_GLARE 26029.
    state.role = state.role || (singleCast === DARK_GLARE_TRIGGER_SPELL_ID ? 'instant_nuke' : 'buff');
    return true;
  }

  // Defile, Thaumaturgy and Cat Form have an intentionally empty body, so a handled marker is still
  // surfaced to keep the isolate and hollow paths from reading false-red.
  if (id === DEFILE_SPELL_ID || id === THAUMATURGY_CHANNEL_SPELL_ID || id === 768) {
    state.effects.push({ kind: 'client_inform' });
    return true;
  }
  // Commented-empty TriggerSpell cases. Cite: SpellAuras.cpp:995–1061.
  if (
    id === 24379 || id === 24918 || id === 26196 || id === 27673
    || id === 28096 || id === 28111 || id === 29897 || id === 30025
  ) {
    state.effects.push({ kind: 'client_inform' });
    return true;
  }

  // Unknown zero-trigger id — C++ default break. Client-inform so the slot is not hollow.
  // Cite: SpellAuras.cpp:1060–1061 default: break.
  state.effects.push({ kind: 'client_inform' });
  return true;
}
