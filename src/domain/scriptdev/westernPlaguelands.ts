// Western Plaguelands ScriptDev IR ports. Source: eastern_kingdoms/western_plaguelands.cpp — the
// Scourge Cauldron, Taelan Fordring, Isillien and Tirion. Only Taelan 1842 is in the bake.

import type { ScriptDevIR } from './types.ts';

// Constants — western_plaguelands.cpp enums

// western_plaguelands.cpp:114–147 texts (negative script_texts ids)
export const SAY_SCARLET_COMPLETE_1 = -1001076;
export const SAY_SCARLET_COMPLETE_2 = -1001077;
export const SAY_ESCORT_START = -1001078;
export const SAY_EXIT_KEEP = -1001079;
export const EMOTE_MOUNT = -1001080;
export const SAY_REACH_TOWER = -1001081;
export const SAY_ISILLIEN_1 = -1001082;
export const SAY_ISILLIEN_2 = -1001083;
export const SAY_ISILLIEN_3 = -1001084;
export const SAY_ISILLIEN_4 = -1001085;
export const SAY_ISILLIEN_5 = -1001086;
export const SAY_ISILLIEN_6 = -1001087;
export const EMOTE_ISILLIEN_ATTACK = -1001088;
export const SAY_ISILLIEN_ATTACK = -1001089;
export const SAY_KILL_TAELAN_1 = -1001090;
export const EMOTE_ISILLIEN_LAUGH = -1001091;
export const SAY_KILL_TAELAN_2 = -1001092;
export const EMOTE_ATTACK_PLAYER = -1001093;
export const SAY_TIRION_1 = -1001094;
export const SAY_TIRION_2 = -1001095;
export const SAY_TIRION_3 = -1001096;
export const SAY_TIRION_4 = -1001097;
export const SAY_TIRION_5 = -1001098;
export const SAY_EPILOG_1 = -1001099;
export const EMOTE_KNEEL = -1001100;
export const SAY_EPILOG_2 = -1001101;
export const EMOTE_HOLD_TAELAN = -1001102;
export const SAY_EPILOG_3 = -1001103;
export const SAY_EPILOG_4 = -1001104;
export const SAY_EPILOG_5 = -1001105;

// western_plaguelands.cpp:148–164 spells
/** Cite: western_plaguelands.cpp:149 SPELL_DEVOTION_AURA = 17232 */
export const SPELL_DEVOTION_AURA = 17232;
/** Cite: western_plaguelands.cpp:150 SPELL_CRUSADER_STRIKE = 14518 */
export const SPELL_CRUSADER_STRIKE = 14518;
/** Cite: western_plaguelands.cpp:151 SPELL_HOLY_STRIKE = 17143 */
export const SPELL_HOLY_STRIKE = 17143;
/** Cite: western_plaguelands.cpp:152 SPELL_HOLY_CLEAVE = 18819 */
export const SPELL_HOLY_CLEAVE = 18819;
/** Cite: western_plaguelands.cpp:153 SPELL_HOLY_LIGHT = 15493 */
export const SPELL_HOLY_LIGHT = 15493;
/** Cite: western_plaguelands.cpp:154 SPELL_LAY_ON_HANDS = 17233 */
export const SPELL_LAY_ON_HANDS = 17233;
/** Cite: western_plaguelands.cpp:155 SPELL_TAELAN_SUFFERING = 18810 */
export const SPELL_TAELAN_SUFFERING = 18810;

/** Cite: western_plaguelands.cpp:158 SPELL_DOMINATE_MIND = 14515 */
export const SPELL_DOMINATE_MIND = 14515;
/** Cite: western_plaguelands.cpp:159 SPELL_FLASH_HEAL = 10917 */
export const SPELL_FLASH_HEAL = 10917;
/** Cite: western_plaguelands.cpp:160 SPELL_GREATER_HEAL = 10965 */
export const SPELL_GREATER_HEAL = 10965;
/** Cite: western_plaguelands.cpp:161 SPELL_MANA_BURN = 15800 */
export const SPELL_MANA_BURN = 15800;
/** Cite: western_plaguelands.cpp:162 SPELL_MIND_BLAST = 17194 */
export const SPELL_MIND_BLAST = 17194;
/** Cite: western_plaguelands.cpp:163 SPELL_MIND_FLAY = 17165 */
export const SPELL_MIND_FLAY = 17165;
/** Cite: western_plaguelands.cpp:164 SPELL_TAELAN_DEATH = 18969 */
export const SPELL_TAELAN_DEATH = 18969;

// western_plaguelands.cpp:166–171 npcs
/** Cite: western_plaguelands.cpp:167 NPC_TAELAN_FORDRING = 1842 */
export const NPC_TAELAN_FORDRING = 1842;
/** Cite: western_plaguelands.cpp:168 NPC_SCARLET_CAVALIER = 1836 */
export const NPC_SCARLET_CAVALIER = 1836;
/** Cite: western_plaguelands.cpp:169 NPC_ISILLIEN = 1840 */
export const NPC_ISILLIEN = 1840;
/** Cite: western_plaguelands.cpp:170 NPC_TIRION_FORDRING = 12126 */
export const NPC_TIRION_FORDRING = 12126;
/** Cite: western_plaguelands.cpp:171 NPC_CRIMSON_ELITE = 12128 */
export const NPC_CRIMSON_ELITE = 12128;

/** DB binding. Cite: scriptdev-corpus.json 11152 The Scourge Cauldron */
export const NPC_THE_SCOURGE_CAULDRON = 11152;

// Cauldron lords by area (western_plaguelands.cpp:66–97)
/** Cite: western_plaguelands.cpp:70 area 199 Felstone → 11075 */
export const NPC_CAULDRON_LORD_BILEMAW = 11075;
/** Cite: western_plaguelands.cpp:78 area 200 Dalson → 11077 */
export const NPC_CAULDRON_LORD_MALVINIOUS = 11077;
/** Cite: western_plaguelands.cpp:86 area 201 Gahrron → 11078 */
export const NPC_CAULDRON_LORD_SOULWRATH = 11078;
/** Cite: western_plaguelands.cpp:94 area 202 Writhing → 11076 */
export const NPC_CAULDRON_LORD_RAZARCH = 11076;

