// The proc-trigger subsystem: chance, PPM, internal cooldown and flags. All rolls use the injected rng
// and the cooldown uses the combat clock, never Math.random or wall time.

import { SPELL_ATTR_EX3 } from "../spellAttributes.ts";
import type { RawSpellEffect, School, SpellDef, SpellEffect } from '../../../data/schema.ts';
import type { Rng } from '../../core/rng.ts';
import { SPELL_ATTR_EX2, hasAttrEx2 } from '../spellAttributes.ts';
import {
  ppmChance,
  weaponDefaultProcChance,
  procCooldownReadyAt,
  procMatchesEvent,
  resolveProcProbability,
  type ProcEventContext,
  type ProcMatchInput,
} from '../procs.ts';

// CMaNGOS UnitAuraProcHandler.cpp:1449–1467 — Lightning Shield DBC trigger is wrong; core overwrites by
// apply-spell id → real damage spells 26364+. Same table as map-spell-effects.mjs LIGHTNING_SHIELD_TRIGGER.
export const LIGHTNING_SHIELD_TRIGGER: Readonly<Record<number, number>> = {
  324: 26364,
  325: 26365,
  905: 26366,
  945: 26367,
  8134: 26369,
  10431: 26370,
  10432: 26363,
};

/** Default LShield internal CD when spell_proc_event.Cooldown absent. Cite: map-spell-effects.mjs:1124. */
export const LIGHTNING_SHIELD_DEFAULT_COOLDOWN_MS = 3500;

/** Default LShield charges when ProcCharges absent. Cite: map-spell-effects.mjs:1123. */
export const LIGHTNING_SHIELD_DEFAULT_CHARGES = 3;

// Ascendance (Talisman of Ascendance) — charges by functionality not in spell data. Cite:
// SpellAuras.cpp:3069–3073 HandleAuraProcTriggerSpell case 28200.
export const ASCENDANCE_PROC_CHARGES = 6;
export const ASCENDANCE_SPELL_ID = 28200;

/** Ten Storms set Lightning Shield override. Cite: UnitAuraProcHandler.cpp:1473–1477 (id 23551 → 23552). */
export const TEN_STORMS_LIGHTNING_SHIELD_ID = 23551;
export const TEN_STORMS_LIGHTNING_SHIELD_TRIGGER = 23552;
export const TEN_STORMS_LIGHTNING_SHIELD_DAMAGE_ID = 23552;
export const TEN_STORMS_LIGHTNING_SHIELD_DAMAGE_TRIGGER = 27635;

// Touch of Weakness by apply rank to its real payload: the DBC trigger is an intermediate dummy that
// the C++ switches on, so it is rewritten at apply time. Cite: SpellEffects.cpp:1340-1360.
export const TOUCH_OF_WEAKNESS_TRIGGER: Readonly<Record<number, number>> = {
  2652: 2943, // Rank 1
  19261: 19249, // Rank 2
  19262: 19251, // Rank 3
  19264: 19252, // Rank 4
  19265: 19253, // Rank 5
  19266: 19254, // Rank 6
  25461: 25460, // Rank 7 (TBC id present in C++; Classic ranks 1–6 in bake)
};

/** Intermediate dummy for Touch of Weakness procs. Cite: SpellEffects.cpp:1340. */
export const TOUCH_OF_WEAKNESS_INTERMEDIATE_SPELL_ID = 28598;

// Shadowguard by apply rank to its shadow damage payload, rewritten at apply time like Lightning
// Shield because the DBC trigger is an intermediate dummy. Cite: Priest.cpp:56-77.
export const SHADOWGUARD_TRIGGER: Readonly<Record<number, number>> = {
  18137: 28377, // Rank 1
  19308: 28378, // Rank 2
  19309: 28379, // Rank 3
  19310: 28380, // Rank 4
  19311: 28381, // Rank 5
  19312: 28382, // Rank 6
};

/** Intermediate dummy for Shadowguard procs. Cite: Priest.cpp spell_shadowguard. */
export const SHADOWGUARD_INTERMEDIATE_SPELL_ID = 28376;

