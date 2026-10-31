// Talent effect aggregation + per-spell talent mods (withTalentMods).
// Extracted from character.ts (Wave 1 S3 barrel split). Pure move — no behavior change.

import type { DataStore } from '../../data/dataStore.ts';
import type { PrimaryStats, ShapeshiftFormId, SpellDef, School, TalentEffect } from '../../data/schema.ts';
import { SHAPESHIFT_FORM } from '../../data/schema.ts';
import type { Character } from './character.ts';
import { formIdFromSpell, formStanceMask, isFormSpell, passiveAppliesInForm } from './forms.ts';
import {
  applySpellMod,
  attrToSpellModOp,
  type SpellMod,
} from '../../engine/spells/spellMods.ts';

// ---- Talent effect aggregation (Phase C) -----------------------------------
// Pure, reading char.talents + ds. Procs and per-spell mods apply at their choke points.

// A rank that LEARNS a spell carries Stances for the client tooltip only — the requirement rides the
// GRANTED spell. Cite: SpellMgr.cpp:390–394 GetErrorAtShapeshiftedCast talent-learn bypass.
function talentRankAppliesInForm(
  effects: readonly TalentEffect[],
  spellId: number,
  ds: DataStore,
  form: ShapeshiftFormId,
): boolean {
  const raw = ds.spell(spellId | 0);
  if (!raw) return true;
  // A rank that IS the shapeshift (Shadowform 15473) carries the FORM's aura rows, applied on enter
  // and stripped on leave. Cite: SpellAuras.cpp:1830-1970 HandleAuraModShapeshift.
  if (isFormSpell(raw)) return formIdFromSpell(raw) === form;
  if (effects.some((e) => e.kind === 'grant_spell')) return true;
  return passiveAppliesInForm(raw, form);
}

// Permanent passive talent effects for spent ranks only; a rank that grants a spell omits its
// spell_mod rows. Form-gated ranks count only inside their Stances mask.
export function activeTalentEffects(
  char: Character,
  ds: DataStore,
  form: ShapeshiftFormId = ((char.form ?? 0) | 0) as ShapeshiftFormId,
): TalentEffect[] {
  const spent = char.talents ?? {};
  const out: TalentEffect[] = [];
  for (const [tidStr, rank] of Object.entries(spent)) {
    const tid = Number(tidStr);
    if (!tid || !rank) continue;
    const tal = ds.talent(tid);
    if (!tal) continue;
    const rnkIdx = Math.max(0, Math.min((rank as number) - 1, tal.ranks.length - 1));
    const r = tal.ranks[rnkIdx];
    if (!r?.effects?.length) continue;
    if (!talentRankAppliesInForm(r.effects, r.spellId, ds, form)) continue;
    const grantActive = r.effects.some((e) => e.kind === 'grant_spell');
    for (const e of r.effects) {
      if (grantActive && e.kind === 'spell_mod') continue;
      out.push(e);
    }
  }
  return out;
}

// Talent procs paired with the RANK SPELL that owns them: CAN_PROC_FROM_PROCS sits on the holder, not
// the payload (UnitAuraProcHandler.cpp:610). Stances rides along; the PROC path reads the LIVE form.
export function activeTalentProcsWithHolder(
  char: Character,
  ds: DataStore,
): { effect: Extract<TalentEffect, { kind: 'proc' }>; holderSpellId: number; stances: number }[] {
  const spent = char.talents ?? {};
  const out: { effect: Extract<TalentEffect, { kind: 'proc' }>; holderSpellId: number; stances: number }[] = [];
  for (const [tidStr, rank] of Object.entries(spent)) {
    const tid = Number(tidStr);
    if (!tid || !rank) continue;
    const tal = ds.talent(tid);
    if (!tal) continue;
    const rnkIdx = Math.max(0, Math.min((rank as number) - 1, tal.ranks.length - 1));
    const r = tal.ranks[rnkIdx];
    if (!r?.effects?.length) continue;
    // A rank that LEARNS a spell carries Stances for the tooltip only (SpellMgr.cpp:390-394); a rank
    // that IS a form spell is gated to that form's own bit.
    const rankSpell = ds.spell(r.spellId | 0);
    const gated = rankSpell && isFormSpell(rankSpell)
      ? formStanceMask(formIdFromSpell(rankSpell))
      : (r.effects.some((e) => e.kind === 'grant_spell') ? 0 : (rankSpell?.stances ?? 0));
    for (const e of r.effects) {
      if (e.kind === 'proc') out.push({ effect: e, holderSpellId: r.spellId | 0, stances: gated });
    }
  }
  return out;
}

