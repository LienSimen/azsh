// QI4 — eastern_kingdoms/stormwind_city residual, extracted for the 1500-line ratchet. Accept hooks
// for quests 1640, 1447 and 6403, plus the Squire Rowe gossip for 6402. Cite: stormwind_city.cpp.

import type { DbScriptIntent } from './types.ts';
import {
  NPC_FLAG_CHANGE_REMOVE,
  TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN,
} from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

// ── sourced constants ────────────────────────────────────────────────────────

/** Cite: stormwind_city.cpp:46 QUEST_BEAT = 1640 Beat Bartleby — duel Bartleby for his mug. */
export const QUEST_BEAT = 1640;
// Cite: stormwind_city.cpp:100 QUEST_MISSING_DIPLO_PT8 = 1447 The Missing Diplomat (pt8) — defeat Dashel
// Stonefist in Old Town.
export const QUEST_MISSING_DIPLO_PT8 = 1447;
// Cite: stormwind_city.cpp:521 QUEST_STORMWIND_RENDEZVOUS = 6402 Stormwind Rendezvous — meet Windsor at the
// city gates (Squire Rowe gossip).
export const QUEST_STORMWIND_RENDEZVOUS = 6402;
// Cite: stormwind_city.cpp:522 QUEST_THE_GREAT_MASQUERADE = 6403 The Great Masquerade — escort Reginald
// Windsor to keep / expose Prestor.
export const QUEST_THE_GREAT_MASQUERADE = 6403;

// Cite: bake starterCreatureEntries / classic-db creature_questrelation Bartleby (npc_bartleby script
// name).
const NPC_BARTLEBY = 6090;
/** Cite: bake starterCreatureEntries — Dashel Stonefist (npc_dashel_stonefist script name). */
const NPC_DASHEL_STONEFIST = 4961;
/** Cite: stormwind_city.cpp:102 NPC_OLD_TOWN_THUG = 4969 Thugs summoned on Missing Diplomat accept. */
const NPC_OLD_TOWN_THUG = 4969;
// Cite: world_eastern_kingdoms.h:12 NPC_WINDSOR = 12580 Reginald Windsor (npc_reginald_windsor); also ender
// of 6402 / starter of 6403.
const NPC_WINDSOR = 12580;
// Cite: scriptdev2.sql ScriptName='npc_squire_rowe' WHERE entry=17804 Squire Rowe — gossip starts Windsor
// summon escort for 6402 turn-in.
const NPC_SQUIRE_ROWE = 17804;
// Cite: bake enderCreatureEntries quest 6403 — Highlord Bolvar Fordragon world_eastern_kingdoms.h:10
// NPC_BOLVAR = 1748
const NPC_BOLVAR = 1748;
/** Cite: bake starterCreatureEntries quest 6402 — Marshal Maxwell */
const NPC_MARSHAL_MAXWELL = 9560;

/** Cite: stormwind_city.cpp:45 FACTION_ENEMY = 168 Bartleby accept SetFactionTemporary. */
const FACTION_ENEMY = 168;
// Cite: stormwind_city.cpp:104 FACTION_NEUTRAL = 189 Dashel accept SetFactionTemporary (hostile enough to
// fight player).
const FACTION_NEUTRAL = 189;
// Cite: stormwind_city.cpp:105 FACTION_FRIENDLY_TO_ALL = 35 Dashel low-HP surrender faction (not
// accept-hook — FO6 fight end).
const FACTION_FRIENDLY_TO_ALL = 35;

/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:578 TEMPFACTION_RESTORE_COMBAT_STOP = 0x02 */
const TEMPFACTION_RESTORE_COMBAT_STOP = 0x02;
// Cite: stormwind_city.cpp:76 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_RESTORE_COMBAT_STOP = 0x01 | 0x02 =
// 0x03
const BARTLEBY_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_RESTORE_COMBAT_STOP;

// Cite: stormwind_city.cpp:94 SAY_PROGRESS_1_DAS = 1961 DoBroadcastText on Dashel accept ("Now you're gonna
// get it good…").
const SAY_PROGRESS_1_DAS = 1961;
/** Cite: stormwind_city.cpp:95 SAY_PROGRESS_2_DAS = 1712 Low-HP surrender line (FO6 fight end). */
const SAY_PROGRESS_2_DAS = 1712;
// Cite: stormwind_city.cpp:96–98 SAY_PROGRESS_3_DAS / 4_THU / 5_THU End-event thug dialogue after credit
// path (FO6).
const SAY_PROGRESS_3_DAS = 1713;
// Cite: stormwind_city.cpp:709 SAY_WINDSOR_QUEST_ACCEPT = -1000825 DoStartEscort StartNextDialogueText
// first line.
const SAY_WINDSOR_QUEST_ACCEPT = -1000825;
// Cite: stormwind_city.cpp:710 SAY_WINDSOR_GET_READY = -1000826 Dialogue follow-up after accept (FO6
// dialogue timer).
const SAY_WINDSOR_GET_READY = -1000826;
// Cite: stormwind_city.cpp:507 SAY_WELCOME = -1000824 Squire Rowe intro dialogue — Windsor greets player
// (FO6 6402 path).
const SAY_WELCOME = -1000824;
/** Cite: stormwind_city.cpp:505 SAY_SIGNAL_SENT = -1000822 Rowe WP7 signal (FO6 6402 path). */
const SAY_SIGNAL_SENT = -1000822;

