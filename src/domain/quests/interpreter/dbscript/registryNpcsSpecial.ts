// QI4 — world/npcs_special residuals: the chicken /cluck emote (3861), the garments SpellHit heals
// (5621–5650) and the Triage doctor accept (6622/6624). Cite: world/npcs_special.cpp.

import type { DbScriptIntent } from './types.ts';
import { UNIT_STAND_STATE_STAND } from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface NpcsSpecialQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── chicken_cluck sourced constants ──────────────────────────────────────────

/** Cite: npcs_special.cpp:55 QUEST_CLUCK = 3861 classic-db creature_questrelation (620,3861). */
export const QUEST_CLUCK = 3861;
/** Cite: npcs_special.cpp:56–57 FACTION_FRIENDLY=35, FACTION_CHICKEN=31 */
export const FACTION_FRIENDLY_CLUCK = 35;
export const FACTION_CHICKEN = 31;
// Cite: SharedDefines.h:593–594 TEXTEMOTE_CHEER=21, TEXTEMOTE_CHICKEN=22 ReceiveEmote gates at
// npcs_special.cpp:76,82.
export const TEXTEMOTE_CHEER = 21;
export const TEXTEMOTE_CHICKEN = 22;
/** Cite: npcs_special.cpp:68 m_uiResetFlagTimer = 20000 */
export const CHICKEN_RESET_FLAG_TIMER_MS = 20000;
// Cite: npcs_special.cpp:76 urand(0, 49) — 1/50 chance on /chicken Zone model documents the gate; host uses
// deterministic path.
export const CHICKEN_EMOTE_CHANCE_DENOM = 50;
/** Cite: classic-db creature_questrelation/involvedrelation (620,3861); wowhead NPC 620. */
export const NPC_CHICKEN = 620;
/** Cite: bake item-data.json entry 11109 Special Chicken Feed; wowhead quest 3861 objective. */
export const ITEM_SPECIAL_CHICKEN_FEED = 11109;
/** Cite: Unit.h:511 UNIT_NPC_FLAG_QUESTGIVER = 0x00000002 npcs_special.cpp:79 SetFlag / :71 RemoveFlag. */
export const UNIT_NPC_FLAG_QUESTGIVER = 0x00000002;
/** Cite: npcs_special.cpp:52–53 EMOTE_CLUCK_TEXT1/2 */
export const EMOTE_CLUCK_TEXT1 = -1000204;
export const EMOTE_CLUCK_TEXT2 = -1000205;

// ── triage (npc_doctor / npc_injured_patient) ────────────────────────────────

