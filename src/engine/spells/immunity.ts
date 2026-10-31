// Aura-granted immunities: pure predicates plus apply and purge helpers, composing template masks with
// aura masks. Creature-template masks themselves stay in domain/creature/creatureAi.ts.

import type { Mechanic, School } from '../../data/schema.ts';
import { CREATURE_TYPE } from '../../data/schema.ts';
import {
  isMechanicImmune as isTemplateMechanicImmune,
  isSchoolImmune as isTemplateSchoolImmune,
  MECHANIC_ID,
  SCHOOL_INDEX,
} from '../../domain/creature/creatureAi.ts';
import { SCHOOL_MASK } from './procs.ts';

// AuraType ids (SpellAuraDefines.h) — immunity family

export const AURA_TYPE = {
  EFFECT_IMMUNITY: 37,
  STATE_IMMUNITY: 38,
  SCHOOL_IMMUNITY: 39,
  DAMAGE_IMMUNITY: 40,
  DISPEL_IMMUNITY: 41,
  MECHANIC_IMMUNITY: 77,
  MOD_UNATTACKABLE: 93,
  MECHANIC_IMMUNITY_MASK: 147,
} as const;

// SharedDefines Mechanics — ids used beyond Phonecraft's MECHANIC_ID map

/** SharedDefines.h Mechanics (1-based). */
/** SharedDefines.h Mechanics — full 1..30 set used by bake + immunity. Cite: :351–384. */
export const MECHANIC = {
  CHARM: 1,
  DISORIENTED: 2,
  DISARM: 3,
  DISTRACT: 4,
  FEAR: 5,
  FUMBLE: 6,
  ROOT: 7,
  PACIFY: 8,
  SILENCE: 9,
  SLEEP: 10,
  SNARE: 11,
  STUN: 12,
  FREEZE: 13,
  KNOCKOUT: 14,
  /** Stoneform (20594 → boost 20612 aura 77 misc 15) purges bleeds. Cite: SharedDefines.h MECHANIC_BLEED = 15. */
  BLEED: 15,
  BANDAGE: 16,
  POLYMORPH: 17,
  BANISH: 18,
  SHIELD: 19,
  SHACKLE: 20,
  MOUNT: 21,
  PERSUADE: 22,
  TURN: 23,
  HORROR: 24,
  INVULNERABILITY: 25,
  INTERRUPT: 26,
  DAZE: 27,
  DISCOVERY: 28,
  IMMUNE_SHIELD: 29, // Divine Shield / Ice Block class — SpellMgr.h CanPierceImmuneAura
  SAPPED: 30,
} as const;

/** Classic Bestial Wrath spell id. Cite: SpellAuras.cpp ~5599 case 19574. */
export const BESTIAL_WRATH_SPELL_ID = 19574;

/** SpellSchoolMask ALL = NORMAL | MAGIC = 0x7F. Cite: SharedDefines.h SPELL_SCHOOL_MASK_ALL ~196. */
export const SPELL_SCHOOL_MASK_ALL =
  SCHOOL_MASK.NORMAL |
  SCHOOL_MASK.HOLY |
  SCHOOL_MASK.FIRE |
  SCHOOL_MASK.NATURE |
  SCHOOL_MASK.FROST |
  SCHOOL_MASK.SHADOW |
  SCHOOL_MASK.ARCANE;

// Classic Banish's target creature types, demon and elemental, as the bitfield CheckTargetCreatureType
// reads. Cite: SharedDefines CREATURE_TYPE_DEMON = 3, ELEMENTAL = 4.
export const BANISH_TARGET_CREATURE_TYPE_MASK =
  (1 << (CREATURE_TYPE.DEMON - 1)) | (1 << (CREATURE_TYPE.ELEMENTAL - 1));

// Free Action–class root+stun mask (SharedDefines IMMUNE_TO_ROOT_AND_STUN_MASK). Free Action Potion also
// covers snare via separate mechanic immunities.
export const IMMUNE_TO_ROOT_AND_STUN_MASK =
  (1 << (MECHANIC.ROOT - 1)) | (1 << (MECHANIC.STUN - 1));

export const IMMUNE_TO_ROOT_AND_SNARE_MASK =
  (1 << (MECHANIC.ROOT - 1)) | (1 << (MECHANIC.SNARE - 1));

// Active aura model

