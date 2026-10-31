// World npcs_special ScriptDev IR ports. Source: scripts/world/npcs_special.cpp — the chicken,
// triage, garments, guardian, innkeeper, redemption, cleaner, void zone and target dummy.

import type { ScriptDevIR, ScriptDevAction, ScriptDevUnusedBinding } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAiConstants.ts';

// Constants — chicken_cluck

/** Cite: npcs_special.cpp:52–53 EMOTE_CLUCK_TEXT1/2 */
export const EMOTE_CLUCK_TEXT1 = -1000204;
export const EMOTE_CLUCK_TEXT2 = -1000205;
/** Cite: npcs_special.cpp:55 QUEST_CLUCK = 3861 */
export const QUEST_CLUCK = 3861;
/** Cite: npcs_special.cpp:56–57 FACTION_FRIENDLY=35, FACTION_CHICKEN=31 */
export const FACTION_FRIENDLY_CLUCK = 35;
export const FACTION_CHICKEN = 31;
/** Cite: SharedDefines.h TEXTEMOTE_CHEER=21, TEXTEMOTE_CHICKEN=22 */
export const TEXTEMOTE_CHEER = 21;
export const TEXTEMOTE_CHICKEN = 22;
/** Cite: npcs_special.cpp:68 m_uiResetFlagTimer = 20000 */
export const CHICKEN_RESET_FLAG_TIMER_MS = 20_000;
/** Cite: npcs_special.cpp:76 urand(0, 49) — 1/50 chance on /chicken */
export const CHICKEN_EMOTE_CHANCE_DENOM = 50;
/** Cite: corpus boundCreatures entry 620 Chicken */
export const NPC_CHICKEN = 620;
/** Cite: Unit.h UNIT_NPC_FLAG_QUESTGIVER = 0x2 */
export const UNIT_NPC_FLAG_QUESTGIVER = 0x00000002;

// Constants — triage (doctor + injured patient)

/** Cite: npcs_special.cpp:117–119 SAY_DOC1/2/3 */
export const SAY_DOC1 = -1000201;
export const SAY_DOC2 = -1000202;
export const SAY_DOC3 = -1000203;
/** Cite: npcs_special.cpp:121–122 QUEST_TRIAGE_H=6622, QUEST_TRIAGE_A=6624 */
export const QUEST_TRIAGE_H = 6622;
export const QUEST_TRIAGE_A = 6624;
/** Cite: npcs_special.cpp:124–125 DOCTOR_ALLIANCE=12939, DOCTOR_HORDE=12920 */
export const DOCTOR_ALLIANCE = 12939;
export const DOCTOR_HORDE = 12920;
/** Cite: npcs_special.cpp:126–127 ALLIANCE_COORDS=7, HORDE_COORDS=6 */
export const ALLIANCE_COORDS_COUNT = 7;
export const HORDE_COORDS_COUNT = 6;
/** Cite: npcs_special.cpp:166–178 AllianceSoldierId / HordeSoldierId */
export const ALLIANCE_SOLDIER_IDS = [12938, 12936, 12937] as const;
export const HORDE_SOLDIER_IDS = [12923, 12924, 12925] as const;
/** Cite: npcs_special.cpp:205 / 359 m_uiSummonPatientTimer = 10000 */
export const SUMMON_PATIENT_TIMER_MS = 10_000;
/** Cite: npcs_special.cpp:442 m_uiSummonPatientCount >= 21 */
export const MAX_PATIENT_SUMMONS = 21;
/** Cite: npcs_special.cpp:414 m_uiPatientSavedCount == 15 */
export const PATIENTS_SAVED_SUCCESS = 15;
/** Cite: npcs_special.cpp:388 m_uiPatientDiedCount > 5 (6 deaths fail) */
export const PATIENTS_DIED_FAIL = 6;
/** Cite: npcs_special.cpp:464 TEMPSPAWN despawn 5000 */
export const PATIENT_DESPAWN_MS = 5000;
/** Cite: npcs_special.cpp:273 SpellHit pSpell->Id == 20804 (Triage Bandage) */
export const SPELL_TRIAGE_BANDAGE = 20804;
/** Cite: npcs_special.cpp:147–149 / 162–164 run-to coords */
export const A_RUNTOX = -3742.96;
export const A_RUNTOY = -4531.52;
export const A_RUNTOZ = 11.91;
export const H_RUNTOX = -1016.44;
export const H_RUNTOY = -3508.48;
export const H_RUNTOZ = 62.96;
/** Cite: npcs_special.cpp:258 / 262 / 266 health fractions */
export const PATIENT_HP_INJURED = 0.75;
export const PATIENT_HP_BADLY = 0.5;
export const PATIENT_HP_CRITICAL = 0.25;
/** Cite: npcs_special.cpp:324 uiHPLose = 0.05f * uiDiff (per ms) */
export const PATIENT_HP_LOSE_PER_MS = 0.05;
/** Cite: npcs_special.cpp:135–159 AllianceCoords×7 / HordeCoords×6 bunk points */

// Constants — garments_of_quests

/** Cite: npcs_special.cpp:508–509 SPELL_LESSER_HEAL_R2 / SPELL_FORTITUDE_R1 */
export const SPELL_LESSER_HEAL_R2 = 2052;
export const SPELL_FORTITUDE_R1 = 1243;
/** Cite: npcs_special.cpp:511–515 quests */
export const QUEST_MOON = 5621;
export const QUEST_LIGHT_1 = 5624;
export const QUEST_LIGHT_2 = 5625;
export const QUEST_SPIRIT = 5648;
export const QUEST_DARKNESS = 5650;
/** Cite: npcs_special.cpp:517–521 ENTRY_* */
export const ENTRY_SHAYA = 12429;
export const ENTRY_ROBERTS = 12423;
export const ENTRY_DOLF = 12427;
export const ENTRY_KORJA = 12430;
export const ENTRY_DG_KEL = 12428;
/** Cite: npcs_special.cpp:523–533 SAY_* */
export const SAY_COMMON_HEALED = -1000231;
export const SAY_DG_KEL_THANKS = -1000232;
export const SAY_DG_KEL_GOODBYE = -1000233;
export const SAY_ROBERTS_THANKS = -1000256;
export const SAY_ROBERTS_GOODBYE = -1000257;
export const SAY_KORJA_THANKS = -1000258;
export const SAY_KORJA_GOODBYE = -1000259;
export const SAY_DOLF_THANKS = -1000260;
export const SAY_DOLF_GOODBYE = -1000261;
export const SAY_SHAYA_THANKS = -1000262;
export const SAY_SHAYA_GOODBYE = -1000263;
/** Cite: npcs_special.cpp:554 m_uiRunAwayTimer = 5000; :697 re-arm 30000 */
export const GARMENTS_RUN_AWAY_TIMER_MS = 5000;
export const GARMENTS_RUN_AWAY_REARM_MS = 30_000;
/** Cite: npcs_special.cpp:560 SetHealth(max * 0.7) */
export const GARMENTS_HP_FRACTION = 0.7;

export const GARMENTS_BOUND = [
  ENTRY_ROBERTS,
  ENTRY_DOLF,
  ENTRY_DG_KEL,
  ENTRY_SHAYA,
  ENTRY_KORJA,
] as const;

