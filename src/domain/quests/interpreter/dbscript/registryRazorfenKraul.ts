// QI4 — razorfen_kraul residual, extracted for the 1500-line ratchet. This batch claims the accept
// hook for quest 1144; 1221 is a pet-and-spell residual. Cite: kalimdor/razorfen_kraul.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface RazorfenKraulQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: razorfen_kraul.cpp:40 QUEST_WILLIX_THE_IMPORTER = 1144 Escort Willix out of RFK; explore credit at
// WP46.
export const QUEST_WILLIX_THE_IMPORTER = 1144;

// Cite: bake starterCreatureEntries / enderCreatureEntries quest 1144; Willix the Importer (4508) — not an
// enum in the cpp file.
const NPC_WILLIX_THE_IMPORTER = 4508;

// Cite: razorfen_kraul.cpp:57 NPC_RAGING_AGAMAR = 4514 Summoned at aBoarSpawn[0..1] (WP15) and
// aBoarSpawn[2..3] (WP45).
const NPC_RAGING_AGAMAR = 4514;

/** Cite: razorfen_kraul.cpp:42–55 script texts. */
const SAY_WILLIX_READY = -1047000;
const SAY_WILLIX_1 = -1047001;
const SAY_WILLIX_2 = -1047002;
const SAY_WILLIX_3 = -1047003;
const SAY_WILLIX_4 = -1047004;
const SAY_WILLIX_5 = -1047005;
const SAY_WILLIX_6 = -1047006;
const SAY_WILLIX_7 = -1047007;
const SAY_WILLIX_END = -1047008;
const SAY_WILLIX_AGGRO_1 = -1047009;
const SAY_WILLIX_AGGRO_2 = -1047010;
const SAY_WILLIX_AGGRO_3 = -1047011;
const SAY_WILLIX_AGGRO_4 = -1047012;

/** Cite: ScriptDevAIMgr.h:46 FACTION_ESCORT_N_NEUTRAL_PASSIVE = 113 SetFactionTemporary on accept. */
const FACTION_ESCORT_N_NEUTRAL_PASSIVE = 113;
// Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 razorfen_kraul.cpp:148 SetFactionTemporary(…,
// TEMPFACTION_RESTORE_RESPAWN).
const TEMPFACTION_RESTORE_RESPAWN = 0x01;

// Cite: Object.h:47 TEMPSPAWN_TIMED_OOC_DESPAWN = 5 WP15/WP45 SummonCreature TEMPSPAWN_TIMED_OOC_DESPAWN,
// 25000.
const TEMPSPAWN_TIMED_OOC_DESPAWN = 5;
/** Cite: razorfen_kraul.cpp:107–108,119–120 boar despawn delay 25000 */
const BOAR_DESPAWN_MS = 25000;

// Cite: Unit.h:511 UNIT_NPC_FLAG_QUESTGIVER = 0x00000002 razorfen_kraul.cpp:124 SetFlag(UNIT_NPC_FLAGS,
// UNIT_NPC_FLAG_QUESTGIVER) at WP46.
const UNIT_NPC_FLAG_QUESTGIVER = 0x00000002;

