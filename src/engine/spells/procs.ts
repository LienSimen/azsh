// Proc matching, chance and PPM, unifying the flag filters, the Classic PPM formula and the hidden
// proc cooldowns. Pure: every roll takes an injected rng, never Math.random.

import type { Rng } from '../core/rng.ts';

/** Subset of SpellMgr.h ProcFlags used by combat event sites. */
export const PROC_FLAG = {
  NONE: 0x00000000,
  // Killing a target that yields XP or honor. Cite: SpellMgr.h:1660 PROC_FLAG_KILL.
  KILL: 0x00000002,
  DEAL_MELEE_SWING: 0x00000004,
  TAKE_MELEE_SWING: 0x00000008,
  DEAL_MELEE_ABILITY: 0x00000010,
  TAKE_MELEE_ABILITY: 0x00000020,
  DEAL_RANGED_ATTACK: 0x00000040,
  TAKE_RANGED_ATTACK: 0x00000080,
  DEAL_RANGED_ABILITY: 0x00000100,
  TAKE_RANGED_ABILITY: 0x00000200,
  DEAL_HELPFUL_SPELL: 0x00004000,
  DEAL_HARMFUL_SPELL: 0x00010000,
  TAKE_HARMFUL_SPELL: 0x00020000,
  DEAL_HARMFUL_PERIODIC: 0x00040000,
  TAKE_HARMFUL_PERIODIC: 0x00080000,
  TAKE_ANY_DAMAGE: 0x00100000,
} as const;

/** Subset of SpellMgr.h ProcFlagsEx. */
export const PROC_EX = {
  NONE: 0x0000000,
  NORMAL_HIT: 0x0000001,
  CRITICAL_HIT: 0x0000002,
  MISS: 0x0000004,
  RESIST: 0x0000008,
  DODGE: 0x0000010,
  PARRY: 0x0000020,
  BLOCK: 0x0000040,
} as const;

/** Spell school index → SpellSchoolMask bit (SharedDefines SPELL_SCHOOL_MASK_*). */
export const SCHOOL_MASK = {
  NORMAL: 0x01,
  HOLY: 0x02,
  FIRE: 0x04,
  NATURE: 0x08,
  FROST: 0x10,
  SHADOW: 0x20,
  ARCANE: 0x40,
} as const;

const SCHOOL_NAME_TO_MASK: Record<string, number> = {
  physical: SCHOOL_MASK.NORMAL,
  holy: SCHOOL_MASK.HOLY,
  fire: SCHOOL_MASK.FIRE,
  nature: SCHOOL_MASK.NATURE,
  frost: SCHOOL_MASK.FROST,
  shadow: SCHOOL_MASK.SHADOW,
  arcane: SCHOOL_MASK.ARCANE,
};

/** Map Phonecraft School string → SpellSchoolMask bit. */
export function schoolMaskFromSchool(school: string | undefined | null): number {
  if (!school) return 0;
  return SCHOOL_NAME_TO_MASK[school] ?? 0;
}

/** Context describing a combat event that may trigger procs. */
export interface ProcEventContext {
  /** Combined ProcFlags bits for this event (attacker and/or victim side as appropriate). */
  procFlags: number;
  /** ProcFlagsEx outcome bits (hit/crit/miss/…). */
  procEx: number;
  /** Weapon speed in milliseconds (melee/ranged) for PPM; optional. */
  weaponSpeedMs?: number;
  /** Current time (ms) for hidden CD checks. */
  nowMs: number;
  // School mask of the *triggering* spell/attack (SPELL_SCHOOL_MASK_*). Melee white hits → NORMAL. Absent →
  // skip school filter (legacy). Cite: SpellMgr.cpp IsSpellProcEventCanTriggeredBy ~899–909.
  schoolMask?: number;
  /** SpellFamilyName of the triggering spell. Melee (no spell) → absent/0. Cite: SpellMgr.cpp ~912. */
  spellFamilyName?: number;
  // SpellFamilyFlags of the triggering spell (for family mask filters). Cite: UnitAuraProcHandler.cpp ~634
  // IsFitToFamilyMask.
  spellFamilyFlags?: number;
  outdoors?: boolean;
}

