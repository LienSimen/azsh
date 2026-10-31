// Dimension-C cast gates peeled out of applySpell (filesize ceiling). Cite: Spell.cpp OnCheckCast;
// planAuraApply Flurry ProcCharges.
import {
  BANISH_EXILE_BURNING_SPELL_ID,
  BANISH_EXILE_CRESTING_SPELL_ID,
  BANISH_EXILE_THUNDERING_SPELL_ID,
  FLURRY_PROC_CHARGES,
  SUMMON_SCREECHER_SPIRIT_SPELL_ID,
  banishExileAllowsTarget,
  isFlurryHasteRank,
  summonScreecherSpiritAllowsTarget,
} from '../spells/cmangos-special-cases.ts';
import { isDrainManaManaGate } from '../spells/cmangos-special-cases-s18.ts';
import { aqMountCheckCastRefused } from '../spells/cmangos-special-cases-s19.ts';
import { nefarianClassCallRefusesTarget } from '../../domain/scriptdev/classFilter.ts';
import { SPELL_ATTR_EX2, hasAttrEx2 } from '../spells/spellAttributes.ts';
import type { SpellDef } from '../../data/schema.ts';

type SpecFlags = {
  flags?: Record<string, boolean>;
  creatureEntry?: number;
  /** Target power type for OnCheckTarget mana gates. Cite: Spell.cpp:8041–8046. */
  powerType?: string;
  /** Unit::getClass() for Nefarian class-call OnCheckTarget. Cite: Spell.cpp:8003-8040. */
  classId?: number;
  /** Caster map id for AQ40 mount CheckCast. Cite: Spell.cpp:5762–5775 GetMapId()==531. */
  mapId?: number;
  // Live auras on the CheckCast target. Cite: Priest.cpp PowerInfusion GetAuraCount(12042); Paladin.cpp
  // DivineIntervention HasAura(23333/23335/34976).
  auraSpellIds?: ReadonlySet<number>;
  /** TYPEID_PLAYER. Cite: Warlock.cpp:193 CurseOfDoom. */
  isPlayer?: boolean;
  /** True if the caster has a living pet or a charm. */
  hasActivePet?: boolean;
};

/** Power Infusion. Cite: scriptdev2 spell.sql 10060 spell_power_infusion. */
const POWER_INFUSION_SPELL_ID = 10060;
/** Arcane Power. Cite: Priest.cpp:39 GetAuraCount(12042). */
const ARCANE_POWER_SPELL_ID = 12042;
/** Divine Intervention parent casts. Cite: Paladin.cpp:142; spell.sql 19752. */
const DIVINE_INTERVENTION_CAST_IDS = new Set([19752, 19754]);
/** WSG / EOTS flag auras. Cite: Paladin.cpp:149; BattleGroundWS.h:54-59. */
const FLAG_CARRIER_AURA_IDS = new Set([23333, 23335, 34976]);
/** Curse of Doom. Cite: scriptdev2 spell.sql 603 spell_curse_of_doom. */
const CURSE_OF_DOOM_SPELL_ID = 603;
/** Recently Bandaged. Cite: Spell.cpp:3114 MECHANIC_BANDAGE AddPrecastSpell(11196). */
export const RECENTLY_BANDAGED_SPELL_ID = 11196;

