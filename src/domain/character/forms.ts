// Shapeshift form state machine and stance gating, from SpellAuras.cpp HandleAuraModShapeshift,
// Player.cpp InitDataForForm and SpellMgr.cpp GetErrorAtShapeshiftedCast. See docs/done/druid.md §5.

import type { PowerType, ShapeshiftFormId, SpellDef } from '../../data/schema.ts';
import { SHAPESHIFT_FORM } from '../../data/schema.ts';
import { ENERGY_MAX, RAGE_MAX } from '../core/ids.ts';
import { hasAttr, hasAttrEx2, SPELL_ATTR, SPELL_ATTR_EX2 } from '../../engine/spells/spellAttributes.ts';

/** Human-readable form names for UI / feedback. */
export const FORM_LABEL: Record<number, string> = {
  [SHAPESHIFT_FORM.NONE]: '',
  [SHAPESHIFT_FORM.CAT]: 'Cat Form',
  [SHAPESHIFT_FORM.TREE]: 'Tree of Life',
  [SHAPESHIFT_FORM.TRAVEL]: 'Travel Form',
  [SHAPESHIFT_FORM.AQUA]: 'Aquatic Form',
  [SHAPESHIFT_FORM.BEAR]: 'Bear Form',
  [SHAPESHIFT_FORM.DIREBEAR]: 'Dire Bear Form',
  [SHAPESHIFT_FORM.GHOSTWOLF]: 'Ghost Wolf',
  [SHAPESHIFT_FORM.BATTLESTANCE]: 'Battle Stance',
  [SHAPESHIFT_FORM.DEFENSIVESTANCE]: 'Defensive Stance',
  [SHAPESHIFT_FORM.BERSERKERSTANCE]: 'Berserker Stance',
  [SHAPESHIFT_FORM.SHADOWFORM]: 'Shadowform',
  [SHAPESHIFT_FORM.STEALTH]: 'Stealth',
  [SHAPESHIFT_FORM.MOONKIN]: 'Moonkin Form',
};

// Primary spend resource while in this form: Cat energy, Bear and the warrior stances rage, else
// mana. FORM_STEALTH does not switch power, so callers must not ask this for stealth.
export function formPowerType(form: ShapeshiftFormId): PowerType {
  if (form === SHAPESHIFT_FORM.CAT) return 'energy';
  if (form === SHAPESHIFT_FORM.BEAR || form === SHAPESHIFT_FORM.DIREBEAR) return 'rage';
  // Warrior stances are rage forms — mapping them to mana made a stanced warrior read as an
  // empty-mana caster (the autopilot then rested forever waiting for mana that never comes).
  if (form === SHAPESHIFT_FORM.BATTLESTANCE || form === SHAPESHIFT_FORM.DEFENSIVESTANCE || form === SHAPESHIFT_FORM.BERSERKERSTANCE) return 'rage';
  // Stealth is a stance bit for openers, not a mana form — treat as "keep current" at call sites.
  if (form === SHAPESHIFT_FORM.STEALTH) return 'energy';
  return 'mana';
}

/** True for FORM_STEALTH — stance only; does not change power type or weapon speed. */
export function isStealthShapeshift(form: ShapeshiftFormId): boolean {
  return form === SHAPESHIFT_FORM.STEALTH;
}

// Warrior Battle / Defensive / Berserker stance forms, flagged STANCE rather than a real
// shapeshift. Re-casting the active stance is a no-op in Classic; druid forms toggle off.
export function isWarriorStance(form: ShapeshiftFormId): boolean {
  return form === SHAPESHIFT_FORM.BATTLESTANCE
    || form === SHAPESHIFT_FORM.DEFENSIVESTANCE
    || form === SHAPESHIFT_FORM.BERSERKERSTANCE;
}

// Fixed max for form resources (rage/energy). Mana max is still intellect-derived. Cite: Unit.h
// POWER_ENERGY_DEFAULT=100; rage UI pool 0..100.
export function formResourceMax(pt: PowerType): number {
  if (pt === 'energy') return ENERGY_MAX;
  if (pt === 'rage') return RAGE_MAX;
  return 0; // caller uses mana max from stats
}