export const GARMENTS_ENTRY_QUEST: Readonly<Record<number, number>> = {
  [ENTRY_SHAYA]: QUEST_MOON,
  [ENTRY_ROBERTS]: QUEST_LIGHT_1,
  [ENTRY_DOLF]: QUEST_LIGHT_2,
  [ENTRY_KORJA]: QUEST_SPIRIT,
  [ENTRY_DG_KEL]: QUEST_DARKNESS,
};

export const GARMENTS_ENTRY_THANKS: Readonly<Record<number, number>> = {
  [ENTRY_SHAYA]: SAY_SHAYA_THANKS,
  [ENTRY_ROBERTS]: SAY_ROBERTS_THANKS,
  [ENTRY_DOLF]: SAY_DOLF_THANKS,
  [ENTRY_KORJA]: SAY_KORJA_THANKS,
  [ENTRY_DG_KEL]: SAY_DG_KEL_THANKS,
};

export const GARMENTS_ENTRY_GOODBYE: Readonly<Record<number, number>> = {
  [ENTRY_SHAYA]: SAY_SHAYA_GOODBYE,
  [ENTRY_ROBERTS]: SAY_ROBERTS_GOODBYE,
  [ENTRY_DOLF]: SAY_DOLF_GOODBYE,
  [ENTRY_KORJA]: SAY_KORJA_GOODBYE,
  [ENTRY_DG_KEL]: SAY_DG_KEL_GOODBYE,
};

// Constants — guardian

/** Cite: npcs_special.cpp:721 SPELL_DEATHTOUCH = 5 */
export const SPELL_DEATHTOUCH = 5;
/** Cite: npcs_special.cpp:722 SAY_AGGRO = 2077 (broadcast_text) */
export const SAY_GUARDIAN_AGGRO = 2077;
/** Cite: corpus boundCreatures 5764 Guardian of Blizzard */
export const NPC_GUARDIAN_OF_BLIZZARD = 5764;

// Constants — innkeeper

/** Cite: npcs_special.cpp:762 TEXT_ID_WHAT_TO_DO = 1853 */
export const TEXT_ID_WHAT_TO_DO = 1853;
/** Cite: npcs_special.cpp:764–765 SPELL_TRICK_OR_TREAT / TREATED */
export const SPELL_TRICK_OR_TREAT = 24751;
export const SPELL_TRICK_OR_TREATED = 24755;
/** Cite: sc_gossip.h GOSSIP_ACTION_INFO_DEF = 1000; :775–783 actions +1/+2 */
export const GOSSIP_ACTION_INFO_DEF = 1000;
export const INN_ACTION_WHAT_TO_DO = GOSSIP_ACTION_INFO_DEF + 1;
export const INN_ACTION_TRICK_OR_TREAT = GOSSIP_ACTION_INFO_DEF + 2;
/** Cite: SharedDefines HOLIDAY_HALLOWS_END (IsHolidayActive gate) */
export const HOLIDAY_HALLOWS_END = 'hallows_end';

// Constants — redemption_target

/** Cite: npcs_special.cpp:820–826 spells + texts */
export const SAY_HEAL = -1000187;
export const SAY_HEAL_HENZE_NARM_FAULK = 2283;
export const SPELL_SYMBOL_OF_LIFE = 8593;
export const SPELL_QUEST_SELF_HEALING = 25155;
/** TBC-only residual (cpp "Not used until TBC"); dispositioned orphans. */
export const SPELL_SHIMMERING_VESSEL = 31225;
export const SPELL_REVIVE_SELF = 32343;
/** Cite: npcs_special.cpp:828–831 NPC_* */
export const NPC_HENZE_FAULK = 6172;
export const NPC_NARM_FAULK = 6177;
export const NPC_FURBOLG_SHAMAN = 17542;
export const NPC_BLOOD_KNIGHT = 17768;
/** Cite: npcs_special.cpp:867 m_uiEvadeTimer = 2 * MINUTE * IN_MILLISECONDS */
export const REDEMPTION_EVADE_TIMER_MS = 2 * 60 * 1000;
/** Cite: npcs_special.cpp:869–871 orientation/text/emote timers */
export const REDEMPTION_ORIENTATION_MS = 3000;
export const REDEMPTION_TEXT_MS = 4000;
export const REDEMPTION_EMOTE_MS = 7000;
/** Cite: SharedDefines EMOTE_ONESHOT_KNEEL */
export const EMOTE_ONESHOT_KNEEL = 16;

// Constants — the_cleaner

/** Cite: npcs_special.cpp:966 SPELL_IMMUNITY = 29230 */
export const SPELL_IMMUNITY = 29230;
/** Cite: npcs_special.cpp:967 SAY_CLEANER_AGGRO = -1001253 */
export const SAY_CLEANER_AGGRO = -1001253;
/** Cite: npcs_special.cpp:979 m_uiDespawnTimer = 3000 */
export const CLEANER_DESPAWN_TIMER_MS = 3000;
/** Cite: corpus 14503 The Cleaner */
export const NPC_THE_CLEANER = 14503;

// Constants — aoe_damage_trigger (Void Zone)

/** Cite: npcs_special.cpp:1023 NPC_VOID_ZONE = 16697 */
export const NPC_VOID_ZONE = 16697;
/** Cite: npcs_special.cpp:1026 SPELL_CONSUMPTION_NPC_16697 = 28874 */
export const SPELL_CONSUMPTION_NPC_16697 = 28874;
/** Cite: npcs_special.cpp:1041 GetTimer() return 2500 */
export const VOID_ZONE_CONSUMPTION_TIMER_MS = 2500;

// Constants — advanced_target_dummy

/** Cite: npcs_special.cpp:1079 SUICIDE = 7 */
export const SPELL_SUICIDE = 7;
/** Cite: npcs_special.cpp:1080 TARGET_DUMMY_SPAWN_EFFECT = 4507 (not corpus spellIds) */
export const TARGET_DUMMY_SPAWN_EFFECT = 4507;
/** Cite: npcs_special.cpp:1085 m_dieTimer(15000) */
export const TARGET_DUMMY_DIE_TIMER_MS = 15_000;
/** Cite: corpus 2674 Advanced Target Dummy */
export const NPC_ADVANCED_TARGET_DUMMY = 2674;

// Product bake presence (tables/creatures) — live-bake fight targets

/** Entries present in loadRealBundle() creatures for createSession. */
export const NPCS_SPECIAL_IN_BAKE = new Set([
  ENTRY_ROBERTS,
  ENTRY_DOLF,
  ENTRY_DG_KEL,
  ENTRY_SHAYA,
  ENTRY_KORJA,
  NPC_HENZE_FAULK,
  NPC_NARM_FAULK,
  NPC_ADVANCED_TARGET_DUMMY,
  // First-aid triage doctors (also profession trainers) — baked for faction gate (KI-433/440).
  DOCTOR_HORDE,
  DOCTOR_ALLIANCE,
]);

// Pure helpers — chicken_cluck

export type ChickenEmoteResult =
  | {
      handled: true;
      setFriendly: true;
      setQuestGiver: true;
      textId: number;
      resetFlagTimerMs: number;
      cite: string;
    }
  | { handled: false; cite: string };

