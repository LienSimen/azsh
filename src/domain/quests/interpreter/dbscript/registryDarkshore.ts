// QI4 — kalimdor/darkshore residuals, extracted for the 1500-line ratchet. Registered: 731, 945,
// 994, 995, 2078, 2118 and 5321. Cite: kalimdor/darkshore.cpp.

import type { DbScriptIntent } from './types.ts';
import {
  UNIT_FLAG_CHANGE_REMOVE,
  UNIT_STAND_STATE_STAND,
} from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface DarkshoreQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: darkshore.cpp:233 QUEST_ABSENT_MINDED_PT2 = 731 Escort Prospector Remtravel; WP38 event explore
// credit.
export const QUEST_ABSENT_MINDED_PT2 = 731;
/** Cite: darkshore.cpp:490 QUEST_ID_THERYLUNE_ESCAPE = 945 Escort Therylune; WP18 event explore credit. */
export const QUEST_ID_THERYLUNE_ESCAPE = 945;
// Cite: darkshore.cpp:398 QUEST_ESCAPE_THROUGH_FORCE = 994 Escort Volcor force path VOLCOR_PATH_02; WP15
// explore credit.
export const QUEST_ESCAPE_THROUGH_FORCE = 994;
// Cite: darkshore.cpp:399 QUEST_ESCAPE_THROUGH_STEALTH = 995 Escort Volcor stealth path VOLCOR_PATH_01; WP3
// explore credit.
export const QUEST_ESCAPE_THROUGH_STEALTH = 995;
// Cite: darkshore.cpp:309 QUEST_GYROMAST_REV = 2078 Gossip turn-key starts Threshwackonator follower; kill
// 6669 after hostile flip.
export const QUEST_GYROMAST_REV = 2078;
// Cite: darkshore.cpp:549 QUEST_PLAGUED_LANDS = 2118 Trap rabid bear with SPELL_BEAR_CAPTURED → kill credit
// 11836.
export const QUEST_PLAGUED_LANDS = 2118;
// Cite: darkshore.cpp:77 QUEST_SLEEPER_AWAKENED = 5321 Follower Kerlonian; LOS Liladris → event explore
// credit.
export const QUEST_SLEEPER_AWAKENED = 5321;

/** Cite: bake starterCreatureEntries quest 731; scriptdev2.sql:299 entry=2917 Prospector Remtravel. */
const NPC_PROSPECTOR_REMTRAVEL = 2917;
/** Cite: bake enderCreatureEntries quest 731 — Archaeologist Hollee (2913). */
const NPC_ARCHAEOLOGIST_HOLLEE = 2913;
/** Cite: darkshore.cpp:234 REMTRAVEL_ESCORT_PATH = 2917 Path id passed to npc_escortAI::Start on accept. */
const REMTRAVEL_ESCORT_PATH = 2917;
/** Cite: darkshore.cpp:236–241 SAY_REM_AGGRO_1..6 broadcast_text ids (FO6 combat). */
const SAY_REM_AGGRO_1 = 938;
const SAY_REM_AGGRO_6 = 943;

/** Cite: bake starterCreatureEntries quest 945; scriptdev2.sql:302 entry=3584 Therylune. */
const NPC_THERYLUNE = 3584;
/** Cite: bake enderCreatureEntries quest 945; darkshore.cpp:488 NPC_THERYSIL = 3585 */
const NPC_THERYSIL = 3585;
/** Cite: darkshore.cpp:485–486 SAY_THERYLUNE_START/FINISH script texts. */
const SAY_THERYLUNE_START = -1000905;
const SAY_THERYLUNE_FINISH = -1000906;