// Starting value of the new power type after a form enter. BOTH are 0: the shapeshift handler
// zeroes the pool and leaves the free 40 energy / 10 rage to Furor. Cite: SpellAuras.cpp:1959.
export function formResourceOnEnter(pt: PowerType): number {
  if (pt === 'energy') return 0;
  if (pt === 'rage') return 0;
  return -1; // signal: do not reset mana
}

// Attack-time override (ms) for form weapons. 0 = use gear weapon speed again. Cite: Player.cpp
// InitDataForForm — Cat 1000, Bear/DireBear 2500.
export function formAttackTimeMs(form: ShapeshiftFormId): number {
  if (form === SHAPESHIFT_FORM.CAT) return 1000;
  if (form === SHAPESHIFT_FORM.BEAR || form === SHAPESHIFT_FORM.DIREBEAR) return 2500;
  return 0;
}

// Forms that replace equipped weapon damage with level×speed bands. Cite: Unit.cpp
// IsAttackSpeedOverridenShapeShift — FORM_CAT / FORM_BEAR / FORM_DIREBEAR only.
export function isAttackSpeedOverriddenShapeShift(form: ShapeshiftFormId): boolean {
  return form === SHAPESHIFT_FORM.CAT
    || form === SHAPESHIFT_FORM.BEAR
    || form === SHAPESHIFT_FORM.DIREBEAR;
}

// Speed-only HandleShapeshiftBoosts linked passives — Travel 5419 +40%, Aqua 5421 +50%. Ghost
// Wolf carries its aura on the form spell 2645 itself and has no linked boost id.
export function formSpeedBoostSpellIds(form: ShapeshiftFormId): readonly number[] {
  switch (form) {
    case SHAPESHIFT_FORM.TRAVEL:
      return [5419];
    case SHAPESHIFT_FORM.AQUA:
      return [5421];
    default:
      return [];
  }
}

// Combat package from the HandleShapeshiftBoosts linked passives, not the form spell: Cat 3025,
// Bear 1178/21178, Dire 9635, stances 21156/7376/7381. Cite: SpellAuras.cpp:4223–4284.
export interface FormCombatPackage {
  /** SPELL_AURA_MOD_BASE_RESISTANCE_PCT (142) — percent of current base armor added. */
  baseArmorPct: number;
  /** SPELL_AURA_MOD_INCREASE_HEALTH (34) flat max HP. */
  healthFlat: number;
  /** SPELL_AURA_MOD_ATTACK_POWER (99) flat melee AP from the passive. */
  attackPowerFlat: number;
  // SPELL_AURA_MOD_THREAT (10) percent (e.g. −29 cat, +30 bear, −20 battle). Applied as total threat
  // multiplier when the fighter deals threat.
  threatPct: number;
  // SPELL_AURA_MOD_DAMAGE_PERCENT_TAKEN / MOD_MELEE_DAMAGE_TAKEN_PCT — physical taken %. Cite: live bake
  // Defensive Stance Passive 7376 (−10), Berserker 7381 (+10).
  physicalTakenPct: number;
  // SPELL_AURA_MOD_DAMAGE_PERCENT_DONE — all-school damage done %. Cite: live bake Defensive Stance Passive
  // 7376 (−10).
  damageDonePct: number;
}

const EMPTY_FORM_PACKAGE: FormCombatPackage = {
  baseArmorPct: 0, healthFlat: 0, attackPowerFlat: 0, threatPct: 0,
  physicalTakenPct: 0, damageDonePct: 0,
};