/** Cite: npcs_special.cpp:74–88; chickenRoll 0 = 1/50 success; cheer needs COMPLETE. */
export function chickenReceiveEmote(
  textEmote: number,
  chickenRoll: number,
  questComplete: boolean,
): ChickenEmoteResult {
  if ((textEmote | 0) === TEXTEMOTE_CHICKEN) {
    // Cite: npcs_special.cpp:76 !urand(0, 49) → roll 0 of 0..49
    if ((chickenRoll | 0) !== 0) {
      return {
        handled: false,
        cite: 'npcs_special.cpp:76 urand(0,49) failed - no questgiver',
      };
    }
    return {
      handled: true,
      setFriendly: true,
      setQuestGiver: true,
      textId: EMOTE_CLUCK_TEXT1,
      resetFlagTimerMs: CHICKEN_RESET_FLAG_TIMER_MS,
      cite: 'npcs_special.cpp:76-80 TEXTEMOTE_CHICKEN success → friendly + QUESTGIVER + EMOTE_CLUCK_TEXT1',
    };
  }
  if ((textEmote | 0) === TEXTEMOTE_CHEER) {
    if (!questComplete) {
      return {
        handled: false,
        cite: 'npcs_special.cpp:82 QUEST_CLUCK must be COMPLETE for cheer',
      };
    }
    return {
      handled: true,
      setFriendly: true,
      setQuestGiver: true,
      textId: EMOTE_CLUCK_TEXT2,
      resetFlagTimerMs: CHICKEN_RESET_FLAG_TIMER_MS,
      cite: 'npcs_special.cpp:82-87 TEXTEMOTE_CHEER + COMPLETE → friendly + QUESTGIVER + EMOTE_CLUCK_TEXT2',
    };
  }
  return { handled: false, cite: 'npcs_special.cpp:74-88 unknown emote' };
}

/** Cite: npcs_special.cpp:90–99 expire → EnterEvadeMode. */
export function chickenResetFlagTick(
  hasQuestGiver: boolean,
  resetFlagTimerMs: number,
  diffMs: number,
): { resetFlagTimerMs: number; enterEvade: boolean; cite: string } {
  if (!hasQuestGiver) {
    return {
      resetFlagTimerMs: CHICKEN_RESET_FLAG_TIMER_MS,
      enterEvade: false,
      cite: 'npcs_special.cpp:93 no QUESTGIVER - timer idle',
    };
  }
  if (resetFlagTimerMs < (diffMs | 0)) {
    return {
      resetFlagTimerMs: 0,
      enterEvade: true,
      cite: 'npcs_special.cpp:95-96 timer expired → EnterEvadeMode (Reset faction/flags)',
    };
  }
  return {
    resetFlagTimerMs: resetFlagTimerMs - (diffMs | 0),
    enterEvade: false,
    cite: 'npcs_special.cpp:98 timer -= diff',
  };
}

// Pure helpers — triage doctor / patient

export interface TriageEventState {
  inProgress: boolean;
  summonPatientTimerMs: number;
  summonPatientCount: number;
  patientDiedCount: number;
  patientSavedCount: number;
  coordPoolSize: number;
}

/** Cite: npcs_special.cpp:355–378 BeginEvent. */
export function triageBeginEvent(doctorEntry: number): TriageEventState {
  const coords =
    (doctorEntry | 0) === DOCTOR_HORDE
      ? HORDE_COORDS_COUNT
      : (doctorEntry | 0) === DOCTOR_ALLIANCE
        ? ALLIANCE_COORDS_COUNT
        : 0;
  return {
    inProgress: true,
    summonPatientTimerMs: SUMMON_PATIENT_TIMER_MS,
    summonPatientCount: 0,
    patientDiedCount: 0,
    patientSavedCount: 0,
    coordPoolSize: coords,
  };
}

/** Cite: npcs_special.cpp:407–437 PatientSaved; success at 15. */
export function triagePatientSaved(
  state: TriageEventState,
): { state: TriageEventState; success: boolean; cite: string } {
  const next = {
    ...state,
    patientSavedCount: state.patientSavedCount + 1,
    coordPoolSize: state.coordPoolSize + 1,
  };
  if (next.patientSavedCount === PATIENTS_SAVED_SUCCESS) {
    return {
      state: {
        inProgress: false,
        summonPatientTimerMs: SUMMON_PATIENT_TIMER_MS,
        summonPatientCount: 0,
        patientDiedCount: 0,
        patientSavedCount: PATIENTS_SAVED_SUCCESS,
        coordPoolSize: 0,
      },
      success: true,
      cite: 'npcs_special.cpp:414-431 PatientSaved==15 → RewardPlayerAndGroupAtEventExplored + Reset',
    };
  }
  return {
    state: next,
    success: false,
    cite: 'npcs_special.cpp:412-435 PatientSaved++ + push coord back',
  };
}

/** Cite: npcs_special.cpp:380–404 PatientDied; fail when deaths > 5. */
export function triagePatientDied(
  state: TriageEventState,
): { state: TriageEventState; fail: boolean; cite: string } {
  const died = state.patientDiedCount + 1;
  if (died > 5) {
    return {
      state: {
        inProgress: false,
        summonPatientTimerMs: SUMMON_PATIENT_TIMER_MS,
        summonPatientCount: 0,
        patientDiedCount: died,
        patientSavedCount: 0,
        coordPoolSize: 0,
      },
      fail: true,
      cite: 'npcs_special.cpp:388-396 PatientDied>5 → FailQuest + Reset',
    };
  }
  return {
    state: {
      ...state,
      patientDiedCount: died,
      coordPoolSize: state.coordPoolSize + 1,
    },
    fail: false,
    cite: 'npcs_special.cpp:386-399 PatientDied++ + return coord to pool',
  };
}

/** Cite: npcs_special.cpp:440–483 summon timer; soldierRoll 0..2. */
export function triageSummonTick(
  state: TriageEventState,
  doctorEntry: number,
  soldierRoll: number,
  diffMs: number,
): {
  state: TriageEventState;
  summonedEntry: number | null;
  resetCap: boolean;
  cite: string;
} {
  if (!state.inProgress) {
    return {
      state,
      summonedEntry: null,
      resetCap: false,
      cite: 'npcs_special.cpp:448 event not in progress',
    };
  }
  if (state.summonPatientCount >= MAX_PATIENT_SUMMONS) {
    return {
      state: {
        inProgress: false,
        summonPatientTimerMs: SUMMON_PATIENT_TIMER_MS,
        summonPatientCount: state.summonPatientCount,
        patientDiedCount: 0,
        patientSavedCount: 0,
        coordPoolSize: 0,
      },
      summonedEntry: null,
      resetCap: true,
      cite: 'npcs_special.cpp:442-445 summon count>=21 worst case → Reset',
    };
  }
  if (state.coordPoolSize <= 0) {
    return {
      state,
      summonedEntry: null,
      resetCap: false,
      cite: 'npcs_special.cpp:448 empty coord pool - wait',
    };
  }
  if (state.summonPatientTimerMs >= (diffMs | 0)) {
    return {
      state: {
        ...state,
        summonPatientTimerMs: state.summonPatientTimerMs - (diffMs | 0),
      },
      summonedEntry: null,
      resetCap: false,
      cite: 'npcs_special.cpp:482 timer -= diff',
    };
  }
  const ids =
    (doctorEntry | 0) === DOCTOR_HORDE
      ? HORDE_SOLDIER_IDS
      : (doctorEntry | 0) === DOCTOR_ALLIANCE
        ? ALLIANCE_SOLDIER_IDS
        : null;
  if (!ids) {
    return {
      state,
      summonedEntry: null,
      resetCap: false,
      cite: 'npcs_special.cpp:459-461 invalid doctor entry',
    };
  }
  const idx = Math.max(0, Math.min(2, soldierRoll | 0));
  return {
    state: {
      ...state,
      summonPatientTimerMs: SUMMON_PATIENT_TIMER_MS,
      summonPatientCount: state.summonPatientCount + 1,
      coordPoolSize: state.coordPoolSize - 1,
    },
    summonedEntry: ids[idx]!,
    resetCap: false,
    cite: 'npcs_special.cpp:450-479 SummonCreature patient + re-arm 10000',
  };
}