/** Cite: Unit.h:511 UNIT_NPC_FLAG_QUESTGIVER = 0x00000002 Dashel accept RemoveFlag(UNIT_NPC_FLAGS, …). */
const UNIT_NPC_FLAG_QUESTGIVER = 0x00000002;

/** Cite: stormwind_city.cpp:110–113 aThugSpawnPosition[0] First Old Town thug summon position on accept. */
const THUG0_SPAWN = {
  x: -8687.311,
  y: 446.7531,
  z: 100.05593,
  o: 5.12632,
} as const;
/** Cite: stormwind_city.cpp:110–113 aThugSpawnPosition[1] */
const THUG1_SPAWN = {
  x: -8669.205,
  y: 448.4405,
  z: 99.74935,
  o: 3.75387,
} as const;
// Cite: stormwind_city.cpp:427 TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN, 120000 SummonCreature despawn delay for
// both thugs.
const THUG_DESPAWN_MS = 120000;
// Cite: stormwind_city.cpp:202 ResetTimer(DASHEL_START_EVENT, 2000) Delay before Dashel AttackStart after
// accept.
const DASHEL_START_EVENT_MS = 2000;
// Cite: stormwind_city.cpp:374 GetHealthPercent() <= 20.f Low-HP threshold that awards fight end / explore
// path (FO6).
const DASHEL_LOW_HP_PCT = 20;
// Cite: stormwind_city.cpp:60 (GetHealth - damage) * 100 / MaxHealth < 15 Bartleby DamageTaken explore
// credit threshold (FO6 fight).
const BARTLEBY_CREDIT_HP_PCT = 15;

// QuestAccept_npc_bartleby — quest 1640 Beat Bartleby: turn him hostile and attack; taking him
// under 15% health credits the quest and evades. Cite: stormwind_city.cpp:72–79, :58–68.
function runBartlebyAccept(): DbScriptIntent[] {
  const citeFaction =
    `stormwind_city.cpp:76 npc_bartleby (${NPC_BARTLEBY}) ` +
    `SetFactionTemporary(FACTION_ENEMY=${FACTION_ENEMY}, ` +
    'TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_RESTORE_COMBAT_STOP)';
  const citeAttack =
    `stormwind_city.cpp:77 AI()->AttackStart(player)`;
  const citeCredit =
    `stormwind_city.cpp:60–65 DamageTaken HP<${BARTLEBY_CREDIT_HP_PCT}% ` +
    `AreaExploredOrEventHappens(${QUEST_BEAT}) + EnterEvadeMode - FO6 finishEscort`;
  return [
    {
      kind: 'set_faction',
      factionId: FACTION_ENEMY,
      flags: BARTLEBY_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'attack_start',
      canAttack: true,
      cite: citeAttack,
    },
    {
      kind: 'skip',
      reason:
        `DamageTaken HP<${BARTLEBY_CREDIT_HP_PCT}% AreaExploredOrEventHappens(${QUEST_BEAT}) - FO6 finishEscort`,
      cite: citeCredit,
    },
  ];
}