export function talentDamagePctBySchool(char: Character, ds: DataStore): Partial<Record<School, number>> {
  const out: Partial<Record<School, number>> = {};
  for (const e of activeTalentEffects(char, ds)) {
    if (e.kind === 'damage_pct') {
      out[e.school] = (out[e.school] ?? 0) + e.pct;
    }
  }
  return out;
}

export function talentCritBonus(char: Character, ds: DataStore): number {
  let sum = 0;
  for (const e of activeTalentEffects(char, ds)) {
    if (e.kind === 'crit_pct') sum += (e as any).pct || 0;
  }
  return sum;
}

/** Aggregate flat (non-pct) primary stat mods from talents. */
export function talentStatFlat(char: Character, ds: DataStore): PrimaryStats {
  const f: PrimaryStats = { str: 0, agi: 0, sta: 0, int: 0, spi: 0 };
  for (const e of activeTalentEffects(char, ds)) {
    if (e.kind !== 'stat_mod' || e.pct) continue;
    const v = e.value || 0;
    const apply = (k: keyof PrimaryStats) => { (f as any)[k] += v; };
    if (e.stat === 'all_stats' || e.stat === 'str') apply('str');
    if (e.stat === 'all_stats' || e.stat === 'agi') apply('agi');
    if (e.stat === 'all_stats' || e.stat === 'sta') apply('sta');
    if (e.stat === 'all_stats' || e.stat === 'int') apply('int');
    if (e.stat === 'all_stats' || e.stat === 'spi') apply('spi');
  }
  return f;
}

/** Aggregate percent primary stat mods (value is +pct points). */
export function talentStatPct(char: Character, ds: DataStore): PrimaryStats {
  const p: PrimaryStats = { str: 0, agi: 0, sta: 0, int: 0, spi: 0 };
  for (const e of activeTalentEffects(char, ds)) {
    if (e.kind !== 'stat_mod' || !e.pct) continue;
    const v = e.value || 0;
    const apply = (k: keyof PrimaryStats) => { (p as any)[k] += v; };
    if (e.stat === 'all_stats' || e.stat === 'str') apply('str');
    if (e.stat === 'all_stats' || e.stat === 'agi') apply('agi');
    if (e.stat === 'all_stats' || e.stat === 'sta') apply('sta');
    if (e.stat === 'all_stats' || e.stat === 'int') apply('int');
    if (e.stat === 'all_stats' || e.stat === 'spi') apply('spi');
  }
  // Heart of the Wild (talent 808): 4/8/12/16/20% Int (passive in DBC), plus form-conditional:
  // +4..20% Stamina in Bear/Dire Bear, +4..20% Strength in Cat.
  // Cite: SpellAuras.cpp:4237-4256 HandleShapeshiftBoosts.
  const hotwRank = (char.talents?.[808] as number) | 0;
  if (hotwRank > 0) {
    const hotwBonusPct = Math.min(5, hotwRank) * 4;
    const form = ((char.form ?? 0) | 0) as ShapeshiftFormId;
    if (form === SHAPESHIFT_FORM.CAT) {
      p.str += hotwBonusPct;
    } else if (form === SHAPESHIFT_FORM.BEAR || form === SHAPESHIFT_FORM.DIREBEAR) {
      p.sta += hotwBonusPct;
    }
  }
  return p;
}

