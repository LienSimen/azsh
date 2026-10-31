// World npc_professions ScriptDev IR ports. Source: scripts/world/npc_professions.cpp —
// npc_prof_blacksmith, npc_prof_leather and go_soothsaying_for_dummies. Every value cites file:line.

import type { ScriptDevIR } from './types.ts';

// Constants — npc_professions.cpp enums

/** Cite: npc_professions.cpp:97 S_WEAPON = 9787 */
export const S_WEAPON = 9787;
/** Cite: npc_professions.cpp:98 S_ARMOR = 9788 */
export const S_ARMOR = 9788;
/** Cite: npc_professions.cpp:99 S_HAMMER = 17040 */
export const S_HAMMER = 17040;
/** Cite: npc_professions.cpp:100 S_AXE = 17041 */
export const S_AXE = 17041;
/** Cite: npc_professions.cpp:101 S_SWORD = 17039 */
export const S_SWORD = 17039;
/** Cite: npc_professions.cpp:102 S_LEARN_WEAPON = 9789 */
export const S_LEARN_WEAPON = 9789;
/** Cite: npc_professions.cpp:103 S_LEARN_ARMOR = 9790 */
export const S_LEARN_ARMOR = 9790;
/** Cite: npc_professions.cpp:104 S_LEARN_HAMMER = 17044 */
export const S_LEARN_HAMMER = 17044;
/** Cite: npc_professions.cpp:105 S_LEARN_AXE = 17043 */
export const S_LEARN_AXE = 17043;
/** Cite: npc_professions.cpp:106 S_LEARN_SWORD = 17042 */
export const S_LEARN_SWORD = 17042;
/** Cite: npc_professions.cpp:107 S_REP_ARMOR = 17451 */
export const S_REP_ARMOR = 17451;
/** Cite: npc_professions.cpp:108 S_REP_WEAPON = 17452 */
export const S_REP_WEAPON = 17452;

/** Cite: npc_professions.cpp:109 REP_ARMOR = 46 (Blacksmithing - Armorsmithing) */
export const REP_ARMOR = 46;
/** Cite: npc_professions.cpp:110 REP_WEAPON = 289 (Blacksmithing - Weaponsmithing) */
export const REP_WEAPON = 289;
/** Cite: npc_professions.cpp:111 REP_HAMMER = 569 */
export const REP_HAMMER = 569;
/** Cite: npc_professions.cpp:112 REP_AXE = 570 */
export const REP_AXE = 570;
/** Cite: npc_professions.cpp:113 REP_SWORD = 571 */
export const REP_SWORD = 571;

/** Cite: SharedDefines.h ReputationRank REP_FRIENDLY = 4 */
export const REP_FRIENDLY = 4;

/** Cite: npc_professions.cpp:116 S_DRAGON = 10656 */
export const S_DRAGON = 10656;
/** Cite: npc_professions.cpp:117 S_ELEMENTAL = 10658 */
export const S_ELEMENTAL = 10658;
/** Cite: npc_professions.cpp:118 S_TRIBAL = 10660 */
export const S_TRIBAL = 10660;
/** Cite: npc_professions.cpp:119 S_LEARN_DRAGON = 10657 */
export const S_LEARN_DRAGON = 10657;
/** Cite: npc_professions.cpp:120 S_LEARN_ELEMENTAL = 10659 */
export const S_LEARN_ELEMENTAL = 10659;
/** Cite: npc_professions.cpp:121 S_LEARN_TRIBAL = 10661 */
export const S_LEARN_TRIBAL = 10661;
/** Cite: npc_professions.cpp:122 S_UNLEARN_DRAGON = 36434 */
export const S_UNLEARN_DRAGON = 36434;
/** Cite: npc_professions.cpp:123 S_UNLEARN_ELEMENTAL = 36328 */
export const S_UNLEARN_ELEMENTAL = 36328;
/** Cite: npc_professions.cpp:124 S_UNLEARN_TRIBAL = 36433 */
export const S_UNLEARN_TRIBAL = 36433;

/** Cite: npc_professions.cpp:140 Q_DRAGON_ALLY = 5141 */
export const Q_DRAGON_ALLY = 5141;
/** Cite: npc_professions.cpp:141 Q_DRAGON_HORDE = 5145 */
export const Q_DRAGON_HORDE = 5145;
/** Cite: npc_professions.cpp:142 Q_ELEMENTAL_ALLY = 5144 */
export const Q_ELEMENTAL_ALLY = 5144;
/** Cite: npc_professions.cpp:143 Q_ELEMENTAL_HORDE = 5146 */
export const Q_ELEMENTAL_HORDE = 5146;
/** Cite: npc_professions.cpp:144 Q_TRIBAL_ALLY = 5143 */
export const Q_TRIBAL_ALLY = 5143;
/** Cite: npc_professions.cpp:145 Q_TRIBAL_HORDE = 5148 */
export const Q_TRIBAL_HORDE = 5148;

