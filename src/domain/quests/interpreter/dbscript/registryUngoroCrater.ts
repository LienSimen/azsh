// QI4 — kalimdor/ungoro_crater residuals, extracted for the 1500-line ratchet: accept hooks for
// quests 4245 and 4491. Cite: kalimdor/ungoro_crater.cpp.

import type { DbScriptIntent } from './types.ts';
import { UNIT_STAND_STATE_STAND } from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface UngoroCraterQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

/** Cite: ungoro_crater.cpp:48 QUEST_CHASING_AME = 4245 Escort A-Me 01; WP38 explore credit. */
export const QUEST_CHASING_AME = 4245;
// Cite: ungoro_crater.cpp:152 QUEST_A_LITTLE_HELP = 4491 FollowerAI Ringo → Spraggle LOS explore credit.
export const QUEST_A_LITTLE_HELP = 4491;

/** Cite: bake starterCreatureEntries quest 4245; scriptdev2 npc_ame01 A-Me 01. */
const NPC_AME01 = 9623;
/** Cite: bake enderCreatureEntries quest 4245 — Karna Remtravel (9618). */
const NPC_KARNA_REMTRAVEL = 9618;
/** Cite: bake starterCreatureEntries quest 4491; scriptdev2 npc_ringo Ringo. */
const NPC_RINGO = 9999;
/** Cite: ungoro_crater.cpp:153 NPC_SPRAGGLE = 9997 Bake enderCreatureEntries quest 4491. */
const NPC_SPRAGGLE = 9997;

/** Cite: ungoro_crater.cpp:41–46 A-Me script texts. */
const SAY_AME_START = -1000446;
const SAY_AME_PROGRESS = -1000447;
const SAY_AME_END = -1000448;
const SAY_AME_AGGRO1 = -1000449;
const SAY_AME_AGGRO2 = -1000450;
const SAY_AME_AGGRO3 = -1000451;

// Cite: ungoro_crater.cpp:129–149 Ringo / Spraggle script texts. SAY_RIN_START_1/2 declared but unused in
// Classic accept body.
const SAY_FAINT_1 = -1000418;
const SAY_FAINT_2 = -1000419;
const SAY_FAINT_3 = -1000420;
const SAY_FAINT_4 = -1000421;
const SAY_WAKE_1 = -1000422;
const SAY_WAKE_2 = -1000423;
const SAY_WAKE_3 = -1000424;
const SAY_WAKE_4 = -1000425;
const SAY_RIN_END_1 = -1000426;
const SAY_SPR_END_2 = -1000427;
const SAY_RIN_END_3 = -1000428;
const EMOTE_RIN_END_4 = -1000429;
const EMOTE_RIN_END_5 = -1000430;
const SAY_RIN_END_6 = -1000431;
const SAY_SPR_END_7 = -1000432;
const EMOTE_RIN_END_8 = -1000433;

// Cite: ungoro_crater.cpp:151 SPELL_REVIVE_RINGO = 15591 SpellHit clears faint while follow in
// progress/paused. Bake quest 4491 srcItem 11804 (Spraggle's Canteen) casts this.
const SPELL_REVIVE_RINGO = 15591;

// Cite: ScriptDevAIMgr.h:55 FACTION_ESCORT_A_PASSIVE = 774 A-Me SetFactionTemporary when player team
// ALLIANCE.
const FACTION_ESCORT_A_PASSIVE = 774;
// Cite: ScriptDevAIMgr.h:56 FACTION_ESCORT_H_PASSIVE = 775 A-Me SetFactionTemporary when player team HORDE.
const FACTION_ESCORT_H_PASSIVE = 775;
/** Cite: ScriptDevAIMgr.h:52 FACTION_ESCORT_N_FRIEND_PASSIVE = 290 Ringo StartFollow faction. */
const FACTION_ESCORT_N_FRIEND_PASSIVE = 290;

/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:582 TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20 */
const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;
// Cite: ungoro_crater.cpp:108–110 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x01 |
// 0x20 = 0x21
const AME_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;

/** Cite: Unit.h:97 UNIT_STAND_STATE_STAND = 0 (opcodes.ts re-export) */
const UNIT_STAND_STATE_STAND_UNGORO = UNIT_STAND_STATE_STAND;
/** Cite: Unit.h:100 UNIT_STAND_STATE_SLEEP = 3 Ringo SetFaint while following. */
const UNIT_STAND_STATE_SLEEP = 3;
// Cite: Unit.h:104 UNIT_STAND_STATE_DEAD = 7 A-Me / Ringo ctor stand state while not escorting/following.
const UNIT_STAND_STATE_DEAD = 7;

/** Cite: ObjectDefines.h:25 INTERACTION_DISTANCE = 5.0f Ringo MoveInLineOfSight Spraggle credit range. */
const INTERACTION_DISTANCE = 5;

