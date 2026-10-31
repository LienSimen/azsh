// The shaman dummy and script specials: the Flametongue procs rank-generically by family and flags,
// plus the shared intermediate dummy the C++ scripts by id.

import type { RegistryHandler, RegistryPack } from '../types.ts';
import { effectBaseAmount, truncTowardZero } from '../helpers.ts';
import { spellBonusWithCoeffs } from '../../../spellBonus.ts';
import {
  ENTRAPMENT_ROOT_DURATION_MS,
  ENTRAPMENT_ROOT_SPELL_ID,
  FROST_TRAP_AURA_FOR_ENTRAPMENT_SPELL_ID,
  entrapmentChanceFromAuraIds,
  entrapmentRootFires,
} from '../../../cmangos-special-cases.ts';

/** SPELLFAMILY_SHAMAN. Cite: DBCEnums.h SPELLFAMILY_SHAMAN = 11. */
export const SPELLFAMILY_SHAMAN = 11;

// Lightning Shield family flag (IsFitToFamilyMask 0x400). Cite: UnitAuraProcHandler.cpp:1450;
// SpellEffects.cpp:709.
export const LIGHTNING_SHIELD_FAMILY_FLAGS = 0x0000_0400;

/** Flametongue Weapon Proc family flags 0x200000. Cite: SpellEffects.cpp:1472. */
export const FLAMETONGUE_WEAPON_PROC_FAMILY_FLAGS = 0x0000_0000_0020_0000;

/** Flametongue Totem Proc family flags 0x400000000. Cite: SpellEffects.cpp:1493. */
export const FLAMETONGUE_TOTEM_PROC_FAMILY_FLAGS = 0x0000_0004_0000_0000;

// Flametongue Attack custom damage spell (weapon imbue path). Cite: SpellEffects.cpp:1485
// CastCustomSpell(…, 10444, &totalDamage, …).
export const FLAMETONGUE_ATTACK_SPELL_ID = 10444;

// Flametongue Totem Attack custom damage spell. Cite: SpellEffects.cpp:1499 CastCustomSpell(…, 16368,
// &totalDamage, …).
export const FLAMETONGUE_TOTEM_ATTACK_SPELL_ID = 16368;

// Dummy Trigger used by Frost Trap aura 13810 and Ten Storms LS aura 28821. Cite: SpellEffects.cpp:677 case
// 18350.
export const DUMMY_TRIGGER_SPELL_ID = 18350;

// Ten Storms set — Lightning Shield periodic (triggers 28820 mana/buff). Cite: SpellEffects.cpp:701 case
// 28821; spell_template 28821 EffectTriggerSpell1=28820.
export const TEN_STORMS_LS_PERIODIC_SPELL_ID = 28821;

// Ten Storms set bonus buff removed when LS not active. Cite: SpellEffects.cpp:713
// RemoveAurasDueToSpell(28820).
export const TEN_STORMS_LS_BUFF_SPELL_ID = 28820;

// Classic Flametongue Weapon Proc ranks (diagnostics / fixtures). Dispatch is rank-generic via family flags
// — not this list. Cite: classicmangos spell_template; spell_chain mangos.sql Flametongue Weapon Proc.
export const FLAMETONGUE_WEAPON_PROC_RANKS = [
  8026, // Rank 1 — bp 325
  8028, // Rank 2 — bp 478
  8029, // Rank 3 — bp 715
  10445, // Rank 4 — bp 1143
  16343, // Rank 5 — bp 1875
  16344, // Rank 6 — bp 2497
] as const;

// Classic Flametongue Totem Proc ranks (diagnostics / fixtures). Dispatch is rank-generic via family flags
// — not this list. Cite: classicmangos spell_template Id 8253/8248/10523/16389.
export const FLAMETONGUE_TOTEM_PROC_RANKS = [
  8253, // Rank 1 — bp 488
  8248, // Rank 2 — bp 696
  10523, // Rank 3 — bp 946
  16389, // Rank 4 — bp 1216
] as const;

// The Flametongue weapon proc scales with weapon speed and spell power: the total is the amount times
// weapon speed plus the bonus. Without a weapon speed it is handled and empty.
const handleFlametongueWeaponProc: RegistryHandler = (state, raw, slot) => {
  // m_CastItem required. Cite: :1474–1488.
  if (state.ctx.castItemPresent === false) return true;
  const delayMs = state.ctx.weaponSpeedMs;
  if (delayMs == null || delayMs <= 0) {
    // No cast item / delay — C++ logs error and returns. Cite: :1487–1488.
    return true;
  }

  // damage = effect amount (m_damage / CalculateSpellDamage path → base points).
  // Cite: EffectDummy uses `damage` from spell effect value.
  const damage = effectBaseAmount(raw, state.ctx);
  const weaponSpeed = delayMs / 1000;

  // Done + Taken spell damage. Cite: :1478–1479.
  // No live producer for spellBaseDamageBonusDone (needs the fire school); bake-thin is 0.
  let bonusDamage =
    (state.ctx.spellBaseDamageBonusDone ?? 0) +
    (state.ctx.spellBaseDamageBonusTaken ?? 0);

  // SpellBonusWithCoeffs(…, total=0, benefit=bonusDamage, ap=0, donePart=false).
  // Cite: :1482; Unit.cpp SpellBonusWithCoeffs ~6974.
  bonusDamage = spellBonusWithCoeffs(
    state.spell,
    slot,
    bonusDamage,
    0,
    false,
  );

  // int32 totalDamage = (damage * 0.01 * weaponSpeed) + bonusDamage. Cite: :1484.
  const totalDamage = truncTowardZero(damage * 0.01 * weaponSpeed + bonusDamage);

  state.intents.push({
    kind: 'cast_custom_spell',
    spellId: FLAMETONGUE_ATTACK_SPELL_ID,
    bp0: totalDamage,
  });
  return true;
};