// One live immunity-granting aura, its fields mapping to the C++ modifier and spell attributes.
// Duration is the caller's job — the fields exist so a pure test can assert one without timers.
export interface ImmunityAura {
  spellId: number;
  /** AuraType: 37–41, 77, 93, 147. */
  auraType: number;
  // School mask for SCHOOL_IMMUNITY (39) / DAMAGE_IMMUNITY (40). Divine Shield / Ice Block / Banish
  // typically use SPELL_SCHOOL_MASK_ALL.
  schoolMask?: number;
  /** Single mechanic id (1-based) for MECHANIC_IMMUNITY (77). Cite: HandleModMechanicImmunity miscvalue. */
  mechanic?: number;
  // Mechanic bit mask for MECHANIC_IMMUNITY_MASK (147), or derived from single-mechanic as (1 << (mechanic
  // - 1)).
  mechanicMask?: number;
  /** DispelType for DISPEL_IMMUNITY (41). */
  dispelType?: number;
  /** SpellEffects id for EFFECT_IMMUNITY (37). */
  effectId?: number;
  /** AuraType id for STATE_IMMUNITY (38). */
  stateAuraType?: number;
  // The immunity SPELL's own mechanic, not the purged auras': banish isolates the unit, while the
  // shield and invulnerability mechanics mark the Divine Shield pierce rules.
  spellMechanic?: number;
  // Positive immunity (Divine Shield) vs debuff immunity (Banish). School purge only runs for positive
  // immunities (HandleAuraModSchoolImmunity + IsPositiveSpell).
  positive?: boolean;
  // SPELL_ATTR_EX_IMMUNITY_PURGES_EFFECT (0x8000). When true, applying this aura removes matching existing
  // auras.
  immunityPurgesEffect?: boolean;
  /** Duration snapshot (ms) — expiry is the caller's job. */
  durationMs?: number;
  /** Absolute expiry timestamp (ms). */
  expiresAt?: number;
  /** SpellEntry.procCharges when this immunity is a charged ward (Fear Ward). */
  charges?: number;
}

/** Removable live aura used only for the apply-time purge pass. */
export interface RemovableAura {
  spellId: number;
  /** GetSpellSchoolMask — bitfield. */
  schoolMask: number;
  // Spell + effect mechanic bits: HasMechanicMask uses (1 << (mech - 1)). Cite: Unit.cpp
  // RemoveAurasAtMechanicImmunity.
  mechanicMask?: number;
  /** SpellEntry.Dispel. */
  dispelType?: number;
  /** IsPositive on the holder. */
  positive?: boolean;
  /** SPELL_ATTR_NO_IMMUNITIES — skip purge. */
  noImmunities?: boolean;
  /** SPELL_ATTR_EX2_NO_SCHOOL_IMMUNITIES — skip purge by school immunity. */
  noSchoolImmunities?: boolean;
  /** EffectApplyAuraName values present (state-immunity purge). */
  auraTypes?: number[];
}

// Aggregated immunity state on a unit. Template masks are passed separately to compose helpers so
// creature_template path stays owned by creatureAi.ts.
export interface ImmunityState {
  auras: ImmunityAura[];
  /** OR of school-immunity (39) masks. */
  schoolImmuneMask: number;
  /** OR of damage-immunity (40) masks. */
  damageImmuneMask: number;
  /** OR of mechanic bits (1 << (id - 1)) from auras 77/147. */
  mechanicImmuneMask: number;
  /** OR of (1 << dispelType) from aura 41. */
  dispelImmuneMask: number;
  /** Effect ids from aura 37 (set membership via bit if id < 32, else list). */
  effectImmuneIds: number[];
  /** AuraType ids from aura 38. */
  stateImmuneIds: number[];
  // UNIT_STAT_ISOLATED — set when a live school-immunity aura has spellMechanic === MECHANIC.BANISH
  // (HandleAuraModSchoolImmunity ~3025–3030).
  isolated: boolean;
  /** UNIT_FLAG_UNTARGETABLE — MOD_UNATTACKABLE (93) live count > 0 (HandleModUnattackable ~4454). */
  untargetable: boolean;
}

export function emptyImmunityState(): ImmunityState {
  return {
    auras: [],
    schoolImmuneMask: 0,
    damageImmuneMask: 0,
    mechanicImmuneMask: 0,
    dispelImmuneMask: 0,
    effectImmuneIds: [],
    stateImmuneIds: [],
    isolated: false,
    untargetable: false,
  };
}

// Mask helpers

/** (1 << (mechanicId - 1)) for 1-based Mechanics ids. */
export function mechanicBit(mechanicId: number): number {
  if (mechanicId <= 0) return 0;
  return 1 << (mechanicId - 1);
}

// The Bestial Wrath CC-immunity mechanic mask, sourced as the union of the parent's stun immunity and
// its four scripted boosts. Mechanic bits only — not a school mask. Cite: SpellAuras.cpp:5598-5605.
export const BESTIAL_WRATH_CC_MECHANIC_MASK =
  mechanicBit(MECHANIC.CHARM) |
  mechanicBit(MECHANIC.DISORIENTED) |
  mechanicBit(MECHANIC.FEAR) |
  mechanicBit(MECHANIC.ROOT) |
  mechanicBit(MECHANIC.SLEEP) |
  mechanicBit(MECHANIC.SNARE) |
  mechanicBit(MECHANIC.STUN) |
  mechanicBit(MECHANIC.FREEZE) |
  mechanicBit(MECHANIC.KNOCKOUT) |
  mechanicBit(MECHANIC.POLYMORPH) |
  mechanicBit(MECHANIC.HORROR);

// Build a MECHANIC_IMMUNITY_MASK (147) aura for a CC-immunity buff rider. Default mask is Bestial Wrath's
// sourced set; callers may pass a narrower mask (e.g. Free Action root+stun) for fixtures.
export function makeCcImmunityAura(
  spellId: number,
  opts: {
    mechanicMask?: number;
    durationMs?: number;
    expiresAt?: number;
    positive?: boolean;
    immunityPurgesEffect?: boolean;
  } = {},
): ImmunityAura {
  return {
    spellId,
    auraType: AURA_TYPE.MECHANIC_IMMUNITY_MASK,
    mechanicMask: opts.mechanicMask ?? BESTIAL_WRATH_CC_MECHANIC_MASK,
    positive: opts.positive !== false,
    immunityPurgesEffect: opts.immunityPurgesEffect !== false,
    durationMs: opts.durationMs,
    expiresAt: opts.expiresAt,
  };
}

