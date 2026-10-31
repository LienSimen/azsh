// QI4 — eastern_kingdoms/silverpine_forest residual, extracted for the 1500-line ratchet. Accept
// hooks for quests 435 and 452. Cite: eastern_kingdoms/silverpine_forest.cpp.

import type { DbScriptIntent } from './types.ts';
import { NPC_FLAG_CHANGE_REMOVE } from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: silverpine_forest.cpp:54 QUEST_ERLAND = 435 Escort Deathstalker Erland through Malden's Orchard
// ("Escorting Erland").
export const QUEST_ERLAND = 435;
// Cite: silverpine_forest.cpp:138 QUEST_PYREWOOD_AMBUSH = 452 Defend Deathstalker Faerleia through Pyrewood
// council waves.
export const QUEST_PYREWOOD_AMBUSH = 452;
// Cite: bake starterCreatureEntries / classic-db creature_questrelation Deathstalker Erland
// (npc_deathstalker_erland script name).
const NPC_DEATHSTALKER_ERLAND = 1978;
/** Cite: silverpine_forest.cpp:55 NPC_RANE = 1950 Rane Yorick — WP15 dialogue + bake ender for 435. */
const NPC_RANE = 1950;
/** Cite: silverpine_forest.cpp:56 NPC_QUINN = 1951 Quinn Yorick — WP26 dialogue after escort credit. */
const NPC_QUINN = 1951;
// Cite: bake starterCreatureEntries — Deathstalker Faerleia (npc_deathstalker_faerleia script name); also
// ender for 452.
const NPC_DEATHSTALKER_FAERLEIA = 2058;
/** Cite: silverpine_forest.cpp:40 SAY_START_1 = -1000306 DoScriptText on Erland accept. */
const SAY_START_1 = -1000306;
// Cite: silverpine_forest.cpp:41 SAY_START_2 = -1000307 DoScriptText at escort WP1 (not accept-hook — FO6
// WP).
const SAY_START_2 = -1000307;
/** Cite: silverpine_forest.cpp:46 SAY_END = -1000312 DoScriptText at WP14 with explore credit. */
const SAY_END = -1000312;
/** Cite: silverpine_forest.cpp:143 SAY_START = -1000553 DoScriptText on Faerleia accept. */
const SAY_START_FAERLEIA = -1000553;
/** Cite: silverpine_forest.cpp:144 SAY_COMPLETED = -1000554 DoScriptText when final wave is cleared. */
const SAY_COMPLETED = -1000554;
// Cite: silverpine_forest.cpp:141 SPELL_DRINK_POTION = 3359 Cast after each cleared wave (not accept-hook —
// FO6 event).
const SPELL_DRINK_POTION = 3359;
/** Cite: silverpine_forest.cpp:147 NPC_COUNCILMAN_SMITHERS = 2060 Wave 0 summon entry (FO6). */
const NPC_COUNCILMAN_SMITHERS = 2060;
// Cite: silverpine_forest.cpp:157–158 final wave lords NPC_COUNCILMAN_COOPER=2065,
// NPC_COUNCILMAN_BRUNSWICK=2067, NPC_LORD_MAYOR_MORRISON=2068
const NPC_LORD_MAYOR_MORRISON = 2068;
/** Cite: silverpine_forest.cpp:196 m_uiWaveTimer = 10000 Initial wave timer after StartEvent. */
const FAERLEIA_WAVE_TIMER_MS = 10000;
// Cite: Unit.h:511 UNIT_NPC_FLAG_QUESTGIVER = 0x00000002 StartEvent removes this so Faerleia is not
// re-accepted mid-event.
const UNIT_NPC_FLAG_QUESTGIVER = 0x00000002;