// Cite: npcs_special.cpp:121–122 QUEST_TRIAGE_H=6622, QUEST_TRIAGE_A=6624 classic-db creature_questrelation
// (12920,6622), (12939,6624).
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
/** Cite: npcs_special.cpp:205 m_uiSummonPatientTimer = 10000 */
export const SUMMON_PATIENT_TIMER_MS = 10000;
/** Cite: npcs_special.cpp:442 m_uiSummonPatientCount >= 21 worst case */
export const MAX_PATIENT_SUMMONS = 21;
/** Cite: npcs_special.cpp:414 m_uiPatientSavedCount == 15 success */
export const PATIENTS_SAVED_SUCCESS = 15;
/** Cite: npcs_special.cpp:388 m_uiPatientDiedCount > 5 fail (6 deaths) */
export const PATIENTS_DIED_FAIL = 6;
// Cite: npcs_special.cpp:464 TEMPSPAWN_TIMED_OOC_OR_CORPSE_DESPAWN, 5000 Object.h:51
// TEMPSPAWN_TIMED_OOC_OR_CORPSE_DESPAWN = 9
export const TEMPSPAWN_TIMED_OOC_OR_CORPSE_DESPAWN = 9;
export const PATIENT_DESPAWN_MS = 5000;
// Cite: npcs_special.cpp:273 SpellHit pSpell->Id == 20804 (Triage Bandage) bake item-data.json 16991
// useSpell=20804.
export const SPELL_TRIAGE_BANDAGE = 20804;
/** Cite: bake item-data.json entry 16991 Triage Bandage (srcItem on accept). */
export const ITEM_TRIAGE_BANDAGE = 16991;
/** Cite: Unit.h:478 UNIT_FLAG_PVP = 0x00001000 npcs_special.cpp:467 Patient SetFlag UNIT_FLAG_PVP. */
export const UNIT_FLAG_PVP = 0x00001000;
// Cite: Unit.h:485 UNIT_FLAG_IN_COMBAT = 0x00080000 npcs_special.cpp:249 patient Reset SetFlag IN_COMBAT
// (no regen).
export const UNIT_FLAG_IN_COMBAT = 0x00080000;
// Cite: Unit.h:490 UNIT_FLAG_UNINTERACTIBLE = 0x02000000 BeginEvent SetFlag; PatientSaved SetFlag; Reset
// RemoveFlag.
export const UNIT_FLAG_UNINTERACTIBLE = 0x02000000;
/** Cite: handlersBatch / opcodes UNIT_FLAG_CHANGE_ADD = 1 (ScriptMgr MODIFY_UNIT_FLAGS) */
export const UNIT_FLAG_CHANGE_ADD = 1;
/** Cite: Unit.h:104 UNIT_STAND_STATE_DEAD = 7 patient Reset SetStandState DEAD (face down). */
export const UNIT_STAND_STATE_DEAD = 7;
/** Cite: npcs_special.cpp:117–119 SAY_DOC1/2/3 */
export const SAY_DOC1 = -1000201;
export const SAY_DOC2 = -1000202;
export const SAY_DOC3 = -1000203;
/** Cite: npcs_special.cpp:147–149 A_RUNTO* */
export const A_RUNTOX = -3742.96;
export const A_RUNTOY = -4531.52;
export const A_RUNTOZ = 11.91;
/** Cite: npcs_special.cpp:162–164 H_RUNTO* */
export const H_RUNTOX = -1016.44;
export const H_RUNTOY = -3508.48;
export const H_RUNTOZ = 62.96;
/** Cite: npcs_special.cpp:258 / 262 / 266 health fractions for injured tiers. */
export const PATIENT_HP_INJURED = 0.75;
export const PATIENT_HP_BADLY = 0.5;
export const PATIENT_HP_CRITICAL = 0.25;
// Cite: combatSkillMeta skill 129 = First Aid category; wowhead triage req 225. Host skill gate only — C++
// residual does not re-check skill.
export const SKILL_FIRST_AID = 129;
export const REQUIRED_SKILL_VALUE_TRIAGE = 225;

// ── garments_of_quests ───────────────────────────────────────────────────────

/** Cite: npcs_special.cpp:508–515 spells + quests */
export const SPELL_LESSER_HEAL_R2 = 2052;
export const SPELL_FORTITUDE_R1 = 1243;
export const QUEST_MOON = 5621;
export const QUEST_LIGHT_1 = 5624;
export const QUEST_LIGHT_2 = 5625;
export const QUEST_SPIRIT = 5648;
export const QUEST_DARKNESS = 5650;
/** Cite: npcs_special.cpp:517–521 ENTRY_* bake killTargets creatureEntry for each garments quest. */
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
/** Cite: npcs_special.cpp:554 m_uiRunAwayTimer = 5000 */
export const GARMENTS_RUN_AWAY_TIMER_MS = 5000;
/** Cite: npcs_special.cpp:560 SetHealth(max * 0.7) on Reset */
export const GARMENTS_HP_FRACTION = 0.7;
// Cite: Unit.h:97 / opcodes UNIT_STAND_STATE_STAND=0; Unit.h kneel=8 garments Reset kneels; heal stands.
export const UNIT_STAND_STATE_KNEEL_GARMENTS = 8;