/** Cite: npc_professions.cpp:151 N_TRAINER_SMITHOMNI1 = 11145 Myolor Sunderfury */
export const N_TRAINER_SMITHOMNI1 = 11145;
/** Cite: npc_professions.cpp:152 N_TRAINER_SMITHOMNI2 = 11176 Krathok Moltenfist */
export const N_TRAINER_SMITHOMNI2 = 11176;
/** Cite: npc_professions.cpp:153 N_TRAINER_WEAPON1 = 11146 Ironus Coldsteel */
export const N_TRAINER_WEAPON1 = 11146;
/** Cite: npc_professions.cpp:154 N_TRAINER_WEAPON2 = 11178 Borgosh Corebender */
export const N_TRAINER_WEAPON2 = 11178;
/** Cite: npc_professions.cpp:155 N_TRAINER_ARMOR1 = 5164 Grumnus Steelshaper */
export const N_TRAINER_ARMOR1 = 5164;
/** Cite: npc_professions.cpp:156 N_TRAINER_ARMOR2 = 11177 Okothos Ironrager */
export const N_TRAINER_ARMOR2 = 11177;
/** Cite: npc_professions.cpp:157 N_TRAINER_HAMMER = 11191 Lilith the Lithe */
export const N_TRAINER_HAMMER = 11191;
/** Cite: npc_professions.cpp:158 N_TRAINER_AXE = 11192 Kilram */
export const N_TRAINER_AXE = 11192;
/** Cite: npc_professions.cpp:159 N_TRAINER_SWORD = 11193 Seril Scourgebane */
export const N_TRAINER_SWORD = 11193;

/** Cite: npc_professions.cpp:162 N_TRAINER_DRAGON1 = 7866 Peter Galen */
export const N_TRAINER_DRAGON1 = 7866;
/** Cite: npc_professions.cpp:163 N_TRAINER_DRAGON2 = 7867 Thorkaf Dragoneye */
export const N_TRAINER_DRAGON2 = 7867;
/** Cite: npc_professions.cpp:164 N_TRAINER_ELEMENTAL1 = 7868 Sarah Tanner */
export const N_TRAINER_ELEMENTAL1 = 7868;
/** Cite: npc_professions.cpp:165 N_TRAINER_ELEMENTAL2 = 7869 Brumn Winterhoof */
export const N_TRAINER_ELEMENTAL2 = 7869;
/** Cite: npc_professions.cpp:166 N_TRAINER_TRIBAL1 = 7870 Caryssia Moonhunter */
export const N_TRAINER_TRIBAL1 = 7870;
/** Cite: npc_professions.cpp:167 N_TRAINER_TRIBAL2 = 7871 Se'Jib */
export const N_TRAINER_TRIBAL2 = 7871;

// GO Soothsaying for Dummies — commented binding. Cite: npc_professions.cpp:37 UPDATE ScriptName; :638–645
// pGOUse commented; :665–669 RegisterSelf commented.
export const GO_SOOTHSAYING_FOR_DUMMIES = 177226;

// Skill line ids from the extract-professions SkillLine map and classic-db RequiredSkill on the
// BS specialization quests: 164 blacksmithing, 165 leatherworking.
export const SKILL_BLACKSMITHING = 164;
export const SKILL_LEATHERWORKING = 165;

/** Gossip senders (file-local, not sc_gossip defaults). Cite: npc_professions.cpp:57–59 */
export const GOSSIP_SENDER_LEARN = 50;
export const GOSSIP_SENDER_UNLEARN = 51;
export const GOSSIP_SENDER_CHECK = 52;

// sc_gossip.h GOSSIP_SENDER_MAIN / GOSSIP_ACTION_*. Cite: sc_gossip.h:112–114 GOSSIP_ACTION_INFO_DEF=1000,
// TRADE=1, TRAIN=2, SENDER_MAIN=1
export const GOSSIP_SENDER_MAIN = 1;
export const GOSSIP_ACTION_TRADE = 1;
export const GOSSIP_ACTION_TRAIN = 2;
export const GOSSIP_ACTION_INFO_DEF = 1000;

/** Relative action offsets used in cpp (absolute = INFO_DEF + n). */
export const BS_ACTION_LEARN_ARMOR = 1;
export const BS_ACTION_LEARN_WEAPON = 2;
export const BS_ACTION_UNLEARN_WEAPON = 3;
export const BS_ACTION_UNLEARN_ARMOR = 4;
export const BS_ACTION_LEARN_HAMMER = 5;
export const BS_ACTION_LEARN_AXE = 6;
export const BS_ACTION_LEARN_SWORD = 7;
export const BS_ACTION_UNLEARN_HAMMER = 8;
export const BS_ACTION_UNLEARN_AXE = 9;
export const BS_ACTION_UNLEARN_SWORD = 10;

export const LW_ACTION_UNLEARN_DRAGON = 1;
export const LW_ACTION_LEARN_DRAGON = 2;
export const LW_ACTION_UNLEARN_ELEMENTAL = 3;
export const LW_ACTION_LEARN_ELEMENTAL = 4;
export const LW_ACTION_UNLEARN_TRIBAL = 5;
export const LW_ACTION_LEARN_TRIBAL = 6;

// Skill and level gates. Cite: npc_professions.cpp:288 skill ≥ 225; :319 level > 49 and skill ≥ 250;
// :504 skill ≥ 225 and level > 39.
export const BS_OMNI_SKILL_MIN = 225;
export const BS_WEAPON_SUB_SKILL_MIN = 250;
export const BS_WEAPON_SUB_LEVEL_MIN = 50; // cpp: GetLevel() > 49
export const LW_SPEC_SKILL_MIN = 225;
export const LW_SPEC_LEVEL_MIN = 40; // cpp: GetLevel() > 39

// Unlearn cost brackets (copper). Cite: npc_professions.cpp:174–183 GetUnlearnCostMedium Cite:
// npc_professions.cpp:185–190 GetUnlearnCostLow
export const UNLEARN_COST_MEDIUM_LT_51 = 250_000;
export const UNLEARN_COST_MEDIUM_LT_66 = 500_000;
export const UNLEARN_COST_MEDIUM_GE_66 = 1_000_000;
export const UNLEARN_COST_LOW_LT_66 = 50_000;
export const UNLEARN_COST_LOW_GE_66 = 100_000;

/** Cite: SpellDefines.h TRIGGERED_OLD_TRIGGERED (QI4 residual / cpp CastSpell). */
export const TRIGGERED_OLD_TRIGGERED = 0x1;