// QuestAccept_npc_dashel_stonefist — quest 1447 The Missing Diplomat pt8: talk, go neutral, strip
// QUESTGIVER and summon two thugs; his surrender at 20% credits. Cite: stormwind_city.cpp:413–447.
function runDashelStonefistAccept(): DbScriptIntent[] {
  const citeTalk =
    `stormwind_city.cpp:421 npc_dashel_stonefist (${NPC_DASHEL_STONEFIST}) ` +
    `DoBroadcastText(SAY_PROGRESS_1_DAS=${SAY_PROGRESS_1_DAS})`;
  const citeFaction =
    `stormwind_city.cpp:422 SetFactionTemporary(FACTION_NEUTRAL=${FACTION_NEUTRAL}, TEMPFACTION_RESTORE_RESPAWN)`;
  const citeQg =
    'stormwind_city.cpp:423 RemoveFlag(UNIT_NPC_FLAGS, UNIT_NPC_FLAG_QUESTGIVER)';
  const citeReact =
    'stormwind_city.cpp:424 SetReactState(REACT_AGGRESSIVE) - host AI FO6';
  const citeThug0 =
    `stormwind_city.cpp:427–431 SummonCreature(NPC_OLD_TOWN_THUG=${NPC_OLD_TOWN_THUG}, ` +
    `pos0, TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN, ${THUG_DESPAWN_MS}) + MovePoint + RemoveFlag IMMUNE_TO_NPC`;
  const citeThug1 =
    `stormwind_city.cpp:435–439 SummonCreature(NPC_OLD_TOWN_THUG=${NPC_OLD_TOWN_THUG}, ` +
    `pos1, TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN, ${THUG_DESPAWN_MS}) + MovePoint + RemoveFlag IMMUNE_TO_NPC`;
  const citeStart =
    `stormwind_city.cpp:198–203 StartEvent ResetTimer(DASHEL_START_EVENT, ${DASHEL_START_EVENT_MS}) then AttackStart - FO6`;
  const citeSurrender =
    `stormwind_city.cpp:374–397 HP<=${DASHEL_LOW_HP_PCT}% DoBroadcastText(SAY_PROGRESS_2_DAS=${SAY_PROGRESS_2_DAS}) + ` +
    `SetFactionTemporary(FACTION_FRIENDLY_TO_ALL=${FACTION_FRIENDLY_TO_ALL}) - FO6 fight end`;
  const citeCredit =
    `stormwind_city.cpp:315–317 AreaExploredOrEventHappens(${QUEST_MISSING_DIPLO_PT8}) + ` +
    `SAY_PROGRESS_3_DAS=${SAY_PROGRESS_3_DAS} thug stand-down - FO6 finishEscort`;
  const prior = UNIT_NPC_FLAG_QUESTGIVER;
  const resultFlags = prior & ~UNIT_NPC_FLAG_QUESTGIVER;
  return [
    {
      kind: 'talk',
      textId: SAY_PROGRESS_1_DAS,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_NEUTRAL,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeFaction,
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
      reason: 'SetReactState(REACT_AGGRESSIVE) - host AI FO6',
      cite: citeReact,
    },
    {
      kind: 'temp_spawn_creature',
      creatureEntry: NPC_OLD_TOWN_THUG,
      x: THUG0_SPAWN.x,
      y: THUG0_SPAWN.y,
      z: THUG0_SPAWN.z,
      o: THUG0_SPAWN.o,
      despawnDelay: THUG_DESPAWN_MS,
      pathId: 0,
      setRun: false,
      summonActive: false,
      spawnDataEntry: 0,
      spawnType: TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN,
      cite: citeThug0,
    },
    {
      kind: 'temp_spawn_creature',
      creatureEntry: NPC_OLD_TOWN_THUG,
      x: THUG1_SPAWN.x,
      y: THUG1_SPAWN.y,
      z: THUG1_SPAWN.z,
      o: THUG1_SPAWN.o,
      despawnDelay: THUG_DESPAWN_MS,
      pathId: 0,
      setRun: false,
      summonActive: false,
      spawnDataEntry: 0,
      spawnType: TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN,
      cite: citeThug1,
    },
    {
      kind: 'skip',
      reason:
        `thug MovePoint + RemoveFlag IMMUNE_TO_NPC + StartEvent ${DASHEL_START_EVENT_MS}ms AttackStart - FO6 combat`,
      cite: citeStart,
    },
    {
      kind: 'skip',
      reason:
        `HP<=${DASHEL_LOW_HP_PCT}% surrender SAY_PROGRESS_2_DAS (${SAY_PROGRESS_2_DAS}) + FACTION_FRIENDLY_TO_ALL (${FACTION_FRIENDLY_TO_ALL}) - FO6`,
      cite: citeSurrender,
    },
    {
      kind: 'skip',
      reason:
        `AreaExploredOrEventHappens(${QUEST_MISSING_DIPLO_PT8}) + SAY_PROGRESS_3_DAS (${SAY_PROGRESS_3_DAS}) - FO6 finishEscort`,
      cite: citeCredit,
    },
  ];
}