/** All quest ids in this family pack (census claim list). */
export const NPCS_SPECIAL_QUEST_IDS = [
  QUEST_CLUCK,
  QUEST_MOON,
  QUEST_LIGHT_1,
  QUEST_LIGHT_2,
  QUEST_SPIRIT,
  QUEST_DARKNESS,
  QUEST_TRIAGE_H,
  QUEST_TRIAGE_A,
] as const;

const GARMENTS_QUEST_TO_ENTRY: Readonly<Record<number, number>> = {
  [QUEST_MOON]: ENTRY_SHAYA,
  [QUEST_LIGHT_1]: ENTRY_ROBERTS,
  [QUEST_LIGHT_2]: ENTRY_DOLF,
  [QUEST_SPIRIT]: ENTRY_KORJA,
  [QUEST_DARKNESS]: ENTRY_DG_KEL,
};

const GARMENTS_QUEST_TO_THANKS: Readonly<Record<number, number>> = {
  [QUEST_MOON]: SAY_SHAYA_THANKS,
  [QUEST_LIGHT_1]: SAY_ROBERTS_THANKS,
  [QUEST_LIGHT_2]: SAY_DOLF_THANKS,
  [QUEST_SPIRIT]: SAY_KORJA_THANKS,
  [QUEST_DARKNESS]: SAY_DG_KEL_THANKS,
};

const GARMENTS_QUEST_TO_GOODBYE: Readonly<Record<number, number>> = {
  [QUEST_MOON]: SAY_SHAYA_GOODBYE,
  [QUEST_LIGHT_1]: SAY_ROBERTS_GOODBYE,
  [QUEST_LIGHT_2]: SAY_DOLF_GOODBYE,
  [QUEST_SPIRIT]: SAY_KORJA_GOODBYE,
  [QUEST_DARKNESS]: SAY_DG_KEL_GOODBYE,
};

function isTriageQuest(questId: number): boolean {
  return questId === QUEST_TRIAGE_A || questId === QUEST_TRIAGE_H;
}

function isGarmentsQuest(questId: number): boolean {
  return GARMENTS_QUEST_TO_ENTRY[questId] !== undefined;
}

function doctorFor(questId: number): number {
  return questId === QUEST_TRIAGE_H ? DOCTOR_HORDE : DOCTOR_ALLIANCE;
}

// ── residual handlers ────────────────────────────────────────────────────────