/** Cite: npcs_special.cpp:253–268 patient HP fraction by entry. */
export function patientHpFraction(entry: number): number {
  switch (entry | 0) {
    case 12923:
    case 12938:
      return PATIENT_HP_INJURED;
    case 12924:
    case 12936:
      return PATIENT_HP_BADLY;
    case 12925:
    case 12937:
      return PATIENT_HP_CRITICAL;
    default:
      return 1;
  }
}

/** Cite: npcs_special.cpp:291–296 SAY_DOC urand(0,2). */
export function patientDocSay(roll: number): number {
  const r = Math.max(0, Math.min(2, roll | 0));
  if (r === 0) return SAY_DOC1;
  if (r === 1) return SAY_DOC2;
  return SAY_DOC3;
}

/** Cite: npcs_special.cpp:323–328 uiHPLose = 0.05f * uiDiff. */
export function patientHpLose(diffMs: number): number {
  return Math.floor(PATIENT_HP_LOSE_PER_MS * (diffMs | 0));
}

// Pure helpers — garments_of_quests

export interface GarmentsState {
  isHealed: boolean;
  canRun: boolean;
  runAwayTimerMs: number;
}

export function garmentsReset(): GarmentsState {
  return {
    isHealed: false,
    canRun: false,
    runAwayTimerMs: GARMENTS_RUN_AWAY_TIMER_MS,
  };
}

export type GarmentsSpellHitResult =
  | {
      handled: true;
      phase: 'healed' | 'fortitude_credit';
      textId: number;
      questCreditEntry: number | null;
      state: GarmentsState;
      cite: string;
    }
  | { handled: false; cite: string };

/** Cite: npcs_special.cpp:563–670 Lesser Heal → Fortitude machine. */
export function garmentsSpellHit(opts: {
  entry: number;
  spellId: number;
  questIncomplete: boolean;
  inCombat: boolean;
  state: GarmentsState;
}): GarmentsSpellHitResult {
  const { entry, spellId, questIncomplete, inCombat, state } = opts;
  if ((spellId | 0) !== SPELL_LESSER_HEAL_R2 && (spellId | 0) !== SPELL_FORTITUDE_R1) {
    return { handled: false, cite: 'npcs_special.cpp:565 spell id gate 2052/1243' };
  }
  if (inCombat) {
    return { handled: false, cite: 'npcs_special.cpp:568-569 IsInCombat gate' };
  }
  if (state.isHealed && state.canRun) {
    return { handled: false, cite: 'npcs_special.cpp:572-573 already healed+canRun' };
  }
  if (!questIncomplete) {
    return { handled: false, cite: 'npcs_special.cpp:577+ quest incomplete gate' };
  }
  const quest = GARMENTS_ENTRY_QUEST[entry | 0];
  if (quest === undefined) {
    return { handled: false, cite: 'npcs_special.cpp:577 unknown garments entry' };
  }

  if ((spellId | 0) === SPELL_LESSER_HEAL_R2) {
    if (state.isHealed) {
      return { handled: false, cite: 'npcs_special.cpp:587+ already healed - need Fortitude' };
    }
    return {
      handled: true,
      phase: 'healed',
      textId: SAY_COMMON_HEALED,
      questCreditEntry: null,
      state: { ...state, isHealed: true },
      cite: 'npcs_special.cpp:587-592 Lesser Heal → stand + SAY_COMMON_HEALED + m_bIsHealed',
    };
  }

  // Fortitude
  if (!state.isHealed || state.canRun) {
    return {
      handled: false,
      cite: 'npcs_special.cpp:582 needs isHealed && !canRun for Fortitude',
    };
  }
  const thanks = GARMENTS_ENTRY_THANKS[entry | 0]!;
  return {
    handled: true,
    phase: 'fortitude_credit',
    textId: thanks,
    questCreditEntry: entry | 0,
    state: { ...state, canRun: true },
    cite: 'npcs_special.cpp:582-586 Fortitude → thanks + m_bCanRun + TalkedToCreature',
  };
}

/** Cite: npcs_special.cpp:675–701 run-away after Fortitude. */
export function garmentsRunAwayTick(
  state: GarmentsState,
  inCombat: boolean,
  diffMs: number,
  entry: number,
): {
  state: GarmentsState;
  goodbyeTextId: number | null;
  startEscort: boolean;
  cite: string;
} {
  if (!state.canRun || inCombat) {
    return {
      state,
      goodbyeTextId: null,
      startEscort: false,
      cite: 'npcs_special.cpp:677 canRun && !IsInCombat gate',
    };
  }
  if (state.runAwayTimerMs > (diffMs | 0)) {
    return {
      state: { ...state, runAwayTimerMs: state.runAwayTimerMs - (diffMs | 0) },
      goodbyeTextId: null,
      startEscort: false,
      cite: 'npcs_special.cpp:700 timer -= diff',
    };
  }
  return {
    state: { ...state, runAwayTimerMs: GARMENTS_RUN_AWAY_REARM_MS },
    goodbyeTextId: GARMENTS_ENTRY_GOODBYE[entry | 0] ?? null,
    startEscort: true,
    cite: 'npcs_special.cpp:679-697 goodbye + Start(true) + re-arm 30000',
  };
}

// Pure helpers — innkeeper gossip

export type InnkeeperGossipItem =
  | { kind: 'trick_or_treat'; action: number; cite: string }
  | { kind: 'what_to_do'; action: number; cite: string };

/** Cite: npcs_special.cpp:771–788 GossipHello_npc_innkeeper. */
export function innkeeperGossipHello(opts: {
  holidayHallowsEnd: boolean;
  hasTrickOrTreatedAura: boolean;
}): { items: InnkeeperGossipItem[]; cite: string } {
  const items: InnkeeperGossipItem[] = [];
  if (opts.holidayHallowsEnd && !opts.hasTrickOrTreatedAura) {
    items.push({
      kind: 'trick_or_treat',
      action: INN_ACTION_TRICK_OR_TREAT,
      cite: 'npcs_special.cpp:775-776 HOLIDAY_HALLOWS_END && !HasAura(24755)',
    });
  }
  // Cite: npcs_special.cpp:779-783 — always offered when area lookup succeeds
  // (AREA_FLAG_LOWLEVEL gate commented out in Classic).
  items.push({
    kind: 'what_to_do',
    action: INN_ACTION_WHAT_TO_DO,
    cite: 'npcs_special.cpp:779-783 ADD_GOSSIP_ITEM What can I do at an Inn?',
  });
  return { items, cite: 'npcs_special.cpp:771-788 GossipHello_npc_innkeeper' };
}

export type InnkeeperSelectResult =
  | {
      handled: true;
      phase: 'what_to_do' | 'trick_or_treat' | 'vendor' | 'bind';
      textId: number | null;
      castSpellId: number | null;
      closeMenu: boolean;
      cite: string;
    }
  | { handled: false; cite: string };

