/** SI2.5 / SI3 handlers — effects-action-utility (split from handlers.ts, pure move). */

import type { RawSpellEffect } from '../../../../data/schema.ts';
import { BASE_CHARGE_SPEED } from '../../../../domain/nav/speed.ts';
import {
  EVERLOOK_TRANSPORTER_SPELL_ID,
  everlookTransporterOutcomeSpellId,
} from '../../cmangos-special-cases.ts';
import { effectAmountRange, clampPositiveRange } from '../amount.ts';
import type {
  InterpretIntent,
} from '../types.ts';
import { dispatchDummy, dispatchScript } from '../registry/index.ts';
import { isMagePortalGo, isMagePortalSpell } from '../mage-portals.ts';
import {
  SPELL_EFFECT_OPEN_LOCK_ITEM,
} from '../opcodes.ts';
import type {
  HandlerState,
} from './shared.ts';
import {
  SPELLFAMILY_WARRIOR,
  SPELLFAMILY_WARLOCK,
  SPELLFAMILY_ROGUE,
  ITEM_CLASS_WEAPON,
  ITEM_CLASS_ARMOR,
  TARGET_LOCATION_DATABASE,
  IN_MILLISECONDS,
  STUCK_HEARTHSTONE_SPELL,
  STUCK_NUDGE_DISTANCE,
  SHIELD_SLAM_IDS,
  MAX_POWERS,
  POWER_HAPPINESS,
  MAX_EXTRA_ATTACKS,
  MOVEMENT_GRAVITY,
  DYNAMIC_OBJECT_FARSIGHT_FOCUS,
  VANISH_SANCTUARY_FAMILY_FLAGS,
  VANISH_CANNOT_BE_DETECTED_MS,
  SHIELD_SLAM_DISPEL_FLAG,
  SPELLCATEGORY_DEVOUR_MAGIC,
  DEVOUR_MAGIC_HEAL,
  GO_ACTION,
  GO_TYPE_FISHINGNODE,
  FISHING_BOBBER_READY_TIME,
  TWILIGHT_TEMPLARS,
  TWILIGHT_DUKES,
  TWILIGHT_ROYALS,
  TWILIGHT_FIXED_NPC,
  schoolOf,
  familyOf,
  flagsOf,
  durationMsResolved,
  trunc,
  calculateSimpleValue,
} from './shared.ts';
// ── SI3 batch 1 ─────────────────────────────────────────────────────────────

// SPELL_EFFECT_SEND_EVENT emits a real EFFECT, not just an intent: intent-only left pure send-event
// rows with an empty effect list, so consumers reading effects saw nothing. Misc may legitimately be 0.
export function handleSendEvent(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const eventId = raw.miscValue | 0;
  // Combat / resolveCombatSpell / OOC surface — map event id for dbscripts_on_event.
  state.effects.push({ kind: 'send_event', eventId });
  state.intents.push({ kind: 'send_event', eventId });
}

// SPELL_EFFECT_OPEN_LOCK and its item form, player caster only, where the amount is the LOCK SKILL and
// never damage. A real effect, since intent-only left multi-slot rows missing the open-lock rule.
export function handleOpenLock(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // C++: !player caster → return. Cite: :2206–2210.
  if (state.ctx.casterIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'OPEN_LOCK requires player caster' });
    return;
  }
  const { min } = effectAmountRange(raw, state.ctx);
  const lockType = raw.miscValue | 0;
  const eff = raw.effect | 0;
  // Item vs GO: opcode 59 is item-cast open; 33 is GO/item target open.
  // Cite: :2217–2228; dispatch 33+59 → EffectOpenLock.
  let fromItem: boolean;
  if (state.ctx.openLockTargetIsItem != null) {
    fromItem = state.ctx.openLockTargetIsItem;
  } else {
    fromItem = eff === SPELL_EFFECT_OPEN_LOCK_ITEM;
  }
  const intent: InterpretIntent = {
    kind: 'open_lock',
    skillBonus: min,
    fromItem,
  };
  if (lockType) intent.lockType = lockType;
  // Combat / resolveCombatSpell / OOC surface — payload for openLockFromSpell.
  state.effects.push({
    kind: 'open_lock',
    skillBonus: min,
    fromItem,
    ...(lockType ? { lockType } : {}),
  });
  state.intents.push(intent);
}

// SPELL_EFFECT_LEARN_SPELL (36). Player unitTarget → learn EffectTriggerSpell; non-player + player caster →
// pet path. Cite: SpellEffects.cpp:2445–2465; EffectLearnPetSpell :3386–3411.
export function handleLearnSpell(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const spellToLearn = raw.triggerSpell | 0;
  // No unitTarget at interpret time — bake-thin defaults to player path when trigger set.
  const unitIsPlayer = state.ctx.unitTargetIsPlayer !== false;
  const casterIsPlayer = state.ctx.casterIsPlayer !== false;

  if (!unitIsPlayer) {
    // EffectLearnSpell :2450–2455 → EffectLearnPetSpell when caster is player.
    if (!casterIsPlayer) return;
    if (!spellToLearn) {
      state.intents.push({ kind: 'skip_effect', reason: 'LEARN_SPELL pet path empty triggerSpell' });
      return;
    }
    state.intents.push({ kind: 'learn_spell', spellId: spellToLearn, target: 'pet' });
    state.effects.push({ kind: 'learn_pet_spell', spellId: spellToLearn });
    return;
  }

  // Player path always calls learnSpell(trigger) even if 0 in C++ — skip empty for honesty.
  if (!spellToLearn) {
    state.intents.push({ kind: 'skip_effect', reason: 'LEARN_SPELL empty EffectTriggerSpell' });
    return;
  }
  state.intents.push({ kind: 'learn_spell', spellId: spellToLearn, target: 'player' });
  state.effects.push({ kind: 'learn_spell', spellId: spellToLearn });
}

// SPELL_EFFECT_LEARN_PET_SPELL (57). Player caster; EffectTriggerSpell is the taught id. Cite:
// SpellEffects.cpp:3386–3404 EffectLearnPetSpell.
export function handleLearnPetSpell(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  if (state.ctx.casterIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'LEARN_PET_SPELL requires player caster' });
    return;
  }
  const spellToLearn = raw.triggerSpell | 0;
  if (!spellToLearn) {
    state.intents.push({ kind: 'skip_effect', reason: 'LEARN_PET_SPELL empty EffectTriggerSpell' });
    return;
  }
  state.effects.push({ kind: 'learn_pet_spell', spellId: spellToLearn });
}

// SPELL_EFFECT_KNOCK_BACK: the speeds are the misc value and damage over ten, skipped on a rooted
// target. A real effect, since the resolver drops intents and multi-slot rows lost the knock.
export function handleKnockBack(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  if (state.ctx.targetRooted === true) {
    state.intents.push({ kind: 'skip_effect', reason: 'KNOCK_BACK target rooted (UNIT_STAT_ROOT)' });
    return;
  }
  const horizontal = (raw.miscValue | 0) / 10;
  // damage = calculated effect value; emit min of range as vertical source (no roll).
  const { min } = effectAmountRange(raw, state.ctx);
  const vertical = min / 10;
  // Combat / resolveCombatSpell surface — speeds for SMSG_MOVE_KNOCK_BACK trajectory.
  state.effects.push({ kind: 'knock_back', horizontal, vertical });
  state.intents.push({ kind: 'knock_back', horizontal, vertical });
}

// ── SI3 batch 2 ─────────────────────────────────────────────────────────────