/** Cite: western_plaguelands.cpp:173 MODEL_TAELAN_MOUNT = 239 */
export const MODEL_TAELAN_MOUNT = 239;

// western_plaguelands.cpp:175–177 quests
/** Cite: western_plaguelands.cpp:176 QUEST_ID_SCARLET_SUBTERFUGE = 5862 */
export const QUEST_ID_SCARLET_SUBTERFUGE = 5862;
/** Cite: western_plaguelands.cpp:177 QUEST_ID_IN_DREAMS = 5944 */
export const QUEST_ID_IN_DREAMS = 5944;

// Cauldron quest pairs (western_plaguelands.cpp:67–96)
/** Felstone: 5216 / 5229. Cite: cpp:67–68 */
export const QUEST_TARGET_FELSTONE_A = 5216;
export const QUEST_TARGET_FELSTONE_H = 5229;
/** Dalson: 5219 / 5231. Cite: cpp:75–76 */
export const QUEST_TARGET_DALSON_A = 5219;
export const QUEST_TARGET_DALSON_H = 5231;
/** Gahrron: 5225 / 5235. Cite: cpp:83–84 */
export const QUEST_TARGET_GAHRRON_A = 5225;
export const QUEST_TARGET_GAHRRON_H = 5235;
/** Writhing: 5222 / 5233. Cite: cpp:91–92 */
export const QUEST_TARGET_WRITHING_A = 5222;
export const QUEST_TARGET_WRITHING_H = 5233;

/** Area ids. Cite: western_plaguelands.cpp:66–97 case labels */
export const AREA_FELSTONE = 199;
export const AREA_DALSON = 200;
export const AREA_GAHRRON = 201;
export const AREA_WRITHING = 202;

/** FACTION_ESCORT_N_FRIEND_PASSIVE. Cite: ScriptDevAIMgr.h:52; western_plaguelands.cpp:325 */
export const FACTION_ESCORT_N_FRIEND_PASSIVE = 290;

/** TEMPFACTION_RESTORE_RESPAWN. Cite: Creature.h:577; western_plaguelands.cpp:325 */
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;

/** Cauldron lord TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN. Cite: western_plaguelands.cpp:70,78,86,94 600000 */
export const CAULDRON_LORD_DESPAWN_MS = 600_000;

// Min respawn delay after cauldron suicide. Cite: western_plaguelands.cpp:53–54 if rTime < 600
// SetRespawnDelay(600)
export const CAULDRON_MIN_RESPAWN_S = 600;

// Isillien/Tirion/elite TEMPSPAWN 15 * MINUTE * IN_MILLISECONDS. Cite:
// western_plaguelands.cpp:332,368,461,474–490
export const EVENT_NPC_DESPAWN_MS = 15 * 60 * 1000;

/** Tirion post-epilogue ForcedDespawn. Cite: western_plaguelands.cpp:565 3 * MINUTE * IN_MILLISECONDS */
export const TIRION_EPILOG_DESPAWN_MS = 3 * 60 * 1000;

// Isillien m_summonTirionTimer after killing Taelan. Cite: western_plaguelands.cpp:757 m_summonTirionTimer
// = 120000
export const ISILLIEN_TIRION_TIMER_MS = 120_000;

// Taelan "scripted death" HP gate during Isillien fight. Cite: western_plaguelands.cpp:597
// GetHealthPercent() < 50.0f
export const TAELAN_DEATH_HP_PCT = 50;

// Taelan Lay on Hands HP gate (only when !m_fightStarted). Cite: western_plaguelands.cpp:641
// GetHealthPercent() < 15.0f
export const TAELAN_LAY_ON_HANDS_HP_PCT = 15;

/** Taelan Holy Light HP gate. Cite: western_plaguelands.cpp:627 GetHealthPercent() < 75.0f */
export const TAELAN_HOLY_LIGHT_HP_PCT = 75;

/** Isillien Greater Heal HP gate. Cite: western_plaguelands.cpp:834 GetHealthPercent() < 50.0f */
export const ISILLIEN_GREATER_HEAL_HP_PCT = 50;

/** Isillien early Tirion spawn HP gate. Cite: western_plaguelands.cpp:775 GetHealthPercent() < 20.0f */
export const ISILLIEN_TIRION_EARLY_HP_PCT = 20;

/** DoSelectLowestHpFriendly radius. Cite: cpp:631 Taelan; :825 Isillien 50.0f */
export const HEAL_FRIENDLY_RADIUS_YD = 50;

// Taelan combat timer bounds (Reset + re-arm)

/** Holy Cleave victim. Reset: urand(11000, 15000) (cpp:258) CAST_OK: urand(11000, 13000) (cpp:606) */
export const TAELAN_HOLY_CLEAVE_INIT_MIN_MS = 11_000;
export const TAELAN_HOLY_CLEAVE_INIT_MAX_MS = 15_000;
export const TAELAN_HOLY_CLEAVE_REPEAT_MIN_MS = 11_000;
export const TAELAN_HOLY_CLEAVE_REPEAT_MAX_MS = 13_000;

/** Holy Strike victim. Reset: urand(6000, 8000) (cpp:259) CAST_OK: urand(9000, 14000) (cpp:614) */
export const TAELAN_HOLY_STRIKE_INIT_MIN_MS = 6000;
export const TAELAN_HOLY_STRIKE_INIT_MAX_MS = 8000;
export const TAELAN_HOLY_STRIKE_REPEAT_MIN_MS = 9000;
export const TAELAN_HOLY_STRIKE_REPEAT_MAX_MS = 14_000;

/** Crusader Strike victim. Reset: urand(1000, 5000) (cpp:260) CAST_OK: urand(7000, 12000) (cpp:622) */
export const TAELAN_CRUSADER_STRIKE_INIT_MIN_MS = 1000;
export const TAELAN_CRUSADER_STRIKE_INIT_MAX_MS = 5000;
export const TAELAN_CRUSADER_STRIKE_REPEAT_MIN_MS = 7000;
export const TAELAN_CRUSADER_STRIKE_REPEAT_MAX_MS = 12_000;