// Cite: ungoro_crater.cpp:172 m_uiFaintTimer = urand(30000, 60000) initial :308 = urand(60000, 120000)
// after faint
const RINGO_FAINT_TIMER_MIN_MS = 30000;
const RINGO_FAINT_TIMER_MAX_MS = 60000;
const RINGO_FAINT_REARM_MIN_MS = 60000;
const RINGO_FAINT_REARM_MAX_MS = 120000;
/** Cite: ungoro_crater.cpp:174 m_uiEndEventTimer = 1000 initial */
const RINGO_END_EVENT_START_MS = 1000;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_ame01 — quest 4245 Chasing A-Me 01: stand, take the team's escort faction and
// walk the path; WP38 carries the explore credit. Cite: ungoro_crater.cpp:99–116, :61–77.
function runAme01Accept(): DbScriptIntent[] {
  const citeStand =
    `ungoro_crater.cpp:105 SetStandState(UNIT_STAND_STATE_STAND) ` +
    `from ctor DEAD=${UNIT_STAND_STATE_DEAD}`;
  const citeFactionA =
    'ungoro_crater.cpp:107–108 ALLIANCE SetFactionTemporary(' +
    `FACTION_ESCORT_A_PASSIVE=${FACTION_ESCORT_A_PASSIVE}, ` +
    `TEMPFACTION_RESTORE_RESPAWN|TOGGLE_IMMUNE_TO_NPC=${AME_TEMP_FACTION_FLAGS})`;
  const citeFactionH =
    'ungoro_crater.cpp:109–110 HORDE SetFactionTemporary(' +
    `FACTION_ESCORT_H_PASSIVE=${FACTION_ESCORT_H_PASSIVE}, ` +
    `flags=${AME_TEMP_FACTION_FLAGS})`;
  const citeEscort =
    `ungoro_crater.cpp:112 npc_ame01 (${NPC_AME01}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeWp =
    `ungoro_crater.cpp:65–75 WP1 SAY_AME_START=${SAY_AME_START}; ` +
    `WP20 SAY_AME_PROGRESS=${SAY_AME_PROGRESS}; ` +
    `WP38 SAY_AME_END=${SAY_AME_END} + RewardPlayerAndGroupAtEventExplored(4245) - FO6`;
  const citeAggro =
    `ungoro_crater.cpp:79–96 Aggro urand SAY_AME_AGGRO1/2/3=` +
    `${SAY_AME_AGGRO1}/${SAY_AME_AGGRO2}/${SAY_AME_AGGRO3} - FO6 combat`;
  const citeEnder =
    `bake enderCreatureEntries NPC_KARNA_REMTRAVEL=${NPC_KARNA_REMTRAVEL} after WP38 explore credit`;
  return [
    {
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_STAND_UNGORO,
      cite: citeStand,
    },
    // Zone model: emit Alliance branch as applied faction; Horde is the sibling
    // special-case branch (same flags, different template id).
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_A_PASSIVE,
      flags: AME_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFactionA,
    },
    {
      kind: 'skip',
      reason:
        `HORDE SetFactionTemporary(FACTION_ESCORT_H_PASSIVE=${FACTION_ESCORT_H_PASSIVE}, ` +
        `flags=${AME_TEMP_FACTION_FLAGS}) - team branch`,
      cite: citeFactionH,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_ame01 (${NPC_AME01}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP1 SAY_AME_START (${SAY_AME_START}) + WP20 SAY_AME_PROGRESS (${SAY_AME_PROGRESS}) + ` +
        `WP38 SAY_AME_END (${SAY_AME_END}) + RewardPlayerAndGroupAtEventExplored(4245) - FO6 finishEscort`,
      cite: citeWp,
    },
    {
      kind: 'skip',
      reason:
        `Aggro SAY_AME_AGGRO1/2/3 (${SAY_AME_AGGRO1}/${SAY_AME_AGGRO2}/${SAY_AME_AGGRO3}) - FO6 combat`,
      cite: citeAggro,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_KARNA_REMTRAVEL (${NPC_KARNA_REMTRAVEL}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_ringo — quest 4491 A Little Help From My Friends: stand and follow, fainting on
// a timer until revived; sighting Spraggle credits it. Cite: ungoro_crater.cpp:327–339, :178–239.
function runRingoAccept(): DbScriptIntent[] {
  const citeStand =
    `ungoro_crater.cpp:333 SetStandState(UNIT_STAND_STATE_STAND) ` +
    `from ctor DEAD=${UNIT_STAND_STATE_DEAD}`;
  const citeFollow =
    `ungoro_crater.cpp:334 npc_ringo (${NPC_RINGO}) ` +
    `StartFollow(player, FACTION_ESCORT_N_FRIEND_PASSIVE=${FACTION_ESCORT_N_FRIEND_PASSIVE}, quest) ` +
    '- FO6 degraded FollowerAI finishEscort';
  const citeFaint =
    `ungoro_crater.cpp:172–173,301–312 faint timer ${RINGO_FAINT_TIMER_MIN_MS}–` +
    `${RINGO_FAINT_TIMER_MAX_MS}ms / rearm ${RINGO_FAINT_REARM_MIN_MS}–` +
    `${RINGO_FAINT_REARM_MAX_MS}ms; SetFaint SLEEP=${UNIT_STAND_STATE_SLEEP} + ` +
    `SAY_FAINT_1..4=${SAY_FAINT_1}–${SAY_FAINT_4}; ClearFaint STAND + ` +
    `SAY_WAKE_1..4=${SAY_WAKE_1}–${SAY_WAKE_4}; SpellHit SPELL_REVIVE_RINGO=` +
    `${SPELL_REVIVE_RINGO} - FO6`;
  const citeCredit =
    `ungoro_crater.cpp:182–194 LOS NPC_SPRAGGLE=${NPC_SPRAGGLE} ` +
    `INTERACTION_DISTANCE=${INTERACTION_DISTANCE}: ` +
    'RewardPlayerAndGroupAtEventExplored(4491) + SetFollowComplete(true) - FO6 finishEscort';
  const citePost =
    `ungoro_crater.cpp:245–294 post-event timer start ${RINGO_END_EVENT_START_MS}ms ` +
    `phases SAY_RIN_END_1=${SAY_RIN_END_1}…EMOTE_RIN_END_8=${EMOTE_RIN_END_8} ` +
    `(SAY_SPR_END_2=${SAY_SPR_END_2}, SAY_RIN_END_3=${SAY_RIN_END_3}, ` +
    `EMOTE_RIN_END_4=${EMOTE_RIN_END_4}, EMOTE_RIN_END_5=${EMOTE_RIN_END_5}, ` +
    `SAY_RIN_END_6=${SAY_RIN_END_6}, SAY_SPR_END_7=${SAY_SPR_END_7}) - FO6`;
  const citeEnder =
    `bake enderCreatureEntries NPC_SPRAGGLE=${NPC_SPRAGGLE} after LOS explore credit`;
  return [
    {
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_STAND_UNGORO,
      cite: citeStand,
    },
    {
      kind: 'skip',
      reason:
        `StartFollow(player, FACTION_ESCORT_N_FRIEND_PASSIVE=${FACTION_ESCORT_N_FRIEND_PASSIVE}, quest) ` +
        `npc_ringo (${NPC_RINGO}) - FO6 degraded FollowerAI finishEscort`,
      cite: citeFollow,
    },
    {
      kind: 'skip',
      reason:
        `faint/revive SAY_FAINT (${SAY_FAINT_1}–${SAY_FAINT_4}) / SAY_WAKE (${SAY_WAKE_1}–${SAY_WAKE_4}) ` +
        `SLEEP=${UNIT_STAND_STATE_SLEEP} SPELL_REVIVE_RINGO=${SPELL_REVIVE_RINGO} - FO6`,
      cite: citeFaint,
    },
    {
      kind: 'skip',
      reason:
        `LOS NPC_SPRAGGLE (${NPC_SPRAGGLE}) RewardPlayerAndGroupAtEventExplored(4491) ` +
        `INTERACTION_DISTANCE=${INTERACTION_DISTANCE} - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `post-event SAY_RIN_END_1–EMOTE_RIN_END_8 (${SAY_RIN_END_1}–${EMOTE_RIN_END_8}) + ` +
        `SAY_SPR_END_2/7 (${SAY_SPR_END_2}/${SAY_SPR_END_7}) - FO6`,
      cite: citePost,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_SPRAGGLE (${NPC_SPRAGGLE}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/ungoro_crater.cpp Hooks: pQuestAcceptNPC ame01 (4245), ringo (4491). Residuals
// documented on accept chains: WP escort credit / faint-revive / Spraggle LOS.
export function runUngoroCrater(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_CHASING_AME) return runAme01Accept();
    if (questId === QUEST_A_LITTLE_HELP) return runRingoAccept();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/ungoro_crater'` in registry.ts.
export const UNGORO_CRATER_REGISTRY: Record<string | number, UngoroCraterQuestScriptEntry> = {
  'kalimdor/ungoro_crater': {
    family: 'kalimdor/ungoro_crater',
    questIds: [QUEST_CHASING_AME, QUEST_A_LITTLE_HELP],
    hooks: ['accept'],
    cite: 'kalimdor/ungoro_crater.cpp:99–116,327–339,61–77,178–319',
    run: runUngoroCrater,
  },
  [QUEST_CHASING_AME]: {
    family: 'kalimdor/ungoro_crater',
    questId: QUEST_CHASING_AME,
    questIds: [QUEST_CHASING_AME],
    hooks: ['accept'],
    cite: 'ungoro_crater.cpp:99–116 QuestAccept_npc_ame01',
    run: runUngoroCrater,
  },
  [QUEST_A_LITTLE_HELP]: {
    family: 'kalimdor/ungoro_crater',
    questId: QUEST_A_LITTLE_HELP,
    questIds: [QUEST_A_LITTLE_HELP],
    hooks: ['accept'],
    cite: 'ungoro_crater.cpp:327–339 QuestAccept_npc_ringo',
    run: runUngoroCrater,
  },
};