export function formCombatPackage(form: ShapeshiftFormId): FormCombatPackage {
  switch (form) {
    case SHAPESHIFT_FORM.CAT:
      // spell 3025 Cat Form (Passive)
      return { ...EMPTY_FORM_PACKAGE, attackPowerFlat: 40, threatPct: -29 };
    case SHAPESHIFT_FORM.BEAR:
      // spells 1178 + 21178
      return { ...EMPTY_FORM_PACKAGE, baseArmorPct: 180, healthFlat: 20, attackPowerFlat: 30, threatPct: 30 };
    case SHAPESHIFT_FORM.DIREBEAR:
      // spells 9635 + 21178
      return { ...EMPTY_FORM_PACKAGE, baseArmorPct: 360, healthFlat: 600, attackPowerFlat: 120, threatPct: 30 };
    case SHAPESHIFT_FORM.BATTLESTANCE:
      // spell 21156 Battle Stance Passive — threat −20%
      return { ...EMPTY_FORM_PACKAGE, threatPct: -20 };
    case SHAPESHIFT_FORM.DEFENSIVESTANCE:
      // spell 7376 Defensive Stance Passive
      return { ...EMPTY_FORM_PACKAGE, threatPct: 30, physicalTakenPct: -10, damageDonePct: -10 };
    case SHAPESHIFT_FORM.BERSERKERSTANCE:
      // spell 7381 Berserker Stance Passive
      return { ...EMPTY_FORM_PACKAGE, threatPct: -20, physicalTakenPct: 10 };
    case SHAPESHIFT_FORM.MOONKIN:
      // spell 24905 Moonkin Form (Passive) — aura 142 bp 359 → +360% armor
      return { ...EMPTY_FORM_PACKAGE, baseArmorPct: 360 };
    default:
      return EMPTY_FORM_PACKAGE;
  }
}

// The spell each form's threat percentage comes from, so a SPELLMOD naming it finds its subject:
// 21178 carries SpellFamilyFlags 0x2000000. Cite: SpellAuras.cpp:4223–4284 HandleShapeshiftBoosts.
export function formThreatSpellId(form: ShapeshiftFormId): number {
  switch (form) {
    case SHAPESHIFT_FORM.CAT: return 3025;
    case SHAPESHIFT_FORM.BEAR:
    case SHAPESHIFT_FORM.DIREBEAR: return 21178;
    case SHAPESHIFT_FORM.BATTLESTANCE: return 21156;
    case SHAPESHIFT_FORM.DEFENSIVESTANCE: return 7376;
    case SHAPESHIFT_FORM.BERSERKERSTANCE: return 7381;
    default: return 0;
  }
}

// Melee AP delta when entering `form` from humanoid, or the reverse with the sign flipped: the
// package flat AP plus Cat AGI when SHAPESHIFT_FLAG_AGILITY_ATTACK_BONUS.
export function formMeleeApDelta(
  form: ShapeshiftFormId,
  agility: number,
  formAgiAttackBonus: boolean,
): number {
  const pkg = formCombatPackage(form);
  let ap = pkg.attackPowerFlat;
  if (formAgiAttackBonus) ap += Math.max(0, agility | 0);
  return ap;
}

// Armor delta from MOD_BASE_RESISTANCE_PCT applied to pre-form armor. total = base * (1 + pct/100) ⇒ delta
// = floor(base * pct / 100).
export function formArmorDelta(preFormArmor: number, form: ShapeshiftFormId): number {
  const pct = formCombatPackage(form).baseArmorPct;
  if (!pct) return 0;
  return Math.floor(Math.max(0, preFormArmor) * pct / 100);
}

// Form "weapon" min/max when IsAttackSpeedOverridenShapeShift: min(level,60) × 0.85..1.25 × speed
// in seconds. Combined with AP/14×speed via meleeBaseDamage. Cite: StatSystem.cpp ~330.
export function formWeaponDamageMinMax(level: number, speedMs: number): { min: number; max: number } {
  let lvl = level | 0;
  if (lvl > 60) lvl = 60;
  if (lvl < 1) lvl = 1;
  const attSpeed = Math.max(0, speedMs) / 1000;
  return {
    min: lvl * 0.85 * attSpeed,
    max: lvl * 1.25 * attSpeed,
  };
}

// Resolve white-hit weapon damage range for the active form (or gear when not overridden). Pure helper so
// combat does not invent a parallel path.
export function resolveMeleeWeaponDamageRange(
  form: ShapeshiftFormId,
  level: number,
  gearMin: number,
  gearMax: number,
  speedMs: number,
): { min: number; max: number } {
  if (isAttackSpeedOverriddenShapeShift(form)) {
    return formWeaponDamageMinMax(level, speedMs);
  }
  return { min: gearMin, max: gearMax };
}