export function talentResistMods(char: Character, ds: DataStore): Partial<Record<School, number>> {
  const out: Partial<Record<School, number>> = {};
  for (const e of activeTalentEffects(char, ds)) {
    if (e.kind === 'resist_mod') {
      out[e.school] = (out[e.school] ?? 0) + e.amount;
    }
  }
  return out;
}

// ---- Wave 2B aura bridges (talent → combatant) --------------------------------
// MOD_THREAT=10, MOD_TARGET_RESISTANCE=123, MOD_MANA_REGEN_INTERRUPT=134; ranks use BaseDice=1.

const AURA_MOD_THREAT = 10;
const AURA_MOD_TARGET_RESISTANCE = 123;
const AURA_MOD_MANA_REGEN_INTERRUPT = 134;

/** School bit for SpellSchoolMask (SharedDefines) — 1 << schoolIndex. */
export const SCHOOL_MASK_BIT: Record<School, number> = {
  physical: 1 << 0,
  holy: 1 << 1,
  fire: 1 << 2,
  nature: 1 << 3,
  frost: 1 << 4,
  shadow: 1 << 5,
  arcane: 1 << 6,
};

/** EffectBasePoints + 1 (EffectBaseDice) — DBCStructure.h CalculateSimpleValue. */
function talentSimpleAmount(basePoints: number): number {
  return basePoints + 1;
}

// SPELL_AURA_MOD_MANA_REGEN_INTERRUPT total (0–100). Meditation / Arcane Meditation / Reflection: 5/10/15
// at ranks 1–3. Cite: StatSystem.cpp UpdateManaRegen ~558.
export function talentManaRegenInterruptPct(char: Character, ds: DataStore): number {
  let sum = 0;
  for (const e of activeTalentEffects(char, ds)) {
    if (e.kind === 'mana_regen_interrupt') sum += e.pct;
    else if (e.kind === 'other' && e.aura === AURA_MOD_MANA_REGEN_INTERRUPT) {
      sum += talentSimpleAmount(e.basePoints);
    }
  }
  return Math.min(100, Math.max(0, sum));
}

// GetResistancePenetration per school (positive = ignore that much of target resist/armor). Aura amount is
// typically negative; pen = -amount. Cite: Unit.cpp ~3890–3894.
export function talentResistancePenetration(char: Character, ds: DataStore): Partial<Record<School, number>> {
  const pen: Partial<Record<School, number>> = {};
  const add = (amount: number, schoolMask: number): void => {
    // amount is aura modifier (e.g. -5); penetration = -amount
    const p = -amount;
    if (!p || !schoolMask) return;
    for (const [sch, bit] of Object.entries(SCHOOL_MASK_BIT) as [School, number][]) {
      if (schoolMask & bit) pen[sch] = (pen[sch] ?? 0) + p;
    }
  };
  for (const e of activeTalentEffects(char, ds)) {
    if (e.kind === 'target_resistance') add(e.amount, e.schoolMask);
    else if (e.kind === 'other' && e.aura === AURA_MOD_TARGET_RESISTANCE) {
      add(talentSimpleAmount(e.basePoints), e.miscValue || 0);
    }
  }
  return pen;
}

// m_threatModifier[school] multipliers from SPELL_AURA_MOD_THREAT, stacking multiplicatively as
// var *= (100+pct)/100 with a default of 1. Cite: SpellAuras.cpp HandleModThreat.
export function talentThreatModifiers(char: Character, ds: DataStore): Partial<Record<School, number>> {
  const mods: Partial<Record<School, number>> = {};
  const apply = (pct: number, schoolMask: number): void => {
    if (!pct || !schoolMask) return;
    const factor = (100 + pct) / 100;
    for (const [sch, bit] of Object.entries(SCHOOL_MASK_BIT) as [School, number][]) {
      if (schoolMask & bit) mods[sch] = (mods[sch] ?? 1) * factor;
    }
  };
  for (const e of activeTalentEffects(char, ds)) {
    if (e.kind === 'threat_pct') apply(e.pct, e.schoolMask);
    else if (e.kind === 'other' && e.aura === AURA_MOD_THREAT) {
      apply(talentSimpleAmount(e.basePoints), e.miscValue || 0);
    }
  }
  return mods;
}

