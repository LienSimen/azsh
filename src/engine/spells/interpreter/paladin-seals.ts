// Paladin seal materialization: the DB stores coefficients and judgement ids on dummy slots rather
// than a ready seal effect, so the retired enricher's rank-generic mapping is ported here.

import type { JudgementBurst, SpellDef, SpellEffect } from '../../../data/schema.ts';
import { effectAmountRange } from './amount.ts';
import { durMs } from './duration.ts';
import {
  SPELL_AURA_DUMMY,
  SPELL_AURA_MOD_ATTACK_POWER,
  SPELL_AURA_PROC_TRIGGER_SPELL,
  SPELL_EFFECT_APPLY_AURA,
} from './opcodes.ts';

/** Classic seal duration (DurationIndex 9 → 30s). Cite: FALLBACK_DURATION_MS[9]; enricher. */
export const SEAL_DURATION_MS = 30_000;

/** Seal of Command PPM. Cite: spell_proc_event.ppmRate for SoC; enrich-paladin-seals.mjs SOC_PPM. */
export const SOC_PPM = 7;

// Seal of Command on-swing weapon damage percent. Cite: spell 20424 Effect 31 WEAPON_PERCENT_DAMAGE
// basePoints 69 → amount 70.
export const SOC_WEAPON_PCT = 70;

/** SPELLFAMILY_PALADIN seal family flags (IsSealSpell). Cite: SpellMgr.h:265–269 — 0x000000000A000200. */
export const SEAL_FAMILY_FLAGS_MASK = 0x0a000200;

/** SPELLFAMILY_PALADIN. Cite: SharedDefines SpellFamilyName. */
const SPELLFAMILY_PALADIN = 10;

/** SpellDefines.h:433 — Spell.cpp:458 sets `m_ignoreHitResult` from this bit. */
export const TRIGGERED_IGNORE_HIT_CALCULATION = 0x00000002;
/** SpellDefines.h:441. */
export const TRIGGERED_IGNORE_GCD = 0x00000200;
/** SpellDefines.h:444. */
export const TRIGGERED_IGNORE_CURRENT_CASTED_SPELL = 0x00001000;

// Paladin.cpp:115 `CastSpell(unitTarget, spellId2, these flags)`. Spell.cpp:951 then forces
// `SPELL_MISS_NONE`, so JoR 20187 never misses even without EX3_ALWAYS_HIT.
export const JUDGEMENT_PAYLOAD_TRIGGER_FLAGS =
  TRIGGERED_IGNORE_GCD | TRIGGERED_IGNORE_CURRENT_CASTED_SPELL | TRIGGERED_IGNORE_HIT_CALCULATION;

export function triggeredSpellIgnoresHitResult(flags: number): boolean {
  return (flags & TRIGGERED_IGNORE_HIT_CALCULATION) !== 0;
}

// Judgement of Righteousness damage by carrier spell id, from the baked rows' base points and dice.
// Cite: spell-data Judgement of Righteousness ranks 20187-20286.
const JOR_BY_SPELL_ID: Readonly<Record<number, { min: number; max: number }>> = {
  20187: { min: 15, max: 15 }, // Rank 1 bp14 d1 s1
  20280: { min: 25, max: 27 }, // Rank 2 bp24 d1 s3
  20281: { min: 39, max: 43 }, // Rank 3 bp38 d1 s5
  20282: { min: 57, max: 63 }, // Rank 4 bp56 d1 s7
  20283: { min: 78, max: 86 }, // Rank 5 bp77 d1 s9
  20284: { min: 102, max: 112 }, // Rank 6 bp101 d1 s11
  20285: { min: 131, max: 143 }, // Rank 7 bp130 d1 s13
  20286: { min: 162, max: 178 }, // Rank 8 bp161 d1 s17
};

/** JoR carrier id by rank — the coefficient lives on the carrier, so the fallback needs it too. */
const JOR_ID_BY_RANK: Readonly<Record<number, number>> = {
  1: 20187, 2: 20280, 3: 20281, 4: 20282, 5: 20283, 6: 20284, 7: 20285, 8: 20286,
};

/** JoR by rank number (for seals missing effect-2 judgement pointer, e.g. 20154). */
const JOR_BY_RANK: Readonly<Record<number, { min: number; max: number }>> = {
  1: JOR_BY_SPELL_ID[20187]!,
  2: JOR_BY_SPELL_ID[20280]!,
  3: JOR_BY_SPELL_ID[20281]!,
  4: JOR_BY_SPELL_ID[20282]!,
  5: JOR_BY_SPELL_ID[20283]!,
  6: JOR_BY_SPELL_ID[20284]!,
  7: JOR_BY_SPELL_ID[20285]!,
  8: JOR_BY_SPELL_ID[20286]!,
};