export interface ProcMatchInput {
  /** Required ProcFlags bits (any bit match). 0/absent = no flag filter. */
  procFlags?: number;
  /** Required ProcEx: if set, (event.procEx & procEx) must be non-zero (or exact policy below). */
  procEx?: number;
  chance?: number | null;
  ppm?: number | null;
  customChance?: number | null;
  // The over-100 chance sentinel on an ITEM proc means "use the default weapon formula", which depends
  // on weapon speed and so cannot be baked. Copied as a literal, 225 of 235 fired on every swing.
  weaponDefault?: boolean;
  /** Hidden CD readyAt for the triggered spell. */
  cooldownReadyAt?: number;
  cooldownMs?: number;
  // spell_proc_event.schoolMask — when set, event school must overlap. Melee (no spellInfo) requires NORMAL
  // school bit. Cite: SpellMgr.cpp ~899–909.
  schoolMask?: number;
  /** spell_proc_event.spellFamilyName — when set, must equal event family. */
  spellFamilyName?: number;
  // spell_proc_event.spellFamilyMask[3] — when any non-zero, event family flags must fit at least one mask
  // (bit AND). Cite: UnitAuraProcHandler.cpp ~634.
  spellFamilyMask?: number[];
  requiresOutdoors?: boolean;
}

// True when family flags fit any non-zero mask entry (IsFitToFamilyMask style). Uses Number bit ops;
// Classic masks in bake are within safe integer range.
export function spellFamilyMaskFits(
  spellFamilyFlags: number | undefined,
  masks: number[] | undefined,
): boolean {
  if (!masks || !masks.length) return true;
  const flags = (spellFamilyFlags ?? 0) | 0;
  let anyMask = false;
  for (const m of masks) {
    const mask = (m ?? 0) | 0;
    if (!mask) continue;
    anyMask = true;
    if ((flags & mask) !== 0) return true;
  }
  // All masks zero → no family-mask filter.
  if (!anyMask) return true;
  return false;
}

// True when this proc may roll against the event (flags, ex, school/family, hidden CD). Does not roll
// chance — caller rolls via tryProc. Cite: SpellMgr.cpp IsSpellProcEventCanTriggeredBy ~843.
export function procMatchesEvent(proc: ProcMatchInput, ctx: ProcEventContext): boolean {
  if (proc.cooldownReadyAt != null && proc.cooldownReadyAt > ctx.nowMs) {
    return false;
  }
  if (proc.procFlags != null && proc.procFlags !== 0) {
    if ((ctx.procFlags & proc.procFlags) === 0) return false;
  }
  // A kill event carries no ex bits, school or family: the flag alone decides.
  // Cite: SpellMgr.cpp:853 "Always trigger for this" (PROC_FLAG_KILL).
  if ((ctx.procFlags & PROC_FLAG.KILL) !== 0) return true;
  if (proc.procEx != null && proc.procEx !== 0) {
    // At least one of the required ex bits must be present on the event.
    if ((ctx.procEx & proc.procEx) === 0) return false;
  }

  // School / family filters only when the *proc* carries them (sourced spell_proc_event).
  if (proc.schoolMask != null && proc.schoolMask !== 0) {
    // Melee triggers: spellInfo == null → require NORMAL school bit (SpellMgr.cpp ~899–903).
    const eventSchool = ctx.schoolMask != null && ctx.schoolMask !== 0
      ? ctx.schoolMask
      : SCHOOL_MASK.NORMAL;
    if ((proc.schoolMask & eventSchool) === 0) return false;
  }
  if (proc.spellFamilyName != null && proc.spellFamilyName !== 0) {
    // Family filter only applies when there is a triggering spell (SpellMgr.cpp ~905–913).
    // Melee white (no family) fails a non-zero family requirement.
    if ((ctx.spellFamilyName ?? 0) !== proc.spellFamilyName) return false;
  }
  if (proc.spellFamilyMask && proc.spellFamilyMask.length) {
    if (!spellFamilyMaskFits(ctx.spellFamilyFlags, proc.spellFamilyMask)) return false;
  }

  if (proc.requiresOutdoors && ctx.outdoors === false) return false;

  return true;
}

// Classic PPM to a per-swing probability: the weapon speed in seconds times the rate over sixty.
// Cite: Unit.cpp:7717 GetPPMProcChance.
export function ppmChance(ppm: number, weaponSpeedMs: number): number {
  if (!(ppm > 0) || !(weaponSpeedMs > 0)) return 0;
  const speedSec = weaponSpeedMs / 1000;
  return Math.min(1, (ppm * speedSec) / 60);
}

// The default weapon-proc chance, which is a function of weapon speed rather than a constant: a 3.3 s
// weapon gives 5.94% and a 1.5 s dagger 2.7%. Cite: Unit.cpp:7705.
export function weaponDefaultProcChance(weaponSpeedMs: number): number {
  if (!(weaponSpeedMs > 0)) return 0;
  return Math.min(1, (weaponSpeedMs * 1.8) / 1000 / 100);
}