// ---- Per-spell talent mods (spell_mod) applied via clones in the known* choke points ----
function cloneSpell(s: SpellDef): SpellDef {
  return {
    ...s,
    effects: s.effects ? s.effects.map((e) => ({ ...e })) : [],
  };
}

export function spellMatchesClassMask(spell: SpellDef, classMask: number[] | undefined): boolean {
  // IsFitToFamilyMask(0) is false: no family mask affects NOTHING. Read as "everything", Burning
  // Soul's Fire resist reached Frostbolt. Cite: Player.cpp:350-357; SpellMgr.cpp:2989-2999.
  if (!classMask || classMask.length === 0 || classMask.every((m) => m === 0)) return false;
  // Vanilla stores a spell's class mask in the 64-bit spellFamilyFlags; the WotLK-style
  // spellClassMask is baked only on some spells, so fall back to [low32, high32] of the flags.
  const sm = spell.spellClassMask ?? (spell.spellFamilyFlags != null
    ? [Number(spell.spellFamilyFlags) >>> 0, Math.floor(Number(spell.spellFamilyFlags) / 0x100000000) >>> 0]
    : []);
  for (let i = 0; i < 4; i++) {
    const c = classMask[i] || 0;
    const s = sm[i] || 0;
    if ((c & s) !== 0) return true;
  }
  return false;
}

type SpellModEffect = Extract<TalentEffect, { kind: 'spell_mod' }>;
type SpellModAttr = SpellModEffect['attr'];

/** Convert talent spell_mod effects into pure SpellMod entries for one attr. */
function toSpellMods(mods: SpellModEffect[], attr: SpellModAttr): SpellMod[] {
  const op = attrToSpellModOp(attr);
  return mods.map((m) => ({
    type: m.pct ? ('pct' as const) : ('flat' as const),
    value: m.value || 0,
    op,
  }));
}