// QuestAccept_npc_doctor — BeginEvent for 6622/6624: reset counters, load the coord list and go
// uninteractible; 15 saves credit and 6 deaths fail. Cite: npcs_special.cpp:486–494, :355–378.
function runDoctorAccept(questId: number): DbScriptIntent[] {
  const doctor = doctorFor(questId);
  const coordCount =
    questId === QUEST_TRIAGE_H ? HORDE_COORDS_COUNT : ALLIANCE_COORDS_COUNT;
  const soldiers =
    questId === QUEST_TRIAGE_H ? HORDE_SOLDIER_IDS : ALLIANCE_SOLDIER_IDS;
  const runTo =
    questId === QUEST_TRIAGE_H
      ? { x: H_RUNTOX, y: H_RUNTOY, z: H_RUNTOZ }
      : { x: A_RUNTOX, y: A_RUNTOY, z: A_RUNTOZ };
  const priorFlags = 0;
  const resultFlags = priorFlags | UNIT_FLAG_UNINTERACTIBLE;

  const citeAccept =
    `npcs_special.cpp:486–494 QuestAccept_npc_doctor quest ${questId} → ` +
    `BeginEvent on doctor ${doctor}`;
  const citeBegin =
    `npcs_special.cpp:355–378 BeginEvent: coords×${coordCount}; ` +
    `SetFlag(UNIT_FLAG_UNINTERACTIBLE=${UNIT_FLAG_UNINTERACTIBLE})`;
  const citeSummon =
    `npcs_special.cpp:450–479 UpdateAI summon timer ${SUMMON_PATIENT_TIMER_MS}ms ` +
    `TEMPSPAWN_TIMED_OOC_OR_CORPSE_DESPAWN=${TEMPSPAWN_TIMED_OOC_OR_CORPSE_DESPAWN} ` +
    `despawn ${PATIENT_DESPAWN_MS}ms patients ` +
    `${soldiers[0]}/${soldiers[1]}/${soldiers[2]} + UNIT_FLAG_PVP=${UNIT_FLAG_PVP} - FO6 event`;
  const citePatient =
    `npcs_special.cpp:241–268 patient Reset UNIT_STAND_STATE_DEAD=${UNIT_STAND_STATE_DEAD} ` +
    `UNIT_FLAG_IN_COMBAT=${UNIT_FLAG_IN_COMBAT} HP×` +
    `${PATIENT_HP_INJURED}/${PATIENT_HP_BADLY}/${PATIENT_HP_CRITICAL} - FO6`;
  const citeBandage =
    `npcs_special.cpp:271–314 SpellHit SPELL_TRIAGE_BANDAGE=${SPELL_TRIAGE_BANDAGE} ` +
    `(item ${ITEM_TRIAGE_BANDAGE}) → PatientSaved; stand; SAY_DOC1/2/3=` +
    `${SAY_DOC1}/${SAY_DOC2}/${SAY_DOC3}; MovePoint runto ` +
    `${runTo.x},${runTo.y},${runTo.z} - FO6 bandage`;
  const citeSuccess =
    `npcs_special.cpp:406–432 PatientSaved count==${PATIENTS_SAVED_SUCCESS} → ` +
    `RewardPlayerAndGroupAtEventExplored(${questId}) - FO6 finishEscort/event`;
  const citeFail =
    `npcs_special.cpp:380–397 PatientDied count>${PATIENTS_DIED_FAIL - 1} ` +
    `(${PATIENTS_DIED_FAIL} deaths) FailQuest(${questId}) - FO6 fail`;
  const citeCap =
    `npcs_special.cpp:442 m_uiSummonPatientCount>=${MAX_PATIENT_SUMMONS} Reset - FO6`;

  return [
    {
      kind: 'modify_unit_flags',
      flag: UNIT_FLAG_UNINTERACTIBLE,
      changeFlag: UNIT_FLAG_CHANGE_ADD,
      mode: 'add',
      resultFlags,
      cite: citeBegin,
    },
    {
      kind: 'skip',
      reason:
        `QuestAccept_npc_doctor BeginEvent doctor ${doctor} quest ${questId} ` +
        `coords×${coordCount} - event in progress`,
      cite: citeAccept,
    },
    {
      kind: 'skip',
      reason:
        `patient summons ${soldiers.join('/')} every ${SUMMON_PATIENT_TIMER_MS}ms ` +
        `TEMPSPAWN=${TEMPSPAWN_TIMED_OOC_OR_CORPSE_DESPAWN} despawn ${PATIENT_DESPAWN_MS}ms ` +
        `UNIT_FLAG_PVP=${UNIT_FLAG_PVP} - FO6 event`,
      cite: citeSummon,
    },
    {
      kind: 'skip',
      reason:
        `patient Reset DEAD stand + IN_COMBAT + HP tiers ` +
        `${PATIENT_HP_INJURED}/${PATIENT_HP_BADLY}/${PATIENT_HP_CRITICAL} - FO6`,
      cite: citePatient,
    },
    {
      kind: 'skip',
      reason:
        `SpellHit bandage ${SPELL_TRIAGE_BANDAGE} → save; SAY_DOC ${SAY_DOC1}..; ` +
        `runto ${runTo.x},${runTo.y},${runTo.z} - FO6`,
      cite: citeBandage,
    },
    {
      kind: 'skip',
      reason:
        `${PATIENTS_SAVED_SUCCESS} saves → RewardPlayerAndGroupAtEventExplored(${questId}) ` +
        '- FO6 finishEscort/event',
      cite: citeSuccess,
    },
    {
      kind: 'skip',
      reason:
        `${PATIENTS_DIED_FAIL} deaths → FailQuest(${questId}) - FO6 fail`,
      cite: citeFail,
    },
    {
      kind: 'skip',
      reason: `max summons ${MAX_PATIENT_SUMMONS} → Reset - FO6`,
      cite: citeCap,
    },
  ];
}