// CC-immunity rider mask for a spell id, when the bake omits scripted boost immunities. Bestial Wrath
// (19574) is the only current host; returns 0 for unknown ids.
export function ccImmunityRiderMaskForSpell(spellId: number): number {
  if (spellId === BESTIAL_WRATH_SPELL_ID) return BESTIAL_WRATH_CC_MECHANIC_MASK;
  return 0;
}

/** Dwarf Stoneform. Cite: SpellAuras.cpp:5577 `case 20594: boostSpells.push_back(20612)`. */
export const STONEFORM_SPELL_ID = 20594;
/** Stoneform's boost spell — carries the bleed + disease halves of the racial. */
export const STONEFORM_BOOST_SPELL_ID = 20612;

// Immunity auras a spell's scripted BOOST spells grant, which the bake cannot supply because the boost
// id is in no spell list. Stoneform's disease and bleed immunities are only reachable here.
export function immunityBoostAurasForSpell(spellId: number, durationMs: number): ImmunityAura[] {
  if (spellId !== STONEFORM_SPELL_ID) return [];
  return [
    {
      spellId: STONEFORM_BOOST_SPELL_ID,
      auraType: AURA_TYPE.MECHANIC_IMMUNITY,
      mechanic: MECHANIC.BLEED,
      positive: true,
      immunityPurgesEffect: true,
      durationMs,
    },
    {
      spellId: STONEFORM_BOOST_SPELL_ID,
      auraType: AURA_TYPE.DISPEL_IMMUNITY,
      dispelType: DISPEL_TYPE_DISEASE,
      positive: true,
      immunityPurgesEffect: true,
      durationMs,
    },
  ];
}

/** SharedDefines.h DispelType DISPEL_DISEASE = 3. */
const DISPEL_TYPE_DISEASE = 3;

/** Resolve Phonecraft Mechanic name → 1-based id via MECHANIC_ID / MECHANIC. */
export function mechanicIdFromName(mechanic: Mechanic | string | undefined | null): number {
  if (!mechanic || mechanic === 'none') return 0;
  const fromMap = MECHANIC_ID[mechanic as Mechanic];
  if (fromMap != null && fromMap > 0) return fromMap;
  // Accept numeric strings / legacy aliases.
  if (mechanic === 'sapped') return MECHANIC.SAPPED;
  if (mechanic === 'banish') return MECHANIC.BANISH;
  const asNum = Number(mechanic);
  if (Number.isFinite(asNum) && asNum > 0) return asNum | 0;
  return 0;
}

/** School name → SpellSchoolMask bit (SharedDefines). */
export function schoolMaskFromSchoolName(school: School | string | undefined | null): number {
  if (!school) return 0;
  const idx = SCHOOL_INDEX[school as School];
  if (idx == null) return 0;
  return 1 << idx;
}

function rebuildAggregates(auras: readonly ImmunityAura[]): Omit<ImmunityState, 'auras'> {
  let schoolImmuneMask = 0;
  let damageImmuneMask = 0;
  let mechanicImmuneMask = 0;
  let dispelImmuneMask = 0;
  const effectImmuneIds: number[] = [];
  const stateImmuneIds: number[] = [];
  let isolated = false;
  let untargetable = false;

  for (const a of auras) {
    switch (a.auraType) {
      case AURA_TYPE.SCHOOL_IMMUNITY:
        schoolImmuneMask |= a.schoolMask ?? 0;
        if (a.spellMechanic === MECHANIC.BANISH) isolated = true;
        break;
      case AURA_TYPE.DAMAGE_IMMUNITY:
        damageImmuneMask |= a.schoolMask ?? 0;
        break;
      case AURA_TYPE.MECHANIC_IMMUNITY: {
        const bit = a.mechanicMask ?? mechanicBit(a.mechanic ?? 0);
        mechanicImmuneMask |= bit;
        break;
      }
      case AURA_TYPE.MECHANIC_IMMUNITY_MASK:
        mechanicImmuneMask |= a.mechanicMask ?? 0;
        break;
      case AURA_TYPE.DISPEL_IMMUNITY:
        if (a.dispelType != null && a.dispelType > 0) {
          dispelImmuneMask |= 1 << a.dispelType;
        }
        break;
      case AURA_TYPE.EFFECT_IMMUNITY:
        if (a.effectId != null) effectImmuneIds.push(a.effectId);
        break;
      case AURA_TYPE.STATE_IMMUNITY:
        if (a.stateAuraType != null) stateImmuneIds.push(a.stateAuraType);
        break;
      case AURA_TYPE.MOD_UNATTACKABLE:
        untargetable = true;
        break;
      default:
        break;
    }
  }

  return {
    schoolImmuneMask,
    damageImmuneMask,
    mechanicImmuneMask,
    dispelImmuneMask,
    effectImmuneIds,
    stateImmuneIds,
    isolated,
    untargetable,
  };
}