// Resolve the final proc probability, or null when it cannot be determined. PPM WINS, as it is assigned
// last in both C++ paths: the old order was backwards, so every PPM proc ignored its rate.
export function resolveProcProbability(
  proc: ProcMatchInput,
  weaponSpeedMs?: number,
): number | null {
  // 1. PPM first — it overrides both chance fields in CMaNGOS.
  if (proc.ppm != null && proc.ppm > 0) {
    if (weaponSpeedMs == null || weaponSpeedMs <= 0) return null;
    return ppmChance(proc.ppm, weaponSpeedMs);
  }
  if (proc.customChance != null && proc.customChance > 0) {
    // customChance stored as 0..1 in engine ProcDef; if > 1 treat as percent.
    return proc.customChance > 1
      ? Math.min(1, proc.customChance / 100)
      : Math.min(1, proc.customChance);
  }
  if (proc.chance != null && proc.chance > 0) {
    return Math.min(1, proc.chance);
  }
  // 2. The item/enchant `ProcChance > 100` sentinel: derive it from the weapon's speed.
  if (proc.weaponDefault) {
    if (weaponSpeedMs == null || weaponSpeedMs <= 0) return null;
    return weaponDefaultProcChance(weaponSpeedMs);
  }
  return null;
}

// Match + roll. Returns true if the proc fires. RNG is drawn only when probability is resolvable and match
// passes — preserves seed streams when procs are absent or filtered out pre-roll.
export function tryProc(
  proc: ProcMatchInput,
  ctx: ProcEventContext,
  rng: Rng,
): boolean {
  if (!procMatchesEvent(proc, ctx)) return false;
  const p = resolveProcProbability(proc, ctx.weaponSpeedMs);
  if (p == null || p <= 0) return false;
  return rng.chance(p);
}

/** readyAt after a successful proc that has a hidden cooldown. */
export function procCooldownReadyAt(nowMs: number, cooldownMs?: number): number | null {
  if (cooldownMs == null || cooldownMs <= 0) return null;
  return nowMs + cooldownMs;
}

/** Build procEx bits from a simple hit/crit/miss outcome string. */
export function procExFromOutcome(outcome: 'hit' | 'crit' | 'miss' | 'dodge' | 'parry' | 'block' | 'resist'): number {
  switch (outcome) {
    case 'crit': return PROC_EX.CRITICAL_HIT;
    case 'miss': return PROC_EX.MISS;
    case 'dodge': return PROC_EX.DODGE;
    case 'parry': return PROC_EX.PARRY;
    case 'block': return PROC_EX.BLOCK;
    case 'resist': return PROC_EX.RESIST;
    default: return PROC_EX.NORMAL_HIT;
  }
}

/** Common attacker-side flags for a landed melee white hit. */
export function meleeSwingDealFlags(): number {
  return PROC_FLAG.DEAL_MELEE_SWING;
}

/** Attacker-side flags for a landed harmful spell (damage). */
export function harmfulSpellDealFlags(): number {
  return PROC_FLAG.DEAL_HARMFUL_SPELL;
}

/** Killer-side flags for a kill that yields XP or honor. Cite: Unit.cpp:1080. */
export function killDealFlags(): number {
  return PROC_FLAG.KILL;
}

/** Attacker-side flags for a melee ability (strike / on-next-swing). */
export function meleeAbilityDealFlags(): number {
  return PROC_FLAG.DEAL_MELEE_ABILITY;
}

/** Defender-side flags for a white melee swing that was dodged/parried/blocked. */
export function meleeSwingTakeFlags(): number {
  return PROC_FLAG.TAKE_MELEE_SWING;
}

/** Defender-side flags for a melee ability outcome. */
export function meleeAbilityTakeFlags(): number {
  return PROC_FLAG.TAKE_MELEE_ABILITY;
}

/** Defender-side flags for a harmful spell land-fail (full resist). */
export function harmfulSpellTakeFlags(): number {
  return PROC_FLAG.TAKE_HARMFUL_SPELL;
}

// Which combat event a proc site is reporting. One hint per PROC_FLAG_DEAL_* family — the ranged pair used
// to have no hint at all, so bow and wand hits borrowed a melee/spell one.
export type ProcFlagsHint =
  | 'melee_swing'
  | 'melee_ability'
  | 'ranged_attack'
  | 'ranged_ability'
  | 'spell'
  | 'kill';

// The attacker-side flags for a landed ranged white. Both ranged bits were declared and emitted by
// nothing, so every ranged hit was tagged melee or harmful-spell and matched the wrong auras.
export function rangedAttackDealFlags(): number {
  return PROC_FLAG.DEAL_RANGED_ATTACK;
}

/** Attacker-side flags for a ranged ABILITY (Aimed Shot / Multi-Shot / Arcane Shot). */
export function rangedAbilityDealFlags(): number {
  return PROC_FLAG.DEAL_RANGED_ABILITY;
}