// The Judgement of Command intermediate to its damage carrier: the intermediate is a dummy whose
// simple value is the damage spell id. Cite: Paladin.cpp:155-162 JudgementOfCommand.
const JOC_INTERMEDIATE_TO_DAMAGE: Readonly<Record<number, number>> = {
  20425: 20467, // Rank 1
  20962: 20963, // Rank 2
  20961: 20964, // Rank 3
  20967: 20965, // Rank 4
  20968: 20966, // Rank 5
};

/** JoC SCHOOL_DAMAGE carriers. Cite: Paladin.cpp:155–162. */
export const JUDGEMENT_OF_COMMAND_DAMAGE_IDS = new Set([20467, 20963, 20964, 20965, 20966]);

// Judgement of Command damage by carrier id, sourced from the CMaNGOS Spell.sql rows — the damage
// carriers were never extracted into the live bake.
const JOC_BY_DAMAGE_ID: Readonly<Record<number, { min: number; max: number }>> = {
  20467: { min: 93, max: 101 },
  20963: { min: 146, max: 160 },
  20964: { min: 204, max: 224 },
  20965: { min: 261, max: 287 },
  20966: { min: 339, max: 373 },
};

/** JoC carrier id by rank — pairs with JOC_BY_RANK so the fallback can carry the coefficient. */
const JOC_ID_BY_RANK: Readonly<Record<number, number>> = {
  1: 20467, 2: 20963, 3: 20964, 4: 20965, 5: 20966,
};

/** JoC by SoC rank (player seal ranks 1–5). */
const JOC_BY_RANK: Readonly<Record<number, { min: number; max: number }>> = {
  1: JOC_BY_DAMAGE_ID[20467]!,
  2: JOC_BY_DAMAGE_ID[20963]!,
  3: JOC_BY_DAMAGE_ID[20964]!,
  4: JOC_BY_DAMAGE_ID[20965]!,
  5: JOC_BY_DAMAGE_ID[20966]!,
};

// Seal of Light's on-swing heal by seal rank, from the heal carrier's own effect rows.
// Cite: bake spell-data Seal of Light carriers 20167, 20333, 20334, 20340.
const SOL_HEAL_BY_RANK: Readonly<Record<number, number>> = {
  1: 39,
  2: 53,
  3: 76,
  4: 94,
};

// Seal of Wisdom's on-swing mana by seal rank, from the energize carrier's base points and dice.
// Cite: bake spell-data Seal of Wisdom carriers 20168, 20350, 20351.
const SOW_MANA_BY_RANK: Readonly<Record<number, number>> = {
  1: 50,
  2: 71,
  3: 90,
};

// Judgement of Light's debuff id to the on-hit heal for whoever strikes the target. The heal carriers
// are absent from the live bake, so the amounts come from Spell.sql. Cite: Paladin.cpp:37-55.
const JOL_ON_HIT_HEAL_BY_DEBUFF_ID: Readonly<Record<number, number>> = {
  20185: 25, // Rank 1 → 20267
  20344: 34, // Rank 2 → 20341
  20345: 49, // Rank 3 → 20342
  20346: 61, // Rank 4 → 20343
};

// Judgement of Wisdom's debuff id to the on-hit mana for whoever strikes the target. The carriers are
// absent from the live bake, so the amounts come from Spell.sql. Cite: Paladin.cpp:58-75.
const JOW_ON_HIT_MANA_BY_DEBUFF_ID: Readonly<Record<number, number>> = {
  20186: 33, // Rank 1 → 20268
  20354: 46, // Rank 2 → 20352
  20355: 59, // Rank 3 → 20353
};

// Judgement of the Crusader's debuff id to its flat holy damage taken, from Spell.sql base points and
// dice. Rank 1 is absent from the live bake inventory, so this table is the authority.
const JOC_SPELL_TAKEN_BY_DEBUFF_ID: Readonly<Record<number, number>> = {
  21183: 20, // Rank 1
  20188: 30, // Rank 2
  20300: 50, // Rank 3
  20301: 80, // Rank 4
  20302: 110, // Rank 5
  20303: 140, // Rank 6
};

// Classic Judgement of Light / Wisdom / Crusader debuff duration (DurationIndex 1 → 10s). Cite: live bake
// 20185/20186/20188 durationIndex 1 → durMs 10000.
const JOL_JOW_DEBUFF_DURATION_MS = 10_000;

/** CMaNGOS CalculateSimpleValue. Cite: DBCStructure.h:817. */
export function calculateSimpleValue(basePoints: number, baseDice: number): number {
  return (basePoints | 0) + (baseDice | 0);
}