// Apply aggregated FLAT+PCT mods for one attr onto a clone. Uses Player::ApplySpellMod math once per base
// field (additive totalpct). Cite: Player.h:2575–2630; spellMods.ts.
function applyAggregatedModsToClone(sp: SpellDef, attr: SpellModAttr, mods: SpellModEffect[]): void {
  if (!mods.length) return;
  const spellMods = toSpellMods(mods, attr);
  const op = attrToSpellModOp(attr);
  const clamp0 = (x: number) => Math.max(0, x);

  switch (attr) {
    case 'castTime': {
      const { value } = applySpellMod(sp.castTimeMs, spellMods, { op });
      sp.castTimeMs = clamp0(value);
      break;
    }
    case 'cost': {
      // Baked spell_mod.value is raw EffectBasePoints, so the real amount is Bp + 1 for a die-1
      // aura. Rage costs are internal units (×10) — without /10 Improved Heroic Strike r3 zeroes HS.
      const costMods = mods.map((m) => {
        if (m.pct) return m;
        let v = (m.value || 0) + 1; // Bp → simple
        if (sp.powerType === 'rage' || sp.powerType === 'focus') v = v / 10;
        return { ...m, value: v };
      });
      const costSpellMods = toSpellMods(costMods, attr);
      const { value } = applySpellMod(sp.cost, costSpellMods, { op });
      sp.cost = clamp0(Math.round(value));
      break;
    }
    case 'cooldown': {
      const { value } = applySpellMod(sp.cooldownMs, spellMods, { op });
      sp.cooldownMs = clamp0(value);
      break;
    }
    case 'duration': {
      // Duration lives on dot/cc/buff effects; apply once per effect base.
      for (const eff of sp.effects) {
        if ((eff as { durationMs?: number }).durationMs != null) {
          const base = (eff as { durationMs: number }).durationMs;
          const { value } = applySpellMod(base, spellMods, { op });
          (eff as { durationMs: number }).durationMs = clamp0(value);
        }
      }
      // A CP finisher scales its base toward the spell-level max (SnD 6000 -> 21000), so a mod that
      // moved only the effect base was dropped whole at 5 points. Cite: applySpell.ts:1178.
      if (sp.durationMaxMs != null) {
        const { value } = applySpellMod(sp.durationMaxMs, spellMods, { op });
        sp.durationMaxMs = clamp0(value);
      }
      break;
    }
    case 'damage': {
      for (const eff of sp.effects) {
        if (eff.kind === 'direct_damage' || eff.kind === 'dot') {
          const d = eff as { min?: number; max?: number };
          const { value: minV } = applySpellMod(d.min || 0, spellMods, { op });
          const { value: maxV } = applySpellMod(d.max || 0, spellMods, { op });
          d.min = minV;
          d.max = maxV;
        }
      }
      break;
    }
    case 'critChance': {
      // Combat reads _talentCritBonus as percentage points on the crit roll: sum flat values, and
      // pct-flagged entries too. Full ApplySpellMod on crit rate happens at roll time.
      let total = ((sp as { _talentCritBonus?: number })._talentCritBonus || 0);
      for (const m of mods) total += m.value || 0;
      (sp as { _talentCritBonus?: number })._talentCritBonus = total;
      break;
    }
    case 'threat': {
      // SPELLMOD_THREAT — stored as pct points for CalcThreat. Cite: ThreatManager.cpp:49.
      // Additive across talents (matches ApplySpellMod totalpct delta accumulation).
      let total = sp.threatSpellModPct ?? 0;
      for (const m of mods) total += m.value || 0;
      sp.threatSpellModPct = total;
      break;
    }
    case 'radius':
      // Filtered out in withTalentMods — combat applies SPELLMOD_RADIUS at the
      // area-aura seam with the correct mod owner. Never here.
      break;
    case 'notLoseCastingTime': {
      // SPELLMOD_NOT_LOSE_CASTING_TIME (op 9) — PCT points for Delayed/DelayedChannel. The bake
      // already stamps EffectBasePoints+1 (Imp. Arcane Missiles r1 19 → 20), so adding 1 here again
      // paid 21%. Cite: Spell.cpp:6848; talent-port.mjs `simple`.
      let total = sp.notLoseCastingTimePct ?? 0;
      for (const m of mods) total += m.value | 0;
      sp.notLoseCastingTimePct = total;
      break;
    }
  }
}

// Clone `spell` with all matching talent spell_mod effects applied, aggregating per attr (flat sum
// plus additive totalpct) then applying once, so two −10% cost mods give ×0.80, not ×0.81.
export function withTalentMods(spell: SpellDef, talentEffects: TalentEffect[]): SpellDef {
  const mods = talentEffects.filter((e): e is SpellModEffect =>
    e.kind === 'spell_mod'
    // SPELLMOD_RADIUS is not baked into the clone: combat owns it at the area-aura maintain seam,
    // where the mod owner is the totem's shaman. Scaling here too would double Totemic Mastery.
    && e.attr !== 'radius'
    && spellMatchesClassMask(spell, e.classMask)
  );
  if (!mods.length) return spell;

  // Group by attr, then aggregate+apply once per attr (not sequential compound).
  const byAttr = new Map<SpellModAttr, SpellModEffect[]>();
  for (const m of mods) {
    const list = byAttr.get(m.attr);
    if (list) list.push(m);
    else byAttr.set(m.attr, [m]);
  }

  const c = cloneSpell(spell);
  for (const [attr, attrMods] of byAttr) {
    applyAggregatedModsToClone(c, attr, attrMods);
  }
  return c;
}