/** Stance bitmask bit for a form id (SpellEntry.Stances uses 1 << (form-1)). */
export function formStanceMask(form: ShapeshiftFormId): number {
  if (!form) return 0;
  return 1 << (form - 1);
}

// Feline Swiftness Passive 2a — the dodge half of the talent. It carries NO Stances bit in 1.12 spell
// data, so the form gate names it. Cite: SpellMgr.h:1384–1385 (spellInfo->Id == 24864 && FORM_CAT).
export const FELINE_SWIFTNESS_PASSIVE_2A = 24864;

/** Port of CanBeUsedInForm (DBCStructure.h:864–868): Stances has the bit, StancesNot does not. */
export function canBeUsedInForm(spell: SpellDef, form: ShapeshiftFormId): boolean {
  const mask = formStanceMask(form);
  if (!mask) return false;
  return ((spell.stances ?? 0) & mask) !== 0 && ((spell.stancesNot ?? 0) & mask) === 0;
}

// Port of IsNeedCastSpellAtFormApply (SpellMgr.h:1378–1387): a PASSIVE or DO_NOT_DISPLAY spell the
// shapeshift handler casts on form apply, and IsRemovedOnShapeshiftLost strips on leave.
export function isNeedCastSpellAtFormApply(spell: SpellDef, form: ShapeshiftFormId): boolean {
  if (!form) return false;
  if (!spell.passive && !hasAttr(spell, SPELL_ATTR.PASSIVE) && !hasAttr(spell, SPELL_ATTR.DO_NOT_DISPLAY)) return false;
  if (spell.allowWhileNotShapeshifted || hasAttrEx2(spell, SPELL_ATTR_EX2.ALLOW_WHILE_NOT_SHAPESHIFTED)) return false;
  return canBeUsedInForm(spell, form)
    || (spell.id === FELINE_SWIFTNESS_PASSIVE_2A && form === SHAPESHIFT_FORM.CAT);
}

// Whether a PERMANENT passive aura is live in `form`. Stances 0 means learn-time and never removed, so
// a Holy talent keeps working in Shadowform. Cite: Player.cpp:3446 IsNeedCastPassiveLikeSpellAtLearn.
export function passiveAppliesInForm(spell: SpellDef, form: ShapeshiftFormId): boolean {
  if (spell.id === FELINE_SWIFTNESS_PASSIVE_2A) return form === SHAPESHIFT_FORM.CAT;
  if ((spell.stances ?? 0) === 0) return true;
  if (spell.allowWhileNotShapeshifted || hasAttrEx2(spell, SPELL_ATTR_EX2.ALLOW_WHILE_NOT_SHAPESHIFTED)) return true;
  return canBeUsedInForm(spell, form);
}

// Whether this form is a "real" shapeshift that trips NOT_SHAPESHIFT gates: actAsShifted is
// !(flags1 & STANCE). Stealth must not trip it; Ghost Wolf does, so the shaman kit refuses (KI-751).
export function isRealShapeshift(form: ShapeshiftFormId): boolean {
  if (!form) return false;
  // STANCE-flagged forms (actAsShifted = false) — DBC flags1 bit 0x1.
  if (
    form === SHAPESHIFT_FORM.BATTLESTANCE
    || form === SHAPESHIFT_FORM.DEFENSIVESTANCE
    || form === SHAPESHIFT_FORM.BERSERKERSTANCE
    || form === SHAPESHIFT_FORM.STEALTH
    || form === SHAPESHIFT_FORM.MOONKIN
  ) {
    return false;
  }
  return form === SHAPESHIFT_FORM.CAT
    || form === SHAPESHIFT_FORM.TREE
    || form === SHAPESHIFT_FORM.TRAVEL
    || form === SHAPESHIFT_FORM.AQUA
    || form === SHAPESHIFT_FORM.BEAR
    || form === SHAPESHIFT_FORM.DIREBEAR
    || form === SHAPESHIFT_FORM.GHOSTWOLF
    || form === SHAPESHIFT_FORM.SHADOWFORM;
}

