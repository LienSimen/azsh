// Cooldown categories plus the global cooldown and recovery helpers, extracted so every cast site
// shares one definition. Pure: no DOM, no Math.random, no I/O.

import type { SpellRole } from '../../data/schema.ts';
import { SPELL_ATTR } from './spellAttributes.ts';

/** Minimal spell fields for recovery helpers (avoids brittle Pick on optional keys). */
export interface RecoverySpellFields {
  id?: number;
  cooldownMs?: number;
  categoryRecoveryMs?: number;
  category?: number;
  onNextSwing?: boolean;
  gcdMs?: number;
  role?: SpellRole | null;
  comboPointsGenerated?: number;
  requiresComboPoints?: boolean;
  /** SpellEntry.StartRecoveryCategory — 133 is the global GCD, the only hasted bucket. */
  gcdCategory?: number;
  /** SpellEntry.Attributes — read for IS_ABILITY / USES_RANGED_SLOT. */
  attributes?: number;
  /** SpellEntry.DmgClass — melee/ranged are never hasted. */
  dmgClass?: number;
}

// The effective recovery duration: the larger of the spell's own and its category's. With no category
// recovery baked, the personal one alone is returned.
export function getSpellRecoveryTime(spell: RecoverySpellFields): number {
  const personal = (spell.cooldownMs ?? 0) | 0;
  const category = (spell.categoryRecoveryMs ?? 0) | 0;
  return personal > category ? personal : category;
}

// The duration for the spell's PERSONAL cooldown. With no real category but a category recovery time —
// common on creature spells — the larger value folds into the personal timer so the cooldown survives.
export function personalCooldownMs(spell: RecoverySpellFields): number {
  const personal = (spell.cooldownMs ?? 0) | 0;
  if (spell.category != null && spell.category !== 0) return personal;
  const catRec = (spell.categoryRecoveryMs ?? 0) | 0;
  return personal > catRec ? personal : catRec;
}

// The duration for the SHARED category timer when the spell has a category: the category recovery when
// set, else the personal one. No category means no category timer.
export function categoryCooldownMs(spell: RecoverySpellFields): number {
  if (spell.category == null || spell.category === 0) return 0;
  if (spell.categoryRecoveryMs != null && spell.categoryRecoveryMs > 0) {
    return spell.categoryRecoveryMs;
  }
  return (spell.cooldownMs ?? 0) | 0;
}

/** SpellMgr.h IsNextMeleeSwingSpell — Phonecraft uses baked onNextSwing. */
export function isNextMeleeSwingSpell(spell: RecoverySpellFields): boolean {
  return !!spell.onNextSwing || (((spell.attributes ?? 0) & (SPELL_ATTR.ON_NEXT_SWING_NO_DAMAGE | SPELL_ATTR.ON_NEXT_SWING)) !== 0);
}

/** SPELL_ATTR_USES_RANGED_SLOT. Cite: SpellDefines.h SpellAttributes. */
const SPELL_ATTR_USES_RANGED_SLOT = 0x00000002;
/** SPELL_ATTR_IS_ABILITY. Cite: SpellDefines.h SpellAttributes. */
const SPELL_ATTR_IS_ABILITY = 0x00000010;
/** SharedDefines SpellDmgClass. */
const SPELL_DAMAGE_CLASS_MELEE = 2;
const SPELL_DAMAGE_CLASS_RANGED = 3;
/** The one global-cooldown bucket. Cite: Player.cpp:20080. */
const GCD_CATEGORY_GLOBAL = 133;

// Whether the spell incurs the global cooldown. The recovery-start field IS the rule — a zero row is
// off-GCD. A role fallback here synthesized a 1500 ms GCD onto 658 rows, Auto Shot among them.
export function spellIncursGcd(spell: RecoverySpellFields): boolean {
  if (spell.onNextSwing) return false;
  return ((spell.gcdMs ?? 0) | 0) > 0;
}

/** GCD duration (ms) for this cast — StartRecoveryTime, or 0 when off-GCD. */
export function getGcdMs(spell: RecoverySpellFields): number {
  return spellIncursGcd(spell) ? ((spell.gcdMs ?? 0) | 0) : 0;
}

// Whether cast haste shortens this GCD. Only the player path has a haste branch and it is narrow: the
// global category, a 1500 ms base, and neither a weapon damage class nor an ability.
export function gcdIsHasted(spell: RecoverySpellFields, playerControlled: boolean): boolean {
  if (!playerControlled) return false;
  if ((spell.gcdCategory ?? 0) !== GCD_CATEGORY_GLOBAL) return false;
  if (((spell.gcdMs ?? 0) | 0) !== 1500) return false;
  const dc = spell.dmgClass ?? 0;
  if (dc === SPELL_DAMAGE_CLASS_MELEE || dc === SPELL_DAMAGE_CLASS_RANGED) return false;
  const attrs = (spell.attributes ?? 0) | 0;
  if ((attrs & SPELL_ATTR_USES_RANGED_SLOT) !== 0) return false;
  return (attrs & SPELL_ATTR_IS_ABILITY) === 0;
}

