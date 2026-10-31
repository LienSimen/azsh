// The override-class-scripts remainder, a per-id switch. The handler only registers the script id; the
// consumers are the per-id switches. Never invent a payload the C++ does not name.

import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import { CLASS } from '../../data/schema.ts';
import {
  SPELL_AURA_MOD_SHAPESHIFT,
  SPELL_AURA_PERIODIC_HEAL,
  SPELL_EFFECT_DISPEL,
  SPELL_EFFECT_HEAL,
} from './interpreter/opcodes.ts';
import {
  SPELLFAMILY_DRUID,
  SPELLFAMILY_PALADIN,
  SPELLFAMILY_PRIEST,
  SPELLFAMILY_WARRIOR,
} from './interpreter/handlers/shared.ts';

/** SpellFamily Shaman. Cite: DBCEnums.h:171 SPELLFAMILY_SHAMAN = 11; Spell.cpp:4667. */
export const SPELLFAMILY_SHAMAN = 11;

/** Intent kind the handler emits. Census D reader lives in this file (outside interpreter/). */
export const OVERRIDE_CLASS_SCRIPTS_INTENT = 'override_class_scripts' as const;

/** Demonic Sacrifice marker. Cite: SpellEffects.cpp:3254–3255 GetOverrideScript(2228). */
export const DEMONIC_SACRIFICE_OVERRIDE_SCRIPT = 2228;
export const DEMONIC_SACRIFICE_RESULT_SPELL_IDS = [18789, 18790, 18791, 18792] as const;

/** Nefarian warrior call — fail stance shapeshift. Cite: Spell.cpp:4678–4684 case 3654. */
export const NEFARIAN_BERSERK_SCRIPT = 3654;
export const NEFARIAN_BERSERK_SPELL_ID = 23397;

/** Nefarian druid call — fail form shapeshift. Cite: Spell.cpp:4658–4662 case 3655. */
export const NEFARIAN_INVOLUNTARY_SCRIPT = 3655;
export const NEFARIAN_INVOLUNTARY_SPELL_ID = 23398;

/** Loatheb / Corrupted Mind — fizzle heal/HoT/dispel. Cite: Spell.cpp:4669–4674 case 4327. */
export const CORRUPTED_MIND_SCRIPT = 4327;
export const CORRUPTED_MIND_SPELL_IDS = [29184, 29195, 29197, 29199] as const;
/** Dummy PBAoE primer. Cite: boss_loatheb.cpp:32 SPELL_CORRUPTED_MIND 29201. */
export const CORRUPTED_MIND_PRIMER_SPELL_ID = 29201;

// Class-branch lockout aura 112 holders. Cite: boss_loatheb.cpp:104-114 then 29185/29194/29196/29198
// proc-trigger 29184/29195/29197/29199.
export function corruptedMindLockoutSpellId(classId: number): number | null {
  switch (classId | 0) {
    case CLASS.PALADIN: return 29197;
    case CLASS.PRIEST: return 29184;
    case CLASS.SHAMAN: return 29199;
    case CLASS.DRUID: return 29195;
    default: return null;
  }
}

// Tactical Mastery rage kept across a stance change, in POWER_RAGE tenths. Cite: SpellAuras.cpp:1892-1896
// case 831..835 rageVal = 50/100/150/200/250.
export const TACTICAL_MASTERY_RAGE_BY_SCRIPT: Readonly<Record<number, number>> = {
  831: 50, 832: 100, 833: 150, 834: 200, 835: 250,
};

/** spell_template aura 112 misc 831..835 - Tactical Mastery ranks 1-5. */
export const TACTICAL_MASTERY_SPELL_IDS = [12295, 12676, 12677, 12678, 12679] as const;

// scriptId → spells that carry that OVERRIDE_CLASS_SCRIPTS misc. Sourced from spell_template
// EffectMiscValue on aura 112 (measured bake).
const SPELLS_FOR_SCRIPT: Readonly<Record<number, readonly number[]>> = {
  [DEMONIC_SACRIFICE_OVERRIDE_SCRIPT]: DEMONIC_SACRIFICE_RESULT_SPELL_IDS,
  [NEFARIAN_BERSERK_SCRIPT]: [NEFARIAN_BERSERK_SPELL_ID],
  [NEFARIAN_INVOLUNTARY_SCRIPT]: [NEFARIAN_INVOLUNTARY_SPELL_ID],
  [CORRUPTED_MIND_SCRIPT]: CORRUPTED_MIND_SPELL_IDS,
  // Improved Blizzard — Mage.cpp Blizzard::OnPeriodicTickEnd HasOverrideScript.
  // Cite: Mage.cpp:117–122; spell_template 11185/12487/12488 misc 836/988/989.
  836: [11185],
  988: [12487],
  989: [12488],
  // Tactical Mastery ranks 1-5. Cite: SpellAuras.cpp:1885-1904 stance rage cap.
  831: [TACTICAL_MASTERY_SPELL_IDS[0]],
  832: [TACTICAL_MASTERY_SPELL_IDS[1]],
  833: [TACTICAL_MASTERY_SPELL_IDS[2]],
  834: [TACTICAL_MASTERY_SPELL_IDS[3]],
  835: [TACTICAL_MASTERY_SPELL_IDS[4]],
  // Improved Scorpid Sting ranks 1-3. Cite: SpellAuras.cpp:3461-3463 staminaToRemove.
  2388: [19491],
  2389: [19493],
  2390: [19494],
};