/** ProfessionUnlearnSpells recipe spell removals by unlearn type. Cite: npc_professions.cpp:223–267 */
export const PROFESSION_UNLEARN_SPELLS: Record<number, readonly number[]> = {
  [S_UNLEARN_DRAGON]: [
    36076, 36079, 35576, 35577, 35575, 35582, 35584, 35580,
  ],
  [S_UNLEARN_ELEMENTAL]: [36074, 36077, 35590, 35591, 35589],
  [S_UNLEARN_TRIBAL]: [35585, 35587, 35588, 36075, 36078],
};

/** All DB-bound blacksmith ScriptName creatures (corpus boundCreatures). */
export const BS_BOUND_CREATURES = [
  N_TRAINER_ARMOR1,
  N_TRAINER_SMITHOMNI1,
  N_TRAINER_WEAPON1,
  N_TRAINER_SMITHOMNI2,
  N_TRAINER_ARMOR2,
  N_TRAINER_WEAPON2,
  N_TRAINER_HAMMER,
  N_TRAINER_AXE,
  N_TRAINER_SWORD,
] as const;

/** All DB-bound leather ScriptName creatures. */
export const LW_BOUND_CREATURES = [
  N_TRAINER_DRAGON1,
  N_TRAINER_DRAGON2,
  N_TRAINER_ELEMENTAL1,
  N_TRAINER_ELEMENTAL2,
  N_TRAINER_TRIBAL1,
  N_TRAINER_TRIBAL2,
] as const;

// Pure helpers — cost formulas

/** Port of GetUnlearnCostMedium (blacksmith weapon sub + leather). Cite: npc_professions.cpp:174–183 */
export function getUnlearnCostMedium(level: number): number {
  if (level < 51) return UNLEARN_COST_MEDIUM_LT_51;
  if (level < 66) return UNLEARN_COST_MEDIUM_LT_66;
  return UNLEARN_COST_MEDIUM_GE_66;
}

/** Port of GetUnlearnCostLow (armor/weapon specialty unlearn confirm). Cite: npc_professions.cpp:185–190 */
export function getUnlearnCostLow(level: number): number {
  if (level < 66) return UNLEARN_COST_LOW_LT_66;
  return UNLEARN_COST_LOW_GE_66;
}

/** Port of HasWeaponSub. Cite: npc_professions.cpp:273–276 */
function collectionHas(
  c: ReadonlySet<number> | readonly number[],
  id: number,
): boolean {
  // Both Set and readonly arrays are iterable — avoid Array.isArray/Set narrowing traps
  // with ReadonlySet (interface, not class).
  for (const x of c) if (x === id) return true;
  return false;
}

export function hasWeaponSub(knownSpells: ReadonlySet<number> | readonly number[]): boolean {
  return collectionHas(knownSpells, S_HAMMER)
    || collectionHas(knownSpells, S_AXE)
    || collectionHas(knownSpells, S_SWORD);
}

/** Port of IsEligibleSpecializeLW. Cite: npc_professions.cpp:481–493 */
export function isEligibleSpecializeLW(opts: {
  knownSpells: ReadonlySet<number> | readonly number[];
  questRewarded: ReadonlySet<number> | readonly number[];
}): boolean {
  const hasSpell = (id: number) => collectionHas(opts.knownSpells, id);
  const hasQuest = (id: number) => collectionHas(opts.questRewarded, id);
  if (hasSpell(S_DRAGON) || hasSpell(S_ELEMENTAL) || hasSpell(S_TRIBAL)) {
    return false;
  }
  return (
    hasQuest(Q_DRAGON_ALLY) ||
    hasQuest(Q_DRAGON_HORDE) ||
    hasQuest(Q_ELEMENTAL_ALLY) ||
    hasQuest(Q_ELEMENTAL_HORDE) ||
    hasQuest(Q_TRIBAL_ALLY) ||
    hasQuest(Q_TRIBAL_HORDE)
  );
}

// Pure helpers — blacksmith gossip

export type BlacksmithGossipItem =
  | { kind: 'learn_armor'; action: number; cite: string }
  | { kind: 'learn_weapon'; action: number; cite: string }
  | { kind: 'unlearn_weapon'; action: number; cite: string }
  | { kind: 'unlearn_armor'; action: number; cite: string }
  | { kind: 'learn_hammer'; action: number; cite: string }
  | { kind: 'unlearn_hammer'; action: number; cite: string }
  | { kind: 'learn_axe'; action: number; cite: string }
  | { kind: 'unlearn_axe'; action: number; cite: string }
  | { kind: 'learn_sword'; action: number; cite: string }
  | { kind: 'unlearn_sword'; action: number; cite: string }
  | { kind: 'train'; action: number; cite: string }
  | { kind: 'trade'; action: number; cite: string };

export interface BlacksmithGossipHelloResult {
  items: BlacksmithGossipItem[];
  cite: string;
}