export type ShapeshiftCastError = 'ok' | 'not_shapeshift' | 'only_shapeshift';

// Port of GetErrorAtShapeshiftedCast (SpellMgr.cpp:389–431) for our SpellDef fields. Pure classifier —
// resolveFormCast maps not_shapeshift to leave-then-cast.
export function shapeshiftCastError(spell: SpellDef, form: ShapeshiftFormId): ShapeshiftCastError {
  const mask = formStanceMask(form);
  const stances = spell.stances ?? 0;
  const stancesNot = spell.stancesNot ?? 0;

  if (mask && (stancesNot & mask) !== 0) return 'not_shapeshift';
  if (mask && stances !== 0 && (stances & mask) !== 0) return 'ok';

  if (isRealShapeshift(form)) {
    if (spell.notShapeshift || hasAttr(spell, SPELL_ATTR.NOT_SHAPESHIFT)) return 'not_shapeshift';
    if (stances !== 0) return 'only_shapeshift'; // needs a different form
  } else {
    // Humanoid / STANCE forms (Moonkin, warrior stances). Heals use StancesNot 1<<30, not a special case.
    // Cite: SpellMgr.cpp:389–431; spell_template StancesNot on 5185/774/8936/740.
    if (stances !== 0 && !spell.allowWhileNotShapeshifted && !hasAttrEx2(spell, SPELL_ATTR_EX2.ALLOW_WHILE_NOT_SHAPESHIFTED)) return 'only_shapeshift';
  }
  return 'ok';
}

// Resolve whether a cast may proceed under the current form. Product leave-then-cast on not_shapeshift
// (docs/done/druid.md §5); warrior/stealth still refuse.
export function resolveFormCast(
  spell: SpellDef,
  form: ShapeshiftFormId,
): { ok: true; leaveForm: boolean } | { ok: false; reason: string } {
  // Form-enter spells use their own apply path, not stance gates. Stealth effects still honor
  // Stances/NOT_SHAPESHIFT — Prowl 5215 is Cat-only, while rogue Stealth has no stances req.
  if (isFormSpell(spell)) {
    return { ok: true, leaveForm: false };
  }
  const err = shapeshiftCastError(spell, form);
  if (err === 'ok') return { ok: true, leaveForm: false };
  if (err === 'not_shapeshift') {
    if (isWarriorStance(form) || isStealthShapeshift(form)) {
      const label = form ? (FORM_LABEL[form] || 'form') : 'form';
      return { ok: false, reason: `Not while in ${label}` };
    }
    return { ok: true, leaveForm: true };
  }
  // only_shapeshift — need a specific form (or any form when humanoid).
  return { ok: false, reason: formRequirementLabel(spell) };
}

// Keyed on the stances bitmask, not the spell: a UI reason string built inside the combat pick
// path on every failed form check, where Object.entries(FORM_LABEL) was 1.2% of a tick profile.
const formLabelByStances = new Map<number, string>();

/** Best-effort reason string from stances bits. */
export function formRequirementLabel(spell: SpellDef): string {
  const stances = spell.stances ?? 0;
  if (!stances) return 'Must be shapeshifted';
  const cached = formLabelByStances.get(stances);
  if (cached !== undefined) return cached;
  const built = buildFormRequirementLabel(stances);
  formLabelByStances.set(stances, built);
  return built;
}

function buildFormRequirementLabel(stances: number): string {
  const names: string[] = [];
  for (const [id, label] of Object.entries(FORM_LABEL)) {
    const f = Number(id);
    if (!f || !label) continue;
    if ((stances & formStanceMask(f)) !== 0) names.push(label);
  }
  if (names.length === 1) return `Must be in ${names[0]}`;
  if (names.length > 1) return `Must be in ${names.join(' or ')}`;
  return 'Must be shapeshifted';
}

// SPELL_AURA_MOD_SHAPESHIFT — form/stance aura on spell_template EffectApplyAuraName. Cite: SpellAuras.cpp
// HandleAuraModShapeshift; SharedDefines SpellAuraNames 36.
const AURA_MOD_SHAPESHIFT = 36;

