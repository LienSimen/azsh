// QI4 — eastern_kingdoms/westfall residual, extracted for the 1500-line ratchet: accept hooks for
// quests 1651 and 155. Cite: eastern_kingdoms/westfall.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: westfall.cpp:51 QUEST_TOME_VALOR = 1651 Escort Daphne Stilwell; defend her farm from Defias raider
// waves.
export const QUEST_TOME_VALOR = 1651;
// Cite: westfall.cpp:348 QUEST_DEFIAS_BROTHERHOOD = 155 Escort the Defias Traitor to the hideout overlook.
export const QUEST_DEFIAS_BROTHERHOOD = 155;
// Cite: bake starterCreatureEntries / scriptdev2 ScriptName='npc_daphne_stilwell' Daphne Stilwell (entry
// 6182).
const NPC_DAPHNE_STILWELL = 6182;
// Cite: bake starterCreatureEntries / scriptdev2 ScriptName='npc_defias_traitor' The Defias Traitor (entry
// 467).
const NPC_DEFIAS_TRAITOR = 467;
/** Cite: bake enderCreatureEntries quest 155 — Gryan Stoutmantle (234). */
const NPC_GRYAN_STOUTMANTLE = 234;
// Cite: westfall.cpp:52 NPC_DEFIAS_RAIDER = 6180 Wave adds summoned at escort WP4 (DoSendWave) — FO6
// combat.
const NPC_DEFIAS_RAIDER = 6180;
/** Cite: westfall.cpp:53 EQUIP_ID_RIFLE = 2511 Daphne equips rifle at WP5 (SetEquipmentSlots ranged). */
const EQUIP_ID_RIFLE = 2511;
/** Cite: westfall.cpp:43 SAY_DS_START = -1000293 DoScriptText on Daphne accept. */
const SAY_DS_START = -1000293;
/** Cite: westfall.cpp:41 YELL_DEFIAS_START = -1000412 First raider wave intro yell (DoSendWave) — FO6. */
const YELL_DEFIAS_START = -1000412;
/** Cite: westfall.cpp:44–46 SAY_WAVE_DOWN_1/2/3 Between-wave victory lines (urand) — FO6 combat. */
const SAY_WAVE_DOWN_1 = -1000294;
const SAY_WAVE_DOWN_2 = -1000295;
const SAY_WAVE_DOWN_3 = -1000414;
/** Cite: westfall.cpp:47 SAY_DS_DOWN_3 = -1000296 WP8 cheer after third wave cleared. */
const SAY_DS_DOWN_3 = -1000296;
/** Cite: westfall.cpp:48 SAY_DS_PROLOGUE = -1000297 WP9 after wave defense. */
const SAY_DS_PROLOGUE = -1000297;
/** Cite: westfall.cpp:42 YELL_DAPHNE_START = -1000413 WP7 yell while waiting for raiders. */
const YELL_DAPHNE_START = -1000413;
/** Cite: westfall.cpp:339 SAY_START = 9 DoBroadcastText on Defias Traitor accept (broadcast_text id). */
const SAY_START = 9;
/** Cite: westfall.cpp:340 SAY_PROGRESS = 10 WP65 progress line to player. */
const SAY_PROGRESS = 10;
/** Cite: westfall.cpp:341 SAY_END = 11 WP94 end line before explore credit. */
const SAY_END = 11;
/** Cite: westfall.cpp:347 DEFIAS_TRAITOR_PATH = 467 Path id passed to npc_escortAI::Start on accept. */
const DEFIAS_TRAITOR_PATH = 467;
// Cite: westfall.cpp:193 TEMPSPAWN_TIMED_OOC_DESPAWN, 30000 Raider summon despawn delay (ms) — FO6 wave.
const RAIDER_DESPAWN_MS = 30000;
/** Cite: westfall.cpp:374 ForcedDespawn(3000, true) Traitor despawn after WP94 explore credit. */
const TRAITOR_DESPAWN_MS = 3000;