// Port of GossipHello_npc_prof_blacksmith option set (sans default menu text). Cite:
// npc_professions.cpp:278–346
export function blacksmithGossipHello(opts: {
  creatureEntry: number;
  skillBlacksmithing: number;
  level: number;
  knownSpells: ReadonlySet<number> | readonly number[];
  repArmorRank: number;
  repWeaponRank: number;
  isTrainer?: boolean;
  isVendor?: boolean;
}): BlacksmithGossipHelloResult {
  const has = (id: number) => collectionHas(opts.knownSpells, id);
  const items: BlacksmithGossipItem[] = [];
  const e = opts.creatureEntry;

  if (opts.isVendor) {
    items.push({
      kind: 'trade',
      action: GOSSIP_ACTION_TRADE,
      cite: 'npc_professions.cpp:282-283 vendor browse goods',
    });
  }

  // WEAPONSMITH & ARMORSMITH — skill ≥ 225
  // Cite: npc_professions.cpp:288–317
  if (opts.skillBlacksmithing >= BS_OMNI_SKILL_MIN) {
    if (e === N_TRAINER_SMITHOMNI1 || e === N_TRAINER_SMITHOMNI2) {
      if (!has(S_ARMOR) && !has(S_WEAPON) && opts.repArmorRank === REP_FRIENDLY) {
        items.push({
          kind: 'learn_armor',
          action: GOSSIP_ACTION_INFO_DEF + BS_ACTION_LEARN_ARMOR,
          cite: 'npc_professions.cpp:293-294 omni learn armor if Friendly REP_ARMOR',
        });
      }
      if (!has(S_WEAPON) && !has(S_ARMOR) && opts.repWeaponRank === REP_FRIENDLY) {
        items.push({
          kind: 'learn_weapon',
          action: GOSSIP_ACTION_INFO_DEF + BS_ACTION_LEARN_WEAPON,
          cite: 'npc_professions.cpp:295-296 omni learn weapon if Friendly REP_WEAPON',
        });
      }
    }
    if (e === N_TRAINER_WEAPON1 || e === N_TRAINER_WEAPON2) {
      if (has(S_WEAPON)) {
        items.push({
          kind: 'unlearn_weapon',
          action: GOSSIP_ACTION_INFO_DEF + BS_ACTION_UNLEARN_WEAPON,
          cite: 'npc_professions.cpp:300-302 weapon trainer unlearn when has S_WEAPON',
        });
        if (opts.isTrainer) {
          items.push({
            kind: 'train',
            action: GOSSIP_ACTION_TRAIN,
            cite: 'npc_professions.cpp:303-304 trainer list',
          });
        }
      }
    }
    if (e === N_TRAINER_ARMOR1 || e === N_TRAINER_ARMOR2) {
      if (has(S_ARMOR)) {
        items.push({
          kind: 'unlearn_armor',
          action: GOSSIP_ACTION_INFO_DEF + BS_ACTION_UNLEARN_ARMOR,
          cite: 'npc_professions.cpp:309-311 armor trainer unlearn when has S_ARMOR',
        });
        if (opts.isTrainer) {
          items.push({
            kind: 'train',
            action: GOSSIP_ACTION_TRAIN,
            cite: 'npc_professions.cpp:312-313 trainer list',
          });
        }
      }
    }
  }

  // WEAPONSMITH SPEC — has S_WEAPON, level > 49, skill ≥ 250
  // Cite: npc_professions.cpp:319–342
  if (
    has(S_WEAPON) &&
    opts.level > 49 &&
    opts.skillBlacksmithing >= BS_WEAPON_SUB_SKILL_MIN
  ) {
    const sub = hasWeaponSub(opts.knownSpells);
    if (e === N_TRAINER_HAMMER) {
      if (!sub) {
        items.push({
          kind: 'learn_hammer',
          action: GOSSIP_ACTION_INFO_DEF + BS_ACTION_LEARN_HAMMER,
          cite: 'npc_professions.cpp:324-325 learn hammer when no weapon sub',
        });
      }
      if (has(S_HAMMER)) {
        items.push({
          kind: 'unlearn_hammer',
          action: GOSSIP_ACTION_INFO_DEF + BS_ACTION_UNLEARN_HAMMER,
          cite: 'npc_professions.cpp:326-327 unlearn hammer',
        });
      }
    }
    if (e === N_TRAINER_AXE) {
      if (!sub) {
        items.push({
          kind: 'learn_axe',
          action: GOSSIP_ACTION_INFO_DEF + BS_ACTION_LEARN_AXE,
          cite: 'npc_professions.cpp:330-331 learn axe when no weapon sub',
        });
      }
      if (has(S_AXE)) {
        items.push({
          kind: 'unlearn_axe',
          action: GOSSIP_ACTION_INFO_DEF + BS_ACTION_UNLEARN_AXE,
          cite: 'npc_professions.cpp:332-333 unlearn axe',
        });
      }
    }
    if (e === N_TRAINER_SWORD) {
      if (!sub) {
        items.push({
          kind: 'learn_sword',
          action: GOSSIP_ACTION_INFO_DEF + BS_ACTION_LEARN_SWORD,
          cite: 'npc_professions.cpp:336-337 learn sword when no weapon sub',
        });
      }
      if (has(S_SWORD)) {
        items.push({
          kind: 'unlearn_sword',
          action: GOSSIP_ACTION_INFO_DEF + BS_ACTION_UNLEARN_SWORD,
          cite: 'npc_professions.cpp:338-339 unlearn sword',
        });
      }
    }
  }

  return {
    items,
    cite: 'npc_professions.cpp:278-346 GossipHello_npc_prof_blacksmith',
  };
}

export type BlacksmithGossipSelectResult =
  | {
      handled: true;
      phase: 'confirm_learn' | 'confirm_unlearn' | 'cast_learn' | 'close' | 'trade' | 'train';
      castSpellId: number | null;
      confirmCostCopper: number | null;
      closeMenu: boolean;
      cite: string;
    }
  | { handled: false; cite: string };