// Proc-side Classic switch. Cite: UnitAuraProcHandler.cpp:1604–1648. 4533 is handled inside
// procsDamage.ts because its trigger is chosen from victim power type at proc time.
export const OVERRIDE_SCRIPT_PROC_TRIGGERS: Readonly<Record<number, number>> = {
  3656: 23402, // Corrupted Healing — :1606–1612
  4086: 24406, // Improved Mend Pet r1 — :1615–1621
  4087: 24406, // Improved Mend Pet r2 — :1616–1621
  4309: 17941, // Nightfall → Shadow Trance — :1624–1627
  4533: -1, // Dreamwalker 2pc — power-type pick at proc time (procsDamage.ts).
  4537: 28750, // Dreamwalker 6pc Regrowth — :1645–1646
};

/** roll_chance_i(triggerAmount). Cite: UnitAuraProcHandler.cpp:1618–1619. */
export const OVERRIDE_SCRIPT_ROLLS_OWN_AMOUNT: ReadonlySet<number> = new Set([4086, 4087]);

export type OverrideClassScriptDisposition =
  | 'proc_trigger'
  | 'existing_talent_path'
  | 'check_cast'
  | 'not_implemented';

// Per-id switch. Quote is the C++ site that consumes the id — or the reason it does not. Census-B remainder
// (12 live slots): 728, 2228, 3654, 3655, 4081, 4327.
export function overrideClassScriptDisposition(scriptId: number): OverrideClassScriptDisposition {
  switch (scriptId) {
    case 3656: // UnitAuraProcHandler.cpp:1606 "Corrupted Healing" → triggered_spell_id = 23402
    case 4086: // UnitAuraProcHandler.cpp:1615 "Improved Mend Pet (Rank 1)" → 24406
    case 4087: // UnitAuraProcHandler.cpp:1616 "Improved Mend Pet (Rank 2)" → 24406
    case 4309: // UnitAuraProcHandler.cpp:1624–1627 triggered_spell_id = 17941
    case 4537: // UnitAuraProcHandler.cpp:1645–1646 "Dreamwalker Raiment 6 pieces" → 28750
      return 'proc_trigger';
    case 836: // Mage.cpp:117 Improved Blizzard r1 → Chilled 12484
    case 988: // Mage.cpp:119 Improved Blizzard r2 → Chilled 12485
    case 989: // Mage.cpp:121 Improved Blizzard r3 → Chilled 12486
      return 'existing_talent_path';
    case 2228: // SpellEffects.cpp:3254–3255 GetOverrideScript(2228) RemoveAurasDueToSpell
      return 'existing_talent_path';
    case 2388: // SpellAuras.cpp:3461 staminaToRemove = m_amount * 10 / 100; CastCustomSpell 19486
    case 2389: // SpellAuras.cpp:3462 staminaToRemove = m_amount * 20 / 100
    case 2390: // SpellAuras.cpp:3463 staminaToRemove = m_amount * 30 / 100
      return 'existing_talent_path';
    case 3654: // Spell.cpp:4682 HasOverrideScript(3654) → SPELL_FAILED_TARGET_AURASTATE
    case 3655: // Spell.cpp:4661 HasOverrideScript(3655) → SPELL_FAILED_TARGET_AURASTATE
    case 4327: // Spell.cpp:4673 HasOverrideScript(4327) → SPELL_FAILED_FIZZLE
      return 'check_cast';
    case 831: // SpellAuras.cpp:1892 Tactical Mastery rageVal=50 — powerForm.ts enterForm cap
    case 832: // SpellAuras.cpp:1893 rageVal=100
    case 833: // SpellAuras.cpp:1894 rageVal=150
    case 834: // SpellAuras.cpp:1895 rageVal=200
    case 835: // SpellAuras.cpp:1896 rageVal=250
      return 'existing_talent_path';
    case 2028: // Improved Drain Mana r1 17864 — no case anywhere in the Classic core
    case 2029: // Improved Drain Mana r2 18393 — same
    case 4533: // UnitAuraProcHandler.cpp:1629–1643 power-type pick 28722/28723/28724 (procsDamage.ts)
      return 'proc_trigger';
    case 728: // Scorch Talent Test (PT) 12379 — no case in :1604–1648 / Spell.cpp:4655–4686
    case 4081: // Netherwind Focus 22008 — no GetOverrideScript/HasOverrideScript/proc case
    default:
      // No case in UnitAuraProcHandler.cpp:1604–1648, Spell.cpp:4655–4686,
      // SpellEffects.cpp:3254, or SpellAuras.cpp:1890–1897 / :3459–3463.
      return 'not_implemented';
  }
}

