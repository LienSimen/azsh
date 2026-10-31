// Talent auras the shapeshift handler casts on form APPLY and strips on leave, as a per-form delta on
// the form-free spec. Cite: SpellAuras.cpp:4296–4304; SpellMgr.h:1378 IsNeedCastSpellAtFormApply.

import type { DataStore } from '../../data/dataStore.ts';
import type { School, ShapeshiftFormId } from '../../data/schema.ts';
import { SHAPESHIFT_FORM } from '../../data/schema.ts';
import type { Character } from './character.ts';
import type { SpellBook } from './spellbook.ts';
import {
  FELINE_SWIFTNESS_PASSIVE_2A, formIdFromSpell, formStanceMask, formThreatSpellId, isFormSpell,
} from './forms.ts';
import {
  buffMod, effectiveStats, permanentRacialEffects,
  permanentSpeedAuras, passiveBuffModPoints, spentTalentRankSpellIds, talentStealthLevelBonus,
} from './characterStats.ts';
import {
  activeTalentEffects, spellMatchesClassMask, talentCritBonus, talentDamagePctBySchool,
  talentThreatModifiers,
} from './characterTalents.ts';
import { SCHOOL_MASK_BIT } from './characterTalents.ts';

export interface FormTalentAuraDelta {
  /** Crit percentage points (Sharpened Claws). */
  crit: number;
  /** Dodge percentage points (Feline Swiftness 24864/24867). */
  dodge: number;
  /** MOD_THREAT percentage points per school (Defiance). */
  threatPctBySchool: Partial<Record<School, number>>;
  /** Aura-31/130 rows (Feline Swiftness). MAXed against Sprint, never added. */
  speedAuras: Array<{ aura: number; pct: number }>;
  /** MOD_STEALTH_LEVEL points (Feral Instinct, Prowl only). */
  stealthLevel: number;
  /** MOD_DAMAGE_PERCENT_DONE per school (Shadowform's +15% shadow). */
  damagePctBySchool: Partial<Record<School, number>>;
  /** Points added to the form's OWN threat aura by a SPELLMOD naming it (Feral Instinct). */
  formThreatPct: number;
  /** Melee attack power delta from form-gated stats/talents (Heart of the Wild in Cat). */
  attackPower?: number;
  /** Max health delta from form-gated stats/talents (Heart of the Wild in Bear/Dire). */
  health?: number;
}

const EMPTY_SCHOOLS: readonly School[] = Object.keys(SCHOOL_MASK_BIT) as School[];

/** Every form id a spent talent rank is gated to — the only forms whose delta can be non-zero. */
export function formsGatedByTalents(char: Character, ds: DataStore): ShapeshiftFormId[] {
  const out: ShapeshiftFormId[] = [];
  let mask = 0;
  for (const id of spentTalentRankSpellIds(char, ds)) {
    const raw = ds.spell(id);
    if (!raw) continue;
    if (raw.id === FELINE_SWIFTNESS_PASSIVE_2A) mask |= formStanceMask(1 as ShapeshiftFormId);
    // A rank that IS a form spell (Shadowform, Moonkin) owns that form's own aura rows.
    if (isFormSpell(raw)) mask |= formStanceMask(formIdFromSpell(raw));
    mask |= raw.stances ?? 0;
  }
  // Heart of the Wild (talent 808): Bear/Dire Bear gains Sta, Cat gains Str.
  if (((char.talents?.[808] as number) | 0) > 0) {
    mask |= formStanceMask(SHAPESHIFT_FORM.CAT)
      | formStanceMask(SHAPESHIFT_FORM.BEAR)
      | formStanceMask(SHAPESHIFT_FORM.DIREBEAR);
  }
  if (!mask) return out;
  for (let form = 1; form <= 32; form++) {
    if (mask & formStanceMask(form as ShapeshiftFormId)) out.push(form as ShapeshiftFormId);
  }
  return out;
}