// Zone-granular frame after triage event success (15 PatientSaved). Cite: npcs_special.cpp:414–429
// RewardPlayerAndGroupAtEventExplored. Host maps this to specialFlags:2 explore / finishEscort.
function runDoctorFrame(questId: number): DbScriptIntent[] {
  const doctor = doctorFor(questId);
  return [
    {
      kind: 'quest_explored',
      questId,
      distance: 0,
      failed: false,
      cite:
        `npcs_special.cpp:414–429 PatientSaved==${PATIENTS_SAVED_SUCCESS} ` +
        `RewardPlayerAndGroupAtEventExplored(${questId}) doctor ${doctor}`,
    },
    {
      kind: 'skip',
      reason:
        `turn-in doctor ${doctor} after event explore credit ` +
        `(srcItem Triage Bandage ${ITEM_TRIAGE_BANDAGE})`,
      cite: `classic-db creature_involvedrelation (${doctor},${questId})`,
    },
  ];
}

// The garments SpellHit residual as one zone-granular path: Lesser Heal R2 stands the patient,
// Fortitude R1 gives the TalkedToCreature credit, then it runs off. Cite: npcs_special.cpp:563–670.
function runGarmentsFrame(questId: number): DbScriptIntent[] {
  const entry = GARMENTS_QUEST_TO_ENTRY[questId];
  const thanks = GARMENTS_QUEST_TO_THANKS[questId];
  const goodbye = GARMENTS_QUEST_TO_GOODBYE[questId];
  if (!entry || thanks === undefined || goodbye === undefined) return [];

  const citeHeal =
    `npcs_special.cpp:563–663 SpellHit SPELL_LESSER_HEAL_R2=${SPELL_LESSER_HEAL_R2} ` +
    `quest ${questId} entry ${entry}: SetStandState(STAND) + ` +
    `DoScriptText(SAY_COMMON_HEALED=${SAY_COMMON_HEALED}) + m_bIsHealed`;
  const citeFort =
    `npcs_special.cpp:563–668 SpellHit SPELL_FORTITUDE_R1=${SPELL_FORTITUDE_R1} ` +
    `after heal: DoScriptText(thanks=${thanks}) + m_bCanRun + ` +
    `TalkedToCreature(${entry})`;
  const citeRun =
    `npcs_special.cpp:675–701 UpdateEscortAI m_uiRunAwayTimer=${GARMENTS_RUN_AWAY_TIMER_MS}ms ` +
    `DoScriptText(goodbye=${goodbye}) + Start(true) - FO6 run-away escort`;
  const citeReset =
    `npcs_special.cpp:547–560 Reset kneel UNIT_STAND_STATE_KNEEL=` +
    `${UNIT_STAND_STATE_KNEEL_GARMENTS} UNIT_FLAG_PVP=${UNIT_FLAG_PVP} ` +
    `HP×${GARMENTS_HP_FRACTION}`;

  return [
    {
      kind: 'skip',
      reason:
        `garments Reset kneel + UNIT_FLAG_PVP + HP×${GARMENTS_HP_FRACTION} ` +
        `entry ${entry} - FO6 spawn state`,
      cite: citeReset,
    },
    {
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_STAND,
      cite: citeHeal,
    },
    {
      kind: 'talk',
      textId: SAY_COMMON_HEALED,
      stringTemplateId: 0,
      cite: citeHeal,
    },
    {
      kind: 'talk',
      textId: thanks,
      stringTemplateId: 0,
      cite: citeFort,
    },
    {
      kind: 'kill_credit',
      creatureEntry: entry,
      cite:
        `npcs_special.cpp:667–668 TalkedToCreature(${entry}) after Fortitude ` +
        `(quest ${questId})`,
    },
    {
      kind: 'skip',
      reason:
        `run-away timer ${GARMENTS_RUN_AWAY_TIMER_MS}ms goodbye ${goodbye} ` +
        `Start(true) - FO6 escort`,
      cite: citeRun,
    },
  ];
}

