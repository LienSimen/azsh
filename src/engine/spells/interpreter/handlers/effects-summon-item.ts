/** SI2.5 / SI3 handlers — effects-summon-item (split from handlers.ts, pure move). */

import type { RawSpellEffect, SpellEffect } from '../../../../data/schema.ts';
import { effectAmountRange } from '../amount.ts';
import type {
  InterpretIntent,
} from '../types.ts';
import {
  SPELL_EFFECT_SUMMON_OBJECT_SLOT1,
  SPELL_EFFECT_SUMMON_OBJECT_SLOT2,
  SPELL_EFFECT_SUMMON_TOTEM,
  SPELL_EFFECT_SUMMON_TOTEM_SLOT1,
  SPELL_EFFECT_SUMMON_TOTEM_SLOT2,
  SPELL_EFFECT_SUMMON_TOTEM_SLOT3,
  SPELL_EFFECT_SUMMON_TOTEM_SLOT4,
} from '../opcodes.ts';
import type {
  HandlerState,
} from './shared.ts';
import {
  CLASS_HUNTER,
  CLASS_WARLOCK,
  DEMONIC_SACRIFICE_SCRIPT,
  BG_MARK_CREATE_IDS,
  DEFAULT_MAX_CREATURE_LEVEL,
  ENCHANT_HELD_DEFAULT_SECS,
  SUMMON_DEMON_DURATION_MS,
  IMPROVED_WEAPON_TOTEMS_FAMILY_MASK,
  SPAWN_CLEAR_FLAG_IDS,
  durationMsResolved,
  trunc,
  calculateSimpleValue,
  summonCount,
  weaponImbueFamilyFromName,
} from './shared.ts';
import { applyWeaponImbueKit } from '../weapon-imbue-kit.ts';
// SPELL_EFFECT_CREATE_ITEM (24) → DoCreateItem. item = EffectItemType (not misc). Count = max(1, amount);
// optional stack clamp. Cite: SpellEffects.cpp:2039–2043 / DoCreateItem :1936–2037.
export function handleCreateItem(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const itemType = (raw.itemType ?? 0) | 0;
  // Empty type → skip (GetItemPrototype null). SI1 raw gap: itemType absent → 0.
  if (!itemType) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'CREATE_ITEM empty EffectItemType (SI1 raw column gap or null prototype)',
    });
    return;
  }
  // num_to_add = damage = bp + irand(baseDice, dieSides), so max above min is a real roll
  // (Iron Grenade 2-4, Windblossom Berries 8-12) and the caller rolls it. Cite: Object.cpp:2949.
  const { min, max } = effectAmountRange(raw, state.ctx);
  let numToAdd = min < 1 ? 1 : min;
  let numToAddMax = max < numToAdd ? numToAdd : max;
  // DoCreateItem: if num_to_add > pProto->Stackable → clamp. Cite: :1974–1977.
  const stackable = state.ctx.itemStackable;
  if (stackable != null && stackable > 0) {
    if (numToAdd > stackable) numToAdd = stackable;
    if (numToAddMax > stackable) numToAddMax = stackable;
  }
  // BG mark ids (24950–24955): same create path; inventory overflow may mail at runtime.
  // Cite: SpellEffects.cpp:1952–2002; BattleGround.h SPELL_*_MARK_*.
  if (BG_MARK_CREATE_IDS.has(state.spell.id | 0)) {
    // no emit difference — mail is DoCreateItem inventory-full branch (Unit/runtime).
  }
  state.effects.push({
    kind: 'conjure',
    item: itemType,
    count: numToAdd,
    ...(numToAddMax > numToAdd ? { countMax: numToAddMax } : {}),
  });
}