// True if this spell is a shapeshift form or stance ability. The live bake often leaves effects[]
// empty for form rows, so MOD_SHAPESHIFT is only in rawEffects until resolveCombatSpell maps it.
const formSpellMemo = new WeakMap<SpellDef, boolean>();
export function isFormSpell(spell: SpellDef): boolean {
  const hit = formSpellMemo.get(spell);
  if (hit !== undefined) return hit;
  const v = spell.role === 'form'
    || spell.effects.some((e) => e.kind === 'shapeshift')
    || (spell.rawEffects ?? []).some((re) => (re.auraName | 0) === AURA_MOD_SHAPESHIFT);
  formSpellMemo.set(spell, v);
  return v;
}

// Cat / Bear / Dire Bear zero the power pool on entering, whatever the previous type was, and then roll
// Furor. Cite: SpellAuras.cpp:1959-1970 SetPower(POWER_ENERGY|POWER_RAGE, 0).
export function formZerosPoolOnEnter(form: ShapeshiftFormId): boolean {
  return form === SHAPESHIFT_FORM.CAT
    || form === SHAPESHIFT_FORM.BEAR
    || form === SHAPESHIFT_FORM.DIREBEAR;
}

// Shifting into one of these strips root and snare. Cite: SpellAuras.cpp:1803-1841 HandleAuraModShapeshift
// - RemoveSpellsCausingAura(MOD_ROOT) plus the MOD_DECREASE_SPEED walk.
export function formBreaksRootAndSlow(form: ShapeshiftFormId): boolean {
  return form === SHAPESHIFT_FORM.CAT
    || form === SHAPESHIFT_FORM.TREE
    || form === SHAPESHIFT_FORM.TRAVEL
    || form === SHAPESHIFT_FORM.AQUA
    || form === SHAPESHIFT_FORM.BEAR
    || form === SHAPESHIFT_FORM.DIREBEAR
    || form === SHAPESHIFT_FORM.MOONKIN;
}

// Travel-only shapeshifts. The combat kit is notShapeshift, so a recast toggles off and the kit
// fires. Moonkin is STANCE-flagged and Balance nukes are legal in it — not a travel form.
export function isMobilityTravelForm(form: ShapeshiftFormId): boolean {
  return form === SHAPESHIFT_FORM.TRAVEL
    || form === SHAPESHIFT_FORM.AQUA
    || form === SHAPESHIFT_FORM.GHOSTWOLF;
}

/** spell_template ids: Travel Form 783, Aquatic Form 1066, Ghost Wolf 2645. */
export const MOBILITY_FORM_SPELL_IDS: ReadonlySet<number> = new Set([783, 1066, 2645]);

export function isMobilityFormSpellId(spellId: number): boolean {
  return MOBILITY_FORM_SPELL_IDS.has(spellId | 0);
}

/** Kit spell that entered `form` — recast toggles it off (Classic). */
export function formToggleSpell(
  spells: readonly SpellDef[],
  form: ShapeshiftFormId,
): SpellDef | undefined {
  if (!form) return undefined;
  return spells.find((s) => isFormSpell(s) && formIdFromSpell(s) === form);
}

/** Extract the form id from a form spell, or 0. */
export function formIdFromSpell(spell: SpellDef): ShapeshiftFormId {
  for (const e of spell.effects) {
    if (e.kind === 'shapeshift') return e.form;
  }
  // Live bake often leaves effects[] empty for form rows; MOD_SHAPESHIFT lives in rawEffects.
  // Cite: isFormSpell / enrich-druid-forms — same AURA_MOD_SHAPESHIFT = 36 path.
  for (const re of spell.rawEffects ?? []) {
    if ((re.auraName | 0) === AURA_MOD_SHAPESHIFT) return ((re.miscValue ?? 0) | 0) as ShapeshiftFormId;
  }
  return 0;
}