// Resolved proc parameters for one aura-42 slot (apply-time snapshot + fire-time inputs). Chance fields are
// sourced from spell_template / spell_proc_event — never invented.
export interface ProcTriggerSpellMeta {
  /** Spell id that holds the aura (proc source). */
  holderSpellId: number;
  // Spell cast on successful proc (after family/id specials). Cite: UnitAuraProcHandler.cpp:1255
  // EffectTriggerSpell path.
  triggerSpellId: number;
  /** Modifier amount (base points range min at bake-thin). */
  amount: number;
  // Effective EventProcFlag: spell_proc_event.procFlags if set, else spell_template.procFlags. Cite:
  // UnitAuraProcHandler.cpp:523–526.
  procFlags: number;
  /** spell_proc_event.procEx when non-zero. Cite: SpellMgr.cpp:843+ procEx gate. */
  procEx?: number;
  // The flat chance as a percent, from the spell row or the proc event's custom chance. It may
  // legitimately be 101, the "always or use the default" sentinel — hence the item flag below.
  chancePct: number;
  // True for an ITEM chance-on-hit or weapon-enchant proc. Only that path derives a chance from the
  // weapon speed: 225 of 235 baked item procs carry the sentinel, which fired on every swing.
  isItemProc?: boolean;
  // spell_proc_event.ppmRate when > 0 — overrides flat chance on attacker melee path. Cite:
  // UnitAuraProcHandler.cpp:596–600; Unit.cpp:7717.
  ppmRate?: number;
  // Internal cooldown ms from spell_proc_event.Cooldown (baked as cooldownMs). Cite:
  // UnitAuraProcHandler.cpp:431–435 / :500–501; SpellAuraHolder::SetProcCooldown.
  cooldownMs?: number;
  /** Aura charges (procCharges, or Ascendance / LShield defaults). */
  charges?: number;
  schoolMask?: number;
  spellFamilyName?: number;
  spellFamilyMask?: number[];
  requiresOutdoors?: boolean;
  // The bake surface kind: a trigger spell becomes a proc trigger, and a damage shield becomes either
  // Lightning Shield or an amount-only retaliate. Cite: map-spell-effects.mjs mapProcTriggerSpell.
  bakeKind: 'proc_trigger_spell' | 'damage_shield';
  // True when the charges exist only as an apply special in the C++ rather than on the spell row, so
  // they are omitted from the bake effect. Cite: SpellAuras.cpp:3069-3073.
  /** SPELL_ATTR_EX2_PROC_COOLDOWN_ON_FAILURE. Cite: UnitAuraProcHandler.cpp:430-435. */
  cooldownOnFailure?: boolean;
  bakeOmitCharges?: boolean;
  damageShield?: {
    school: School;
    min: number;
    max: number;
    durationMs: number;
    charges?: number;
    cooldownMs?: number;
  };
}

// Build ProcMatchInput for the shared procs.ts matcher (flags / ex / school / family / ICD). Chance is
// probability 0..1; PPM left for resolveProcProbability.
export function procMatchInputFromMeta(
  meta: ProcTriggerSpellMeta,
  opts?: { cooldownReadyAt?: number },
): ProcMatchInput {
  const input: ProcMatchInput = {
    procFlags: meta.procFlags || undefined,
    procEx: meta.procEx,
    schoolMask: meta.schoolMask,
    spellFamilyName: meta.spellFamilyName,
    spellFamilyMask: meta.spellFamilyMask,
    requiresOutdoors: meta.requiresOutdoors,
    cooldownReadyAt: opts?.cooldownReadyAt,
    cooldownMs: meta.cooldownMs,
  };
  if (meta.ppmRate != null && meta.ppmRate > 0) {
    input.ppm = meta.ppmRate;
  } else if (meta.chancePct > 0) {
    // Engine chance is 0..1; DB ProcChance is percent.
    // Cite: UnitAuraProcHandler.cpp:590 roll_chance_f(chance) with chance in percent.
    input.chance = Math.min(1, meta.chancePct / 100);
  }
  return input;
}