// Apply-time purge (SPELL_ATTR_EX_IMMUNITY_PURGES_EFFECT)

// Which existing auras a newly applied immunity removes: a school immunity purges matching negative
// auras, a mechanic one its mask, a dispel one its type, and a state one that aura type.
export function aurasRemovedByImmunityApply(
  incoming: ImmunityAura,
  existing: readonly RemovableAura[],
): RemovableAura[] {
  if (!incoming.immunityPurgesEffect) return [];

  const out: RemovableAura[] = [];
  const seen = new Set<number>(); // spellId once (RemoveAurasDueToSpell)

  const take = (a: RemovableAura): void => {
    if (a.spellId === incoming.spellId) return;
    if (a.noImmunities) return;
    if (seen.has(a.spellId)) return;
    seen.add(a.spellId);
    out.push(a);
  };

  switch (incoming.auraType) {
    case AURA_TYPE.SCHOOL_IMMUNITY: {
      // Only positive school immunities purge (Divine Shield class, not Banish).
      if (!incoming.positive) break;
      const mask = incoming.schoolMask ?? 0;
      if (!mask) break;
      for (const a of existing) {
        if (a.positive) continue; // Don't remove positive spells
        if (a.noSchoolImmunities) continue; // NO_SCHOOL_IMMUNITIES skips purge by school immunity
        if ((a.schoolMask & mask) !== 0) take(a);
      }
      break;
    }
    case AURA_TYPE.MECHANIC_IMMUNITY:
    case AURA_TYPE.MECHANIC_IMMUNITY_MASK: {
      const mechMask =
        incoming.mechanicMask ??
        mechanicBit(incoming.mechanic ?? 0);
      if (!mechMask) break;
      for (const a of existing) {
        if (((a.mechanicMask ?? 0) & mechMask) !== 0) take(a);
      }
      break;
    }
    case AURA_TYPE.DISPEL_IMMUNITY: {
      const dt = incoming.dispelType;
      if (dt == null || dt <= 0) break;
      for (const a of existing) {
        if (a.dispelType === dt) take(a);
      }
      break;
    }
    case AURA_TYPE.STATE_IMMUNITY: {
      const st = incoming.stateAuraType;
      if (st == null) break;
      for (const a of existing) {
        if (a.auraTypes?.includes(st)) take(a);
      }
      break;
    }
    default:
      break;
  }

  return out;
}

export interface ApplyImmunityResult {
  state: ImmunityState;
  /** Auras purged by SPELL_ATTR_EX_IMMUNITY_PURGES_EFFECT (spellId list). */
  removedSpellIds: number[];
}

// True when two entries are the same effect-holder, a refresh of one multi-effect slot: Divine
// Protection applies two school-immunity holders under one id, and replacing by id drops the first.
function isSameImmunityEffect(a: ImmunityAura, b: ImmunityAura): boolean {
  if (a.spellId !== b.spellId || a.auraType !== b.auraType) return false;
  switch (a.auraType) {
    case AURA_TYPE.SCHOOL_IMMUNITY:
    case AURA_TYPE.DAMAGE_IMMUNITY:
      return (a.schoolMask ?? 0) === (b.schoolMask ?? 0);
    case AURA_TYPE.MECHANIC_IMMUNITY:
      return (a.mechanic ?? 0) === (b.mechanic ?? 0)
        && (a.mechanicMask ?? 0) === (b.mechanicMask ?? 0);
    case AURA_TYPE.MECHANIC_IMMUNITY_MASK:
      return (a.mechanicMask ?? 0) === (b.mechanicMask ?? 0);
    case AURA_TYPE.DISPEL_IMMUNITY:
      return (a.dispelType ?? 0) === (b.dispelType ?? 0);
    case AURA_TYPE.EFFECT_IMMUNITY:
      return (a.effectId ?? 0) === (b.effectId ?? 0);
    case AURA_TYPE.STATE_IMMUNITY:
      return (a.stateAuraType ?? 0) === (b.stateAuraType ?? 0);
    default:
      return true;
  }
}

// Apply an immunity aura, folding it into the state and returning the purged spell ids for the caller
// to delete. Multi-effect auras under one id stay separate holders and are OR'd in the aggregate.
export function applyImmunityAura(
  state: ImmunityState,
  aura: ImmunityAura,
  existingAuras: readonly RemovableAura[] = [],
): ApplyImmunityResult {
  const removed = aurasRemovedByImmunityApply(aura, existingAuras);
  const removedSpellIds = removed.map((a) => a.spellId);

  // Refresh only the matching effect holder; keep sibling multi-effect auras.
  const auras = state.auras.filter((a) => !isSameImmunityEffect(a, aura));
  auras.push(aura);

  const next: ImmunityState = {
    auras,
    ...rebuildAggregates(auras),
  };
  return { state: next, removedSpellIds };
}

/** Remove one immunity aura by spellId (aura expires / cancelled). */
export function removeImmunityAura(state: ImmunityState, spellId: number): ImmunityState {
  const auras = state.auras.filter((a) => a.spellId !== spellId);
  return { auras, ...rebuildAggregates(auras) };
}