/** Cite: bake starterCreatureEntries quests 994/995; scriptdev2.sql:301 entry=3692 Volcor. */
const NPC_VOLCOR = 3692;
/** Cite: bake enderCreatureEntries quests 994/995 — Terenthis (3693). */
const NPC_TERENTHIS = 3693;
/** Cite: darkshore.cpp:395–396 VOLCOR_PATH_01/02 escort path ids. */
const VOLCOR_PATH_01 = 3692;
const VOLCOR_PATH_02 = 3693;
/** Cite: darkshore.cpp:390–393 SAY_AGGRO_1..4 broadcast_text (FO6 combat). */
const SAY_VOLCOR_AGGRO_1 = 1250;
const SAY_VOLCOR_AGGRO_4 = 1253;
/** Cite: darkshore.cpp:454 ForcedDespawn(1000) after stealth path credit. */
const VOLCOR_STEALTH_DESPAWN_MS = 1000;

/** Cite: bake starter/ender quest 2078; darkshore.cpp:310 NPC_GELKAK = 6667 */
const NPC_GELKAK = 6667;
// Cite: scriptdev2.sql:300 ScriptName='npc_threshwackonator' WHERE entry=6669 Bake killTargets quest 2078.
const NPC_THRESHWACKONATOR = 6669;
/** Cite: darkshore.cpp:307–308 EMOTE_START / SAY_AT_CLOSE script texts. */
const EMOTE_THRESH_START = -1000325;
const SAY_THRESH_AT_CLOSE = -1000326;
/** Cite: darkshore.cpp:311 FACTION_HOSTILE = 14 DoAtEnd SetFactionTemporary before AttackStart. */
const FACTION_HOSTILE = 14;
/** Cite: darkshore.cpp:313–314 gossip menu text ids. */
const TEXT_ID_THRESH_DEFAULT = 718;
const TEXT_ID_KEY_READY = 758;
/** Cite: bake srcItem quest 2078 — Gyromast's Key (7442). */
const ITEM_GYROMASTS_KEY = 7442;

// Cite: bake starter/ender quest 2118 — Tharnariun Treetender (3701). Cite: darkshore.cpp:552
// NPC_THARNARIUN_TREETENDER = 3701
const NPC_THARNARIUN_TREETENDER = 3701;
/** Cite: scriptdev2.sql:303 ScriptName='npc_rabid_bear' WHERE entry=2164 Pre-capture template. */
const NPC_RABID_THISTLE_BEAR = 2164;
/** Cite: darkshore.cpp:551 NPC_CAPTURED_RABID_THISTLE_BEAR = 11836 Bake killTargets quest 2118. */
const NPC_CAPTURED_RABID_THISTLE_BEAR = 11836;
/** Cite: darkshore.cpp:556 SPELL_BEAR_CAPTURED = 9439 SpellHit gate for capture transform + credit. */
const SPELL_BEAR_CAPTURED = 9439;
/** Cite: darkshore.cpp:553 GO_NIGHT_ELVEN_BEAR_TRAP = 111148 Visual spell-focus GO for trap. */
const GO_NIGHT_ELVEN_BEAR_TRAP = 111148;
/** Cite: bake srcItem quest 2118 — Tharnariun's Hope (7586). */
const ITEM_THARNARIUNS_HOPE = 7586;
// Cite: darkshore.cpp:619 m_uiDespawnTimer = 3 * MINUTE * IN_MILLISECONDS Cite: Common.h:113 MINUTE=60;
// :119 IN_MILLISECONDS=1000 → 180000ms.
const RABID_BEAR_DESPAWN_MS = 3 * 60 * 1000;
/** Cite: darkshore.cpp:555 SPELL_RABIES = 3150 combat cast (FO6). */
const SPELL_RABIES = 3150;

