// QI4 — kalimdor/the_barrens residuals, extracted for the 1500-line ratchet: accept hooks for 898,
// 863 and 4021, plus the Affray areatrigger for 1719. Cite: kalimdor/the_barrens.cpp.

import type { DbScriptIntent } from './types.ts';
import { UNIT_STAND_STATE_STAND } from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface TheBarrensQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: the_barrens.cpp:524 QUEST_ESCAPE = 863 Escort Wizzlecrank's Shredder to Ratchet; post-event explore
// credit.
export const QUEST_ESCAPE = 863;
// Cite: the_barrens.cpp:55 QUEST_FREE_FROM_HOLD = 898 Escort Gilthares Firebough to Captain Brightsun; WP54
// explore credit.
export const QUEST_FREE_FROM_HOLD = 898;
// Cite: the_barrens.cpp:289 QUEST_AFFRAY = 1719 AreaTrigger_at_twiggy_flathead residual — Fray Island
// warrior challenge.
export const QUEST_AFFRAY = 1719;
// Cite: the_barrens.cpp:756 QUEST_COUNTERATTACK = 4021 Accept/gossip starts Kolkar counterattack event;
// item 11227 turn-in.
export const QUEST_COUNTERATTACK = 4021;

// Cite: bake starterCreatureEntries quest 863; scriptdev2 npc_wizzlecranks_shredder Wizzlecrank's Shredder.
const NPC_WIZZLECRANK_SHREDDER = 3439;
/** Cite: bake enderCreatureEntries quest 863 — Sputtervalve. */
const NPC_SPUTTERVALVE = 3442;
// Cite: the_barrens.cpp:526 NPC_PILOT_WIZZ = 3451 Post-event pilot summon when shredder "dies" stand-state.
const NPC_PILOT_WIZZ = 3451;
/** Cite: the_barrens.cpp:527 NPC_MERCENARY = 3282 WP18 ambush. */
const NPC_MERCENARY = 3282;

/** Cite: bake starterCreatureEntries quest 898; scriptdev2 npc_gilthares Gilthares Firebough. */
const NPC_GILTHARES = 3465;
/** Cite: bake enderCreatureEntries quest 898 — Captain Thalo'thas Brightsun. */
const NPC_CAPTAIN_BRIGHTSUN = 3339;

/** Cite: the_barrens.cpp:285 NPC_TWIGGY = 6248 Affray event controller near Fray Island grate. */
const NPC_TWIGGY = 6248;
/** Cite: the_barrens.cpp:286 NPC_BIG_WILL = 6238 Bake killTargets[0] quest 1719. */
const NPC_BIG_WILL = 6238;
/** Cite: the_barrens.cpp:287 NPC_AFFRAY_CHALLENGER = 6240 */
const NPC_AFFRAY_CHALLENGER = 6240;
/** Cite: bake starter/enderCreatureEntries quest 1719 — Klannoc Macleod. */
const NPC_KLANNOC = 6236;

/** Cite: the_barrens.cpp:762 NPC_REGTHAR_DEATHGATE = 3389 Bake starter/enderCreatureEntries quest 4021. */
const NPC_REGTHAR_DEATHGATE = 3389;
// Cite: the_barrens.cpp:763 NPC_WARLORD_KROMZAR = 9456 Spawned after KILL_LIMIT Kolkar deaths; drops Piece
// of Krom'zar's Banner.
const NPC_WARLORD_KROMZAR = 9456;
/** Cite: the_barrens.cpp:764–767 wave templates. */
const NPC_HORDE_DEFENDER = 9457;
const NPC_HORDE_AXE_THROWER = 9458;
const NPC_KOLKAR_INVADER = 9524;
const NPC_KOLKAR_STORMSEER = 9523;

/** Cite: bake itemTargets quest 4021 — Piece of Krom'zar's Banner. */
const ITEM_KROMZAR_BANNER = 11227;

/** Cite: the_barrens.cpp:43–53 Gilthares script texts. */
const SAY_GIL_START = -1000370;
const SAY_GIL_AT_LAST = -1000371;
const SAY_GIL_PROCEED = -1000372;
const SAY_GIL_FREEBOOTERS = -1000373;
const SAY_GIL_AGGRO_1 = -1000374;
const SAY_GIL_AGGRO_2 = -1000375;
const SAY_GIL_AGGRO_3 = -1000376;
const SAY_GIL_AGGRO_4 = -1000377;
const SAY_GIL_ALMOST = -1000378;
const SAY_GIL_SWEET = -1000379;
const SAY_GIL_FREED = -1000380;