/** Cite: npcs_special.cpp:791–811 GossipSelect_npc_innkeeper. */
export function innkeeperGossipSelect(action: number): InnkeeperSelectResult {
  if ((action | 0) === INN_ACTION_WHAT_TO_DO) {
    return {
      handled: true,
      phase: 'what_to_do',
      textId: TEXT_ID_WHAT_TO_DO,
      castSpellId: null,
      closeMenu: false,
      cite: 'npcs_special.cpp:795-796 SEND_GOSSIP_MENU TEXT_ID_WHAT_TO_DO=1853',
    };
  }
  if ((action | 0) === INN_ACTION_TRICK_OR_TREAT) {
    return {
      handled: true,
      phase: 'trick_or_treat',
      textId: null,
      castSpellId: SPELL_TRICK_OR_TREAT,
      closeMenu: true,
      cite: 'npcs_special.cpp:798-800 CLOSE + CastSpell SPELL_TRICK_OR_TREAT 24751',
    };
  }
  // GOSSIP_OPTION_VENDOR / INNKEEPER are absolute option ids (not INFO_DEF+n).
  // Cite: npcs_special.cpp:802-808
  if ((action | 0) === 1 /* GOSSIP_OPTION_VENDOR typical */) {
    return {
      handled: true,
      phase: 'vendor',
      textId: null,
      castSpellId: null,
      closeMenu: false,
      cite: 'npcs_special.cpp:802-803 GOSSIP_OPTION_VENDOR SEND_VENDORLIST',
    };
  }
  if ((action | 0) === 2 /* GOSSIP_OPTION_INNKEEPER typical */) {
    return {
      handled: true,
      phase: 'bind',
      textId: null,
      castSpellId: null,
      closeMenu: true,
      cite: 'npcs_special.cpp:805-808 GOSSIP_OPTION_INNKEEPER SetBindPoint',
    };
  }
  return { handled: false, cite: 'npcs_special.cpp:791-811 unknown action' };
}

// Pure helpers — redemption_target

export interface RedemptionState {
  evadeTimerMs: number;
  orientationTimerMs: number;
  textTimerMs: number;
  emoteTimerMs: number;
  revived: boolean;
}

export function redemptionReset(): RedemptionState {
  return {
    evadeTimerMs: 0,
    orientationTimerMs: 0,
    textTimerMs: 0,
    emoteTimerMs: 0,
    revived: false,
  };
}

/** Cite: npcs_special.cpp:858–872 DoReviveSelf after Symbol of Life. */
export function redemptionDoReviveSelf(
  state: RedemptionState,
): { state: RedemptionState; castSelfHeal: boolean; cite: string } {
  if (state.evadeTimerMs) {
    return {
      state,
      castSelfHeal: false,
      cite: 'npcs_special.cpp:861-862 Wait until he resets (evade timer active)',
    };
  }
  return {
    state: {
      evadeTimerMs: REDEMPTION_EVADE_TIMER_MS,
      orientationTimerMs: REDEMPTION_ORIENTATION_MS,
      textTimerMs: REDEMPTION_TEXT_MS,
      emoteTimerMs: REDEMPTION_EMOTE_MS,
      revived: true,
    },
    castSelfHeal: true,
    cite: 'npcs_special.cpp:864-871 SPELL_QUEST_SELF_HEALING + stand + 2min evade + timers',
  };
}

export type RedemptionTextResult = {
  textId: number;
  setQuestGiver: boolean;
  killCredit: boolean;
  cite: string;
};

/** Cite: npcs_special.cpp:890–913 text timer by entry. */
export function redemptionTextOnFire(entry: number): RedemptionTextResult {
  if ((entry | 0) === NPC_HENZE_FAULK || (entry | 0) === NPC_NARM_FAULK) {
    return {
      textId: SAY_HEAL_HENZE_NARM_FAULK,
      setQuestGiver: true,
      killCredit: false,
      cite: 'npcs_special.cpp:898-900 Henze/Narm SetFlag QUESTGIVER + DoBroadcastText 2283',
    };
  }
  if ((entry | 0) === NPC_FURBOLG_SHAMAN || (entry | 0) === NPC_BLOOD_KNIGHT) {
    return {
      textId: SAY_HEAL,
      setQuestGiver: false,
      killCredit: true,
      cite: 'npcs_special.cpp:903-906 Furbolg/Blood Knight SAY_HEAL + KilledMonsterCredit',
    };
  }
  return {
    textId: 0,
    setQuestGiver: false,
    killCredit: false,
    cite: 'npcs_special.cpp:890-913 unknown redemption entry',
  };
}

/** Cite: npcs_special.cpp:920–924 Henze/Narm kneel. */
export function redemptionKneelsOnEmote(entry: number): boolean {
  return (entry | 0) === NPC_HENZE_FAULK || (entry | 0) === NPC_NARM_FAULK;
}

// Pure helpers — cleaner / void zone / target dummy

/** Cite: npcs_special.cpp:994–1002 empty-threat ForcedDespawn. */
export function cleanerDespawnTick(
  despawnTimerMs: number,
  threatEmpty: boolean,
  diffMs: number,
): { despawnTimerMs: number; forceDespawn: boolean; cite: string } {
  if (despawnTimerMs < (diffMs | 0)) {
    if (threatEmpty) {
      return {
        despawnTimerMs: 0,
        forceDespawn: true,
        cite: 'npcs_special.cpp:996-999 empty threat → ForcedDespawn',
      };
    }
    return {
      despawnTimerMs: 0,
      forceDespawn: false,
      cite: 'npcs_special.cpp:996-999 timer expired but threat present',
    };
  }
  return {
    despawnTimerMs: despawnTimerMs - (diffMs | 0),
    forceDespawn: false,
    cite: 'npcs_special.cpp:1002 timer -= diff',
  };
}

/** Cite: npcs_special.cpp:1096–1106 m_dieTimer → SUICIDE. */
export function targetDummyDieTick(
  dieTimerMs: number,
  diffMs: number,
): { dieTimerMs: number; castSuicide: boolean; cite: string } {
  if (!dieTimerMs) {
    return { dieTimerMs: 0, castSuicide: false, cite: 'npcs_special.cpp:1098 timer idle' };
  }
  if (dieTimerMs <= (diffMs | 0)) {
    return {
      dieTimerMs: 0,
      castSuicide: true,
      cite: 'npcs_special.cpp:1100-1102 DoCastSpellIfCan SUICIDE 7',
    };
  }
  return {
    dieTimerMs: dieTimerMs - (diffMs | 0),
    castSuicide: false,
    cite: 'npcs_special.cpp:1105 timer -= diff',
  };
}

// Unused-binding helper

function absentCreature(
  entry: number,
  name: string,
  script: string,
  detail: string,
): ScriptDevUnusedBinding {
  return {
    entry,
    kind: 'creature',
    reason: `NPC ${entry} ${name} bound to ${script} (${detail}) but absent from product creatures bake`,
    cite: `npcs_special.cpp ${script}; corpus boundCreatures; loadRealBundle missing ${entry}`,
  };
}

// ScriptDev IR — npc_chicken_cluck