// SPELL_EFFECT_HEALTH_LEECH: a damage range plus the heal multiplier, where 0 reads as 1 for bake
// parity. A supplied target health caps the damage. Cite: SpellEffects.cpp:1905-1934.
export function handleHealthLeech(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const { min: baseMin, max: baseMax } = effectAmountRange(raw, state.ctx);
  // damage < 0 → return. Cite: :1910–1911.
  if (baseMax < 0 && baseMin < 0) return;

  let min = baseMin;
  let max = baseMax;
  // Cap to current health when supplied. Cite: :1915–1918 (after SpellNonMeleeDamageLog).
  const curHp = state.ctx.targetHealth;
  if (curHp != null) {
    const cap = Math.trunc(curHp);
    if (min > cap) min = cap;
    if (max > cap) max = cap;
  }
  const clamped = clampPositiveRange(min, max);
  const multRaw = Number(raw.multipleValue);
  // C++ uses float multiplier as-is; bake uses mult || 1 when 0/absent.
  // Cite: :1920; map-spell-effects :452.
  const multiplier = multRaw && multRaw !== 0 ? multRaw : 1;
  state.effects.push({
    kind: 'health_leech',
    school: schoolOf(state.spell),
    min: clamped.min,
    max: clamped.max,
    multiplier,
  });
}

// SPELL_EFFECT_POWER_BURN (62). Burn power (misc = Powers), deal burned × EffectMultipleValue as school
// damage. Cite: SpellEffects.cpp:1801–1829; map-spell-effects.mjs :445–448.
export function handlePowerBurn(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const powerType = raw.miscValue | 0;
  // Cite: :1803–1804 invalid power.
  if (powerType < 0 || powerType >= MAX_POWERS) return;

  // Target power type must match when provided. Cite: :1808.
  if (state.ctx.targetPowerType != null && (state.ctx.targetPowerType | 0) !== powerType) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'POWER_BURN target power type mismatch',
    });
    return;
  }

  const { min: baseMin, max: baseMax } = effectAmountRange(raw, state.ctx);
  // damage < 0 → return. Cite: :1811–1812.
  if (baseMax < 0 && baseMin < 0) return;

  let min = baseMin;
  let max = baseMax;
  // Clamp to current power when supplied. Cite: :1814–1816.
  if (state.ctx.targetPower != null) {
    const cur = Math.trunc(state.ctx.targetPower);
    if (min > cur) min = cur;
    if (max > cur) max = cur;
  }
  const clamped = clampPositiveRange(min, max);
  const multRaw = Number(raw.multipleValue);
  const multiplier = multRaw && multRaw !== 0 ? multRaw : 1;
  state.effects.push({
    kind: 'power_burn',
    powerType,
    min: clamped.min,
    max: clamped.max,
    multiplier,
    school: schoolOf(state.spell),
  });
}

// SPELL_EFFECT_THREAT (63). AddThreat(caster, damage, false, school, spell). Bake amount = effect min
// (signed OK). Cite: SpellEffects.cpp:3567–3577; map-spell-effects.mjs :357–358.
export function handleThreat(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Alive gates are runtime. Emit amount from calculated damage (range min for bake).
  const { min } = effectAmountRange(raw, state.ctx);
  state.effects.push({ kind: 'threat', amount: min });
}

// SPELL_EFFECT_DISPEL: the count is the damage, with 0 reading as 1. Cite: SpellEffects.cpp:2467-2497
// EffectDispel; ProcessDispelList :2521-2575; EvaluateResultLists :2577.
export function handleDispel(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const fam = familyOf(state.spell);
  const flags = BigInt(state.spell.spellFamilyFlags ?? 0);
  // Shield Slam 50% chance dispel. Cite: :2472–2475.
  const isShieldSlamDispel =
    fam === SPELLFAMILY_WARRIOR
    && ((flags & SHIELD_SLAM_DISPEL_FLAG) !== 0n
      || SHIELD_SLAM_IDS.has(state.spell.id | 0));
  if (isShieldSlamDispel) {
    // Bake-thin (no rng): always emit (oracle). With rng: roll_chance_i(50) → 50% skip.
    // Cite: :2474 !roll_chance_i(50) return. roll_chance_i(50) true when roll < 50.
    if (state.ctx.rng) {
      // Draw: [0,1) → *100 as int percent; fail path when roll >= 50.
      const roll = Math.floor(state.ctx.rng() * 100);
      if (roll >= 50) {
        state.intents.push({
          kind: 'skip_effect',
          reason: 'DISPEL Shield Slam 50% chance failed',
        });
        return;
      }
    }
  }

  const { min } = effectAmountRange(raw, state.ctx);
  // ProcessDispelList: if (!damage) damage = 1. Cite: :2527–2528; bake Math.max(1, min).
  const count = Math.max(1, min);
  const dispelType = raw.miscValue | 0;
  state.effects.push({ kind: 'dispel', dispelType, count });
  state.role = state.role || 'buff';

  // Devour Magic heal table — only after successful dispel at runtime.
  // Cite: :2596–2612; SpellMgr.h SPELLCATEGORY_DEVOUR_MAGIC = 12.
  if (fam === SPELLFAMILY_WARLOCK) {
    const cat = state.ctx.spellCategory ?? state.spell.category ?? 0;
    if (cat === SPELLCATEGORY_DEVOUR_MAGIC) {
      const healSpell = DEVOUR_MAGIC_HEAL[state.spell.id | 0];
      if (healSpell) {
        state.intents.push({ kind: 'devour_magic_heal', healSpellId: healSpell });
      }
    }
  }
}

// SPELL_EFFECT_ADD_COMBO_POINTS: a player caster with a positive amount adds that many points. The
// bake also stamps the generated count; the kind covers a standalone grant.
export function handleAddComboPoints(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Non-player caster → return. Cite: :4217–4218.
  if (state.ctx.casterIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'ADD_COMBO_POINTS non-player caster' });
    return;
  }
  const { min } = effectAmountRange(raw, state.ctx);
  // damage <= 0 → return. Cite: :4221–4222.
  if (min <= 0) return;
  // Bake uses Math.max(1, min) for comboPointsGenerated; C++ uses damage when > 0.
  // Emit schema kind for Premeditation / openers. Cite: schema SpellEffect combo_points.
  state.effects.push({ kind: 'combo_points', amount: min });
}

// SPELL_EFFECT_ACTIVATE_OBJECT: the misc value is the gameobject action. A real effect, since
// intent-only left pure and multi-slot rows without the GO action at the combat surface.
export function handleActivateObject(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // gameObjTarget null → return is runtime; emit action always so resolveCombatSpell sees the slot.
  const action = raw.miscValue | 0;
  const intent: InterpretIntent = { kind: 'activate_object', action };
  const id = state.spell.id | 0;

  // OPEN / DISTURB specials. Cite: :4394–4405.
  if (action === GO_ACTION.DISTURB || action === GO_ACTION.OPEN) {
    if (id === 17731) {
      // Onyxia Eruption — custom anim, not Use.
      intent.customAnim = true;
    }
  }

  // MAKE_INERT / MAKE_ACTIVE Twilight Council summons. Cite: :4421–4470.
  if (action === GO_ACTION.MAKE_INERT || action === GO_ACTION.MAKE_ACTIVE) {
    let npcEntry = TWILIGHT_FIXED_NPC[id];
    if (npcEntry == null) {
      // Random tables: 24734 templars, 24763 dukes, 24784 royals. Cite: :4448–4450.
      const table =
        id === 24734 ? TWILIGHT_TEMPLARS
          : id === 24763 ? TWILIGHT_DUKES
            : id === 24784 ? TWILIGHT_ROYALS
              : null;
      if (table) {
        if (state.ctx.rng) {
          // urand(0, 3) — four entries. Cite: :4448.
          const idx = Math.floor(state.ctx.rng() * table.length) % table.length;
          npcEntry = table[idx];
        } else {
          // Bake-thin: first entry (deterministic, no Math.random).
          npcEntry = table[0];
        }
      }
    }
    if (npcEntry != null) intent.summonNpcEntry = npcEntry;
  }

  // Combat / resolveCombatSpell / OOC surface — GO action payload for activateObjectFromSpell.
  state.effects.push({
    kind: 'activate_object',
    action,
    ...(intent.customAnim ? { customAnim: true as const } : {}),
    ...(intent.summonNpcEntry != null ? { summonNpcEntry: intent.summonNpcEntry } : {}),
  });
  state.intents.push(intent);
}