// Holy Light lowest friendly (armed when HP < 75%; timer starts 0 on Reset). Reset: m_holyLightTimer = 0
// (cpp:261) → first check immediate once <75% CAST_OK: urand(10000, 15000) (cpp:634)
export const TAELAN_HOLY_LIGHT_INIT_MIN_MS = 0;
export const TAELAN_HOLY_LIGHT_INIT_MAX_MS = 0;
export const TAELAN_HOLY_LIGHT_REPEAT_MIN_MS = 10_000;
export const TAELAN_HOLY_LIGHT_REPEAT_MAX_MS = 15_000;

// Isillien combat timer bounds

/** Mana Burn victim. Reset: urand(7000, 12000) (cpp:714) CAST_OK: urand(8000, 12000) (cpp:807) */
export const ISILLIEN_MANA_BURN_INIT_MIN_MS = 7000;
export const ISILLIEN_MANA_BURN_INIT_MAX_MS = 12_000;
export const ISILLIEN_MANA_BURN_REPEAT_MIN_MS = 8000;
export const ISILLIEN_MANA_BURN_REPEAT_MAX_MS = 12_000;

// Flash Heal lowest friendly. Reset: urand(10000, 15000) (cpp:715) CAST_OK: urand(10000, 15000) (cpp:828)
export const ISILLIEN_FLASH_HEAL_INIT_MIN_MS = 10_000;
export const ISILLIEN_FLASH_HEAL_INIT_MAX_MS = 15_000;
export const ISILLIEN_FLASH_HEAL_REPEAT_MIN_MS = 10_000;
export const ISILLIEN_FLASH_HEAL_REPEAT_MAX_MS = 15_000;

// Dominate Mind random not-top player. Reset: urand(10000, 14000) (cpp:716) CAST_OK: urand(25000, 30000)
// (cpp:817)
export const ISILLIEN_DOMINATE_INIT_MIN_MS = 10_000;
export const ISILLIEN_DOMINATE_INIT_MAX_MS = 14_000;
export const ISILLIEN_DOMINATE_REPEAT_MIN_MS = 25_000;
export const ISILLIEN_DOMINATE_REPEAT_MAX_MS = 30_000;

/** Mind Blast victim. Reset: urand(0, 1000) (cpp:717) CAST_OK: urand(3000, 5000) (cpp:791) */
export const ISILLIEN_MIND_BLAST_INIT_MIN_MS = 0;
export const ISILLIEN_MIND_BLAST_INIT_MAX_MS = 1000;
export const ISILLIEN_MIND_BLAST_REPEAT_MIN_MS = 3000;
export const ISILLIEN_MIND_BLAST_REPEAT_MAX_MS = 5000;

/** Mind Flay victim. Reset: urand(3000, 7000) (cpp:718) CAST_OK: urand(9000, 15000) (cpp:799) */
export const ISILLIEN_MIND_FLAY_INIT_MIN_MS = 3000;
export const ISILLIEN_MIND_FLAY_INIT_MAX_MS = 7000;
export const ISILLIEN_MIND_FLAY_REPEAT_MIN_MS = 9000;
export const ISILLIEN_MIND_FLAY_REPEAT_MAX_MS = 15_000;

// Greater Heal self (only while HP < 50%; timer starts 0 on Reset). Reset: m_greaterHealTimer = 0 (cpp:719)
// CAST_OK: urand(15000, 20000) (cpp:839)
export const ISILLIEN_GREATER_HEAL_INIT_MIN_MS = 0;
export const ISILLIEN_GREATER_HEAL_INIT_MAX_MS = 0;
export const ISILLIEN_GREATER_HEAL_REPEAT_MIN_MS = 15_000;
export const ISILLIEN_GREATER_HEAL_REPEAT_MAX_MS = 20_000;

// Tirion combat timer bounds

/** Holy Cleave victim. Reset: urand(11000, 15000) (cpp:870) CAST_OK: urand(12000, 15000) (cpp:953) */
export const TIRION_HOLY_CLEAVE_INIT_MIN_MS = 11_000;
export const TIRION_HOLY_CLEAVE_INIT_MAX_MS = 15_000;
export const TIRION_HOLY_CLEAVE_REPEAT_MIN_MS = 12_000;
export const TIRION_HOLY_CLEAVE_REPEAT_MAX_MS = 15_000;

/** Holy Strike victim. Reset: urand(6000, 8000) (cpp:871) CAST_OK: urand(8000, 11000) (cpp:961) */
export const TIRION_HOLY_STRIKE_INIT_MIN_MS = 6000;
export const TIRION_HOLY_STRIKE_INIT_MAX_MS = 8000;
export const TIRION_HOLY_STRIKE_REPEAT_MIN_MS = 8000;
export const TIRION_HOLY_STRIKE_REPEAT_MAX_MS = 11_000;

/** Crusader Strike victim. Reset: urand(1000, 5000) (cpp:872) CAST_OK: urand(7000, 9000) (cpp:969) */
export const TIRION_CRUSADER_STRIKE_INIT_MIN_MS = 1000;
export const TIRION_CRUSADER_STRIKE_INIT_MAX_MS = 5000;
export const TIRION_CRUSADER_STRIKE_REPEAT_MIN_MS = 7000;
export const TIRION_CRUSADER_STRIKE_REPEAT_MAX_MS = 9000;

// Pure helpers — Scourge Cauldron MoveInLineOfSight

export interface CauldronLosResult {
  handled: boolean;
  /** Cauldron Lord entry to summon (0 when no-op). */
  summonEntry: number;
  despawnMs: number;
  /** DoDie: Suicide + SetRespawnDelay ≥ 600. */
  suicide: boolean;
  minRespawnS: number;
  cite: string;
}