// True when personal or category recovery still blocks the cast. Mirrors Fighter onCooldown(cooldowns +
// categoryCooldowns).
function isOnCooldown(
  spell: RecoverySpellFields,
  nowMs: number,
  personalReadyAt: number,
  categoryReadyAt: number,
): boolean {
  if (personalReadyAt > nowMs) return true;
  if (spell.category != null && categoryReadyAt > nowMs) return true;
  return false;
}

// COOLDOWN_ON_EVENT, on 72 playable rows: the cast installs a PERMANENT entry and the real timer starts
// when the aura fades or the summon dies. Cite: Spell.cpp:3414; Player.cpp:20163-20167.
export function cooldownStartsOnAuraFade(spell: RecoverySpellFields): boolean {
  return ((spell.attributes ?? 0) & 0x02000000) !== 0;
}

// The ready-at an armed-but-unstarted cooldown holds. Infinity IS the permanent entry: every
// ready check already treats it as not ready. Cite: Player.cpp:20152 IsPermanent.
export const PERMANENT_COOLDOWN_READY_AT = Number.POSITIVE_INFINITY;

// Compute readyAt timestamps after a successful cast (not on-next-swing arm). Personal and category timers
// are independent durations.
export function recoveryReadyAts(
  spell: RecoverySpellFields,
  nowMs: number,
): { personalReadyAt: number | null; categoryReadyAt: number | null; category: number | null } {
  const p = personalCooldownMs(spell);
  const c = categoryCooldownMs(spell);
  return {
    personalReadyAt: p > 0 ? nowMs + p : null,
    categoryReadyAt: c > 0 && spell.category != null ? nowMs + c : null,
    category: spell.category != null && c > 0 ? spell.category : null,
  };
}

// World-clock readyAt map (epoch ms) → the "remaining ms at t=0" form a session seeds with. Expired rows
// drop; an empty result returns undefined so callers can skip the field.
export function sessionSeedFromWorldCooldowns(
  store: Record<number, number> | undefined,
  now: number,
): Record<number, number> | undefined {
  if (!store) return undefined;
  let out: Record<number, number> | undefined;
  // No `| 0` anywhere on these: an epoch stamp is ~1.8e12 and int32 truncation wraps it.
  for (const [k, readyAt] of Object.entries(store)) {
    const rem = Number(readyAt) - now;
    if (rem > 0) (out ??= {})[Number(k)] = rem;
  }
  return out;
}

// Session remainings folded into a world-clock ready-at map, merged onto what the unit carried and
// pruned of anything expired. Undefined when nothing is on cooldown, so the caller can drop the field.
export function worldCooldownsFromSessionSnapshot(
  prev: Record<number, number> | undefined,
  remaining: Record<number, number>,
  now: number,
): Record<number, number> | undefined {
  let out: Record<number, number> | undefined;
  for (const [k, readyAt] of Object.entries(prev ?? {})) {
    const at = Number(readyAt);
    if (at > now) (out ??= {})[Number(k)] = at;
  }
  for (const [k, rem] of Object.entries(remaining)) {
    const r = Number(rem);
    if (r > 0) (out ??= {})[Number(k)] = now + r;
  }
  return out;
}

/** Scope for scripted cooldown resets (Cold Snap / Preparation / Readiness). */
export type ResetCooldownScope = 'frost' | 'rogue' | 'hunter';

// Finish the world cooldowns matching a scripted reset's scope, mutating the maps in place. The
// resetter's OWN cooldown is never cleared — the cast site starts it after the effects apply.
export function applyResetCooldownsWorld(
  scope: ResetCooldownScope,
  selfSpellId: number,
  spellCooldowns: Record<number, number> | undefined,
  categoryCooldowns: Record<number, number> | undefined,
  knownSpellIds: readonly number[],
  lookup: (id: number) => { school?: string; category?: number; cooldownMs?: number; categoryRecoveryMs?: number } | undefined,
): void {
  if (spellCooldowns) {
    for (const idStr of Object.keys(spellCooldowns)) {
      const id = Number(idStr);
      if (id === selfSpellId) continue;
      const other = lookup(id);
      if (!other) continue;
      if (scope === 'frost' && (other.school !== 'frost' || getSpellRecoveryTime(other) === 0)) continue;
      // rogue / hunter: clear other ability CDs (known kit is class-scoped).
      delete spellCooldowns[id];
      if (other.category != null && categoryCooldowns) {
        delete categoryCooldowns[other.category];
      }
    }
  }
  // Category-only recovery rows for matching known spells.
  if (categoryCooldowns) {
    for (const knownId of knownSpellIds) {
      if (knownId === selfSpellId) continue;
      const other = lookup(knownId);
      if (!other || other.category == null) continue;
      if (scope === 'frost' && (other.school !== 'frost' || getSpellRecoveryTime(other) === 0)) continue;
      delete categoryCooldowns[other.category];
    }
  }
}