// SPELL_EFFECT_TRANS_DOOR summons a gameobject by misc value. A mage capital portal has no
// multiplayer pad here, so it pushes a teleport and routes through the city travel path.
export function handleTransDoor(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const goEntry = raw.miscValue | 0;
  // !goinfo → return. Cite: :5275–5280.
  if (!goEntry) return;

  let durationMs = durationMsResolved(state);
  const goType = state.ctx.gameObjectType;
  // Materialize effects[] for fishing node / door GO place (census + combat place-GO).
  // Cite: SpellEffects.cpp EffectTransmitted.
  const effect: Record<string, unknown> = {
    kind: 'transmitted_object',
    goEntry,
    durationMs,
  };
  if (goType != null) {
    effect.goType = goType | 0;
    // Fishing bobber lastSec urand(0,3) → 3/7/13/17; duration adjust. Cite: :5351–5368.
    if ((goType | 0) === GO_TYPE_FISHINGNODE) {
      let lastSec = 3;
      if (state.ctx.rng) {
        const pick = Math.floor(state.ctx.rng() * 4) % 4;
        lastSec = pick === 0 ? 3 : pick === 1 ? 7 : pick === 2 ? 13 : 17;
      }
      effect.fishingBobberLastSec = lastSec;
      // duration = duration - lastSec*IN_MS + FISHING_BOBBER_READY_TIME*IN_MS
      durationMs = durationMs - lastSec * 1000 + FISHING_BOBBER_READY_TIME * 1000;
      effect.durationMs = durationMs;
    }
    // SUMMONING_RITUAL (18) / SPELLCASTER (22) / BUTTON (1): position + flag specials
    // are world/runtime (caster pos, AddGameObject, startOpen). Cite: :5370–5392.
  }
  // Always materialize so non-portal fishing/door slots are readable (B/D).
  state.effects.push(effect as never);

  // A capital portal travels like a city teleport. Ritual of Summoning and Lightwell stay intent-only
  // or kit-materialized. Cite: mage-portals.ts.
  if (
    isMagePortalGo(goEntry)
    || isMagePortalSpell(state.spell.id | 0)
  ) {
    if (!state.effects.some((e) => e.kind === 'teleport')) {
      state.effects.push({ kind: 'teleport' });
    }
    state.role = state.role || 'utility';
  }
}

// SPELL_EFFECT_INTERRUPT_CAST (68). Lockout duration = GetSpellDuration(interrupt spell); school from
// interrupted cast (runtime). Cite: SpellEffects.cpp:3591–3618; map-spell-effects.mjs :343–348.
export function handleInterruptCast(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Alive / interruptible current-spell scan is runtime. Bake emits lockoutMs from DurationIndex.
  const lockoutMs = durationMsResolved(state);
  state.effects.push({ kind: 'interrupt_cast', lockoutMs });
  if (!state.role) state.role = 'control';
  // mechanic on raw (26 = interrupt) is payload for engine; no amount use here.
  void raw;
}

// ── SI3 batch 3 ─────────────────────────────────────────────────────────────

// SPELL_EFFECT_INSTAKILL deals the target's whole health. It emits a combat effect as well as the
// intent, and is self-cast when the target is the caster or targetA names the caster.
export function handleInstaKill(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Alive gate when supplied. Cite: :207.
  if (state.ctx.unitTargetIsAlive === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'INSTAKILL target not alive' });
    return;
  }
  // A raw targetA of caster is the common self path when the context is not filled in. Effects are
  // materialized for combat and intents for the census.
  const selfCast =
    state.ctx.unitTargetIsSelf === true
    || (raw.targetA | 0) === 1;
  const intent: InterpretIntent = { kind: 'instakill' };
  if (selfCast) intent.selfCast = true;
  state.intents.push(intent);
  state.effects.push({ kind: 'instakill', self: selfCast });
}

// SPELL_EFFECT_PROFICIENCY (60). Player-only; add weapon or armor proficiency from
// EquippedItemClass/SubClassMask. Cite: SpellEffects.cpp:2314–2331.
export function handleProficiency(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  // Cite: :2316–2317 non-player return.
  if (state.ctx.casterIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'PROFICIENCY requires player caster' });
    return;
  }
  const itemClass =
    state.ctx.equippedItemClass
    ?? state.spell.equippedItemClass
    ?? 0;
  const subClassMask =
    state.ctx.equippedItemSubClassMask
    ?? state.spell.equippedItemSubClassMask
    ?? 0;
  // Only weapon / armor classes apply. Cite: :2322–2330.
  if (itemClass !== ITEM_CLASS_WEAPON && itemClass !== ITEM_CLASS_ARMOR) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'PROFICIENCY EquippedItemClass is not weapon/armor',
    });
    return;
  }
  state.intents.push({
    kind: 'proficiency',
    itemClass,
    subClassMask,
  });
}

// SPELL_EFFECT_DISPEL_MECHANIC (108). mechanic = EffectMiscValue; count = damage (0 → 1). ProcessDispelList
// shared with DISPEL. Cite: SpellEffects.cpp:2499–2519; ProcessDispelList :2521–2575.
export function handleDispelMechanic(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const mechanic = raw.miscValue | 0;
  const { min } = effectAmountRange(raw, state.ctx);
  // ProcessDispelList: if (!damage) damage = 1. Cite: :2527–2528.
  const count = Math.max(1, min);
  state.intents.push({ kind: 'dispel_mechanic', mechanic, count });
  state.effects.push({ kind: 'dispel_mechanic', mechanic, count });
  state.role = state.role || 'buff';
}

// SPELL_EFFECT_QUEST_COMPLETE (16). AreaExploredOrEventHappens(EffectMiscValue) on player unitTarget. Cite:
// SpellEffects.cpp:4928–4935.
export function handleQuestComplete(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :4930 non-player / missing target return.
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'QUEST_COMPLETE requires player unitTarget' });
    return;
  }
  const questId = raw.miscValue | 0;
  // C++ still calls with quest_id 0; skip empty for honesty.
  if (!questId) {
    state.intents.push({ kind: 'skip_effect', reason: 'QUEST_COMPLETE empty EffectMiscValue' });
    return;
  }
  // Emitted as an EFFECT as well as an intent — resolveCombatSpell drops intents, so intent-only
  // left the BG objective-credit spells (23658 / 24061 / 24064) as inert stubs. W2b.
  state.effects.push({ kind: 'quest_complete', questId });
  state.intents.push({ kind: 'quest_complete', questId });
}

// SPELL_EFFECT_TELEPORT_GRAVEYARD sends the target to the nearest graveyard its team owns — in a BG,
// the resurrection cycle a spirit guide pulses every 30 s over the dead in range.
export function handleTeleportGraveyard(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.effects.push({ kind: 'teleport_graveyard' });
  state.intents.push({ kind: 'teleport_graveyard' });
  state.role = state.role || 'utility';
}

// SPELL_EFFECT_CHARGE (96). MoveCharge(unitTarget, speed); player fall reset; optional auto-attack. Cite:
// SpellEffects.cpp:5009–5028; Unit.h BASE_CHARGE_SPEED 27.0f.
export function handleCharge(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  // Cite: :5011 missing unit/caster return — interpret always has spell caster.
  const speedRaw = state.ctx.spellSpeed ?? state.spell.speed ?? 0;
  // Cite: :5021 speed != 0 ? speed : BASE_CHARGE_SPEED.
  const speed = speedRaw !== 0 ? speedRaw : BASE_CHARGE_SPEED;
  // Cite: :5027–5028 client-controlled + CanAttack → Attack. Default true for player caster.
  const initiateAutoAttack = state.ctx.casterIsPlayer !== false;
  state.intents.push({ kind: 'charge', speed, initiateAutoAttack });
  if (!state.role) state.role = 'charge';
}