// chicken_cluck ReceiveEmote residual: /chicken has a 1-in-50 chance to turn it friendly and a
// questgiver, and /cheer answers once complete. Cite: npcs_special.cpp:74–88.
function runChickenFrame(): DbScriptIntent[] {
  const priorNpc = 0;
  const resultNpc = priorNpc | UNIT_NPC_FLAG_QUESTGIVER;
  return [
    {
      kind: 'skip',
      reason:
        `ReceiveEmote TEXTEMOTE_CHICKEN=${TEXTEMOTE_CHICKEN} ` +
        `1/${CHICKEN_EMOTE_CHANCE_DENOM} (urand 0..${CHICKEN_EMOTE_CHANCE_DENOM - 1}) ` +
        `or TEXTEMOTE_CHEER=${TEXTEMOTE_CHEER} when COMPLETE - FO6 emote gate`,
      cite: 'npcs_special.cpp:74–88 npc_chicken_cluckAI::ReceiveEmote',
    },
    {
      kind: 'modify_npc_flags',
      flag: UNIT_NPC_FLAG_QUESTGIVER,
      changeFlag: 1, // NPC_FLAG_CHANGE_ADD — opcodes NPC_FLAG_CHANGE_ADD=1
      mode: 'add',
      resultFlags: resultNpc,
      cite:
        `npcs_special.cpp:79 SetFlag(UNIT_NPC_FLAGS, UNIT_NPC_FLAG_QUESTGIVER=` +
        `${UNIT_NPC_FLAG_QUESTGIVER})`,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_FRIENDLY_CLUCK,
      flags: 0,
      cleared: false,
      cite:
        `npcs_special.cpp:80 setFaction(FACTION_FRIENDLY=${FACTION_FRIENDLY_CLUCK}) ` +
        `(was FACTION_CHICKEN=${FACTION_CHICKEN})`,
    },
    {
      kind: 'talk',
      textId: EMOTE_CLUCK_TEXT1,
      stringTemplateId: 0,
      cite: `npcs_special.cpp:81 DoScriptText(EMOTE_CLUCK_TEXT1=${EMOTE_CLUCK_TEXT1})`,
    },
    {
      kind: 'skip',
      reason:
        `reset flag timer ${CHICKEN_RESET_FLAG_TIMER_MS}ms → EnterEvadeMode ` +
        `RemoveFlag QUESTGIVER + setFaction FACTION_CHICKEN=${FACTION_CHICKEN} - FO6`,
      cite: 'npcs_special.cpp:90–99,66–72 UpdateAI/Reset',
    },
    {
      kind: 'skip',
      reason:
        `deliver ITEM_SPECIAL_CHICKEN_FEED=${ITEM_SPECIAL_CHICKEN_FEED} to ` +
        `NPC_CHICKEN=${NPC_CHICKEN} then /cheer when COMPLETE`,
      cite: 'npcs_special.cpp:82–87 QUEST_STATUS_COMPLETE cheer path; quest 3861 item',
    },
  ];
}