/** Cite: bake starterCreatureEntries quest 5321; scriptdev2.sql:298 entry=11218 Kerlonian Evershade. */
const NPC_KERLONIAN = 11218;
/** Cite: darkshore.cpp:79 NPC_LILADRIS = 11219; bake enderCreatureEntries 5321. */
const NPC_LILADRIS = 11219;
/** Cite: darkshore.cpp:55 SAY_KER_START = -1000434 DoScriptText on accept. */
const SAY_KER_START = -1000434;
/** Cite: darkshore.cpp:71 SAY_KER_END = -1000444 after explore credit. */
const SAY_KER_END = -1000444;
/** Cite: darkshore.cpp:73 SPELL_BEAR_FORM = 18309 removed on accept. */
const SPELL_BEAR_FORM = 18309;
/** Cite: darkshore.cpp:74 SPELL_SLEEP_VISUAL = 25148 follower sleep (FO6). */
const SPELL_SLEEP_VISUAL = 25148;
/** Cite: darkshore.cpp:75 SPELL_AWAKEN = 17536; spell_awaken_kerlonian AI_EVENT_CUSTOM_A. */
const SPELL_AWAKEN = 17536;
/** Cite: bake itemTargets quest 5321 — Horn of Awakening (13536). */
const ITEM_HORN_OF_AWAKENING = 13536;