// QuestAccept_npc_deathstalker_erland — quest 435 Escorting Erland: say the start line and escort;
// WP14 gives the explore credit, and the Rane dialogue follows. Cite: silverpine_forest.cpp:115.
function runDeathstalkerErlandAccept(): DbScriptIntent[] {
  const citeTalk =
    `silverpine_forest.cpp:119 npc_deathstalker_erland (${NPC_DEATHSTALKER_ERLAND}) ` +
    `DoScriptText(SAY_START_1=${SAY_START_1})`;
  const citeEscort =
    'silverpine_forest.cpp:121–122 npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeWp1 =
    `silverpine_forest.cpp:72–74 WP1 DoScriptText(SAY_START_2=${SAY_START_2}) - FO6 WP`;
  const citeCredit =
    `silverpine_forest.cpp:76–78 WP14 DoScriptText(SAY_END=${SAY_END}) + ` +
    'RewardPlayerAndGroupAtEventExplored(435) - FO6 finishEscort';
  const citePost =
    `silverpine_forest.cpp:79–98 WP15–27 Rane (${NPC_RANE}) / Quinn (${NPC_QUINN}) dialogue - FO6 post-credit`;
  return [
    {
      kind: 'talk',
      textId: SAY_START_1,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason:
        'escort Start(false, player, quest) - FO6 degraded finishEscort (Malden orchard path)',
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason: `WP1 SAY_START_2 (${SAY_START_2}) - FO6 waypoint`,
      cite: citeWp1,
    },
    {
      kind: 'skip',
      reason:
        `WP14 RewardPlayerAndGroupAtEventExplored(435) + SAY_END (${SAY_END}) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `WP15–27 Rane (${NPC_RANE}) / Quinn (${NPC_QUINN}) post-credit dialogue - FO6`,
      cite: citePost,
    },
  ];
}

// QuestAccept_npc_deathstalker_faerleia — quest 452 Pyrewood Ambush: strip QUESTGIVER and run the
// council waves; the fourth wave's death credits it. Cite: silverpine_forest.cpp:290–300, :226–281.
function runDeathstalkerFaerleiaAccept(): DbScriptIntent[] {
  const citeTalk =
    `silverpine_forest.cpp:294 npc_deathstalker_faerleia (${NPC_DEATHSTALKER_FAERLEIA}) ` +
    `DoScriptText(SAY_START=${SAY_START_FAERLEIA})`;
  const citeQg =
    'silverpine_forest.cpp:192 StartEvent RemoveFlag(UNIT_NPC_FLAG_QUESTGIVER)';
  const citeStart =
    `silverpine_forest.cpp:194–198 m_uiWaveTimer=${FAERLEIA_WAVE_TIMER_MS} + waveCount=0; ` +
    `UpdateAI council waves (Smithers ${NPC_COUNCILMAN_SMITHERS} → Mayor ${NPC_LORD_MAYOR_MORRISON}) FO6`;
  const citePotion =
    `silverpine_forest.cpp:232 DoCastSpellIfCan(SPELL_DRINK_POTION=${SPELL_DRINK_POTION}) after each wave clear - FO6`;
  const citeWin =
    `silverpine_forest.cpp:235–242 waveCount==4 DoScriptText(SAY_COMPLETED=${SAY_COMPLETED}) + ` +
    'RewardPlayerAndGroupAtEventExplored(452) + FinishEvent - FO6 finishEscort';
  const citeFail =
    'silverpine_forest.cpp:208–214 JustDied SendQuestFailed(452) - host fail FO6';
  // StartEvent removes QUESTGIVER; prior 2 → result 0 when only that flag set.
  const prior = UNIT_NPC_FLAG_QUESTGIVER;
  const resultFlags = prior & ~UNIT_NPC_FLAG_QUESTGIVER;
  return [
    {
      kind: 'talk',
      textId: SAY_START_FAERLEIA,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'modify_npc_flags',
      flag: UNIT_NPC_FLAG_QUESTGIVER,
      changeFlag: NPC_FLAG_CHANGE_REMOVE,
      mode: 'remove',
      resultFlags,
      cite: citeQg,
    },
    {
      kind: 'skip',
      reason:
        `StartEvent wave timer ${FAERLEIA_WAVE_TIMER_MS}ms + council wave AI (Smithers→Morrison) - FO6 zone event`,
      cite: citeStart,
    },
    {
      kind: 'skip',
      reason:
        `SPELL_DRINK_POTION (${SPELL_DRINK_POTION}) after each wave clear - FO6 event`,
      cite: citePotion,
    },
    {
      kind: 'skip',
      reason:
        `final wave RewardPlayerAndGroupAtEventExplored(452) + SAY_COMPLETED (${SAY_COMPLETED}) - FO6 finishEscort`,
      cite: citeWin,
    },
    {
      kind: 'skip',
      reason: 'JustDied SendQuestFailed(452) - host fail FO6',
      cite: citeFail,
    },
  ];
}

// Family pack: eastern_kingdoms/silverpine_forest.cpp Hooks: pQuestAcceptNPC erland (435), faerleia (452).
export function runSilverpineForest(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_ERLAND) return runDeathstalkerErlandAccept();
  if (questId === QUEST_PYREWOOD_AMBUSH) return runDeathstalkerFaerleiaAccept();
  return [];
}