// SPELL_EFFECT_RESURRECT_NEW, sharing EffectResurrect with 18: a FLAT health from the amount and mana
// from the misc value. It emits a resurrect effect so the OOC cast is not a no-op.
export function handleResurrectNew(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Alive player / non-player unitTarget returns. Cite: :4807–4808.
  if (state.ctx.unitTargetIsAlive === true) {
    state.intents.push({ kind: 'skip_effect', reason: 'RESURRECT_NEW target is alive' });
    return;
  }
  // Already has resurrect request. Cite: :4857–4858.
  if (state.ctx.hasResurrectRequest === true) {
    state.intents.push({ kind: 'skip_effect', reason: 'RESURRECT_NEW already has resurrect request' });
    return;
  }
  // Flat health = calculated damage; mana = misc. Cite: :4815–4818.
  const { min } = effectAmountRange(raw, state.ctx);
  const health = Math.max(0, min);
  const mana = raw.miscValue | 0;
  state.intents.push({ kind: 'resurrect_new', health, mana });
  // Combat/OOC surface — same numbers as the intent (engine applies when a corpse exists).
  state.effects.push({ kind: 'resurrect', health, mana });
}

// SPELL_EFFECT_TELEPORT_UNITS (5). NearTeleport same map; player TeleportTo cross-map. Needs dest location
// at cast. Cite: SpellEffects.cpp:1683–1728.
export function handleTeleportUnits(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  if (state.spell.id === EVERLOOK_TRANSPORTER_SPELL_ID) {
    const roll = state.ctx.rng ? Math.floor(state.ctx.rng() * 6) : 1;
    const triggerId = everlookTransporterOutcomeSpellId(roll);
    state.intents.push({ kind: 'cast_triggered_spell', spellId: triggerId });
    state.effects.push({ kind: 'trigger_spell', spellId: triggerId });
  }

  // Cite: :1685 taxi flying return.
  if (state.ctx.unitTargetTaxiFlying === true) {
    state.intents.push({
      kind: 'teleport_units',
      targetA: raw.targetA | 0,
      targetB: raw.targetB | 0,
      skippedTaxiFlying: true,
    });
    return;
  }
  const targetA = raw.targetA | 0;
  const targetB = raw.targetB | 0;
  // TARGET_LOCATION_CASTER_HOME_BIND = 9 — Astral Recall / homebind teleports.
  // Cite: SpellTargetDefines.h:33; KI-532.
  const TARGET_LOCATION_CASTER_HOME_BIND = 9;
  if (targetA === TARGET_LOCATION_CASTER_HOME_BIND || targetB === TARGET_LOCATION_CASTER_HOME_BIND) {
    state.effects.push({ kind: 'teleport_hearth' });
    state.role = state.role || 'utility';
  } else {
    // A city or database-destination teleport surfaces as a teleport effect so the OOC path routes
    // through castTeleport with its reagents instead of sinking mana.
    state.effects.push({ kind: 'teleport' });
    state.role = state.role || 'utility';
  }
  // Database dest targets use NearTeleport with useFarTeleport semantics. Cite: :1712–1713.
  void TARGET_LOCATION_DATABASE;
  const intent: InterpretIntent = {
    kind: 'teleport_units',
    targetA,
    targetB,
  };
  if (state.ctx.teleportMapId != null) {
    intent.mapId = state.ctx.teleportMapId | 0;
  }
  state.intents.push(intent);
}

// ── SI3 batch 4 ─────────────────────────────────────────────────────────────

// SPELL_EFFECT_POWER_DRAIN drains up to the amount and energizes the caster by that times the
// multiple. Happiness is a pet resource, emitted on the display scale so Dismiss Pet drains 50.
export function handlePowerDrain(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const powerType = raw.miscValue | 0;
  // Cite: :1752–1753 invalid power.
  if (powerType < 0 || powerType >= MAX_POWERS) return;

  // Alive gate when supplied. Cite: :1758.
  if (state.ctx.unitTargetIsAlive === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'POWER_DRAIN target not alive' });
    return;
  }

  // Power type must match unless POWER_HAPPINESS. Cite: :1758.
  if (
    state.ctx.targetPowerType != null
    && (state.ctx.targetPowerType | 0) !== powerType
    && powerType !== POWER_HAPPINESS
  ) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'POWER_DRAIN target power type mismatch',
    });
    return;
  }

  const { min: baseMin, max: baseMax } = effectAmountRange(raw, state.ctx);
  // damage < 0 → return. Cite: :1760–1761.
  if (baseMax < 0 && baseMin < 0) return;

  // Pet happiness: convert raw UNIT_FIELD_POWER5 → Phonecraft display (÷1000). No caster
  // energize path (hunter power type is never HAPPINESS). Cite: domain/pet/pet.ts scale comments.
  if (powerType === POWER_HAPPINESS) {
    // Import-free constant: matches HAPPINESS_RAW_PER_DISPLAY in domain/pet/pet.ts.
    const RAW_PER_DISPLAY = 1000;
    let min = Math.max(0, Math.trunc(baseMin / RAW_PER_DISPLAY));
    let max = Math.max(0, Math.trunc(baseMax / RAW_PER_DISPLAY));
    if (state.ctx.targetPower != null) {
      const cur = Math.trunc(state.ctx.targetPower);
      if (min > cur) min = cur;
      if (max > cur) max = cur;
    }
    state.effects.push({
      kind: 'power_drain',
      powerType,
      min,
      max,
      // Caster never gains happiness (power-type mismatch → gainMultiplier stays 1 in C++,
      // but EnergizeBySpell of happiness on a player is a no-op here). Bake mult || 1 unused.
      multiplier: 0,
    });
    return;
  }

  let min = baseMin;
  let max = baseMax;
  // Clamp to current power when supplied. Cite: :1769–1773.
  if (state.ctx.targetPower != null) {
    const cur = Math.trunc(state.ctx.targetPower);
    if (min > cur) min = cur;
    if (max > cur) max = cur;
  }
  const clamped = clampPositiveRange(min, max);

  // Bake-thin multiplier: mult || 1. Cite: map-spell-effects :443.
  const multRaw = Number(raw.multipleValue);
  let multiplier = multRaw && multRaw !== 0 ? multRaw : 1;

  // Full C++ gain path when caster power type known. Cite: :1777–1786. gainMultiplier starts 1.0; only when
  // caster power matches AND not self-drain is EffectMultipleValue applied (may be 0).
  if (state.ctx.casterPowerType != null) {
    const selfDrain = state.ctx.unitTargetIsSelf === true;
    if ((state.ctx.casterPowerType | 0) === powerType && !selfDrain) {
      multiplier = Number.isFinite(multRaw) ? multRaw : 0;
    } else {
      multiplier = 1;
    }
  }

  state.effects.push({
    kind: 'power_drain',
    powerType,
    min: clamped.min,
    max: clamped.max,
    multiplier,
  });
}

// SPELL_EFFECT_ADD_EXTRA_ATTACKS (19). m_extraAttacks += damage; cap at 5. Bake: count = max(1, min). Cite:
// SpellEffects.cpp:4873–4882; map-spell-effects.mjs :362–366.
export function handleAddExtraAttacks(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Alive gate when supplied. Cite: :4875–4876.
  if (state.ctx.unitTargetIsAlive === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'ADD_EXTRA_ATTACKS target not alive' });
    return;
  }
  const { min } = effectAmountRange(raw, state.ctx);
  // Bake path: Math.max(1, min). Cite: map-spell-effects :366.
  let count = Math.max(1, min);

  // Full C++ cumulative cap when existing stack supplied. Cite: :4878–4880.
  if (state.ctx.existingExtraAttacks != null) {
    const existing = Math.max(0, Math.trunc(state.ctx.existingExtraAttacks));
    // damage as C++ uses calculated amount (can be 0); bake used max(1,min) above for grant.
    // When existing set, apply += min then cap total at 5; emit final total as count.
    const total = existing + Math.max(0, min);
    count = total > MAX_EXTRA_ATTACKS ? MAX_EXTRA_ATTACKS : total;
  }

  state.effects.push({ kind: 'extra_attacks', count });
}

