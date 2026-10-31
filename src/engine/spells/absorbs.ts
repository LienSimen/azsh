// Pure school-absorb, mana-shield, split and magnet helpers. Order of ops the callers must enforce:
// resist first on the original damage, then school absorb on what is left. Never merged with block.

import { SCHOOL_MASK } from './procs.ts';
import { SPELL_ATTR, SPELL_ATTR_EX, hasAttr, hasAttrEx } from './spellAttributes.ts';

export { SCHOOL_MASK };

/** SPELL_AURA_SCHOOL_ABSORB = 69 — pool entry on a unit. */
export interface SchoolAbsorbAura {
  /** School mask bits (SpellSchoolMask / EffectMiscValue). */
  schoolMask: number;
  /** Remaining absorb pool (mod->m_amount). */
  amount: number;
  /** Optional spell/aura id for identity when combat wires remove. */
  id?: number;
}

/** SPELL_AURA_MANA_SHIELD = 97 — absorb paid from mana. */
export interface ManaShieldAura {
  schoolMask: number;
  /** Remaining absorb pool (mod->m_amount). */
  amount: number;
  // The effect's multiple value: mana per damage absorbed, and the divisor for the maximum absorb.
  // Classic Mana Shield ranks all use 2. Cite: Unit.cpp:2473-2483.
  manaMultiplier: number;
  id?: number;
}

/** SPELL_AURA_SPLIT_DAMAGE_PCT = 81 (Soul Link-style). */
export interface SplitDamagePctAura {
  schoolMask: number;
  /** Percent of remaining damage redirected (mod->m_amount). */
  pct: number;
  /** Linked unit that receives the split (aura caster). */
  linkedTargetId: string;
  id?: number;
}

// SPELL_AURA_SPLIT_DAMAGE_FLAT = 153 (Blessing of Sacrifice). Cite: Unit.cpp:2501–2537 — currentAbsorb =
// min(remaining, amount).
export interface SplitDamageFlatAura {
  schoolMask: number;
  /** Flat damage cap redirected per hit (mod->m_amount). */
  amount: number;
  /** Linked unit that receives the split (aura caster / paladin). */
  linkedTargetId: string;
  id?: number;
}

/** SPELL_AURA_SPELL_MAGNET = 96 — Grounding Totem Effect. */
export interface MagnetCandidate<S extends string = string> {
  /** Unit id of the magnet (Grounding Totem), i.e. aura caster. */
  magnetUnitId: S;
  /** True when the magnet unit is alive. */
  alive: boolean;
  /** True when the attacker can attack the magnet (hostile/valid). */
  canAttack: boolean;
  // Remaining charges — Grounding Totem Effect 8178 bakes exactly one. Absent or zero is infinite only
  // where explicit charges are not used; consuming the one charge removes the aura.
  charges?: number;
  /** Aura already used this cast (C++ m_magnetUsed). */
  magnetUsed?: boolean;
  id?: number;
}

export interface SchoolAbsorbResult {
  /** Total damage absorbed by school-absorb auras. */
  absorbed: number;
  /** Damage left after absorbs (goes to HP if no further layers). */
  leftover: number;
  /** Updated aura list (amount reduced; empty pools removed). */
  auras: SchoolAbsorbAura[];
}

export interface ManaShieldResult {
  absorbed: number;
  leftover: number;
  /** Mana spent this hit (int32(currentAbsorb * manaMultiplier)). */
  manaSpent: number;
  /** Mana remaining after drain. */
  mana: number;
  // Updated shield list. Amount ≤ 0 removes the aura (Unit.cpp:2488–2492). OOM alone does not remove the
  // shield in CMaNGOS — only amount depletion does.
  auras: ManaShieldAura[];
}

export interface SplitDamagePctResult {
  /** Damage remaining on the original target after split. */
  leftover: number;
  /** Amount redirected (uint32(remaining * pct / 100.0f)). */
  split: number;
  /** Unit id that should take `split` damage (structure only). */
  redirectToId: string | null;
}

export interface SelectMagnetResult<S extends string = string> {
  /** Magnet unit id to retarget the spell onto, or null if none. */
  magnetUnitId: S | null;
  // Candidates after consume-one-charge: UseMagnet + charge drop. Grounding eats exactly one harmful spell
  // (procCharges 1 → remove).
  candidates: MagnetCandidate<S>[];
  /** True when a magnet absorbed/redirected this spell. */
  redirected: boolean;
}