// Compose: template mask OR aura mask

export interface TemplateImmuneMasks {
  schoolImmuneMask?: number | null;
  mechanicImmuneMask?: number | null;
  /** CMaNGOS CreatureType. Totems (11) immune to negative auras. Cite: Totem.cpp:282–287. */
  creatureType?: number | null;
  // The creature's own immunity set, applied at spawn. The C++ pushes these into the same lists the
  // auras use, so every test below ORs the two halves. Cite: Creature.cpp:613, :2412-2431.
  immunities?: CreatureImmunitySet | null;
}

/** The baked half of m_spellImmune — see schema CreatureImmunities. */
export interface CreatureImmunitySet {
  /** IMMUNITY_EFFECT (0) — SpellEffect ids. */
  effects?: readonly number[];
  /** IMMUNITY_STATE (1) — AuraType ids. */
  states?: readonly number[];
  /** IMMUNITY_DISPEL (4) — OR of `1 << DispelType`. */
  dispelMask?: number;
}

/** SharedDefines.h CREATURE_TYPE_TOTEM = 11. Cite: domain/spells/totem.ts creatureType. */
export const CREATURE_TYPE_TOTEM = 11;

export function isTotemCreatureType(creatureType: number | undefined | null): boolean {
  return ((creatureType ?? 0) | 0) === CREATURE_TYPE_TOTEM;
}

// Totem.cpp:282-287: a non-positive `IsAuraApplyEffect` index is immune; other effects still apply. Callers
// OR `isTotemSide` (this file does not import Side).
export function totemRefusesNegativeAuraApply(
  creatureType: number | undefined | null,
  hostileAura: boolean,
): boolean {
  return hostileAura && isTotemCreatureType(creatureType);
}

/** SPELL_EFFECT_APPLY_AURA. Cite: SpellEffectDefines.h 6. */
const SPELL_EFFECT_APPLY_AURA = 6;

// Hostile aura payload (snare / root / CC / DoT / APPLY_AURA). Totems eat these; school damage and weapon
// hits still land. Cite: Totem.cpp:282–287 IsAuraApplyEffect.
export function spellAppliesHostileAura(spell: {
  effects?: ReadonlyArray<{ kind: string; hostile?: boolean; pct?: number }>;
  rawEffects?: ReadonlyArray<{ effect?: number }>;
}): boolean {
  for (const e of spell.effects ?? []) {
    if (e.kind === 'cc' || e.kind === 'root' || e.kind === 'dot') return true;
    if (e.kind === 'speed' && (e.hostile === true || (e.hostile !== false && (e.pct ?? 0) < 0))) {
      return true;
    }
  }
  for (const r of spell.rawEffects ?? []) {
    if (((r.effect ?? 0) | 0) === SPELL_EFFECT_APPLY_AURA) return true;
  }
  return false;
}

/** SPELL_EFFECT_SCHOOL_DAMAGE / WEAPON_PERCENT / WEAPON_DAMAGE / NORMALIZED. */
function spellHasDirectHit(spell: {
  effects?: ReadonlyArray<{ kind: string }>;
  rawEffects?: ReadonlyArray<{ effect?: number }>;
}): boolean {
  for (const e of spell.effects ?? []) {
    if (e.kind === 'direct_damage' || e.kind === 'weapon_percent_damage') return true;
  }
  for (const r of spell.rawEffects ?? []) {
    const ef = (r.effect ?? 0) | 0;
    if (ef === 2 || ef === 17 || ef === 58 || ef === 121) return true;
  }
  return false;
}

// An aura-only hostile (Concussive Shot, Fear, Serpent Sting) with no weapon or school hit. Kept
// module-internal on purpose: the public answer is `isAbilityIneffectiveOnTarget`.
function spellIsHostileAuraOnly(spell: {
  effects?: ReadonlyArray<{ kind: string; hostile?: boolean; pct?: number }>;
  rawEffects?: ReadonlyArray<{ effect?: number }>;
  strikeBonus?: unknown;
  onNextSwing?: boolean;
  role?: string | null;
}): boolean {
  if (spell.strikeBonus || spell.onNextSwing) return false;
  if (spellHasDirectHit(spell)) return false;
  return spellAppliesHostileAura(spell);
}

// School immunity: creature_template schoolImmuneMask OR aura SCHOOL_IMMUNITY. Re-uses isSchoolImmune for
// the template half (creature-mask path untouched).
export function isImmuneToSchool(
  state: ImmunityState,
  school: School | string,
  template?: TemplateImmuneMasks | null,
): boolean {
  if (isTemplateSchoolImmune(template?.schoolImmuneMask, school as School)) return true;
  const bit = schoolMaskFromSchoolName(school);
  if (!bit) return false;
  return (state.schoolImmuneMask & bit) !== 0;
}

// Mechanic immunity: template mechanicImmuneMask OR aura 77/147. Re-uses isMechanicImmune for the template
// half.
export function isImmuneToMechanic(
  state: ImmunityState,
  mechanic: Mechanic | string | undefined | null,
  template?: TemplateImmuneMasks | null,
): boolean {
  if (isTemplateMechanicImmune(template?.mechanicImmuneMask, mechanic as Mechanic)) {
    return true;
  }
  const id = mechanicIdFromName(mechanic);
  if (id <= 0) return false;
  return (state.mechanicImmuneMask & mechanicBit(id)) !== 0;
}