// Spell power cost, resolving ManaCostPercentage against the right create base: health, mana, or
// max power. Flat `cost` is spell_template.ManaCost only. Cite: Spell.cpp CalculatePowerCost.
export function resolveSpellCost(
  spell: SpellDef,
  createMana: number,
  createHealth = 0,
  casterLevel = 0,
): number {
  // Flat ManaCost first; percentage ADDS (only Bone Armor 16431 has both in Classic).
  let powerCost = spell.cost | 0;
  // ManaCostPerlevel × (rank/5 − baseLevel), rank = caster level capped at maxLevel×5. Ahead of the
  // percentage, as in the C++. Cite: Spell.cpp:6332; Unit.cpp:11855-11861 GetSpellRank.
  const perLevel = (spell.costPerLevel ?? 0) | 0;
  if (perLevel && casterLevel > 0) {
    const cap = (spell.maxLevel ?? 0) | 0;
    const rank = cap > 0 ? Math.min(casterLevel | 0, cap * 5) : (casterLevel | 0);
    powerCost += perLevel * (Math.trunc(rank / 5) - ((spell.baseLevel ?? 0) | 0));
  }
  const pct = (spell.costPct ?? 0) | 0;
  if (pct > 0) {
    const base = spell.powerType === 'health' ? createHealth : createMana;
    // C++ integer division: ManaCostPercentage * GetCreateMana() / 100
    powerCost += Math.floor((base * pct) / 100);
  }
  return Math.max(0, powerCost);
}

// Whether the character class keeps a parallel mana pool under form (Druid). Other classes: single power
// bar only.
export function classHasParallelMana(cls: number): boolean {
  // CLASS.DRUID = 11 (schema) — avoid circular import; keep numeric here with comment.
  return cls === 11;
}

// Classic Battle Stance ability (spell_template Id 2457). Cite: Spell.sql / SpellAuras MOD_SHAPESHIFT form
// 17; create-info starter for warriors.
export const BATTLE_STANCE_SPELL = 2457;

// Default form for a class that must not stand formless: a warrior with Battle Stance known and
// no form gets FORM_BATTLESTANCE. Never overrides an active form. Cite: Player create learns 2457.
export function defaultFormForClass(
  cls: number,
  form: ShapeshiftFormId | undefined,
  knownSpellIds: ReadonlyArray<number>,
): ShapeshiftFormId | undefined {
  if (((form ?? 0) | 0) !== 0) return form;
  // CLASS.WARRIOR = 1 (schema) — numeric to match classHasParallelMana import style.
  if (cls === 1 && knownSpellIds.includes(BATTLE_STANCE_SPELL)) {
    return SHAPESHIFT_FORM.BATTLESTANCE;
  }
  return form;
}

// CreatureDisplayInfo id the client shows while in a form. Alliance/Horde split is the Night Elf
// vs Tauren model. Cite: SpellAuras.cpp:1726-1795 HandleAuraModShapeshift displayId switch.
const FORM_DISPLAY_ALLIANCE: Record<number, number> = {
  [SHAPESHIFT_FORM.CAT]: 892,
  [SHAPESHIFT_FORM.TRAVEL]: 632,
  [SHAPESHIFT_FORM.AQUA]: 2428,
  [SHAPESHIFT_FORM.BEAR]: 2281,
  [SHAPESHIFT_FORM.DIREBEAR]: 2281,
  [SHAPESHIFT_FORM.GHOSTWOLF]: 4613,
  [SHAPESHIFT_FORM.MOONKIN]: 15374,
  [SHAPESHIFT_FORM.TREE]: 864,
};
const FORM_DISPLAY_HORDE: Record<number, number> = {
  ...FORM_DISPLAY_ALLIANCE,
  [SHAPESHIFT_FORM.CAT]: 8571,
  [SHAPESHIFT_FORM.BEAR]: 2289,
  [SHAPESHIFT_FORM.DIREBEAR]: 2289,
  [SHAPESHIFT_FORM.MOONKIN]: 15375,
};

/** 0 when the form keeps the player's own model (stances, Stealth, Shadowform, Ambient). */
export function formDisplayId(form: ShapeshiftFormId, faction: 'alliance' | 'horde' | undefined): number {
  const table = faction === 'horde' ? FORM_DISPLAY_HORDE : FORM_DISPLAY_ALLIANCE;
  return table[form | 0] ?? 0;
}