// SPELL_EFFECT_WEAPON (25) — EffectEmpty. Marker for weapon-type proficiency / equip usability
// (ItemSubclass mask). No server implementation body. Cite: SpellEffects.cpp:190–193; dispatch :83.
export function handleWeaponEmpty(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.intents.push({ kind: 'weapon_marker' });
}

// SPELL_EFFECT_INEBRIATE (100). drunkMod = damage * 256; clamp current + mod to 0xFFFF. Cite:
// SpellEffects.cpp:4666–4678.
export function handleInebriate(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :4668 non-player return.
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'INEBRIATE requires player unitTarget' });
    return;
  }
  const { min } = effectAmountRange(raw, state.ctx);
  // damage * 256. Cite: :4673.
  const drunkMod = Math.trunc(min) * 256;
  // Alcohol drunkness — effects[] for combat flavor consumer.
  state.effects.push({
    kind: 'inebriate',
    drunkMod,
    ...(state.ctx.castItemEntry != null ? { castItemEntry: state.ctx.castItemEntry | 0 } : {}),
  } as never);
}

// SPELL_EFFECT_LANGUAGE (39) — EffectEmpty. Misc stores language id; no server body (client/chat marker).
// Cite: SpellEffects.cpp:97 dispatch → EffectEmpty :190–193.
export function handleLanguage(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  state.intents.push({
    kind: 'language_marker',
    languageId: raw.miscValue | 0,
  });
}

// SPELL_EFFECT_TELEPORT_UNITS_FACE_CASTER (43). NearTeleportTo(dest, -caster orientation); requires dest
// location. Cite: SpellEffects.cpp:2994–3006.
export function handleTeleUnitsFaceCaster(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :2996 taxi flying return.
  if (state.ctx.unitTargetTaxiFlying === true) {
    state.intents.push({
      kind: 'teleport_face_caster',
      targetA: raw.targetA | 0,
      targetB: raw.targetB | 0,
      skippedTaxiFlying: true,
      requiresDestLocation: true,
    });
    return;
  }
  // Dest location required at cast time. Cite: :3000–3003 — without dest, C++ returns.
  state.effects.push({
    kind: 'teleport_face_caster',
    targetA: raw.targetA | 0,
    targetB: raw.targetB | 0,
    requiresDestLocation: true,
  } as never);
}

// SPELL_EFFECT_SKILL_STEP (44) EffectLearnSkill. SetSkillStep(skillid=misc, step=damage) for player
// unitTarget. Cite: SpellEffects.cpp:3008–3024.
export function handleSkillStep(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :3010 non-player return.
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'SKILL_STEP requires player unitTarget' });
    return;
  }
  const { min } = effectAmountRange(raw, state.ctx);
  // damage < 0 → return. Cite: :3013–3014.
  if (min < 0) {
    state.intents.push({ kind: 'skip_effect', reason: 'SKILL_STEP damage < 0' });
    return;
  }
  // uint16 skillid = misc; uint16 step = damage. Cite: :3018–3020.
  const skillId = raw.miscValue | 0;
  const step = Math.trunc(min) & 0xffff;
  state.effects.push({ kind: 'skill_step', skillId, step } as never);
}

// SPELL_EFFECT_HEAL_MAX_HEALTH (67). m_healing += m_caster->GetMaxHealth(). Bake: heal_max_health (no
// amount). Cite: SpellEffects.cpp:3579–3589; map-spell-effects.mjs :453–456.
export function handleHealMaxHealth(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  // Cite: :3581–3584 missing / dead unitTarget.
  if (state.ctx.unitTargetIsAlive === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'HEAL_MAX_HEALTH target not alive' });
    return;
  }
  // Bake surface — amount is caster max health at cast time (SI5 / m_healing +=).
  // Cite: :3586–3588; map-spell-effects.mjs :453–456. ctx.casterMaxHealth reserved for SI5.
  state.effects.push({ kind: 'heal_max_health' });
}

// SPELL_EFFECT_SKILL (118). DEBUG_LOG only — no skill mutation in Classic CMaNGOS body. Cite:
// SpellEffects.cpp:5425–5428.
export function handleSkill(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.effects.push({ kind: 'skill_marker' } as never);
}

// SPELL_EFFECT_SELF_RESURRECT, the Reincarnation payload: a negative amount is flat health with mana
// from the misc value, otherwise both are percentages of maximum. Cite: SpellEffects.cpp:4937-4968.
export function handleSelfResurrect(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :4939–4940 !IsPlayer return.
  if (state.ctx.casterIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'SELF_RESURRECT non-player caster' });
    return;
  }
  const { min } = effectAmountRange(raw, state.ctx);
  // damage < 0 → flat. Cite: :4946–4951.
  if (min < 0) {
    const health = Math.max(0, Math.trunc(-min));
    const mana = raw.miscValue | 0;
    state.effects.push({ kind: 'self_resurrect', health, mana });
    state.intents.push({ kind: 'self_resurrect', health, mana });
    return;
  }
  // Percent path. Cite: :4952–4958.
  const percent = Math.max(0, Math.trunc(min));
  state.effects.push({ kind: 'self_resurrect', percent });
  state.intents.push({ kind: 'self_resurrect', percent });
}

// SPELL_EFFECT_PORTAL (12) — EffectUnused. Unused from pre-1.2.1; two spells remain with no real usage
// data. Cite: SpellEffects.cpp:70 dispatch → EffectUnused :200–203.
export function handlePortal(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.intents.push({ kind: 'portal_unused' });
  state.effects.push({ kind: 'client_inform' });
}

// SPELL_EFFECT_RESURRECT, sharing EffectResurrect with 113: health and mana are percentages of the
// maximum. Emitted as a percent resurrect for the engine to apply.
export function handleResurrect(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Alive player unitTarget returns. Cite: :4807–4808.
  if (state.ctx.unitTargetIsAlive === true) {
    state.intents.push({ kind: 'skip_effect', reason: 'RESURRECT target is alive' });
    return;
  }
  // Already has resurrect request. Cite: :4857–4858.
  if (state.ctx.hasResurrectRequest === true) {
    state.intents.push({ kind: 'skip_effect', reason: 'RESURRECT already has resurrect request' });
    return;
  }
  // damage = effect amount (percent). Cite: :4822–4823.
  const { min } = effectAmountRange(raw, state.ctx);
  const percent = Math.max(0, min);
  const intent: InterpretIntent = { kind: 'resurrect', percent };
  // Resolve flat when max stats supplied. Cite: :4822–4823 integer division.
  if (state.ctx.targetMaxHealth != null) {
    intent.health = Math.trunc((Math.trunc(state.ctx.targetMaxHealth) * percent) / 100);
  }
  if (state.ctx.targetMaxMana != null) {
    intent.mana = Math.trunc((Math.trunc(state.ctx.targetMaxMana) * percent) / 100);
  }
  state.intents.push(intent);
  state.effects.push({ kind: 'resurrect_pct', percent });
}

// SPELL_EFFECT_LEAP (29) EffectLeapForward. NearTeleportTo(dest x/y/z, unit orientation). Cite:
// SpellEffects.cpp:4895–4906.
export function handleLeap(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :4897 missing unitTarget — interpret always has caster context.
  // Blink / gap-close: effects[] so combat can apply motion (sessionMotion).
  state.effects.push({
    kind: 'leap',
    targetA: raw.targetA | 0,
    targetB: raw.targetB | 0,
  } as never);
}