// SCHOOL_ABSORB: for each aura in list order, absorb up to its amount of the matching school and remove
// it when spent. Inputs are post-resist; melee shield block stays separate. Cite: Unit.cpp:2391-2433.
export function applySchoolAbsorb(
  auras: ReadonlyArray<SchoolAbsorbAura>,
  schoolMask: number,
  remainingDamage: number,
): SchoolAbsorbResult {
  let remaining = Math.trunc(remainingDamage);
  if (remaining < 0) remaining = 0;

  let absorbed = 0;
  const out: SchoolAbsorbAura[] = [];

  for (const aura of auras) {
    const amount = Math.trunc(aura.amount);
    if (remaining <= 0) {
      // Past absorb window — keep remaining auras unchanged (if still positive).
      if (amount > 0) out.push({ ...aura, amount });
      continue;
    }

    if ((aura.schoolMask & schoolMask) === 0) {
      if (amount > 0) out.push({ ...aura, amount });
      continue;
    }

    if (amount <= 0) {
      // Empty / expired — drop (existExpired path removes amount <= 0).
      continue;
    }

    // currentAbsorb = min(mod->m_amount, remainingDamage)
    let currentAbsorb = amount;
    if (remaining < currentAbsorb) currentAbsorb = remaining;

    remaining -= currentAbsorb;
    absorbed += currentAbsorb;
    const nextAmount = amount - currentAbsorb;
    if (nextAmount > 0) {
      out.push({ ...aura, amount: nextAmount });
    }
    // amount <= 0 → remove aura (shield break)
  }

  return { absorbed, leftover: remaining, auras: out };
}

// MANA_SHIELD: absorb up to the amount, capped by the mana the multiplier can pay for, spend that mana,
// and drop the shield when the amount runs out. Cite: Unit.cpp:2467-2495.
export function applyManaShield(
  auras: ReadonlyArray<ManaShieldAura>,
  schoolMask: number,
  remainingDamage: number,
  mana: number,
): ManaShieldResult {
  let remaining = Math.trunc(remainingDamage);
  if (remaining < 0) remaining = 0;
  let currentMana = Math.trunc(mana);
  if (currentMana < 0) currentMana = 0;

  let absorbed = 0;
  let manaSpent = 0;
  const out: ManaShieldAura[] = [];

  for (const aura of auras) {
    const amount = Math.trunc(aura.amount);
    if (remaining <= 0) {
      if (amount > 0) out.push({ ...aura, amount });
      continue;
    }

    if ((aura.schoolMask & schoolMask) === 0) {
      if (amount > 0) out.push({ ...aura, amount });
      continue;
    }

    if (amount <= 0) continue;

    // currentAbsorb = min(amount, remaining)
    let currentAbsorb = remaining >= amount ? amount : remaining;

    const manaMultiplier = aura.manaMultiplier;
    if (manaMultiplier) {
      // maxAbsorb = int32(mana / manaMultiplier)
      const maxAbsorb = Math.trunc(currentMana / manaMultiplier);
      if (currentAbsorb > maxAbsorb) currentAbsorb = maxAbsorb;

      // manaReduction = int32(currentAbsorb * manaMultiplier)
      const manaReduction = Math.trunc(currentAbsorb * manaMultiplier);
      currentMana -= manaReduction;
      if (currentMana < 0) currentMana = 0;
      manaSpent += manaReduction;
    }

    absorbed += currentAbsorb;
    remaining -= currentAbsorb;
    const nextAmount = amount - currentAbsorb;
    // Drop only when absorb pool is depleted (not merely when mana == 0).
    if (nextAmount > 0) {
      out.push({ ...aura, amount: nextAmount });
    }
  }

  return {
    absorbed,
    leftover: remaining,
    manaSpent,
    mana: currentMana,
    auras: out,
  };
}

// SPLIT_DAMAGE_PCT: take a percentage of the remaining damage and redirect it to the linked caster.
// Structure only — the caller deals the split to the link and the leftover to the original target.
export function applySplitDamagePct(
  aura: SplitDamagePctAura | null | undefined,
  schoolMask: number,
  remainingDamage: number,
  originalTargetId: string,
): SplitDamagePctResult {
  let remaining = Math.trunc(remainingDamage);
  if (remaining < 0) remaining = 0;

  if (!aura) {
    return { leftover: remaining, split: 0, redirectToId: null };
  }
  if ((aura.schoolMask & schoolMask) === 0) {
    return { leftover: remaining, split: 0, redirectToId: null };
  }
  if (!aura.linkedTargetId || aura.linkedTargetId === originalTargetId) {
    return { leftover: remaining, split: 0, redirectToId: null };
  }

  // uint32(remainingDamage * m_amount / 100.0f)
  const split = Math.trunc((remaining * aura.pct) / 100);
  return {
    leftover: remaining - split,
    split,
    redirectToId: aura.linkedTargetId,
  };
}