// Port of npc_the_scourge_cauldronAI::MoveInLineOfSight, the quest and area gate.
// Cite: western_plaguelands.cpp:57–100.
export function scourgeCauldronLos(
  isPlayer: boolean,
  areaId: number,
  incompleteQuestIds: readonly number[],
): CauldronLosResult {
  const incomplete = new Set(incompleteQuestIds);
  if (!isPlayer) {
    return {
      handled: false,
      summonEntry: 0,
      despawnMs: 0,
      suicide: false,
      minRespawnS: 0,
      cite: 'western_plaguelands.cpp:59-60 non-player → return',
    };
  }
  const hit = (a: number, b: number) => incomplete.has(a) || incomplete.has(b);
  if (areaId === AREA_FELSTONE && hit(QUEST_TARGET_FELSTONE_A, QUEST_TARGET_FELSTONE_H)) {
    return {
      handled: true,
      summonEntry: NPC_CAULDRON_LORD_BILEMAW,
      despawnMs: CAULDRON_LORD_DESPAWN_MS,
      suicide: true,
      minRespawnS: CAULDRON_MIN_RESPAWN_S,
      cite: 'western_plaguelands.cpp:66-71 area 199 Felstone → SummonCreature 11075 + DoDie',
    };
  }
  if (areaId === AREA_DALSON && hit(QUEST_TARGET_DALSON_A, QUEST_TARGET_DALSON_H)) {
    return {
      handled: true,
      summonEntry: NPC_CAULDRON_LORD_MALVINIOUS,
      despawnMs: CAULDRON_LORD_DESPAWN_MS,
      suicide: true,
      minRespawnS: CAULDRON_MIN_RESPAWN_S,
      cite: 'western_plaguelands.cpp:74-79 area 200 Dalson → SummonCreature 11077 + DoDie',
    };
  }
  if (areaId === AREA_GAHRRON && hit(QUEST_TARGET_GAHRRON_A, QUEST_TARGET_GAHRRON_H)) {
    return {
      handled: true,
      summonEntry: NPC_CAULDRON_LORD_SOULWRATH,
      despawnMs: CAULDRON_LORD_DESPAWN_MS,
      suicide: true,
      minRespawnS: CAULDRON_MIN_RESPAWN_S,
      cite: 'western_plaguelands.cpp:82-87 area 201 Gahrron → SummonCreature 11078 + DoDie',
    };
  }
  if (areaId === AREA_WRITHING && hit(QUEST_TARGET_WRITHING_A, QUEST_TARGET_WRITHING_H)) {
    return {
      handled: true,
      summonEntry: NPC_CAULDRON_LORD_RAZARCH,
      despawnMs: CAULDRON_LORD_DESPAWN_MS,
      suicide: true,
      minRespawnS: CAULDRON_MIN_RESPAWN_S,
      cite: 'western_plaguelands.cpp:90-95 area 202 Writhing → SummonCreature 11076 + DoDie',
    };
  }
  return {
    handled: false,
    summonEntry: 0,
    despawnMs: 0,
    suicide: false,
    minRespawnS: 0,
    cite: 'western_plaguelands.cpp:57-100 no matching incomplete quest for area',
  };
}

// Pure helpers — Taelan HP gates + escort fight state

export interface TaelanCombatState {
  /** m_fightStarted — true after dialogue SPELL_CRUSADER_STRIKE step vs Isillien. */
  fightStarted: boolean;
  /** m_taelanDead — scripted "dead" after <50% in Isillien fight. */
  taelanDead: boolean;
  /** m_hasMount — remount on evade when not dead. */
  hasMount: boolean;
  /** m_scarletComplete — JustReachedHome resumes Devotion Aura dialogue. */
  scarletComplete: boolean;
}

export function taelanInitialState(): TaelanCombatState {
  return {
    fightStarted: false,
    taelanDead: false,
    hasMount: false,
    scarletComplete: false,
  };
}

export interface TaelanHpGateResult {
  /** Enter scripted death (StartNextDialogueText SAY_KILL_TAELAN_1). */
  scriptedDeath: boolean;
  /** Try Lay on Hands self (no timer — every Update while gate holds). */
  castLayOnHands: boolean;
  /** Holy Light timer is eligible (HP < 75%). */
  holyLightEligible: boolean;
  cite: string;
}

// Port of the Taelan UpdateEscortAI HP branches — the scripted death, Lay on Hands and the Holy
// Light gate. Cite: western_plaguelands.cpp:593–642.
export function taelanHpGates(
  state: TaelanCombatState,
  hpPct: number,
): TaelanHpGateResult {
  if (state.taelanDead) {
    return {
      scriptedDeath: false,
      castLayOnHands: false,
      holyLightEligible: false,
      cite: 'western_plaguelands.cpp:593-595 m_taelanDead → no combat casts',
    };
  }
  // Cite: western_plaguelands.cpp:597-601
  if (!state.taelanDead && state.fightStarted && hpPct < TAELAN_DEATH_HP_PCT) {
    return {
      scriptedDeath: true,
      castLayOnHands: false,
      holyLightEligible: hpPct < TAELAN_HOLY_LIGHT_HP_PCT,
      cite: 'western_plaguelands.cpp:597-601 fightStarted && HP<50 → StartNextDialogueText(SAY_KILL_TAELAN_1) m_taelanDead',
    };
  }
  return {
    scriptedDeath: false,
    // Cite: western_plaguelands.cpp:641-642
    castLayOnHands: !state.fightStarted && hpPct < TAELAN_LAY_ON_HANDS_HP_PCT,
    holyLightEligible: hpPct < TAELAN_HOLY_LIGHT_HP_PCT,
    cite: 'western_plaguelands.cpp:627-642 Holy Light <75%; Lay on Hands !fightStarted && <15%',
  };
}

/** Port of ReceiveAIEvent CUSTOM_A kill-Taelan path on Isillien. Cite: western_plaguelands.cpp:752–759 */
export function isillienReceiveCustomA(): {
  castTaelanDeath: boolean;
  spellId: number;
  armTirionTimerMs: number;
  taelanDead: true;
  cite: string;
} {
  return {
    castTaelanDeath: true,
    spellId: SPELL_TAELAN_DEATH,
    armTirionTimerMs: ISILLIEN_TIRION_TIMER_MS,
    taelanDead: true,
    cite: 'western_plaguelands.cpp:755-758 DoCast SPELL_TAELAN_DEATH + m_taelanDead + m_summonTirionTimer=120000',
  };
}

export interface IsillienTirionSpawnState {
  tirionSpawned: boolean;
  summonTirionTimerMs: number;
  taelanDead: boolean;
}

export interface IsillienTirionSpawnTickResult {
  spawnTirion: boolean;
  next: IsillienTirionSpawnState;
  cite: string;
}