/** Cite: the_barrens.cpp:515–522 Wizzlecrank script texts. */
const SAY_WIZZ_START = -1000298;
const SAY_WIZZ_STARTUP1 = -1000299;
const SAY_WIZZ_STARTUP2 = -1000300;
const SAY_WIZZ_MERCENARY = -1000301;
const SAY_WIZZ_PROGRESS_1 = -1000302;
const SAY_WIZZ_PROGRESS_2 = -1000303;
const SAY_WIZZ_PROGRESS_3 = -1000304;
const SAY_WIZZ_END = -1000305;

/** Cite: the_barrens.cpp:279–283 Twiggy Affray script texts. */
const SAY_BIG_WILL_READY = -1000123;
const SAY_TWIGGY_BEGIN = -1000124;
const SAY_TWIGGY_FRAY = -1000125;
const SAY_TWIGGY_DOWN = -1000126;
const SAY_TWIGGY_OVER = -1000127;

/** Cite: the_barrens.cpp:758–760 Regthar texts. */
const SAY_START_REGTHAR = -1010001;
const SAY_DEFENDER = -1010002;
const YELL_RETREAT = -1010003;

// Cite: ScriptDevAIMgr.h:49 FACTION_ESCORT_H_NEUTRAL_ACTIVE = 232 Gilthares SetFactionTemporary on accept.
const FACTION_ESCORT_H_NEUTRAL_ACTIVE = 232;
/** Cite: the_barrens.cpp:525 FACTION_RATCHET = 637 Wizzlecrank SetFactionTemporary on accept. */
const FACTION_RATCHET = 637;
/** Cite: the_barrens.cpp:291–293 Affray factions. */
const FACTION_FRIENDLY = 35;
const FACTION_HOSTILE_WILL = 32;
const FACTION_HOSTILE_CHALLENGER = 14;

/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:582 TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20 */
const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;
// Cite: the_barrens.cpp:132 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x01 | 0x20 =
// 0x21 (Gilthares)
const GILTHARES_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;
/** Cite: the_barrens.cpp:654 TEMPFACTION_RESTORE_RESPAWN only (Wizzlecrank) */
const WIZZLE_TEMP_FACTION_FLAGS = TEMPFACTION_RESTORE_RESPAWN;

/** Cite: Unit.h:97 UNIT_STAND_STATE_STAND = 0 (opcodes.ts re-export) */
const UNIT_STAND_STATE_STAND_BARRENS = UNIT_STAND_STATE_STAND;
// Cite: Unit.h:104 UNIT_STAND_STATE_DEAD = 7 Wizzlecrank Reset while not escorting / JustSummoned pilot.
const UNIT_STAND_STATE_DEAD = 7;

/** Cite: Object.h:45 TEMPSPAWN_CORPSE_TIMED_DESPAWN = 3 Regthar wave summons 40 * IN_MILLISECONDS. */
const TEMPSPAWN_CORPSE_TIMED_DESPAWN = 3;
/** Cite: Object.h:46 TEMPSPAWN_TIMED_DESPAWN = 4 Wizzle pilot summon 180000ms. */
const TEMPSPAWN_TIMED_DESPAWN = 4;
/** Cite: Object.h:47 TEMPSPAWN_TIMED_OOC_DESPAWN = 5 WP18 mercenary 120000ms. */
const TEMPSPAWN_TIMED_OOC_DESPAWN = 5;
// Cite: Object.h:50 TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN = 8 Affray challengers 600000ms / Big Will
// 300000ms.
const TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN = 8;

/** Cite: the_barrens.cpp:569 WP18 mercenary despawn 120000 */
const MERCENARY_DESPAWN_MS = 120000;
/** Cite: the_barrens.cpp:630 pilot despawn 180000 */
const PILOT_DESPAWN_MS = 180000;
/** Cite: the_barrens.cpp:536/552/636 post-event timer 1000 then 5000 */
const WIZZ_POST_EVENT_START_MS = 1000;
const WIZZ_POST_EVENT_INTERVAL_MS = 5000;
/** Cite: the_barrens.cpp:569–572 WP18 SummonCreature mercenary positions. */
const MERCENARY_SPAWN = [
  { x: 1128.489, y: -3037.611, z: 92.701, o: 1.472 },
  { x: 1160.172, y: -2980.168, z: 97.313, o: 3.69 },
] as const;