// SPELL_EFFECT_TRADE_SKILL (47). Player unitTarget only; skill raise body is commented out in Classic.
// Cite: SpellEffects.cpp:3048–3055.
export function handleTradeSkill(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :3050 non-player return.
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'TRADE_SKILL requires player unitTarget' });
    return;
  }
  const skillId = raw.miscValue | 0;
  // Profession open — effects[] for OOC skill UI; no combat payload beyond the cast.
  // Cite: SpellEffects.cpp:3048–3055.
  state.effects.push({
    kind: 'trade_skill',
    ...(skillId ? { skillId } : {}),
  } as never);
}

// ── SI3 batch 6 ─────────────────────────────────────────────────────────────

// SPELL_EFFECT_ADD_FARSIGHT (72). Player-only DynamicObject at dest (radius 0, FARSIGHT_FOCUS) + camera
// SetView. Cite: SpellEffects.cpp:2708–2727.
export function handleAddFarsight(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  // Cite: :2710–2711 !IsPlayer return.
  if (state.ctx.casterIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'ADD_FARSIGHT requires player caster' });
    return;
  }
  state.effects.push({
    kind: 'add_farsight',
    durationMs: durationMsResolved(state),
    radius: 0,
    dynObjectType: DYNAMIC_OBJECT_FARSIGHT_FOCUS,
  } as never);
}

// SPELL_EFFECT_SANCTUARY (79). Interrupt casts on target + CombatStop; Vanish family clears root + 1s
// undetect. Cite: SpellEffects.cpp:4194–4211.
export function handleSanctuary(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  // unitTarget required — interpret always has a logical target for unit effects.
  const family = familyOf(state.spell);
  const flags = flagsOf(state.spell);
  // IsFitToFamily(SPELLFAMILY_ROGUE, 0x800). Cite: :4203.
  const vanishRogueSpecial =
    family === SPELLFAMILY_ROGUE && (flags & VANISH_SANCTUARY_FAMILY_FLAGS) !== 0;
  // Vanish sanctuary — drop combat / brief untrackable. Cite: SpellEffects.cpp EffectSanctuary.
  state.effects.push({
    kind: 'sanctuary',
    vanishRogueSpecial,
    ...(vanishRogueSpecial ? { cannotBeDetectedMs: VANISH_CANNOT_BE_DETECTED_MS } : {}),
  } as never);
}

// SPELL_EFFECT_REPUTATION: the base points are the change and the misc value the faction, run through
// the spell-source reputation gain. Cite: SpellEffects.cpp:4908-4926; Player.cpp:6293-6369.
export function handleReputation(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :4910 non-player unitTarget return.
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'REPUTATION requires player unitTarget' });
    return;
  }
  const factionId = raw.miscValue | 0;
  // Cite: :4918–4921 !factionEntry return — empty faction id has no FactionStore row.
  if (!factionId) {
    state.intents.push({ kind: 'skip_effect', reason: 'REPUTATION empty EffectMiscValue faction' });
    return;
  }
  // m_currentBasePoints = CalculateSimpleValue. Cite: Spell.cpp:425; DBCStructure.h:817.
  const repChange = calculateSimpleValue(raw);
  const intent: InterpretIntent = {
    kind: 'reputation',
    factionId,
    repChange,
  };
  // Optional full CalculateReputationGain when rate/aura ctx supplied. Cite: Player.cpp:6293–6369 — percent
  // starts 100; spell source skips level trivial; return int32(rate * rep * percent / 100).
  const hasRateCtx =
    state.ctx.reputationAuraMod != null
    || state.ctx.reputationGainRate != null
    || state.ctx.reputationSpellRate != null;
  if (hasRateCtx) {
    const repMod = state.ctx.reputationAuraMod ?? 0;
    let percent = 100 + (repChange > 0 ? repMod : -repMod);
    const spellRate = state.ctx.reputationSpellRate;
    // Cite: :6362–6364 repRate <= 0 → return 0.
    if (spellRate != null && spellRate <= 0) {
      intent.finalRepChange = 0;
    } else {
      if (spellRate != null) percent *= spellRate;
      if (percent <= 0) {
        intent.finalRepChange = 0;
      } else {
        const gainRate = state.ctx.reputationGainRate ?? 1;
        intent.finalRepChange = trunc((gainRate * repChange * percent) / 100);
      }
    }
  }
  state.intents.push(intent);
  // The intent alone had no reader, so every REPUTATION spell was a no-op. Only effects[]
  // reaches the OOC cast applier. Rate/aura scaling stays there (it owns the player context).
  state.effects.push({
    kind: 'reputation',
    factionId,
    amount: repChange,
  });
}

/** SPELL_EFFECT_BIND (11) — SetHomebindToLocation at current position. Cite: SpellEffects.cpp:5544–5578. */
export function handleBind(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  // Cite: :5546–5547 !unitTarget || !IsPlayer() return.
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'BIND requires player unitTarget' });
    return;
  }
  // Combat/OOC surface — hearthBind consumer (travel.bindHearth / oocCastEffects).
  state.effects.push({ kind: 'bind_hearth' });
}

// SPELL_EFFECT_BIND_SIGHT (82) — EffectNULL. No server implementation (DEBUG_LOG only). Cite:
// SpellEffects.cpp:140, :195–198.
export function handleBindSight(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.intents.push({ kind: 'bind_sight_null' });
}

// SPELL_EFFECT_PULL_TOWARDS (124). speedXY = max(1, misc)*0.1; KnockBackWithAngle toward caster (or dest
// for sibling opcode). Cite: SpellEffects.cpp:5132–5162.
export function handlePullTowards(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const dist = state.ctx.pullDistance;
  // Cite: :5152–5153 dist < 0.1f return.
  if (dist != null && dist < 0.1) {
    state.intents.push({ kind: 'skip_effect', reason: 'PULL_TOWARDS distance < 0.1' });
    return;
  }
  // Cite: :5156 max(1, EffectMiscValue) * 0.1f.
  const misc = raw.miscValue | 0;
  const speedXY = Math.max(1, misc) * 0.1;
  const intent: InterpretIntent = { kind: 'pull_towards', speedXY };
  if (dist != null && dist >= 0.1) {
    // Cite: :5157–5158 time = dist/speedXY; speedZ = (dz + 0.5*t*t*g)/t.
    const time = dist / speedXY;
    const dz = state.ctx.pullHeightDelta ?? 0;
    const speedZ = (dz + 0.5 * time * time * MOVEMENT_GRAVITY) / time;
    intent.speedZ = speedZ;
    intent.distance = dist;
  }
  state.intents.push(intent);
  state.effects.push({
    kind: 'pull_towards',
    speedXY,
    ...(intent.speedZ != null ? { speedZ: intent.speedZ } : {}),
    ...(intent.distance != null ? { distance: intent.distance } : {}),
  });
}

// SPELL_EFFECT_DODGE (20) — EffectEmpty marker. Cite: SpellEffects.cpp:78 dispatch → EffectEmpty :190–193.
export function handleDodge(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.intents.push({ kind: 'dodge_marker' });
}

// SPELL_EFFECT_PARRY grants the ability to parry. The effect is pushed as well as the intent, or the
// catalog left Parry 3127 with an empty effect list.
export function handleParry(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.intents.push({ kind: 'can_parry' });
  state.effects.push({ kind: 'can_parry' } as never);
}

// SPELL_EFFECT_BLOCK (23). SetCanBlock(true). Dual-push effects[] for catalog surface (same hollow-bake
// shape as Parry). Cite: SpellEffects.cpp:4890–4893.
export function handleBlock(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.intents.push({ kind: 'can_block' });
  state.effects.push({ kind: 'can_block' } as never);
}

// SPELL_EFFECT_DEFENSE (26) — EffectEmpty marker. Cite: SpellEffects.cpp:84 dispatch → EffectEmpty
// :190–193.
export function handleDefense(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.intents.push({ kind: 'defense_marker' });
}

// SPELL_EFFECT_SPELL_DEFENSE (37) — EffectEmpty marker. Cite: SpellEffects.cpp:95 dispatch → EffectEmpty
// :190–193.
export function handleSpellDefense(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.intents.push({ kind: 'spell_defense_marker' });
}