// pickByRank from enrich-paladin-seals.mjs: exact rank, else highest rank ≤ request, else lowest available.
export function pickByRank<T>(map: Readonly<Record<number, T>>, rank: number): T | null {
  if (map[rank] != null) return map[rank]!;
  const ranks = Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b);
  if (!ranks.length) return null;
  let best = ranks[0]!;
  for (const r of ranks) if (r <= rank) best = r;
  return map[best] ?? null;
}

function rankOf(spell: SpellDef): number {
  const r = spell.rank | 0;
  return r > 0 ? r : 0;
}

function sealDurationMs(spell: SpellDef): number {
  const fromIdx = durMs(spell.durationIndex);
  if (fromIdx != null && fromIdx > 0) return fromIdx;
  return SEAL_DURATION_MS;
}

// The judgement spell id stored on the seal's dummy slot. The C++ walks the dummy auras at effect
// index 2; the bake often packs the pointer as the last dummy that is not the seal coefficient.
function judgementSpellIdFromSeal(spell: SpellDef): number | null {
  const raw = spell.rawEffects;
  if (!raw?.length) return null;

  // Prefer slot index 2 when present (CMaNGOS EFFECT_INDEX_2).
  if (raw.length >= 3) {
    const slot2 = raw[2]!;
    if (
      (slot2.effect | 0) === SPELL_EFFECT_APPLY_AURA &&
      (slot2.auraName | 0) === SPELL_AURA_DUMMY
    ) {
      const id = calculateSimpleValue(slot2.basePoints | 0, slot2.baseDice | 0);
      if (id > 1) return id;
    }
  }

  // Two-slot seals: last DUMMY whose simple value looks like a spell id (> 1000),
  // not a SoR coefficient (107..1785 range can overlap — prefer trigger-adjacent slot).
  for (let i = raw.length - 1; i >= 0; i--) {
    const r = raw[i]!;
    if ((r.effect | 0) !== SPELL_EFFECT_APPLY_AURA) continue;
    if ((r.auraName | 0) !== SPELL_AURA_DUMMY) continue;
    const id = calculateSimpleValue(r.basePoints | 0, r.baseDice | 0);
    // Spell ids for judgements are ≥ 20184 in Classic; SoR coeffs are ≤ 1785.
    if (id > 2000) return id;
  }
  return null;
}

// SoR coefficient: first SPELL_AURA_DUMMY with basePoints > 1 that is NOT a judgement spell id pointer.
// Cite: enrich-paladin-seals.mjs Effect1 aura 4 DUMMY bp; SoR r1=107.
function sorCoefficient(spell: SpellDef): number | null {
  for (const r of spell.rawEffects ?? []) {
    if ((r.effect | 0) !== SPELL_EFFECT_APPLY_AURA) continue;
    if ((r.auraName | 0) !== SPELL_AURA_DUMMY) continue;
    const bp = r.basePoints | 0;
    if (bp <= 1) continue;
    const simple = calculateSimpleValue(bp, r.baseDice | 0);
    // Judgement pointers are spell ids (> 2000); coeffs are 107..1785.
    if (simple > 2000) continue;
    return bp; // enricher used EffectBasePoints, not simple value
  }
  return null;
}

function jorBurst(spell: SpellDef): JudgementBurst | undefined {
  const jid = judgementSpellIdFromSeal(spell);
  if (jid != null && JOR_BY_SPELL_ID[jid]) {
    const d = JOR_BY_SPELL_ID[jid]!;
    return { school: 'holy', min: d.min, max: d.max, spellId: jid };
  }
  const rank = rankOf(spell) || 1;
  const d = pickByRank(JOR_BY_RANK, rank);
  return d
    ? { school: 'holy', min: d.min, max: d.max, ...(JOR_ID_BY_RANK[rank] ? { spellId: JOR_ID_BY_RANK[rank] } : {}) }
    : undefined;
}

function jocBurst(spell: SpellDef): JudgementBurst | undefined {
  const jid = judgementSpellIdFromSeal(spell);
  if (jid != null) {
    const dmgId = JOC_INTERMEDIATE_TO_DAMAGE[jid] ?? jid;
    const d = JOC_BY_DAMAGE_ID[dmgId];
    if (d) {
      return {
        school: 'holy',
        min: d.min,
        max: d.max,
        spellId: dmgId,
        // Cite: Paladin.cpp:155–162 JudgementOfCommand SetDamage(/2) unless stunned.
        halveIfNotStunned: true,
      };
    }
  }
  const rank = rankOf(spell) || 1;
  const d = pickByRank(JOC_BY_RANK, rank);
  return d
    ? {
      school: 'holy',
      min: d.min,
      max: d.max,
      halveIfNotStunned: true,
      ...(JOC_ID_BY_RANK[rank] ? { spellId: JOC_ID_BY_RANK[rank] } : {}),
    }
    : undefined;
}