/** Capture Spirit / Screecher one-shot / Drain Mana mana-power / AQ mount CheckCast refuse. */
export function refuseCmangosCheckCast(
  spell: SpellDef | number,
  targetSpec: SpecFlags,
  casterSpec?: SpecFlags,
  /** False = inspect only (canCastSpell). Cite: Spell.cpp OnCheckCast is not a write. */
  commit = true,
): boolean {
  const sid = typeof spell === 'number' ? spell | 0 : spell.id | 0;

  // SPELL_ATTR_EX2_NO_ACTIVE_PETS gate.
  // Cite: Spell.cpp:5877-5890 if player HasAttribute(NO_ACTIVE_PETS) and (GetPetGuid() || HasCharm())
  if (typeof spell !== 'number' && hasAttrEx2(spell, SPELL_ATTR_EX2.NO_ACTIVE_PETS) && casterSpec?.hasActivePet) {
    return true;
  }

  if (
    sid === BANISH_EXILE_BURNING_SPELL_ID ||
    sid === BANISH_EXILE_CRESTING_SPELL_ID ||
    sid === BANISH_EXILE_THUNDERING_SPELL_ID
  ) {
    if (!banishExileAllowsTarget(sid, (targetSpec.creatureEntry ?? 0) | 0)) return true;
  }
  // Bandage lockout. Cite: Spell.cpp:3114 MECHANIC_BANDAGE AddPrecastSpell(11196)
  if (typeof spell !== 'number' && spell.mechanic === 'bandage' && targetSpec.auraSpellIds?.has(RECENTLY_BANDAGED_SPELL_ID)) {
    return true;
  }

  if (sid === SUMMON_SCREECHER_SPIRIT_SPELL_ID) {
    const entry = (targetSpec.creatureEntry ?? 0) | 0;
    const hitKey = `hitBySpell:${SUMMON_SCREECHER_SPIRIT_SPELL_ID}`;
    const already = !!targetSpec.flags?.[hitKey];
    if (!summonScreecherSpiritAllowsTarget({ isCreature: entry > 0, alreadyHitBySpell: already })) {
      return true;
    }
    if (commit) (targetSpec.flags ??= {})[hitKey] = true;
  }
  // Drain Mana (Moam family): target must be POWER_MANA.
  // Cite: Spell.cpp:8041–8046 case 25676/25754/26457/26559.
  if (isDrainManaManaGate(sid) && targetSpec.powerType !== 'mana') {
    return true;
  }
  // Nefarian class calls: DBC cannot filter by class. Cite: Spell.cpp:8003-8040.
  if (nefarianClassCallRefusesTarget(sid, targetSpec.classId)) {
    return true;
  }
  // Regular AQ40 mounts: map 531 only else SPELL_FAILED_NOT_HERE.
  // Cite: Spell.cpp:5765–5775 cases 25953/26054/26055/26056.
  if (aqMountCheckCastRefused(sid, casterSpec?.mapId)) {
    return true;
  }
  // Patch 1.10.2: Power Infusion does not stack with Arcane Power.
  // Cite: Priest.cpp:36–40 SPELL_FAILED_AURA_BOUNCED if GetAuraCount(12042).
  if (sid === POWER_INFUSION_SPELL_ID && targetSpec.auraSpellIds?.has(ARCANE_POWER_SPELL_ID)) {
    return true;
  }
  // DI cannot land on a flag carrier. Cite: Paladin.cpp:144-151 SPELL_FAILED_TARGET_AURASTATE.
  if (DIVINE_INTERVENTION_CAST_IDS.has(sid) && targetSpec.auraSpellIds) {
    for (const id of FLAG_CARRIER_AURA_IDS) {
      if (targetSpec.auraSpellIds.has(id)) return true;
    }
  }
  // Curse of Doom: not allow cast at player. Cite: Warlock.cpp:189-196.
  if (sid === CURSE_OF_DOOM_SPELL_ID && targetSpec.isPlayer === true) {
    return true;
  }
  return false;
}

/** ProcCharges for buff planAuraApply (Flurry haste ranks stamp 3). */
export function buffProcChargesForSpell(
  spellId: number,
  spellProcCharges: number | undefined,
): number | undefined {
  if (spellProcCharges && spellProcCharges > 0) return spellProcCharges;
  // Warrior + Shaman Flurry haste ranks: ProcCharges=3 from spell_template.
  // Cite: UnitAuraProcHandler.cpp:749–762; spell_template 12966/16257 ProcCharges=3.
  if (isFlurryHasteRank(spellId)) return FLURRY_PROC_CHARGES;
  return undefined;
}