// The same test by 1-based mechanic id, for effects whose baked shape carries no mechanic name and
// must read it off the DBC row. Cite: Creature.cpp:1997-2001 IsImmuneToSpellEffect.
export function isImmuneToMechanicId(
  state: ImmunityState,
  mechanicId: number,
  template?: TemplateImmuneMasks | null,
): boolean {
  const id = mechanicId | 0;
  if (id <= 0) return false;
  const bit = mechanicBit(id);
  if (((template?.mechanicImmuneMask ?? 0) & bit) !== 0) return true;
  return (state.mechanicImmuneMask & bit) !== 0;
}

// Damage immunity: school-immunity OR damage-immunity masks (Unit::IsImmuneToDamage). Template school mask
// also blocks damage of that school (existing combat path).
export function isImmuneToDamage(
  state: ImmunityState,
  school: School | string,
  template?: TemplateImmuneMasks | null,
  noSchoolImmunities?: boolean,
): boolean {
  const bit = schoolMaskFromSchoolName(school);
  if (isImmuneToDamageMask(state, bit || 0, template, noSchoolImmunities)) return true;
  return false;
}

/** Bit-mask form of isImmuneToDamage (for multi-school queries). */
function isImmuneToDamageMask(
  state: ImmunityState,
  schoolMask: number,
  template?: TemplateImmuneMasks | null,
  noSchoolImmunities?: boolean,
): boolean {
  if (!schoolMask) return false;

  // DAMAGE_IMMUNITY blocks regardless of NO_SCHOOL_IMMUNITIES.
  if ((state.damageImmuneMask & schoolMask) !== 0) return true;

  // Template school immunity blocks regardless of NO_SCHOOL_IMMUNITIES (spellInfo is null).
  if (template?.schoolImmuneMask && (template.schoolImmuneMask & schoolMask) !== 0) {
    return true;
  }

  // Any overlapping school bit that is immune → immune to that damage packet.
  // Matches C++: itr.type & schoolMask.
  if ((state.schoolImmuneMask & schoolMask) !== 0) {
    if (noSchoolImmunities) {
      const unpierceable = state.auras.some(
        (a) =>
          a.auraType === AURA_TYPE.SCHOOL_IMMUNITY &&
          ((a.schoolMask ?? 0) & schoolMask) !== 0 &&
          (a.spellMechanic === MECHANIC.IMMUNE_SHIELD ||
            a.spellMechanic === MECHANIC.INVULNERABILITY ||
            a.spellMechanic === MECHANIC.BANISH),
      );
      if (!unpierceable) return false;
    }
    return true;
  }

  return false;
}

/** Dispel-type immunity: aura 41 OR creature_immunities Type 4. */
export function isImmuneToDispel(
  state: ImmunityState,
  dispelType: number,
  template?: TemplateImmuneMasks | null,
): boolean {
  if (dispelType <= 0) return false;
  const bit = 1 << dispelType;
  if (((template?.immunities?.dispelMask ?? 0) & bit) !== 0) return true;
  return (state.dispelImmuneMask & bit) !== 0;
}

/** Effect-id immunity: aura 37 OR creature_immunities Type 0. */
export function isImmuneToEffect(
  state: ImmunityState,
  effectId: number,
  template?: TemplateImmuneMasks | null,
): boolean {
  if (effectId <= 0) return false;
  if (template?.immunities?.effects?.includes(effectId)) return true;
  return state.effectImmuneIds.includes(effectId);
}

/** State/aura-type immunity: aura 38 OR creature_immunities Type 1. */
export function isImmuneToState(
  state: ImmunityState,
  auraType: number,
  template?: TemplateImmuneMasks | null,
): boolean {
  if (auraType <= 0) return false;
  if (template?.immunities?.states?.includes(auraType)) return true;
  return state.stateImmuneIds.includes(auraType);
}

// IsImmuneToSpellEffect for ONE effect slot: the effect id, then its mechanic, then its aura name.
// Per-slot, so a mixed spell still lands the half that is not immune. Cite: Unit.cpp:7371-7404.
export function isImmuneToSpellEffectSlot(
  state: ImmunityState,
  slot: { effect?: number | null; auraName?: number | null; mechanic?: number | null },
  template?: TemplateImmuneMasks | null,
  noImmunities?: boolean,
): boolean {
  if (noImmunities) return false;
  if (isImmuneToEffect(state, slot.effect ?? 0, template)) return true;
  const mech = slot.mechanic ?? 0;
  if (mech > 0 && isImmuneToMechanicId(state, mech, template)) return true;
  return isImmuneToState(state, slot.auraName ?? 0, template);
}