// QuestAccept_npc_daphne_stilwell — quest 1651 The Tome of Valor: say the start line and escort;
// she equips a rifle and holds three Defias waves, then WP16 credits. Cite: westfall.cpp:315–323.
function runDaphneStilwellAccept(): DbScriptIntent[] {
  const citeTalk =
    `westfall.cpp:319 npc_daphne_stilwell (${NPC_DAPHNE_STILWELL}) ` +
    `DoScriptText(SAY_DS_START=${SAY_DS_START})`;
  const citeEscort =
    `westfall.cpp:321–322 npc_daphne_stilwell (${NPC_DAPHNE_STILWELL}) ` +
    'npc_escortAI::Start(true, player, quest) - FO6 degraded finishEscort';
  const citeWaves =
    `westfall.cpp:107–114,179–207 WP4 DoSendWave SummonCreature(NPC_DEFIAS_RAIDER=${NPC_DEFIAS_RAIDER}) ` +
    `×3 waves TEMPSPAWN_TIMED_OOC_DESPAWN ${RAIDER_DESPAWN_MS}ms; YELL_DEFIAS_START=${YELL_DEFIAS_START}; ` +
    `SAY_WAVE_DOWN_1/2/3=${SAY_WAVE_DOWN_1}/${SAY_WAVE_DOWN_2}/${SAY_WAVE_DOWN_3} - FO6 combat`;
  const citeRifle =
    `westfall.cpp:121–128 WP5 SetEquipmentSlots(EQUIP_ID_RIFLE=${EQUIP_ID_RIFLE}) + sheath ranged - FO6 WP`;
  const citeHold =
    `westfall.cpp:130–136 WP7 YELL_DAPHNE_START=${YELL_DAPHNE_START} + SetEscortPaused - FO6 wave hold`;
  const citeCheer =
    `westfall.cpp:138–148 WP8 SAY_DS_DOWN_3=${SAY_DS_DOWN_3}; WP9 SAY_DS_PROLOGUE=${SAY_DS_PROLOGUE} - FO6 WP`;
  const citeCredit =
    `westfall.cpp:166–169 WP16 RewardPlayerAndGroupAtEventExplored(1651) - FO6 finishEscort`;
  const citeEnd =
    'westfall.cpp:171–174,289–293 WP17 DoEndEscort ForcedDespawn+Respawn - FO6';
  return [
    {
      kind: 'talk',
      textId: SAY_DS_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(true, player, quest) npc_daphne_stilwell (${NPC_DAPHNE_STILWELL}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP4–7 Defias raider waves NPC_DEFIAS_RAIDER (${NPC_DEFIAS_RAIDER}) ×3 - FO6 combat`,
      cite: citeWaves,
    },
    {
      kind: 'skip',
      reason: `WP5 equip rifle ${EQUIP_ID_RIFLE} - FO6 waypoint`,
      cite: citeRifle,
    },
    {
      kind: 'skip',
      reason: `WP7 YELL_DAPHNE_START (${YELL_DAPHNE_START}) + escort pause - FO6`,
      cite: citeHold,
    },
    {
      kind: 'skip',
      reason:
        `WP8–9 SAY_DS_DOWN_3 (${SAY_DS_DOWN_3}) + SAY_DS_PROLOGUE (${SAY_DS_PROLOGUE}) - FO6`,
      cite: citeCheer,
    },
    {
      kind: 'skip',
      reason:
        'WP16 RewardPlayerAndGroupAtEventExplored(1651) - FO6 finishEscort',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: 'WP17 DoEndEscort ForcedDespawn+Respawn - FO6',
      cite: citeEnd,
    },
  ];
}

// QuestAccept_npc_defias_traitor — quest 155 The Defias Brotherhood: say the start line and run
// escort path 467; WP94 says the end line and credits. Cite: westfall.cpp:392–402, :359–376.
function runDefiasTraitorAccept(): DbScriptIntent[] {
  const citeTalk =
    `westfall.cpp:396 npc_defias_traitor (${NPC_DEFIAS_TRAITOR}) ` +
    `DoBroadcastText(SAY_START=${SAY_START})`;
  const citeEscort =
    `westfall.cpp:398–399 npc_defias_traitor (${NPC_DEFIAS_TRAITOR}) ` +
    `npc_escortAI::Start(true, player, quest, true, false, DEFIAS_TRAITOR_PATH=${DEFIAS_TRAITOR_PATH}) ` +
    '- FO6 degraded finishEscort (instant respawn)';
  const citeProgress =
    `westfall.cpp:362–367 WP65 SetRun(false) + DoBroadcastText(SAY_PROGRESS=${SAY_PROGRESS}) - FO6 WP`;
  const citeCredit =
    `westfall.cpp:368–374 WP94 DoBroadcastText(SAY_END=${SAY_END}) + ` +
    `RewardPlayerAndGroupAtEventExplored(155) + ForcedDespawn(${TRAITOR_DESPAWN_MS}, true) - FO6 finishEscort`;
  const citeEnder =
    `bake enderCreatureEntries NPC_GRYAN_STOUTMANTLE=${NPC_GRYAN_STOUTMANTLE} after WP94 explore credit`;
  return [
    {
      kind: 'talk',
      textId: SAY_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(true, player, quest, true, false, path=${DEFIAS_TRAITOR_PATH}) ` +
        `npc_defias_traitor (${NPC_DEFIAS_TRAITOR}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason: `WP65 SAY_PROGRESS (${SAY_PROGRESS}) - FO6 waypoint`,
      cite: citeProgress,
    },
    {
      kind: 'skip',
      reason:
        `WP94 SAY_END (${SAY_END}) + RewardPlayerAndGroupAtEventExplored(155) + ` +
        `ForcedDespawn(${TRAITOR_DESPAWN_MS}) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `turn-in Gryan Stoutmantle (${NPC_GRYAN_STOUTMANTLE}) after explore credit - host ender`,
      cite: citeEnder,
    },
  ];
}

// Family pack: eastern_kingdoms/westfall.cpp. Accept hooks for 1651 and 155. Foreman Klaven
// Mortwake is stealth-alert AI only, not a quest hook.
export function runWestfall(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_TOME_VALOR) return runDaphneStilwellAccept();
  if (questId === QUEST_DEFIAS_BROTHERHOOD) return runDefiasTraitorAccept();
  return [];
}