// Cite: npcs_special.cpp:60–109 ReceiveEmote + 20s reset. Binding: 620 Chicken — ABSENT bake →
// unused-binding. QI4 residual: registryNpcsSpecial (quest 3861 chrome).
export const NPC_CHICKEN_CLUCK: ScriptDevIR = {
  name: 'npc_chicken_cluck',
  boundCreatures: [NPC_CHICKEN],
  sourceFile: 'world/npcs_special.cpp',
  spellIds: [],
  timers: [],
  receiveEmotes: [
    {
      emote: TEXTEMOTE_CHICKEN,
      actions: [
        {
          kind: 'yell',
          textId: EMOTE_CLUCK_TEXT1,
          cite: 'npcs_special.cpp:80 DoScriptText EMOTE_CLUCK_TEXT1 (1/50 gate via chickenReceiveEmote)',
        },
        {
          kind: 'flavor',
          text: `setFaction(35) + SetFlag QUESTGIVER; m_uiResetFlagTimer=${CHICKEN_RESET_FLAG_TIMER_MS}`,
          cite: 'npcs_special.cpp:78-79',
        },
      ],
      cite: 'npcs_special.cpp:76-80 TEXTEMOTE_CHICKEN + urand(0,49)',
    },
    {
      emote: TEXTEMOTE_CHEER,
      actions: [
        {
          kind: 'yell',
          textId: EMOTE_CLUCK_TEXT2,
          cite: 'npcs_special.cpp:86 DoScriptText EMOTE_CLUCK_TEXT2 when QUEST_CLUCK COMPLETE',
        },
        {
          kind: 'flavor',
          text: `setFaction(35) + SetFlag QUESTGIVER; m_uiResetFlagTimer=${CHICKEN_RESET_FLAG_TIMER_MS}`,
          cite: 'npcs_special.cpp:84-85',
        },
      ],
      cite: 'npcs_special.cpp:82-87 TEXTEMOTE_CHEER + QUEST_STATUS_COMPLETE',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `m_uiResetFlagTimer=${CHICKEN_RESET_FLAG_TIMER_MS}; setFaction(FACTION_CHICKEN=31); RemoveFlag QUESTGIVER`,
        cite: 'npcs_special.cpp:66-72 Reset',
      },
    ],
    onEvade: [
      {
        kind: 'flavor',
        text: 'EnterEvadeMode after QUESTGIVER flag timer expires → Reset flags',
        cite: 'npcs_special.cpp:95-96',
      },
    ],
  },
  unusedBindings: [
    absentCreature(NPC_CHICKEN, 'Chicken', 'npc_chicken_cluck', 'quest 3861 Cluck! emote machine'),
  ],
  cites: [
    'npcs_special.cpp:50-58 enums EMOTE/QUEST/FACTION',
    'npcs_special.cpp:60-104 npc_chicken_cluckAI',
    'npcs_special.cpp:68 m_uiResetFlagTimer=20000',
    'npcs_special.cpp:74-88 ReceiveEmote',
    'npcs_special.cpp:90-99 UpdateAI flag reset',
    'npcs_special.cpp:1114-1117 RegisterSelf',
    'QI4 residual: registryNpcsSpecial.ts quest 3861',
  ],
};

// ScriptDev IR — npc_injured_patient

// Cite: npcs_special.cpp:227–349 patient HP decay + SpellHit 20804. All six patient entries ABSENT bake →
// unused-bindings.
export const NPC_INJURED_PATIENT: ScriptDevIR = {
  name: 'npc_injured_patient',
  boundCreatures: [...ALLIANCE_SOLDIER_IDS, ...HORDE_SOLDIER_IDS],
  sourceFile: 'world/npcs_special.cpp',
  spellIds: [SPELL_TRIAGE_BANDAGE],
  timers: [],
  spellHits: [
    {
      spellId: SPELL_TRIAGE_BANDAGE,
      playerCaster: true,
      actions: [
        {
          kind: 'flavor',
          text: 'PatientSaved → doctor; UNINTERACTIBLE; remove IN_COMBAT; STAND; SAY_DOC1/2/3; MovePoint runto',
          cite: 'npcs_special.cpp:271-314 SpellHit 20804',
        },
        {
          kind: 'yell',
          textId: SAY_DOC1,
          cite: 'npcs_special.cpp:291-296 urand(0,2) SAY_DOC1/2/3 (patientDocSay pure helper)',
        },
      ],
      cite: 'npcs_special.cpp:271-314 SpellHit SPELL_TRIAGE_BANDAGE 20804',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `STAND_DEAD; UNIT_FLAG_IN_COMBAT; HP×${PATIENT_HP_INJURED}/${PATIENT_HP_BADLY}/${PATIENT_HP_CRITICAL} by entry`,
        cite: 'npcs_special.cpp:241-268 Reset',
      },
    ],
  },
  unusedBindings: [
    absentCreature(12923, 'Injured Soldier', 'npc_injured_patient', 'triage patient'),
    absentCreature(12924, 'Badly Injured Soldier', 'npc_injured_patient', 'triage patient'),
    absentCreature(12925, 'Critically Injured Soldier', 'npc_injured_patient', 'triage patient'),
    absentCreature(12936, 'Badly Injured Alliance Soldier', 'npc_injured_patient', 'triage patient'),
    absentCreature(12937, 'Critically Injured Alliance Soldier', 'npc_injured_patient', 'triage patient'),
    absentCreature(12938, 'Injured Alliance Soldier', 'npc_injured_patient', 'triage patient'),
  ],
  cites: [
    'npcs_special.cpp:227-349 npc_injured_patientAI',
    'npcs_special.cpp:258/262/266 HP fractions 0.75/0.50/0.25',
    'npcs_special.cpp:273 SpellHit 20804 Triage Bandage',
    'npcs_special.cpp:323-324 HP lose 0.05f*diff',
    'npcs_special.cpp:1119-1122 RegisterSelf',
    'QI4 residual: registryNpcsSpecial.ts triage bandage/save chain',
  ],
};

// ScriptDev IR — npc_doctor

// npc_doctor BeginEvent plus the summon and save/fail paths. Doctors 12920/12939 are in bake as
// first-aid trainers. Cite: npcs_special.cpp:184–500.
export const NPC_DOCTOR: ScriptDevIR = {
  name: 'npc_doctor',
  boundCreatures: [DOCTOR_HORDE, DOCTOR_ALLIANCE],
  sourceFile: 'world/npcs_special.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `summonTimer=${SUMMON_PATIENT_TIMER_MS}; counters 0; event off; RemoveFlag UNINTERACTIBLE`,
        cite: 'npcs_special.cpp:200-215 Reset',
      },
    ],
  },
  // Both doctors now resolve in creatures.json (service-NPC faction bake).
  unusedBindings: [],
  cites: [
    'npcs_special.cpp:184-221 npc_doctorAI',
    'npcs_special.cpp:355-378 BeginEvent',
    'npcs_special.cpp:380-404 PatientDied >5 FailQuest',
    'npcs_special.cpp:407-437 PatientSaved ==15 explore credit',
    'npcs_special.cpp:440-483 UpdateAI summon every 10000',
    'npcs_special.cpp:486-494 QuestAccept_npc_doctor',
    'npcs_special.cpp:1124-1128 RegisterSelf pQuestAcceptNPC',
    'QI4 residual: registryNpcsSpecial.ts accept/frame explore credit',
  ],
};

// ScriptDev IR — npc_garments_of_quests

const GARMENTS_SPELL_HIT_ACTIONS: ScriptDevAction[] = [
  {
    kind: 'flavor',
    text: 'two-step: 2052 → stand+healed; 1243 → thanks + TalkedToCreature (garmentsSpellHit pure helper)',
    cite: 'npcs_special.cpp:563-670',
  },
];