// Resolve the fire probability for this metadata and weapon speed, in the C++ order: a custom chance,
// then the spell's own, then PPM. A PPM rate REPLACES the flat chance on the attacker path.
export function resolveProcTriggerProbability(
  meta: ProcTriggerSpellMeta,
  weaponSpeedMs?: number,
): number | null {
  if (meta.ppmRate != null && meta.ppmRate > 0) {
    if (weaponSpeedMs == null || weaponSpeedMs <= 0) return null;
    // Unit.cpp:7717 GetPPMProcChance returns percent; /100 → probability.
    // ppmChance already returns probability = weaponSpeedSec * PPM / 60.
    return ppmChance(meta.ppmRate, weaponSpeedMs);
  }
  // The over-100 sentinel on an ITEM proc is not "always": it means use the default weapon formula,
  // which is a function of weapon speed. An aura proc has no such branch, so there it is always.
  if (meta.isItemProc && meta.chancePct > 100) {
    if (weaponSpeedMs == null || weaponSpeedMs <= 0) return null;
    return weaponDefaultProcChance(weaponSpeedMs);
  }
  if (meta.chancePct > 0) {
    return Math.min(1, meta.chancePct / 100);
  }
  return null;
}

// Match the flags, school, family and internal cooldown, then roll with the injected rng. Returns
// whether the proc fires and the next ready time when a cooldown applies.
export function tryProcTriggerSpell(
  meta: ProcTriggerSpellMeta,
  ctx: ProcEventContext,
  rng: Rng,
  opts?: { cooldownReadyAt?: number },
): { fired: boolean; cooldownReadyAt: number | null } {
  const match = procMatchInputFromMeta(meta, { cooldownReadyAt: opts?.cooldownReadyAt });
  // ICD + flags + school/family before roll. Cite: procs.ts procMatchesEvent; SpellMgr.cpp:843.
  if (!procMatchesEvent(match, ctx)) {
    return { fired: false, cooldownReadyAt: opts?.cooldownReadyAt ?? null };
  }
  const p = resolveProcTriggerProbability(meta, ctx.weaponSpeedMs);
  if (p == null || p <= 0) {
    return { fired: false, cooldownReadyAt: opts?.cooldownReadyAt ?? null };
  }
  const fired = rng.chance(p);
  // Cooldown applied on success (and on failure when ATTR_EX2_PROC_COOLDOWN_ON_FAILURE).
  // Cite: UnitAuraProcHandler.cpp:429-435 / 500-501.
  const applyCd = fired || (meta.cooldownOnFailure && !fired);
  const nextCd =
    applyCd && meta.cooldownMs != null && meta.cooldownMs > 0
      ? procCooldownReadyAt(ctx.nowMs, meta.cooldownMs)
      : (opts?.cooldownReadyAt ?? null);
  return { fired, cooldownReadyAt: nextCd };
}

// PPM percent formula verbatim from CMaNGOS (for sourced fixture assertions). Cite: Unit.cpp:7717–7719
// `return WeaponSpeed * PPM / 600.0f` (result in **percent**).
export function getPpmProcChancePercent(weaponSpeedMs: number, ppm: number): number {
  if (!(ppm > 0) || !(weaponSpeedMs > 0)) return 0;
  return (weaponSpeedMs * ppm) / 600;
}

// Resolve the trigger spell id after the family and id rewrites known at apply time. Runtime-only
// specials stay documented on the intent and need cast-time context when they fire.
export function resolveProcTriggerSpellId(
  holderSpellId: number,
  rawTriggerSpell: number,
  spellFamilyName?: number,
  spellFamilyFlags?: number,
): number {
  // Lightning Shield rank override (family sham + visual path approximated by id table).
  // Cite: UnitAuraProcHandler.cpp:1450–1467.
  const ls = LIGHTNING_SHIELD_TRIGGER[holderSpellId];
  if (ls) return ls;

  // Ten Storms set. Cite: :1473–1477.
  if (holderSpellId === TEN_STORMS_LIGHTNING_SHIELD_ID) {
    return TEN_STORMS_LIGHTNING_SHIELD_TRIGGER;
  }
  // Damage from Lightning Shield (The Ten Storms set). Cite: :1479-1481.
  if (holderSpellId === TEN_STORMS_LIGHTNING_SHIELD_DAMAGE_ID) {
    return TEN_STORMS_LIGHTNING_SHIELD_DAMAGE_TRIGGER;
  }

  // Touch of Weakness: DBC trigger 28598 is an empty EffectDummy; C++ re-targets by
  // apply rank → live damage/debuff spell. Cite: SpellEffects.cpp:1340–1360.
  const tow = TOUCH_OF_WEAKNESS_TRIGGER[holderSpellId];
  if (tow) return tow;

  // Shadowguard: DBC trigger 28376 is an empty EffectDummy; script re-targets by
  // apply rank → live shadow damage. Cite: Priest.cpp:64–76.
  const sg = SHADOWGUARD_TRIGGER[holderSpellId];
  if (sg) return sg;

  // Aegis of Preservation trinket. Cite: :1298–1300.
  if (holderSpellId === 23780) return 23781;

  // Persistent Shield (Scarab Brooch): DBC triggers Dummy Trigger 13567; C++ rewrites to
  // 26470 absorb with custom bp. Cite: UnitAuraProcHandler.cpp:1307–1313.
  if (holderSpellId === 26467 && rawTriggerSpell === 13567) return 26470;

  // Mana Surge (Earthfury set): DBC triggers Dummy Trigger 18350; C++ rewrites to 23571
  // with basepoints = manaCost * 35/100. Cite: UnitAuraProcHandler.cpp:1482–1489 case 23572.
  if (holderSpellId === 23572) return 23571;

  // Blessed Recovery ranks. Cite: :1390–1398.
  if (holderSpellId === 27811) return 27813;
  if (holderSpellId === 27815) return 27817;
  if (holderSpellId === 27816) return 27818;

  void spellFamilyName;
  void spellFamilyFlags;
  return rawTriggerSpell | 0;
}