// Port of GossipSelect / SendActionMenu / SendConfirm* for the blacksmith. A relative action may be
// INFO_DEF + n or a bare n; both conventions are accepted. Cite: npc_professions.cpp:348–464.
export function blacksmithGossipSelect(opts: {
  sender: number;
  action: number;
  level: number;
  knownSpells: ReadonlySet<number> | readonly number[];
  creatureEntry: number;
}): BlacksmithGossipSelectResult {
  const has = (id: number) => collectionHas(opts.knownSpells, id);
  // Normalize to offset from INFO_DEF when absolute.
  const act =
    opts.action >= GOSSIP_ACTION_INFO_DEF
      ? opts.action - GOSSIP_ACTION_INFO_DEF
      : opts.action;

  // LEARN sender → confirm learn re-show
  // Cite: npc_professions.cpp:394–417,459
  if (opts.sender === GOSSIP_SENDER_LEARN) {
    return {
      handled: true,
      phase: 'confirm_learn',
      castSpellId: null,
      confirmCostCopper: null,
      closeMenu: false,
      cite: 'npc_professions.cpp:394-417 SendConfirmLearn_npc_prof_blacksmith',
    };
  }

  // UNLEARN sender → confirm unlearn with cost box
  // Cite: npc_professions.cpp:420–451,460
  if (opts.sender === GOSSIP_SENDER_UNLEARN) {
    let cost: number | null = null;
    const e = opts.creatureEntry;
    if (
      e === N_TRAINER_WEAPON1 ||
      e === N_TRAINER_WEAPON2 ||
      e === N_TRAINER_ARMOR1 ||
      e === N_TRAINER_ARMOR2
    ) {
      cost = getUnlearnCostLow(opts.level);
    } else if (
      e === N_TRAINER_HAMMER ||
      e === N_TRAINER_AXE ||
      e === N_TRAINER_SWORD
    ) {
      cost = getUnlearnCostMedium(opts.level);
    }
    return {
      handled: true,
      phase: 'confirm_unlearn',
      castSpellId: null,
      confirmCostCopper: cost,
      closeMenu: false,
      cite: 'npc_professions.cpp:420-451 SendConfirmUnlearn_npc_prof_blacksmith',
    };
  }

  // MAIN / CHECK → action menu Cite: npc_professions.cpp:348–392,458,461 TRADE/TRAIN are absolute sc_gossip
  // actions 1/2 — never INFO_DEF+n (INFO_DEF+1 = learn armor, INFO_DEF+2 = learn weapon).
  if (opts.sender === GOSSIP_SENDER_MAIN || opts.sender === GOSSIP_SENDER_CHECK) {
    if (opts.action === GOSSIP_ACTION_TRADE) {
      return {
        handled: true,
        phase: 'trade',
        castSpellId: null,
        confirmCostCopper: null,
        closeMenu: false,
        cite: 'npc_professions.cpp:352-354 SEND_VENDORLIST',
      };
    }
    if (opts.action === GOSSIP_ACTION_TRAIN) {
      return {
        handled: true,
        phase: 'train',
        castSpellId: null,
        confirmCostCopper: null,
        closeMenu: false,
        cite: 'npc_professions.cpp:355-357 SEND_TRAINERLIST',
      };
    }
    if (act === BS_ACTION_LEARN_ARMOR) {
      return {
        handled: true,
        phase: 'cast_learn',
        castSpellId: has(S_ARMOR) ? null : S_LEARN_ARMOR,
        confirmCostCopper: null,
        closeMenu: true,
        cite: 'npc_professions.cpp:359-366 CastSpell S_LEARN_ARMOR if !HasSpell(S_ARMOR)',
      };
    }
    if (act === BS_ACTION_LEARN_WEAPON) {
      return {
        handled: true,
        phase: 'cast_learn',
        castSpellId: has(S_WEAPON) ? null : S_LEARN_WEAPON,
        confirmCostCopper: null,
        closeMenu: true,
        cite: 'npc_professions.cpp:367-374 CastSpell S_LEARN_WEAPON if !HasSpell(S_WEAPON)',
      };
    }
    if (act === BS_ACTION_LEARN_HAMMER) {
      return {
        handled: true,
        phase: 'cast_learn',
        castSpellId: S_LEARN_HAMMER,
        confirmCostCopper: null,
        closeMenu: true,
        cite: 'npc_professions.cpp:376-378 CastSpell S_LEARN_HAMMER',
      };
    }
    if (act === BS_ACTION_LEARN_AXE) {
      return {
        handled: true,
        phase: 'cast_learn',
        castSpellId: S_LEARN_AXE,
        confirmCostCopper: null,
        closeMenu: true,
        cite: 'npc_professions.cpp:380-382 CastSpell S_LEARN_AXE',
      };
    }
    if (act === BS_ACTION_LEARN_SWORD) {
      return {
        handled: true,
        phase: 'cast_learn',
        castSpellId: S_LEARN_SWORD,
        confirmCostCopper: null,
        closeMenu: true,
        cite: 'npc_professions.cpp:384-386 CastSpell S_LEARN_SWORD',
      };
    }
    // Unlearn actions + unknown → CLOSE only (cpp default).
    // Cite: npc_professions.cpp:388-390
    return {
      handled: true,
      phase: 'close',
      castSpellId: null,
      confirmCostCopper: null,
      closeMenu: true,
      cite: 'npc_professions.cpp:388-390 default CLOSE_GOSSIP_MENU (unlearn cast not in SendActionMenu)',
    };
  }

  return { handled: false, cite: 'npc_professions.cpp:454-464 unknown sender' };
}

// Pure helpers — leather gossip

export type LeatherGossipItem =
  | { kind: 'unlearn_dragon'; action: number; costCopper: number; cite: string }
  | { kind: 'learn_dragon'; action: number; cite: string }
  | { kind: 'unlearn_elemental'; action: number; costCopper: number; cite: string }
  | { kind: 'learn_elemental'; action: number; cite: string }
  | { kind: 'unlearn_tribal'; action: number; costCopper: number; cite: string }
  | { kind: 'learn_tribal'; action: number; cite: string }
  | { kind: 'train'; action: number; cite: string }
  | { kind: 'trade'; action: number; cite: string };