function deltaFor(
  char: Character,
  ds: DataStore,
  sb: SpellBook | undefined,
  form: ShapeshiftFormId,
  base: {
    crit: number; dodge: number; stealthLevel: number;
    threat: Partial<Record<School, number>>; speedKeys: Set<string>;
    damage: Partial<Record<School, number>>;
    str: number; sta: number;
  },
): FormTalentAuraDelta {
  const inForm: Character = { ...char, form };
  const crit = talentCritBonus(inForm, ds) - base.crit;
  const dodge = passiveBuffModPoints(inForm, ds, 'dodge', sb?.known) - base.dodge;
  const threatPctBySchool: Partial<Record<School, number>> = {};
  const threat = talentThreatModifiers(inForm, ds);
  for (const s of EMPTY_SCHOOLS) {
    const now = threat[s] ?? 1;
    const was = base.threat[s] ?? 1;
    if (was <= 0) continue;
    const pct = Math.round((now / was - 1) * 10000) / 100;
    if (pct) threatPctBySchool[s] = pct;
  }
  const speedAuras: Array<{ aura: number; pct: number }> = [];
  for (const row of permanentSpeedAuras(inForm, ds)) {
    if (!base.speedKeys.has(`${row.aura}:${row.pct}`)) speedAuras.push(row);
  }
  const stealthLevel = talentStealthLevelBonus(inForm, ds) - base.stealthLevel;
  // A SPELLMOD naming the form's threat spell raises it: Feral Instinct is ALL_EFFECTS on 21178, so
  // Dire Bear's +30% becomes +45%. Cite: Player.cpp ApplySpellMod; spell_template 21178.
  let formThreatPct = 0;
  const threatSpell = ds.spell(formThreatSpellId(form));
  if (threatSpell) {
    for (const e of activeTalentEffects(inForm, ds, form)) {
      if (e.kind !== 'spell_mod' || e.pct) continue;
      if (e.attr !== 'damage' && e.attr !== 'threat') continue;
      if (!spellMatchesClassMask(threatSpell, e.classMask)) continue;
      formThreatPct += e.value || 0;
    }
  }
  const damagePctBySchool: Partial<Record<School, number>> = {};
  const damage = talentDamagePctBySchool(inForm, ds);
  for (const sch of EMPTY_SCHOOLS) {
    const delta = (damage[sch] ?? 0) - (base.damage[sch] ?? 0);
    if (delta) damagePctBySchool[sch] = delta;
  }
  const inStats = effectiveStats(inForm, ds);
  const bonusStr = inStats.str - base.str;
  const bonusSta = inStats.sta - base.sta;
  let attackPower = 0;
  if (bonusStr > 0) {
    const apPct = 1 + buffMod(inForm, ds, 'attack_power_pct') / 100;
    attackPower = Math.round(bonusStr * 2 * apPct);
  }
  let health = 0;
  if (bonusSta > 0) {
    let pctMult = 1;
    for (const eff of permanentRacialEffects(inForm, ds)) {
      if (eff.kind === 'buff' && eff.mod === 'max_health_pct') pctMult *= (100 + (eff.amount || 0)) / 100;
    }
    health = Math.round(bonusSta * 10 * pctMult);
  }
  return {
    crit, dodge, threatPctBySchool, speedAuras, stealthLevel, damagePctBySchool, formThreatPct,
    ...(attackPower ? { attackPower } : {}),
    ...(health ? { health } : {}),
  };
}

// Per-form deltas keyed by form id, empty rows dropped. Read against the FORM-FREE body, which is what
// buildCombatant hands the engine.
export function formTalentAuraDeltas(
  char: Character,
  ds: DataStore,
  sb?: SpellBook,
): Record<number, FormTalentAuraDelta> | undefined {
  const forms = formsGatedByTalents(char, ds);
  if (!forms.length) return undefined;
  const formFree: Character = { ...char, form: undefined };
  const baseStats = effectiveStats(formFree, ds);
  const base = {
    crit: talentCritBonus(formFree, ds),
    dodge: passiveBuffModPoints(formFree, ds, 'dodge', sb?.known),
    stealthLevel: talentStealthLevelBonus(formFree, ds),
    damage: talentDamagePctBySchool(formFree, ds),
    threat: talentThreatModifiers(formFree, ds),
    speedKeys: new Set(permanentSpeedAuras(formFree, ds).map((r) => `${r.aura}:${r.pct}`)),
    str: baseStats.str,
    sta: baseStats.sta,
  };
  const out: Record<number, FormTalentAuraDelta> = {};
  for (const form of forms) {
    const d = deltaFor(char, ds, sb, form, base);
    if (d.crit || d.dodge || d.stealthLevel || d.formThreatPct || d.speedAuras.length
      || Object.keys(d.threatPctBySchool).length || Object.keys(d.damagePctBySchool).length
      || d.attackPower || d.health) {
      out[form] = d;
    }
  }
  return Object.keys(out).length ? out : undefined;
}