// Port of Isillien UpdateEscortAI Tirion-spawn gate. Cite: western_plaguelands.cpp:774–782 Spawns when
// !m_tirionSpawned && ((timer armed && expired) || HP < 20%).
export function isillienTirionSpawnTick(
  state: IsillienTirionSpawnState,
  diffMs: number,
  hpPct: number,
): IsillienTirionSpawnTickResult {
  if (state.tirionSpawned) {
    return {
      spawnTirion: false,
      next: state,
      cite: 'western_plaguelands.cpp:775 m_tirionSpawned already true',
    };
  }
  // Cite: western_plaguelands.cpp:775
  const timerExpired =
    state.summonTirionTimerMs !== 0 && state.summonTirionTimerMs < diffMs;
  const earlyHp = hpPct < ISILLIEN_TIRION_EARLY_HP_PCT;
  if (timerExpired || earlyHp) {
    return {
      spawnTirion: true,
      next: { ...state, tirionSpawned: true, summonTirionTimerMs: 0 },
      cite: timerExpired
        ? 'western_plaguelands.cpp:775-779 timer expired → SendAIEvent CUSTOM_B to Taelan (summon Tirion)'
        : 'western_plaguelands.cpp:775-779 HP<20 → SendAIEvent CUSTOM_B to Taelan (summon Tirion)',
    };
  }
  if (state.summonTirionTimerMs) {
    return {
      spawnTirion: false,
      next: {
        ...state,
        summonTirionTimerMs: state.summonTirionTimerMs - diffMs,
      },
      cite: 'western_plaguelands.cpp:781-782 m_summonTirionTimer -= diff',
    };
  }
  return {
    spawnTirion: false,
    next: state,
    cite: 'western_plaguelands.cpp:775-782 waiting (timer 0, HP>=20)',
  };
}

/** Port of Taelan dialogue epilogue explore credit. Cite: western_plaguelands.cpp:559–564 SAY_EPILOG_5 */
export function taelanEpilogueCredit(): {
  questId: number;
  tirionDespawnMs: number;
  taelanDespawnMs: number;
  cite: string;
} {
  return {
    questId: QUEST_ID_IN_DREAMS,
    tirionDespawnMs: TIRION_EPILOG_DESPAWN_MS,
    taelanDespawnMs: TIRION_EPILOG_DESPAWN_MS,
    cite: 'western_plaguelands.cpp:559-568 RewardPlayerAndGroupAtEventExplored(5944) + ForcedDespawn 3min both',
  };
}

/** Escort waypoint pause points. Cite: western_plaguelands.cpp:340–355 */
export const TAELAN_WAYPOINTS = [
  {
    pointId: 26,
    pauseEscort: true,
    dialogueStart: SAY_EXIT_KEEP,
    cite: 'western_plaguelands.cpp:345-348 case 26 pause + SAY_EXIT_KEEP dialogue',
  },
  {
    pointId: 56,
    pauseEscort: true,
    dialogueStart: SAY_REACH_TOWER,
    cite: 'western_plaguelands.cpp:349-353 case 56 pause + SAY_REACH_TOWER (summons Isillien in dialogue)',
  },
] as const;

export interface TaelanWaypointResult {
  handled: boolean;
  pauseEscort: boolean;
  dialogueStart: number | null;
  cite: string;
}

/** Port of npc_taelan_fordringAI::WaypointReached. Cite: western_plaguelands.cpp:340–355 */
export function taelanWaypointReached(pointId: number): TaelanWaypointResult {
  const step = TAELAN_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!step) {
    return {
      handled: false,
      pauseEscort: false,
      dialogueStart: null,
      cite: 'western_plaguelands.cpp:340-355 no case for this pointId',
    };
  }
  return {
    handled: true,
    pauseEscort: step.pauseEscort,
    dialogueStart: step.dialogueStart,
    cite: step.cite,
  };
}

/** Isillien spawn coords at SAY_REACH_TOWER dialogue step. Cite: western_plaguelands.cpp:461 */
export const ISILLIEN_SPAWN = {
  x: 2693.12,
  y: -1943.04,
  z: 72.04,
  o: 2.11,
  despawnMs: EVENT_NPC_DESPAWN_MS,
  cite: 'western_plaguelands.cpp:461 SummonCreature NPC_ISILLIEN',
} as const;

/** Tirion spawn coords on CUSTOM_B. Cite: western_plaguelands.cpp:332 */
export const TIRION_SPAWN = {
  x: 2620.273,
  y: -1920.917,
  z: 74.25,
  o: 0,
  despawnMs: EVENT_NPC_DESPAWN_MS,
  cite: 'western_plaguelands.cpp:332 SummonCreature NPC_TIRION_FORDRING',
} as const;

// Extra Crimson Elite spawns at SPELL_CRUSADER_STRIKE dialogue step. Cite: western_plaguelands.cpp:474–490
export const CRIMSON_ELITE_SPAWNS = [
  { x: 2711.32, y: -1882.67, z: 67.89, o: 3.2, cite: 'western_plaguelands.cpp:474' },
  { x: 2710.93, y: -1878.9, z: 67.97, o: 3.2, cite: 'western_plaguelands.cpp:480' },
  { x: 2710.53, y: -1875.28, z: 67.9, o: 3.2, cite: 'western_plaguelands.cpp:486' },
] as const;

// Heal target eligibility (DoSelectLowestHpFriendly includes self when injured). Cite:
// western_plaguelands.cpp:631,825
export function healTargetEligible(hpFrac: number): boolean {
  return hpFrac > 0 && hpFrac < 1;
}

// npc_the_scourge_cauldron

// npc_the_scourge_cauldronAI, creature 11152 — ABSENT from the product bake, so the binding is
// unused. The area/quest → Cauldron Lord map is a pure helper; lords 11075–11078 are in bake.
export const NPC_THE_SCOURGE_CAULDRON_SCRIPT: ScriptDevIR = {
  name: 'npc_the_scourge_cauldron',
  boundCreatures: [NPC_THE_SCOURGE_CAULDRON],
  sourceFile: 'eastern_kingdoms/western_plaguelands.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty - LOS-driven cauldron only',
        cite: 'western_plaguelands.cpp:45 Reset empty',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_THE_SCOURGE_CAULDRON,
      kind: 'creature',
      reason:
        'NPC 11152 The Scourge Cauldron is ScriptName-bound in DB but absent from product bake - IR + scourgeCauldronLos pure helper ported; Cauldron Lords 11075/11076/11077/11078 are in bake as kill targets for quests 5216/5219/5222/5225 (+Horde pairs)',
      cite: 'western_plaguelands.cpp:41-106; loadRealBundle missing 11152',
    },
  ],
  cites: [
    'western_plaguelands.cpp:37-106 npc_the_scourge_cauldron',
    'western_plaguelands.cpp:47-55 DoDie Suicide + respawn delay >=600',
    'western_plaguelands.cpp:57-100 MoveInLineOfSight area 199-202 quest pairs',
    'western_plaguelands.cpp:70 Felstone→11075; :78 Dalson→11077; :86 Gahrron→11078; :94 Writhing→11076',
    'western_plaguelands.cpp:70 TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN 600000',
  ],
};

