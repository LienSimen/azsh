// School lockout and cast interrupt helpers. Pure: no DOM, no Math.random, no I/O.
// Cite: Spell.cpp IsInterruptible ~7471; SpellEffects.cpp EffectInterruptCast ~3591.

import type { School } from '../../data/schema.ts';

/** SpellDefines.h SPELL_INTERRUPT_FLAG_COMBAT — required bit for IsInterruptible. */
export const SPELL_INTERRUPT_FLAG_COMBAT = 0x08;
/** SpellDefines.h:354 — damage delays the cast (player only; Spell::Delayed). */
export const SPELL_INTERRUPT_FLAG_DAMAGE_PUSHBACK = 0x02;
/** SpellDefines.h:357 — damage cancels the cast outright (player only). */
export const SPELL_INTERRUPT_FLAG_DAMAGE_CANCELS = 0x10;

/** SharedDefines SpellPreventionType. */
export const SPELL_PREVENTION_TYPE = {
  NONE: 0,
  SILENCE: 1,
  PACIFY: 2,
} as const;

// SpellSchools index order (SharedDefines). Index i → mask bit (1 << i). Document next to
// Fighter.schoolLockoutUntil (length 7).
export const SPELL_SCHOOL_INDEX: readonly School[] = [
  'physical', // 0 SPELL_SCHOOL_NORMAL
  'holy',     // 1
  'fire',     // 2
  'nature',   // 3
  'frost',    // 4
  'shadow',   // 5
  'arcane',   // 6
] as const;

export const SPELL_SCHOOL_COUNT = SPELL_SCHOOL_INDEX.length;

const SCHOOL_TO_INDEX: Record<School, number> = {
  physical: 0,
  holy: 1,
  fire: 2,
  nature: 3,
  frost: 4,
  shadow: 5,
  arcane: 6,
};

/** Map Phonecraft School string → SpellSchools index (0..6). Unknown → -1. */
export function schoolIndexFromSchool(school: School | string | undefined | null): number {
  if (!school) return -1;
  const idx = SCHOOL_TO_INDEX[school as School];
  return idx === undefined ? -1 : idx;
}

/** Zero-filled school lockout array (index → readyAt ms; 0 = free). */
export function emptySchoolLockoutUntil(): number[] {
  return new Array(SPELL_SCHOOL_COUNT).fill(0);
}

// IsInterruptible: the combat interrupt flag, the silence prevention type, and a cast that can be
// interrupted. Missing flags on an old bake fail CLOSED — never assume every cast time is interruptible.
export function isCastInterruptible(
  castingSpell: {
    interruptFlags?: number;
    preventionType?: number;
  } | null | undefined,
  currentlyCasting: boolean,
): boolean {
  if (!castingSpell || !currentlyCasting) return false;
  const flags = (castingSpell.interruptFlags ?? 0) | 0;
  const prev = (castingSpell.preventionType ?? 0) | 0;
  return (flags & SPELL_INTERRUPT_FLAG_COMBAT) !== 0
    && prev === SPELL_PREVENTION_TYPE.SILENCE;
}

/** SharedDefines.h SpellEffects — SPELL_EFFECT_INTERRUPT_CAST. */
export const SPELL_EFFECT_INTERRUPT_CAST = 68;

// The interrupt effect's own mechanic, read off the DBC row because the baked effect carries none: 49
// of the 72 rows name it, and 0 means the row carries none, so nothing is immune to it.
export function interruptEffectMechanicId(
  spell: { rawEffects?: readonly { effect?: number; mechanic?: number }[] } | null | undefined,
): number {
  for (const re of spell?.rawEffects ?? []) {
    if (((re?.effect ?? 0) | 0) === SPELL_EFFECT_INTERRUPT_CAST) return (re?.mechanic ?? 0) | 0;
  }
  return 0;
}

// The silenced flag refuses a cast only at the SILENCE prevention type: Kick and Shield Bash are the
// pacify type and fire through it. An absent field IS type 0, since the bake omits a zero.
export function isSilencePrevented(
  spell: { preventionType?: number } | null | undefined,
): boolean {
  return ((spell?.preventionType ?? 0) | 0) === SPELL_PREVENTION_TYPE.SILENCE;
}

// The pacified flag refuses a cast only at the PACIFY prevention type — the physical abilities, not
// the casts. Cite: Spell.cpp:6051-6052 CheckCast SPELL_FAILED_PACIFIED.
export function isPacifyPrevented(
  spell: { preventionType?: number } | null | undefined,
): boolean {
  return ((spell?.preventionType ?? 0) | 0) === SPELL_PREVENTION_TYPE.PACIFY;
}

