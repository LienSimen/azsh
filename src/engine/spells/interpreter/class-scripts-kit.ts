// Class-script helpers registered as spell scripts: pure constants and lookups, with no invented
// coefficients. Cite: ClassScripts/{Warrior,Rogue,Mage,Hunter,Druid}.cpp.

import type { SpellDef } from '../../../data/schema.ts';
import { SPELL_AURA_PROC_TRIGGER_SPELL } from './opcodes.ts';

/** Intimidating Shout. Cite: Spell.cpp:7981–7984; spell_template 5246. */
export const INTIMIDATING_SHOUT_SPELL_ID = 5246;

/** Blackout stun payload. Cite: spell_template 15268–15326 trigger 15269; Priest.cpp:46-53. */
export const BLACKOUT_STUN_SPELL_ID = 15269;

/** Blackout does not proc from heals or non-damage spells. Cite: Priest.cpp:50-51. */
export function blackoutProcAllowed(fromSpell: { role?: string; effects?: ReadonlyArray<{ kind: string }> } | null | undefined): boolean {
  if (!fromSpell) return true;
  if ((fromSpell.role ?? '') === 'heal') return false;
  const kinds = fromSpell.effects ?? [];
  if (kinds.some((e) => e.kind === 'heal' || e.kind === 'restore_health')) return false;
  return kinds.some((e) =>
    e.kind === 'direct_damage' || e.kind === 'dot' || e.kind === 'weapon_percent_damage');
}

/** Retaliation self-buff. Cite: Warrior.cpp RetaliationWarrior; Spell.sql 20230. */
export const RETALIATION_AURA_SPELL_ID = 20230;

/** Earthbind Totem snare — does not break Stealth. Cite: Rogue.cpp:37–52 SPELL_EARTHBIND. */
export const EARTHBIND_SPELL_ID = 3600;

/** Setup talent ranks. Cite: Rogue.cpp:112–118 SetupRogue; spell_template 13983/14070/14071. */
export const SETUP_TALENT_SPELL_IDS = [13983, 14070, 14071] as const;
/** Bake ICD 1000s is wrong; CMaNGOS Cooldown=0. Cite: mangos.sql spell_proc_event 13983. */
export const SETUP_PROC_COOLDOWN_MS = 0;

/** Setup OnCheckProc: current target == attacker. Cite: Rogue.cpp:115–117. */
export function setupProcAllowed(
  currentTargetSide: string | null | undefined,
  attackerSide: string,
): boolean {
  return currentTargetSide != null && currentTargetSide === attackerSide;
}

/** Stealth aura OnCheckProc. Earthbind returns false. Cite: Rogue.cpp:47-52. */
export function stealthProcAllowedForSpell(spellId: number): boolean {
  return (spellId | 0) !== EARTHBIND_SPELL_ID;
}

/** Sap ranks strip MOD_STEALTH on hit. Cite: Rogue.cpp:92–100 SapRogue. */
export const SAP_SPELL_IDS = new Set([6770, 2070, 11297]);

/** spell_improved_sap payload. Cite: sql/scriptdev2/spell.sql 14093; Rogue.cpp:105–109. */
export const IMPROVED_SAP_TRIGGER_SPELL_ID = 14093;

/** Setup ADD_COMBO_POINTS trigger. Cite: spell_template 13983 EffectTriggerSpell 15250. */
export const SETUP_TRIGGER_SPELL_ID = 15250;

// Shatter talent rank → frozen crit bonus (percentage points). Misc on aura 112: 849/910/911/912/913 →
// +10/20/30/40/50. Cite: Mage.cpp:60–67 ShatterMage OnCritChanceCalculate.
export const SHATTER_FROZEN_CRIT_BONUS: Readonly<Record<number, number>> = {
  849: 10,
  910: 20,
  911: 30,
  912: 40,
  913: 50,
};

/** Shatter talent spell ids (aura 112 holders). Cite: spell_template Shatter ranks. */
export const SHATTER_TALENT_SPELL_IDS = [11170, 12982, 12983, 12984, 12985] as const;