// npc_taelan_fordring

// npc_taelan_fordringAI, creature 1842. Holy Cleave 11–15s/11–13s, Holy Strike 6–8s/9–14s,
// Crusader Strike 1–5s/7–12s, Holy Light below 75%, and Lay on Hands below 15% before the fight.
export const NPC_TAELAN_FORDRING_SCRIPT: ScriptDevIR = {
  name: 'npc_taelan_fordring',
  boundCreatures: [NPC_TAELAN_FORDRING],
  sourceFile: 'eastern_kingdoms/western_plaguelands.cpp',
  spellIds: [
    SPELL_DEVOTION_AURA,
    SPELL_CRUSADER_STRIKE,
    SPELL_HOLY_STRIKE,
    SPELL_HOLY_CLEAVE,
    SPELL_HOLY_LIGHT,
    SPELL_LAY_ON_HANDS,
    SPELL_TAELAN_SUFFERING,
  ],
  timers: [
    {
      id: 'holy_cleave',
      spellId: SPELL_HOLY_CLEAVE,
      initialMinMs: TAELAN_HOLY_CLEAVE_INIT_MIN_MS,
      initialMaxMs: TAELAN_HOLY_CLEAVE_INIT_MAX_MS,
      repeatMinMs: TAELAN_HOLY_CLEAVE_REPEAT_MIN_MS,
      repeatMaxMs: TAELAN_HOLY_CLEAVE_REPEAT_MAX_MS,
      target: 'victim',
      cite: 'western_plaguelands.cpp:258,603-607 Holy Cleave init 11000-15000 re-arm 11000-13000 victim',
    },
    {
      id: 'holy_strike',
      spellId: SPELL_HOLY_STRIKE,
      initialMinMs: TAELAN_HOLY_STRIKE_INIT_MIN_MS,
      initialMaxMs: TAELAN_HOLY_STRIKE_INIT_MAX_MS,
      repeatMinMs: TAELAN_HOLY_STRIKE_REPEAT_MIN_MS,
      repeatMaxMs: TAELAN_HOLY_STRIKE_REPEAT_MAX_MS,
      target: 'victim',
      cite: 'western_plaguelands.cpp:259,611-615 Holy Strike init 6000-8000 re-arm 9000-14000 victim',
    },
    {
      id: 'crusader_strike',
      spellId: SPELL_CRUSADER_STRIKE,
      initialMinMs: TAELAN_CRUSADER_STRIKE_INIT_MIN_MS,
      initialMaxMs: TAELAN_CRUSADER_STRIKE_INIT_MAX_MS,
      repeatMinMs: TAELAN_CRUSADER_STRIKE_REPEAT_MIN_MS,
      repeatMaxMs: TAELAN_CRUSADER_STRIKE_REPEAT_MAX_MS,
      target: 'victim',
      cite: 'western_plaguelands.cpp:260,619-623 Crusader Strike init 1000-5000 re-arm 7000-12000 victim',
    },
    {
      id: 'holy_light',
      spellId: SPELL_HOLY_LIGHT,
      initialMinMs: TAELAN_HOLY_LIGHT_INIT_MIN_MS,
      initialMaxMs: TAELAN_HOLY_LIGHT_INIT_MAX_MS,
      repeatMinMs: TAELAN_HOLY_LIGHT_REPEAT_MIN_MS,
      repeatMaxMs: TAELAN_HOLY_LIGHT_REPEAT_MAX_MS,
      target: 'self',
      friendlyLowestHpYd: 50,
      friendlyHpDeficit: 1,
      hpPctMax: TAELAN_HOLY_LIGHT_HP_PCT,
      hpPctMin: 0,
      cite: 'western_plaguelands.cpp:261,627-638 Holy Light init 0 re-arm 10000-15000 on DoSelectLowestHpFriendly(50.0f) while his own HP < 75 %',
    },
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: TAELAN_LAY_ON_HANDS_HP_PCT,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_LAY_ON_HANDS,
          cite: 'western_plaguelands.cpp:641-642 !m_fightStarted && HP<15 Lay on Hands self (outdoor pull: fightStarted false)',
        },
      ],
      cite: 'western_plaguelands.cpp:641-642 Lay on Hands gate; taelanHpGates pure helper for fightStarted branch',
    },
    {
      phase: 2,
      hpBelowPct: TAELAN_DEATH_HP_PCT,
      actions: [
        {
          kind: 'flavor',
          text: 'When m_fightStarted: StartNextDialogueText(SAY_KILL_TAELAN_1) + m_taelanDead (scripted death; Isillien casts 18969). Outdoor pull without Isillien fight does not arm this path (taelanHpGates).',
          cite: 'western_plaguelands.cpp:597-601; taelanHpGates pure helper',
        },
      ],
      cite: 'western_plaguelands.cpp:597-601 fightStarted && HP<50 scripted death (not a real die)',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'cast_self',
        spellId: SPELL_DEVOTION_AURA,
        cite: 'western_plaguelands.cpp:269 DoCastSpellIfCan(self, SPELL_DEVOTION_AURA)',
      },
      {
        kind: 'flavor',
        text: 'Unmount if m_hasMount',
        cite: 'western_plaguelands.cpp:266-267',
      },
    ],
    onEvade: [
      {
        kind: 'flavor',
        text: 'm_taelanDead → fake-death stand state UNINTERACTIBLE; else remount if m_hasMount + escort evade',
        cite: 'western_plaguelands.cpp:280-307 EnterEvadeMode',
      },
    ],
    onReset: [
      {
        kind: 'flavor',
        text: 'Holy Cleave 11-15s; Holy Strike 6-8s; Crusader Strike 1-5s; Holy Light timer 0',
        cite: 'western_plaguelands.cpp:256-262 Reset',
      },
    ],
  },
  cites: [
    'western_plaguelands.cpp:108-667 npc_taelan_fordring',
    'western_plaguelands.cpp:148-155 spell ids',
    'western_plaguelands.cpp:256-262 Reset combat timers',
    'western_plaguelands.cpp:264-270 Aggro Devotion Aura',
    'western_plaguelands.cpp:319-337 ReceiveAIEvent START_ESCORT / CUSTOM_A / CUSTOM_B',
    'western_plaguelands.cpp:340-355 WaypointReached WP26/56',
    'western_plaguelands.cpp:394-570 JustDidDialogueStep',
    'western_plaguelands.cpp:586-645 UpdateEscortAI combat + 50% death + Lay on Hands',
    'western_plaguelands.cpp:653-667 QuestAccept 5944 / QuestRewarded 5862',
  ],
};