// SPELL_EFFECT_SUMMON_WILD emits a real EFFECT, not just an intent: intent-only left pure summon rows
// with an empty effect list, so consumers reading effects saw nothing.
export function handleSummonWild(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const creature = raw.miscValue | 0;
  // !creature_entry → return. Cite: :2731–2733.
  if (!creature) return;

  const count = summonCount(raw, state.ctx);
  const durationMs = durationMsResolved(state);
  const radiusIndex = raw.radiusIndex | 0;

  let level: number | undefined;
  const casterLevel = state.ctx.casterLevel;
  if (casterLevel != null) {
    // Player: level = caster level. Non-player: level + max(multipleValue, 1).
    // Cite: :2736–2746.
    const casterIsPlayer = state.ctx.casterIsPlayer !== false;
    if (casterIsPlayer) {
      level = Math.trunc(casterLevel);
    } else {
      const mult = Number(raw.multipleValue) || 0;
      const resultLevel = Math.trunc(casterLevel) + Math.max(mult, 1);
      if (resultLevel > 0 && resultLevel <= DEFAULT_MAX_CREATURE_LEVEL) {
        level = resultLevel;
      } else {
        level = Math.trunc(casterLevel);
      }
    }
    // Clamp to creature template min/max when provided. Cite: :2753–2757.
    const cMin = state.ctx.creatureMinLevel;
    const cMax = state.ctx.creatureMaxLevel;
    if (cMax != null && Math.trunc(casterLevel) >= cMax) level = cMax;
    else if (cMin != null && Math.trunc(casterLevel) <= cMin) level = cMin;
  }

  // Combat / resolveCombatSpell surface — uncontrolled temp creature, not a pet.
  // Cite: :2765 TEMPSPAWN_*; :2767 amount; host planNonCharmAuraOnApply injects spawn.
  state.effects.push({ kind: 'summon_wild', creature, count, durationMs });

  const intent: InterpretIntent = {
    kind: 'summon_wild',
    creature,
    count,
    durationMs,
    radiusIndex,
  };
  if (level != null) intent.level = level;
  state.intents.push(intent);
}

// SPELL_EFFECT_SUMMON_GUARDIAN emits a real EFFECT carrying count and duration: on the intent alone,
// combat consumers lost both, so a 15-illusion summon and a dummy's duration looked covered.
export function handleSummonGuardian(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // GO caster early out. Cite: :2822–2823.
  if (state.ctx.casterIsPlayer === false && state.ctx.casterClass == null && state.ctx.casterLevel == null) {
    // No reliable GO signal — proceed (unit casters are the common path).
  }

  const petEntry = raw.miscValue | 0;
  // !pet_entry → return. Cite: :2826–2827.
  if (!petEntry) {
    state.effects.push({ kind: 'client_inform' });
    return;
  }

  const durationMs = durationMsResolved(state);
  const count = summonCount(raw, state.ctx);
  const casterIsPlayer = state.ctx.casterIsPlayer !== false;
  const isTriggered = state.ctx.isTriggeredSpell === true;

  // Second direct cast unsummon guardians of same entry (player, not triggered).
  // Cite: :2839–2851.
  let replaceExisting = false;
  if (!isTriggered && casterIsPlayer) {
    replaceExisting = true;
    if (state.ctx.hasExistingGuardian === true) {
      const hasDuration = (state.spell.durationIndex ?? state.ctx.durationIndex ?? 0) !== 0;
      const hasCategory = (state.ctx.spellCategory ?? state.spell.category ?? 0) !== 0;
      if (!(hasDuration && hasCategory)) {
        // Unsummon only — no re-summon.
        state.intents.push({
          kind: 'summon_guardian',
          creature: petEntry,
          count: 0,
          durationMs,
          replaceExisting: true,
        });
        return;
      }
    }
  }

  // Level resolution. Cite: :2867–2892.
  let level: number | undefined;
  let engineeringSkillLevel: number | undefined;
  const invokerLevel = state.ctx.casterLevel;
  if (invokerLevel != null) {
    const cMin = state.ctx.creatureMinLevel ?? 1;
    const cMax = state.ctx.creatureMaxLevel ?? DEFAULT_MAX_CREATURE_LEVEL;
    // max(min(invokerLevel, MaxLevel), MinLevel)
    level = Math.max(Math.min(Math.trunc(invokerLevel), cMax), cMin);

    if (state.ctx.casterIsPlayer === false) {
      // Non-player: if multipleValue <= 0, level = invoker + multipleValue.
      // Cite: :2871–2881.
      const mult = Number(raw.multipleValue) || 0;
      if (mult <= 0) {
        const resultLevel = Math.max(Math.trunc(invokerLevel + mult), 0);
        if (resultLevel > 0 && resultLevel <= DEFAULT_MAX_CREATURE_LEVEL) {
          level = resultLevel;
        }
      }
    } else if (state.ctx.castFromEngineeringTrinket && state.ctx.engineeringSkill) {
      // Engineering trinket: level = skill / 5. Cite: :2884–2892.
      engineeringSkillLevel = Math.trunc(state.ctx.engineeringSkill / 5);
      level = engineeringSkillLevel;
    }
  } else if (state.ctx.castFromEngineeringTrinket && state.ctx.engineeringSkill) {
    engineeringSkillLevel = Math.trunc(state.ctx.engineeringSkill / 5);
    level = engineeringSkillLevel;
  }

  // Combat / resolveCombatSpell surface — temporary GUARDIAN_PET, not permanent companion.
  // Cite: :2902 amount; :2938–2939 duration; :2982 AddGuardian.
  state.effects.push({ kind: 'summon_guardian', creature: petEntry, count, durationMs });

  const intent: InterpretIntent = {
    kind: 'summon_guardian',
    creature: petEntry,
    count,
    durationMs,
    replaceExisting,
  };
  if (level != null) intent.level = level;
  if (engineeringSkillLevel != null) intent.engineeringSkillLevel = engineeringSkillLevel;
  state.intents.push(intent);
}