/** Cite: ScriptDevAIMgr.h:55 FACTION_ESCORT_A_PASSIVE = 774 Remtravel SetFactionTemporary on accept. */
const FACTION_ESCORT_A_PASSIVE = 774;
// Cite: ScriptDevAIMgr.h:48 FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231 Therylune SetFactionTemporary on accept.
const FACTION_ESCORT_A_NEUTRAL_ACTIVE = 231;
// Cite: ScriptDevAIMgr.h:52 FACTION_ESCORT_N_FRIEND_PASSIVE = 290 Kerlonian StartFollow faction argument.
const FACTION_ESCORT_N_FRIEND_PASSIVE = 290;
/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:582 TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20 */
const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;
// Cite: darkshore.cpp:535 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x01 | 0x20 =
// 0x21
const THERYLUNE_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;
/** Cite: Unit.h:477 UNIT_FLAG_IMMUNE_TO_NPC = 0x00000200 Kerlonian RemoveFlag on accept. */
const UNIT_FLAG_IMMUNE_TO_NPC = 0x00000200;
/** Cite: Unit.h:97 UNIT_STAND_STATE_STAND = 0 (opcodes.ts re-export) */
const UNIT_STAND_STATE_STAND_DARKSHORE = UNIT_STAND_STATE_STAND;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_prospector_remtravel — quest 731: temporary passive faction, then escort path
// 2917; WP38 carries the explore credit. Cite: darkshore.cpp:289–299, :271–285.
function runRemtravelAccept(): DbScriptIntent[] {
  const citeFaction =
    'darkshore.cpp:294 SetFactionTemporary(FACTION_ESCORT_A_PASSIVE, TEMPFACTION_RESTORE_RESPAWN)';
  const citeEscort =
    `darkshore.cpp:295 npc_prospector_remtravel (${NPC_PROSPECTOR_REMTRAVEL}) ` +
    `npc_escortAI::Start(false, player, quest, false, false, REMTRAVEL_ESCORT_PATH=${REMTRAVEL_ESCORT_PATH}) ` +
    '- FO6 degraded finishEscort';
  const citeAggro =
    `darkshore.cpp:251–261 Aggro urand SAY_REM_AGGRO_1..6=${SAY_REM_AGGRO_1}–${SAY_REM_AGGRO_6} - FO6 combat`;
  const citeCredit =
    'darkshore.cpp:275–278 WP38 RewardPlayerAndGroupAtEventExplored(731) - FO6 finishEscort';
  const citeEnd =
    'darkshore.cpp:279–283 WP39 MoveIdle + End - FO6';
  const citeEnder =
    `bake enderCreatureEntries NPC_ARCHAEOLOGIST_HOLLEE=${NPC_ARCHAEOLOGIST_HOLLEE} after WP38 explore credit`;
  return [
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_A_PASSIVE,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest, false, false, path=${REMTRAVEL_ESCORT_PATH}) ` +
        `npc_prospector_remtravel (${NPC_PROSPECTOR_REMTRAVEL}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `Aggro SAY_REM_AGGRO_1..6 (${SAY_REM_AGGRO_1}–${SAY_REM_AGGRO_6}) - FO6 combat`,
      cite: citeAggro,
    },
    {
      kind: 'skip',
      reason:
        'WP38 RewardPlayerAndGroupAtEventExplored(731) - FO6 finishEscort',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: 'WP39 MoveIdle + End - FO6',
      cite: citeEnd,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_ARCHAEOLOGIST_HOLLEE (${NPC_ARCHAEOLOGIST_HOLLEE}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_therylune — quest 945 Therylune's Escape: escort start, temporary neutral
// faction and the start line; WP18 carries the explore credit. Cite: darkshore.cpp:528–541.
function runTheryluneAccept(): DbScriptIntent[] {
  const citeTalk =
    `darkshore.cpp:536 npc_therylune (${NPC_THERYLUNE}) ` +
    `DoScriptText(SAY_THERYLUNE_START=${SAY_THERYLUNE_START})`;
  const citeFaction =
    'darkshore.cpp:535 SetFactionTemporary(FACTION_ESCORT_A_NEUTRAL_ACTIVE, ' +
    'TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC)';
  const citeEscort =
    `darkshore.cpp:534 npc_therylune (${NPC_THERYLUNE}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeCredit =
    'darkshore.cpp:510–512 WP18 RewardPlayerAndGroupAtEventExplored(945) - FO6 finishEscort';
  const citeFinish =
    `darkshore.cpp:514–518 WP20 DoScriptText(SAY_THERYLUNE_FINISH=${SAY_THERYLUNE_FINISH}) + SetRun - FO6`;
  const citeEnder =
    `bake enderCreatureEntries NPC_THERYSIL=${NPC_THERYSIL} after WP18 explore credit`;
  return [
    {
      kind: 'talk',
      textId: SAY_THERYLUNE_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_A_NEUTRAL_ACTIVE,
      flags: THERYLUNE_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_therylune (${NPC_THERYLUNE}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        'WP18 RewardPlayerAndGroupAtEventExplored(945) - FO6 finishEscort',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `WP20 SAY_THERYLUNE_FINISH (${SAY_THERYLUNE_FINISH}) + SetRun - FO6`,
      cite: citeFinish,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_THERYSIL (${NPC_THERYSIL}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_volcor — quest 994 Escape Through Force: escort path 2 from Volcor, with WP15
// carrying the explore credit. Cite: darkshore.cpp:468–477, :442–464.
function runVolcorForceAccept(): DbScriptIntent[] {
  const citeEscort =
    `darkshore.cpp:438–439,468–474 npc_volcor (${NPC_VOLCOR}) ` +
    `StartEscort force Start(false, player, quest, false, false, VOLCOR_PATH_02=${VOLCOR_PATH_02}) ` +
    '- FO6 degraded finishEscort';
  const citeAggro =
    `darkshore.cpp:417–426 Aggro urand SAY_AGGRO_1..4=${SAY_VOLCOR_AGGRO_1}–${SAY_VOLCOR_AGGRO_4} - FO6 combat`;
  const citeCredit =
    'darkshore.cpp:457–462 WP15 RewardPlayerAndGroupAtEventExplored(994) + End - FO6 finishEscort';
  const citeEnder =
    `bake enderCreatureEntries NPC_TERENTHIS=${NPC_TERENTHIS} after WP15 explore credit`;
  return [
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest, false, false, path=${VOLCOR_PATH_02}) ` +
        `npc_volcor (${NPC_VOLCOR}) force - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `Aggro SAY_AGGRO_1..4 (${SAY_VOLCOR_AGGRO_1}–${SAY_VOLCOR_AGGRO_4}) - FO6 combat`,
      cite: citeAggro,
    },
    {
      kind: 'skip',
      reason:
        'WP15 RewardPlayerAndGroupAtEventExplored(994) + End - FO6 finishEscort',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_TERENTHIS (${NPC_TERENTHIS}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_volcor — quest 995 Escape Through Stealth: escort path 1 at a run, with WP3
// carrying the credit then a despawn. Cite: darkshore.cpp:468–477, :446–455.
function runVolcorStealthAccept(): DbScriptIntent[] {
  const citeEscort =
    `darkshore.cpp:434–436,468–474 npc_volcor (${NPC_VOLCOR}) ` +
    `StartEscort stealth Start(true, player, quest, false, false, VOLCOR_PATH_01=${VOLCOR_PATH_01}) ` +
    '- FO6 degraded finishEscort';
  const citeCredit =
    `darkshore.cpp:446–454 WP3 RewardPlayerAndGroupAtEventExplored(995) + ` +
    `ForcedDespawn(${VOLCOR_STEALTH_DESPAWN_MS}) - FO6 finishEscort`;
  const citeEnder =
    `bake enderCreatureEntries NPC_TERENTHIS=${NPC_TERENTHIS} after WP3 explore credit`;
  return [
    {
      kind: 'skip',
      reason:
        `escort Start(true, player, quest, false, false, path=${VOLCOR_PATH_01}) ` +
        `npc_volcor (${NPC_VOLCOR}) stealth - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP3 RewardPlayerAndGroupAtEventExplored(995) + ForcedDespawn(${VOLCOR_STEALTH_DESPAWN_MS}) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_TERENTHIS (${NPC_TERENTHIS}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_kerlonian — quest 5321 The Sleeper Has Awakened: drop bear form, stand, clear
// IMMUNE_TO_NPC and follow; sighting Liladris credits it. Cite: darkshore.cpp:197–212, :102–120.
function runKerlonianAccept(): DbScriptIntent[] {
  const citeAura =
    `darkshore.cpp:203 RemoveAurasDueToSpell(SPELL_BEAR_FORM=${SPELL_BEAR_FORM})`;
  const citeStand =
    'darkshore.cpp:204 SetStandState(UNIT_STAND_STATE_STAND)';
  const citeFlags =
    'darkshore.cpp:205 RemoveFlag(UNIT_FIELD_FLAGS, UNIT_FLAG_IMMUNE_TO_NPC)';
  const citeTalk =
    `darkshore.cpp:206 npc_kerlonian (${NPC_KERLONIAN}) DoScriptText(SAY_KER_START=${SAY_KER_START})`;
  const citeFollow =
    `darkshore.cpp:207 StartFollow(player, FACTION_ESCORT_N_FRIEND_PASSIVE=${FACTION_ESCORT_N_FRIEND_PASSIVE}, quest) ` +
    `npc_kerlonian (${NPC_KERLONIAN}) - FO6 degraded FollowerAI finishEscort`;
  const citeSleep =
    `darkshore.cpp:132–165 SetSleeping SPELL_SLEEP_VISUAL=${SPELL_SLEEP_VISUAL}; ` +
    `SPELL_AWAKEN=${SPELL_AWAKEN} ClearSleeping (Horn ${ITEM_HORN_OF_AWAKENING}) - FO6`;
  const citeCredit =
    `darkshore.cpp:106–118 LOS NPC_LILADRIS=${NPC_LILADRIS} ` +
    `RewardPlayerAndGroupAtEventExplored(5321) + SAY_KER_END=${SAY_KER_END} - FO6 finishEscort`;
  const citeEnder =
    `bake enderCreatureEntries NPC_LILADRIS=${NPC_LILADRIS} after LOS explore credit`;
  const priorFlags = UNIT_FLAG_IMMUNE_TO_NPC;
  const resultFlags = priorFlags & ~UNIT_FLAG_IMMUNE_TO_NPC;
  return [
    {
      kind: 'remove_aura',
      spellId: SPELL_BEAR_FORM,
      mode: 'full',
      cite: citeAura,
    },
    {
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_STAND_DARKSHORE,
      cite: citeStand,
    },
    {
      kind: 'modify_unit_flags',
      flag: UNIT_FLAG_IMMUNE_TO_NPC,
      changeFlag: UNIT_FLAG_CHANGE_REMOVE,
      mode: 'remove',
      resultFlags,
      cite: citeFlags,
    },
    {
      kind: 'talk',
      textId: SAY_KER_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason:
        `StartFollow(player, FACTION_ESCORT_N_FRIEND_PASSIVE=${FACTION_ESCORT_N_FRIEND_PASSIVE}, quest) ` +
        `npc_kerlonian (${NPC_KERLONIAN}) - FO6 degraded FollowerAI finishEscort`,
      cite: citeFollow,
    },
    {
      kind: 'skip',
      reason:
        `sleep SPELL_SLEEP_VISUAL (${SPELL_SLEEP_VISUAL}) + awaken SPELL_AWAKEN (${SPELL_AWAKEN}) ` +
        `Horn ${ITEM_HORN_OF_AWAKENING} - FO6`,
      cite: citeSleep,
    },
    {
      kind: 'skip',
      reason:
        `LOS NPC_LILADRIS (${NPC_LILADRIS}) RewardPlayerAndGroupAtEventExplored(5321) + ` +
        `SAY_KER_END (${SAY_KER_END}) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_LILADRIS (${NPC_LILADRIS}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// ── frame residuals (no pQuestAcceptNPC) ─────────────────────────────────────

// GossipSelect_npc_threshwackonator and its follower end — quest 2078: turning the key starts the
// follow, and reaching Gelkak flips it hostile. Cite: darkshore.cpp:355–382, :325–347.
function runThreshwackonatorResidual(): DbScriptIntent[] {
  const citeGossip =
    `darkshore.cpp:355–366 GossipHello incomplete ${QUEST_GYROMAST_REV}: ` +
    `TEXT_ID_KEY_READY=${TEXT_ID_KEY_READY} else TEXT_ID_THRESH_DEFAULT=${TEXT_ID_THRESH_DEFAULT} ` +
    `npc_threshwackonator (${NPC_THRESHWACKONATOR})`;
  const citeSelect =
    `darkshore.cpp:368–382 GossipSelect TURN_KEY: CLOSE + DoScriptText(EMOTE_START=${EMOTE_THRESH_START}) + StartFollow(player)`;
  const citeEnd =
    `darkshore.cpp:325–347 LOS NPC_GELKAK=${NPC_GELKAK} 10.0f: ` +
    `DoScriptText(SAY_AT_CLOSE=${SAY_THRESH_AT_CLOSE}); ` +
    `SetFactionTemporary(FACTION_HOSTILE=${FACTION_HOSTILE}); AttackStart(holder); SetFollowComplete - FO6 follow end`;
  const citeKill =
    `bake killTargets NPC_THRESHWACKONATOR=${NPC_THRESHWACKONATOR}×1 after hostile flip; ` +
    `srcItem ITEM_GYROMASTS_KEY=${ITEM_GYROMASTS_KEY}`;
  return [
    {
      kind: 'skip',
      reason:
        `GossipHello incomplete 2078 TEXT_ID_KEY_READY (${TEXT_ID_KEY_READY}) on ` +
        `npc_threshwackonator (${NPC_THRESHWACKONATOR})`,
      cite: citeGossip,
    },
    {
      kind: 'talk',
      textId: EMOTE_THRESH_START,
      stringTemplateId: 0,
      cite: citeSelect,
    },
    {
      kind: 'skip',
      reason:
        `GossipSelect StartFollow(player) npc_threshwackonator (${NPC_THRESHWACKONATOR}) - FO6 follower`,
      cite: citeSelect,
    },
    {
      kind: 'skip',
      reason:
        `LOS Gelkak (${NPC_GELKAK}) SAY_AT_CLOSE (${SAY_THRESH_AT_CLOSE}) + ` +
        `FACTION_HOSTILE (${FACTION_HOSTILE}) AttackStart - FO6 follow end`,
      cite: citeEnd,
    },
    {
      kind: 'skip',
      reason:
        `kill NPC_THRESHWACKONATOR (${NPC_THRESHWACKONATOR})×1 after hostile flip; key ${ITEM_GYROMASTS_KEY}`,
      cite: citeKill,
    },
  ];
}

// npc_rabid_bear SpellHit capture — quest 2118 Plagued Lands: the trap spell re-templates the bear,
// credits the kill and makes it follow. Cite: darkshore.cpp:598–620.
function runRabidBearCapture(): DbScriptIntent[] {
  const citeSpell =
    `darkshore.cpp:598–600 SpellHit SPELL_BEAR_CAPTURED=${SPELL_BEAR_CAPTURED} incomplete ${QUEST_PLAGUED_LANDS}`;
  const citeTrap =
    `darkshore.cpp:553 GO_NIGHT_ELVEN_BEAR_TRAP=${GO_NIGHT_ELVEN_BEAR_TRAP}; ` +
    `bake srcItem ITEM_THARNARIUNS_HOPE=${ITEM_THARNARIUNS_HOPE}`;
  const citeEntry =
    `darkshore.cpp:606 UpdateEntry(NPC_CAPTURED_RABID_THISTLE_BEAR=${NPC_CAPTURED_RABID_THISTLE_BEAR}) ` +
    `from NPC_RABID_THISTLE_BEAR=${NPC_RABID_THISTLE_BEAR}`;
  const citeCredit =
    `darkshore.cpp:608–610 KilledMonsterCredit(NPC_CAPTURED_RABID_THISTLE_BEAR=${NPC_CAPTURED_RABID_THISTLE_BEAR})`;
  const citeFollow =
    'darkshore.cpp:611 MoveFollow(caster, PET_FOLLOW_DIST, PET_FOLLOW_ANGLE) - FO6 follow';
  const citeDespawn =
    `darkshore.cpp:619 m_uiDespawnTimer=${RABID_BEAR_DESPAWN_MS}ms (3*MINUTE*IN_MILLISECONDS) ForcedDespawn - FO6`;
  const citeCombat =
    `darkshore.cpp:638–642 SPELL_RABIES=${SPELL_RABIES} combat cast - FO6`;
  const citeEnder =
    `bake enderCreatureEntries NPC_THARNARIUN_TREETENDER=${NPC_THARNARIUN_TREETENDER} after capture credit`;
  return [
    {
      kind: 'skip',
      reason:
        `SpellHit SPELL_BEAR_CAPTURED (${SPELL_BEAR_CAPTURED}) on Rabid Thistle Bear (${NPC_RABID_THISTLE_BEAR}) incomplete 2118`,
      cite: citeSpell,
    },
    {
      kind: 'skip',
      reason:
        `trap GO ${GO_NIGHT_ELVEN_BEAR_TRAP} + srcItem Tharnariun's Hope (${ITEM_THARNARIUNS_HOPE})`,
      cite: citeTrap,
    },
    {
      kind: 'update_template',
      oldEntry: NPC_RABID_THISTLE_BEAR,
      newTemplate: NPC_CAPTURED_RABID_THISTLE_BEAR,
      changed: true,
      cite: citeEntry,
    },
    {
      kind: 'kill_credit',
      creatureEntry: NPC_CAPTURED_RABID_THISTLE_BEAR,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: 'MoveFollow caster PET_FOLLOW_DIST/ANGLE - FO6 follow',
      cite: citeFollow,
    },
    {
      kind: 'despawn_self',
      despawnDelay: RABID_BEAR_DESPAWN_MS,
      cite: citeDespawn,
    },
    {
      kind: 'skip',
      reason: `SPELL_RABIES (${SPELL_RABIES}) combat - FO6`,
      cite: citeCombat,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_THARNARIUN_TREETENDER (${NPC_THARNARIUN_TREETENDER}) after capture credit`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/darkshore.cpp. Accept hooks for 5321, 731, 994/995 and 945; residuals for
// the Threshwackonator gossip-follow (2078) and the rabid bear SpellHit (2118).
export function runDarkshore(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_ABSENT_MINDED_PT2) return runRemtravelAccept();
    if (questId === QUEST_ID_THERYLUNE_ESCAPE) return runTheryluneAccept();
    if (questId === QUEST_ESCAPE_THROUGH_FORCE) return runVolcorForceAccept();
    if (questId === QUEST_ESCAPE_THROUGH_STEALTH) return runVolcorStealthAccept();
    if (questId === QUEST_SLEEPER_AWAKENED) return runKerlonianAccept();
    return [];
  }
  if (phase === 'frame' || phase === 'complete') {
    if (questId === QUEST_GYROMAST_REV) return runThreshwackonatorResidual();
    if (questId === QUEST_PLAGUED_LANDS) return runRabidBearCapture();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/darkshore'` in registry.ts.
export const DARKSHORE_REGISTRY: Record<string | number, DarkshoreQuestScriptEntry> = {
  'kalimdor/darkshore': {
    family: 'kalimdor/darkshore',
    questIds: [
      QUEST_ABSENT_MINDED_PT2,
      QUEST_ID_THERYLUNE_ESCAPE,
      QUEST_ESCAPE_THROUGH_FORCE,
      QUEST_ESCAPE_THROUGH_STEALTH,
      QUEST_GYROMAST_REV,
      QUEST_PLAGUED_LANDS,
      QUEST_SLEEPER_AWAKENED,
    ],
    hooks: ['accept', 'frame', 'complete'],
    cite: 'kalimdor/darkshore.cpp:197–212,289–299,355–382,468–477,528–541,598–620',
    run: runDarkshore,
  },
  [QUEST_ABSENT_MINDED_PT2]: {
    family: 'kalimdor/darkshore',
    questId: QUEST_ABSENT_MINDED_PT2,
    questIds: [QUEST_ABSENT_MINDED_PT2],
    hooks: ['accept'],
    cite: 'darkshore.cpp:289–299 QuestAccept_npc_prospector_remtravel',
    run: runDarkshore,
  },
  [QUEST_ID_THERYLUNE_ESCAPE]: {
    family: 'kalimdor/darkshore',
    questId: QUEST_ID_THERYLUNE_ESCAPE,
    questIds: [QUEST_ID_THERYLUNE_ESCAPE],
    hooks: ['accept'],
    cite: 'darkshore.cpp:528–541 QuestAccept_npc_therylune',
    run: runDarkshore,
  },
  [QUEST_ESCAPE_THROUGH_FORCE]: {
    family: 'kalimdor/darkshore',
    questId: QUEST_ESCAPE_THROUGH_FORCE,
    questIds: [QUEST_ESCAPE_THROUGH_FORCE],
    hooks: ['accept'],
    cite: 'darkshore.cpp:468–477 QuestAccept_npc_volcor force path',
    run: runDarkshore,
  },
  [QUEST_ESCAPE_THROUGH_STEALTH]: {
    family: 'kalimdor/darkshore',
    questId: QUEST_ESCAPE_THROUGH_STEALTH,
    questIds: [QUEST_ESCAPE_THROUGH_STEALTH],
    hooks: ['accept'],
    cite: 'darkshore.cpp:468–477 QuestAccept_npc_volcor stealth path',
    run: runDarkshore,
  },
  [QUEST_GYROMAST_REV]: {
    family: 'kalimdor/darkshore',
    questId: QUEST_GYROMAST_REV,
    questIds: [QUEST_GYROMAST_REV],
    hooks: ['frame', 'complete'],
    cite: 'darkshore.cpp:355–382,325–347 GossipSelect + DoAtEnd threshwackonator',
    run: runDarkshore,
  },
  [QUEST_PLAGUED_LANDS]: {
    family: 'kalimdor/darkshore',
    questId: QUEST_PLAGUED_LANDS,
    questIds: [QUEST_PLAGUED_LANDS],
    hooks: ['frame', 'complete'],
    cite: 'darkshore.cpp:598–620 npc_rabid_bear SpellHit capture residual',
    run: runDarkshore,
  },
  [QUEST_SLEEPER_AWAKENED]: {
    family: 'kalimdor/darkshore',
    questId: QUEST_SLEEPER_AWAKENED,
    questIds: [QUEST_SLEEPER_AWAKENED],
    hooks: ['accept'],
    cite: 'darkshore.cpp:197–212 QuestAccept_npc_kerlonian',
    run: runDarkshore,
  },
};