// Cite: npcs_special.cpp:536–713 garments SpellHit + 5s run-away. Bindings 12423/12427/12428/12429/12430
// PRESENT in bake.
export const NPC_GARMENTS_OF_QUESTS: ScriptDevIR = {
  name: 'npc_garments_of_quests',
  boundCreatures: [...GARMENTS_BOUND],
  sourceFile: 'world/npcs_special.cpp',
  spellIds: [SPELL_LESSER_HEAL_R2, SPELL_FORTITUDE_R1],
  timers: [],
  spellHits: [
    {
      spellId: SPELL_LESSER_HEAL_R2,
      playerCaster: true,
      actions: [
        ...GARMENTS_SPELL_HIT_ACTIONS,
        {
          kind: 'yell',
          textId: SAY_COMMON_HEALED,
          cite: 'npcs_special.cpp:591 DoScriptText SAY_COMMON_HEALED on Lesser Heal',
        },
      ],
      cite: 'npcs_special.cpp:565-593 SPELL_LESSER_HEAL_R2 2052',
    },
    {
      spellId: SPELL_FORTITUDE_R1,
      playerCaster: true,
      actions: [
        ...GARMENTS_SPELL_HIT_ACTIONS,
        {
          kind: 'quest_credit',
          entry: ENTRY_SHAYA,
          credit: 'talkedTo',
          cite: 'npcs_special.cpp:667-668 TalkedToCreature(entry) after Fortitude (per-entry via garmentsSpellHit)',
        },
      ],
      cite: 'npcs_special.cpp:565-668 SPELL_FORTITUDE_R1 1243',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `kneel; UNIT_FLAG_PVP; SetHealth(max*${GARMENTS_HP_FRACTION}); runAwayTimer=${GARMENTS_RUN_AWAY_TIMER_MS}`,
        cite: 'npcs_special.cpp:547-560 Reset',
      },
    ],
  },
  cites: [
    'npcs_special.cpp:506-534 enums spells/quests/entries/SAYs',
    'npcs_special.cpp:536-707 npc_garments_of_questsAI',
    'npcs_special.cpp:554 m_uiRunAwayTimer=5000; :697 re-arm 30000',
    'npcs_special.cpp:560 SetHealth 0.7',
    'npcs_special.cpp:563-670 SpellHit 2052/1243',
    'npcs_special.cpp:675-701 UpdateEscortAI run-away',
    'npcs_special.cpp:1130-1133 RegisterSelf',
    'QI4 residual: registryNpcsSpecial.ts garments frame kill credit',
  ],
};

// ScriptDev IR — npc_guardian

// npc_guardian Death Touch on attack-ready; binding 5764 is absent from bake. The cast is
// weapon-paced, not a fixed timer, so empty timers are correct. Cite: npcs_special.cpp:725–749.
export const NPC_GUARDIAN: ScriptDevIR = {
  name: 'npc_guardian',
  boundCreatures: [NPC_GUARDIAN_OF_BLIZZARD],
  sourceFile: 'world/npcs_special.cpp',
  spellIds: [SPELL_DEATHTOUCH],
  timers: [],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_GUARDIAN_AGGRO,
        cite: 'npcs_special.cpp:729-731 Aggro DoBroadcastText 2077',
      },
    ],
    onReset: [
      {
        kind: 'flavor',
        text: 'ScriptedAI Reset; combat: isAttackReady → CastSpell Death Touch 5 TRIGGERED + resetAttackTimer',
        cite: 'npcs_special.cpp:734-743 UpdateAI',
      },
    ],
  },
  unusedBindings: [
    absentCreature(
      NPC_GUARDIAN_OF_BLIZZARD,
      'Guardian of Blizzard',
      'npc_guardian',
      'Death Touch off-limits guard',
    ),
  ],
  cites: [
    'npcs_special.cpp:719-723 GuardianOfB SPELL_DEATHTOUCH=5 SAY_AGGRO=2077',
    'npcs_special.cpp:725-749 npc_guardianAI',
    'npcs_special.cpp:739-742 CastSpell Death Touch TRIGGERED on attack ready',
    'npcs_special.cpp:1135-1138 RegisterSelf',
    'ContentData: guardianAI not in use by SD2 (still registered)',
  ],
};

// ScriptDev IR — npc_innkeeper

// Cite: npcs_special.cpp:771–811 gossip only; RegisterSelf(false). No corpus creature binding — gossip pure
// helpers are the product surface.
export const NPC_INNKEEPER: ScriptDevIR = {
  name: 'npc_innkeeper',
  boundCreatures: [],
  sourceFile: 'world/npcs_special.cpp',
  spellIds: [SPELL_TRICK_OR_TREAT, SPELL_TRICK_OR_TREATED],
  timers: [],
  gossipHello: {
    defaultTextId: TEXT_ID_WHAT_TO_DO,
    cite: 'npcs_special.cpp:771-788 GossipHello; TEXT_ID_WHAT_TO_DO=1853 on select +1',
  },
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'gossip-only innkeeper (innkeeperGossipHello/Select); Hallow\'s End 24751 gated by !HasAura(24755)',
        cite: 'npcs_special.cpp:771-811',
      },
    ],
  },
  cites: [
    'npcs_special.cpp:760-766 enums TEXT_ID / SPELL_TRICK_OR_TREAT 24751 / TREATED 24755',
    'npcs_special.cpp:771-788 GossipHello_npc_innkeeper',
    'npcs_special.cpp:791-811 GossipSelect_npc_innkeeper',
    'npcs_special.cpp:1140-1144 RegisterSelf(false) - disabled by default',
  ],
};

// ScriptDev IR — npc_redemption_target

// Cite: npcs_special.cpp:834–959 Symbol of Life revive chain. Bindings: 6172 Henze Faulk, 6177 Narm Faulk
// PRESENT; TBC furbolg/blood knight not corpus-bound. Spells 31225/32343 dispositioned orphans (TBC-only).
export const NPC_REDEMPTION_TARGET: ScriptDevIR = {
  name: 'npc_redemption_target',
  boundCreatures: [NPC_HENZE_FAULK, NPC_NARM_FAULK],
  sourceFile: 'world/npcs_special.cpp',
  spellIds: [
    SPELL_SYMBOL_OF_LIFE,
    SPELL_QUEST_SELF_HEALING,
    // Documented TBC residual ids (dispositioned; not combat-fired in Classic)
    SPELL_SHIMMERING_VESSEL,
    SPELL_REVIVE_SELF,
  ],
  timers: [],
  spellHits: [
    {
      spellId: SPELL_SYMBOL_OF_LIFE,
      playerCaster: true,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_QUEST_SELF_HEALING,
          castFlags: CAST_FLAG.TRIGGERED,
          cite: 'npcs_special.cpp:864 DoCastSpellIfCan SPELL_QUEST_SELF_HEALING 25155',
        },
        {
          kind: 'flavor',
          text: `stand; remove DYNFLAG_DEAD; evadeTimer=${REDEMPTION_EVADE_TIMER_MS}; orient=${REDEMPTION_ORIENTATION_MS}; text=${REDEMPTION_TEXT_MS}; emote=${REDEMPTION_EMOTE_MS}`,
          cite: 'npcs_special.cpp:858-872 DoReviveSelf',
        },
      ],
      cite: 'npcs_special.cpp:948-958 PaladinQuestReviveSelf OnEffectExecute spell 8593',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'timers 0; RemoveFlag QUESTGIVER; DYNFLAG_DEAD; STAND_DEAD',
        cite: 'npcs_special.cpp:845-856 Reset',
      },
    ],
    onEvade: [
      {
        kind: 'flavor',
        text: '2min evade timer expires → EnterEvadeMode → Reset dead pose',
        cite: 'npcs_special.cpp:930-938',
      },
    ],
  },
  cites: [
    'npcs_special.cpp:818-832 enums Symbol of Life / self heal / TBC vessels',
    'npcs_special.cpp:834-941 npc_redemption_targetAI',
    'npcs_special.cpp:858-872 DoReviveSelf',
    'npcs_special.cpp:867 2*MINUTE*IN_MILLISECONDS evade',
    'npcs_special.cpp:869-871 3000/4000/7000 orientation/text/emote',
    'npcs_special.cpp:898-906 Henze/Narm QUESTGIVER text 2283; TBC kill credit',
    'npcs_special.cpp:948-958 spell_paladin_quest_revive_self',
    'npcs_special.cpp:1146-1149 RegisterSelf',
    'spell-refs-orphans 31225/32343 dispositioned (TBC-only, not in spell_template)',
  ],
};