// SPELL_EFFECT_ENCHANT_ITEM, the permanent kits, arcanums and formulas. Pushing only an intent is what
// made this opcode count as handled while producing nothing and destroying the item.
export function handleEnchantItemPerm(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Caster must be player + item target — those gates are runtime; emit when the id is set.
  const enchantId = raw.miscValue | 0;
  if (!enchantId) return;
  // Craft skill-up is runtime (UpdateCraftSkill). Apply PERM_ENCHANTMENT_SLOT.
  state.effects.push({ kind: 'enchant_item_perm', enchantId });
  state.intents.push({ kind: 'enchant_item_perm', enchantId });
}

// SPELL_EFFECT_ENCHANT_ITEM_TEMPORARY: the duration is the amount in seconds, or an hour when it is
// zero. Cite: SpellEffects.cpp:3099-3147; map-spell-effects.mjs:367-385.
export function handleEnchantItemTmp(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const enchantId = raw.miscValue | 0;
  if (!enchantId) return;

  const bp = raw.basePoints | 0;
  const bd = raw.baseDice | 0;
  // Mapper bake path: secs = max(1, bp + max(bd, 1)). Cite: map-spell-effects :374.
  let secs = Math.max(1, bp + Math.max(bd, 1));

  // Full C++ path when amount range already computed and ≤ 0 → default 3600s.
  // Cite: :3123–3125 (damage > 0 ? damage : 3600).
  const { min: dmg } = effectAmountRange(raw, state.ctx);
  if (state.ctx.fullWeaponPath || state.ctx.casterLevel != null) {
    // Optional cast-time: prefer calculated damage seconds when positive.
    secs = dmg > 0 ? dmg : 3600;
  }

  const imbue: Extract<SpellEffect, { kind: 'weapon_imbue' }> = {
    kind: 'weapon_imbue',
    enchantId,
    durationMs: secs * 1000,
  };
  const fam = weaponImbueFamilyFromName(state.spell.name);
  if (fam) imbue.family = fam;
  // A thin bake carries only the enchant id, duration and family, so the Rockbiter, Flametongue and
  // Frostbrand combat kits are filled from the offline tables. Cite: weapon-imbue-kit.ts.
  applyWeaponImbueKit(imbue);
  state.effects.push(imbue);
  state.role = state.role || 'buff';
}

// SPELL_EFFECT_SUMMON_OBJECT_WILD emits a real EFFECT, not just an intent: intent-only left pure
// place-a-gameobject rows with an empty effect list, so the OOC cast and item use saw nothing.
export function handleSummonObjectWild(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const goEntry = raw.miscValue | 0;
  // Create fails on missing template / entry 0 — skip empty entry honestly.
  // Cite: :3622 gameobject_id; :3639–3645 Create fail → delete + return.
  if (!goEntry) {
    state.effects.push({ kind: 'client_inform' });
    return;
  }
  // RespawnTime seconds from m_duration; we keep ms for the engine clock.
  // Cite: :3647 SetRespawnTime(m_duration > 0 ? m_duration / IN_MILLISECONDS : 0).
  const durationMs = durationMsResolved(state);
  // Combat / resolveCombatSpell / OOC surface — temporary wild GO, no owner.
  state.effects.push({ kind: 'summon_object_wild', goEntry, durationMs });
  state.intents.push({
    kind: 'summon_object_wild',
    goEntry,
    durationMs,
  });
}