export interface LeatherGossipHelloResult {
  items: LeatherGossipItem[];
  cite: string;
}

/** Port of GossipHello_npc_prof_leather option set. Cite: npc_professions.cpp:495–546 */
export function leatherGossipHello(opts: {
  creatureEntry: number;
  skillLeatherworking: number;
  level: number;
  knownSpells: ReadonlySet<number> | readonly number[];
  questRewarded: ReadonlySet<number> | readonly number[];
  isTrainer?: boolean;
  isVendor?: boolean;
}): LeatherGossipHelloResult {
  const has = (id: number) => collectionHas(opts.knownSpells, id);
  const items: LeatherGossipItem[] = [];
  const e = opts.creatureEntry;
  const cost = getUnlearnCostMedium(opts.level);
  const eligible = isEligibleSpecializeLW({
    knownSpells: opts.knownSpells,
    questRewarded: opts.questRewarded,
  });

  if (opts.isVendor) {
    items.push({
      kind: 'trade',
      action: GOSSIP_ACTION_TRADE,
      cite: 'npc_professions.cpp:499-500 vendor browse goods',
    });
  }

  // Cite: npc_professions.cpp:504–542
  if (
    opts.skillLeatherworking >= LW_SPEC_SKILL_MIN &&
    opts.level > 39
  ) {
    if (e === N_TRAINER_DRAGON1 || e === N_TRAINER_DRAGON2) {
      if (has(S_DRAGON)) {
        items.push({
          kind: 'unlearn_dragon',
          action: GOSSIP_ACTION_INFO_DEF + LW_ACTION_UNLEARN_DRAGON,
          costCopper: cost,
          cite: 'npc_professions.cpp:510-514 unlearn dragon + optional train',
        });
        if (opts.isTrainer) {
          items.push({
            kind: 'train',
            action: GOSSIP_ACTION_TRAIN,
            cite: 'npc_professions.cpp:513-514 trainer list',
          });
        }
      } else if (eligible) {
        items.push({
          kind: 'learn_dragon',
          action: GOSSIP_ACTION_INFO_DEF + LW_ACTION_LEARN_DRAGON,
          cite: 'npc_professions.cpp:516-517 learn dragon if eligible',
        });
      }
    }
    if (e === N_TRAINER_ELEMENTAL1 || e === N_TRAINER_ELEMENTAL2) {
      if (has(S_ELEMENTAL)) {
        items.push({
          kind: 'unlearn_elemental',
          action: GOSSIP_ACTION_INFO_DEF + LW_ACTION_UNLEARN_ELEMENTAL,
          costCopper: cost,
          cite: 'npc_professions.cpp:521-525 unlearn elemental + optional train',
        });
        if (opts.isTrainer) {
          items.push({
            kind: 'train',
            action: GOSSIP_ACTION_TRAIN,
            cite: 'npc_professions.cpp:524-525 trainer list',
          });
        }
      } else if (eligible) {
        items.push({
          kind: 'learn_elemental',
          action: GOSSIP_ACTION_INFO_DEF + LW_ACTION_LEARN_ELEMENTAL,
          cite: 'npc_professions.cpp:527-528 learn elemental if eligible',
        });
      }
    }
    if (e === N_TRAINER_TRIBAL1 || e === N_TRAINER_TRIBAL2) {
      if (has(S_TRIBAL)) {
        items.push({
          kind: 'unlearn_tribal',
          action: GOSSIP_ACTION_INFO_DEF + LW_ACTION_UNLEARN_TRIBAL,
          costCopper: cost,
          cite: 'npc_professions.cpp:532-536 unlearn tribal + optional train',
        });
        if (opts.isTrainer) {
          items.push({
            kind: 'train',
            action: GOSSIP_ACTION_TRAIN,
            cite: 'npc_professions.cpp:535-536 trainer list',
          });
        }
      } else if (eligible) {
        items.push({
          kind: 'learn_tribal',
          action: GOSSIP_ACTION_INFO_DEF + LW_ACTION_LEARN_TRIBAL,
          cite: 'npc_professions.cpp:538-539 learn tribal if eligible',
        });
      }
    }
  }

  return {
    items,
    cite: 'npc_professions.cpp:495-546 GossipHello_npc_prof_leather',
  };
}

export type LeatherGossipSelectResult =
  | {
      handled: true;
      phase:
        | 'trade'
        | 'train'
        | 'cast_learn'
        | 'cast_unlearn'
        | 'error_money'
        | 'error_equipped'
        | 'close';
      castSpellId: number | null;
      removeRecipeSpells: readonly number[];
      moneyDelta: number;
      closeMenu: boolean;
      cite: string;
    }
  | { handled: false; cite: string };