// ScriptDev IR — npc_the_cleaner

// Cite: npcs_special.cpp:970–1014 Immunity + 3s empty-threat despawn. Binding 14503 ABSENT →
// unused-binding.
export const NPC_THE_CLEANER_SCRIPT: ScriptDevIR = {
  name: 'npc_the_cleaner',
  boundCreatures: [NPC_THE_CLEANER],
  sourceFile: 'world/npcs_special.cpp',
  spellIds: [SPELL_IMMUNITY],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'cast_self',
        spellId: SPELL_IMMUNITY,
        castFlags: CAST_FLAG.TRIGGERED,
        cite: 'npcs_special.cpp:978 DoCastSpellIfCan SPELL_IMMUNITY 29230 CAST_TRIGGERED',
      },
      {
        kind: 'flavor',
        text: `m_uiDespawnTimer=${CLEANER_DESPAWN_TIMER_MS}`,
        cite: 'npcs_special.cpp:979',
      },
    ],
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_CLEANER_AGGRO,
        cite: 'npcs_special.cpp:982-984 Aggro DoScriptText SAY_CLEANER_AGGRO',
      },
    ],
    onEvade: [
      {
        kind: 'force_despawn',
        delayMs: 0,
        cite: 'npcs_special.cpp:987-991 EnterEvadeMode → ForcedDespawn',
      },
    ],
  },
  unusedBindings: [
    absentCreature(NPC_THE_CLEANER, 'The Cleaner', 'npc_the_cleaner', 'immunity despawn helper'),
  ],
  cites: [
    'npcs_special.cpp:964-968 SPELL_IMMUNITY=29230 SAY_CLEANER_AGGRO',
    'npcs_special.cpp:970-1008 npc_the_cleanerAI',
    'npcs_special.cpp:978-979 Reset immunity + despawn timer 3000',
    'npcs_special.cpp:994-1002 empty threat ForcedDespawn',
    'npcs_special.cpp:1151-1154 RegisterSelf',
  ],
};

// ScriptDev IR — npc_aoe_damage_trigger

// Cite: npcs_special.cpp:1029–1061 Void Zone Consumption every 2500ms. Binding 16697 ABSENT →
// unused-binding.
export const NPC_AOE_DAMAGE_TRIGGER: ScriptDevIR = {
  name: 'npc_aoe_damage_trigger',
  boundCreatures: [NPC_VOID_ZONE],
  sourceFile: 'world/npcs_special.cpp',
  spellIds: [SPELL_CONSUMPTION_NPC_16697],
  timers: [
    {
      id: 'consumption',
      spellId: SPELL_CONSUMPTION_NPC_16697,
      initialMinMs: VOID_ZONE_CONSUMPTION_TIMER_MS,
      initialMaxMs: VOID_ZONE_CONSUMPTION_TIMER_MS,
      repeatMinMs: VOID_ZONE_CONSUMPTION_TIMER_MS,
      repeatMaxMs: VOID_ZONE_CONSUMPTION_TIMER_MS,
      target: 'self',
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      creatureEntry: NPC_VOID_ZONE,
      cite: 'npcs_special.cpp:1033 AddCustomAction(1, 2500); :1055-1057 CAST_TRIGGERED|AURA_NOT_PRESENT 28874',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'REACT_PASSIVE; aura passive set from entry (Void Zone → 28874)',
        cite: 'npcs_special.cpp:1031-1034,1044-1052',
      },
    ],
  },
  unusedBindings: [
    absentCreature(NPC_VOID_ZONE, 'Void Zone', 'npc_aoe_damage_trigger', 'Consumption aura zone'),
  ],
  cites: [
    'npcs_special.cpp:1020-1027 NPC_VOID_ZONE=16697 SPELL_CONSUMPTION=28874',
    'npcs_special.cpp:1029-1061 npc_aoe_damage_triggerAI',
    'npcs_special.cpp:1039-1041 GetTimer 2500',
    'npcs_special.cpp:1055-1057 CastConsumption',
    'npcs_special.cpp:1156-1159 RegisterSelf',
  ],
};

// ScriptDev IR — npc_advanced_target_dummy

// Cite: npcs_special.cpp:1083–1107 15s → Suicide 7. Binding 2674 PRESENT — createSession END STATE =
// killable / suicide timer. Spawn effect 4507 not in corpus spellIds and missing bake — residual only.
export const NPC_ADVANCED_TARGET_DUMMY_SCRIPT: ScriptDevIR = {
  name: 'npc_advanced_target_dummy',
  boundCreatures: [NPC_ADVANCED_TARGET_DUMMY],
  sourceFile: 'world/npcs_special.cpp',
  spellIds: [SPELL_SUICIDE],
  timers: [
    {
      id: 'suicide',
      spellId: SPELL_SUICIDE,
      initialMinMs: TARGET_DUMMY_DIE_TIMER_MS,
      initialMaxMs: TARGET_DUMMY_DIE_TIMER_MS,
      // One-shot die; re-arm value unused after unit dies
      repeatMinMs: TARGET_DUMMY_DIE_TIMER_MS,
      repeatMaxMs: TARGET_DUMMY_DIE_TIMER_MS,
      target: 'self',
      cite: 'npcs_special.cpp:1085 m_dieTimer(15000); :1100-1102 DoCastSpellIfCan SUICIDE 7',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `REACT_PASSIVE; ctor DoCast TARGET_DUMMY_SPAWN_EFFECT ${TARGET_DUMMY_SPAWN_EFFECT} (not corpus spellIds / missing bake - residual); m_dieTimer=${TARGET_DUMMY_DIE_TIMER_MS}`,
        cite: 'npcs_special.cpp:1085-1089',
      },
    ],
  },
  cites: [
    'npcs_special.cpp:1077-1081 SUICIDE=7 TARGET_DUMMY_SPAWN_EFFECT=4507',
    'npcs_special.cpp:1083-1107 npc_advanced_target_dummyAI',
    'npcs_special.cpp:1085 m_dieTimer 15000',
    'npcs_special.cpp:1100-1102 cast Suicide',
    'npcs_special.cpp:1161-1164 RegisterSelf',
  ],
};