/** Cite: the_barrens.cpp:295 MAX_CHALLENGERS = 6 */
const MAX_CHALLENGERS = 6;
/** Cite: the_barrens.cpp:298–308 aAffrayChallengerLoc (6 challengers + Big Will spawn/move). */
const AFFRAY_CHALLENGER_LOC = [
  { x: -1683.0, y: -4326.0, z: 2.79, o: 0.0 },
  { x: -1682.0, y: -4329.0, z: 2.79, o: 0.0 },
  { x: -1683.0, y: -4330.0, z: 2.79, o: 0.0 },
  { x: -1680.0, y: -4334.0, z: 2.79, o: 1.49 },
  { x: -1674.0, y: -4326.0, z: 2.79, o: 3.49 },
  { x: -1677.0, y: -4334.0, z: 2.79, o: 1.66 },
] as const;
/** Cite: the_barrens.cpp:306 Big Will spawn loc */
const BIG_WILL_SPAWN = { x: -1713.79, y: -4342.09, z: 6.05, o: 6.15 } as const;
/** Cite: the_barrens.cpp:307 Big Will move loc */
const BIG_WILL_MOVE = { x: -1682.31, y: -4329.68, z: 2.78, o: 0.0 } as const;
/** Cite: the_barrens.cpp:372 challenger despawn 600000 */
const AFFRAY_CHALLENGER_DESPAWN_MS = 600000;
/** Cite: the_barrens.cpp:471 Big Will TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN 300000 */
const BIG_WILL_DESPAWN_MS = 300000;
/** Cite: SharedDefines.h:762 EMOTE_ONESHOT_ROAR = 15 Affray JustSummoned / SetChallengerReady. */
const EMOTE_ONESHOT_ROAR = 15;
/** Cite: bake exploreTriggers quest 1719 id 522 (AT_twiggy_flathead). */
const AT_TWIGGY_FLATHEAD = 522;
/** Cite: the_barrens.cpp:494 GetClosestCreatureWithEntry(NPC_TWIGGY, 30.0f) */
const TWIGGY_SEARCH_RADIUS = 30;