// Shatter spell id → frozen crit bonus (same as misc table; avoids rawEffects lookup). Cite:
// Mage.cpp:60–67; spell_template 11170 misc 849 … 12985 misc 913.
export const SHATTER_CRIT_BONUS_BY_SPELL: Readonly<Record<number, number>> = {
  11170: 10,
  12982: 20,
  12983: 30,
  12984: 40,
  12985: 50,
};

// Improved Blizzard override script → Chilled trigger. Cite: Mage.cpp:117–123 HasOverrideScript 836/988/989
// → 12484/12485/12486.
export const IMPROVED_BLIZZARD_CHILL_BY_SCRIPT: Readonly<Record<number, number>> = {
  836: 12484,
  988: 12485,
  989: 12486,
};

/** Improved Blizzard talent ranks (aura 112 misc 836/988/989). */
export const IMPROVED_BLIZZARD_TALENT_SPELL_IDS = [11185, 12487, 12488] as const;

/** Blizzard family ranks (persistent AA). Cite: spell_template 10 chain. */
export const BLIZZARD_SPELL_IDS = new Set([
  10, 6141, 8427, 10185, 10186, 10187,
]);

// Improved Fire Ward — HasSpell → absorb += CalculateSpellEffectValue(eff0). Bp+1: 11094→10, 13043→20.
// Cite: Mage.cpp:81–84; amount.ts bp+baseDice.
export const IMPROVED_FIRE_WARD_ABSORB: Readonly<Record<number, number>> = {
  11094: 10,
  13043: 20,
};

// Frost Warding — HasAura → absorb += CalculateSpellEffectValue(eff1). Bp+1 on slot 1: 11189→10, 28332→20.
// Cite: Mage.cpp:98–101.
export const FROST_WARDING_ABSORB: Readonly<Record<number, number>> = {
  11189: 10,
  28332: 20,
};

/** Fire Ward ranks. Cite: spell_template Fire Ward. */
export const FIRE_WARD_SPELL_IDS = new Set([543, 8457, 8458, 10223, 10225]);

/** Frost Ward ranks. Cite: spell_template Frost Ward. */
export const FROST_WARD_SPELL_IDS = new Set([6143, 8461, 8462, 10177, 28609]);

/** Clean Escape (Darkmantle 2pc): Vanish OnCast if aura 23582 → cast 23583. Cite: Rogue.cpp:87–88. */
export const CLEAN_ESCAPE_AURA_SPELL_ID = 23582;
export const CLEAN_ESCAPE_HEAL_SPELL_ID = 23583;

/** Stealth base rank for Vanish CastHighestStealthRank. Cite: Rogue.cpp:65 LookupHighestLearnedRank(1784). */
export const STEALTH_BASE_SPELL_ID = 1784;

/** Stealth ranks LookupHighestLearnedRank(1784) walks. Cite: Rogue.cpp:65; spell_template 1784–1787. */
export const STEALTH_RANK_SPELL_IDS = [1784, 1785, 1786, 1787] as const;

/** Highest learned Stealth in chain 1784. Cite: Rogue.cpp:65 LookupHighestLearnedRank(1784). */
export function lookupHighestLearnedStealth(
  known: readonly SpellDef[],
  chainOf?: (spellId: number) => { first: number; rank: number } | undefined,
): SpellDef | undefined {
  let best: SpellDef | undefined;
  let bestRank = -1;
  for (const s of known) {
    const id = s.id | 0;
    const node = chainOf?.(id);
    const inChain = node
      ? (node.first | 0) === STEALTH_BASE_SPELL_ID
      : (STEALTH_RANK_SPELL_IDS as readonly number[]).includes(id);
    if (!inChain) continue;
    const listed = (STEALTH_RANK_SPELL_IDS as readonly number[]).indexOf(id);
    const rank = node?.rank ?? (listed >= 0 ? listed + 1 : 1);
    if (rank >= bestRank) {
      bestRank = rank;
      best = s;
    }
  }
  return best;
}