// Family runner — routes by quest id and phase. Only npc_doctor has an accept hook; the chicken
// and the garments are AI residuals. Cite: npcs_special.cpp:1110–1133.
export function runNpcsSpecial(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (questId === QUEST_CLUCK) {
    if (phase === 'frame' || phase === 'complete') return runChickenFrame();
    return [];
  }
  if (isTriageQuest(questId)) {
    if (phase === 'accept') return runDoctorAccept(questId);
    if (phase === 'frame' || phase === 'complete') return runDoctorFrame(questId);
    return [];
  }
  if (isGarmentsQuest(questId)) {
    if (phase === 'frame' || phase === 'complete') return runGarmentsFrame(questId);
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'world/npcs_special'` in registry.ts.
export const NPCS_SPECIAL_REGISTRY: Record<
  string | number,
  NpcsSpecialQuestScriptEntry
> = {
  'world/npcs_special': {
    family: 'world/npcs_special',
    questIds: [...NPCS_SPECIAL_QUEST_IDS],
    hooks: ['accept', 'frame', 'complete'],
    cite:
      'world/npcs_special.cpp QuestAccept_npc_doctor + chicken_cluck + garments_of_quests',
    run: runNpcsSpecial,
  },
  [QUEST_CLUCK]: {
    family: 'world/npcs_special',
    questId: QUEST_CLUCK,
    questIds: [QUEST_CLUCK],
    hooks: ['frame', 'complete'],
    cite: 'npcs_special.cpp:74–88 npc_chicken_cluck ReceiveEmote (3861)',
    run: runNpcsSpecial,
  },
  [QUEST_MOON]: {
    family: 'world/npcs_special',
    questId: QUEST_MOON,
    questIds: [QUEST_MOON],
    hooks: ['frame', 'complete'],
    cite: 'npcs_special.cpp:563–670 garments SpellHit ENTRY_SHAYA (5621)',
    run: runNpcsSpecial,
  },
  [QUEST_LIGHT_1]: {
    family: 'world/npcs_special',
    questId: QUEST_LIGHT_1,
    questIds: [QUEST_LIGHT_1],
    hooks: ['frame', 'complete'],
    cite: 'npcs_special.cpp:563–670 garments SpellHit ENTRY_ROBERTS (5624)',
    run: runNpcsSpecial,
  },
  [QUEST_LIGHT_2]: {
    family: 'world/npcs_special',
    questId: QUEST_LIGHT_2,
    questIds: [QUEST_LIGHT_2],
    hooks: ['frame', 'complete'],
    cite: 'npcs_special.cpp:563–670 garments SpellHit ENTRY_DOLF (5625)',
    run: runNpcsSpecial,
  },
  [QUEST_SPIRIT]: {
    family: 'world/npcs_special',
    questId: QUEST_SPIRIT,
    questIds: [QUEST_SPIRIT],
    hooks: ['frame', 'complete'],
    cite: 'npcs_special.cpp:563–670 garments SpellHit ENTRY_KORJA (5648)',
    run: runNpcsSpecial,
  },
  [QUEST_DARKNESS]: {
    family: 'world/npcs_special',
    questId: QUEST_DARKNESS,
    questIds: [QUEST_DARKNESS],
    hooks: ['frame', 'complete'],
    cite: 'npcs_special.cpp:563–670 garments SpellHit ENTRY_DG_KEL (5650)',
    run: runNpcsSpecial,
  },
  [QUEST_TRIAGE_H]: {
    family: 'world/npcs_special',
    questId: QUEST_TRIAGE_H,
    questIds: [QUEST_TRIAGE_H],
    hooks: ['accept', 'frame', 'complete'],
    cite: 'npcs_special.cpp:486–494 QuestAccept_npc_doctor Horde 6622',
    run: runNpcsSpecial,
  },
  [QUEST_TRIAGE_A]: {
    family: 'world/npcs_special',
    questId: QUEST_TRIAGE_A,
    questIds: [QUEST_TRIAGE_A],
    hooks: ['accept', 'frame', 'complete'],
    cite: 'npcs_special.cpp:486–494 QuestAccept_npc_doctor Alliance 6624',
    run: runNpcsSpecial,
  },
};