/** SPELL_EFFECT_SUMMON_CRITTER (97) — mini-pet / companion. Cite: SpellEffects.cpp:5031–5111. */
export function handleSummonCritter(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const petEntry = raw.miscValue | 0;
  // !cInfo → return. Cite: :5033–5038.
  if (!petEntry) {
    state.effects.push({ kind: 'client_inform' });
    return;
  }

  const durationMs = durationMsResolved(state);
  const casterIsPlayer = state.ctx.casterIsPlayer !== false;
  const existing = state.ctx.existingMiniPetEntry;

  // Same entry + player → despawn only. Cite: :5044–5048.
  // Materialize effects[] (not unread intents) so dimension B/D credit the slot.
  if (casterIsPlayer && existing != null && (existing | 0) === petEntry) {
    state.effects.push({
      kind: 'summon_critter',
      creature: petEntry,
      durationMs,
      despawnOnly: true,
    });
    return;
  }

  // Despawn old + summon new. Cite: :5050–5110.
  state.effects.push({
    kind: 'summon_critter',
    creature: petEntry,
    durationMs,
    despawnOnly: false,
  });
}

// The shared summon-totem effect across its five opcodes, one per elemental slot. Health is the amount
// when non-zero, else the database value. Cite: SpellEffects.cpp:4485-4561.
export function handleSummonTotem(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const eff = raw.effect | 0;
  // Cite: :4488–4495 switch Effect → TotemSlot.
  let slot: 'fire' | 'earth' | 'water' | 'air' | 'none';
  switch (eff) {
    case SPELL_EFFECT_SUMMON_TOTEM_SLOT1:
      slot = 'fire';
      break;
    case SPELL_EFFECT_SUMMON_TOTEM_SLOT2:
      slot = 'earth';
      break;
    case SPELL_EFFECT_SUMMON_TOTEM_SLOT3:
      slot = 'water';
      break;
    case SPELL_EFFECT_SUMMON_TOTEM_SLOT4:
      slot = 'air';
      break;
    case SPELL_EFFECT_SUMMON_TOTEM:
      slot = 'none';
      break;
    default:
      return;
  }

  const creature = raw.miscValue | 0;
  // !cinfo → return. Cite: :4510–4515.
  if (!creature) return;

  const { min } = effectAmountRange(raw, state.ctx);
  // if (damage) SetMaxHealth/SetHealth(damage). A 0 is not a 1 hp totem — it leaves the
  // creature_template health. Cite: :4538–4542; map-spell.mjs:366.
  const health = Math.max(0, min);
  const durationMs = durationMsResolved(state);
  state.effects.push({
    kind: 'summon_totem',
    slot,
    creature,
    health,
    durationMs,
  });
  state.role = state.role || 'totem_summon';
}

// SPELL_EFFECT_TAMECREATURE creates the hunter pet from the target creature and despawns the wild one.
// The runtime path is the OOC tame, which builds the full pet.
export function handleTameCreature(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  // Caster must be player (CheckCast). Affective caster used when triggered. Cite: :3151–3153.
  if (state.ctx.casterIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'TAMECREATURE non-player caster' });
    return;
  }
  state.effects.push({ kind: 'tame_creature' });
  state.role = state.role || 'pet_tame';
  state.intents.push({ kind: 'tame_creature' });
}