// npc_isillien

// npc_isillienAI, creature 1840 — ABSENT from bake, so the binding is unused. Mind Blast, Mind
// Flay, Mana Burn, Dominate Mind, Flash Heal and a self Greater Heal below 50%.
export const NPC_ISILLIEN_SCRIPT: ScriptDevIR = {
  name: 'npc_isillien',
  boundCreatures: [NPC_ISILLIEN],
  sourceFile: 'eastern_kingdoms/western_plaguelands.cpp',
  spellIds: [
    SPELL_DOMINATE_MIND,
    SPELL_FLASH_HEAL,
    SPELL_GREATER_HEAL,
    SPELL_MANA_BURN,
    SPELL_MIND_BLAST,
    SPELL_MIND_FLAY,
    SPELL_TAELAN_DEATH,
  ],
  timers: [
    {
      id: 'mind_blast',
      spellId: SPELL_MIND_BLAST,
      initialMinMs: ISILLIEN_MIND_BLAST_INIT_MIN_MS,
      initialMaxMs: ISILLIEN_MIND_BLAST_INIT_MAX_MS,
      repeatMinMs: ISILLIEN_MIND_BLAST_REPEAT_MIN_MS,
      repeatMaxMs: ISILLIEN_MIND_BLAST_REPEAT_MAX_MS,
      target: 'victim',
      cite: 'western_plaguelands.cpp:717,788-792 Mind Blast init 0-1000 re-arm 3000-5000 victim',
    },
    {
      id: 'mind_flay',
      spellId: SPELL_MIND_FLAY,
      initialMinMs: ISILLIEN_MIND_FLAY_INIT_MIN_MS,
      initialMaxMs: ISILLIEN_MIND_FLAY_INIT_MAX_MS,
      repeatMinMs: ISILLIEN_MIND_FLAY_REPEAT_MIN_MS,
      repeatMaxMs: ISILLIEN_MIND_FLAY_REPEAT_MAX_MS,
      target: 'victim',
      cite: 'western_plaguelands.cpp:718,796-800 Mind Flay init 3000-7000 re-arm 9000-15000 victim',
    },
    {
      id: 'mana_burn',
      spellId: SPELL_MANA_BURN,
      initialMinMs: ISILLIEN_MANA_BURN_INIT_MIN_MS,
      initialMaxMs: ISILLIEN_MANA_BURN_INIT_MAX_MS,
      repeatMinMs: ISILLIEN_MANA_BURN_REPEAT_MIN_MS,
      repeatMaxMs: ISILLIEN_MANA_BURN_REPEAT_MAX_MS,
      target: 'victim',
      cite: 'western_plaguelands.cpp:714,804-808 Mana Burn init 7000-12000 re-arm 8000-12000 victim',
    },
    {
      id: 'dominate_mind',
      spellId: SPELL_DOMINATE_MIND,
      initialMinMs: ISILLIEN_DOMINATE_INIT_MIN_MS,
      initialMaxMs: ISILLIEN_DOMINATE_INIT_MAX_MS,
      repeatMinMs: ISILLIEN_DOMINATE_REPEAT_MIN_MS,
      repeatMaxMs: ISILLIEN_DOMINATE_REPEAT_MAX_MS,
      target: 'hostile_random_not_top_player',
      select: { playerOnly: true, skipTopThreat: true },
      cite: 'western_plaguelands.cpp:716,812-818 Dominate Mind SelectAttackingTarget RANDOM,1 PLAYER init 10000-14000 re-arm 25000-30000',
    },
    {
      id: 'flash_heal',
      spellId: SPELL_FLASH_HEAL,
      initialMinMs: ISILLIEN_FLASH_HEAL_INIT_MIN_MS,
      initialMaxMs: ISILLIEN_FLASH_HEAL_INIT_MAX_MS,
      repeatMinMs: ISILLIEN_FLASH_HEAL_REPEAT_MIN_MS,
      repeatMaxMs: ISILLIEN_FLASH_HEAL_REPEAT_MAX_MS,
      target: 'self',
      friendlyLowestHpYd: 50,
      friendlyHpDeficit: 1,
      cite: 'western_plaguelands.cpp:715,821-829 Flash Heal init 10000-15000 re-arm 10000-15000 on DoSelectLowestHpFriendly(50.0f)',
    },
    {
      id: 'greater_heal',
      spellId: SPELL_GREATER_HEAL,
      initialMinMs: ISILLIEN_GREATER_HEAL_INIT_MIN_MS,
      initialMaxMs: ISILLIEN_GREATER_HEAL_INIT_MAX_MS,
      repeatMinMs: ISILLIEN_GREATER_HEAL_REPEAT_MIN_MS,
      repeatMaxMs: ISILLIEN_GREATER_HEAL_REPEAT_MAX_MS,
      target: 'self',
      hpPctMax: ISILLIEN_GREATER_HEAL_HP_PCT,
      hpPctMin: 0,
      cite: 'western_plaguelands.cpp:719,834-842 Greater Heal self while HP<50 init 0 re-arm 15000-20000',
    },
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: ISILLIEN_TIRION_EARLY_HP_PCT,
      actions: [
        {
          kind: 'flavor',
          text: 'SendAIEvent CUSTOM_B to Taelan → SummonCreature Tirion 12126 (if !m_tirionSpawned); isillienTirionSpawnTick pure helper also arms on 120s timer after Taelan Death',
          cite: 'western_plaguelands.cpp:775-779',
        },
      ],
      cite: 'western_plaguelands.cpp:775 HP<20 early Tirion spawn gate',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Mana Burn 7-12s; Flash Heal 10-15s; Dominate 10-14s; Mind Blast 0-1s; Mind Flay 3-7s; Greater Heal timer 0',
        cite: 'western_plaguelands.cpp:712-720 Reset',
      },
    ],
    onEvade: [
      {
        kind: 'flavor',
        text: 'm_taelanDead → idle evade keep position; else escort evade',
        cite: 'western_plaguelands.cpp:727-742 EnterEvadeMode',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_ISILLIEN,
      kind: 'creature',
      reason:
        'NPC 1840 Grand Inquisitor Isillien is ScriptName-bound in DB but absent from product bake - IR + combat timers + isillienTirionSpawnTick / isillienReceiveCustomA pure helpers ported; summoned mid-5944 at ISILLIEN_SPAWN coords',
      cite: 'western_plaguelands.cpp:684-852; loadRealBundle missing 1840',
    },
  ],
  cites: [
    'western_plaguelands.cpp:684-852 npc_isillien',
    'western_plaguelands.cpp:158-164 Isillien spell ids',
    'western_plaguelands.cpp:712-720 Reset',
    'western_plaguelands.cpp:744-760 ReceiveAIEvent START_ESCORT / CUSTOM_A Taelan Death',
    'western_plaguelands.cpp:772-846 UpdateEscortAI Tirion timer + combat',
    'western_plaguelands.cpp:757 m_summonTirionTimer=120000',
    'western_plaguelands.cpp:669-682 TaelanDeath spell script EnterEvadeMode both',
  ],
};