/** Aura-42 holder whose trigger is 14093. Cite: spell_template Improved Sap EffectTriggerSpell. */
export function improvedSapHolderFromKnown(known: readonly SpellDef[]): SpellDef | undefined {
  let best: SpellDef | undefined;
  let bestRank = -1;
  for (const s of known) {
    const raw = s.rawEffects;
    if (!raw) continue;
    let holds = false;
    for (const r of raw) {
      if ((r.auraName | 0) === SPELL_AURA_PROC_TRIGGER_SPELL
        && (r.triggerSpell | 0) === IMPROVED_SAP_TRIGGER_SPELL_ID) {
        holds = true;
        break;
      }
    }
    if (!holds) continue;
    const rank = s.rank | 0;
    if (rank >= bestRank) {
      bestRank = rank;
      best = s;
    }
  }
  return best;
}

/** ProcChance / customChance as 0..1. Cite: UnitAuraProcHandler.cpp:590–595 roll_chance_f. */
export function procChanceUnitFromRow(spell: SpellDef): number | null {
  const pe = spell.spellProcEvent;
  let pct = 0;
  if (pe?.customChance != null && pe.customChance > 0) pct = pe.customChance;
  else if (spell.procChance != null && spell.procChance > 0) pct = spell.procChance;
  if (!(pct > 0)) return null;
  return pct > 1 ? Math.min(1, pct / 100) : Math.min(1, pct);
}

function emptyTriggerShell(id: number, name: string): SpellDef {
  return {
    id,
    name,
    rank: 0,
    school: 'physical',
    powerType: 'energy',
    cost: 0,
    castTimeMs: 0,
    cooldownMs: 0,
    gcdMs: 0,
    rangeMax: 0,
    reqLevel: 0,
    effects: [],
  };
}

/** Missing-bake inject for Setup 15250 / Vanished 14093. Cite: spell-data; SpellEffects.cpp:4213–4222; SpellEffectDefines.h 79. */
export function syntheticTalentTriggerPayload(triggerSpellId: number): SpellDef | null {
  const id = triggerSpellId | 0;
  if (id === SETUP_TRIGGER_SPELL_ID) {
    const row = emptyTriggerShell(id, 'Setup');
    // bp 0 + baseDice 1. Cite: amount.ts min = basePoints + max(baseDice, 0); spell-data 15250.
    row.effects = [{ kind: 'combo_points', amount: 1 }];
    return row;
  }
  if (id === IMPROVED_SAP_TRIGGER_SPELL_ID) {
    const row = emptyTriggerShell(id, 'Vanished');
    // Effect 79 is dummy; OnSuccessfulFinish recasts Stealth. Cite: Rogue.cpp:105–109; spell.sql 14093.
    row.effects = [{ kind: 'script_handled_noop' }];
    return row;
  }
  return null;
}

// Shatter frozen crit bonus from caster known/buffed Shatter ranks. Cite: Mage.cpp:58–70. Swiftmend. Cite:
// scriptdev2 spell.sql 18562 spell_swiftmend; Druid.cpp:22-31.
export const SWIFTMEND_SPELL_ID = 18562;
/** Rejuvenation | Regrowth family mask. Cite: Druid.cpp:28 GetAura(..., 0x50). */
export const SWIFTMEND_HOT_FAMILY_FLAGS = 0x50;

/** True when the target has Rejuv or Regrowth. Cite: Druid.cpp:28 SPELLFAMILY_DRUID 0x50. */
export function hasSwiftmendHot(
  auras: ReadonlyArray<{ auraType?: number; spellFamilyName?: number; spellFamilyFlags?: number }>,
): boolean {
  for (const a of auras) {
    if ((a.auraType ?? 0) !== 8) continue; // SPELL_AURA_PERIODIC_HEAL
    if ((a.spellFamilyName ?? 0) !== 7) continue; // SPELLFAMILY_DRUID
    if (((a.spellFamilyFlags ?? 0) & SWIFTMEND_HOT_FAMILY_FLAGS) !== 0) return true;
  }
  return false;
}

export function shatterFrozenCritBonus(
  knownOrBuffed: ReadonlySet<number> | Iterable<number> | undefined,
): number {
  if (!knownOrBuffed) return 0;
  let best = 0;
  for (const id of knownOrBuffed) {
    const bonus = SHATTER_CRIT_BONUS_BY_SPELL[id | 0];
    if (bonus != null && bonus > best) best = bonus;
  }
  return best;
}