// SPELL_EFFECT_SUMMON_PET: a hunter loads its stored pet, a warlock first clears Demonic Sacrifice,
// and otherwise one is loaded or created. Baked as a summon when the misc value is set.
export function handleSummonPet(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const petEntry = raw.miscValue | 0;
  const casterIsPlayer = state.ctx.casterIsPlayer !== false;
  const cls = state.ctx.casterClass;

  let path: 'hunter' | 'warlock' | 'player_default' | 'npc_guardian';
  if (!casterIsPlayer) {
    path = 'npc_guardian';
  } else if (cls === CLASS_HUNTER) {
    path = 'hunter';
  } else if (cls === CLASS_WARLOCK) {
    path = 'warlock';
  } else {
    // Default player path (also warlock fallthrough after sac remove when class unknown).
    path = 'player_default';
  }

  // Level for non-player: level + max(multipleValue, 1) in creature range.
  // Cite: :3302–3311.
  let level: number | undefined;
  if (path === 'npc_guardian' && state.ctx.casterLevel != null) {
    const mult = Number(raw.multipleValue) || 0;
    const resultLevel = Math.trunc(state.ctx.casterLevel) + Math.max(mult, 1);
    if (resultLevel > 0 && resultLevel <= DEFAULT_MAX_CREATURE_LEVEL) {
      level = resultLevel;
    } else {
      level = Math.trunc(state.ctx.casterLevel);
    }
  }

  // A creature of 0 is the Hunter Call Pet shape, and the bake really carries it. Emitting only for a
  // real entry resolved Call Pet to zero effects, which dropped it out of the spellbook entirely.
  state.effects.push({ kind: 'summon_pet', creature: petEntry });
  state.role = state.role || 'pet_summon';

  const intent: InterpretIntent = {
    kind: 'summon_class_pet',
    creature: petEntry,
    path,
  };
  if (level != null) intent.level = level;
  // Warlock path documents sac remove (script 2228). Cite: :3254–3255.
  if (path === 'warlock') {
    void DEMONIC_SACRIFICE_SCRIPT; // documented constant for SI5 runtime
  }
  state.intents.push(intent);
}

// SPELL_EFFECT_DISMISS_PET unsummons the active pet, paired with the happiness drain on the other
// slot. Without this handler the row was only a drain and never dismissed.
export function handleDismissPet(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.effects.push({ kind: 'dismiss_pet' });
}

// SPELL_EFFECT_SUMMON_DEAD_PET revives the slain pet at the amount as a percent of its max health.
// A living pet returns early and no pet at all reloads the stored one. Cite: SpellEffects.cpp:5164.
export function handleSummonDeadPet(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // `damage` is the resolved base-point value (bp + 1 for dieSides 1) — the same range the
  // rest of the handlers read, so rank/level scaling stays on the shared path.
  const { max } = effectAmountRange(raw, state.ctx);
  const healthPct = Math.max(1, Math.min(100, Math.trunc(max)));
  state.effects.push({ kind: 'revive_pet', healthPct });
  state.role = state.role || 'pet_summon';
}

// SPELL_EFFECT_FEED_PET needs a player caster, a food item, a living pet and a real diet benefit; it
// destroys one food and casts the 20 s course. The IR is a marker and the runtime is the game path.
export function handleFeedPet(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  state.effects.push({ kind: 'feed_pet' });
}

// SPELL_EFFECT_SPAWN (46). Client spawn/login animation; only 15750 / 26262 clear UNIT_FLAG_SPAWNING. Cite:
// SpellEffects.cpp:3037–3046.
export function handleSpawn(state: HandlerState, _raw: RawSpellEffect, _slot: number): void {
  const clearSpawningFlag = SPAWN_CLEAR_FLAG_IDS.has(state.spell.id | 0);
  state.intents.push({ kind: 'spawn', clearSpawningFlag });
  state.effects.push({ kind: 'client_inform' });
}