// npc_tirion_fordring

// npc_tirion_fordringAI, creature 12126 — ABSENT from bake, so the binding is unused. Holy Cleave
// 11–15s/12–15s, Holy Strike 6–8s/8–11s, Crusader Strike 1–5s/7–9s, Devotion Aura on aggro.
export const NPC_TIRION_FORDRING_SCRIPT: ScriptDevIR = {
  name: 'npc_tirion_fordring',
  boundCreatures: [NPC_TIRION_FORDRING],
  sourceFile: 'eastern_kingdoms/western_plaguelands.cpp',
  spellIds: [
    SPELL_DEVOTION_AURA,
    SPELL_CRUSADER_STRIKE,
    SPELL_HOLY_STRIKE,
    SPELL_HOLY_CLEAVE,
  ],
  timers: [
    {
      id: 'holy_cleave',
      spellId: SPELL_HOLY_CLEAVE,
      initialMinMs: TIRION_HOLY_CLEAVE_INIT_MIN_MS,
      initialMaxMs: TIRION_HOLY_CLEAVE_INIT_MAX_MS,
      repeatMinMs: TIRION_HOLY_CLEAVE_REPEAT_MIN_MS,
      repeatMaxMs: TIRION_HOLY_CLEAVE_REPEAT_MAX_MS,
      target: 'victim',
      cite: 'western_plaguelands.cpp:870,950-954 Holy Cleave init 11000-15000 re-arm 12000-15000 victim',
    },
    {
      id: 'holy_strike',
      spellId: SPELL_HOLY_STRIKE,
      initialMinMs: TIRION_HOLY_STRIKE_INIT_MIN_MS,
      initialMaxMs: TIRION_HOLY_STRIKE_INIT_MAX_MS,
      repeatMinMs: TIRION_HOLY_STRIKE_REPEAT_MIN_MS,
      repeatMaxMs: TIRION_HOLY_STRIKE_REPEAT_MAX_MS,
      target: 'victim',
      cite: 'western_plaguelands.cpp:871,958-962 Holy Strike init 6000-8000 re-arm 8000-11000 victim',
    },
    {
      id: 'crusader_strike',
      spellId: SPELL_CRUSADER_STRIKE,
      initialMinMs: TIRION_CRUSADER_STRIKE_INIT_MIN_MS,
      initialMaxMs: TIRION_CRUSADER_STRIKE_INIT_MAX_MS,
      repeatMinMs: TIRION_CRUSADER_STRIKE_REPEAT_MIN_MS,
      repeatMaxMs: TIRION_CRUSADER_STRIKE_REPEAT_MAX_MS,
      target: 'victim',
      cite: 'western_plaguelands.cpp:872,966-970 Crusader Strike init 1000-5000 re-arm 7000-9000 victim',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'cast_self',
        spellId: SPELL_DEVOTION_AURA,
        cite: 'western_plaguelands.cpp:877 DoCastSpellIfCan(self, SPELL_DEVOTION_AURA)',
      },
    ],
    onReset: [
      {
        kind: 'flavor',
        text: 'Holy Cleave 11-15s; Holy Strike 6-8s; Crusader Strike 1-5s',
        cite: 'western_plaguelands.cpp:868-873 Reset',
      },
    ],
    onEvade: [
      {
        kind: 'flavor',
        text: 'MovePoint(200) to Taelan contact for epilogue dialogue',
        cite: 'western_plaguelands.cpp:885-899 EnterEvadeMode',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_TIRION_FORDRING,
      kind: 'creature',
      reason:
        'NPC 12126 Lord Tirion Fordring is ScriptName-bound in DB but absent from product bake - IR + combat timers ported; mid-5944 summon at TIRION_SPAWN; bake quest ender 1855 Tirion Fordring is a different template (no ScriptDev combat AI)',
      cite: 'western_plaguelands.cpp:854-981; loadRealBundle missing 12126, has 1855',
    },
  ],
  cites: [
    'western_plaguelands.cpp:854-981 npc_tirion_fordring',
    'western_plaguelands.cpp:868-873 Reset combat timers',
    'western_plaguelands.cpp:875-878 Aggro Devotion Aura',
    'western_plaguelands.cpp:902-912 ReceiveAIEvent START_ESCORT',
    'western_plaguelands.cpp:914-933 WaypointReached WP3 unmount + MovePoint Taelan',
    'western_plaguelands.cpp:944-975 UpdateEscortAI combat',
  ],
};