// SPLIT_DAMAGE_FLAT: redirect up to the aura's amount to the linked caster, a no-op when the link is
// missing or is self, or when the school does not match. Cite: Unit.cpp:2515-2521.
export function applySplitDamageFlat(
  aura: SplitDamageFlatAura | null | undefined,
  schoolMask: number,
  remainingDamage: number,
  originalTargetId: string,
): SplitDamagePctResult {
  let remaining = Math.trunc(remainingDamage);
  if (remaining < 0) remaining = 0;

  if (!aura) {
    return { leftover: remaining, split: 0, redirectToId: null };
  }
  if ((aura.schoolMask & schoolMask) === 0) {
    return { leftover: remaining, split: 0, redirectToId: null };
  }
  if (!aura.linkedTargetId || aura.linkedTargetId === originalTargetId) {
    return { leftover: remaining, split: 0, redirectToId: null };
  }

  // min(remaining, amount). Cite: Unit.cpp:2515–2519.
  const split = Math.min(remaining, Math.max(0, Math.trunc(aura.amount)));
  return {
    leftover: remaining - split,
    split,
    redirectToId: aura.linkedTargetId,
  };
}

// SPELL_MAGNET: a harmful single-target spell redirects to the first living attackable magnet and
// consumes one of its charges. The damage classes below are none and magic. Cite: Unit.cpp:6894-6919.
const MAGNET_DMG_CLASS_NONE = 0;
const MAGNET_DMG_CLASS_MAGIC = 1;

// The magic-case gate before reading victim auras: three baked attributes refuse redirection outright,
// so a Grounding Totem never eats a warrior ability. Cite: Unit.cpp:6899-6903.
export function isMagnetRedirectableSpell(
  spell: {
    dmgClass?: number;
    aoe?: boolean;
    attributes?: number;
    attributesEx?: number;
  },
): boolean {
  if (spell.aoe) return false;
  const dc = spell.dmgClass;
  if (dc !== MAGNET_DMG_CLASS_NONE && dc !== MAGNET_DMG_CLASS_MAGIC) return false;
  if (hasAttr(spell, SPELL_ATTR.IS_ABILITY)) return false;
  if (hasAttr(spell, SPELL_ATTR.NO_IMMUNITIES)) return false;
  if (hasAttrEx(spell, SPELL_ATTR_EX.NO_REDIRECTION)) return false;
  return true;
}

// Magnet auras sit on the VICTIM; caster must CanAttack the magnet. Cite: Unit.cpp:6907–6916
// victim->GetAurasByType(SPELL_AURA_SPELL_MAGNET).
export function magnetCandidatesOnVictim<S extends string = string>(
  effects: ReadonlyArray<{
    kind: string;
    target: S;
    source: S;
    expiresAt: number;
    charges?: number;
  }>,
  victimSide: S,
  t: number,
  magnetOf: (source: S) => { side: S; hp: number } | undefined,
  canAttack: (magnetSide: S) => boolean,
): MagnetCandidate<S>[] {
  const out: MagnetCandidate<S>[] = [];
  for (const e of effects) {
    if (e.kind !== 'spell_magnet' || e.target !== victimSide || e.expiresAt <= t) continue;
    const magnet = magnetOf(e.source);
    if (!magnet || magnet.hp <= 0) continue;
    if (!canAttack(magnet.side)) continue;
    out.push({
      magnetUnitId: magnet.side,
      alive: true,
      canAttack: true,
      charges: e.charges ?? 1,
    });
  }
  return out;
}

export function selectMagnetTarget<S extends string = string>(
  candidates: ReadonlyArray<MagnetCandidate<S>>,
  harmfulSingleTarget: boolean,
): SelectMagnetResult<S> {
  if (!harmfulSingleTarget) {
    return {
      magnetUnitId: null,
      candidates: candidates.map((c) => ({ ...c })),
      redirected: false,
    };
  }

  const out: MagnetCandidate<S>[] = [];
  let magnetUnitId: S | null = null;
  let redirected = false;

  for (const c of candidates) {
    if (redirected) {
      out.push({ ...c });
      continue;
    }
    if (!c.alive || !c.canAttack) {
      out.push({ ...c });
      continue;
    }
    // First valid magnet: UseMagnet + consume one charge.
    magnetUnitId = c.magnetUnitId;
    redirected = true;
    const charges = c.charges;
    if (charges == null) {
      // Explicit one-shot model when charges omitted: remove after use
      // (Grounding is procCharges 1; pure helper defaults to consume-and-drop).
      continue;
    }
    const nextCharges = charges - 1;
    if (nextCharges > 0) {
      out.push({ ...c, charges: nextCharges, magnetUsed: true });
    }
    // nextCharges <= 0 → remove aura (one charge eaten)
  }

  return { magnetUnitId, candidates: out, redirected };
}