// SPELL_EFFECT_ENCHANT_HELD_ITEM (92). Temp enchant on target player's main-hand; duration cascade;
// Improved Weapon Totems. Cite: SpellEffects.cpp:4585–4635.
export function handleEnchantHeldItem(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :4588–4589 non-player unitTarget return.
  if (state.ctx.unitTargetIsPlayer === false) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'ENCHANT_HELD_ITEM requires player unitTarget',
    });
    return;
  }
  // Cite: :4592–4599 missing / unequipped main-hand.
  if (state.ctx.targetHasMainHand === false) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'ENCHANT_HELD_ITEM no equipped main-hand',
    });
    return;
  }

  const enchantId = raw.miscValue | 0;
  // Cite: :4601 if (EffectMiscValue) — empty enchant id → no-op.
  if (!enchantId) {
    state.intents.push({ kind: 'skip_effect', reason: 'ENCHANT_HELD_ITEM empty EffectMiscValue' });
    return;
  }

  // Conflicting temp enchant. Cite: :4618–4619.
  const existing = state.ctx.existingTempEnchantId;
  if (existing != null && existing !== 0 && (existing | 0) !== enchantId) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'ENCHANT_HELD_ITEM different temp enchant already present',
    });
    return;
  }

  // The duration cascade is the resolved duration, then the base points, then ten seconds — vanilla
  // held-item spells usually carry no duration index and fall through.
  const spellDurMs = durationMsResolved(state);
  let durationSecs: number;
  if (spellDurMs > 0) {
    // Prefer honest ms from DurationIndex when present (engine surface).
    durationSecs = spellDurMs / 1000;
  } else {
    const { min: dmg } = effectAmountRange(raw, state.ctx);
    if (dmg) {
      durationSecs = dmg;
    } else {
      durationSecs = ENCHANT_HELD_DEFAULT_SECS;
    }
  }
  const durationMs = Math.trunc(durationSecs * 1000);

  // Temp main-hand enchant (totem effects). Cite: SpellEffects.cpp:4585–4635.
  const effect: Record<string, unknown> = {
    kind: 'enchant_held_item',
    enchantId,
    durationMs,
  };

  // Improved Weapon Totems — family mask 0x4000000. Cite: :4625–4632.
  const famFlags = BigInt(state.spell.spellFamilyFlags ?? 0);
  if ((famFlags & BigInt(IMPROVED_WEAPON_TOTEMS_FAMILY_MASK)) !== 0n) {
    if (state.ctx.improvedWeaponTotemsAmount != null) {
      effect.enchantmentModifier = Math.trunc(state.ctx.improvedWeaponTotemsAmount);
    }
  }

  state.effects.push(effect as never);
}

/** SLOT1/2 (104/105) → m_ObjectSlotGuid[0/1]. Cite: SpellEffects.cpp:4734–4790; Unit.h:1979. */
export function handleSummonObjectSlot(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const goEntry = raw.miscValue | 0;
  // Create fails on missing template — skip empty entry honestly.
  if (!goEntry) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'SUMMON_OBJECT_SLOT empty EffectMiscValue',
    });
    return;
  }
  const eff = raw.effect | 0;
  // Cite: SpellEffects.cpp:4739–4745 SLOT1→0 SLOT2→1; other slot effects stay dead.
  let objectSlot: number;
  switch (eff) {
    case SPELL_EFFECT_SUMMON_OBJECT_SLOT1:
      objectSlot = 0;
      break;
    case SPELL_EFFECT_SUMMON_OBJECT_SLOT2:
      objectSlot = 1;
      break;
    default:
      return;
  }
  // RespawnTime = m_duration > 0 ? m_duration / IN_MILLISECONDS : 0 — we keep ms.
  // Cite: :4776. Hunter traps arm as slot GOs.
  const durationMs = durationMsResolved(state);
  state.effects.push({
    kind: 'summon_object_slot',
    goEntry,
    slot: objectSlot,
    durationMs,
  } as never);
}

// ── SI3 batch 5 ─────────────────────────────────────────────────────────────