// The Flametongue totem proc does NOT scale with gear spell power: the total is the amount times
// weapon speed times the enchant modifier. Cite: SpellEffects.cpp:1493-1504.
const handleFlametongueTotemProc: RegistryHandler = (state, raw, _slot) => {
  if (state.ctx.castItemPresent === false) return true;
  const delayMs = state.ctx.weaponSpeedMs;
  if (delayMs == null || delayMs <= 0) {
    // Cite: :1501–1502 requires cast Item.
    return true;
  }

  const damage = effectBaseAmount(raw, state.ctx);
  const weaponSpeed = delayMs / 1000;
  // GetEnchantmentModifier() — Improved Weapon Totems / item mod. Default 0.
  // Cite: :1498.
  const enchantMod = state.ctx.castItemEnchantmentModifier ?? 0;

  // int32 totalDamage = (damage * 0.01f * weaponSpeed * (mod+100)/100). Cite: :1498.
  const totalDamage = truncTowardZero(
    damage * 0.01 * weaponSpeed * ((enchantMod + 100) / 100),
  );

  state.intents.push({
    kind: 'cast_custom_spell',
    spellId: FLAMETONGUE_TOTEM_ATTACK_SPELL_ID,
    bp0: totalDamage,
  });
  return true;
};

// The shared intermediate dummy for Frost Trap and the Ten Storms lightning shield: it rolls
// Entrapment's root on one branch and keeps or removes the shield buff on the other.
const handleDummyTrigger: RegistryHandler = (state, _raw, _slot) => {
  const triggeredBy = state.ctx.triggeredByAuraSpellId;

  // ── Frost Trap Aura 13810 → Entrapment root 19185 ────────────────────────
  // Cite: SpellEffects.cpp:683–698 case 13810.
  if (triggeredBy === FROST_TRAP_AURA_FOR_ENTRAPMENT_SPELL_ID) {
    // Caster holders. Cite: SpellEffects.cpp:690–695 GetSpellAuraHolder on m_caster.
    const holderIds = state.ctx.casterAuraSpellIds ?? [];
    const chance = entrapmentChanceFromAuraIds(holderIds);
    const roll = state.ctx.rng ? state.ctx.rng() : 1; // default no-fire without rng
    if (entrapmentRootFires(chance, roll)) {
      state.intents.push({ kind: 'cast_triggered_spell', spellId: ENTRAPMENT_ROOT_SPELL_ID });
      state.effects.push({
        kind: 'root',
        durationMs: ENTRAPMENT_ROOT_DURATION_MS,
        mechanic: 'root',
      });
    }
    return true;
  }

  if (triggeredBy !== TEN_STORMS_LS_PERIODIC_SPELL_ID) {
    // Unclaimed branches of 18350 → handled empty.
    if (!(state.effects?.length) && !(state.intents?.length)) {
      state.effects.push({ kind: 'script_handled_noop', spellId: DUMMY_TRIGGER_SPELL_ID } as never);
    }
    return true;
  }

  // Scan target auras for SPELLFAMILY_SHAMAN + 0x400. Cite: :704–710.
  const auras = state.ctx.targetAuras ?? [];
  for (const aura of auras) {
    const fam = aura.spellFamilyName ?? 0;
    const flags = aura.spellFamilyFlags ?? 0;
    if (fam === SPELLFAMILY_SHAMAN && (flags & LIGHTNING_SHIELD_FAMILY_FLAGS) !== 0) {
      // LS active — keep 28820. Cite: :710 return.
      return true;
    }
  }

  // LS not active → remove set buff. Cite: :713.
  state.intents.push({
    kind: 'consume_aura',
    spellId: TEN_STORMS_LS_BUFF_SPELL_ID,
    spellFamilyName: SPELLFAMILY_SHAMAN,
    spellFamilyFlags: 0,
    auraType: 0,
  });
  return true;
};

export const shamanPack: RegistryPack = {
  id: 'shaman',
  // Per-id: CMaNGOS case 18350 Dummy Trigger. Cite: SpellEffects.cpp:677.
  dummy: {
    [DUMMY_TRIGGER_SPELL_ID]: handleDummyTrigger,
  },
  // Rank-generic Flametongue: C++ gates on family flags, not a rank id list.
  // Cite: SpellEffects.cpp:1472 (0x200000), :1493 (0x400000000).
  dummyMatchers: [
    {
      spellFamilyName: SPELLFAMILY_SHAMAN,
      spellFamilyFlags: FLAMETONGUE_WEAPON_PROC_FAMILY_FLAGS,
      handler: handleFlametongueWeaponProc,
    },
    {
      spellFamilyName: SPELLFAMILY_SHAMAN,
      spellFamilyFlags: FLAMETONGUE_TOTEM_PROC_FAMILY_FLAGS,
      handler: handleFlametongueTotemProc,
    },
  ],
  script: {},
};