// Port of SendActionMenu_npc_prof_leather; `equippedOk` stands in for EquippedOk, which the caller
// supplies. Cite: npc_professions.cpp:548–620.
export function leatherGossipSelect(opts: {
  sender: number;
  action: number;
  level: number;
  moneyCopper: number;
  /** EquippedOk result for the pending unlearn spell (true = safe to unlearn). */
  equippedOk: boolean;
}): LeatherGossipSelectResult {
  if (opts.sender !== GOSSIP_SENDER_MAIN && opts.sender !== GOSSIP_SENDER_CHECK) {
    return { handled: false, cite: 'npc_professions.cpp:622-631 unknown sender' };
  }

  const act =
    opts.action >= GOSSIP_ACTION_INFO_DEF
      ? opts.action - GOSSIP_ACTION_INFO_DEF
      : opts.action;
  const cost = getUnlearnCostMedium(opts.level);

  // TRADE/TRAIN are absolute sc_gossip actions 1/2 — never INFO_DEF+n
  // (INFO_DEF+1 = unlearn dragon, INFO_DEF+2 = learn dragon).
  if (opts.action === GOSSIP_ACTION_TRADE) {
    return {
      handled: true,
      phase: 'trade',
      castSpellId: null,
      removeRecipeSpells: [],
      moneyDelta: 0,
      closeMenu: false,
      cite: 'npc_professions.cpp:552-554 SEND_VENDORLIST',
    };
  }
  if (opts.action === GOSSIP_ACTION_TRAIN) {
    return {
      handled: true,
      phase: 'train',
      castSpellId: null,
      removeRecipeSpells: [],
      moneyDelta: 0,
      closeMenu: false,
      cite: 'npc_professions.cpp:555-557 SEND_TRAINERLIST',
    };
  }

  const unlearnBranch = (
    unlearnSpell: number,
    cite: string,
  ): LeatherGossipSelectResult => {
    if (!opts.equippedOk) {
      return {
        handled: true,
        phase: 'error_equipped',
        castSpellId: null,
        removeRecipeSpells: [],
        moneyDelta: 0,
        closeMenu: true,
        cite: `${cite}; npc_professions.cpp:571-572 SendEquipError when !EquippedOk`,
      };
    }
    if (opts.moneyCopper < cost) {
      return {
        handled: true,
        phase: 'error_money',
        castSpellId: null,
        removeRecipeSpells: [],
        moneyDelta: 0,
        closeMenu: true,
        cite: `${cite}; npc_professions.cpp:569-570 SendBuyError not enough money`,
      };
    }
    return {
      handled: true,
      phase: 'cast_unlearn',
      castSpellId: unlearnSpell,
      removeRecipeSpells: PROFESSION_UNLEARN_SPELLS[unlearnSpell] ?? [],
      moneyDelta: -cost,
      closeMenu: true,
      cite,
    };
  };

  if (act === LW_ACTION_UNLEARN_DRAGON) {
    return unlearnBranch(
      S_UNLEARN_DRAGON,
      'npc_professions.cpp:559-574 unlearn dragon CastSpell + ProfessionUnlearnSpells + money',
    );
  }
  if (act === LW_ACTION_LEARN_DRAGON) {
    return {
      handled: true,
      phase: 'cast_learn',
      castSpellId: S_LEARN_DRAGON,
      removeRecipeSpells: [],
      moneyDelta: 0,
      closeMenu: true,
      cite: 'npc_professions.cpp:575-577 CastSpell S_LEARN_DRAGON',
    };
  }
  if (act === LW_ACTION_UNLEARN_ELEMENTAL) {
    return unlearnBranch(
      S_UNLEARN_ELEMENTAL,
      'npc_professions.cpp:579-594 unlearn elemental CastSpell + ProfessionUnlearnSpells + money',
    );
  }
  if (act === LW_ACTION_LEARN_ELEMENTAL) {
    return {
      handled: true,
      phase: 'cast_learn',
      castSpellId: S_LEARN_ELEMENTAL,
      removeRecipeSpells: [],
      moneyDelta: 0,
      closeMenu: true,
      cite: 'npc_professions.cpp:595-597 CastSpell S_LEARN_ELEMENTAL',
    };
  }
  if (act === LW_ACTION_UNLEARN_TRIBAL) {
    return unlearnBranch(
      S_UNLEARN_TRIBAL,
      'npc_professions.cpp:599-614 unlearn tribal CastSpell + ProfessionUnlearnSpells + money',
    );
  }
  if (act === LW_ACTION_LEARN_TRIBAL) {
    return {
      handled: true,
      phase: 'cast_learn',
      castSpellId: S_LEARN_TRIBAL,
      removeRecipeSpells: [],
      moneyDelta: 0,
      closeMenu: true,
      cite: 'npc_professions.cpp:615-617 CastSpell S_LEARN_TRIBAL',
    };
  }

  return {
    handled: true,
    phase: 'close',
    castSpellId: null,
    removeRecipeSpells: [],
    moneyDelta: 0,
    closeMenu: true,
    cite: 'npc_professions.cpp:548-620 unknown action close',
  };
}

// ScriptDev IR — npc_prof_blacksmith

const BS_ABSENT_UNUSED = (
  entry: number,
  name: string,
): NonNullable<ScriptDevIR['unusedBindings']>[number] => ({
  entry,
  kind: 'creature',
  reason:
    `NPC ${entry} ${name} is DB-bound to npc_prof_blacksmith (gossip learn/unlearn ` +
    'blacksmith specializations) but absent from product tables/creatures bake - ' +
    'IR + pure helpers (blacksmithGossipHello/Select) ported; may still appear on ' +
    'profession-data.profTrainers for trainer UI; product creature spawn until rebake',
  cite: `npc_professions.cpp:149-159 N_TRAINER_*; scriptdev-corpus boundCreatures; loadRealBundle missing ${entry}`,
});