// QuestAccept_npc_reginald_windsor — quest 6403 The Great Masquerade: the accept talk starts the
// city escort, and the keep reveal carries the explore credit. Cite: stormwind_city.cpp:1273–1281.
function runReginaldWindsorAccept(): DbScriptIntent[] {
  const citeAccept =
    `stormwind_city.cpp:1275–1278 npc_reginald_windsor (${NPC_WINDSOR}) ` +
    'DoStartEscort(player)';
  const citeTalk =
    `stormwind_city.cpp:1214 DoStartEscort StartNextDialogueText(SAY_WINDSOR_QUEST_ACCEPT=${SAY_WINDSOR_QUEST_ACCEPT})`;
  const citeDlg =
    `stormwind_city.cpp:802–804 dialogue SAY_WINDSOR_GET_READY=${SAY_WINDSOR_GET_READY} + Prestor sieze - FO6 dialogue`;
  const citeEscort =
    'stormwind_city.cpp:920–1177 masquerade escort + keep dialogue (Jonathan/Bolvar/Prestor) - FO6 escort';
  const citeCredit =
    `stormwind_city.cpp:1173–1177 RewardPlayerAndGroupAtEventExplored(${QUEST_THE_GREAT_MASQUERADE}) - FO6 finishEscort`;
  const citeTurnIn =
    `stormwind_city.cpp ender Highlord Bolvar Fordragon (${NPC_BOLVAR}) after explore credit`;
  return [
    {
      kind: 'talk',
      textId: SAY_WINDSOR_QUEST_ACCEPT,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason:
        `DoStartEscort on npc_reginald_windsor (${NPC_WINDSOR}) - FO6 degraded escort`,
      cite: citeAccept,
    },
    {
      kind: 'skip',
      reason:
        `dialogue SAY_WINDSOR_GET_READY (${SAY_WINDSOR_GET_READY}) + Prestor line - FO6`,
      cite: citeDlg,
    },
    {
      kind: 'skip',
      reason:
        'masquerade city escort + keep reveal (Jonathan/Bolvar/Prestor) - FO6 escort',
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `RewardPlayerAndGroupAtEventExplored(${QUEST_THE_GREAT_MASQUERADE}) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `turn-in to Bolvar (${NPC_BOLVAR}) after explore credit - host turnIn`,
      cite: citeTurnIn,
    },
  ];
}

// Quest 6402 Stormwind Rendezvous has no accept hook. The related residual is Squire Rowe's
// gossip, which escorts in and summons Windsor as the ender. Cite: stormwind_city.cpp:663–700.
function runStormwindRendezvousAccept(): DbScriptIntent[] {
  const citeGossip =
    `stormwind_city.cpp:663–687 GossipHello_npc_squire_rowe (${NPC_SQUIRE_ROWE}) ` +
    `gates on QUEST_STORMWIND_RENDEZVOUS=${QUEST_STORMWIND_RENDEZVOUS} / MASQUERADE=${QUEST_THE_GREAT_MASQUERADE}`;
  const citeStart =
    `stormwind_city.cpp:690–698 GossipSelect Start(true, player) escort - FO6`;
  const citeSummon =
    `stormwind_city.cpp:594 SummonCreature(NPC_WINDSOR=${NPC_WINDSOR}) + WP7 SAY_SIGNAL_SENT=${SAY_SIGNAL_SENT} - FO6`;
  const citeWelcome =
    `stormwind_city.cpp:635 DoScriptText(SAY_WELCOME=${SAY_WELCOME}) + SetFlag QUESTGIVER - FO6 ender ready`;
  const citeStarter =
    `bake starter Marshal Maxwell (${NPC_MARSHAL_MAXWELL}) → ender Reginald Windsor (${NPC_WINDSOR})`;
  return [
    {
      kind: 'skip',
      reason:
        `no pQuestAcceptNPC for ${QUEST_STORMWIND_RENDEZVOUS}; Squire Rowe (${NPC_SQUIRE_ROWE}) gossip FO6 summons Windsor`,
      cite: citeGossip,
    },
    {
      kind: 'skip',
      reason: 'Squire Rowe GossipSelect Start(true, player) escort - FO6',
      cite: citeStart,
    },
    {
      kind: 'skip',
      reason:
        `SummonCreature Windsor (${NPC_WINDSOR}) + SAY_SIGNAL_SENT (${SAY_SIGNAL_SENT}) - FO6`,
      cite: citeSummon,
    },
    {
      kind: 'skip',
      reason:
        `SAY_WELCOME (${SAY_WELCOME}) + QUESTGIVER on Windsor for turn-in - FO6`,
      cite: citeWelcome,
    },
    {
      kind: 'skip',
      reason:
        `Maxwell (${NPC_MARSHAL_MAXWELL}) → Windsor (${NPC_WINDSOR}) turn-in chain`,
      cite: citeStarter,
    },
  ];
}

// Family pack: eastern_kingdoms/stormwind_city.cpp Hooks: pQuestAcceptNPC bartleby (1640), dashel (1447),
// reginald (6403); related residual squire_rowe gossip for 6402.
export function runStormwindCity(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase !== 'accept') return [];
  if (questId === QUEST_BEAT) return runBartlebyAccept();
  if (questId === QUEST_MISSING_DIPLO_PT8) return runDashelStonefistAccept();
  if (questId === QUEST_THE_GREAT_MASQUERADE) return runReginaldWindsorAccept();
  if (questId === QUEST_STORMWIND_RENDEZVOUS) return runStormwindRendezvousAccept();
  return [];
}