/** C++ cite for the disposition. Never a synthesized payload. */
export function overrideClassScriptCite(scriptId: number): string {
  switch (scriptId) {
    case 3656:
      return 'UnitAuraProcHandler.cpp:1606–1612 case 3656 triggered_spell_id = 23402';
    case 4086:
      return 'UnitAuraProcHandler.cpp:1615–1621 case 4086 roll_chance_i → 24406';
    case 4087:
      return 'UnitAuraProcHandler.cpp:1616–1621 case 4087 roll_chance_i → 24406';
    case 4309:
      return 'UnitAuraProcHandler.cpp:1624–1627 case 4309 triggered_spell_id = 17941';
    case 4537:
      return 'UnitAuraProcHandler.cpp:1645–1646 case 4537 triggered_spell_id = 28750';
    case 2228:
      return 'SpellEffects.cpp:3254–3255 if (Aura* aura = m_caster->GetOverrideScript(2228))';
    case 2388:
      return 'SpellAuras.cpp:3461 case 2388: staminaToRemove = m_amount * 10 / 100';
    case 2389:
      return 'SpellAuras.cpp:3462 case 2389: staminaToRemove = m_amount * 20 / 100';
    case 2390:
      return 'SpellAuras.cpp:3463 case 2390: staminaToRemove = m_amount * 30 / 100';
    case 3654:
      return 'Spell.cpp:4682 if (m_caster->HasOverrideScript(3654)) return SPELL_FAILED_TARGET_AURASTATE';
    case 3655:
      return 'Spell.cpp:4661 if (m_caster->HasOverrideScript(3655)) return SPELL_FAILED_TARGET_AURASTATE';
    case 4327:
      return 'Spell.cpp:4673 if (m_caster->HasOverrideScript(4327)) return SPELL_FAILED_FIZZLE';
    case 4533:
      return 'UnitAuraProcHandler.cpp:1629–1643 case 4533 roll_chance_i(50) → victim power-type pick';
    case 728:
      return 'NOT IMPLEMENTED no case in :1604–1648 / Spell.cpp:4655–4686 / SpellEffects.cpp:3254';
    case 4081:
      return 'NOT IMPLEMENTED no GetOverrideScript/HasOverrideScript/proc case (22008 aura 107 is the live slot)';
    case 2028:
    case 2029:
      return 'NOT IMPLEMENTED Improved Drain Mana — the Classic core has no case 2028/2029 either'
        + ' (17864/18393 have zero hits core-wide; the ids the core does consume are'
        + ' 831–836, 988, 989, 2228, 2388–2390, 3654–3656, 4086, 4087, 4309, 4327, 4533, 4537).';
    case 831:
    case 832:
    case 833:
    case 834:
    case 835:
      return `SpellAuras.cpp:1892–1896 case ${scriptId} rageVal ${TACTICAL_MASTERY_RAGE_BY_SCRIPT[scriptId]} — stance rage cap`;
    default:
      return 'NOT IMPLEMENTED no case in UnitAuraProcHandler.cpp:1604–1648 / Spell.cpp:4655–4686 / SpellEffects.cpp:3254 / SpellAuras.cpp:1890–1897 / :3459–3463';
  }
}

export function hasOverrideScript(
  buffActive: ReadonlySet<number> | undefined,
  scriptId: number,
): boolean {
  if (!buffActive) return false;
  const ids = SPELLS_FOR_SCRIPT[scriptId];
  if (!ids) return false;
  for (const id of ids) {
    if (buffActive.has(id)) return true;
  }
  return false;
}

// The unit-level test: a live aura OR a sheet script id. A spent talent is an aura in the C++ but
// neither a buff nor a spellbook row here, so the buff set alone always answered no.
export function unitHasOverrideScript(
  unit: { buffActive?: ReadonlySet<number>; overrideScriptIds?: ReadonlySet<number> },
  scriptId: number,
): boolean {
  if (unit.overrideScriptIds?.has(scriptId)) return true;
  return hasOverrideScript(unit.buffActive, scriptId);
}