// Judgement of Light: seal effect-2 → debuff id; on-hit heal from heal-carrier table. Cite: Paladin.cpp
// spell_judgement CastSpell(spellId2); JoL intermediate rank switch.
function jolJudge(spell: SpellDef): JudgementBurst | undefined {
  const jid = judgementSpellIdFromSeal(spell);
  if (jid == null) return undefined;
  const heal = JOL_ON_HIT_HEAL_BY_DEBUFF_ID[jid];
  if (heal == null) return undefined;
  return {
    school: 'holy',
    min: 0,
    max: 0,
    debuffSpellId: jid,
    debuffName: 'Judgement of Light',
    debuffDurationMs: JOL_JOW_DEBUFF_DURATION_MS,
    onHitHeal: heal,
  };
}

// Judgement of Wisdom: seal effect-2 → debuff id; on-hit mana from energize-carrier table. Cite:
// Paladin.cpp spell_judgement; JoW intermediate rank switch.
function jowJudge(spell: SpellDef): JudgementBurst | undefined {
  const jid = judgementSpellIdFromSeal(spell);
  if (jid == null) return undefined;
  const mana = JOW_ON_HIT_MANA_BY_DEBUFF_ID[jid];
  if (mana == null) return undefined;
  return {
    school: 'holy',
    min: 0,
    max: 0,
    debuffSpellId: jid,
    debuffName: 'Judgement of Wisdom',
    debuffDurationMs: JOL_JOW_DEBUFF_DURATION_MS,
    onHitMana: mana,
  };
}

// Judgement of the Crusader: seal effect-2 CalculateSimpleValue → JoC debuff id + spell_taken. Cite:
// Paladin.cpp:78–116 spell_judgement CastSpell(spellId2); Spell.sql JoC aura 14 amounts.
function jocCrusaderJudge(spell: SpellDef): JudgementBurst | undefined {
  const jid = judgementSpellIdFromSeal(spell);
  if (jid == null) return undefined;
  const spellTaken = JOC_SPELL_TAKEN_BY_DEBUFF_ID[jid];
  if (spellTaken == null) return undefined;
  return {
    school: 'holy',
    min: 0,
    max: 0,
    debuffSpellId: jid,
    debuffName: 'Judgement of the Crusader',
    debuffDurationMs: JOL_JOW_DEBUFF_DURATION_MS,
    spellTaken,
  };
}

// True when this spell is a castable player seal we materialize (not intermediate carriers like SoC
// on-swing 20424 or Judgement-of-X damage shells).
export function isMaterializableSeal(spell: SpellDef): boolean {
  const name = spell.name ?? '';
  if (
    name === 'Seal of Righteousness' ||
    name === 'Seal of Command' ||
    name === 'Seal of Light' ||
    name === 'Seal of Wisdom' ||
    name === 'Seal of Justice' ||
    name === 'Seal of the Crusader'
  ) {
    // On-swing and intermediate carriers share the name but carry no self-apply duration package.
    // The Crusader player ranks carry the dummy judgement pointer plus their attack-power auras.
    const raw = spell.rawEffects ?? [];
    const hasSelfAura = raw.some(
      (r) =>
        (r.effect | 0) === SPELL_EFFECT_APPLY_AURA &&
        ((r.auraName | 0) === SPELL_AURA_DUMMY ||
          (r.auraName | 0) === SPELL_AURA_PROC_TRIGGER_SPELL),
    );
    if (!hasSelfAura) return false;
    // Player seals are family 10 + IsSealSpell flags (optional soft check).
    if (((spell.spellFamilyName ?? 0) | 0) === SPELLFAMILY_PALADIN) {
      const flags = ((spell.spellFamilyFlags ?? 0) | 0) >>> 0;
      if (flags !== 0 && (flags & SEAL_FAMILY_FLAGS_MASK) === 0) return false;
    }
    return true;
  }
  return false;
}