// npc_prof_blacksmith gossip only, no UpdateAI. Bound to 5164, 11145–11146, 11176–11178 and
// 11191–11193; four of those are still missing from the creature bake.
export const NPC_PROF_BLACKSMITH: ScriptDevIR = {
  name: 'npc_prof_blacksmith',
  boundCreatures: [...BS_BOUND_CREATURES],
  sourceFile: 'world/npc_professions.cpp',
  // Player-side specialization learn/rep spells (not AI combat kit).
  // Corpus spellIds=[] — listed here for IR completeness; combat bake may lack them.
  spellIds: [
    S_WEAPON,
    S_ARMOR,
    S_HAMMER,
    S_AXE,
    S_SWORD,
    S_LEARN_WEAPON,
    S_LEARN_ARMOR,
    S_LEARN_HAMMER,
    S_LEARN_AXE,
    S_LEARN_SWORD,
    S_REP_ARMOR,
    S_REP_WEAPON,
  ],
  timers: [],
  unusedBindings: [
    // Present after service-NPC bake: 5164, 11145, 11146, 11177, 11178
    BS_ABSENT_UNUSED(N_TRAINER_SMITHOMNI2, 'Krathok Moltenfist'),
    BS_ABSENT_UNUSED(N_TRAINER_HAMMER, 'Lilith the Lithe'),
    BS_ABSENT_UNUSED(N_TRAINER_AXE, 'Kilram'),
    BS_ABSENT_UNUSED(N_TRAINER_SWORD, 'Seril Scourgebane'),
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'gossip-only blacksmith specialization learn/unlearn (blacksmithGossipHello/Select pure helpers)',
        cite: 'npc_professions.cpp:278-464',
      },
    ],
  },
  cites: [
    'npc_professions.cpp:278-346 GossipHello_npc_prof_blacksmith',
    'npc_professions.cpp:348-392 SendActionMenu_npc_prof_blacksmith',
    'npc_professions.cpp:394-451 SendConfirmLearn/Unlearn',
    'npc_professions.cpp:454-464 GossipSelect_npc_prof_blacksmith',
    'npc_professions.cpp:174-190 GetUnlearnCostMedium/Low',
    'npc_professions.cpp:97-113 SpecializationSpells blacksmith',
    'npc_professions.cpp:149-159 SpecializationTrainers blacksmith',
    'npc_professions.cpp:651-657 RegisterSelf pGossipHello/Select',
    'npc_professions.cpp:466-475 QuestComplete residual → QI4 registryNpcProfessions',
  ],
};

// ScriptDev IR — npc_prof_leather

const LW_ABSENT_UNUSED = (
  entry: number,
  name: string,
): NonNullable<ScriptDevIR['unusedBindings']>[number] => ({
  entry,
  kind: 'creature',
  reason:
    `NPC ${entry} ${name} is DB-bound to npc_prof_leather (gossip learn/unlearn ` +
    'leatherworking specializations) but absent from product tables/creatures bake - ' +
    'IR + pure helpers (leatherGossipHello/Select) ported; may still appear on ' +
    'profession-data.profTrainers; product creature spawn until rebake',
  cite: `npc_professions.cpp:161-167 N_TRAINER_*; scriptdev-corpus boundCreatures; loadRealBundle missing ${entry}`,
});

// npc_prof_leather gossip only, no UpdateAI. Bound to creatures 7866–7871, all present after the
// service-NPC faction bake. Cite: npc_professions.cpp:481–632.
export const NPC_PROF_LEATHER: ScriptDevIR = {
  name: 'npc_prof_leather',
  boundCreatures: [...LW_BOUND_CREATURES],
  sourceFile: 'world/npc_professions.cpp',
  spellIds: [
    S_DRAGON,
    S_ELEMENTAL,
    S_TRIBAL,
    S_LEARN_DRAGON,
    S_LEARN_ELEMENTAL,
    S_LEARN_TRIBAL,
    S_UNLEARN_DRAGON,
    S_UNLEARN_ELEMENTAL,
    S_UNLEARN_TRIBAL,
  ],
  timers: [],
  unusedBindings: [],

  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'gossip-only leatherworking specialization learn/unlearn (leatherGossipHello/Select pure helpers)',
        cite: 'npc_professions.cpp:481-632',
      },
    ],
  },
  cites: [
    'npc_professions.cpp:481-493 IsEligibleSpecializeLW',
    'npc_professions.cpp:495-546 GossipHello_npc_prof_leather',
    'npc_professions.cpp:548-620 SendActionMenu_npc_prof_leather',
    'npc_professions.cpp:622-632 GossipSelect_npc_prof_leather',
    'npc_professions.cpp:196-221 EquippedOk',
    'npc_professions.cpp:223-267 ProfessionUnlearnSpells',
    'npc_professions.cpp:116-124 SpecializationSpells leather',
    'npc_professions.cpp:161-167 SpecializationTrainers leather',
    'npc_professions.cpp:659-663 RegisterSelf pGossipHello/Select',
  ],
};

// ScriptDev IR — go_soothsaying_for_dummies (commented residual)

// go_soothsaying_for_dummies — the pGOUse body and RegisterSelf are both commented out upstream,
// so this is documented for census completeness only. Cite: npc_professions.cpp:638–669.
export const GO_SOOTHSAYING_FOR_DUMMIES_SCRIPT: ScriptDevIR = {
  name: 'go_soothsaying_for_dummies',
  boundCreatures: [],
  boundGos: [GO_SOOTHSAYING_FOR_DUMMIES],
  sourceFile: 'world/npc_professions.cpp',
  spellIds: [S_LEARN_DRAGON],
  timers: [],
  unusedBindings: [
    {
      entry: GO_SOOTHSAYING_FOR_DUMMIES,
      kind: 'go',
      reason:
        'GO 177226 Soothsaying for Dummies: pGOUse + RegisterSelf fully commented in ' +
        'npc_professions.cpp (:638-645, :665-669); residual would open gossip menu 5584 ' +
        'with learn-dragon item. Absent from product bake - IR documents residual only',
      cite: 'npc_professions.cpp:37,638-645,665-669; loadRealBundle missing 177226',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'commented GO residual - gossip menu 5584 learn dragon (not RegisterSelf)',
        cite: 'npc_professions.cpp:638-645',
      },
    ],
  },
  cites: [
    'npc_professions.cpp:37 UPDATE gameobject_template ScriptName go_soothsaying_for_dummies entry 177226',
    'npc_professions.cpp:638-645 GOUse_go_soothsaying_for_dummies commented',
    'npc_professions.cpp:665-669 RegisterSelf commented',
  ],
};