// Build full meta from holder spell + raw effect slot. `amountMin`/`amountMax` from effectAmountRange
// (bake-thin).
export function buildProcTriggerSpellMeta(
  spell: SpellDef,
  raw: RawSpellEffect,
  amountMin: number,
  amountMax: number,
  durationMs: number,
  school: School,
): ProcTriggerSpellMeta | null {
  const holderId = spell.id | 0;
  const pe = spell.spellProcEvent;
  const rawTrig = raw.triggerSpell | 0;
  const triggerSpellId = resolveProcTriggerSpellId(
    holderId,
    rawTrig,
    spell.spellFamilyName,
    spell.spellFamilyFlags,
  );

  // EventProcFlag. Cite: UnitAuraProcHandler.cpp:523–526.
  const procFlags =
    ((pe?.procFlags != null && pe.procFlags !== 0 ? pe.procFlags : spell.procFlags) ?? 0) | 0;

  // Chance: customChance overrides ProcChance. Cite: :590–595.
  // customChance / ProcChance are percent in DB.
  let chancePct = 0;
  if (pe?.customChance != null && pe.customChance > 0) {
    chancePct = pe.customChance;
  } else if (spell.procChance != null && spell.procChance > 0) {
    chancePct = spell.procChance;
  }

  const ppmRate = pe?.ppmRate != null && pe.ppmRate > 0 ? pe.ppmRate : undefined;
  const cooldownMs =
    pe?.cooldownMs != null && pe.cooldownMs > 0 ? pe.cooldownMs : undefined;

  let charges =
    spell.procCharges != null && spell.procCharges > 0 ? spell.procCharges : undefined;
  // Ascendance's charges are NOT on the spell row, which reads 0; the C++ sets six at apply. Keep them
  // off the bake surface and on the intent only. Cite: SpellAuras.cpp:3069-3073.
  const ascendanceCharges =
    holderId === ASCENDANCE_SPELL_ID ? ASCENDANCE_PROC_CHARGES : undefined;

  // Lightning Shield → damage_shield bake surface.
  // Cite: map-spell-effects.mjs:1116–1127; UnitAuraProcHandler.cpp:1449–1467.
  if (LIGHTNING_SHIELD_TRIGGER[holderId]) {
    const cd = cooldownMs && cooldownMs > 0 ? cooldownMs : LIGHTNING_SHIELD_DEFAULT_COOLDOWN_MS;
    const ch = charges && charges > 0 ? charges : LIGHTNING_SHIELD_DEFAULT_CHARGES;
    const min = Math.max(1, amountMin);
    const max = Math.max(1, amountMax || amountMin);
    return {
      holderSpellId: holderId,
      triggerSpellId,
      amount: amountMin,
      procFlags,
      procEx: pe?.procEx && pe.procEx !== 0 ? pe.procEx : undefined,
      chancePct,
      ppmRate,
      cooldownMs: cd,
      charges: ch,
      schoolMask: pe?.schoolMask,
      spellFamilyName: pe?.spellFamilyName,
      spellFamilyMask: pe?.spellFamilyMask,
      requiresOutdoors: ((spell.attributesEx3 || 0) & SPELL_ATTR_EX3.ONLY_PROC_OUTDOORS) !== 0 ? true : undefined,
      bakeKind: 'damage_shield',
      damageShield: {
        school: school || 'nature',
        min,
        max,
        durationMs: durationMs || 600_000,
        charges: ch,
        cooldownMs: cd,
      },
    };
  }

  const cooldownOnFailure = hasAttrEx2(spell, SPELL_ATTR_EX2.PROC_COOLDOWN_ON_FAILURE)
    ? true
    : undefined;

  // Generic: EffectTriggerSpell id. Cite: map-spell-effects.mjs:1130–1141.
  if (triggerSpellId > 0) {
    return {
      holderSpellId: holderId,
      triggerSpellId,
      amount: amountMin,
      procFlags,
      procEx: pe?.procEx && pe.procEx !== 0 ? pe.procEx : undefined,
      chancePct,
      ppmRate,
      cooldownMs,
      // Intent carries Ascendance 6; bake effect uses DBC procCharges only.
      charges: charges ?? ascendanceCharges,
      schoolMask: pe?.schoolMask,
      spellFamilyName: pe?.spellFamilyName,
      spellFamilyMask: pe?.spellFamilyMask,
      cooldownOnFailure,
      requiresOutdoors: ((spell.attributesEx3 || 0) & SPELL_ATTR_EX3.ONLY_PROC_OUTDOORS) !== 0 ? true : undefined,
      bakeKind: 'proc_trigger_spell',
      /** When set, bakeEffectFromProcMeta must not stamp charges (DBC 0). */
      bakeOmitCharges: ascendanceCharges != null && charges == null ? true : undefined,
    };
  }

  // Amount-only (no trigger): retaliate damage_shield.
  // Cite: map-spell-effects.mjs:1144–1155.
  if (amountMin > 0) {
    return {
      holderSpellId: holderId,
      triggerSpellId: 0,
      amount: amountMin,
      procFlags,
      procEx: pe?.procEx && pe.procEx !== 0 ? pe.procEx : undefined,
      chancePct,
      ppmRate,
      cooldownMs,
      charges,
      schoolMask: pe?.schoolMask,
      spellFamilyName: pe?.spellFamilyName,
      spellFamilyMask: pe?.spellFamilyMask,
      cooldownOnFailure,
      requiresOutdoors: ((spell.attributesEx3 || 0) & SPELL_ATTR_EX3.ONLY_PROC_OUTDOORS) !== 0 ? true : undefined,
      bakeKind: 'damage_shield',
      damageShield: {
        school,
        min: Math.max(1, amountMin),
        max: Math.max(1, amountMax || amountMin),
        durationMs: durationMs || 600_000,
        charges,
        cooldownMs,
      },
    };
  }

  return null;
}