/** Cite: the_barrens.cpp:769 KILL_LIMIT = 20 Kolkar kills before Warlord Kromzar spawn. */
const KILL_LIMIT = 20;
/** Cite: the_barrens.cpp:773–775 respawn times (seconds). */
const COUNTERATTACK_RESPAWN_TIME_HORDE = 12;
const COUNTERATTACK_RESPAWN_TIME_HORDE_INC = 1;
const COUNTERATTACK_RESPAWN_TIME_KOLKAR = 10;
// Cite: Common.h:113 MINUTE = 60; :119 IN_MILLISECONDS = 1000 the_barrens.cpp:954 m_eventTimer = 20 *
// MINUTE * IN_MILLISECONDS
const MINUTE = 60;
const IN_MILLISECONDS = 1000;
const COUNTERATTACK_EVENT_MS = 20 * MINUTE * IN_MILLISECONDS;
/** Cite: the_barrens.cpp:871 TEMPSPAWN_CORPSE_TIMED_DESPAWN, 40 * IN_MILLISECONDS */
const REGTHAR_CORPSE_DESPAWN_MS = 40 * IN_MILLISECONDS;
/** Cite: the_barrens.cpp:784–819 spawn point vector sizes (Horde 7 / Kromzar 3 / Kolkar 15). */
const HORDE_SPAWN_COUNT = 7;
const KOLKAR_SPAWN_COUNT = 15;
/** Cite: the_barrens.cpp:957 SpawnAllSlot(..., moveToWP=5) for Horde. */
const HORDE_MOVE_TO_WP = 5;
/** Cite: the_barrens.cpp:797–800 spawnPointsKromzar (Warlord + bodyguards). */
const KROMZAR_SPAWN = [
  { entry: NPC_KOLKAR_INVADER, x: -281.19, y: -1855.54, z: 92.58, o: 4.85 },
  { entry: NPC_WARLORD_KROMZAR, x: -283.66, y: -1858.45, z: 92.47, o: 4.85 },
  { entry: NPC_KOLKAR_STORMSEER, x: -286.5, y: -1856.18, z: 92.44, o: 4.85 },
] as const;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_gilthares — quest 898 Free From the Hold: temporary faction, stand, the start
// line and an escort; WP54 carries the explore credit. Cite: the_barrens.cpp:128–141, :71–99.
function runGiltharesAccept(): DbScriptIntent[] {
  const citeFaction =
    `the_barrens.cpp:132 npc_gilthares (${NPC_GILTHARES}) ` +
    `SetFactionTemporary(FACTION_ESCORT_H_NEUTRAL_ACTIVE=${FACTION_ESCORT_H_NEUTRAL_ACTIVE}, ` +
    `TEMPFACTION_RESTORE_RESPAWN|TOGGLE_IMMUNE_TO_NPC=${GILTHARES_TEMP_FACTION_FLAGS})`;
  const citeStand =
    `the_barrens.cpp:133 SetStandState(UNIT_STAND_STATE_STAND=${UNIT_STAND_STATE_STAND_BARRENS})`;
  const citeTalk =
    `the_barrens.cpp:135 DoScriptText(SAY_GIL_START=${SAY_GIL_START})`;
  const citeEscort =
    `the_barrens.cpp:137–138 npc_gilthares (${NPC_GILTHARES}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeWpTalk =
    `the_barrens.cpp:80–94 WP17 SAY_GIL_AT_LAST=${SAY_GIL_AT_LAST} / WP18 ` +
    `SAY_GIL_PROCEED=${SAY_GIL_PROCEED} / WP19 SAY_GIL_FREEBOOTERS=${SAY_GIL_FREEBOOTERS} / ` +
    `WP38 SAY_GIL_ALMOST=${SAY_GIL_ALMOST} / WP48 SAY_GIL_SWEET=${SAY_GIL_SWEET} - FO6`;
  const citeAggro =
    `the_barrens.cpp:102–120 Aggro AREA_MERCHANT_COAST freebooter ` +
    `SAY_GIL_AGGRO_1..4=${SAY_GIL_AGGRO_1}/${SAY_GIL_AGGRO_2}/${SAY_GIL_AGGRO_3}/` +
    `${SAY_GIL_AGGRO_4} - FO6 combat`;
  const citeCredit =
    `the_barrens.cpp:95–98 WP54 DoScriptText(SAY_GIL_FREED=${SAY_GIL_FREED}) + ` +
    'RewardPlayerAndGroupAtEventExplored(898) - FO6 finishEscort';
  const citeEnder =
    `bake enderCreatureEntries NPC_CAPTAIN_BRIGHTSUN=${NPC_CAPTAIN_BRIGHTSUN} after explore credit`;
  return [
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_H_NEUTRAL_ACTIVE,
      flags: GILTHARES_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_STAND_BARRENS,
      cite: citeStand,
    },
    {
      kind: 'talk',
      textId: SAY_GIL_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_gilthares (${NPC_GILTHARES}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP17–48 escort talks SAY_GIL_AT_LAST/PROCEED/FREEBOOTERS/ALMOST/SWEET ` +
        `(${SAY_GIL_AT_LAST}/${SAY_GIL_PROCEED}/${SAY_GIL_FREEBOOTERS}/${SAY_GIL_ALMOST}/` +
        `${SAY_GIL_SWEET}) - FO6`,
      cite: citeWpTalk,
    },
    {
      kind: 'skip',
      reason:
        `Aggro freebooter SAY_GIL_AGGRO (${SAY_GIL_AGGRO_1}..${SAY_GIL_AGGRO_4}) - FO6 combat`,
      cite: citeAggro,
    },
    {
      kind: 'skip',
      reason:
        `WP54 SAY_GIL_FREED (${SAY_GIL_FREED}) + RewardPlayerAndGroupAtEventExplored(898) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `turn-in NPC_CAPTAIN_BRIGHTSUN (${NPC_CAPTAIN_BRIGHTSUN}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_wizzlecranks_shredder — quest 863 The Escape: the start line, Ratchet faction and
// a run escort; the post-event phases credit and summon the pilot. Cite: the_barrens.cpp:649–660.
function runWizzlecrankAccept(): DbScriptIntent[] {
  const citeTalk =
    `the_barrens.cpp:653 npc_wizzlecranks_shredder (${NPC_WIZZLECRANK_SHREDDER}) ` +
    `DoScriptText(SAY_START=${SAY_WIZZ_START})`;
  const citeFaction =
    `the_barrens.cpp:654 SetFactionTemporary(FACTION_RATCHET=${FACTION_RATCHET}, ` +
    `TEMPFACTION_RESTORE_RESPAWN=${WIZZLE_TEMP_FACTION_FLAGS})`;
  const citeEscort =
    `the_barrens.cpp:656–657 npc_wizzlecranks_shredder (${NPC_WIZZLECRANK_SHREDDER}) ` +
    'npc_escortAI::Start(true, player, quest) - FO6 degraded finishEscort';
  const citeWp =
    `the_barrens.cpp:561–577 WP1 SAY_STARTUP1=${SAY_WIZZ_STARTUP1}; WP10 SetRun(false); ` +
    `WP18 SummonCreature NPC_MERCENARY=${NPC_MERCENARY} @ ${MERCENARY_SPAWN[0].x}/` +
    `${MERCENARY_SPAWN[1].x} TEMPSPAWN_TIMED_OOC_DESPAWN=${TEMPSPAWN_TIMED_OOC_DESPAWN} ` +
    `${MERCENARY_DESPAWN_MS}ms + SAY_MERCENARY=${SAY_WIZZ_MERCENARY}; WP25 post-event - FO6`;
  const citeWpStart =
    `the_barrens.cpp:585–593 WP10 SAY_STARTUP2=${SAY_WIZZ_STARTUP2}; ` +
    `WP19 SAY_PROGRESS_1=${SAY_WIZZ_PROGRESS_1} SetRun - FO6`;
  const citePost =
    `the_barrens.cpp:614–636 post-event timer ${WIZZ_POST_EVENT_START_MS}/` +
    `${WIZZ_POST_EVENT_INTERVAL_MS}ms: SAY_PROGRESS_2=${SAY_WIZZ_PROGRESS_2} / ` +
    `SAY_PROGRESS_3=${SAY_WIZZ_PROGRESS_3} / SAY_END=${SAY_WIZZ_END} + ` +
    `RewardPlayerAndGroupAtEventExplored(863) + SummonCreature(NPC_PILOT_WIZZ=` +
    `${NPC_PILOT_WIZZ}) TEMPSPAWN_TIMED_DESPAWN=${TEMPSPAWN_TIMED_DESPAWN} ` +
    `${PILOT_DESPAWN_MS}ms - FO6 finishEscort`;
  const citeSummoned =
    `the_barrens.cpp:597–604 JustSummoned NPC_PILOT_WIZZ SetStandState(DEAD=` +
    `${UNIT_STAND_STATE_DEAD}); NPC_MERCENARY AttackStart(m_creature) - FO6`;
  const citeEnder =
    `bake enderCreatureEntries NPC_SPUTTERVALVE=${NPC_SPUTTERVALVE} after explore credit`;
  return [
    {
      kind: 'talk',
      textId: SAY_WIZZ_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_RATCHET,
      flags: WIZZLE_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(true, player, quest) npc_wizzlecranks_shredder (${NPC_WIZZLECRANK_SHREDDER}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP18 NPC_MERCENARY (${NPC_MERCENARY})×2 TEMPSPAWN_TIMED_OOC_DESPAWN ` +
        `(${TEMPSPAWN_TIMED_OOC_DESPAWN}) ${MERCENARY_DESPAWN_MS}ms + SAY_MERCENARY ` +
        `(${SAY_WIZZ_MERCENARY}) - FO6`,
      cite: citeWp,
    },
    {
      kind: 'skip',
      reason:
        `WP10/19 talks SAY_STARTUP2/PROGRESS_1 (${SAY_WIZZ_STARTUP2}/${SAY_WIZZ_PROGRESS_1}) - FO6`,
      cite: citeWpStart,
    },
    {
      kind: 'skip',
      reason:
        `post-event SAY_PROGRESS_2/3/END (${SAY_WIZZ_PROGRESS_2}/${SAY_WIZZ_PROGRESS_3}/` +
        `${SAY_WIZZ_END}) + RewardPlayerAndGroupAtEventExplored(863) + NPC_PILOT_WIZZ ` +
        `(${NPC_PILOT_WIZZ}) TEMPSPAWN_TIMED_DESPAWN (${TEMPSPAWN_TIMED_DESPAWN}) ` +
        `${PILOT_DESPAWN_MS}ms - FO6 finishEscort`,
      cite: citePost,
    },
    {
      kind: 'skip',
      reason:
        `JustSummoned pilot DEAD stand (${UNIT_STAND_STATE_DEAD}) / mercenary AttackStart - FO6`,
      cite: citeSummoned,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_SPUTTERVALVE (${NPC_SPUTTERVALVE}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_regthar_deathgate — quest 4021 Counterattack!: the start line then a 20-minute
// wave event, with Krom'zar's trio after 20 kills. Cite: the_barrens.cpp:1073–1083, :948–1038.
function runRegtharAccept(): DbScriptIntent[] {
  const citeTalk =
    `the_barrens.cpp:1077 npc_regthar_deathgate (${NPC_REGTHAR_DEATHGATE}) ` +
    `DoScriptText(SAY_START_REGTHAR=${SAY_START_REGTHAR})`;
  const citeGossip =
    'the_barrens.cpp:1078 CLOSE_GOSSIP_MENU; :1057–1094 GossipHello/Select same StartEvent';
  const citeStart =
    `the_barrens.cpp:948–959 StartEvent m_eventTimer=${COUNTERATTACK_EVENT_MS}ms ` +
    `SpawnAllSlot Horde ${HORDE_SPAWN_COUNT} (NPC_HORDE_DEFENDER=${NPC_HORDE_DEFENDER}/` +
    `NPC_HORDE_AXE_THROWER=${NPC_HORDE_AXE_THROWER} moveToWP=${HORDE_MOVE_TO_WP}) + ` +
    `Kolkar ${KOLKAR_SPAWN_COUNT} (NPC_KOLKAR_INVADER=${NPC_KOLKAR_INVADER}/` +
    `NPC_KOLKAR_STORMSEER=${NPC_KOLKAR_STORMSEER}) TEMPSPAWN_CORPSE_TIMED_DESPAWN=` +
    `${TEMPSPAWN_CORPSE_TIMED_DESPAWN} ${REGTHAR_CORPSE_DESPAWN_MS}ms - FO6 combat event`;
  const citeRespawn =
    `the_barrens.cpp:972–1008 SummonedCreatureJustDied respawn Horde ` +
    `${COUNTERATTACK_RESPAWN_TIME_HORDE}s (inc ${COUNTERATTACK_RESPAWN_TIME_HORDE_INC}s) / ` +
    `Kolkar ${COUNTERATTACK_RESPAWN_TIME_KOLKAR}s; SAY_DEFENDER=${SAY_DEFENDER} - FO6`;
  const citeKromzar =
    `the_barrens.cpp:1032–1038 KILL_LIMIT=${KILL_LIMIT}: Summon ` +
    `NPC_KOLKAR_INVADER/NPC_WARLORD_KROMZAR=${NPC_WARLORD_KROMZAR}/NPC_KOLKAR_STORMSEER @ ` +
    `${KROMZAR_SPAWN[1].x},${KROMZAR_SPAWN[1].y} - FO6`;
  const citeFinish =
    `the_barrens.cpp:961–970 FinishEvent YELL_RETREAT=${YELL_RETREAT} ForceDespawn; ` +
    `:1011–1014 Kromzar death FinishEvent - FO6`;
  const citeItem =
    `bake itemTargets ITEM_KROMZAR_BANNER=${ITEM_KROMZAR_BANNER} Piece of Krom'zar's Banner`;
  const citeEnder =
    `bake enderCreatureEntries NPC_REGTHAR_DEATHGATE=${NPC_REGTHAR_DEATHGATE} item turn-in`;
  return [
    {
      kind: 'talk',
      textId: SAY_START_REGTHAR,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason: 'CLOSE_GOSSIP_MENU + gossip incomplete StartEvent path - FO6 UI',
      cite: citeGossip,
    },
    {
      kind: 'skip',
      reason:
        `StartEvent Horde (${NPC_HORDE_DEFENDER}/${NPC_HORDE_AXE_THROWER})×${HORDE_SPAWN_COUNT} + ` +
        `Kolkar (${NPC_KOLKAR_INVADER}/${NPC_KOLKAR_STORMSEER})×${KOLKAR_SPAWN_COUNT} ` +
        `TEMPSPAWN_CORPSE_TIMED_DESPAWN (${TEMPSPAWN_CORPSE_TIMED_DESPAWN}) ` +
        `${REGTHAR_CORPSE_DESPAWN_MS}ms timer ${COUNTERATTACK_EVENT_MS}ms - FO6 combat event`,
      cite: citeStart,
    },
    {
      kind: 'skip',
      reason:
        `wave respawn Horde ${COUNTERATTACK_RESPAWN_TIME_HORDE}s / Kolkar ` +
        `${COUNTERATTACK_RESPAWN_TIME_KOLKAR}s + SAY_DEFENDER (${SAY_DEFENDER}) - FO6`,
      cite: citeRespawn,
    },
    {
      kind: 'skip',
      reason:
        `KILL_LIMIT (${KILL_LIMIT}) spawn NPC_WARLORD_KROMZAR (${NPC_WARLORD_KROMZAR}) + bodyguards - FO6`,
      cite: citeKromzar,
    },
    {
      kind: 'skip',
      reason:
        `FinishEvent YELL_RETREAT (${YELL_RETREAT}) / Kromzar death ForceDespawn - FO6`,
      cite: citeFinish,
    },
    {
      kind: 'skip',
      reason:
        `turn-in ITEM_KROMZAR_BANNER (${ITEM_KROMZAR_BANNER}) at NPC_REGTHAR_DEATHGATE (${NPC_REGTHAR_DEATHGATE})`,
      cite: citeItem,
    },
    {
      kind: 'skip',
      reason: `ender NPC_REGTHAR_DEATHGATE (${NPC_REGTHAR_DEATHGATE}) after banner deliver`,
      cite: citeEnder,
    },
  ];
}

// AreaTrigger_at_twiggy_flathead — quest 1719 The Affray: with the quest incomplete and Twiggy
// within 30 yd, start the six challengers and then Big Will. Cite: the_barrens.cpp:490–507.
function runAffrayFrame(): DbScriptIntent[] {
  const citeAt =
    `the_barrens.cpp:490–507 AreaTrigger_at_twiggy_flathead AT=${AT_TWIGGY_FLATHEAD} ` +
    `GetClosestCreatureWithEntry(NPC_TWIGGY=${NPC_TWIGGY}, ${TWIGGY_SEARCH_RADIUS})`;
  const citeBegin =
    `the_barrens.cpp:356 CanStartEvent DoScriptText(SAY_TWIGGY_BEGIN=${SAY_TWIGGY_BEGIN})`;
  const citeChallengers =
    `the_barrens.cpp:367–373 SetChallengers MAX_CHALLENGERS=${MAX_CHALLENGERS} ` +
    `NPC_AFFRAY_CHALLENGER=${NPC_AFFRAY_CHALLENGER} TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN=` +
    `${TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN} ${AFFRAY_CHALLENGER_DESPAWN_MS}ms @ ` +
    `${AFFRAY_CHALLENGER_LOC[0].x},${AFFRAY_CHALLENGER_LOC[0].y} - FO6`;
  const citeReady =
    `the_barrens.cpp:375–383 SetChallengerReady FACTION_HOSTILE_CHALLENGER=` +
    `${FACTION_HOSTILE_CHALLENGER} EMOTE_ONESHOT_ROAR=${EMOTE_ONESHOT_ROAR} AttackStart + ` +
    `SAY_TWIGGY_FRAY=${SAY_TWIGGY_FRAY} - FO6 combat`;
  const citeWill =
    `the_barrens.cpp:471 SummonCreature(NPC_BIG_WILL=${NPC_BIG_WILL} @ ${BIG_WILL_SPAWN.x},` +
    `${BIG_WILL_SPAWN.y}) TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN ${BIG_WILL_DESPAWN_MS}ms; ` +
    `:402–413 MovePoint (${BIG_WILL_MOVE.x},…) FACTION_HOSTILE_WILL=${FACTION_HOSTILE_WILL} ` +
    `SAY_BIG_WILL_READY=${SAY_BIG_WILL_READY}; friendly spawn faction ${FACTION_FRIENDLY} - FO6`;
  const citeOver =
    `the_barrens.cpp:418–421 Big Will death DoScriptText(SAY_TWIGGY_OVER=${SAY_TWIGGY_OVER}); ` +
    `:425 SAY_TWIGGY_DOWN=${SAY_TWIGGY_DOWN} on challenger death - FO6`;
  const citeKill =
    `bake killTargets NPC_BIG_WILL=${NPC_BIG_WILL} count 1; turn-in NPC_KLANNOC=${NPC_KLANNOC}`;
  return [
    {
      kind: 'talk',
      textId: SAY_TWIGGY_BEGIN,
      stringTemplateId: 0,
      cite: citeBegin,
    },
    {
      kind: 'skip',
      reason:
        `AreaTrigger AT ${AT_TWIGGY_FLATHEAD} NPC_TWIGGY (${NPC_TWIGGY}) radius ` +
        `${TWIGGY_SEARCH_RADIUS} incomplete 1719 - FO6`,
      cite: citeAt,
    },
    {
      kind: 'skip',
      reason:
        `SetChallengers ${MAX_CHALLENGERS}× NPC_AFFRAY_CHALLENGER (${NPC_AFFRAY_CHALLENGER}) ` +
        `TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN (${TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN}) ` +
        `${AFFRAY_CHALLENGER_DESPAWN_MS}ms - FO6`,
      cite: citeChallengers,
    },
    {
      kind: 'skip',
      reason:
        `SetChallengerReady faction ${FACTION_HOSTILE_CHALLENGER} roar ${EMOTE_ONESHOT_ROAR} + ` +
        `SAY_TWIGGY_FRAY (${SAY_TWIGGY_FRAY}) - FO6 combat`,
      cite: citeReady,
    },
    {
      kind: 'skip',
      reason:
        `NPC_BIG_WILL (${NPC_BIG_WILL}) spawn/move FACTION_HOSTILE_WILL (${FACTION_HOSTILE_WILL}) ` +
        `SAY_BIG_WILL_READY (${SAY_BIG_WILL_READY}) ${BIG_WILL_DESPAWN_MS}ms - FO6`,
      cite: citeWill,
    },
    {
      kind: 'skip',
      reason:
        `Big Will death SAY_TWIGGY_OVER (${SAY_TWIGGY_OVER}) / challenger SAY_TWIGGY_DOWN ` +
        `(${SAY_TWIGGY_DOWN}) - FO6`,
      cite: citeOver,
    },
    {
      kind: 'skip',
      reason:
        `kill credit NPC_BIG_WILL (${NPC_BIG_WILL}) → turn-in NPC_KLANNOC (${NPC_KLANNOC})`,
      cite: citeKill,
    },
  ];
}

// Family pack: kalimdor/the_barrens.cpp. Accept hooks for 898, 863 and 4021, plus the Twiggy
// areatrigger residual for 1719.
export function runTheBarrens(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_FREE_FROM_HOLD) return runGiltharesAccept();
    if (questId === QUEST_ESCAPE) return runWizzlecrankAccept();
    if (questId === QUEST_COUNTERATTACK) return runRegtharAccept();
    return [];
  }
  if (phase === 'frame' || phase === 'complete') {
    if (questId === QUEST_AFFRAY) return runAffrayFrame();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/the_barrens'` in registry.ts.
export const THE_BARRENS_REGISTRY: Record<string | number, TheBarrensQuestScriptEntry> = {
  'kalimdor/the_barrens': {
    family: 'kalimdor/the_barrens',
    questIds: [QUEST_ESCAPE, QUEST_FREE_FROM_HOLD, QUEST_AFFRAY, QUEST_COUNTERATTACK],
    hooks: ['accept', 'frame', 'complete'],
    cite:
      'kalimdor/the_barrens.cpp:128–141,649–660,1073–1083,490–507,71–99,557–640,948–1038',
    run: runTheBarrens,
  },
  [QUEST_ESCAPE]: {
    family: 'kalimdor/the_barrens',
    questId: QUEST_ESCAPE,
    questIds: [QUEST_ESCAPE],
    hooks: ['accept'],
    cite: 'the_barrens.cpp:649–660 QuestAccept_npc_wizzlecranks_shredder',
    run: runTheBarrens,
  },
  [QUEST_FREE_FROM_HOLD]: {
    family: 'kalimdor/the_barrens',
    questId: QUEST_FREE_FROM_HOLD,
    questIds: [QUEST_FREE_FROM_HOLD],
    hooks: ['accept'],
    cite: 'the_barrens.cpp:128–141 QuestAccept_npc_gilthares',
    run: runTheBarrens,
  },
  [QUEST_AFFRAY]: {
    family: 'kalimdor/the_barrens',
    questId: QUEST_AFFRAY,
    questIds: [QUEST_AFFRAY],
    hooks: ['frame', 'complete'],
    cite: 'the_barrens.cpp:490–507 AreaTrigger_at_twiggy_flathead',
    run: runTheBarrens,
  },
  [QUEST_COUNTERATTACK]: {
    family: 'kalimdor/the_barrens',
    questId: QUEST_COUNTERATTACK,
    questIds: [QUEST_COUNTERATTACK],
    hooks: ['accept'],
    cite: 'the_barrens.cpp:1073–1083 QuestAccept_npc_regthar_deathgate',
    run: runTheBarrens,
  },
};