/** One live aura mirror row, narrowed to what AURA_STATE_FROZEN reads. */
export interface FrozenAuraRow {
  kind: string;
  target: string;
  expiresAt: number;
  school?: string;
  control?: string;
}

// Frozen for Shatter means a live root or stun aura whose SPELL school is frost; a nature root is not.
// Cite: Unit.cpp:9830 AURA_STATE_FROZEN; SpellAuras.cpp:2463-2464, :2738-2739.
export function targetIsFrozenForShatter(opts: {
  auras: readonly FrozenAuraRow[];
  targetSide: string;
  now: number;
}): boolean {
  return opts.auras.some((a) => (
    a.target === opts.targetSide
    && a.expiresAt > opts.now
    && a.school === 'frost'
    && (a.kind === 'root' || (a.kind === 'cc' && (a.control === 'stun' || a.control === 'root')))
  ));
}

// Improved Blizzard chill spell id for a caster with talent override scripts active. Highest rank wins (989
// > 988 > 836). Cite: Mage.cpp:117–122 sequential overwrite.
export function improvedBlizzardChillSpellId(
  hasOverrideScript: (scriptId: number) => boolean,
): number {
  let spellId = 0;
  if (hasOverrideScript(836)) spellId = IMPROVED_BLIZZARD_CHILL_BY_SCRIPT[836]!;
  if (hasOverrideScript(988)) spellId = IMPROVED_BLIZZARD_CHILL_BY_SCRIPT[988]!;
  if (hasOverrideScript(989)) spellId = IMPROVED_BLIZZARD_CHILL_BY_SCRIPT[989]!;
  return spellId;
}

// Flat absorb add for Fire Ward from Improved Fire Ward (HasSpell — known talent). Cite: Mage.cpp:79–85.
export function fireWardTalentAbsorbBonus(
  knownSpellIds: ReadonlySet<number> | Iterable<number> | undefined,
): number {
  if (!knownSpellIds) return 0;
  const known = knownSpellIds instanceof Set ? knownSpellIds : new Set(knownSpellIds);
  if (known.has(13043)) return IMPROVED_FIRE_WARD_ABSORB[13043]!;
  if (known.has(11094)) return IMPROVED_FIRE_WARD_ABSORB[11094]!;
  return 0;
}

/** Flat absorb add for Frost Ward from Frost Warding (HasAura — buffActive). Cite: Mage.cpp:96–102. */
export function frostWardTalentAbsorbBonus(
  buffActive: ReadonlySet<number> | undefined,
): number {
  if (!buffActive) return 0;
  if (buffActive.has(28332)) return FROST_WARDING_ABSORB[28332]!;
  if (buffActive.has(11189)) return FROST_WARDING_ABSORB[11189]!;
  return 0;
}

// Furor ranks 1-5 -> proc chance %, read off the talent's own dummy amount (Bp+1: 19->20 ... 99->100).
// Cite: SpellAuras.cpp:1946-1952 SpellIconID 238 dummy; talents.json tab 282 Furor.
export const FUROR_SPELL_IDS = [17056, 17058, 17059, 17060, 17061] as const;

// The chance percent of the highest Furor rank this unit holds, 0 without the talent. It takes a
// predicate because one caller holds a kit and the other the spellbook's id list.
export function furorChancePctBy(has: (id: number) => boolean): number {
  for (let i = FUROR_SPELL_IDS.length - 1; i >= 0; i--) {
    if (has(FUROR_SPELL_IDS[i])) return (i + 1) * 20;
  }
  return 0;
}

/** The kit form. */
export function furorChancePct(spells: readonly { id: number }[] | undefined): number {
  if (!spells) return 0;
  return furorChancePctBy((id) => spells.some((sp) => sp.id === id));
}

/** Furor 17099: 40 energy on a Cat shift. Cite: spell-data 17099 energize powerType 3 min/max 40. */
export const FUROR_CAT_ENERGY = 40;
/** Furor 17057: 100 internal rage on a Bear shift, and this tree's UI pool is internal/10. */
export const FUROR_BEAR_RAGE = 10;

/** Predatory Strikes ranks → AP% of level. Cite: Druid.cpp:57–64. */
export const PREDATORY_STRIKES_SPELL_IDS = [16975, 16974, 16972] as const;