/** Emit bake SpellEffect for aura 42 from meta (LOCK 9a parity with mapProcTriggerSpell). */
export function bakeEffectFromProcMeta(meta: ProcTriggerSpellMeta, durationMs: number): SpellEffect | null {
  if (meta.bakeKind === 'damage_shield' && meta.damageShield) {
    const ds = meta.damageShield;
    const effect: SpellEffect = {
      kind: 'damage_shield',
      school: ds.school,
      min: ds.min,
      max: ds.max,
      durationMs: ds.durationMs,
    };
    if (ds.charges != null && ds.charges > 0) effect.charges = ds.charges;
    if (ds.cooldownMs != null && ds.cooldownMs > 0) effect.cooldownMs = ds.cooldownMs;
    return effect;
  }
  if (meta.bakeKind === 'proc_trigger_spell' && meta.triggerSpellId > 0) {
    const effect: SpellEffect = {
      kind: 'proc_trigger_spell',
      triggerSpellId: meta.triggerSpellId,
      durationMs: durationMs || 0,
      amount: meta.amount,
    };
    // Ascendance: charges only on intent. Cite: bakeOmitCharges / SpellAuras.cpp:3069.
    if (!meta.bakeOmitCharges && meta.charges != null && meta.charges > 0) {
      effect.charges = meta.charges;
    }
    if (meta.cooldownMs != null && meta.cooldownMs > 0) effect.cooldownMs = meta.cooldownMs;
    return effect;
  }
  return null;
}

// Re-export shared helpers for tests / SI6 consumers.
export {
  ppmChance,
  procCooldownReadyAt,
  procMatchesEvent,
  resolveProcProbability,
  type ProcEventContext,
  type ProcMatchInput,
};