// SPELL_EFFECT_SUMMON (28). Summon controlled GUARDIAN_PET from EffectMiscValue; early out if pet exists.
// Bake surface: summon_pet (same as 56). Cite: SpellEffects.cpp:2343–2443; map-spell-effects.mjs :349–352.
export function handleSummon(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // GameObject caster early out. Cite: :2345–2346 — no reliable GO signal; unit path.
  const petEntry = raw.miscValue | 0;
  // !pet_entry / !cInfo → return. Cite: :2351–2360.
  if (!petEntry) return;

  // Already has pet → no summon. Cite: :2348–2349.
  if (state.ctx.hasPet === true) {
    state.intents.push({
      kind: 'summon_guardian_pet',
      creature: petEntry,
      durationMs: durationMsResolved(state),
      skippedExistingPet: true,
    });
    return;
  }

  const durationMs = durationMsResolved(state);

  // Level: player uses caster level; non-player level + max(multipleValue, 1).
  // Cite: :2383–2394.
  let level: number | undefined;
  if (state.ctx.casterLevel != null) {
    const casterIsPlayer = state.ctx.casterIsPlayer !== false;
    if (casterIsPlayer) {
      level = Math.trunc(state.ctx.casterLevel);
    } else {
      const mult = Number(raw.multipleValue) || 0;
      const resultLevel = Math.trunc(state.ctx.casterLevel) + Math.max(mult, 1);
      if (resultLevel > 0 && resultLevel <= DEFAULT_MAX_CREATURE_LEVEL) {
        level = resultLevel;
      } else {
        level = Math.trunc(state.ctx.casterLevel);
      }
    }
  }

  // Bake-comparable surface. Cite: map-spell-effects :349–351.
  state.effects.push({ kind: 'summon_pet', creature: petEntry });
  state.role = state.role || 'pet_summon';

  const intent: InterpretIntent = {
    kind: 'summon_guardian_pet',
    creature: petEntry,
    durationMs,
  };
  if (level != null) intent.level = level;
  state.intents.push(intent);
}

// SPELL_EFFECT_SUMMON_CHANGE_ITEM (34). Convert cast item to EffectItemType in-place (player + owned cast
// item). Cite: SpellEffects.cpp:2276–2312.
export function handleSummonChangeItem(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :2278 non-player return.
  if (state.ctx.casterIsPlayer === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'SUMMON_CHANGE_ITEM requires player caster' });
    return;
  }
  // Cite: :2284–2285 missing cast item; :2288–2289 owner check.
  if (state.ctx.castItemPresent === false) {
    state.intents.push({ kind: 'skip_effect', reason: 'SUMMON_CHANGE_ITEM no cast item' });
    return;
  }
  // uint32 newitemid = EffectItemType. Cite: :2291–2293.
  const newItemId = (raw.itemType ?? 0) | 0;
  if (!newItemId) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'SUMMON_CHANGE_ITEM empty EffectItemType',
    });
    return;
  }
  state.effects.push({ kind: 'summon_change_item', newItemId } as never);
}

// SPELL_EFFECT_SUMMON_POSSESSED (73). Creature template from EffectMiscValue; TakePossessOf at dest. Cite:
// SpellEffects.cpp:4563–4583.
export function handleSummonPossessed(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  const creature = raw.miscValue | 0;
  // Cite: :4565–4570 !cInfo return.
  if (!creature) {
    state.intents.push({
      kind: 'skip_effect',
      reason: 'SUMMON_POSSESSED empty/missing creature template',
    });
    return;
  }
  const durationMs = durationMsResolved(state);
  state.intents.push({
    kind: 'summon_possessed',
    creature,
    durationMs,
  });
  // Eye of Kilrogg — catalog/OOC surface (fragile scouting eye). Cite: KI-578.
  if (!state.effects.some((e) => e.kind === 'summon_possessed')) {
    state.effects.push({
      kind: 'summon_possessed',
      creature,
      durationMs: durationMs < 0 ? 0 : durationMs,
    });
  }
  state.role = state.role || 'utility';
}

// SPELL_EFFECT_SUMMON_DEMON (112). Count from CalculateSimpleValue; creature from misc; duration 3600000;
// level = caster. Cite: SpellEffects.cpp:5430–5460.
export function handleSummonDemon(state: HandlerState, raw: RawSpellEffect, _slot: number): void {
  // Cite: :5438–5439 !m_currentBasePoints return.
  const count = calculateSimpleValue(raw);
  if (!count) {
    state.intents.push({ kind: 'skip_effect', reason: 'SUMMON_DEMON zero CalculateSimpleValue count' });
    return;
  }
  const creature = raw.miscValue | 0;
  if (!creature) {
    state.intents.push({ kind: 'skip_effect', reason: 'SUMMON_DEMON empty EffectMiscValue' });
    return;
  }
  // Infernal / guardian demon summon. Cite: SpellEffects.cpp:5430–5460.
  state.effects.push({
    kind: 'summon_demon',
    creature,
    count,
    durationMs: SUMMON_DEMON_DURATION_MS,
    ...(state.ctx.casterLevel != null ? { level: Math.trunc(state.ctx.casterLevel) } : {}),
  } as never);
}