// Form MOD_ATTACK_POWER bonus from Predatory Strikes: level * amount / 100. Amount is aura modifier (Bp+1):
// 50/100/150. Cite: Druid.cpp:63–64.
export function predatoryStrikesFormApBonus(
  level: number,
  predatoryAmountPct: number,
): number {
  return Math.trunc((Math.max(0, level | 0) * (predatoryAmountPct | 0)) / 100);
}


// Improved Scorpid Sting: the sting's own family-flag bit. The C++ tests flags only, and over the bake
// the four Scorpid Sting ranks are the ONLY aura-29 spells carrying it. Cite: SpellAuras.cpp:3453.
export const SCORPID_STING_FAMILY_FLAG = 0x8000;

/** The stamina debuff C++ casts. Cite: SpellAuras.cpp:3470 CastCustomSpell(target, 19486). */
export const IMPROVED_SCORPID_STING_SPELL_ID = 19486;

/** Talent rank script -> percent of the Strength reduction taken off Stamina too. */
export const IMPROVED_SCORPID_STING_PCT_BY_SCRIPT: Readonly<Record<number, number>> = {
  2388: 10,
  2389: 20,
  2390: 30,
};

// The stamina the rider removes: the sting's own stat modifier scaled by the talent percent. The sting
// amount is negative and the C++ integer division truncates toward zero. Cite: SpellAuras.cpp:3456.
export function improvedScorpidStingStamina(
  statAmount: number,
  hasScript: (scriptId: number) => boolean,
): number {
  for (const scriptId of [2388, 2389, 2390]) {
    if (!hasScript(scriptId)) continue;
    const pct = IMPROVED_SCORPID_STING_PCT_BY_SCRIPT[scriptId]!;
    return Math.trunc((statAmount * pct) / 100);
  }
  return 0;
}

// A cast's effect list plus any rider the CASTER's class scripts add. Riders cannot live in the bake:
// they depend on who is casting. Improved Scorpid Sting is the only one, riding the sting's holder.
export function effectsWithScriptRiders(
  spell: {
    spellFamilyFlags?: number | bigint | null;
    effects: readonly unknown[];
  },
  hasScript: (scriptId: number) => boolean,
): readonly unknown[] {
  const flags = Number(spell.spellFamilyFlags ?? 0);
  if (!(flags & SCORPID_STING_FAMILY_FLAG)) return spell.effects;
  // Both stat slots (Strength and Agility) carry the same amount, and C++ re-casts 19486 on
  // each one, replacing the holder. Read slot 0 and add the rider once.
  const first = spell.effects.find(
    (e) => (e as { kind?: string; mod?: string }).kind === 'buff'
      && (e as { mod?: string }).mod === 'strength',
  ) as { amount?: number; durationMs?: number } | undefined;
  const amount = Number(first?.amount ?? 0);
  if (!amount) return spell.effects;
  const stamina = improvedScorpidStingStamina(amount, hasScript);
  if (!stamina) return spell.effects;
  return [
    ...spell.effects,
    {
      kind: 'buff',
      mod: 'stamina',
      amount: stamina,
      durationMs: first?.durationMs ?? 0,
      hostile: true,
    },
  ];
}

// Curse of Agony ranks bound to spell_curse_of_agony. Cite: scriptdev2 spell.sql
// 980/1014/6217/11711/11712/11713; Warlock.cpp:259.
export const CURSE_OF_AGONY_SPELL_IDS = new Set([980, 1014, 6217, 11711, 11712, 11713]);

export function isCurseOfAgonySpellId(id: number): boolean {
  return CURSE_OF_AGONY_SPELL_IDS.has(id | 0);
}

// Periodic amount for GetAuraTicks (1-based). Ticks 1–4 half, 5–8 full, 9–12 ×3/2. Cite: Warlock.cpp:23–34
// CurseOfAgony OnPeriodicCalculateAmount.
export function curseOfAgonyTickAmount(base: number, auraTicks: number): number {
  const amount = base | 0;
  const ticks = auraTicks | 0;
  if (ticks <= 4) return Math.trunc(amount / 2);
  if (ticks >= 9) return amount + Math.trunc((amount + 1) / 2);
  return amount;
}