// Build the engine `seal` SpellEffect for a live-bake seal spell, or null if not a seal. Rank-generic:
// coefficients from rawEffects; JoR/JoC/heal/mana tables by rank / spell id.
export function materializePaladinSeal(spell: SpellDef): SpellEffect | null {
  if (!isMaterializableSeal(spell)) return null;

  const name = spell.name ?? '';
  const durationMs = sealDurationMs(spell);
  const rank = rankOf(spell);

  if (name === 'Seal of Righteousness') {
    const coeff = sorCoefficient(spell);
    if (coeff == null) return null;
    const judge = jorBurst(spell);
    const fx: SpellEffect = {
      kind: 'seal',
      seal: 'righteousness',
      durationMs,
      coeff,
      ...(judge ? { judge } : {}),
    };
    return fx;
  }

  if (name === 'Seal of Command') {
    const judge = jocBurst(spell);
    const fx: SpellEffect = {
      kind: 'seal',
      seal: 'command',
      durationMs,
      procPpm: SOC_PPM,
      onSwingWeaponPct: SOC_WEAPON_PCT,
      ...(judge ? { judge } : {}),
    };
    return fx;
  }

  if (name === 'Seal of Light') {
    const heal = pickByRank(SOL_HEAL_BY_RANK, rank || 1);
    if (heal == null) return null;
    const judge = jolJudge(spell);
    return {
      kind: 'seal',
      seal: 'light',
      durationMs,
      onSwingHeal: heal,
      ...(judge ? { judge } : {}),
    };
  }

  if (name === 'Seal of Wisdom') {
    const mana = pickByRank(SOW_MANA_BY_RANK, rank || 1);
    if (mana == null) return null;
    const judge = jowJudge(spell);
    return {
      kind: 'seal',
      seal: 'wisdom',
      durationMs,
      onSwingMana: mana,
      ...(judge ? { judge } : {}),
    };
  }

  if (name === 'Seal of Justice') {
    // Justice's stun-on-hit is a proc aura in the C++, not an on-swing seal, but it materializes as a
    // seal so judgement and seal exclusion still work. The trigger row is kept beside this shell.
    return {
      kind: 'seal',
      seal: 'justice',
      durationMs,
    };
  }

  if (name === 'Seal of the Crusader') {
    // No on-swing holy: judgement casts the Crusader debuff, a flat holy damage taken. The companion
    // attack power and attack speed ride beside this shell rather than folding into the seal.
    const judge = jocCrusaderJudge(spell);
    return {
      kind: 'seal',
      seal: 'crusader',
      durationMs,
      ...(judge ? { judge } : {}),
    };
  }

  return null;
}

// True for the Crusader self-stat buffs kept beside the seal. Attack power ONLY: the attack-speed half
// is DPS-neutral in C++ through a paired main-hand damage cut this engine cannot express.
function isCrusaderStatBuff(e: SpellEffect): boolean {
  return e.kind === 'buff' && e.mod === 'attack_power';
}

// Attack power from the Crusader raw slot when neither the interpreter nor the bake emitted it, as
// base points plus dice with no level term. The attack-speed slot is deliberately skipped.
function crusaderStatBuffsFromRaw(spell: SpellDef): SpellEffect[] {
  const out: SpellEffect[] = [];
  const durationMs = sealDurationMs(spell);
  for (const r of spell.rawEffects ?? []) {
    if ((r.effect | 0) !== SPELL_EFFECT_APPLY_AURA) continue;
    if ((r.auraName | 0) !== SPELL_AURA_MOD_ATTACK_POWER) continue;
    const { min } = effectAmountRange(r, {});
    out.push({ kind: 'buff', mod: 'attack_power', amount: min, durationMs, hostile: false });
  }
  return out;
}

// The full effect list for a materializable seal: the shell plus the companions that must not be
// dropped. Stat buffs are listed BEFORE the shell, or the display chip lands first and skips them.
export function sealMaterializedEffects(
  sealFx: SpellEffect,
  spell: SpellDef,
  interpEffects: readonly SpellEffect[],
): SpellEffect[] {
  if (sealFx.kind !== 'seal') return [sealFx];

  if (sealFx.seal === 'justice') {
    const fromInterp = interpEffects.filter((e) => e.kind === 'proc_trigger_spell');
    const fromBake = (spell.effects ?? []).filter((e) => e.kind === 'proc_trigger_spell');
    const pts = fromInterp.length ? fromInterp : fromBake.map((e) => ({ ...e }));
    return [sealFx, ...pts];
  }

  if (sealFx.seal === 'crusader') {
    let stats = interpEffects.filter(isCrusaderStatBuff);
    if (!stats.length) {
      stats = (spell.effects ?? []).filter(isCrusaderStatBuff).map((e) => ({ ...e }));
    }
    if (!stats.length) stats = crusaderStatBuffsFromRaw(spell);
    // Stats before seal: applySpell sheetBaked treats a mod-less chip as sheet-owned.
    return [...stats, sealFx];
  }

  return [sealFx];
}