// The rage a warrior keeps when entering a stance, in display units. The C++ takes the FIRST script
// naming a rage value, and only one Tactical Mastery rank can be talented.
export function stanceRetainedRage(hasScript: (scriptId: number) => boolean): number {
  for (const scriptId of [831, 832, 833, 834, 835]) {
    if (hasScript(scriptId)) return TACTICAL_MASTERY_RAGE_BY_SCRIPT[scriptId]! / 10;
  }
  return 0;
}

function rawSlots(spell: { rawEffects?: readonly { effect?: number; auraName?: number }[] }) {
  return spell.rawEffects ?? [];
}

function spellHasAura(spell: { rawEffects?: readonly { effect?: number; auraName?: number }[] }, aura: number): boolean {
  return rawSlots(spell).some((r) => ((r.auraName ?? 0) | 0) === aura);
}

function spellHasEffect(spell: { rawEffects?: readonly { effect?: number; auraName?: number }[] }, effect: number): boolean {
  return rawSlots(spell).some((r) => ((r.effect ?? 0) | 0) === effect);
}

// The two check-cast refusals from a class script. The heal test is the DBC heal effect only — Holy
// Light and Flash of Light are script effects. Cite: Spell.cpp:4655-4686.
export function refuseOverrideClassScriptCheckCast(
  spell: { spellFamilyName?: number; rawEffects?: readonly { effect?: number; auraName?: number }[] },
  casterBuffActive: ReadonlySet<number> | undefined,
): boolean {
  if (!casterBuffActive || casterBuffActive.size === 0) return false;
  const family = (spell.spellFamilyName ?? 0) | 0;
  // Druid shapeshift first, then fall through to the heal/dispel set. Cite: Spell.cpp:4658–4676.
  if (
    family === SPELLFAMILY_DRUID
    && spellHasAura(spell, SPELL_AURA_MOD_SHAPESHIFT)
    && hasOverrideScript(casterBuffActive, NEFARIAN_INVOLUNTARY_SCRIPT)
  ) {
    return true;
  }
  if (
    (family === SPELLFAMILY_DRUID
      || family === SPELLFAMILY_PRIEST
      || family === SPELLFAMILY_SHAMAN
      || family === SPELLFAMILY_PALADIN)
    && (spellHasEffect(spell, SPELL_EFFECT_HEAL)
      || spellHasAura(spell, SPELL_AURA_PERIODIC_HEAL)
      || spellHasEffect(spell, SPELL_EFFECT_DISPEL))
    && hasOverrideScript(casterBuffActive, CORRUPTED_MIND_SCRIPT)
  ) {
    return true;
  }
  if (family === SPELLFAMILY_WARRIOR) {
    return spellHasAura(spell, SPELL_AURA_MOD_SHAPESHIFT)
      && hasOverrideScript(casterBuffActive, NEFARIAN_BERSERK_SCRIPT);
  }
  return false;
}

/** TARGET_UNIT_CASTER. Cite: SpellTargetDefines.h:26; 29184/18789 EffectImplicitTargetA. */
const TARGET_UNIT_CASTER = 1;

export function overrideScriptAuraTargetIsCaster(spell: SpellDef): boolean {
  for (const raw of spell.rawEffects ?? []) {
    if ((raw.auraName | 0) !== 112) continue;
    return (raw.targetA | 0) === TARGET_UNIT_CASTER;
  }
  return true;
}

export function overrideScriptsOnSpell(spell: SpellDef): number[] {
  const out: number[] = [];
  for (const raw of spell.rawEffects ?? []) {
    if ((raw.auraName | 0) !== 112) continue;
    out.push(raw.miscValue | 0);
  }
  return out;
}

// The talent-path consumer of the override-class-script intents. Proc ids already emit their trigger,
// two register on apply, and the unimplemented ids stay register-only with no invented payload.
export function materializeOverrideClassScriptIntents(
  intents: readonly { kind: string; scriptId?: number }[] | undefined,
  effects: SpellEffect[],
  _spell: SpellDef,
): SpellEffect[] {
  if (!intents?.length) return effects;
  for (const intent of intents) {
    if (intent.kind !== OVERRIDE_CLASS_SCRIPTS_INTENT) continue;
    const scriptId = (intent.scriptId ?? 0) | 0;
    const disp = overrideClassScriptDisposition(scriptId);
    overrideClassScriptCite(scriptId);
    // CheckCast fizzle/aurastate holders — surface so the aura is not empty-effects inert.
    // Cite: Spell.cpp:4655–4686 HasOverrideScript.
    if (disp === 'check_cast' && !effects.some((e) => e.kind === 'client_inform')) {
      effects = [...effects, { kind: 'client_inform' }];
    }
  }
  return effects;
}