// Every populated slot immune means the cast lands nothing and is logged Immune. One immune slot out
// of two still runs: Mocking Blow keeps its damage and drops only the taunt.
export function isEveryEffectSlotImmune(
  state: ImmunityState,
  rawEffects: ReadonlyArray<{ effect?: number | null; auraName?: number | null; mechanic?: number | null }>
    | undefined | null,
  template?: TemplateImmuneMasks | null,
  noImmunities?: boolean,
  noPartialImmunity?: boolean,
): boolean {
  if (noImmunities || !rawEffects?.length) return false;
  let populated = 0;
  for (const slot of rawEffects) {
    if (!(slot.effect ?? 0)) continue;
    populated++;
    const slotImmune = isImmuneToSpellEffectSlot(state, slot, template);
    if (noPartialImmunity && slotImmune) return true;
    if (!noPartialImmunity && !slotImmune) return false;
  }
  return noPartialImmunity ? false : populated > 0;
}

// Whole-spell immunity for a HOSTILE cast: template masks, or a school-immunity aura, or a dispel
// immunity against the spell's dispel type. A self-buff must not be framed as hostile here.
function isImmuneToHostileSpell(
  state: ImmunityState,
  spell: { school: School | string; mechanic?: Mechanic | string | null; dispel?: number | null },
  template?: TemplateImmuneMasks | null,
  noSchoolImmunities?: boolean,
): boolean {
  // IMMUNITY_DISPEL vs incoming SpellEntry.Dispel — first check in IsImmuneToSpell.
  // Cite: Unit.cpp:7337–7340 (pin de8f729).
  if (isImmuneToDispel(state, spell.dispel ?? 0, template)) return true;
  if (!noSchoolImmunities && isTemplateSchoolImmune(template?.schoolImmuneMask, spell.school as School)) return true;
  // Live aura mechanic (Free Action snare/root/stun) OR the creature template mask. Template-only
  // left Piercing Howl / Concussive Shot firing every GCD into a FAP. Cite: Unit.cpp IsImmuneToSpell.
  if (isImmuneToMechanic(state, spell.mechanic, template)) {
    return true;
  }
  const schoolMask = schoolMaskFromSchoolName(spell.school);
  if (!schoolMask) return false;
  return isImmuneToHarmfulAura(state, { schoolMask, positive: false, noSchoolImmunities }, template);
}

function abilityDealsSchoolDamage(spell: {
  effects?: ReadonlyArray<{ kind: string }>;
  strikeBonus?: unknown;
  onNextSwing?: boolean;
  role?: string | null;
}): boolean {
  if (spell.strikeBonus || spell.onNextSwing) return true;
  const r = spell.role;
  if (r === 'strike' || r === 'nuke' || r === 'instant_nuke' || r === 'shoot' || r === 'dot') {
    return true;
  }
  const fx = spell.effects;
  if (!fx) return false;
  return fx.some(
    (e) =>
      e.kind === 'direct_damage'
      || e.kind === 'dot'
      || e.kind === 'weapon_percent_damage'
      || e.kind === 'persistent_area',
  );
}

// CheckCast immunity: the spell test plus the damage test for a damaging ability, which covers weapon
// strikes whose empty effect list makes them invisible to a hostile-effect walk.
export function isAbilityIneffectiveOnTarget(
  state: ImmunityState,
  spell: {
    school: School | string;
    mechanic?: Mechanic | string | null;
    dispel?: number | null;
    effects?: ReadonlyArray<{ kind: string; hostile?: boolean; pct?: number }>;
    rawEffects?: ReadonlyArray<{ effect?: number }>;
    strikeBonus?: unknown;
    onNextSwing?: boolean;
    role?: string | null;
  },
  template?: TemplateImmuneMasks | null,
  noSchoolImmunities?: boolean,
): boolean {
  if (isImmuneToHostileSpell(state, spell, template, noSchoolImmunities)) return true;
  if (abilityDealsSchoolDamage(spell) && isImmuneToDamage(state, spell.school, template, noSchoolImmunities)) {
    return true;
  }
  // Totem.cpp:282–287 — negative auras never land. Mixed damage+aura (Wing Clip) still
  // deals its hit; aura-only (Concussive, Fear, Serpent Sting) is a wasted GCD.
  if (isTotemCreatureType(template?.creatureType) && spellIsHostileAuraOnly(spell)) return true;
  return false;
}

// Harmful aura apply blocked by school immunity (IsImmuneToSpell school path). Positive auras are not
// blocked by a positive school immunity (Unit.cpp IsImmuneToSpell ~7344–7347).
export function isImmuneToHarmfulAura(
  state: ImmunityState,
  opts: {
    schoolMask: number;
    /** Incoming aura is positive. */
    positive?: boolean;
    /** SPELL_ATTR_NO_IMMUNITIES on the spell. */
    noImmunities?: boolean;
    /** SPELL_ATTR_EX2_NO_SCHOOL_IMMUNITIES on the spell. */
    noSchoolImmunities?: boolean;
  },
  template?: TemplateImmuneMasks | null,
): boolean {
  if (opts.noImmunities) return false;
  if (!opts.schoolMask) return false;

  // Template school mask has no positive/positive exception in creature path.
  if (template?.schoolImmuneMask && (template.schoolImmuneMask & opts.schoolMask) !== 0) {
    return true; // Unpierceable since it's a template immunity.
  }

  if ((state.schoolImmuneMask & opts.schoolMask) === 0) return false;

  if (opts.noSchoolImmunities) {
    const unpierceable = state.auras.some(
      (a) =>
        a.auraType === AURA_TYPE.SCHOOL_IMMUNITY &&
        ((a.schoolMask ?? 0) & opts.schoolMask) !== 0 &&
        (a.spellMechanic === MECHANIC.IMMUNE_SHIELD ||
          a.spellMechanic === MECHANIC.INVULNERABILITY ||
          a.spellMechanic === MECHANIC.BANISH),
    );
    if (!unpierceable) return false;
  }

  // Positive school immunity does not block other positive auras.
  if (opts.positive) {
    const hasNegativeSchoolImmune = state.auras.some(
      (a) =>
        a.auraType === AURA_TYPE.SCHOOL_IMMUNITY &&
        ((a.schoolMask ?? 0) & opts.schoolMask) !== 0 &&
        !a.positive,
    );
    // If only positive immunities cover this school, allow positive auras.
    if (!hasNegativeSchoolImmune) {
      const hasPositiveCover = state.auras.some(
        (a) =>
          a.auraType === AURA_TYPE.SCHOOL_IMMUNITY &&
          ((a.schoolMask ?? 0) & opts.schoolMask) !== 0 &&
          a.positive,
      );
      if (hasPositiveCover) return false;
    }
  }
  return true;
}