// SPELL_EFFECT_DUAL_WIELD (40) no-op. C++ SetCanDualWield(true) (SpellEffects.cpp:2628–2632); live off-hand
// gate is spellbook 674 (equipment.ts DUAL_WIELD_SPELL_ID).
export function handleDualWield(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.effects.push({ kind: 'can_dual_wield' });
}

// SPELL_EFFECT_DETECT (49) — EffectUnused (no body). Cite: SpellEffects.cpp:107 dispatch → EffectUnused
// :200–203.
export function handleDetect(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.intents.push({ kind: 'detect_unused' });
}

// SPELL_EFFECT_DISTRACT (69). Skip if in combat / CAN_NOT_REACT; MoveDistract(damage*1000) for creatures;
// face dest. Cite: SpellEffects.cpp:2640–2660; Common.h IN_MILLISECONDS=1000.
export function handleDistract(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :2643 in combat return.
  if (state.ctx.unitTargetInCombat === true) {
    state.intents.push({ kind: 'skip_effect', reason: 'DISTRACT target in combat' });
    return;
  }
  // Cite: :2647 UNIT_STAT_CAN_NOT_REACT return.
  if (state.ctx.unitTargetCanNotReact === true) {
    state.intents.push({ kind: 'skip_effect', reason: 'DISTRACT target cannot react' });
    return;
  }
  const { min } = effectAmountRange(raw, state.ctx);
  // damage * IN_MILLISECONDS. Cite: :2653; Common.h:119.
  const durationMs = Math.trunc(min) * IN_MILLISECONDS;
  // MoveDistract only for TYPEID_UNIT; players still get SetFacingTo. Cite: :2652–2658.
  // Omit unitTargetIsCreature → assume creature (Distract AoE hits NPCs).
  const moveDistract = state.ctx.unitTargetIsCreature !== false;
  state.intents.push({ kind: 'distract', durationMs, moveDistract });
  // Catalog / OOC surface — not a pure energy sink. World attention is intent-driven.
  // Cite: schema distract; KI-159.
  state.effects.push({ kind: 'distract', durationMs });
  state.role = state.role || 'utility';
}

// SPELL_EFFECT_PICKPOCKET (71). Player caster + creature attackable target → LOOT_PICKPOCKETING
// ShowContentTo. Cite: SpellEffects.cpp:2662–2706.
export function handlePickPocket(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  // Cite: :2664–2665 !IsPlayer return.
  if (state.ctx.casterIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'PICKPOCKET requires player caster' });
    return;
  }
  // Cite: :2668 creature + CanAttackNow.
  if (state.ctx.unitTargetIsCreature === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'PICKPOCKET requires creature unitTarget' });
    return;
  }
  if (state.ctx.canAttackTarget === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'PICKPOCKET cannot attack target' });
    return;
  }
  // Already pickpocketed + no restock → LOOT_ERROR_ALREADY_PICKPOCKETED. Cite: :2683–2696.
  if (
    state.ctx.pickpocketAlreadyLooted === true
    && state.ctx.pickpocketCanRestock !== true
  ) {
    state.intents.push({
      kind: 'pickpocket',
      alreadyPickpocketed: true,
    });
    // Still surface the effect kind so the ability is not empty-effects inert.
    state.effects.push({ kind: 'pickpocket' });
    state.role = state.role || 'utility';
    return;
  }
  const intent: InterpretIntent = { kind: 'pickpocket' };
  if (state.ctx.pickpocketAlreadyLooted === true && state.ctx.pickpocketCanRestock === true) {
    intent.restock = true;
  }
  // pickpocketLootExists informs runtime refill vs create — both ShowContentTo. Cite: :2676–2705.
  void state.ctx.pickpocketLootExists;
  state.intents.push(intent);
  // Catalog / OOC / kit surface. Runtime loot is domain/pickpocket + game.pickPocket.
  // Cite: schema pickpocket; SpellEffects.cpp:2662; KI-112.
  state.effects.push({ kind: 'pickpocket' });
  state.role = state.role || 'utility';
}

// SPELL_EFFECT_HEAL_MECHANICAL (75). Bonus-adjusted heal; mechanical creature type is TargetCreatureType
// cast filter. Cite: SpellEffects.cpp:1888–1903; map-spell-effects heal path.
export function handleHealMechanical(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :1891 alive + damage >= 0.
  if (state.ctx.unitTargetIsAlive === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'HEAL_MECHANICAL target not alive' });
    return;
  }
  const { min, max } = effectAmountRange(raw, state.ctx);
  if (max < 0 && min < 0) {
    state.intents.push({ kind: 'skip_effect', reason: 'HEAL_MECHANICAL damage < 0' });
    return;
  }
  // Bake-thin: emit heal range like EffectHeal (no SpellHealingBonusDone/Taken at interpret time).
  // Cite: :1899–1901 m_healingPerEffect = addhealth after bonuses (runtime SI5).
  const clamped = clampPositiveRange(min, max);
  state.effects.push({ kind: 'heal', min: clamped.min, max: clamped.max });
}

// SPELL_EFFECT_ATTACK (78) — EffectUnused (no body). Cite: SpellEffects.cpp:136 dispatch → EffectUnused
// :200–203.
export function handleAttackUnused(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.intents.push({ kind: 'attack_unused' });
  state.effects.push({ kind: 'client_inform' });
}

// SPELL_EFFECT_DUEL (83). Player–player only; area duel flag; create flag GO + DuelInfo + request packets.
// Cite: SpellEffects.cpp:4227–4308.
export function handleDuel(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const flagGoEntry = raw.miscValue | 0;
  // Cite: :4274 SetRespawnTime(m_duration > 0 ? m_duration / IN_MILLISECONDS : 0).
  const durationMs = durationMsResolved(state);

  // Cite: :4229 both players.
  if (state.ctx.casterIsPlayer === false || state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({
      kind: 'duel',
      flagGoEntry,
      durationMs,
      skipped: 'not_players',
    });
    return;
  }
  // Cite: :4236 already dueling.
  if (state.ctx.casterOrTargetHasDuel === true) {
    state.intents.push({
      kind: 'duel',
      flagGoEntry,
      durationMs,
      skipped: 'already_dueling',
    });
    return;
  }
  // Cite: :4236 HasIgnore.
  if (state.ctx.targetIgnoresCaster === true) {
    state.intents.push({
      kind: 'duel',
      flagGoEntry,
      durationMs,
      skipped: 'ignored',
    });
    return;
  }
  // Cite: :4240–4252 AREA_FLAG_DUEL (flags & AREA_FLAG_DUEL required; fail when absent).
  if (state.ctx.areaAllowsDuel === false) {
    state.intents.push({
      kind: 'duel',
      flagGoEntry,
      durationMs,
      skipped: 'area_no_duel',
    });
    return;
  }
  // Full path: create GO at midpoint, faction/level, DuelInfo, SMSG_DUEL_REQUESTED.
  // Cite: :4254–4308. Coordinates are runtime-only.
  state.intents.push({ kind: 'duel', flagGoEntry, durationMs });
}