/** Cite: razorfen_kraul.cpp:60–66 aBoarSpawn[4][3] Indices 0–1 at WP15 pathway; 2–3 at WP45 end. */
const BOAR_SPAWN = [
  { x: 2151.42, y: 1733.18, z: 52.1 },
  { x: 2144.463, y: 1726.89, z: 51.93 },
  { x: 1956.433, y: 1597.97, z: 81.75 },
  { x: 1958.971, y: 1599.01, z: 81.44 },
] as const;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_willix_the_importer — quest 1144: a walking escort with WP texts and two boar
// ambushes; WP46 gives the explore credit and the questgiver flag. Cite: razorfen_kraul.cpp:139.
function runWillixAccept(): DbScriptIntent[] {
  const citeEscort =
    `razorfen_kraul.cpp:146 npc_willix_the_importer (${NPC_WILLIX_THE_IMPORTER}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeReady =
    `razorfen_kraul.cpp:147 DoScriptText(SAY_WILLIX_READY=${SAY_WILLIX_READY})`;
  const citeFaction =
    `razorfen_kraul.cpp:148 SetFactionTemporary(FACTION_ESCORT_N_NEUTRAL_PASSIVE=` +
    `${FACTION_ESCORT_N_NEUTRAL_PASSIVE}, TEMPFACTION_RESTORE_RESPAWN=${TEMPFACTION_RESTORE_RESPAWN})`;
  const citeWpEarly =
    `razorfen_kraul.cpp:95–103 WP3/7/10 DoScriptText(SAY_WILLIX_1/2/3=` +
    `${SAY_WILLIX_1}/${SAY_WILLIX_2}/${SAY_WILLIX_3}) - FO6`;
  const citeWp15 =
    `razorfen_kraul.cpp:104–109 WP15 DoScriptText(SAY_WILLIX_4=${SAY_WILLIX_4}) + ` +
    `2×SummonCreature(NPC_RAGING_AGAMAR=${NPC_RAGING_AGAMAR}) at aBoarSpawn[0]/[1] ` +
    `(${BOAR_SPAWN[0].x}/${BOAR_SPAWN[1].x}) TEMPSPAWN_TIMED_OOC_DESPAWN=` +
    `${TEMPSPAWN_TIMED_OOC_DESPAWN} ${BOAR_DESPAWN_MS}ms - FO6`;
  const citeWpMid =
    `razorfen_kraul.cpp:110–115 WP26/34 DoScriptText(SAY_WILLIX_5/6=` +
    `${SAY_WILLIX_5}/${SAY_WILLIX_6}) - FO6`;
  const citeWp45 =
    `razorfen_kraul.cpp:116–121 WP45 DoScriptText(SAY_WILLIX_7=${SAY_WILLIX_7}) + ` +
    `2×SummonCreature(NPC_RAGING_AGAMAR=${NPC_RAGING_AGAMAR}) at aBoarSpawn[2]/[3] ` +
    `(${BOAR_SPAWN[2].x}/${BOAR_SPAWN[3].x}) TEMPSPAWN_TIMED_OOC_DESPAWN=` +
    `${TEMPSPAWN_TIMED_OOC_DESPAWN} ${BOAR_DESPAWN_MS}ms - FO6`;
  const citeWp46 =
    `razorfen_kraul.cpp:122–129 WP46 DoScriptText(SAY_WILLIX_END=${SAY_WILLIX_END}) + ` +
    `SetFlag(UNIT_NPC_FLAG_QUESTGIVER=${UNIT_NPC_FLAG_QUESTGIVER}) + ` +
    `RewardPlayerAndGroupAtEventExplored(1144) + SetEscortPaused(true) - FO6 finishEscort`;
  const citeAggro =
    `razorfen_kraul.cpp:75–84 Aggro urand(0,6) SAY_WILLIX_AGGRO_1..4=` +
    `${SAY_WILLIX_AGGRO_1}/${SAY_WILLIX_AGGRO_2}/${SAY_WILLIX_AGGRO_3}/` +
    `${SAY_WILLIX_AGGRO_4} - FO6 combat`;
  const citeSummoned =
    `razorfen_kraul.cpp:86–89 JustSummoned AttackStart(m_creature) for ` +
    `NPC_RAGING_AGAMAR=${NPC_RAGING_AGAMAR} - FO6 combat`;
  const citeEnder =
    `bake enderCreatureEntries NPC_WILLIX_THE_IMPORTER=${NPC_WILLIX_THE_IMPORTER} ` +
    'after explore credit';
  return [
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_willix_the_importer (${NPC_WILLIX_THE_IMPORTER}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'talk',
      textId: SAY_WILLIX_READY,
      stringTemplateId: 0,
      cite: citeReady,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_N_NEUTRAL_PASSIVE,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `WP3/7/10 SAY_WILLIX_1/2/3 (${SAY_WILLIX_1}/${SAY_WILLIX_2}/${SAY_WILLIX_3}) - FO6`,
      cite: citeWpEarly,
    },
    {
      kind: 'skip',
      reason:
        `WP15 SAY_WILLIX_4 (${SAY_WILLIX_4}) + 2×NPC_RAGING_AGAMAR (${NPC_RAGING_AGAMAR}) ` +
        `TEMPSPAWN_TIMED_OOC_DESPAWN (${TEMPSPAWN_TIMED_OOC_DESPAWN}) ${BOAR_DESPAWN_MS}ms - FO6`,
      cite: citeWp15,
    },
    {
      kind: 'skip',
      reason:
        `WP26/34 SAY_WILLIX_5/6 (${SAY_WILLIX_5}/${SAY_WILLIX_6}) - FO6`,
      cite: citeWpMid,
    },
    {
      kind: 'skip',
      reason:
        `WP45 SAY_WILLIX_7 (${SAY_WILLIX_7}) + 2×NPC_RAGING_AGAMAR (${NPC_RAGING_AGAMAR}) ` +
        `TEMPSPAWN_TIMED_OOC_DESPAWN (${TEMPSPAWN_TIMED_OOC_DESPAWN}) ${BOAR_DESPAWN_MS}ms - FO6`,
      cite: citeWp45,
    },
    {
      kind: 'skip',
      reason:
        `WP46 SAY_WILLIX_END (${SAY_WILLIX_END}) + UNIT_NPC_FLAG_QUESTGIVER ` +
        `(${UNIT_NPC_FLAG_QUESTGIVER}) + RewardPlayerAndGroupAtEventExplored(1144) - FO6 finishEscort`,
      cite: citeWp46,
    },
    {
      kind: 'skip',
      reason:
        `Aggro SAY_WILLIX_AGGRO (${SAY_WILLIX_AGGRO_1}/${SAY_WILLIX_AGGRO_2}/` +
        `${SAY_WILLIX_AGGRO_3}/${SAY_WILLIX_AGGRO_4}) - FO6 combat`,
      cite: citeAggro,
    },
    {
      kind: 'skip',
      reason:
        `JustSummoned AttackStart NPC_RAGING_AGAMAR (${NPC_RAGING_AGAMAR}) - FO6 combat`,
      cite: citeSummoned,
    },
    {
      kind: 'skip',
      reason:
        `turn-in NPC_WILLIX_THE_IMPORTER (${NPC_WILLIX_THE_IMPORTER}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/razorfen_kraul/razorfen_kraul.cpp Hooks: pQuestAcceptNPC willix_the_importer
// (1144). Residuals documented on accept chain: escort WP texts, raging agamar summons.
export function runRazorfenKraul(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_WILLIX_THE_IMPORTER) return runWillixAccept();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/razorfen_kraul/razorfen_kraul'` in registry.ts.
export const RAZORFEN_KRAUL_REGISTRY: Record<string | number, RazorfenKraulQuestScriptEntry> = {
  'kalimdor/razorfen_kraul/razorfen_kraul': {
    family: 'kalimdor/razorfen_kraul/razorfen_kraul',
    questIds: [QUEST_WILLIX_THE_IMPORTER],
    hooks: ['accept'],
    cite: 'kalimdor/razorfen_kraul/razorfen_kraul.cpp:139–153,91–130,75–89',
    run: runRazorfenKraul,
  },
  [QUEST_WILLIX_THE_IMPORTER]: {
    family: 'kalimdor/razorfen_kraul/razorfen_kraul',
    questId: QUEST_WILLIX_THE_IMPORTER,
    questIds: [QUEST_WILLIX_THE_IMPORTER],
    hooks: ['accept'],
    cite: 'razorfen_kraul.cpp:139–153 QuestAccept_npc_willix_the_importer',
    run: runRazorfenKraul,
  },
};