// -- Healing Way (Shaman.cpp HealingWay; OPEN 135) ---------------------------
/** Buff 29203. Cite: scriptdev2 spell.sql spell_healing_way; Shaman.cpp:77–89. */
export const HEALING_WAY_BUFF_SPELL_ID = 29203;
/** Talent ranks 1/2/3. Cite: spell_template 29206/29205/29202. */
export const HEALING_WAY_TALENT_RANK1_SPELL_ID = 29206;
export const HEALING_WAY_TALENT_RANK2_SPELL_ID = 29205;
export const HEALING_WAY_TALENT_RANK3_SPELL_ID = 29202;
/** StackAmount on 29203. Cite: spell_template 29203. */
export const HEALING_WAY_MAX_STACKS = 3;
/** Dummy bp+1. Cite: spell_template 29203 basePoints 5 dieSides 1. */
export const HEALING_WAY_AMOUNT_PCT = 6;
/** DurationIndex 8. Cite: SpellDuration.csv; duration.ts FALLBACK_DURATION_MS[8]. */
export const HEALING_WAY_DURATION_MS = 15_000;
/** Healing Wave SpellFamilyFlags. Cite: mangos.sql spell_affect 29202/29205/29206 → 0x40. */
export const HEALING_WAVE_FAMILY_FLAGS = 0x40;
/** SPELLFAMILY_SHAMAN. Cite: DBCEnums.h:171. */
export const HEALING_WAY_SPELLFAMILY_SHAMAN = 11;
// Proc chance % from EffectBasePoints+1. Cite: Spell.cpp:7457–7458; spell_template 29206 bp32→33 / 29205
// bp65→66 / 29202 bp99→100.
export const HEALING_WAY_CHANCE_PCT: Readonly<Record<number, number>> = {
  [HEALING_WAY_TALENT_RANK1_SPELL_ID]: 33,
  [HEALING_WAY_TALENT_RANK2_SPELL_ID]: 66,
  [HEALING_WAY_TALENT_RANK3_SPELL_ID]: 100,
};
// spell_affect ClassFamilyMask for ADD_TARGET_TRIGGER whose EffectItemType is 0. Cite: SpellMgr.h:1950–1958
// GetSpellAffectMask; mangos.sql spell_affect (29202,0,0x40) (29205,0,0x40) (29206,0,0x40).
export const SPELL_AFFECT_MASK_ADD_TARGET_TRIGGER: Readonly<Record<number, number>> = {
  [HEALING_WAY_TALENT_RANK1_SPELL_ID]: HEALING_WAVE_FAMILY_FLAGS,
  [HEALING_WAY_TALENT_RANK2_SPELL_ID]: HEALING_WAVE_FAMILY_FLAGS,
  [HEALING_WAY_TALENT_RANK3_SPELL_ID]: HEALING_WAVE_FAMILY_FLAGS,
};

/** Talent holder spell ids. Cite: spell_template 29206/29205/29202. */
export function isHealingWayTalentSpellId(id: number): boolean {
  return (
    id === HEALING_WAY_TALENT_RANK1_SPELL_ID
    || id === HEALING_WAY_TALENT_RANK2_SPELL_ID
    || id === HEALING_WAY_TALENT_RANK3_SPELL_ID
  );
}

/** True when the heal is Healing Wave (not Lesser). Cite: spell_template flags 0x40 family 11. */
export function isHealingWaveSpell(
  spellFamilyName: number | undefined,
  spellFamilyFlags: number | bigint | undefined,
): boolean {
  return (
    ((spellFamilyName ?? 0) | 0) === HEALING_WAY_SPELLFAMILY_SHAMAN
    && (Number(spellFamilyFlags ?? 0) & HEALING_WAVE_FAMILY_FLAGS) !== 0
  );
}

/** Stacked Healing Way percent: 6 × stacks. Cite: Shaman.cpp:85–88 amount+100 / 100 per stack. */
export function healingWayTakenPct(stacks: number, amountPct: number): number {
  const n = Math.max(0, Math.min(HEALING_WAY_MAX_STACKS, stacks | 0));
  return n * (amountPct | 0);
}