// SPELL_EFFECT_STUCK (84). Ghost → graveyard; hearth if ready+item; else dungeon entrance or 10y nudge.
// Cite: SpellEffects.cpp:4310–4353.
export function handleStuck(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  // Cite: :4312–4313 player only.
  if (state.ctx.casterIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'STUCK requires player caster' });
    return;
  }
  // Cite: :4315–4316 CONFIG_BOOL_CAST_UNSTUCK.
  if (state.ctx.castUnstuckEnabled === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'STUCK cast unstuck disabled' });
    return;
  }
  // Cite: :4323–4324 taxi flying.
  if (state.ctx.casterTaxiFlying === true) {
    state.intents.push({ kind: 'skip_effect', reason: 'STUCK caster taxi flying' });
    return;
  }
  // Cite: :4327–4330 ghost → RepopAtGraveyard.
  if (state.ctx.casterIsGhost === true) {
    state.intents.push({ kind: 'stuck', path: 'graveyard' });
    return;
  }
  // With either gate explicitly false this is a dungeon entrance or a short nudge; with both true, or
  // both omitted on a thin bake, it takes the hearth path. Cite: SpellEffects.cpp:4335-4336.
  const hearthBlocked =
    state.ctx.hearthstoneReady === false || state.ctx.hasHearthstoneItem === false;
  if (!hearthBlocked) {
    state.intents.push({
      kind: 'stuck',
      path: 'hearthstone',
      hearthSpellId: STUCK_HEARTHSTONE_SPELL,
    });
    return;
  }
  // Cite: :4339–4351 dungeon entrance vs nudge.
  if (state.ctx.casterInDungeon === true) {
    state.intents.push({ kind: 'stuck', path: 'dungeon_entrance' });
    return;
  }
  state.intents.push({
    kind: 'stuck',
    path: 'nudge',
    nudgeDistance: STUCK_NUDGE_DISTANCE,
  });
}

// Player.h InventorySlots — first invalid equipment/bag slot for GetItemByPos bag0. Cite: Player.h:583–586
// INVENTORY_SLOT_BAG_END = 23.
export const INVENTORY_SLOT_BAG_END = 23;

// SPELL_EFFECT_DURABILITY_DAMAGE, player targets only: the misc value is the slot and the amount the
// points. A negative slot hits everything, and a slot past the bag end returns.
export function handleDurabilityDamage(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :5211–5212 !unitTarget || !IsPlayer.
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'DURABILITY_DAMAGE requires player unitTarget',
    });
    return;
  }
  // EffectMiscValue as signed slot. Cite: :5214.
  const invSlot = raw.miscValue | 0;
  // C++ `damage` = calculated effect value; bake-thin uses range min (no die roll).
  // Cite: amount.ts; Object.cpp CalculateSpellEffectValue.
  const { min } = effectAmountRange(raw, state.ctx);
  const points = Math.trunc(min);

  // slot < 0: all equipped (−1) or equipped + inventory (−2). Cite: :5218–5222.
  if (invSlot < 0) {
    state.intents.push({
      kind: 'durability_damage',
      slot: invSlot,
      points,
      allItems: true,
      includeInventory: invSlot < -1,
    });
    return;
  }

  // invalid slot value. Cite: :5226–5227.
  if (invSlot >= INVENTORY_SLOT_BAG_END) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'DURABILITY_DAMAGE invalid slot >= INVENTORY_SLOT_BAG_END',
    });
    return;
  }

  // if (Item* item = GetItemByPos(BAG_0, slot)) — silent when empty. Cite: :5229–5233.
  if (state.ctx.durabilitySlotHasItem === false) {
    return;
  }

  state.intents.push({
    kind: 'durability_damage',
    slot: invSlot,
    points,
    allItems: false,
    includeInventory: false,
  });
}

// SPELL_EFFECT_DURABILITY_DAMAGE_PCT, player targets only: the misc value is the slot and the amount a
// percent. A negative slot hits everything, and a slot past the bag end returns.
export function handleDurabilityDamagePCT(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :5238–5239 !unitTarget || !IsPlayer.
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'DURABILITY_DAMAGE_PCT requires player unitTarget',
    });
    return;
  }
  // EffectMiscValue as signed slot. Cite: :5241.
  const invSlot = raw.miscValue | 0;
  // C++ `damage` = calculated effect value; bake-thin uses range min (no die roll).
  const { min } = effectAmountRange(raw, state.ctx);
  const damage = Math.trunc(min);
  const percent = damage / 100;

  // slot < 0: all equipped (−1) or equipped + inventory (−2). Cite: :5245–5248.
  if (invSlot < 0) {
    const payload = {
      kind: 'durability_damage' as const,
      slot: invSlot,
      percent,
      allItems: true,
      includeInventory: invSlot < -1,
    };
    state.effects.push(payload);
    state.intents.push(payload);
    return;
  }

  // invalid slot value. Cite: :5252–5253.
  if (invSlot >= INVENTORY_SLOT_BAG_END) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'DURABILITY_DAMAGE_PCT invalid slot >= INVENTORY_SLOT_BAG_END',
    });
    return;
  }

  // if (damage <= 0) return. Cite: :5255–5256.
  if (damage <= 0) return;

  // if (Item* item = GetItemByPos(BAG_0, slot)) — silent when empty. Cite: :5258–5259.
  if (state.ctx.durabilitySlotHasItem === false) {
    return;
  }

  const payload = {
    kind: 'durability_damage' as const,
    slot: invSlot,
    percent,
    allItems: false,
    includeInventory: false,
  };
  state.effects.push(payload);
  state.intents.push(payload);
}

// SPELL_EFFECT_ATTACK_ME, the taunt effect: a threat list equalizes to the highest and sets the
// current victim, while anything else starts an attack unless it cannot react.
export function handleAttackMe(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  // unitTarget null is runtime; bake-thin always proceeds.

  // Non-player + GetVictim() == caster → fail. Cite: :3420–3426.
  // Players may re-taunt (no early out). Omit unitTargetIsPlayer → not this gate.
  if (
    state.ctx.unitTargetIsPlayer === false
    && state.ctx.unitTargetVictimIsCaster === true
  ) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'ATTACK_ME target already attacking caster',
    });
    return;
  }

  // Threat-list path (default / omit canHaveThreatList). Cite: :3430–3435.
  if (state.ctx.canHaveThreatList !== false) {
    // equalize + force victim — engine applies via taunt effect.
    // Cite: map-spell-effects.mjs :359–361 → { kind: 'taunt' }.
    state.effects.push({ kind: 'taunt' });
    return;
  }

  // No threat list + not CAN_NOT_REACT_OR_LOST_CONTROL → AI AttackStart. Cite: :3437–3440.
  if (state.ctx.unitTargetCanNotReactOrLostControl === true) {
    // else-if fails: log only, no AttackStart. Cite: :3437.
    return;
  }
  state.intents.push({ kind: 'attack_me_ai' });
}

// SPELL_EFFECT_SKIN_PLAYER_CORPSE, the battleground insignia: a live owner is stripped of their
// insignia, and a corpse alone is converted and its insignia loot shown.
export function handleSkinPlayerCorpse(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  // Cite: :5502–5504 player caster only.
  if (state.ctx.casterIsPlayer === false) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'SKIN_PLAYER_CORPSE requires player caster',
    });
    return;
  }

  // Corpse-only (owner not found): bones + LOOT_INSIGNIA. Cite: :5510–5538.
  if (state.ctx.skinCorpseOnly === true) {
    state.intents.push({ kind: 'skin_player_corpse', path: 'corpse_bones_loot' });
    return;
  }

  // Primary: RemovedInsignia(caster) on player target. Cite: :5541.
  // unitTargetIsPlayer false → not a player corpse owner; silent skip.
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'SKIN_PLAYER_CORPSE requires player unitTarget',
    });
    return;
  }

  state.intents.push({ kind: 'skin_player_corpse', path: 'removed_insignia' });
  state.effects.push({ kind: 'client_inform' });
}

/** effectType → handler (SI2 + SI3 batch 1–8). */

// SPELL_EFFECT_DUMMY (3) — SI4 registry dispatch. Unknown spell ids: handled no-op (empty secondary
// finishers, etc.). Cite: SpellEffects.cpp EffectDummy ~346; registry/index.ts dispatchDummy.
export function handleEffectDummy(state: HandlerState, raw: RawSpellEffect, slot: number): void {
  dispatchDummy(state, raw, slot);
}

// SPELL_EFFECT_SCRIPT_EFFECT (77) — SI4 registry dispatch. Cite: SpellEffects.cpp EffectScriptEffect ~3664;
// registry/index.ts dispatchScript.
export function handleEffectScriptEffect(state: HandlerState, raw: RawSpellEffect, slot: number): void {
  dispatchScript(state, raw, slot);
}