// Object.cpp CheckLockout — true when any school bit in the cast's school is locked past `nowMs`.
// Single-school Classic spells: pass school string; multi-school rare → report if encountered.
export function checkSchoolLockout(
  schoolLockoutUntil: readonly number[] | undefined | null,
  school: School | string | undefined | null,
  nowMs: number,
): boolean {
  if (!schoolLockoutUntil || schoolLockoutUntil.length === 0) return false;
  const idx = schoolIndexFromSchool(school);
  if (idx < 0 || idx >= schoolLockoutUntil.length) return false;
  return (schoolLockoutUntil[idx] ?? 0) > nowMs;
}

// The lockout branch of IsSpellReady: a silence-type spell whose school is locked out is not ready.
// Prefer the baked prevention type; absent, do not invent one.
export function isSpellSchoolLocked(
  spell: { preventionType?: number; school?: School | string },
  schoolLockoutUntil: readonly number[] | undefined | null,
  nowMs: number,
): boolean {
  if (((spell.preventionType ?? 0) | 0) !== SPELL_PREVENTION_TYPE.SILENCE) return false;
  return checkSchoolLockout(schoolLockoutUntil, spell.school, nowMs);
}

// Lock out one school. It takes the later of the existing and new expiry, so a longer lockout is not
// clobbered by a shorter re-apply — the C++ keeps the first entry instead.
export function applySchoolLockout(
  schoolLockoutUntil: number[],
  school: School | string | undefined | null,
  untilMs: number,
): boolean {
  const idx = schoolIndexFromSchool(school);
  if (idx < 0 || idx >= schoolLockoutUntil.length) return false;
  const cur = schoolLockoutUntil[idx] ?? 0;
  if (untilMs > cur) schoolLockoutUntil[idx] = untilMs;
  return true;
}

// Apply lockout from a school mask (1 << i bits), matching LockOutSpells loop. Prefer
// applySchoolLockout(school string) for Classic single-school casts.
function applySchoolLockoutMask(
  schoolLockoutUntil: number[],
  schoolMask: number,
  untilMs: number,
): void {
  const mask = schoolMask | 0;
  for (let i = 0; i < SPELL_SCHOOL_COUNT; i++) {
    if (mask & (1 << i)) {
      const cur = schoolLockoutUntil[i] ?? 0;
      if (untilMs > cur) schoolLockoutUntil[i] = untilMs;
    }
  }
}

/** Remaining lockout ms for a school (0 if free). */
function schoolLockoutRemainingMs(
  schoolLockoutUntil: readonly number[] | undefined | null,
  school: School | string | undefined | null,
  nowMs: number,
): number {
  if (!schoolLockoutUntil) return 0;
  const idx = schoolIndexFromSchool(school);
  if (idx < 0 || idx >= schoolLockoutUntil.length) return 0;
  return Math.max(0, (schoolLockoutUntil[idx] ?? 0) - nowMs);
}

/** True when the spell carries SPELL_EFFECT_INTERRUPT_CAST (Kick / CS / Spell Lock…). */
export function spellHasInterruptCast(
  spell: { effects?: ReadonlyArray<{ kind: string }> } | null | undefined,
): boolean {
  return !!spell?.effects?.some((e) => e.kind === 'interrupt_cast');
}

// Drop stale party interrupt claims when the claimer or target dies, or the target stops casting. The
// claim is taken at the cast, never at the pick, so a GCD-blocked pick cannot lock out a free kicker.
export function unitIsCastingOrChanneling(
  u: { castingSpell?: unknown; channeling?: { endsAt: number } | null } | null | undefined,
  now: number,
): boolean {
  if (!u) return false;
  if (u.castingSpell != null) return true;
  return !!u.channeling && now < u.channeling.endsAt;
}

type InterruptibleCast = {
  interruptFlags?: number;
  preventionType?: number;
};

/** The in-flight hardcast or channel, only when IsInterruptible. */
export function unitInterruptibleCast(
  u: {
    castingSpell?: InterruptibleCast | null;
    channeling?: { endsAt: number; spell: InterruptibleCast } | null;
  } | null | undefined,
  now: number,
): InterruptibleCast | null {
  if (!u) return null;
  if (u.castingSpell && isCastInterruptible(u.castingSpell, true)) return u.castingSpell;
  if (u.channeling && now < u.channeling.endsAt && isCastInterruptible(u.channeling.spell, true)) {
    return u.channeling.spell;
  }
  return null;
}

export function pruneInterruptClaims(
  claim: Map<string, string>,
  isAlive: (id: string) => boolean,
  isCasting: (id: string) => boolean,
): void {
  for (const [targetId, claimerId] of [...claim.entries()]) {
    if (!isAlive(claimerId) || !isAlive(targetId) || !isCasting(targetId)) {
      claim.delete(targetId);
    }
  }
}