// Divine Shield–class: all-school immunity (damage + harmful auras). True when schoolImmuneMask covers
// SPELL_SCHOOL_MASK_ALL, or spellMechanic is IMMUNE_SHIELD / INVULNERABILITY (SpellMgr.h pierce list).
function isDivineShieldClass(state: ImmunityState): boolean {
  if ((state.schoolImmuneMask & SPELL_SCHOOL_MASK_ALL) === SPELL_SCHOOL_MASK_ALL) {
    return state.auras.some(
      (a) =>
        a.auraType === AURA_TYPE.SCHOOL_IMMUNITY &&
        a.positive &&
        ((a.schoolMask ?? 0) & SPELL_SCHOOL_MASK_ALL) === SPELL_SCHOOL_MASK_ALL,
    );
  }
  return state.auras.some(
    (a) =>
      a.spellMechanic === MECHANIC.IMMUNE_SHIELD ||
      a.spellMechanic === MECHANIC.INVULNERABILITY,
  );
}

/** Blocks all damage for Divine Shield–class (predicate; duration is caller's job). */
function blocksAllDamage(state: ImmunityState): boolean {
  return (state.schoolImmuneMask & SPELL_SCHOOL_MASK_ALL) === SPELL_SCHOOL_MASK_ALL
    || (state.damageImmuneMask & SPELL_SCHOOL_MASK_ALL) === SPELL_SCHOOL_MASK_ALL;
}

/** Blocks harmful aura application under full school immunity. */
function blocksAllHarmfulAuras(state: ImmunityState): boolean {
  return (state.schoolImmuneMask & SPELL_SCHOOL_MASK_ALL) === SPELL_SCHOOL_MASK_ALL;
}

// Banish-class or unattackable: the isolated state a banish school immunity sets, or the unattackable
// aura. Cite: HandleAuraModSchoolImmunity ~3025-3030; HandleModUnattackable ~4454.
export function isUnattackable(state: ImmunityState): boolean {
  return state.isolated || state.untargetable;
}

// Banished units are treated as undispellable for combat wiring (isolated / untargetable — dispel requires
// a valid target). Predicate only.
function isUndispellable(state: ImmunityState): boolean {
  return state.isolated;
}

/** True when any live aura is Banish-class (school immune + MECHANIC.BANISH). */
function isBanishClass(state: ImmunityState): boolean {
  return state.auras.some(
    (a) =>
      a.auraType === AURA_TYPE.SCHOOL_IMMUNITY && a.spellMechanic === MECHANIC.BANISH,
  );
}

// The per-spell target creature type gate, as a bitfield: Scare Beast takes beasts, Banish demons and
// elementals. An absent mask is unrestricted, and an unknown creature type is allowed.
export function passesTargetCreatureType(
  targetCreatureTypeMask: number | undefined | null,
  creatureType: number,
): boolean {
  if (!targetCreatureTypeMask) return true;
  if (!creatureType) return true; // !TargetCreatureType early-allow
  const bit = 1 << (creatureType - 1);
  return (targetCreatureTypeMask & bit) !== 0;
}

/** Banish-specific wrapper (kept for existing call sites/tests): demon / elemental only. */
function isValidBanishTarget(
  creatureType: number,
  targetCreatureTypeMask: number = BANISH_TARGET_CREATURE_TYPE_MASK,
): boolean {
  return passesTargetCreatureType(targetCreatureTypeMask, creatureType);
}

// Convenience: Divine Shield–class duration field on the live aura (caller stores it). Returns max
// durationMs among Divine Shield–class auras, or 0.
function divineShieldDurationMs(state: ImmunityState): number {
  let max = 0;
  for (const a of state.auras) {
    if (
      a.auraType === AURA_TYPE.SCHOOL_IMMUNITY &&
      a.positive &&
      ((a.schoolMask ?? 0) & SPELL_SCHOOL_MASK_ALL) === SPELL_SCHOOL_MASK_ALL &&
      a.durationMs != null &&
      a.durationMs > max
    ) {
      max = a.durationMs;
    }
  }
  return max;
}
